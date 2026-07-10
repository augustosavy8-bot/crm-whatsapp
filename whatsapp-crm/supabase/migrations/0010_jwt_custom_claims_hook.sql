-- ============================================================
-- Auth: JWT custom claims (Paso 2), parte 1/2.
-- Crea el Custom Access Token Hook que inyecta tenant_id/role en
-- el JWT, leyéndolos de `agents`. Esto NO cambia ningún comportamiento
-- todavía: las RLS siguen usando el subquery interino de la 0008/0009
-- hasta la migración 0011.
--
-- >>> Después de correr esto falta un paso MANUAL en el dashboard <<<
-- Authentication -> Hooks -> "Customize Access Token (JWT) Claims hook"
-- -> elegir `public.custom_access_token_hook` -> Enable hook -> Save.
-- Sin ese paso el hook queda creado pero desconectado (no rompe nada,
-- simplemente el JWT sigue sin el claim).
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
    claims := jsonb_set(claims, '{role}', to_jsonb(agent_role));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- El hook lo invoca Supabase Auth como `supabase_auth_admin`, que
-- respeta RLS: sin esto no podría leer `agents` para resolver el claim.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

drop policy if exists "auth_admin_read_agents" on agents;
create policy "auth_admin_read_agents" on agents
  as permissive for select
  to supabase_auth_admin
  using (true);
