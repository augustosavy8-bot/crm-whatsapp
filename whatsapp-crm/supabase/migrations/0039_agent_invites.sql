-- ============================================================
-- Invitación de STAFF (profesor/admin) por link, análogo al de alumnos.
--
-- Un agent puede quedar "esperando login": se le pone un invite_token y la
-- persona abre /registro-staff?token=… y define SU gmail + contraseña. El
-- trigger handle_new_user reclama ese agent por email al crear el auth.user.
--
-- Idempotente.
-- ============================================================

alter table public.agents
  add column if not exists invite_token uuid,
  add column if not exists invite_expires_at timestamptz;

create unique index if not exists agents_invite_token_idx
  on public.agents (invite_token) where invite_token is not null;
