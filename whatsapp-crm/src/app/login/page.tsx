"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"login" | "registro">("login");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tras autenticar, la raíz decide a dónde va según el rol (alumno -> su
  // panel; profesional/owner -> el panel interno). No decidimos acá.
  async function irAlPanel() {
    router.push("/");
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        await irAlPanel();
      } else {
        // Registro de alumno: crea la cuenta + vincula su ficha, y recién
        // después inicia sesión (así el token ya trae el rol de alumno).
        const res = await fetch("/api/mi-cuenta/registro", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre, telefono, email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudo crear la cuenta.");

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        await irAlPanel();
      }
    } catch (err) {
      setError((err as Error).message || "No se pudo autenticar.");
    } finally {
      setLoading(false);
    }
  }

  const esRegistro = mode === "registro";

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

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-panel border border-line bg-surface p-6 shadow-card"
        >
          <div>
            <h2 className="text-[15px] font-semibold">
              {esRegistro ? "Creá tu cuenta" : "Iniciar sesión"}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {esRegistro
                ? "Para reservar y ver tus clases del gimnasio."
                : "Ingresá con tu email y contraseña."}
            </p>
          </div>

          {esRegistro && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted">
                  Nombre y apellido
                </label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
                  placeholder="Tu nombre"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted">
                  WhatsApp
                </label>
                <input
                  type="tel"
                  required
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
                  placeholder="Cód. de área + número"
                />
              </div>
            </>
          )}

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
              autoComplete={esRegistro ? "new-password" : "current-password"}
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
            {loading
              ? "Procesando…"
              : esRegistro
                ? "Crear cuenta"
                : "Entrar"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(esRegistro ? "login" : "registro");
              setError(null);
            }}
            className="w-full text-xs font-medium text-muted hover:text-ink"
          >
            {esRegistro
              ? "Ya tengo cuenta · iniciar sesión"
              : "¿Sos alumno y no tenés cuenta? Creá una"}
          </button>
        </form>
      </div>
    </main>
  );
}
