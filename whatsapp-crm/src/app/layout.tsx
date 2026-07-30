import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

// Tipografía de marca KINACTIVA: Archivo (400 texto, 600 etiquetas, 800 títulos).
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "KINACTIVA",
  description: "Reservá tu turno en KINACTIVA",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "KINACTIVA",
    statusBarStyle: "default",
  },
};

// Evita zooms accidentales en mobile/PWA (se siente como app nativa).
// interactiveWidget=resizes-content: al abrir el teclado, el layout se achica
// y el composer queda por encima (clave para el chat en mobile).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#F0552D",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-full bg-canvas text-ink">{children}</body>
    </html>
  );
}
