-- ============================================================
-- 0022: Seed de módulos por tenant (tenants_modulos).
--
-- Convención: UNA fila por módulo HABILITADO. modulo ∈ ('inbox','turnos').
-- La ausencia de fila = módulo no habilitado. Un tenant SIN ninguna fila se
-- trata como "legacy" (todo habilitado) del lado de la app (ver
-- src/lib/modulos.ts); recién cuando hay al menos una fila se respeta la
-- lista explícita.
--
-- Tenant piloto: se le deja SOLO 'turnos'. Con eso el CRM de inbox/mensajería
-- desaparece del panel de owners (nav + guard del proxy). NADA del backend de
-- mensajería cambia: el webhook de Meta, el envío de mensajes, la publicación
-- Realtime y el push siguen funcionando igual. Esto es visibilidad/navegación.
--
-- El piloto se identifica por su whatsapp_phone_number_id (estable), el mismo
-- que sembró la 0008.
-- ============================================================

insert into tenants_modulos (tenant_id, modulo, habilitado)
select id, 'turnos', true
  from tenants
 where whatsapp_phone_number_id = '1206741565856408'
on conflict (tenant_id, modulo) do update set habilitado = excluded.habilitado;
