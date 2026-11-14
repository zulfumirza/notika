import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertCircle,
  KeyRound,
  Loader2,
  Lock,
  ShieldOff,
  X,
} from 'lucide-react';
import type { TranslationStrings } from '../i18n/translations';
import { ApiError, configureNoteLock } from '../lib/api';

interface NoteLockModalProps {
  open: boolean;
  project: string;
  noteName: string;
  noteTitle: string;
  isLocked: boolean;
  t: TranslationStrings;
  onLockUpdated: (nextLocked: boolean, lockedSessionNow?: boolean) => void;
  onClose: () => void;
}

export function NoteLockModal({
  open,
  project,
  noteName,
  noteTitle,
  isLocked,
  t,
  onLockUpdated,
  onClose,
}: NoteLockModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCurrentPassword('');
    setNewPassword('');
    setError(null);
  }, [open, project, noteName]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSetOrUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newPassword.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await configureNoteLock({
        project,
        name: noteName,
        action: 'set',
        password: newPassword,
        ...(isLocked && currentPassword ? { currentPassword } : {}),
      });
      onLockUpdated(res.isLocked, false);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : t.saveError);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await configureNoteLock({
        project,
        name: noteName,
        action: 'remove',
        ...(currentPassword ? { currentPassword } : {}),
      });
      onLockUpdated(res.isLocked, false);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : t.saveError);
    } finally {
      setBusy(false);
    }
  };

  const handleLockSessionNow = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await configureNoteLock({
        project,
        name: noteName,
        action: 'lock-session',
      });
      onLockUpdated(true, true);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : t.saveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="note-lock-title"
      onClick={onClose}
    >
      <div
        className="shadow-card w-full max-w-md rounded-2xl bg-[#18181B] p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-xl border border-white/[0.08] bg-black">
          <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-accent" />
                <h2
                  id="note-lock-title"
                  className="text-base font-medium text-[#FAFAFA]"
                >
                  {t.noteLock}
                </h2>
              </div>
              <p className="mt-0.5 truncate text-xs text-[#A1A1AA]">
                {project} / {noteTitle}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.cancel}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[#A1A1AA] transition-colors hover:bg-[#18181B] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSetOrUpdate} className="space-y-4 p-5">
            {isLocked && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-accent/25 bg-accent/10 px-3.5 py-2.5 text-xs text-emerald-300">
                <span className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  <span>{t.noteLockedTitle}</span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleLockSessionNow()}
                  className="rounded-md border border-accent/40 bg-black/50 px-2.5 py-1 text-[11px] font-medium text-emerald-200 transition-colors hover:bg-black"
                >
                  {t.lockNoteNow}
                </button>
              </div>
            )}

            <div className="space-y-2.5">
              {isLocked && (
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={t.currentPasswordPlaceholder}
                  aria-label={t.currentPasswordPlaceholder}
                  className="h-10 w-full rounded-lg border border-white/[0.1] bg-[#111113] px-3 text-sm text-[#FAFAFA] placeholder-[#71717A] outline-none focus:border-accent"
                />
              )}

              <input
                type="password"
                autoFocus
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={
                  isLocked ? t.newPasswordPlaceholder : t.notePasswordPlaceholder
                }
                aria-label={
                  isLocked ? t.newPasswordPlaceholder : t.notePasswordPlaceholder
                }
                className="h-10 w-full rounded-lg border border-white/[0.1] bg-[#111113] px-3 text-sm text-[#FAFAFA] placeholder-[#71717A] outline-none focus:border-accent"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {isLocked ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleRemove()}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                >
                  <ShieldOff className="h-3.5 w-3.5" />
                  <span>{t.removeNotePassword}</span>
                </button>
              ) : (
                <span />
              )}

              <button
                type="submit"
                disabled={busy || !newPassword}
                className="btn-primary-tactile inline-flex h-10 items-center gap-2 rounded-lg px-4 text-xs font-medium disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                <span>
                  {isLocked ? t.changeNotePassword : t.setNotePassword}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
