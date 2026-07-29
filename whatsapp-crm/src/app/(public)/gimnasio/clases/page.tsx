import Link from "next/link";
import { getGymContext } from "@/lib/gym";
import ClasesFlow from "@/components/gimnasio/ClasesFlow";

export const dynamic = "force-dynamic";

export default async function ClasesPage() {
  const gym = await getGymContext();

  if (!gym) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-lg font-semibold">Reservas no disponibles</p>
        <p className="text-sm text-muted">Probá más tarde.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-16 pt-6 sm:pt-10">
      <Link
        href="/gimnasio"
        className="mb-6 inline-flex items-center gap-1 text-[13px] font-semibold text-muted transition-colors hover:text-ink"
      >
        ← Volver
      </Link>
      <ClasesFlow gimnasioNombre={gym.nombre} />
    </main>
  );
}
