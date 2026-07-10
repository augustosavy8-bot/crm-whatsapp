// Filtro de volumen (no de precisión): evita llamar a la IA en cada mensaje
// casual ("Hola", "Gracias"). El clasificador `es_pedido_turno` de la IA
// sigue siendo la fuente de verdad para lo que sí pasa este filtro.
const TURNO_KEYWORDS =
  /\b(turno|cita|horario|disponib|agend|reserv|consulta|atend)\w*/i;

export function pareceMencionarTurno(texto: string): boolean {
  return TURNO_KEYWORDS.test(texto);
}
