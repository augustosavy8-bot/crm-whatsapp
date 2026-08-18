import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { currentAgent } from "@/lib/agent";
import GraficoBarras from "@/components/panel/GraficoBarras";

export const dynamic = "force-dynamic";

interface Stats {
  desde: string;
  hasta: string;
  altas_por_dia: { dia: string; staff: number; alumnos: number }[];
  reservas_por_dia: { dia: string; total: number }[];
  socios: {
    total_alumnos: number;
    socios_al_dia: number;
    vencidos: number;
    no_socios: number;
    mrr: number;
    por_plan: { nombre: string; precio: number; socios: number }[];
  };
}

function precioAR(n: number): string {
  return "$" + n.toLocaleString("es-AR");
}
function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

const ACCENT = "var(--color-accent)";
const BRAND = "var(--color-brand)";

// Panel de estadísticas del dueño. Solo lo ve quien tenga panel_stats (hoy vos).
export default async function PanelPage() {
  const agent = await currentAgent();
  if (!agent) redirect("/login");
  if (!agent.panel_stats) redirect("/turnos");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("panel_estadisticas", { p_dias: 30 });
  const stats = (data ?? null) as Stats | null;

  if (error || !stats) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-danger">
          No se pudieron cargar las estadísticas. Reintentá en un momento.
        </p>
      </div>
    );
  }

  const altasTotal = stats.altas_por_dia.reduce((s, d) => s + d.staff + d.alumnos, 0);
  const reservasTotal = stats.reservas_por_dia.reduce((s, d) => s + d.total, 0);

  const kpis = [
    { label: "Socios al día", valor: String(stats.socios.socios_al_dia), tono: "text-ok" },
    { label: "Cuotas vencidas", valor: String(stats.socios.vencidos), tono: "text-danger" },
    { label: "Ingreso mensual estimado", valor: precioAR(stats.socios.mrr), tono: "text-accent" },
    { label: "Total de alumnos", valor: String(stats.socios.total_alumnos), tono: "text-ink" },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Panel</h1>
          <p className="text-sm text-muted">
            Resumen del gimnasio · {fechaCorta(stats.desde)} al {fechaCorta(stats.hasta)}
          </p>
        </header>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="rounded-panel border border-line bg-surface p-4 shadow-card"
            >
              <div className={`text-2xl font-extrabold tracking-tight ${k.tono}`}>
                {k.valor}
              </div>
              <div className="mt-0.5 text-[12px] text-muted">{k.label}</div>
            </div>
          ))}
        </div>

        {/* Altas de usuarios por día */}
        <section className="space-y-3 rounded-panel border border-line bg-surface p-4 shadow-card">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-bold">Altas de usuarios · 30 días</h2>
            <span className="text-[13px] text-muted">{altasTotal} en total</span>
          </div>
          <GraficoBarras
            puntos={stats.altas_por_dia.map((d) => ({
              fecha: d.dia,
              segmentos: [
                { v: d.alumnos, color: ACCENT },
                { v: d.staff, color: BRAND },
              ],
            }))}
          />
          <div className="flex items-center justify-between text-[11px] text-faint">
            <span>{fechaCorta(stats.desde)}</span>
            <span className="flex items-center gap-3 text-muted">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block size-2 rounded-full" style={{ background: ACCENT }} />
                Alumnos
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block size-2 rounded-full" style={{ background: BRAND }} />
                Staff
              </span>
            </span>
            <span>{fechaCorta(stats.hasta)}</span>
          </div>
        </section>

        {/* Reservas del gym por día */}
        <section className="space-y-3 rounded-panel border border-line bg-surface p-4 shadow-card">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-bold">Reservas de clases · 30 días</h2>
            <span className="text-[13px] text-muted">{reservasTotal} en total</span>
          </div>
          <GraficoBarras
            puntos={stats.reservas_por_dia.map((d) => ({
              fecha: d.dia,
              segmentos: [{ v: d.total, color: ACCENT }],
            }))}
          />
          <div className="flex items-center justify-between text-[11px] text-faint">
            <span>{fechaCorta(stats.desde)}</span>
            <span>{fechaCorta(stats.hasta)}</span>
          </div>
        </section>

        {/* Socios por plan */}
        <section className="space-y-3 rounded-panel border border-line bg-surface p-4 shadow-card">
          <h2 className="text-[15px] font-bold">Socios por plan</h2>
          {stats.socios.por_plan.length === 0 ? (
            <p className="text-[13px] text-muted">Todavía no hay planes activos.</p>
          ) : (
            <ul className="divide-y divide-line">
              {stats.socios.por_plan.map((p) => (
                <li key={p.nombre} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-[14px] font-semibold text-ink">{p.nombre}</div>
                    <div className="text-[12px] text-muted">{precioAR(p.precio)}/mes</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[16px] font-bold text-ink">{p.socios}</div>
                    <div className="text-[11px] text-muted">al día</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            href="/gym"
            className="rounded-full border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-muted transition-colors hover:text-ink"
          >
            Ir al panel del gimnasio
          </Link>
          <Link
            href="/turnos"
            className="rounded-full border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-muted transition-colors hover:text-ink"
          >
            Ir a turnos
          </Link>
        </div>
      </div>
    </div>
  );
}
