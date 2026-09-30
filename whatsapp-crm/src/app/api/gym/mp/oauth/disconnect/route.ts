import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/agent";
import { desconectarMp } from "@/lib/mpCuentas";

// Desconecta la cuenta de MP del gym (borra los tokens, marca desconectada).
// Solo admin (owner / gym_admin).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent || !(agent.role === "owner" || agent.gym_admin)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  await desconectarMp(agent.tenant_id);
  return NextResponse.json({ ok: true });
}
