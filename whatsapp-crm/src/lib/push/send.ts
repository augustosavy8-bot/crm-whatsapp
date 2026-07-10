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

export async function sendPushToTenant(
  tenantId: string,
  payload: PushPayload,
): Promise<void> {
  if (!configure()) return; // sin VAPID configurado, no-op

  const sb = createServiceClient();
  const { data: subs, error } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("tenant_id", tenantId);
  if (error || !subs?.length) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (s) => {
      const subscription = {
        endpoint: s.endpoint as string,
        keys: { p256dh: s.p256dh as string, auth: s.auth as string },
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
