// TEMPORAL — Gate de prueba de MercadoPago.
//
// La opción de "Pagar cuota con MercadoPago" está habilitada SOLO para cuentas
// de prueba mientras se valida el flujo (a dónde redirige, credenciales, etc.).
// El resto de los socios no la ve.
//
// Para habilitarla a TODOS los socios: hacer que `mpHabilitadoParaAlumno`
// devuelva siempre `true` (o vaciar este set y cambiar la condición).
const TELEFONOS_PRUEBA_MP = new Set<string>([
  "3471538679", // Augusto Savy (prueba)
]);

export function mpHabilitadoParaAlumno(telefono: string | null): boolean {
  return !!telefono && TELEFONOS_PRUEBA_MP.has(telefono);
}
