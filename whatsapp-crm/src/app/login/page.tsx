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
    <main className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-semibold">
            W
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">WhatsApp CRM</h1>
            <p className="text-xs text-neutral-500">Panel interno</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4 shadow-sm"
        >
          <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {mode === "login" ? "Iniciar sesión" : "Crear usuario"}
          </h2>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="vos@ejemplo.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
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
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
          {notice && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
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
            className="w-full text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
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
