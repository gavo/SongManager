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

  let pendingChordLine: string | null = null;
  let expectedType: 'chords' | 'lyrics' = 'chords';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === '') {
      // Empty line, flush any pending chord line that didn't have lyrics
      if (pendingChordLine) {
        groups.push({
          id: `line_${i}_chords_only`,
          chordsLine: pendingChordLine,
          lyricsLine: null,
          parsedChords: extractChordsPositions(pendingChordLine),
        });
        pendingChordLine = null;
      }

      // push an empty group representing a break
      groups.push({
        id: `line_${i}_empty`,
        chordsLine: null,
        lyricsLine: '',
        parsedChords: [],
      });

      // Reset cadence
      expectedType = 'chords';
      continue;
    }

    if (expectedType === 'chords') {
      pendingChordLine = line;
      expectedType = 'lyrics';
    } else {
      // Lyrics line
      groups.push({
        id: `line_${i}_full`,
        chordsLine: pendingChordLine,
        lyricsLine: line,
        parsedChords: pendingChordLine
          ? extractChordsPositions(pendingChordLine)
          : [],
      });
      pendingChordLine = null;
      expectedType = 'chords';
    }
  }

  // Flush any remaining chord line at the end of the song
  if (pendingChordLine) {
    groups.push({
      id: `line_final_chords_only`,
      chordsLine: pendingChordLine,
      lyricsLine: null,
      parsedChords: extractChordsPositions(pendingChordLine),
    });
  }

  return groups;
};
