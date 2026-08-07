import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import RegistroForm from "@/components/RegistroForm";

export const dynamic = "force-dynamic";

// Registro por invitación. El token viene en la URL; se valida server-side con
// el service client (el visitante no tiene sesión). Sin token válido, no se
// muestra el formulario.
export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  let alumno: { nombre: string; telefono: string | null } | null = null;
  let motivo = "";

  if (!token) {
    motivo = "Falta el código de invitación.";
  } else {
    const sb = createServiceClient();
    const { data } = await sb
      .from("gym_alumnos")
      .select("nombre, telefono, auth_user_id, invite_expires_at")
      .eq("invite_token", token)
      .maybeSingle();

    // Server Component async: corre por request, así que comparar contra el
    // reloj es correcto (no es un render de cliente que deba ser puro).
    const vencida =
      !!data?.invite_expires_at &&
      // eslint-disable-next-line react-hooks/purity
      new Date(data.invite_expires_at).getTime() < Date.now();

    if (!data || data.auth_user_id) {
      motivo = "La invitación no es válida o ya fue usada.";
    } else if (vencida) {
      motivo = "La invitación venció. Pedile al gimnasio una nueva.";
    } else {
      alumno = { nombre: data.nombre, telefono: data.telefono };
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

        {alumno && token ? (
          <RegistroForm token={token} nombre={alumno.nombre} telefono={alumno.telefono} />
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
