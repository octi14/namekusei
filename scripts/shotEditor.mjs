/**
 * Captura de un personaje en el editor procedural (F2) para revisar modelado.
 * Requiere `npm run dev` corriendo y Edge instalado.
 *
 *   node scripts/shotEditor.mjs <Personaje> [zoom=7] [x y w h]
 *
 * Genera logs/shot-front.png y logs/shot-side.png (vista girada ~90° con Alt+arrastre).
 * x y w h = recorte en px CSS (con deviceScaleFactor 3 se ve en detalle). Sin recorte = pantalla completa.
 * Ejemplo botas de Krilin: node scripts/shotEditor.mjs Krilin 7 385 555 160 95
 */
import puppeteer from "puppeteer-core";
import fs from "fs";

const [who = "Krilin", zoom = "7", ...crop] = process.argv.slice(2);
const clip = crop.length === 4 ? { x: +crop[0], y: +crop[1], width: +crop[2], height: +crop[3] } : undefined;
fs.mkdirSync("logs", { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: "new",
  args: ["--use-angle=d3d11", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: clip ? 3 : 1 });
page.on("pageerror", (e) => console.log("ERR", e.message));
await page.goto("http://localhost:5173/", { waitUntil: "load" });
await wait(1500);
await page.click("#tr-skip").catch(() => {});
// Entrenamiento con el personaje (mismo atajo que usa el editor de animaciones)
await page.evaluate((w) => dispatchEvent(new CustomEvent("nk-anim-test", { detail: { who: w } })), who);
await wait(9000);
await page.keyboard.press("F2");
await wait(2500);
const picked = await page.evaluate((w) => {
  const s = [...document.querySelectorAll("select")].find((x) => x.offsetParent && [...x.options].some((o) => o.value === w));
  if (!s) return null;
  s.value = w;
  s.dispatchEvent(new Event("change", { bubbles: true }));
  return s.value;
}, who);
if (!picked) console.log(`No encontré "${who}" en el selector del editor`);
await wait(2500);
await page.mouse.move(370, 425);
for (let i = 0; i < +zoom; i++) {
  await page.mouse.wheel({ deltaY: -200 });
  await wait(80);
}
await wait(800);
await page.screenshot({ path: "logs/shot-front.png", clip });
await page.keyboard.down("Alt");
await page.mouse.move(200, 300);
await page.mouse.down();
await page.mouse.move(330, 300, { steps: 10 });
await page.mouse.up();
await page.keyboard.up("Alt");
await wait(600);
await page.screenshot({ path: "logs/shot-side.png", clip });
await browser.close();
console.log("logs/shot-front.png · logs/shot-side.png");
