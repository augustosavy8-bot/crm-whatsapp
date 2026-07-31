import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent, esGymStaff } from "@/lib/agent";

// Genera (o regenera) el token de invitación de un alumno para que cree su
// cuenta. Solo staff del gym. El update pasa por RLS (admin_gym_alumnos). No se
// puede invitar a quien ya tiene cuenta. Devuelve el token; el cliente arma el
// link con su propio origin.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIAS_VALIDEZ = 7;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!esGymStaff(agent)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  let body: { alumnoId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const alumnoId = body.alumnoId?.trim();
  if (!alumnoId) {
    return NextResponse.json({ error: "Falta el alumno" }, { status: 400 });
  }

  // ¿Ya tiene cuenta? Entonces no hay nada que invitar.
  const { data: alumno, error: readErr } = await supabase
    .from("gym_alumnos")
    .select("id, auth_user_id")
    .eq("id", alumnoId)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 400 });
  }
  if (!alumno) {
    return NextResponse.json({ error: "Alumno no encontrado" }, { status: 404 });
  }
  if (alumno.auth_user_id) {
    return NextResponse.json(
      { error: "Ese alumno ya tiene una cuenta." },
      { status: 409 },
    );
  }

  const token = randomUUID();
  const expira = new Date(Date.now() + DIAS_VALIDEZ * 24 * 60 * 60 * 1000);

  const { error: upErr } = await supabase
    .from("gym_alumnos")
    .update({ invite_token: token, invite_expires_at: expira.toISOString() })
    .eq("id", alumnoId);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 400 });
  }

  return NextResponse.json({ token, expiresAt: expira.toISOString() });
}
