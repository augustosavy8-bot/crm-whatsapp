-- ============================================================
-- Fix urgente: la 0013 agregaba `claims := claims - 'role';`
-- pensando que "role" era solo el claim custom que colisionaba
-- con PostgREST. Pero GoTrue exige por esquema que el JWT tenga
-- SIEMPRE un claim `role` (el estándar "authenticated"/"anon" que
-- ya viene puesto por default) -- borrarlo rompe el login entero
-- con "output claims do not conform to the expected schema:
-- role is required".
--
-- Fix correcto: NUNCA tocar `role` (queda "authenticated", como
-- siempre estuvo). El rol de negocio (agents.role) va solo en
-- `app_role`, que es el nombre que no colisiona con nada reservado.
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

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;
