"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      // La raíz decide a dónde va según el rol (alumno -> su panel;
      // profesional/owner -> el panel interno).
      router.push("/");
      router.refresh();
    } catch {
      setError("Email o contraseña incorrectos.");
    } finally {
      setLoading(false);
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
            className={`h-24 w-auto${loading ? " logo-entrando" : ""}`}
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
            disabled={loading}
            className="w-full rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
          >
            {loading ? "Procesando…" : "Entrar"}
          </button>

          <p className="text-center text-[11px] text-faint">
            ¿Sos alumno? Pedile el link de acceso al gimnasio.
          </p>
        </form>
      </div>
    </main>
  );
}
