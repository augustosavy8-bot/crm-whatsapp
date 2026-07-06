import crypto from "crypto";

// Valida la firma X-Hub-Signature-256 que manda Meta en cada webhook POST.
// `rawBody` DEBE ser el cuerpo crudo sin re-serializar (await req.text()).
// Si META_APP_SECRET no está seteado, devuelve true con un warning (útil en
// desarrollo temprano; en producción cargá el secret y esto pasa a validar de verdad).
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    console.warn(
      "[whatsapp] META_APP_SECRET no seteado: se omite validación de firma.",
    );
    return true;
  }
  if (!signatureHeader) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

  try {
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
