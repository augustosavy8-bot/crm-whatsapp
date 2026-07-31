-- ============================================================
-- "Todos al panel admin": el rol profesional pasa a ser staff del gimnasio,
-- con acceso completo al panel de cupo (igual que owner / gym_admin).
--
-- Hasta ahora el panel de gym era solo owner + Mariano (gym_admin). En un
-- negocio solo-gimnasio los profes SON el staff del gym, así que se les abre
-- el panel entero: agenda, confirmar/rechazar, horarios y socios/cuota.
--
-- Se centraliza el gate en un helper para no repetir la condición en cada
-- policy/función (y para el próximo cambio sea un solo lugar).
--
-- Correr DESPUÉS de 0026.
-- ============================================================

-- Predicado único: ¿el JWT es staff del gimnasio? owner, profesional o el
-- flag gym_admin. STABLE + security invoker (lee el JWT del que llama).
create or replace function public.jwt_es_gym_staff()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select auth.jwt()) ->> 'app_role' in ('owner', 'profesional')
    or (select auth.jwt()) ->> 'gym_admin' = 'true',
    false
  );
$$;

-- ------------------------------------------------------------
-- Recrear las 5 policies de escritura del gym con el gate ampliado. El
-- read_gym_horarios (lectura para cualquier authenticated) no cambia.
-- ------------------------------------------------------------
drop policy if exists "admin_gym_horarios" on gym_horarios;
create policy "admin_gym_horarios" on gym_horarios
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and public.jwt_es_gym_staff()
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and public.jwt_es_gym_staff()
  );

drop policy if exists "admin_gym_alumnos" on gym_alumnos;
create policy "admin_gym_alumnos" on gym_alumnos
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and public.jwt_es_gym_staff()
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and public.jwt_es_gym_staff()
  );

drop policy if exists "admin_gym_turnos_fijos" on gym_turnos_fijos;
create policy "admin_gym_turnos_fijos" on gym_turnos_fijos
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and public.jwt_es_gym_staff()
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and public.jwt_es_gym_staff()
  );

drop policy if exists "admin_gym_excepciones_fijo" on gym_excepciones_fijo;
create policy "admin_gym_excepciones_fijo" on gym_excepciones_fijo
  for all to authenticated
  using (
    public.jwt_es_gym_staff()
    and exists (
      select 1 from gym_turnos_fijos f
       where f.id = turno_fijo_id
         and f.tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    )
  )
  with check (
    public.jwt_es_gym_staff()
    and exists (
      select 1 from gym_turnos_fijos f
       where f.id = turno_fijo_id
         and f.tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    )
  );

drop policy if exists "admin_gym_reservas_sueltas" on gym_reservas_sueltas;
create policy "admin_gym_reservas_sueltas" on gym_reservas_sueltas
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and public.jwt_es_gym_staff()
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and public.jwt_es_gym_staff()
  );

-- ------------------------------------------------------------
-- gym_ocupacion_por_fecha (panel): misma definición vigente de 0024, con el
-- gate interno ampliado vía el helper. Solo cambia la línea de v_ok.
-- ------------------------------------------------------------
create or replace function public.gym_ocupacion_por_fecha(p_fecha date)
returns table (
  horario_id    uuid,
  dia_semana    smallint,
  hora_inicio   time,
  hora_fin      time,
  capacidad_max int,
  cupo_usado    int,
  alumnos       jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := ((select auth.jwt()) ->> 'tenant_id')::uuid;
  v_ok boolean := public.jwt_es_gym_staff();
begin
  if v_tenant_id is null or not v_ok then
    raise exception 'No autorizado';
  end if;

  return query
  select h.id, h.dia_semana, h.hora_inicio, h.hora_fin, h.capacidad_max,
    (coalesce(fijos.cnt, 0) + coalesce(sueltas.cnt, 0))::int,
    coalesce(fijos.alumnos, '[]'::jsonb) || coalesce(sueltas.alumnos, '[]'::jsonb)
  from gym_horarios h
  left join lateral (
    select count(*) cnt,
           jsonb_agg(jsonb_build_object(
             'tipo', 'fijo', 'alumno_id', a.id, 'nombre', a.nombre,
             'turno_fijo_id', f.id, 'estado', f.estado,
             'es_socio', a.es_socio, 'cuota_hasta', a.cuota_hasta
           )) alumnos
      from gym_turnos_fijos f
      join gym_alumnos a on a.id = f.alumno_id
     where f.horario_id = h.id
       and f.activo and f.estado <> 'rechazado'
       and f.fecha_desde <= p_fecha
       and not exists (
         select 1 from gym_excepciones_fijo e
          where e.turno_fijo_id = f.id and e.fecha = p_fecha
       )
  ) fijos on true
  left join lateral (
    select count(*) cnt,
           jsonb_agg(jsonb_build_object(
             'tipo', 'suelto', 'alumno_id', a.id, 'nombre', a.nombre,
             'reserva_id', s.id, 'estado', s.estado,
             'es_socio', a.es_socio, 'cuota_hasta', a.cuota_hasta
           )) alumnos
      from gym_reservas_sueltas s
      join gym_alumnos a on a.id = s.alumno_id
     where s.horario_id = h.id
       and s.fecha = p_fecha
       and s.estado in ('pendiente','confirmada')
  ) sueltas on true
  where h.tenant_id = v_tenant_id
    and h.activo
    and h.dia_semana = extract(dow from p_fecha)::smallint
  order by h.hora_inicio;
end $$;

revoke execute on function public.gym_ocupacion_por_fecha(date) from public;
revoke execute on function public.gym_ocupacion_por_fecha(date) from anon;
grant execute on function public.gym_ocupacion_por_fecha(date) to authenticated;
