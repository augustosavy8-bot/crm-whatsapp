import { createServiceClient } from "./supabase/service";
import { mpEncrypt, mpDecrypt } from "./mpCrypto";
import {
  generarState,
  mpRefrescarToken,
  type MpTokenResponse,
} from "./mpOauth";

// ============================================================
// Capa de datos de la conexión OAuth de Mercado Pago por gimnasio (tenant).
// TODO va con el SERVICE CLIENT (saltea RLS): las tablas mp_cuentas_conectadas
// y mp_oauth_states están selladas (RLS sin policies), así que solo el servidor
// las toca y los tokens nunca llegan al navegador. SOLO servidor.
// ============================================================

export type MpEstado = "conectada" | "por_vencer" | "desconectada" | "error";

export interface MpConexionPublica {
  estado: MpEstado;
  mpUserId: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
  lastError: string | null;
}

// Estado SEGURO (sin tokens) para mostrar en el panel del admin.
export async function getMpConexionPublica(
  tenantId: string,
): Promise<MpConexionPublica | null> {
  const sb = createServiceClient();
  const { data } = await sb
    .from("mp_cuentas_conectadas")
    .select("mp_user_id, estado, connected_at, expires_at, last_error")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return null;
  return {
    estado: data.estado as MpEstado,
    mpUserId: data.mp_user_id ?? null,
    connectedAt: data.connected_at ?? null,
    expiresAt: data.expires_at ?? null,
    lastError: data.last_error ?? null,
  };
}

// Guarda (o actualiza) la conexión tras el OAuth. Tokens encriptados.
export async function guardarMpConexion(args: {
  tenantId: string;
  tok: MpTokenResponse;
  connectedBy: string | null;
}): Promise<void> {
  const sb = createServiceClient();
  const expiresAt = new Date(Date.now() + args.tok.expires_in * 1000).toISOString();
  const nowIso = new Date().toISOString();
  const { error } = await sb.from("mp_cuentas_conectadas").upsert(
    {
      tenant_id: args.tenantId,
      mp_user_id: String(args.tok.user_id),
      access_token_enc: mpEncrypt(args.tok.access_token),
      refresh_token_enc: mpEncrypt(args.tok.refresh_token),
      public_key: args.tok.public_key ?? null,
      scope: args.tok.scope ?? null,
      expires_at: expiresAt,
      estado: "conectada",
      last_error: null,
      connected_by: args.connectedBy,
      connected_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: "tenant_id" },
  );
  if (error) throw error;
}

// Desconecta: marca el estado y BORRA los tokens (no se guardan en reposo si no
// están en uso). La fila queda para histórico del estado.
export async function desconectarMp(tenantId: string): Promise<void> {
  const sb = createServiceClient();
  const { error } = await sb
    .from("mp_cuentas_conectadas")
    .update({
      estado: "desconectada",
      access_token_enc: null,
      refresh_token_enc: null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId);
  if (error) throw error;
}

// --- State anti-CSRF + PKCE verifier (efímero, de un solo uso) ---

export async function crearOauthState(args: {
  tenantId: string;
  verifier: string;
  createdBy: string | null;
}): Promise<string> {
  const sb = createServiceClient();
  const state = generarState();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min
  const { error } = await sb.from("mp_oauth_states").insert({
    state,
    tenant_id: args.tenantId,
    code_verifier: args.verifier,
    created_by: args.createdBy,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return state;
}

// Consume el state: válido solo si existe, no venció y NO se usó antes. Lo marca
// usado de forma atómica (condición used_at is null) para que sea de un solo uso.
export async function consumirOauthState(
  state: string,
): Promise<{ tenantId: string; verifier: string; createdBy: string | null } | null> {
  const sb = createServiceClient();
  const { data } = await sb
    .from("mp_oauth_states")
    .select("tenant_id, code_verifier, created_by, expires_at, used_at")
    .eq("state", state)
    .maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at).getTime() < Date.now()) {
    return null;
  }
  const { data: upd } = await sb
    .from("mp_oauth_states")
    .update({ used_at: new Date().toISOString() })
    .eq("state", state)
    .is("used_at", null)
    .select("state");
  if (!upd || upd.length === 0) return null; // carrera: alguien lo usó en paralelo
  return {
    tenantId: data.tenant_id,
    verifier: data.code_verifier,
    createdBy: data.created_by ?? null,
  };
}

// --- Access token válido del gym (para cobrar / consultar pagos) ---

const RENOVAR_ANTES_MS = 10 * 60 * 1000; // si vence en <10 min, refrescar antes

// Devuelve un access_token válido del gym (desencriptado), refrescándolo con el
// refresh_token si está por vencer. null si no hay conexión usable. SOLO servidor.
export async function getMpAccessTokenValido(
  tenantId: string,
): Promise<string | null> {
  const sb = createServiceClient();
  const { data } = await sb
    .from("mp_cuentas_conectadas")
    .select("access_token_enc, refresh_token_enc, expires_at, estado")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data || data.estado === "desconectada" || !data.access_token_enc) {
    return null;
  }

  const venceMs = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (venceMs - Date.now() > RENOVAR_ANTES_MS) {
    try {
      return mpDecrypt(data.access_token_enc);
    } catch {
      return null;
    }
  }

  // Por vencer o vencido: refrescar con el refresh_token.
  if (!data.refresh_token_enc) return null;
  try {
    const refresh = mpDecrypt(data.refresh_token_enc);
    const tok = await mpRefrescarToken(refresh);
    await sb
      .from("mp_cuentas_conectadas")
      .update({
        access_token_enc: mpEncrypt(tok.access_token),
        refresh_token_enc: mpEncrypt(tok.refresh_token),
        expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
        estado: "conectada",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId);
    return tok.access_token;
  } catch (e) {
    await sb
      .from("mp_cuentas_conectadas")
      .update({
        estado: "error",
        last_error: e instanceof Error ? e.message : "refresh falló",
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId);
    return null;
  }
}
