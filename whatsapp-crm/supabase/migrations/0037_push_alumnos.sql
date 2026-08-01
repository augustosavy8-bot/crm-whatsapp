-- ============================================================
-- Web Push para alumnos: notificación cuando el staff confirma su reserva.
--
-- push_subscriptions era solo de staff (agent_id). Se agrega alumno_id para
-- guardar la suscripción del alumno logueado. Una fila es de staff (agent_id)
-- o de alumno (alumno_id), nunca ambas.
--
-- Ojo: sendPushToTenant (avisos al staff) ahora filtra agent_id not null, y
-- sendPushToAlumno filtra por alumno_id — así los pushes no se cruzan.
-- ============================================================

alter table public.push_subscriptions
  add column if not exists alumno_id uuid
    references public.gym_alumnos(id) on delete cascade;

create index if not exists push_subscriptions_alumno_id_idx
  on public.push_subscriptions(alumno_id);
