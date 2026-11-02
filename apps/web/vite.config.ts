import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  publicDir: "../../packages/words/data/generated",
  plugins: [solid()],
  server: {
    proxy: {
      "/ws": { target: "ws://localhost:3001", ws: true },
    },
  },
});
