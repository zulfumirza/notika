import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { FilePlus2, FolderPlus, Loader2, X } from 'lucide-react';
import type { TranslationStrings } from '../i18n/translations';
import type { NoteColorId, NoteIconId, ProjectTreeItem } from '../types/vault';
import {
  NoteAppearancePicker,
  NoteIconGlyph,
  getNoteColorStyle,
} from './NoteIconDisplay';

export type CreateModalState =
  | { kind: 'project' }
  | { kind: 'note'; project: string }
  | null;

interface CreateItemModalProps {
  state: CreateModalState;
  projects: ProjectTreeItem[];
  t: TranslationStrings;
  onCreateProject: (
    name: string,
    appearance?: { icon?: NoteIconId | null; color?: NoteColorId | null }
  ) => Promise<boolean>;
  onCreateNote: (
    projectName: string,
    noteName: string,
    appearance?: { icon?: NoteIconId | null; color?: NoteColorId | null }
  ) => Promise<boolean>;
  onClose: () => void;
}

export function CreateItemModal({
  state,
  projects,
  t,
  onCreateProject,
  onCreateNote,
  onClose,
}: CreateItemModalProps) {
  const [nameInput, setNameInput] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<NoteIconId | null>(null);
  const [selectedColor, setSelectedColor] = useState<NoteColorId | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state) return;
    setNameInput('');
    setSelectedIcon(null);
    setSelectedColor(null);
    setBusy(false);
    if (state.kind === 'note') {
      setSelectedProject(state.project || projects[0]?.name || '');
    }
  }, [state, projects]);

  useEffect(() => {
    if (!state) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, busy, onClose]);

  if (!state) return null;

  const isProject = state.kind === 'project';
  const colorStyle = getNoteColorStyle(selectedColor ?? undefined);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    try {
      const appearance = {
        icon: selectedIcon,
        color: selectedColor,
      };
      const ok = isProject
        ? await onCreateProject(trimmed, appearance)
        : await onCreateNote(
            selectedProject || projects[0]?.name || '',
            trimmed,
            appearance
          );
      if (ok) {
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-item-modal-title"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="shadow-card w-full max-w-md rounded-2xl bg-[#18181B] p-2"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex max-h-[90vh] flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-black">
          <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
                  selectedIcon || selectedColor
                    ? colorStyle.badgeClass
                    : 'border-accent/30 bg-accent/10 text-accent'
                }`}
              >
                {selectedIcon || selectedColor ? (
                  <NoteIconGlyph
                    icon={selectedIcon ?? undefined}
                    isFolder={isProject}
                    className="h-4 w-4"
                  />
                ) : isProject ? (
                  <FolderPlus className="h-4 w-4" />
                ) : (
                  <FilePlus2 className="h-4 w-4" />
                )}
              </div>
              <h2
                id="create-item-modal-title"
                className="text-base font-medium text-[#FAFAFA]"
              >
                {isProject ? t.createFolderTitle : t.createNewNote}
              </h2>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              aria-label={t.cancel}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[#A1A1AA] transition-colors hover:bg-[#18181B] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 overflow-y-auto p-5">
            <form
              id="create-item-form"
              onSubmit={(e) => void handleSubmit(e)}
              className="space-y-4"
            >
              {!isProject && projects.length > 0 && (
                <div>
                  <label
                    htmlFor="create-note-project-select"
                    className="mb-1.5 block text-xs font-medium text-[#A1A1AA]"
                  >
                    {t.targetProjectLabel}
                  </label>
                  <select
                    id="create-note-project-select"
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="h-10 w-full rounded-lg border border-white/[0.1] bg-[#111113] px-3 text-sm text-[#FAFAFA] outline-none focus:border-accent"
                  >
                    {projects.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label
                  htmlFor="create-item-name-input"
                  className="mb-1.5 block text-xs font-medium text-[#A1A1AA]"
                >
                  {isProject ? t.newProjectFolder : t.newNote}
                </label>
                <input
                  id="create-item-name-input"
                  type="text"
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder={
                    isProject ? t.projectNamePlaceholder : t.noteNamePlaceholder
                  }
                  className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#111113] px-3.5 text-sm text-[#FAFAFA] placeholder-[#71717A] outline-none focus:border-accent"
                />
              </div>
            </form>

            <div className="rounded-xl border border-white/[0.08] bg-[#141417] p-3.5">
              <div className="mb-2.5 text-xs font-medium text-[#D4D4D8]">
                {t.appearanceOptionalLabel}
              </div>
              <NoteAppearancePicker
                icon={selectedIcon ?? undefined}
                color={selectedColor ?? undefined}
                busy={busy}
                defaultKind={isProject ? 'project' : 'note'}
                pickerHeight={260}
                t={t}
                onSelect={(next) => {
                  setSelectedIcon(next.icon);
                  setSelectedColor(next.color);
                }}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-white/[0.08] px-5 py-3.5">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="h-10 rounded-lg border border-white/[0.1] px-4 text-xs font-medium text-[#A1A1AA] transition-colors hover:bg-[#18181B] hover:text-white"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              form="create-item-form"
              disabled={
                busy ||
                !nameInput.trim() ||
                (!isProject && !selectedProject && projects.length > 0)
              }
              className="btn-primary-tactile inline-flex h-10 items-center gap-2 rounded-lg px-4 text-xs font-medium disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{t.createButton}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
