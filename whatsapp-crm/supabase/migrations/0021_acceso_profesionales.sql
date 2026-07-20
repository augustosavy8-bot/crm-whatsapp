-- ============================================================
-- Acceso individual por profesional al módulo de reservas.
--
-- Hasta acá TODAS las policies del CRM eran
--   for all to authenticated using (tenant_id = jwt.tenant_id)
-- o sea: cualquier usuario logueado del tenant veía TODO. Con los
-- profesionales a punto de tener login, eso les abriría contacts,
-- messages, la agenda de los otros, etc. Esta migración parte el
-- acceso en dos roles:
--
--   owner       -> todo el tenant, como hoy.
--   profesional -> SOLO lo suyo del módulo de turnos. Nada del CRM.
--
-- El rol viaja en el claim `app_role` del JWT (lo pone el hook), y el
-- id del profesional en el nuevo claim `agent_id`.
--
-- NOTA sobre 'secretaria': el type AgentRole incluye 'owner' |
-- 'profesional' | 'secretaria'. Hoy no hay ninguna secretaria, así que
-- el CRM se sella a app_role = 'owner'. Si más adelante sumás una
-- secretaria que deba ver el inbox, agregá 'secretaria' al allowlist
-- de las policies marcadas con  [ALLOWLIST CRM]  más abajo.
--
-- Correr DESPUÉS de 0001..0020, en el SQL Editor. El hook ya está
-- enabled en el dashboard (Auth -> Hooks), así que reemplazarlo acá
-- alcanza; no hay paso manual nuevo.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Hook de JWT: sumar `agent_id` (además de tenant_id / app_role).
--
-- Se mantiene EXACTO lo de 0014 (no tocar `role`, rol de negocio en
-- `app_role`) y se agrega `agent_id` = agents.id del usuario. Los
-- owners no dependen de agent_id; lo usan solo las policies de
-- profesional.
-- ------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  claims       jsonb;
  agent_id     uuid;
  agent_tenant uuid;
  agent_role   text;
begin
  select id, tenant_id, role into agent_id, agent_tenant, agent_role
  from agents
  where auth_user_id = (event->>'user_id')::uuid;

  claims := event->'claims';

  if agent_tenant is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(agent_tenant::text));
    claims := jsonb_set(claims, '{app_role}', to_jsonb(agent_role));
    claims := jsonb_set(claims, '{agent_id}', to_jsonb(agent_id::text));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;


-- ============================================================
-- 2) RLS
--
-- Convención: los claims se leen con (select auth.jwt()) para que el
-- planner los evalúe una sola vez por query (initPlan), como recomienda
-- Supabase. Se repiten estas tres expresiones:
--   tenant :  ((select auth.jwt()) ->> 'tenant_id')::uuid
--   rol    :   (select auth.jwt()) ->> 'app_role'
--   agente :  ((select auth.jwt()) ->> 'agent_id')::uuid
--
-- Las policies son PERMISSIVE: para un mismo comando se combinan con OR.
-- Un owner matchea la policy de owner; un profesional cae en las suyas.
-- ============================================================


-- ---------- turnos ----------
-- owner: todo el tenant. profesional: SELECT/UPDATE solo los suyos,
-- INSERT solo con su propio profesional_id (turno manual). Sin DELETE
-- para profesional: cancelar es un UPDATE de estado.
drop policy if exists "tenant_turnos"        on turnos;
drop policy if exists "owner_turnos"         on turnos;
drop policy if exists "prof_turnos_select"   on turnos;
drop policy if exists "prof_turnos_update"   on turnos;
drop policy if exists "prof_turnos_insert"   on turnos;

create policy "owner_turnos" on turnos
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  );

create policy "prof_turnos_select" on turnos
  for select to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'profesional'
    and profesional_id = ((select auth.jwt()) ->> 'agent_id')::uuid
  );

create policy "prof_turnos_update" on turnos
  for update to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'profesional'
    and profesional_id = ((select auth.jwt()) ->> 'agent_id')::uuid
  )
  -- el WITH CHECK evita que un profesional se "regale" el turno de otro
  -- reasignando profesional_id a sí mismo, o al revés.
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and profesional_id = ((select auth.jwt()) ->> 'agent_id')::uuid
  );

create policy "prof_turnos_insert" on turnos
  for insert to authenticated
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'profesional'
    and profesional_id = ((select auth.jwt()) ->> 'agent_id')::uuid
  );


-- ---------- profesional_horarios ----------
-- Reemplaza la policy tenant-wide de 0019.
drop policy if exists "tenant_profesional_horarios" on profesional_horarios;
drop policy if exists "owner_profesional_horarios"  on profesional_horarios;
drop policy if exists "prof_profesional_horarios"   on profesional_horarios;

create policy "owner_profesional_horarios" on profesional_horarios
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  );

create policy "prof_profesional_horarios" on profesional_horarios
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'profesional'
    and profesional_id = ((select auth.jwt()) ->> 'agent_id')::uuid
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and profesional_id = ((select auth.jwt()) ->> 'agent_id')::uuid
  );


-- ---------- profesional_bloqueos ----------
drop policy if exists "tenant_profesional_bloqueos" on profesional_bloqueos;
drop policy if exists "owner_profesional_bloqueos"  on profesional_bloqueos;
drop policy if exists "prof_profesional_bloqueos"   on profesional_bloqueos;

create policy "owner_profesional_bloqueos" on profesional_bloqueos
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  );

create policy "prof_profesional_bloqueos" on profesional_bloqueos
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'profesional'
    and profesional_id = ((select auth.jwt()) ->> 'agent_id')::uuid
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and profesional_id = ((select auth.jwt()) ->> 'agent_id')::uuid
  );


-- ---------- pacientes ----------
-- El profesional necesita nombre/teléfono de los pacientes para sus
-- turnos, y poder dar de alta uno al crear un turno manual. Pero NO
-- editar ni borrar fichas (eso es del owner). Como no hay un dueño de
-- paciente por profesional, el SELECT es de todo el tenant: es data del
-- gimnasio, no del CRM, y el profesional ya la ve en sus turnos.
drop policy if exists "tenant_pacientes"      on pacientes;
drop policy if exists "owner_pacientes"       on pacientes;
drop policy if exists "prof_pacientes_select" on pacientes;
drop policy if exists "prof_pacientes_insert" on pacientes;

create policy "owner_pacientes" on pacientes
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  );

create policy "prof_pacientes_select" on pacientes
  for select to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'profesional'
  );

create policy "prof_pacientes_insert" on pacientes
  for insert to authenticated
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'profesional'
  );


-- ---------- servicios ----------
-- Read para cualquier autenticado (el profesional necesita el nombre de
-- su servicio; no es dato sensible). Escritura solo owner.
drop policy if exists "tenant_servicios"   on servicios;
drop policy if exists "owner_servicios"    on servicios;
drop policy if exists "read_servicios"     on servicios;

create policy "owner_servicios" on servicios
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  );

create policy "read_servicios" on servicios
  for select to authenticated
  using (tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid);


-- ---------- agents ----------
-- owner: todo el tenant (necesita la lista para el filtro por profesional).
-- profesional: SOLO su propia fila (la usa getCurrentAgent y para mostrar
-- su nombre). No puede listar a los demás agentes.
-- (La policy auth_admin_read_agents de 0010, para supabase_auth_admin, se
--  mantiene: el hook la necesita para resolver los claims. No se toca.)
drop policy if exists "tenant_agents"    on agents;
drop policy if exists "owner_agents"     on agents;
drop policy if exists "prof_agents_self" on agents;

create policy "owner_agents" on agents
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  );

create policy "prof_agents_self" on agents
  for select to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'profesional'
    and id = ((select auth.jwt()) ->> 'agent_id')::uuid
  );


-- ---------- CRM: sellado a owner  [ALLOWLIST CRM] ----------
-- contacts, messages, templates, historias_clinicas, tenants_modulos,
-- tenants. Un profesional autenticado NO debe leer NADA de esto. Se
-- reemplaza la condición tenant-wide por tenant + app_role = 'owner'.
-- Para sumar 'secretaria' en el futuro: cambiar el = 'owner' por
--   in ('owner','secretaria')  en estas seis policies.
drop policy if exists "tenant_contacts" on contacts;
create policy "tenant_contacts" on contacts
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  );

drop policy if exists "tenant_messages" on messages;
create policy "tenant_messages" on messages
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  );

drop policy if exists "tenant_templates" on templates;
create policy "tenant_templates" on templates
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  );

drop policy if exists "tenant_historias" on historias_clinicas;
create policy "tenant_historias" on historias_clinicas
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  );

drop policy if exists "tenant_modulos" on tenants_modulos;
create policy "tenant_modulos" on tenants_modulos
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  );

drop policy if exists "read_own_tenant" on tenants;
create policy "read_own_tenant" on tenants
  for select to authenticated
  using (
    id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'owner'
  );

-- vertical_config / campos_config: catálogo de configuración de campos,
-- sin datos personales. Se dejan legibles para cualquier autenticado
-- (como en 0008) — un profesional puede leerlos pero no hay nada
-- sensible ahí, y el módulo de turnos no los usa. No se tocan.
-- push_subscriptions: ya está scopeada por agent_id propio (0008); un
-- profesional solo vería las suyas (ninguna). No se toca.
