-- ============================================================
-- Web Push: suscripciones del navegador por agente (Nivel 2).
-- No modifica migraciones previas.
-- ============================================================
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid references agents(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

-- El agente gestiona solo sus propias suscripciones.
-- (El servidor envía los push con la service-role key, que saltea RLS.)
create policy "own_push_subscriptions" on push_subscriptions
  for all to authenticated
  using (agent_id in (select id from agents where auth_user_id = auth.uid()))
  with check (agent_id in (select id from agents where auth_user_id = auth.uid()));
