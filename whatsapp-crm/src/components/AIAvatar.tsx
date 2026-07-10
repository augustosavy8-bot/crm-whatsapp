"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "foko:ai-avatar-paused";
const IDLE_MS = 3 * 60 * 1000; // pasea tras 3min de inactividad del usuario
const WANDER_MS = 1300;

// Avatar flotante puramente visual (capa aditiva): no toca lógica de negocio.
// Click -> /turnos (donde viven los pendientes de aprobar por IA).
export default function AIAvatar({
  pendientesCount = 0,
}: {
  pendientesCount?: number;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paused, setPaused] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setPaused(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const wander = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.innerWidth < 640) return; // en mobile no pasea, queda fijo
    const dx = -(40 + Math.random() * 30);
    const dy = -(24 + Math.random() * 20);
    el.style.transition = "transform 1.1s cubic-bezier(0.4,0,0.2,1)";
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    setTimeout(() => {
      if (el) el.style.transform = "translate(0,0)";
    }, WANDER_MS);
  }, []);

  const scheduleIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      wander();
      scheduleIdle();
    }, IDLE_MS);
  }, [wander]);

  useEffect(() => {
    if (paused) {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      return;
    }
    scheduleIdle();
    const reset = () => scheduleIdle();
    window.addEventListener("pointermove", reset, { passive: true });
    window.addEventListener("keydown", reset);
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      window.removeEventListener("pointermove", reset);
      window.removeEventListener("keydown", reset);
    };
  }, [paused, scheduleIdle]);

  function togglePaused(e: React.MouseEvent) {
    e.stopPropagation();
    setPaused((p) => {
      const next = !p;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  // Evita parpadeo de hidratación: la preferencia vive en localStorage.
  if (!mounted) return null;

  return (
    <div
      ref={rootRef}
      className={`fixed bottom-24 right-4 z-40 sm:right-6 ${paused ? "ai-avatar-paused" : ""}`}
      style={{ width: 52, height: 68 }}
    >
      <style>{`
        @keyframes ai-avatar-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes ai-avatar-wiggle { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(6deg); } }
        @keyframes ai-avatar-blink { 0%, 90%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.15); } }
        .ai-avatar-body { animation: ai-avatar-breathe 4s ease-in-out infinite; transform-origin: bottom center; }
        .ai-avatar-antenna { animation: ai-avatar-wiggle 3.2s ease-in-out infinite; transform-origin: bottom center; }
        .ai-avatar-eye { animation: ai-avatar-blink 5.5s ease-in-out infinite; }
        .ai-avatar-eye:nth-child(2) { animation-delay: 0.08s; }
        .ai-avatar-paused .ai-avatar-body,
        .ai-avatar-paused .ai-avatar-antenna,
        .ai-avatar-paused .ai-avatar-eye { animation-play-state: paused !important; }
      `}</style>

      <button
        type="button"
        onClick={togglePaused}
        title={paused ? "Reactivar animación del avatar" : "Pausar animación del avatar"}
        className="absolute -left-1 -top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-surface text-[8px] leading-none text-muted shadow-sm"
      >
        {paused ? "▶" : "❚❚"}
      </button>

      {pendientesCount > 0 && (
        <span
          className="absolute -right-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white"
          title={`${pendientesCount} turno(s) sugerido(s) por IA esperando tu confirmación`}
        >
          {pendientesCount}
        </span>
      )}

      <button
        type="button"
        onClick={() => router.push("/turnos")}
        aria-label="Ver turnos pendientes de aprobar"
        className="ai-avatar-body relative block h-full w-full cursor-pointer"
      >
        <span
          className="ai-avatar-antenna absolute left-6 top-0 w-[3px] rounded"
          style={{ height: 16, background: "#B4B2A9" }}
        >
          <span
            className="absolute -left-[2.5px] -top-1.5 h-2 w-2 rounded-full"
            style={{ background: "#B4B2A9" }}
          />
        </span>

        <span
          className="absolute bottom-4 left-0 w-full"
          style={{
            height: 48,
            borderRadius: "52% 52% 44% 44% / 60% 60% 40% 40%",
            background: "#D85A30",
          }}
        >
          <span
            className="absolute bottom-0 left-0 w-full"
            style={{
              height: 14,
              borderRadius: "0 0 44% 44% / 0 0 60% 60%",
              background: "#712B13",
              opacity: 0.3,
            }}
          />
          <span
            className="ai-avatar-eye absolute"
            style={{ top: 15, left: 12, width: 9, height: 12, borderRadius: "50%", background: "#FAECE7" }}
          >
            <span
              className="absolute"
              style={{ top: 4, left: 2.5, width: 4, height: 4, borderRadius: "50%", background: "#2C2C2A" }}
            />
          </span>
          <span
            className="ai-avatar-eye absolute"
            style={{ top: 15, left: 30, width: 9, height: 12, borderRadius: "50%", background: "#FAECE7" }}
          >
            <span
              className="absolute"
              style={{ top: 4, left: 2.5, width: 4, height: 4, borderRadius: "50%", background: "#2C2C2A" }}
            />
          </span>
        </span>

        <span
          className="absolute"
          style={{ bottom: 6, left: 8, width: 11, height: 6, borderRadius: "50%", background: "#712B13" }}
        />
        <span
          className="absolute"
          style={{ bottom: 6, left: 33, width: 11, height: 6, borderRadius: "50%", background: "#712B13" }}
        />
      </button>
    </div>
  );
}
