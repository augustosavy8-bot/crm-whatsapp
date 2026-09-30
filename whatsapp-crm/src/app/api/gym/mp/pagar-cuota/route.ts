import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentAlumno } from "@/lib/alumno";
import { crearPreferenciaPago } from "@/lib/mercadopago";
import { mpHabilitadoParaAlumno } from "@/lib/gymMpPrueba";
import { getMpAccessTokenValido, getMpConfig } from "@/lib/mpCuentas";
import { appBaseUrl } from "@/lib/appUrl";

// Pago de la cuota iniciado por el ALUMNO logueado. Marketplace: la preferencia
// se crea con el ACCESS TOKEN DEL GYM (OAuth) y se retiene la comisión de
// plataforma vía marketplace_fee (MONTO fijo = % de la cuota, calculado en el
// server). Quién absorbe el fee (gym o socio) sale de la config de plataforma.
// El webhook acredita el pago aprobado por external_reference.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const alumno = await getCurrentAlumno(supabase);
  if (!alumno) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // TEMPORAL: el pago online está habilitado solo para cuentas de prueba.
  if (!mpHabilitadoParaAlumno(alumno.telefono)) {
    return NextResponse.json(
      { error: "El pago online todavía no está habilitado." },
      { status: 403 },
    );
  }

  // Token del gym (OAuth). Si el gym no tiene MP conectado (o el token no se
  // pudo refrescar), no se puede cobrar: el botón además queda oculto en la UI.
  const accessToken = await getMpAccessTokenValido(alumno.tenant_id);
  if (!accessToken) {
    return NextResponse.json(
      { error: "El gimnasio todavía no tiene Mercado Pago conectado." },
      { status: 409 },
    );
  }

  // Precio del plan del socio (service client: no depende del RLS del alumno).
  const svc = createServiceClient();
  const { data: al } = await svc
    .from("gym_alumnos")
    .select("plan:gym_planes(nombre, precio)")
    .eq("id", alumno.id)
    .maybeSingle();
  const plan = (al?.plan ?? null) as { nombre: string; precio: number } | null;
  if (!plan || !plan.precio || plan.precio <= 0) {
    return NextResponse.json(
      { error: "Todavía no tenés un plan con precio asignado. Consultá en el gimnasio." },
      { status: 400 },
    );
  }

  const precio = plan.precio;
  const cfg = await getMpConfig();
  const fee = Math.round((precio * cfg.comisionPct) / 100); // marketplace_fee (monto)

  // (a) lo absorbe el gym: el socio paga la cuota; el fee sale del neto del gym.
  // (b) lo paga el socio: se suma "Gastos de servicio" al total que paga.
  const items =
    cfg.quienPaga === "socio"
      ? [
          { titulo: `Cuota KINACTIVA — ${plan.nombre}`, monto: precio },
          { titulo: "Gastos de servicio", monto: fee },
        ]
      : [{ titulo: `Cuota KINACTIVA — ${plan.nombre}`, monto: precio }];

  const origin = appBaseUrl(new URL(request.url).origin);
  try {
    const pref = await crearPreferenciaPago({
      accessToken,
      alumnoId: alumno.id,
      items,
      backUrl: `${origin}/mi-cuenta`,
      notificationUrl: `${origin}/api/gym/mp/webhook`,
      email: alumno.email,
      marketplaceFee: fee,
    });
    return NextResponse.json({ ok: true, initPoint: pref.init_point });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo iniciar el pago.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
