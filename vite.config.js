import fs from "fs";
import path from "path";

const dest = path.resolve("src/data");

export default {
  server: {
    watch: { ignored: ["**/src/data/*.json", "**/logs/**"] },
    headers: { "Cache-Control": "no-store" },
  },
  plugins: [
    {
      name: "namekusei-pack",
      configureServer(server) {
        server.middlewares.use("/__namekusei-ai-log", (req, res, next) => {
          if (req.method !== "POST") return next();
          const chunks = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => {
            try {
              const j = JSON.parse(Buffer.concat(chunks).toString("utf8"));
              const dir = path.resolve("logs");
              fs.mkdirSync(dir, { recursive: true });
              const nextName = () => {
                const nums = fs
                  .readdirSync(dir)
                  .map((f) => /^goku-ai-(\d+)\.csv$/i.exec(f))
                  .filter(Boolean)
                  .map((m) => +m[1]);
                const n = (nums.length ? Math.max(...nums) : 0) + 1;
                return `goku-ai-${String(n).padStart(2, "0")}.csv`;
              };
              if (j.reset) {
                if (fs.existsSync(path.join(dir, "goku-ai.csv")) && !fs.existsSync(path.join(dir, "goku-ai-01.csv"))) {
                  fs.copyFileSync(path.join(dir, "goku-ai.csv"), path.join(dir, "goku-ai-01.csv"));
                }
                const name = nextName();
                fs.writeFileSync(path.join(dir, name), j.header || "");
                fs.writeFileSync(path.join(dir, "goku-ai.current"), name);
              }
              const cur = fs.existsSync(path.join(dir, "goku-ai.current"))
                ? fs.readFileSync(path.join(dir, "goku-ai.current"), "utf8").trim()
                : "goku-ai.csv";
              const p = path.join(dir, cur);
              if (j.append) fs.appendFileSync(p, j.append);
              res.statusCode = 200;
              res.end("ok");
            } catch (e) {
              res.statusCode = 400;
              res.end(String(e));
            }
          });
        });
        server.middlewares.use("/__namekusei-pack", (req, res, next) => {
          if (req.method !== "POST") return next();
          const chunks = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => {
            try {
              const j = JSON.parse(Buffer.concat(chunks).toString("utf8"));
              fs.mkdirSync(dest, { recursive: true });
              const writeFile = (name, obj) => {
                if (!obj || !Object.keys(obj).length) return;
                const p = path.join(dest, name);
                let prev = {};
                try {
                  prev = JSON.parse(fs.readFileSync(p, "utf8") || "{}");
                } catch {
                  prev = {};
                }
                const merged = { ...prev, ...obj };
                const next = JSON.stringify(merged);
                if (JSON.stringify(prev) === next) return;
                fs.writeFileSync(p, next);
              };
              writeFile("anims.json", j.anims);
              writeFile("looks.json", j.looks);
              writeFile("sculpts.json", j.sculpts);
              res.statusCode = 200;
              res.end("ok");
            } catch (e) {
              res.statusCode = 400;
              res.end(String(e));
            }
          });
        });
      },
    },
  ],
};

