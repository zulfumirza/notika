import { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { TranslationStrings } from '../i18n/translations';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  t: TranslationStrings;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  t,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, busy, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="shadow-card w-full max-w-md rounded-2xl bg-[#18181B] p-2"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rounded-xl border border-white/[0.08] bg-black p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-rose-400">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <h2
                id="confirm-dialog-title"
                className="text-base font-medium text-[#FAFAFA]"
              >
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              aria-label={t.cancel}
              className="rounded-lg p-1.5 text-[#A1A1AA] transition-colors hover:bg-[#18181B] hover:text-white disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-[#A1A1AA]">
            {description}
          </p>

          <div className="mt-5 flex items-center justify-end gap-2.5">
            <button
              ref={cancelButtonRef}
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="h-10 whitespace-nowrap rounded-lg border border-white/[0.1] bg-[#18181B] px-4 text-xs font-medium text-[#FAFAFA] transition-colors hover:bg-[#222227] disabled:opacity-50"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="h-10 whitespace-nowrap rounded-lg bg-rose-600 px-4 text-xs font-medium text-white shadow-[inset_0_1px_4px_rgba(255,255,255,0.2)] transition-colors hover:bg-rose-500 disabled:opacity-50"
            >
              {busy ? '...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
