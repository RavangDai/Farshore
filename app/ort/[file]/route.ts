import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

/**
 * ONNX Runtime Web's WebAssembly binary and its JavaScript glue, served by the
 * game from the installed package. They always match the runtime that loads
 * them, need no CDN, and stay same-origin for the content security policy.
 * Only the two files the trained Lotus rival needs are served.
 */
const FILES: Record<string, string> = { "ort-wasm-simd-threaded.wasm": "application/wasm", "ort-wasm-simd-threaded.mjs": "text/javascript; charset=utf-8" };

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const type = FILES[file];
  if (!type) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(path.join(process.cwd(), "node_modules", "onnxruntime-web", "dist", file));
    return new Response(new Uint8Array(body), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" } });
  } catch {
    return new Response("The ONNX runtime is not installed. Run npm install.", { status: 503 });
  }
}
