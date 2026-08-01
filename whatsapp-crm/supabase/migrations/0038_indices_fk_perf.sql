-- ============================================================
-- Perf #4 — Índices sobre foreign keys que crecen (Postgres NO los crea solo).
--
-- Los caminos calientes ya están indexados (turnos por fecha, gym por horario,
-- historias/turnos por paciente, messages por contacto). Esto cubre las FKs sin
-- índice de las tablas que van a crecer, para que no haya seq-scans ni cascades
-- lentas cuando el volumen suba. Barato ahora (tablas casi vacías), caro después.
--
-- Se omiten a propósito las FKs de tablas chicas/estáticas (gym_planes,
-- servicios, gym_horarios, push_subscriptions.agent_id): no crecen y el índice
-- solo sumaría costo de escritura.
-- ============================================================

-- turnos: sirve la agenda del profesional (RLS filtra profesional_id + rango de
-- fecha) y la FK profesional_id -> agents. El (tenant_id, fecha_hora) ya existe
-- para el owner; este cubre al profesional.
create index if not exists turnos_prof_fecha_idx
  on public.turnos (profesional_id, fecha_hora);

-- historias_clinicas: la RLS de B2 filtra por profesional_id; la tabla crece
-- (una nota por sesión).
create index if not exists historias_profesional_idx
  on public.historias_clinicas (profesional_id);

-- gym_reservas_sueltas / gym_turnos_fijos: FK tenant_id + filtro de RLS por
-- tenant; crecen con cada reserva.
create index if not exists gym_reservas_sueltas_tenant_idx
  on public.gym_reservas_sueltas (tenant_id);
create index if not exists gym_turnos_fijos_tenant_idx
  on public.gym_turnos_fijos (tenant_id);

-- gym_alumnos: FK plan_id -> gym_planes (join del padrón de socios).
create index if not exists gym_alumnos_plan_idx
  on public.gym_alumnos (plan_id);
