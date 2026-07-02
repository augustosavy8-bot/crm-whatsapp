-- ============================================================
-- FOKO — schema para Supabase
-- Pegá este archivo entero en el SQL Editor de tu proyecto y corrélo.
-- ============================================================

-- ------------------------------------------------------------
-- entregas_amazon
-- ------------------------------------------------------------
create table if not exists entregas_amazon (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  marca         text not null,
  producto      text,
  tipo          text default 'catalogo',
  estado        text default 'pendiente',
  prioridad     text default 'media',
  fecha_entrega date,
  notas         text
);

alter table entregas_amazon enable row level security;

-- OJO: policy abierta para desarrollo con la anon key.
-- >>> ANTES DE PUBLICAR: borrá esta policy y meté Auth (auth.uid() / roles). <<<
create policy "anon_all_entregas_amazon" on entregas_amazon
  for all to anon using (true) with check (true);

insert into entregas_amazon (marca, producto, tipo, estado, prioridad, fecha_entrega, notas) values
  ('Nike',    'Zapatillas Air',   'catalogo', 'pendiente',  'alta',  '2026-07-10', 'Falta ficha tecnica'),
  ('Adidas',  'Campera running',  'listing',  'en_proceso', 'media', '2026-07-15', NULL),
  ('Puma',    'Medias pack x3',   'catalogo', 'entregado',  'baja',  '2026-06-28', 'OK');

-- ------------------------------------------------------------
-- publicaciones
-- ------------------------------------------------------------
create table if not exists publicaciones (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  cuenta      text not null,
  fecha       date,
  tipo        text default 'feed',
  titulo      text,
  copy        text,
  estado      text default 'idea',
  notas       text
);

alter table publicaciones enable row level security;

-- OJO: policy abierta para desarrollo con la anon key.
-- >>> ANTES DE PUBLICAR: borrá esta policy y meté Auth. <<<
create policy "anon_all_publicaciones" on publicaciones
  for all to anon using (true) with check (true);

insert into publicaciones (cuenta, fecha, tipo, titulo, copy, estado, notas) values
  ('@foko.estudio', '2026-07-05', 'reel',   'Detras de escena', 'Como armamos un catalogo en un dia', 'idea',        NULL),
  ('@foko.estudio', '2026-07-08', 'feed',   'Nuevo cliente',    'Bienvenida a la marca X',            'programada',  'Diseño listo'),
  ('@cliente.marca','2026-07-03', 'story',  'Promo',            'Descuento por lanzamiento',          'publicada',   NULL);

-- ------------------------------------------------------------
-- mantenimientos_web
-- ------------------------------------------------------------
create table if not exists mantenimientos_web (
  id                    bigint generated always as identity primary key,
  created_at            timestamptz not null default now(),
  sitio                 text not null,
  url                   text,
  cliente               text,
  ultimo_mantenimiento  date,
  proximo_mantenimiento date,
  estado                text default 'ok',
  notas                 text
);

alter table mantenimientos_web enable row level security;

-- OJO: policy abierta para desarrollo con la anon key.
-- >>> ANTES DE PUBLICAR: borrá esta policy y meté Auth. <<<
create policy "anon_all_mantenimientos_web" on mantenimientos_web
  for all to anon using (true) with check (true);

insert into mantenimientos_web (sitio, url, cliente, ultimo_mantenimiento, proximo_mantenimiento, estado, notas) values
  ('Landing Marca X', 'https://marcax.com',   'Marca X',   '2026-06-15', '2026-07-15', 'ok',       'WordPress + plugins al dia'),
  ('Tienda Nube Y',   'https://tienday.com',  'Cliente Y', '2026-05-20', '2026-06-20', 'atrasado', 'Actualizar tema'),
  ('Portfolio Z',     'https://portfolioz.dev','Z',        '2026-06-30', '2026-08-30', 'ok',       NULL);

-- ------------------------------------------------------------
-- finanzas
-- ------------------------------------------------------------
create table if not exists finanzas (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  fecha       date default current_date,
  tipo        text not null,
  cliente     text,
  concepto    text,
  monto       numeric not null default 0,
  recurrente  boolean default false,
  estado      text default 'pendiente',
  medio       text
);

alter table finanzas enable row level security;

-- OJO: policy abierta para desarrollo con la anon key.
-- >>> ANTES DE PUBLICAR: borrá esta policy y meté Auth. <<<
create policy "anon_all_finanzas" on finanzas
  for all to anon using (true) with check (true);

insert into finanzas (fecha, tipo, cliente, concepto, monto, recurrente, estado, medio) values
  ('2026-07-01', 'ingreso', 'Marca X',   'Gestion catalogo Amazon', 120000, true,  'cobrado',    'transferencia'),
  ('2026-07-02', 'egreso',  NULL,        'Suscripcion Canva',        15000,  true,  'pagado',     'tarjeta'),
  ('2026-06-30', 'ingreso', 'Cliente Y', 'Mantenimiento web mensual', 45000, true,  'pendiente',  'mercadopago');
