-- ============================================================
-- Módulo de cupo para clases grupales del gimnasio (Gian).
--
-- Aditivo sobre el módulo de reservas 1-a-1 (0019-0022): no toca
-- turnos/servicios/profesional_horarios. Cubre un caso distinto -
-- varias personas comparten el mismo horario con cupo limitado, y la
-- mayoría va todas las semanas al mismo horario (fijo), no turno a
-- turno.
--
-- Decisiones (confirmadas con Chichi antes de escribir esto):
--   - Sin login para alumnos: se identifican por WhatsApp, igual que
--     la reserva pública de /gimnasio/reservar. Todo el alta/baja pasa
--     por funciones security definer (mismo patrón que
--     crear_turno_publico), nunca RLS+sesión.
--   - gym_alumnos es una entidad PROPIA, separada de `pacientes`
--     (aunque sea la misma persona en la vida real).
--   - Panel admin: owner + Mariano específicamente (columna nueva
--     agents.gym_admin), no todo profesional.
--
-- Correr DESPUÉS de 0001..0022, en el SQL Editor.
-- ============================================================


-- ------------------------------------------------------------
-- Tablas
-- ------------------------------------------------------------
create table if not exists gym_alumnos (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  nombre     text not null,
  telefono   text not null,
  email      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists gym_alumnos_tenant_tel_idx
  on gym_alumnos (tenant_id, telefono);

-- dia_semana sigue la misma convención que profesional_horarios:
-- extract(dow), 0=domingo..6=sábado. hora_inicio/hora_fin son hora
-- LOCAL de Buenos Aires (un horario es "los martes a las 18", no un
-- instante) — mismo criterio que 0019.
create table if not exists gym_horarios (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id),
  profesional_id uuid references agents(id) on delete set null,
  dia_semana     smallint not null check (dia_semana between 0 and 6),
  hora_inicio    time not null,
  hora_fin       time not null,
  capacidad_max  int not null check (capacidad_max > 0),
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  constraint gym_horarios_rango_check check (hora_fin > hora_inicio)
);
create index if not exists gym_horarios_tenant_idx on gym_horarios (tenant_id);
create index if not exists gym_horarios_dia_idx on gym_horarios (tenant_id, dia_semana);

-- fecha_desde: primera fecha (debe caer en el mismo día de la semana
-- que el horario — lo valida el trigger de cupo, no un check acá
-- porque necesita mirar gym_horarios).
create table if not exists gym_turnos_fijos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  alumno_id   uuid not null references gym_alumnos(id) on delete cascade,
  horario_id  uuid not null references gym_horarios(id) on delete cascade,
  fecha_desde date not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists gym_turnos_fijos_horario_idx
  on gym_turnos_fijos (horario_id, fecha_desde) where activo;
create index if not exists gym_turnos_fijos_alumno_idx
  on gym_turnos_fijos (alumno_id);

-- Un fijo no va un día puntual: libera su lugar esa fecha (no borra el
-- fijo, que sigue activo la semana siguiente).
create table if not exists gym_excepciones_fijo (
  id            uuid primary key default gen_random_uuid(),
  turno_fijo_id uuid not null references gym_turnos_fijos(id) on delete cascade,
  fecha         date not null,
  created_at    timestamptz not null default now(),
  unique (turno_fijo_id, fecha)
);

create table if not exists gym_reservas_sueltas (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  alumno_id  uuid not null references gym_alumnos(id) on delete cascade,
  horario_id uuid not null references gym_horarios(id) on delete cascade,
  fecha      date not null,
  estado     text not null default 'confirmada' check (estado in ('confirmada','cancelada')),
  created_at timestamptz not null default now()
);
create index if not exists gym_reservas_sueltas_horario_idx
  on gym_reservas_sueltas (horario_id, fecha) where estado = 'confirmada';
create index if not exists gym_reservas_sueltas_alumno_idx
  on gym_reservas_sueltas (alumno_id);


-- ------------------------------------------------------------
-- Trigger de cupo — defensa en profundidad, no confía en el frontend.
--
-- Un solo trigger reusado en las dos tablas de reserva (TG_TABLE_NAME
-- distingue). `select ... for update` sobre gym_horarios serializa
-- inserts concurrentes del mismo horario (cierra la ventana de carrera
-- entre "contar" y "confirmar"). security definer: corre igual venga
-- el insert de la función pública (service_role) o del panel admin
-- (owner/Mariano autenticados) — el chequeo de cupo no depende de qué
-- RLS tenga el que escribe.
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
    if new.estado <> 'confirmada' then
      return new; -- cancelar no consume cupo
    end if;
  else
    v_fecha := new.fecha_desde;
    if extract(dow from v_fecha)::smallint <> v_horario.dia_semana then
      raise exception 'La fecha de inicio no corresponde al día de este horario';
    end if;
    if new.activo is false then
      return new; -- dar de baja no consume cupo
    end if;
  end if;

  select
      (select count(*) from gym_turnos_fijos f
        where f.horario_id = new.horario_id
          and f.activo
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
          and s.estado = 'confirmada'
          and s.id is distinct from new.id)
    into v_ocupados;

  if v_ocupados >= v_horario.capacidad_max then
    raise exception 'No hay cupo disponible para ese horario';
  end if;

  return new;
end $$;

-- No se invoca por RPC (solo la dispara la base): cerrarla a anon/authenticated.
revoke execute on function public.gym_valida_cupo() from public;
revoke execute on function public.gym_valida_cupo() from anon;
revoke execute on function public.gym_valida_cupo() from authenticated;

drop trigger if exists trg_gym_cupo_sueltas on gym_reservas_sueltas;
create trigger trg_gym_cupo_sueltas
  before insert or update of estado, horario_id, fecha on gym_reservas_sueltas
  for each row execute function public.gym_valida_cupo();

drop trigger if exists trg_gym_cupo_fijos on gym_turnos_fijos;
create trigger trg_gym_cupo_fijos
  before insert or update of activo, horario_id, fecha_desde on gym_turnos_fijos
  for each row execute function public.gym_valida_cupo();


-- ------------------------------------------------------------
-- RLS
--
-- Sin ninguna policy para anon en las 4 tablas de datos: el público
-- nunca las toca directo (mismo criterio que servicios/
-- profesional_horarios en 0019), solo por las funciones de abajo.
-- gym_horarios sí es legible por cualquier authenticated (no es
-- sensible). Escritura de las 5 tablas: owner + Mariano (gym_admin).
-- ------------------------------------------------------------
alter table gym_alumnos           enable row level security;
alter table gym_horarios          enable row level security;
alter table gym_turnos_fijos      enable row level security;
alter table gym_excepciones_fijo  enable row level security;
alter table gym_reservas_sueltas  enable row level security;

drop policy if exists "read_gym_horarios" on gym_horarios;
create policy "read_gym_horarios" on gym_horarios
  for select to authenticated
  using (tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid);

drop policy if exists "admin_gym_horarios" on gym_horarios;
create policy "admin_gym_horarios" on gym_horarios
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (
      (select auth.jwt()) ->> 'app_role' = 'owner'
      or (select auth.jwt()) ->> 'gym_admin' = 'true'
    )
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (
      (select auth.jwt()) ->> 'app_role' = 'owner'
      or (select auth.jwt()) ->> 'gym_admin' = 'true'
    )
  );

drop policy if exists "admin_gym_alumnos" on gym_alumnos;
create policy "admin_gym_alumnos" on gym_alumnos
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (
      (select auth.jwt()) ->> 'app_role' = 'owner'
      or (select auth.jwt()) ->> 'gym_admin' = 'true'
    )
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (
      (select auth.jwt()) ->> 'app_role' = 'owner'
      or (select auth.jwt()) ->> 'gym_admin' = 'true'
    )
  );

drop policy if exists "admin_gym_turnos_fijos" on gym_turnos_fijos;
create policy "admin_gym_turnos_fijos" on gym_turnos_fijos
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (
      (select auth.jwt()) ->> 'app_role' = 'owner'
      or (select auth.jwt()) ->> 'gym_admin' = 'true'
    )
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (
      (select auth.jwt()) ->> 'app_role' = 'owner'
      or (select auth.jwt()) ->> 'gym_admin' = 'true'
    )
  );

-- gym_excepciones_fijo no tiene tenant_id propio (cuelga de
-- gym_turnos_fijos) — se resuelve el tenant vía subquery.
drop policy if exists "admin_gym_excepciones_fijo" on gym_excepciones_fijo;
create policy "admin_gym_excepciones_fijo" on gym_excepciones_fijo
  for all to authenticated
  using (
    (
      (select auth.jwt()) ->> 'app_role' = 'owner'
      or (select auth.jwt()) ->> 'gym_admin' = 'true'
    )
    and exists (
      select 1 from gym_turnos_fijos f
       where f.id = turno_fijo_id
         and f.tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    )
  )
  with check (
    (
      (select auth.jwt()) ->> 'app_role' = 'owner'
      or (select auth.jwt()) ->> 'gym_admin' = 'true'
    )
    and exists (
      select 1 from gym_turnos_fijos f
       where f.id = turno_fijo_id
         and f.tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    )
  );

drop policy if exists "admin_gym_reservas_sueltas" on gym_reservas_sueltas;
create policy "admin_gym_reservas_sueltas" on gym_reservas_sueltas
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (
      (select auth.jwt()) ->> 'app_role' = 'owner'
      or (select auth.jwt()) ->> 'gym_admin' = 'true'
    )
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (
      (select auth.jwt()) ->> 'app_role' = 'owner'
      or (select auth.jwt()) ->> 'gym_admin' = 'true'
    )
  );


-- ------------------------------------------------------------
-- Hook de JWT: sumar `gym_admin` (además de tenant_id/app_role/agent_id
-- que ya pone 0021). Mismo criterio: se mantiene EXACTO lo anterior y
-- se agrega un claim.
-- ------------------------------------------------------------
alter table agents add column if not exists gym_admin boolean not null default false;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  claims       jsonb;
  agent_id     uuid;
  agent_tenant uuid;
  agent_role   text;
  agent_gymadm boolean;
begin
  select id, tenant_id, role, gym_admin
    into agent_id, agent_tenant, agent_role, agent_gymadm
    from agents
   where auth_user_id = (event->>'user_id')::uuid;

  claims := event->'claims';

  if agent_tenant is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(agent_tenant::text));
    claims := jsonb_set(claims, '{app_role}', to_jsonb(agent_role));
    claims := jsonb_set(claims, '{agent_id}', to_jsonb(agent_id::text));
    claims := jsonb_set(claims, '{gym_admin}', to_jsonb(coalesce(agent_gymadm, false)));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;


-- ------------------------------------------------------------
-- Funciones públicas (alumno, sin login) — mismo criterio que
-- slots_disponibles/crear_turno_publico de 0019: security definer,
-- revoke de public/anon/authenticated, grant solo a service_role. El
-- control de "esto es tuyo" se hace ACA ADENTRO comparando teléfono,
-- no con RLS (no hay sesión de alumno).
-- ------------------------------------------------------------

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
          and f.activo
          and f.fecha_desde <= p_fecha
          and not exists (
            select 1 from gym_excepciones_fijo e
             where e.turno_fijo_id = f.id and e.fecha = p_fecha
          ))
      +
      (select count(*) from gym_reservas_sueltas s
        where s.horario_id = p_horario_id
          and s.fecha = p_fecha
          and s.estado = 'confirmada')
    )::int as cupo_usado,
    h.capacidad_max
  from gym_horarios h
  where h.id = p_horario_id;
$$;
revoke execute on function public.gym_cupo_por_horario(uuid, date) from public;
revoke execute on function public.gym_cupo_por_horario(uuid, date) from anon;
grant execute on function public.gym_cupo_por_horario(uuid, date) to authenticated;
grant execute on function public.gym_cupo_por_horario(uuid, date) to service_role;

-- Grilla pública del alumno: todos los horarios activos de un día concreto con
-- su cupo usado/total. Deriva dia_semana de la fecha. Mismo criterio de conteo
-- que gym_valida_cupo (fijos activos sin excepción + sueltas confirmadas).
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
        where f.horario_id = h.id and f.activo and f.fecha_desde <= p_fecha
          and not exists (
            select 1 from gym_excepciones_fijo e
             where e.turno_fijo_id = f.id and e.fecha = p_fecha
          ))
      +
      (select count(*) from gym_reservas_sueltas s
        where s.horario_id = h.id and s.fecha = p_fecha and s.estado = 'confirmada')
    )::int as cupo_usado
  from gym_horarios h
  where h.tenant_id = p_tenant_id
    and h.activo
    and h.dia_semana = extract(dow from p_fecha)::smallint
  order by h.hora_inicio;
$$;
revoke execute on function public.gym_horarios_dia(uuid, date) from public;
revoke execute on function public.gym_horarios_dia(uuid, date) from anon;
revoke execute on function public.gym_horarios_dia(uuid, date) from authenticated;
grant execute on function public.gym_horarios_dia(uuid, date) to service_role;

-- Upsert de alumno por teléfono, reusado por las funciones de alta.
create or replace function public.gym_upsert_alumno(
  p_tenant_id uuid,
  p_nombre    text,
  p_telefono  text,
  p_email     text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alumno_id uuid;
begin
  select id into v_alumno_id
    from gym_alumnos
   where tenant_id = p_tenant_id and telefono = p_telefono
   limit 1;

  if v_alumno_id is null then
    insert into gym_alumnos (tenant_id, nombre, telefono, email)
    values (p_tenant_id, p_nombre, p_telefono, nullif(trim(coalesce(p_email, '')), ''))
    returning id into v_alumno_id;
  else
    update gym_alumnos
       set email = coalesce(email, nullif(trim(coalesce(p_email, '')), '')),
           updated_at = now()
     where id = v_alumno_id;
  end if;

  return v_alumno_id;
end $$;
-- Helper interno de las funciones de alta: nunca directo por RPC.
revoke execute on function public.gym_upsert_alumno(uuid, text, text, text) from public;
revoke execute on function public.gym_upsert_alumno(uuid, text, text, text) from anon;
revoke execute on function public.gym_upsert_alumno(uuid, text, text, text) from authenticated;
grant  execute on function public.gym_upsert_alumno(uuid, text, text, text) to service_role;

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

  -- Ya tiene lugar ese día en ese horario (suelta confirmada previa): devolvé la
  -- existente en vez de tomar otro cupo.
  select id into v_reserva_id
    from gym_reservas_sueltas
   where alumno_id = v_alumno_id and horario_id = p_horario_id
     and fecha = p_fecha and estado = 'confirmada'
   limit 1;
  if v_reserva_id is not null then
    return v_reserva_id;
  end if;

  -- Ya va como fijo ese día (fijo activo sin excepción esa fecha): no necesita
  -- suelta, ya tiene su lugar.
  if exists (
    select 1 from gym_turnos_fijos f
     where f.alumno_id = v_alumno_id and f.horario_id = p_horario_id
       and f.activo and f.fecha_desde <= p_fecha
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
end $$;
revoke execute on function public.gym_reservar_suelta(uuid, date, text, text) from public;
revoke execute on function public.gym_reservar_suelta(uuid, date, text, text) from anon;
revoke execute on function public.gym_reservar_suelta(uuid, date, text, text) from authenticated;
grant execute on function public.gym_reservar_suelta(uuid, date, text, text) to service_role;

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

  -- Ya anotado fijo (activo) a este horario: no duplicar (consumiría 2 cupos).
  select id into v_fijo_id
    from gym_turnos_fijos
   where alumno_id = v_alumno_id and horario_id = p_horario_id and activo
   limit 1;
  if v_fijo_id is not null then
    return v_fijo_id;
  end if;

  insert into gym_turnos_fijos (tenant_id, alumno_id, horario_id, fecha_desde, activo)
  values (v_tenant_id, v_alumno_id, p_horario_id, p_fecha_desde, true)
  returning id into v_fijo_id;

  return v_fijo_id;
end $$;
revoke execute on function public.gym_anotar_fijo(uuid, date, text, text) from public;
revoke execute on function public.gym_anotar_fijo(uuid, date, text, text) from anon;
revoke execute on function public.gym_anotar_fijo(uuid, date, text, text) from authenticated;
grant execute on function public.gym_anotar_fijo(uuid, date, text, text) to service_role;

create or replace function public.gym_marcar_excepcion(
  p_turno_fijo_id uuid,
  p_fecha         date,
  p_telefono      text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from gym_turnos_fijos f
    join gym_alumnos a on a.id = f.alumno_id
    where f.id = p_turno_fijo_id and a.telefono = p_telefono
  ) then
    raise exception 'No encontramos esa reserva con ese teléfono';
  end if;

  insert into gym_excepciones_fijo (turno_fijo_id, fecha)
  values (p_turno_fijo_id, p_fecha)
  on conflict (turno_fijo_id, fecha) do nothing;
end $$;
revoke execute on function public.gym_marcar_excepcion(uuid, date, text) from public;
revoke execute on function public.gym_marcar_excepcion(uuid, date, text) from anon;
revoke execute on function public.gym_marcar_excepcion(uuid, date, text) from authenticated;
grant execute on function public.gym_marcar_excepcion(uuid, date, text) to service_role;

create or replace function public.gym_cancelar_suelta(
  p_reserva_id uuid,
  p_telefono   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update gym_reservas_sueltas s
     set estado = 'cancelada'
    from gym_alumnos a
   where s.id = p_reserva_id
     and a.id = s.alumno_id
     and a.telefono = p_telefono;

  if not found then
    raise exception 'No encontramos esa reserva con ese teléfono';
  end if;
end $$;
revoke execute on function public.gym_cancelar_suelta(uuid, text) from public;
revoke execute on function public.gym_cancelar_suelta(uuid, text) from anon;
revoke execute on function public.gym_cancelar_suelta(uuid, text) from authenticated;
grant execute on function public.gym_cancelar_suelta(uuid, text) to service_role;

create or replace function public.gym_cancelar_fijo(
  p_turno_fijo_id uuid,
  p_telefono      text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update gym_turnos_fijos f
     set activo = false
    from gym_alumnos a
   where f.id = p_turno_fijo_id
     and a.id = f.alumno_id
     and a.telefono = p_telefono;

  if not found then
    raise exception 'No encontramos esa reserva con ese teléfono';
  end if;
end $$;
revoke execute on function public.gym_cancelar_fijo(uuid, text) from public;
revoke execute on function public.gym_cancelar_fijo(uuid, text) from anon;
revoke execute on function public.gym_cancelar_fijo(uuid, text) from authenticated;
grant execute on function public.gym_cancelar_fijo(uuid, text) to service_role;

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
           null::date as fecha, f.fecha_desde, f.activo, null::text as estado
      from gym_turnos_fijos f
      join gym_alumnos a on a.id = f.alumno_id
      join gym_horarios h on h.id = f.horario_id
     where a.telefono = p_telefono and f.activo
    union all
    select 'suelta'::text, s.id, s.horario_id, h.dia_semana, h.hora_inicio, h.hora_fin,
           s.fecha, null::date, null::boolean, s.estado
      from gym_reservas_sueltas s
      join gym_alumnos a on a.id = s.alumno_id
      join gym_horarios h on h.id = s.horario_id
     where a.telefono = p_telefono
       and s.estado = 'confirmada'
       and s.fecha >= current_date
  ) t
  order by fecha nulls last, dia_semana;
$$;
revoke execute on function public.gym_mis_reservas(text) from public;
revoke execute on function public.gym_mis_reservas(text) from anon;
revoke execute on function public.gym_mis_reservas(text) from authenticated;
grant execute on function public.gym_mis_reservas(text) to service_role;


-- ------------------------------------------------------------
-- gym_ocupacion_por_fecha — panel admin. SIN tenant_id como parámetro
-- a propósito: una security definer bypassea RLS, así que si el tenant
-- viniera del caller cualquier authenticated podría pedir la ocupación
-- de otro tenant. Se deriva del JWT del que llama y se valida el
-- permiso ADENTRO (mismo gate que las policies: owner o gym_admin).
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
             'tipo', 'fijo', 'alumno_id', a.id, 'nombre', a.nombre, 'turno_fijo_id', f.id
           )) alumnos
      from gym_turnos_fijos f
      join gym_alumnos a on a.id = f.alumno_id
     where f.horario_id = h.id
       and f.activo
       and f.fecha_desde <= p_fecha
       and not exists (
         select 1 from gym_excepciones_fijo e
          where e.turno_fijo_id = f.id and e.fecha = p_fecha
       )
  ) fijos on true
  left join lateral (
    select count(*) cnt,
           jsonb_agg(jsonb_build_object(
             'tipo', 'suelto', 'alumno_id', a.id, 'nombre', a.nombre, 'reserva_id', s.id
           )) alumnos
      from gym_reservas_sueltas s
      join gym_alumnos a on a.id = s.alumno_id
     where s.horario_id = h.id
       and s.fecha = p_fecha
       and s.estado = 'confirmada'
  ) sueltas on true
  where h.tenant_id = v_tenant_id
    and h.activo
    and h.dia_semana = extract(dow from p_fecha)::smallint
  order by h.hora_inicio;
end $$;
revoke execute on function public.gym_ocupacion_por_fecha(date) from public;
revoke execute on function public.gym_ocupacion_por_fecha(date) from anon;
grant execute on function public.gym_ocupacion_por_fecha(date) to authenticated;


-- ------------------------------------------------------------
-- Seed: prende gym_admin para Mariano Gómez en el tenant piloto.
-- No siembra horarios de ejemplo — se cargan desde el panel admin
-- (evita inventar día/hora/cupo reales de las clases de Gian).
-- ------------------------------------------------------------
do $$
declare
  v_tenant uuid;
begin
  select id into v_tenant
    from tenants
   where whatsapp_phone_number_id = '1206741565856408';

  if v_tenant is null then
    raise notice '[0023] No encontré el tenant piloto — salteo el seed.';
    return;
  end if;

  update agents
     set gym_admin = true
   where tenant_id = v_tenant
     and name ilike '%mariano%';
end $$;
