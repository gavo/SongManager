export const NOTES = [
  'Do',
  'Do#',
  'Re',
  'Mib',
  'Mi',
  'Fa',
  'Fa#',
  'Sol',
  'Sol#',
  'La',
  'Sib',
  'Si',
];

// Alias mapping for flexible parsing
const ALIASES: Record<string, string> = {
  Reb: 'Do#',
  'Re#': 'Mib',
  'Mi#': 'Fa', // Rarely used but possible
  Fab: 'Mi',
  Solb: 'Fa#',
  Lab: 'Sol#',
  'La#': 'Sib',
  Dob: 'Si',
  'Si#': 'Do',
};

const CHORD_MAX_LENGTH = 10; // All chords will be visually padded to exactly this length

/**
 * Normalizes a note name to our base NOTES array.
 */
export const normalizeNote = (note: string): string => {
  const titleCase = note.charAt(0).toUpperCase() + note.slice(1).toLowerCase();
  if (NOTES.includes(titleCase)) return titleCase;
  if (ALIASES[titleCase]) return ALIASES[titleCase];
  return titleCase;
};

/**
 * Parses a single chord string (e.g. "Do#m7" or "la-") into note and modifier.
 */
export const parseChord = (chordStr: string) => {
  // Match the note part (Do, Re, Mi..., with optional # or b)
  const match = chordStr.match(/^([a-zA-Z]{2,3}[#b]?)(.*)$/);

  if (!match)
    return { note: chordStr, modifier: '', isValid: false, isLowercase: false };

  const rawNote = match[1];
  const modifier = match[2];
  const note = normalizeNote(rawNote);
  const isLowercase =
    rawNote.length > 0 && rawNote[0] === rawNote[0].toLowerCase();

  return {
    note,
    modifier,
    isValid: NOTES.includes(note),
    isLowercase,
  };
};

/**
 * Transposes a chord by a specific number of semitones.
 */
export const transposeChord = (chordStr: string, steps: number): string => {
  const parsed = parseChord(chordStr);
  if (!parsed.isValid) return chordStr; // Return as-is if we couldn't parse it

  const currentIndex = NOTES.indexOf(parsed.note);
  if (currentIndex === -1) return chordStr;

  // Calculate new index with wrap-around
  // (currentIndex + steps) mod 12, but handling negative numbers securely
  let newIndex = (currentIndex + steps) % 12;
  if (newIndex < 0) newIndex += 12;

  let newNote = NOTES[newIndex];
  if (parsed.isLowercase) {
    newNote = newNote.toLowerCase();
  }

  return `${newNote}${parsed.modifier}`;
};

/**
 * Pads a chord string to exactly CHORD_MAX_LENGTH using trailing spaces.
 * This guarantees that when parsing the "Dos Lineas" format,
 * chords won't push subsequent lyrics/chords horizontally
 * when transposed.
 */
export const padChord = (chordStr: string): string => {
  // If it's longer than max length, we truncate it slightly or just return it (extreme edge case)
  if (chordStr.length > CHORD_MAX_LENGTH) {
    return chordStr.substring(0, CHORD_MAX_LENGTH);
  }
  return chordStr.padEnd(CHORD_MAX_LENGTH, ' ');
};
