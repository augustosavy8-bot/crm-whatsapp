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
  "3471506063", // Serafin Savy
]);

export function rutinaHabilitadaParaAlumno(telefono: string | null): boolean {
  return !!telefono && TELEFONOS_PRUEBA_RUTINA.has(telefono);
}

// Staff que puede crear/editar rutinas. Por ahora solo el perfil de prueba;
// para habilitar a todo el staff, que `staffPuedeRutinas` devuelva true.
const EMAILS_STAFF_RUTINA = new Set<string>([
  "augustosavy8@gmail.com", // Augusto Savy (staff de prueba)
]);

export function staffPuedeRutinas(email: string | null): boolean {
  return !!email && EMAILS_STAFF_RUTINA.has(email.toLowerCase());
}
