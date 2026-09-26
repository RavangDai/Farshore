import { readFileSync, writeFileSync } from 'node:fs';
import { encounters } from '../src/lib/game.ts';
const change = (id, values) => Object.assign(encounters.find(e => e.id === id), values);
change('lotus', {
  scene: 'Driven off course beyond Cape Malea, the fleet reaches the Lotus-eaters. Three scouts eat the lotus and lose their desire to return. The hosts are welcoming, but their food threatens the memory of home.',
  speech: 'They will not come back to the ships. Must I drag my own men away from this peaceful shore?',
  temptation: 'Let the scouts stay and allow the crew to taste the lotus',
  safe: 'Bring the scouts aboard and leave before anyone else eats the lotus',
  risk: 'Let the crew stay and taste the lotus',
  good: 'Odysseus brings the reluctant scouts aboard and secures them beneath the rowing benches. He orders the fleet away before anyone else can forget the voyage.',
  bad: 'More sailors taste the lotus. Odysseus eventually forces a departure, but recovering the scattered crew has cost precious time.',
});
change('cyclops', {
  scene: 'Polyphemus has killed six of the men trapped in his cave. Odysseus called himself Nobody, blinded the Cyclops with a heated stake, and escaped beneath his sheep. Now, from the departing ship, pride urges him to claim the deed.',
  speech: 'Nobody has saved us. Yet shall this giant never know whose cunning defeated him?',
  bad: 'Odysseus shouts his name. Polyphemus calls on his father Poseidon: let the king return late, alone, in another man’s ship, to trouble at home. The sea has gained a powerful enemy.',
});
change('winds', {
  scene: 'After a month of hospitality, Aeolus gives Odysseus a bag holding the contrary winds. For nine days the fleet sails toward Ithaca. Home is visible, but the exhausted captain needs sleep and the crew suspects hidden treasure.',
  good: 'The crew trusts their captain and leaves the bag sealed. The west wind carries the fleet to Ithaca. Your counsel has opened an earlier homecoming; the later sea trials are avoided.',
  bad: 'The crew opens the bag while Odysseus sleeps. The released winds carry the fleet back to Aeolus, who refuses another gift. Exhausted, they row on toward the Laestrygonian coast.',
});
change('circe', {
  scene: 'With only one ship left, Odysseus reaches Aeaea. Circe turns a scouting party into pigs. Hermes gives him the herb moly; he resists her magic and makes her restore his companions. Now her hospitality makes departure easy to postpone.',
  speech: 'My companions are men again, and her halls offer rest. But they ask me to remember Ithaca. Is it time to seek the road home?',
  safe: 'Ask Circe how to return home and prepare to leave',
  good: 'He asks for the way home. Circe tells him he must first consult the dead prophet Tiresias. He prepares the ship for the voyage to Oceanus.',
  bad: 'He accepts more comfort in Circe’s halls. When the crew finally presses him to leave, she sends him to seek Tiresias among the dead.',
  keywords: ['ask', 'circe', 'leave', 'sail', 'home', 'family', 'penelope', 'promise', 'depart', 'return', 'prepare'],
});
change('underworld', {
  scene: 'Following Circe’s directions, Odysseus sails to the edge of Oceanus and summons the dead. Elpenor asks for burial. Tiresias approaches, and Odysseus also sees Anticleia, the mother he did not know had died.',
  speech: 'My mother is among these shades. I came for a road home, and find grief waiting here too. What must I hear before I leave?',
  good: 'He listens. Tiresias warns him to spare Helios’s cattle and foretells trouble at home. Odysseus speaks with his mother, then returns to Aeaea to bury Elpenor and hear Circe’s sailing instructions.',
  bad: 'Fear cuts short his time with the dead. He returns to Aeaea, where Elpenor is buried and Circe repeats the warning about Helios’s cattle before describing the perils ahead.',
});
change('sirens', {
  scene: 'Back on Aeaea, the crew has buried Elpenor and heard Circe’s instructions. Now the Sirens promise Odysseus knowledge of Troy and the world. Their meadow is surrounded by the remains of those who listened.',
  good: 'The crew seals its ears with wax and binds Odysseus to the mast. When he begs to be released, they tighten the ropes and row beyond the song.',
  bad: 'He draws too near before the crew secures him. They struggle back into open water with a damaged ship. Your version gives them an escape; Homer does not narrate this detour.',
});
change('scylla', {
  scene: 'Circe has warned of Scylla’s six heads and Charybdis’s deadly whirlpool. Passing close to Scylla will cost lives, but the whirlpool threatens the whole ship. The captain reaches for weapons against an immortal enemy.',
  good: 'They row without stopping. Scylla takes six companions, but the ship escapes Charybdis. The captain must carry their deaths with him; this passage has no bloodless victory.',
  bad: 'Odysseus delays the passage trying to fight Scylla. The ship finally escapes, with more lives lost. Weapons cannot defeat the immortal monster.',
});
change('cattle', {
  scene: 'After Scylla, the weary crew insists on landing on Thrinacia. They swear to spare Helios’s cattle. Contrary winds trap them until their provisions run out; fishing and hunting cannot satisfy their hunger. Eurylochus urges them to break the oath.',
  safe: 'Keep the oath, ration other food, and leave the cattle unharmed',
  good: 'Odysseus holds the crew to its oath until the wind changes. The cattle live and the remaining companions sail toward Ithaca. Your choice avoids the wreck and Calypso’s captivity.',
  bad: 'While Odysseus is away praying and falls asleep, Eurylochus leads the slaughter. Helios demands punishment. After they sail, Zeus destroys the ship with a thunderbolt. Every remaining companion dies; Odysseus alone survives on the wreckage.',
  keywords: ['oath', 'ration', 'fish', 'forage', 'sacred', 'leave', 'spare', 'promise', 'protect', 'other', 'avoid', 'unharmed', 'do not kill', "don't kill"],
});
change('calypso', {
  scene: 'Alone after the destruction of his last ship, Odysseus survives another encounter with Charybdis and drifts to Ogygia. Calypso holds him there against his wish to go home. At Athena’s urging, Zeus sends Hermes to order his release.',
  speech: 'She promises life without age. Yet I sit on the shore longing for Penelope. Now that the gods permit it, I would face the sea again.',
  temptation: 'Delay his departure for the comforts Calypso offers',
  risk: 'Delay building the raft and stay longer',
  good: 'He builds and provisions a raft with Calypso’s help. On the crossing, Poseidon wrecks it. The sea goddess Ino lends him her protective veil, and Athena helps him reach Scheria alive.',
  bad: 'He postpones the raft and loses more time on Ogygia. At last he chooses his mortal home. Poseidon wrecks the raft, but Ino’s veil and Athena’s help bring him to Scheria.',
  dangers: ['stay', 'wait', 'delay', 'immortality', 'eternity', 'accept'],
});
change('nausicaa', {
  good: 'He speaks from a respectful distance. Nausicaa gives him food and clothing, then directs him toward her parents, Queen Arete and King Alcinous, who can send him home.',
  bad: 'His sudden approach alarms the attendants. Once he regains their confidence, Nausicaa helps him find the palace of Arete and Alcinous, but the delay costs time.',
});
change('ithaca', {
  scene: 'Odysseus is back on Ithaca, but suitors have consumed his household and threatened Telemachus. Athena gives him a beggar’s disguise. Eumaeus shelters him and father and son reunite. At the hall, his old dog Argos recognizes him and dies. The suitors insult the stranger.',
  speech: 'My son stands beside me, but my hall is full of enemies. Shall I throw off these rags, or wait until the bow is in my hands?',
  safe: 'Keep the disguise and prepare with Telemachus for the bow contest',
  good: 'He waits. Penelope sets the contest of the bow and twelve axes. Odysseus strings his bow, makes the shot, and reveals himself. With Telemachus, Eumaeus, Philoetius, and Athena’s aid, he kills the suitors. Penelope still needs proof of who he is.',
  bad: 'He reveals himself before the household is ready. In this altered telling, he retreats and regroups with his allies, then reclaims the hall at greater cost. Penelope still needs proof of his identity.',
  keywords: ['wait', 'plan', 'disguise', 'telemachus', 'patience', 'quiet', 'hide', 'prepare', 'bow', 'contest'],
});
encounters.push(
  {
    id: 'cicones', place: 'Ismarus · The Cicones', title: 'The war has ended. The raiding has not.',
    scene: 'Troy has fallen. Odysseus’s twelve ships reach Ismarus, where his men raid the Cicones, kill defenders, and seize captives and supplies. He orders a departure, but the men linger to feast while the Cicones call for help.',
    speech: 'I have ordered them aboard, yet they will not leave the wine and plunder. Reinforcements may already be coming. How do I bring them away?',
    temptation: 'Let the crew continue feasting after the raid', safe: 'Gather the crew and depart before reinforcements arrive', risk: 'Stay on the shore to feast',
    good: 'The fleet departs before the counterattack. A storm drives it south; beyond Cape Malea, contrary winds carry it into unfamiliar waters.',
    bad: 'Ciconian reinforcements attack. Six men from each ship are killed before the fleet escapes. A storm then drives the survivors beyond Cape Malea and away from their course.',
    keywords: ['gather', 'depart', 'leave', 'aboard', 'reinforcements', 'escape', 'sail', 'home'], dangers: ['stay', 'feast', 'drink', 'plunder', 'wait'], cost: 2, loss: 8,
  },
  {
    id: 'laestrygonians', place: 'Telepylus · The Laestrygonians', title: 'A harbour with no way out.',
    scene: 'After Aeolus refuses more help, the exhausted fleet rows for six days. Eleven ships enter a narrow harbour below steep cliffs. Odysseus moors his own ship outside. Scouts discover that the Laestrygonians are giants who attack and eat strangers.',
    speech: 'Boulders are falling into the harbour. My other ships are trapped. If I row in after them, will I lose the last ship too?',
    temptation: 'Take the last ship into the harbour under attack', safe: 'Cut the mooring rope and escape from outside the harbour', risk: 'Enter the harbour to attempt a rescue',
    good: 'He cuts the rope and orders the oarsmen away. The eleven trapped ships and their crews are destroyed. His ship alone escapes to Aeaea.',
    bad: 'The rescue attempt cannot reach the trapped crews. Odysseus’s ship barely escapes after suffering damage and further losses. The eleven other ships are gone.',
    keywords: ['cut', 'rope', 'escape', 'outside', 'row away', 'leave', 'last ship', 'protect'], dangers: ['enter', 'rescue', 'inside', 'fight'], cost: 2, loss: 10,
  },
  {
    id: 'phaeacians', place: 'Scheria · The Phaeacian court', title: 'To find a passage, tell the truth.',
    scene: 'Arete and Alcinous welcome the stranger. At a feast, the bard Demodocus sings of Troy and the wooden horse, and Odysseus weeps. His host asks his name and the story of his wandering so the Phaeacians can take him home.',
    speech: 'I have hidden my name, but these people have shown me kindness. Can I trust them with the sorrows of my voyage?',
    temptation: 'Keep his identity and destination hidden', safe: 'Trust his hosts, name Ithaca, and tell his story', risk: 'Withhold his identity and refuse to tell the story',
    good: 'He names himself and recounts his travels. The Phaeacians give him gifts and carry him asleep to Ithaca. Poseidon punishes their returning ship, turning it to stone.',
    bad: 'His silence delays the preparations. He eventually names himself and Ithaca. The Phaeacians carry him home as he sleeps; Poseidon turns their returning ship to stone.',
    keywords: ['trust', 'tell', 'story', 'name', 'ithaca', 'honest', 'hosts', 'thank', 'home'], dangers: ['withhold', 'refuse', 'hide', 'lie', 'secret'], cost: 2, loss: 8,
  },
  {
    id: 'reunion', place: 'Ithaca · The rooted bed', title: 'Home is more than a name.',
    scene: 'The suitors are dead. Penelope has survived years of pressure, delaying remarriage by weaving and secretly unweaving a shroud. She will not trust a stranger’s claim. She orders their marriage bed moved outside the chamber, testing the man before her.',
    speech: 'Who could move that bed? I built it around a living olive tree. Has someone cut through its root while I was gone?',
    temptation: 'Demand recognition and dismiss Penelope’s caution', safe: 'Respect her caution and explain the secret of the olive-tree bed', risk: 'Demand that Penelope accept him without proof',
    good: 'The secret convinces Penelope. They embrace and tell one another what they endured. Odysseus later reunites with Laertes. When the suitors’ families seek revenge, Athena, with Zeus’s authority, ends the fighting and establishes peace.',
    bad: 'His demand cannot restore trust. He must listen and share the private truth of the rooted bed before Penelope recognizes him. After the reunion with Laertes, Athena ends the retaliatory fighting and establishes peace.',
    keywords: ['respect', 'caution', 'explain', 'secret', 'olive', 'bed', 'proof', 'listen', 'patience'], dangers: ['demand', 'command', 'force', 'dismiss'], cost: 1, loss: 6,
  },
);
const path = 'src/lib/game.ts';
let source = readFileSync(path, 'utf8');
const start = source.indexOf('export const encounters: Encounter[] = [');
const end = source.indexOf('export type Decision');
source = source.slice(0, start) + 'export const encounters: Encounter[] = ' + JSON.stringify(encounters, null, 2) + ';\n' + source.slice(end);
writeFileSync(path, source);
