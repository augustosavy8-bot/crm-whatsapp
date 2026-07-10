import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/agent";
import { getCamposConfig } from "@/lib/camposConfig";
import { getPaciente } from "@/lib/pacientes";
import { getTurnosByPaciente } from "@/lib/turnos";
import { getHistoriasByPaciente } from "@/lib/historias";

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  cancelado: "Cancelado",
  atendido: "Atendido",
  ausente: "Ausente",
};

function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default async function PacienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent) redirect("/login");

  const paciente = await getPaciente(supabase, id);
  if (!paciente) notFound();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("rubro_slug")
    .eq("id", agent.tenant_id)
    .single();

  const [turnos, historias, camposPaciente, camposHistoria] =
    await Promise.all([
      getTurnosByPaciente(supabase, paciente.id),
      getHistoriasByPaciente(supabase, paciente.id),
      getCamposConfig(
        supabase,
        tenant?.rubro_slug ?? "otro",
        "paciente",
        agent.tenant_id,
      ),
      getCamposConfig(
        supabase,
        tenant?.rubro_slug ?? "otro",
        "historia_clinica",
        agent.tenant_id,
      ),
    ]);

  const etiquetaHistoria = new Map(
    camposHistoria.map((c) => [c.campo, c.etiqueta]),
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {paciente.nombre}
            </h1>
            <p className="text-sm text-muted">
              {[paciente.telefono, paciente.obra_social]
                .filter(Boolean)
                .join(" · ") || "Sin datos de contacto"}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {paciente.contact_id && (
              <Link
                href={`/inbox?c=${paciente.contact_id}`}
                className="rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-2"
              >
                Ver WhatsApp
              </Link>
            )}
            <Link
              href={`/pacientes/${paciente.id}/editar`}
              className="rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-2"
            >
              Editar
            </Link>
          </div>
        </div>

        {/* Datos del paciente */}
        <div className="rounded-panel border border-line bg-surface p-5 shadow-card">
          <h2 className="mb-3 text-[15px] font-bold">Datos</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">DNI</dt>
              <dd>{paciente.dni || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Email</dt>
              <dd>{paciente.email || "—"}</dd>
            </div>
            {camposPaciente.map((campo) => (
              <div key={campo.id}>
                <dt className="text-xs text-muted">{campo.etiqueta}</dt>
                <dd>{String(paciente.datos[campo.campo] ?? "—")}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Turnos */}
        <div className="rounded-panel border border-line bg-surface p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-bold">Turnos</h2>
            <Link
              href={`/turnos?paciente=${paciente.id}`}
              className="text-[13px] font-semibold text-accent"
            >
              + Nuevo turno
            </Link>
          </div>
          {turnos.length === 0 ? (
            <p className="text-sm text-muted">Todavía no tiene turnos.</p>
          ) : (
            <ul className="divide-y divide-line">
              {turnos.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <span>{formatFechaHora(t.fecha_hora)}</span>
                  <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-muted">
                    {ESTADO_LABEL[t.estado] ?? t.estado}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Historia clínica */}
        <div className="rounded-panel border border-line bg-surface p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-bold">Historia clínica</h2>
            <Link
              href={`/pacientes/${paciente.id}/historia/nueva`}
              className="text-[13px] font-semibold text-accent"
            >
              + Nueva entrada
            </Link>
          </div>
          {historias.length === 0 ? (
            <p className="text-sm text-muted">Todavía no hay entradas.</p>
          ) : (
            <ul className="space-y-4">
              {historias.map((h) => (
                <li
                  key={h.id}
                  className="rounded-xl border border-line bg-surface-2 p-4"
                >
                  <div className="mb-2 text-xs font-semibold text-muted">
                    {formatFecha(h.fecha)}
                  </div>
                  <dl className="space-y-1.5 text-sm">
                    {Object.entries(h.datos)
                      .filter(([, v]) => v !== null && v !== "")
                      .map(([campo, v]) => (
                        <div key={campo}>
                          <dt className="text-xs text-muted">
                            {etiquetaHistoria.get(campo) ?? campo}
                          </dt>
                          <dd>{String(v)}</dd>
                        </div>
                      ))}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
