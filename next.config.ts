import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // The voice engine loads its voices and native runtime from disk, so it must
  // stay a plain Node package rather than be bundled.
  serverExternalPackages: ["mongodb", "nodemailer", "kokoro-js", "phonemizer"],
  outputFileTracingIncludes: {
    "/api/voice": [
      "./node_modules/kokoro-js/voices/**/*",
      `./node_modules/onnxruntime-node/bin/napi-v3/${process.platform}/${process.arch}/**/*`,
    ],
  },
};
export default config;
