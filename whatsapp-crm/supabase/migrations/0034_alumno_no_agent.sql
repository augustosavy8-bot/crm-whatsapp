-- ============================================================
-- Alumnos no son staff: no se les crea fila en `agents`.
--
-- El trigger on_auth_user_created -> handle_new_user() creaba un agent por cada
-- auth.user nuevo (para el onboarding de staff: reclamar un agent pre-cargado
-- por email, o crear uno). Los alumnos del gimnasio se registran por
-- /api/registro (service client -> auth.admin.createUser), así que también
-- caían en esa rama y quedaban DUPLICADOS: su ficha en gym_alumnos + un agent
-- fantasma con rol 'profesional'.
--
-- Ahora el registro de alumno marca la cuenta con user_metadata.es_alumno=true
-- y el trigger la ignora: el alumno queda SOLO en gym_alumnos. El flujo de
-- staff (reclamar/crear agent) no cambia.
--
-- Idempotente (create or replace).
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Cuenta de alumno del gimnasio: no es staff, no lleva agent.
  if coalesce(new.raw_user_meta_data->>'es_alumno', '') = 'true' then
    return new;
  end if;

  -- 1) reclamar un agent existente sin login con el mismo email (onboarding staff)
  update agents
  set auth_user_id = new.id
  where email = new.email
    and auth_user_id is null;

  -- 2) si no había ninguno, crear el agent (comportamiento original)
  if not found then
    insert into agents (auth_user_id, email, name)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.email))
    on conflict (auth_user_id) do nothing;
  end if;

  return new;
end
$function$;
