-- ============================================================
-- Fix urgente: el claim `role` del hook (0010) pisa una convención
-- reservada de PostgREST -- usa el claim "role" del JWT para hacer
-- SET ROLE en cada request. Como agents.role vale 'profesional' (no
-- es un rol real de Postgres), TODAS las requests autenticadas
-- fallaban con `role "profesional" does not exist` (401/500 en
-- inbox, dashboard, envío de mensajes, etc.).
--
-- Se renombra el claim a `app_role` (no colisiona con nada reservado).
-- ============================================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  claims       jsonb;
  agent_tenant uuid;
  agent_role   text;
begin
  select tenant_id, role into agent_tenant, agent_role
  from agents
  where auth_user_id = (event->>'user_id')::uuid;

  claims := event->'claims';

  if agent_tenant is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(agent_tenant::text));
    claims := jsonb_set(claims, '{app_role}', to_jsonb(agent_role));
  end if;

  -- por si quedó seteado por el hook viejo en algún token cacheado
  claims := claims - 'role';

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;
