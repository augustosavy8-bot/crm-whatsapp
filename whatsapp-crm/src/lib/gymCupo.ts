import { createServiceClient } from "@/lib/supabase/service";

// ============================================================
// Capa de datos del módulo de cupo del gimnasio (migración 0023).
//
// El alumno NO tiene sesión: se identifica por WhatsApp, igual que la
// reserva pública de turnos. Todo pasa por funciones `security definer`
// invocadas con el service client desde route handlers — nunca RLS.
// Los route handlers son la capa de confianza (resuelven el tenant y
// normalizan el teléfono antes de llamar acá).
// ============================================================

export interface GymHorarioDia {
  horario_id: string;
  dia_semana: number;
  hora_inicio: string; // "HH:MM:SS"
  hora_fin: string;
  capacidad_max: number;
  cupo_usado: number;
}

export type GymTipoReserva = "fijo" | "suelta";

export interface GymMiReserva {
  tipo: GymTipoReserva;
  id: string;
  horario_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  fecha: string | null; // solo sueltas
  fecha_desde: string | null; // solo fijos
  activo: boolean | null;
  estado: string | null;
}

// Horarios activos de un día concreto con su cupo usado/total.
export async function getHorariosDia(
  tenantId: string,
  fecha: string,
): Promise<GymHorarioDia[]> {
  const sb = createServiceClient();
  const { data, error } = await sb.rpc("gym_horarios_dia", {
    p_tenant_id: tenantId,
    p_fecha: fecha,
  });
  if (error) throw error;
  return (data ?? []) as GymHorarioDia[];
}

// Alta de reserva suelta (una fecha puntual). Devuelve el id de la reserva.
export async function reservarSuelta(args: {
  horarioId: string;
  fecha: string;
  nombre: string;
  telefono: string;
}): Promise<string> {
  const sb = createServiceClient();
  const { data, error } = await sb.rpc("gym_reservar_suelta", {
    p_horario_id: args.horarioId,
    p_fecha: args.fecha,
    p_nombre: args.nombre,
    p_telefono: args.telefono,
  });
  if (error) throw error;
  return data as string;
}

// Alta de turno fijo semanal. Devuelve el id del fijo.
export async function anotarFijo(args: {
  horarioId: string;
  fechaDesde: string;
  nombre: string;
  telefono: string;
}): Promise<string> {
  const sb = createServiceClient();
  const { data, error } = await sb.rpc("gym_anotar_fijo", {
    p_horario_id: args.horarioId,
    p_fecha_desde: args.fechaDesde,
    p_nombre: args.nombre,
    p_telefono: args.telefono,
  });
  if (error) throw error;
  return data as string;
}

// Reservas futuras del alumno (fijos activos + sueltas confirmadas desde hoy).
export async function getMisReservas(
  telefono: string,
): Promise<GymMiReserva[]> {
  const sb = createServiceClient();
  const { data, error } = await sb.rpc("gym_mis_reservas", {
    p_telefono: telefono,
  });
  if (error) throw error;
  return (data ?? []) as GymMiReserva[];
}

// El alumno marca que un día puntual NO va a su fijo (libera el cupo).
export async function marcarExcepcion(args: {
  turnoFijoId: string;
  fecha: string;
  telefono: string;
}): Promise<void> {
  const sb = createServiceClient();
  const { error } = await sb.rpc("gym_marcar_excepcion", {
    p_turno_fijo_id: args.turnoFijoId,
    p_fecha: args.fecha,
    p_telefono: args.telefono,
  });
  if (error) throw error;
}

export async function cancelarSuelta(args: {
  reservaId: string;
  telefono: string;
}): Promise<void> {
  const sb = createServiceClient();
  const { error } = await sb.rpc("gym_cancelar_suelta", {
    p_reserva_id: args.reservaId,
    p_telefono: args.telefono,
  });
  if (error) throw error;
}

export async function cancelarFijo(args: {
  turnoFijoId: string;
  telefono: string;
}): Promise<void> {
  const sb = createServiceClient();
  const { error } = await sb.rpc("gym_cancelar_fijo", {
    p_turno_fijo_id: args.turnoFijoId,
    p_telefono: args.telefono,
  });
  if (error) throw error;
}
