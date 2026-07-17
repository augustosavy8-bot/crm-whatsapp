import type { Metadata } from "next";

// Layout del grupo público (gimnasio). Vive DENTRO del root layout (que ya
// pone <html>/<body>), así que acá solo se sobreescribe el metadata.
//
// Override del manifest: el root layout advertía el manifest del CRM en toda
// ruta. Next mergea el metadata de root hacia abajo y REEMPLAZA las claves
// duplicadas, así que esto hace que /gimnasio se ofrezca a instalar como la
// app del gimnasio y no como "WhatsApp CRM". El SW y el manifest son propios,
// con scope /gimnasio/, sin tocar la PWA del CRM.
export const metadata: Metadata = {
  title: "Gimnasio · Sacá tu turno",
  description:
    "Reservá tu turno de kinesiología, nutrición o entrenamiento online, sin llamar.",
  manifest: "/gimnasio/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Mi Gimnasio",
    statusBarStyle: "default",
  },
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
