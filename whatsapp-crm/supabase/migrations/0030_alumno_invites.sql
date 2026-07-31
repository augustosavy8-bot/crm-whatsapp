-- ============================================================
-- Invitaciones para crear cuenta de alumno.
--
-- Reemplaza el auto-registro abierto: ya no se registra cualquiera. El staff
-- genera un token único por alumno (link copiable); solo con un token válido,
-- no vencido y no usado se puede crear la cuenta, y queda atada a ESA ficha.
--
-- Token de un solo uso: se limpia al registrarse (junto con el vínculo
-- auth_user_id que hace 0028). Vencimiento configurable desde la app.
--
-- Correr DESPUÉS de 0029.
-- ============================================================

alter table gym_alumnos add column if not exists invite_token uuid;
alter table gym_alumnos add column if not exists invite_expires_at timestamptz;

-- El token es la clave de la invitación: único mientras esté activo.
create unique index if not exists gym_alumnos_invite_token_idx
  on gym_alumnos (invite_token) where invite_token is not null;

-- El staff genera/lee el token vía la policy admin_gym_alumnos (for all) que ya
-- existe; el registro público lo valida con el service client. No hacen falta
-- policies nuevas.
