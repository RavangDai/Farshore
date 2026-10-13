import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
export async function startProduction(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" || args[i] === "-p") {
      const port = Number(args[++i]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Choose a valid server port.");
      process.env.PORT = String(port);
    } else if (args[i] === "--hostname" || args[i] === "-H") process.env.HOSTNAME = args[++i];
    else throw new Error("Use --port or --hostname to configure production startup.");
  }
  const root = process.cwd(), standalone = path.join(root, ".next", "standalone");
  const entry = path.join(standalone, "server.js");
  if (!fs.existsSync(entry)) throw new Error("Run npm run build before starting the production server.");
  fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
  fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
  process.env.NODE_ENV = "production";
  await import(pathToFileURL(entry).href);
}
