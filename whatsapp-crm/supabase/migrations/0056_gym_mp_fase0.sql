-- ============================================================
-- Fase 0 de la conversión a marketplace (split + comisión de plataforma).
--
--   1) Limpieza de columnas MP huérfanas en gym_alumnos (mp_estado,
--      mp_preapproval_id): venían del intento de débito automático /
--      preapproval que se removió. No las usa ningún código (solo se
--      referencian en la migración 0025 que las creó). Se conserva
--      mp_last_payment_id (idempotencia del webhook). El índice parcial
--      sobre mp_preapproval_id cae solo al dropear la columna.
--
--   2) gym_pagos: columna `origen` ('manual' | 'webhook') + columnas del
--      split ('monto_bruto', 'comision_mp', 'marketplace_fee', 'neto_gym').
--      Nullable: las filas históricas no tienen desglose y así quedan. El
--      default de `origen` es 'manual', así que el padrón histórico queda
--      correctamente marcado como carga manual.
--
--   3) Unificación del registro de pago en UNA sola lógica
--      (gym__aplicar_pago), que:
--        - calcula el vencimiento (el 10 del mes siguiente; ÚNICA fuente de
--          verdad, en SQL — antes el webhook lo recalculaba por su cuenta),
--        - actualiza la cuota del socio,
--        - inserta el asiento en el libro,
--        - y reactiva los fijos dados de baja por deuda.
--      La usan los DOS caminos:
--        - gym_registrar_pago         (staff / JWT, pago manual) -> 'manual'
--        - gym_registrar_pago_webhook (service role, MP)         -> 'webhook'
--      BUGFIX: antes el webhook NO reactivaba los fijos dados de baja por
--      deuda (sí lo hacía el pago manual). Ahora los dos comparten la misma
--      función, así que el socio moroso que paga por MP recupera sus fijos.
--
-- NO toca reservas, socios, login ni el comportamiento del pago manual:
-- gym_registrar_pago conserva su misma firma, sus mismos chequeos de
-- autorización y su mismo resultado. Correr DESPUÉS de 0055.
-- ============================================================

-- 1) Limpieza de columnas huérfanas ---------------------------------------
alter table gym_alumnos drop column if exists mp_estado;
alter table gym_alumnos drop column if exists mp_preapproval_id;

-- 2) gym_pagos: origen + desglose del split -------------------------------
alter table gym_pagos
  add column if not exists origen          text not null default 'manual',
  add column if not exists monto_bruto     numeric,
  add column if not exists comision_mp     numeric,
  add column if not exists marketplace_fee numeric,
  add column if not exists neto_gym        numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.gym_pagos'::regclass
       and conname  = 'gym_pagos_origen_chk'
  ) then
    alter table gym_pagos
      add constraint gym_pagos_origen_chk check (origen in ('manual','webhook'));
  end if;
end $$;

-- 3a) Núcleo compartido: aplica un pago -----------------------------------
-- NO valida autorización (la validan los wrappers). Calcula el vencimiento
-- (el 10 del mes siguiente), actualiza la cuota, inserta el asiento y
-- reactiva los fijos dados de baja por deuda. Revocada de anon/authenticated:
-- solo la invocan las funciones SECURITY DEFINER de abajo (que corren como el
-- owner), nunca la API directamente.
create or replace function public.gym__aplicar_pago(
  p_tenant_id       uuid,
  p_alumno_id       uuid,
  p_monto           numeric,
  p_metodo          text,
  p_fecha           date,
  p_cuota_hasta     date,
  p_nota            text,
  p_origen          text,
  p_created_by      uuid    default null,
  p_mp_payment_id   text    default null,
  p_monto_bruto     numeric default null,
  p_comision_mp     numeric default null,
  p_marketplace_fee numeric default null,
  p_neto_gym        numeric default null
) returns gym_pagos
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_hoy   date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_alu   gym_alumnos%rowtype;
  v_base  date;
  v_nueva date;
  v_pago  gym_pagos%rowtype;
begin
  select * into v_alu from gym_alumnos
    where id = p_alumno_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'Alumno no encontrado';
  end if;

  -- Vencimiento: el 10 del mes siguiente (misma regla que proximoVencimientoISO).
  if p_cuota_hasta is not null then
    v_nueva := p_cuota_hasta;
  else
    v_base := case
      when v_alu.cuota_hasta is not null and v_alu.cuota_hasta >= v_hoy
        then v_alu.cuota_hasta else v_hoy end;
    v_nueva := (date_trunc('month', v_base) + interval '1 month')::date + 9;
  end if;

  update gym_alumnos
     set es_socio = true,
         cuota_hasta = v_nueva,
         -- solo el webhook manda payment id; el pago manual no lo pisa.
         mp_last_payment_id = coalesce(p_mp_payment_id, mp_last_payment_id)
   where id = p_alumno_id;

  insert into gym_pagos (
    tenant_id, alumno_id, fecha, monto, metodo, nota, cuota_hasta, created_by,
    origen, monto_bruto, comision_mp, marketplace_fee, neto_gym
  )
  values (
    p_tenant_id, p_alumno_id, coalesce(p_fecha, v_hoy), p_monto, p_metodo,
    p_nota, v_nueva, p_created_by,
    p_origen, p_monto_bruto, p_comision_mp, p_marketplace_fee, p_neto_gym
  )
  returning * into v_pago;

  -- Al ponerse al día, recupera los fijos que había perdido por deuda.
  perform public.gym_reactivar_fijos(p_alumno_id);

  return v_pago;
end;
$function$;

revoke all on function public.gym__aplicar_pago(
  uuid,uuid,numeric,text,date,date,text,text,uuid,text,numeric,numeric,numeric,numeric
) from public, anon, authenticated;

-- 3b) Pago manual (staff / JWT) -------------------------------------------
-- Misma firma y mismo comportamiento que antes; ahora delega el núcleo.
create or replace function public.gym_registrar_pago(
  p_alumno_id   uuid,
  p_monto       numeric default null,
  p_metodo      text    default 'efectivo',
  p_fecha       date    default null,
  p_cuota_hasta date    default null,
  p_nota        text    default null
) returns gym_pagos
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tenant uuid := ((select auth.jwt()) ->> 'tenant_id')::uuid;
begin
  if v_tenant is null or not public.jwt_es_gym_staff() then
    raise exception 'No autorizado';
  end if;
  if p_metodo not in ('efectivo','transferencia','mercadopago','debito','otro') then
    raise exception 'Método inválido';
  end if;

  return public.gym__aplicar_pago(
    p_tenant_id   => v_tenant,
    p_alumno_id   => p_alumno_id,
    p_monto       => p_monto,
    p_metodo      => p_metodo,
    p_fecha       => p_fecha,
    p_cuota_hasta => p_cuota_hasta,
    p_nota        => p_nota,
    p_origen      => 'manual',
    p_created_by  => auth.uid()
  );
end;
$function$;

-- 3c) Pago por webhook de MP (service role, sin JWT) ----------------------
-- Deriva el tenant del propio alumno. Idempotente: si el payment ya se
-- acreditó (mp_last_payment_id), devuelve null sin duplicar. En Fase 0 el
-- split aún no aplica (cuenta única): monto_bruto = monto; el resto de los
-- campos de desglose se cargan en Fase 3.
create or replace function public.gym_registrar_pago_webhook(
  p_alumno_id       uuid,
  p_mp_payment_id   text,
  p_monto           numeric default null,
  p_monto_bruto     numeric default null,
  p_comision_mp     numeric default null,
  p_marketplace_fee numeric default null,
  p_neto_gym        numeric default null,
  p_nota            text    default 'Pago con MercadoPago'
) returns gym_pagos
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_alu gym_alumnos%rowtype;
begin
  select * into v_alu from gym_alumnos where id = p_alumno_id;
  if not found then
    raise exception 'Alumno no encontrado';
  end if;

  -- Idempotencia: MP reintenta los webhooks; no acreditar dos veces el mismo pago.
  if v_alu.mp_last_payment_id is not distinct from p_mp_payment_id then
    return null;
  end if;

  return public.gym__aplicar_pago(
    p_tenant_id       => v_alu.tenant_id,
    p_alumno_id       => p_alumno_id,
    p_monto           => p_monto,
    p_metodo          => 'mercadopago',
    p_fecha           => null,
    p_cuota_hasta     => null,
    p_nota            => p_nota,
    p_origen          => 'webhook',
    p_created_by      => null,
    p_mp_payment_id   => p_mp_payment_id,
    p_monto_bruto     => p_monto_bruto,
    p_comision_mp     => p_comision_mp,
    p_marketplace_fee => p_marketplace_fee,
    p_neto_gym        => p_neto_gym
  );
end;
$function$;

revoke all on function public.gym_registrar_pago_webhook(
  uuid,text,numeric,numeric,numeric,numeric,numeric,text
) from public, anon, authenticated;
grant execute on function public.gym_registrar_pago_webhook(
  uuid,text,numeric,numeric,numeric,numeric,numeric,text
) to service_role;
