/** The two prologue slides. The bard reads each slide's lines, then its text. */
export const prologue = [
  { chapter: "Prologue · after the fall of Troy", lines: ["The war is over.", "The journey is not."], text: "You are Odysseus, king of Ithaca. Ten years at Troy have taken you far from Penelope and Telemachus. Now, with your crew beside you, you turn your ship toward home.", next: "The journey ahead", detail: "Continue" },
  { chapter: "The voyage begins", lines: ["Eight trials stand", "between you and home."], text: "Rescue your crew from the lotus, outrun a giant, sail the winds, break Circe's spell, resist the Sirens, survive the strait, cross a storm, and reclaim the bow of Ithaca.", next: "Land of the Lotus-Eaters", detail: "First briefing" },
];

/** What the bard says on a prologue slide. */
export const prologueSpeech = (slide: (typeof prologue)[number]) => slide.lines.join(" ") + " " + slide.text;
