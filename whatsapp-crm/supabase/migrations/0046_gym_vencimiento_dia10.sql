-- ============================================================
-- Vencimiento de cuota fijado al día 10 (ventana de pago 1–10).
--
-- El profe quiere que TODAS las fechas de vencimiento caigan del 1 al 10,
-- y nunca en el día en que se pagó. Se adopta el día 10 fijo.
--
-- 1) Normaliza los vencimientos existentes al día 10, moviendo SOLO hacia
--    adelante (nadie queda marcado como vencido antes de lo que ya pagó):
--      - día <= 10  -> el 10 del MISMO mes (se estira unos días, inofensivo)
--      - día  > 10  -> el 10 del mes SIGUIENTE
-- 2) Cambia el default de gym_registrar_pago: cuando no se pasa una fecha
--    explícita, la cuota queda paga hasta el 10 del mes siguiente al mes
--    cubierto (en vez de "pago + 1 mes").
--
-- La gracia para reservar hasta el 20 no cambia (vive en la app, gymDeuda.ts).
--
-- Correr DESPUÉS de 0045.
-- ============================================================

-- 1) Normalización de los vencimientos ya cargados.
update gym_alumnos
set cuota_hasta = case
    when extract(day from cuota_hasta) <= 10
      then date_trunc('month', cuota_hasta)::date + 9
    else (date_trunc('month', cuota_hasta) + interval '1 month')::date + 9
  end
where cuota_hasta is not null
  and extract(day from cuota_hasta) <> 10;


-- 2) RPC: el vencimiento por defecto pasa a ser el 10 del mes siguiente.
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
  v_base   date;
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

  -- Nueva fecha de vencimiento de la cuota (siempre el día 10).
  if p_cuota_hasta is not null then
    v_nueva := p_cuota_hasta;
  else
    -- Mes base: el del vencimiento vigente si sigue al día; si no, el actual.
    -- El próximo vencimiento es el 10 del mes SIGUIENTE al mes base.
    v_base := case
      when v_alu.cuota_hasta is not null and v_alu.cuota_hasta >= v_hoy
        then v_alu.cuota_hasta else v_hoy end;
    v_nueva := (date_trunc('month', v_base) + interval '1 month')::date + 9;
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
