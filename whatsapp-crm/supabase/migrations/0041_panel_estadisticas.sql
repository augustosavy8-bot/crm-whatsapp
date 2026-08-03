-- ============================================================
-- Panel de estadísticas del dueño. Un flag por agente decide quién lo ve
-- (hoy solo Augusto), y una función security-definer arma las métricas del
-- tenant: altas de cuentas por día, reservas del gym por día, y socios/cuotas.
--
-- Es security-definer porque lee auth.users (fecha de alta de las cuentas).
-- Autoriza solo a agentes con panel_stats = true del tenant del JWT.
-- ============================================================

alter table public.agents
  add column if not exists panel_stats boolean not null default false;

create or replace function public.panel_estadisticas(p_dias int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_tenant uuid := ((select auth.jwt()) ->> 'tenant_id')::uuid;
  v_agent  uuid := ((select auth.jwt()) ->> 'agent_id')::uuid;
  v_tz     text := 'America/Argentina/Buenos_Aires';
  v_hoy    date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_desde  date := ((now() at time zone 'America/Argentina/Buenos_Aires')::date - (greatest(p_dias, 1) - 1));
  v_altas    jsonb;
  v_reservas jsonb;
  v_socios   jsonb;
begin
  if v_tenant is null or not exists (
    select 1 from agents where id = v_agent and panel_stats
  ) then
    raise exception 'No autorizado';
  end if;

  -- Altas de cuentas (auth.users) por día: staff vs alumno.
  with cuentas as (
    select u.created_at, 'staff'::text as tipo
      from agents a join auth.users u on u.id = a.auth_user_id
     where a.tenant_id = v_tenant
    union all
    select u.created_at, 'alumno'::text
      from gym_alumnos g join auth.users u on u.id = g.auth_user_id
     where g.tenant_id = v_tenant
  ),
  pordia as (
    select (created_at at time zone v_tz)::date as dia,
           count(*) filter (where tipo = 'staff')  as staff,
           count(*) filter (where tipo = 'alumno') as alumnos
      from cuentas
     group by 1
  ),
  dias as (
    select generate_series(v_desde, v_hoy, interval '1 day')::date as d
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'dia', to_char(d.d, 'YYYY-MM-DD'),
           'staff', coalesce(pd.staff, 0),
           'alumnos', coalesce(pd.alumnos, 0)
         ) order by d.d), '[]'::jsonb)
    into v_altas
    from dias d left join pordia pd on pd.dia = d.d;

  -- Reservas del gym creadas por día (sueltas + fijos).
  with r as (
    select created_at from gym_reservas_sueltas where tenant_id = v_tenant
    union all
    select created_at from gym_turnos_fijos where tenant_id = v_tenant
  ),
  pordia as (
    select (created_at at time zone v_tz)::date as dia, count(*) as total
      from r group by 1
  ),
  dias as (
    select generate_series(v_desde, v_hoy, interval '1 day')::date as d
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'dia', to_char(d.d, 'YYYY-MM-DD'),
           'total', coalesce(pd.total, 0)
         ) order by d.d), '[]'::jsonb)
    into v_reservas
    from dias d left join pordia pd on pd.dia = d.d;

  -- Socios y cuotas (snapshot actual).
  select jsonb_build_object(
    'total_alumnos', count(*),
    'socios_al_dia', count(*) filter (where es_socio and cuota_hasta >= v_hoy),
    'vencidos', count(*) filter (where es_socio and (cuota_hasta is null or cuota_hasta < v_hoy)),
    'no_socios', count(*) filter (where not es_socio),
    'mrr', (
      select coalesce(sum(p.precio), 0)
        from gym_alumnos g2 join gym_planes p on p.id = g2.plan_id
       where g2.tenant_id = v_tenant and g2.es_socio and g2.cuota_hasta >= v_hoy
    ),
    'por_plan', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'nombre', p.nombre, 'precio', p.precio, 'socios', x.cnt
             ) order by p.orden), '[]'::jsonb)
        from gym_planes p
        left join lateral (
          select count(*) as cnt from gym_alumnos g3
           where g3.plan_id = p.id and g3.tenant_id = v_tenant
             and g3.es_socio and g3.cuota_hasta >= v_hoy
        ) x on true
       where p.tenant_id = v_tenant and p.activo
    )
  ) into v_socios
  from gym_alumnos where tenant_id = v_tenant;

  return jsonb_build_object(
    'desde', to_char(v_desde, 'YYYY-MM-DD'),
    'hasta', to_char(v_hoy, 'YYYY-MM-DD'),
    'altas_por_dia', v_altas,
    'reservas_por_dia', v_reservas,
    'socios', v_socios
  );
end $function$;

revoke execute on function public.panel_estadisticas(int) from public;
grant execute on function public.panel_estadisticas(int) to authenticated;
