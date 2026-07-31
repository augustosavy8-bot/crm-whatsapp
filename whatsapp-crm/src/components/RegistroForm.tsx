"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Formulario de registro por invitación. El nombre y el WhatsApp vienen de la
// ficha (bloqueados); el alumno solo define email + contraseña. Tras crear la
// cuenta, inicia sesión y cae en su panel.
export default function RegistroForm({
  token,
  nombre,
  telefono,
}: {
  token: string;
  nombre: string;
  telefono: string;
}) {
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
      const res = await fetch("/api/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo crear la cuenta.");

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "No se pudo crear la cuenta.");
    } finally {
      setLoading(false);
    }
  }

  const locked =
    "w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-muted";
  const input =
    "w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20";

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-panel border border-line bg-surface p-6 shadow-card"
    >
      <div>
        <h2 className="text-[15px] font-semibold">Creá tu cuenta</h2>
        <p className="mt-0.5 text-xs text-muted">
          Definí tu email y contraseña para gestionar tus clases.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted">Nombre</label>
        <div className={locked}>{nombre}</div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted">WhatsApp</label>
        <div className={locked}>{telefono}</div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted">Email</label>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
          placeholder="vos@ejemplo.com"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted">Contraseña</label>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
          placeholder="••••••••"
        />
      </div>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
      >
        {loading ? "Creando…" : "Crear cuenta"}
      </button>
    </form>
  );
}
