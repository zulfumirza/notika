import { useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronsUpDown,
  Clock,
  FileText,
  FolderKanban,
  HardDrive,
  Menu,
  MoreVertical,
  Plus,
  Search,
} from 'lucide-react';
import type { TranslationStrings } from '../i18n/translations';
import type { ActiveNoteRef, NoteMeta, ProjectTreeItem } from '../types/vault';
import { AssetBadge } from './AssetBadge';
import { NoteIconGlyph, getNoteColorStyle } from './NoteIconDisplay';
import { NotikaLogo } from './NotikaLogo';
import { ActivitySparkline, VaultActivityChart } from './VaultCharts';
import type { ActivityPoint } from './VaultCharts';

interface VaultOverviewProps {
  projects: ProjectTreeItem[];
  locale: string;
  t: TranslationStrings;
  onOpenMobileSidebar: () => void;
  onSelectNote: (noteRef: ActiveNoteRef) => void;
  onRequestNewProject: () => void;
  onRequestNewNoteInProject: (projectName: string) => void;
  onOpenSearch: () => void;
}

const PROJECT_COLORS = [
  'bg-emerald-500',
  'bg-sky-500',
  'bg-amber-500',
  'bg-indigo-500',
  'bg-rose-500',
  'bg-teal-500',
];

function getProjectColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PROJECT_COLORS[hash % PROJECT_COLORS.length] ?? 'bg-emerald-500';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function formatShortDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const RANGES = ['1D', '7D', '1M', 'ALL'] as const;
type RangeKey = (typeof RANGES)[number];

export function VaultOverview({
  projects,
  locale,
  t,
  onOpenMobileSidebar,
  onSelectNote,
  onRequestNewProject,
  onRequestNewNoteInProject,
  onOpenSearch,
}: VaultOverviewProps) {
  const [selectedProject, setSelectedProject] = useState<string>(
    projects[0]?.name ?? ''
  );
  const [chartRange, setChartRange] = useState<RangeKey>('ALL');

  const [noteSortField, setNoteSortField] = useState<
    'size' | 'updatedAt' | null
  >(null);
  const [noteSortDir, setNoteSortDir] = useState<'asc' | 'desc'>('desc');

  const [projectSortField, setProjectSortField] = useState<
    'noteCount' | 'size' | null
  >(null);
  const [projectSortDir, setProjectSortDir] = useState<'asc' | 'desc'>('desc');

  const activeSelectedProject =
    projects.find((p) => p.name === selectedProject)?.name ??
    projects[0]?.name ??
    '';

  const allNotes = useMemo<NoteMeta[]>(() => {
    return projects.flatMap((project) => project.notes);
  }, [projects]);

  const totalBytes = useMemo(() => {
    return allNotes.reduce((sum, n) => sum + n.size, 0);
  }, [allNotes]);

  const latestNote = useMemo<NoteMeta | null>(() => {
    if (allNotes.length === 0) return null;
    return (
      [...allNotes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ??
      null
    );
  }, [allNotes]);

  const chartSeries = useMemo<ActivityPoint[]>(() => {
    const now = Date.now();
    const cutoffMs =
      chartRange === '1D'
        ? 24 * 60 * 60 * 1000
        : chartRange === '7D'
          ? 7 * 24 * 60 * 60 * 1000
          : chartRange === '1M'
            ? 30 * 24 * 60 * 60 * 1000
            : Infinity;

    const filtered = [...allNotes]
      .filter((note) => {
        if (cutoffMs === Infinity) return true;
        return now - new Date(note.updatedAt).getTime() <= cutoffMs;
      })
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

    if (filtered.length === 0) {
      return [
        { label: '0', value: 0 },
        { label: 'Now', value: totalBytes },
      ];
    }

    let runningTotal = 0;
    const points: ActivityPoint[] = filtered.map((note) => {
      runningTotal += note.size;
      return {
        label: note.title,
        value: runningTotal,
      };
    });

    if (points.length === 1 && points[0]) {
      return [{ label: '0', value: 0 }, points[0]];
    }
    return points;
  }, [allNotes, chartRange, totalBytes]);

  const sparklineData = useMemo<ActivityPoint[]>(() => {
    if (allNotes.length === 0) {
      return [
        { label: '1', value: 0 },
        { label: '2', value: 0 },
      ];
    }
    const sorted = [...allNotes]
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .slice(-8);
    if (sorted.length === 1 && sorted[0]) {
      return [
        { label: '0', value: Math.round(sorted[0].size * 0.4) },
        { label: sorted[0].title, value: sorted[0].size },
      ];
    }
    return sorted.map((n) => ({ label: n.title, value: n.size }));
  }, [allNotes]);

  const sortedNotes = useMemo(() => {
    const base = [...allNotes];
    if (!noteSortField) {
      return base
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 6);
    }
    return base
      .sort((a, b) => {
        const diff =
          noteSortField === 'size'
            ? a.size - b.size
            : a.updatedAt.localeCompare(b.updatedAt);
        return noteSortDir === 'asc' ? diff : -diff;
      })
      .slice(0, 6);
  }, [allNotes, noteSortField, noteSortDir]);

  const projectsWithSizes = useMemo(() => {
    return projects.map((project) => ({
      ...project,
      totalBytes: project.notes.reduce((acc, note) => acc + note.size, 0),
    }));
  }, [projects]);

  const sortedProjects = useMemo(() => {
    const base = [...projectsWithSizes];
    if (!projectSortField) return base;
    return base.sort((a, b) => {
      const diff =
        projectSortField === 'noteCount'
          ? a.noteCount - b.noteCount
          : a.totalBytes - b.totalBytes;
      return projectSortDir === 'asc' ? diff : -diff;
    });
  }, [projectsWithSizes, projectSortField, projectSortDir]);

  const handleSortNotes = (field: 'size' | 'updatedAt') => {
    if (noteSortField === field) {
      if (noteSortDir === 'desc') {
        setNoteSortDir('asc');
      } else {
        setNoteSortField(null);
        setNoteSortDir('desc');
      }
    } else {
      setNoteSortField(field);
      setNoteSortDir('desc');
    }
  };

  const handleSortProjects = (field: 'noteCount' | 'size') => {
    if (projectSortField === field) {
      if (projectSortDir === 'desc') {
        setProjectSortDir('asc');
      } else {
        setProjectSortField(null);
        setProjectSortDir('desc');
      }
    } else {
      setProjectSortField(field);
      setProjectSortDir('desc');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#09090B] px-3 pb-[max(1.75rem,env(safe-area-inset-bottom))] sm:px-4 lg:px-8">
      {/* Topbar */}
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:max-w-md sm:gap-4">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            aria-label={t.projects}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.1] bg-[#18181B] text-[#FAFAFA] hover:bg-[#222227] lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2 lg:hidden">
            <NotikaLogo className="h-6 w-6 shrink-0 text-accent" />
          </div>

          <span className="hidden whitespace-nowrap text-lg font-semibold tracking-tight text-[#FAFAFA] lg:inline">
            {t.overview}
          </span>

          <button
            type="button"
            onClick={onOpenSearch}
            className="relative hidden h-10 w-full items-center rounded-lg border border-white/[0.1] bg-[#18181B] pe-3 ps-9 text-left text-sm text-[#A1A1AA] transition-colors hover:border-white/[0.18] sm:flex"
          >
            <Search className="pointer-events-none absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-[#A1A1AA]" />
            <span className="truncate">{t.searchPlaceholder}</span>
          </button>
        </div>

        {/* Desktop & Mobile Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label={t.quickSearch}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.1] bg-[#18181B] text-[#FAFAFA] sm:hidden"
          >
            <Search className="h-4 w-4" />
          </button>

          {projects.length > 0 && (
            <select
              aria-label={t.projects}
              value={activeSelectedProject}
              onChange={(event) => setSelectedProject(event.target.value)}
              className="hidden h-10 min-w-[160px] rounded-lg border border-white/[0.1] bg-[#18181B] px-3 text-sm text-[#FAFAFA] outline-none focus:border-accent xl:block"
            >
              {projects.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={onRequestNewProject}
            className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/[0.1] bg-[#18181B] px-3 text-xs font-medium text-[#FAFAFA] transition-colors hover:bg-[#222227] sm:px-3.5 sm:text-sm"
          >
            <span className="hidden sm:inline">{t.newProject}</span>
            <Plus className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (activeSelectedProject) {
                onRequestNewNoteInProject(activeSelectedProject);
              } else {
                onRequestNewProject();
              }
            }}
            className="btn-primary-tactile inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors sm:px-4 sm:text-sm"
          >
            <span>{t.newNote}</span>
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="mx-auto grid gap-4">
        {/* StatGrid */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="shadow-card flex min-h-28 flex-col justify-between rounded-2xl bg-[#18181B] py-4">
            <div className="flex items-center gap-2.5 px-4 pb-2">
              <div className="stat-orb-bevel flex items-center justify-center rounded-full bg-emerald-300 p-2">
                <FolderKanban className="h-5 w-5 text-black" />
              </div>
              <span className="text-sm font-medium text-[#FAFAFA]">
                {t.totalProjects}
              </span>
            </div>
            <div className="mt-auto flex flex-col px-4">
              <div className="text-3xl font-normal tracking-wide text-[#FAFAFA] tabular-nums">
                {projects.length}
              </div>
              <div className="mt-2 text-sm text-[#A1A1AA]">
                <span className="text-[#FAFAFA] tabular-nums">
                  {projects.length}
                </span>{' '}
                {t.activeFolders}
              </div>
            </div>
          </div>

          <div className="shadow-card flex min-h-28 flex-col justify-between rounded-2xl bg-[#18181B] py-4">
            <div className="flex items-center gap-2.5 px-4 pb-2">
              <div className="stat-orb-bevel flex items-center justify-center rounded-full bg-sky-300 p-2">
                <FileText className="h-5 w-5 text-black" />
              </div>
              <span className="text-sm font-medium text-[#FAFAFA]">
                {t.totalNotes}
              </span>
            </div>
            <div className="mt-auto flex flex-col px-4">
              <div className="text-3xl font-normal tracking-wide text-[#FAFAFA] tabular-nums">
                {allNotes.length}
              </div>
              <div className="mt-2 flex items-center gap-1 text-sm text-emerald-400">
                <span>{t.mdAndTxtFiles}</span>
              </div>
            </div>
          </div>

          <div className="shadow-card flex min-h-28 flex-col justify-between rounded-2xl bg-[#18181B] py-4">
            <div className="flex items-center gap-2.5 px-4 pb-2">
              <div className="stat-orb-bevel flex items-center justify-center rounded-full bg-amber-300 p-2">
                <HardDrive className="h-5 w-5 text-black" />
              </div>
              <span className="text-sm font-medium text-[#FAFAFA]">
                {t.vaultSize}
              </span>
            </div>
            <div className="mt-auto flex flex-col px-4">
              <div className="text-3xl font-normal tracking-wide text-[#FAFAFA] tabular-nums">
                {formatBytes(totalBytes)}
              </div>
              <div className="mt-2 truncate text-sm text-[#A1A1AA]">
                {latestNote ? latestNote.title : t.noNotesFound}
              </div>
            </div>
          </div>

          <div className="shadow-card flex min-h-28 flex-col justify-between rounded-2xl bg-[#18181B] py-4">
            <div className="flex items-center gap-2.5 px-4 pb-2">
              <div className="stat-orb-bevel flex items-center justify-center rounded-full bg-violet-300 p-2">
                <Clock className="h-5 w-5 text-black" />
              </div>
              <span className="text-sm font-medium text-[#FAFAFA]">
                {t.noteDistribution}
              </span>
            </div>
            <div className="mt-auto flex flex-col px-4">
              <div className="truncate text-xl font-normal tracking-wide text-[#FAFAFA] tabular-nums sm:text-2xl">
                {latestNote
                  ? formatShortDate(latestNote.updatedAt, locale)
                  : '—'}
              </div>
              <div className="mt-2 h-10">
                <ActivitySparkline data={sparklineData} />
              </div>
            </div>
          </div>
        </section>

        {/* Middle Row */}
        <section className="grid gap-3 xl:grid-cols-4">
          <div className="shadow-card flex flex-col gap-2 rounded-2xl bg-[#18181B] p-2 xl:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-1">
              <h2 className="truncate text-base font-medium text-[#FAFAFA] sm:text-lg">
                {t.vaultGrowth}
              </h2>
              <div className="flex items-center gap-1">
                {RANGES.map((range) => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => setChartRange(range)}
                    className={`h-8 rounded-md px-2.5 text-xs transition-colors sm:px-3 sm:text-sm ${
                      chartRange === range
                        ? 'bg-black font-medium text-accent'
                        : 'text-[#A1A1AA] hover:text-white'
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>

            <div className="shadow-card mt-1 flex flex-1 flex-col overflow-hidden rounded-xl bg-black p-2">
              <div className="px-3 pt-2 sm:px-4">
                <div className="text-2xl font-medium tracking-wide text-[#FAFAFA] tabular-nums sm:text-3xl">
                  {formatBytes(totalBytes)}
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-emerald-400">
                  <span className="tabular-nums">
                    {allNotes.length} {t.activeNoteFiles}
                  </span>
                </div>
              </div>
              <div className="h-56 pt-3 sm:h-72 sm:pt-4">
                <VaultActivityChart data={chartSeries} />
              </div>
            </div>
          </div>

          <div className="shadow-card flex flex-col gap-1 rounded-2xl bg-[#18181B] p-2">
            <div className="flex items-center justify-between px-2 py-1">
              <h2 className="text-base font-medium text-[#FAFAFA] sm:text-lg">
                {t.projects}
              </h2>
              <button
                type="button"
                onClick={onRequestNewProject}
                className="flex h-8 items-center gap-1.5 px-1 text-sm font-normal text-[#A1A1AA] transition-colors hover:text-white"
              >
                <span>{t.addNew}</span>
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>

            <div className="shadow-card flex-1 rounded-xl bg-black px-3">
              {projectsWithSizes.length === 0 ? (
                <div className="py-12 text-center text-sm text-[#71717A]">
                  {t.noProjectsYet}
                </div>
              ) : (
                <div>
                  {projectsWithSizes.slice(0, 5).map((project) => (
                    <button
                      key={project.name}
                      type="button"
                      onClick={() => {
                        if (project.notes[0]) {
                          onSelectNote({
                            project: project.name,
                            name: project.notes[0].name,
                          });
                        } else {
                          onRequestNewNoteInProject(project.name);
                        }
                      }}
                      className="flex w-full items-center gap-3 border-b border-white/[0.06] py-3.5 text-left transition-colors last:border-b-0 hover:opacity-85 sm:gap-4 sm:py-4"
                    >
                      <AssetBadge
                        label={project.name}
                        colorClass={getProjectColor(project.name)}
                        size="md"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#FAFAFA] sm:text-base">
                        {project.name}
                      </span>
                      <span className="shrink-0 text-xs font-medium text-emerald-400 tabular-nums sm:text-sm">
                        {project.noteCount}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Bottom Row: Responsive Scrollable Tables */}
        <section className="grid gap-3 xl:grid-cols-2">
          <div className="shadow-card flex min-w-0 flex-col gap-2 rounded-2xl bg-[#18181B] p-2 py-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-base font-medium text-[#FAFAFA] sm:text-lg">
                {t.recentNotes}
              </h2>
              <button
                type="button"
                onClick={onOpenSearch}
                aria-label={t.quickSearch}
                className="rounded-md p-1.5 text-[#A1A1AA] transition-colors hover:bg-[#27272A] hover:text-white"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-lg bg-black p-2 sm:px-4">
              <div className="overflow-x-auto rounded-md border border-white/[0.1]">
                <table className="w-full min-w-[420px] border-collapse text-left text-sm">
                  <thead className="bg-[#18181B]">
                    <tr>
                      <th className="h-9 px-3 text-xs font-medium text-[#A1A1AA] sm:text-sm">
                        {t.noteCol}
                      </th>
                      <th
                        onClick={() => handleSortNotes('size')}
                        className="h-9 cursor-pointer px-3 text-xs font-medium text-[#A1A1AA] transition-colors select-none hover:text-white sm:text-sm"
                      >
                        <span className="inline-flex items-center gap-1">
                          {t.sizeCol}
                          <ChevronsUpDown
                            className={`h-3.5 w-3.5 ${
                              noteSortField === 'size'
                                ? 'text-white'
                                : 'text-[#71717A]'
                            }`}
                          />
                        </span>
                      </th>
                      <th
                        onClick={() => handleSortNotes('updatedAt')}
                        className="h-9 cursor-pointer px-3 text-xs font-medium text-[#A1A1AA] transition-colors select-none hover:text-white sm:text-sm"
                      >
                        <span className="inline-flex items-center gap-1">
                          {t.updatedCol}
                          <ChevronsUpDown
                            className={`h-3.5 w-3.5 ${
                              noteSortField === 'updatedAt'
                                ? 'text-white'
                                : 'text-[#71717A]'
                            }`}
                          />
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedNotes.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="h-24 text-center text-sm text-[#71717A]"
                        >
                          {t.noNotesFound}
                        </td>
                      </tr>
                    ) : (
                      sortedNotes.map((note) => (
                        <tr
                          key={`${note.project}/${note.name}`}
                          onClick={() =>
                            onSelectNote({
                              project: note.project,
                              name: note.name,
                            })
                          }
                          className="cursor-pointer border-y border-white/[0.08] bg-black transition-colors hover:bg-[#18181B]"
                        >
                          <td className="h-12 max-w-[240px] px-3 font-medium text-[#FAFAFA]">
                            <span className="flex items-center gap-2.5">
                              {note.icon || note.color ? (
                                <span
                                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                                    getNoteColorStyle(note.color).badgeClass
                                  }`}
                                >
                                  <NoteIconGlyph
                                    icon={note.icon}
                                    isLocked={note.isLocked}
                                    className="h-3.5 w-3.5"
                                  />
                                </span>
                              ) : (
                                <AssetBadge
                                  label={note.title}
                                  colorClass={getProjectColor(note.project)}
                                  size="sm"
                                />
                              )}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate">
                                  {note.title}
                                </span>
                                {note.tags && note.tags.length > 0 && (
                                  <span className="mt-0.5 flex flex-wrap gap-1">
                                    {note.tags.slice(0, 2).map((tag) => (
                                      <span
                                        key={tag}
                                        className="rounded bg-accent/10 px-1.5 py-0.2 text-[10px] font-medium text-accent"
                                      >
                                        #{tag}
                                      </span>
                                    ))}
                                  </span>
                                )}
                              </span>
                            </span>
                          </td>
                          <td className="h-12 whitespace-nowrap px-3 font-medium text-[#E4E4E7] tabular-nums">
                            {formatBytes(note.size)}
                          </td>
                          <td className="h-12 whitespace-nowrap px-3 text-xs font-medium text-[#A1A1AA] tabular-nums sm:text-sm">
                            {formatShortDate(note.updatedAt, locale)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (activeSelectedProject) {
                    onRequestNewNoteInProject(activeSelectedProject);
                  } else {
                    onRequestNewProject();
                  }
                }}
                className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-white/[0.1] bg-[#18181B] text-sm font-normal text-[#FAFAFA] transition-colors hover:bg-[#222227]"
              >
                <span>{t.createNewNote}</span>
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="shadow-card flex min-w-0 flex-col gap-2 rounded-2xl bg-[#18181B] p-2 py-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-base font-medium text-[#FAFAFA] sm:text-lg">
                {t.projectFolders}
              </h2>
              <button
                type="button"
                onClick={onRequestNewProject}
                aria-label={t.newProject}
                className="rounded-md p-1.5 text-[#A1A1AA] transition-colors hover:bg-[#27272A] hover:text-white"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-lg bg-black p-2 sm:px-4">
              <div className="overflow-x-auto rounded-md border border-white/[0.1]">
                <table className="w-full min-w-[380px] border-collapse text-left text-sm">
                  <thead className="bg-[#18181B]">
                    <tr>
                      <th className="h-9 px-3 text-xs font-medium text-[#A1A1AA] sm:text-sm">
                        {t.projectCol}
                      </th>
                      <th
                        onClick={() => handleSortProjects('noteCount')}
                        className="h-9 cursor-pointer px-3 text-xs font-medium text-[#A1A1AA] transition-colors select-none hover:text-white sm:text-sm"
                      >
                        <span className="inline-flex items-center gap-1">
                          {t.notesCol}
                          <ChevronsUpDown
                            className={`h-3.5 w-3.5 ${
                              projectSortField === 'noteCount'
                                ? 'text-white'
                                : 'text-[#71717A]'
                            }`}
                          />
                        </span>
                      </th>
                      <th
                        onClick={() => handleSortProjects('size')}
                        className="h-9 cursor-pointer px-3 text-xs font-medium text-[#A1A1AA] transition-colors select-none hover:text-white sm:text-sm"
                      >
                        <span className="inline-flex items-center gap-1">
                          {t.sizeCol}
                          <ChevronsUpDown
                            className={`h-3.5 w-3.5 ${
                              projectSortField === 'size'
                                ? 'text-white'
                                : 'text-[#71717A]'
                            }`}
                          />
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProjects.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="h-24 text-center text-sm text-[#71717A]"
                        >
                          {t.noProjectsYet}
                        </td>
                      </tr>
                    ) : (
                      sortedProjects.map((project) => (
                        <tr
                          key={project.name}
                          onClick={() => {
                            if (project.notes[0]) {
                              onSelectNote({
                                project: project.name,
                                name: project.notes[0].name,
                              });
                            } else {
                              onRequestNewNoteInProject(project.name);
                            }
                          }}
                          className="cursor-pointer border-y border-white/[0.08] bg-black transition-colors hover:bg-[#18181B]"
                        >
                          <td className="h-12 max-w-[180px] px-3 font-medium text-[#FAFAFA]">
                            <span className="flex items-center gap-2.5">
                              {project.icon || project.color ? (
                                <span
                                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                                    getNoteColorStyle(project.color).badgeClass
                                  }`}
                                >
                                  <NoteIconGlyph
                                    icon={project.icon}
                                    isFolder={!project.icon}
                                    className="h-3.5 w-3.5"
                                  />
                                </span>
                              ) : (
                                <AssetBadge
                                  label={project.name}
                                  colorClass={getProjectColor(project.name)}
                                  size="sm"
                                />
                              )}
                              <span className="truncate">{project.name}</span>
                            </span>
                          </td>
                          <td className="h-12 whitespace-nowrap px-3 font-medium text-[#E4E4E7] tabular-nums">
                            {project.noteCount}
                          </td>
                          <td className="h-12 whitespace-nowrap px-3 font-medium text-[#A1A1AA] tabular-nums">
                            {formatBytes(project.totalBytes)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={onOpenSearch}
                className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-white/[0.1] bg-[#18181B] text-sm font-normal text-[#FAFAFA] transition-colors hover:bg-[#222227]"
              >
                <span>{t.searchAllNotes}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
