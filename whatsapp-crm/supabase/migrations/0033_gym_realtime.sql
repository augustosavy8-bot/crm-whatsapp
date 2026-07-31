-- ============================================================
-- Realtime para las reservas del gimnasio: el panel de recepción recibe en
-- vivo cuando un alumno se anota (fila entra sola + campana), sin recargar.
--
-- Agrega las tablas a la publicación supabase_realtime. La autorización la da
-- la RLS de staff (admin_gym_*), igual que en las lecturas del panel.
--
-- Correr DESPUÉS de 0032. Idempotente.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'gym_reservas_sueltas'
  ) then
    execute 'alter publication supabase_realtime add table gym_reservas_sueltas';
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'gym_turnos_fijos'
  ) then
    execute 'alter publication supabase_realtime add table gym_turnos_fijos';
  end if;
end $$;
