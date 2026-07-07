import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";
import HeaderNav from "@/components/HeaderNav";
import NotificationsProvider from "@/components/notifications/NotificationsProvider";
import NotificationBell from "@/components/notifications/NotificationBell";

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

  return (
    <NotificationsProvider>
    <div className="flex h-[100dvh] flex-col bg-canvas">
      {/* Gradiente de marca de Instagram, referenciado por ChannelIcon (#ig-grad). */}
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <linearGradient id="ig-grad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#FEDA75" />
            <stop offset="25%" stopColor="#FA7E1E" />
            <stop offset="50%" stopColor="#D62976" />
            <stop offset="75%" stopColor="#962FBF" />
            <stop offset="100%" stopColor="#4F5BD5" />
          </linearGradient>
        </defs>
      </svg>
      <header className="flex shrink-0 items-center justify-between border-b border-line bg-surface px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
            F
          </div>
          <span className="hidden text-sm font-bold tracking-tight sm:block">
            WhatsApp CRM
          </span>
        </div>
        <HeaderNav />
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden text-xs text-muted lg:block">
            {user.email}
          </span>
          <NotificationBell />
          <SignOutButton />
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
    </NotificationsProvider>
  );
}
