// Keeps libraries from making every stray error fatal to the game server.
//
// phonemizer (loaded by kokoro-js for the built-in voice) installs two
// process-wide handlers when it runs under Node:
//   process.on("uncaughtException", e => { if (!(e instanceof ExitStatus)) throw e })
//   process.on("unhandledRejection", e => { throw e })
// Next deliberately only logs stray errors (router-server.js), so one bad
// request cannot stop the server. With phonemizer's handlers in place, any
// stray error or rejection, such as a request aborted by a page reload while
// Next was still handling it, re-threw from inside a handler and Node exited
// with code 7. tests/voice-process-handlers.test.mjs covers this.

const FATAL_EVENTS = new Set<string | symbol>(["uncaughtException", "unhandledRejection"]);

/**
 * A handler whose whole body re-throws its argument, optionally unless it is
 * one error type: `function(e){throw e}`, `function(e){if(!(e instanceof X))throw e}`
 * or the arrow forms. Anything that does more than that is left alone.
 */
const RETHROW = /^(?:function\b[^(]*)?\(?\s*([\w$]+)\s*\)?\s*(?:=>\s*)?\{\s*(?:if\s*\(\s*!\s*\(\s*\1\s+instanceof\s+[\w$.]+\s*\)\s*\)\s*)?throw\s+\1\s*;?\s*\}$/;

export function isRethrowHandler(listener: unknown): boolean {
  return typeof listener === "function" && RETHROW.test(Function.prototype.toString.call(listener).trim());
}

type Register = (this: NodeJS.Process, event: string | symbol, listener: (...args: unknown[]) => void) => NodeJS.Process;
const METHODS = ["on", "addListener"] as const;
let depth = 0;
let saved: [typeof METHODS[number], PropertyDescriptor | undefined][] = [];

/**
 * Runs `load` (typically a dynamic import) while declining re-throwing
 * handlers for uncaught exceptions and unhandled rejections. Every other
 * registration, by this library or by anything else running meanwhile, goes
 * through untouched. Nothing is patched once `load` settles.
 */
export async function loadWithoutFatalHandlers<T>(load: () => Promise<T>): Promise<T> {
  if (depth++ === 0) {
    saved = METHODS.map(key => [key, Object.getOwnPropertyDescriptor(process, key)]);
    for (const key of METHODS) {
      const original = process[key] as unknown as Register;
      const guarded: Register = function (event, listener) {
        if (FATAL_EVENTS.has(event) && isRethrowHandler(listener)) return this;
        return original.call(this, event, listener);
      };
      Object.defineProperty(process, key, { configurable: true, writable: true, enumerable: false, value: guarded });
    }
  }
  try {
    return await load();
  } finally {
    if (--depth === 0) {
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(process, key, descriptor);
        else delete (process as unknown as Record<string, unknown>)[key];
      }
      saved = [];
    }
  }
}
