-- ============================================================
-- Registro de pagos del gimnasio (libro / ledger por socio).
--
-- Hasta ahora "Registrar pago" solo empujaba cuota_hasta +1 mes en
-- gym_alumnos, sin dejar rastro de CADA pago. El profe pidió dos cosas:
--   1) un "pago manual": poder cargar un pago con OTRO método (efectivo,
--      transferencia, débito, etc.), otro monto y otra fecha — no todos
--      pagan igual ni por el sistema.
--   2) un registro de pagos en cada cliente: el historial de lo que fue
--      pagando.
--
-- gym_cuotas (0043) es la grilla mensual importada de la planilla
-- (unique por alumno/año/mes) — no sirve como libro libre de pagos. Por
-- eso una tabla nueva, append-only: gym_pagos.
--
-- Correr DESPUÉS de 0043.
-- ============================================================

create table if not exists gym_pagos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  alumno_id   uuid not null references gym_alumnos(id) on delete cascade,
  fecha       date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  monto       numeric(12,2),                 -- opcional: a veces se anota sin monto
  metodo      text not null default 'efectivo'
    check (metodo in ('efectivo','transferencia','mercadopago','debito','otro')),
  nota        text,
  cuota_hasta date,                          -- a qué fecha quedó la cuota tras este pago (snapshot)
  created_by  uuid,                          -- auth.uid() de quien lo cargó (informativo)
  created_at  timestamptz not null default now()
);
create index if not exists gym_pagos_tenant_idx on gym_pagos (tenant_id);
create index if not exists gym_pagos_alumno_idx  on gym_pagos (alumno_id, fecha desc);

-- RLS: mismo gate que el resto del gym (owner / profesional / gym_admin).
-- El profe registra y ve los pagos.
alter table gym_pagos enable row level security;

drop policy if exists "staff_gym_pagos" on gym_pagos;
create policy "staff_gym_pagos" on gym_pagos
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and public.jwt_es_gym_staff()
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and public.jwt_es_gym_staff()
  );


-- ------------------------------------------------------------
-- RPC: registrar un pago Y actualizar la cuota del socio en una sola
-- transacción. Evita el estado inconsistente (pago cargado pero cuota
-- sin mover, o al revés) de hacerlo en dos escrituras desde el browser.
--
--   p_cuota_hasta null  -> extiende +1 mes desde el vencimiento vigente
--                          (o desde hoy si ya venció). Es el "+1 mes".
--   p_cuota_hasta fecha -> deja la cuota exactamente en esa fecha
--                          (pago manual con vencimiento a mano).
--   p_metodo/p_monto/p_fecha/p_nota -> datos del asiento en el libro.
--
-- Security definer: hace su propio gate por JWT (gym staff del tenant) y
-- recién ahí escribe, así el update de gym_alumnos no depende de la RLS
-- de cada rol.
-- ------------------------------------------------------------
create or replace function public.gym_registrar_pago(
  p_alumno_id  uuid,
  p_monto      numeric default null,
  p_metodo     text    default 'efectivo',
  p_fecha      date    default null,
  p_cuota_hasta date   default null,
  p_nota       text    default null
) returns gym_pagos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := ((select auth.jwt()) ->> 'tenant_id')::uuid;
  v_hoy    date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_alu    gym_alumnos%rowtype;
  v_nueva  date;
  v_pago   gym_pagos%rowtype;
begin
  if v_tenant is null or not public.jwt_es_gym_staff() then
    raise exception 'No autorizado';
  end if;
  if p_metodo not in ('efectivo','transferencia','mercadopago','debito','otro') then
    raise exception 'Método inválido';
  end if;

  select * into v_alu from gym_alumnos
    where id = p_alumno_id and tenant_id = v_tenant;
  if not found then
    raise exception 'Alumno no encontrado';
  end if;

  -- Nueva fecha de vencimiento de la cuota.
  if p_cuota_hasta is not null then
    v_nueva := p_cuota_hasta;
  else
    v_nueva := (
      (case when v_alu.cuota_hasta is not null and v_alu.cuota_hasta > v_hoy
            then v_alu.cuota_hasta else v_hoy end)
      + interval '1 month'
    )::date;
  end if;

  update gym_alumnos
     set es_socio = true, cuota_hasta = v_nueva
   where id = p_alumno_id;

  insert into gym_pagos (tenant_id, alumno_id, fecha, monto, metodo, nota, cuota_hasta, created_by)
  values (v_tenant, p_alumno_id, coalesce(p_fecha, v_hoy), p_monto, p_metodo, p_nota, v_nueva, auth.uid())
  returning * into v_pago;

  return v_pago;
end;
$$;

revoke all on function public.gym_registrar_pago(uuid, numeric, text, date, date, text) from public, anon;
grant execute on function public.gym_registrar_pago(uuid, numeric, text, date, date, text) to authenticated;
