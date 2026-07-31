import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent, esGymStaff } from "@/lib/agent";
import { actualizarPreapprovalMonto, mpConfigurado } from "@/lib/mercadopago";

// Asigna (o cambia) el plan de un socio. Si el socio ya tiene débito automático
// activo y cambia de plan, se actualiza el monto de su suscripción al precio
// del nuevo plan. Solo staff.
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

  // Si tiene débito activo y ahora hay un plan con precio, sincronizamos el
  // monto de la suscripción con MercadoPago (best-effort).
  let sincronizado = false;
  if (planId && mpConfigurado()) {
    const { data: socio } = await supabase
      .from("gym_alumnos")
      .select("mp_preapproval_id, mp_estado")
      .eq("id", socioId)
      .maybeSingle();
    const pre = socio?.mp_preapproval_id as string | null;
    const estado = socio?.mp_estado as string | null;
    if (pre && (estado === "authorized" || estado === "pending")) {
      const { data: plan } = await supabase
        .from("gym_planes")
        .select("precio")
        .eq("id", planId)
        .maybeSingle();
      const precio = plan?.precio as number | undefined;
      if (typeof precio === "number") {
        try {
          await actualizarPreapprovalMonto(pre, precio);
          sincronizado = true;
        } catch {
          // best-effort: el plan igual quedó asignado.
        }
      }
    }
  }

  return NextResponse.json({ ok: true, sincronizado });
}
