"use client";

import { type FilaPuntos } from "@/lib/gymPuntos";

// Tabla completa del ranking del mes. Va en una sección aparte, DEBAJO de sacar
// turno, para no competir con el valor principal. Si el socio no está en el top
// 10, se agrega su propia fila al final.

const medalla = (puesto: number) =>
  puesto === 1 ? "🥇" : puesto === 2 ? "🥈" : puesto === 3 ? "🥉" : `${puesto}`;

function Fila({
  f,
  puesto,
  esMio,
}: {
  f: FilaPuntos;
  puesto: number;
  esMio: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-3 px-4 py-2.5 text-[13px] ${
        esMio ? "bg-accent/10" : ""
      }`}
    >
      <span className="w-6 shrink-0 text-center font-bold text-muted">
        {medalla(puesto)}
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
        {f.asistencias} asis{f.bonus > 0 ? ` · +${f.bonus}` : ""}
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

  const top = ranking.slice(0, 10);
  const miIndice = ranking.findIndex((f) => f.alumnoId === miAlumnoId);
  const fueraDelTop = miIndice >= 10; // el socio no entra en el top 10

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
              puesto={i + 1}
              esMio={f.alumnoId === miAlumnoId}
            />
          ))}
          {fueraDelTop && (
            <>
              <li className="px-4 py-1 text-center text-[12px] text-faint">···</li>
              <Fila f={ranking[miIndice]} puesto={miIndice + 1} esMio />
            </>
          )}
        </ul>
      </div>
    </section>
  );
}
