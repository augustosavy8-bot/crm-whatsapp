import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getPayment,
  getPreapproval,
  mpConfigurado,
  verificarFirmaWebhook,
} from "@/lib/mercadopago";
import { hoyISOArgentina } from "@/lib/tz";

// Webhook de MercadoPago: MP nos avisa de cada cobro / cambio de suscripción.
// - payment approved  -> renueva la cuota del socio (+1 mes).
// - preapproval       -> espeja el estado (authorized/paused/cancelled).
// Público (lo llama MP), fuera del proxy de sesión (está bajo /api).
//
// TODO(cuenta MP): con credenciales reales, VERIFICAR contra los payloads que
// manda MP la forma de mapear payment -> socio (external_reference) y el
// nombre exacto de los `type`. Está armado según la doc; ajustar al probar.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Suma un mes a "YYYY-MM-DD" (vía mediodía UTC, estable ante DST).
function sumarMesISO(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const tipo = url.searchParams.get("type") || url.searchParams.get("topic");
  let dataId = url.searchParams.get("data.id") || url.searchParams.get("id");

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // MP a veces manda el id solo por query; el body vacío es válido.
  }
  const tipoFinal =
    tipo || (body.type as string) || (body.topic as string) || "";
  if (!dataId) {
    const d = body.data as { id?: string | number } | undefined;
    if (d?.id != null) dataId = String(d.id);
  }

  // Firma OBLIGATORIA. Sin MP_WEBHOOK_SECRET no se puede validar el origen, y
  // este endpoint hace escrituras sensibles (marca socios, extiende cuotas):
  // fail-closed. No se procesa nada hasta configurar el secreto.
  if (!process.env.MP_WEBHOOK_SECRET) {
    console.error("[mp/webhook] MP_WEBHOOK_SECRET no configurado: se rechaza");
    return NextResponse.json(
      { error: "Webhook no configurado" },
      { status: 503 },
    );
  }
  const firmaOk = verificarFirmaWebhook({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId,
  });
  if (!firmaOk) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  // Sin credenciales MP no podemos consultar el recurso: aceptamos y salimos.
  if (!mpConfigurado() || !dataId) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const sb = createServiceClient();

  try {
    if (tipoFinal.includes("payment")) {
      const pago = await getPayment(dataId);
      if (pago.status === "approved") {
        const alumnoId =
          pago.external_reference ||
          (pago.metadata?.external_reference as string | undefined);
        if (alumnoId) {
          const { data: al } = await sb
            .from("gym_alumnos")
            .select("id, cuota_hasta, mp_last_payment_id")
            .eq("id", alumnoId)
            .maybeSingle();
          // Idempotencia: si ya procesamos ESTE payment, no volver a extender
          // (MP reintenta los webhooks). dataId es el id del pago.
          if (al && al.mp_last_payment_id !== dataId) {
            const hoy = hoyISOArgentina();
            const actual = al.cuota_hasta as string | null;
            const base = actual && actual > hoy ? actual : hoy;
            await sb
              .from("gym_alumnos")
              .update({
                es_socio: true,
                metodo_pago: "mercadopago",
                mp_estado: "authorized",
                cuota_hasta: sumarMesISO(base),
                mp_last_payment_id: dataId,
              })
              .eq("id", alumnoId);
          }
        }
      }
    } else if (tipoFinal.includes("preapproval") || tipoFinal.includes("subscription")) {
      const pre = await getPreapproval(dataId);
      const alumnoId = pre.external_reference;
      const patch = { mp_estado: pre.status };
      if (alumnoId) {
        await sb.from("gym_alumnos").update(patch).eq("id", alumnoId);
      } else {
        await sb.from("gym_alumnos").update(patch).eq("mp_preapproval_id", pre.id);
      }
    }
  } catch (e) {
    // No propagamos: MP reintenta si devolvemos error, pero un fallo transitorio
    // no debe tumbar el endpoint. Se registra y respondemos 200.
    console.error("[mp/webhook] error procesando", e);
  }

  return NextResponse.json({ ok: true });
}
