# Arcade opponent preparation: technical spike

October 8, 2026. Local Llama 3.2 3B through the existing Ollama connection. Six sequential calls per experiment, strict JSON-schema output, temperature 0, and a 100-token output cap. Timings include requests, parsing, and validation. This is a small feasibility experiment, not a general accuracy benchmark or user study.

The model selects a permitted strategy and focus. The server validates them and supplies authored descriptions; it cannot award progress or change difficulty. Arcade simulation runs locally after preparation, with no model call during a round.

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
