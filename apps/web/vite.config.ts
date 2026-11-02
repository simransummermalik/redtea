import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  publicDir: "../../packages/words/data/generated",
  plugins: [solid()],
});
