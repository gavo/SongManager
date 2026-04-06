export interface ChordPosition {
  chord: string;
  index: number; // The character index where this chord appears on the line
}

export interface SongLineGroup {
  id: string;
  chordsLine: string | null;
  lyricsLine: string | null;
  parsedChords: ChordPosition[];
}

/**
 * Extracts exact positions of chords in a chord line
 * so we can render them precisely over the lyrics.
 */
export const extractChordsPositions = (chordLine: string): ChordPosition[] => {
  const positions: ChordPosition[] = [];
  const regex = /\S+/g;
  let match;

  while ((match = regex.exec(chordLine)) !== null) {
    positions.push({
      chord: match[0],
      index: match.index,
    });
  }

  return positions;
};

/**
 * Parses raw song text into grouped lines of (Chords + Lyrics)
 * Enforces strict Odd vs Even rule:
 * - Line 1 (Odd) -> Chords
 * - Line 2 (Even) -> Lyrics
 * Empty lines reset the cadence counter so fresh paragraphs start with chords again.
 */
export const parseSongText = (rawText: string): SongLineGroup[] => {
  const lines = rawText.split(/\r?\n/);
  const groups: SongLineGroup[] = [];

  for (let i = 0; i < lines.length; i += 2) {
    const chordsLine = lines[i];
    const lyricsLine = i + 1 < lines.length ? lines[i + 1] : null;

    groups.push({
      id: `line_group_${i}`,
      chordsLine: chordsLine,
      lyricsLine: lyricsLine,
      parsedChords: extractChordsPositions(chordsLine)
    });
  }

  return groups;
};
