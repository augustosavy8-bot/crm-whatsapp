-- ============================================================
-- Vista para la lista de conversaciones del Inbox (Fase 2).
-- Junta cada contacto con su último mensaje (preview + hora + dirección).
-- security_invoker = on  -> respeta el RLS de contacts/messages con la sesión
-- del usuario que consulta (no hace falta policy propia de la vista).
-- No modifica el webhook ni las tablas: es solo lectura derivada.
-- ============================================================
create or replace view conversation_list with (security_invoker = on) as
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
