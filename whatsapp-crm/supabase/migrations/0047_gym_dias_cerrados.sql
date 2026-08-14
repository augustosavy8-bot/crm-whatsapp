-- ============================================================
-- Días cerrados / feriados del gimnasio.
--
-- El staff (profes o admins) puede declarar días en los que el gimnasio no
-- está disponible (feriados, cierres). Esos días:
--   - no se pueden reservar clases sueltas (lo corta la RPC de reserva),
--   - las reservas sueltas que ya había se cancelan,
--   - la agenda los muestra como "Cerrado".
-- Los turnos fijos de ese día simplemente no ocurren (la agenda los oculta).
--
-- Correr DESPUÉS de 0046.
-- ============================================================

create table if not exists gym_dias_cerrados (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  fecha      date not null,
  motivo     text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, fecha)
);
create index if not exists gym_dias_cerrados_idx
  on gym_dias_cerrados (tenant_id, fecha);

-- RLS: staff del gym (owner / profesional / gym_admin). Profes y admins pueden
-- declarar y sacar días cerrados.
alter table gym_dias_cerrados enable row level security;

drop policy if exists "staff_gym_dias_cerrados" on gym_dias_cerrados;
create policy "staff_gym_dias_cerrados" on gym_dias_cerrados
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
-- RPC: marcar un día como cerrado (y cancelar las sueltas de ese día).
-- ------------------------------------------------------------
create or replace function public.gym_marcar_dia_cerrado(
  p_fecha  date,
  p_motivo text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := ((select auth.jwt()) ->> 'tenant_id')::uuid;
begin
  if v_tenant is null or not public.jwt_es_gym_staff() then
    raise exception 'No autorizado';
  end if;

  insert into gym_dias_cerrados (tenant_id, fecha, motivo, created_by)
  values (v_tenant, p_fecha, nullif(trim(coalesce(p_motivo, '')), ''), auth.uid())
  on conflict (tenant_id, fecha) do update set motivo = excluded.motivo;

  -- El gimnasio no abre ese día: las reservas sueltas quedan canceladas.
  update gym_reservas_sueltas
     set estado = 'cancelada'
   where tenant_id = v_tenant
     and fecha = p_fecha
     and estado in ('pendiente', 'confirmada');
end $$;

revoke all on function public.gym_marcar_dia_cerrado(date, text) from public, anon;
grant execute on function public.gym_marcar_dia_cerrado(date, text) to authenticated;


-- ------------------------------------------------------------
-- Reserva suelta: no se puede reservar en un día cerrado.
-- (Se recrea la función agregando el chequeo; el resto es idéntico.)
-- ------------------------------------------------------------
create or replace function public.gym_reservar_suelta(
  p_horario_id uuid,
  p_fecha date,
  p_nombre text,
  p_telefono text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tenant_id uuid;
  v_alumno_id uuid;
  v_reserva_id uuid;
  v_nombre text := nullif(trim(p_nombre), '');
begin
  if v_nombre is null then
    raise exception 'El nombre es obligatorio';
  end if;
  if nullif(trim(coalesce(p_telefono, '')), '') is null then
    raise exception 'El WhatsApp es obligatorio';
  end if;

  select tenant_id into v_tenant_id from gym_horarios where id = p_horario_id and activo;
  if v_tenant_id is null then
    raise exception 'El horario no existe o no está disponible';
  end if;

  if exists (
    select 1 from gym_dias_cerrados d
     where d.tenant_id = v_tenant_id and d.fecha = p_fecha
  ) then
    raise exception 'El gimnasio está cerrado ese día';
  end if;

  v_alumno_id := gym_upsert_alumno(v_tenant_id, v_nombre, p_telefono, null);

  select id into v_reserva_id
    from gym_reservas_sueltas
   where alumno_id = v_alumno_id and horario_id = p_horario_id
     and fecha = p_fecha and estado in ('pendiente','confirmada')
   limit 1;
  if v_reserva_id is not null then
    return v_reserva_id;
  end if;

  if exists (
    select 1 from gym_turnos_fijos f
     where f.alumno_id = v_alumno_id and f.horario_id = p_horario_id
       and f.activo and f.estado <> 'rechazado' and f.fecha_desde <= p_fecha
       and not exists (
         select 1 from gym_excepciones_fijo e
          where e.turno_fijo_id = f.id and e.fecha = p_fecha
       )
  ) then
    raise exception 'Ya tenés lugar fijo ese día en ese horario';
  end if;

  insert into gym_reservas_sueltas (tenant_id, alumno_id, horario_id, fecha, estado)
  values (v_tenant_id, v_alumno_id, p_horario_id, p_fecha, 'confirmada')
  returning id into v_reserva_id;

  return v_reserva_id;
end $function$;
