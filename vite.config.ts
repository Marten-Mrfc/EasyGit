import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    // Raise the warning threshold — after splitting, individual chunks will be
    // well below 500 kB; warn only for genuinely oversized chunks.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split node_modules into focused vendor chunks so:
        //  • the browser can parse them in parallel
        //  • vendor code is cached separately from app code across rebuilds
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          // React runtime — tiny but loaded by everything, keep isolated
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'vendor-react';
          }
          // Radix UI primitives
          if (id.includes('radix-ui') || id.includes('@radix-ui')) {
            return 'vendor-radix';
          }
          // Icon library (large — many SVG paths)
          if (id.includes('lucide-react')) {
            return 'vendor-lucide';
          }
          // Diff rendering (highlight.js + diff2html)
          if (id.includes('diff2html') || id.includes('highlight.js')) {
            return 'vendor-diff';
          }
          // Tauri JS bridge
          if (id.includes('@tauri-apps')) {
            return 'vendor-tauri';
          }
          // TanStack Query
          if (id.includes('@tanstack')) {
            return 'vendor-query';
          }
          // Everything else in node_modules (cmdk, sonner, zustand, etc.)
          // — let Rollup auto-chunk these to avoid circular chunk warnings.
        },
      },
    },
  },
}));
