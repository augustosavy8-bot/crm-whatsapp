-- ============================================================
-- Fix: el Custom Access Token Hook (0010) fallaba con
-- "permission denied for table agents" al loguearse (500 en
-- /auth/v1/token). La policy RLS para `supabase_auth_admin` no
-- alcanza sin el GRANT de nivel tabla: en Postgres, RLS solo se
-- evalúa si el rol ya tiene el privilegio SQL base.
-- ============================================================
grant select on table public.agents to supabase_auth_admin;
