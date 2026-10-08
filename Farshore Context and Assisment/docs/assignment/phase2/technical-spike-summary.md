# Farshore AI technical spike

**September 30, 2026. Llama 3.2 3B, Q4_K_M, Ollama 0.21.0, local CPU.** Intel Core Ultra 5 125H, 15.68 GiB system memory, 2.12 GiB free at the start. Model catalog showed no loaded model before S1. Temperature 0.2, 450 output-token cap, strict JSON schema.

**Method:** six sequential realistic inputs through the existing adapter from a standalone script. Capture exact provider outputs and validated game results. Wall-clock timing includes first model loading, request, parsing and validation. No repeated trials or concurrency benchmark.

**Latency:** min 8.87 s, average 26.36 s, max 38.43 s. Individual times: S1 38.43 s, S2 28.95 s, S3 8.87 s, S4 25.43 s, S5 29.38 s, S6 27.14 s. Failure timings excluded.

**Output quality:** six structurally valid replies. Fresh reply actions match safeChoice. S4 and S5 take the requested action but return followed=false. S6 receives no clear action but returns followed=true. This is an analytic review of six cases, not a general accuracy estimate. The archived September 23 action/score contradiction remains relevant.

**Failures:** malformed model JSON returned HTTP 400 with unexpected EOF. A missing model returned HTTP 404 with its name not found. A deliberate 1 ms client deadline raised TimeoutError with no model response received. Invalid one-character player input returned app HTTP 400 before provider contact. Exact bodies are in evidence/spike-2026-09-30.json.

**Limits/cost:** no 429 in this local sequential run and no quota/concurrency threshold measured. The adapter handles 429. No billed inference API was used. Hardware/electricity, browser speech service and future cloud costs are unmeasured.

**Design decisions:** show elapsed time and offer cancellation after long waits; retain counsel on failure and provide explicit Story mode fallback; hold uncertain candidates for action/rationale review before score commitment. Never invent a confidence percentage. Keep Llama provisionally for the prototype, evaluate decision flags and compare alternatives if they remain unsuitable. These controls are Phase 2 proposals, not already implemented behavior.

**Sources:** raw evidence and analytic review in evidence/; server/turn.ts; docs.ollama.com/api/openai-compatibility and docs.ollama.com/capabilities/structured-outputs (accessed September 30).
