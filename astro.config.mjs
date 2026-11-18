import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import tailwindcss from "@tailwindcss/vite";

// Site 100% estático: gerado pelo app da bandeja (tray/) e enviado por FTP à Locaweb.
export default defineConfig({
  output: "static",
  integrations: [preact()],
  vite: { plugins: [tailwindcss()] },
});
