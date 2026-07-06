import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyMetaSignature } from "@/lib/whatsapp/verifySignature";
import { parseMessenger } from "@/lib/meta/parseMessenger";
import { ingestMessenger } from "@/lib/inbox/ingestCore";

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

  // Misma validación de firma que WhatsApp (mismo App Secret).
  if (!verifyMetaSignature(rawBody, signature)) {
    console.warn("[meta] firma inválida, rechazado");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, ignored: "bad_json" });
  }

  try {
    const parsed = parseMessenger(payload);
    if (parsed.messages.length) {
      const sb = createServiceClient();
      const summary = await ingestMessenger(sb, parsed);
      console.log("[meta] ingest", summary);
    }
  } catch (e) {
    console.error("[meta] error procesando webhook", e);
  }

  // Siempre 200 para que Meta no reintente.
  return NextResponse.json({ ok: true });
}
