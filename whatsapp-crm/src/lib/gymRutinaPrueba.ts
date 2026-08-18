// TEMPORAL — Rutinas en prueba.
//
// El sistema de rutinas está habilitado SOLO para el perfil de alumno de
// Augusto Savy mientras se valida el flujo. El resto de los alumnos no lo ve,
// y en el panel del staff solo se puede armar la rutina de ese alumno.
//
// Para abrirlo a TODOS: que `rutinaHabilitadaParaAlumno` devuelva `true`
// (o vaciar el set y cambiar la condición).
const TELEFONOS_PRUEBA_RUTINA = new Set<string>([
  "3471538679", // Augusto Savy (alumno de prueba)
]);

export function rutinaHabilitadaParaAlumno(telefono: string | null): boolean {
  return !!telefono && TELEFONOS_PRUEBA_RUTINA.has(telefono);
}
