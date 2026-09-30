import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/agent";
import { getMpConexionPublica } from "@/lib/mpCuentas";
import { mpOauthConfigurado } from "@/lib/mpOauth";

// Estado seguro (sin tokens) de la conexión de MP del gym, para el panel admin.
// Solo admin (owner / gym_admin).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent || !(agent.role === "owner" || agent.gym_admin)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const conexion = await getMpConexionPublica(agent.tenant_id);
  return NextResponse.json({
    ok: true,
    configurado: mpOauthConfigurado(),
    conexion,
  });
}
