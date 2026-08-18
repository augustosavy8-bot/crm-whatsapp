import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { currentUser } from "./agent";

export interface CurrentAlumno {
  id: string;
  tenant_id: string;
  nombre: string;
  telefono: string | null; // los socios del padrón importado pueden no tenerlo
  email: string | null;
  es_socio: boolean;
  cuota_hasta: string | null; // YYYY-MM-DD
}

// Alumno logueado (su propia fila en `gym_alumnos`, vinculada por auth_user_id).
// La policy `alumno_self_read` (0026) permite leer SOLO su fila con la sesión.
// El teléfono que devuelve es la identidad canónica para los flujos de cupo
// (mis-reservas, reservar, cancelar), así el panel no confía en el cliente.
export async function getCurrentAlumno(
  sb: SupabaseClient,
): Promise<CurrentAlumno | null> {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data } = await sb
    .from("gym_alumnos")
    .select("id, tenant_id, nombre, telefono, email, es_socio, cuota_hasta")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!data || !data.tenant_id) return null;
  return {
    ...data,
    es_socio: data.es_socio === true,
  } as CurrentAlumno;
}

// Alumno logueado, cacheado POR REQUEST (una sola validación de sesión + lectura
// compartida entre layout y página). Usar en Server Components.
export const currentAlumno = cache(async (): Promise<CurrentAlumno | null> => {
  const user = await currentUser();
  if (!user) return null;
  const sb = await createClient();
  const { data } = await sb
    .from("gym_alumnos")
    .select("id, tenant_id, nombre, telefono, email, es_socio, cuota_hasta")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!data || !data.tenant_id) return null;
  return { ...data, es_socio: data.es_socio === true } as CurrentAlumno;
});
