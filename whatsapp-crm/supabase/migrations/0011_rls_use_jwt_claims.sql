-- ============================================================
-- Auth: JWT custom claims (Paso 2), parte 2/2.
-- Reemplaza el subquery interino de RLS (0008/0009) por el claim
-- `tenant_id` que ahora viaja en el JWT (hook de la 0010, ya
-- activado en el dashboard). Menos queries por policy check.
--
-- IMPORTANTE: las sesiones ya logueadas tienen un JWT viejo sin el
-- claim -> van a ver 0 filas hasta que hagan logout/login (o hasta
-- que el token se refresque solo). Es esperado, no es un bug.
-- ============================================================

drop policy if exists "tenant_agents"    on agents;
drop policy if exists "tenant_contacts"  on contacts;
drop policy if exists "tenant_messages"  on messages;
drop policy if exists "tenant_templates" on templates;
drop policy if exists "tenant_pacientes" on pacientes;
drop policy if exists "tenant_turnos"    on turnos;
drop policy if exists "tenant_historias" on historias_clinicas;
drop policy if exists "tenant_modulos"   on tenants_modulos;
drop policy if exists "read_own_tenant"  on tenants;

create policy "tenant_agents" on agents
  for all to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "tenant_contacts" on contacts
  for all to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "tenant_messages" on messages
  for all to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "tenant_templates" on templates
  for all to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "tenant_pacientes" on pacientes
  for all to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "tenant_turnos" on turnos
  for all to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "tenant_historias" on historias_clinicas
  for all to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "tenant_modulos" on tenants_modulos
  for all to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "read_own_tenant" on tenants
  for select to authenticated
  using (id = (auth.jwt() ->> 'tenant_id')::uuid);
