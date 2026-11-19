// A stand-in for Next's router server, which logs stray errors and keeps
// serving (node_modules/next/dist/server/lib/router-server.js). It loads the
// built-in voice the way the game server does, then meets one stray exception
// (an aborted request surfacing as "Error: aborted", ECONNRESET) and one
// unhandled rejection. The process must log both and keep running.
process.on("uncaughtException", error => console.log(`logged: ${error.message}`));
process.on("unhandledRejection", reason => console.log(`logged rejection: ${reason instanceof Error ? reason.message : reason}`));

const { createKokoroEngine } = await import(new URL("../../server/lib/kokoro.ts", import.meta.url).href);
await createKokoroEngine({ warmup: false, threads: 2 });
console.log("voice loaded");

setTimeout(() => { throw Object.assign(new Error("aborted"), { code: "ECONNRESET" }); }, 20);
setTimeout(() => { void Promise.reject(new Error("stray rejection")); }, 60);
setTimeout(() => { console.log("SURVIVED"); process.exit(0); }, 300);
