import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fijar la raíz al subproyecto: hay otros lockfiles en el árbol (FOKO / home)
  // y Next infiere mal la workspace root si no.
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        // El SW del gimnasio vive en /gimnasio/sw.js, cuyo scope por defecto
        // sería solo "/gimnasio/". Con este header puede tomar scope "/gimnasio"
        // y así controlar también la landing (start_url = /gimnasio), condición
        // para que dispare el prompt de instalación. NO afecta al SW del CRM
        // (/sw.js), que sigue con su scope "/" intacto.
        source: "/gimnasio/sw.js",
        headers: [{ key: "Service-Worker-Allowed", value: "/gimnasio" }],
      },
    ];
  },
};

export default nextConfig;
