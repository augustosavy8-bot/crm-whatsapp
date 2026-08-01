-- ============================================================
-- Blindaje de seguridad (sin cambios de comportamiento en la app).
--
-- NOTA: esta migración ya estaba APLICADA en la base pero no vivía en el repo
-- (drift detectado en la auditoría pre-lanzamiento). Se versiona acá tal cual
-- quedó en la base para que un entorno nuevo salga con el mismo hardening.
--
-- 1) Quitar el acceso por API pública a dos funciones de trigger SECURITY
--    DEFINER. Los triggers siguen ejecutándose normalmente; solo se cierra
--    el /rpc.
-- 2) Fijar search_path en dos triggers (solo usan funciones nativas).
-- ============================================================

revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.link_paciente_on_contact_insert() from anon, authenticated;

alter function public.contacts_default_external_id() set search_path = '';
alter function public.turnos_set_fecha_fin() set search_path = '';
