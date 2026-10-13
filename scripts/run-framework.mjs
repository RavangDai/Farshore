import { fileURLToPath } from "node:url";
import { prepareLocalEnvironment } from "./local-online-env.mjs";
const [command, ...args] = process.argv.slice(2);
if (!["dev", "build", "start"].includes(command)) throw new Error("Expected dev, build, or start.");
if (command === "dev") prepareLocalEnvironment();
process.env.NEXT_TELEMETRY_DISABLED = "1";
const cli = new URL("../node_modules/next/dist/bin/next", import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), command, ...(command === "dev" ? ["--webpack"] : []), ...args];
await import(cli.href);
