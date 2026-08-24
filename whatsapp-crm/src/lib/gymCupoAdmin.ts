import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Capa de datos del panel admin del gimnasio (owner / gym_admin).
// A diferencia del flujo del alumno (service client, sin sesión), acá
// TODO va con el cliente de sesión: RLS scopea al tenant y exige el gate
// owner/gym_admin. No usar el service client acá. Molde igual a
// turnos.ts / reservas.ts: (sb, ...args), sin filtrar por tenant.
// ============================================================

export interface GymHorario {
  id: string;
  tenant_id: string;
  profesional_id: string | null;
  dia_semana: number; // 0=domingo .. 6=sábado
  hora_inicio: string; // "HH:MM:SS"
  hora_fin: string;
  capacidad_max: number;
  activo: boolean;
  created_at: string;
}

export interface GymAlumnoEnClase {
  tipo: "fijo" | "suelto";
  alumno_id: string;
  nombre: string;
  // suelta: 'pendiente' | 'confirmada' ; fijo: 'pendiente' | 'confirmado'
  estado: string;
  es_socio: boolean;
  cuota_hasta: string | null;
  turno_fijo_id?: string;
  reserva_id?: string;
}

export interface GymPlan {
  id: string;
  tenant_id: string;
  nombre: string;
  dias_semana: number | null;
  precio: number;
  activo: boolean;
  orden: number;
}

export interface GymSocio {
  id: string;
  nombre: string;
  telefono: string | null; // los socios importados del padrón no traen teléfono
  email: string | null;
  es_socio: boolean;
  cuota_hasta: string | null;
  metodo_pago: "efectivo" | "mercadopago";
  created_at: string;
  auth_user_id: string | null; // tiene cuenta de login
  invite_token: string | null; // invitación pendiente
  invite_expires_at: string | null;
  plan_id: string | null;
  plan: Pick<GymPlan, "id" | "nombre" | "precio" | "dias_semana"> | null;
}

export interface GymOcupacionHorario {
  horario_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  capacidad_max: number;
  cupo_usado: number;
  alumnos: GymAlumnoEnClase[];
}

// Todos los horarios del gimnasio (activos e inactivos), para configurar.
export async function getGymHorarios(sb: SupabaseClient): Promise<GymHorario[]> {
  const { data, error } = await sb
    .from("gym_horarios")
    .select("*")
    .order("dia_semana", { ascending: true })
    .order("hora_inicio", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GymHorario[];
}

// Ocupación de un día: por horario, quién va (fijo/suelto) y cupo usado/total.
// gym_ocupacion_por_fecha es security definer y valida el gate (owner/gym_admin)
// leyendo el JWT del usuario logueado.
export async function getGymOcupacion(
  sb: SupabaseClient,
  fecha: string,
): Promise<GymOcupacionHorario[]> {
  const { data, error } = await sb.rpc("gym_ocupacion_por_fecha", {
    p_fecha: fecha,
  });
  if (error) throw error;
  return (data ?? []) as GymOcupacionHorario[];
}

export async function crearGymHorario(
  sb: SupabaseClient,
  args: {
    tenantId: string;
    diaSemana: number;
    horaInicio: string; // "HH:MM"
    horaFin: string;
    capacidadMax: number;
  },
): Promise<GymHorario> {
  const { data, error } = await sb
    .from("gym_horarios")
    .insert({
      tenant_id: args.tenantId,
      dia_semana: args.diaSemana,
      hora_inicio: args.horaInicio,
      hora_fin: args.horaFin,
      capacidad_max: args.capacidadMax,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as GymHorario;
}

export async function setGymHorarioActivo(
  sb: SupabaseClient,
  id: string,
  activo: boolean,
): Promise<void> {
  const { error } = await sb
    .from("gym_horarios")
    .update({ activo })
    .eq("id", id);
  if (error) throw error;
}

// --- Socios ---

// Todos los alumnos del gimnasio (socios y no socios), para el padrón.
export async function getGymAlumnos(sb: SupabaseClient): Promise<GymSocio[]> {
  const { data, error } = await sb
    .from("gym_alumnos")
    .select(
      "id, nombre, telefono, email, es_socio, cuota_hasta, metodo_pago, created_at, auth_user_id, invite_token, invite_expires_at, plan_id, plan:gym_planes(id, nombre, precio, dias_semana)",
    )
    .order("nombre", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as GymSocio[];
}

export async function updateGymSocio(
  sb: SupabaseClient,
  id: string,
  patch: Partial<
    Pick<GymSocio, "es_socio" | "cuota_hasta" | "metodo_pago" | "email">
  >,
): Promise<void> {
  const { error } = await sb.from("gym_alumnos").update(patch).eq("id", id);
  if (error) throw error;
}

// --- Pagos (libro por socio) ---

export type MetodoPago =
  | "efectivo"
  | "transferencia"
  | "mercadopago"
  | "debito"
  | "otro";

export interface GymPago {
  id: string;
  alumno_id: string;
  fecha: string; // YYYY-MM-DD
  monto: number | null;
  metodo: MetodoPago;
  nota: string | null;
  cuota_hasta: string | null; // a qué fecha quedó la cuota tras este pago
  created_at: string;
}

// Registra un pago Y actualiza la cuota del socio en una sola transacción
// (RPC security definer). Devuelve el asiento creado, con la cuota_hasta ya
// resuelta por el servidor. cuotaHasta null => "+1 mes" desde el vencimiento.
export async function registrarPagoGym(
  sb: SupabaseClient,
  args: {
    alumnoId: string;
    monto?: number | null;
    metodo?: MetodoPago;
    fecha?: string | null; // YYYY-MM-DD
    cuotaHasta?: string | null; // YYYY-MM-DD; null => +1 mes
    nota?: string | null;
  },
): Promise<GymPago> {
  const { data, error } = await sb.rpc("gym_registrar_pago", {
    p_alumno_id: args.alumnoId,
    p_monto: args.monto ?? null,
    p_metodo: args.metodo ?? "efectivo",
    p_fecha: args.fecha ?? null,
    p_cuota_hasta: args.cuotaHasta ?? null,
    p_nota: args.nota ?? null,
  });
  if (error) throw error;
  return data as GymPago;
}

// Revierte un pago: lo borra del libro y recalcula el vencimiento del socio.
export async function revertirPago(
  sb: SupabaseClient,
  pagoId: string,
): Promise<void> {
  const { error } = await sb.rpc("gym_revertir_pago", { p_pago_id: pagoId });
  if (error) throw error;
}

// Elimina un socio de la lista (borra su ficha y todo lo asociado).
export async function eliminarSocio(
  sb: SupabaseClient,
  alumnoId: string,
): Promise<void> {
  const { error } = await sb.rpc("gym_eliminar_alumno", { p_alumno_id: alumnoId });
  if (error) throw error;
}

// Historial de pagos de un socio (el más reciente primero).
export async function getPagosSocio(
  sb: SupabaseClient,
  alumnoId: string,
): Promise<GymPago[]> {
  const { data, error } = await sb
    .from("gym_pagos")
    .select("id, alumno_id, fecha, monto, metodo, nota, cuota_hasta, created_at")
    .eq("alumno_id", alumnoId)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as GymPago[];
}

// --- Días cerrados / feriados ---

export interface GymDiaCerrado {
  id: string;
  fecha: string; // YYYY-MM-DD
  motivo: string | null;
}

// Días cerrados desde una fecha en adelante (para no arrastrar feriados viejos).
export async function getDiasCerrados(
  sb: SupabaseClient,
  desde: string,
): Promise<GymDiaCerrado[]> {
  const { data, error } = await sb
    .from("gym_dias_cerrados")
    .select("id, fecha, motivo")
    .gte("fecha", desde)
    .order("fecha", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GymDiaCerrado[];
}

// Marca un día como cerrado (feriado) y cancela las reservas sueltas de ese día.
export async function marcarDiaCerrado(
  sb: SupabaseClient,
  fecha: string,
  motivo: string | null,
): Promise<void> {
  const { error } = await sb.rpc("gym_marcar_dia_cerrado", {
    p_fecha: fecha,
    p_motivo: motivo,
  });
  if (error) throw error;
}

// Reabre un día cerrado (borra el feriado). Las reservas ya canceladas no vuelven.
export async function quitarDiaCerrado(
  sb: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await sb.from("gym_dias_cerrados").delete().eq("id", id);
  if (error) throw error;
}

// --- Deuda (cuotas mensuales adeudadas) ---

export interface GymCuotaAdeudada {
  anio: number;
  mes: number;
  estado: "debe" | "parcial";
}

// Meses adeudados (estado 'debe' o 'parcial') de TODOS los socios, agrupados
// por alumno. Es la "planilla" de deuda: qué meses quedaron sin pagar. Liviano
// (solo trae lo adeudado, no toda la grilla).
export async function getDeudaResumen(
  sb: SupabaseClient,
): Promise<Record<string, GymCuotaAdeudada[]>> {
  const { data, error } = await sb
    .from("gym_cuotas")
    .select("alumno_id, anio, mes, estado")
    .in("estado", ["debe", "parcial"])
    .order("anio", { ascending: true })
    .order("mes", { ascending: true });
  if (error) throw error;
  const out: Record<string, GymCuotaAdeudada[]> = {};
  for (const r of (data ?? []) as {
    alumno_id: string;
    anio: number;
    mes: number;
    estado: "debe" | "parcial";
  }[]) {
    (out[r.alumno_id] ??= []).push({ anio: r.anio, mes: r.mes, estado: r.estado });
  }
  return out;
}

// --- Asistencia (presente / ausente por clase y día) ---

export type AsistenciaEstado = "presente" | "ausente";

// Asistencias marcadas para una fecha. Clave: `${alumnoId}|${horarioId}`.
export async function getAsistencias(
  sb: SupabaseClient,
  fecha: string,
): Promise<Record<string, AsistenciaEstado>> {
  const { data, error } = await sb
    .from("gym_asistencias")
    .select("alumno_id, horario_id, estado")
    .eq("fecha", fecha);
  if (error) throw error;
  const out: Record<string, AsistenciaEstado> = {};
  for (const r of (data ?? []) as {
    alumno_id: string;
    horario_id: string;
    estado: AsistenciaEstado;
  }[]) {
    out[`${r.alumno_id}|${r.horario_id}`] = r.estado;
  }
  return out;
}

// Marca (o cambia) la asistencia de un alumno a una clase en una fecha.
export async function marcarAsistencia(
  sb: SupabaseClient,
  args: {
    tenantId: string;
    alumnoId: string;
    horarioId: string;
    fecha: string;
    estado: AsistenciaEstado;
  },
): Promise<void> {
  const { error } = await sb.from("gym_asistencias").upsert(
    {
      tenant_id: args.tenantId,
      alumno_id: args.alumnoId,
      horario_id: args.horarioId,
      fecha: args.fecha,
      estado: args.estado,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "alumno_id,horario_id,fecha" },
  );
  if (error) throw error;
}

// --- Planes ---

export async function getPlanes(sb: SupabaseClient): Promise<GymPlan[]> {
  const { data, error } = await sb
    .from("gym_planes")
    .select("*")
    .order("orden", { ascending: true })
    .order("precio", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GymPlan[];
}

