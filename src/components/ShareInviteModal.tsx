import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Link2,
  Loader2,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import type { TranslationStrings } from '../i18n/translations';
import {
  ApiError,
  createShareOrInvite,
  listNoteShares,
  revokeShare,
  updateSharePermission,
} from '../lib/api';
import type { ShareKind, SharePermission, ShareRecord } from '../types/vault';

interface ShareInviteModalProps {
  open: boolean;
  project: string;
  noteName: string;
  noteTitle: string;
  t: TranslationStrings;
  onClose: () => void;
}

export function ShareInviteModal({
  open,
  project,
  noteName,
  noteTitle,
  t,
  onClose,
}: ShareInviteModalProps) {
  const [activeTab, setActiveTab] = useState<ShareKind>('link');
  const [permission, setPermission] = useState<SharePermission>('read');
  const [inviteeName, setInviteeName] = useState('');
  const [inviteeEmail, setInviteeEmail] = useState('');

  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadShares = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const records = await listNoteShares(project, noteName);
      setShares(records);
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : 'Bağlantılar yüklenemedi.'
      );
    } finally {
      setLoading(false);
    }
  }, [open, project, noteName]);

  useEffect(() => {
    void loadShares();
  }, [loadShares]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const getShareUrl = (code: string) => `${window.location.origin}/s/${code}`;

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(getShareUrl(code));
      setCopiedCode(code);
      window.setTimeout(() => {
        setCopiedCode((prev) => (prev === code ? null : prev));
      }, 2000);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (activeTab === 'invite' && !inviteeName.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const created = await createShareOrInvite({
        project,
        note: noteName,
        permission,
        kind: activeTab,
        inviteeName: activeTab === 'invite' ? inviteeName.trim() : undefined,
        inviteeEmail:
          activeTab === 'invite' && inviteeEmail.trim()
            ? inviteeEmail.trim()
            : undefined,
      });
      setShares((prev) => [created, ...prev]);
      setInviteeName('');
      setInviteeEmail('');
      await handleCopy(created.code);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePermission = async (share: ShareRecord) => {
    const nextPerm: SharePermission =
      share.permission === 'read' ? 'edit' : 'read';
    setBusyCode(share.code);
    try {
      const updated = await updateSharePermission(share.code, nextPerm);
      setShares((prev) =>
        prev.map((item) => (item.code === updated.code ? updated : item))
      );
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Güncellenemedi.');
    } finally {
      setBusyCode(null);
    }
  };

  const handleRevoke = async (code: string) => {
    setBusyCode(code);
    try {
      await revokeShare(code);
      setShares((prev) => prev.filter((item) => item.code !== code));
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'İptal edilemedi.');
    } finally {
      setBusyCode(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
      onClick={onClose}
    >
      <div
        className="shadow-card max-h-[90vh] w-full max-w-xl overflow-hidden rounded-2xl bg-[#18181B] p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex max-h-[85vh] flex-col rounded-xl border border-white/[0.08] bg-black">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
            <div className="min-w-0">
              <h2
                id="share-modal-title"
                className="text-base font-medium text-[#FAFAFA]"
              >
                {t.shareModalTitle}
              </h2>
              <p className="mt-0.5 truncate text-xs text-[#A1A1AA]">
                {project} / {noteTitle}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.cancel}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#A1A1AA] transition-colors hover:bg-[#18181B] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Tabs */}
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#18181B] p-1">
              <button
                type="button"
                onClick={() => setActiveTab('link')}
                className={`flex h-10 items-center justify-center gap-2 rounded-lg text-xs font-medium transition-colors sm:text-sm ${
                  activeTab === 'link'
                    ? 'bg-black text-[#34D399]'
                    : 'text-[#A1A1AA] hover:text-white'
                }`}
              >
                <Link2 className="h-4 w-4 shrink-0" />
                <span className="truncate">{t.shortShareTab}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('invite')}
                className={`flex h-10 items-center justify-center gap-2 rounded-lg text-xs font-medium transition-colors sm:text-sm ${
                  activeTab === 'invite'
                    ? 'bg-black text-[#34D399]'
                    : 'text-[#A1A1AA] hover:text-white'
                }`}
              >
                <UserPlus className="h-4 w-4 shrink-0" />
                <span className="truncate">{t.inviteTab}</span>
              </button>
            </div>

            {/* Form */}
            <form
              onSubmit={handleCreate}
              className="space-y-3 rounded-xl border border-white/[0.08] bg-[#111113] p-4"
            >
              {activeTab === 'invite' && (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <input
                    type="text"
                    required
                    value={inviteeName}
                    onChange={(e) => setInviteeName(e.target.value)}
                    placeholder={t.inviteeNamePlaceholder}
                    className="h-10 rounded-lg border border-white/[0.1] bg-black px-3 text-sm text-[#FAFAFA] placeholder-[#71717A] outline-none focus:border-[#34D399]"
                  />
                  <input
                    type="email"
                    value={inviteeEmail}
                    onChange={(e) => setInviteeEmail(e.target.value)}
                    placeholder={t.inviteeEmailPlaceholder}
                    className="h-10 rounded-lg border border-white/[0.1] bg-black px-3 text-sm text-[#FAFAFA] placeholder-[#71717A] outline-none focus:border-[#34D399]"
                  />
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-white/[0.08] bg-black p-1">
                  <button
                    type="button"
                    onClick={() => setPermission('read')}
                    className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${
                      permission === 'read'
                        ? 'bg-[#1F1F23] text-[#FAFAFA]'
                        : 'text-[#71717A] hover:text-white'
                    }`}
                  >
                    {t.permissionRead}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPermission('edit')}
                    className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${
                      permission === 'edit'
                        ? 'bg-[#1F1F23] text-[#34D399]'
                        : 'text-[#71717A] hover:text-white'
                    }`}
                  >
                    {t.permissionEdit}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={
                    submitting ||
                    (activeTab === 'invite' && !inviteeName.trim())
                  }
                  className="btn-primary-tactile inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : activeTab === 'link' ? (
                    <Link2 className="h-4 w-4" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  <span>
                    {activeTab === 'link' ? t.createShortLink : t.invitePerson}
                  </span>
                </button>
              </div>
            </form>

            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Existing Links & Invites */}
            <div className="space-y-2.5">
              <div className="text-xs font-medium text-[#A1A1AA]">
                {t.activeLinksAndInvites}
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-6 text-xs text-[#71717A]">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                </div>
              ) : shares.length === 0 ? (
                <div className="rounded-xl border border-white/[0.08] bg-[#111113] px-4 py-6 text-center text-xs text-[#71717A]">
                  {t.noSharesYet}
                </div>
              ) : (
                <ul className="space-y-2">
                  {shares.map((share) => {
                    const url = getShareUrl(share.code);
                    const isCopied = copiedCode === share.code;
                    const isBusy = busyCode === share.code;

                    return (
                      <li
                        key={share.code}
                        className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-[#111113] p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${
                                share.kind === 'invite'
                                  ? 'bg-sky-500/15 text-sky-300'
                                  : 'bg-emerald-500/15 text-[#34D399]'
                              }`}
                            >
                              {share.kind === 'invite'
                                ? share.inviteeName
                                : `/s/${share.code}`}
                            </span>
                            {share.inviteeEmail && (
                              <span className="truncate text-xs text-[#71717A]">
                                {share.inviteeEmail}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 truncate font-mono text-xs text-[#A1A1AA]">
                            {url}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleTogglePermission(share)}
                            className={`h-9 rounded-lg border border-white/[0.1] px-2.5 text-xs font-medium transition-colors ${
                              share.permission === 'edit'
                                ? 'bg-emerald-500/10 text-[#34D399]'
                                : 'bg-black text-[#A1A1AA] hover:text-white'
                            }`}
                          >
                            {share.permission === 'edit'
                              ? t.permissionEdit
                              : t.permissionRead}
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleCopy(share.code)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#18181B] px-3 text-xs font-medium text-[#FAFAFA] transition-colors hover:bg-[#222227]"
                          >
                            {isCopied ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-[#34D399]" />
                                <span>{t.copied}</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                <span>{t.copyLink}</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleRevoke(share.code)}
                            title={t.revoke}
                            aria-label={t.revoke}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-black text-[#A1A1AA] transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
