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

export interface GymSocio {
  id: string;
  nombre: string;
  telefono: string;
  email: string | null;
  es_socio: boolean;
  cuota_hasta: string | null;
  metodo_pago: "efectivo" | "mercadopago";
  mp_preapproval_id: string | null;
  mp_estado: string | null;
  created_at: string;
  auth_user_id: string | null; // tiene cuenta de login
  invite_token: string | null; // invitación pendiente
  invite_expires_at: string | null;
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
      "id, nombre, telefono, email, es_socio, cuota_hasta, metodo_pago, mp_preapproval_id, mp_estado, created_at, auth_user_id, invite_token, invite_expires_at",
    )
    .order("nombre", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GymSocio[];
}

export async function updateGymSocio(
  sb: SupabaseClient,
  id: string,
  patch: Partial<Pick<GymSocio, "es_socio" | "cuota_hasta" | "metodo_pago">>,
): Promise<void> {
  const { error } = await sb.from("gym_alumnos").update(patch).eq("id", id);
  if (error) throw error;
}
