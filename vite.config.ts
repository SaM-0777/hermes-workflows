import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// https://vite.dev/config/
//
// This build exists for two reasons: it is the standalone preview of the studio
// (`bun run dev`) and it is what compiles the stylesheet the plugin injects into
// the app (dist/assets/*.css, read by scripts/build-plugin.ts). The runtime no
// longer loads dist/index.html — the studio renders natively inside the plugin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // The preview runs outside the app: only Vite needs a stand-in for the SDK.
    alias: {
      "@hermes/plugin-sdk": path.resolve(
        import.meta.dirname,
        "src/plugin-sdk-stub.ts",
      ),
    },
    tsconfigPaths: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  build: {
    // Fonts and images must be inlined: a plugin can ship no sibling asset files.
    assetsInlineLimit: Infinity,
    cssCodeSplit: false,
  },
  optimizeDeps: {
    exclude: ["pyodide"],
  },
});
