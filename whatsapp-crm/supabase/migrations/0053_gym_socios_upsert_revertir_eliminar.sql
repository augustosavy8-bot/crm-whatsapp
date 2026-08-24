-- ============================================================
-- 1) Prevención de duplicados: gym_upsert_alumno deduplica por NOMBRE cuando no
--    hay teléfono (antes insertaba siempre → duplicados en altas a mano).
-- 2) gym_revertir_pago: deshace un pago del libro y recalcula el vencimiento.
-- 3) gym_eliminar_alumno: borra un socio de la lista (cascade limpia el resto).
--
-- Correr DESPUÉS de 0052.
-- ============================================================

create or replace function public.gym_upsert_alumno(
  p_tenant_id uuid,
  p_nombre text,
  p_telefono text,
  p_email text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_alumno_id uuid;
  v_tel text := nullif(trim(coalesce(p_telefono, '')), '');
begin
  if v_tel is not null then
    -- Con teléfono: dedup por teléfono (criterio fuerte).
    select id into v_alumno_id
      from gym_alumnos
     where tenant_id = p_tenant_id and telefono = v_tel
     limit 1;
  else
    -- Sin teléfono: dedup por nombre normalizado, reusando la ficha existente
    -- (evita crear una ficha nueva cada vez que se agrega a mano al mismo).
    select id into v_alumno_id
      from gym_alumnos
     where tenant_id = p_tenant_id
       and lower(trim(nombre)) = lower(trim(p_nombre))
     order by (telefono is not null) desc, (auth_user_id is not null) desc,
              es_socio desc, created_at asc
     limit 1;
  end if;

  if v_alumno_id is null then
    insert into gym_alumnos (tenant_id, nombre, telefono, email)
    values (p_tenant_id, p_nombre, v_tel, nullif(trim(coalesce(p_email, '')), ''))
    returning id into v_alumno_id;
  else
    update gym_alumnos
       set email = coalesce(email, nullif(trim(coalesce(p_email, '')), '')),
           updated_at = now()
     where id = v_alumno_id;
  end if;

  return v_alumno_id;
end $function$;


-- Revertir un pago: lo borra del libro y deja la cuota como estaba (el
-- vencimiento del pago anterior que quede, o null si no queda ninguno).
create or replace function public.gym_revertir_pago(p_pago_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := ((select auth.jwt()) ->> 'tenant_id')::uuid;
  v_alumno uuid;
  v_nueva  date;
begin
  if v_tenant is null or not public.jwt_es_gym_staff() then
    raise exception 'No autorizado';
  end if;

  select alumno_id into v_alumno from gym_pagos
   where id = p_pago_id and tenant_id = v_tenant;
  if v_alumno is null then
    raise exception 'Pago no encontrado';
  end if;

  delete from gym_pagos where id = p_pago_id and tenant_id = v_tenant;

  select max(cuota_hasta) into v_nueva from gym_pagos where alumno_id = v_alumno;
  update gym_alumnos set cuota_hasta = v_nueva where id = v_alumno;
end $$;

revoke all on function public.gym_revertir_pago(uuid) from public, anon;
grant execute on function public.gym_revertir_pago(uuid) to authenticated;


-- Eliminar un socio de la lista (cascade borra reservas/pagos/etc suyos).
create or replace function public.gym_eliminar_alumno(p_alumno_id uuid)
returns void
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
  delete from gym_alumnos where id = p_alumno_id and tenant_id = v_tenant;
end $$;

revoke all on function public.gym_eliminar_alumno(uuid) from public, anon;
grant execute on function public.gym_eliminar_alumno(uuid) to authenticated;
