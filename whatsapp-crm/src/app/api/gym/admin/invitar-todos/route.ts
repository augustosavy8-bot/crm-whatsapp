import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent, esGymStaff } from "@/lib/agent";

// Genera links de invitación EN MASA: uno por cada socio que todavía no tiene
// cuenta. Pensado para el padrón importado (142 socios) — hacerlo de a uno es
// inviable. Solo staff del gym. Devuelve [{id, nombre, token}] y el cliente
// arma los links con su propio origin. Regenera el token de los que ya tenían
// uno pendiente (para refrescar el vencimiento), no toca a los que ya tienen
// cuenta.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIAS_VALIDEZ = 7;
const LOTE = 20; // updates en paralelo por tanda

export async function POST(_request: NextRequest) {
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!esGymStaff(agent)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  // Socios sin cuenta (RLS admin_gym_alumnos ya scopea al tenant del staff).
  const { data: pendientes, error } = await supabase
    .from("gym_alumnos")
    .select("id, nombre")
    .is("auth_user_id", null)
    .order("nombre");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!pendientes || pendientes.length === 0) {
    return NextResponse.json({ total: 0, invites: [] });
  }

  const expira = new Date(Date.now() + DIAS_VALIDEZ * 24 * 60 * 60 * 1000).toISOString();
  const invites: { id: string; nombre: string; token: string }[] = [];

  // En tandas para no abrir 142 conexiones de golpe ni pasarnos del timeout.
  for (let i = 0; i < pendientes.length; i += LOTE) {
    const tanda = pendientes.slice(i, i + LOTE);
    await Promise.all(
      tanda.map(async (s) => {
        const token = randomUUID();
        const { error: upErr } = await supabase
          .from("gym_alumnos")
          .update({ invite_token: token, invite_expires_at: expira })
          .eq("id", s.id);
        if (!upErr) invites.push({ id: s.id, nombre: s.nombre as string, token });
      }),
    );
  }

  return NextResponse.json({ total: invites.length, invites, expiresAt: expira });
}
