import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Backend defaults to http://localhost:8000 (per resume-backend README).
// Override with VITE_API_BASE if it's running elsewhere on the LAN.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
});
