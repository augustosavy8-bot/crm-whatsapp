-- ============================================================
-- B2 — Aislamiento de historias clínicas entre profesionales.
--
-- Hallazgo de la auditoría: `prof_historias_select` dejaba a CUALQUIER
-- profesional leer TODAS las historias clínicas del tenant (no filtraba por
-- profesional_id), mientras que INSERT y UPDATE sí exigen profesional_id =
-- agent_id. O sea: Mariano (kinesiología) podía leer las notas de nutrición
-- de los pacientes de Lis. Dato de salud -> se sila por profesional.
--
-- Fix: la lectura del profesional se limita a SUS propias historias
-- (profesional_id = jwt.agent_id), igual que ya hacían insert/update. El
-- owner/admin conserva acceso total vía la policy `tenant_historias`.
--
-- Estas 3 policies vivían solo en la base (migración `historias_acceso_
-- profesionales`, nunca versionada en el repo). Esta migración las recrea las
-- tres para dejarlas en el repo, corrigiendo únicamente el SELECT.
--
-- Idempotente (drop if exists + create).
-- ============================================================

-- Lectura: SOLO las historias propias del profesional (antes: todas).
drop policy if exists "prof_historias_select" on historias_clinicas;
create policy "prof_historias_select" on historias_clinicas
  for select to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'profesional'
    and profesional_id = ((select auth.jwt()) ->> 'agent_id')::uuid
  );

-- Alta: solo con su propio profesional_id (sin cambios, se recrea por fidelidad).
drop policy if exists "prof_historias_insert" on historias_clinicas;
create policy "prof_historias_insert" on historias_clinicas
  for insert to authenticated
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'profesional'
    and profesional_id = ((select auth.jwt()) ->> 'agent_id')::uuid
  );

-- Edición: solo las propias, sin poder reasignar a otro profesional.
drop policy if exists "prof_historias_update" on historias_clinicas;
create policy "prof_historias_update" on historias_clinicas
  for update to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (select auth.jwt()) ->> 'app_role' = 'profesional'
    and profesional_id = ((select auth.jwt()) ->> 'agent_id')::uuid
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and profesional_id = ((select auth.jwt()) ->> 'agent_id')::uuid
  );
