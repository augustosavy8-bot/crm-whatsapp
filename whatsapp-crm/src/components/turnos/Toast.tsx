"use client";

import { useEffect } from "react";

export interface ToastState {
  tipo: "ok" | "error";
  mensaje: string;
  accion?: { label: string; onClick: () => void };
}

// Toast flotante con acción opcional, compartido por la lista y la agenda.
export function Toast({
  toast,
  onClose,
}: {
  toast: ToastState;
  onClose: () => void;
}) {
  useEffect(() => {
    const ms = toast.accion ? 9000 : 4500;
    const id = setTimeout(onClose, ms);
    return () => clearTimeout(id);
  }, [toast, onClose]);

  return (
    <div className="fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4">
      <div
        style={{ animation: "kfToast .5s cubic-bezier(.2,.8,.25,1)" }}
        className={`flex items-center gap-3 rounded-full border px-4 py-2.5 text-[13px] font-semibold shadow-pop ${
          toast.tipo === "error"
            ? "border-danger/30 bg-danger/10 text-danger"
            : "border-line bg-surface text-ink"
        }`}
      >
        {toast.tipo === "ok" && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path
                d="M20 6 9 17l-5-5"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  strokeDasharray: 34,
                  strokeDashoffset: 34,
                  animation: "kfCheck .5s cubic-bezier(.4,0,.2,1) .15s forwards",
                }}
              />
            </svg>
          </span>
        )}
        <span>{toast.mensaje}</span>
        {toast.accion && (
          <button
            onClick={() => {
              toast.accion!.onClick();
              onClose();
            }}
            className="rounded-full bg-ok px-3 py-1 text-[12px] font-bold text-white hover:bg-ok/90"
          >
            {toast.accion.label}
          </button>
        )}
        <button
          onClick={onClose}
          className="text-muted hover:text-ink"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
