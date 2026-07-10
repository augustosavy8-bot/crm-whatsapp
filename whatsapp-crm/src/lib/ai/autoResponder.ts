import Anthropic from "@anthropic-ai/sdk";

// Modelo elegido a propósito (más barato/rápido que Opus): se dispara en
// cada mensaje de WhatsApp entrante, es una respuesta conversacional corta
// de triage, no una tarea de razonamiento pesado.
const MODEL = "claude-haiku-4-5";

const SCHEMA = {
  type: "object" as const,
  properties: {
    respuesta: { type: "string" as const },
    necesita_humano: { type: "boolean" as const },
  },
  required: ["respuesta", "necesita_humano"],
  additionalProperties: false,
};

export interface AutoReplyTurno {
  role: "user" | "assistant";
  content: string;
}

export interface AutoReplyResult {
  respuesta: string;
  necesita_humano: boolean;
}

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  client = new Anthropic({ apiKey });
  return client;
}

function buildSystemPrompt(tenantNombre: string | null): string {
  const nombre = tenantNombre?.trim() || "el consultorio";
  return `Sos la recepción virtual por WhatsApp de ${nombre}, un profesional de salud en Argentina. Hablás en español rioplatense, con mensajes cortos y cordiales, estilo WhatsApp (sin firmar, sin markdown).

Tu único trabajo es: saludar, entender qué necesita el paciente, y si pide un turno, ofrecerle anotarlo. Nunca digas que el turno quedó "confirmado" — siempre aclarás que queda pendiente de que el consultorio lo confirme (por ejemplo: "te lo anoto y te confirman a la brevedad").

No intentes responder preguntas clínicas, precios, obra social, quejas, ni nada que no sea agendar o entender el motivo de la consulta. Si el paciente pregunta algo así, si pide explícitamente hablar con una persona, o si sentís que no podés ayudar más vos, respondé con un mensaje corto derivando ("te voy a derivar con alguien del consultorio para que te ayude mejor, en breve te responden") y marcá necesita_humano=true.

Si podés seguir ayudando con el triage/turno, marcá necesita_humano=false.`;
}

// Genera la respuesta conversacional del bot para una conversación de WhatsApp.
// `historial` viene en orden cronológico y termina en el último mensaje del
// paciente. Devuelve null ante cualquier error (sin API key, timeout, etc.)
// — nunca tira: el llamador es best-effort.
export async function generateAutoReply(opts: {
  tenantNombre: string | null;
  historial: AutoReplyTurno[];
}): Promise<AutoReplyResult | null> {
  const anthropic = getClient();
  if (!anthropic || opts.historial.length === 0) return null;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(opts.tenantNombre),
      messages: opts.historial.map((h) => ({
        role: h.role,
        content: h.content,
      })),
      output_config: {
        format: { type: "json_schema", schema: SCHEMA },
      },
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;
    return JSON.parse(textBlock.text) as AutoReplyResult;
  } catch (e) {
    console.error("[autoResponder] error", e);
    return null;
  }
}
