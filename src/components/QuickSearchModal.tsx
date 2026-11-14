import { useEffect, useRef, useState } from 'react';
import { FileText, Folder, Loader2, Search, X } from 'lucide-react';
import type { TranslationStrings } from '../i18n/translations';
import { searchVault } from '../lib/api';
import type { ActiveNoteRef, SearchResultItem } from '../types/vault';

interface QuickSearchModalProps {
  open: boolean;
  t: TranslationStrings;
  onClose: () => void;
  onSelectNote: (noteRef: ActiveNoteRef) => void;
}

export function QuickSearchModal({
  open,
  t,
  onClose,
  onSelectNote,
}: QuickSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedIndex(0);
      return;
    }

    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 10);

    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const items = await searchVault(query);
        if (!cancelled) {
          setResults(items);
          setSelectedIndex(0);
        }
      } catch {
        if (!cancelled) {
          setResults([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((prev) =>
          results.length === 0 ? 0 : (prev + 1) % results.length
        );
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((prev) =>
          results.length === 0
            ? 0
            : (prev - 1 + results.length) % results.length
        );
        return;
      }

      if (event.key === 'Enter' && results[selectedIndex]) {
        event.preventDefault();
        const picked = results[selectedIndex];
        onSelectNote({ project: picked.project, name: picked.name });
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, results, selectedIndex, onClose, onSelectNote]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 px-3 pt-[8vh] backdrop-blur-xs sm:px-4 sm:pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label={t.quickSearch}
      onClick={onClose}
    >
      <div
        className="shadow-card w-full max-w-2xl rounded-2xl bg-[#18181B] p-2"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black">
          <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3.5">
            <Search className="h-4 w-4 shrink-0 text-[#A1A1AA]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full bg-transparent text-sm text-[#FAFAFA] placeholder-[#71717A] outline-none"
            />
            {loading && (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#A1A1AA]" />
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t.cancel}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#A1A1AA] transition-colors hover:bg-[#18181B] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[58vh] overflow-y-auto p-2">
            {!loading && results.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-[#A1A1AA]">
                {t.noNotesFound}
              </div>
            ) : (
              <ul className="space-y-1">
                {results.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <li key={`${item.project}/${item.name}`}>
                      <button
                        type="button"
                        onMouseEnter={() => setSelectedIndex(idx)}
                        onClick={() => {
                          onSelectNote({
                            project: item.project,
                            name: item.name,
                          });
                          onClose();
                        }}
                        className={`flex w-full flex-col gap-1 rounded-lg px-3.5 py-2.5 text-left transition-colors ${
                          isSelected
                            ? 'bg-[#18181B] text-white'
                            : 'text-[#D4D4D8] hover:bg-[#141417]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <FileText className="h-4 w-4 shrink-0 text-[#34D399]" />
                            <span className="truncate text-sm font-medium text-[#FAFAFA]">
                              {item.title}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5 text-xs text-[#A1A1AA]">
                            <Folder className="h-3.5 w-3.5" />
                            <span>{item.project}</span>
                            {item.matchCount > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="tabular-nums">
                                  {item.matchCount}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <p className="truncate pl-6 text-xs text-[#A1A1AA]">
                          {item.snippet}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-white/[0.08] bg-[#111113] px-4 py-2 text-xs text-[#71717A]">
            <div className="hidden items-center gap-3 sm:flex">
              <span>↑↓</span>
              <span aria-hidden="true">·</span>
              <span>Enter</span>
              <span aria-hidden="true">·</span>
              <span>Esc</span>
            </div>
            <span className="tabular-nums">{results.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
