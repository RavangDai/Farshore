# Voice benchmark (Kokoro-82M on this laptop)

Measured 2026-11-14 on an Intel Core Ultra 5 125H (CPU only), with
`node --experimental-strip-types scripts/voice-bench.mjs`. Each configuration
ran in its own process, so load times are cold starts from the model cache.
Twelve game-like lines with Greek names were spoken piece by piece, split the
way the game splits them, and Whisper tiny.en listened to the results.

| Export @ threads | Load (s) | First piece (s) | Synthesis per second of speech | Word errors | Names heard | Memory (MB) |
| --- | --- | --- | --- | --- | --- | --- |
| **uint8 @ 8** | **3.0** | **0.89** | **0.29** | **16.2 %** | 45 % | 510 |
| uint8 @ 6 | 3.4 | 1.05 | 0.32 | 16.2 % | 45 % | 519 |
| fp32 @ 8 | 9.3 * | 1.15 | 0.37 | 16.1 % | 45 % | 704 |
| fp32 @ 6 | 3.8 | 1.22 | 0.39 | 16.1 % | 45 % | 671 |
| fp32 @ 4 | 4.1 | 1.53 | 0.49 | 16.1 % | 45 % | 682 |
| fp16 @ 8 | 7.4 * | 1.36 | 0.42 | 36.0 % | 41 % | 576 |

\* includes the export's first download.

**Choice: uint8 on 8 threads** (the default in `server/lib/kokoro.ts`). It is the
fastest on every measure and as intelligible as full precision; fp16 is slower
on this CPU and garbles more. Almost all remaining word errors are names Whisper
tiny does not know (Aeaea, Charybdis), not unclear speech.

## Through the running game server

`scripts/voice-bench.mjs --http http://localhost:3000`, with the voice warmed at
boot by `instrumentation.ts`:

| Request | Time |
| --- | --- |
| A new line (first piece) | 1.1 s |
| The same line again | 0.02 s (memory) |
| A fixed line (prologue, crossing, test) | 0.02 s (disk, written at boot) |
| A request abandoned after 100 ms | freed at once; a queued one is never synthesized |

Before this change the model loaded only when the first player opened the
game, so on a fresh server the prologue was always read by the browser's voice.
