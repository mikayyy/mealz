import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@mealz/week-logic": fileURLToPath(
        new URL("../shared-logic.js", import.meta.url),
      ),
      "@mealz/shopping-logic": fileURLToPath(
        new URL("../shopping-logic.js", import.meta.url),
      ),
    },
  },
  optimizeDeps: { include: ["@mealz/week-logic", "@mealz/shopping-logic"] },
  base: "./",
  build: { target: "es2022" },
});
