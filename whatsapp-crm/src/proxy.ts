import { type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

// Next 16: el antiguo `middleware` se renombró a `proxy` (misma mecánica).
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Corre en todo menos assets estáticos y las rutas de API (el webhook de Meta
  // NUNCA debe pasar por el proxy de sesión).
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
