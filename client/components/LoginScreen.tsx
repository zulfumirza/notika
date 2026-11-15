import { useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, ArrowRight } from 'lucide-react';
import {
  SUPPORTED_LANGUAGES,
  type TranslationStrings,
} from '../i18n/translations';
import { ApiError, loginWithPassword } from '../lib/api';
import type { LanguageCode } from '../types/vault';
import { NotikaLogo } from './NotikaLogo';

interface LoginScreenProps {
  language: LanguageCode;
  t: TranslationStrings;
  onChangeLanguage: (lang: LanguageCode) => void;
  onSuccess: () => void;
}

export function LoginScreen({
  language,
  t,
  onChangeLanguage,
  onSuccess,
}: LoginScreenProps) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await loginWithPassword(password);
      onSuccess();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Login failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#09090B] px-4 py-8">
      <div className="shadow-card w-full max-w-sm rounded-2xl bg-[#18181B] p-2">
        <div className="rounded-xl border border-white/[0.08] bg-black p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <NotikaLogo className="h-9 w-9 shrink-0 text-accent" />
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-[#FAFAFA]">
                  Notika
                </h1>
                <p className="text-xs text-[#A1A1AA]">{t.loginSubtitle}</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="vault-password"
                className="block text-xs font-medium text-[#A1A1AA]"
              >
                {t.loginPasswordLabel}
              </label>
              <input
                id="vault-password"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t.loginPasswordPlaceholder}
                className="mt-1.5 h-11 w-full rounded-lg border border-white/[0.1] bg-[#18181B] px-3.5 text-sm text-[#FAFAFA] placeholder-[#71717A] outline-none transition-colors focus:border-accent"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || password.trim().length === 0}
              className="btn-primary-tactile flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>{submitting ? t.loginVerifying : t.loginButton}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-5 border-t border-white/[0.08] pt-4">
            <select
              aria-label={t.languageLabel}
              value={language}
              onChange={(e) => onChangeLanguage(e.target.value as LanguageCode)}
              className="h-9 w-full rounded-lg border border-white/[0.08] bg-[#111113] px-3 text-xs text-[#A1A1AA] outline-none focus:border-accent"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.nativeName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
