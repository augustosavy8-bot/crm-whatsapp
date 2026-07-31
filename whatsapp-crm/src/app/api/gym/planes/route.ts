import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent, esGymStaff } from "@/lib/agent";
import { actualizarPreapprovalMonto, mpConfigurado } from "@/lib/mercadopago";

// Planes del gimnasio (precio de la cuota por días/semana). Solo staff.
//   POST  -> crear plan.
//   PATCH -> editar plan; si cambia el precio, actualiza el débito automático
//            de los socios ya adheridos a ese plan (MercadoPago).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!esGymStaff(agent)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  let body: { nombre?: string; dias_semana?: unknown; precio?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const nombre = body.nombre?.trim();
  const precio = toInt(body.precio);
  const dias = toInt(body.dias_semana);
  if (!nombre) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
  if (precio === null || precio < 0) {
    return NextResponse.json({ error: "Precio inválido" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("gym_planes")
    .insert({
      tenant_id: agent.tenant_id,
      nombre,
      dias_semana: dias,
      precio,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, plan: data });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!esGymStaff(agent)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  let body: {
    id?: string;
    nombre?: string;
    dias_semana?: unknown;
    precio?: unknown;
    activo?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const id = body.id?.trim();
  if (!id) return NextResponse.json({ error: "Falta el plan" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.nombre !== undefined) patch.nombre = body.nombre.trim();
  if (body.dias_semana !== undefined) patch.dias_semana = toInt(body.dias_semana);
  if (body.activo !== undefined) patch.activo = body.activo;

  let precioNuevo: number | null = null;
  if (body.precio !== undefined) {
    precioNuevo = toInt(body.precio);
    if (precioNuevo === null || precioNuevo < 0) {
      return NextResponse.json({ error: "Precio inválido" }, { status: 400 });
    }
    patch.precio = precioNuevo;
  }

  const { error } = await supabase.from("gym_planes").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Propagar el precio nuevo a los débitos automáticos ya activos de ese plan.
  let actualizados = 0;
  let fallidos = 0;
  if (precioNuevo !== null && mpConfigurado()) {
    const { data: subs } = await supabase
      .from("gym_alumnos")
      .select("mp_preapproval_id, mp_estado")
      .eq("plan_id", id)
      .not("mp_preapproval_id", "is", null);
    for (const s of subs ?? []) {
      const estado = s.mp_estado as string | null;
      const pre = s.mp_preapproval_id as string | null;
      if (!pre || (estado !== "authorized" && estado !== "pending")) continue;
      try {
        await actualizarPreapprovalMonto(pre, precioNuevo);
        actualizados++;
      } catch {
        fallidos++;
      }
    }
  }

  return NextResponse.json({ ok: true, actualizados, fallidos });
}
