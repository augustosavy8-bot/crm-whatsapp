-- ============================================================
-- Interpretación de turnos con IA: trazabilidad de qué turno
-- fue sugerido por la IA (WhatsApp o texto libre asistido) vs
-- cargado a mano, para poder marcarlo en la agenda.
-- ============================================================
alter table turnos add column if not exists origen text not null default 'manual'
  check (origen in ('manual','ia_whatsapp','ia_manual'));
alter table turnos add column if not exists ia_confianza text
  check (ia_confianza in ('alta','media','baja'));
alter table turnos add column if not exists ia_notas_originales text;
