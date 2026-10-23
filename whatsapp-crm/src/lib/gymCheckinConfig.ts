import { createServiceClient } from "@/lib/supabase/service";

// Config de ubicación del gym para el anti-trampa del check-in. SOLO servidor
// (service client): la tabla está sellada por RLS.

export interface CheckinConfig {
  lat: number | null;
  lng: number | null;
  radioM: number;
  configurada: boolean; // hay lat/lng cargadas
}

export async function getCheckinConfig(tenantId: string): Promise<CheckinConfig> {
  const sb = createServiceClient();
  const { data } = await sb
    .from("gym_checkin_config")
    .select("lat, lng, radio_m")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const lat = data?.lat ?? null;
  const lng = data?.lng ?? null;
  return {
    lat,
    lng,
    radioM: data?.radio_m ?? 150,
    configurada: lat != null && lng != null,
  };
}

export async function setCheckinConfig(args: {
  tenantId: string;
  lat: number;
  lng: number;
  radioM: number;
}): Promise<void> {
  const sb = createServiceClient();
  const { error } = await sb.from("gym_checkin_config").upsert(
    {
      tenant_id: args.tenantId,
      lat: args.lat,
      lng: args.lng,
      radio_m: args.radioM,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (error) throw error;
}
