import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent, esGymStaff } from "@/lib/agent";

// Asigna (o cambia) el plan de un socio (define el precio de su cuota). Solo staff.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!esGymStaff(agent)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  let body: { socioId?: string; planId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const socioId = body.socioId?.trim();
  const planId = body.planId ? body.planId.trim() : null;
  if (!socioId) return NextResponse.json({ error: "Falta el socio" }, { status: 400 });

  const { error } = await supabase
    .from("gym_alumnos")
    .update({ plan_id: planId })
    .eq("id", socioId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
