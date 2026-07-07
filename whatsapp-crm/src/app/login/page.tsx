"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/inbox");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        // Si "Confirm email" está activo en Supabase, no hay sesión todavía.
        if (data.session) {
          router.push("/inbox");
          router.refresh();
        } else {
          setNotice(
            "Usuario creado. Si tu proyecto pide confirmar email, confirmalo (o creá el usuario ya confirmado desde Supabase → Authentication → Add user) y luego iniciá sesión.",
          );
          setMode("login");
        }
      }
    } catch (err) {
      setError((err as Error).message || "No se pudo autenticar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-base font-bold text-white">
            F
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight tracking-tight">
              WhatsApp CRM
            </h1>
            <p className="text-xs text-muted">Panel interno</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-panel border border-line bg-surface p-6 shadow-card"
        >
          <h2 className="text-[15px] font-semibold">
            {mode === "login" ? "Iniciar sesión" : "Crear usuario"}
          </h2>

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
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-[13px] text-danger">{error}</p>}
          {notice && <p className="text-[13px] text-ok">{notice}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
          >
            {loading
              ? "Procesando…"
              : mode === "login"
                ? "Entrar"
                : "Crear usuario"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
              setNotice(null);
            }}
            className="w-full text-xs font-medium text-muted hover:text-ink"
          >
            {mode === "login"
              ? "¿No tenés usuario? Crear uno"
              : "Ya tengo usuario · iniciar sesión"}
          </button>
        </form>
      </div>
    </main>
  );
}
