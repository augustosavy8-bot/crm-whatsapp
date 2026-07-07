// Utilidades de formato compartidas por la lista y las burbujas.

const MEDIA_LABEL: Record<string, string> = {
  image: "[Imagen]",
  audio: "[Audio]",
  voice: "[Audio]",
  video: "[Video]",
  document: "[Documento]",
  sticker: "[Sticker]",
  location: "[Ubicación]",
  contacts: "[Contacto]",
};

// Texto a mostrar para un mensaje: el body si es texto, o un placeholder por tipo.
export function messagePreview(
  type: string | null,
  body: string | null,
): string {
  if (body && body.trim()) return body;
  if (type && MEDIA_LABEL[type]) return MEDIA_LABEL[type];
  if (type && type !== "text") return `[${type}]`;
  return "";
}

// Hora corta HH:MM.
export function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Etiqueta compacta para la lista: hora si es hoy, si no fecha corta.
export function formatListTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return formatTime(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

// Nombre a mostrar: el nombre del contacto o su número.
export function displayName(
  name: string | null,
  phone: string | null,
): string {
  return (name && name.trim()) || phone || "Sin número";
}

// Etiqueta de un contacto que puede NO tener teléfono (IG/Messenger):
// nombre → @username → teléfono → label del canal (mejor que el id crudo).
export function contactLabel(c: {
  name: string | null;
  username: string | null;
  phone_number: string | null;
  external_id?: string | null;
  channel?: string | null;
}): string {
  if (c.name && c.name.trim()) return c.name;
  if (c.username && c.username.trim()) return "@" + c.username.trim();
  if (c.phone_number && c.phone_number.trim()) return c.phone_number;
  if (c.channel === "instagram") return "Usuario de Instagram";
  if (c.channel === "facebook") return "Usuario de Messenger";
  if (c.external_id) return "#" + c.external_id.slice(-6);
  return "Sin identificar";
}

// Subtítulo del contacto: teléfono si tiene, si no el @username.
export function contactSubtitle(c: {
  username: string | null;
  phone_number: string | null;
}): string {
  if (c.phone_number && c.phone_number.trim()) return c.phone_number;
  if (c.username && c.username.trim()) return "@" + c.username.trim();
  return "";
}
