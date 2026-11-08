# Integrating the Cyclops interface improvements

`Cyclops-UI-Improvements.html` is a standalone interface implementation. It has no connection to Farshore's game state, model service or saved progress. Its right-lane forecast, 41% value and observed left lane come from the supplied screenshot and are display fixtures.

## Implemented display behavior

| Finding | Prototype change | Integration requirement |
| --- | --- | --- |
| B1: Dense explanation during play | Action, target and a short reason appear first; algorithm detail is optional | Bind these fields to the current opponent decision and keep expanded detail out of the default play view |
| B2: Predictions feel like guesses | Forecast percentage is labeled as a prediction; the observed result is shown separately | Use the actual prediction horizon, confidence meaning and matching observed event; never substitute the 41% fixture |
| B3: Opponent plan is slow to locate | One Opponent plan heading and compact lane cues | Place the panel consistently in the briefing and runner; use current game lane data |
| B4/X1: Recovery hesitation and conflicting labels | Explicit retry, previous strategy and state-matched start labels | Drive panel, retry and start availability from one request state |

## Suggested state mapping

Keep the project's single AI-service module. Map its existing empty, pending, accepted, rejected and error responses to the five display states. Preserve all schema checks and game-owned rules. The model chooses a strategy; it must not change the game rules.

- Empty: offer preparation and disable start.
- Loading: show pending status, permit cancellation and offer an existing valid strategy when available.
- Success: show the accepted plan and enable start.
- Low confidence/rejected: explain that the plan was not applied, permit regeneration and retain a valid previous plan when available.
- Error: state that preparation failed, offer retry and a valid previous strategy; ensure the disabled start label describes the same failure.

The HTML demo's retry control changes a local display state. In the real game it must call the existing service and handle its actual result. Cancelling must abort or invalidate the pending request so a late response cannot overwrite the user's selected plan. Only show previous-plan recovery when a valid previous plan exists.

## Verify after integration

Check each state through the existing mock service, including a delayed response followed by cancel. Verify keyboard navigation, visible focus, phone layout and that lane cues never cover hazards. Confirm saved progress is unchanged by preparation failure. Capture genuine before/after screenshots and record the tested build identifier.

Repeat the documented Cyclops tasks with participants. Record independent versus assisted outcomes, time boundaries, ease responses and the same SUS/trust questions. Keep post-change results separate from the five baseline records; there is no post-change study in this package.
