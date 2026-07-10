-- La vista conversation_list se define con una lista explícita de columnas
-- (no contacts.*), así que las columnas nuevas de 0017 nunca llegaban al
-- inbox: el toggle IA/humano se veía revertir solo al refrescar. Se agregan
-- al final del select para no romper el orden posicional existente.
create or replace view conversation_list
with (security_invoker = on) as
select c.id,
    c.phone_number,
    c.wa_id,
    c.name,
    c.tags,
    c.status,
    c.notes,
    c.assigned_agent_id,
    c.last_message_at,
    c.last_inbound_at,
    c.unread_count,
    c.tenant_id as client_id,
    c.created_at,
    c.updated_at,
    c.channel,
    c.external_id,
    c.username,
    m.body as last_message_body,
    m.type as last_message_type,
    m.direction as last_message_direction,
    m.created_at as last_message_created_at,
    c.modo_atencion,
    c.ia_respuestas_consecutivas
from contacts c
left join lateral (
  select messages.body, messages.type, messages.direction, messages.created_at
  from messages
  where messages.contact_id = c.id
  order by messages.created_at desc
  limit 1
) m on true;
