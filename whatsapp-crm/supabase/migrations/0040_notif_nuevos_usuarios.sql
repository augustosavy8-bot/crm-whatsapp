-- ============================================================
-- Aviso de "nuevo usuario creado" dirigido: un flag por agente marca quién
-- recibe un Web Push cada vez que alguien crea su cuenta (staff o alumno).
-- Se prende solo para el/los dueños que quieran el aviso — no es para todo el
-- staff. La data (a quién) se setea aparte, por tenant.
-- ============================================================

alter table public.agents
  add column if not exists notif_nuevos_usuarios boolean not null default false;
