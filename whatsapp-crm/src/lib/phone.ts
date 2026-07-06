// Normalización de números para enviar por la WhatsApp Cloud API.
// NO cambia cómo se guardan en la base: solo transforma el destino al enviar.
//
// Argentina (código 54): los móviles se guardan como 549XXXXXXXXXX (con el 9),
// pero la Cloud API espera el número sin ese 9 (54XXXXXXXXXX), si no rechaza el
// envío con el error #131030. El strip del 9 se aplica SOLO a números que
// empiezan con 54, para no romper otros países.

export function normalizeArPhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  // Solo Argentina (54) + 9 inmediatamente después → quitar ese 9.
  if (digits.startsWith("549")) {
    return "54" + digits.slice(3);
  }
  return digits;
}
