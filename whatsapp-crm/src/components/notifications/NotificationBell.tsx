"use client";

import { LuBell, LuBellOff } from "react-icons/lu";
import { useNotifications } from "./NotificationsProvider";

export default function NotificationBell() {
  const { muted, toggleMuted, permission, requestPermission } =
    useNotifications();

  return (
    <div className="flex items-center gap-2">
      {permission === "default" && (
        <button
          onClick={requestPermission}
          className="hidden rounded-full bg-accent-soft px-3 py-1.5 text-[12px] font-semibold text-accent hover:bg-accent/15 sm:block"
        >
          Activar avisos
        </button>
      )}
      <button
        onClick={toggleMuted}
        aria-label={muted ? "Activar sonido" : "Silenciar sonido"}
        title={
          muted
            ? "Sonido silenciado — clic para activar"
            : "Sonido activo — clic para silenciar"
        }
        className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface-2 text-muted transition-colors hover:text-ink"
      >
        {muted ? <LuBellOff size={16} /> : <LuBell size={16} />}
      </button>
    </div>
  );
}
