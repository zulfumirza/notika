import { useMemo } from 'react';
import type { KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  AlertCircle,
  Check,
  Code2,
  Columns2,
  Eye,
  LayoutGrid,
  Loader2,
  Menu,
  Save,
  Search,
  Share2,
  Type,
} from 'lucide-react';
import type { TranslationStrings } from '../i18n/translations';
import { toggleTaskAtLineInMarkdown } from '../lib/richMarkdown';
import type { EditorViewMode, NoteDocument, SaveStatus } from '../types/vault';
import { NormalRichEditor } from './NormalRichEditor';

interface EditorWorkspaceProps {
  note: NoteDocument;
  content: string;
  viewMode: EditorViewMode;
  saveStatus: SaveStatus;
  saveError: string | null;
  t: TranslationStrings;
  onOpenMobileSidebar: () => void;
  onChangeContent: (nextContent: string) => void;
  onChangeViewMode: (mode: EditorViewMode) => void;
  onManualSave: () => void;
  onOpenSearch: () => void;
  onOpenOverview: () => void;
  onOpenShareModal: () => void;
}

export function EditorWorkspace({
  note,
  content,
  viewMode,
  saveStatus,
  saveError,
  t,
  onOpenMobileSidebar,
  onChangeContent,
  onChangeViewMode,
  onManualSave,
  onOpenSearch,
  onOpenOverview,
  onOpenShareModal,
}: EditorWorkspaceProps) {
  const isPlainText = note.name.toLowerCase().endsWith('.txt');
  const effectiveMode: EditorViewMode = isPlainText ? 'normal' : viewMode;

  const stats = useMemo(() => {
    const trimmed = content.trim();
    const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
    const lines = content.length === 0 ? 1 : content.split(/\r?\n/).length;
    return { words, lines };
  }, [content]);

  const handleTextareaKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      const target = event.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const updated = content.slice(0, start) + '  ' + content.slice(end);
      onChangeContent(updated);
      window.requestAnimationFrame(() => {
        target.selectionStart = start + 2;
        target.selectionEnd = start + 2;
      });
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-[#09090B] px-3 pb-4 sm:px-4 lg:px-8 lg:pb-5">
      {/* Topbar */}
      <header className="flex min-h-16 shrink-0 items-center justify-between gap-2 py-2 sm:gap-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            aria-label={t.projects}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.1] bg-[#18181B] text-[#FAFAFA] hover:bg-[#222227] lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={onOpenSearch}
            className="relative hidden h-9 w-56 items-center rounded-lg border border-white/[0.1] bg-[#18181B] pe-3 ps-9 text-left text-sm text-[#A1A1AA] transition-colors hover:border-white/[0.18] xl:flex"
          >
            <Search className="pointer-events-none absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-[#A1A1AA]" />
            <span className="truncate">{t.searchNotesPlaceholder}</span>
          </button>

          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="hidden truncate text-[#A1A1AA] sm:inline">
              {note.project}
            </span>
            <span
              className="hidden text-[#52525B] sm:inline"
              aria-hidden="true"
            >
              /
            </span>
            <h1 className="truncate font-medium text-[#FAFAFA]">{note.title}</h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
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
            onClick={onOpenShareModal}
            title={t.share}
            aria-label={t.share}
            className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/[0.1] bg-[#18181B] px-3 text-xs font-medium text-[#FAFAFA] transition-colors hover:bg-[#222227] sm:px-3.5 sm:text-sm"
          >
            <Share2 className="h-4 w-4 text-[#34D399]" />
            <span className="hidden sm:inline">{t.share}</span>
          </button>

          <button
            type="button"
            onClick={onManualSave}
            title={`${t.save} (Ctrl+S)`}
            className="btn-primary-tactile inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-xs font-medium transition-colors sm:px-4 sm:text-sm"
          >
            <span className="hidden sm:inline">{t.save}</span>
            <Save className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Outer Card Shell */}
      <div className="shadow-card flex min-h-0 flex-1 flex-col gap-2 rounded-2xl bg-[#18181B] p-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-0.5">
          <div className="flex items-center gap-2.5 text-xs text-[#A1A1AA]">
            <span className="truncate font-mono text-[#E4E4E7]">{note.name}</span>
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
                    ? 'bg-black font-medium text-[#34D399]'
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
                    ? 'bg-black font-medium text-[#34D399]'
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
                    ? 'bg-black font-medium text-[#34D399]'
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
                    ? 'bg-black font-medium text-[#34D399]'
                    : 'text-[#A1A1AA] hover:text-white'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>{t.modePreview}</span>
              </button>
            </div>
          )}
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
                content={content}
                isPlainText={isPlainText}
                t={t}
                onChangeContent={onChangeContent}
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
                spellCheck={false}
                placeholder="..."
                className="font-editor h-full w-full flex-1 resize-none bg-transparent px-4 py-5 text-[14px] leading-[1.75] text-[#E4E4E7] placeholder-[#52525B] outline-none sm:px-6 sm:py-6 lg:px-8 lg:py-7"
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
              <article className="markdown-preview mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
                {content.trim().length === 0 ? (
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
                                  onChangeContent(
                                    toggleTaskAtLineInMarkdown(content, line)
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
                    {content}
                  </ReactMarkdown>
                )}
              </article>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
