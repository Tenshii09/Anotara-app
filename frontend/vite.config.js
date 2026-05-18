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
        name: "Tara! — Ano Tara Travel Planner",
        short_name: "Tara!",
        description:
          "Plan personalized Philippine itineraries with smart generation, offline maps, and ML-curated discovery.",
        theme_color: "#4a3a8a",
        background_color: "#fef4ed",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/dashboard",
        categories: ["travel", "lifestyle", "navigation"],
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
        shortcuts: [
          {
            name: "Generate trip",
            short_name: "Tara Na!",
            description: "Launch the trip generator",
            url: "/generate",
            icons: [{ src: "/pwa-icon.svg", sizes: "any" }],
          },
          {
            name: "My trips",
            short_name: "My Trips",
            description: "Open the trip vault",
            url: "/my-trips",
            icons: [{ src: "/pwa-icon.svg", sizes: "any" }],
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,ico,png,jpg,jpeg,webp}"],
        // Mapbox-gl alone is well over the default 2 MiB cap. Bump the limit
        // so the Service Worker can still precache the full app shell for
        // genuine offline use in the provinces.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
});
