import type { Message } from "@/lib/types";
import { formatTime, messagePreview } from "@/lib/format";
import type { Channel } from "@/lib/channels";

// Acento por canal en la burbuja outbound (inbound siempre neutro/izquierda).
const OUTBOUND: Record<Channel, { bubble: string; time: string }> = {
  whatsapp: { bubble: "bg-emerald-600 text-white", time: "text-emerald-100" },
  instagram: { bubble: "bg-pink-600 text-white", time: "text-pink-100" },
  facebook: { bubble: "bg-blue-600 text-white", time: "text-blue-100" },
};

// Burbuja de un mensaje: inbound a la izquierda, outbound a la derecha.
export default function MessageBubble({ message }: { message: Message }) {
  const isOutbound = message.direction === "outbound";
  const text = messagePreview(message.type, message.body);
  const isMedia = !message.body?.trim() && message.type !== "text";
  const accent = OUTBOUND[(message.channel as Channel) ?? "whatsapp"];

  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          isOutbound
            ? `${accent.bubble} rounded-br-sm`
            : "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-bl-sm border border-neutral-200 dark:border-neutral-700",
        ].join(" ")}
      >
        <p
          className={[
            "whitespace-pre-wrap break-words",
            isMedia ? "italic opacity-80" : "",
          ].join(" ")}
        >
          {text || <span className="italic opacity-60">(sin contenido)</span>}
        </p>
        <div
          className={[
            "mt-0.5 text-right text-[10px]",
            isOutbound ? accent.time : "text-neutral-400",
          ].join(" ")}
        >
          {formatTime(message.created_at)}
        </div>
      </div>
    </div>
  );
}
