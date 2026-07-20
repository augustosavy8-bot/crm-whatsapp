import type { TurnoEstado } from "./types";

// Estados de un turno + sus etiquetas y colores, compartidos por la lista
// operativa y la agenda (grilla). Un solo lugar para no divergir.

export const ESTADOS: TurnoEstado[] = [
  "pendiente",
  "confirmado",
  "cancelado",
  "atendido",
  "ausente",
];

export const ESTADO_LABEL: Record<TurnoEstado, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  cancelado: "Cancelado",
  atendido: "Atendió",
  ausente: "No asistió",
};

export const ESTADO_COLOR: Record<TurnoEstado, string> = {
  pendiente: "bg-warn/15 text-warn",
  confirmado: "bg-ok/15 text-ok",
  cancelado: "bg-danger/15 text-danger",
  atendido: "bg-surface-2 text-muted",
  ausente: "bg-danger/15 text-danger",
};
