# Mystery case verification

This is technical verification of the first playable case, not participant research or a general model benchmark.

## October 6 completion checks

- All 59 automated tests passed. They cover the complete authored case, partial endings, prerequisites, incorrect answers, inventory and clue duplication, supported deductions, optional motive, character knowledge, completed-case hints, save round trips, model output restrictions, provider errors, and cancellation. Original voyage regressions remain in the suite.
- The TypeScript check and Vite production build passed.
- The dev server serves the default mystery and /api/mystery at http://localhost:5173.
- No browser is connected to the October 6 or 7 sessions. The latest objective panel, elapsed-wait display, and phone hotspot spacing therefore have no fresh browser verification. Phone hotspot centers were separated vertically to avoid neighboring 44-pixel controls overlapping.

## October 1 interactive checks

The earlier browser session used Brave at its normal desktop viewport and at 390 × 844. The following were actually exercised in that session:

- Title screen, room navigation, object inspection, inventory collection, all three mechanisms, optional drawer message, and the evidence-backed deduction.
- Incorrect event order and incorrect accusation produced recoverable feedback without removing progress. Escape and motive alone showed two stars; confirming the supported theory showed three.
- Eurylochus denied touching the seal before proof. His confession topic became available after the supported deduction.
- Phone-sized gate controls completed the escape. The journal and theory dialogs remained usable. Escape dismissed a dialog through the keyboard.
- A real custom AI question to Eurylochus returned the appropriate permitted answer about his fear for the crew, labeled “AI matched question · authored answer.”
- Cancelling a second AI question kept its text and preserved the previous answer. Reloading retained the room, nine journal entries, cord, restored seal, all three stars, and the cancelled per-character draft.

These were agent-operated interface checks. They do not establish that newcomers understand the mystery without help. Full keyboard-only completion, assistive-technology checks, real touch hardware, and microphone testing remain unverified.

## Live model evidence

The initial October 1 check selected the expected answer for the gate and repair questions but matched an instruction to invent a key to an existing repair answer. It generated no new item or stars. The matching prompt was tightened with unrelated-topic and instruction-override examples.

The retained [October 1 revised run](mystery-evidence/live-ai-2026-10-01.json) passed three requests, taking 14.539, 2.137, and 1.869 seconds. The [October 5 run](mystery-evidence/live-ai-2026-10-05.json) passed the same requests, taking 20.093, 1.850, and 1.920 seconds. The attempted override returned unmatched in both revised runs.

The server checks reply IDs against the character's available authored answers. The browser uses the corresponding authored text and clue. This bounds case facts even when question matching chooses an unintended topic. Suggested questions provide an explicit, immediate alternative.

The [October 6 production-preview check](mystery-evidence/live-ai-2026-10-06-preview.json) passed all three requests with times of 13.114, 1.481, and 1.533 seconds. The dev and preview APIs both confirmed availability of the configured model. The local Ollama service and dev server were restarted for this check.

The final build passed again on October 7 after the phone hotspot spacing change. Vite's Windows helper was blocked in the sandbox; the same build succeeded with the approved command outside the sandbox.

## UI adjustments found during the first playthrough

| Before | After | Why |
| --- | --- | --- |
| Puzzle feedback could fall beneath the scene | Feedback also appears beside the puzzle controls | Players can see the result where they acted |
| Phone toolbar text was hidden without a retained name | Journal and Settings have explicit accessible names | Icon controls remain identifiable |
| Scene interaction could leave the phone's examination panel below the viewport | Selecting an object moves focus to its panel; Back to room returns to the room heading | The result and return path are easier to find |
| Successful actions removed focused controls | Focus moves to the relevant heading | Keyboard users keep a useful position |
| Dialog overlays could briefly intercept the next action | Mystery overlays close without a fade animation | Room controls respond as soon as the dialog closes |

## Reproduce

Run npm.cmd test and npm.cmd run build. With the model and dev server running, use:

    node --experimental-strip-types scripts/verify-mystery.mjs http://localhost:5173 .tmp/mystery-live-ai-new.json

Use a fresh filename to retain previous results. The smoke script does not change browser saves. Additional cases, generated reactions, dedicated mystery dictation, newcomer findings, and the revised Phase 2 package remain pending.
