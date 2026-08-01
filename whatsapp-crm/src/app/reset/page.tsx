"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Página de recuperación de contraseña. Se llega por el link que genera un
// admin (/api/admin/recuperar). Al abrirlo, Supabase deja una sesión de
// recuperación; acá el usuario elige una clave nueva (updateUser) y entra.
export default function ResetPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [listo, setListo] = useState(false); // hay sesión de recuperación
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let vivo = true;
    // La sesión puede venir ya resuelta del hash, o llegar por el evento.
    supabase.auth.getSession().then(({ data }) => {
      if (vivo && data.session) setListo(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session) setListo(true);
    });
    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (pw !== pw2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setGuardando(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setGuardando(false);
    if (error) {
      setError("No se pudo cambiar la contraseña. Pedí un link nuevo al gimnasio.");
      return;
    }
    setOk(true);
    // La raíz rutea según el rol (alumno -> /mi-cuenta, staff -> /gym).
    setTimeout(() => router.replace("/"), 1400);
  }

  const input =
    "w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20";

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-canvas p-5">
      <div className="w-full max-w-sm space-y-5 rounded-panel border border-line bg-surface p-6 shadow-card">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/kinactiva-mark.png" alt="" aria-hidden className="h-7 w-auto" />
          <span className="text-[17px] font-extrabold tracking-tight">
            <span className="text-brand">KIN</span>
            <span className="text-accent">ACTIVA</span>
          </span>
        </div>

        {ok ? (
          <div className="space-y-1">
            <h1 className="text-lg font-bold text-ink">¡Listo!</h1>
            <p className="text-sm text-muted">
              Cambiaste tu contraseña. Entrando…
            </p>
          </div>
        ) : listo ? (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <h1 className="text-lg font-bold text-ink">Nueva contraseña</h1>
              <p className="text-sm text-muted">Elegí una clave nueva para entrar.</p>
            </div>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Nueva contraseña"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className={input}
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Repetir contraseña"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              className={input}
            />
            {error && <p className="text-[13px] text-danger">{error}</p>}
            <button
              type="submit"
              disabled={guardando}
              className="w-full rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-white transition-colors hover:brightness-95 disabled:opacity-60"
            >
              {guardando ? "Guardando…" : "Cambiar contraseña"}
            </button>
          </form>
        ) : (
          <div className="space-y-1">
            <h1 className="text-lg font-bold text-ink">Link de recuperación</h1>
            <p className="text-sm text-muted">
              Abrí el link de recuperación que te pasó el gimnasio. Si ya lo
              abriste y ves esto, el link pudo haber vencido: pedí uno nuevo.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
