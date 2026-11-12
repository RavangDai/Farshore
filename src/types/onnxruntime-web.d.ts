// onnxruntime-web ships its declarations for the root entry only. The game
// imports the WebAssembly-only build, whose API is the same.
declare module "onnxruntime-web/wasm" {
  export * from "onnxruntime-common";
}
