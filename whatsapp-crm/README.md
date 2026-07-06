# WhatsApp CRM

Inbox web (estilo WhatsApp Web) para gestionar las conversaciones de WhatsApp Business
del negocio. Next.js (App Router) + Supabase + Tailwind + TypeScript.

Vive como subproyecto dentro del repo FOKO, pero es una app **independiente** (su propio
`package.json`, deploy y proyecto de Supabase).

## Estado
- **Fase 1 (actual)**: schema + webhook receptor. Un mensaje real de WhatsApp se guarda en la base.
- Fase 2: Inbox (lectura) + Realtime + auth. · Fase 3: envío. · Fase 4: contactos/tags/estados. ·
  Fase 5: multi-agente + templates.

## Setup

### 1. Proyecto Supabase (nuevo/dedicado)
1. Crear un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, pegar y correr en orden:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_realtime.sql`
   - `supabase/migrations/0003_auth_trigger.sql`

### 2. Variables de entorno
```bash
cp .env.local.example .env.local
```
Completar (ver comentarios en el archivo):
- Supabase URL + anon key + **service_role** key.
- `WHATSAPP_VERIFY_TOKEN` (lo inventás vos), `WHATSAPP_ACCESS_TOKEN` (token permanente
  de System User), `META_APP_SECRET`.
- `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_WABA_ID` ya vienen con los valores actuales.

### 3. Correr en local
```bash
npm install
npm run dev
```

## Deploy (Vercel) + webhook de Meta
1. Deploy del subdirectorio `whatsapp-crm/` a Vercel. Cargar las mismas env vars en
   **Project Settings → Environment Variables**.
2. En **Meta → App → WhatsApp → Configuration**:
   - **Callback URL**: `https://<tu-app>.vercel.app/api/whatsapp/webhook`
   - **Verify token**: el mismo valor de `WHATSAPP_VERIFY_TOKEN`.
   - Al guardar, Meta hace un GET de verificación (challenge).
   - Suscribir el campo **`messages`**.

## Probar la Fase 1
Mandá un WhatsApp real al número del negocio → en Supabase (**Table Editor**) deberías ver:
- una fila nueva en `contacts` (creada por número), y
- una fila en `messages` con `direction = inbound` y el `body`.

Los estados de mensajes salientes (sent/delivered/read/failed) actualizan la columna
`status` del mensaje por `wa_message_id`.

## Notas
- Todos los secrets viven en env vars, nunca en el código.
- El webhook valida la firma `X-Hub-Signature-256` con `META_APP_SECRET`. Si el secret no
  está seteado, la validación se omite con un warning (útil en pruebas tempranas; en
  producción cargalo).
- El webhook escribe con la **service-role key** (saltea RLS); el resto de la app usará la
  anon key con RLS por sesión.
- Next 16 renombró el archivo `middleware` a `proxy` (`src/proxy.ts`).

> ⚠️ El `WHATSAPP_ACCESS_TOKEN` temporal de Meta expira en 24hs. Para uso sostenido generá
> un token permanente de **System User**.
