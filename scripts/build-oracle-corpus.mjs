// Builds the Oracle's corpus: the books of Homer's Odyssey behind FARSHORE's
// eight trials, from Samuel Butler's public-domain translation (Project
// Gutenberg eBook 1727), split into short passages for retrieval.
//
//   node scripts/build-oracle-corpus.mjs              # downloads the text
//   node scripts/build-oracle-corpus.mjs pg1727.txt   # or reads a saved copy
//
// Writes server/oracle/corpus-data.ts. The Project Gutenberg header, footer
// and footnote markers are removed, and names are given in the Greek forms the
// game uses (Butler writes Ulysses, Jove, Minerva...), so a quoted passage
// reads the same as the question and the rest of the game.

import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const SOURCE_URL = "https://www.gutenberg.org/cache/epub/1727/pg1727.txt";
const HTML_URL = "https://www.gutenberg.org/files/1727/1727-h/1727-h.htm";
/** The books behind the trials: Calypso (V), Lotus-Eaters and Cyclops (IX), Aeolus and Circe (X), Sirens and Scylla (XII), the bow (XXI). */
const BOOKS = { V: 5, IX: 9, X: 10, XII: 12, XXI: 21 };
const MIN_WORDS = 80, MAX_WORDS = 160;
const NAMES = [
  ["Ulysses", "Odysseus"], ["Jove", "Zeus"], ["Minerva", "Athena"], ["Neptune", "Poseidon"], ["Mercury", "Hermes"],
  ["Juno", "Hera"], ["Vulcan", "Hephaestus"], ["Venus", "Aphrodite"], ["Diana", "Artemis"], ["Saturn", "Cronus"],
  ["Lotophagi", "Lotus-eaters"], ["Cicons", "Cicones"],
];

const text = process.argv[2] ? await readFile(process.argv[2], "utf8") : await (await fetch(SOURCE_URL)).text();
if (!/Translator: Samuel Butler/.test(text)) throw new Error("This is not Butler's translation of the Odyssey (Gutenberg 1727).");
const body = text.slice(text.indexOf("*** START OF THE PROJECT GUTENBERG EBOOK"), text.indexOf("*** END OF THE PROJECT GUTENBERG EBOOK"));
// The footnotes follow the last book. (The contents near the top also mention them, indented.)
const unix = body.replace(/\r\n/g, "\n");
const end = unix.search(/^FOOTNOTES:/m);
const poem = end > 0 ? unix.slice(0, end) : unix;

const greek = s => NAMES.reduce((out, [latin, greekName]) => out.replace(new RegExp(`\\b${latin}(?=\\b|’|')`, "g"), greekName), s);
// Footnote markers are numbers stuck to the end of a word or punctuation: "towards dawn.75 It".
const clean = s => greek(s.replace(/([A-Za-z.,;:!?”’)])\d{1,3}(?=[\s”’,.;:]|$)/g, "$1").replace(/\s+/g, " ").trim());
const words = s => s.split(/\s+/).filter(Boolean).length;

function sentences(paragraph) {
  return paragraph.match(/[^.!?]+[.!?]+[”’]*\s*|[^.!?]+$/g)?.map(s => s.trim()).filter(Boolean) ?? [paragraph];
}

const headings = [...poem.matchAll(/^BOOK ([IVXL]+)[ \t]*$/gm)];
const passages = [], titles = {};
for (let h = 0; h < headings.length; h++) {
  const roman = headings[h][1], book = BOOKS[roman];
  if (!book) continue;
  const chunk = poem.slice(headings[h].index + headings[h][0].length, h + 1 < headings.length ? headings[h + 1].index : poem.length);
  const blocks = chunk.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  // The first block is Butler's capitalised summary of the book.
  const heading = NAMES.reduce((out, [latin, greekName]) => out.replace(new RegExp(`\\b${latin.toUpperCase()}\\b`, "g"), greekName.toUpperCase()), blocks.shift());
  titles[book] = clean(heading).replace(/—-/g, "—").replace(/\s*—\s*/g, " — ");
  const paragraphs = blocks.map(clean).filter(p => p.length > 0);
  // Long speeches split at sentence ends; short paragraphs join their neighbours.
  const units = paragraphs.flatMap(p => {
    if (words(p) <= MAX_WORDS) return [p];
    const out = [];
    let current = "";
    for (const s of sentences(p)) {
      if (current && words(current) + words(s) > MAX_WORDS) { out.push(current); current = ""; }
      current = current ? `${current} ${s}` : s;
    }
    if (current) out.push(current);
    return out;
  });
  let current = "", index = 0;
  const flush = () => {
    if (!current) return;
    index++;
    passages.push({ id: `odyssey-${book}-${index}`, book, roman, index, ref: `Book ${roman}, passage ${index}`, url: `${HTML_URL}#chap${String(book).padStart(2, "0")}`, text: current });
    current = "";
  };
  for (const u of units) {
    if (current && words(current) + words(u) > MAX_WORDS) flush();
    current = current ? `${current} ${u}` : u;
    if (words(current) >= MIN_WORDS) flush();
  }
  // A short tail joins the previous passage of the same book rather than standing alone.
  if (current) {
    const last = passages.at(-1);
    if (last && last.book === book && words(last.text) + words(current) <= MAX_WORDS + 60) last.text = `${last.text} ${current}`;
    else flush();
  }
}

const digest = createHash("sha256").update(passages.map(p => p.id + p.text).join("\n")).digest("hex").slice(0, 16);
const source = {
  work: "Homer, The Odyssey",
  translator: "Samuel Butler (1900)",
  gutenberg: 1727,
  url: HTML_URL,
  licence: "Public domain. Text from Project Gutenberg; the Project Gutenberg header, footer and footnotes are not included.",
  edits: `Footnote markers removed; names given in their Greek forms (${NAMES.map(([a, b]) => `${a} → ${b}`).join(", ")}).`,
  books: Object.keys(titles).map(Number),
  passages: passages.length,
  words: passages.reduce((n, p) => n + words(p.text), 0),
  hash: digest,
};
const out = `// Generated by scripts/build-oracle-corpus.mjs. Do not edit by hand; run the script again.
// ${source.work}, translated by ${source.translator}. ${source.licence}
// ${source.edits}

export type OdysseyPassage = { id: string; book: number; roman: string; index: number; ref: string; url: string; text: string };

export const CORPUS_SOURCE = ${JSON.stringify(source, null, 2)} as const;

export const BOOK_TITLES: Record<number, string> = ${JSON.stringify(titles, null, 2)};

export const ODYSSEY_PASSAGES: OdysseyPassage[] = [
${passages.map(p => "  " + JSON.stringify(p)).join(",\n")},
];
`;
await writeFile(new URL("../server/oracle/corpus-data.ts", import.meta.url), out);
const sizes = passages.map(p => words(p.text));
console.log(`Wrote ${passages.length} passages (${source.words} words, ${Math.min(...sizes)}–${Math.max(...sizes)} words each) from books ${source.books.join(", ")}. Hash ${digest}.`);
