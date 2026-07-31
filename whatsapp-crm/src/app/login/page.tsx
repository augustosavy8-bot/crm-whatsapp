"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Lee el claim app_role del JWT sin verificar ni pegar a la red (solo para
// decidir a dónde ir; el servidor revalida de todas formas).
function leerAppRole(token: string | undefined): string | undefined {
  if (!token) return undefined;
  try {
    let b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(b64)).app_role as string | undefined;
  } catch {
    return undefined;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Cuánto se muestra la animación de "carrera" antes de navegar (además de lo
// que tarde el login). Ajustable.
const RUN_MS = 1600;

type Fase = "form" | "saliendo" | "run";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fase, setFase] = useState<Fase>("form");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFase("saliendo"); // la tarjeta sale (nocOut)

    // El login arranca YA, en paralelo con la salida de la tarjeta.
    const t0 = Date.now();
    const authP = supabase.auth.signInWithPassword({ email, password });

    await sleep(340); // dejamos salir la tarjeta
    setFase("run"); // aparece el overlay con el logo en carrera

    try {
      const { data, error } = await authP;
      if (error) throw error;

      const rol = leerAppRole(data.session?.access_token);
      const destino =
        rol === "alumno" ? "/mi-cuenta" : rol === "profesional" ? "/gym" : "/";

      // Que la animación se vea: esperamos a que pase RUN_MS (menos si el
      // usuario pidió menos movimiento).
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const objetivo = reduce ? 250 : RUN_MS;
      const transcurrido = Date.now() - t0;
      if (transcurrido < objetivo) await sleep(objetivo - transcurrido);

      router.replace(destino);
    } catch {
      setError("Email o contraseña incorrectos.");
      setFase("form"); // vuelve la tarjeta
    }
  }

  const cargando = fase !== "form";

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-canvas p-6">
      {/* Overlay de carrera: el logo entra corriendo con rastro y estelas */}
      {fase === "run" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-canvas">
          <div className="relative flex h-40 w-72 items-center justify-center">
            {/* Estelas de velocidad, rotadas al eje de la carrera */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3"
              style={{ transform: "rotate(-21deg)" }}
            >
              <span
                className="block h-[3px] w-44 origin-left rounded-full bg-accent/70"
                style={{ animation: "nocStreak 900ms cubic-bezier(.4,0,.2,1) both" }}
              />
              <span
                className="block h-[3px] w-32 origin-left rounded-full bg-accent/50"
                style={{
                  animation: "nocStreak 1000ms cubic-bezier(.4,0,.2,1) 90ms both",
                }}
              />
            </div>

            {/* Tres copias del logo: 2 fantasmas (rastro) + el real */}
            {/* eslint-disable @next/next/no-img-element */}
            <img
              src="/kinactiva-logo.png"
              alt=""
              aria-hidden
              className="absolute h-24 w-auto"
              style={{
                filter: "blur(7px)",
                animation: "nocGhost 1150ms cubic-bezier(.16,.9,.3,1) both",
              }}
            />
            <img
              src="/kinactiva-logo.png"
              alt=""
              aria-hidden
              className="absolute h-24 w-auto"
              style={{
                filter: "blur(3px)",
                animation: "nocGhost 1150ms cubic-bezier(.16,.9,.3,1) 70ms both",
              }}
            />
            <img
              src="/kinactiva-logo.png"
              alt="Entrando a KINACTIVA…"
              className="relative h-24 w-auto"
              style={{
                animation: "nocDash 1150ms cubic-bezier(.16,.9,.3,1) 140ms both",
              }}
            />
            {/* eslint-enable @next/next/no-img-element */}
          </div>

          {/* Progreso + etiquetas que se intercambian */}
          <div className="w-56">
            <div className="h-1 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full w-full origin-left rounded-full bg-accent"
                style={{ animation: "nocFill 2000ms cubic-bezier(.5,.1,.2,1) both" }}
              />
            </div>
            <div className="relative mt-3 h-4">
              <span
                className="absolute inset-0 text-center text-xs text-muted"
                style={{ animation: "nocSwapA 2200ms linear both" }}
              >
                Verificando credenciales…
              </span>
              <span
                className="absolute inset-0 text-center text-xs text-muted"
                style={{ animation: "nocSwapB 2200ms linear both" }}
              >
                Preparando tu panel…
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tarjeta de login (sale con nocOut al enviar) */}
      {fase !== "run" && (
        <div
          className="w-full max-w-sm"
          style={
            fase === "saliendo"
              ? { animation: "nocOut 340ms cubic-bezier(.4,0,.2,1) both" }
              : undefined
          }
        >
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/kinactiva-logo.png"
              alt="KINACTIVA — Centro Integral del Movimiento"
              className="h-24 w-auto"
            />
          </div>

          <form
            onSubmit={onSubmit}
            className="space-y-4 rounded-panel border border-line bg-surface p-6 shadow-card"
          >
            <div>
              <h2 className="text-[15px] font-semibold">Iniciar sesión</h2>
              <p className="mt-0.5 text-xs text-muted">
                Ingresá con tu email y contraseña.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
                placeholder="vos@ejemplo.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">
                Contraseña
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-[13px] text-danger">{error}</p>}

            <button
              type="submit"
              disabled={cargando}
              className="w-full rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
            >
              {cargando ? "Procesando…" : "Entrar"}
            </button>

            <p className="text-center text-[11px] text-faint">
              ¿Sos alumno? Pedile el link de acceso al gimnasio.
            </p>
          </form>
        </div>
      )}
    </main>
  );
}
