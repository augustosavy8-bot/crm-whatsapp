-- ============================================================
-- Consolidación (one-time) de socios duplicados.
--
-- Causa: al agregar gente a mano sin teléfono, gym_upsert_alumno insertaba una
-- ficha nueva cada vez (sin teléfono no podía deduplicar). Cada alta repetida
-- de la misma persona creaba otra ficha "No socio".
--
-- Se elige una ficha canónica por (tenant, nombre normalizado) — prioriza
-- teléfono > cuenta > es_socio > más antigua — se le mudan los fijos/sueltas
-- (con dedup) y el estado de socio/cuota, y se borran las duplicadas SIN
-- teléfono (defensivo: no fusiona dos personas distintas que sí tengan número).
-- Las asistencias/cuotas históricas de los dupes se pierden (bajo valor).
--
-- La prevención (dedup por nombre) va en 0053.
-- ============================================================

create temp table _canon as
select tenant_id, lower(trim(nombre)) as nn,
  (array_agg(id order by (telefono is not null) desc, (auth_user_id is not null) desc, es_socio desc, created_at asc))[1] as canon_id,
  bool_or(es_socio) as any_socio,
  max(cuota_hasta) as max_cuota
from gym_alumnos
group by tenant_id, lower(trim(nombre));

create temp table _merge as
select a.id as dupe_id, c.canon_id
from gym_alumnos a
join _canon c on c.tenant_id = a.tenant_id and c.nn = lower(trim(a.nombre))
where a.id <> c.canon_id
  and a.telefono is null;

update gym_turnos_fijos    f set alumno_id = m.canon_id from _merge m where f.alumno_id = m.dupe_id;
update gym_reservas_sueltas s set alumno_id = m.canon_id from _merge m where s.alumno_id = m.dupe_id;
update gym_pagos           p set alumno_id = m.canon_id from _merge m where p.alumno_id = m.dupe_id;
update gym_rutina_logs     l set alumno_id = m.canon_id from _merge m where l.alumno_id = m.dupe_id;
update push_subscriptions  x set alumno_id = m.canon_id from _merge m where x.alumno_id = m.dupe_id;

update gym_rutinas r set alumno_id = m.canon_id
from _merge m
where r.alumno_id = m.dupe_id
  and not exists (select 1 from gym_rutinas r2 where r2.alumno_id = m.canon_id);

delete from gym_turnos_fijos f
where f.activo and f.estado <> 'rechazado'
  and f.id::text <> (
    select min(g.id::text) from gym_turnos_fijos g
     where g.alumno_id = f.alumno_id and g.horario_id = f.horario_id
       and g.activo and g.estado <> 'rechazado'
  );

delete from gym_reservas_sueltas s
where s.estado in ('pendiente','confirmada')
  and s.id::text <> (
    select min(t.id::text) from gym_reservas_sueltas t
     where t.alumno_id = s.alumno_id and t.horario_id = s.horario_id and t.fecha = s.fecha
       and t.estado in ('pendiente','confirmada')
  );

update gym_alumnos a set
  es_socio    = (a.es_socio or c.any_socio),
  cuota_hasta = greatest(a.cuota_hasta, c.max_cuota)
from _canon c
where a.id = c.canon_id;

delete from gym_alumnos a using _merge m where a.id = m.dupe_id;

drop table _canon;
drop table _merge;
