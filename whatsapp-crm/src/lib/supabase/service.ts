import { createClient } from "@supabase/supabase-js";

// Cliente ADMIN con service-role key. SOLO servidor (webhook, envío).
// Saltea RLS: nunca importar esto en código que llegue al navegador.
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
