"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Tarjeta para que el alumno cargue su WhatsApp cuando el gimnasio lo dio de
// alta sin número. Sin WhatsApp no puede reservar (el cupo se maneja por
// teléfono), así que se muestra en lugar del flujo de clases.
export default function CompletarTelefono() {
  const router = useRouter();
  const [telefono, setTelefono] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/mi-cuenta/telefono", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefono }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "No se pudo guardar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={guardar}
      className="space-y-3 rounded-panel border border-accent/30 bg-accent-soft/40 p-4"
    >
      <div>
        <h2 className="text-[15px] font-bold">Completá tu WhatsApp</h2>
        <p className="mt-0.5 text-[13px] text-muted">
          Necesitamos tu WhatsApp para poder reservar tus clases. Cargalo una vez
          y listo.
        </p>
      </div>
      <input
        type="tel"
        inputMode="tel"
        required
        value={telefono}
        onChange={(e) => setTelefono(e.target.value)}
        placeholder="Ej. 3512345678"
        className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-accent px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-60"
      >
        {loading ? "Guardando…" : "Guardar WhatsApp"}
      </button>
    </form>
  );
}
