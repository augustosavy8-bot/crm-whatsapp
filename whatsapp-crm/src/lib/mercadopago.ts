import crypto from "node:crypto";

// ============================================================
// Cliente mínimo de MercadoPago para el débito automático de la cuota del
// gimnasio (suscripciones = "preapproval"). REST directo, sin SDK.
//
// TODO(cuenta MP): cablear las env vars cuando el gimnasio tenga su cuenta:
//   MP_ACCESS_TOKEN     access token de PRODUCCIÓN (o TEST para probar)
//   MP_CUOTA_MONTO      monto de la cuota mensual, en pesos (ej. 15000)
//   MP_WEBHOOK_SECRET   "clave secreta" del webhook (para validar la firma)
// Mientras no estén, mpConfigurado() es false y todo el flujo queda apagado
// sin romper nada.
// ============================================================

const MP_API = "https://api.mercadopago.com";

export function mpConfigurado(): boolean {
  return Boolean(process.env.MP_ACCESS_TOKEN && process.env.MP_CUOTA_MONTO);
}

export function mpCuotaMonto(): number {
  return Number(process.env.MP_CUOTA_MONTO ?? 0);
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export interface Preapproval {
  id: string;
  status: string; // pending | authorized | paused | cancelled
  init_point?: string;
  external_reference?: string;
}

// Crea una suscripción mensual y devuelve el init_point: la URL a la que el
// socio entra UNA vez para poner su tarjeta y autorizar el débito recurrente.
export async function crearPreapproval(args: {
  alumnoId: string;
  email: string;
  montoARS: number;
  backUrl: string;
  reason: string;
}): Promise<Preapproval> {
  const res = await fetch(`${MP_API}/preapproval`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      reason: args.reason,
      external_reference: args.alumnoId,
      payer_email: args.email,
      back_url: args.backUrl,
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: args.montoARS,
        currency_id: "ARS",
      },
    }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      (data.message as string) || `MercadoPago respondió ${res.status}`,
    );
  }
  return data as unknown as Preapproval;
}

export async function getPreapproval(id: string): Promise<Preapproval> {
  const res = await fetch(`${MP_API}/preapproval/${id}`, { headers: authHeaders() });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`MercadoPago respondió ${res.status}`);
  return data as unknown as Preapproval;
}

export interface MpPayment {
  id: number;
  status: string; // approved | rejected | ...
  external_reference?: string;
  metadata?: Record<string, unknown>;
  preapproval_id?: string;
}

export async function getPayment(id: string): Promise<MpPayment> {
  const res = await fetch(`${MP_API}/v1/payments/${id}`, { headers: authHeaders() });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`MercadoPago respondió ${res.status}`);
  return data as unknown as MpPayment;
}

// Valida la firma del webhook (esquema x-signature de MP). Si no hay
// MP_WEBHOOK_SECRET configurado, no se puede validar: devolvemos false y el
// caller decide (en borrador, sin secreto, se acepta pero se loguea).
// Docs: manifest = `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
export function verificarFirmaWebhook(args: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret || !args.xSignature || !args.dataId) return false;

  // x-signature: "ts=1699999999,v1=abcdef..."
  const partes = Object.fromEntries(
    args.xSignature.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim(), v?.trim()];
    }),
  );
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${args.dataId.toLowerCase()};request-id:${args.xRequestId ?? ""};ts:${ts};`;
  const hmac = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(v1));
  } catch {
    return false;
  }
}
