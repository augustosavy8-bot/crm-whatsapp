-- ============================================================
-- Hardening: panel_estadisticas no debe ser ejecutable por anon.
--
-- Advisor de Supabase (0028_anon_security_definer_function_executable):
-- panel_estadisticas es SECURITY DEFINER y el rol `anon` tenía EXECUTE (vía el
-- grant por defecto a PUBLIC), o sea era invocable por la API REST sin sesión.
--
-- La función igual valida el JWT internamente (tenant + flag panel_stats) y
-- lanza 'No autorizado' si no corresponde, así que NO había fuga de datos; esto
-- reduce la superficie de ataque quitándole el EXECUTE a anon/public.
--
-- Correr DESPUÉS de 0050.
-- ============================================================

revoke all on function public.panel_estadisticas(integer) from public;
revoke all on function public.panel_estadisticas(integer) from anon;
grant execute on function public.panel_estadisticas(integer) to authenticated;
