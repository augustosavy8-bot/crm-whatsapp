"use client";

import { type FilaPuntos, TABLA_TOP } from "@/lib/gymPuntos";

// Tabla completa del ranking del mes. Va en una sección aparte, DEBAJO de sacar
// turno, para no competir con el valor principal. Si el socio no está en el top
// TABLA_TOP, se agrega su propia fila al final mostrada como "+10" (genérico),
// para no revelar cuántos socios hay en el gimnasio.

const medalla = (puesto: number) =>
  puesto === 1 ? "🥇" : puesto === 2 ? "🥈" : puesto === 3 ? "🥉" : `${puesto}`;

function Fila({
  f,
  puestoLabel,
  esMio,
}: {
  f: FilaPuntos;
  puestoLabel: string;
  esMio: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-3 px-4 py-2.5 text-[13px] ${
        esMio ? "bg-accent/10" : ""
      }`}
    >
      <span className="w-8 shrink-0 text-center font-bold text-muted">
        {puestoLabel}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-ink">
        {f.nombre}
        {esMio && (
          <span className="ml-1 text-[11px] font-semibold text-accent">
            (vos)
          </span>
        )}
      </span>
      <span className="shrink-0 text-right text-muted">
        {f.semanasCompletas > 0
          ? `${f.semanasCompletas} sem`
          : `${f.asistencias} asis`}
      </span>
      <span className="w-10 shrink-0 text-right font-bold text-ink">
        {f.puntos}
      </span>
    </li>
  );
}

export default function PuntosTabla({
  ranking,
  miAlumnoId,
}: {
  ranking: FilaPuntos[];
  miAlumnoId: string;
}) {
  if (ranking.length === 0) return null;

  const top = ranking.slice(0, TABLA_TOP);
  const miIndice = ranking.findIndex((f) => f.alumnoId === miAlumnoId);
  const fueraDelTop = miIndice >= TABLA_TOP; // el socio no entra en el top

  return (
    <section className="mb-5">
      <h2 className="mb-2 text-[15px] font-bold tracking-tight">
        Tabla de puntos del mes
      </h2>
      <div className="rounded-panel border border-line bg-surface shadow-card">
        <ul className="divide-y divide-line">
          {top.map((f, i) => (
            <Fila
              key={f.alumnoId}
              f={f}
              puestoLabel={medalla(i + 1)}
              esMio={f.alumnoId === miAlumnoId}
            />
          ))}
          {fueraDelTop && (
            <>
              <li className="px-4 py-1 text-center text-[12px] text-faint">···</li>
              <Fila f={ranking[miIndice]} puestoLabel={`+${TABLA_TOP}`} esMio />
            </>
          )}
        </ul>
      </div>
    </section>
  );
}
