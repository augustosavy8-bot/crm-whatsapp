import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/agent";

// Confirma un turno. No manda ningún mensaje automático: el aviso al paciente,
// si hace falta, es MANUAL (botón de WhatsApp en la agenda). Requiere sesión.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let payload: { turnoId?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const turnoId = payload.turnoId?.trim();
  if (!turnoId) {
    return NextResponse.json({ error: "Falta turnoId" }, { status: 400 });
  }

  const { data: turno, error: turnoErr } = await supabase
    .from("turnos")
    .select("id, profesional_id")
    .eq("id", turnoId)
    .maybeSingle();
  if (turnoErr) {
    return NextResponse.json({ error: turnoErr.message }, { status: 500 });
  }
  if (!turno) {
    // RLS ya oculta los turnos ajenos a un profesional (esto le llega como 404).
    return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
  }

  // Defensa en profundidad sobre la RLS: un profesional solo confirma los
  // propios; el owner, todos.
  if (agent.role === "profesional" && turno.profesional_id !== agent.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { error: updateErr } = await supabase
    .from("turnos")
    .update({ estado: "confirmado" })
    .eq("id", turnoId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
