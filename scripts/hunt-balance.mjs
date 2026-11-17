// Balance check for the Lotus Hunt: the shipped ONNX policy plays Odysseus, scripted bots play you.
//
//   node --experimental-strip-types scripts/hunt-balance.mjs [gamesPerGarden=3] [easy,normal,hard]
//
// Six gardens (classic, showcase and four generated ones) per difficulty, for each bot:
//   idle    never touches the keys (he should always win: camping cannot win)
//   chase   drives hunter 1 straight at him
//   human   a person at the keyboard, roughly: re-plans every 200 ms, chases when within six
//           steps and otherwise heads for his goal, and swaps to a hunter at most every 1.5 s
//           when that one is three or more steps closer
//   human+3 the same, with the third hunter summoned at the start (his leap live all hunt)
// The bots know every path distance, so a real player usually does worse than `human`.
// Rule values live in HUNT (src/lib/encounters/lotus-hunt.ts); edit them there and rerun.
import { readFileSync } from "node:fs";
import * as ort from "onnxruntime-web";
import { HUNT, newHunt, huntTick, huntAwaitingDecision, pickAction, canStepTo, possess, toggleThird } from "../src/lib/encounters/lotus-hunt.ts";
import { observe, cell, TICK_MS } from "../src/lib/ai/lotus-agent.ts";
import { LOTUS_CLASSIC, LOTUS_SHOWCASE, generateLotusLayout, pathDistances, seededRandom } from "../src/lib/encounters/lotus-layouts.ts";
import { standardPlan } from "../src/lib/arcade/arcade.ts";

const per = Number(process.argv[2] ?? 3);
const difficulties = (process.argv[3] ?? "easy,normal,hard").split(",");
const root = new URL("../", import.meta.url);
const meta = JSON.parse(readFileSync(new URL("public/models/lotus/lotus-policy.json", root), "utf8"));
ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(new Uint8Array(readFileSync(new URL("public/models/lotus/lotus-policy.onnx", root))), { executionProviders: ["wasm"] });
const logits = async board => (await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", observe(board, meta.obsVersion), [1, meta.obsSize]) }))[session.outputNames[0]].data;

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
/** One step for the possessed hunter toward `target` by path, inside the rules. */
function stepToward(h, target) {
  const me = h.board.guardians[h.possessed], d = pathDistances(h.layout.maze, target);
  let best = null, bestD = d[cell(me)] < 0 ? 999 : d[cell(me)];
  for (const [dx, dy] of DIRS) {
    const q = { x: me.x + dx, y: me.y + dy }, v = d[cell(q)];
    if (canStepTo(h, q) && v >= 0 && v < bestD) { bestD = v; best = { dx, dy }; }
  }
  return best;
}
/** His goal: the ship while escorting, else the nearest waiting sailor. */
const goalOf = b => (b.carrying || !b.sailors.length ? b.layout.ship : b.sailors.reduce((a, s) => (man(s, b.player) < man(a, b.player) ? s : a)));
/** Re-plans every `react` ms and holds the last direction in between, as a held key does. */
function driver(react, plan) {
  let last = null, at = -1e9;
  return h => { if ((h.tick - at) * TICK_MS >= react) { last = plan(h); at = h.tick; } return last; };
}
const BOTS = {
  idle: () => () => null,
  chase: () => driver(200, h => stepToward(h, h.board.player)),
  human: () => {
    let swapped = -1e9;
    return driver(200, h => {
      const b = h.board, d = pathDistances(h.layout.maze, b.player), dist = g => (d[cell(g)] < 0 ? 999 : d[cell(g)]);
      const near = b.guardians.reduce((best, g, i) => (dist(g) < dist(b.guardians[best]) ? i : best), h.possessed);
      if ((h.tick - swapped) * TICK_MS >= 1500 && dist(b.guardians[near]) + 3 <= dist(b.guardians[h.possessed])) { possess(h, near); swapped = h.tick; }
      return dist(b.guardians[h.possessed]) > 6 ? stepToward(h, goalOf(b)) : stepToward(h, b.player);
    });
  },
};

async function play(layout, difficulty, bot, third, seed) {
  const random = seededRandom(seed), h = newHunt(layout, difficulty, standardPlan("lotus"), seed), drive = BOTS[bot]();
  if (third) toggleThird(h);
  while (!h.result) huntTick(h, drive(h), huntAwaitingDecision(h) ? pickAction(await logits(h.board), random) : null);
  return h.result;
}

const gardens = [LOTUS_CLASSIC, LOTUS_SHOWCASE, ...Array.from({ length: 4 }, (_, i) => generateLotusLayout(2_000_000 + 37 * i))];
const rows = [];
for (const difficulty of difficulties) {
  for (const [bot, third] of [["idle", false], ["chase", false], ["human", false], ["human", true]]) {
    const t = { hunters: 0, odysseus: 0, draw: 0, catches: 0, rescued: 0, leaps: 0, sprints: 0, ms: 0, n: 0 };
    for (const g of gardens) for (let k = 0; k < per; k++) {
      const r = await play(g, difficulty, bot, third, 100 + k);
      t[r.winner]++; t.n++;
      for (const key of ["catches", "rescued", "leaps", "sprints", "ms"]) t[key] += r[key];
    }
    const avg = (v, d = 1) => (v / t.n).toFixed(d);
    rows.push({ difficulty, you: bot + (third ? "+3" : ""), "you win": `${t.hunters}/${t.n}`, "he wins": t.odysseus, draws: t.draw, catches: avg(t.catches), [`aboard/${HUNT.crew}`]: avg(t.rescued), sprints: avg(t.sprints), leaps: avg(t.leaps), seconds: avg(t.ms / 1000) });
    console.error(`${difficulty} ${bot}${third ? "+3" : ""} done`);
  }
}
console.log(`Lotus Hunt balance · ${meta.label} · hunter step ${JSON.stringify(HUNT.stepMs)} ms · crew ${HUNT.crew}`);
console.table(rows);
