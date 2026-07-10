import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { interpretTurnoText } from "@/lib/ai/interpretTurno";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Interpreta texto libre para prellenar el form de turno. No guarda nada:
// el profesional revisa y confirma con "Crear turno" como siempre.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let payload: { texto?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const texto = payload.texto?.trim();
  if (!texto) {
    return NextResponse.json({ error: "Falta el texto" }, { status: 400 });
  }

  const hoyISO = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const interpretado = await interpretTurnoText(texto, { hoyISO });
  if (!interpretado) {
    return NextResponse.json(
      { error: "No se pudo interpretar el texto" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, interpretado });
}
