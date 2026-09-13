import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const vite = path.join(path.dirname(fileURLToPath(import.meta.url)), "../node_modules/vite/bin/vite.js");
const child = spawn(process.execPath, [vite, ...process.argv.slice(2)], { stdio: "inherit" });

let cut = false;
const halt = () => {
  cut = true;
  try {
    child.kill();
  } catch {
    /* ignore */
  }
};
process.on("SIGINT", halt);
process.on("SIGTERM", halt);
child.on("close", (code) => {
  if (cut || code === 2 || code === 130) process.exit(0);
  process.exit(code ?? 0);
});
