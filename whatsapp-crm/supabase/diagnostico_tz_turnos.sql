-- ============================================================
-- DIAGNÓSTICO (no es una migración — no aplica cambios solo)
--
-- Contexto: hasta el fix de `src/lib/tz.ts`, turnosIA.ts hacía
--   new Date(`${fecha}T${hora}:00`).toISOString()
-- sin offset. Eso se parsea en la zona del RUNTIME:
--   · en Vercel (UTC)        -> guardó 3hs ANTES de lo pedido
--   · en `npm run dev` (AR)  -> guardó bien
-- Los turnos de origen 'manual' / 'ia_manual' los inserta el
-- BROWSER (TurnoForm) y están bien.
--
-- Por eso NO hay un UPDATE masivo seguro: corregiría los de
-- Vercel y rompería los que ya están bien. Hay que mirar.
--
-- Orden: 1) PASO 1 y 2 -> 2) PASO 3 (repair) -> 3) PASO 4
--        -> recién ahí la migración 0020 (EXCLUDE).
-- ============================================================


-- ------------------------------------------------------------
-- PASO 1 — Panorama: cuántos turnos hay y de qué origen.
-- Solo 'ia_whatsapp' es sospechoso.
-- ------------------------------------------------------------
select
  origen,
  count(*)                                   as total,
  count(*) filter (where estado = 'cancelado') as cancelados,
  min(created_at)                            as primero,
  max(created_at)                            as ultimo
from turnos
group by origen
order by origen;


-- ------------------------------------------------------------
-- PASO 2 — El diagnóstico en sí.
--
-- Para cada turno creado por la IA, muestra las DOS lecturas
-- posibles en hora de Buenos Aires, al lado del mensaje original
-- del paciente. Leé `mensaje_original` ("...el jueves a las 15")
-- y fijate qué columna coincide:
--
--   · coincide `hora_guardada`  -> está BIEN (se creó en local). No tocar.
--   · coincide `hora_si_corrijo` -> está MAL (se creó en Vercel). Anotá el id.
--
-- `hora_si_corrijo` = lo guardado + 3hs, que es lo que la IA quiso decir.
-- ------------------------------------------------------------
select
  t.id,
  t.estado,
  t.created_at at time zone 'America/Argentina/Buenos_Aires'  as creado_ar,
  to_char(
    t.fecha_hora at time zone 'America/Argentina/Buenos_Aires',
    'DD/MM/YYYY HH24:MI'
  )                                                           as hora_guardada,
  to_char(
    (t.fecha_hora + interval '3 hours') at time zone 'America/Argentina/Buenos_Aires',
    'DD/MM/YYYY HH24:MI'
  )                                                           as hora_si_corrijo,
  p.nombre                                                    as paciente,
  t.ia_confianza,
  left(regexp_replace(coalesce(t.ia_notas_originales, ''), '\s+', ' ', 'g'), 160)
                                                              as mensaje_original
from turnos t
left join pacientes p on p.id = t.paciente_id
where t.origen = 'ia_whatsapp'
order by t.created_at desc;


-- ------------------------------------------------------------
-- PASO 3 — Repair. NO correr tal cual: completá los ids del
-- PASO 2 que estén mal (los que coinciden con `hora_si_corrijo`).
--
-- Deliberadamente por lista explícita de ids y no por un WHERE
-- amplio: no existe ninguna condición que separe con certeza los
-- creados en Vercel de los creados en local. Vos ya los miraste.
--
-- Los turnos ya pasados podés dejarlos como están (son historia,
-- corregirlos no cambia nada y `atendido`/`ausente` ya se decidió).
-- Lo que importa es lo que todavía no pasó.
-- ------------------------------------------------------------
-- begin;
--
-- update turnos
--    set fecha_hora = fecha_hora + interval '3 hours'
--  where id in (
--    -- '00000000-0000-0000-0000-000000000000',
--    -- '11111111-1111-1111-1111-111111111111'
--  );
--
-- -- Revisá el resultado ANTES del commit:
-- select id,
--        to_char(fecha_hora at time zone 'America/Argentina/Buenos_Aires',
--                'DD/MM/YYYY HH24:MI') as hora_ar
--   from turnos
--  where id in ( /* los mismos ids */ );
--
-- commit;   -- o `rollback;` si algo no cierra


-- ------------------------------------------------------------
-- PASO 4 — Pre-check de la EXCLUDE (correr DESPUÉS del repair).
--
-- La constraint `turnos_sin_solape` de la migración 0020 falla al
-- aplicarse si ya existen dos turnos del mismo profesional que se
-- pisan. Esto los lista para que los limpies antes.
--
-- Replica exactamente el predicado de la constraint: ignora los
-- cancelados y los que no tienen profesional asignado.
-- (usa fecha_hora + duracion_min directo porque fecha_fin todavía no
--  existe: esta query corre ANTES de la migración 0019.)
-- ------------------------------------------------------------
select
  a.id                                as turno_a,
  b.id                                as turno_b,
  ag.name                             as profesional,
  to_char(a.fecha_hora at time zone 'America/Argentina/Buenos_Aires',
          'DD/MM/YYYY HH24:MI')       as a_desde,
  a.duracion_min                      as a_dur,
  to_char(b.fecha_hora at time zone 'America/Argentina/Buenos_Aires',
          'DD/MM/YYYY HH24:MI')       as b_desde,
  b.duracion_min                      as b_dur,
  a.origen                            as a_origen,
  b.origen                            as b_origen
from turnos a
join turnos b
  on  b.id            >  a.id                 -- cada par una sola vez
  and b.tenant_id      = a.tenant_id
  and b.profesional_id = a.profesional_id
  and tstzrange(a.fecha_hora, a.fecha_hora + make_interval(mins => a.duracion_min), '[)')
   && tstzrange(b.fecha_hora, b.fecha_hora + make_interval(mins => b.duracion_min), '[)')
left join agents ag on ag.id = a.profesional_id
where a.profesional_id is not null
  and a.estado <> 'cancelado'
  and b.estado <> 'cancelado'
order by a.fecha_hora;

-- Si el PASO 4 devuelve 0 filas -> vía libre para la migración 0020.
