-- ============================================================
-- Realtime: exponer messages y contacts por la publicación de Supabase
-- para que el Inbox reciba inserts/updates sin refrescar.
-- ============================================================
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table contacts;
