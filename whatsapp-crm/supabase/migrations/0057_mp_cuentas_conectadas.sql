-- ============================================================
-- Fase 1 de la conversión a marketplace: conexión OAuth de Mercado Pago por
-- gimnasio (tenant).
--
--   - mp_cuentas_conectadas: la cuenta de MP del gym conectada por OAuth. Los
--     tokens se guardan ENCRIPTADOS a nivel app (AES-256-GCM, clave en
--     MP_TOKEN_ENC_KEY); acá solo viven como texto cifrado.
--   - mp_oauth_states: el `state` anti-CSRF (de un solo uso) y el code_verifier
--     del PKCE mientras dura el ida y vuelta del OAuth. Efímero (10 min).
--
-- Las dos tablas tienen RLS activada y SIN policies: nadie con sesión (anon /
-- authenticated) las lee o escribe. Solo el service role (servidor) accede; el
-- panel ve un estado seguro (sin tokens) a través de un endpoint server-side.
-- Correr DESPUÉS de 0056.
-- ============================================================

create table if not exists mp_cuentas_conectadas (
  tenant_id         uuid primary key references tenants(id) on delete cascade,
  mp_user_id        text not null,
  access_token_enc  text,
  refresh_token_enc text,
  public_key        text,
  scope             text,
  expires_at        timestamptz,
  estado            text not null default 'conectada'
                    check (estado in ('conectada','por_vencer','desconectada','error')),
  last_error        text,
  connected_by      uuid,
  connected_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table mp_cuentas_conectadas enable row level security;
revoke all on table mp_cuentas_conectadas from anon, authenticated;
grant all on table mp_cuentas_conectadas to service_role;

create table if not exists mp_oauth_states (
  state         text primary key,
  tenant_id     uuid not null,
  code_verifier text not null,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  used_at       timestamptz
);
create index if not exists idx_mp_oauth_states_expira on mp_oauth_states (expires_at);

alter table mp_oauth_states enable row level security;
revoke all on table mp_oauth_states from anon, authenticated;
grant all on table mp_oauth_states to service_role;
