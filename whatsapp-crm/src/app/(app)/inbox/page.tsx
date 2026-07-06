import { createClient } from "@/lib/supabase/server";
import { getConversations } from "@/lib/conversations";
import type { ConversationListItem } from "@/lib/types";
import InboxClient from "@/components/inbox/InboxClient";

// Carga inicial (server) de la lista de conversaciones; el Realtime lo maneja el cliente.
export default async function InboxPage() {
  const supabase = await createClient();
  let initialConversations: ConversationListItem[] = [];
  try {
    initialConversations = await getConversations(supabase);
  } catch (e) {
    console.error("[inbox] error cargando conversaciones", e);
  }

  return <InboxClient initialConversations={initialConversations} />;
}
