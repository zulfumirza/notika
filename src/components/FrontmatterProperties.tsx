import { useEffect, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Hash,
  Plus,
  SlidersHorizontal,
  Tag,
  ToggleLeft,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import type {
  FrontmatterProperty,
  FrontmatterPropertyKind,
} from '../../shared/frontmatter.ts';
import type { TranslationStrings } from '../i18n/translations';

interface FrontmatterPropertiesProps {
  noteKey: string;
  properties: FrontmatterProperty[];
  hasFrontmatter: boolean;
  readOnly?: boolean;
  t: TranslationStrings;
  onChangeProperties: (nextProperties: FrontmatterProperty[]) => void;
}

function PropertyIcon({ kind, propKey }: { kind: FrontmatterPropertyKind; propKey: string }) {
  const lower = propKey.toLowerCase();
  if (kind === 'list' || lower === 'tags' || lower === 'tag') {
    return <Tag className="h-3.5 w-3.5 shrink-0 text-[#34D399]" />;
  }
  if (kind === 'date') {
    return <Calendar className="h-3.5 w-3.5 shrink-0 text-sky-400" />;
  }
  if (kind === 'number') {
    return <Hash className="h-3.5 w-3.5 shrink-0 text-amber-400" />;
  }
  if (kind === 'boolean') {
    return <ToggleLeft className="h-3.5 w-3.5 shrink-0 text-violet-400" />;
  }
  return <Type className="h-3.5 w-3.5 shrink-0 text-[#A1A1AA]" />;
}

function ListPropertyEditor({
  items,
  readOnly,
  placeholder,
  onChange,
}: {
  items: string[];
  readOnly: boolean;
  placeholder: string;
  onChange: (nextItems: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const commitItem = (raw: string) => {
    const cleaned = raw.replace(/,/g, '').trim();
    if (!cleaned) return;
    if (!items.includes(cleaned)) {
      onChange([...items, cleaned]);
    }
    setDraft('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitItem(draft);
    } else if (
      event.key === 'Backspace' &&
      draft.length === 0 &&
      items.length > 0
    ) {
      onChange(items.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-[#34D399]"
        >
          <span>{item}</span>
          {!readOnly && (
            <button
              type="button"
              onClick={() => onChange(items.filter((x) => x !== item))}
              aria-label={`Remove ${item}`}
              className="rounded p-0.5 text-emerald-300/70 transition-colors hover:bg-emerald-500/20 hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}

      {!readOnly && (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (draft.trim()) commitItem(draft);
          }}
          placeholder={placeholder}
          className="h-6 min-w-[90px] flex-1 bg-transparent px-1 text-xs text-[#E4E4E7] placeholder-[#52525B] outline-none"
        />
      )}
    </div>
  );
}

export function FrontmatterProperties({
  noteKey,
  properties,
  hasFrontmatter,
  readOnly = false,
  t,
  onChangeProperties,
}: FrontmatterPropertiesProps) {
  const [expanded, setExpanded] = useState(properties.length > 0);
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newKind, setNewKind] = useState<FrontmatterPropertyKind>('text');
  const [newValue, setNewValue] = useState('');

  useEffect(() => {
    setExpanded(properties.length > 0);
    setAdding(false);
    setNewKey('');
    setNewValue('');
  }, [noteKey]);

  // If frontmatter appears externally (e.g. typed in Markdown mode), expand automatically once
  useEffect(() => {
    if (properties.length > 0 && hasFrontmatter) {
      setExpanded(true);
    }
  }, [hasFrontmatter, properties.length > 0]);

  const handleKeyInputChange = (val: string) => {
    setNewKey(val);
    const lower = val.trim().toLowerCase();
    if (lower === 'tags' || lower === 'tag' || lower === 'aliases') {
      setNewKind('list');
    } else if (lower === 'date' || lower === 'created' || lower === 'updated' || lower === 'tarih') {
      setNewKind('date');
      if (!newValue) {
        setNewValue(new Date().toISOString().slice(0, 10));
      }
    }
  };

  const handleUpdateProperty = (
    index: number,
    updated: FrontmatterProperty
  ) => {
    const next = [...properties];
    next[index] = updated;
    onChangeProperties(next);
  };

  const handleRemoveProperty = (index: number) => {
    onChangeProperties(properties.filter((_, idx) => idx !== index));
  };

  const handleAddSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanKey = newKey.replace(/[:\r\n]/g, '').trim();
    if (!cleanKey) return;

    let parsedValue: FrontmatterProperty['value'];
    if (newKind === 'list') {
      parsedValue = newValue
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (newKind === 'boolean') {
      parsedValue = newValue === 'true';
    } else if (newKind === 'number') {
      const n = Number(newValue);
      parsedValue = Number.isFinite(n) ? n : 0;
    } else {
      parsedValue = newValue.trim();
    }

    const existingIdx = properties.findIndex(
      (p) => p.key.toLowerCase() === cleanKey.toLowerCase()
    );
    if (existingIdx >= 0) {
      handleUpdateProperty(existingIdx, {
        key: cleanKey,
        value: parsedValue,
        kind: newKind,
      });
    } else {
      onChangeProperties([
        ...properties,
        { key: cleanKey, value: parsedValue, kind: newKind },
      ]);
    }

    setNewKey('');
    setNewValue('');
    setNewKind('text');
    setAdding(false);
    setExpanded(true);
  };

  // Build compact summary for collapsed state
  const summaryTags = properties.find(
    (p) => p.key.toLowerCase() === 'tags' || p.key.toLowerCase() === 'tag'
  );
  const summaryDate = properties.find(
    (p) => p.kind === 'date' || p.key.toLowerCase() === 'date'
  );

  if (readOnly && properties.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0B0B0D]">
      {/* Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="flex min-w-0 items-center gap-2 text-xs font-medium text-[#A1A1AA] transition-colors hover:text-[#FAFAFA]"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          )}
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-[#34D399]" />
          <span>{t.properties}</span>
          {properties.length > 0 && (
            <span className="rounded bg-[#18181B] px-1.5 py-0.5 text-[10px] text-[#E4E4E7] tabular-nums">
              {properties.length}
            </span>
          )}

          {!expanded && summaryTags && Array.isArray(summaryTags.value) && summaryTags.value.length > 0 && (
            <span className="hidden items-center gap-1 sm:inline-flex">
              {summaryTags.value.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-[#34D399]"
                >
                  #{tag}
                </span>
              ))}
            </span>
          )}

          {!expanded && summaryDate && typeof summaryDate.value === 'string' && summaryDate.value && (
            <span className="hidden font-mono text-[11px] text-[#71717A] md:inline">
              {summaryDate.value}
            </span>
          )}
        </button>

        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              setExpanded(true);
              setAdding((prev) => !prev);
            }}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-[#A1A1AA] transition-colors hover:bg-[#18181B] hover:text-[#34D399]"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t.addProperty}</span>
          </button>
        )}
      </div>

      {/* Expanded Properties Table */}
      {expanded && (
        <div className="space-y-1.5 border-t border-white/[0.06] px-3 py-2.5">
          {properties.map((prop, index) => (
            <div
              key={`${prop.key}-${index}`}
              className="group flex flex-col gap-1.5 rounded-lg bg-[#111113] px-2.5 py-1.5 sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="flex w-full shrink-0 items-center gap-2 sm:w-40">
                <PropertyIcon kind={prop.kind} propKey={prop.key} />
                <span className="truncate font-mono text-xs font-medium text-[#A1A1AA]">
                  {prop.key}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                {prop.kind === 'list' && Array.isArray(prop.value) ? (
                  <ListPropertyEditor
                    items={prop.value}
                    readOnly={readOnly}
                    placeholder={t.addTagPlaceholder}
                    onChange={(nextItems) =>
                      handleUpdateProperty(index, {
                        ...prop,
                        value: nextItems,
                      })
                    }
                  />
                ) : prop.kind === 'boolean' && typeof prop.value === 'boolean' ? (
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() =>
                      handleUpdateProperty(index, {
                        ...prop,
                        value: !prop.value,
                      })
                    }
                    aria-pressed={prop.value}
                    className={`inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${
                      prop.value ? 'bg-[#34D399]' : 'bg-[#27272A]'
                    }`}
                  >
                    <span
                      className={`h-5 w-5 rounded-full bg-black transition-transform ${
                        prop.value ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                ) : prop.kind === 'date' &&
                  typeof prop.value === 'string' &&
                  (/^\d{4}-\d{2}-\d{2}$/.test(prop.value) || prop.value === '') ? (
                  <input
                    type="date"
                    disabled={readOnly}
                    value={prop.value}
                    onChange={(e) =>
                      handleUpdateProperty(index, {
                        ...prop,
                        value: e.target.value,
                      })
                    }
                    className="h-7 rounded border border-white/[0.08] bg-black px-2 font-mono text-xs text-[#E4E4E7] outline-none focus:border-[#34D399] disabled:opacity-75"
                  />
                ) : prop.kind === 'number' ? (
                  <input
                    type="number"
                    disabled={readOnly}
                    value={String(prop.value)}
                    onChange={(e) => {
                      const num = Number(e.target.value);
                      handleUpdateProperty(index, {
                        ...prop,
                        value: Number.isFinite(num) ? num : 0,
                      });
                    }}
                    className="h-7 w-full max-w-xs bg-transparent font-mono text-xs text-[#E4E4E7] outline-none focus:text-white disabled:opacity-75"
                  />
                ) : (
                  <input
                    type="text"
                    disabled={readOnly}
                    value={String(prop.value)}
                    onChange={(e) =>
                      handleUpdateProperty(index, {
                        ...prop,
                        value: e.target.value,
                      })
                    }
                    placeholder={t.propertyValuePlaceholder}
                    className="h-7 w-full bg-transparent text-xs text-[#E4E4E7] placeholder-[#52525B] outline-none focus:text-white disabled:opacity-75"
                  />
                )}
              </div>

              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleRemoveProperty(index)}
                  aria-label={`Remove ${prop.key}`}
                  className="self-end rounded p-1 text-[#71717A] opacity-100 transition-colors hover:bg-rose-500/15 hover:text-rose-400 sm:self-center sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}

          {adding && !readOnly && (
            <form
              onSubmit={handleAddSubmit}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-[#111113] p-2"
            >
              <input
                type="text"
                autoFocus
                required
                value={newKey}
                onChange={(e) => handleKeyInputChange(e.target.value)}
                placeholder={t.propertyKeyPlaceholder}
                className="h-8 min-w-[140px] flex-1 rounded-md border border-white/[0.1] bg-black px-2.5 font-mono text-xs text-white placeholder-[#71717A] outline-none focus:border-[#34D399]"
              />

              <select
                value={newKind}
                onChange={(e) =>
                  setNewKind(e.target.value as FrontmatterPropertyKind)
                }
                aria-label="Property type"
                className="h-8 rounded-md border border-white/[0.1] bg-black px-2 text-xs text-[#E4E4E7] outline-none focus:border-[#34D399]"
              >
                <option value="text">{t.propTypeText}</option>
                <option value="list">{t.propTypeList}</option>
                <option value="date">{t.propTypeDate}</option>
                <option value="number">{t.propTypeNumber}</option>
                <option value="boolean">{t.propTypeBoolean}</option>
              </select>

              {newKind === 'boolean' ? (
                <select
                  value={newValue === 'true' ? 'true' : 'false'}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="h-8 rounded-md border border-white/[0.1] bg-black px-2 text-xs text-[#E4E4E7] outline-none focus:border-[#34D399]"
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  type={
                    newKind === 'date'
                      ? 'date'
                      : newKind === 'number'
                        ? 'number'
                        : 'text'
                  }
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder={
                    newKind === 'list'
                      ? 'tag1, tag2'
                      : t.propertyValuePlaceholder
                  }
                  className="h-8 min-w-[140px] flex-1 rounded-md border border-white/[0.1] bg-black px-2.5 text-xs text-white placeholder-[#71717A] outline-none focus:border-[#34D399]"
                />
              )}

              <div className="flex items-center gap-1">
                <button
                  type="submit"
                  aria-label={t.addProperty}
                  className="btn-primary-tactile flex h-8 w-8 items-center justify-center rounded-md"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  aria-label={t.cancel}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.1] bg-black text-[#A1A1AA] hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
