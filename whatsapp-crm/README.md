# KINACTIVA

App de reservas y gestión para el gimnasio: turnos de los profesionales, clases
grupales con cupo, alumnos y cuotas, todo en un panel. Next.js 16 (App Router) +
Supabase + Tailwind v4 + TypeScript, deploy en Vercel.

## Qué incluye
- **Turnos** de los profesionales (agenda, reserva pública, confirmación, drag&drop).
- **Clases del gimnasio** con cupo (reserva suelta o fija, cupo por horario).
- **Alumnos**: alta, invitación por link, panel propio (`/mi-cuenta`), estado de cuota.
- **Cuotas / planes**: precios por plan, MercadoPago (débito automático) opcional.
- **Notificaciones**: Web Push al staff (reserva nueva) y al alumno (reserva
  confirmada), realtime en el panel. Los avisos por WhatsApp son manuales.
- **Multi-tenant** con RLS: cada dato queda sellado por `tenant_id` + rol vía los
  claims del JWT.

## Setup

### 1. Supabase
Crear un proyecto en [supabase.com](https://supabase.com) y correr las migraciones
de `supabase/migrations/` **en orden** (SQL Editor, o `supabase db push`).

Pasos manuales que no van en las migraciones:
- **Auth → Hooks → Access Token**: apuntar a `custom_access_token_hook` (emite los
  claims `tenant_id`, `app_role`, `agent_id`).
- **Auth → URL Configuration**: agregar `https://<dominio>/reset` a las *Redirect
  URLs* (recuperación de contraseña) y setear el *Site URL* con el dominio.

### 2. Variables de entorno
```bash
cp .env.local.example .env.local
```
- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`.
- **Web Push (VAPID)**: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`.
- **MercadoPago** (opcional, para cuotas con débito automático): `MP_ACCESS_TOKEN`,
  `MP_WEBHOOK_SECRET`.
- **WhatsApp** (opcional, para el inbox manual): `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET`.

### 3. Local
```bash
npm install
npm run dev
```

## Deploy
Deploy del subdirectorio `whatsapp-crm/` a Vercel y cargar las mismas env vars en
**Project Settings → Environment Variables**. El webhook de MercadoPago vive en
`/api/gym/mp/webhook`; exige la firma (`MP_WEBHOOK_SECRET`) — sin ese secreto,
rechaza los eventos.

## Notas
- Todos los secrets viven en env vars, nunca en el código.
- La seguridad real es RLS por sesión; la barrera de UI (proxy/rutas) es adicional.
- Next 16 renombró `middleware` a `proxy` (`src/proxy.ts`).
