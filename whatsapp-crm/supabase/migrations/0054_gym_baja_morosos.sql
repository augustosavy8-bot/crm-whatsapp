-- ============================================================
-- Baja automática de turnos fijos por cuota vencida (con gracia hasta el 20) y
-- reactivación automática al registrar el pago.
--
-- Reglas (definidas con el dueño):
--   - Del 1 al 20 hay gracia: aunque deba, conserva sus fijos.
--   - Del 21 en adelante, si sigue debiendo, se le dan de baja los fijos.
--   - Al registrar el pago, se le reactivan solos los fijos dados de baja por
--     deuda (si el cupo sigue disponible; si no, se reanota a mano).
--
-- Corre DESPUÉS de 0053.
-- ============================================================

-- Marca los fijos dados de baja por deuda (para reactivar SOLO esos al pagar,
-- sin tocar los que el socio canceló a mano).
alter table gym_turnos_fijos
  add column if not exists baja_por_deuda boolean not null default false;


-- Da de baja los fijos activos de los socios morosos. Solo actúa pasado el
-- día 20 (gracia). Deactivar no dispara problemas de cupo (el trigger corta
-- cuando activo=false). Pensada para correr por cron (sin JWT).
create or replace function public.gym_dar_baja_morosos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_n   integer := 0;
begin
  if extract(day from v_hoy) <= 20 then
    return 0; -- gracia hasta el 20
  end if;

  update gym_turnos_fijos f
     set activo = false, baja_por_deuda = true
    from gym_alumnos a
   where f.alumno_id = a.id
     and f.activo and f.estado <> 'rechazado'
     and (a.cuota_hasta is null or a.cuota_hasta < v_hoy);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.gym_dar_baja_morosos() from public, anon, authenticated;


-- Reactiva los fijos que se dieron de baja por deuda (uno por uno: si un cupo
-- se llenó mientras el socio estaba dado de baja, ese queda sin reactivar).
create or replace function public.gym_reactivar_fijos(p_alumno_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_f record;
begin
  for v_f in
    select id from gym_turnos_fijos
     where alumno_id = p_alumno_id and baja_por_deuda and not activo
  loop
    begin
      update gym_turnos_fijos set activo = true, baja_por_deuda = false
       where id = v_f.id;
    exception when others then
      null; -- cupo lleno u otro: queda dado de baja, se reanota a mano.
    end;
  end loop;
end $$;

revoke all on function public.gym_reactivar_fijos(uuid) from public, anon, authenticated;


-- Registrar pago: igual que antes, pero al final reactiva los fijos que estaban
-- dados de baja por deuda.
create or replace function public.gym_registrar_pago(
  p_alumno_id uuid,
  p_monto numeric default null,
  p_metodo text default 'efectivo',
  p_fecha date default null,
  p_cuota_hasta date default null,
  p_nota text default null
) returns gym_pagos
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  if p_cuota_hasta is not null then
    v_nueva := p_cuota_hasta;
  else
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

  -- Al ponerse al día, recupera los fijos que había perdido por deuda.
  perform public.gym_reactivar_fijos(p_alumno_id);

  return v_pago;
end;
$function$;


-- Cron diario (06:00 UTC = 03:00 AR): la función chequea sola el día > 20.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'gym-baja-morosos';
select cron.schedule('gym-baja-morosos', '0 6 * * *', $$select public.gym_dar_baja_morosos();$$);
