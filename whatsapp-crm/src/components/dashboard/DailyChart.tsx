"use client";

import { CHANNELS, CHANNEL_BRAND, CHANNEL_LABEL } from "@/lib/channels";
import type { MessagesDaily } from "@/lib/types";
import ChannelIcon from "@/components/ChannelIcon";

// Barras apiladas de mensajes ENTRANTES por día (14 días), serie por canal.
export default function DailyChart({ rows }: { rows: MessagesDaily[] }) {
  // Buckets de los últimos 14 días (clave local YYYY-MM-DD).
  const days: { key: string; label: string }[] = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ key, label: `${d.getDate()}/${d.getMonth() + 1}` });
  }

  // day -> channel -> count
  const byDay = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const key = (r.day || "").slice(0, 10);
    const rec = byDay.get(key) ?? {};
    rec[r.channel] = (rec[r.channel] ?? 0) + Number(r.inbound || 0);
    byDay.set(key, rec);
  }

  const totals = days.map((d) => {
    const rec = byDay.get(d.key) ?? {};
    return CHANNELS.reduce((s, ch) => s + (rec[ch] ?? 0), 0);
  });
  const max = Math.max(1, ...totals);
  const grandTotal = totals.reduce((s, n) => s + n, 0);

  return (
    <div className="rounded-panel border border-line bg-surface p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold">Mensajes recibidos</h2>
          <p className="text-xs text-muted">Últimos 14 días · por canal</p>
        </div>
        {/* Leyenda (identidad no solo por color) */}
        <div className="flex items-center gap-3">
          {CHANNELS.map((ch) => (
            <span key={ch} className="flex items-center gap-1.5 text-xs text-muted">
              <ChannelIcon channel={ch} size={13} />
              {CHANNEL_LABEL[ch]}
            </span>
          ))}
        </div>
      </div>

      {grandTotal === 0 ? (
        <div className="py-10 text-center text-sm text-muted">
          Sin mensajes en los últimos 14 días.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex min-w-[520px] items-end gap-2" style={{ height: 180 }}>
            {days.map((d) => {
              const rec = byDay.get(d.key) ?? {};
              const total = CHANNELS.reduce((s, ch) => s + (rec[ch] ?? 0), 0);
              const tip = `${d.label}: ${total} · ${CHANNELS.map((ch) => `${CHANNEL_LABEL[ch]} ${rec[ch] ?? 0}`).join(", ")}`;
              return (
                <div
                  key={d.key}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1"
                  title={tip}
                >
                  {/* Stack de arriba (facebook) hacia abajo (whatsapp), pegado al baseline. */}
                  <div
                    className="flex w-full flex-col justify-end"
                    style={{ height: 150 }}
                  >
                    {[...CHANNELS].reverse().map((ch) => {
                      const v = rec[ch] ?? 0;
                      if (v === 0) return null;
                      const h = (v / max) * 150;
                      return (
                        <div
                          key={ch}
                          style={{
                            height: Math.max(3, h),
                            background: CHANNEL_BRAND[ch],
                            marginTop: 2, // separador de 2px entre segmentos
                          }}
                          className="w-full first:rounded-t-[4px]"
                        />
                      );
                    })}
                  </div>
                  <span className="text-[10px] tabular-nums text-faint">
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
