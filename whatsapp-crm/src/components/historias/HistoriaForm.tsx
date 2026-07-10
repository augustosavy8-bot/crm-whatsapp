"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CampoConfig } from "@/lib/types";
import DynamicField from "@/components/shared/DynamicField";

interface Props {
  tenantId: string;
  pacienteId: string;
  profesionalId: string | null;
  campos: CampoConfig[];
}

export default function HistoriaForm({
  tenantId,
  pacienteId,
  profesionalId,
  campos,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [datos, setDatos] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setCampo(campo: string, value: unknown) {
    setDatos((prev) => ({ ...prev, [campo]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { error } = await supabase.from("historias_clinicas").insert({
        tenant_id: tenantId,
        paciente_id: pacienteId,
        profesional_id: profesionalId,
        datos,
      });
      if (error) throw error;
      router.push(`/pacientes/${pacienteId}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "No se pudo guardar la entrada.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 rounded-panel border border-line bg-surface p-6 shadow-card"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {campos.map((campo) => (
          <div
            key={campo.id}
            className={
              campo.tipo === "textarea" ? "sm:col-span-2" : undefined
            }
          >
            <DynamicField
              campo={campo}
              value={datos[campo.campo]}
              onChange={setCampo}
            />
          </div>
        ))}
      </div>

      {campos.length === 0 && (
        <p className="text-sm text-muted">
          Este rubro todavía no tiene campos de historia clínica configurados.
        </p>
      )}

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
      >
        {saving ? "Guardando…" : "Guardar entrada"}
      </button>
    </form>
  );
}
