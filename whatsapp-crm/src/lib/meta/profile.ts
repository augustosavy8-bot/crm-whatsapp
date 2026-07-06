// User Profile API (best-effort): obtiene nombre/username de un PSID/IGSID.
// Usa el Page Access Token. Si falla (permisos, App Review, etc.), devuelve nulls
// y el ingest sigue igual (la UI cae a un label del canal + id corto).

import type { Channel } from "@/lib/channels";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";

export interface Profile {
  name: string | null;
  username: string | null;
}

export async function fetchProfile(
  channel: Channel,
  id: string,
): Promise<Profile> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) return { name: null, username: null };

  // IG expone username; Messenger expone name (first/last).
  const fields = channel === "instagram" ? "name,username" : "name";
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${id}?fields=${fields}&access_token=${token}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return { name: null, username: null };
    const data = (await res.json()) as Record<string, unknown>;
    return {
      name: (data.name as string) ?? null,
      username: (data.username as string) ?? null,
    };
  } catch {
    return { name: null, username: null };
  }
}
