-- ============================================================
-- Alta de alumno sin WhatsApp (para el alta a mano del staff).
--
-- El staff (profe/admin) tiene que poder anotar a un cliente en una clase sin
-- cargarle el WhatsApp. El flujo público del alumno SIGUE exigiendo teléfono,
-- pero eso lo garantizan los route handlers (gym/reservar, mi-cuenta/reservar)
-- antes de llamar a estas RPC, así que sacar el "obligatorio" acá es seguro.
--
--   - gym_upsert_alumno: si no viene teléfono, inserta el alumno sin dedup por
--     teléfono (no puede deduplicar sin número).
--   - gym_reservar_suelta / gym_anotar_fijo: dejan de exigir el teléfono
--     (el nombre sigue siendo obligatorio).
--
-- Correr DESPUÉS de 0047.
-- ============================================================

create or replace function public.gym_upsert_alumno(
  p_tenant_id uuid,
  p_nombre text,
  p_telefono text,
  p_email text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_alumno_id uuid;
  v_tel text := nullif(trim(coalesce(p_telefono, '')), '');
begin
  -- Solo se puede deduplicar por teléfono si hay teléfono.
  if v_tel is not null then
    select id into v_alumno_id
      from gym_alumnos
     where tenant_id = p_tenant_id and telefono = v_tel
     limit 1;
  end if;

  if v_alumno_id is null then
    insert into gym_alumnos (tenant_id, nombre, telefono, email)
    values (p_tenant_id, p_nombre, v_tel, nullif(trim(coalesce(p_email, '')), ''))
    returning id into v_alumno_id;
  else
    update gym_alumnos
       set email = coalesce(email, nullif(trim(coalesce(p_email, '')), '')),
           updated_at = now()
     where id = v_alumno_id;
  end if;

  return v_alumno_id;
end $function$;


create or replace function public.gym_reservar_suelta(
  p_horario_id uuid,
  p_fecha date,
  p_nombre text,
  p_telefono text
) returns uuid
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

  select tenant_id into v_tenant_id from gym_horarios where id = p_horario_id and activo;
  if v_tenant_id is null then
    raise exception 'El horario no existe o no está disponible';
  end if;

  if exists (
    select 1 from gym_dias_cerrados d
     where d.tenant_id = v_tenant_id and d.fecha = p_fecha
  ) then
    raise exception 'El gimnasio está cerrado ese día';
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
  p_horario_id uuid,
  p_fecha_desde date,
  p_nombre text,
  p_telefono text
) returns uuid
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
