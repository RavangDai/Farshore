import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // No Next.js badge over the game in development; build and runtime errors
  // still open the overlay.
  devIndicators: false,
  // The voice engine loads its voices and native runtime from disk, so it must
  // stay a plain Node package rather than be bundled.
  serverExternalPackages: ["mongodb", "nodemailer", "kokoro-js", "phonemizer"],
  outputFileTracingIncludes: {
    // The trained Lotus rival's WebAssembly runtime, served by app/ort/[file].
    "/ort/[file]": ["./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs"],
    "/api/voice": [
      "./node_modules/kokoro-js/voices/**/*",
      `./node_modules/onnxruntime-node/bin/napi-v3/${process.platform}/${process.arch}/**/*`,
    ],
  },
};
export default config;
