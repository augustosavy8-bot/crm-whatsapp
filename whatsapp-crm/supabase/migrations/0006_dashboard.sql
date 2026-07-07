-- ============================================================
-- Vistas para el Home Dashboard (solo lectura, agregados).
-- security_invoker = on  -> respetan el RLS de contacts/messages con la
-- sesión del agente logueado. No modifican migraciones previas.
-- ============================================================

-- Resumen por canal (una fila por canal, aunque esté en 0).
drop view if exists channel_stats;
create view channel_stats with (security_invoker = on) as
select
  ch.channel,
  (select count(*) from contacts c where c.channel = ch.channel)
    as total_conversations,
  (select count(*) from contacts c
     where c.channel = ch.channel and c.status <> 'resuelta')
    as open_conversations,
  (select coalesce(sum(c.unread_count), 0) from contacts c
     where c.channel = ch.channel)
    as unread_total,
  (select count(*) from messages m
     where m.channel = ch.channel and m.direction = 'inbound'
       and m.created_at >= now() - interval '24 hours')
    as inbound_24h
from (values ('whatsapp'), ('instagram'), ('facebook')) as ch(channel);

-- Serie diaria de mensajes ENTRANTES de los últimos 14 días, por canal.
drop view if exists messages_daily;
create view messages_daily with (security_invoker = on) as
select
  (created_at at time zone 'America/Argentina/Buenos_Aires')::date as day,
  channel,
  count(*) as inbound
from messages
where direction = 'inbound'
  and created_at >= now() - interval '14 days'
group by 1, 2;
