# Arcade opponent preparation: technical spike

October 8, 2026. Local Llama 3.2 3B through the existing Ollama connection. Six sequential calls per experiment, strict JSON-schema output, temperature 0, and a 100-token output cap. Timings include requests, parsing, and validation. This is a small feasibility experiment, not a general accuracy benchmark or user study.

The current model selects one of two AI-only policies per encounter. The server computes the habit focus, constrains the schema to that one value, rejects mismatches, and supplies authored descriptions. The model cannot award progress or change difficulty. Arcade simulation runs locally after preparation, with no model call during a round. Lane hunting is an authored local policy that reacts during play and locks attacks at the visible warning.

## Challenge revision and final experiment

The player's feedback was that standard and AI felt equally easy. The revision added harder authored difficulties and separate AI policy catalogs: lane hunting/crossfire, changing/reversing rowing beats, and reversing/variable-speed bow sights. An initial challenge experiment returned six legal policies but still produced wrong timing focus. Legality alone did not ensure adaptation. The final schema restricts focus to the server-derived habit and the prompt describes only the current encounter. A mismatched reply now becomes an explicit unsupported-strategy error.

| Final input | Seconds | Selected policy | Required and returned focus |
| --- | ---: | --- | --- |
| First-time easy Cyclops | 7.863 | focused | center |
| Left-lane habit | 5.732 | focused | left |
| Right-lane habit | 6.401 | focused | right |
| Early rowing | 6.992 | swell | early |
| Late bow release | 6.621 | feint | late |
| Repeated rowing losses | 7.299 | swell | balanced |

Minimum 5.732 s; average 6.818 s; maximum 7.863 s. All six replies satisfied the current policy and focus constraints. The no-history Cyclops chose focused despite a prompt preference for sweep; policy preference remains advisory. These measurements do not establish a general accuracy rate or prove that AI improves enjoyment. Difficulty and strategy still need human evaluation.

The final record is [spike-challenge-focus-2026-10-08.json](evidence/spike-challenge-focus-2026-10-08.json). The preceding challenge record is [spike-challenge-2026-10-08.json](evidence/spike-challenge-2026-10-08.json). Both retain six exact inputs, responses, latency and the same three real failure probes below. Earlier experiments remain historical evidence.

## Earlier implementation experiment

| Refined input | Seconds | Selected strategy | Focus |
| --- | ---: | --- | --- |
| First-time easy Cyclops | 8.058 | alternating | center |
| Left-lane habit | 2.741 | alternating | left |
| Right-lane habit | 2.606 | alternating | right |
| Early rowing | 8.959 | steady | balanced |
| Late bow release | 9.352 | surge | balanced |
| Repeated rowing losses | 10.718 | steady | early |

Minimum 2.606 s; average 7.072 s; maximum 10.718 s. Six of six results selected legal parameters. The first run averaged 8.000 s and did not respond correctly to the right-lane example. The revised prompt provides server-derived observations rather than requiring the small model to interpret numeric arrays. Both lane-biased examples then returned the corresponding lane.

Tactical quality is not established by schema validity. Timing focus did not consistently match the supplied tendency, and the repeated-loss example returned an unexpected early focus. These results are still legal and cannot narrow the timing window. Compare models and test player experience before claiming consistently useful adaptation. The UI exposes the selected strategy before play and allows regeneration, rejection through standard play, and a change of pace.

Failures recorded: unsupported application difficulty returned HTTP 400 before provider contact; a deliberately nonexistent model returned provider HTTP 404; malformed provider JSON returned HTTP 400 with unexpected EOF. Exact outputs are in the evidence files. Cancellation, timeout, malformed model results, extra fields, rate limits, and late replies also have automated tests; these mocked tests are distinct from the live experiment.

Design implications: show elapsed preparation time and cancellation; let users practice or choose standard play; retain progress on failure; never spend gameplay time waiting for AI. Keep legal plan IDs, collision rules, warnings, timing windows, and completion under authored code. All five AI states exist in the briefing: initial, loading, prepared, unsupported/uncertain, and error.

Limits and costs: this experiment used the local model and incurred no billed inference API charge. No concurrency or quota threshold was measured, and no provider 429 was triggered. Hardware, electricity, and possible future hosted costs remain unmeasured. The app handles 429 explicitly. Llama remains provisional; this task-specific experiment does not replace the assignment's comparison of at least five pretrained candidates.

Reproduce with a fresh output filename to retain evidence:

```powershell
node --experimental-strip-types scripts/arcade-spike.mjs http://localhost:5173 .tmp/arcade-spike-new.json
```

The script makes six real preparation calls plus three failure checks. It does not change browser saves or `.env` and refuses to overwrite its output file.

Evidence: [initial experiment](evidence/spike-initial-2026-10-08.json), [refined experiment](evidence/spike-2026-10-08.json). Format integration reference: [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs).
