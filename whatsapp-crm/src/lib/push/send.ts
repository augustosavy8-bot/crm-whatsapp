import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/service";

// Envío de Web Push a las suscripciones de los agentes. Solo servidor.
// Se llama de forma ADITIVA en los webhooks (try/catch): nunca rompe el flujo.

let configured = false;
function configure(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Entrega el payload a una lista de suscripciones y limpia las vencidas.
async function entregar(subs: SubRow[], payload: PushPayload): Promise<void> {
  if (!subs.length) return;
  const sb = createServiceClient();
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      try {
        await webpush.sendNotification(subscription, body);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // Suscripción vencida/eliminada → limpiar.
        if (status === 404 || status === 410) {
          await sb.from("push_subscriptions").delete().eq("id", s.id);
        } else {
          console.error("[push] envío falló", status);
        }
      }
    }),
  );
}

// Push a TODO el STAFF del tenant (agent_id not null). Los alumnos NO reciben
// estos avisos aunque tengan suscripción en el mismo tenant.
export async function sendPushToTenant(
  tenantId: string,
  payload: PushPayload,
): Promise<void> {
  if (!configure()) return; // sin VAPID configurado, no-op
  const sb = createServiceClient();
  const { data: subs, error } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("tenant_id", tenantId)
    .not("agent_id", "is", null);
  if (error || !subs?.length) return;
  await entregar(subs as SubRow[], payload);
}

// Push a UN alumno puntual (por sus propias suscripciones).
export async function sendPushToAlumno(
  alumnoId: string,
  payload: PushPayload,
): Promise<void> {
  if (!configure()) return;
  const sb = createServiceClient();
  const { data: subs, error } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("alumno_id", alumnoId);
  if (error || !subs?.length) return;
  await entregar(subs as SubRow[], payload);
}
