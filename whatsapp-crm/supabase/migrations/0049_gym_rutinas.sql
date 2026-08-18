-- ============================================================
-- Rutinas de entrenamiento (prototipo).
--
-- El staff (profe/admin) le arma una rutina estructurada a un alumno; el
-- alumno la ve en su panel y registra el peso/reps que hizo por ejercicio.
--
--   gym_rutinas       una rutina por alumno (editable). El contenido va en
--                     `dias` (jsonb): [{ id, nombre, ejercicios: [{ id, nombre,
--                     series, reps, peso, descanso, nota }] }].
--   gym_rutina_logs   registro del alumno: qué peso/reps hizo de cada ejercicio
--                     en una fecha (para seguir el progreso).
--
-- Correr DESPUÉS de 0048.
-- ============================================================

create table if not exists gym_rutinas (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  alumno_id  uuid not null references gym_alumnos(id) on delete cascade,
  nombre     text not null default 'Rutina',
  dias       jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (alumno_id)
);

create table if not exists gym_rutina_logs (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  alumno_id        uuid not null references gym_alumnos(id) on delete cascade,
  ejercicio_id     text not null,   -- id del ejercicio dentro del jsonb de la rutina
  ejercicio_nombre text,            -- snapshot del nombre (por si cambia la rutina)
  fecha            date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  peso             text,            -- lo que hizo (libre: "40", "40kg")
  reps             text,
  nota             text,
  created_at       timestamptz not null default now()
);
create index if not exists gym_rutina_logs_idx
  on gym_rutina_logs (alumno_id, ejercicio_id, fecha desc);

-- RLS ------------------------------------------------------------------------
alter table gym_rutinas enable row level security;
alter table gym_rutina_logs enable row level security;

-- Staff del gym (owner / profesional / gym_admin): arma y ve todo del tenant.
drop policy if exists "staff_gym_rutinas" on gym_rutinas;
create policy "staff_gym_rutinas" on gym_rutinas
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and public.jwt_es_gym_staff()
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and public.jwt_es_gym_staff()
  );

drop policy if exists "staff_gym_rutina_logs" on gym_rutina_logs;
create policy "staff_gym_rutina_logs" on gym_rutina_logs
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and public.jwt_es_gym_staff()
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and public.jwt_es_gym_staff()
  );

-- El alumno lee su propia rutina y sus propios logs (los inserta por API con
-- el service client, pero igual dejamos la lectura por RLS por si se usa el
-- cliente de sesión).
drop policy if exists "alumno_lee_su_rutina" on gym_rutinas;
create policy "alumno_lee_su_rutina" on gym_rutinas
  for select to authenticated
  using (
    alumno_id in (select id from gym_alumnos where auth_user_id = (select auth.uid()))
  );

drop policy if exists "alumno_sus_logs" on gym_rutina_logs;
create policy "alumno_sus_logs" on gym_rutina_logs
  for select to authenticated
  using (
    alumno_id in (select id from gym_alumnos where auth_user_id = (select auth.uid()))
  );
