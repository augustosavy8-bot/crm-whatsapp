import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/agent";

// La raíz separa los mundos por rol:
//   público (sin sesión) -> landing del gimnasio
//   profesional          -> su agenda
//   owner                -> panel del CRM
export default async function Home() {
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent) redirect("/gimnasio");
  redirect(agent.role === "profesional" ? "/turnos" : "/dashboard");
}
