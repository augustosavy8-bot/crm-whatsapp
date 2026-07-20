import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/agent";
import { getModulosTenant } from "@/lib/modulos";

// La raíz separa los mundos por rol:
//   público (sin sesión) -> landing del gimnasio
//   profesional          -> su agenda
//   owner                -> dashboard de mensajes, o la agenda si el tenant
//                           no tiene el módulo de inbox
export default async function Home() {
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent) redirect("/gimnasio");
  if (agent.role === "profesional") redirect("/turnos");

  const { inbox } = await getModulosTenant(supabase);
  redirect(inbox ? "/dashboard" : "/turnos");
}
