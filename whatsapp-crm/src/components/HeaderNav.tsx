"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS_OWNER = [
  { href: "/dashboard", label: "Inicio" },
  { href: "/inbox", label: "Inbox" },
  { href: "/pacientes", label: "Pacientes" },
  { href: "/turnos", label: "Turnos" },
];

// El profesional solo tiene su módulo de turnos.
const ITEMS_PROFESIONAL = [
  { href: "/turnos", label: "Agenda" },
  { href: "/turnos/configuracion", label: "Configuración" },
];

export default function HeaderNav({ role }: { role?: string }) {
  const path = usePathname();
  const ITEMS = role === "profesional" ? ITEMS_PROFESIONAL : ITEMS_OWNER;
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
