alter table tenants add column if not exists ia_autorespuesta_activa boolean not null default false;
alter table contacts add column if not exists modo_atencion text not null default 'ia'
  check (modo_atencion in ('ia','humano'));
alter table contacts add column if not exists ia_respuestas_consecutivas int not null default 0;
alter table messages add column if not exists is_bot boolean not null default false;

-- Prender ya en el tenant piloto (pedido explícito).
update tenants set ia_autorespuesta_activa = true
  where whatsapp_phone_number_id = '1206741565856408';
