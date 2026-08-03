-- ============================================================
-- Las reservas del gimnasio quedan CONFIRMADAS al toque (sin cola de pendientes).
-- Elimina la fricción de que el staff tenga que aceptarlas.
--
-- El bloqueo por deuda (regla del 1 al 20) se aplica en la capa de API para el
-- autoservicio, y NO en el alta manual del staff (override). Por eso acá solo
-- cambia el estado inicial a confirmado. Idempotente (create or replace).
-- ============================================================

create or replace function public.gym_reservar_suelta(
  p_horario_id uuid, p_fecha date, p_nombre text, p_telefono text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tenant_id uuid;
  v_alumno_id uuid;
  v_reserva_id uuid;
  v_nombre text := nullif(trim(p_nombre), '');
begin
  if v_nombre is null then
    raise exception 'El nombre es obligatorio';
  end if;
  if nullif(trim(coalesce(p_telefono, '')), '') is null then
    raise exception 'El WhatsApp es obligatorio';
  end if;

  select tenant_id into v_tenant_id from gym_horarios where id = p_horario_id and activo;
  if v_tenant_id is null then
    raise exception 'El horario no existe o no está disponible';
  end if;

  v_alumno_id := gym_upsert_alumno(v_tenant_id, v_nombre, p_telefono, null);

  select id into v_reserva_id
    from gym_reservas_sueltas
   where alumno_id = v_alumno_id and horario_id = p_horario_id
     and fecha = p_fecha and estado in ('pendiente','confirmada')
   limit 1;
  if v_reserva_id is not null then
    return v_reserva_id;
  end if;

  if exists (
    select 1 from gym_turnos_fijos f
     where f.alumno_id = v_alumno_id and f.horario_id = p_horario_id
       and f.activo and f.estado <> 'rechazado' and f.fecha_desde <= p_fecha
       and not exists (
         select 1 from gym_excepciones_fijo e
          where e.turno_fijo_id = f.id and e.fecha = p_fecha
       )
  ) then
    raise exception 'Ya tenés lugar fijo ese día en ese horario';
  end if;

  insert into gym_reservas_sueltas (tenant_id, alumno_id, horario_id, fecha, estado)
  values (v_tenant_id, v_alumno_id, p_horario_id, p_fecha, 'confirmada')
  returning id into v_reserva_id;

  return v_reserva_id;
end $function$;

create or replace function public.gym_anotar_fijo(
  p_horario_id uuid, p_fecha_desde date, p_nombre text, p_telefono text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tenant_id uuid;
  v_alumno_id uuid;
  v_fijo_id uuid;
  v_nombre text := nullif(trim(p_nombre), '');
begin
  if v_nombre is null then
    raise exception 'El nombre es obligatorio';
  end if;
  if nullif(trim(coalesce(p_telefono, '')), '') is null then
    raise exception 'El WhatsApp es obligatorio';
  end if;

  select tenant_id into v_tenant_id from gym_horarios where id = p_horario_id and activo;
  if v_tenant_id is null then
    raise exception 'El horario no existe o no está disponible';
  end if;

  v_alumno_id := gym_upsert_alumno(v_tenant_id, v_nombre, p_telefono, null);

  select id into v_fijo_id
    from gym_turnos_fijos
   where alumno_id = v_alumno_id and horario_id = p_horario_id
     and activo and estado <> 'rechazado'
   limit 1;
  if v_fijo_id is not null then
    return v_fijo_id;
  end if;

  insert into gym_turnos_fijos (tenant_id, alumno_id, horario_id, fecha_desde, activo, estado)
  values (v_tenant_id, v_alumno_id, p_horario_id, p_fecha_desde, true, 'confirmado')
  returning id into v_fijo_id;

  return v_fijo_id;
end $function$;
