import { redirect } from "next/navigation";
import { currentAgent } from "@/lib/agent";
import { currentAlumno } from "@/lib/alumno";

// La raíz separa los mundos por rol:
//   sin sesión   -> login (la página principal del sitio es el ingreso)
//   alumno       -> su panel (mis reservas / cuota)
//   staff        -> panel del gimnasio (la app está centrada en el gym)
//   owner c/stats -> su panel de estadísticas
export default async function Home() {
  const agent = await currentAgent();
  if (agent) {
    // El dueño con panel de estadísticas cae ahí (puede navegar al gimnasio).
    if (agent.panel_stats) redirect("/panel");
    // Todo el staff aterriza en el panel del gimnasio.
    redirect("/gym");
  }

  // Sin agente: puede ser un alumno logueado o alguien sin sesión.
  const alumno = await currentAlumno();
  if (alumno) redirect("/mi-cuenta");
  // Sin sesión: la página principal es el login (la landing pública sigue en
  // /gimnasio para quien tenga el link directo).
  redirect("/login");
}
