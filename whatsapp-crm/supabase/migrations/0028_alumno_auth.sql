-- ============================================================
-- Login de alumnos con email + contraseña.
--
-- Hasta ahora el alumno NO tenía cuenta: se identificaba solo por su WhatsApp
-- y todo pasaba por funciones security definer. Esta migración le da una
-- identidad de Supabase Auth vinculada a su fila de gym_alumnos, y hace que el
-- hook JWT emita app_role='alumno' + alumno_id para poder rutearlo a su panel.
--
-- El staff (agents) NO cambia: sigue resolviéndose primero. Un usuario es
-- alumno solo si NO es agente y está vinculado a un gym_alumno.
--
-- Correr DESPUÉS de 0027 (la base ya tenía 0026/0027 de hardening).
--
-- NOTA (paso manual en Supabase): el Custom Access Token Hook ya está activo
-- desde 0010 (Auth → Hooks). Esta migración solo REEMPLAZA la función; no hace
-- falta volver a activarlo. Si por algún motivo no estuviera activo, activarlo
-- apuntando a public.custom_access_token_hook.
-- ============================================================

-- 1) Vínculo auth.users <-> gym_alumnos. Nullable: los alumnos que solo
--    reservaron por WhatsApp siguen existiendo sin cuenta.
alter table gym_alumnos
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

-- Un auth user = a lo sumo un alumno.
create unique index if not exists gym_alumnos_auth_user_idx
  on gym_alumnos (auth_user_id) where auth_user_id is not null;

-- 2) El hook corre como supabase_auth_admin y respeta RLS: igual que con
--    `agents`, necesita poder leer gym_alumnos para resolver el claim.
grant usage on schema public to supabase_auth_admin;

drop policy if exists "auth_admin_read_gym_alumnos" on gym_alumnos;
create policy "auth_admin_read_gym_alumnos" on gym_alumnos
  as permissive for select
  to supabase_auth_admin
  using (true);

-- 3) El alumno puede leer SU propia fila (para el panel: cuota, datos). No ve
--    las de nadie más. El staff sigue con la policy admin_gym_alumnos (0023).
drop policy if exists "alumno_self_read" on gym_alumnos;
create policy "alumno_self_read" on gym_alumnos
  as permissive for select
  to authenticated
  using (auth_user_id = (select auth.uid()));

-- 4) Hook: staff primero (sin cambios); si no es agente y está vinculado a un
--    gym_alumno, emite claims de alumno.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  claims        jsonb;
  agent_id      uuid;
  agent_tenant  uuid;
  agent_role    text;
  agent_gymadm  boolean;
  alumno_id     uuid;
  alumno_tenant uuid;
begin
  claims := event->'claims';

  -- Staff: igual que antes.
  select id, tenant_id, role, gym_admin
    into agent_id, agent_tenant, agent_role, agent_gymadm
    from agents
   where auth_user_id = (event->>'user_id')::uuid;

  if agent_tenant is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(agent_tenant::text));
    claims := jsonb_set(claims, '{app_role}', to_jsonb(agent_role));
    claims := jsonb_set(claims, '{agent_id}', to_jsonb(agent_id::text));
    claims := jsonb_set(claims, '{gym_admin}', to_jsonb(coalesce(agent_gymadm, false)));
  else
    -- Alumno: solo si no es agente.
    select id, tenant_id
      into alumno_id, alumno_tenant
      from gym_alumnos
     where auth_user_id = (event->>'user_id')::uuid
     limit 1;

    if alumno_tenant is not null then
      claims := jsonb_set(claims, '{tenant_id}', to_jsonb(alumno_tenant::text));
      claims := jsonb_set(claims, '{app_role}', to_jsonb('alumno'::text));
      claims := jsonb_set(claims, '{alumno_id}', to_jsonb(alumno_id::text));
    end if;
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
