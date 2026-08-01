import type { SupabaseClient } from "@supabase/supabase-js";
import type { Paciente } from "./types";

export async function getPacientes(sb: SupabaseClient): Promise<Paciente[]> {
  const { data, error } = await sb
    .from("pacientes")
    .select("*")
    .order("nombre", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Paciente[];
}

// Opción mínima para el buscador de pacientes (id + nombre).
export interface PacienteOpcion {
  id: string;
  nombre: string;
}

// Busca pacientes por nombre (o teléfono), acotado. Reemplaza traer el padrón
// entero en el selector de "Nuevo turno": a miles de pacientes, ese <select>
// era inusable. RLS ya scopea al tenant.
export async function buscarPacientes(
  sb: SupabaseClient,
  q: string,
  limit = 20,
): Promise<PacienteOpcion[]> {
  const term = q.trim();
  let query = sb
    .from("pacientes")
    .select("id, nombre")
    .order("nombre", { ascending: true })
    .limit(limit);
  if (term) {
    // Nombre o teléfono contienen el término.
    query = query.or(`nombre.ilike.%${term}%,telefono.ilike.%${term}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PacienteOpcion[];
}

export async function getPaciente(
  sb: SupabaseClient,
  id: string,
): Promise<Paciente | null> {
  const { data, error } = await sb
    .from("pacientes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Paciente) ?? null;
}
