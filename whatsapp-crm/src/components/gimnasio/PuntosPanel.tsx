"use client";

import { type PuntosData } from "@/lib/gymPuntosData";
import PuntosTabla from "@/components/gimnasio/PuntosTabla";
import UbicacionCheckin from "@/components/gimnasio/UbicacionCheckin";

// Panel de Puntos para el staff (admin): el QR de check-in del gym para imprimir
// y el ranking del mes. No es socio, así que la tabla no resalta ninguna fila.
export default function PuntosPanel({ data }: { data: PuntosData }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-bold tracking-tight">
          Puntos <span className="text-muted">· {data.mesLabel}</span>
        </h3>
      </div>

      <div className="rounded-panel border border-line bg-surface p-4 shadow-card">
        <h4 className="font-semibold text-ink">Check-in del gimnasio</h4>
        <p className="mt-0.5 text-[13px] leading-snug text-muted">
          Pegá este QR en la entrada (o grabá un chip NFC con la misma dirección).
          Los socios lo escanean o tocan con su teléfono para marcar asistencia y
          sumar puntos.
        </p>
        <div className="mt-3 flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.checkinQr}
            alt="QR de check-in del gimnasio"
            width={200}
            height={200}
            className="rounded"
          />
          <code className="break-all text-center text-[11px] text-faint">
            {data.checkinUrl}
          </code>
        </div>
      </div>

      <UbicacionCheckin />

      <PuntosTabla ranking={data.ranking} miAlumnoId="" />
    </div>
  );
}
