import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getModulosTenant } from "@/lib/modulos";
import SignOutButton from "@/components/SignOutButton";
import HeaderNav from "@/components/HeaderNav";
import NotificationsProvider from "@/components/notifications/NotificationsProvider";
import NotificationBell from "@/components/notifications/NotificationBell";
import PushButton from "@/components/notifications/PushButton";
import AvisoNuevoTurno from "@/components/notifications/AvisoNuevoTurno";

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
    .select("role, gym_admin")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const esProfesional = agente?.role === "profesional";
  const esGymAdmin = agente?.gym_admin === true;
  // Staff del gimnasio (owner | profesional | gym_admin): reciben el aviso
  // in-app cuando un alumno se anota, desde cualquier pantalla del panel.
  const esGymStaff =
    agente?.role === "owner" || esProfesional || esGymAdmin;

  // Módulos del tenant: una sola lectura por request, se baja por props.
  // El profesional tiene nav fija (gimnasio + su agenda), no depende de esto.
  const modulos = esProfesional
    ? { inbox: false, turnos: true }
    : await getModulosTenant(supabase);

  // El chrome de mensajería (bell, push, toasts/beeps Realtime) es parte del
  // módulo inbox: si el tenant no lo tiene, no se monta. El webhook, el envío
  // y la publicación Realtime del backend siguen intactos: esto es solo UI.
  const mostrarChromeInbox = !esProfesional && modulos.inbox;

  const contenido = (
    <div className="flex h-[100dvh] flex-col bg-canvas">
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Inicio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/kinactiva-mark.png"
            alt=""
            aria-hidden
            className="h-7 w-auto"
          />
          <span className="hidden text-[17px] font-extrabold tracking-tight sm:inline">
            <span className="text-brand">KIN</span>
            <span className="text-accent">ACTIVA</span>
          </span>
        </Link>
        <div className="flex min-w-0 flex-1 justify-center overflow-x-auto">
          <HeaderNav
            role={agente?.role}
            inboxEnabled={modulos.inbox}
            gymAdmin={esGymAdmin}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden text-xs text-muted lg:block">
            {user.email}
          </span>
          {mostrarChromeInbox && <PushButton />}
          {mostrarChromeInbox && <NotificationBell />}
          <SignOutButton />
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
      {/* Aviso in-app de reserva nueva (global): solo para el staff del gym. */}
      {esGymStaff && <AvisoNuevoTurno />}
    </div>
  );

  // NotificationsProvider (Realtime de mensajes entrantes + toasts/beeps) es
  // chrome del inbox: solo se monta si el tenant tiene el módulo.
  return mostrarChromeInbox ? (
    <NotificationsProvider>{contenido}</NotificationsProvider>
  ) : (
    contenido
  );
}
