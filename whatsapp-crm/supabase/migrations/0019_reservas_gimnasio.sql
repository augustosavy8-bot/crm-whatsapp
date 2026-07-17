-- ============================================================
-- Módulo de reservas del gimnasio (aditivo sobre el módulo de
-- turnos que ya existe — NO crea una agenda paralela).
--
-- Suma la capa que faltaba para reservar: servicios, horarios de
-- atención, bloqueos, y las dos funciones que usa el front público.
-- Los profesionales van sobre `agents` (auth_user_id es nullable,
-- así que Mariano/Lis/Gian existen sin login) y los clientes sobre
-- `pacientes`, que ya tiene contact_id -> contacts.
--
-- Correr DESPUÉS de 0001..0018, en el SQL Editor.
--
-- OJO con el orden:
--   1. `supabase/diagnostico_tz_turnos.sql` (pasos 1-3): corregir
--      las fechas corridas por el bug de TZ.
--   2. Esta migración (0019).
--   3. Diagnóstico paso 4: verificar que no queden solapamientos.
--   4. Migración 0020: recién ahí entra la EXCLUDE constraint.
-- La EXCLUDE va aparte a propósito: falla al aplicarse si hay datos
-- sucios, y no queremos validar solapamientos sobre fechas corridas.
--
-- Convención de zona horaria: TODO se guarda en UTC (timestamptz).
-- Los horarios de atención se guardan como `time` LOCAL de Buenos
-- Aires (un horario es "los martes de 9 a 13", no un instante), y
-- se convierten a instante con `at time zone` al generar los slots.
-- ============================================================


-- ------------------------------------------------------------
-- servicios
-- Hoy 1 servicio = 1 profesional. `profesional_id` nullable para no
-- romper si un servicio queda sin asignar; si más adelante un servicio
-- lo dan varios, esto pasa a ser una tabla puente sin tocar `turnos`.
-- ------------------------------------------------------------
create table if not exists servicios (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id),
  nombre         text not null,
  slug           text not null,
  descripcion    text,
  duracion_min   int not null default 30 check (duracion_min > 0),
  profesional_id uuid references agents(id) on delete set null,
  activo         boolean not null default true,
  orden          int not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists servicios_tenant_idx on servicios (tenant_id);
-- El slug es la llave pública (/gimnasio/reservar?servicio=kinesiologia).
create unique index if not exists servicios_tenant_slug_idx
  on servicios (tenant_id, slug);


-- ------------------------------------------------------------
-- profesional_horarios — horarios de atención por día de la semana.
-- dia_semana sigue la convención de `extract(dow)`: 0=domingo .. 6=sábado.
-- Varias franjas por día (ej. 09-13 y 16-20) = varias filas.
-- ------------------------------------------------------------
create table if not exists profesional_horarios (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id),
  profesional_id uuid not null references agents(id) on delete cascade,
  dia_semana     smallint not null check (dia_semana between 0 and 6),
  hora_inicio    time not null,
  hora_fin       time not null,
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  constraint profesional_horarios_rango_check check (hora_fin > hora_inicio)
);
create index if not exists profesional_horarios_tenant_idx
  on profesional_horarios (tenant_id);
create index if not exists profesional_horarios_prof_dia_idx
  on profesional_horarios (profesional_id, dia_semana);


-- ------------------------------------------------------------
-- profesional_bloqueos — excepciones: vacaciones, feriados, franjas
-- puntuales. Todo con la misma forma (un rango de instantes), así el
-- generador de slots resta una sola cosa.
-- ------------------------------------------------------------
create table if not exists profesional_bloqueos (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id),
  profesional_id uuid not null references agents(id) on delete cascade,
  desde          timestamptz not null,
  hasta          timestamptz not null,
  motivo         text,
  created_at     timestamptz not null default now(),
  constraint profesional_bloqueos_rango_check check (hasta > desde)
);
create index if not exists profesional_bloqueos_tenant_idx
  on profesional_bloqueos (tenant_id);
create index if not exists profesional_bloqueos_prof_idx
  on profesional_bloqueos (profesional_id, desde);


-- ------------------------------------------------------------
-- turnos: servicio + rango + origen 'web'
-- ------------------------------------------------------------
alter table turnos add column if not exists servicio_id uuid
  references servicios(id) on delete set null;
create index if not exists turnos_servicio_idx on turnos (servicio_id);

-- `origen` sumó 'web' (reserva del front público). El check lo creó
-- 0016 vía ADD COLUMN, así que se llama turnos_origen_check.
alter table turnos drop constraint if exists turnos_origen_check;
alter table turnos add constraint turnos_origen_check
  check (origen in ('manual','ia_whatsapp','ia_manual','web'));

-- Fin del turno, derivado de fecha_hora + duracion_min. Lo mantiene un
-- trigger y NO es una columna generada: `timestamptz + interval` es STABLE
-- (no IMMUTABLE), y GENERATED exige inmutabilidad. Con fecha_fin como
-- columna real, la EXCLUDE de 0020 puede usar tstzrange(fecha_hora,
-- fecha_fin), que sí es inmutable. El trigger garantiza que la app nunca
-- tenga que calcularlo — no se puede insertar un turno con el fin mal.
alter table turnos add column if not exists fecha_fin timestamptz;

create or replace function public.turnos_set_fecha_fin()
returns trigger
language plpgsql
as $$
begin
  new.fecha_fin := new.fecha_hora + make_interval(mins => new.duracion_min);
  return new;
end $$;

drop trigger if exists trg_turnos_fecha_fin on turnos;
create trigger trg_turnos_fecha_fin
  before insert or update of fecha_hora, duracion_min on turnos
  for each row
  execute function public.turnos_set_fecha_fin();

-- Backfill de los turnos que ya existen (el trigger solo corre a futuro).
update turnos
   set fecha_fin = fecha_hora + make_interval(mins => duracion_min)
 where fecha_fin is null;


-- ------------------------------------------------------------
-- RLS — mismo criterio que 0011: tenant vía claim del JWT.
--
-- Para `anon` NO hay policies ni grants, a propósito: el público
-- nunca toca estas tablas. Llega solo por las dos funciones de más
-- abajo, detrás de route handlers del server. Darle SELECT sobre
-- `turnos` para "ver disponibilidad" filtraría quién reservó y
-- cuándo — RLS es row-level, no column-level.
-- ------------------------------------------------------------
alter table servicios            enable row level security;
alter table profesional_horarios enable row level security;
alter table profesional_bloqueos enable row level security;

drop policy if exists "tenant_servicios" on servicios;
create policy "tenant_servicios" on servicios
  for all to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

drop policy if exists "tenant_profesional_horarios" on profesional_horarios;
create policy "tenant_profesional_horarios" on profesional_horarios
  for all to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

drop policy if exists "tenant_profesional_bloqueos" on profesional_bloqueos;
create policy "tenant_profesional_bloqueos" on profesional_bloqueos
  for all to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);


-- ------------------------------------------------------------
-- slots_disponibles(servicio, fecha) -> los horarios libres.
--
-- Vive en SQL y no en TS para que el front público y el panel admin
-- no puedan discrepar. Devuelve SOLO instantes: ni un dato de nadie.
--
-- La conversión clave: (fecha + hora_inicio) es un timestamp SIN zona
-- ("el martes a las 9"), y `at time zone 'America/...'` lo ancla al
-- instante correcto respetando DST. Nunca restar 3hs a mano.
-- ------------------------------------------------------------
create or replace function public.slots_disponibles(
  p_servicio_id uuid,
  p_fecha       date
)
returns table (inicio timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select id, tenant_id, profesional_id, duracion_min
      from servicios
     where id = p_servicio_id
       and activo
       and profesional_id is not null
  ),
  franjas as (
    select h.hora_inicio, h.hora_fin
      from profesional_horarios h
      join s on s.profesional_id = h.profesional_id
             and s.tenant_id = h.tenant_id
     where h.activo
       and h.dia_semana = extract(dow from p_fecha)::smallint
  ),
  candidatos as (
    -- El borde superior resta la duración para que el último slot
    -- entre completo dentro de la franja (no arrancar 19:45 si cierra 20).
    select gs.inicio
      from franjas f
      cross join s
      cross join lateral generate_series(
        (p_fecha + f.hora_inicio) at time zone 'America/Argentina/Buenos_Aires',
        ((p_fecha + f.hora_fin) at time zone 'America/Argentina/Buenos_Aires')
          - make_interval(mins => s.duracion_min),
        make_interval(mins => s.duracion_min)
      ) as gs(inicio)
  )
  select distinct c.inicio
    from candidatos c
    cross join s
   where c.inicio > now()
     and not exists (
       select 1
         from turnos t
        where t.tenant_id = s.tenant_id
          and t.profesional_id = s.profesional_id
          and t.estado <> 'cancelado'
          and tstzrange(t.fecha_hora, t.fecha_fin, '[)') && tstzrange(
                c.inicio,
                c.inicio + make_interval(mins => s.duracion_min),
                '[)')
     )
     and not exists (
       select 1
         from profesional_bloqueos b
        where b.tenant_id = s.tenant_id
          and b.profesional_id = s.profesional_id
          and tstzrange(b.desde, b.hasta, '[)') && tstzrange(
                c.inicio,
                c.inicio + make_interval(mins => s.duracion_min),
                '[)')
     )
   order by c.inicio;
$$;

-- create function otorga EXECUTE a PUBLIC por default -> revocar SIEMPRE
-- (mismo criterio que 0010 con el hook del JWT).
revoke execute on function public.slots_disponibles(uuid, date) from public;
revoke execute on function public.slots_disponibles(uuid, date) from anon;
-- Solo instantes libres, sin datos personales: el panel admin también la usa.
grant execute on function public.slots_disponibles(uuid, date) to authenticated;
grant execute on function public.slots_disponibles(uuid, date) to service_role;


-- ------------------------------------------------------------
-- crear_turno_publico(...) -> id del turno.
--
-- Todo el alta pública en una sola transacción. Revalida el slot en
-- el server (el browser puede mentir o llegar tarde), pero la garantía
-- real contra la doble reserva es la EXCLUDE de 0020: si dos reservas
-- pasan la validación a la vez, la segunda muere con 23P01.
--
-- p_telefono ENTRA YA NORMALIZADO con normalizeArPhone() desde el route
-- handler: es la misma función que usa el resto del CRM, y así el
-- match contra `contacts` y el dedupe de `pacientes` usan un solo
-- criterio en vez de dos implementaciones que se van a separar.
-- ------------------------------------------------------------
create or replace function public.crear_turno_publico(
  p_servicio_id uuid,
  p_inicio      timestamptz,
  p_nombre      text,
  p_telefono    text,
  p_email       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servicio    record;
  v_paciente_id uuid;
  v_contact_id  uuid;
  v_turno_id    uuid;
  v_nombre      text := nullif(trim(p_nombre), '');
  v_email       text := nullif(trim(coalesce(p_email, '')), '');
begin
  if v_nombre is null then
    raise exception 'El nombre es obligatorio';
  end if;
  if nullif(trim(coalesce(p_telefono, '')), '') is null then
    raise exception 'El WhatsApp es obligatorio';
  end if;

  select id, tenant_id, profesional_id, duracion_min
    into v_servicio
    from servicios
   where id = p_servicio_id and activo and profesional_id is not null;
  if not found then
    raise exception 'El servicio no existe o no está disponible';
  end if;

  -- Revalidación: el slot tiene que seguir libre y ser uno real de la grilla
  -- (esto también frena horarios inventados fuera del horario de atención).
  if not exists (
    select 1
      from slots_disponibles(
             p_servicio_id,
             (p_inicio at time zone 'America/Argentina/Buenos_Aires')::date
           ) s
     where s.inicio = p_inicio
  ) then
    raise exception 'Ese horario ya no está disponible';
  end if;

  -- Contacto del CRM: se VINCULA si esa persona ya escribió por WhatsApp,
  -- pero NO se crea si no existe. Un contacto sin mensajes se colaría en
  -- `conversation_list` como una conversación fantasma. Cuando escriba, el
  -- webhook lo crea y el trigger de abajo lo vincula solo.
  select id into v_contact_id
    from contacts
   where tenant_id = v_servicio.tenant_id
     and channel = 'whatsapp'
     and phone_number = p_telefono
   limit 1;

  select id into v_paciente_id
    from pacientes
   where tenant_id = v_servicio.tenant_id
     and telefono = p_telefono
   limit 1;

  if v_paciente_id is null then
    insert into pacientes (tenant_id, contact_id, nombre, telefono, email)
    values (v_servicio.tenant_id, v_contact_id, v_nombre, p_telefono, v_email)
    returning id into v_paciente_id;
  else
    -- Cliente que vuelve: se completa lo que falte, pero NO se pisa el
    -- nombre — si no, cualquiera que reserve con el teléfono de otro le
    -- renombra la ficha.
    update pacientes
       set contact_id = coalesce(contact_id, v_contact_id),
           email      = coalesce(email, v_email),
           updated_at = now()
     where id = v_paciente_id;
  end if;

  insert into turnos (
    tenant_id, paciente_id, profesional_id, servicio_id,
    fecha_hora, duracion_min, estado, origen
  )
  values (
    v_servicio.tenant_id, v_paciente_id, v_servicio.profesional_id, v_servicio.id,
    p_inicio, v_servicio.duracion_min, 'pendiente', 'web'
  )
  returning id into v_turno_id;

  return v_turno_id;
end $$;

revoke execute on function public.crear_turno_publico(uuid, timestamptz, text, text, text) from public;
revoke execute on function public.crear_turno_publico(uuid, timestamptz, text, text, text) from anon;
revoke execute on function public.crear_turno_publico(uuid, timestamptz, text, text, text) from authenticated;
-- Solo el route handler (server-side). El público nunca la llama directo.
grant execute on function public.crear_turno_publico(uuid, timestamptz, text, text, text) to service_role;


-- ------------------------------------------------------------
-- Vinculación tardía paciente <-> contacto.
--
-- Alguien reserva por la web sin haber escrito nunca -> el paciente
-- queda con contact_id null. Cuando después escribe, el webhook crea
-- el contacto y este trigger cierra el círculo. Aditivo: no toca una
-- línea del ingest.
-- ------------------------------------------------------------
create or replace function public.link_paciente_on_contact_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.phone_number is not null and new.channel = 'whatsapp' then
    update pacientes
       set contact_id = new.id,
           updated_at = now()
     where tenant_id = new.tenant_id
       and contact_id is null
       and telefono = new.phone_number;
  end if;
  return new;
end $$;

drop trigger if exists trg_link_paciente_on_contact on contacts;
create trigger trg_link_paciente_on_contact
  after insert on contacts
  for each row
  execute function public.link_paciente_on_contact_insert();


-- ------------------------------------------------------------
-- Seed: los 3 servicios del gimnasio sobre el tenant piloto.
--
-- El tenant se busca por whatsapp_phone_number_id (unique), igual que
-- 0017. `rubro_slug` queda en 'kinesiologia' a propósito: campos_config
-- está sembrado contra ese slug (0015) y cambiarlo vaciaría los
-- formularios dinámicos de pacientes.
--
-- Los agents se matchean por nombre e insertan solo si faltan, porque
-- no sabemos qué hay cargado hoy en la base del piloto.
--
-- OJO — efecto conocido: al haber 3 profesionales, getProfesionalUnico()
-- (src/lib/profesionales.ts) pasa a devolver null y los turnos que crea
-- la IA por WhatsApp entran SIN profesional asignado, para que el staff
-- lo asigne al confirmar. Es lo correcto con 3 profesionales: adivinar
-- sería peor. La EXCLUDE de 0020 ignora los turnos sin profesional y
-- recién los valida cuando se les asigna uno.
-- ------------------------------------------------------------
do $$
declare
  v_tenant  uuid;
  v_mariano uuid;
  v_lis     uuid;
  v_gian    uuid;
begin
  select id into v_tenant
    from tenants
   where whatsapp_phone_number_id = '1206741565856408';

  if v_tenant is null then
    raise notice '[0019] No encontré el tenant piloto — salteo el seed. Sembrá servicios/horarios a mano.';
    return;
  end if;

  -- Mariano probablemente ya exista (es el profesional del piloto).
  select id into v_mariano from agents
   where tenant_id = v_tenant and name ilike '%mariano%' limit 1;
  if v_mariano is null then
    insert into agents (tenant_id, name, role) values (v_tenant, 'Mariano Gómez', 'profesional')
    returning id into v_mariano;
  end if;

  select id into v_lis from agents
   where tenant_id = v_tenant and (name ilike '%lis%' or name ilike '%ponzio%') limit 1;
  if v_lis is null then
    insert into agents (tenant_id, name, role) values (v_tenant, 'Lis Ponzio', 'profesional')
    returning id into v_lis;
  end if;

  select id into v_gian from agents
   where tenant_id = v_tenant and (name ilike '%gian%' or name ilike '%orlandi%') limit 1;
  if v_gian is null then
    insert into agents (tenant_id, name, role) values (v_tenant, 'Gian Orlandi', 'profesional')
    returning id into v_gian;
  end if;

  insert into servicios (tenant_id, nombre, slug, descripcion, duracion_min, profesional_id, orden)
  values
    (v_tenant, 'Kinesiología', 'kinesiologia',
     'Evaluación y tratamiento de lesiones, dolor y recuperación funcional.',
     45, v_mariano, 10),
    (v_tenant, 'Nutrición', 'nutricion',
     'Plan alimentario personalizado y seguimiento de composición corporal.',
     45, v_lis, 20),
    (v_tenant, 'Gimnasio', 'gimnasio',
     'Entrenamiento personalizado y rutinas adaptadas a tu objetivo.',
     60, v_gian, 30)
  on conflict (tenant_id, slug) do update
     set nombre         = excluded.nombre,
         descripcion    = excluded.descripcion,
         duracion_min   = excluded.duracion_min,
         profesional_id = coalesce(servicios.profesional_id, excluded.profesional_id),
         orden          = excluded.orden;

  -- Horarios por defecto: lunes a viernes, 09-13 y 16-20. Provisorios,
  -- se editan desde /turnos/configuracion. Solo para profesionales que
  -- todavía no tengan ninguno cargado.
  insert into profesional_horarios (tenant_id, profesional_id, dia_semana, hora_inicio, hora_fin)
  select v_tenant, p.id, d.dia, f.desde, f.hasta
    from (values (v_mariano), (v_lis), (v_gian)) as p(id)
    cross join generate_series(1, 5) as d(dia)          -- 1=lunes .. 5=viernes
    cross join (values ('09:00'::time, '13:00'::time),
                       ('16:00'::time, '20:00'::time)) as f(desde, hasta)
   where not exists (
     select 1 from profesional_horarios h where h.profesional_id = p.id
   );
end $$;
