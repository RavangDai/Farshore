import { defineConfig, loadEnv, type Plugin, type Connect } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { GET, POST } from "./server/turn";

// Keep FARSHORE_ variables on the server. Never rename them to VITE_.
function gameApi(): Plugin {
  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    if (req.url?.split("?")[0] !== "/api/turn") return next();
    try {
      let response: Response;
      if (req.method === "GET") response = GET();
      else if (req.method === "POST") {
        let size = 0;
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.length;
          if (size > 6000) {
            res.statusCode = 413;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Advice is too long." }));
            return;
          }
          chunks.push(buffer);
        }
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers))
          if (value)
            headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        response = await POST(
          new Request(
            `http://${req.headers.host || "localhost:5173"}/api/turn`,
            {
              method: "POST",
              headers,
              body: Buffer.concat(chunks).toString("utf8"),
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
      res.end(await response.text());
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
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: { host: "localhost", port: 5173, strictPort: true },
    preview: { host: "localhost", port: 4173, strictPort: true },
  };
});
