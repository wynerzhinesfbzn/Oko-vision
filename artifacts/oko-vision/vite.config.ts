import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    nodePolyfills({ include: ["buffer", "process", "stream", "util", "crypto"] }),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Split big vendor chunks so browsers can cache them independently
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules/@solana") || id.includes("node_modules/@wallet-standard") || id.includes("node_modules/@noble"))
            return "vendor-solana";
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3"))
            return "vendor-charts";
          if (id.includes("node_modules/@tanstack"))
            return "vendor-query";
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/scheduler"))
            return "vendor-react";
          if (id.includes("node_modules/lucide"))
            return "vendor-icons";
          if (id.includes("node_modules/i18next") || id.includes("node_modules/react-i18next"))
            return "vendor-i18n";
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/dex": {
        target: "https://api.dexscreener.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/dex/, ""),
      },
      "/rugcheck": {
        target: "https://api.rugcheck.xyz",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/rugcheck/, ""),
      },
      "/sol-rpc": {
        target: "https://api.mainnet-beta.solana.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/sol-rpc/, ""),
      },
      "/coingecko": {
        target: "https://api.coingecko.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/coingecko/, ""),
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    headers: process.env.NODE_ENV !== "production"
      ? {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Pragma": "no-cache",
        }
      : {},
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
