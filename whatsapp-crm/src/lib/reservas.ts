import type { SupabaseClient } from "@supabase/supabase-js";
import type { Servicio, ProfesionalHorario, ProfesionalBloqueo } from "./types";

// Helpers del panel admin de reservas. Todos con el cliente de sesión: RLS
// scopea al tenant del agente logueado. No usar el service client acá.

export interface ProfesionalConNombre {
  id: string;
  name: string | null;
}

// Profesionales del tenant (agents con rol 'profesional').
export async function getProfesionales(
  sb: SupabaseClient,
): Promise<ProfesionalConNombre[]> {
  const { data, error } = await sb
    .from("agents")
    .select("id, name")
    .eq("role", "profesional")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProfesionalConNombre[];
}

export interface ServicioConProfesional extends Servicio {
  profesional: { id: string; name: string | null } | null;
}

// Todos los servicios (activos e inactivos) con su profesional, para configurar.
export async function getServiciosAdmin(
  sb: SupabaseClient,
): Promise<ServicioConProfesional[]> {
  const { data, error } = await sb
    .from("servicios")
    .select("*, profesional:agents(id, name)")
    .order("orden", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ServicioConProfesional[];
}

export async function getHorarios(
  sb: SupabaseClient,
): Promise<ProfesionalHorario[]> {
  const { data, error } = await sb
    .from("profesional_horarios")
    .select("*")
    .order("dia_semana", { ascending: true })
    .order("hora_inicio", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProfesionalHorario[];
}

// Bloqueos futuros (los ya pasados no sirven para configurar).
export async function getBloqueosFuturos(
  sb: SupabaseClient,
): Promise<ProfesionalBloqueo[]> {
  const { data, error } = await sb
    .from("profesional_bloqueos")
    .select("*")
    .gte("hasta", new Date().toISOString())
    .order("desde", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProfesionalBloqueo[];
}
