"use client";

import { useCallback, useEffect, useState } from "react";

interface Cfg {
  lat: number | null;
  lng: number | null;
  radioM: number;
  configurada: boolean;
}

// Config del anti-trampa del check-in: el admin, parado en el gym, captura la
// ubicación y fija un radio. Después el socio solo marca asistencia dentro de él.
export default function UbicacionCheckin() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [radio, setRadio] = useState(150);
  const [capturando, setCapturando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/gym/checkin-ubicacion", { cache: "no-store" });
      const d = await res.json();
      if (res.ok && d.cfg) {
        setCfg(d.cfg as Cfg);
        setRadio((d.cfg as Cfg).radioM ?? 150);
      }
    } catch {
      // deja el estado como está
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function capturar() {
    setMsg(null);
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setMsg("Tu dispositivo no tiene ubicación disponible.");
      return;
    }
    setCapturando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setCapturando(false);
      },
      () => {
        setMsg("No se pudo obtener la ubicación. Permití el acceso y reintentá.");
        setCapturando(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function guardar() {
    if (!coords) return;
    setGuardando(true);
    setMsg(null);
    try {
      const res = await fetch("/api/gym/checkin-ubicacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: coords.lat, lng: coords.lng, radioM: radio }),
      });
      if (res.ok) {
        setMsg("✓ Ubicación del gym guardada.");
        setCoords(null);
        await cargar();
      } else {
        const d = await res.json();
        setMsg(d.error ?? "No se pudo guardar.");
      }
    } catch {
      setMsg("No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="rounded-panel border border-line bg-surface p-4 shadow-card">
      <h4 className="font-semibold text-ink">Anti-trampa (ubicación)</h4>
      <p className="mt-0.5 text-[13px] leading-snug text-muted">
        Si cargás la ubicación del gimnasio, el socio solo puede marcar asistencia
        estando cerca (no desde casa). Parado dentro del gym, tocá el botón.
      </p>

      <p className="mt-2 text-[13px]">
        Estado:{" "}
        {cfg?.configurada ? (
          <>
            <b className="text-ok">activo</b> · radio {cfg.radioM} m
          </>
        ) : (
          <b className="text-muted">sin configurar (el check-in no pide ubicación)</b>
        )}
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <button
          type="button"
          onClick={capturar}
          disabled={capturando}
          className="rounded-full border border-line px-4 py-1.5 text-[13px] font-semibold text-ink hover:border-accent disabled:opacity-60"
        >
          {capturando
            ? "Ubicando…"
            : coords
              ? "Volver a ubicar"
              : "Usar mi ubicación actual"}
        </button>
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
          Radio (m)
          <input
            value={radio}
            onChange={(e) =>
              setRadio(Math.max(30, Math.min(2000, Number(e.target.value) || 150)))
            }
            inputMode="numeric"
            className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
          />
        </label>
        {coords && (
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="rounded-full bg-accent px-4 py-1.5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar ubicación del gym"}
          </button>
        )}
      </div>

      {coords && (
        <p className="mt-2 text-[12px] text-muted">
          Capturado: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
        </p>
      )}
      {msg && <p className="mt-2 text-[13px] font-semibold text-ink">{msg}</p>}
    </div>
  );
}
