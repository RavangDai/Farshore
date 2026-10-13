import { fileURLToPath } from "node:url";
import { startProduction } from "./start-production.mjs";
const [command, ...args] = process.argv.slice(2);
if (!["dev", "build", "start"].includes(command)) throw new Error("Expected dev, build, or start.");
if (command === "dev") {
  const { prepareLocalEnvironment } = await import("./local-online-env.mjs");
  prepareLocalEnvironment();
}
process.env.NEXT_TELEMETRY_DISABLED = "1";
const cli = new URL("../node_modules/next/dist/bin/next", import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), command, ...(command === "dev" ? ["--webpack"] : []), ...args];
if (command === "start") await startProduction(args);
else await import(cli.href);
