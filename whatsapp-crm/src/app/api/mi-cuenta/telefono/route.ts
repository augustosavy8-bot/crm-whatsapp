import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentAlumno } from "@/lib/alumno";
import { normalizeArPhone } from "@/lib/phone";

// El alumno completa SU WhatsApp cuando el staff no lo cargó al darlo de alta.
// Solo se puede COMPLETAR (cuando está vacío), no pisar uno ya puesto por el
// gimnasio. Valida el número y que no choque con otra ficha del mismo tenant.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const alumno = await getCurrentAlumno(supabase);
  if (!alumno) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (alumno.telefono) {
    return NextResponse.json(
      { error: "Ya tenés un WhatsApp cargado. Si está mal, avisá al gimnasio." },
      { status: 409 },
    );
  }

  let body: { telefono?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const telefono = normalizeArPhone((body.telefono ?? "").trim());
  if (telefono.length < 10) {
    return NextResponse.json(
      { error: "El número de WhatsApp no parece válido. Revisalo, con código de área." },
      { status: 400 },
    );
  }

  // No pisar el teléfono de otra ficha del mismo gimnasio (índice único).
  const svc = createServiceClient();
  const { data: dup } = await svc
    .from("gym_alumnos")
    .select("id")
    .eq("tenant_id", alumno.tenant_id)
    .eq("telefono", telefono)
    .neq("id", alumno.id)
    .maybeSingle();
  if (dup) {
    return NextResponse.json(
      { error: "Ese WhatsApp ya está registrado con otra ficha. Avisá al gimnasio." },
      { status: 409 },
    );
  }

  const { error } = await svc
    .from("gym_alumnos")
    .update({ telefono })
    .eq("id", alumno.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, telefono });
}
