// TEMPORAL — Gate de prueba del módulo de Puntos.
//
// La vista de Puntos (asistencias → puntos → ranking/premios) y el check-in
// están habilitados SOLO para las cuentas de prueba mientras se diseña. El
// resto de los socios no los ve.
//
// Para habilitarlo a TODOS: que `puntosHabilitadoParaAlumno` devuelva siempre
// `true` (o vaciar los sets y cambiar la condición).
const TELEFONOS_PRUEBA_PUNTOS = new Set<string>([
  "3471538679", // Augusto Savy (socio de prueba)
]);

// Cuentas de prueba por email (socio y/o admin). Sirve para habilitar la vista
// aunque el socio no tenga teléfono cargado.
const EMAILS_PRUEBA_PUNTOS = new Set<string>([
  "augustosavy8@gmail.com",
  "chichisavy18@gmail.com",
]);

export function puntosHabilitadoParaAlumno(
  telefono: string | null,
  email: string | null = null,
): boolean {
  if (telefono && TELEFONOS_PRUEBA_PUNTOS.has(telefono)) return true;
  if (email && EMAILS_PRUEBA_PUNTOS.has(email.toLowerCase())) return true;
  return false;
}

// Gate del panel de Puntos para el staff (ver el ranking + el QR desde el panel
// de admin). Por ahora solo las cuentas de prueba.
const EMAILS_PANEL_PUNTOS = new Set<string>([
  "augustosavy8@gmail.com", // Augusto (admin)
  "chichisavy18@gmail.com",
  "giangym@gmail.com", // Gian Orlandi (profe)
]);

export function puntosPanelHabilitado(email: string | null): boolean {
  return !!email && EMAILS_PANEL_PUNTOS.has(email.toLowerCase());
}
