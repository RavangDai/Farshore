/**
 * Plain words for an AI call from the browser that got no answer at all.
 *
 * When the game server answers, its JSON `error` already says what went wrong
 * with the model (busy, timed out, unreachable). These cover the two cases
 * where nothing usable comes back: the request ran past its time limit, or the
 * server itself could not be reached (stopped, restarting, or offline).
 */
export const SERVER_DOWN = "The Farshore server is not answering. Check that it is running, then try again.";

/** `slow` for a request that hit its time limit; otherwise fetch found no server (it rejects with a TypeError). */
export function failureMessage(error: unknown, slow: string): string {
  return (error as { name?: unknown } | null)?.name === "TimeoutError" ? slow : SERVER_DOWN;
}
