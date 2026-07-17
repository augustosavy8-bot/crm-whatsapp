"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

const STORAGE_KEY = "foko:ai-avatar-paused";
const IDLE_MS = 3 * 60 * 1000; // pasea tras 3min de inactividad del usuario
const WANDER_MS = 1300;
const ALERT_MS = 2600;

type Mode = "idle" | "peek" | "walk";

// Avatar flotante puramente visual (capa aditiva): no toca lógica de negocio.
// Cambia de comportamiento según la pantalla: espía desde el borde en el
// inbox, camina en el dashboard, queda quieto (con paseo ocasional) en el
// resto. En mobile siempre queda en modo quieto para no estorbar.
// Click -> /turnos (donde viven los pendientes de aprobar por IA).
export default function AIAvatar({
  pendientesCount = 0,
}: {
  pendientesCount?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paused, setPaused] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [alerting, setAlerting] = useState(false);

  useEffect(() => {
    setMounted(true);
    setPaused(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Reacción a mensajes nuevos: la dispara NotificationsProvider vía evento
  // global, así no hace falta abrir un segundo canal Realtime acá.
  useEffect(() => {
    const onNew = () => {
      setAlerting(true);
      if (alertTimer.current) clearTimeout(alertTimer.current);
      alertTimer.current = setTimeout(() => setAlerting(false), ALERT_MS);
    };
    window.addEventListener("foko:new-message", onNew);
    return () => {
      window.removeEventListener("foko:new-message", onNew);
      if (alertTimer.current) clearTimeout(alertTimer.current);
    };
  }, []);

  const routeMode: Mode = pathname?.startsWith("/inbox")
    ? "peek"
    : pathname === "/dashboard" || pathname === "/"
      ? "walk"
      : "idle";
  const mode: Mode = isDesktop ? routeMode : "idle";

  // Al cambiar de modo, limpiar cualquier transform inline que haya dejado
  // el paseo por inactividad (solo aplica en modo 'idle').
  useEffect(() => {
    if (mode !== "idle" && rootRef.current) {
      rootRef.current.style.transform = "";
    }
  }, [mode]);

  const wander = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
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
    if (paused || mode !== "idle") {
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
  }, [paused, mode, scheduleIdle]);

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

  const containerClass = [
    "fixed z-40",
    mode === "peek" && "ai-avatar-peek right-0",
    mode === "walk" && "ai-avatar-walk bottom-4",
    mode === "idle" && "bottom-24 right-4 sm:right-6",
    paused && "ai-avatar-paused",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={rootRef}
      className={containerClass}
      style={{ width: 52, height: 68, top: mode === "peek" ? "42%" : undefined }}
    >
      <style>{`
        @keyframes ai-avatar-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes ai-avatar-wiggle { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(6deg); } }
        @keyframes ai-avatar-blink { 0%, 90%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.15); } }
        @keyframes ai-avatar-peek-cycle {
          0%, 68% { transform: translateY(-50%) translateX(60%); }
          80%, 90% { transform: translateY(-50%) translateX(6%); }
          100% { transform: translateY(-50%) translateX(60%); }
        }
        @keyframes ai-avatar-walk-path { 0% { left: 6vw; } 100% { left: 80vw; } }
        @keyframes ai-avatar-waddle { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
        @keyframes ai-avatar-bounce { 0%, 100% { transform: translateY(0); } 30% { transform: translateY(-9px); } 55% { transform: translateY(0); } 75% { transform: translateY(-4px); } }
        @keyframes ai-avatar-fade { 0% { opacity: 0; transform: translateY(2px) scale(0.8); } 15%, 75% { opacity: 1; transform: translateY(0) scale(1); } 100% { opacity: 0; } }
        .ai-avatar-body { animation: ai-avatar-breathe 4s ease-in-out infinite; transform-origin: bottom center; }
        .ai-avatar-antenna { animation: ai-avatar-wiggle 3.2s ease-in-out infinite; transform-origin: bottom center; }
        .ai-avatar-eye { animation: ai-avatar-blink 5.5s ease-in-out infinite; }
        .ai-avatar-eye:nth-child(2) { animation-delay: 0.08s; }
        .ai-avatar-peek { animation: ai-avatar-peek-cycle 14s ease-in-out infinite; }
        .ai-avatar-walk { animation: ai-avatar-walk-path 22s ease-in-out infinite alternate; }
        .ai-avatar-walk .ai-avatar-body { animation: ai-avatar-waddle 0.55s ease-in-out infinite; }
        .ai-avatar-bounce-wrap.alerting { animation: ai-avatar-bounce 0.9s ease-in-out 2; }
        .ai-avatar-alert-badge { opacity: 0; }
        .ai-avatar-alert-badge.alerting { animation: ai-avatar-fade 2.4s ease-in-out; }
        .ai-avatar-paused .ai-avatar-body,
        .ai-avatar-paused .ai-avatar-antenna,
        .ai-avatar-paused .ai-avatar-eye,
        .ai-avatar-paused.ai-avatar-peek,
        .ai-avatar-paused.ai-avatar-walk,
        .ai-avatar-paused .ai-avatar-bounce-wrap { animation-play-state: paused !important; }
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

      <span
        className={`ai-avatar-alert-badge absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white ${alerting ? "alerting" : ""}`}
      >
        !
      </span>

      <div className={`ai-avatar-bounce-wrap h-full w-full ${alerting ? "alerting" : ""}`}>
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
    </div>
  );
}
