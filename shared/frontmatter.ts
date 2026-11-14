import {
  normalizeNoteColorId,
  normalizeNoteIconId,
  type NoteColorId,
  type NoteIconId,
} from './noteAppearance.ts';

export type FrontmatterValue = string | number | boolean | string[];

export type FrontmatterPropertyKind =
  | 'text'
  | 'date'
  | 'number'
  | 'boolean'
  | 'list';

export interface FrontmatterProperty {
  key: string;
  value: FrontmatterValue;
  kind: FrontmatterPropertyKind;
}

export interface ParsedFrontmatter {
  hasFrontmatter: boolean;
  rawBlock: string;
  separator: string;
  properties: FrontmatterProperty[];
  extraRawLines: string[];
  body: string;
}

const DATE_VALUE_REGEX = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const PURE_NUMBER_REGEX = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

function stripQuotes(raw: string): { value: string; wasQuoted: boolean } {
  const trimmed = raw.trim();
  if (trimmed.length >= 2) {
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return {
        value: trimmed
          .slice(1, -1)
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\'),
        wasQuoted: true,
      };
    }
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      return {
        value: trimmed.slice(1, -1).replace(/''/g, "'"),
        wasQuoted: true,
      };
    }
  }
  return { value: trimmed, wasQuoted: false };
}

function parseInlineArray(raw: string): string[] {
  const inner = raw.trim().slice(1, -1).trim();
  if (inner.length === 0) return [];

  const items: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i]!;
    if (quote) {
      if (ch === quote && inner[i - 1] !== '\\') {
        quote = null;
      }
      current += ch;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }

    if (ch === ',') {
      const cleaned = stripQuotes(current).value;
      if (cleaned.length > 0) items.push(cleaned);
      current = '';
      continue;
    }

    current += ch;
  }

  const tail = stripQuotes(current).value;
  if (tail.length > 0) items.push(tail);
  return items;
}

function isDateKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower === 'date' ||
    lower === 'created' ||
    lower === 'updated' ||
    lower === 'tarih' ||
    lower.endsWith('_date') ||
    lower.endsWith('-date') ||
    lower.endsWith('at')
  );
}

function isListKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower === 'tags' ||
    lower === 'tag' ||
    lower === 'aliases' ||
    lower === 'categories' ||
    lower === 'keywords'
  );
}

function parseScalar(
  key: string,
  rawVal: string
): { value: FrontmatterValue; kind: FrontmatterPropertyKind } {
  const trimmed = rawVal.trim();

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return { value: parseInlineArray(trimmed), kind: 'list' };
  }

  const { value: unquoted, wasQuoted } = stripQuotes(trimmed);

  if (!wasQuoted) {
    if (unquoted.toLowerCase() === 'true') {
      return { value: true, kind: 'boolean' };
    }
    if (unquoted.toLowerCase() === 'false') {
      return { value: false, kind: 'boolean' };
    }
    if (PURE_NUMBER_REGEX.test(unquoted)) {
      const num = Number(unquoted);
      if (Number.isFinite(num)) {
        return { value: num, kind: 'number' };
      }
    }
  }

  if (DATE_VALUE_REGEX.test(unquoted) || (isDateKey(key) && unquoted.length > 0)) {
    return { value: unquoted, kind: 'date' };
  }

  if (isListKey(key)) {
    const split = unquoted
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return { value: split, kind: 'list' };
  }

  return { value: unquoted, kind: 'text' };
}

export function parseFrontmatter(rawMarkdown: string): ParsedFrontmatter {
  const normalized = rawMarkdown.startsWith('\uFEFF')
    ? rawMarkdown.slice(1)
    : rawMarkdown;

  const lines = normalized.split(/\r?\n/);
  if (lines.length < 2 || lines[0]?.trim() !== '---') {
    return {
      hasFrontmatter: false,
      rawBlock: '',
      separator: '',
      properties: [],
      extraRawLines: [],
      body: normalized,
    };
  }

  let closingIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    const trimmed = lines[i]?.trim();
    if (trimmed === '---' || trimmed === '...') {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    return {
      hasFrontmatter: false,
      rawBlock: '',
      separator: '',
      properties: [],
      extraRawLines: [],
      body: normalized,
    };
  }

  const eol = rawMarkdown.includes('\r\n') ? '\r\n' : '\n';
  const frontmatterLines = lines.slice(1, closingIndex);
  const rawBlock = lines.slice(0, closingIndex + 1).join(eol) + eol;

  const remainingLines = lines.slice(closingIndex + 1);
  let separator = '';
  let bodyStart = 0;
  if (remainingLines.length > 0 && remainingLines[0]?.trim() === '') {
    separator = eol;
    bodyStart = 1;
  }
  const body = remainingLines.slice(bodyStart).join(eol);

  const properties: FrontmatterProperty[] = [];
  const extraRawLines: string[] = [];

  let i = 0;
  while (i < frontmatterLines.length) {
    const line = frontmatterLines[i] ?? '';
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      if (trimmed.startsWith('#')) {
        extraRawLines.push(line);
      }
      i += 1;
      continue;
    }

    const keyMatch = /^([A-Za-z0-9_.\-\u00C0-\u024F ]+?):(?:\s+(.*))?$/.exec(
      line
    );
    if (!keyMatch || line.startsWith(' ') || line.startsWith('\t')) {
      extraRawLines.push(line);
      i += 1;
      continue;
    }

    const key = keyMatch[1]!.trim();
    const rest = (keyMatch[2] ?? '').trim();

    if (rest.length === 0) {
      // Check for indented YAML list items ("  - item") or nested lines
      const listItems: string[] = [];
      const nestedLines: string[] = [];
      let j = i + 1;
      while (j < frontmatterLines.length) {
        const nextLine = frontmatterLines[j] ?? '';
        const listMatch = /^\s+-\s+(.*)$/.exec(nextLine);
        if (listMatch) {
          listItems.push(stripQuotes(listMatch[1] ?? '').value);
          j += 1;
          continue;
        }
        if (/^\s+\S/.test(nextLine)) {
          nestedLines.push(nextLine);
          j += 1;
          continue;
        }
        break;
      }

      if (listItems.length > 0 && nestedLines.length === 0) {
        properties.push({
          key,
          value: listItems.filter((item) => item.length > 0),
          kind: 'list',
        });
        i = j;
        continue;
      }

      if (nestedLines.length > 0) {
        extraRawLines.push(line, ...nestedLines);
        i = j;
        continue;
      }

      properties.push({
        key,
        value: isListKey(key) ? [] : '',
        kind: isListKey(key) ? 'list' : isDateKey(key) ? 'date' : 'text',
      });
      i += 1;
      continue;
    }

    const parsedScalar = parseScalar(key, rest);
    properties.push({
      key,
      value: parsedScalar.value,
      kind: parsedScalar.kind,
    });
    i += 1;
  }

  return {
    hasFrontmatter: true,
    rawBlock,
    separator,
    properties,
    extraRawLines,
    body,
  };
}

function needsYamlQuotes(str: string): boolean {
  if (str.length === 0) return true;
  if (str !== str.trim()) return true;
  if (
    str === 'true' ||
    str === 'false' ||
    str === 'null' ||
    str === '~' ||
    PURE_NUMBER_REGEX.test(str)
  ) {
    return true;
  }
  if (/^[-?:[\]{}#&*!|>'"%@`]/.test(str)) return true;
  if (str.includes(': ') || str.includes(' #') || str.includes('\n')) return true;
  return false;
}

function formatYamlString(str: string): string {
  if (!needsYamlQuotes(str)) {
    return str;
  }
  const escaped = str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function serializeFrontmatterBlock(
  properties: FrontmatterProperty[],
  extraRawLines: string[] = [],
  eol = '\n'
): string {
  if (properties.length === 0 && extraRawLines.length === 0) {
    return '';
  }

  const out: string[] = ['---'];

  for (const prop of properties) {
    const safeKey = prop.key.replace(/[\r\n:]/g, '').trim();
    if (!safeKey) continue;

    if (Array.isArray(prop.value)) {
      if (prop.value.length === 0) {
        out.push(`${safeKey}: []`);
      } else {
        out.push(`${safeKey}:`);
        for (const item of prop.value) {
          const clean = item.trim();
          if (clean.length > 0) {
            out.push(`  - ${formatYamlString(clean)}`);
          }
        }
      }
    } else if (typeof prop.value === 'boolean') {
      out.push(`${safeKey}: ${prop.value ? 'true' : 'false'}`);
    } else if (typeof prop.value === 'number') {
      out.push(`${safeKey}: ${Number.isFinite(prop.value) ? prop.value : 0}`);
    } else {
      if (prop.kind === 'date' && DATE_VALUE_REGEX.test(prop.value.trim())) {
        out.push(`${safeKey}: ${prop.value.trim()}`);
      } else {
        out.push(`${safeKey}: ${formatYamlString(prop.value)}`);
      }
    }
  }

  for (const rawLine of extraRawLines) {
    out.push(rawLine);
  }

  out.push('---');
  return out.join(eol) + eol;
}

export function replaceFrontmatterBody(
  fullMarkdown: string,
  nextBody: string
): string {
  const parsed = parseFrontmatter(fullMarkdown);
  if (!parsed.hasFrontmatter) {
    return nextBody;
  }

  const eol = fullMarkdown.includes('\r\n') ? '\r\n' : '\n';
  const cleanedBody = nextBody.replace(/^\r?\n+/, '');
  if (cleanedBody.length === 0) {
    return parsed.rawBlock;
  }

  const sep = parsed.separator.length > 0 ? parsed.separator : eol;
  return `${parsed.rawBlock}${sep}${cleanedBody}`;
}

export function updateFrontmatterProperties(
  fullMarkdown: string,
  nextProperties: FrontmatterProperty[]
): string {
  const parsed = parseFrontmatter(fullMarkdown);
  const eol = fullMarkdown.includes('\r\n') ? '\r\n' : '\n';

  const block = serializeFrontmatterBlock(
    nextProperties,
    parsed.extraRawLines,
    eol
  );

  if (block.length === 0) {
    return parsed.body.replace(/^\r?\n+/, '');
  }

  const cleanedBody = parsed.body.replace(/^\r?\n+/, '');
  if (cleanedBody.length === 0) {
    return block;
  }

  const sep = parsed.separator.length > 0 ? parsed.separator : eol;
  return `${block}${sep}${cleanedBody}`;
}

export function extractTagsFromMarkdown(markdown: string): string[] {
  const parsed = parseFrontmatter(markdown);
  if (!parsed.hasFrontmatter) return [];

  const tagProp = parsed.properties.find(
    (p) => p.key.toLowerCase() === 'tags' || p.key.toLowerCase() === 'tag'
  );
  if (!tagProp) return [];

  if (Array.isArray(tagProp.value)) {
    return tagProp.value.map((t) => t.replace(/^#/, '').trim()).filter(Boolean);
  }

  if (typeof tagProp.value === 'string' && tagProp.value.trim().length > 0) {
    return tagProp.value
      .split(',')
      .map((t) => t.replace(/^#/, '').trim())
      .filter(Boolean);
  }

  return [];
}

export function isFrontmatterPinned(markdown: string): boolean {
  const parsed = parseFrontmatter(markdown);
  if (!parsed.hasFrontmatter) return false;
  const pinnedProp = parsed.properties.find(
    (p) => p.key.toLowerCase() === 'pinned'
  );
  if (!pinnedProp) return false;
  if (typeof pinnedProp.value === 'boolean') {
    return pinnedProp.value;
  }
  if (typeof pinnedProp.value === 'string') {
    return pinnedProp.value.trim().toLowerCase() === 'true';
  }
  return false;
}

export function setFrontmatterPinned(
  markdown: string,
  pinned: boolean
): string {
  const parsed = parseFrontmatter(markdown);
  const filtered = parsed.properties.filter(
    (p) => p.key.toLowerCase() !== 'pinned'
  );
  const nextProperties: FrontmatterProperty[] = pinned
    ? [{ key: 'pinned', value: true, kind: 'boolean' }, ...filtered]
    : filtered;
  return updateFrontmatterProperties(markdown, nextProperties);
}

export function extractNoteAppearance(markdown: string): {
  icon?: NoteIconId;
  color?: NoteColorId;
} {
  const parsed = parseFrontmatter(markdown);
  if (!parsed.hasFrontmatter) return {};

  const iconProp = parsed.properties.find(
    (p) => p.key.toLowerCase() === 'icon'
  );
  const colorProp = parsed.properties.find(
    (p) => p.key.toLowerCase() === 'color'
  );

  const icon =
    iconProp && typeof iconProp.value === 'string'
      ? normalizeNoteIconId(iconProp.value)
      : undefined;
  const color =
    colorProp && typeof colorProp.value === 'string'
      ? normalizeNoteColorId(colorProp.value)
      : undefined;

  return {
    ...(icon ? { icon } : {}),
    ...(color ? { color } : {}),
  };
}

export function setFrontmatterAppearance(
  markdown: string,
  appearance: {
    icon?: NoteIconId | string | null;
    color?: NoteColorId | string | null;
  }
): string {
  const parsed = parseFrontmatter(markdown);
  const current = extractNoteAppearance(markdown);

  const nextIcon =
    appearance.icon !== undefined
      ? normalizeNoteIconId(appearance.icon)
      : current.icon;
  const nextColor =
    appearance.color !== undefined
      ? normalizeNoteColorId(appearance.color)
      : current.color;

  const filtered = parsed.properties.filter((p) => {
    const k = p.key.toLowerCase();
    return k !== 'icon' && k !== 'color';
  });

  const extraProps: FrontmatterProperty[] = [];
  if (nextIcon) {
    extraProps.push({ key: 'icon', value: nextIcon, kind: 'text' });
  }
  if (nextColor) {
    extraProps.push({ key: 'color', value: nextColor, kind: 'text' });
  }

  return updateFrontmatterProperties(markdown, [...extraProps, ...filtered]);
}

