import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  AlertCircle,
  Check,
  ChevronRight,
  Code2,
  Columns2,
  Download,
  Eye,
  FileCode2,
  FileText,
  Folder,
  LayoutGrid,
  Loader2,
  Lock,
  LockOpen,
  Menu,
  Palette,
  Pencil,
  Save,
  Search,
  Share2,
  Type,
} from 'lucide-react';
import {
  parseFrontmatter,
  replaceFrontmatterBody,
  updateFrontmatterProperties,
} from '../../shared/frontmatter.ts';
import type { TranslationStrings } from '../i18n/translations';
import { toggleTaskAtLineInMarkdown } from '../lib/richMarkdown';
import type {
  EditorViewMode,
  NoteColorId,
  NoteDocument,
  NoteIconId,
  SaveStatus,
  TemplateItem,
  UserPreferences,
} from '../types/vault';
import { NormalRichEditor } from './NormalRichEditor';
import {
  NoteAppearancePicker,
  NoteIconGlyph,
  getNoteColorStyle,
} from './NoteIconDisplay';

interface EditorWorkspaceProps {
  note: NoteDocument;
  projectIcon?: NoteIconId;
  projectColor?: NoteColorId;
  content: string;
  viewMode: EditorViewMode;
  saveStatus: SaveStatus;
  saveError: string | null;
  prefs: UserPreferences;
  templates: TemplateItem[];
  isEditing: boolean;
  appearanceBusy?: boolean;
  t: TranslationStrings;
  onOpenMobileSidebar: () => void;
  onChangeContent: (nextContent: string) => void;
  onChangeViewMode: (mode: EditorViewMode) => void;
  onChangeAppearance: (next: {
    icon: NoteIconId | null;
    color: NoteColorId | null;
  }) => Promise<void>;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onManualSave: () => void;
  onOpenSearch: () => void;
  onOpenOverview: () => void;
  onOpenShareModal: () => void;
  onOpenLockModal: () => void;
}

const WORKSPACE_FONT_SIZE_CLASS: Record<
  UserPreferences['editorFontSize'],
  string
> = {
  13: 'text-[13px]!',
  14: 'text-[14px]!',
  15: 'text-[15px]!',
  16: 'text-[16px]!',
  18: 'text-[18px]!',
};

export function EditorWorkspace({
  note,
  projectIcon,
  projectColor,
  content,
  viewMode,
  saveStatus,
  saveError,
  prefs,
  templates,
  isEditing,
  appearanceBusy = false,
  t,
  onOpenMobileSidebar,
  onChangeContent,
  onChangeViewMode,
  onChangeAppearance,
  onStartEditing,
  onStopEditing,
  onManualSave,
  onOpenSearch,
  onOpenOverview,
  onOpenShareModal,
  onOpenLockModal,
}: EditorWorkspaceProps) {
  const isPlainText = note.name.toLowerCase().endsWith('.txt');
  const effectiveMode: EditorViewMode = !isEditing
    ? 'preview'
    : isPlainText
      ? 'normal'
      : viewMode;
  const showSaveButton =
    isEditing || saveStatus === 'dirty' || saveStatus === 'error';
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const templateMenuRef = useRef<HTMLDivElement>(null);
  const [appearanceMenuOpen, setAppearanceMenuOpen] = useState(false);
  const appearanceMenuRef = useRef<HTMLDivElement>(null);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const copyNoticeTimerRef = useRef<number | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;

  const copyRawMarkdown = useCallback(async () => {
    const raw = contentRef.current;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(raw);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      try {
        const helper = document.createElement('textarea');
        helper.value = raw;
        helper.setAttribute('readonly', 'true');
        helper.className = 'fixed -left-[9999px] top-0 opacity-0';
        document.body.appendChild(helper);
        helper.select();
        copied = document.execCommand('copy');
        document.body.removeChild(helper);
      } catch {
        copied = false;
      }
    }

    if (copied) {
      setCopiedMarkdown(true);
      if (copyNoticeTimerRef.current !== null) {
        window.clearTimeout(copyNoticeTimerRef.current);
      }
      copyNoticeTimerRef.current = window.setTimeout(() => {
        setCopiedMarkdown(false);
        copyNoticeTimerRef.current = null;
      }, 2200);
    }
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      const isMod = event.ctrlKey || event.metaKey;
      if (
        isMod &&
        event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'c'
      ) {
        event.preventDefault();
        void copyRawMarkdown();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      if (copyNoticeTimerRef.current !== null) {
        window.clearTimeout(copyNoticeTimerRef.current);
      }
    };
  }, [copyRawMarkdown]);

  const handleExportMarkdown = () => {
    const baseName = note.name.replace(/\.(md|txt)$/i, '');
    const fileName = `${baseName || 'note'}.md`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  useEffect(() => {
    if (!templateMenuOpen && !appearanceMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (
        templateMenuOpen &&
        templateMenuRef.current &&
        !templateMenuRef.current.contains(event.target as Node)
      ) {
        setTemplateMenuOpen(false);
      }
      if (
        appearanceMenuOpen &&
        appearanceMenuRef.current &&
        !appearanceMenuRef.current.contains(event.target as Node)
      ) {
        setAppearanceMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [templateMenuOpen, appearanceMenuOpen]);

  const parsedFrontmatter = useMemo(() => {
    if (isPlainText) {
      return null;
    }
    return parseFrontmatter(content);
  }, [content, isPlainText]);

  const displayBody = parsedFrontmatter ? parsedFrontmatter.body : content;

  const stats = useMemo(() => {
    const trimmed = displayBody.trim();
    const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
    const characters = displayBody.length;
    const lines =
      displayBody.length === 0 ? 1 : displayBody.split(/\r?\n/).length;
    return { words, characters, lines };
  }, [displayBody]);

  const handleTextareaKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      const target = event.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const indent = ' '.repeat(prefs.tabSize);
      const updated = content.slice(0, start) + indent + content.slice(end);
      onChangeContent(updated);
      window.requestAnimationFrame(() => {
        target.selectionStart = start + indent.length;
        target.selectionEnd = start + indent.length;
      });
    }
  };

  const handleInsertTemplate = (template: TemplateItem) => {
    const today = new Date().toISOString().slice(0, 10);
    const resolved = template.content
      .replace(/\{\{\s*title\s*\}\}/gi, note.title)
      .replace(/\{\{\s*date\s*\}\}/gi, today);

    if (isPlainText) {
      const parsedTpl = parseFrontmatter(resolved);
      const bodyToInsert = parsedTpl.body.trim();
      const next =
        content.trim().length === 0
          ? bodyToInsert
          : `${content.replace(/\s+$/, '')}\n\n${bodyToInsert}`;
      onChangeContent(next);
      setTemplateMenuOpen(false);
      return;
    }

    const parsedTpl = parseFrontmatter(resolved);
    const currentParsed = parseFrontmatter(content);

    let nextContent = content;
    if (parsedTpl.hasFrontmatter && parsedTpl.properties.length > 0) {
      const existingKeys = new Set(
        currentParsed.properties.map((p) => p.key.toLowerCase())
      );
      const mergedProps = [...currentParsed.properties];
      for (const prop of parsedTpl.properties) {
        if (!existingKeys.has(prop.key.toLowerCase())) {
          mergedProps.push(prop);
        }
      }
      nextContent = updateFrontmatterProperties(nextContent, mergedProps);
    }

    const currentBody = parseFrontmatter(nextContent).body;
    const tplBody = parsedTpl.body.replace(/^\n+/, '');
    const nextBody =
      currentBody.trim().length === 0
        ? tplBody
        : tplBody.trim().length === 0
          ? currentBody
          : `${currentBody.replace(/\s+$/, '')}\n\n${tplBody}`;

    nextContent = replaceFrontmatterBody(nextContent, nextBody);
    onChangeContent(nextContent);
    setTemplateMenuOpen(false);
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-[#09090B] px-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 lg:px-8 lg:pb-5">
      {/* Topbar */}
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 py-2 sm:min-h-16 sm:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            aria-label={t.projects}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.1] bg-[#18181B] text-[#FAFAFA] hover:bg-[#222227] sm:h-10 sm:w-10 lg:hidden"
          >
            <Menu className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
          </button>

          <button
            type="button"
            onClick={onOpenSearch}
            className="relative hidden h-9 w-56 items-center rounded-lg border border-white/[0.1] bg-[#18181B] pe-3 ps-9 text-left text-sm text-[#A1A1AA] transition-colors hover:border-white/[0.18] xl:flex"
          >
            <Search className="pointer-events-none absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-[#A1A1AA]" />
            <span className="truncate">{t.searchNotesPlaceholder}</span>
          </button>

          <nav
            aria-label={t.breadcrumbLabel}
            className="flex min-w-0 items-center gap-1 text-xs sm:gap-1.5 sm:text-sm"
          >
            <button
              type="button"
              onClick={onOpenOverview}
              className="hidden shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-[#A1A1AA] transition-colors hover:bg-[#18181B] hover:text-white sm:inline-flex"
            >
              <LayoutGrid className="h-3.5 w-3.5 text-accent" />
              <span>Notika</span>
            </button>

            <ChevronRight
              className="hidden h-3.5 w-3.5 shrink-0 text-[#52525B] sm:inline rtl:rotate-180"
              aria-hidden="true"
            />

            <span
              title={note.project}
              className="inline-flex max-w-[88px] min-w-0 items-center gap-1 rounded-md border border-white/[0.06] bg-[#141417] px-1.5 py-1 text-[11px] font-medium text-[#D4D4D8] sm:max-w-[180px] sm:gap-1.5 sm:px-2 sm:text-xs"
            >
              {projectIcon || projectColor ? (
                <NoteIconGlyph
                  icon={projectIcon}
                  isFolder={!projectIcon}
                  className={`h-3 w-3 shrink-0 ${
                    projectColor
                      ? getNoteColorStyle(projectColor).iconTextClass
                      : 'text-accent'
                  }`}
                />
              ) : (
                <Folder className="h-3 w-3 shrink-0 text-accent" />
              )}
              <span className="truncate">{note.project}</span>
            </span>

            <ChevronRight
              className="h-3.5 w-3.5 shrink-0 text-[#52525B] rtl:rotate-180"
              aria-hidden="true"
            />

            <h1
              title={`${note.project} / ${note.name}`}
              className="inline-flex min-w-0 items-center gap-1.5 font-medium text-[#FAFAFA]"
            >
              {note.icon || note.color ? (
                <span
                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                    getNoteColorStyle(note.color).badgeClass
                  }`}
                >
                  <NoteIconGlyph icon={note.icon} className="h-3 w-3" />
                </span>
              ) : (
                <FileText className="hidden h-3.5 w-3.5 shrink-0 text-[#71717A] sm:inline" />
              )}
              <span className="truncate">{note.title}</span>
              <span className="hidden truncate font-mono text-[11px] font-normal text-[#71717A] 2xl:inline">
                ({note.name})
              </span>
            </h1>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {copiedMarkdown && (
            <span
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-1 rounded-md border border-accent/35 bg-accent/10 px-2 py-1 text-xs font-medium text-accent whitespace-nowrap"
            >
              <Check className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.copiedMarkdownNotice}</span>
            </span>
          )}

          <div className="me-1 hidden items-center gap-1.5 text-xs md:flex">
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1 whitespace-nowrap text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                <span>{t.saved}</span>
              </span>
            )}
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1 whitespace-nowrap text-[#A1A1AA]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{t.saving}</span>
              </span>
            )}
            {saveStatus === 'dirty' && (
              <span className="whitespace-nowrap text-amber-400">
                {t.unsaved}
              </span>
            )}
            {saveStatus === 'error' && (
              <span
                title={saveError ?? t.saveError}
                className="flex items-center gap-1 whitespace-nowrap text-rose-400"
              >
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{t.saveError}</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenOverview}
            className="hidden h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-white/[0.1] bg-[#18181B] px-3 text-sm font-medium text-[#FAFAFA] transition-colors hover:bg-[#222227] lg:inline-flex"
          >
            <LayoutGrid className="h-4 w-4" />
            <span>{t.overview}</span>
          </button>

          <button
            type="button"
            onClick={handleExportMarkdown}
            title={t.exportMarkdownTitle}
            aria-label={t.exportNote}
            className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/[0.1] bg-[#18181B] px-2.5 text-xs font-medium text-[#FAFAFA] transition-colors hover:bg-[#222227] sm:h-10 sm:px-3 sm:text-sm"
          >
            <Download className="h-4 w-4 text-accent" />
            <span className="hidden sm:inline">{t.exportNote}</span>
          </button>

          <button
            type="button"
            onClick={onOpenLockModal}
            title={t.noteLock}
            aria-label={t.noteLock}
            className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium transition-colors sm:h-10 sm:px-3 sm:text-sm ${
              note.isLocked
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                : 'border-white/[0.1] bg-[#18181B] text-[#FAFAFA] hover:bg-[#222227]'
            }`}
          >
            {note.isLocked ? (
              <Lock className="h-4 w-4" />
            ) : (
              <LockOpen className="h-4 w-4 text-[#A1A1AA]" />
            )}
            <span className="hidden xl:inline">{t.noteLock}</span>
          </button>

          <button
            type="button"
            onClick={onOpenShareModal}
            title={t.share}
            aria-label={t.share}
            className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/[0.1] bg-[#18181B] px-2.5 text-xs font-medium text-[#FAFAFA] transition-colors hover:bg-[#222227] sm:h-10 sm:px-3.5 sm:text-sm"
          >
            <Share2 className="h-4 w-4 text-accent" />
            <span className="hidden sm:inline">{t.share}</span>
          </button>

          {showSaveButton ? (
            <button
              type="button"
              onClick={onManualSave}
              title={`${t.save} (Ctrl+S)`}
              aria-label={t.save}
              className="btn-primary-tactile inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-medium transition-colors sm:h-10 sm:px-4 sm:text-sm"
            >
              <span className="hidden sm:inline">{t.save}</span>
              <Save className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartEditing}
              className="btn-primary-tactile inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors sm:h-10 sm:px-4 sm:text-sm"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span>{t.editNoteButton}</span>
            </button>
          )}
        </div>
      </header>

      {/* Outer Card Shell */}
      <div className="shadow-card flex min-h-0 flex-1 flex-col gap-2 rounded-2xl bg-[#18181B] p-1.5 sm:p-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1.5 pt-0.5 sm:px-2">
          <div className="flex min-w-0 items-center gap-2 text-xs text-[#A1A1AA] sm:gap-2.5">
            <span className="max-w-[140px] truncate font-mono text-[#E4E4E7] sm:max-w-none">
              {note.name}
            </span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap tabular-nums">
              {stats.lines} {t.lines}
            </span>
            <span className="hidden sm:inline" aria-hidden="true">
              ·
            </span>
            <span className="hidden whitespace-nowrap tabular-nums sm:inline">
              {stats.words} {t.words}
            </span>
          </div>

          <div className="flex max-w-full flex-wrap items-center gap-1.5 sm:gap-2">
            <div ref={appearanceMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setAppearanceMenuOpen((prev) => !prev)}
                title={t.customizeAppearance}
                aria-label={t.customizeAppearance}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
                  note.icon || note.color
                    ? getNoteColorStyle(note.color).badgeClass
                    : 'border-white/[0.08] bg-black text-[#D4D4D8] hover:border-white/[0.18] hover:text-white'
                }`}
              >
                {note.icon || note.color ? (
                  <NoteIconGlyph icon={note.icon} className="h-3.5 w-3.5" />
                ) : (
                  <Palette className="h-3.5 w-3.5 text-accent" />
                )}
                <span className="hidden sm:inline">
                  {t.customizeAppearance}
                </span>
              </button>

              {appearanceMenuOpen && (
                <div className="shadow-card fixed inset-x-3 top-28 z-30 rounded-xl border border-white/[0.1] bg-[#18181B] p-3.5 sm:absolute sm:inset-x-auto sm:end-0 sm:top-10 sm:w-[340px]">
                  <NoteAppearancePicker
                    icon={note.icon}
                    color={note.color}
                    busy={appearanceBusy}
                    pickerHeight={280}
                    t={t}
                    onSelect={(next) => {
                      void onChangeAppearance(next);
                    }}
                  />
                </div>
              )}
            </div>

            {isEditing && (
              <>
                {/* Insert Template Trigger (enabled via Settings) */}
                {prefs.enableTemplates && (
                  <div ref={templateMenuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setTemplateMenuOpen((prev) => !prev)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/[0.08] bg-black px-2.5 text-xs font-medium text-[#E4E4E7] transition-colors hover:border-accent/50 hover:text-white"
                    >
                      <FileCode2 className="h-3.5 w-3.5 text-accent" />
                      <span>{t.insertTemplate}</span>
                    </button>

                    {templateMenuOpen && (
                      <div className="shadow-card absolute end-0 top-10 z-30 w-64 overflow-hidden rounded-xl border border-white/[0.1] bg-[#18181B] p-1.5">
                        {templates.length === 0 ? (
                          <div className="px-3 py-4 text-center text-xs text-[#71717A]">
                            {t.noTemplatesYet}
                          </div>
                        ) : (
                          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                            {templates.map((tpl) => (
                              <li key={tpl.name}>
                                <button
                                  type="button"
                                  onClick={() => handleInsertTemplate(tpl)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-xs text-[#E4E4E7] transition-colors hover:bg-black hover:text-accent"
                                >
                                  <FileCode2 className="h-3.5 w-3.5 shrink-0 text-accent" />
                                  <span className="truncate">{tpl.title}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!isPlainText && (
                  <div
                    role="group"
                    aria-label="Mode"
                    className="flex max-w-full items-center gap-1 overflow-x-auto pb-0.5 sm:pb-0"
                  >
                    <button
                      type="button"
                      onClick={() => onChangeViewMode('normal')}
                      className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs transition-colors sm:px-3 sm:text-sm ${
                        effectiveMode === 'normal'
                          ? 'bg-black font-medium text-accent'
                          : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      <Type className="h-3.5 w-3.5" />
                      <span>{t.modeNormal}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeViewMode('editor')}
                      className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs transition-colors sm:px-3 sm:text-sm ${
                        effectiveMode === 'editor'
                          ? 'bg-black font-medium text-accent'
                          : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      <Code2 className="h-3.5 w-3.5" />
                      <span>{t.modeMarkdown}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeViewMode('split')}
                      className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs transition-colors sm:px-3 sm:text-sm ${
                        effectiveMode === 'split'
                          ? 'bg-black font-medium text-accent'
                          : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      <Columns2 className="h-3.5 w-3.5" />
                      <span>{t.modeSplit}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeViewMode('preview')}
                      className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs transition-colors sm:px-3 sm:text-sm ${
                        effectiveMode === 'preview'
                          ? 'bg-black font-medium text-accent'
                          : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>{t.modePreview}</span>
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={onStopEditing}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-white/[0.1] bg-black px-2.5 text-xs font-medium text-[#D4D4D8] transition-colors hover:border-white/[0.2] hover:text-white"
                >
                  <Eye className="h-3.5 w-3.5 text-accent" />
                  <span>{t.doneEditingButton}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Inner Black Wells */}
        <div
          className={`flex min-h-0 flex-1 gap-2 overflow-hidden ${
            effectiveMode === 'split' ? 'flex-col md:flex-row' : ''
          }`}
        >
          {effectiveMode === 'normal' && (
            <div className="flex min-h-0 w-full flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-black">
              <NormalRichEditor
                noteKey={`${note.project}/${note.name}`}
                content={displayBody}
                isPlainText={isPlainText}
                fontSize={prefs.editorFontSize}
                spellCheck={prefs.spellcheck}
                t={t}
                onChangeContent={(nextBody) =>
                  onChangeContent(
                    isPlainText
                      ? nextBody
                      : replaceFrontmatterBody(content, nextBody)
                  )
                }
              />
            </div>
          )}

          {(effectiveMode === 'editor' || effectiveMode === 'split') && (
            <div
              className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-black ${
                effectiveMode === 'split'
                  ? 'h-1/2 w-full md:h-full md:w-1/2'
                  : 'w-full'
              }`}
            >
              <textarea
                aria-label={t.modeMarkdown}
                value={content}
                onChange={(event) => onChangeContent(event.target.value)}
                onKeyDown={handleTextareaKeyDown}
                spellCheck={prefs.spellcheck}
                wrap={prefs.wordWrap ? 'soft' : 'off'}
                placeholder="..."
                className={`font-editor h-full w-full flex-1 resize-none bg-transparent px-4 py-5 leading-[1.75] text-[#E4E4E7] placeholder-[#52525B] outline-none sm:px-6 sm:py-6 lg:px-8 lg:py-7 ${
                  prefs.wordWrap ? 'whitespace-pre-wrap' : 'overflow-x-auto whitespace-pre'
                } ${WORKSPACE_FONT_SIZE_CLASS[prefs.editorFontSize]}`}
              />
            </div>
          )}

          {(effectiveMode === 'preview' || effectiveMode === 'split') && (
            <div
              className={`min-h-0 overflow-y-auto rounded-xl border border-white/[0.08] bg-black ${
                effectiveMode === 'split'
                  ? 'h-1/2 w-full md:h-full md:w-1/2'
                  : 'h-full w-full'
              }`}
            >
              {isPlainText ? (
                <pre
                  className={`font-editor mx-auto max-w-3xl whitespace-pre-wrap break-words px-4 py-5 leading-[1.75] text-[#E4E4E7] sm:px-6 sm:py-6 lg:px-8 lg:py-7 ${WORKSPACE_FONT_SIZE_CLASS[prefs.editorFontSize]}`}
                >
                  {displayBody.trim().length === 0 ? (
                    <span className="text-sm text-[#71717A]">{t.noNotesFound}</span>
                  ) : (
                    displayBody
                  )}
                </pre>
              ) : (
                <article
                  className={`markdown-preview mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7 ${WORKSPACE_FONT_SIZE_CLASS[prefs.editorFontSize]}`}
                >
                  {displayBody.trim().length === 0 ? (
                    <p className="text-sm text-[#71717A]">{t.noNotesFound}</p>
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                      components={{
                        input: ({ type, checked, node, ...props }) => {
                          if (type === 'checkbox') {
                            const line = node?.position?.start.line;
                            return (
                              <input
                                {...props}
                                type="checkbox"
                                disabled={false}
                                checked={Boolean(checked)}
                                onChange={() => {
                                  if (typeof line === 'number') {
                                    const toggledBody =
                                      toggleTaskAtLineInMarkdown(
                                        displayBody,
                                        line
                                      );
                                    onChangeContent(
                                      replaceFrontmatterBody(content, toggledBody)
                                    );
                                  }
                                }}
                                className="cursor-pointer"
                              />
                            );
                          }
                          return <input type={type} checked={checked} {...props} />;
                        },
                        a: ({ href, children, ...props }) => {
                          const isExternal =
                            typeof href === 'string' &&
                            (href.startsWith('http://') ||
                              href.startsWith('https://'));
                          return (
                            <a
                              href={href}
                              target={isExternal ? '_blank' : undefined}
                              rel={isExternal ? 'noopener noreferrer' : undefined}
                              {...props}
                            >
                              {children}
                            </a>
                          );
                        },
                      }}
                    >
                      {displayBody}
                    </ReactMarkdown>
                  )}
                </article>
              )}
            </div>
          )}
        </div>

        {/* Workspace Footer: Word & Character Progress Indicator */}
        {prefs.showFooterStats && (
          <footer className="flex flex-wrap items-center justify-between gap-2 px-2 pt-0.5 text-xs text-[#A1A1AA]">
            <div className="flex items-center gap-2.5 tabular-nums">
              <span>
                <strong className="font-medium text-[#FAFAFA]">
                  {stats.words}
                </strong>{' '}
                {t.words}
              </span>
              <span aria-hidden="true" className="text-[#52525B]">
                ·
              </span>
              <span>
                <strong className="font-medium text-[#FAFAFA]">
                  {stats.characters}
                </strong>{' '}
                {t.characters}
              </span>
              <span
                aria-hidden="true"
                className="hidden text-[#52525B] sm:inline"
              >
                ·
              </span>
              <span className="hidden sm:inline">
                <strong className="font-medium text-[#FAFAFA]">
                  {stats.lines}
                </strong>{' '}
                {t.lines}
              </span>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
