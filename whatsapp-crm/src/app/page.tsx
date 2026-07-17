import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// La raíz separa los dos mundos: el público del gimnasio va a la landing, el
// staff logueado va a su panel. Así un cliente que entra al dominio pelado
// nunca ve el login del CRM.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? "/dashboard" : "/gimnasio");
}
