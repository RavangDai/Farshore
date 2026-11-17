# The Lotus Hunt: you play the guardians, the trained Odysseus plays the garden

Date: 2026-11-17. Status: approved in conversation ("just do the better one"); the user's own words are marked, everything else is the builder's call.

## Intent

The Rescue Race puts the human and the trained PPO Odysseus on two separate boards; they never touch. The user wants the opposite ("my vision for the maze game"): **the trained Odysseus plays the garden and the human plays the villain**, driving the lotus guardians to catch him. Odysseus must be a strong opponent and have "some special magical power" so the hunt stays intense.

The user's rule for the magic: **the third hunter is the price of his power.** "If I drop a 3rd hunter then he can use one of his powers to leap, until I have 3 hunters. If I remove the 3rd, he cannot use the power."

Why it matters: the project's AI story for class is a trained agent you can actually play against. Hunting him makes the policy's behaviour visible and personal in a way the side-by-side race does not.

## Goals

- A new exhibition mode, **The Lotus Hunt**, beside the Rescue Race on the Lotus-Eaters briefing. Not saved, no medals, like the race.
- The shipped ONNX policy plays Odysseus unchanged (no retraining).
- One keyboard drives two or three hunters: possess one at a time, swap with Tab.
- The third hunter can be summoned and dismissed mid-hunt; while it is out, Odysseus can leap a hedge.
- A results screen that says who won and how (sailors, catches, leaps, how long the third hunter was out).

## Non-goals

- Retraining the policy, a new action space, or a new observation version.
- Replacing or changing the Rescue Race, solo play, training or evaluation behaviour.
- Commentary or the language model: like the race, the hunt needs no model server.
- A second magic power. The user said "1-2"; one ships now, the hook stays open.

## Anti-goals

- A villain who wins by camping. Standing still must never be the best play.
- A leap that fires when the player cannot see why. It must be legible: a visible trigger, a visible cooldown.
- Odysseus walking blindly into a hunter the model cannot see. The design works around the model's two-guardian view rather than pretending it does not exist.

## Constraints found in the code

- `observe()` gives the policy full detail on **two** guardians (slots 55-64, 175-178). Any further guardian appears only in the 7x7 local view, the nearest-guardian distances, and the safe-route features (`guarded()` covers all guardians). So a third hunter is half-seen: the model knows a threat is near but not where it is heading. That is the fair trade for the leap.
- The policy's actions are up/down/left/right/wait. There is no jump. The leap is therefore a **game rule** the hunt applies at Odysseus's decision time, not a choice the model makes.
- Odysseus steps every 170 ms. Scripted guardians step every 1050/780/600 ms by difficulty. A human-driven hunter needs its own, faster step.
- The browser policy takes the arg-max logit, so it is deterministic: a human would learn one trap. The hunt breaks ties with a little randomness; the race stays deterministic for parity with the evaluation.
- `lotusTickInPlace` moves every guardian in `s.guardians` on the guard clock. It needs a way to leave the possessed hunter alone, without changing the race or the training server.

## Approaches considered

**Controls (one keyboard, two or three hunters)**

1. **Possess one, swap with Tab** (chosen). The other hunters keep the game's scripted patrol and pursuit. Feels like being the villain; the game's own AI covers the other bodies; scales to a summoned third.
2. Both at once, WASD and arrows. Most intense but hard for one pair of hands and does not scale to three.
3. Give orders by clicking tiles. Strategic, touch friendly, but less "I am the villain" and a bigger UI.

**The leap**

1. **A game rule** (chosen): when the leap is live and Odysseus is cornered, the game hops him over one hedge. Ships with the current model.
2. A sixth action learned by retraining with a new observation version. About an hour of training, export and parity checks, and a new model to evaluate. Left for later if the rule version is not enough.

**What the clock does**

1. **Both sides race to three** (chosen): first to three sailors or three catches wins; if the clock runs out, more progress wins, equal is a draw. A camping villain scores nothing, so camping cannot win.
2. Time out = villain wins. Rejected: camping the ship would be the dominant strategy.

## The rules

**The garden.** One board, any of the race gardens (classic, showcase, or a fresh generated one). Odysseus, three sailors, moly, relics, and the garden's two guardians as today.

**Odysseus.** The shipped PPO policy, one decision per movement opportunity (every 17 ticks of 10 ms), exactly as the race asks it. Ties are broken softly: actions whose softmax probability is at least 35% of the best share the draw, weighted by probability. Moly protection (14 s) and invulnerability after a catch (1.8 s) work as today.

**Hunters.** The human possesses one hunter at a time (hunter 1 at the start). Tab or Q cycles; 1, 2, 3 select directly. Arrows or WASD step the possessed hunter one tile; it cannot enter hedges or the ship's lantern light (the ship tile and its four neighbours). Hunters may share a tile. The unpossessed hunters run the game's scripted patrol and pursuit on the board's guard clock.

**Catching.** A hunter on Odysseus's tile catches him unless moly or invulnerability protects him: the game's `damage` path. He drops any sailor where he stands and returns to the ship. Three catches and the hunters win.

**The third hunter.** Space summons it. It rises after 3 s at the patrol point farthest by path from Odysseus (not within three tiles of him, not in the lantern light, not on another hunter), shown as a lotus bloom at that tile while it is on its way; if Odysseus is on or beside the tile when the time is up, it waits until he leaves. It arrives unpossessed. Space again dismisses it: it fades over 3 s and leaves. If the player was possessing it, possession returns to hunter 1 when it goes. It can be summoned again straight away.

**The leap (the magic).** Live from the moment the third hunter has risen until it has fully gone (so dismissing it at the last second does not strip the leap mid-corner). At each of Odysseus's decision opportunities, before the model's move is applied, the game checks: leap live, cooldown over, cornered, and a landing exists. Cornered means no safe route to his current goal (`safeDistances` is -1 on his tile) and a hunter within two tiles by Manhattan distance. A landing is a tile two steps away in a straight line whose middle tile is a hedge and whose far tile is open and not under a hunter; the best landing is one not beside any hunter, then the one farthest from the hunters, then the one closest to his goal. He jumps there, the sailor he is escorting follows, the cooldown starts, and the model's move for that opportunity is discarded. Cooldown by difficulty below. A leap is shown as an arc with a sound and named in the live strip.

**Difficulty** (the villain's difficulty: Easy is easiest for the human).

| | Possessed hunter steps every | Scripted hunters | Leap cooldown |
|---|---|---|---|
| Easy | 190 ms | the board's Hard rules: 600 ms, interception | 12 s |
| Medium | 220 ms | the board's Medium rules: 780 ms, A* pursuit | 10 s |
| Hard | 250 ms | the board's Easy rules: 1050 ms, patrol only | 7 s |

The clock is 120 s at every difficulty. The guardian plan (patrol, pincer, undertow) comes from the briefing as it does for the race.

**Winning.** Odysseus wins at three sailors aboard. The hunters win at three catches. When the clock runs out, more progress (sailors aboard against catches) wins; equal is a draw.

## The screen

Single board, large, in the 16:9 stage. The race's scoreboard and live strip styles are reused.

```
 YOU · HUNTERS  [1*] [2] [3: Space to summon]      1:32.4            ODYSSEUS · TRAINED AI
                                           The lotus garden · Medium    crew ooo  lives vvv   Leap: sealed
 +------------------------------------------------------------------------------------------+
 |                               the garden, hunters, Odysseus                              |
 |          possessed hunter has a gold ring and a YOU tag; a summoned-but-not-yet-risen     |
 |          hunter is a pulsing bloom; a leaving one dissolves in lotus mist; a live leap    |
 |          is a faint aura on Odysseus; a leap draws an arc for half a second               |
 +------------------------------------------------------------------------------------------+
 AI LIVE  RIGHT · Escorting sailor · Crew aboard 1/3 · 312 moves · 2 ms        Arrows move · Tab swap · Space third
```

Veil phases as in the race: loading the model, error with retry, 3-2-1 countdown, paused (Esc, blur, hidden tab), done. The results panel: headline (You caught Odysseus / Odysseus escaped with the crew / a timeout outcome), a table of sailors aboard, catches, leaps, time, and how long the third hunter was out, then Hunt again / New garden / Briefing.

Touch: the race's arrow pad plus two buttons, Swap and Third.

**Entry.** On the Lotus-Eaters briefing, under the Rescue Race block, a second button "Hunt the trained AI" with the small print "You play the guardians · not saved", sharing the garden selector.

## Code shape (the builder's calls)

- `src/lib/encounters/odyssey-games.ts`: `lotusTickInPlace(s, dt, held?: ReadonlySet<number>)` leaves held guardian indices where they are and keeps their last-step direction; export `lotusCheckInPlace` (today's private `checkLotus`) so a hunter's step can register a catch. No behaviour change when `held` is absent.
- `src/lib/ai/lotus-agent.ts`: export `safeDistances` and `cell`.
- `src/lib/encounters/lotus-hunt.ts` (new, pure, tested): the hunt state, `newHunt`, `huntTick`, `possess`, `cycleHunter`, `toggleThird`, `leapLive`, `pickAction`, `describeHunt`, and the rule constants in one place.
- `src/components/play/lotus-hunt.tsx` (new): the screen, modelled on `lotus-race.tsx` (same clock loop, same model wait, same veil).
- `src/styles/farshore-hunt.css` (new): the hunt's additions on top of the race styles.
- `src/ArcadeApp.tsx`: `Run.hunt`, `launchHunt`, the briefing button, mounting the round.
- `tests/lotus-hunt.test.mjs` (new): rules, leap trigger and landing, third-hunter timing and leap liveness, standings, tie-break sampling, and that the race and training paths are unchanged.
- `docs/GAMEPLAY_DESIGN.md`: a short section on the hunt.

## Left to the builder

Exact colours and the arc animation; the wording of result lines; whether the on-screen bloom pulses; how the HUD phrases the leap state. Tuning of step times and cooldowns after real play belongs to the user.
