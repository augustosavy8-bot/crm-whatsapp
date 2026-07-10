-- ============================================================
-- Fix: `tenants` quedó con RLS habilitado pero sin policy (detectado
-- por el advisor de seguridad de Supabase tras la 0008). El único
-- acceso hoy es vía service-role (webhooks), pero cualquier pantalla
-- futura que lea "mi tenant" con la sesión del usuario necesita esto.
-- ============================================================
drop policy if exists "read_own_tenant" on tenants;
create policy "read_own_tenant" on tenants
  for select to authenticated
  using (id = (select tenant_id from agents where auth_user_id = auth.uid()));
