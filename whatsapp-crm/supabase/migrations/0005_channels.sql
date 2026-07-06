-- ============================================================
-- Multicanal: WhatsApp + Instagram DMs + Facebook Messenger.
-- Generaliza contactos para soportar identificadores que NO son teléfono
-- (PSID/IGSID) sin romper el flujo de WhatsApp existente.
-- NO modifica migraciones previas. Correr en el SQL Editor.
-- ============================================================

-- --- contacts: canal + identificador genérico + username; teléfono nullable ---
alter table contacts
  add column if not exists channel text not null default 'whatsapp'
    check (channel in ('whatsapp','instagram','facebook'));
alter table contacts add column if not exists external_id text;
alter table contacts add column if not exists username text;

-- Los contactos de IG/Messenger no tienen teléfono.
alter table contacts alter column phone_number drop not null;

-- Backfill: las filas WhatsApp existentes usan su teléfono como external_id.
update contacts set external_id = phone_number where external_id is null;

-- --- messages: canal (default whatsapp backfillea las existentes) ---
alter table messages
  add column if not exists channel text not null default 'whatsapp'
    check (channel in ('whatsapp','instagram','facebook'));

-- --- Trigger: mantiene external_id = phone_number para inserts de WhatsApp ---
-- Así el ingest de WhatsApp NO necesita modificarse y sus contactos nuevos
-- quedan consistentes. El ingest de Messenger setea external_id (PSID/IGSID).
create or replace function contacts_default_external_id() returns trigger
language plpgsql as $$
begin
  if new.external_id is null and new.phone_number is not null then
    new.external_id := new.phone_number;
  end if;
  return new;
end $$;

drop trigger if exists trg_contacts_default_external_id on contacts;
create trigger trg_contacts_default_external_id
  before insert on contacts
  for each row execute function contacts_default_external_id();

-- --- Dedup por canal: un contacto por (channel, external_id) ---
create unique index if not exists contacts_channel_external_idx
  on contacts (channel, external_id) where external_id is not null;

-- --- Recrear la vista para incluir las columnas nuevas (c.* fija columnas al crear) ---
drop view if exists conversation_list;
create view conversation_list with (security_invoker = on) as
select
  c.*,
  m.body       as last_message_body,
  m.type       as last_message_type,
  m.direction  as last_message_direction,
  m.created_at as last_message_created_at
from contacts c
left join lateral (
  select body, type, direction, created_at
  from messages
  where contact_id = c.id
  order by created_at desc
  limit 1
) m on true;
