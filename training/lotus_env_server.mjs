// The Lotus-Eaters training environment, served to Python.
//
// Run by training/lotus_rl/node_vec_env.py as
//   node --experimental-strip-types --no-warnings training/lotus_env_server.mjs
// It hosts a batch of independent gardens and speaks one JSON object per line
// on stdin and stdout. Observations and rewards travel as base64 float32
// buffers. The rules, the observation and the reward are the game's own
// TypeScript (src/lib/encounters, src/lib/ai/lotus-agent.ts), so the policy
// trains on exactly the game the browser runs.
//
// Commands:
//   {"cmd":"init","n":16,"mode":"train","seed":1}
//   {"cmd":"init","n":16,"mode":"eval","scenarios":[{"layout":"eval:3","difficulty":"hard","plan":"undertow"}, ...]}
//   {"cmd":"reset"}                  -> {"obs"}
//   {"cmd":"step","actions":[...]}   -> {"obs","rew","done","idle","episodes"}
//   {"cmd":"astar"}                  -> {"actions"}   the A* baseline's choices
//   {"cmd":"close"}

import readline from "node:readline";

const src = new URL("../src/", import.meta.url).href;
const { newAdventure, LOTUS_CLASSIC } = await import(src + "lib/encounters/odyssey-games.ts");
const { generateLotusLayout, trainingLayout, seededRandom, EVAL_SEED_START, LOTUS_SHOWCASE } = await import(src + "lib/encounters/lotus-layouts.ts");
const agent = await import(src + "lib/ai/lotus-agent.ts");
const { standardPlan } = await import(src + "lib/arcade/arcade.ts");

/** Validation gardens (for choosing checkpoints) sit apart from the test gardens. */
export const VALIDATION_OFFSET = 500_000;
const PLANS = {
  standard: standardPlan("lotus"),
  pincer: { planId: "pincer", focus: "balanced", source: "ai" },
  undertow: { planId: "undertow", focus: "balanced", source: "ai" },
};
const TRAIN_DIFFICULTIES = [["easy", 0.2], ["normal", 0.3], ["hard", 0.5]];

function layoutFor(name) {
  if (name === "classic") return LOTUS_CLASSIC;
  if (name === "showcase") return LOTUS_SHOWCASE;
  const [kind, n] = name.split(":");
  if (kind === "eval") return generateLotusLayout(EVAL_SEED_START + Number(n));
  if (kind === "val") return generateLotusLayout(EVAL_SEED_START + VALIDATION_OFFSET + Number(n));
  if (kind === "seed") return generateLotusLayout(Number(n));
  throw new Error(`Unknown garden ${name}`);
}

let envs = [], mode = "train", random = Math.random, queue = [], obsSize = agent.OBS_SIZE;

function sampleScenario() {
  let r = random(), difficulty = "hard";
  for (const [d, w] of TRAIN_DIFFICULTIES) { if (r < w) { difficulty = d; break; } r -= w; }
  const plan = ["standard", "pincer", "undertow"][Math.floor(random() * 3)];
  const layout = trainingLayout(random);
  return { layout: layout.id, layoutObject: layout, difficulty, plan };
}

function start(env) {
  const scenario = mode === "train" ? sampleScenario() : queue.shift();
  if (!scenario) { env.state = null; env.scenario = null; return; }
  const layout = scenario.layoutObject ?? layoutFor(scenario.layout);
  env.scenario = { layout: scenario.layout, difficulty: scenario.difficulty, plan: scenario.plan, index: scenario.index };
  env.state = newAdventure("lotus", scenario.difficulty, PLANS[scenario.plan], false, 4200, { layout });
  env.steps = 0;
}

function observations() {
  const out = new Float32Array(envs.length * obsSize);
  envs.forEach((env, i) => { if (env.state) out.set(agent.observe(env.state), i * obsSize); });
  return Buffer.from(out.buffer).toString("base64");
}

function step(actions) {
  const rew = new Float32Array(envs.length), done = [], idle = [], episodes = [];
  envs.forEach((env, i) => {
    if (!env.state) { done.push(0); idle.push(1); return; }
    idle.push(0);
    const s = env.state, before = agent.snapshot(s);
    agent.agentStep(s, actions[i]);
    env.steps++;
    rew[i] = agent.stepReward(before, s);
    if (s.done) {
      episodes.push({ env: i, ...env.scenario, won: s.won, rescued: s.rescued, hits: s.damageTaken, ms: s.elapsed, finishMs: s.won ? s.elapsed : null, steps: env.steps, relics: s.relicsFound });
      done.push(1);
      start(env);
    } else done.push(0);
  });
  return { obs: observations(), rew: Buffer.from(rew.buffer).toString("base64"), done, idle, episodes };
}

function handle(message) {
  switch (message.cmd) {
    case "init": {
      mode = message.mode ?? "train";
      random = seededRandom(message.seed ?? 1);
      queue = (message.scenarios ?? []).map((s, index) => ({ index, ...s }));
      envs = Array.from({ length: message.n }, () => ({ state: null }));
      return { ok: true, obsSize, actions: agent.ACTIONS.length, obsVersion: agent.OBS_VERSION };
    }
    case "reset":
      envs.forEach(start);
      return { obs: observations(), idle: envs.map(e => (e.state ? 0 : 1)) };
    case "step":
      return step(message.actions);
    case "astar":
      return { actions: envs.map(e => (e.state ? agent.astarAction(e.state) : agent.WAIT)) };
    case "close":
      process.exit(0);
    default:
      throw new Error(`Unknown command ${message.cmd}`);
  }
}

const lines = readline.createInterface({ input: process.stdin });
lines.on("line", line => {
  let reply;
  try { reply = handle(JSON.parse(line)); }
  catch (error) { reply = { error: String(error?.stack ?? error) }; }
  process.stdout.write(JSON.stringify(reply) + "\n");
});
lines.on("close", () => process.exit(0));
