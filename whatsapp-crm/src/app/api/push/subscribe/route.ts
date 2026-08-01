import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Guarda la suscripción Web Push del navegador para el agente logueado.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let payload: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const endpoint = payload.endpoint;
  const p256dh = payload.keys?.p256dh;
  const auth = payload.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "Suscripción incompleta" },
      { status: 400 },
    );
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("id, tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // Si no es staff, puede ser un alumno del gym: guardamos su suscripción con
  // alumno_id para poder avisarle (p. ej. cuando le confirman la reserva).
  let alumnoId: string | null = null;
  let tenantId: string | null = agent?.tenant_id ?? null;
  if (!agent) {
    const { data: alumno } = await supabase
      .from("gym_alumnos")
      .select("id, tenant_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (alumno) {
      alumnoId = alumno.id as string;
      tenantId = alumno.tenant_id as string;
    }
  }

  const admin = createServiceClient();
  const { error } = await admin
    .from("push_subscriptions")
    .upsert(
      {
        agent_id: agent?.id ?? null,
        alumno_id: alumnoId,
        tenant_id: tenantId,
        endpoint,
        p256dh,
        auth,
      },
      { onConflict: "endpoint" },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
