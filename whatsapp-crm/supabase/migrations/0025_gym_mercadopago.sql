-- ============================================================
-- Fase 2 (andamiaje): débito automático de la cuota por MercadoPago.
-- Solo agrega dónde guardar la suscripción del socio. La lógica vive en
-- src/lib/mercadopago.ts + /api/gym/mp/*. Todo degrada con elegancia si no
-- hay credenciales MP (env vars) cargadas todavía.
--
-- Correr DESPUÉS de 0024.
-- ============================================================

-- id de la suscripción (preapproval) de MercadoPago y su estado. null = el
-- socio no adhirió al débito automático (paga en efectivo / manual).
alter table gym_alumnos add column if not exists mp_preapproval_id text;
-- Espeja el status de MP: pending / authorized / paused / cancelled.
alter table gym_alumnos add column if not exists mp_estado text;

create index if not exists gym_alumnos_mp_idx
  on gym_alumnos (mp_preapproval_id) where mp_preapproval_id is not null;
