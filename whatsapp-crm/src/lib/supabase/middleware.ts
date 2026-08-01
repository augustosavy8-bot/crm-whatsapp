import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getModulosTenant } from "@/lib/modulos";

// Refresca la sesión de Supabase en cada request y reescribe las cookies.
// (La protección de rutas / redirect a /login se agrega en la Fase 2.)
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Importante: llamar getUser() para refrescar el token si hace falta.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protección de rutas: sin sesión, todo redirige a /login.
  // (El matcher de proxy.ts ya excluye /api y assets estáticos.)
  const path = request.nextUrl.pathname;
  const isPublic =
    path === "/" || // la raíz decide sola: público -> /gimnasio, staff -> /dashboard
    path === "/login" ||
    path === "/registro" || // alta de alumno por invitación (token en la URL)
    path === "/reset" || // recuperar contraseña (sesión de recovery en la URL)
    path.startsWith("/auth") ||
    path === "/privacy" ||
    path.startsWith("/privacy/") ||
    // Landing y reserva del gimnasio: cara al público, sin login.
    path === "/gimnasio" ||
    path.startsWith("/gimnasio/");
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Guard por rol: un profesional solo tiene el módulo de turnos. Todo lo
  // demás (dashboard, inbox, pacientes, la raíz) lo mandamos a /turnos. La
  // seguridad real es RLS; esto es para que ni vea el chrome del CRM.
  if (user) {
    // /reset se abre CON una sesión de recuperación: no lo mandamos al panel,
    // el usuario tiene que poder elegir su clave nueva primero.
    if (path === "/reset") return response;

    const { data: claimsData } = await supabase.auth.getClaims();
    const appRole = claimsData?.claims?.app_role as string | undefined;
    if (appRole === "alumno") {
      // El alumno solo tiene su panel. Cualquier otra ruta (el CRM, el gym
      // admin, la raíz) lo devuelve a /mi-cuenta. RLS igual lo protege.
      const enPanel = path === "/mi-cuenta" || path.startsWith("/mi-cuenta/");
      if (!enPanel) {
        const url = request.nextUrl.clone();
        url.pathname = "/mi-cuenta";
        url.search = "";
        return NextResponse.redirect(url);
      }
    } else if (appRole === "profesional") {
      // El profesional es staff del gym: su panel es /gym, y mantiene su
      // agenda /turnos. El resto del CRM no lo ve; cae en /gym.
      const enStaffGym =
        path === "/gym" ||
        path.startsWith("/gym/") ||
        path === "/turnos" ||
        path.startsWith("/turnos/");
      if (!enStaffGym) {
        const url = request.nextUrl.clone();
        url.pathname = "/gym";
        url.search = "";
        return NextResponse.redirect(url);
      }
    } else {
      // Owner/secretaria: si el tenant no tiene el módulo inbox, las rutas del
      // CRM de mensajería (inbox + dashboard de mensajes) van a /turnos. Solo
      // consultamos la tabla cuando la ruta es una de esas: no un query por
      // request. La seguridad real es RLS; esto es para no ver el chrome.
      const enInbox =
        path === "/inbox" ||
        path.startsWith("/inbox/") ||
        path === "/dashboard" ||
        path.startsWith("/dashboard/");
      if (enInbox) {
        const { inbox } = await getModulosTenant(supabase);
        if (!inbox) {
          const url = request.nextUrl.clone();
          url.pathname = "/turnos";
          url.search = "";
          return NextResponse.redirect(url);
        }
      }
    }
  }

  return response;
}
