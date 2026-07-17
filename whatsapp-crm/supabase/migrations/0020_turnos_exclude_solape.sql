-- ============================================================
-- Prevención de doble reserva, garantizada por la base.
--
-- Va en su propia migración y no dentro de 0019 a propósito: esta
-- es la única que puede FALLAR por datos preexistentes. Si en la
-- base ya hay dos turnos del mismo profesional que se pisan, el
-- ALTER aborta y hay que limpiarlos primero.
--
-- ANTES de correr esto:
--   1. `supabase/diagnostico_tz_turnos.sql` pasos 1-3 (fechas corridas
--      por el bug de TZ). Validar solapamientos sobre fechas mal
--      guardadas no dice nada.
--   2. `supabase/diagnostico_tz_turnos.sql` paso 4 -> tiene que dar 0 filas.
--   3. La migración 0019 (crea la columna `rango`).
-- ============================================================

-- Una EXCLUDE necesita gist. Los operadores de rango (&&) ya vienen en
-- gist, pero la igualdad de uuid (tenant_id, profesional_id) no: eso lo
-- aporta btree_gist. Sin esta extensión el ALTER de abajo falla con
-- "data type uuid has no default operator class for access method gist".
create extension if not exists btree_gist;

-- ------------------------------------------------------------
-- turnos_sin_solape
--
-- Dos turnos del MISMO profesional no pueden compartir ni un minuto.
-- No alcanza con validarlo en la app: dos reservas simultáneas leen
-- "libre" las dos y las dos escriben. Acá la segunda muere con 23P01
-- (exclusion_violation), que /api/reservas traduce a "ese horario se
-- acaba de ocupar".
--
-- El WHERE define qué es "ocupar":
--   · estado <> 'cancelado'    -> un turno cancelado libera el horario.
--   · profesional_id not null  -> los turnos que crea la IA por WhatsApp
--     entran sin profesional (hay 3, getProfesionalUnico() ya no auto-
--     asigna). Un turno sin asignar no le bloquea la agenda a nadie; la
--     constraint recién lo valida cuando el staff le asigna profesional,
--     que es exactamente el momento correcto.
--
-- tenant_id va en la constraint aunque hoy haya un solo cliente: cuando
-- entre el segundo, sigue siendo correcta sin tocar el schema.
-- ------------------------------------------------------------
-- El rango va como EXPRESIÓN, no como columna: tstzrange(fecha_hora,
-- fecha_fin, '[)') es inmutable porque ambos son columnas planas (fecha_fin
-- la precalcula el trigger de 0019). Escribir fecha_hora + interval acá
-- fallaría — ese operador es STABLE y un índice exige inmutabilidad.
alter table turnos drop constraint if exists turnos_sin_solape;
alter table turnos add constraint turnos_sin_solape
  exclude using gist (
    tenant_id      with =,
    profesional_id with =,
    tstzrange(fecha_hora, fecha_fin, '[)') with &&
  )
  where (estado <> 'cancelado' and profesional_id is not null);

-- El índice gist que crea la constraint también acelera el chequeo de
-- solapamiento de slots_disponibles(), así que no hace falta uno aparte.
