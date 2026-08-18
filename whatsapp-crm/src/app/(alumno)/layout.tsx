import { redirect } from "next/navigation";
import { currentAlumno } from "@/lib/alumno";
import SignOutButton from "@/components/SignOutButton";
import PushButton from "@/components/notifications/PushButton";

// Shell del alumno: sin sesión de alumno vinculada, a /login. El middleware ya
// encierra a este rol en /mi-cuenta; este layout es la segunda barrera.
export default async function AlumnoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const alumno = await currentAlumno();
  if (!alumno) redirect("/login");

  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas">
      <header className="flex shrink-0 items-center justify-between border-b border-line bg-surface px-4 py-2.5">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/kinactiva-mark.png"
            alt=""
            aria-hidden
            className="h-7 w-auto"
          />
          <span className="text-[17px] font-extrabold tracking-tight">
            <span className="text-brand">KIN</span>
            <span className="text-accent">ACTIVA</span>
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden text-xs text-muted sm:block">
            {alumno.nombre}
          </span>
          {/* Push: le avisa cuando el staff le confirma la reserva. */}
          <PushButton />
          <SignOutButton />
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
