import { NextResponse, type NextRequest } from "next/server";
import { consumirOauthState, guardarMpConexion } from "@/lib/mpCuentas";
import { mpIntercambiarCode } from "@/lib/mpOauth";
import { appBaseUrl } from "@/lib/appUrl";

// Callback del OAuth de Mercado Pago (URL registrada EXACTA en la app de MP).
// MP redirige acá con ?code & ?state. Se valida el state (de un solo uso, ligado
// al tenant, con el code_verifier del PKCE), se intercambia el code por los
// tokens y se guardan encriptados. Público (lo llama el browser del admin vía
// redirección); la seguridad la da el state, no la sesión.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const base = appBaseUrl(url.origin);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  if (err || !code || !state) {
    return NextResponse.redirect(`${base}/gym?mp=error`);
  }

  // Consume el state (anti-CSRF, de un solo uso). Trae el tenant y el verifier.
  const st = await consumirOauthState(state);
  if (!st) {
    return NextResponse.redirect(`${base}/gym?mp=error_state`);
  }

  try {
    const tok = await mpIntercambiarCode(code, st.verifier);
    await guardarMpConexion({
      tenantId: st.tenantId,
      tok,
      connectedBy: st.createdBy,
    });
    return NextResponse.redirect(`${base}/gym?mp=conectada`);
  } catch (e) {
    console.error("[mp/oauth/callback]", e);
    return NextResponse.redirect(`${base}/gym?mp=error`);
  }
}
