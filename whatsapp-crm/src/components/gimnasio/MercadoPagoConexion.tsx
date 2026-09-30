"use client";

import { useCallback, useEffect, useState } from "react";

// Panel admin: estado de la conexión con Mercado Pago del gimnasio y botones
// para conectar / reconectar / desconectar. Los tokens NUNCA llegan acá: este
// componente solo lee un estado seguro desde /api/gym/mp/oauth/estado.

type Estado = "conectada" | "por_vencer" | "desconectada" | "error";

interface Conexion {
  estado: Estado;
  mpUserId: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
  lastError: string | null;
}

const BADGE: Record<Estado, { txt: string; bg: string; fg: string }> = {
  conectada: { txt: "Conectada", bg: "#e7f6ec", fg: "#137a3e" },
  por_vencer: { txt: "Por vencer", bg: "#fdf2d9", fg: "#8a6100" },
  desconectada: { txt: "Desconectada", bg: "#eceef1", fg: "#5b6470" },
  error: { txt: "Error", bg: "#fde8e8", fg: "#b42222" },
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const MENSAJES: Record<string, string> = {
  conectada: "Mercado Pago conectado.",
  error: "No se pudo conectar Mercado Pago. Probá de nuevo.",
  error_state: "El pedido de conexión venció o ya se había usado. Probá de nuevo.",
  forbidden: "Solo un admin del gimnasio puede conectar Mercado Pago.",
  sin_config: "Faltan las credenciales de Mercado Pago (integrador).",
  cuenta_plataforma:
    "Esta es la cuenta de la plataforma, no la del gimnasio. Cerrá sesión en Mercado Pago e ingresá con la cuenta del gym.",
};

// Aviso antes de redirigir a MP: recordar que hay que entrar con la cuenta del gym.
function irAConectar() {
  if (
    window.confirm(
      "Asegurate de iniciar sesión con la cuenta de Mercado Pago del gimnasio (no la de la plataforma).",
    )
  ) {
    window.location.href = "/api/gym/mp/oauth/start";
  }
}

export default function MercadoPagoConexion() {
  const [loading, setLoading] = useState(true);
  const [configurado, setConfigurado] = useState(true);
  const [conexion, setConexion] = useState<Conexion | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [desconectando, setDesconectando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gym/mp/oauth/estado", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setConfigurado(Boolean(data.configurado));
        setConexion((data.conexion as Conexion | null) ?? null);
      }
    } catch {
      // deja el estado como está; el usuario puede reintentar
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    // Mensaje de vuelta del OAuth (?mp=conectada|error|...). Lo limpia de la URL.
    const params = new URLSearchParams(window.location.search);
    const mp = params.get("mp");
    if (mp) {
      setMsg(MENSAJES[mp] ?? null);
      params.delete("mp");
      const q = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (q ? `?${q}` : ""),
      );
    }
  }, [cargar]);

  const conectada = !!conexion && conexion.estado !== "desconectada";

  async function desconectar() {
    if (
      !confirm(
        "¿Desconectar Mercado Pago? Los socios no van a poder pagar la cuota online hasta que lo vuelvas a conectar.",
      )
    ) {
      return;
    }
    setDesconectando(true);
    try {
      const res = await fetch("/api/gym/mp/oauth/disconnect", { method: "POST" });
      setMsg(res.ok ? "Mercado Pago desconectado." : "No se pudo desconectar.");
      if (res.ok) await cargar();
    } catch {
      setMsg("No se pudo desconectar.");
    } finally {
      setDesconectando(false);
    }
  }

  return (
    <div className="rounded-panel border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-ink">Mercado Pago</h3>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">
            Conectá la cuenta de Mercado Pago del gimnasio para que los socios
            paguen la cuota online. El cobro entra a la cuenta del gym.
          </p>
        </div>
        {conexion && (
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ backgroundColor: BADGE[conexion.estado].bg, color: BADGE[conexion.estado].fg }}
          >
            {BADGE[conexion.estado].txt}
          </span>
        )}
      </div>

      {msg && (
        <p className="mt-3 rounded-card bg-surface-2 px-3 py-2 text-[13px] text-ink">
          {msg}
        </p>
      )}

      <div className="mt-4">
        {loading ? (
          <p className="text-[13px] text-muted">Cargando…</p>
        ) : !configurado ? (
          <p className="text-[13px] text-muted">
            Todavía no están cargadas las credenciales de Mercado Pago. Cargalas
            para habilitar la conexión.
          </p>
        ) : conectada && conexion ? (
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
              <dt className="text-muted">Cuenta (user_id)</dt>
              <dd className="text-right font-medium text-ink">
                {conexion.mpUserId ?? "—"}
              </dd>
              <dt className="text-muted">Conectada el</dt>
              <dd className="text-right font-medium text-ink">
                {fmt(conexion.connectedAt)}
              </dd>
              <dt className="text-muted">Token vence</dt>
              <dd className="text-right font-medium text-ink">
                {fmt(conexion.expiresAt)}
              </dd>
            </dl>
            {conexion.estado === "error" && conexion.lastError && (
              <p
                className="rounded-card px-3 py-2 text-[13px]"
                style={{ backgroundColor: "#fde8e8", color: "#b42222" }}
              >
                Hubo un problema con la conexión: {conexion.lastError}. Reconectá
                para volver a habilitar los cobros.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={irAConectar}
                className="rounded-full border border-line px-4 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:border-accent"
              >
                Reconectar
              </button>
              <button
                type="button"
                onClick={desconectar}
                disabled={desconectando}
                className="rounded-full border border-line px-4 py-1.5 text-[13px] font-semibold transition-colors hover:border-accent disabled:opacity-60"
                style={{ color: "#b42222" }}
              >
                {desconectando ? "Desconectando…" : "Desconectar"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={irAConectar}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white transition-transform hover:brightness-95"
              style={{ backgroundColor: "#009ee3" }}
            >
              Conectar Mercado Pago
            </button>
            <p className="text-[12px] text-muted">
              Vas a entrar a Mercado Pago: iniciá sesión con la cuenta del
              gimnasio, no con la de la plataforma.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
