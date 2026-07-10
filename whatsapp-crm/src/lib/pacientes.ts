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
