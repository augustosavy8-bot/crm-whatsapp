import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";

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
    <div className="flex h-[100dvh] flex-col bg-canvas">
      <header className="flex shrink-0 items-center justify-between border-b border-line bg-surface px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
            F
          </div>
          <span className="text-sm font-bold tracking-tight">WhatsApp CRM</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted sm:block">
            {user.email}
          </span>
          <SignOutButton />
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
