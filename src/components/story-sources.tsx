import { chapterLore, homerLink, HOMER_URL } from "../lib/odyssey";

export function ChapterSource({ id }: { id: string }) {
  const lore = chapterLore[id];
  if (!lore) return null;
  return <details className="chapter-source">
    <summary>What happens in Homer? <span>{lore.reference}</span></summary>
    <div className="chapter-source-body">
      <section><h3>In the poem</h3><p>{lore.summary}</p></section>
      <section><h3>In your voyage</h3><p>{lore.difference}</p></section>
      <a className="source-link" href={homerLink(lore.book)} target="_blank" rel="noreferrer">Read the source: Homer’s Odyssey, {lore.reference}</a>
    </div>
  </details>;
}

export function StorySources() {
  return <div className="story-sources">
    <p className="sources-intro">Farshore adapts <i>The Odyssey</i>, the ancient Greek epic attributed to Homer. Its homecoming story belongs to mythology. The player’s counsel can change the voyage.</p>
    <section>
      <span className="atlas-eyebrow">01 · THE PRIMARY TEXT</span>
      <h2>Homer’s Odyssey</h2>
      <p>Checked against Samuel Butler’s English prose translation, first published in 1900 and available through Project Gutenberg. The game uses familiar Greek names: Odysseus, Athena, Poseidon, and Zeus. Butler often uses Ulysses, Minerva, Neptune, and Jove.</p>
      <a className="source-link" href={HOMER_URL} target="_blank" rel="noreferrer">Read the complete poem on Project Gutenberg ↗</a>
      <p>Book numbers and verse ranges identify the underlying poem. Butler’s prose page does not print every verse number. The in-game summaries and dialogue are newly written.</p>
    </section>
    <section>
      <span className="atlas-eyebrow">02 · FOLLOW THE STORY</span>
      <ul className="source-book-list">
        <li><a href={homerLink(8)} target="_blank" rel="noreferrer">Books 4 & 8</a><span>The wooden horse and the fall of Troy, recalled later.</span></li>
        <li><a href={homerLink(9)} target="_blank" rel="noreferrer">Books 9–12</a><span>The wandering, from the Cicones to the loss of the last ship.</span></li>
        <li><a href={homerLink(5)} target="_blank" rel="noreferrer">Books 5–8 & 13</a><span>Calypso, Nausicaa, the Phaeacian court, and passage to Ithaca.</span></li>
        <li><a href={homerLink(1)} target="_blank" rel="noreferrer">Books 1–4</a><span>Penelope, the suitors, and Telemachus’s search.</span></li>
        <li><a href={homerLink(13)} target="_blank" rel="noreferrer">Books 13–24</a><span>The disguise, allies, bow contest, recognition, and peace.</span></li>
      </ul>
    </section>
    <section>
      <span className="atlas-eyebrow">03 · THE ADAPTATION</span>
      <h2>One poem. A voyage you can change.</h2>
      <p>Homer begins near the end of the absence and uses a long recollection for the earlier adventures. Farshore puts the events in journey order. The imagined counsellor, conversations, trust score, month costs, and alternate escapes are game rules. The shortened stays with Circe and Calypso belong to that alternate timeline.</p>
      <p>The map uses real Mediterranean coastlines from <a href="https://www.naturalearthdata.com/downloads/50m-physical-vectors/50m-land/" target="_blank" rel="noreferrer">Natural Earth</a>. Legendary places have illustrative positions. Oceanus is symbolic. The map does not claim to prove Odysseus’s route.</p>
    </section>
    <a className="source-download" href="/story-sources.md" download>Download the presentation source guide ↓</a>
  </div>;
}
