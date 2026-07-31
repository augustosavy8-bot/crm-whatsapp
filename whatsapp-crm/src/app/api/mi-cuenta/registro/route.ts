import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getGymContext } from "@/lib/gym";
import { normalizeArPhone } from "@/lib/phone";

// Registro de alumno: crea la cuenta de Supabase Auth (confirmada) y la vincula
// a su fila de gym_alumnos ANTES del primer login, para que el hook JWT ya
// emita app_role='alumno'. Si el alumno ya existía (reservó por WhatsApp), se
// reusa su fila por (tenant, teléfono) en vez de duplicarla.
//
// El vínculo lo hace el service client (saltea RLS): esta ruta es la capa de
// confianza. El cliente, tras el ok, hace signInWithPassword y cae en su panel.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Payload {
  nombre?: string;
  telefono?: string;
  email?: string;
  password?: string;
}

export async function POST(request: NextRequest) {
  let body: Payload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const nombre = body.nombre?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  const telefonoRaw = body.telefono?.trim();

  if (!nombre || !email || !telefonoRaw) {
    return NextResponse.json(
      { error: "Faltan datos: nombre, WhatsApp y email son obligatorios." },
      { status: 400 },
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 6 caracteres." },
      { status: 400 },
    );
  }
  const telefono = normalizeArPhone(telefonoRaw);
  if (telefono.length < 10) {
    return NextResponse.json(
      { error: "El número de WhatsApp no parece válido. Revisalo, con código de área." },
      { status: 400 },
    );
  }

  const gym = await getGymContext();
  if (!gym) {
    return NextResponse.json({ error: "Gimnasio no configurado" }, { status: 503 });
  }

  const sb = createServiceClient();

  // ¿Ya hay un alumno con ese teléfono? Si ya tiene cuenta, cortamos.
  const { data: existente } = await sb
    .from("gym_alumnos")
    .select("id, auth_user_id")
    .eq("tenant_id", gym.tenantId)
    .eq("telefono", telefono)
    .maybeSingle();

  if (existente?.auth_user_id) {
    return NextResponse.json(
      { error: "Ese WhatsApp ya tiene una cuenta. Iniciá sesión." },
      { status: 409 },
    );
  }

  // Crea la cuenta de Auth ya confirmada (sin fricción de mail de verificación).
  const { data: created, error: authErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre },
  });

  if (authErr || !created?.user) {
    const dup = /already|registered|exists/i.test(authErr?.message ?? "");
    return NextResponse.json(
      { error: dup ? "Ese email ya tiene una cuenta." : "No se pudo crear la cuenta." },
      { status: dup ? 409 : 400 },
    );
  }
  const authUserId = created.user.id;

  // Vincula (o crea) la fila de gym_alumnos. Si algo falla, borramos la cuenta
  // recién creada para no dejar un usuario huérfano sin alumno.
  try {
    if (existente) {
      const { error } = await sb
        .from("gym_alumnos")
        .update({ auth_user_id: authUserId, email, nombre })
        .eq("id", existente.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from("gym_alumnos").insert({
        tenant_id: gym.tenantId,
        nombre,
        telefono,
        email,
        auth_user_id: authUserId,
      });
      if (error) throw error;
    }
  } catch (e) {
    await sb.auth.admin.deleteUser(authUserId).catch(() => {});
    const msg = e instanceof Error ? e.message : "No se pudo vincular la cuenta.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
