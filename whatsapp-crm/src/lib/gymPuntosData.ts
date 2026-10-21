import { createServiceClient } from "@/lib/supabase/service";
import { hoyISOArgentina } from "@/lib/tz";
import { appBaseUrl } from "@/lib/appUrl";
import QRCode from "qrcode";
import { calcularRankingMes, type FilaPuntos } from "@/lib/gymPuntos";

// Datos de Puntos del mes para un tenant: ranking (desde gym_asistencias) + el
// QR de check-in del gym. SOLO servidor (service client). Lo usan la vista del
// socio (/mi-cuenta) y el panel de admin.

export interface PuntosData {
  ranking: FilaPuntos[];
  mesLabel: string;
  checkinUrl: string;
  checkinQr: string; // data URL (PNG)
}

export async function getPuntosData(tenantId: string): Promise<PuntosData> {
  const svc = createServiceClient();
  const hoy = hoyISOArgentina();
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  const inicio = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const nAnio = mes === 12 ? anio + 1 : anio;
  const nMes = mes === 12 ? 1 : mes + 1;
  const fin = `${nAnio}-${String(nMes).padStart(2, "0")}-01`;

  const [asisRes, alumnosRes] = await Promise.all([
    svc
      .from("gym_asistencias")
      .select("alumno_id, fecha")
      .eq("tenant_id", tenantId)
      .eq("estado", "presente")
      .gte("fecha", inicio)
      .lt("fecha", fin),
    svc.from("gym_alumnos").select("id, nombre").eq("tenant_id", tenantId),
  ]);

  const nombres = new Map(
    ((alumnosRes.data ?? []) as { id: string; nombre: string }[]).map((a) => [
      a.id,
      a.nombre,
    ]),
  );
  const ranking = calcularRankingMes(
    ((asisRes.data ?? []) as { alumno_id: string; fecha: string }[]).map((r) => ({
      alumno_id: r.alumno_id,
      fecha: r.fecha,
      nombre: nombres.get(r.alumno_id) ?? "Socio",
    })),
  );

  const mesLabel = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    month: "long",
    year: "numeric",
  }).format(new Date(`${hoy}T12:00:00Z`));

  const checkinUrl = `${appBaseUrl()}/checkin`;
  const checkinQr = await QRCode.toDataURL(checkinUrl, { margin: 1, width: 256 });

  return { ranking, mesLabel, checkinUrl, checkinQr };
}
