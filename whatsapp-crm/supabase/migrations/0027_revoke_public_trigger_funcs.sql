-- ============================================================
-- Cierre real del acceso /rpc a las funciones de trigger.
--
-- NOTA: ya estaba APLICADA en la base pero no vivía en el repo (drift
-- detectado en la auditoría). Se versiona acá tal cual.
--
-- El EXECUTE por defecto se concede a PUBLIC; hay que revocarlo de ahí para
-- cerrar realmente el acceso por /rpc. Los triggers no dependen de este grant.
-- ============================================================

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.link_paciente_on_contact_insert() from public;
