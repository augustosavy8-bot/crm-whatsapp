"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CampoConfig, Paciente } from "@/lib/types";
import DynamicField from "@/components/shared/DynamicField";

interface Props {
  tenantId: string;
  campos: CampoConfig[];
  paciente?: Paciente; // si viene, es edición
}

const inputClass =
  "w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20";

export default function PacienteForm({ tenantId, campos, paciente }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const editing = Boolean(paciente);

  const [nombre, setNombre] = useState(paciente?.nombre ?? "");
  const [dni, setDni] = useState(paciente?.dni ?? "");
  const [telefono, setTelefono] = useState(paciente?.telefono ?? "");
  const [email, setEmail] = useState(paciente?.email ?? "");
  const [obraSocial, setObraSocial] = useState(paciente?.obra_social ?? "");
  const [datos, setDatos] = useState<Record<string, unknown>>(
    paciente?.datos ?? {},
  );
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
      const payload = {
        nombre: nombre.trim(),
        dni: dni.trim() || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        obra_social: obraSocial.trim() || null,
        datos,
      };

      let pacienteId = paciente?.id;

      if (editing && pacienteId) {
        const { error } = await supabase
          .from("pacientes")
          .update(payload)
          .eq("id", pacienteId);
        if (error) throw error;
      } else {
        const { data: created, error } = await supabase
          .from("pacientes")
          .insert({ ...payload, tenant_id: tenantId })
          .select("id")
          .single();
        if (error) throw error;
        pacienteId = created.id as string;

        // Autolink silencioso: si ya hay un contacto de WhatsApp con este
        // teléfono en el tenant, lo vinculamos sin pedirle nada al usuario.
        if (payload.telefono) {
          const { data: contact } = await supabase
            .from("contacts")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("phone_number", payload.telefono)
            .maybeSingle();
          if (contact) {
            await supabase
              .from("pacientes")
              .update({ contact_id: contact.id })
              .eq("id", pacienteId);
          }
        }
      }

      router.push(`/pacientes/${pacienteId}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "No se pudo guardar el paciente.");
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
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-semibold text-muted">Nombre *</label>
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted">DNI</label>
          <input
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted">Teléfono</label>
          <input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="549341..."
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted">
            Obra social
          </label>
          <input
            value={obraSocial}
            onChange={(e) => setObraSocial(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {campos.length > 0 && (
        <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          {campos.map((campo) => (
            <DynamicField
              key={campo.id}
              campo={campo}
              value={datos[campo.campo]}
              onChange={setCampo}
            />
          ))}
        </div>
      )}

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
      >
        {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear paciente"}
      </button>
    </form>
  );
}
