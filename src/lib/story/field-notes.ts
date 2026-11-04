import { isAdventure, isCave, type GameState } from "../arcade/arcade-runtime.ts";
import { AVOIDANCE, caveProgress } from "../encounters/cave-runner.ts";
import { BOW, arrowTime, draughtAllowance, strikeZ } from "../encounters/mythic.ts";
import type { TrialId } from "../arcade/arcade.ts";

export const fieldNotes: Record<TrialId, { region: string; bonus: string; lesson: string; keys: string[] }> = {
  lotus: { region: "THE FORGETFUL SHORE", bonus: "Find three laurel relics · +125 each", lesson: "Lead one sailor at a time. Moly protects you for 14 seconds. Easy mode marks the way back to the ship.", keys: ["WASD", "ARROWS"] },
  cyclops: { region: "BENEATH MOUNT AETNA", bonus: "Timed jumps and slides · +200 each", lesson: "Read the prompt above each hazard: JUMP, SLIDE, or DODGE. A red lane means a boulder is already locked there — leave it. Sheep restore a life.", keys: ["A / D", "W / SPACE", "S"] },
  aeolus: { region: "THE KEEPER OF WINDS", bonus: "Collect a blessing without clipping the gate", lesson: "Short taps maintain altitude. Center the opening for a perfect passage. Green amphorae repair the hull.", keys: ["SPACE", "W / ↑"] },
  circe: { region: "THE ENCHANTED ISLE OF AEAEA", bonus: "Build chain reactions to send curses", lesson: "Match three. Moly purifies adjacent swine. The faint piece shows exactly where your stack will land.", keys: ["A / D", "W", "SPACE"] },
  sirens: { region: "THE SINGING ROCKS", bonus: "Echo five melodies with no missed notes", lesson: "Listen first, then repeat the sequence. Skip rests. The numbered strings keep every cue visible without sound.", keys: ["A", "S", "D", "F"] },
  scylla: { region: "THE STRAIT OF TWO TERRORS", bonus: "Center a parry · +200 and a rowing boost", lesson: "Gold lines reveal the next attack. Catch a strike at the shield's center for a perfect parry. Keep rowing away from Charybdis.", keys: ["↑ / ↓", "SPACE", "DRAG"] },
  calypso: { region: "THE STORM BEYOND OGYGIA", bonus: "Three driftwood pieces repair one life at shore", lesson: "Hop toward the bright driftwood bundles. Each current offers one bundle per crossing. Red marks warn of a locked lightning strike.", keys: ["WASD", "SPACE"] },
  bow: { region: "THE GREAT HALL OF ITHACA", bonus: "Send one arrow through all twelve axes", lesson: "Aim into the draught: the gauge shows which way it blows. Draw fully for the flattest flight, and let go before your arm trembles. Antinous wins ties.", keys: ["AIM: MOUSE / ARROWS", "DRAW: HOLD CLICK / SPACE"] },
};

export function encounterCue(s: GameState): { title: string; detail: string; value: string; fill: number; danger?: boolean } {
  if (isCave(s)) {
    // The nearest hazard the player still has time to answer.
    const next = s.obstacles
      .filter(o => !o.resolved && o.z > 0 && o.z < 56)
      .sort((a, b) => a.z - b.z)[0];
    const locked = s.cyclops.state === "winding" ? s.cyclops.windLane : s.boulders.find(b => !b.resolved)?.lane ?? -1;
    const laneName = ["LEFT", "CENTRE", "RIGHT"];
    const seconds = next ? Math.max(0, next.z / Math.max(1, s.speed)) : 0;
    if (locked === s.lane) {
      return {
        title: `BOULDER LOCKED · ${laneName[locked]}`,
        detail: "Polyphemus has committed to this lane. Step aside before it lands.",
        value: `${s.sheepSaved} sheep · ${s.precision} precise`,
        fill: caveProgress(s),
        danger: true,
      };
    }
    if (next && next.lane === s.lane) {
      const rule = AVOIDANCE[next.kind];
      return {
        title: `${rule.prompt} · ${next.kind.toUpperCase()}`,
        detail: `${rule.jump ? "Jump it" : rule.slide ? "Slide under it" : "Change lanes"} — ${seconds.toFixed(1)}s away.`,
        value: `${s.sheepSaved} sheep · ${s.precision} precise`,
        fill: caveProgress(s),
        danger: seconds < 0.8,
      };
    }
    return {
      title: s.zone === "daylight" ? "DAYLIGHT · RUN FOR THE MOUTH" : s.zone === "collapse" ? "THE HALL IS COMING DOWN" : "RUN FOR THE DAYLIGHT",
      detail: locked >= 0
        ? `A boulder is locked on the ${laneName[locked].toLowerCase()} lane. Stay clear of it.`
        : "Watch the prompt above each hazard. Glowing sheep restore a life.",
      value: `${s.sheepSaved} sheep · ${s.precision} precise`,
      fill: caveProgress(s),
      danger: s.cyclops.gap < 24,
    };
  }
  if (isAdventure(s)) {
    if (s.id === "lotus") return { title: s.carrying ? "BRING YOUR SAILOR HOME" : s.protection ? "MOLY'S PROTECTION" : "FIND YOUR LOST CREW", detail: s.carrying ? "The ship waits in the lower-left garden." : s.protection ? "Guardians cannot harm you while the golden ward holds." : "Touch a sailor, then lead them to the ship. Relics are optional.", value: s.protection ? `${Math.ceil(s.protection / 1000)}s ward` : `${s.relicsFound}/3 relics`, fill: s.protection ? s.protection / 14000 : s.relicsFound / 3 };
    if (s.id === "cyclops") {
      const o = s.obstacles.filter(o => !["coin", "sheep"].includes(o.kind)).sort((a, b) => a.remaining - b.remaining)[0];
      const lane = o ? ["LEFT", "CENTER", "RIGHT"][o.lane] : "";
      return { title: o ? `${o.kind === "beam" ? "SLIDE" : o.kind === "rock" ? "CHANGE LANES" : "JUMP OR DODGE"} · ${lane}` : "MAKE FOR DAYLIGHT", detail: o ? `${o.kind.toUpperCase()} arrives in ${(Math.max(0, o.remaining) / 1000).toFixed(1)}s. The targeted lane is locked.` : "Watch for a gold coin or a sheep on your next stretch.", value: `${s.coins} coins · ${s.precision} precise`, fill: o ? 1 - o.remaining / o.warning : 0, danger: !!o && o.remaining < 1200 && s.lane === o.lane };
    }
    if (s.id === "aeolus") { const g = s.gates.find(g => g.x > 110); return { title: g ? s.y > g.center + 20 ? "CATCH THE WIND" : s.y < g.center - 20 ? "LET THE SHIP DESCEND" : "HOLD THE CENTER" : "FIND YOUR RHYTHM", detail: "Tap to rise, release to fall. Collect the blessing for a perfect passage.", value: `${s.perfectPasses} perfect gates`, fill: Math.min(1, s.perfectPasses / 3), danger: s.y < 50 || s.y > 350 }; }
    return { title: s.lightning ? "LIGHTNING · LEAVE THE RED TIMBER" : s.row === 0 ? "CHOOSE YOUR NEXT LANDING" : "RIDE THE CURRENT", detail: s.lightning ? "The strike is locked. Hop to an unmarked timber." : "Bright driftwood bundles reward a careful detour. Three pieces repair a life at shore.", value: `${s.wood} driftwood / 3`, fill: Math.min(1, s.wood / 3), danger: !!s.lightning };
  }
  if (s.id === "circe") return { title: s.bank > 0 ? "CURSES READY TO SEND" : "BREAK CIRCE'S SPELL", detail: "Match three, purify swine with moly, and chain clears to pressure Circe.", value: `${s.chains} chains · ${s.bank} curses`, fill: Math.min(1, s.bank / 4) };
  if (s.id === "sirens") return { title: s.phase === "listen" ? "LISTEN · REMEMBER THE ORDER" : s.phase === "reply" ? "YOUR REPLY · ECHO THE MELODY" : "THE SHIP ROWS ON", detail: s.phase === "listen" ? "Watch the numbered strings. Remember the notes and skip the rests." : "A / S / D / F or tap the four strings. A wrong note raises temptation.", value: `${s.entered.length}/${s.notes.filter(n => !n.rest).length} echoed`, fill: s.entered.length / Math.max(1, s.notes.filter(n => !n.rest).length), danger: s.temptation >= 70 };
  if (s.id === "scylla") return { title: s.telegraph ? `HEAD ${s.head + 1} IS AIMING` : s.rowing ? "OARS IN THE WATER" : "KEEP ROWING · SPACE", detail: "Meet a strike at the shield's center for a perfect parry and a burst of distance.", value: `${s.successes} deflected`, fill: s.boat / 85, danger: s.boat < 22 };
  if (s.id === "bow") {
    const turns = s.practice ? 1 : BOW.turns, value = `You ${s.score} · Antinous ${s.rivalScore}`, fill = (s.shots.length + s.rivalShots.length) / (turns * 2);
    if (s.phase === "player") return {
      title: s.drawing ? (s.draw >= 1 ? "FULL DRAW · LET GO" : "DRAWING THE BOW") : s.blocked ? `AXE ${s.blocked} IS NARROWED` : "THREAD ALL TWELVE AXES",
      detail: s.drawing ? "Let go to loose. Hold a full draw too long and your arm trembles." : s.wind ? `The draught blows ${s.wind > 0 ? "right" : "left"}. Point at the holes, ${draughtAllowance(s.wind, s.difficulty).words} to the ${s.wind > 0 ? "left" : "right"}, then hold to draw.` : "Still air. Point at the holes, a touch high, then hold to draw.",
      value, fill,
    };
    // The result waits until the arrow has struck, so the toast never spoils the flight.
    const yours = s.phase === "rival" && s.timer < BOW.flightMs + BOW.resultMs, landed = !!s.shot && s.timer >= arrowTime(strikeZ(s.shot));
    if (yours) return { title: landed ? "YOUR ARROW STRIKES" : "YOUR ARROW FLIES", detail: landed ? s.feedback : "Watch it through the axes.", value, fill };
    return { title: "ANTINOUS SHOOTS", detail: s.phase === "review" && landed ? s.rivalLine : "His arrow flies down the same line. Ties go to him.", value, fill };
  }
  return { title: s.phase === "warning" ? "EVADE THE MARKED SMASH" : "MOVE QUIETLY", detail: "Use sheep for cover and keep one quiet step ready when Polyphemus strikes.", value: `${s.turn} turns`, fill: s.turn / 32, danger: s.phase === "warning" };
}
