// URL base pública y ESTABLE de la app, para armar links que se comparten
// (invitaciones de acceso, recuperación de contraseña, back_urls de MercadoPago).
//
// NO usar window.location.origin ni el origin del request: en Vercel eso puede
// ser la URL del deployment (crm-whatsapp-xxxx.vercel.app), que ROTA en cada
// deploy y no es la marca. Un link de invitación armado así se rompe al próximo
// deploy.
//
// Prioridad:
//   1. NEXT_PUBLIC_APP_URL  (cargala en Vercel = https://kinactiva.com)
//   2. el origin actual, SI no es una URL de deployment de Vercel (así dev en
//      localhost y el dominio real siguen funcionando sin configurar nada)
//   3. el dominio de producción como último recurso
const DOMINIO_DEFAULT = "https://kinactiva.com";

export function appBaseUrl(fallbackOrigin?: string): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (env) return env;

  if (fallbackOrigin) {
    try {
      const host = new URL(fallbackOrigin).host;
      if (!/\.vercel\.app$/i.test(host)) {
        return fallbackOrigin.replace(/\/+$/, "");
      }
    } catch {
      // origin inválido: caemos al default
    }
  }

  return DOMINIO_DEFAULT;
}
