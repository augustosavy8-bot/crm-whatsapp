-- ============================================================
-- FIX: el login de alumnos tiraba 500 ("permission denied for table
-- gym_alumnos").
--
-- El hook JWT (custom_access_token_hook) corre como el rol supabase_auth_admin.
-- 0028 le agregó la policy RLS auth_admin_read_gym_alumnos, pero una policy no
-- alcanza sin el privilegio de tabla: faltaba el GRANT SELECT (agents sí lo
-- tenía desde 0010, por eso el staff entraba y el alumno no).
--
-- Sin esto, al loguear un alumno el hook aborta y /token devuelve 500, aunque
-- la cuenta se haya creado bien.
--
-- Correr DESPUÉS de 0030.
-- ============================================================

grant select on public.gym_alumnos to supabase_auth_admin;
