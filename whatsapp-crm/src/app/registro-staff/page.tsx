import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import RegistroStaffForm from "@/components/RegistroStaffForm";

export const dynamic = "force-dynamic";

// Registro de staff por invitación (profesor + admin). El token viene en la URL
// y se valida server-side. Sin token válido, no se muestra el formulario.
export default async function RegistroStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  let agente: { nombre: string | null } | null = null;
  let motivo = "";

  if (!token) {
    motivo = "Falta el código de invitación.";
  } else {
    const sb = createServiceClient();
    const { data } = await sb
      .from("agents")
      .select("name, auth_user_id, invite_expires_at")
      .eq("invite_token", token)
      .maybeSingle();

    const vencida =
      !!data?.invite_expires_at &&
      // eslint-disable-next-line react-hooks/purity
      new Date(data.invite_expires_at).getTime() < Date.now();

    if (!data || data.auth_user_id) {
      motivo = "La invitación no es válida o ya fue usada.";
    } else if (vencida) {
      motivo = "La invitación venció. Pedí una nueva.";
    } else {
      agente = { nombre: data.name };
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/kinactiva-logo.png"
            alt="KINACTIVA — Centro Integral del Movimiento"
            className="h-24 w-auto"
          />
        </div>

        {agente && token ? (
          <RegistroStaffForm token={token} nombre={agente.nombre} />
        ) : (
          <div className="space-y-3 rounded-panel border border-line bg-surface p-6 text-center shadow-card">
            <h2 className="text-[15px] font-semibold">Invitación no válida</h2>
            <p className="text-[13px] text-muted">{motivo}</p>
            <Link
              href="/login"
              className="inline-block text-xs font-semibold text-accent hover:brightness-90"
            >
              Ir a iniciar sesión
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
