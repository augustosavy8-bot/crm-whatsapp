"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS_OWNER = [
  { href: "/dashboard", label: "Inicio" },
  { href: "/inbox", label: "Inbox" },
  { href: "/pacientes", label: "Pacientes" },
  { href: "/turnos", label: "Turnos" },
];

// Owner sin módulo de inbox: desaparece el CRM de mensajería (Inbox y el
// dashboard de mensajes) y la Agenda pasa a ser el home.
const ITEMS_OWNER_SIN_INBOX = [
  { href: "/turnos", label: "Agenda" },
  { href: "/pacientes", label: "Pacientes" },
];

// El profesional solo tiene su módulo de turnos.
const ITEMS_PROFESIONAL = [
  { href: "/turnos", label: "Agenda" },
  { href: "/turnos/configuracion", label: "Configuración" },
];

export default function HeaderNav({
  role,
  inboxEnabled = true,
  gymAdmin = false,
}: {
  role?: string;
  inboxEnabled?: boolean;
  gymAdmin?: boolean;
}) {
  const path = usePathname();
  const base =
    role === "profesional"
      ? ITEMS_PROFESIONAL
      : inboxEnabled
        ? ITEMS_OWNER
        : ITEMS_OWNER_SIN_INBOX;
  // El panel de gimnasio (cupo grupal) lo ven el owner y quien tenga gym_admin
  // (Mariano). Se suma al final de la nav que le corresponda por rol.
  const ITEMS =
    gymAdmin || role === "owner"
      ? [...base, { href: "/gym", label: "Gimnasio" }]
      : base;
  return (
    <nav className="flex items-center gap-1 rounded-full bg-surface-2 p-1">
      {ITEMS.map((it) => {
        const active = path === it.href || path.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            className={[
              "rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              active
                ? "bg-ink text-white"
                : "text-muted hover:text-ink",
            ].join(" ")}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
