-- ============================================================
-- B3 — Idempotencia del webhook de MercadoPago.
--
-- El webhook renovaba la cuota (+1 mes) cada vez que llegaba un "payment
-- approved". MP reintenta los webhooks, así que un mismo cobro podía extender
-- cuota_hasta varias veces. Se guarda el último payment id procesado por
-- alumno para saltear reprocesos del mismo cobro.
-- ============================================================

alter table public.gym_alumnos
  add column if not exists mp_last_payment_id text;

comment on column public.gym_alumnos.mp_last_payment_id is
  'Último payment id de MercadoPago procesado por el webhook (idempotencia).';
