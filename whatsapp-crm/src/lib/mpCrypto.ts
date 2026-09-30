import crypto from "node:crypto";

// ============================================================
// Cifrado de los tokens de Mercado Pago que se guardan en la base.
// AES-256-GCM (autenticado) a nivel app. La clave sale de MP_TOKEN_ENC_KEY
// (32 bytes en base64). Los tokens NUNCA se guardan en claro.
//
// Formato del texto cifrado: "v1:<iv_b64>:<tag_b64>:<ciphertext_b64>".
//
// Si MP_TOKEN_ENC_KEY se pierde o se cambia, los tokens ya guardados NO se
// pueden desencriptar y cada gimnasio tiene que volver a conectar Mercado Pago
// por OAuth. No afecta reservas, socios, login ni pagos ya registrados.
// SOLO servidor.
// ============================================================

function getKey(): Buffer {
  const raw = process.env.MP_TOKEN_ENC_KEY;
  if (!raw) throw new Error("MP_TOKEN_ENC_KEY no configurada");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("MP_TOKEN_ENC_KEY debe ser 32 bytes en base64 (AES-256)");
  }
  return key;
}

export function mpEncKeyConfigurada(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function mpEncrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function mpDecrypt(payload: string): string {
  const [v, ivB64, tagB64, ctB64] = payload.split(":");
  if (v !== "v1" || !ivB64 || !tagB64 || !ctB64) {
    throw new Error("Formato de token cifrado inválido");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
