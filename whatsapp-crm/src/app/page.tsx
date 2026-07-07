import { redirect } from "next/navigation";

// La raíz manda al Dashboard; si no hay sesión, el proxy redirige a /login.
export default function Home() {
  redirect("/dashboard");
}
