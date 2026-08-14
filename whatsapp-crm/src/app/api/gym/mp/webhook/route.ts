import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getPayment, mpConfigurado, verificarFirmaWebhook } from "@/lib/mercadopago";
import { hoyISOArgentina } from "@/lib/tz";
import { proximoVencimientoISO } from "@/lib/gymCuota";

// Webhook de MercadoPago: MP nos avisa de cada cobro.
// - payment approved -> acredita la cuota del socio (vence el 10 del mes que viene)
//   y lo deja anotado en el libro de pagos.
// No hay suscripciones/débito automático: todos los pagos son únicos.
// Público (lo llama MP), fuera del proxy de sesión (está bajo /api).
//
// TODO(cuenta MP): con credenciales reales, VERIFICAR contra los payloads que
// manda MP la forma de mapear payment -> socio (external_reference) y el
// nombre exacto de los `type`. Está armado según la doc; ajustar al probar.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
            .select("id, tenant_id, cuota_hasta, mp_last_payment_id")
            .eq("id", alumnoId)
            .maybeSingle();
          // Idempotencia: si ya procesamos ESTE payment, no volver a extender
          // (MP reintenta los webhooks). dataId es el id del pago.
          if (al && al.mp_last_payment_id !== dataId) {
            const hoy = hoyISOArgentina();
            const actual = al.cuota_hasta as string | null;
            // Vencimiento siempre el 10 del mes que viene (regla única de cuota).
            const nuevaCuota = proximoVencimientoISO(actual, hoy);
            await sb
              .from("gym_alumnos")
              .update({
                es_socio: true,
                cuota_hasta: nuevaCuota,
                mp_last_payment_id: dataId,
              })
              .eq("id", alumnoId);

            // Deja el cobro anotado en el libro de pagos del socio, igual que un
            // pago cargado a mano. Best-effort: si falla, no rompe el webhook.
            await sb.from("gym_pagos").insert({
              tenant_id: al.tenant_id,
              alumno_id: alumnoId,
              fecha: hoy,
              monto: typeof pago.transaction_amount === "number" ? pago.transaction_amount : null,
              metodo: "mercadopago",
              nota: "Pago con MercadoPago",
              cuota_hasta: nuevaCuota,
            });
          }
        }
      }
    }
  } catch (e) {
    // No propagamos: MP reintenta si devolvemos error, pero un fallo transitorio
    // no debe tumbar el endpoint. Se registra y respondemos 200.
    console.error("[mp/webhook] error procesando", e);
  }

  return NextResponse.json({ ok: true });
}
