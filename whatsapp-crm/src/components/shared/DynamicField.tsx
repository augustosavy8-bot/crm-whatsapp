"use client";

import type { CampoConfig } from "@/lib/types";

interface Props {
  campo: CampoConfig;
  value: unknown;
  onChange: (campo: string, value: unknown) => void;
}

// Input genérico para una fila de `campos_config`. Reusado por el form de
// paciente y el de historia clínica: mismo look que el resto de la UI.
export default function DynamicField({ campo, value, onChange }: Props) {
  const inputClass =
    "w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20";

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted">
        {campo.etiqueta}
        {campo.obligatorio && <span className="text-danger"> *</span>}
      </label>

      {campo.tipo === "textarea" && (
        <textarea
          required={campo.obligatorio}
          rows={3}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(campo.campo, e.target.value)}
          className={inputClass}
        />
      )}

      {campo.tipo === "text" && (
        <input
          type="text"
          required={campo.obligatorio}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(campo.campo, e.target.value)}
          className={inputClass}
        />
      )}

      {campo.tipo === "number" && (
        <input
          type="number"
          required={campo.obligatorio}
          value={(value as number | string) ?? ""}
          onChange={(e) =>
            onChange(
              campo.campo,
              e.target.value === "" ? null : Number(e.target.value),
            )
          }
          className={inputClass}
        />
      )}

      {campo.tipo === "date" && (
        <input
          type="date"
          required={campo.obligatorio}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(campo.campo, e.target.value)}
          className={inputClass}
        />
      )}

      {campo.tipo === "select" && (
        <select
          required={campo.obligatorio}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(campo.campo, e.target.value)}
          className={inputClass}
        >
          <option value="">—</option>
          {campo.opciones.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      )}

      {campo.tipo === "boolean" && (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(campo.campo, e.target.checked)}
            className="h-4 w-4 rounded border-line accent-accent"
          />
          Sí
        </label>
      )}
    </div>
  );
}
