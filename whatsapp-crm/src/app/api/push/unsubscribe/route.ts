import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Elimina una suscripción Web Push por su endpoint.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let payload: { endpoint?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!payload.endpoint) {
    return NextResponse.json({ error: "Falta endpoint" }, { status: 400 });
  }

  const admin = createServiceClient();
  await admin
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", payload.endpoint);
  return NextResponse.json({ ok: true });
}
