// ============================================================
// Motor de puntos del gimnasio ("Point" adaptado a KinActiva).
//
// Los puntos salen de la asistencia que ya se registra (gym_asistencias,
// estado 'presente'); no hay doble carga. Reglas (v1, configurables a futuro):
//   - 1 punto por cada asistencia (clase a la que fue).
//   - Bonus de constancia: si en una semana (lunes a domingo) completa
//     BONUS_CLASES_SEMANA asistencias, suma BONUS_PUNTOS esa semana.
//   - A fin de mes, los TOP_N con más puntos se llevan el premio.
// ============================================================

export const PUNTOS_POR_ASISTENCIA = 1;
export const BONUS_CLASES_SEMANA = 3; // clases en la semana para el bonus
export const BONUS_PUNTOS = 2; // puntos de bonus por semana cumplida
export const TOP_N = 3; // cuántos ganan el premio del mes
export const TABLA_TOP = 10; // cuántos puestos se muestran; más abajo = "+10"

export interface FilaPuntos {
  alumnoId: string;
  nombre: string;
  asistencias: number;
  semanasConBonus: number;
  bonus: number;
  puntos: number;
}

// Lunes (YYYY-MM-DD) de la semana de una fecha. Usa mediodía UTC para no bailar
// con DST. getUTCDay: 0=domingo..6=sábado.
function lunesDeSemana(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const dow = d.getUTCDay();
  const haciaLunes = (dow + 6) % 7; // lun->0, mar->1, ..., dom->6
  d.setUTCDate(d.getUTCDate() - haciaLunes);
  return d.toISOString().slice(0, 10);
}

// Arma el ranking del mes a partir de las asistencias 'presente' del mes.
// Cada item: { alumno_id, fecha, nombre }.
export function calcularRankingMes(
  asistencias: { alumno_id: string; fecha: string; nombre: string }[],
): FilaPuntos[] {
  const porAlumno = new Map<
    string,
    { nombre: string; porSemana: Map<string, number> }
  >();

  for (const a of asistencias) {
    let e = porAlumno.get(a.alumno_id);
    if (!e) {
      e = { nombre: a.nombre, porSemana: new Map() };
      porAlumno.set(a.alumno_id, e);
    }
    const wk = lunesDeSemana(a.fecha);
    e.porSemana.set(wk, (e.porSemana.get(wk) ?? 0) + 1);
  }

  const filas: FilaPuntos[] = [];
  for (const [alumnoId, e] of porAlumno) {
    let asistencias = 0;
    let semanasConBonus = 0;
    for (const n of e.porSemana.values()) {
      asistencias += n;
      if (n >= BONUS_CLASES_SEMANA) semanasConBonus += 1;
    }
    const bonus = semanasConBonus * BONUS_PUNTOS;
    filas.push({
      alumnoId,
      nombre: e.nombre,
      asistencias,
      semanasConBonus,
      bonus,
      puntos: asistencias * PUNTOS_POR_ASISTENCIA + bonus,
    });
  }

  filas.sort(
    (a, b) =>
      b.puntos - a.puntos ||
      b.asistencias - a.asistencias ||
      a.nombre.localeCompare(b.nombre),
  );
  return filas;
}
