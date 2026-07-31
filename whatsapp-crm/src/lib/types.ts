// Tipos de dominio del CRM (espejo del schema de Supabase).

export type ConversationStatus = "abierta" | "en_proceso" | "resuelta";
export type MessageDirection = "inbound" | "outbound";
export type Channel = "whatsapp";
export type MessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed";


export interface Contact {
  id: string;
  channel: Channel;
  phone_number: string | null;
  external_id: string | null;
  username: string | null;
  wa_id: string | null;
  name: string | null;
  tags: string[];
  status: ConversationStatus;
  notes: string | null;
  assigned_agent_id: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  unread_count: number;
  tenant_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  contact_id: string;
  channel: Channel;
  wa_message_id: string | null;
  direction: MessageDirection;
  type: string;
  body: string | null;
  media_url: string | null;
  template_name: string | null;
  status: MessageStatus | null;
  error: string | null;
  raw_payload: unknown;
  sent_by: string | null;
  is_bot: boolean;
  tenant_id: string | null;
  created_at: string;
}

export type AgentRole = "owner" | "profesional" | "secretaria";

export interface Agent {
  id: string;
  auth_user_id: string | null;
  tenant_id: string | null;
  role: AgentRole;
  name: string | null;
  email: string | null;
  created_at: string;
}

export type TenantStatus = "trialing" | "active" | "paused" | "cancelled";

export interface Tenant {
  id: string;
  nombre: string;
  rubro_slug: string;
  status: TenantStatus;
  whatsapp_phone_number_id: string | null;
  whatsapp_waba_id: string | null;
  messenger_page_id: string | null;
  instagram_business_id: string | null;
  created_at: string;
}

export interface Template {
  id: string;
  name: string;
  language: string;
  category: string | null;
  body: string | null;
  variables: unknown;
  approved: boolean;
  tenant_id: string | null;
  created_at: string;
}

// Fila de la vista `conversation_list`: un contacto + su último mensaje.
export interface ConversationListItem extends Contact {
  last_message_body: string | null;
  last_message_type: string | null;
  last_message_direction: MessageDirection | null;
  last_message_created_at: string | null;
}

// Vista `channel_stats`: resumen por canal (dashboard).
export interface ChannelStat {
  channel: Channel;
  total_conversations: number;
  open_conversations: number;
  unread_total: number;
  inbound_24h: number;
}

// Vista `messages_daily`: entrantes por día y canal (dashboard).
export interface MessagesDaily {
  day: string; // date (YYYY-MM-DD)
  channel: Channel;
  inbound: number;
}

// ------------------------------------------------------------
// Dominio clínico (Paso 3)
// ------------------------------------------------------------

export interface Paciente {
  id: string;
  tenant_id: string;
  contact_id: string | null;
  nombre: string;
  dni: string | null;
  telefono: string | null;
  email: string | null;
  obra_social: string | null;
  datos: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type TurnoEstado =
  | "pendiente"
  | "confirmado"
  | "cancelado"
  | "atendido"
  | "ausente";

export type TurnoOrigen = "manual" | "web";

// --- Módulo de reservas del gimnasio (migración 0019) ---

export interface Servicio {
  id: string;
  tenant_id: string;
  nombre: string;
  slug: string;
  descripcion: string | null;
  duracion_min: number;
  profesional_id: string | null;
  activo: boolean;
  orden: number;
  created_at: string;
}

// Servicio + nombre del profesional, para la landing/reserva pública.
// Solo datos no sensibles.
export interface ServicioPublico {
  id: string;
  nombre: string;
  slug: string;
  descripcion: string | null;
  duracion_min: number;
  profesional_nombre: string | null;
}

export interface ProfesionalHorario {
  id: string;
  tenant_id: string;
  profesional_id: string;
  dia_semana: number; // 0=domingo .. 6=sábado
  hora_inicio: string; // "HH:MM:SS"
  hora_fin: string;
  activo: boolean;
  created_at: string;
}

export interface ProfesionalBloqueo {
  id: string;
  tenant_id: string;
  profesional_id: string;
  desde: string; // timestamptz ISO
  hasta: string;
  motivo: string | null;
  created_at: string;
}

export interface Turno {
  id: string;
  tenant_id: string;
  paciente_id: string;
  profesional_id: string | null;
  fecha_hora: string;
  fecha_fin: string | null;
  duracion_min: number;
  servicio_id: string | null;
  estado: TurnoEstado;
  notas: string | null;
  recordatorio_enviado_at: string | null;
  origen: TurnoOrigen;
  created_at: string;
}

// Turno + datos del paciente para listar sin joins manuales en la UI.
export interface TurnoConPaciente extends Turno {
  paciente: Pick<Paciente, "id" | "nombre" | "telefono"> | null;
}

// Turno + paciente + servicio + profesional, para la agenda admin.
export interface TurnoConDetalle extends Turno {
  paciente: Pick<Paciente, "id" | "nombre" | "telefono"> | null;
  servicio: Pick<Servicio, "id" | "nombre"> | null;
  profesional: { id: string; name: string | null } | null;
}

export interface HistoriaClinica {
  id: string;
  tenant_id: string;
  paciente_id: string;
  profesional_id: string | null;
  fecha: string;
  datos: Record<string, unknown>;
  created_at: string;
}

export type CampoTipo =
  | "text"
  | "number"
  | "select"
  | "date"
  | "boolean"
  | "textarea";

export type CampoEntidad = "paciente" | "turno" | "historia_clinica";

export interface CampoConfig {
  id: string;
  vertical_slug: string;
  tenant_id: string | null;
  entidad: CampoEntidad;
  campo: string;
  tipo: CampoTipo;
  etiqueta: string;
  opciones: string[];
  obligatorio: boolean;
  orden: number;
}
