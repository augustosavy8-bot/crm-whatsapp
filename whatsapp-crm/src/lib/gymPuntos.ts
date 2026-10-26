// ============================================================
// Motor de puntos del gimnasio ("Point" adaptado a KinActiva).
//
// Los puntos salen de la asistencia que ya se registra (gym_asistencias,
// estado 'presente'); no hay doble carga. Esquema SEMANAL (lunes a domingo):
//   - Semana COMPLETA (asististe a tus días del plan o más) -> 3 puntos.
//   - MEDIA semana (asististe al menos la mitad, pero no completa) -> 1 punto.
//   - Menos de la mitad -> 0.
// El total del mes es la suma de las semanas. A fin de mes, los TOP_N con más
// puntos se llevan el premio.
//
// La "meta" semanal de cada socio son los días de su plan (gym_planes.dias_semana).
// Si no tiene plan, se usa META_DEFAULT. La "mitad" se redondea hacia arriba.
// ============================================================

export const PUNTOS_SEMANA_COMPLETA = 3;
export const PUNTOS_MEDIA_SEMANA = 1;
export const META_DEFAULT = 3; // días/semana si el socio no tiene plan
export const TOP_N = 3; // cuántos ganan el premio del mes
export const TABLA_TOP = 10; // cuántos puestos se muestran; más abajo = "+10"

export interface FilaPuntos {
  alumnoId: string;
  nombre: string;
  asistencias: number; // total del mes (informativo)
  semanasCompletas: number;
  semanasMedias: number;
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

// Arma el ranking del mes. Cada item: { alumno_id, fecha, nombre, meta } donde
// meta = días/semana del plan del socio.
export function calcularRankingMes(
  asistencias: {
    alumno_id: string;
    fecha: string;
    nombre: string;
    meta: number;
  }[],
): FilaPuntos[] {
  const porAlumno = new Map<
    string,
    { nombre: string; meta: number; porSemana: Map<string, number> }
  >();

  for (const a of asistencias) {
    let e = porAlumno.get(a.alumno_id);
    if (!e) {
      e = { nombre: a.nombre, meta: a.meta, porSemana: new Map() };
      porAlumno.set(a.alumno_id, e);
    }
    const wk = lunesDeSemana(a.fecha);
    e.porSemana.set(wk, (e.porSemana.get(wk) ?? 0) + 1);
  }

  const filas: FilaPuntos[] = [];
  for (const [alumnoId, e] of porAlumno) {
    const meta = e.meta > 0 ? e.meta : META_DEFAULT;
    const umbralMedia = Math.ceil(meta / 2); // la mitad redondeada hacia arriba
    let asistencias = 0;
    let semanasCompletas = 0;
    let semanasMedias = 0;
    let puntos = 0;
    for (const n of e.porSemana.values()) {
      asistencias += n;
      if (n >= meta) {
        semanasCompletas += 1;
        puntos += PUNTOS_SEMANA_COMPLETA;
      } else if (n >= umbralMedia) {
        semanasMedias += 1;
        puntos += PUNTOS_MEDIA_SEMANA;
      }
    }
    filas.push({
      alumnoId,
      nombre: e.nombre,
      asistencias,
      semanasCompletas,
      semanasMedias,
      puntos,
    });
  }

  filas.sort(
    (a, b) =>
      b.puntos - a.puntos ||
      b.semanasCompletas - a.semanasCompletas ||
      b.asistencias - a.asistencias ||
      a.nombre.localeCompare(b.nombre),
  );
  return filas;
}
