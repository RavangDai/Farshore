// How the voice says the Odyssey's names. Kokoro reads text through eSpeak's
// English rules, which turn Scylla into "SIGH-luh", Telemachus into
// "TEL-i-match-us" and Antinous into "an-ti-NOOZ". Each entry below is a
// respelling whose eSpeak phonemes were checked (en-us and en-gb) to put the
// stress where a classicist would. Only the spoken text changes; subtitles keep
// the real name. Names eSpeak already says well (Circe, Aeolus, Aeaea,
// Odysseus, Penelope, Calypso, Ithaca, Charybdis, Phaeacians) are left alone.

export const LEXICON_VERSION = 1;

const RESPELL: Record<string, string> = {
  Scylla: "Silla",
  Polyphemus: "Polifeemus",
  Telemachus: "Telemmuckus",
  Antinous: "Antinno-us",
  Tiresias: "Tyreesyus",
  Achaeans: "uh keeuns",
  Eurylochus: "Yu rillukus",
  Helios: "Heeleeus",
  Eumaeus: "You meeus",
  Laertes: "Lay urteez",
  Cicones: "Sikkohneez",
  Ogygia: "Ohjijia",
};

const PATTERN = new RegExp(`\\b(${Object.keys(RESPELL).join("|")})\\b`, "gi");

/** The line as the voice should read it. */
export function pronounce(text: string) {
  return text.replace(PATTERN, word => {
    const spelled = RESPELL[word[0].toUpperCase() + word.slice(1).toLowerCase()];
    if (!spelled) return word;
    return word === word.toUpperCase() && word.length > 1 ? spelled.toUpperCase() : spelled;
  });
}
