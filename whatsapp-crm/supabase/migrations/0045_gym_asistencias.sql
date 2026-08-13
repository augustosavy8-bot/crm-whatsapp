-- ============================================================
-- Asistencia a las clases del gimnasio (presente / ausente).
--
-- La grilla de la agenda ya muestra quién está anotado cada día; el profe
-- pidió poder marcar, sobre esa misma lista, quién vino y quién no. Un
-- registro por (alumno, horario, fecha): se puede togglear sin duplicar.
--
-- Correr DESPUÉS de 0044.
-- ============================================================

create table if not exists gym_asistencias (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  alumno_id   uuid not null references gym_alumnos(id) on delete cascade,
  horario_id  uuid not null references gym_horarios(id) on delete cascade,
  fecha       date not null,
  estado      text not null check (estado in ('presente','ausente')),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (alumno_id, horario_id, fecha)
);
create index if not exists gym_asistencias_fecha_idx
  on gym_asistencias (tenant_id, fecha);

-- RLS: staff del gym (owner / profesional / gym_admin). Marcar asistencia es
-- parte de dar la clase, no es cobros.
alter table gym_asistencias enable row level security;

drop policy if exists "staff_gym_asistencias" on gym_asistencias;
create policy "staff_gym_asistencias" on gym_asistencias
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and public.jwt_es_gym_staff()
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and public.jwt_es_gym_staff()
  );
