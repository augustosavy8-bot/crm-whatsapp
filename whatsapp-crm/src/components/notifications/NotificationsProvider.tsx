"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { contactLabel, messagePreview } from "@/lib/format";
import type { Message } from "@/lib/types";

const BASE_TITLE = "KINACTIVA";
const MUTE_KEY = "kinactiva_notif_muted";

type Permission = NotificationPermission | "unsupported";

interface NotificationsCtx {
  muted: boolean;
  toggleMuted: () => void;
  permission: Permission;
  requestPermission: () => void;
}

const Ctx = createContext<NotificationsCtx>({
  muted: false,
  toggleMuted: () => {},
  permission: "unsupported",
  requestPermission: () => {},
});

export const useNotifications = () => useContext(Ctx);

export default function NotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const supabase = useRef(createClient()).current;

  const [muted, setMuted] = useState(false);
  const [permission, setPermission] = useState<Permission>("unsupported");

  const awayRef = useRef(0); // mensajes llegados sin foco (para el título)
  const audioRef = useRef<AudioContext | null>(null);

  // Init desde localStorage + permiso actual.
  useEffect(() => {
    try {
      setMuted(localStorage.getItem(MUTE_KEY) === "1");
    } catch {}
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
  }, []);

  // Audio: se "desbloquea" con el primer gesto del usuario (política de autoplay).
  const unlockAudio = useCallback(() => {
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      audioRef.current = audioRef.current || new AC();
      if (audioRef.current.state === "suspended") audioRef.current.resume();
    } catch {}
  }, []);

  useEffect(() => {
    const h = () => unlockAudio();
    window.addEventListener("pointerdown", h, { once: true });
    return () => window.removeEventListener("pointerdown", h);
  }, [unlockAudio]);

  const toggleMuted = useCallback(() => {
    unlockAudio();
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }, [unlockAudio]);

  const requestPermission = useCallback(() => {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then(setPermission);
  }, []);

  // Beep corto (sine) con WebAudio, sin archivos.
  const playBeep = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.value = 880;
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.start(t);
      o.stop(t + 0.26);
    } catch {}
  }, []);

  const setTitleCount = (n: number) => {
    document.title = n > 0 ? `(${n}) ${BASE_TITLE}` : BASE_TITLE;
  };

  // Al recuperar el foco, se limpian los pendientes del título.
  useEffect(() => {
    const onFocus = () => {
      if (!document.hidden) {
        awayRef.current = 0;
        setTitleCount(0);
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  // Realtime: dispara en cada mensaje INBOUND nuevo (reusa la publicación existente).
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const permRef = useRef(permission);
  permRef.current = permission;

  useEffect(() => {
    const channel = supabase
      .channel("notif-inbound")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const msg = payload.new as Message;
          if (msg.direction !== "inbound") return;

          if (!mutedRef.current) playBeep();

          const away = document.hidden || !document.hasFocus();
          if (!away) return;

          awayRef.current += 1;
          setTitleCount(awayRef.current);

          if (permRef.current === "granted") {
            const { data } = await supabase
              .from("contacts")
              .select("channel,name,username,phone_number,external_id")
              .eq("id", msg.contact_id)
              .maybeSingle();
            const label = contactLabel(
              data ?? {
                name: null,
                username: null,
                phone_number: null,
                external_id: msg.contact_id,
                channel: msg.channel,
              },
            );
            const body = messagePreview(msg.type, msg.body) || "Nuevo mensaje";
            try {
              const n = new Notification(label, {
                body,
                tag: `kinactiva-${msg.contact_id}`,
                icon: "/favicon.ico",
              });
              n.onclick = () => {
                window.focus();
                router.push(`/inbox?c=${msg.contact_id}`);
                n.close();
              };
            } catch {}
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, playBeep, router]);

  return (
    <Ctx.Provider value={{ muted, toggleMuted, permission, requestPermission }}>
      {children}
    </Ctx.Provider>
  );
}
