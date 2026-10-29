export const HOMER_URL = "https://www.gutenberg.org/files/1727/1727-h/1727-h.htm";
export const homerLink = (book: number) => `${HOMER_URL}#chap${String(book).padStart(2, "0")}`;

export type ChapterLore = {
  book: number;
  reference: string;
  summary: string;
  difference: string;
};

// Original summaries of the public-domain poem, checked against Butler's translation.
// Greek character names are used throughout, rather than Butler's Latin equivalents.
export const chapterLore: Record<string, ChapterLore> = {
  cicones: {
    book: 9, reference: "Book 9.39–81",
    summary: "After leaving Troy, Odysseus raids Ismarus. His men ignore the order to depart. The Cicones counterattack, killing six men from every ship. Storms then drive the fleet beyond Cape Malea.",
    difference: "An earlier departure can avoid the counterattack in your voyage. The raid is an act of aggression by the Greeks, not an unprovoked attack on innocent travellers.",
  },
  lotus: {
    book: 9, reference: "Book 9.82–104",
    summary: "Three scouts eat the lotus and forget their desire to go home. Odysseus forces them back aboard, binds them beneath the benches, and orders an immediate departure. He does not eat the lotus himself.",
    difference: "Letting more of the crew taste the lotus is an invented alternative. The Lotus-eaters do not attack the scouts.",
  },
  cyclops: {
    book: 9, reference: "Book 9.105–566",
    summary: "Polyphemus kills six companions. Odysseus calls himself Nobody, blinds him, and escapes under his sheep. He then reveals his real name. Polyphemus asks his father Poseidon to make the return late, lonely, and troubled.",
    difference: "You can persuade Odysseus to leave without the boast. His escape is cunning; his decision to claim the deed makes the danger worse.",
  },
  winds: {
    book: 10, reference: "Book 10.1–79",
    summary: "Aeolus entertains the crew for a month and gives Odysseus the bag of winds. Ithaca comes into sight after nine days. While Odysseus sleeps, the crew opens the bag, thinking it holds treasure. Aeolus refuses to help a second time.",
    difference: "Keeping the bag sealed takes your fleet home early. The game then skips the later wanderings. In Homer, the crew opens it; Odysseus does not.",
  },
  laestrygonians: {
    book: 10, reference: "Book 10.80–132",
    summary: "The Laestrygonians destroy the eleven ships trapped in their harbour. Odysseus has moored his own vessel outside and escapes. Only one of the original twelve ships remains.",
    difference: "The attempted rescue is an alternative choice. Neither game outcome restores the destroyed fleet.",
  },
  circe: {
    book: 10, reference: "Book 10.133–574",
    summary: "Circe transforms the scouts into pigs. Hermes gives Odysseus moly to resist her magic, and she restores the men. They stay a year. When his companions urge departure, she sends him to consult Tiresias among the dead. Elpenor dies in a fall before they leave.",
    difference: "Your counsel can shorten or prolong the stay. Circe must first direct him to Tiresias; the next stop is not a direct sailing to Ithaca.",
  },
  underworld: {
    book: 11, reference: "Book 11; return to Aeaea in Book 12.1–34",
    summary: "At Oceanus, Odysseus summons the dead. Elpenor asks for burial; Tiresias warns about Helios’s cattle; Anticleia tells him of home. He also meets the shades of fallen heroes. He returns to Aeaea, buries Elpenor, and receives Circe’s next warnings.",
    difference: "Leaving early is an alternative. The game keeps the return to Circe, so the crew can still receive the instructions needed for the Sirens and the strait.",
  },
  sirens: {
    book: 12, reference: "Book 12.39–54, 158–200",
    summary: "Circe tells Odysseus how to pass the Sirens. His men plug their ears with wax and bind him to the mast. When he begs to be released, they bind him more tightly and keep rowing.",
    difference: "The damaged-ship escape is invented. Homer describes a successful passage, not months spent repairing a wreck on the Sirens’ shore.",
  },
  scylla: {
    book: 12, reference: "Book 12.73–126, 201–259",
    summary: "Circe advises the passage by Scylla rather than risking the entire ship at Charybdis. Odysseus arms himself despite her warning. Scylla takes six men while the survivors pass through the strait.",
    difference: "The better game choice still costs six lives. A victory with no casualties would misrepresent this episode.",
  },
  cattle: {
    book: 12, reference: "Book 12.260–453",
    summary: "A month of contrary winds exhausts the food on Thrinacia. While Odysseus is away and asleep, Eurylochus persuades the crew to kill the cattle. At Helios’s demand, Zeus destroys the ship. All the remaining companions die. Odysseus survives alone and drifts toward Ogygia.",
    difference: "If the cattle are spared, your surviving crew sails toward Ithaca and avoids Calypso’s island. The fatal outcome is no longer described as an ordinary detour.",
  },
  calypso: {
    book: 5, reference: "Book 5; seven-year stay recalled in Book 7.244–266",
    summary: "Calypso holds Odysseus on Ogygia for seven years. He longs for home. After Athena appeals to Zeus, Hermes orders his release. He chooses mortal life with Penelope, builds a raft, and survives Poseidon’s storm with help from Ino and Athena.",
    difference: "The game allows a shorter captivity and a delayed departure. It does not treat permanent acceptance of immortality as a temporary visit. His companions are already dead on this route.",
  },
  nausicaa: {
    book: 6, reference: "Book 6",
    summary: "Nausicaa finds the shipwrecked Odysseus. He chooses to speak from a distance rather than clasp her knees. She gives him assistance and directs him toward the palace, especially Queen Arete.",
    difference: "Approaching abruptly is an alternative. Nausicaa offers help; the court and its sailors arrange the passage home.",
  },
  phaeacians: {
    book: 7, reference: "Books 7–8; recollections in 9–12; passage in 13.1–187",
    summary: "Arete and Alcinous receive Odysseus. Demodocus’s songs bring him to tears, and he tells his name and adventures. The Phaeacians carry him asleep to Ithaca. Poseidon turns their returning ship to stone.",
    difference: "The game tells the wandering in chronological order. Homer starts near its end, then presents Books 9–12 as Odysseus’s account to these hosts.",
  },
  ithaca: {
    book: 13, reference: "Books 13–22; bow contest in 21; battle in 22",
    summary: "Athena disguises Odysseus. Eumaeus shelters him; he reunites with Telemachus. Argos recognizes him and dies; Eurycleia knows his scar. Penelope sets the bow contest. Odysseus makes the shot through twelve axes and, with allies and Athena’s help, kills the suitors.",
    difference: "An early arrival and a premature-reveal recovery are invented branches. Reaching the island does not automatically restore the household or win Penelope’s trust.",
  },
  reunion: {
    book: 23, reference: "Books 23–24",
    summary: "Penelope tests Odysseus with the marriage bed he built around a rooted olive tree. His knowledge convinces her. He reunites with Laertes. The suitors’ relatives seek revenge; Zeus and Athena bring the retaliatory fighting to an end.",
    difference: "The game gives a final choice about patience and proof. Penelope is an active judge of his identity. Peace on Ithaca, not simply landing there, closes the journey.",
  },
};

export type MapStop = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  label: [number, number];
  location: string;
  chapters: string[];
};

// Coordinates for legendary lands are illustrative placements, not geographic claims.
export const mapStops: MapStop[] = [
  { id: 'troy', name: 'Troy', lon: 26.24, lat: 39.96, label: [30, 15], location: 'Troy in northwestern Anatolia is the geographic starting point. The horse is recalled in Odyssey 4 and 8.', chapters: [] },
  { id: 'cicones', name: 'Ismarus', lon: 25.5, lat: 40.9, label: [18, -18], location: 'The poem places the Cicones at Ismarus in Thrace. This marker indicates the region.', chapters: ['cicones'] },
  { id: 'lotus', name: 'Lotus-eaters', lon: 10.7, lat: 33.8, label: [-30, 32], location: 'Illustrative placement by North Africa. The poem gives no secure modern coordinates.', chapters: ['lotus'] },
  { id: 'cyclops', name: 'Cyclopes', lon: 15.45, lat: 37.65, label: [55, 22], location: 'Illustrative placement near Sicily. The land of the Cyclopes is legendary.', chapters: ['cyclops'] },
  { id: 'winds', name: 'Aeolia', lon: 14.7, lat: 38.65, label: [-42, 8], location: 'Illustrative placement north of Sicily. Homer describes Aeolus’s floating island, not a verified modern island.', chapters: ['winds'] },
  { id: 'laestrygonians', name: 'Laestrygonians', lon: 9.7, lat: 40.5, label: [-75, -22], location: 'Illustrative placement near Sardinia. The location of Telepylus is uncertain.', chapters: ['laestrygonians'] },
  { id: 'circe', name: 'Aeaea', lon: 13.05, lat: 41.1, label: [-20, -22], location: 'Illustrative placement by the Italian coast. It is a reading of Circe’s island, not a proven identification.', chapters: ['circe'] },
  { id: 'underworld', name: 'Oceanus / the dead', lon: 2.3, lat: 39.1, label: [0, 30], location: 'Symbolic position at the edge of the chart. The world-encircling Oceanus and the land of the dead cannot be fixed to these real-world coordinates.', chapters: ['underworld'] },
  { id: 'sirens', name: 'Sirens', lon: 14.35, lat: 40.3, label: [38, -16], location: 'Illustrative placement by southern Italy. The dotted course includes the return from Oceanus to Aeaea.', chapters: ['sirens'] },
  { id: 'scylla', name: 'Scylla & Charybdis', lon: 15.65, lat: 38.25, label: [90, -12], location: 'Shown near the Strait of Messina as a familiar interpretation. Homer’s supernatural strait is not an established sailing chart.', chapters: ['scylla'] },
  { id: 'cattle', name: 'Thrinacia', lon: 14.25, lat: 36.7, label: [-50, -2], location: 'Illustrative placement south of Sicily. The island of Helios’s cattle has no certain modern location.', chapters: ['cattle'] },
  { id: 'calypso', name: 'Ogygia', lon: 13.5, lat: 35.5, label: [28, 27], location: 'Illustrative central-Mediterranean placement. Ogygia’s location is uncertain; this is not a claim that Calypso lived on a particular modern island.', chapters: ['calypso'] },
  { id: 'scheria', name: 'Scheria', lon: 19.7, lat: 39.6, label: [48, -8], location: 'Illustrative placement near Corfu. The Phaeacian land is not securely identified.', chapters: ['nausicaa', 'phaeacians'] },
  { id: 'ithaca', name: 'Ithaca', lon: 20.7, lat: 38.4, label: [35, 28], location: 'Modern Ithaki in the Ionian Islands is the map’s home marker. The poem’s detailed island geography remains debated.', chapters: ['ithaca', 'reunion'] },
];

export const projectMap = (lon: number, lat: number): [number, number] => [(lon + 1) * 37.5, (45 - lat) * (710 / 15)];
