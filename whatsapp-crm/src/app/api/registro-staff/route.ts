import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { notificarNuevoUsuario } from "@/lib/push/send";

// Registro de STAFF por invitación. Solo con un invite_token válido (no vencido,
// no usado) puesto por un admin sobre una ficha de `agents` que espera login.
// La persona define SU email + contraseña. Crea la cuenta de Auth (confirmada);
// el trigger handle_new_user reclama el agent por email, y acá se sella el rol.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Payload {
  token?: string;
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

  // Token válido, no vencido, y la ficha todavía sin login.
  const { data: agent } = await sb
    .from("agents")
    .select("id, auth_user_id, invite_expires_at, tenant_id, name, gym_admin")
    .eq("invite_token", token)
    .maybeSingle();

  if (!agent || agent.auth_user_id) {
    return NextResponse.json(
      { error: "La invitación no es válida o ya fue usada." },
      { status: 400 },
    );
  }
  if (
    agent.invite_expires_at &&
    new Date(agent.invite_expires_at).getTime() < Date.now()
  ) {
    return NextResponse.json(
      { error: "La invitación venció. Pedí una nueva." },
      { status: 400 },
    );
  }

  // El email va PRIMERO en la ficha: así, al crear el auth.user, el trigger
  // handle_new_user reclama ESTE agent por email (no crea uno nuevo).
  await sb.from("agents").update({ email }).eq("id", agent.id);

  const { data: created, error: authErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr || !created?.user) {
    // Revertir el email para no dejar la ficha con un mail sin cuenta.
    await sb.from("agents").update({ email: null }).eq("id", agent.id);
    const dup = /already|registered|exists/i.test(authErr?.message ?? "");
    return NextResponse.json(
      { error: dup ? "Ese email ya tiene una cuenta." : "No se pudo crear la cuenta." },
      { status: dup ? 409 : 400 },
    );
  }

  // Sella el vínculo y los permisos, y consume el token. El rol es profesor;
  // que sea admin (acceso a cobros) depende de cómo se creó la invitación:
  // un profe "solo agenda" se invita con gym_admin=false. auth_user_id ya lo
  // dejó el trigger; se re-afirma por las dudas.
  const esAdmin = agent.gym_admin === true;
  const { error: linkErr } = await sb
    .from("agents")
    .update({
      auth_user_id: created.user.id,
      role: "profesional",
      gym_admin: esAdmin,
      invite_token: null,
      invite_expires_at: null,
    })
    .eq("id", agent.id);

  if (linkErr) {
    await sb.auth.admin.deleteUser(created.user.id).catch(() => {});
    return NextResponse.json({ error: linkErr.message }, { status: 400 });
  }

  // Si el trigger llegó a crear un agent duplicado para este user, se limpia.
  await sb
    .from("agents")
    .delete()
    .eq("auth_user_id", created.user.id)
    .neq("id", agent.id);

  // Aviso al dueño (best-effort): se creó una cuenta de staff.
  if (agent.tenant_id) {
    await notificarNuevoUsuario(
      agent.tenant_id as string,
      `${agent.name ?? "Un profesor"} (${esAdmin ? "profesor/admin" : "profesor"}) creó su cuenta: ${email}`,
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
