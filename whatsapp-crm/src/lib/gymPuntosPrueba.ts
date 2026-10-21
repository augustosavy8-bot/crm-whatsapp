// TEMPORAL — Gate de prueba del módulo de Puntos.
//
// La vista de Puntos (asistencias → puntos → ranking/premios) está habilitada
// SOLO para la cuenta de prueba mientras se diseña. El resto de los socios no la ve.
//
// Para habilitarla a TODOS: que `puntosHabilitadoParaAlumno` devuelva siempre
// `true` (o vaciar el set y cambiar la condición).
const TELEFONOS_PRUEBA_PUNTOS = new Set<string>([
  "3471538679", // Augusto Savy (prueba)
]);

export function puntosHabilitadoParaAlumno(telefono: string | null): boolean {
  return !!telefono && TELEFONOS_PRUEBA_PUNTOS.has(telefono);
}

// Gate del panel de Puntos para el staff (ver el ranking + el QR desde el panel
// de admin). Por ahora solo la cuenta de admin de prueba.
const EMAILS_PANEL_PUNTOS = new Set<string>([
  "augustosavy8@gmail.com", // Augusto (admin)
]);

export function puntosPanelHabilitado(email: string | null): boolean {
  return !!email && EMAILS_PANEL_PUNTOS.has(email.toLowerCase());
}
