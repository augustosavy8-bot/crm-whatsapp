import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent, esGymStaff } from "@/lib/agent";
import { crearPreapproval, mpConfigurado } from "@/lib/mercadopago";
import { appBaseUrl } from "@/lib/appUrl";

// Genera el link de adhesión al débito automático de MercadoPago para un socio.
// Lo dispara el admin (owner/gym_admin) desde el panel; el link se le pasa al
// socio (por WhatsApp) y él entra una vez a poner la tarjeta. Cuando no hay
// credenciales MP cargadas, responde 503 con un mensaje claro (andamiaje).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Payload {
  alumnoId?: string;
  email?: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!esGymStaff(agent)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  if (!mpConfigurado()) {
    return NextResponse.json(
      { error: "MercadoPago todavía no está configurado (falta el access token)." },
      { status: 503 },
    );
  }

  let body: Payload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const alumnoId = body.alumnoId?.trim();
  if (!alumnoId) return NextResponse.json({ error: "Falta el socio" }, { status: 400 });

  // RLS del cliente de sesión scopea al tenant: si no aparece, no es del gym.
  // El monto sale del precio del plan del socio.
  const { data: alumno } = await supabase
    .from("gym_alumnos")
    .select("id, nombre, email, plan:gym_planes(nombre, precio)")
    .eq("id", alumnoId)
    .maybeSingle();
  if (!alumno) {
    return NextResponse.json({ error: "Socio no encontrado" }, { status: 404 });
  }

  const plan = alumno.plan as unknown as { nombre: string; precio: number } | null;
  if (!plan || !plan.precio || plan.precio <= 0) {
    return NextResponse.json(
      { error: "Asignale primero un plan con precio al socio." },
      { status: 400 },
    );
  }

  const email = (body.email?.trim() || (alumno.email as string | null) || "").trim();
  if (!email) {
    return NextResponse.json(
      { error: "Necesitamos el email del socio para MercadoPago." },
      { status: 400 },
    );
  }

  const origin = appBaseUrl(new URL(request.url).origin);
  try {
    const pre = await crearPreapproval({
      alumnoId,
      email,
      montoARS: plan.precio,
      backUrl: `${origin}/gimnasio/clases`,
      reason: `Cuota mensual KINACTIVA — ${plan.nombre}`,
    });

    // Dejamos registrado el socio como MP + su suscripción (pendiente hasta que
    // autorice). El webhook la pasa a authorized y renueva la cuota.
    await supabase
      .from("gym_alumnos")
      .update({
        metodo_pago: "mercadopago",
        mp_preapproval_id: pre.id,
        mp_estado: pre.status ?? "pending",
        ...(body.email?.trim() ? { email } : {}),
      })
      .eq("id", alumnoId);

    return NextResponse.json({ ok: true, initPoint: pre.init_point });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo crear la adhesión.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
