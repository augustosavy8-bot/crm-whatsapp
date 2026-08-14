"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// La app está centrada en el gimnasio: el único destino del menú es el panel
// del gym. El resto de las secciones (turnos, configuración, pacientes, inbox)
// siguen existiendo por URL, pero se sacaron del menú.
export default function HeaderNav() {
  const path = usePathname();
  const active = path === "/gym" || path.startsWith("/gym/");
  return (
    <nav className="flex items-center gap-1 rounded-full bg-surface-2 p-1">
      <Link
        href="/gym"
        className={[
          "rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
          active ? "bg-ink text-white" : "text-muted hover:text-ink",
        ].join(" ")}
      >
        Gimnasio
      </Link>
    </nav>
  );
}
