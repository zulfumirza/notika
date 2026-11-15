import { useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Command, Keyboard, Search, Type, X } from 'lucide-react';
import type { TranslationStrings } from '../i18n/translations';

interface KeyboardShortcutsModalProps {
  open: boolean;
  tabSize: 2 | 4;
  t: TranslationStrings;
  onClose: () => void;
}

interface ShortcutEntry {
  id: string;
  description: string;
  keys: string[];
}

interface ShortcutGroup {
  id: string;
  title: string;
  icon: 'global' | 'navigation' | 'markdown' | 'rich';
  items: ShortcutEntry[];
}

export function KeyboardShortcutsModal({
  open,
  tabSize,
  t,
  onClose,
}: KeyboardShortcutsModalProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, onClose]);

  const groups: ShortcutGroup[] = useMemo(
    () => [
      {
        id: 'global',
        title: t.shortcutGroupGlobal,
        icon: 'global',
        items: [
          {
            id: 'quick-search',
            description: t.shortcutQuickSearch,
            keys: ['Ctrl / ⌘', 'K'],
          },
          {
            id: 'save-note',
            description: t.shortcutSaveNote,
            keys: ['Ctrl / ⌘', 'S'],
          },
          {
            id: 'copy-markdown',
            description: t.shortcutCopyMarkdown,
            keys: ['Ctrl / ⌘', 'Shift', 'C'],
          },
          {
            id: 'open-help',
            description: t.shortcutOpenHelp,
            keys: ['Ctrl / ⌘', '/'],
          },
          {
            id: 'open-help-alt',
            description: t.shortcutOpenHelp,
            keys: ['?'],
          },
          {
            id: 'close-modal',
            description: t.shortcutCloseModal,
            keys: ['Esc'],
          },
        ],
      },
      {
        id: 'navigation',
        title: t.shortcutGroupNavigation,
        icon: 'navigation',
        items: [
          {
            id: 'tab-nav',
            description: t.shortcutTabNav,
            keys: ['Tab', 'Shift + Tab'],
          },
          {
            id: 'search-arrows',
            description: t.shortcutSearchArrows,
            keys: ['↑', '↓'],
          },
          {
            id: 'search-enter',
            description: t.shortcutSearchEnter,
            keys: ['Enter'],
          },
        ],
      },
      {
        id: 'markdown',
        title: t.shortcutGroupMarkdown,
        icon: 'markdown',
        items: [
          {
            id: 'md-indent',
            description: `${t.shortcutIndent} (${tabSize} ${t.spacesUnit})`,
            keys: ['Tab'],
          },
        ],
      },
      {
        id: 'rich',
        title: t.shortcutGroupRichEditor,
        icon: 'rich',
        items: [
          {
            id: 'rich-bold',
            description: t.shortcutBold,
            keys: ['Ctrl / ⌘', 'B'],
          },
          {
            id: 'rich-italic',
            description: t.shortcutItalic,
            keys: ['Ctrl / ⌘', 'I'],
          },
          {
            id: 'rich-underline',
            description: t.shortcutUnderline,
            keys: ['Ctrl / ⌘', 'U'],
          },
        ],
      },
    ],
    [t, tabSize]
  );

  const normalizedQuery = query.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.description.toLowerCase().includes(normalizedQuery) ||
            item.keys.some((k) => k.toLowerCase().includes(normalizedQuery)) ||
            group.title.toLowerCase().includes(normalizedQuery)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, normalizedQuery]);

  if (!open) return null;

  const renderGroupIcon = (icon: ShortcutGroup['icon']) => {
    switch (icon) {
      case 'global':
        return <Command className="h-4 w-4 text-accent" />;
      case 'navigation':
        return <Keyboard className="h-4 w-4 text-accent" />;
      case 'markdown':
        return <Code2 className="h-4 w-4 text-accent" />;
      case 'rich':
        return <Type className="h-4 w-4 text-accent" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 backdrop-blur-xs sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
      onClick={onClose}
    >
      <div
        className="shadow-card max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-[#18181B] p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex max-h-[86vh] flex-col rounded-xl border border-white/[0.08] bg-black">
          <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
                <Keyboard className="h-4 w-4" />
              </div>
              <div>
                <h2
                  id="shortcuts-modal-title"
                  className="text-base font-medium text-[#FAFAFA]"
                >
                  {t.keyboardShortcuts}
                </h2>
                <p className="mt-0.5 text-xs text-[#A1A1AA]">
                  {t.keyboardShortcutsDesc}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.cancel}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#A1A1AA] transition-colors hover:bg-[#18181B] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b border-white/[0.08] px-5 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-[#71717A]" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.shortcutSearchPlaceholder}
                aria-label={t.shortcutSearchPlaceholder}
                className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#111113] pe-3 ps-9 text-xs text-[#FAFAFA] placeholder-[#71717A] outline-none transition-colors focus:border-accent"
              />
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {filteredGroups.length === 0 ? (
              <p className="py-8 text-center text-xs text-[#71717A]">
                {t.noMatchingItems}
              </p>
            ) : (
              filteredGroups.map((group) => (
                <section
                  key={group.id}
                  className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111113]"
                >
                  <div className="flex items-center gap-2 border-b border-white/[0.08] bg-[#18181B]/60 px-4 py-2.5 text-xs font-semibold tracking-wide text-[#FAFAFA]">
                    {renderGroupIcon(group.icon)}
                    <span>{group.title}</span>
                  </div>
                  <ul className="divide-y divide-white/[0.06]">
                    {group.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
                      >
                        <span className="text-[#D4D4D8]">
                          {item.description}
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {item.keys.map((keyPart, idx) => (
                            <span
                              key={`${item.id}-${keyPart}`}
                              className="inline-flex items-center gap-1"
                            >
                              {idx > 0 && (
                                <span className="text-[10px] text-[#71717A]">
                                  +
                                </span>
                              )}
                              <kbd className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-md border border-white/[0.14] bg-[#09090B] px-2 py-0.5 font-mono text-[11px] font-medium text-[#FAFAFA] shadow-xs">
                                {keyPart}
                              </kbd>
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t border-white/[0.08] px-5 py-3 text-[11px] text-[#71717A]">
            <span>{t.shortcutEscHint}</span>
            <kbd className="rounded border border-white/[0.1] bg-[#111113] px-1.5 py-0.5 font-mono text-[10px] text-[#A1A1AA]">
              Esc
            </kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
