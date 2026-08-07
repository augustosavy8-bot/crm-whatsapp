-- ============================================================
-- Padrón de cuotas 2026 de KINACTIVA: importación de la planilla
-- histórica ("CUOTAS 2026.xlsx") para que los profes no la carguen
-- a mano.
--
-- El "plan" (veces por semana) ya está modelado en gym_planes
-- (dias_semana) + gym_alumnos.plan_id, así que NO se agrega columna:
-- cada socio se vincula a su plan por dias_semana en la importación.
--
-- Esta migración solo suma lo que faltaba:
--   - fecha_inicio + observaciones en gym_alumnos
--   - telefono opcional (la planilla no trae teléfonos)
--   - metodo_pago 'debito' (los ADEO -10%)
--   - tabla gym_cuotas: historial de pago mes a mes
--
-- Correr DESPUÉS de 0033_gym_realtime.
-- ============================================================


-- ------------------------------------------------------------
-- 1) gym_alumnos: datos de la planilla que no tenían dónde ir.
--    - fecha_inicio: alta del socio (col "INICIO"/"INICIO/VENC").
--    - observaciones: notas sueltas que no son ni pago ni mes
--      (ADEO -10%, "TOT" de deuda, "mil a favor", "ver cuántas
--      veces viene").
-- ------------------------------------------------------------
alter table gym_alumnos add column if not exists fecha_inicio  date;
alter table gym_alumnos add column if not exists observaciones text;


-- ------------------------------------------------------------
-- 2) La planilla NO trae teléfonos (todos los TEL: vacíos) y hoy
--    telefono es NOT NULL. Lo hacemos opcional para poder cargar el
--    padrón. El índice único (tenant_id, telefono) queda: Postgres
--    trata cada NULL como distinto, así que varios socios sin
--    teléfono no chocan entre sí.
--
--    Deuda conocida: el matching de socios (gym_upsert_alumno,
--    gym_mis_reservas...) es por teléfono. Un socio importado sin
--    teléfono NO se vincula solo cuando reserva online (se crearía
--    una segunda ficha); se reconcilia por nombre cuando complete su
--    teléfono.
-- ------------------------------------------------------------
alter table gym_alumnos alter column telefono drop not null;


-- ------------------------------------------------------------
-- 3) metodo_pago: sumar 'debito' para los ADEO (-10%) de la planilla.
-- ------------------------------------------------------------
alter table gym_alumnos drop constraint if exists gym_alumnos_metodo_pago_check;
alter table gym_alumnos add constraint gym_alumnos_metodo_pago_check
  check (metodo_pago in ('efectivo','mercadopago','debito'));


-- ------------------------------------------------------------
-- 4) gym_cuotas: un registro por socio por mes = la grilla de la
--    planilla. fecha_pago null + estado 'debe' = mes adeudado;
--    'premio' = mes bonificado; 'parcial' cubre casos como "2 SEM".
-- ------------------------------------------------------------
create table if not exists gym_cuotas (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  alumno_id  uuid not null references gym_alumnos(id) on delete cascade,
  anio       smallint not null,
  mes        smallint not null check (mes between 1 and 12),
  fecha_pago date,
  estado     text not null default 'pagado'
    check (estado in ('pagado','debe','premio','parcial')),
  monto      numeric(12,2),
  nota       text,
  created_at timestamptz not null default now(),
  unique (alumno_id, anio, mes)
);
create index if not exists gym_cuotas_tenant_idx on gym_cuotas (tenant_id);
create index if not exists gym_cuotas_alumno_idx  on gym_cuotas (alumno_id, anio, mes);


-- ------------------------------------------------------------
-- 5) RLS — mismo criterio admin que gym_alumnos (0023): solo el
--    dueño o un gym_admin del tenant ven/tocan las cuotas.
-- ------------------------------------------------------------
alter table gym_cuotas enable row level security;

drop policy if exists "admin_gym_cuotas" on gym_cuotas;
create policy "admin_gym_cuotas" on gym_cuotas
  for all to authenticated
  using (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (
      (select auth.jwt()) ->> 'app_role' = 'owner'
      or (select auth.jwt()) ->> 'gym_admin' = 'true'
    )
  )
  with check (
    tenant_id = ((select auth.jwt()) ->> 'tenant_id')::uuid
    and (
      (select auth.jwt()) ->> 'app_role' = 'owner'
      or (select auth.jwt()) ->> 'gym_admin' = 'true'
    )
  );
