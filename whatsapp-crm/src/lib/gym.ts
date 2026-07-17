import { createServiceClient } from "@/lib/supabase/service";
import type { ServicioPublico } from "@/lib/types";

// ============================================================
// Contexto público del gimnasio.
//
// El flujo público NO tiene sesión, y `anon` no tiene acceso a
// ninguna tabla (a propósito). Así que todo lo público se lee
// SERVER-SIDE con el service client, que saltea RLS: las páginas
// y route handlers son la capa de confianza.
//
// El tenant se resuelve por WHATSAPP_PHONE_NUMBER_ID — la misma
// env var que ya usa el webhook para identificar al piloto. Una
// sola fuente de verdad, sin hardcodear un uuid en el código.
// Cuando entre un segundo gimnasio esto pasa a resolverse por
// slug de la URL o subdominio, sin tocar el resto.
// ============================================================

export interface GymContext {
  tenantId: string;
  nombre: string;
  servicios: ServicioPublico[];
}

async function resolveTenantId(
  sb: ReturnType<typeof createServiceClient>,
): Promise<{ id: string; nombre: string } | null> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) return null;

  const { data } = await sb
    .from("tenants")
    .select("id, nombre")
    .eq("whatsapp_phone_number_id", phoneNumberId)
    .maybeSingle();

  return data ?? null;
}

// Servicios activos del gimnasio con el nombre del profesional, ordenados.
// Devuelve solo datos públicos (nada de pacientes/turnos).
export async function getGymContext(): Promise<GymContext | null> {
  const sb = createServiceClient();
  const tenant = await resolveTenantId(sb);
  if (!tenant) return null;

  const { data, error } = await sb
    .from("servicios")
    .select("id, nombre, slug, descripcion, duracion_min, profesional:agents(name)")
    .eq("tenant_id", tenant.id)
    .eq("activo", true)
    .order("orden", { ascending: true });
  if (error) throw error;

  const servicios: ServicioPublico[] = (data ?? []).map((s) => {
    const prof = s.profesional as unknown as { name: string | null } | null;
    return {
      id: s.id as string,
      nombre: s.nombre as string,
      slug: s.slug as string,
      descripcion: s.descripcion as string | null,
      duracion_min: s.duracion_min as number,
      profesional_nombre: prof?.name ?? null,
    };
  });

  return { tenantId: tenant.id, nombre: tenant.nombre, servicios };
}
