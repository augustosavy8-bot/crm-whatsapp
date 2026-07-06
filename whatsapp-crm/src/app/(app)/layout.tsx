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
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 dark:border-neutral-800 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-emerald-600 flex items-center justify-center text-white text-xs font-semibold">
            W
          </div>
          <span className="text-sm font-semibold">WhatsApp CRM</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:block text-xs text-neutral-500">
            {user.email}
          </span>
          <SignOutButton />
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
