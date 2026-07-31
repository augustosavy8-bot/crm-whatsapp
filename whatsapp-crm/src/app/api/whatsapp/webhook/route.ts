import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyMetaSignature } from "@/lib/whatsapp/verifySignature";
import { parseWebhook } from "@/lib/whatsapp/parseWebhook";
import { ingestWebhook } from "@/lib/whatsapp/ingest";

// El webhook no debe cachearse y corre en Node (usa crypto + service-role).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- GET: verificación del webhook (challenge de Meta) ---
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// --- POST: recepción de eventos (mensajes entrantes + statuses) ---
export async function POST(request: NextRequest) {
  // Leer el cuerpo CRUDO para validar la firma antes de parsear.
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyMetaSignature(rawBody, signature)) {
    console.warn("[whatsapp] firma inválida, rechazado");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // 200 igual para que Meta no reintente un payload que nunca va a parsear.
    return NextResponse.json({ ok: true, ignored: "bad_json" });
  }

  try {
    const parsed = parseWebhook(payload);
    if (parsed.messages.length || parsed.statuses.length) {
      const sb = createServiceClient();

      // Resolver el tenant dueño de este número. Sin match, no hay dónde
      // guardar el mensaje -> se ignora (pero se responde 200 igual).
      if (!parsed.phoneNumberId) {
        console.warn("[whatsapp] webhook sin phone_number_id, ignorado");
        return NextResponse.json({ ok: true, ignored: "no_phone_number_id" });
      }
      const { data: tenant } = await sb
        .from("tenants")
        .select("id")
        .eq("whatsapp_phone_number_id", parsed.phoneNumberId)
        .maybeSingle();
      if (!tenant) {
        console.warn(
          `[whatsapp] sin tenant para phone_number_id=${parsed.phoneNumberId}, ignorado`,
        );
        return NextResponse.json({ ok: true, ignored: "unknown_tenant" });
      }

      const summary = await ingestWebhook(sb, parsed, tenant.id as string);
      console.log("[whatsapp] ingest", {
        tenant: tenant.id,
        inbound: summary.inbound,
        statusUpdates: summary.statusUpdates,
        skipped: summary.skipped,
      });
      // Recepción y persistencia de mensajes/estados, sin más. (La
      // interpretación de turnos y la autorespuesta por IA se removieron.)
    }
  } catch (e) {
    // Nunca devolver !=2xx por un error interno: Meta reintenta y duplica.
    console.error("[whatsapp] error procesando webhook", e);
  }

  return NextResponse.json({ ok: true });
}
