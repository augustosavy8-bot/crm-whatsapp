import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentRole } from "./types";

export interface CurrentAgent {
  id: string;
  tenant_id: string;
  role: AgentRole;
  name: string | null;
  email: string | null;
}

// Agente logueado (fila propia en `agents`, ya resuelta por RLS/tenant).
// Centraliza el patrón repetido en messages/send y push/subscribe.
export async function getCurrentAgent(
  sb: SupabaseClient,
): Promise<CurrentAgent | null> {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data } = await sb
    .from("agents")
    .select("id, tenant_id, role, name, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!data || !data.tenant_id) return null;
  return data as CurrentAgent;
}
