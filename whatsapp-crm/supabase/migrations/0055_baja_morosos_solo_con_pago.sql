-- Ajuste: la baja automática de fijos por deuda SOLO aplica a socios que tenían
-- cuota y venció. A los que todavía no tienen ningún pago cargado (cuota_hasta
-- null) NO se les baja el fijo hasta que se les registre el primer pago.
--
-- Correr DESPUÉS de 0054.
create or replace function public.gym_dar_baja_morosos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_n   integer := 0;
begin
  if extract(day from v_hoy) <= 20 then
    return 0;
  end if;

  update gym_turnos_fijos f
     set activo = false, baja_por_deuda = true
    from gym_alumnos a
   where f.alumno_id = a.id
     and f.activo and f.estado <> 'rechazado'
     and a.cuota_hasta is not null
     and a.cuota_hasta < v_hoy;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.gym_dar_baja_morosos() from public, anon, authenticated;
