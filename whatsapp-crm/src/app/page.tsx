import { redirect } from "next/navigation";

// La raíz manda al Inbox; si no hay sesión, el proxy redirige a /login.
export default function Home() {
  redirect("/inbox");
}
