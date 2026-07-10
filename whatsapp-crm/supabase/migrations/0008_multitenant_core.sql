-- ============================================================
-- Multi-tenant core: tenants + tenant_id en tablas existentes +
-- dominio clínico (pacientes/turnos/historias) + config dinámica
-- por rubro + RLS scoped por tenant.
-- Correr DESPUÉS de 0001..0007, en el SQL Editor del proyecto.
-- ============================================================

-- ------------------------------------------------------------
-- tenants
-- ------------------------------------------------------------
create table if not exists tenants (
  id                      uuid primary key default gen_random_uuid(),
  nombre                  text not null,
  rubro_slug              text not null default 'otro',
  status                  text not null default 'trialing'
                            check (status in ('trialing','active','paused','cancelled')),
  whatsapp_phone_number_id text unique,
  whatsapp_waba_id        text,
  messenger_page_id       text,
  instagram_business_id   text,
  created_at              timestamptz not null default now()
);

-- ------------------------------------------------------------
-- contacts / messages / templates: client_id -> tenant_id + FK
-- ------------------------------------------------------------
alter table contacts  rename column client_id to tenant_id;
alter table messages  rename column client_id to tenant_id;
alter table templates rename column client_id to tenant_id;

alter table contacts  add constraint contacts_tenant_fk  foreign key (tenant_id) references tenants(id);
alter table messages  add constraint messages_tenant_fk  foreign key (tenant_id) references tenants(id);
alter table templates add constraint templates_tenant_fk foreign key (tenant_id) references tenants(id);

create index if not exists contacts_tenant_idx  on contacts (tenant_id);
create index if not exists messages_tenant_idx  on messages (tenant_id);
create index if not exists templates_tenant_idx on templates (tenant_id);

-- ------------------------------------------------------------
-- agents: tenant_id + role
-- ------------------------------------------------------------
alter table agents add column if not exists tenant_id uuid references tenants(id);
alter table agents add column if not exists role text not null default 'profesional'
  check (role in ('owner','profesional','secretaria'));
create index if not exists agents_tenant_idx on agents (tenant_id);

-- ------------------------------------------------------------
-- Constraints scoped por tenant (reemplazan las globales)
-- ------------------------------------------------------------
drop index if exists contacts_channel_external_idx;
create unique index contacts_tenant_channel_external_idx
  on contacts (tenant_id, channel, external_id) where external_id is not null;

alter table contacts drop constraint if exists contacts_phone_number_key;
create unique index contacts_tenant_phone_idx
  on contacts (tenant_id, phone_number) where phone_number is not null;

-- ------------------------------------------------------------
-- push_subscriptions: tenant_id (para filtrar el envío)
-- ------------------------------------------------------------
alter table push_subscriptions add column if not exists tenant_id uuid references tenants(id);
create index if not exists push_subscriptions_tenant_idx on push_subscriptions (tenant_id);

-- ------------------------------------------------------------
-- Config dinámica por rubro
-- ------------------------------------------------------------
create table if not exists vertical_config (
  slug       text primary key,
  nombre     text not null,
  config     jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists campos_config (
  id            uuid primary key default gen_random_uuid(),
  vertical_slug text not null references vertical_config(slug),
  tenant_id     uuid references tenants(id), -- null = default del rubro; not null = override del tenant
  entidad       text not null check (entidad in ('paciente','turno','historia_clinica')),
  campo         text not null,
  tipo          text not null default 'text' check (tipo in ('text','number','select','date','boolean','textarea')),
  etiqueta      text not null,
  opciones      jsonb not null default '[]',
  obligatorio   boolean not null default false,
  orden         int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists campos_config_lookup_idx on campos_config (vertical_slug, tenant_id, entidad);

create table if not exists tenants_modulos (
  tenant_id  uuid not null references tenants(id) on delete cascade,
  modulo     text not null,
  habilitado boolean not null default true,
  primary key (tenant_id, modulo)
);

-- ------------------------------------------------------------
-- Dominio clínico
-- ------------------------------------------------------------
create table if not exists pacientes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  contact_id  uuid references contacts(id) on delete set null,
  nombre      text not null,
  dni         text,
  telefono    text,
  email       text,
  obra_social text,
  datos       jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists pacientes_tenant_idx on pacientes (tenant_id);
create index if not exists pacientes_contact_idx on pacientes (contact_id);

create table if not exists turnos (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id),
  paciente_id           uuid not null references pacientes(id) on delete cascade,
  profesional_id        uuid references agents(id) on delete set null,
  fecha_hora            timestamptz not null,
  duracion_min          int not null default 30,
  estado                text not null default 'pendiente'
                          check (estado in ('pendiente','confirmado','cancelado','atendido','ausente')),
  notas                 text,
  recordatorio_enviado_at timestamptz,
  created_at            timestamptz not null default now()
);
create index if not exists turnos_tenant_fecha_idx on turnos (tenant_id, fecha_hora);
create index if not exists turnos_paciente_idx on turnos (paciente_id);

create table if not exists historias_clinicas (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id),
  paciente_id    uuid not null references pacientes(id) on delete cascade,
  profesional_id uuid references agents(id) on delete set null,
  fecha          timestamptz not null default now(),
  datos          jsonb not null default '{}',
  created_at     timestamptz not null default now()
);
create index if not exists historias_tenant_idx on historias_clinicas (tenant_id);
create index if not exists historias_paciente_idx on historias_clinicas (paciente_id);

-- ------------------------------------------------------------
-- RLS: scoped por tenant vía subquery sobre agents.
-- (Interino hasta migrar a JWT custom claims en el paso de Auth.)
-- ------------------------------------------------------------
drop policy if exists "auth_all_agents"    on agents;
drop policy if exists "auth_all_contacts"  on contacts;
drop policy if exists "auth_all_messages"  on messages;
drop policy if exists "auth_all_templates" on templates;

create policy "tenant_agents" on agents
  for all to authenticated
  using (tenant_id = (select tenant_id from agents where auth_user_id = auth.uid()))
  with check (tenant_id = (select tenant_id from agents where auth_user_id = auth.uid()));

create policy "tenant_contacts" on contacts
  for all to authenticated
  using (tenant_id = (select tenant_id from agents where auth_user_id = auth.uid()))
  with check (tenant_id = (select tenant_id from agents where auth_user_id = auth.uid()));

create policy "tenant_messages" on messages
  for all to authenticated
  using (tenant_id = (select tenant_id from agents where auth_user_id = auth.uid()))
  with check (tenant_id = (select tenant_id from agents where auth_user_id = auth.uid()));

create policy "tenant_templates" on templates
  for all to authenticated
  using (tenant_id = (select tenant_id from agents where auth_user_id = auth.uid()))
  with check (tenant_id = (select tenant_id from agents where auth_user_id = auth.uid()));

alter table pacientes         enable row level security;
alter table turnos            enable row level security;
alter table historias_clinicas enable row level security;
alter table tenants_modulos   enable row level security;
alter table vertical_config   enable row level security;
alter table campos_config     enable row level security;

create policy "tenant_pacientes" on pacientes
  for all to authenticated
  using (tenant_id = (select tenant_id from agents where auth_user_id = auth.uid()))
  with check (tenant_id = (select tenant_id from agents where auth_user_id = auth.uid()));

create policy "tenant_turnos" on turnos
  for all to authenticated
  using (tenant_id = (select tenant_id from agents where auth_user_id = auth.uid()))
  with check (tenant_id = (select tenant_id from agents where auth_user_id = auth.uid()));

create policy "tenant_historias" on historias_clinicas
  for all to authenticated
  using (tenant_id = (select tenant_id from agents where auth_user_id = auth.uid()))
  with check (tenant_id = (select tenant_id from agents where auth_user_id = auth.uid()));

create policy "tenant_modulos" on tenants_modulos
  for all to authenticated
  using (tenant_id = (select tenant_id from agents where auth_user_id = auth.uid()))
  with check (tenant_id = (select tenant_id from agents where auth_user_id = auth.uid()));

-- vertical_config / campos_config: catálogo compartido, lectura para cualquier
-- autenticado. Los overrides de campos_config con tenant_id propio también
-- son legibles por cualquiera (no tienen datos sensibles), solo el default
-- de la app los administra vía service-role.
create policy "read_vertical_config" on vertical_config
  for select to authenticated using (true);

create policy "read_campos_config" on campos_config
  for select to authenticated using (true);

-- push_subscriptions ya tenía RLS + policy propia (own_push_subscriptions),
-- no se toca: sigue scopeada por agent_id.

-- ------------------------------------------------------------
-- Seed: catálogo mínimo de rubros
-- ------------------------------------------------------------
insert into vertical_config (slug, nombre, config) values
  ('kinesiologia', 'Kinesiología', '{}'),
  ('nutricion',    'Nutrición',    '{}'),
  ('odontologia',  'Odontología',  '{}'),
  ('otro',         'Otro',         '{}')
on conflict (slug) do nothing;

-- ------------------------------------------------------------
-- Seed: tenant piloto con el número de WhatsApp ya conectado, y
-- migración de los agents/contacts/messages/templates existentes
-- a ese tenant (backfill para no romper el flujo funcionando).
-- Ajustar whatsapp_waba_id si difiere de lo actual en .env.local.
-- ------------------------------------------------------------
do $$
declare
  pilot_tenant_id uuid;
begin
  insert into tenants (nombre, rubro_slug, status, whatsapp_phone_number_id, whatsapp_waba_id)
  values ('Tenant piloto', 'otro', 'active', '1206741565856408', '998828606261594')
  on conflict (whatsapp_phone_number_id) do update set nombre = excluded.nombre
  returning id into pilot_tenant_id;

  update agents    set tenant_id = pilot_tenant_id where tenant_id is null;
  update contacts  set tenant_id = pilot_tenant_id where tenant_id is null;
  update messages  set tenant_id = pilot_tenant_id where tenant_id is null;
  update templates set tenant_id = pilot_tenant_id where tenant_id is null;
  update push_subscriptions set tenant_id = pilot_tenant_id
    where tenant_id is null;
end $$;
