import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentRole } from "./types";
import { createClient } from "./supabase/server";

export interface CurrentAgent {
  id: string;
  tenant_id: string;
  role: AgentRole;
  name: string | null;
  email: string | null;
  gym_admin: boolean;
  panel_stats: boolean;
}

// Usuario logueado, cacheado POR REQUEST (React cache): el middleware, el
// layout y la página comparten una sola validación de sesión en vez de pegarle
// a Supabase Auth varias veces. Usar en Server Components.
export const currentUser = cache(async () => {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user;
});

// Agente logueado, cacheado por request (una sola lectura de `agents` por
// render, compartida entre layout y página). Usar en Server Components.
export const currentAgent = cache(async (): Promise<CurrentAgent | null> => {
  const user = await currentUser();
  if (!user) return null;
  const sb = await createClient();
  const { data } = await sb
    .from("agents")
    .select("id, tenant_id, role, name, email, gym_admin, panel_stats")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!data || !data.tenant_id) return null;
  return {
    ...data,
    gym_admin: data.gym_admin === true,
    panel_stats: data.panel_stats === true,
  } as CurrentAgent;
});

// Agente logueado (fila propia en `agents`, ya resuelta por RLS/tenant).
// Centraliza el patrón repetido en messages/send y push/subscribe.
export async function getCurrentAgent(
  sb: SupabaseClient,
): Promise<CurrentAgent | null> {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data } = await sb
    .from("agents")
    .select("id, tenant_id, role, name, email, gym_admin, panel_stats")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!data || !data.tenant_id) return null;
  return {
    ...data,
    gym_admin: data.gym_admin === true,
    panel_stats: data.panel_stats === true,
  } as CurrentAgent;
}

// Staff del gimnasio: accede al panel de cupo completo (agenda, confirmar,
// horarios, socios). En este negocio solo-gym los profes también son staff.
// Espeja el gate SQL public.jwt_es_gym_staff() (migración 0027).
export function esGymStaff(agent: CurrentAgent | null): boolean {
  return (
    !!agent &&
    (agent.role === "owner" || agent.role === "profesional" || agent.gym_admin)
  );
}
