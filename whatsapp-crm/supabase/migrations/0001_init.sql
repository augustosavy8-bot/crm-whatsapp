-- ============================================================
-- WhatsApp CRM · schema inicial
-- Pegar en el SQL Editor del proyecto Supabase (nuevo/dedicado).
-- Orden: agents -> contacts -> messages -> templates (por las FKs).
-- ============================================================

-- ------------------------------------------------------------
-- agents (1:1 con auth.users)
-- ------------------------------------------------------------
create table if not exists agents (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  name         text,
  email        text,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- contacts
-- ------------------------------------------------------------
create table if not exists contacts (
  id                uuid primary key default gen_random_uuid(),
  phone_number      text not null unique,        -- E.164 sin '+', ej 549341...
  wa_id             text,                         -- id que devuelve Meta (suele = phone)
  name              text,
  tags              text[] not null default '{}',
  status            text not null default 'abierta'
                      check (status in ('abierta','en_proceso','resuelta')),
  notes             text,
  assigned_agent_id uuid references agents(id) on delete set null,
  last_message_at   timestamptz,                  -- ordena el inbox
  last_inbound_at   timestamptz,                  -- base de la ventana de 24hs
  unread_count      int not null default 0,
  client_id         uuid,                         -- reservado multi-tenant (single por ahora)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists contacts_last_message_idx on contacts (last_message_at desc);
create index if not exists contacts_status_idx       on contacts (status);
create index if not exists contacts_tags_idx         on contacts using gin (tags);

-- ------------------------------------------------------------
-- messages
-- ------------------------------------------------------------
create table if not exists messages (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null references contacts(id) on delete cascade,
  wa_message_id text unique,                      -- wamid... (dedup + update de status)
  direction     text not null check (direction in ('inbound','outbound')),
  type          text not null default 'text',     -- text/image/document/audio/template/...
  body          text,                             -- texto o caption
  media_url     text,
  template_name text,
  status        text,                             -- outbound: queued/sent/delivered/read/failed
  error         text,
  raw_payload   jsonb,
  sent_by       uuid references agents(id) on delete set null,
  client_id     uuid,
  created_at    timestamptz not null default now()
);
create index if not exists messages_contact_created_idx on messages (contact_id, created_at);

-- ------------------------------------------------------------
-- templates
-- ------------------------------------------------------------
create table if not exists templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  language   text not null default 'es',
  category   text,
  body       text,
  variables  jsonb not null default '[]',
  approved   boolean not null default false,
  client_id  uuid,
  created_at timestamptz not null default now(),
  unique (name, language)
);

-- ------------------------------------------------------------
-- RLS: habilitado en las 4 tablas.
-- Policy MVP: cualquier usuario autenticado (agente) tiene acceso total.
-- El webhook y el envío escriben con service-role key => saltean RLS (no necesitan policy).
-- >>> AL CRECER: scopear por client_id y/o assigned_agent_id en vez de using(true). <<<
-- ------------------------------------------------------------
alter table agents    enable row level security;
alter table contacts  enable row level security;
alter table messages  enable row level security;
alter table templates enable row level security;

create policy "auth_all_agents"    on agents    for all to authenticated using (true) with check (true);
create policy "auth_all_contacts"  on contacts  for all to authenticated using (true) with check (true);
create policy "auth_all_messages"  on messages  for all to authenticated using (true) with check (true);
create policy "auth_all_templates" on templates for all to authenticated using (true) with check (true);
