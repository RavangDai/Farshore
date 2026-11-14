/**
 * Splits a line into the pieces the voice synthesizes one at a time, so the
 * first can play while the next is made. Fragments shorter than 16 characters
 * stay with a neighbour so the voice keeps its phrasing, an over-long sentence
 * breaks at commas, and with `firstMax` a long opening sentence breaks at its
 * first comma, semicolon, colon or dash, so the first sound arrives sooner.
 */
export function sentences(text: string, { firstMax = 0 }: { firstMax?: number } = {}): string[] {
  const out: string[] = [];
  for (const part of text.trim().split(/(?<=[.!?…]["')\]]*)\s+/)) {
    if (!part) continue;
    if (out.length && (part.length < 16 || out[out.length - 1].length < 16)) out[out.length - 1] += " " + part;
    else out.push(part);
  }
  const pieces = out.flatMap(sentence => {
    if (sentence.length <= 200) return [sentence];
    const parts: string[] = [];
    for (const clause of sentence.split(/(?<=[,;:])\s+/)) {
      if (parts.length && parts[parts.length - 1].length + clause.length < 200) parts[parts.length - 1] += " " + clause;
      else parts.push(clause);
    }
    return parts;
  });
  if (firstMax > 0 && pieces.length && pieces[0].length > firstMax) {
    const first = pieces[0], breaks = /[,;:—]\s+/g;
    for (let m = breaks.exec(first); m; m = breaks.exec(first)) {
      const cut = m.index + m[0].length;
      if (cut - 1 < 20) continue;
      if (first.length - cut < 16 || cut - 1 > firstMax) break;
      pieces.splice(0, 1, first.slice(0, cut).trimEnd(), first.slice(cut));
      break;
    }
  }
  return pieces;
}

/** The pause after a piece: a full stop breathes longer than a comma. */
export const pauseAfter = (piece: string) => (/[.!?…]["')\]]*$/.test(piece) ? 0.2 : /[,;:—]$/.test(piece) ? 0.1 : 0.12);
