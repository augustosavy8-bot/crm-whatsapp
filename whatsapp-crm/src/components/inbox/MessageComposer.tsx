// Espacio reservado para el input de respuesta. El envío llega en la Fase 3.
export default function MessageComposer() {
  return (
    <div className="shrink-0 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-3">
      <div className="flex items-center gap-2">
        <input
          disabled
          placeholder="El envío llega en la Fase 3"
          className="flex-1 cursor-not-allowed rounded-full border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 px-4 py-2 text-sm text-neutral-400 placeholder:text-neutral-400"
        />
        <button
          disabled
          className="cursor-not-allowed rounded-full bg-neutral-200 dark:bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-400"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
