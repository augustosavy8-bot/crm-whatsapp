"use client";

import { useState } from "react";
import {
  type FilaPuntos,
  TOP_N,
  TABLA_TOP,
  PUNTOS_SEMANA_COMPLETA,
  PUNTOS_MEDIA_SEMANA,
} from "@/lib/gymPuntos";

// Resumen de Puntos del socio (compacto, va arriba): su puntaje y puesto, el
// TOP 3 del mes y "cómo funciona". La tabla completa es otra sección (PuntosTabla)
// para no taparle protagonismo a sacar turno.

const medalla = (puesto: number) =>
  puesto === 1 ? "🥇" : puesto === 2 ? "🥈" : puesto === 3 ? "🥉" : `${puesto}`;

export default function PuntosSocio({
  ranking,
  miAlumnoId,
  mesLabel,
}: {
  ranking: FilaPuntos[];
  miAlumnoId: string;
  mesLabel: string;
}) {
  const [comoFunciona, setComoFunciona] = useState(false);

  const miIndice = ranking.findIndex((f) => f.alumnoId === miAlumnoId);
  const mia = miIndice >= 0 ? ranking[miIndice] : null;
  const miPuesto = miIndice >= 0 ? miIndice + 1 : null;
  const voyGanando = miPuesto != null && miPuesto <= TOP_N;
  const top3 = ranking.slice(0, 3);

  return (
    <section className="mb-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold tracking-tight">
          Puntos <span className="text-muted">· {mesLabel}</span>
        </h2>
        <button
          type="button"
          onClick={() => setComoFunciona((v) => !v)}
          className="text-[12px] font-semibold text-muted hover:text-ink"
        >
          {comoFunciona ? "Ocultar" : "¿Cómo funciona?"}
        </button>
      </div>

      {/* Mi puntaje + top 3 */}
      <div className="rounded-panel border border-line bg-surface p-4 shadow-card">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[13px] text-muted">Tus puntos este mes</div>
            <div className="text-3xl font-black leading-tight">
              {mia?.puntos ?? 0}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[13px] text-muted">Tu puesto</div>
            <div className="text-xl font-bold">
              {miPuesto ? (miPuesto > TABLA_TOP ? `+${TABLA_TOP}` : `#${miPuesto}`) : "—"}
            </div>
          </div>
        </div>
        <p className="mt-2 text-[13px] text-muted">
          {mia
            ? `${mia.asistencias} asistencia${mia.asistencias === 1 ? "" : "s"} · ${mia.semanasCompletas} semana${mia.semanasCompletas === 1 ? "" : "s"} completa${mia.semanasCompletas === 1 ? "" : "s"}.`
            : "Todavía no sumaste asistencias este mes."}{" "}
          {voyGanando
            ? "🎉 ¡Vas entre los que se llevan el premio!"
            : `Top ${TOP_N} se lleva el premio del mes.`}
        </p>

        {top3.length > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <div className="mb-1.5 text-[12px] font-semibold text-muted">
              Top 3 del mes
            </div>
            <ul className="space-y-1">
              {top3.map((f, i) => {
                const esMio = f.alumnoId === miAlumnoId;
                return (
                  <li
                    key={f.alumnoId}
                    className="flex items-center gap-2 text-[13px]"
                  >
                    <span className="w-5 shrink-0 text-center">
                      {medalla(i + 1)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">
                      {f.nombre}
                      {esMio && (
                        <span className="ml-1 text-[11px] font-semibold text-accent">
                          (vos)
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-bold text-ink">
                      {f.puntos}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Cómo funciona */}
      {comoFunciona && (
        <div className="rounded-panel border border-line bg-surface-2 p-4 text-[13px] leading-relaxed">
          <p className="font-semibold text-ink">Cómo se ganan los puntos</p>
          <ul className="mt-1.5 space-y-1 text-muted">
            <li>
              • <b className="text-ink">Semana completa</b>: si vas todos los días
              de tu plan en la semana, sumás{" "}
              <b className="text-ink">{PUNTOS_SEMANA_COMPLETA} puntos</b>.
            </li>
            <li>
              • <b className="text-ink">Media semana</b>: si vas al menos la mitad
              de los días de tu plan, sumás{" "}
              <b className="text-ink">{PUNTOS_MEDIA_SEMANA} punto</b>.
            </li>
            <li>
              • Tu puntaje del mes es la suma de todas las semanas. A fin de mes,
              los <b className="text-ink">{TOP_N} con más puntos</b> se llevan el
              premio.
            </li>
          </ul>
          <p className="mt-2 text-faint">
            Tu asistencia queda marcada cuando venís a entrenar; con eso ya sumás.
          </p>
        </div>
      )}
    </section>
  );
}
