import type { Message } from "@/lib/types";
import { formatTime, messagePreview } from "@/lib/format";

// Burbuja de un mensaje: inbound (claro, izquierda) vs outbound (ink, derecha).
// El canal NO tiñe la burbuja: se distingue por el header del chat y la lista.
export default function MessageBubble({ message }: { message: Message }) {
  const isOutbound = message.direction === "outbound";
  const text = messagePreview(message.type, message.body);
  const isMedia = !message.body?.trim() && message.type !== "text";

  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[78%] rounded-2xl px-3 py-2 text-[15px] shadow-sm",
          isOutbound
            ? "bg-ink text-white rounded-br-md"
            : "bg-surface text-ink rounded-bl-md border border-line",
        ].join(" ")}
      >
        <p
          className={[
            "whitespace-pre-wrap break-words",
            isMedia ? "italic opacity-70" : "",
          ].join(" ")}
        >
          {text || <span className="italic opacity-60">(sin contenido)</span>}
        </p>
        <div
          className={[
            "mt-0.5 text-right text-[10px] tabular-nums",
            isOutbound ? "text-white/55" : "text-faint",
          ].join(" ")}
        >
          {formatTime(message.created_at)}
        </div>
      </div>
    </div>
  );
}
