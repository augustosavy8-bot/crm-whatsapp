import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";
import HeaderNav from "@/components/HeaderNav";
import NotificationsProvider from "@/components/notifications/NotificationsProvider";
import NotificationBell from "@/components/notifications/NotificationBell";
import PushButton from "@/components/notifications/PushButton";
import AIAvatar from "@/components/AIAvatar";

// Shell protegido: sin sesión no se entra (además del proxy, por las dudas).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: agente } = await supabase
    .from("agents")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const esProfesional = agente?.role === "profesional";

  // El profesional no tiene inbox ni pendientes de IA (solo ve turnos suyos);
  // el avatar/contador del CRM no aplica.
  const { count: pendientesIA } = esProfesional
    ? { count: 0 }
    : await supabase
        .from("turnos")
        .select("id", { count: "exact", head: true })
        .eq("estado", "pendiente")
        .neq("origen", "manual");

  return (
    <NotificationsProvider>
    <div className="flex h-[100dvh] flex-col bg-canvas">
      <header className="flex shrink-0 items-center justify-between border-b border-line bg-surface px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
            F
          </div>
          <span className="hidden text-sm font-bold tracking-tight sm:block">
            WhatsApp CRM
          </span>
        </div>
        <HeaderNav role={agente?.role} />
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden text-xs text-muted lg:block">
            {user.email}
          </span>
          {!esProfesional && <PushButton />}
          {!esProfesional && <NotificationBell />}
          <SignOutButton />
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
      {!esProfesional && <AIAvatar pendientesCount={pendientesIA ?? 0} />}
    </div>
    </NotificationsProvider>
  );
}
