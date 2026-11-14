import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Globe,
  Loader2,
  LogOut,
  RefreshCw,
  Server,
  Sliders,
  X,
} from 'lucide-react';
import {
  SUPPORTED_LANGUAGES,
  type TranslationStrings,
} from '../i18n/translations';
import {
  ApiError,
  fetchSettings,
  regenerateMcpToken,
  updateSettings,
} from '../lib/api';
import type {
  AppSettings,
  EditorViewMode,
  LanguageCode,
} from '../types/vault';

interface SettingsModalProps {
  open: boolean;
  language: LanguageCode;
  defaultViewMode: EditorViewMode;
  authEnabled: boolean;
  t: TranslationStrings;
  onChangeLanguage: (lang: LanguageCode) => void;
  onChangeDefaultViewMode: (mode: EditorViewMode) => void;
  onLogout: () => void;
  onClose: () => void;
}

export function SettingsModal({
  open,
  language,
  defaultViewMode,
  authEnabled,
  t,
  onChangeLanguage,
  onChangeDefaultViewMode,
  onLogout,
  onClose,
}: SettingsModalProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingMcp, setSavingMcp] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSettings();
      setSettings(data);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Ayarlar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

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

  const mcpEndpoint = `${window.location.origin}/api/mcp`;
  const mcpConfigJson = JSON.stringify(
    {
      mcpServers: {
        notika: {
          url: mcpEndpoint,
          headers: {
            Authorization: `Bearer ${settings?.mcpToken ?? '<MCP_TOKEN>'}`,
          },
        },
      },
    },
    null,
    2
  );

  const handleCopy = async (field: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      window.setTimeout(() => {
        setCopiedField((prev) => (prev === field ? null : prev));
      }, 2000);
    } catch {
      // Ignore clipboard rejection
    }
  };

  const handleToggleMcp = async () => {
    if (!settings || savingMcp) return;
    setSavingMcp(true);
    setError(null);
    try {
      const updated = await updateSettings({
        mcpEnabled: !settings.mcpEnabled,
      });
      setSettings(updated);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Güncellenemedi.');
    } finally {
      setSavingMcp(false);
    }
  };

  const handleRegenerateToken = async () => {
    if (savingMcp) return;
    setSavingMcp(true);
    setError(null);
    try {
      const updated = await regenerateMcpToken();
      setSettings(updated);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Yenilenemedi.');
    } finally {
      setSavingMcp(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={onClose}
    >
      <div
        className="shadow-card max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-[#18181B] p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex max-h-[88vh] flex-col rounded-xl border border-white/[0.08] bg-black">
          <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
            <h2
              id="settings-modal-title"
              className="text-base font-medium text-[#FAFAFA]"
            >
              {t.settingsTitle}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.cancel}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[#A1A1AA] transition-colors hover:bg-[#18181B] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {/* Language Switcher (10 Languages) */}
            <section className="space-y-3 rounded-xl border border-white/[0.08] bg-[#111113] p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-[#FAFAFA]">
                <Globe className="h-4 w-4 text-[#34D399]" />
                <span>{t.languageLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {SUPPORTED_LANGUAGES.map((lang) => {
                  const active = lang.code === language;
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => onChangeLanguage(lang.code)}
                      className={`flex h-10 items-center justify-center rounded-lg border px-2 text-xs font-medium transition-colors ${
                        active
                          ? 'border-[#34D399] bg-emerald-500/15 text-[#34D399]'
                          : 'border-white/[0.08] bg-black text-[#A1A1AA] hover:border-white/[0.2] hover:text-white'
                      }`}
                    >
                      {lang.nativeName}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Default Editor Mode */}
            <section className="space-y-3 rounded-xl border border-white/[0.08] bg-[#111113] p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-[#FAFAFA]">
                <Sliders className="h-4 w-4 text-[#34D399]" />
                <span>{t.defaultEditorModeLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    { id: 'normal', label: t.modeNormal },
                    { id: 'editor', label: t.modeMarkdown },
                    { id: 'split', label: t.modeSplit },
                    { id: 'preview', label: t.modePreview },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => onChangeDefaultViewMode(mode.id)}
                    className={`flex h-10 items-center justify-center rounded-lg border text-xs font-medium transition-colors ${
                      defaultViewMode === mode.id
                        ? 'border-[#34D399] bg-emerald-500/15 text-[#34D399]'
                        : 'border-white/[0.08] bg-black text-[#A1A1AA] hover:border-white/[0.2] hover:text-white'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </section>

            {/* MCP Support Section */}
            <section className="space-y-3 rounded-xl border border-white/[0.08] bg-[#111113] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-[#FAFAFA]">
                    <Server className="h-4 w-4 text-[#34D399]" />
                    <span>{t.mcpTitle}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#A1A1AA]">
                    {t.mcpDesc}
                  </p>
                </div>

                {settings && (
                  <button
                    type="button"
                    disabled={savingMcp}
                    onClick={() => void handleToggleMcp()}
                    aria-pressed={settings.mcpEnabled}
                    className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors ${
                      settings.mcpEnabled
                        ? 'border-[#34D399] bg-emerald-500/15 text-[#34D399]'
                        : 'border-white/[0.1] bg-black text-[#A1A1AA] hover:text-white'
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        settings.mcpEnabled ? 'bg-[#34D399]' : 'bg-[#52525B]'
                      }`}
                    />
                    <span>{t.mcpEnabledLabel}</span>
                  </button>
                )}
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-6 text-xs text-[#71717A]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : settings ? (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-medium text-[#A1A1AA]">
                      {t.mcpEndpointLabel}
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={mcpEndpoint}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black px-3 font-mono text-xs text-[#E4E4E7] outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void handleCopy('endpoint', mcpEndpoint)}
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#18181B] px-3 text-xs font-medium text-[#FAFAFA] hover:bg-[#222227]"
                      >
                        {copiedField === 'endpoint' ? (
                          <Check className="h-3.5 w-3.5 text-[#34D399]" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>
                          {copiedField === 'endpoint' ? t.copied : t.copyLink}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#A1A1AA]">
                      {t.mcpTokenLabel}
                    </label>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={settings.mcpToken}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black px-3 font-mono text-xs text-[#34D399] outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void handleCopy('token', settings.mcpToken)
                        }
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#18181B] px-3 text-xs font-medium text-[#FAFAFA] hover:bg-[#222227]"
                      >
                        {copiedField === 'token' ? (
                          <Check className="h-3.5 w-3.5 text-[#34D399]" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>
                          {copiedField === 'token' ? t.copied : t.copyLink}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={savingMcp}
                        onClick={() => void handleRegenerateToken()}
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-black px-3 text-xs font-medium text-[#A1A1AA] hover:text-white disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${
                            savingMcp ? 'animate-spin' : ''
                          }`}
                        />
                        <span>{t.regenerateToken}</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-medium text-[#A1A1AA]">
                        {t.mcpConfigLabel}
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          void handleCopy('config', mcpConfigJson)
                        }
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#34D399] hover:underline"
                      >
                        {copiedField === 'config' ? (
                          <>
                            <Check className="h-3 w-3" />
                            <span>{t.copied}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>{t.copyLink}</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="mt-1 overflow-x-auto rounded-lg border border-white/[0.08] bg-black p-3 font-mono text-[11px] leading-relaxed text-[#D4D4D8]">
                      {mcpConfigJson}
                    </pre>
                  </div>
                </div>
              ) : null}

              {error && (
                <p className="text-xs text-rose-400" role="alert">
                  {error}
                </p>
              )}
            </section>

            {authEnabled && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLogout();
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20"
                >
                  <LogOut className="h-4 w-4" />
                  <span>{t.logout}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
