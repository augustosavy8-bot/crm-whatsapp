import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fijar la raíz al subproyecto: hay otros lockfiles en el árbol (FOKO / home)
  // y Next infiere mal la workspace root si no.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
