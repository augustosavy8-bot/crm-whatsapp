import crypto from "node:crypto";
import { appBaseUrl } from "./appUrl";

// ============================================================
// OAuth de Mercado Pago (marketplace): el gimnasio autoriza a nuestra app
// "Kin Activa Pagos" a cobrar en su nombre. Flujo Authorization Code + PKCE.
// Docs: https://www.mercadopago.com.ar/developers/es/docs/security/oauth
//
// - Autorización: https://auth.mercadopago.com/authorization
// - Intercambio / refresh de tokens: https://api.mercadopago.com/oauth/token
// - El redirect_uri debe coincidir EXACTO con el cargado en la app de MP.
// SOLO servidor (usa MP_CLIENT_ID / MP_CLIENT_SECRET).
// ============================================================

const MP_AUTH_BASE = "https://auth.mercadopago.com/authorization";
const MP_TOKEN_URL = "https://api.mercadopago.com/oauth/token";

// Ruta EXACTA del callback registrada en la app de MP. No cambiar sin
// actualizar también la app en el panel de Mercado Pago.
export const MP_OAUTH_CALLBACK_PATH = "/api/gym/mp/oauth/callback";

export function mpRedirectUri(): string {
  return `${appBaseUrl()}${MP_OAUTH_CALLBACK_PATH}`;
}

export function mpOauthConfigurado(): boolean {
  return Boolean(process.env.MP_CLIENT_ID && process.env.MP_CLIENT_SECRET);
}

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// PKCE: verifier aleatorio (~64 chars, dentro del rango 43–128 que pide MP) y
// su challenge por SHA-256 (método S256).
export function generarVerifier(): string {
  return base64url(crypto.randomBytes(48));
}
export function challengeS256(verifier: string): string {
  return base64url(crypto.createHash("sha256").update(verifier).digest());
}
// State anti-CSRF: aleatorio, de un solo uso (se guarda y se consume server-side).
export function generarState(): string {
  return base64url(crypto.randomBytes(32));
}

export function mpAuthUrl(args: { state: string; codeChallenge: string }): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.MP_CLIENT_ID ?? "",
    redirect_uri: mpRedirectUri(),
    code_challenge: args.codeChallenge,
    code_challenge_method: "S256",
    state: args.state,
    platform_id: "mp",
  });
  return `${MP_AUTH_BASE}?${p.toString()}`;
}

export interface MpTokenResponse {
  access_token: string;
  refresh_token: string;
  user_id: number | string;
  public_key?: string;
  expires_in: number; // segundos
  scope?: string;
  token_type?: string;
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}
function msgDe(data: Record<string, unknown>): string {
  return (data.message as string) || (data.error as string) || "";
}

// El endpoint /oauth/token de MP acepta JSON; algunos entornos/errores esperan
// form-urlencoded. Probamos JSON y, si falla, reintentamos como form, para no
// depender del formato exacto. Si los dos fallan, tiramos el error más útil.
async function tokenRequest(body: Record<string, unknown>): Promise<MpTokenResponse> {
  const asJson = await fetch(MP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (asJson.ok) return (await parseJson(asJson)) as unknown as MpTokenResponse;
  const jsonErr = await parseJson(asJson);

  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null) form.set(k, String(v));
  }
  const asForm = await fetch(MP_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: form.toString(),
  });
  if (asForm.ok) return (await parseJson(asForm)) as unknown as MpTokenResponse;

  const formErr = await parseJson(asForm);
  const msg = msgDe(formErr) || msgDe(jsonErr) || "error";
  throw new Error(`MP OAuth ${asForm.status}: ${msg}`);
}

// Intercambia el `code` (con el code_verifier del PKCE) por los tokens del gym.
export async function mpIntercambiarCode(
  code: string,
  verifier: string,
): Promise<MpTokenResponse> {
  return tokenRequest({
    grant_type: "authorization_code",
    client_id: process.env.MP_CLIENT_ID,
    client_secret: process.env.MP_CLIENT_SECRET,
    code,
    redirect_uri: mpRedirectUri(),
    code_verifier: verifier,
  });
}

// Renueva el access_token con el refresh_token (requiere scope offline_access).
export async function mpRefrescarToken(
  refreshToken: string,
): Promise<MpTokenResponse> {
  return tokenRequest({
    grant_type: "refresh_token",
    client_id: process.env.MP_CLIENT_ID,
    client_secret: process.env.MP_CLIENT_SECRET,
    refresh_token: refreshToken,
  });
}
