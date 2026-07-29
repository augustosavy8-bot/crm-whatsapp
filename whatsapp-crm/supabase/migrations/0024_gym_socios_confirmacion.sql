-- ============================================================
-- Fase 1 del control de cuotas del gimnasio:
--   - Padrón de SOCIOS con estado de cuota (efectivo manual; MercadoPago
--     queda para Fase 2).
--   - Reservas con CONFIRMACIÓN: el alumno reserva -> queda "pendiente" ->
--     Mariano confirma o rechaza. Una reserva pendiente OCUPA cupo (no se
--     sobrevende); recién liberá si se cancela/rechaza.
--
-- Correr DESPUÉS de 0023.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Padrón de socios sobre gym_alumnos.
--    cuota_hasta null = no pagó / no socio. metodo_pago: cómo cobra su cuota.
-- ------------------------------------------------------------
alter table gym_alumnos add column if not exists es_socio    boolean not null default false;
alter table gym_alumnos add column if not exists cuota_hasta  date;
alter table gym_alumnos add column if not exists metodo_pago  text not null default 'efectivo'
  check (metodo_pago in ('efectivo','mercadopago'));


-- ------------------------------------------------------------
-- 2) Estado de confirmación de las reservas.
--    Sueltas: pendiente -> confirmada / rechazada (o cancelada por el alumno).
--    Fijos: se suma `estado` (pendiente -> confirmado / rechazado). `activo`
--    sigue siendo la baja del alumno (deja de ir todas las semanas).
-- ------------------------------------------------------------
alter table gym_reservas_sueltas alter column estado set default 'pendiente';
alter table gym_reservas_sueltas drop constraint if exists gym_reservas_sueltas_estado_check;
alter table gym_reservas_sueltas add constraint gym_reservas_sueltas_estado_check
  check (estado in ('pendiente','confirmada','cancelada','rechazada'));

alter table gym_turnos_fijos add column if not exists estado text not null default 'pendiente'
  check (estado in ('pendiente','confirmado','rechazado'));
-- Fijos que existieran antes de esta feature ya estaban "vigentes": confirmados.
update gym_turnos_fijos set estado = 'confirmado' where estado = 'pendiente' and created_at < now();

-- Índices parciales: los usados para contar cupo ahora filtran por estado.
drop index if exists gym_reservas_sueltas_horario_idx;
create index if not exists gym_reservas_sueltas_horario_idx
  on gym_reservas_sueltas (horario_id, fecha) where estado in ('pendiente','confirmada');


-- ------------------------------------------------------------
-- 3) Recálculo de cupo — una reserva OCUPA si no está cancelada/rechazada.
--    Ocupa el horario para la fecha D:
--      fijo   : activo and estado <> 'rechazado' and fecha_desde <= D and sin excepción D
--      suelta : estado in ('pendiente','confirmada') and fecha = D
--    Se replica este criterio en el trigger y en todas las funciones de conteo.
-- ------------------------------------------------------------
create or replace function public.gym_valida_cupo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_horario  record;
  v_fecha    date;
  v_ocupados int;
begin
  select id, dia_semana, capacidad_max
    into v_horario
    from gym_horarios
   where id = new.horario_id
   for update;

  if not found then
    raise exception 'El horario no existe';
  end if;

  if TG_TABLE_NAME = 'gym_reservas_sueltas' then
    v_fecha := new.fecha;
    if extract(dow from v_fecha)::smallint <> v_horario.dia_semana then
      raise exception 'La fecha no corresponde al día de este horario';
    end if;
    if new.estado in ('cancelada','rechazada') then
      return new; -- no ocupa cupo
    end if;
  else
    v_fecha := new.fecha_desde;
    if extract(dow from v_fecha)::smallint <> v_horario.dia_semana then
      raise exception 'La fecha de inicio no corresponde al día de este horario';
    end if;
    if new.activo is false or new.estado = 'rechazado' then
      return new; -- no ocupa cupo
    end if;
  end if;

  select
      (select count(*) from gym_turnos_fijos f
        where f.horario_id = new.horario_id
          and f.activo
          and f.estado <> 'rechazado'
          and f.fecha_desde <= v_fecha
          and f.id is distinct from new.id
          and not exists (
            select 1 from gym_excepciones_fijo e
             where e.turno_fijo_id = f.id and e.fecha = v_fecha
          ))
      +
      (select count(*) from gym_reservas_sueltas s
        where s.horario_id = new.horario_id
          and s.fecha = v_fecha
          and s.estado in ('pendiente','confirmada')
          and s.id is distinct from new.id)
    into v_ocupados;

  if v_ocupados >= v_horario.capacidad_max then
    raise exception 'No hay cupo disponible para ese horario';
  end if;

  return new;
end $$;

-- El trigger de fijos ahora también observa `estado` (confirmar/rechazar).
drop trigger if exists trg_gym_cupo_fijos on gym_turnos_fijos;
create trigger trg_gym_cupo_fijos
  before insert or update of activo, estado, horario_id, fecha_desde on gym_turnos_fijos
  for each row execute function public.gym_valida_cupo();


create or replace function public.gym_cupo_por_horario(
  p_horario_id uuid,
  p_fecha      date
)
returns table (cupo_usado int, capacidad_max int)
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      (select count(*) from gym_turnos_fijos f
        where f.horario_id = p_horario_id
          and f.activo and f.estado <> 'rechazado'
          and f.fecha_desde <= p_fecha
          and not exists (
            select 1 from gym_excepciones_fijo e
             where e.turno_fijo_id = f.id and e.fecha = p_fecha
          ))
      +
      (select count(*) from gym_reservas_sueltas s
        where s.horario_id = p_horario_id
          and s.fecha = p_fecha
          and s.estado in ('pendiente','confirmada'))
    )::int as cupo_usado,
    h.capacidad_max
  from gym_horarios h
  where h.id = p_horario_id;
$$;

create or replace function public.gym_horarios_dia(
  p_tenant_id uuid,
  p_fecha     date
)
returns table (
  horario_id    uuid,
  dia_semana    smallint,
  hora_inicio   time,
  hora_fin      time,
  capacidad_max int,
  cupo_usado    int
)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.dia_semana, h.hora_inicio, h.hora_fin, h.capacidad_max,
    (
      (select count(*) from gym_turnos_fijos f
        where f.horario_id = h.id and f.activo and f.estado <> 'rechazado'
          and f.fecha_desde <= p_fecha
          and not exists (
            select 1 from gym_excepciones_fijo e
             where e.turno_fijo_id = f.id and e.fecha = p_fecha
          ))
      +
      (select count(*) from gym_reservas_sueltas s
        where s.horario_id = h.id and s.fecha = p_fecha
          and s.estado in ('pendiente','confirmada'))
    )::int as cupo_usado
  from gym_horarios h
  where h.tenant_id = p_tenant_id
    and h.activo
    and h.dia_semana = extract(dow from p_fecha)::smallint
  order by h.hora_inicio;
$$;


-- ------------------------------------------------------------
-- 4) Guards de alta: "ya tiene lugar" ahora incluye pendientes.
-- ------------------------------------------------------------
create or replace function public.gym_reservar_suelta(
  p_horario_id uuid,
  p_fecha      date,
  p_nombre     text,
  p_telefono   text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

  -- Ya tiene reserva viva ese día/horario (pendiente o confirmada): no duplicar.
  select id into v_reserva_id
    from gym_reservas_sueltas
   where alumno_id = v_alumno_id and horario_id = p_horario_id
     and fecha = p_fecha and estado in ('pendiente','confirmada')
   limit 1;
  if v_reserva_id is not null then
    return v_reserva_id;
  end if;

  -- Ya va como fijo (vivo) ese día: no necesita suelta.
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
  values (v_tenant_id, v_alumno_id, p_horario_id, p_fecha, 'pendiente')
  returning id into v_reserva_id;

  return v_reserva_id;
end $$;

create or replace function public.gym_anotar_fijo(
  p_horario_id  uuid,
  p_fecha_desde date,
  p_nombre      text,
  p_telefono    text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

  -- Ya anotado fijo (vivo) a este horario: no duplicar.
  select id into v_fijo_id
    from gym_turnos_fijos
   where alumno_id = v_alumno_id and horario_id = p_horario_id
     and activo and estado <> 'rechazado'
   limit 1;
  if v_fijo_id is not null then
    return v_fijo_id;
  end if;

  insert into gym_turnos_fijos (tenant_id, alumno_id, horario_id, fecha_desde, activo, estado)
  values (v_tenant_id, v_alumno_id, p_horario_id, p_fecha_desde, true, 'pendiente')
  returning id into v_fijo_id;

  return v_fijo_id;
end $$;


-- ------------------------------------------------------------
-- 5) gym_mis_reservas: el alumno ve el estado (pendiente/confirmada) y sus
--    reservas pendientes también aparecen.
-- ------------------------------------------------------------
create or replace function public.gym_mis_reservas(p_telefono text)
returns table (
  tipo           text,
  id             uuid,
  horario_id     uuid,
  dia_semana     smallint,
  hora_inicio    time,
  hora_fin       time,
  fecha          date,
  fecha_desde    date,
  activo         boolean,
  estado         text
)
language sql
stable
security definer
set search_path = public
as $$
  select * from (
    select 'fijo'::text as tipo, f.id, f.horario_id, h.dia_semana, h.hora_inicio, h.hora_fin,
           null::date as fecha, f.fecha_desde, f.activo, f.estado
      from gym_turnos_fijos f
      join gym_alumnos a on a.id = f.alumno_id
      join gym_horarios h on h.id = f.horario_id
     where a.telefono = p_telefono and f.activo and f.estado <> 'rechazado'
    union all
    select 'suelta'::text, s.id, s.horario_id, h.dia_semana, h.hora_inicio, h.hora_fin,
           s.fecha, null::date, null::boolean, s.estado
      from gym_reservas_sueltas s
      join gym_alumnos a on a.id = s.alumno_id
      join gym_horarios h on h.id = s.horario_id
     where a.telefono = p_telefono
       and s.estado in ('pendiente','confirmada')
       and s.fecha >= current_date
  ) t
  order by fecha nulls last, dia_semana;
$$;


-- ------------------------------------------------------------
-- 6) gym_ocupacion_por_fecha (panel): suma el estado de cada reserva y el
--    estado de socio/cuota del alumno, para que Mariano confirme/rechace y
--    vea a los vencidos.
-- ------------------------------------------------------------
create or replace function public.gym_ocupacion_por_fecha(p_fecha date)
returns table (
  horario_id    uuid,
  dia_semana    smallint,
  hora_inicio   time,
  hora_fin      time,
  capacidad_max int,
  cupo_usado    int,
  alumnos       jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := ((select auth.jwt()) ->> 'tenant_id')::uuid;
  v_ok boolean :=
    (select auth.jwt()) ->> 'app_role' = 'owner'
    or (select auth.jwt()) ->> 'gym_admin' = 'true';
begin
  if v_tenant_id is null or not v_ok then
    raise exception 'No autorizado';
  end if;

  return query
  select h.id, h.dia_semana, h.hora_inicio, h.hora_fin, h.capacidad_max,
    (coalesce(fijos.cnt, 0) + coalesce(sueltas.cnt, 0))::int,
    coalesce(fijos.alumnos, '[]'::jsonb) || coalesce(sueltas.alumnos, '[]'::jsonb)
  from gym_horarios h
  left join lateral (
    select count(*) cnt,
           jsonb_agg(jsonb_build_object(
             'tipo', 'fijo', 'alumno_id', a.id, 'nombre', a.nombre,
             'turno_fijo_id', f.id, 'estado', f.estado,
             'es_socio', a.es_socio, 'cuota_hasta', a.cuota_hasta
           )) alumnos
      from gym_turnos_fijos f
      join gym_alumnos a on a.id = f.alumno_id
     where f.horario_id = h.id
       and f.activo and f.estado <> 'rechazado'
       and f.fecha_desde <= p_fecha
       and not exists (
         select 1 from gym_excepciones_fijo e
          where e.turno_fijo_id = f.id and e.fecha = p_fecha
       )
  ) fijos on true
  left join lateral (
    select count(*) cnt,
           jsonb_agg(jsonb_build_object(
             'tipo', 'suelto', 'alumno_id', a.id, 'nombre', a.nombre,
             'reserva_id', s.id, 'estado', s.estado,
             'es_socio', a.es_socio, 'cuota_hasta', a.cuota_hasta
           )) alumnos
      from gym_reservas_sueltas s
      join gym_alumnos a on a.id = s.alumno_id
     where s.horario_id = h.id
       and s.fecha = p_fecha
       and s.estado in ('pendiente','confirmada')
  ) sueltas on true
  where h.tenant_id = v_tenant_id
    and h.activo
    and h.dia_semana = extract(dow from p_fecha)::smallint
  order by h.hora_inicio;
end $$;
