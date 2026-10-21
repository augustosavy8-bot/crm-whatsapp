"use client";

import { useState } from "react";
import {
  type FilaPuntos,
  PUNTOS_POR_ASISTENCIA,
  BONUS_CLASES_SEMANA,
  BONUS_PUNTOS,
  TOP_N,
} from "@/lib/gymPuntos";

// Vista de Puntos del socio (gateada a la cuenta de prueba): su puntaje del mes,
// su puesto en el ranking y cómo se gana. Los puntos salen de la asistencia.

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

  const top = ranking.slice(0, 10);
  const medalla = (puesto: number) =>
    puesto === 1 ? "🥇" : puesto === 2 ? "🥈" : puesto === 3 ? "🥉" : null;

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

      {/* Mi puntaje */}
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
              {miPuesto ? `#${miPuesto}` : "—"}
            </div>
          </div>
        </div>
        {mia ? (
          <p className="mt-2 text-[13px] text-muted">
            {mia.asistencias} asistencia{mia.asistencias === 1 ? "" : "s"}
            {mia.bonus > 0 ? ` · +${mia.bonus} de bonus` : ""}.
            {voyGanando
              ? " 🎉 ¡Vas entre los que se llevan el premio!"
              : miPuesto
                ? ` Top ${TOP_N} se lleva el premio del mes.`
                : ""}
          </p>
        ) : (
          <p className="mt-2 text-[13px] text-muted">
            Todavía no sumaste asistencias este mes. ¡Vení a entrenar y empezá a
            sumar!
          </p>
        )}
      </div>

      {/* Cómo funciona */}
      {comoFunciona && (
        <div className="rounded-panel border border-line bg-surface-2 p-4 text-[13px] leading-relaxed">
          <p className="font-semibold text-ink">Cómo se ganan los puntos</p>
          <ul className="mt-1.5 space-y-1 text-muted">
            <li>
              • <b className="text-ink">{PUNTOS_POR_ASISTENCIA} punto</b> por cada
              clase a la que asistís (cuando queda marcada tu asistencia).
            </li>
            <li>
              • <b className="text-ink">Bonus de constancia:</b> si completás{" "}
              <b className="text-ink">{BONUS_CLASES_SEMANA} clases en una semana</b>,
              sumás <b className="text-ink">+{BONUS_PUNTOS} puntos</b> esa semana.
            </li>
            <li>
              • A fin de mes, los <b className="text-ink">{TOP_N} con más puntos</b>{" "}
              se llevan el premio.
            </li>
          </ul>
          <p className="mt-2 text-faint">
            Próximamente vas a poder marcar tu asistencia escaneando el QR del
            gimnasio o con tu chip.
          </p>
        </div>
      )}

      {/* Ranking */}
      <div className="rounded-panel border border-line bg-surface shadow-card">
        <div className="border-b border-line px-4 py-2.5 text-[13px] font-semibold">
          Tabla del mes
        </div>
        {top.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-faint">
            Todavía no hay asistencias cargadas este mes.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {top.map((f, i) => {
              const puesto = i + 1;
              const esMio = f.alumnoId === miAlumnoId;
              return (
                <li
                  key={f.alumnoId}
                  className={`flex items-center gap-3 px-4 py-2.5 text-[13px] ${
                    esMio ? "bg-accent/10" : ""
                  }`}
                >
                  <span className="w-6 shrink-0 text-center font-bold text-muted">
                    {medalla(puesto) ?? puesto}
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
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
