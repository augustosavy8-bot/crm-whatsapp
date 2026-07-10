import type { SupabaseClient } from "@supabase/supabase-js";
import type { TurnoConPaciente, Turno } from "./types";

// Próximos turnos (desde hoy 00:00) con datos mínimos del paciente, para la agenda.
export async function getTurnosProximos(
  sb: SupabaseClient,
): Promise<TurnoConPaciente[]> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const { data, error } = await sb
    .from("turnos")
    .select("*, paciente:pacientes(id, nombre, telefono)")
    .gte("fecha_hora", startOfToday.toISOString())
    .order("fecha_hora", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as TurnoConPaciente[];
}

export async function getTurnosByPaciente(
  sb: SupabaseClient,
  pacienteId: string,
): Promise<Turno[]> {
  const { data, error } = await sb
    .from("turnos")
    .select("*")
    .eq("paciente_id", pacienteId)
    .order("fecha_hora", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Turno[];
}
