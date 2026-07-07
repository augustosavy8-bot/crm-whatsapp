import crypto from "crypto";

// Valida la firma X-Hub-Signature-256 que manda Meta en cada webhook POST.
// `rawBody` DEBE ser el cuerpo crudo sin re-serializar (await req.text()).
// `secret` por defecto es META_APP_SECRET (lo que usa WhatsApp/Messenger); Instagram
// firma con su propio Instagram App Secret, que se pasa explícito.
// Si no hay secret, devuelve true con un warning (útil en desarrollo temprano;
// en producción cargá el secret y esto pasa a validar de verdad).
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined = process.env.META_APP_SECRET,
): boolean {
  if (!secret) {
    console.warn("[meta] App Secret no seteado: se omite validación de firma.");
    return true;
  }
  if (!signatureHeader) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  try {
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
