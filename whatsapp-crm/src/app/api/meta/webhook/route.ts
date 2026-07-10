import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyMetaSignature } from "@/lib/whatsapp/verifySignature";
import { parseMessenger } from "@/lib/meta/parseMessenger";
import { ingestMessenger } from "@/lib/inbox/ingestCore";
import { sendPushToTenant } from "@/lib/push/send";

// Webhook de la Messenger Platform (Facebook Messenger + Instagram DMs).
// Separado del de WhatsApp para no tocar el flujo de producción.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- GET: verificación del challenge (verify token propio) ---
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// --- POST: recepción de mensajes de Messenger/Instagram ---
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  // Parsear primero (sin actuar sobre el body) para saber el `object` y elegir el
  // secret correcto. La firma se valida igual sobre el rawBody exacto antes de ingerir.
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, ignored: "bad_json" });
  }

  // Instagram firma el X-Hub-Signature-256 con el Instagram App Secret (distinto).
  // Messenger (object:'page') usa el App Secret general, como WhatsApp.
  const object = String((payload as Record<string, unknown>)?.object ?? "");
  const secret =
    object === "instagram"
      ? process.env.INSTAGRAM_APP_SECRET
      : process.env.META_APP_SECRET;

  if (!verifyMetaSignature(rawBody, signature, secret)) {
    console.warn(`[meta] firma inválida (object=${object}), rechazado`);
    return new NextResponse("Invalid signature", { status: 401 });
  }

  try {
    const parsed = parseMessenger(payload);
    if (parsed.messages.length) {
      const sb = createServiceClient();

      // Resolver el tenant dueño de esta página/cuenta IG.
      if (!parsed.recipientId) {
        console.warn("[meta] webhook sin recipientId, ignorado");
        return NextResponse.json({ ok: true, ignored: "no_recipient_id" });
      }
      const idColumn =
        object === "instagram" ? "instagram_business_id" : "messenger_page_id";
      const { data: tenant } = await sb
        .from("tenants")
        .select("id")
        .eq(idColumn, parsed.recipientId)
        .maybeSingle();
      if (!tenant) {
        console.warn(
          `[meta] sin tenant para ${idColumn}=${parsed.recipientId}, ignorado`,
        );
        return NextResponse.json({ ok: true, ignored: "unknown_tenant" });
      }

      const summary = await ingestMessenger(sb, parsed, tenant.id as string);
      console.log("[meta] ingest", {
        tenant: tenant.id,
        inbound: summary.inbound,
        skipped: summary.skipped,
      });
      // Push aditivo: NUNCA debe afectar la respuesta 200 del webhook.
      try {
        for (const n of summary.notifications) {
          await sendPushToTenant(tenant.id as string, {
            title: n.title,
            body: n.body,
            url: `/inbox?c=${n.contactId}`,
            tag: `foko-${n.contactId}`,
          });
        }
      } catch (e) {
        console.error("[meta] push falló (ignorado)", e);
      }
    }
  } catch (e) {
    console.error("[meta] error procesando webhook", e);
  }

  // Siempre 200 para que Meta no reintente.
  return NextResponse.json({ ok: true });
}
