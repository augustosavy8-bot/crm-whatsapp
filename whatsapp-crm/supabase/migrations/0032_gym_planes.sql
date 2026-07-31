-- ============================================================
-- Planes del gimnasio con precio (cuota variable según días/semana).
--
-- La cuota no es un monto fijo (env MP_CUOTA_MONTO): cada socio tiene un plan,
-- y el débito automático usa el precio del plan. El admin gestiona los precios
-- desde el panel; al cambiar un precio se actualiza también el débito de los
-- socios ya adheridos (lo hace la app vía la API de MercadoPago).
--
-- Correr DESPUÉS de 0031.
-- ============================================================

create table if not exists gym_planes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  nombre      text not null,
  dias_semana integer,                      -- null = libre / sin límite
  precio      integer not null default 0,   -- pesos ARS, sin centavos
  activo      boolean not null default true,
  orden       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Cada socio pertenece a un plan (null = sin plan asignado todavía).
alter table gym_alumnos
  add column if not exists plan_id uuid references gym_planes(id) on delete set null;

alter table gym_planes enable row level security;

-- Staff del gym administra los planes (mismo gate que el resto, helper de 0029).
drop policy if exists "admin_gym_planes" on gym_planes;
create policy "admin_gym_planes" on gym_planes
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and public.jwt_es_gym_staff()
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and public.jwt_es_gym_staff()
  );

-- Lectura para cualquier usuario del tenant: el alumno puede ver su plan y el
-- precio en su panel. Los precios no son sensibles.
drop policy if exists "read_gym_planes" on gym_planes;
create policy "read_gym_planes" on gym_planes
  for select to authenticated
  using (tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid);
