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
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import type { TranslationStrings } from '../i18n/translations';
import type { ActiveNoteRef, ProjectTreeItem } from '../types/vault';
import { NotikaLogo } from './NotikaLogo';

interface SidebarProps {
  projects: ProjectTreeItem[];
  activeNote: ActiveNoteRef | null;
  activeView: 'overview' | 'editor';
  collapsed: boolean;
  mobileOpen: boolean;
  authEnabled: boolean;
  creatingProjectTrigger: number;
  creatingNoteProject: string | null;
  t: TranslationStrings;
  onCloseMobile: () => void;
  onClearCreatingNoteProject: () => void;
  onToggleCollapse: () => void;
  onSelectOverview: () => void;
  onSelectNote: (noteRef: ActiveNoteRef) => void;
  onCreateProject: (name: string) => Promise<boolean>;
  onRenameProject: (oldName: string, newName: string) => Promise<boolean>;
  onRequestDeleteProject: (projectName: string) => void;
  onCreateNote: (projectName: string, noteName: string) => Promise<boolean>;
  onRenameNote: (
    projectName: string,
    oldNoteName: string,
    newNoteName: string
  ) => Promise<boolean>;
  onRequestDeleteNote: (projectName: string, noteName: string) => void;
  onOpenQuickSearch: () => void;
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
  creatingProjectTrigger,
  creatingNoteProject,
  t,
  onCloseMobile,
  onClearCreatingNoteProject,
  onToggleCollapse,
  onSelectOverview,
  onSelectNote,
  onCreateProject,
  onRenameProject,
  onRequestDeleteProject,
  onCreateNote,
  onRenameNote,
  onRequestDeleteNote,
  onOpenQuickSearch,
  onOpenSettings,
  onLogout,
}: SidebarProps) {
  const [expandedProjects, setExpandedProjects] = useState<
    Record<string, boolean>
  >({});
  const [filterText, setFilterText] = useState('');

  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const newProjectInputRef = useRef<HTMLInputElement>(null);

  const [newNoteTargetProject, setNewNoteTargetProject] = useState<
    string | null
  >(null);
  const [newNoteName, setNewNoteName] = useState('');
  const newNoteInputRef = useRef<HTMLInputElement>(null);

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
    if (creatingProjectTrigger > 0) {
      setShowNewProjectForm(true);
      setNewProjectName('');
    }
  }, [creatingProjectTrigger]);

  useEffect(() => {
    if (creatingNoteProject) {
      setExpandedProjects((prev) => ({
        ...prev,
        [creatingNoteProject]: true,
      }));
      setNewNoteTargetProject(creatingNoteProject);
      setNewNoteName('');
      onClearCreatingNoteProject();
    }
  }, [creatingNoteProject, onClearCreatingNoteProject]);

  useEffect(() => {
    if (showNewProjectForm) {
      newProjectInputRef.current?.focus();
    }
  }, [showNewProjectForm]);

  useEffect(() => {
    if (newNoteTargetProject) {
      newNoteInputRef.current?.focus();
    }
  }, [newNoteTargetProject]);

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

  const handleSubmitNewProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    const ok = await onCreateProject(trimmed);
    if (ok) {
      setExpandedProjects((prev) => ({ ...prev, [trimmed]: true }));
      setNewProjectName('');
      setShowNewProjectForm(false);
    }
  };

  const handleSubmitNewNote = async (
    event: FormEvent<HTMLFormElement>,
    projectName: string
  ) => {
    event.preventDefault();
    const trimmed = newNoteName.trim();
    if (!trimmed) return;
    const ok = await onCreateNote(projectName, trimmed);
    if (ok) {
      setNewNoteName('');
      setNewNoteTargetProject(null);
      onCloseMobile();
    }
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
      const matchingNotes = project.notes.filter((note) =>
        note.title.toLowerCase().includes(normalizedFilter)
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
                ? 'bg-[#1F1F23] text-[#34D399]'
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
                    ? 'bg-[#1F1F23] text-[#34D399]'
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
            onClick={onOpenSettings}
            title={t.settings}
            aria-label={t.settings}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#A1A1AA] transition-colors hover:bg-[#1A1A1E] hover:text-[#34D399]"
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
            <NotikaLogo className="h-7 w-7 shrink-0 text-[#34D399]" />
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
                activeView === 'overview' ? 'text-[#34D399]' : ''
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
                setShowNewProjectForm(true);
                setNewProjectName('');
              }}
              title={t.newProject}
              aria-label={t.newProject}
              className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-[#A1A1AA] transition-colors hover:bg-[#1F1F23] hover:text-white"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              <span>{t.newShort}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#18181B] px-2.5 py-2 focus-within:border-[#34D399]">
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

        {showNewProjectForm && (
          <form
            onSubmit={handleSubmitNewProject}
            className="mx-3 mb-2 rounded-xl border border-white/[0.08] bg-[#18181B] p-2.5"
          >
            <label
              htmlFor="new-project-name"
              className="block text-[11px] font-medium text-[#A1A1AA]"
            >
              {t.newProjectFolder}
            </label>
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                id="new-project-name"
                ref={newProjectInputRef}
                type="text"
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setShowNewProjectForm(false);
                  }
                }}
                placeholder={t.projectNamePlaceholder}
                className="h-9 w-full rounded-md border border-white/[0.1] bg-black px-2.5 text-xs text-white placeholder-[#71717A] outline-none focus:border-[#34D399]"
              />
              <button
                type="submit"
                aria-label={t.newProject}
                className="btn-primary-tactile flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowNewProjectForm(false)}
                aria-label={t.cancel}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/[0.1] bg-[#1F1F23] text-[#A1A1AA] hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>
        )}

        {/* Project & Note Tree */}
        <nav
          aria-label={t.projects}
          className="flex-1 overflow-y-auto px-3 pb-3"
        >
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

                return (
                  <li key={project.name} className="select-none">
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
                          className="h-8 w-full rounded border border-white/[0.1] bg-black px-2 text-xs text-white outline-none focus:border-[#34D399]"
                        />
                        <button
                          type="submit"
                          aria-label={t.save}
                          className="rounded p-1.5 text-[#34D399] hover:bg-black"
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
                          {isExpanded ? (
                            <FolderOpen className="h-4 w-4 shrink-0 text-[#34D399]" />
                          ) : (
                            <Folder className="h-4 w-4 shrink-0 text-[#A1A1AA]" />
                          )}
                          <span className="truncate font-medium text-[#E4E4E7]">
                            {project.name}
                          </span>
                          <span className="ml-1 shrink-0 text-xs text-[#71717A] tabular-nums">
                            {project.noteCount}
                          </span>
                        </button>

                        <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedProjects((prev) => ({
                                ...prev,
                                [project.name]: true,
                              }));
                              setNewNoteTargetProject(project.name);
                              setNewNoteName('');
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
                        {newNoteTargetProject === project.name && (
                          <form
                            onSubmit={(event) =>
                              handleSubmitNewNote(event, project.name)
                            }
                            className="flex items-center gap-1 rounded-lg bg-[#1F1F23] px-2 py-1"
                          >
                            <input
                              ref={newNoteInputRef}
                              type="text"
                              value={newNoteName}
                              onChange={(event) =>
                                setNewNoteName(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Escape') {
                                  setNewNoteTargetProject(null);
                                }
                              }}
                              placeholder={t.noteNamePlaceholder}
                              className="h-8 w-full rounded border border-white/[0.1] bg-black px-2 text-xs text-white placeholder-[#71717A] outline-none focus:border-[#34D399]"
                            />
                            <button
                              type="submit"
                              aria-label={t.newNote}
                              className="btn-primary-tactile flex h-8 w-8 shrink-0 items-center justify-center rounded"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setNewNoteTargetProject(null)}
                              aria-label={t.cancel}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-[#A1A1AA] hover:bg-black"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </form>
                        )}

                        {project.notes.length === 0 &&
                        newNoteTargetProject !== project.name ? (
                          <button
                            type="button"
                            onClick={() => {
                              setNewNoteTargetProject(project.name);
                              setNewNoteName('');
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
                                    className="h-8 w-full rounded border border-white/[0.1] bg-black px-2 text-xs text-white outline-none focus:border-[#34D399]"
                                  />
                                  <button
                                    type="submit"
                                    aria-label={t.save}
                                    className="rounded p-1.5 text-[#34D399] hover:bg-black"
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

                            return (
                              <div
                                key={note.name}
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
                                      project: project.name,
                                      name: note.name,
                                    });
                                    onCloseMobile();
                                  }}
                                  className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 text-left"
                                >
                                  <FileText
                                    className={`h-4 w-4 shrink-0 ${
                                      isActive
                                        ? 'text-[#34D399]'
                                        : 'text-[#71717A]'
                                    }`}
                                  />
                                  <span className="truncate">{note.title}</span>
                                </button>

                                <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
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
                                    className="rounded p-1.5 text-[#A1A1AA] hover:bg-[#27272A] hover:text-white"
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
                                    className="rounded p-1.5 text-[#A1A1AA] hover:bg-rose-500/15 hover:text-rose-400"
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
            <Settings className="h-4 w-4 shrink-0 text-[#34D399]" />
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
