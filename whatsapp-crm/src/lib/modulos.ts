import type { SupabaseClient } from "@supabase/supabase-js";

// Módulos que un tenant puede tener habilitados. Convención de la tabla
// `tenants_modulos`: una fila por módulo HABILITADO (modulo ∈ estos valores).
export type Modulo = "inbox" | "turnos";

export interface ModulosTenant {
  inbox: boolean;
  turnos: boolean;
}

// Lee los módulos del tenant logueado. RLS ya acota `tenants_modulos` al
// tenant del usuario (y a owner), así que no hace falta filtrar por tenant_id.
//
// Un tenant SIN filas es "legacy": todo habilitado. Así no rompemos tenants
// que nunca se configuraron; recién cuando hay al menos una fila se respeta
// la lista explícita (y la ausencia de 'inbox' lo oculta).
//
// Se lee UNA vez por request (en el layout) y se baja por props: no un query
// por página.
export async function getModulosTenant(
  sb: SupabaseClient,
): Promise<ModulosTenant> {
  const { data } = await sb
    .from("tenants_modulos")
    .select("modulo")
    .eq("habilitado", true);

  const rows = data ?? [];
  if (rows.length === 0) return { inbox: true, turnos: true };

  const set = new Set(rows.map((r) => r.modulo as Modulo));
  return { inbox: set.has("inbox"), turnos: set.has("turnos") };
}
