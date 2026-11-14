import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  Lock,
  LogOut,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import type { TranslationStrings } from '../i18n/translations';
import type {
  ActiveNoteRef,
  NoteMeta,
  ProjectTreeItem,
} from '../types/vault';
import { NoteIconGlyph, getNoteColorStyle } from './NoteIconDisplay';
import { NotikaLogo } from './NotikaLogo';

interface SidebarProps {
  projects: ProjectTreeItem[];
  activeNote: ActiveNoteRef | null;
  activeView: 'overview' | 'editor';
  collapsed: boolean;
  mobileOpen: boolean;
  authEnabled: boolean;
  showTags: boolean;
  t: TranslationStrings;
  onCloseMobile: () => void;
  onToggleCollapse: () => void;
  onSelectOverview: () => void;
  onSelectNote: (noteRef: ActiveNoteRef) => void;
  onRequestNewProject: () => void;
  onRenameProject: (oldName: string, newName: string) => Promise<boolean>;
  onRequestDeleteProject: (projectName: string) => void;
  onRequestNewNote: (projectName: string) => void;
  onRenameNote: (
    projectName: string,
    oldNoteName: string,
    newNoteName: string
  ) => Promise<boolean>;
  onMoveNote: (
    fromProject: string,
    noteName: string,
    toProject: string
  ) => Promise<void>;
  onTogglePinNote: (
    projectName: string,
    noteName: string,
    pinned: boolean
  ) => Promise<void>;
  onCustomizeNoteAppearance: (note: NoteMeta) => void;
  onCustomizeProjectAppearance: (project: ProjectTreeItem) => void;
  onRequestDeleteNote: (projectName: string, noteName: string) => void;
  trashCount: number;
  onOpenQuickSearch: () => void;
  onOpenTrash: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

type EditingTarget =
  | { kind: 'project'; name: string }
  | { kind: 'note'; project: string; name: string }
  | null;

export function Sidebar({
  projects,
  activeNote,
  activeView,
  collapsed,
  mobileOpen,
  authEnabled,
  showTags,
  t,
  onCloseMobile,
  onToggleCollapse,
  onSelectOverview,
  onSelectNote,
  onRequestNewProject,
  onRenameProject,
  onRequestDeleteProject,
  onRequestNewNote,
  onRenameNote,
  onMoveNote,
  onTogglePinNote,
  onCustomizeNoteAppearance,
  onCustomizeProjectAppearance,
  onRequestDeleteNote,
  trashCount,
  onOpenQuickSearch,
  onOpenTrash,
  onOpenSettings,
  onLogout,
}: SidebarProps) {
  const [expandedProjects, setExpandedProjects] = useState<
    Record<string, boolean>
  >({});
  const [filterText, setFilterText] = useState('');
  const [draggedNote, setDraggedNote] = useState<{
    project: string;
    name: string;
  } | null>(null);
  const [dropTargetProject, setDropTargetProject] = useState<string | null>(
    null
  );

  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null);
  const [editingValue, setEditingValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (projects.length === 0) return;

    setExpandedProjects((prev) => {
      const next = { ...prev };
      let changed = false;

      if (activeNote && next[activeNote.project] === undefined) {
        next[activeNote.project] = true;
        changed = true;
      }

      if (Object.keys(next).length === 0 && projects[0]) {
        next[projects[0].name] = true;
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [projects, activeNote]);

  useEffect(() => {
    if (editingTarget) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingTarget]);

  const toggleProject = (projectName: string) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [projectName]: !prev[projectName],
    }));
  };

  const handleSubmitRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingTarget) return;
    const trimmed = editingValue.trim();
    if (!trimmed) {
      setEditingTarget(null);
      return;
    }

    if (editingTarget.kind === 'project') {
      const ok = await onRenameProject(editingTarget.name, trimmed);
      if (ok) {
        setExpandedProjects((prev) => {
          const next = { ...prev };
          const wasExpanded = next[editingTarget.name] ?? true;
          delete next[editingTarget.name];
          next[trimmed] = wasExpanded;
          return next;
        });
        setEditingTarget(null);
      }
    } else {
      const ok = await onRenameNote(
        editingTarget.project,
        editingTarget.name,
        trimmed
      );
      if (ok) {
        setEditingTarget(null);
      }
    }
  };

  const normalizedFilter = filterText.trim().toLowerCase();

  const filteredProjects = projects
    .map((project) => {
      if (normalizedFilter.length === 0) {
        return project;
      }

      const projectMatches = project.name
        .toLowerCase()
        .includes(normalizedFilter);
      const strippedFilter = normalizedFilter.startsWith('#')
        ? normalizedFilter.slice(1)
        : normalizedFilter;
      const matchingNotes = project.notes.filter(
        (note) =>
          note.title.toLowerCase().includes(normalizedFilter) ||
          (note.tags ?? []).some((tag) =>
            tag.toLowerCase().includes(strippedFilter)
          )
      );

      if (projectMatches) {
        return project;
      }
      if (matchingNotes.length > 0) {
        return {
          ...project,
          notes: matchingNotes,
        };
      }
      return null;
    })
    .filter((item): item is ProjectTreeItem => item !== null);

  const pinnedNotes: NoteMeta[] = projects
    .flatMap((project) => project.notes)
    .filter((note) => {
      if (!note.pinned) return false;
      if (normalizedFilter.length === 0) return true;
      const strippedFilter = normalizedFilter.startsWith('#')
        ? normalizedFilter.slice(1)
        : normalizedFilter;
      return (
        note.title.toLowerCase().includes(normalizedFilter) ||
        note.project.toLowerCase().includes(normalizedFilter) ||
        (note.tags ?? []).some((tag) =>
          tag.toLowerCase().includes(strippedFilter)
        )
      );
    });

  if (collapsed && !mobileOpen) {
    return (
      <aside className="hidden h-full w-14 shrink-0 flex-col items-center border-e border-white/[0.08] bg-[#111113] py-3 lg:flex">
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Expand"
          aria-label="Expand sidebar"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-[#A1A1AA] transition-colors hover:bg-[#1F1F23] hover:text-white"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>

        <div className="my-2 h-px w-8 bg-white/[0.08]" />

        <div className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto">
          <button
            type="button"
            onClick={onSelectOverview}
            title={t.overview}
            aria-label={t.overview}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              activeView === 'overview'
                ? 'bg-[#1F1F23] text-accent'
                : 'text-[#A1A1AA] hover:bg-[#1A1A1E] hover:text-white'
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onOpenQuickSearch}
            title={t.quickSearch}
            aria-label={t.quickSearch}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#A1A1AA] transition-colors hover:bg-[#1A1A1E] hover:text-white"
          >
            <Search className="h-4 w-4" />
          </button>

          <div className="my-1.5 h-px w-8 bg-white/[0.08]" />

          {projects.map((project) => {
            const isProjectActive =
              activeView === 'editor' && activeNote?.project === project.name;
            return (
              <button
                key={project.name}
                type="button"
                title={`${project.name} (${project.noteCount})`}
                aria-label={project.name}
                onClick={() => {
                  onToggleCollapse();
                  setExpandedProjects((prev) => ({
                    ...prev,
                    [project.name]: true,
                  }));
                  if (project.notes[0]) {
                    onSelectNote({
                      project: project.name,
                      name: project.notes[0].name,
                    });
                  }
                }}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                  isProjectActive
                    ? 'bg-[#1F1F23] text-accent'
                    : 'text-[#A1A1AA] hover:bg-[#1A1A1E] hover:text-white'
                }`}
              >
                <Folder className="h-4 w-4" />
              </button>
            );
          })}
        </div>

        <div className="my-2 h-px w-8 bg-white/[0.08]" />

        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenTrash}
            title={
              trashCount > 0 ? `${t.trash} (${trashCount})` : t.trash
            }
            aria-label={t.trash}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[#A1A1AA] transition-colors hover:bg-[#1A1A1E] hover:text-white"
          >
            <Trash2 className="h-4 w-4" />
            {trashCount > 0 && (
              <span className="bg-accent absolute top-1.5 end-1.5 h-1.5 w-1.5 rounded-full" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            title={t.settings}
            aria-label={t.settings}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#A1A1AA] transition-colors hover:bg-[#1A1A1E] hover:text-accent"
          >
            <Settings className="h-4 w-4" />
          </button>

          {authEnabled && (
            <button
              type="button"
              onClick={onLogout}
              title={t.logout}
              aria-label={t.logout}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[#A1A1AA] transition-colors hover:bg-[#1A1A1E] hover:text-rose-400"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>
    );
  }

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/70 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 start-0 z-40 flex h-full w-72 shrink-0 flex-col border-e border-white/[0.08] bg-[#111113] transition-transform duration-200 lg:static lg:z-auto lg:w-64 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-3">
          <button
            type="button"
            onClick={() => {
              onSelectOverview();
              onCloseMobile();
            }}
            className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-[#1A1A1E]"
          >
            <NotikaLogo className="h-7 w-7 shrink-0 text-accent" />
            <span className="truncate text-lg font-semibold tracking-tight text-[#FAFAFA]">
              Notika
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleCollapse}
            title="Collapse"
            aria-label="Collapse sidebar"
            className="hidden rounded-lg p-1.5 text-[#A1A1AA] transition-colors hover:bg-[#1F1F23] hover:text-white lg:inline-flex"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onCloseMobile}
            aria-label={t.cancel}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#A1A1AA] transition-colors hover:bg-[#1F1F23] hover:text-white lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Group 1 */}
        <div className="space-y-1 px-3 pb-3">
          <div className="flex h-8 items-center px-1 text-xs font-medium tracking-wide text-[#71717A] uppercase">
            {t.general}
          </div>
          <button
            type="button"
            onClick={() => {
              onSelectOverview();
              onCloseMobile();
            }}
            className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
              activeView === 'overview'
                ? 'bg-[#1F1F23] text-white shadow-card'
                : 'text-[#A1A1AA] hover:bg-[#18181B] hover:text-white'
            }`}
          >
            <LayoutGrid
              className={`h-4 w-4 ${
                activeView === 'overview' ? 'text-accent' : ''
              }`}
            />
            <span>{t.overview}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onCloseMobile();
              onOpenQuickSearch();
            }}
            className="flex h-10 w-full items-center justify-between rounded-lg px-3 text-sm font-medium text-[#A1A1AA] transition-colors hover:bg-[#18181B] hover:text-white"
          >
            <span className="flex items-center gap-3">
              <Search className="h-4 w-4" />
              <span>{t.quickSearch}</span>
            </span>
            <span className="hidden font-mono text-[11px] text-[#71717A] sm:inline">
              ⌘K
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onCloseMobile();
              onOpenTrash();
            }}
            className="flex h-10 w-full items-center justify-between rounded-lg px-3 text-sm font-medium text-[#A1A1AA] transition-colors hover:bg-[#18181B] hover:text-white"
          >
            <span className="flex items-center gap-3">
              <Trash2 className="h-4 w-4" />
              <span>{t.trash}</span>
            </span>
            {trashCount > 0 && (
              <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[11px] font-medium text-[#E4E4E7] tabular-nums">
                {trashCount}
              </span>
            )}
          </button>
        </div>

        {/* Navigation Group 2: Projects */}
        <div className="space-y-2 px-3 pb-2">
          <div className="flex h-8 items-center justify-between px-1">
            <span className="text-xs font-medium tracking-wide text-[#71717A] uppercase">
              {t.projects}
            </span>
            <button
              type="button"
              onClick={() => {
                onCloseMobile();
                onRequestNewProject();
              }}
              title={t.newProject}
              aria-label={t.newProject}
              className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-[#A1A1AA] transition-colors hover:bg-[#1F1F23] hover:text-white"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              <span>{t.newShort}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#18181B] px-2.5 py-2 focus-within:border-accent">
            <Search className="h-3.5 w-3.5 shrink-0 text-[#71717A]" />
            <input
              type="text"
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              placeholder={t.filterPlaceholder}
              className="w-full bg-transparent text-xs text-white placeholder-[#71717A] outline-none"
            />
            {filterText.length > 0 && (
              <button
                type="button"
                onClick={() => setFilterText('')}
                aria-label={t.cancel}
                className="text-[#71717A] hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Project & Note Tree */}
        <nav
          aria-label={t.projects}
          className="flex-1 overflow-y-auto px-3 pb-3"
        >
          {/* Pinned Notes Section */}
          {pinnedNotes.length > 0 && (
            <div className="mb-3">
              <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-medium tracking-wide text-[#71717A] uppercase">
                <Pin className="h-3 w-3 text-accent" />
                <span>{t.pinnedSection}</span>
              </div>
              <ul className="space-y-0.5">
                {pinnedNotes.map((note) => {
                  const isActive =
                    activeView === 'editor' &&
                    activeNote?.project === note.project &&
                    activeNote?.name === note.name;
                  return (
                    <li
                      key={`pinned:${note.project}/${note.name}`}
                      className={`group flex min-h-10 items-center justify-between gap-1 rounded-lg px-2.5 text-sm transition-colors ${
                        isActive
                          ? 'bg-[#1F1F23] font-medium text-white shadow-card'
                          : 'text-[#A1A1AA] hover:bg-[#18181B] hover:text-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectNote({
                            project: note.project,
                            name: note.name,
                          });
                          onCloseMobile();
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                            note.color
                              ? getNoteColorStyle(note.color).badgeClass
                              : isActive
                                ? 'border-accent/40 bg-accent/15 text-accent'
                                : 'border-white/[0.06] bg-white/[0.03] text-accent/80'
                          }`}
                        >
                          <NoteIconGlyph
                            icon={note.icon}
                            isLocked={note.isLocked}
                            className="h-3.5 w-3.5"
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{note.title}</span>
                          <span className="block truncate text-[10px] text-[#71717A]">
                            {note.project}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void onTogglePinNote(note.project, note.name, false)
                        }
                        title={t.unpinNote}
                        aria-label={`${t.unpinNote} ${note.title}`}
                        className="rounded p-1.5 text-accent opacity-80 transition-opacity hover:bg-[#27272A] hover:opacity-100"
                      >
                        <Pin className="h-3 w-3 fill-current" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2.5 h-px bg-white/[0.06]" />
            </div>
          )}

          {filteredProjects.length === 0 ? (
            <div className="px-2 py-8 text-center text-xs leading-relaxed text-[#71717A]">
              {projects.length === 0 ? t.noProjectsYet : t.noMatchingItems}
            </div>
          ) : (
            <ul className="space-y-1">
              {filteredProjects.map((project) => {
                const isExpanded =
                  normalizedFilter.length > 0
                    ? true
                    : (expandedProjects[project.name] ?? false);

                const isEditingProject =
                  editingTarget?.kind === 'project' &&
                  editingTarget.name === project.name;

                const isDropTarget =
                  dropTargetProject === project.name &&
                  draggedNote !== null &&
                  draggedNote.project !== project.name;

                return (
                  <li
                    key={project.name}
                    onDragOver={(event) => {
                      if (!draggedNote || draggedNote.project === project.name) {
                        return;
                      }
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      if (dropTargetProject !== project.name) {
                        setDropTargetProject(project.name);
                      }
                    }}
                    onDragLeave={(event) => {
                      if (
                        !event.currentTarget.contains(
                          event.relatedTarget as Node | null
                        )
                      ) {
                        setDropTargetProject((prev) =>
                          prev === project.name ? null : prev
                        );
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDropTargetProject(null);
                      let payload = draggedNote;
                      if (!payload) {
                        try {
                          const raw = event.dataTransfer.getData(
                            'application/x-notika-note'
                          );
                          if (raw) {
                            payload = JSON.parse(raw) as {
                              project: string;
                              name: string;
                            };
                          }
                        } catch {
                          payload = null;
                        }
                      }
                      setDraggedNote(null);
                      if (payload && payload.project !== project.name) {
                        setExpandedProjects((prev) => ({
                          ...prev,
                          [project.name]: true,
                        }));
                        void onMoveNote(
                          payload.project,
                          payload.name,
                          project.name
                        );
                      }
                    }}
                    className={`select-none rounded-lg transition-colors ${
                      isDropTarget
                        ? 'bg-accent/10 ring-1 ring-accent'
                        : ''
                    }`}
                  >
                    {isEditingProject ? (
                      <form
                        onSubmit={handleSubmitRename}
                        className="flex items-center gap-1 rounded-lg bg-[#1F1F23] px-2 py-1"
                      >
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editingValue}
                          onChange={(event) =>
                            setEditingValue(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') setEditingTarget(null);
                          }}
                          className="h-8 w-full rounded border border-white/[0.1] bg-black px-2 text-xs text-white outline-none focus:border-accent"
                        />
                        <button
                          type="submit"
                          aria-label={t.save}
                          className="rounded p-1.5 text-accent hover:bg-black"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTarget(null)}
                          aria-label={t.cancel}
                          className="rounded p-1.5 text-[#A1A1AA] hover:bg-black"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    ) : (
                      <div className="group flex min-h-10 items-center justify-between gap-1 rounded-lg px-2 text-sm transition-colors hover:bg-[#18181B]">
                        <button
                          type="button"
                          onClick={() => toggleProject(project.name)}
                          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#71717A]" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#71717A]" />
                          )}
                          {project.icon || project.color ? (
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                                getNoteColorStyle(project.color).badgeClass
                              }`}
                            >
                              <NoteIconGlyph
                                icon={project.icon}
                                isFolder={!project.icon}
                                isExpanded={isExpanded}
                                className="h-3.5 w-3.5"
                              />
                            </span>
                          ) : isExpanded ? (
                            <FolderOpen className="h-4 w-4 shrink-0 text-accent" />
                          ) : (
                            <Folder className="h-4 w-4 shrink-0 text-[#A1A1AA]" />
                          )}
                          <span
                            className={`truncate font-medium ${
                              project.color
                                ? getNoteColorStyle(project.color).iconTextClass
                                : 'text-[#E4E4E7]'
                            }`}
                          >
                            {project.name}
                          </span>
                          {isDropTarget ? (
                            <span className="ms-1 truncate text-[10px] font-medium text-accent">
                              {t.dropToMoveHint}
                            </span>
                          ) : (
                            <span className="ml-1 shrink-0 text-xs text-[#71717A] tabular-nums">
                              {project.noteCount}
                            </span>
                          )}
                        </button>

                        <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() =>
                              onCustomizeProjectAppearance(project)
                            }
                            title={t.customizeAppearance}
                            aria-label={`${t.customizeAppearance} ${project.name}`}
                            className="rounded p-1.5 text-[#A1A1AA] hover:bg-[#27272A] hover:text-white"
                          >
                            <Palette className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedProjects((prev) => ({
                                ...prev,
                                [project.name]: true,
                              }));
                              onCloseMobile();
                              onRequestNewNote(project.name);
                            }}
                            title={t.newNote}
                            aria-label={`${project.name} - ${t.newNote}`}
                            className="rounded p-1.5 text-[#A1A1AA] hover:bg-[#27272A] hover:text-white"
                          >
                            <FilePlus2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTarget({
                                kind: 'project',
                                name: project.name,
                              });
                              setEditingValue(project.name);
                            }}
                            aria-label={project.name}
                            className="rounded p-1.5 text-[#A1A1AA] hover:bg-[#27272A] hover:text-white"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRequestDeleteProject(project.name)}
                            aria-label={`${t.deletePermanently} ${project.name}`}
                            className="rounded p-1.5 text-[#A1A1AA] hover:bg-rose-500/15 hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}

                    {isExpanded && (
                      <div className="mt-0.5 space-y-0.5 ps-4">
                        {project.notes.length === 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              onCloseMobile();
                              onRequestNewNote(project.name);
                            }}
                            className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-[#71717A] transition-colors hover:bg-[#18181B] hover:text-[#E4E4E7]"
                          >
                            <FilePlus2 className="h-3.5 w-3.5" />
                            <span>{t.addFirstNote}</span>
                          </button>
                        ) : (
                          project.notes.map((note) => {
                            const isActive =
                              activeView === 'editor' &&
                              activeNote?.project === project.name &&
                              activeNote?.name === note.name;

                            const isEditingNote =
                              editingTarget?.kind === 'note' &&
                              editingTarget.project === project.name &&
                              editingTarget.name === note.name;

                            if (isEditingNote) {
                              return (
                                <form
                                  key={note.name}
                                  onSubmit={handleSubmitRename}
                                  className="flex items-center gap-1 rounded-lg bg-[#1F1F23] px-2 py-1"
                                >
                                  <input
                                    ref={editInputRef}
                                    type="text"
                                    value={editingValue}
                                    onChange={(event) =>
                                      setEditingValue(event.target.value)
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key === 'Escape') {
                                        setEditingTarget(null);
                                      }
                                    }}
                                    className="h-8 w-full rounded border border-white/[0.1] bg-black px-2 text-xs text-white outline-none focus:border-accent"
                                  />
                                  <button
                                    type="submit"
                                    aria-label={t.save}
                                    className="rounded p-1.5 text-accent hover:bg-black"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingTarget(null)}
                                    aria-label={t.cancel}
                                    className="rounded p-1.5 text-[#A1A1AA] hover:bg-black"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </form>
                              );
                            }

                            const isBeingDragged =
                              draggedNote?.project === project.name &&
                              draggedNote?.name === note.name;

                            return (
                              <div
                                key={note.name}
                                draggable
                                onDragStart={(event) => {
                                  const ref = {
                                    project: project.name,
                                    name: note.name,
                                  };
                                  setDraggedNote(ref);
                                  event.dataTransfer.effectAllowed = 'move';
                                  event.dataTransfer.setData(
                                    'application/x-notika-note',
                                    JSON.stringify(ref)
                                  );
                                  event.dataTransfer.setData(
                                    'text/plain',
                                    note.name
                                  );
                                }}
                                onDragEnd={() => {
                                  setDraggedNote(null);
                                  setDropTargetProject(null);
                                }}
                                className={`group flex min-h-10 cursor-grab items-center justify-between gap-1 rounded-lg px-2.5 text-sm transition-colors active:cursor-grabbing ${
                                  isBeingDragged ? 'opacity-45' : ''
                                } ${
                                  isActive
                                    ? 'bg-[#1F1F23] font-medium text-white shadow-card'
                                    : 'text-[#A1A1AA] hover:bg-[#18181B] hover:text-white'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSelectNote({
                                      project: project.name,
                                      name: note.name,
                                    });
                                    onCloseMobile();
                                  }}
                                  className="flex min-w-0 flex-1 items-start gap-2 py-2 text-left"
                                >
                                  {note.isLocked ? (
                                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                                  ) : note.icon || note.color ? (
                                    <span
                                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                                        getNoteColorStyle(note.color).badgeClass
                                      }`}
                                    >
                                      <NoteIconGlyph
                                        icon={note.icon}
                                        className="h-3.5 w-3.5"
                                      />
                                    </span>
                                  ) : (
                                    <FileText
                                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                                        isActive
                                          ? 'text-accent'
                                          : 'text-[#71717A]'
                                      }`}
                                    />
                                  )}
                                  <span className="min-w-0 flex-1">
                                    <span
                                      className={`block truncate ${
                                        note.color && !isActive
                                          ? getNoteColorStyle(note.color)
                                              .iconTextClass
                                          : ''
                                      }`}
                                    >
                                      {note.title}
                                    </span>
                                    {showTags &&
                                      note.tags &&
                                      note.tags.length > 0 && (
                                        <span className="mt-1 flex flex-wrap gap-1">
                                          {note.tags.slice(0, 3).map((tag) => (
                                            <span
                                              key={tag}
                                              className="rounded bg-accent/10 px-1.5 py-0.2 text-[10px] font-medium text-accent/90"
                                            >
                                              #{tag}
                                            </span>
                                          ))}
                                        </span>
                                      )}
                                  </span>
                                </button>

                                <div className="flex shrink-0 items-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onCustomizeNoteAppearance(note)
                                    }
                                    title={t.customizeAppearance}
                                    aria-label={`${t.customizeAppearance} ${note.title}`}
                                    className="rounded p-1 text-[#A1A1AA] opacity-100 transition-opacity hover:bg-[#27272A] hover:text-white lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
                                  >
                                    <Palette className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void onTogglePinNote(
                                        project.name,
                                        note.name,
                                        !note.pinned
                                      )
                                    }
                                    title={note.pinned ? t.unpinNote : t.pinNote}
                                    aria-label={`${
                                      note.pinned ? t.unpinNote : t.pinNote
                                    } ${note.title}`}
                                    className={`rounded p-1 transition-opacity ${
                                      note.pinned
                                        ? 'text-accent opacity-100 hover:bg-[#27272A]'
                                        : 'text-[#A1A1AA] opacity-100 hover:bg-[#27272A] hover:text-white lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100'
                                    }`}
                                  >
                                    <Pin
                                      className={`h-3 w-3 ${
                                        note.pinned ? 'fill-current' : ''
                                      }`}
                                    />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTarget({
                                        kind: 'note',
                                        project: project.name,
                                        name: note.name,
                                      });
                                      setEditingValue(note.title);
                                    }}
                                    aria-label={note.title}
                                    className="rounded p-1 text-[#A1A1AA] opacity-100 transition-opacity hover:bg-[#27272A] hover:text-white lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onRequestDeleteNote(
                                        project.name,
                                        note.name
                                      )
                                    }
                                    aria-label={`${t.deletePermanently} ${note.title}`}
                                    className="rounded p-1 text-[#A1A1AA] opacity-100 transition-opacity hover:bg-rose-500/15 hover:text-rose-400 lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        <div className="mx-3 h-px bg-white/[0.08]" />

        {/* Sidebar Footer: Direct Settings Button */}
        <div className="flex items-center justify-between gap-2 p-3">
          <button
            type="button"
            onClick={() => {
              onCloseMobile();
              onOpenSettings();
            }}
            className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg bg-[#18181B] px-3 text-sm font-medium text-[#FAFAFA] transition-colors hover:bg-[#222227]"
          >
            <Settings className="h-4 w-4 shrink-0 text-accent" />
            <span className="truncate">{t.settings}</span>
          </button>

          {authEnabled && (
            <button
              type="button"
              onClick={onLogout}
              title={t.logout}
              aria-label={t.logout}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-[#A1A1AA] transition-colors hover:bg-[#1F1F23] hover:text-rose-400"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
