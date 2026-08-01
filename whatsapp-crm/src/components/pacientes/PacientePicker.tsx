"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buscarPacientes, getPaciente, type PacienteOpcion } from "@/lib/pacientes";

// Buscador de pacientes con resultados acotados (server-side, .limit()). Sustituye
// al <select> que renderizaba TODO el padrón (inusable a miles). Escribe y elige.
export default function PacientePicker({
  defaultPacienteId,
  onSelect,
}: {
  defaultPacienteId?: string;
  onSelect: (id: string) => void;
}) {
  const [sb] = useState(() => createClient());
  const [q, setQ] = useState("");
  const [opciones, setOpciones] = useState<PacienteOpcion[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [elegido, setElegido] = useState<PacienteOpcion | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Preselección (venís de "Nuevo turno" desde la ficha de un paciente).
  useEffect(() => {
    if (!defaultPacienteId) return;
    let vigente = true;
    getPaciente(sb, defaultPacienteId).then((p) => {
      if (vigente && p) {
        setElegido({ id: p.id, nombre: p.nombre });
        onSelect(p.id);
      }
    });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPacienteId]);

  // Búsqueda con debounce mientras el dropdown está abierto.
  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    const t = setTimeout(async () => {
      try {
        const res = await buscarPacientes(sb, q);
        if (vigente) setOpciones(res);
      } catch {
        if (vigente) setOpciones([]);
      }
    }, 200);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [q, abierto, sb]);

  // Cerrar al hacer click afuera.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function elegir(p: PacienteOpcion) {
    setElegido(p);
    onSelect(p.id);
    setAbierto(false);
    setQ("");
  }

  const inputClass =
    "w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20";

  return (
    <div ref={boxRef} className="relative">
      {elegido && !abierto ? (
        <button
          type="button"
          onClick={() => {
            setAbierto(true);
            setOpciones([]);
          }}
          className={`${inputClass} flex items-center justify-between text-left`}
        >
          <span>{elegido.nombre}</span>
          <span className="text-[12px] font-semibold text-accent">Cambiar</span>
        </button>
      ) : (
        <input
          type="text"
          autoFocus={abierto}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setAbierto(true)}
          placeholder="Buscá por nombre o teléfono…"
          className={inputClass}
        />
      )}

      {abierto && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-line bg-surface shadow-pop">
          {opciones.length === 0 ? (
            <p className="px-3.5 py-2.5 text-[13px] text-muted">
              {q.trim() ? "Sin resultados." : "Escribí para buscar…"}
            </p>
          ) : (
            opciones.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => elegir(p)}
                className="block w-full px-3.5 py-2.5 text-left text-[14px] text-ink hover:bg-surface-2"
              >
                {p.nombre}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
