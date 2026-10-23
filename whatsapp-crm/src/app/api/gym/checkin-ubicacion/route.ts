import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/agent";
import { puntosPanelHabilitado } from "@/lib/gymPuntosPrueba";
import { getCheckinConfig, setCheckinConfig } from "@/lib/gymCheckinConfig";

// Config de ubicación del gym para el anti-trampa del check-in. Solo el admin
// habilitado (mismo gate que el panel de Puntos).
//   GET  -> estado actual.
//   POST -> guardar lat/lng/radio (el admin captura su ubicación en el gym).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent || !puntosPanelHabilitado(agent.email)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const cfg = await getCheckinConfig(agent.tenant_id);
  return NextResponse.json({ ok: true, cfg });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent || !puntosPanelHabilitado(agent.email)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  let body: { lat?: number; lng?: number; radioM?: number };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const radioM = Math.max(30, Math.min(2000, Math.round(Number(body.radioM) || 150)));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Ubicación inválida" }, { status: 400 });
  }

  await setCheckinConfig({ tenantId: agent.tenant_id, lat, lng, radioM });
  return NextResponse.json({ ok: true });
}
