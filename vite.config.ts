import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    // Port is resolved from the PORT env var (set in .claude/launch.json or shell).
    // Vite falls back to 5173 when PORT is unset or 0.
    port: Number(process.env.PORT) || undefined,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
