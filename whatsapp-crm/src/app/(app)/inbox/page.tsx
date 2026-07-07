import { createClient } from "@/lib/supabase/server";
import { getConversations } from "@/lib/conversations";
import type { ConversationListItem } from "@/lib/types";
import InboxClient from "@/components/inbox/InboxClient";

// Carga inicial (server) de la lista de conversaciones; el Realtime lo maneja el cliente.
// ?c=<id> abre esa conversación directo (deep-link desde el dashboard).
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const supabase = await createClient();
  const { c } = await searchParams;
  let initialConversations: ConversationListItem[] = [];
  try {
    initialConversations = await getConversations(supabase);
  } catch (e) {
    console.error("[inbox] error cargando conversaciones", e);
  }

  return (
    <InboxClient
      initialConversations={initialConversations}
      initialSelectedId={c ?? null}
    />
  );
}
