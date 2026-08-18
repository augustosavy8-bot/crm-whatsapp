-- ============================================================
-- Índices en foreign keys del gimnasio que faltaban.
--
-- No mueven la aguja hoy (las tablas son chicas), pero son buena higiene:
-- aceleran los DELETE en cascada y quedan listos para cuando las tablas de
-- asistencia y registros de rutina crezcan.
--
-- Correr DESPUÉS de 0049.
-- ============================================================

create index if not exists gym_asistencias_horario_idx on gym_asistencias (horario_id);
create index if not exists gym_rutinas_tenant_idx      on gym_rutinas (tenant_id);
create index if not exists gym_rutina_logs_tenant_idx  on gym_rutina_logs (tenant_id);
create index if not exists gym_planes_tenant_idx       on gym_planes (tenant_id);
create index if not exists gym_horarios_prof_idx       on gym_horarios (profesional_id);
create index if not exists push_subscriptions_agent_idx on push_subscriptions (agent_id);
