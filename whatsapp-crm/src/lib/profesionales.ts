import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProfesionalUnico {
  id: string;
  name: string | null;
}

// Si el tenant tiene un único agente con rol 'profesional', lo devuelve
// (para no tener que preguntarle al paciente/usuario con quién prefiere el
// turno cuando no hay opción real). Con 0 o 2+ profesionales, null.
export async function getProfesionalUnico(
  sb: SupabaseClient,
  tenantId: string,
): Promise<ProfesionalUnico | null> {
  const { data } = await sb
    .from("agents")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("role", "profesional");
  if (data && data.length === 1) {
    return { id: data[0].id as string, name: data[0].name as string | null };
  }
  return null;
}
