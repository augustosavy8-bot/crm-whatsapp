import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampoConfig, CampoEntidad } from "./types";

// Campos dinámicos de un rubro para una entidad, con override por tenant.
// Un campo con tenant_id propio pisa al default (tenant_id null) del mismo
// `campo`; hoy no hay UI para crear overrides, pero el merge ya contempla el caso.
export async function getCamposConfig(
  sb: SupabaseClient,
  verticalSlug: string,
  entidad: CampoEntidad,
  tenantId: string,
): Promise<CampoConfig[]> {
  const { data, error } = await sb
    .from("campos_config")
    .select("*")
    .eq("vertical_slug", verticalSlug)
    .eq("entidad", entidad)
    .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    .order("orden", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as CampoConfig[];
  const byCampo = new Map<string, CampoConfig>();
  for (const row of rows) {
    const existing = byCampo.get(row.campo);
    // El override de tenant (tenant_id no-null) siempre pisa al default.
    if (!existing || row.tenant_id) byCampo.set(row.campo, row);
  }
  return [...byCampo.values()].sort((a, b) => a.orden - b.orden);
}
