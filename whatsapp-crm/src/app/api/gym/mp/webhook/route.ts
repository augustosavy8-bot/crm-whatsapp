import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getPayment, mpConfigurado, verificarFirmaWebhook } from "@/lib/mercadopago";

// Webhook de MercadoPago: MP nos avisa de cada cobro.
// - payment approved -> acredita la cuota del socio (vence el 10 del mes que
//   viene), lo deja anotado en el libro de pagos y le reactiva los fijos dados
//   de baja por deuda. Todo eso lo hace una sola función en la base
//   (gym_registrar_pago_webhook -> gym__aplicar_pago), la MISMA lógica que el
//   pago manual; el webhook solo la invoca. Idempotente por mp_last_payment_id.
// No hay suscripciones/débito automático: todos los pagos son únicos.
// Público (lo llama MP), fuera del proxy de sesión (está bajo /api).
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
          // Registro unificado con el pago manual: la función en la base calcula
          // el vencimiento, deja el asiento en el libro y reactiva los fijos
          // dados de baja por deuda. Idempotente por mp_last_payment_id: si MP
          // reintenta el webhook, gym_registrar_pago_webhook devuelve null y no
          // vuelve a acreditar. Deriva el tenant del propio alumno.
          const monto =
            typeof pago.transaction_amount === "number"
              ? pago.transaction_amount
              : null;
          const { error } = await sb.rpc("gym_registrar_pago_webhook", {
            p_alumno_id: alumnoId,
            p_mp_payment_id: dataId,
            p_monto: monto,
            // Fase 0 (cuenta única, sin split): el bruto es el monto cobrado. El
            // desglose (comisión MP / marketplace_fee / neto) se carga en Fase 3.
            p_monto_bruto: monto,
          });
          if (error) {
            console.error("[mp/webhook] gym_registrar_pago_webhook", error);
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
