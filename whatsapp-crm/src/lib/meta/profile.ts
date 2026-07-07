// User Profile API (best-effort): nombre/username de un PSID/IGSID.
//  - Instagram (Instagram Login): graph.instagram.com + Instagram Access Token, campos name,username.
//  - Facebook Messenger: graph.facebook.com + Page Access Token, campo name.
// Si falla (permisos/App Review), devuelve nulls y la UI cae a un label del canal.

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
  const isInstagram = channel === "instagram";
  const host = isInstagram ? "graph.instagram.com" : "graph.facebook.com";
  const token = isInstagram
    ? process.env.INSTAGRAM_ACCESS_TOKEN
    : process.env.META_PAGE_ACCESS_TOKEN;
  const fields = isInstagram ? "name,username" : "name";

  if (!token) {
    console.warn(`[profile] sin token para ${channel}, se omite fetch`);
    return { name: null, username: null };
  }

  const url = `https://${host}/${GRAPH_VERSION}/${id}?fields=${fields}&access_token=${token}`;
  try {
    const res = await fetch(url);
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      // Log para diagnosticar (típicamente permisos en modo desarrollo).
      console.warn(
        `[profile] ${channel} ${id} -> HTTP ${res.status}:`,
        JSON.stringify(data),
      );
      return { name: null, username: null };
    }
    const profile = {
      name: (data.name as string) ?? null,
      username: (data.username as string) ?? null,
    };
    console.log(`[profile] ${channel} ${id} ->`, JSON.stringify(profile));
    return profile;
  } catch (e) {
    console.warn(`[profile] ${channel} ${id} error:`, (e as Error).message);
    return { name: null, username: null };
  }
}
