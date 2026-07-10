import Anthropic from "@anthropic-ai/sdk";
import type { InterpretedTurno } from "@/lib/types";

// Modelo elegido a propósito (más barato/rápido que Opus): esto se dispara
// en cada mensaje de WhatsApp que pasa el prefiltro de palabras clave, y es
// una extracción estructurada simple, no una tarea de razonamiento pesado.
const MODEL = "claude-haiku-4-5";

const SCHEMA = {
  type: "object" as const,
  properties: {
    es_pedido_turno: { type: "boolean" as const },
    fecha: { type: ["string", "null"] as const },
    hora: { type: ["string", "null"] as const },
    duracion_min: { type: ["integer", "null"] as const },
    notas: { type: ["string", "null"] as const },
    paciente_nombre: { type: ["string", "null"] as const },
    confianza: { type: "string" as const, enum: ["alta", "media", "baja"] },
    ambiguedades: { type: "array" as const, items: { type: "string" as const } },
  },
  required: [
    "es_pedido_turno",
    "fecha",
    "hora",
    "duracion_min",
    "notas",
    "paciente_nombre",
    "confianza",
    "ambiguedades",
  ],
  additionalProperties: false,
};

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  client = new Anthropic({ apiKey });
  return client;
}

// Interpreta un texto en lenguaje natural como un posible pedido de turno.
// Devuelve null ante cualquier error (sin API key, timeout, etc.) — nunca
// tira: todos los llamadores son best-effort.
export async function interpretTurnoText(
  texto: string,
  opts: { hoyISO: string },
): Promise<InterpretedTurno | null> {
  const anthropic = getClient();
  if (!anthropic || !texto.trim()) return null;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: `Interpretás mensajes en español rioplatense para un consultorio de salud. Hoy es ${opts.hoyISO} (America/Argentina/Buenos_Aires). Si el texto menciona un día relativo ("el jueves", "mañana"), resolvelo a fecha absoluta usando hoy como referencia. Si no hay suficiente información para una fecha u hora concreta, dejá esos campos en null y anotá la ambigüedad. No inventes datos que no estén en el texto.`,
      messages: [{ role: "user", content: texto }],
      output_config: {
        format: { type: "json_schema", schema: SCHEMA },
      },
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;
    return JSON.parse(textBlock.text) as InterpretedTurno;
  } catch (e) {
    console.error("[interpretTurno] error", e);
    return null;
  }
}
