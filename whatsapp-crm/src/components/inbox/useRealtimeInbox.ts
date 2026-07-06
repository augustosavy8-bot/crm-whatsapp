"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";

interface Handlers {
  onMessageInsert: (message: Message) => void;
  onContactsChange: () => void;
}

// Suscribe a los cambios de `messages` (INSERT) y `contacts` (cualquier cambio).
// Usa refs para no re-suscribir en cada render.
export function useRealtimeInbox({
  onMessageInsert,
  onContactsChange,
}: Handlers) {
  const msgRef = useRef(onMessageInsert);
  const contactRef = useRef(onContactsChange);
  msgRef.current = onMessageInsert;
  contactRef.current = onContactsChange;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("inbox-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => msgRef.current(payload.new as Message),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contacts" },
        () => contactRef.current(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
