import { useEffect } from 'react';
import { Folder, Palette, X } from 'lucide-react';
import type { TranslationStrings } from '../i18n/translations';
import type { NoteColorId, NoteIconId } from '../types/vault';
import {
  NoteAppearancePicker,
  NoteIconGlyph,
  getNoteColorStyle,
} from './NoteIconDisplay';

export interface AppearanceModalTarget {
  kind?: 'note' | 'project';
  project: string;
  name?: string;
  title: string;
  icon?: NoteIconId;
  color?: NoteColorId;
}

interface NoteAppearanceModalProps {
  target: AppearanceModalTarget | null;
  busy: boolean;
  t: TranslationStrings;
  onSelect: (next: {
    icon: NoteIconId | null;
    color: NoteColorId | null;
  }) => Promise<void>;
  onClose: () => void;
}

export function NoteAppearanceModal({
  target,
  busy,
  t,
  onSelect,
  onClose,
}: NoteAppearanceModalProps) {
  useEffect(() => {
    if (!target) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [target, busy, onClose]);

  if (!target) return null;

  const isProject = target.kind === 'project';
  const colorStyle = getNoteColorStyle(target.color);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="note-appearance-modal-title"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="shadow-card w-full max-w-md rounded-2xl bg-[#18181B] p-2"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex max-h-[90vh] flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-black">
          <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                  target.color
                    ? colorStyle.badgeClass
                    : 'border-accent/30 bg-accent/10 text-accent'
                }`}
              >
                {target.icon || target.color ? (
                  <NoteIconGlyph
                    icon={target.icon}
                    isFolder={isProject}
                    className="h-4 w-4"
                  />
                ) : isProject ? (
                  <Folder className="h-4 w-4" />
                ) : (
                  <Palette className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0">
                <h2
                  id="note-appearance-modal-title"
                  className="truncate text-sm font-medium text-[#FAFAFA]"
                >
                  {t.appearanceTitle}
                </h2>
                <p className="truncate text-xs text-[#71717A]">
                  {target.title}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              aria-label={t.cancel}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#A1A1AA] transition-colors hover:bg-[#18181B] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto p-4">
            <NoteAppearancePicker
              icon={target.icon}
              color={target.color}
              busy={busy}
              defaultKind={isProject ? 'project' : 'note'}
              pickerHeight={320}
              t={t}
              onSelect={(next) => {
                void onSelect(next);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
