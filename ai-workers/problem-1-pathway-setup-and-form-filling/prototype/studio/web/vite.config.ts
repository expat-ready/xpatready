// Vite 8 + React + Tailwind 4, as the team's frontend (ERv2-frontend@5ccd9fa). Built into web/dist and served by the
// studio API on one port (start.sh). `vite build --watch` while developing.
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/** CS-D5 (break B1; the founder allowed this file on #3500): PDF.js 6 decodes black-and-white scans (JBIG2, CCITT),
 *  JPEG 2000, colour profiles and Asian-language text only with its data files, fetched from a base URL. They are copied
 *  into <outDir>/pdfjs/ (our own origin). Never the scripting engine (quickjs-eval.*): nothing in a file runs (BR-3).
 *  Only the wasm decoders, not their no-wasm .js fallbacks: every JavaScript file the build ships has a source map (PF-Le). */
function pdfjsData(): Plugin {
  let outDir = "";
  return { name: "pdfjs-data", apply: "build", configResolved(c) { outDir = resolve(c.root, c.build.outDir); }, closeBundle() {
    const from = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json")), to = join(outDir, "pdfjs");
    for (const d of ["cmaps", "standard_fonts", "iccs"]) cpSync(join(from, d), join(to, d), { recursive: true });
    mkdirSync(join(to, "wasm"), { recursive: true });
    for (const f of ["jbig2.wasm", "openjpeg.wasm", "qcms_bg.wasm"]) cpSync(join(from, "wasm", f), join(to, "wasm", f));
  } };
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss(), pdfjsData()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: { port: 4401, proxy: { "/api": "http://127.0.0.1:4400" } },
});
