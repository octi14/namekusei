/**
 * Captura de una base (nave) en varias vistas para comparar con referencias.
 * Requiere `npm run dev` corriendo y Edge instalado.
 *
 *   node scripts/shotBase.mjs [f|z] [query extra, p. ej. "a=0,90&el=20,5&zoom=1.4"]
 *
 * Genera logs/base-<f|z>.png.
 */
import puppeteer from "puppeteer-core";
import fs from "fs";

const [base = "f", extra = ""] = process.argv.slice(2);
fs.mkdirSync("logs", { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: "new",
  args: ["--use-angle=d3d11", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.setViewport({ width: 2200, height: 600 });
page.on("pageerror", (e) => console.log("ERR", e.message));
page.on("console", (m) => m.type() === "error" && console.log("CONSOLE", m.text()));
await page.goto(`http://localhost:5173/shotBase.html?base=${base}&${extra}`, { waitUntil: "load" });
await page.waitForFunction(() => window.__shotReady, { timeout: 60000 });
const el = await page.$("canvas");
const out = `logs/base-${base}.png`;
await el.screenshot({ path: out });
await browser.close();
console.log(out);
