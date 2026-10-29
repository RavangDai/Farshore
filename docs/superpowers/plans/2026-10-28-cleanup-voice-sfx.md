# Cleanup, Natural Voice and Sound Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove junk and dead code, give the repository a clear layout, replace the robotic browser voice with built-in Kokoro neural voices, and replace the five synthesized chimes with a full, event-driven sound design.

**Architecture:** Three parts, each leaving a working game. (A) A scripted reorganization that moves files and rewrites every import from a single move map, verified by the type-check, the test suite and both production builds. (B) Kokoro-82M runs inside the game server through `kokoro-js` (no key, no extra service); the browser plays each line through a small per-character Web Audio chain, and browser speech remains the fallback with a natural-voice ranking. (C) Sounds are rendered in code by pure DSP functions into `AudioBuffer`s, mixed through buses with a scene reverb and a limiter, and triggered by a pure `audioFrame(prev, next)` function that diffs engine states.

**Tech Stack:** TypeScript, React 19, Next.js 16 (webpack), Vite 8, Web Audio API, `kokoro-js@1.2.1` + `@huggingface/transformers@3.8.1` (onnxruntime-node), Node test runner.

**Spec:** the user's request of 2026-10-27 ("delete all the unwanted files and make my code structure organized; the AI voice sounds too robotic, use natural voices; SFX need a massive improvement") plus the decisions recorded in this header.

## Global Constraints

- Do not commit. The user has not asked for commits; leave changes in the working tree and offer grouped commits at the end. The only history change is Task A1, which the user approved.
- Never touch `.env`, `.dev.vars` (used by `scripts/local-online-env.mjs`), or the pending AI controllers in `src/lib/ai/` (`aeolus`, `calypso`, `circe`, `ithaca`, `lotus`, `sirens`): they are waiting to be wired in.
- Keep the earlier game modes (`?voyage`, `?mystery`): the README promises they are preserved.
- Untracked files are deleted through the Windows Recycle Bin, never permanently.
- Repository line endings are CRLF; scripted edits must preserve them.
- Audio stays original: no downloaded recordings. The voice model is downloaded once at runtime into `.cache/models` (ignored by git and Docker).
- Every task ends green: `npx tsc --noEmit` and `npm test`.

## Review Focus

1. No internet on first run (model download fails): voice falls back to browser speech for every line, with no long silences and no console errors. Test in B2 (loader rejection → 503, status `failed`) and B4 (client falls back when POST fails).
2. The voice model is still downloading when the first line is spoken: that line is spoken by the browser at once instead of waiting. Test in B2 (status `loading` → POST 503 immediately).
3. Many sounds at once (boulder crash + hit + coin + footsteps): no clipping. Test in C5 (polyphony cap per sound and globally; limiter present in the graph).
4. Sound turned off, settings open, or tab hidden: no effects or ambience play, but the voice still speaks through the HTML audio fallback. Test in C5 (quiet/disabled → no sources) and B4 (engine suspended → `HTMLAudioElement` path).
5. Moved files break a production build: both `npm run build` and `npm run build:offline` run in A3 and at the end; the standalone output must contain `kokoro-js/voices` and the onnxruntime binary (B2).

---

## Part A: Cleanup and structure

### Task A1: Unblock pushing to GitHub

**Files:** git history of the 17 unpushed commits (`origin/main..HEAD`).

- [ ] Create `backup/before-cleanup` at the current `HEAD`.
- [ ] `git stash push --include-untracked -m "wip before history scrub"`.
- [ ] `FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --index-filter "git rm --cached --ignore-unmatch -q GitHubDesktopSetup-x64.exe RHEL93_RH124_Accessing_Lab_Content.pdf" -- origin/main..HEAD`
- [ ] `git stash pop`. Expected: the user's uncommitted cave work is back, unchanged (`git status` lists the same modified and untracked files as before).
- [ ] Verify: `git rev-list --objects origin/main..HEAD | git cat-file --batch-check` shows no blob over 100 MB; `npm test` → 212 pass.

### Task A2: Delete junk and dead code

**Files:**
- Delete (git): `scripts/__pycache__/`, `src/components/arcade-scenes.tsx`, `src/arcade-scenes.css`, `src/lib/legacy-arcade.ts`.
- Modify: `tests/arcade.test.mjs` (drop the 15 tests that exercise `legacy-arcade.ts`; port "every trial is open in any order…" to a literal `AttemptSummary` that `validSummary` accepts), `.gitignore` (+ `__pycache__/`, `*.pyc`, `.cache/`), `.dockerignore` (+ `.cache`).
- Recycle (untracked): `temple run 1.webp`, `temple run 2.webp`, `temple run 3.webp`, `.tmp/`, `dist/`, `tsconfig.tsbuildinfo`, empty `build/ db/ supabase/ .openai/`, leftover `.vinext/ .wrangler/ .sites-runtime/`.

- [ ] Delete and recycle the files above.
- [ ] Verify: `npx tsc --noEmit` exit 0; `npm test` passes (212 − 15 = 197 tests).

### Task A3: Reorganize the layout

**Files:** move map (old → new). Imports are rewritten by a script that resolves every specifier against the old layout and re-relativizes it from the new location, keeping each specifier's style (`.ts` suffix or not, `@/` alias or relative).

| Old | New |
|---|---|
| 11 root docs (`AI_ARCHITECTURE.md`, `ART-CREDITS.md`, `FARSHORE-*.md`, `GAMEPLAY_DESIGN.md`, `ODYSSEY-ADAPTATION.md`, `ONLINE-*.md`, `PROJECT-NOTES.md`, `UI_DESIGN.md`) | `docs/` |
| `FARSHORE_ Eight Trials Homeward.png` | `docs/farshore-style-reference.png` |
| `Farshore Context and Assisment/` | `docs/coursework/` |
| `output/` | `docs/screenshots/` |
| 13 Phase 2 builders in `scripts/` (`*phase2*`, `arcade-spike.mjs`, `render-*.py`, `pack-*.py`, `verify-*-powerpoint.ps1`) | `scripts/coursework/` (path strings updated) |
| `lib/*.ts`, `server/chat.ts`, `server/http.ts`, `server/secrets.ts` | `server/lib/` |
| `src/*.css` | `src/styles/` |
| `src/App.tsx` | `src/VoyageApp.tsx` |
| `src/lib/{arcade,arcade-runtime,commentary,rivals}.ts` | `src/lib/arcade/` |
| `src/lib/voyage-audio.ts` | `src/lib/audio/` |
| `src/lib/{mythic,odyssey-games}.ts` | `src/lib/encounters/` |
| `src/lib/{farshore-rendering,scene-details}.ts` | `src/lib/render/` |
| `src/lib/{voice,dictation}.ts` | `src/lib/speech/` |
| `src/lib/{cast,odyssey,field-notes,map-land}.ts` | `src/lib/story/` |
| `src/lib/{game,turn,character-performance}.ts` | `src/lib/voyage/` |
| `src/lib/mystery.ts` | `src/lib/mystery/` |
| `src/lib/{online,ai-account}.ts` | `src/lib/online/` |
| `src/components/{arcade-round,arcade-hud,adventure-game,cave-game,mythic-games,game-stage,encounter-codex}.tsx` | `src/components/play/` |
| `src/components/{ai-inspector,ai-lab-mode,encounter-intel}.tsx` | `src/components/ai/` |
| `src/components/{captain-portrait,scene-water,speech-bubble,story-sources,voyage-map}.tsx` | `src/components/voyage/` |
| `src/components/{odyssey-map,odyssey-preferences,trial-selection,voyage-chart}.tsx` | `src/components/menu/` |

Also: `tsconfig.json` drops `"lib"` from `include`; README links and file map, and path mentions in `docs/*.md` (not `docs/coursework/`), follow the map.

- [ ] Run the move script; re-run the import-graph check. Expected: no unresolved imports; unreachable files are only the six pending AI controllers.
- [ ] Verify: `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run build:offline` all succeed; the built CSS still contains Tailwind utilities used in `app/online-shell.tsx`.

---

## Part B: Natural voice

### Task B1: Character voice profiles

**Files:** Modify `src/lib/arcade/rivals.ts`. Test: `tests/voice.test.mjs`.

**Produces:** `VoiceId = "bard" | "odysseus" | TrialId`; `VoiceProfile = { kokoro: string; speed: number; name: string; female?: boolean; accent: "gb" | "us"; browser: { pitch: number; rate: number }; fx: VoiceFx }`; `VoiceFx = { pitch?: number; low?: number; high?: number; space: Space; wet: number; double?: { rate: number; delayMs: number; gain: number } }`; `Space = "hall" | "cave" | "sea" | "ethereal" | "storm"`.

Voices (graded by Kokoro's own table; only B− or better unless the character needs depth):

| Id | kokoro | speed | fx |
|---|---|---|---|
| bard | `bm_george` | 0.95 | hall, wet .12, low +1.5 |
| odysseus | `bm_fable` | 0.96 | hall, wet .08 |
| lotus | `af_heart` | 0.9 | ethereal, wet .28, high +2 |
| cyclops | `am_fenrir` | 1.0 | pitch .88, low +5, cave, wet .3 |
| aeolus | `am_puck` | 1.05 | ethereal, wet .22, high +3 |
| circe | `bf_emma` | 0.95 | hall, wet .18 |
| sirens | `af_bella` | 0.88 | ethereal, wet .38, double {rate 1.012, 23 ms, .55} |
| scylla | `am_michael` | 0.95 | pitch .94, low +3, sea, wet .22, double {rate .92, 31 ms, .5} |
| calypso | `bm_lewis` | 0.92 | pitch .93, low +4, storm, wet .3 |
| bow | `am_echo` | 1.05 | hall, wet .1 |

- [ ] Test `voice profiles use real Kokoro voices and gentle browser settings`: every `kokoro` id is in kokoro-js's voice table; `browser.pitch` and `browser.rate` lie in [0.85, 1.15]; `fx.wet` in [0, 0.5].
- [ ] Implement; run `npm test`.

### Task B2: Built-in Kokoro engine in the game server

**Files:**
- Create: `server/lib/wav.ts`, `server/lib/kokoro.ts`.
- Modify: `server/voice.ts`, `package.json` (+ `kokoro-js@1.2.1`, `@huggingface/transformers@^3.8.1`), `next.config.ts` (`serverExternalPackages` + `kokoro-js`, `phonemizer`; `outputFileTracingIncludes["/api/voice"]` = `./node_modules/kokoro-js/voices/**/*`, `./node_modules/onnxruntime-node/bin/**/*`), `Dockerfile` (runner creates `/app/.cache` owned by `node`).
- Test: `tests/voice.test.mjs`.

**Produces:**
- `prepareSpeech(samples: Float32Array, sampleRate: number): Float32Array`: trims edge silence below −50 dBFS (keeps 40 ms), peak-normalizes to 0.89.
- `encodeWav(samples: Float32Array, sampleRate: number): Uint8Array`: 16-bit PCM mono RIFF.
- `kokoroStatus(): "idle" | "loading" | "ready" | "failed"`, `warmKokoro(): void`, `speakWithKokoro(text: string, voice: string, speed: number): Promise<Uint8Array>` (one synthesis at a time, at most 3 waiting, else throws `VoiceBusyError`; 24-entry LRU of finished WAVs), `setKokoroLoader(loader: (() => Promise<SpeechEngine>) | null)` for tests, where `SpeechEngine = { sampleRate: number; synthesize(text, voice, speed): Promise<Float32Array> }`.
- `voiceConfig(env)`: `FARSHORE_TTS=browser|off` → `browser`; `FARSHORE_TTS_URL` → `remote`; otherwise `builtin`. Model cache: `FARSHORE_MODEL_CACHE` or `<cwd>/.cache/models`; model `onnx-community/Kokoro-82M-v1.0-ONNX`, dtype `q8`, device `cpu`.
- `GET /api/voice` → `{ neural: boolean, engine: "builtin" | "remote" | "browser", ready: boolean }` and starts warming the built-in engine.
- `POST /api/voice` → built-in: `audio/wav`; remote: unchanged proxy (uses the profile's `kokoro` id and `speed`); not ready → 503 at once; busy → 503; browser → 503.

- [ ] Tests: `wav header describes 16-bit mono PCM at the given rate`; `prepareSpeech trims silence and normalizes the peak`; `voice config picks remote, built-in or browser`; `built-in voice returns wav from the engine`; `a loading engine answers 503 at once and keeps warming`; `a failed engine reports failed and the route answers 503`; `the queue refuses a fourth waiting line`; `unknown voices and oversized text are rejected before synthesis`.
- [ ] Implement; `npm test`.

### Task B3: Real-model smoke test (scratchpad only)

- [ ] Script in the scratchpad synthesizes one line per character through `speakWithKokoro` (this also fills `.cache/models` so the user's first run is instant), records time per line, writes WAVs to the scratchpad, and transcribes them with `Xenova/whisper-tiny.en`. Expected: every transcript matches its line (word error rate ≤ 20%); a 10-word line synthesizes in under 2 s on this machine.

### Task B4: Natural playback in the browser

**Files:**
- Create: `src/lib/speech/browser-voices.ts`, `src/lib/speech/voice-fx.ts`.
- Modify: `src/lib/speech/voice.ts`, `src/ArcadeApp.tsx` (settings shows the engine and download state), `src/VoyageApp.tsx` (Odysseus' replies go through `VoiceBox` with voice `odysseus`).
- Test: `tests/voice.test.mjs`.

**Produces:**
- `pickBrowserVoice(voices: VoiceInfo[], profile: VoiceProfile, taken?: Set<string>): VoiceInfo | undefined`, where `VoiceInfo = { name: string; lang: string; localService: boolean }`. Scoring: Natural/Neural +60, Premium/Enhanced +40, Google +30, Online +25, network voice +10, accent match +30, other English +15, non-English −100, gender match +20, mismatch −40, already used by another character −15.
- `playWithFx(context: AudioContext, buffer: AudioBuffer, fx: VoiceFx, volume: number): { done: Promise<void>; stop(): void }`.
- `VoiceBox`: `status: "checking" | "loading" | "neural" | "browser"` with `onStatus(listener)`; polls `GET /api/voice` every 3 s while `loading` (gives up after 3 min); plays neural lines through its own lazily created `AudioContext` with `playWithFx`, falling back to `HTMLAudioElement` when that context cannot run.

- [ ] Tests: `browser voices prefer natural ones in the character's accent and gender`; `characters get different browser voices when there are enough`; `the voice box falls back to browser speech when the server cannot speak`; `voice fx builds a doubled chain for the Sirens and a single chain for the Bard` (mock context counts buffer sources and convolvers).
- [ ] Implement; `npm test`; `npx tsc --noEmit`.

### Task B5: Voice docs and config

- [ ] `.env.example`: document `FARSHORE_TTS` and `FARSHORE_MODEL_CACHE`; README voice section; `docs/ART-CREDITS.md`: Kokoro-82M (Apache-2.0), kokoro-js (Apache-2.0), eSpeak NG via `phonemizer` (GPL-3.0).

---

## Part C: Sound effects

### Task C1: DSP primitives

**Files:** Create `src/lib/audio/dsp.ts`. Test: `tests/sfx.test.mjs`.

**Produces:** `rng(seed): () => number` (mulberry32); `white`, `pink`, `brown(n, rand)`; `class Biquad(type: "lowpass" | "highpass" | "bandpass" | "peaking" | "lowshelf" | "highshelf", sampleRate)` with `set(freq, q, gainDb?)` and `run(x)`; `filtered(signal, type, freq: number | ((t: number) => number), q, sampleRate, gainDb?)`; `env(n, sampleRate, attack, decay, hold?)`; `tone(n, sampleRate, freq: number | ((t) => number), shape)`; `pluck(n, sampleRate, freq, { damping, brightness, rand })` (Karplus-Strong); `modal(n, sampleRate, modes: { freq: number; decay: number; gain: number }[], rand)`; `grains(n, sampleRate, rand, { rate, length, band, gain })`; `mix`, `softClip`, `normalize`, `fade`, `widen(mono, sampleRate, rand): [Float32Array, Float32Array]`, `seamless(channels, sampleRate, crossfade)`; `impulseResponse(space: Space, sampleRate, seed): [Float32Array, Float32Array]`.

- [ ] Tests: `noise and envelopes are deterministic per seed`; `a lowpass keeps lows and removes highs`; `a plucked string sounds at its pitch` (autocorrelation peak within 2%); `impulse responses decay and differ between channels`.
- [ ] Implement; `npm test`.

### Task C2: The sound library

**Files:** Create `src/lib/audio/sounds.ts`. Test: `tests/sfx.test.mjs`.

**Produces:** `type SoundName` and `sounds: Record<SoundName, { seconds: number; variants: number; render(sampleRate: number, rand: () => number): Float32Array | [Float32Array, Float32Array] }>` covering:
- interface: `ui-tick ui-confirm ui-back reply costly sail countdown go victory defeat`
- movement: `step-stone step-grass jump land slide swish pass-by`
- rewards: `coin precise rescue blessing relic`
- harm: `hit hull-crack splash splash-big`
- Cyclops: `giant-step windup throw crash roar wool`
- Circe: `glass-tick clink plop fizz curse`
- Sirens: `siren-note lyre song-won song-lost`
- Scylla: `hiss strike clang oar`
- Ithaca: `bow-draw bow-release arrow thunk ting`
- sea and storm: `flap gust hop driftwood charge thunder`
- ambience one-shots and loops: `drip rumble bird creak distant-thunder cave-air torch sea wind rain whirlpool garden-air hall-air`

- [ ] Tests: `every sound renders finite audio within its length` (peak ≤ 1, RMS > 0.005, no NaN); `variants differ and renders repeat per seed`; `impacts are darker than chimes` (zero-crossing rate of `crash` < `coin`).
- [ ] Implement; `npm test`.
- [ ] Scratchpad check: render every sound to WAV and classify with `Xenova/ast-finetuned-audioset-10-10-0.4593`; rework any sound whose top labels contradict it (for example `roar` heard as "Beep").

### Task C3: Ambience scenes

**Files:** Create `src/lib/audio/ambience.ts`. Test: `tests/sfx.test.mjs`.

**Produces:** `type SceneName = "sea" | "cave" | "collapse" | "daylight" | "garden" | "gale" | "hall" | "strait" | "storm" | "calm"`; `scenes: Record<SceneName, { space: Space; loops: { sound: SoundName; gain: number; drive?: LoopName }[]; shots: { sound: SoundName; every: [number, number]; gain: [number, number]; pan: [number, number]; rate: [number, number] }[] }>`; `type LoopName = "giant" | "run" | "row" | "whirlpool" | "gust"`.

- [ ] Tests: `every scene uses known sounds` and `loop sounds join seamlessly` (sample jump at the wrap < 0.05).
- [ ] Implement; `npm test`.

### Task C4: From game state to sound

**Files:** Create `src/lib/audio/cues.ts`. Test: `tests/audio-cues.test.mjs`.

**Produces:** `type Cue = { sound: SoundName; pan?: number; gain?: number; rate?: number; delay?: number }`; `type AudioFrame = { cues: Cue[]; loops: Partial<Record<LoopName, number>>; scene: SceneName }`; `audioFrame(prev: GameState | null, next: GameState): AudioFrame`; `laneRate(lane: number): number` (C4 E4 G4 C5 relative to the recipe's C4).

Mapping, by engine:
- Cave runner: jump start → `jump`; `landedAt` change → `land`; slide start → `slide`; lane change → `swish` panned to the new lane; obstacle resolved in another lane → `pass-by` panned; precision up → `precise`; coin → `coin` (rate rises one semitone per combo step, max +7); sheep → `rescue`; hit → `hit`; Cyclops to `winding` → `windup` panned to the target lane; to `throwing` → `throw`; boulder resolved → `crash` panned; to `roaring` → `roar`; done → `victory`/`defeat`. Loops: `giant` = chase intensity (moved here from `ArcadeRound`), `run` = speed / 30 while grounded and not sliding. Scene: zone (`cave`/`collapse`/`daylight`).
- Cyclops grid: step/dash → `step-stone` (×2 for a dash), hide → `wool`, warning starts → `windup`, smash lands → `crash` (+ `hit` if struck). Scene `cave`.
- Circe: column → `glass-tick` panned; rotate → `clink`; drop → `plop`; own score up → `fizz` + `coin` (rate by chain); curses banked/sent → `curse`. Scene `hall`.
- Sirens: each listen-phase note → `siren-note` at the lane's rate; each entered reply note → `lyre` at the lane's rate; success up → `song-won`; misses up → `song-lost`. Scene `calm`.
- Scylla: telegraph start → `hiss` (pan .6); strike launched → `strike`; reflected → `clang` (+ `ting` on a perfect parry); hull hit → `hull-crack` + `splash`. Loops: `row` while rowing, `whirlpool` = pull / 16. Scene `strait`.
- Bow: aim or tension change → `bow-draw` (at most every 120 ms); a new shot → `bow-release`, `arrow`, then `thunk` after 350 ms and `ting` × rings at 45 ms steps; rival shots the same panned right. Scene `hall`.
- Lotus: move → `step-grass`; sailor picked up → `ui-confirm`; rescued → `rescue`; protection → `blessing`; relic → `relic`; detection (rival line turns to Pursuit/Intercept) → `costly`; hit → `hit`. Scene `garden`.
- Aeolus: lift → `flap`; blessing → `blessing`; perfect pass → `precise`; hit → `hull-crack`. Loop `gust` = |gust| / 32. Scene `gale`.
- Calypso: hop → `hop`; driftwood → `driftwood`; shore → `rescue`; fall → `splash-big`; lightning appears → `charge` panned; lightning lands → `thunder` panned. Scene `storm`.

- [ ] Tests (one per engine, built from the real engines' `new*`, action and tick functions): `the cave runner sounds its jumps, coins, boulders and hits`; `a lane change pans toward the new lane`; `the chase drives the giant's footfalls and the runner's own steps`; `potion moves, drops and matches each have a sound`; `the Sirens sing in the listen phase and the lyre answers in the reply phase`; `a parry clangs and a hull strike cracks`; `each arrow releases, flies, lands and rings`; `lotus, aeolus and calypso events have sounds`; `an unchanged state makes no sound`.
- [ ] Implement; `npm test`.

### Task C5: Rebuild the audio engine

**Files:** Modify `src/lib/audio/voyage-audio.ts`, `tests/audio.test.mjs` (mock gains `createConvolver`, `createDynamicsCompressor`, `createStereoPanner`, multi-channel `createBuffer`; cue assertions count buffer sources instead of oscillators).

**Produces (existing API kept):** `unlock`, `update(settings)`, `cue(AudioCue)` (legacy names map: send → `ui-confirm`, reply → `reply`, costly → `costly`, sail → `sail`, select → `ui-tick`), `setIntensity(level)` (sets loop `giant`), `dispose`; new: `frame(frame: AudioFrame)`, `play(cues: Cue[])`, `setScene(scene: SceneName)`, `prepare(names: SoundName[])` (renders during idle time). Graph: music bus (first gain) and effects bus (second gain) → master → compressor (−18 dB, 3:1) → limiter (−3 dB, 20:1) → destination; ambience bus (0.7 × effects, −6 dB while ducked); one convolver per scene space on a send. At most 4 instances per sound and 24 overall; each play varies pitch ±3% and gain ±1.5 dB unless `rate` is given.

- [ ] Tests: existing four tests still pass with updated mocks; new `effects stay within the polyphony limits`; `a scene change crossfades ambience and swaps the reverb`; `quiet or disabled audio plays no cues or ambience`.
- [ ] Implement; `npm test`.

### Task C6: Wire it into the game

**Files:** Modify `src/components/play/arcade-round.tsx` (replace `onFeedback`, `onNote`, `onIntensity` with `onAudio(frame: AudioFrame)`; emit `countdown` on each countdown second and `go` at the start), `src/ArcadeApp.tsx` (`onAudio={f => audio.current?.frame(f)}`; scene `sea` outside play; `victory`/`defeat` replace `sail`/`costly` at a round's end; `prepare` the encounter's sounds during the briefing).

- [ ] Verify in the browser (Chrome extension): open the game, enable sound, play the Cyclops run for 20 s and a Sirens round; console has no errors; instrumentation (temporary `console.debug` in `play`) shows the expected cue names; remove the instrumentation.
- [ ] `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run build:offline`.

### Task C7: Sound docs

- [ ] `docs/ART-CREDITS.md` "Music and sound" and README audio paragraph describe the new sound design (still original, rendered in code, no recordings).
