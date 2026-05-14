import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "push-sw.js",
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.svg", "pwa-icon.svg", "pwa-maskable.svg"],
      manifest: {
        name: "Ano Tara? Travel Planner",
        short_name: "Ano Tara",
        description:
          "A Philippine travel planner with smart itinerary generation and offline support.",
        theme_color: "#0f172a",
        background_color: "#f7f3ea",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/pwa-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/pwa-maskable.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,ico,png,jpg,jpeg,webp}"],
      },
    }),
  ],
});
