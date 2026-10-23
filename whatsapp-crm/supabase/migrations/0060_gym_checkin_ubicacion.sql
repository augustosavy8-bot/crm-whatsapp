-- ============================================================
-- Anti-trampa del check-in por geolocalización: el socio solo puede marcar
-- asistencia si está cerca del gimnasio. Se guarda la ubicación del gym
-- (lat/lng) y un radio en metros. Si no está configurada, el check-in no pide
-- ubicación (se comporta como antes).
--
-- RLS sin policies: solo el service role (servidor) accede; el panel la lee/
-- escribe a través de endpoints staff-gated. Correr DESPUÉS de 0059.
-- ============================================================

create table if not exists gym_checkin_config (
  tenant_id  uuid primary key references tenants(id) on delete cascade,
  lat        double precision,
  lng        double precision,
  radio_m    integer not null default 150,
  updated_at timestamptz not null default now()
);

alter table gym_checkin_config enable row level security;
revoke all on table gym_checkin_config from anon, authenticated;
grant all on table gym_checkin_config to service_role;
