import Link from "next/link";
import { getGymContext } from "@/lib/gym";
import InstalarApp from "@/components/gimnasio/InstalarApp";

export const dynamic = "force-dynamic";

export default async function GimnasioLanding() {
  const gym = await getGymContext();
  const servicios = gym?.servicios ?? [];

  return (
    <main className="min-h-dvh">
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/30 blur-3xl"
        />
        <div className="relative mx-auto max-w-3xl px-5 pb-14 pt-8 sm:pt-12">
          <div className="mb-10 flex items-center justify-between gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/kinactiva-logo-light.png"
              alt="KINACTIVA — Centro Integral del Movimiento"
              className="h-16 w-auto"
            />
            <InstalarApp />
          </div>

          <h1 className="max-w-xl text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
            Entrená mejor.
            <span className="text-accent"> Reservá tu lugar.</span>
          </h1>
          <p className="mt-4 max-w-md text-[15px] text-white/70">
            Reservá tu turno de gimnasio online en segundos, sin llamar ni
            esperar. Elegís el día y el horario. Listo.
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
        <h2 className="text-xl font-bold tracking-tight">Reservá tu turno</h2>
        <p className="mt-1 text-sm text-muted">
          Elegí el horario que mejor te queda y asegurá tu lugar.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {servicios.map((s) => (
            <Link
              key={s.id}
              href={`/gimnasio/reservar?servicio=${encodeURIComponent(s.slug)}`}
              className="group flex flex-col rounded-panel border border-line bg-surface p-5 shadow-card transition-all hover:border-accent hover:shadow-pop"
            >
              <div className="text-[17px] font-bold">{s.nombre}</div>
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
