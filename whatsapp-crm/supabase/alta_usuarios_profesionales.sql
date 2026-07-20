-- ============================================================
-- Alta de los 3 usuarios de Auth para los profesionales + vínculo
-- con su fila de `agents` (por agents.id, NO por email hardcodeado).
--
-- NO es una migración: son datos, y los emails/passwords los ponés vos.
-- Correr en el SQL Editor DESPUÉS de la migración 0021.
--
-- Por qué SQL y no el dashboard: "Add user" del dashboard crea el user
-- pero no lo vincula a agents; igual habría que correr el UPDATE de
-- abajo. Con la función de auth se hace todo junto y ya confirmado.
--
-- Requiere la extensión pgcrypto (para crypt()); en Supabase ya está.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Helper: crea (o reusa) un user de Auth CONFIRMADO con password, y lo
-- vincula al agent indicado por su id. Idempotente: si el email ya existe,
-- solo reasegura el vínculo. Devuelve el user_id.
--
-- El password es temporal: que cada profesional lo cambie en el primer
-- login (o generá uno y pasáselo por un canal seguro).
-- ------------------------------------------------------------
create or replace function public._alta_profesional(
  p_agent_id uuid,
  p_email    text,
  p_password text
)
returns uuid
language plpgsql
security definer
set search_path = auth, public, extensions
as $$
declare
  v_user_id uuid;
  v_tenant  uuid;
begin
  select tenant_id into v_tenant from public.agents where id = p_agent_id;
  if v_tenant is null then
    raise exception 'No existe el agent %', p_agent_id;
  end if;

  select id into v_user_id from auth.users where email = lower(p_email);

  if v_user_id is null then
    v_user_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_user_id, 'authenticated', 'authenticated', lower(p_email),
      crypt(p_password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}',
      now(), now()
    );
    -- Identidad email (requerida por GoTrue para login con password).
    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user_id, v_user_id::text,
      jsonb_build_object('sub', v_user_id::text, 'email', lower(p_email), 'email_verified', true),
      'email', now(), now()
    );
  end if;

  update public.agents set email = p_email where id = p_agent_id;

  -- El vínculo es lo que hace que el hook resuelva tenant_id/app_role/agent_id.
  update public.agents set auth_user_id = v_user_id where id = p_agent_id;

  return v_user_id;
end $$;

-- ------------------------------------------------------------
-- Ejecución. Completá EMAIL y PASSWORD de cada uno. Los agent_id se
-- resuelven por nombre (los sembró 0019); si preferís, poné el uuid directo.
-- ------------------------------------------------------------
do $$
declare
  v_mariano uuid;
  v_lis     uuid;
  v_gian    uuid;
begin
  select id into v_mariano from public.agents where role = 'profesional' and name ilike '%mariano%' limit 1;
  select id into v_lis     from public.agents where role = 'profesional' and (name ilike '%lis%' or name ilike '%ponzio%') limit 1;
  select id into v_gian    from public.agents where role = 'profesional' and (name ilike '%gian%' or name ilike '%orlandi%') limit 1;

  perform public._alta_profesional(v_mariano, 'mariano@kine.com', 'kine1234');
  perform public._alta_profesional(v_lis,     'lis@nutri.com',     'nutri1234');
  perform public._alta_profesional(v_gian,    'gian@gimnasio.com',    'gimnasio1234');
end $$;

-- Limpieza del helper (no lo dejamos colgado en la base).
drop function public._alta_profesional(uuid, text, text);

-- Verificación: los 3 deberían quedar con auth_user_id no nulo.
select name, email, role, (auth_user_id is not null) as tiene_login
  from public.agents
 where role = 'profesional'
 order by name;
