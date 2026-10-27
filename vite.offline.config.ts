import { defineConfig, loadEnv, type Plugin, type Connect } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { GET, POST } from "./server/turn";
import { GET as mysteryGET, POST as mysteryPOST } from "./server/mystery";
import { GET as arcadeGET, POST as arcadePOST } from "./server/arcade";
import { POST as commentaryPOST } from "./server/commentary";
import { GET as voiceGET, POST as voicePOST } from "./server/voice";

// Keep FARSHORE_ variables on the server. Never rename them to VITE_.
function gameApi(): Plugin {
  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    const path = req.url?.split("?")[0];
    if (path === "/") { req.url = "/offline.html" + (req.url?.includes("?") ? "?" + req.url.split("?")[1] : ""); return next(); }
    if (!["/api/turn", "/api/mystery", "/api/arcade", "/api/commentary", "/api/voice"].includes(path || "")) return next();
    const get = path === "/api/arcade" || path === "/api/commentary" ? arcadeGET : path === "/api/voice" ? voiceGET : path === "/api/mystery" ? mysteryGET : GET;
    const post = path === "/api/arcade" ? arcadePOST : path === "/api/commentary" ? commentaryPOST : path === "/api/voice" ? voicePOST : path === "/api/mystery" ? mysteryPOST : POST;
    const controller = new AbortController();
    res.on("close", () => { if (!res.writableEnded) controller.abort(); });
    try {
      let response: Response;
      if (req.method === "GET") response = await get();
      else if (req.method === "POST") {
        let size = 0;
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.length;
          if (size > 6000) {
            res.statusCode = 413;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "The game request is too large." }));
            return;
          }
          chunks.push(buffer);
        }
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers))
          if (value)
            headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        response = await post(
          new Request(
            `http://${req.headers.host || "localhost:5173"}${path}`,
            {
              method: "POST",
              headers,
              body: Buffer.concat(chunks).toString("utf8"),
              signal: controller.signal,
            },
          ),
        );
      } else
        response = Response.json(
          { error: "Method not allowed." },
          { status: 405, headers: { Allow: "GET, POST" } },
        );
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      // Binary-safe: the voice route returns audio.
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "The local game server could not answer. Try again.",
        }),
      );
    }
  };
  return {
    name: "farshore-local-api",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
export default defineConfig(({ mode }) => {
  const local = loadEnv(mode, process.cwd(), "FARSHORE_");
  for (const [key, value] of Object.entries(local))
    if (process.env[key] === undefined) process.env[key] = value;
  return {
    plugins: [react(), gameApi()],
    build: { outDir: "dist-offline", rollupOptions: { input: fileURLToPath(new URL("./offline.html", import.meta.url)) } },
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: { host: "localhost", port: 5173, strictPort: true },
    preview: { host: "localhost", port: 4173, strictPort: true },
  };
});
