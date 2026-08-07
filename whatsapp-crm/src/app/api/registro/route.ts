import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { notificarNuevoUsuario } from "@/lib/push/send";

// Registro de alumno POR INVITACIÓN. Solo funciona con un token válido, no
// vencido y no usado, generado por el staff (/api/gym/admin/invitar). Crea la
// cuenta de Auth (confirmada) y la vincula a ESA ficha, consumiendo el token.
// No hay auto-registro abierto: sin token válido, no se crea nadie.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Payload {
  token?: string;
  email?: string;
  password?: string;
  telefono?: string; // solo lo usan los socios cuya ficha no traía teléfono
}

export async function POST(request: NextRequest) {
  let body: Payload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const token = body.token?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!token) {
    return NextResponse.json({ error: "Invitación inválida." }, { status: 400 });
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 6 caracteres." },
      { status: 400 },
    );
  }

  const sb = createServiceClient();

  // Valida el token: existe, no vencido, no usado.
  const { data: alumno } = await sb
    .from("gym_alumnos")
    .select("id, nombre, telefono, auth_user_id, invite_expires_at, tenant_id")
    .eq("invite_token", token)
    .maybeSingle();

  if (!alumno || alumno.auth_user_id) {
    return NextResponse.json(
      { error: "La invitación no es válida o ya fue usada." },
      { status: 400 },
    );
  }
  if (
    alumno.invite_expires_at &&
    new Date(alumno.invite_expires_at).getTime() < Date.now()
  ) {
    return NextResponse.json(
      { error: "La invitación venció. Pedile al gimnasio una nueva." },
      { status: 400 },
    );
  }

  // Teléfono: si la ficha ya tenía uno, se respeta. Si no (socios del padrón
  // importado), el alumno lo cargó en el registro y es obligatorio — lo
  // necesita para reservar (el cupo se maneja por teléfono).
  const telActual = (alumno.telefono as string | null)?.trim() ?? "";
  let telefonoFinal = telActual;
  if (!telActual) {
    const t = (body.telefono ?? "").trim();
    if (t.replace(/\D/g, "").length < 8) {
      return NextResponse.json(
        { error: "Ingresá un WhatsApp válido." },
        { status: 400 },
      );
    }
    // No puede pisar el teléfono de otra ficha del mismo gimnasio (índice único).
    const { data: dup } = await sb
      .from("gym_alumnos")
      .select("id")
      .eq("tenant_id", alumno.tenant_id as string)
      .eq("telefono", t)
      .neq("id", alumno.id)
      .maybeSingle();
    if (dup) {
      return NextResponse.json(
        { error: "Ese WhatsApp ya está registrado con otra ficha. Avisá al gimnasio." },
        { status: 409 },
      );
    }
    telefonoFinal = t;
  }

  // Crea la cuenta ya confirmada.
  // es_alumno=true: el trigger handle_new_user lo ve y NO crea agent (los
  // alumnos no son staff). Sin este flag quedaban duplicados con un agent
  // fantasma. Ver migración 0034.
  const { data: created, error: authErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre: alumno.nombre, es_alumno: true },
  });
  if (authErr || !created?.user) {
    const dup = /already|registered|exists/i.test(authErr?.message ?? "");
    return NextResponse.json(
      { error: dup ? "Ese email ya tiene una cuenta." : "No se pudo crear la cuenta." },
      { status: dup ? 409 : 400 },
    );
  }

  // Vincula y consume el token. Si falla, borra la cuenta huérfana.
  const { error: linkErr } = await sb
    .from("gym_alumnos")
    .update({
      auth_user_id: created.user.id,
      email,
      telefono: telefonoFinal,
      invite_token: null,
      invite_expires_at: null,
    })
    .eq("id", alumno.id);

  if (linkErr) {
    await sb.auth.admin.deleteUser(created.user.id).catch(() => {});
    return NextResponse.json({ error: linkErr.message }, { status: 400 });
  }

  // Aviso al dueño (best-effort): se creó una cuenta de alumno.
  if (alumno.tenant_id) {
    await notificarNuevoUsuario(
      alumno.tenant_id as string,
      `${alumno.nombre} (alumno) creó su cuenta: ${email}`,
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
