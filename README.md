# FOKO — Panel

Panel interno (JS vanilla + [Supabase](https://supabase.com) por CDN, servido con [Vite](https://vitejs.dev), sin build step).

## Puesta en marcha

### 1. Crear las tablas en Supabase
1. Entrá a tu proyecto en Supabase → **SQL Editor**.
2. Pegá el contenido de [`schema.sql`](schema.sql) y ejecutalo (**Run**).
   Crea las 4 tablas (`entregas_amazon`, `publicaciones`, `mantenimientos_web`, `finanzas`)
   con RLS activado, una policy `anon` permisiva para desarrollo y filas de ejemplo.

### 2. Instalar dependencias
```bash
npm install
```

### 3. Levantar el servidor local
```bash
npm run dev
```
Abrí la URL que imprime Vite (algo como `http://localhost:5173`).

> ⚠️ La app **se sirve por HTTP** (`npm run dev`), nunca abriéndola por `file://`.

### 4. Conectar con Supabase
En la pantalla de setup del panel pegá:
- **Supabase URL** → solo el dominio base, p. ej. `https://xxxx.supabase.co`
  (sin `/rest/v1` — el cliente ya agrega ese path).
- **Anon / publishable key** → la anon key de tu proyecto (Settings → API).

Se guardan en `localStorage` de este navegador; podés cambiarlas desde la config del panel.

## Scripts
| Comando           | Qué hace                                  |
|-------------------|-------------------------------------------|
| `npm run dev`     | Servidor de desarrollo (HTTP)             |
| `npm run build`   | Build de producción en `dist/`            |
| `npm run preview` | Sirve el build de `dist/` para probarlo   |

## Antes de publicar
La policy `anon` de `schema.sql` deja las tablas **abiertas** (cualquiera con la anon key
lee/escribe). Está bien para uso local/interno, pero **antes de exponer el panel**:
borrá las policies `anon_all_*` y configurá [Supabase Auth](https://supabase.com/docs/guides/auth)
con policies basadas en `auth.uid()` / roles.
