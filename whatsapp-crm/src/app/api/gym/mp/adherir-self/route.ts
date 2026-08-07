import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentAlumno } from "@/lib/alumno";
import { crearPreapproval, mpConfigurado } from "@/lib/mercadopago";

// Adhesión al débito automático iniciada por el propio ALUMNO (la versión admin
// vive en /api/gym/mp/adherir). Crea el preapproval con el precio de su plan y
// devuelve el link para autorizar la tarjeta una vez. El webhook lo pasa a
// authorized y renueva la cuota cada mes. MP exige email.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Payload {
  email?: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const alumno = await getCurrentAlumno(supabase);
  if (!alumno) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!mpConfigurado()) {
    return NextResponse.json(
      { error: "El débito automático todavía no está habilitado." },
      { status: 503 },
    );
  }

  let body: Payload = {};
  try {
    body = (await request.json()) as Payload;
  } catch {
    // el email es opcional en el body (puede venir de la sesión)
  }
  const email = (body.email?.trim() || alumno.email || "").trim();
  if (!email) {
    return NextResponse.json(
      { error: "Necesitamos tu email para el débito automático." },
      { status: 400 },
    );
  }

  const svc = createServiceClient();
  const { data: al } = await svc
    .from("gym_alumnos")
    .select("id, plan:gym_planes(nombre, precio)")
    .eq("id", alumno.id)
    .maybeSingle();
  const plan = (al?.plan ?? null) as { nombre: string; precio: number } | null;
  if (!plan || !plan.precio || plan.precio <= 0) {
    return NextResponse.json(
      { error: "Todavía no tenés un plan con precio asignado. Consultá en el gimnasio." },
      { status: 400 },
    );
  }

  const origin = new URL(request.url).origin;
  try {
    const pre = await crearPreapproval({
      alumnoId: alumno.id,
      email,
      montoARS: plan.precio,
      backUrl: `${origin}/mi-cuenta`,
      reason: `Cuota mensual KINACTIVA — ${plan.nombre}`,
    });

    await svc
      .from("gym_alumnos")
      .update({
        metodo_pago: "mercadopago",
        mp_preapproval_id: pre.id,
        mp_estado: pre.status ?? "pending",
        // si el alumno cargó un email nuevo, lo guardamos
        ...(body.email?.trim() ? { email } : {}),
      })
      .eq("id", alumno.id);

    return NextResponse.json({ ok: true, initPoint: pre.init_point });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo crear la adhesión.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
