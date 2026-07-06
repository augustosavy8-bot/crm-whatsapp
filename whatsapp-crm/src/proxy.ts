import { type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

// Next 16: el antiguo `middleware` se renombró a `proxy` (misma mecánica).
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Corre en todo menos assets estáticos, las rutas de API (el webhook de Meta
  // NUNCA debe pasar por el proxy de sesión) y /privacy (página pública para Meta).
  matcher: [
    "/((?!api|privacy|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
