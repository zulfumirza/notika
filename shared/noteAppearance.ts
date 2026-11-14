export const NOTE_ICON_IDS = [
  'file',
  'sparkles',
  'book',
  'code',
  'lightbulb',
  'check-square',
  'star',
  'heart',
  'rocket',
  'bookmark',
  'terminal',
  'calendar',
  'flame',
] as const;

export type LegacyNoteIconId = (typeof NOTE_ICON_IDS)[number];
export type NoteIconId = string;

export const NOTE_COLOR_IDS = [
  'default',
  'emerald',
  'sky',
  'violet',
  'amber',
  'rose',
  'indigo',
  'orange',
  'teal',
] as const;

export type NoteColorId = (typeof NOTE_COLOR_IDS)[number];

const EMOJI_CHAR_REGEX =
  /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|\u20E3)/u;

export function isEmojiString(raw: string): boolean {
  const cleaned = raw.replace(/[\r\n\x00-\x1F\x7F]/g, '').trim();
  if (cleaned.length === 0 || cleaned.length > 24) return false;
  return EMOJI_CHAR_REGEX.test(cleaned);
}

export function extractFirstEmoji(raw: string): string | undefined {
  const cleaned = raw.replace(/[\r\n\x00-\x1F\x7F]/g, '').trim();
  if (!cleaned) return undefined;

  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    for (const seg of segmenter.segment(cleaned)) {
      if (EMOJI_CHAR_REGEX.test(seg.segment)) {
        return seg.segment;
      }
    }
    return undefined;
  }

  return EMOJI_CHAR_REGEX.test(cleaned) ? cleaned.slice(0, 8) : undefined;
}

export function normalizeNoteIconId(raw: unknown): NoteIconId | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = raw.replace(/[\r\n\x00-\x1F\x7F]/g, '').trim();
  if (cleaned.length === 0) return undefined;

  const lower = cleaned.toLowerCase();
  if (lower === 'default' || lower === 'file') {
    return undefined;
  }

  if ((NOTE_ICON_IDS as readonly string[]).includes(lower)) {
    return lower;
  }

  if (isEmojiString(cleaned)) {
    return extractFirstEmoji(cleaned) ?? cleaned.slice(0, 24);
  }

  return undefined;
}

export function normalizeNoteColorId(raw: unknown): NoteColorId | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = raw.trim().toLowerCase();
  if (cleaned.length === 0 || cleaned === 'default') {
    return undefined;
  }
  return (NOTE_COLOR_IDS as readonly string[]).includes(cleaned)
    ? (cleaned as NoteColorId)
    : undefined;
}
