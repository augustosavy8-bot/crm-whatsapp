import Link from "next/link";
import { getGymContext } from "@/lib/gym";
import InstalarApp from "@/components/gimnasio/InstalarApp";

export const dynamic = "force-dynamic";

export default async function GimnasioLanding() {
  const gym = await getGymContext();
  const servicios = gym?.servicios ?? [];

  // Profesionales únicos a partir de los servicios (1 servicio = 1 profe hoy).
  const profesionales = servicios
    .filter((s) => s.profesional_nombre)
    .map((s) => ({ nombre: s.profesional_nombre as string, servicio: s.nombre }));

  return (
    <main className="min-h-dvh">
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/30 blur-3xl"
        />
        <div className="relative mx-auto max-w-3xl px-5 pb-14 pt-8 sm:pt-12">
          <div className="mb-10 flex items-center justify-between">
            <span className="text-[15px] font-bold tracking-tight">
              {gym?.nombre ?? "KINACTIVA"}
            </span>
            <InstalarApp />
          </div>

          <h1 className="max-w-xl text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
            Entrená, recuperate y comé mejor.
            <span className="text-accent"> En un solo lugar.</span>
          </h1>
          <p className="mt-4 max-w-md text-[15px] text-white/70">
            Sacá tu turno online en segundos, sin llamar ni esperar. Elegís el
            servicio, el día y el horario. Listo.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/gimnasio/reservar"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3.5 text-[15px] font-bold text-white shadow-pop transition-transform hover:scale-[1.02] active:scale-100"
            >
              Sacar turno →
            </Link>
            <Link
              href="/gimnasio/clases"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-white/10"
            >
              Reservar clase de gym →
            </Link>
          </div>
        </div>
      </section>

      {/* Servicios */}
      <section className="mx-auto max-w-3xl px-5 py-12">
        <h2 className="text-xl font-bold tracking-tight">Nuestros servicios</h2>
        <p className="mt-1 text-sm text-muted">
          Elegí el que necesitás y reservá con el profesional.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {servicios.map((s) => (
            <Link
              key={s.id}
              href={`/gimnasio/reservar?servicio=${encodeURIComponent(s.slug)}`}
              className="group flex flex-col rounded-panel border border-line bg-surface p-5 shadow-card transition-all hover:border-accent hover:shadow-pop"
            >
              <div className="text-[17px] font-bold">{s.nombre}</div>
              {s.profesional_nombre && (
                <div className="text-[13px] font-semibold text-accent">
                  {s.profesional_nombre}
                </div>
              )}
              {s.descripcion && (
                <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted">
                  {s.descripcion}
                </p>
              )}
              <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-ink group-hover:text-accent">
                Reservar →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Profesionales */}
      {profesionales.length > 0 && (
        <section className="mx-auto max-w-3xl px-5 pb-12">
          <h2 className="text-xl font-bold tracking-tight">El equipo</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {profesionales.map((p) => (
              <div
                key={p.nombre}
                className="flex items-center gap-3 rounded-panel border border-line bg-surface p-4 shadow-card"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[15px] font-bold text-accent">
                  {p.nombre
                    .split(" ")
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-bold">{p.nombre}</div>
                  <div className="truncate text-[12px] text-muted">{p.servicio}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CTA final */}
      <section className="mx-auto max-w-3xl px-5 pb-16">
        <div className="flex flex-col items-center gap-4 rounded-panel bg-ink px-6 py-10 text-center text-white">
          <h2 className="text-2xl font-black tracking-tight">
            ¿Listo para tu próximo turno?
          </h2>
          <Link
            href="/gimnasio/reservar"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3.5 text-[15px] font-bold text-white shadow-pop transition-transform hover:scale-[1.02] active:scale-100"
          >
            Sacar turno →
          </Link>
        </div>
      </section>
    </main>
  );
}
