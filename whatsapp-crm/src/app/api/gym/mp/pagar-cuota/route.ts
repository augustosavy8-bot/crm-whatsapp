import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentAlumno } from "@/lib/alumno";
import { crearPreferenciaPago, mpConfigurado } from "@/lib/mercadopago";

// Pago ÚNICO de la cuota, iniciado por el ALUMNO logueado (no el admin). Toma el
// precio de su plan y crea una preferencia de Checkout Pro; el webhook existente
// acredita el pago aprobado (corre cuota_hasta +1 mes) por external_reference.
// Sin credenciales MP, responde 503 con un mensaje claro (no rompe nada).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const alumno = await getCurrentAlumno(supabase);
  if (!alumno) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!mpConfigurado()) {
    return NextResponse.json(
      { error: "Los pagos online todavía no están habilitados. Pagá en el gimnasio." },
      { status: 503 },
    );
  }

  // El monto sale del precio del plan del socio. Fuente confiable: service
  // client (no depende de que el alumno tenga RLS de lectura sobre gym_planes).
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
    const pref = await crearPreferenciaPago({
      alumnoId: alumno.id,
      montoARS: plan.precio,
      titulo: `Cuota KINACTIVA — ${plan.nombre}`,
      backUrl: `${origin}/mi-cuenta`,
      notificationUrl: `${origin}/api/gym/mp/webhook`,
      email: alumno.email,
    });
    return NextResponse.json({ ok: true, initPoint: pref.init_point });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo iniciar el pago.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
