import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/agent";
import {
  mpOauthConfigurado,
  generarVerifier,
  challengeS256,
  mpAuthUrl,
} from "@/lib/mpOauth";
import { crearOauthState } from "@/lib/mpCuentas";
import { appBaseUrl } from "@/lib/appUrl";

// Inicia la conexión OAuth de Mercado Pago del gimnasio. SOLO admin del gym
// (owner / gym_admin). Genera el PKCE (verifier + challenge) y un state anti-CSRF
// de un solo uso, los guarda server-side y redirige a la autorización de MP.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const base = appBaseUrl(new URL(request.url).origin);
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);

  // Solo un admin del gym puede conectar.
  if (!agent || !(agent.role === "owner" || agent.gym_admin)) {
    return NextResponse.redirect(`${base}/gym?mp=forbidden`);
  }
  if (!mpOauthConfigurado()) {
    return NextResponse.redirect(`${base}/gym?mp=sin_config`);
  }

  const verifier = generarVerifier();
  const challenge = challengeS256(verifier);
  const state = await crearOauthState({
    tenantId: agent.tenant_id,
    verifier,
    createdBy: agent.id,
  });

  return NextResponse.redirect(mpAuthUrl({ state, codeChallenge: challenge }));
}
