/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the build works at any URL path (e.g. GitHub Pages' /clock-manager/).
  base: "./",
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
