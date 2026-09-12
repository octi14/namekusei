import fs from "fs";
import path from "path";

const dest = path.resolve("src/data");

export default {
  server: { watch: { ignored: ["**/src/data/*.json"] } },
  plugins: [
    {
      name: "namekusei-pack",
      configureServer(server) {
        server.middlewares.use("/__namekusei-pack", (req, res, next) => {
          if (req.method !== "POST") return next();
          const chunks = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => {
            try {
              const j = JSON.parse(Buffer.concat(chunks).toString("utf8"));
              fs.mkdirSync(dest, { recursive: true });
              const writeIfChanged = (name, obj) => {
                if (!obj || !Object.keys(obj).length) return;
                const p = path.join(dest, name);
                const next = JSON.stringify(obj);
                const prev = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
                if (prev === next) return;
                fs.writeFileSync(p, next);
              };
              writeIfChanged("anims.json", j.anims);
              writeIfChanged("looks.json", j.looks);
              writeIfChanged("sculpts.json", j.sculpts);
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
