// Gráfico de barras diario, sin librerías (divs con alturas proporcionales).
// Cada punto puede tener varios segmentos apilados (ej. staff + alumnos).
export interface PuntoBarra {
  fecha: string; // "YYYY-MM-DD"
  segmentos: { v: number; color: string }[];
}

export default function GraficoBarras({
  puntos,
  alto = 128,
}: {
  puntos: PuntoBarra[];
  alto?: number;
}) {
  const totales = puntos.map((p) => p.segmentos.reduce((s, x) => s + x.v, 0));
  const max = Math.max(1, ...totales);

  return (
    <div
      className="flex items-end gap-[3px] overflow-x-auto"
      style={{ height: alto }}
    >
      {puntos.map((p, i) => {
        const total = totales[i];
        return (
          <div
            key={p.fecha}
            title={`${p.fecha}: ${total}`}
            className="flex min-w-[5px] flex-1 flex-col justify-end overflow-hidden rounded-t-[3px]"
            style={{ height: alto }}
          >
            {total === 0 ? (
              <div className="w-full rounded-full bg-line" style={{ height: 2 }} />
            ) : (
              p.segmentos
                .filter((s) => s.v > 0)
                .map((s, j) => (
                  <div
                    key={j}
                    className="w-full"
                    style={{ height: (s.v / max) * (alto - 4), background: s.color }}
                  />
                ))
            )}
          </div>
        );
      })}
    </div>
  );
}
