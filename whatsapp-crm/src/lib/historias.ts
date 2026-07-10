import type { SupabaseClient } from "@supabase/supabase-js";
import type { HistoriaClinica } from "./types";

export async function getHistoriasByPaciente(
  sb: SupabaseClient,
  pacienteId: string,
): Promise<HistoriaClinica[]> {
  const { data, error } = await sb
    .from("historias_clinicas")
    .select("*")
    .eq("paciente_id", pacienteId)
    .order("fecha", { ascending: false });
  if (error) throw error;
  return (data ?? []) as HistoriaClinica[];
}
