import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import tailwindcss from "@tailwindcss/vite";
import { adminMock } from "./dev/admin-mock.mjs";

// Site 100% estático: gerado pelo app da bandeja (tray/) e enviado por FTP à Locaweb.
export default defineConfig({
  output: "static",
  integrations: [preact()],
  // adminMock só existe no `npm run dev` (simula /admin/api.php; na hospedagem quem responde é o PHP).
  vite: { plugins: [tailwindcss(), adminMock()] },
});
