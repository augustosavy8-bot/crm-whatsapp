import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/agent";
import { createServiceClient } from "@/lib/supabase/service";
import { appBaseUrl } from "@/lib/appUrl";

// Recuperación de contraseña SIN email: un admin (owner o gym_admin) genera un
// link de recuperación para un usuario de SU gimnasio y se lo pasa por fuera
// (WhatsApp), igual que la invitación de alumno. El link abre /reset con una
// sesión de recuperación para elegir una clave nueva.
//
// La app es invite-only y sin SMTP a propósito; esto evita depender de mail.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  // Acción de administración: solo owner o gym_admin.
  if (!(agent.role === "owner" || agent.gym_admin)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }

  // El email tiene que ser de un usuario del MISMO tenant. Se verifica con el
  // cliente de sesión (RLS scopea a tenant): un agent del tenant (lo ve el
  // owner) o un alumno con cuenta (lo ve el staff del gym).
  const { data: ag } = await supabase
    .from("agents")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  let pertenece = !!ag;
  if (!pertenece) {
    const { data: al } = await supabase
      .from("gym_alumnos")
      .select("id, auth_user_id")
      .eq("email", email)
      .maybeSingle();
    pertenece = !!al?.auth_user_id;
  }
  if (!pertenece) {
    return NextResponse.json(
      { error: "Ese email no tiene una cuenta en tu gimnasio." },
      { status: 404 },
    );
  }

  // Genera el link de recuperación (no manda email). Vuelve a /reset.
  const origin = appBaseUrl(new URL(request.url).origin);
  const svc = createServiceClient();
  const { data, error } = await svc.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${origin}/reset` },
  });
  const link = data?.properties?.action_link;
  if (error || !link) {
    return NextResponse.json(
      { error: "No se pudo generar el link de recuperación." },
      { status: 400 },
    );
  }

  return NextResponse.json({ link });
}
