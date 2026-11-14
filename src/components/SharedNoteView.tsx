import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Code2,
  Eye,
  Loader2,
  Lock,
  Save,
  Type,
  UserCheck,
} from 'lucide-react';
import {
  parseFrontmatter,
  replaceFrontmatterBody,
} from '../../shared/frontmatter.ts';
import type { FormEvent } from 'react';
import type { TranslationStrings } from '../i18n/translations';
import {
  ApiError,
  fetchPublicShare,
  savePublicShare,
  verifyPublicSharePassword,
} from '../lib/api';
import { toggleTaskAtLineInMarkdown } from '../lib/richMarkdown';
import type { PublicSharedNote, SaveStatus } from '../types/vault';
import { NormalRichEditor } from './NormalRichEditor';
import { NotikaLogo } from './NotikaLogo';

interface SharedNoteViewProps {
  code: string;
  t: TranslationStrings;
}

type ShareViewTab = 'normal' | 'editor' | 'preview';

export function SharedNoteView({ code, t }: SharedNoteViewProps) {
  const [note, setNote] = useState<PublicSharedNote | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFoundError, setNotFoundError] = useState<string | null>(null);
  const [tab, setTab] = useState<ShareViewTab>('preview');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const autosaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFoundError(null);

    void (async () => {
      try {
        const fetched = await fetchPublicShare(code);
        if (!cancelled) {
          setNote(fetched);
          setContent(fetched.content);
          setTab(fetched.permission === 'edit' ? 'normal' : 'preview');
          setSaveStatus('saved');
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setNotFoundError(
            err instanceof ApiError ? err.message : t.shareNotFound
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [code, t.shareNotFound]);

  const persistShare = useCallback(
    async (nextContent: string) => {
      if (!note || note.permission !== 'edit') return;
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      setSaveStatus('saving');
      try {
        const updated = await savePublicShare(code, nextContent);
        setNote(updated);
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    },
    [code, note]
  );

  const handleContentChange = (nextContent: string) => {
    setContent(nextContent);
    if (!note || note.permission !== 'edit') return;

    setSaveStatus('dirty');
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      void persistShare(nextContent);
    }, 800);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090B] text-sm text-[#A1A1AA]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-accent" />
        <span>{t.loadingVault}</span>
      </div>
    );
  }

  if (notFoundError || !note) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090B] px-4">
        <div className="shadow-card w-full max-w-md rounded-2xl bg-[#18181B] p-2">
          <div className="rounded-xl border border-white/[0.08] bg-black p-6 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-rose-500/15 text-rose-400">
              <AlertCircle className="h-5 w-5" />
            </div>
            <h1 className="mt-4 text-base font-medium text-[#FAFAFA]">
              Notika
            </h1>
            <p className="mt-2 text-sm text-[#A1A1AA]">
              {notFoundError ?? t.shareNotFound}
            </p>
            <a
              href="/"
              className="btn-primary-tactile mt-5 inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>{t.backToNotika}</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  const handleUnlockShare = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!unlockPassword || unlockBusy) return;
    setUnlockBusy(true);
    setUnlockError(null);
    try {
      const unlocked = await verifyPublicSharePassword(code, unlockPassword);
      setNote(unlocked);
      setContent(unlocked.content);
      setTab(unlocked.permission === 'edit' ? 'normal' : 'preview');
      setUnlockPassword('');
    } catch (err: unknown) {
      setUnlockError(
        err instanceof ApiError ? err.message : t.shareLockedDesc
      );
    } finally {
      setUnlockBusy(false);
    }
  };

  if (note.requiresPassword) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090B] px-4">
        <div className="shadow-card w-full max-w-md rounded-2xl bg-[#18181B] p-2">
          <form
            onSubmit={handleUnlockShare}
            className="space-y-4 rounded-xl border border-white/[0.08] bg-black p-6"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
                <Lock className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold text-[#FAFAFA]">
                  {t.shareLockedTitle}
                </h1>
                <p className="truncate text-xs text-[#71717A]">
                  {note.project} / {note.title}
                </p>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-[#A1A1AA]">
              {t.shareLockedDesc}
            </p>

            <input
              type="password"
              autoFocus
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              placeholder={t.notePasswordPlaceholder}
              aria-label={t.notePasswordPlaceholder}
              className="h-10 w-full rounded-lg border border-white/[0.1] bg-[#111113] px-3 text-sm text-[#FAFAFA] placeholder-[#71717A] outline-none focus:border-accent"
            />

            {unlockError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{unlockError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={unlockBusy || !unlockPassword}
              className="btn-primary-tactile flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {unlockBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              <span>{t.unlockShareButton}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  const isPlainText = note.note.toLowerCase().endsWith('.txt');
  const canEdit = note.permission === 'edit';
  const parsedFrontmatter = isPlainText ? null : parseFrontmatter(content);
  const displayBody = parsedFrontmatter ? parsedFrontmatter.body : content;

  return (
    <div className="flex min-h-screen flex-col bg-[#09090B] text-[#FAFAFA]">
      <header className="border-b border-white/[0.08] bg-[#111113] px-4 py-3 lg:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <a
              href="/"
              className="flex items-center gap-2 text-[#FAFAFA] hover:opacity-85"
            >
              <NotikaLogo className="h-7 w-7 text-accent" />
              <span className="text-base font-semibold">Notika</span>
            </a>
            <span className="text-[#52525B]" aria-hidden="true">
              /
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-medium text-[#FAFAFA] sm:text-base">
                {note.title}
              </h1>
              <p className="truncate text-xs text-[#71717A]">{note.project}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {note.kind === 'invite' && note.inviteeName ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-300">
                <UserCheck className="h-3.5 w-3.5" />
                <span>
                  {t.invitedBadge}: {note.inviteeName}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#18181B] px-2.5 py-1 text-xs font-medium text-[#A1A1AA]">
                {!canEdit && <Lock className="h-3.5 w-3.5" />}
                <span>{t.sharedNoteBadge}</span>
              </span>
            )}

            {canEdit && (
              <>
                <span className="text-xs text-[#A1A1AA]">
                  {saveStatus === 'saved' && (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <Check className="h-3.5 w-3.5" />
                      {t.saved}
                    </span>
                  )}
                  {saveStatus === 'saving' && t.saving}
                  {saveStatus === 'dirty' && t.unsaved}
                  {saveStatus === 'error' && t.saveError}
                </span>

                <button
                  type="button"
                  onClick={() => void persistShare(content)}
                  className="btn-primary-tactile inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-xs font-medium sm:text-sm"
                >
                  <Save className="h-4 w-4" />
                  <span>{t.save}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col p-4 lg:p-6">
        <div className="shadow-card flex flex-1 flex-col gap-2 rounded-2xl bg-[#18181B] p-2">
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-0.5">
            <span className="text-xs text-[#A1A1AA]">
              {canEdit ? t.permissionEdit : t.readOnlyNotice}
            </span>

            {canEdit && !isPlainText && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setTab('normal')}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
                    tab === 'normal'
                      ? 'bg-black text-accent'
                      : 'text-[#A1A1AA] hover:text-white'
                  }`}
                >
                  <Type className="h-3.5 w-3.5" />
                  <span>{t.modeNormal}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTab('editor')}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
                    tab === 'editor'
                      ? 'bg-black text-accent'
                      : 'text-[#A1A1AA] hover:text-white'
                  }`}
                >
                  <Code2 className="h-3.5 w-3.5" />
                  <span>{t.modeMarkdown}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTab('preview')}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
                    tab === 'preview'
                      ? 'bg-black text-accent'
                      : 'text-[#A1A1AA] hover:text-white'
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>{t.modePreview}</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex min-h-[60vh] flex-1 overflow-hidden rounded-xl border border-white/[0.08] bg-black">
            {canEdit && (tab === 'normal' || isPlainText) ? (
              <div className="w-full">
                <NormalRichEditor
                  noteKey={`share/${code}`}
                  content={displayBody}
                  isPlainText={isPlainText}
                  t={t}
                  onChangeContent={(nextBody) =>
                    handleContentChange(
                      isPlainText
                        ? nextBody
                        : replaceFrontmatterBody(content, nextBody)
                    )
                  }
                />
              </div>
            ) : canEdit && tab === 'editor' ? (
              <textarea
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                spellCheck={false}
                className="font-editor min-h-[60vh] w-full flex-1 resize-none bg-transparent p-6 text-sm leading-relaxed text-[#E4E4E7] outline-none lg:p-8"
              />
            ) : (
              <article className="markdown-preview mx-auto w-full max-w-3xl overflow-y-auto px-5 py-6 lg:px-8 lg:py-8">
                {isPlainText ? (
                  <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-[#E4E4E7]">
                    {content}
                  </pre>
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
                              disabled={!canEdit}
                              checked={Boolean(checked)}
                              onChange={() => {
                                if (canEdit && typeof line === 'number') {
                                  const toggledBody =
                                    toggleTaskAtLineInMarkdown(
                                      displayBody,
                                      line
                                    );
                                  handleContentChange(
                                    replaceFrontmatterBody(content, toggledBody)
                                  );
                                }
                              }}
                              className={canEdit ? 'cursor-pointer' : ''}
                            />
                          );
                        }
                        return <input type={type} checked={checked} {...props} />;
                      },
                    }}
                  >
                    {displayBody}
                  </ReactMarkdown>
                )}
              </article>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
