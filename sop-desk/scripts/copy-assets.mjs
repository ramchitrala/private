// Copies the pdf.js viewer library and its worker into /public so the browser can load
// them as plain modules (keeps them out of the bundle and in step with the installed version).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const src = path.join("node_modules", "pdfjs-dist", "build");
const dest = path.join("public", "pdfjs");
if (existsSync(src)) {
  mkdirSync(dest, { recursive: true });
  for (const f of ["pdf.min.mjs", "pdf.worker.min.mjs"]) copyFileSync(path.join(src, f), path.join(dest, f));
}
