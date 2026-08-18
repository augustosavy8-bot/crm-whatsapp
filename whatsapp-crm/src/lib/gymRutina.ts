import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Rutinas de entrenamiento (prototipo). El staff arma una rutina estructurada
// por alumno; el alumno la ve y registra el peso/reps que hizo.
// Estas funciones son para el STAFF (cliente de sesión + RLS staff). La lectura
// del alumno y el alta de logs van server-side (ver mi-cuenta / API).
// ============================================================

export interface RutinaEjercicio {
  id: string;
  nombre: string;
  series: string;
  reps: string;
  peso: string;
  descanso: string;
  nota: string;
}

export interface RutinaDia {
  id: string;
  nombre: string;
  ejercicios: RutinaEjercicio[];
}

export interface GymRutina {
  id: string;
  alumno_id: string;
  nombre: string;
  dias: RutinaDia[];
  updated_at: string;
}

export interface GymRutinaLog {
  id: string;
  ejercicio_id: string;
  ejercicio_nombre: string | null;
  fecha: string;
  peso: string | null;
  reps: string | null;
  nota: string | null;
}

// Rutina de un alumno (o null si todavía no tiene).
export async function getRutinaAlumno(
  sb: SupabaseClient,
  alumnoId: string,
): Promise<GymRutina | null> {
  const { data, error } = await sb
    .from("gym_rutinas")
    .select("id, alumno_id, nombre, dias, updated_at")
    .eq("alumno_id", alumnoId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    dias: (data.dias ?? []) as RutinaDia[],
  } as GymRutina;
}

// Crea o actualiza la rutina del alumno (una por alumno).
export async function guardarRutinaAlumno(
  sb: SupabaseClient,
  args: {
    tenantId: string;
    alumnoId: string;
    nombre: string;
    dias: RutinaDia[];
  },
): Promise<void> {
  const { error } = await sb.from("gym_rutinas").upsert(
    {
      tenant_id: args.tenantId,
      alumno_id: args.alumnoId,
      nombre: args.nombre.trim() || "Rutina",
      dias: args.dias,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "alumno_id" },
  );
  if (error) throw error;
}
