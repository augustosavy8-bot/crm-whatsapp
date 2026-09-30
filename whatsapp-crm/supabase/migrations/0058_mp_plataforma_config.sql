-- ============================================================
-- Fase 2: configuración de la comisión de plataforma (marketplace_fee).
-- Fila única (id = true), global, editable solo por el superadmin (Fase 4).
--   - comision_pct: % que retiene la plataforma por cada cuota cobrada (default 3).
--   - quien_paga_comision: 'gym' (lo absorbe el gym, arrancamos con esto) o
--     'socio' (se le suma como "Gastos de servicio" al total que paga).
-- RLS sin policies: solo el service role la lee/escribe.
-- Correr DESPUÉS de 0057.
-- ============================================================

create table if not exists mp_plataforma_config (
  id                  boolean primary key default true check (id),
  comision_pct        numeric not null default 3
                      check (comision_pct >= 0 and comision_pct <= 100),
  quien_paga_comision text not null default 'gym'
                      check (quien_paga_comision in ('gym','socio')),
  updated_at          timestamptz not null default now()
);

insert into mp_plataforma_config (id) values (true) on conflict (id) do nothing;

alter table mp_plataforma_config enable row level security;
revoke all on table mp_plataforma_config from anon, authenticated;
grant all on table mp_plataforma_config to service_role;
