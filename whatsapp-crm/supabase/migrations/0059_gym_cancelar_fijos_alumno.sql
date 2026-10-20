-- ============================================================
-- Baja definitiva de los turnos fijos de un alumno, hecha por el staff desde el
-- panel (owner / profesional / gym_admin). Hasta ahora el panel solo tenía la
-- excepción de UN día ("No viene hoy"); la baja permanente existía únicamente
-- del lado del alumno (gym_cancelar_fijo, que pide teléfono) y no servía para el
-- profe ni para socios del padrón sin teléfono.
--
-- Da de baja TODOS los fijos activos del alumno (todos sus días). Marca
-- baja_por_deuda = false para que sea una baja MANUAL: NO se reactiva sola al
-- registrar un pago (a diferencia de la baja por deuda). Si se lo quiere volver
-- a anotar, se hace a mano con "Agregar".
--
-- Desactivar no dispara el trigger de cupo (corta cuando activo = false).
-- Correr DESPUÉS de 0058.
-- ============================================================

create or replace function public.gym_cancelar_fijos_alumno(p_alumno_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tenant uuid := ((select auth.jwt()) ->> 'tenant_id')::uuid;
  v_n      integer := 0;
begin
  if v_tenant is null or not public.jwt_es_gym_staff() then
    raise exception 'No autorizado';
  end if;

  update gym_turnos_fijos
     set activo = false, baja_por_deuda = false
   where alumno_id = p_alumno_id
     and tenant_id = v_tenant
     and activo;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.gym_cancelar_fijos_alumno(uuid) from public, anon;
grant execute on function public.gym_cancelar_fijos_alumno(uuid) to authenticated;
