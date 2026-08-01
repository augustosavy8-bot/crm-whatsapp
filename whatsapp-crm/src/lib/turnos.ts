import type { SupabaseClient } from "@supabase/supabase-js";
import type { TurnoConDetalle, Turno } from "./types";

// Turnos en un rango [desde, hasta) con paciente, servicio y profesional,
// para la agenda del panel admin (vista día/semana). Ambos límites en ISO UTC.
export async function getTurnosEnRango(
  sb: SupabaseClient,
  desdeISO: string,
  hastaISO: string,
): Promise<TurnoConDetalle[]> {
  const { data, error } = await sb
    .from("turnos")
    .select(
      "*, paciente:pacientes(id, nombre, telefono), servicio:servicios(id, nombre), profesional:agents(id, name)",
    )
    .gte("fecha_hora", desdeISO)
    .lt("fecha_hora", hastaISO)
    .order("fecha_hora", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as TurnoConDetalle[];
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

// Instante de corte para la purga: hoy menos `meses`, en ISO UTC.
export function corteCanceladosViejos(meses: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d.toISOString();
}

// Cuántos turnos cancelados hay anteriores al corte (para confirmar antes de
// borrar). Solo cuenta 'cancelado'; RLS ya acota al tenant.
export async function contarCanceladosViejos(
  sb: SupabaseClient,
  meses: number,
): Promise<number> {
  const { count, error } = await sb
    .from("turnos")
    .select("id", { count: "exact", head: true })
    .eq("estado", "cancelado")
    .lt("fecha_hora", corteCanceladosViejos(meses));
  if (error) throw error;
  return count ?? 0;
}

// Borra de verdad los cancelados anteriores al corte. Solo lo puede correr un
// owner: la RLS impide el delete a los profesionales (no hace falta revalidar
// acá). Devuelve cuántas filas se borraron.
export async function eliminarCanceladosViejos(
  sb: SupabaseClient,
  meses: number,
): Promise<number> {
  const { data, error } = await sb
    .from("turnos")
    .delete()
    .eq("estado", "cancelado")
    .lt("fecha_hora", corteCanceladosViejos(meses))
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}
