import { useCallback, useEffect, useState } from 'react';
import {
  Accessibility,
  ArrowLeft,
  Bug,
  Check,
  Clock,
  Copy,
  Database,
  ExternalLink,
  FileCode2,
  FileText,
  Folder,
  GitBranch,
  Globe,
  HardDrive,
  Keyboard,
  Loader2,
  LogOut,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Shield,
  Sliders,
  Star,
  Tag,
  Trash2,
  Type,
  User,
  X,
} from 'lucide-react';
import {
  SUPPORTED_LANGUAGES,
  type TranslationStrings,
} from '../i18n/translations';
import {
  ApiError,
  createTemplate,
  deleteTemplate,
  emptyTrash,
  fetchSettings,
  fetchTemplates,
  fetchTrash,
  purgeTrashItem,
  regenerateMcpToken,
  restoreTrashItem,
  saveTemplate,
  updateSettings,
} from '../lib/api';
import {
  NOTIKA_VERSION,
  type AccentColor,
  type AppSettings,
  type EditorViewMode,
  type LanguageCode,
  type TemplateItem,
  type TrashItem,
  type UserPreferences,
} from '../types/vault';

export type SettingsCategory =
  | 'general'
  | 'editor'
  | 'templates'
  | 'mcp'
  | 'shortcuts'
  | 'vault'
  | 'trash'
  | 'about';

interface SettingsModalProps {
  open: boolean;
  suppressed?: boolean;
  initialCategory?: SettingsCategory;
  language: LanguageCode;
  locale: string;
  defaultViewMode: EditorViewMode;
  prefs: UserPreferences;
  authEnabled: boolean;
  trashCount: number;
  vaultStats: {
    projectCount: number;
    noteCount: number;
    totalBytes: number;
  };
  t: TranslationStrings;
  onChangeLanguage: (lang: LanguageCode) => void;
  onChangeDefaultViewMode: (mode: EditorViewMode) => void;
  onUpdatePrefs: (patch: Partial<UserPreferences>) => void;
  onResetPrefs: () => void;
  onTemplatesChanged: () => void;
  onTrashChanged: () => Promise<void> | void;
  onOpenKeyboardShortcuts: () => void;
  onLogout: () => void;
  onClose: () => void;
}

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
}

function ToggleRow({ label, checked, onToggle }: ToggleRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-black px-3.5 py-2 text-start text-xs transition-colors hover:border-white/[0.16]"
    >
      <span className="text-[#E4E4E7]">{label}</span>
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-[#27272A]'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-black transition-transform ${
            checked
              ? 'translate-x-4.5 rtl:-translate-x-4.5'
              : 'translate-x-1 rtl:-translate-x-1'
          }`}
        />
      </span>
    </button>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const STARTER_TEMPLATE_BODY = `---
tags: [note]
date: {{date}}
status: active
---

# {{title}}

`;

export function SettingsModal({
  open,
  suppressed = false,
  initialCategory,
  language,
  locale,
  defaultViewMode,
  prefs,
  authEnabled,
  trashCount,
  vaultStats,
  t,
  onChangeLanguage,
  onChangeDefaultViewMode,
  onUpdatePrefs,
  onResetPrefs,
  onTemplatesChanged,
  onTrashChanged,
  onOpenKeyboardShortcuts,
  onLogout,
  onClose,
}: SettingsModalProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(
    initialCategory ?? 'general'
  );
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingMcp, setSavingMcp] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Templates State
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateName, setSelectedTemplateName] = useState<
    string | null
  >(null);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [tplNameInput, setTplNameInput] = useState('');
  const [tplContentInput, setTplContentInput] = useState(STARTER_TEMPLATE_BODY);
  const [tplSaving, setTplSaving] = useState(false);
  const [tplStatus, setTplStatus] = useState<string | null>(null);
  const [tplError, setTplError] = useState<string | null>(null);

  // Trash State
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashBusyId, setTrashBusyId] = useState<string | null>(null);
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [trashNotice, setTrashNotice] = useState<string | null>(null);

  useEffect(() => {
    if (open && initialCategory) {
      setActiveCategory(initialCategory);
    }
    if (!open) {
      setConfirmPurgeId(null);
      setConfirmEmptyTrash(false);
      setTrashNotice(null);
      setTrashError(null);
    }
  }, [open, initialCategory]);

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

  const loadTemplates = useCallback(async () => {
    if (!open) return;
    setTemplatesLoading(true);
    setTplError(null);
    try {
      const list = await fetchTemplates();
      setTemplates(list);
      if (list.length > 0 && !selectedTemplateName && !isCreatingTemplate) {
        const first = list[0]!;
        setSelectedTemplateName(first.name);
        setTplNameInput(first.title);
        setTplContentInput(first.content);
      }
    } catch (err: unknown) {
      setTplError(
        err instanceof ApiError ? err.message : 'Şablonlar yüklenemedi.'
      );
    } finally {
      setTemplatesLoading(false);
    }
  }, [open, selectedTemplateName, isCreatingTemplate]);

  const loadTrash = useCallback(async () => {
    if (!open) return;
    setTrashLoading(true);
    setTrashError(null);
    try {
      const list = await fetchTrash();
      setTrashItems(list);
    } catch (err: unknown) {
      setTrashError(err instanceof ApiError ? err.message : t.saveError);
    } finally {
      setTrashLoading(false);
    }
  }, [open, t.saveError]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (open && activeCategory === 'templates') {
      void loadTemplates();
    }
  }, [open, activeCategory, loadTemplates]);

  useEffect(() => {
    if (open && activeCategory === 'trash') {
      void loadTrash();
    }
  }, [open, activeCategory, loadTrash]);

  useEffect(() => {
    if (!open || suppressed) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, suppressed, onClose]);

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

  const handleSelectTemplate = (tpl: TemplateItem) => {
    setIsCreatingTemplate(false);
    setSelectedTemplateName(tpl.name);
    setTplNameInput(tpl.title);
    setTplContentInput(tpl.content);
    setTplError(null);
    setTplStatus(null);
  };

  const handleStartNewTemplate = () => {
    setIsCreatingTemplate(true);
    setSelectedTemplateName(null);
    setTplNameInput('');
    setTplContentInput(STARTER_TEMPLATE_BODY);
    setTplError(null);
    setTplStatus(null);
  };

  const handleSaveTemplate = async () => {
    const trimmedName = tplNameInput.trim();
    if (!trimmedName || tplSaving) return;
    setTplSaving(true);
    setTplError(null);
    setTplStatus(null);
    try {
      let saved: TemplateItem;
      if (isCreatingTemplate || !selectedTemplateName) {
        saved = await createTemplate(trimmedName, tplContentInput);
      } else {
        saved = await saveTemplate(
          selectedTemplateName,
          tplContentInput,
          trimmedName
        );
      }
      const updatedList = await fetchTemplates();
      setTemplates(updatedList);
      setIsCreatingTemplate(false);
      setSelectedTemplateName(saved.name);
      setTplNameInput(saved.title);
      setTplContentInput(saved.content);
      setTplStatus(t.templateSaved);
      onTemplatesChanged();
      window.setTimeout(() => setTplStatus(null), 2200);
    } catch (err: unknown) {
      setTplError(err instanceof ApiError ? err.message : t.saveError);
    } finally {
      setTplSaving(false);
    }
  };

  const handleDeleteTemplate = async (name: string) => {
    if (tplSaving) return;
    setTplSaving(true);
    setTplError(null);
    try {
      await deleteTemplate(name);
      const updatedList = await fetchTemplates();
      setTemplates(updatedList);
      if (updatedList[0]) {
        handleSelectTemplate(updatedList[0]);
      } else {
        handleStartNewTemplate();
      }
      onTemplatesChanged();
    } catch (err: unknown) {
      setTplError(err instanceof ApiError ? err.message : t.saveError);
    } finally {
      setTplSaving(false);
    }
  };

  const handleRestoreTrashItem = async (id: string) => {
    if (trashBusyId) return;
    setTrashBusyId(id);
    setTrashError(null);
    setTrashNotice(null);
    try {
      const res = await restoreTrashItem(id);
      setTrashItems((prev) => prev.filter((item) => item.id !== id));
      setConfirmPurgeId(null);
      const restoredName = res.restoredNote
        ? `${res.restoredProject} / ${res.restoredNote}`
        : res.restoredProject;
      setTrashNotice(`${t.restoredNotice}: ${restoredName}`);
      await onTrashChanged();
    } catch (err: unknown) {
      setTrashError(err instanceof ApiError ? err.message : t.saveError);
    } finally {
      setTrashBusyId(null);
    }
  };

  const handlePurgeTrashItem = async (id: string) => {
    if (trashBusyId) return;
    setTrashBusyId(id);
    setTrashError(null);
    setTrashNotice(null);
    try {
      await purgeTrashItem(id);
      setTrashItems((prev) => prev.filter((item) => item.id !== id));
      setConfirmPurgeId(null);
      await onTrashChanged();
    } catch (err: unknown) {
      setTrashError(err instanceof ApiError ? err.message : t.saveError);
    } finally {
      setTrashBusyId(null);
    }
  };

  const handleEmptyTrash = async () => {
    if (trashBusyId) return;
    setTrashBusyId('__empty__');
    setTrashError(null);
    setTrashNotice(null);
    try {
      await emptyTrash();
      setTrashItems([]);
      setConfirmPurgeId(null);
      setConfirmEmptyTrash(false);
      await onTrashChanged();
    } catch (err: unknown) {
      setTrashError(err instanceof ApiError ? err.message : t.saveError);
    } finally {
      setTrashBusyId(null);
    }
  };

  const displayedTrashCount =
    activeCategory === 'trash' && !trashLoading ? trashItems.length : trashCount;

  const categories: Array<{
    id: SettingsCategory;
    label: string;
    icon: typeof Globe;
    badge?: number;
  }> = [
    { id: 'general', label: t.settingsCatGeneral, icon: Globe },
    { id: 'editor', label: t.settingsCatEditor, icon: Sliders },
    { id: 'templates', label: t.settingsCatTemplates, icon: FileCode2 },
    { id: 'mcp', label: t.settingsCatMcp, icon: Server },
    { id: 'shortcuts', label: t.settingsCatShortcuts, icon: Keyboard },
    { id: 'vault', label: t.settingsCatVault, icon: Database },
    {
      id: 'trash',
      label: t.settingsCatTrash,
      icon: Trash2,
      badge: displayedTrashCount > 0 ? displayedTrashCount : undefined,
    },
    { id: 'about', label: t.settingsCatAbout, icon: GitBranch },
  ];

  const activeCategoryMeta =
    categories.find((c) => c.id === activeCategory) ?? categories[0]!;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#09090B]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      {/* Full-Screen Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#111113] px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-[#18181B] px-3 text-xs font-medium text-[#E4E4E7] transition-colors hover:border-white/[0.18] hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            <span>{t.backToWorkspace}</span>
          </button>
          <div className="h-4 w-px bg-white/[0.08]" />
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-accent" />
            <h2
              id="settings-modal-title"
              className="text-sm font-semibold text-[#FAFAFA] sm:text-base"
            >
              {t.settingsTitle}
            </h2>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={t.cancel}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[#A1A1AA] transition-colors hover:bg-[#18181B] hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* Two-Pane Body: Left = Settings Categories, Right = Full-Screen Settings Details */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Left Categories Pane */}
        <aside
          aria-label={t.settingsCategoriesLabel}
          className="flex shrink-0 flex-col border-b border-white/[0.08] bg-[#111113] md:w-64 md:border-e md:border-b-0 lg:w-72"
        >
          <div className="hidden px-5 pt-5 pb-2 text-[11px] font-semibold tracking-wider text-[#71717A] uppercase md:block">
            {t.settingsCategoriesLabel}
          </div>

          <nav className="flex gap-1 overflow-x-auto p-2 md:flex-1 md:flex-col md:overflow-y-auto md:px-3 md:py-1">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const active = cat.id === activeCategory;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-10 shrink-0 items-center justify-between gap-2.5 rounded-lg px-3 text-start text-xs font-medium whitespace-nowrap transition-colors md:w-full ${
                    active
                      ? 'bg-[#1F1F23] text-[#FAFAFA] shadow-card'
                      : 'text-[#A1A1AA] hover:bg-[#18181B] hover:text-white'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        active ? 'text-accent' : 'text-[#71717A]'
                      }`}
                    />
                    <span className="truncate">{cat.label}</span>
                  </span>
                  {cat.badge !== undefined && (
                    <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-[#E4E4E7] tabular-nums">
                      {cat.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="hidden border-t border-white/[0.08] p-3 md:block">
            <button
              type="button"
              onClick={onOpenKeyboardShortcuts}
              className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-black px-3 text-xs font-medium text-[#E4E4E7] transition-colors hover:border-accent/50 hover:text-white"
            >
              <span className="flex items-center gap-2 truncate">
                <Keyboard className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="truncate">{t.keyboardShortcuts}</span>
              </span>
              <kbd className="rounded border border-white/[0.12] bg-[#18181B] px-1.5 py-0.5 font-mono text-[10px] text-[#A1A1AA]">
                ?
              </kbd>
            </button>
          </div>
        </aside>

        {/* Right Details Pane */}
        <section className="min-h-0 flex-1 overflow-y-auto bg-[#09090B] p-4 sm:p-6 lg:p-10">
          <div className="mx-auto max-w-4xl">
            <div className="mb-6 flex items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
              <h3 className="text-base font-semibold text-[#FAFAFA] sm:text-lg">
                {activeCategoryMeta.label}
              </h3>
              {activeCategory === 'general' && (
                <button
                  type="button"
                  onClick={onResetPrefs}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#111113] px-3 text-xs font-medium text-[#A1A1AA] transition-colors hover:border-white/[0.2] hover:text-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>{t.resetDefaults}</span>
                </button>
              )}
            </div>

            {/* Category: General & Display */}
            {activeCategory === 'general' && (
              <div className="space-y-4">
                <div className="space-y-3 rounded-xl border border-white/[0.08] bg-[#111113] p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-xs font-medium text-[#FAFAFA]">
                    <Globe className="h-4 w-4 text-accent" />
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
                              ? 'border-accent bg-accent/15 text-accent'
                              : 'border-white/[0.08] bg-black text-[#A1A1AA] hover:border-white/[0.2] hover:text-white'
                          }`}
                        >
                          {lang.nativeName}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Accent Color Theme Selector */}
                <div className="space-y-3 rounded-xl border border-white/[0.08] bg-[#111113] p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-xs font-medium text-[#FAFAFA]">
                    <Palette className="h-4 w-4 text-accent" />
                    <span>{t.accentColorLabel}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    {(
                      [
                        {
                          id: 'emerald',
                          label: t.accentEmerald,
                          swatchClass: 'bg-[#34d399]',
                        },
                        {
                          id: 'sky',
                          label: t.accentSky,
                          swatchClass: 'bg-[#38bdf8]',
                        },
                        {
                          id: 'violet',
                          label: t.accentViolet,
                          swatchClass: 'bg-[#a78bfa]',
                        },
                        {
                          id: 'amber',
                          label: t.accentAmber,
                          swatchClass: 'bg-[#fbbf24]',
                        },
                        {
                          id: 'rose',
                          label: t.accentRose,
                          swatchClass: 'bg-[#fb7185]',
                        },
                        {
                          id: 'indigo',
                          label: t.accentIndigo,
                          swatchClass: 'bg-[#818cf8]',
                        },
                      ] as Array<{
                        id: AccentColor;
                        label: string;
                        swatchClass: string;
                      }>
                    ).map((color) => {
                      const active = prefs.accentColor === color.id;
                      return (
                        <button
                          key={color.id}
                          type="button"
                          onClick={() =>
                            onUpdatePrefs({ accentColor: color.id })
                          }
                          aria-pressed={active}
                          className={`flex h-10 items-center justify-center gap-2 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                            active
                              ? 'border-accent bg-accent/15 text-[#FAFAFA]'
                              : 'border-white/[0.08] bg-black text-[#A1A1AA] hover:border-white/[0.2] hover:text-white'
                          }`}
                        >
                          <span
                            className={`h-3 w-3 shrink-0 rounded-full ${color.swatchClass}`}
                          />
                          <span className="truncate">{color.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-white/[0.08] bg-[#111113] p-4 sm:p-5">
                  <ToggleRow
                    label={t.showSidebarTagsLabel}
                    checked={prefs.showSidebarTags}
                    onToggle={() =>
                      onUpdatePrefs({
                        showSidebarTags: !prefs.showSidebarTags,
                      })
                    }
                  />
                  <ToggleRow
                    label={t.sidebarDefaultCollapsedLabel}
                    checked={prefs.sidebarDefaultCollapsed}
                    onToggle={() =>
                      onUpdatePrefs({
                        sidebarDefaultCollapsed: !prefs.sidebarDefaultCollapsed,
                      })
                    }
                  />
                </div>

                {/* Notika Version & GitHub Card */}
                <div className="space-y-3 rounded-xl border border-white/[0.08] bg-[#111113] p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-[#FAFAFA]">
                      <GitBranch className="h-4 w-4 text-accent" />
                      <span>GitHub · zulfumirza/notika</span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-black px-2.5 py-1 font-mono text-[11px] text-accent">
                      <Tag className="h-3 w-3" />
                      <span>
                        {t.notikaVersionLabel}: v{NOTIKA_VERSION}
                      </span>
                    </span>
                  </div>

                  <p className="text-xs leading-relaxed text-[#A1A1AA]">
                    {t.authorLabel}:{' '}
                    <span className="font-medium text-[#E4E4E7]">
                      Zülfü Mirza Gür
                    </span>{' '}
                    — {t.reportIssueDesc}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <a
                      href="https://github.com/zulfumirza/notika/issues"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary-tactile inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-medium whitespace-nowrap"
                    >
                      <Bug className="h-3.5 w-3.5" />
                      <span>{t.openGithubIssues}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <a
                      href="https://github.com/zulfumirza/notika"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-black px-3.5 text-xs font-medium text-[#E4E4E7] whitespace-nowrap transition-colors hover:border-accent/50 hover:text-white"
                    >
                      <Star className="h-3.5 w-3.5 text-amber-400" />
                      <span>{t.starOnGithub}</span>
                      <ExternalLink className="h-3 w-3 text-[#71717A]" />
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Category: Editor & Writing */}
            {activeCategory === 'editor' && (
              <div className="space-y-4">
                <div className="space-y-3 rounded-xl border border-white/[0.08] bg-[#111113] p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-xs font-medium text-[#FAFAFA]">
                    <Sliders className="h-4 w-4 text-accent" />
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
                            ? 'border-accent bg-accent/15 text-accent'
                            : 'border-white/[0.08] bg-black text-[#A1A1AA] hover:border-white/[0.2] hover:text-white'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-white/[0.08] bg-[#111113] p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-xs font-medium text-[#FAFAFA]">
                    <Clock className="h-4 w-4 text-accent" />
                    <span>{t.autosaveDelayLabel}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {(
                      [
                        { ms: 400, label: '400 ms' },
                        { ms: 800, label: '800 ms' },
                        { ms: 1500, label: '1.5 s' },
                        { ms: 3000, label: '3 s' },
                        { ms: 0, label: t.autosaveManualOnly },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.ms}
                        type="button"
                        onClick={() =>
                          onUpdatePrefs({ autosaveDelayMs: opt.ms })
                        }
                        className={`flex h-10 items-center justify-center rounded-lg border px-2 text-xs font-medium transition-colors ${
                          prefs.autosaveDelayMs === opt.ms
                            ? 'border-accent bg-accent/15 text-accent'
                            : 'border-white/[0.08] bg-black text-[#A1A1AA] hover:border-white/[0.2] hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-3 rounded-xl border border-white/[0.08] bg-[#111113] p-4 sm:p-5">
                    <div className="flex items-center gap-2 text-xs font-medium text-[#FAFAFA]">
                      <Type className="h-4 w-4 text-accent" />
                      <span>{t.editorFontSizeLabel}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {([13, 14, 15, 16, 18] as const).map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() =>
                            onUpdatePrefs({ editorFontSize: size })
                          }
                          className={`flex h-9 min-w-12 flex-1 items-center justify-center rounded-lg border text-xs font-medium tabular-nums transition-colors ${
                            prefs.editorFontSize === size
                              ? 'border-accent bg-accent/15 text-accent'
                              : 'border-white/[0.08] bg-black text-[#A1A1AA] hover:border-white/[0.2] hover:text-white'
                          }`}
                        >
                          {size}px
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border border-white/[0.08] bg-[#111113] p-4 sm:p-5">
                    <div className="flex items-center gap-2 text-xs font-medium text-[#FAFAFA]">
                      <Sliders className="h-4 w-4 text-accent" />
                      <span>{t.tabSizeLabel}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {([2, 4] as const).map((spaces) => (
                        <button
                          key={spaces}
                          type="button"
                          onClick={() => onUpdatePrefs({ tabSize: spaces })}
                          className={`flex h-9 items-center justify-center rounded-lg border text-xs font-medium transition-colors ${
                            prefs.tabSize === spaces
                              ? 'border-accent bg-accent/15 text-accent'
                              : 'border-white/[0.08] bg-black text-[#A1A1AA] hover:border-white/[0.2] hover:text-white'
                          }`}
                        >
                          {spaces} {t.spacesUnit}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-white/[0.08] bg-[#111113] p-4 sm:p-5">
                  <ToggleRow
                    label={t.spellcheckLabel}
                    checked={prefs.spellcheck}
                    onToggle={() =>
                      onUpdatePrefs({ spellcheck: !prefs.spellcheck })
                    }
                  />
                  <ToggleRow
                    label={t.wordWrapLabel}
                    checked={prefs.wordWrap}
                    onToggle={() =>
                      onUpdatePrefs({ wordWrap: !prefs.wordWrap })
                    }
                  />
                  <ToggleRow
                    label={t.enableTemplatesLabel}
                    checked={prefs.enableTemplates}
                    onToggle={() =>
                      onUpdatePrefs({
                        enableTemplates: !prefs.enableTemplates,
                      })
                    }
                  />
                  <ToggleRow
                    label={t.showFooterStatsLabel}
                    checked={prefs.showFooterStats}
                    onToggle={() =>
                      onUpdatePrefs({
                        showFooterStats: !prefs.showFooterStats,
                      })
                    }
                  />
                </div>
              </div>
            )}

            {/* Category: Markdown Frontmatter Templates */}
            {activeCategory === 'templates' && (
              <div className="space-y-4">
                <div className="space-y-3 rounded-xl border border-white/[0.08] bg-[#111113] p-4">
                  <ToggleRow
                    label={t.enableTemplatesLabel}
                    checked={prefs.enableTemplates}
                    onToggle={() =>
                      onUpdatePrefs({
                        enableTemplates: !prefs.enableTemplates,
                      })
                    }
                  />
                  {!prefs.enableTemplates && (
                    <p className="px-1 text-xs text-[#A1A1AA]">
                      {t.templatesDisabledHint}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#111113] p-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-[#FAFAFA]">
                      <FileCode2 className="h-4 w-4 text-accent" />
                      <span>{t.templatesTitle}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#A1A1AA]">
                      {t.templatesDesc}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartNewTemplate}
                    className="btn-primary-tactile inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-medium"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{t.newTemplate}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                  {/* Template List */}
                  <div className="rounded-xl border border-white/[0.08] bg-[#111113] p-3 lg:col-span-4">
                    {templatesLoading ? (
                      <div className="flex items-center justify-center py-8 text-xs text-[#71717A]">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : templates.length === 0 ? (
                      <p className="px-2 py-6 text-center text-xs text-[#71717A]">
                        {t.noTemplatesYet}
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {templates.map((tpl) => {
                          const active =
                            !isCreatingTemplate &&
                            selectedTemplateName === tpl.name;
                          return (
                            <li
                              key={tpl.name}
                              className={`flex items-center justify-between gap-1 rounded-lg px-2.5 py-2 text-xs transition-colors ${
                                active
                                  ? 'bg-[#1F1F23] font-medium text-white'
                                  : 'text-[#A1A1AA] hover:bg-[#18181B] hover:text-white'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => handleSelectTemplate(tpl)}
                                className="flex min-w-0 flex-1 items-center gap-2 text-start"
                              >
                                <FileCode2
                                  className={`h-3.5 w-3.5 shrink-0 ${
                                    active ? 'text-accent' : 'text-[#71717A]'
                                  }`}
                                />
                                <span className="truncate">{tpl.title}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteTemplate(tpl.name)}
                                title={t.deleteTemplate}
                                aria-label={`${t.deleteTemplate} ${tpl.title}`}
                                className="rounded p-1 text-[#71717A] hover:bg-rose-500/15 hover:text-rose-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Template Editor */}
                  <div className="space-y-3 rounded-xl border border-white/[0.08] bg-[#111113] p-4 lg:col-span-8">
                    <div>
                      <input
                        type="text"
                        value={tplNameInput}
                        onChange={(e) => setTplNameInput(e.target.value)}
                        placeholder={t.templateNamePlaceholder}
                        aria-label={t.templateNamePlaceholder}
                        className="h-10 w-full rounded-lg border border-white/[0.1] bg-black px-3 text-sm text-[#FAFAFA] placeholder-[#71717A] outline-none focus:border-accent"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[11px] font-medium text-[#A1A1AA]">
                        {t.templateContentLabel}
                      </label>
                      <textarea
                        value={tplContentInput}
                        onChange={(e) => setTplContentInput(e.target.value)}
                        rows={12}
                        spellCheck={false}
                        className="font-editor w-full rounded-lg border border-white/[0.1] bg-black p-3 text-xs leading-relaxed text-[#E4E4E7] outline-none focus:border-accent"
                      />
                      <p className="mt-1.5 text-[11px] text-[#71717A]">
                        {t.templateVariablesHint}
                      </p>
                    </div>

                    {tplError && (
                      <p className="text-xs text-rose-400" role="alert">
                        {tplError}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-xs text-accent">
                        {tplStatus ?? ''}
                      </span>
                      <button
                        type="button"
                        disabled={tplSaving || !tplNameInput.trim()}
                        onClick={() => void handleSaveTemplate()}
                        className="btn-primary-tactile inline-flex h-10 items-center gap-2 rounded-lg px-4 text-xs font-medium disabled:opacity-50"
                      >
                        {tplSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        <span>{t.saveTemplate}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Category: MCP & Integrations */}
            {activeCategory === 'mcp' && (
              <div className="space-y-4">
                <div className="space-y-3 rounded-xl border border-white/[0.08] bg-[#111113] p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium text-[#FAFAFA]">
                        <Server className="h-4 w-4 text-accent" />
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
                            ? 'border-accent bg-accent/15 text-accent'
                            : 'border-white/[0.1] bg-black text-[#A1A1AA] hover:text-white'
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${
                            settings.mcpEnabled
                              ? 'bg-accent'
                              : 'bg-[#52525B]'
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
                            onClick={() =>
                              void handleCopy('endpoint', mcpEndpoint)
                            }
                            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#18181B] px-3 text-xs font-medium text-[#FAFAFA] hover:bg-[#222227]"
                          >
                            {copiedField === 'endpoint' ? (
                              <Check className="h-3.5 w-3.5 text-accent" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            <span>
                              {copiedField === 'endpoint'
                                ? t.copied
                                : t.copyLink}
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
                            className="h-9 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black px-3 font-mono text-xs text-accent outline-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              void handleCopy('token', settings.mcpToken)
                            }
                            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#18181B] px-3 text-xs font-medium text-[#FAFAFA] hover:bg-[#222227]"
                          >
                            {copiedField === 'token' ? (
                              <Check className="h-3.5 w-3.5 text-accent" />
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
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
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
                </div>
              </div>
            )}

            {/* Category: Shortcuts & Accessibility */}
            {activeCategory === 'shortcuts' && (
              <div className="space-y-4">
                <div className="flex flex-col justify-between gap-4 rounded-xl border border-white/[0.08] bg-[#111113] p-4 sm:flex-row sm:items-center sm:p-5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-[#FAFAFA]">
                      <Keyboard className="h-4 w-4 text-accent" />
                      <span>{t.keyboardShortcuts}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-[#A1A1AA]">
                      {t.keyboardShortcutsDesc}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenKeyboardShortcuts}
                    className="btn-primary-tactile inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-xs font-medium whitespace-nowrap"
                  >
                    <Keyboard className="h-4 w-4" />
                    <span>{t.openKeyboardShortcuts}</span>
                  </button>
                </div>

                <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111113]">
                  <ul className="divide-y divide-white/[0.06] text-xs">
                    <li className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <span className="text-[#D4D4D8]">
                        {t.shortcutQuickSearch}
                      </span>
                      <kbd className="rounded border border-white/[0.14] bg-black px-2 py-0.5 font-mono text-[11px] text-[#FAFAFA]">
                        Ctrl / ⌘ + K
                      </kbd>
                    </li>
                    <li className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <span className="text-[#D4D4D8]">
                        {t.shortcutSaveNote}
                      </span>
                      <kbd className="rounded border border-white/[0.14] bg-black px-2 py-0.5 font-mono text-[11px] text-[#FAFAFA]">
                        Ctrl / ⌘ + S
                      </kbd>
                    </li>
                    <li className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <span className="text-[#D4D4D8]">
                        {t.shortcutCopyMarkdown}
                      </span>
                      <kbd className="rounded border border-white/[0.14] bg-black px-2 py-0.5 font-mono text-[11px] text-[#FAFAFA]">
                        Ctrl / ⌘ + Shift + C
                      </kbd>
                    </li>
                    <li className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <span className="text-[#D4D4D8]">
                        {t.shortcutOpenHelp}
                      </span>
                      <kbd className="rounded border border-white/[0.14] bg-black px-2 py-0.5 font-mono text-[11px] text-[#FAFAFA]">
                        Ctrl / ⌘ + / · ?
                      </kbd>
                    </li>
                    <li className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <span className="text-[#D4D4D8]">
                        {t.shortcutTabNav}
                      </span>
                      <kbd className="rounded border border-white/[0.14] bg-black px-2 py-0.5 font-mono text-[11px] text-[#FAFAFA]">
                        Tab / Shift + Tab
                      </kbd>
                    </li>
                  </ul>
                </div>

                <div className="space-y-2 rounded-xl border border-white/[0.08] bg-[#111113] p-4 sm:p-5">
                  <div className="mb-1 flex items-center gap-2 text-xs font-medium text-[#FAFAFA]">
                    <Accessibility className="h-4 w-4 text-accent" />
                    <span>{t.settingsCatShortcuts}</span>
                  </div>
                  <ToggleRow
                    label={t.highContrastFocusLabel}
                    checked={prefs.highContrastFocus}
                    onToggle={() =>
                      onUpdatePrefs({
                        highContrastFocus: !prefs.highContrastFocus,
                      })
                    }
                  />
                  <ToggleRow
                    label={t.reducedMotionLabel}
                    checked={prefs.reducedMotion}
                    onToggle={() =>
                      onUpdatePrefs({ reducedMotion: !prefs.reducedMotion })
                    }
                  />
                </div>
              </div>
            )}

            {/* Category: Vault & Security */}
            {activeCategory === 'vault' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/[0.08] bg-[#111113] p-4">
                    <div className="flex items-center gap-2 text-xs text-[#A1A1AA]">
                      <Folder className="h-3.5 w-3.5 text-accent" />
                      <span>{t.totalProjects}</span>
                    </div>
                    <div className="mt-2 text-xl font-semibold text-[#FAFAFA] tabular-nums">
                      {vaultStats.projectCount}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/[0.08] bg-[#111113] p-4">
                    <div className="flex items-center gap-2 text-xs text-[#A1A1AA]">
                      <FileText className="h-3.5 w-3.5 text-accent" />
                      <span>{t.totalNotes}</span>
                    </div>
                    <div className="mt-2 text-xl font-semibold text-[#FAFAFA] tabular-nums">
                      {vaultStats.noteCount}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/[0.08] bg-[#111113] p-4">
                    <div className="flex items-center gap-2 text-xs text-[#A1A1AA]">
                      <HardDrive className="h-3.5 w-3.5 text-accent" />
                      <span>{t.vaultSize}</span>
                    </div>
                    <div className="mt-2 text-xl font-semibold text-[#FAFAFA] tabular-nums">
                      {formatBytes(vaultStats.totalBytes)}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-white/[0.08] bg-[#111113] p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-xs font-medium text-[#FAFAFA]">
                    <Shield className="h-4 w-4 text-accent" />
                    <span>{t.vaultSecurityLabel}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-black px-3.5 py-3">
                    <div className="flex items-center gap-2.5 text-xs">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          authEnabled ? 'bg-accent' : 'bg-amber-400'
                        }`}
                      />
                      <span className="text-[#E4E4E7]">
                        {authEnabled ? t.vaultProtected : t.vaultOpenLocal}
                      </span>
                    </div>

                    {authEnabled && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onLogout();
                        }}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        <span>{t.logout}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Category: Trash */}
            {activeCategory === 'trash' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#111113] p-4 sm:p-5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-[#FAFAFA]">
                      <Trash2 className="h-4 w-4 text-accent" />
                      <span>{t.settingsCatTrash}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-[#A1A1AA]">
                      {t.trashDesc}
                    </p>
                  </div>

                  {trashItems.length > 0 && (
                    <div className="flex items-center gap-2">
                      {confirmEmptyTrash ? (
                        <>
                          <button
                            type="button"
                            disabled={trashBusyId !== null}
                            onClick={() => void handleEmptyTrash()}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/20 px-3 text-xs font-medium text-rose-200 transition-colors hover:bg-rose-500/30 disabled:opacity-50"
                          >
                            {trashBusyId === '__empty__' ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            <span>{t.confirmEmptyTrash}</span>
                          </button>
                          <button
                            type="button"
                            disabled={trashBusyId !== null}
                            onClick={() => setConfirmEmptyTrash(false)}
                            className="inline-flex h-9 items-center rounded-lg border border-white/[0.1] bg-black px-3 text-xs font-medium text-[#A1A1AA] hover:text-white"
                          >
                            {t.cancel}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={trashBusyId !== null}
                          onClick={() => {
                            setConfirmPurgeId(null);
                            setConfirmEmptyTrash(true);
                          }}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>{t.emptyTrash}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {trashError && (
                  <p
                    className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300"
                    role="alert"
                  >
                    {trashError}
                  </p>
                )}

                {trashNotice && (
                  <p className="rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-xs text-accent">
                    {trashNotice}
                  </p>
                )}

                {trashLoading ? (
                  <div className="flex items-center justify-center rounded-xl border border-white/[0.08] bg-[#111113] py-12 text-xs text-[#71717A]">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : trashItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-[#111113] px-4 py-12 text-center">
                    <Trash2 className="h-7 w-7 text-[#52525B]" />
                    <p className="text-xs text-[#71717A]">{t.trashEmpty}</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08] bg-[#111113]">
                    {trashItems.map((item) => {
                      const isBusy = trashBusyId === item.id;
                      const isConfirmingPurge = confirmPurgeId === item.id;
                      const deletedLabel = new Date(
                        item.deletedAt
                      ).toLocaleString(locale, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      });

                      return (
                        <li
                          key={item.id}
                          className="flex flex-col justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-[#16161A] sm:flex-row sm:items-center"
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-black text-[#A1A1AA]">
                              {item.kind === 'project' ? (
                                <Folder className="h-4 w-4 text-accent" />
                              ) : (
                                <FileText className="h-4 w-4" />
                              )}
                            </span>
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-medium text-[#FAFAFA]">
                                  {item.title}
                                </span>
                                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-[#A1A1AA]">
                                  {item.kind === 'project'
                                    ? `${item.noteCount ?? 0} ${t.notesCol}`
                                    : item.project}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#71717A]">
                                {item.kind === 'note' && (
                                  <span>
                                    {item.project} / {item.name}
                                  </span>
                                )}
                                <span>·</span>
                                <span className="tabular-nums">
                                  {formatBytes(item.size)}
                                </span>
                                <span>·</span>
                                <span>
                                  {t.deletedAtLabel}: {deletedLabel}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={trashBusyId !== null}
                              onClick={() =>
                                void handleRestoreTrashItem(item.id)
                              }
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-accent/35 bg-accent/10 px-3 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
                            >
                              {isBusy && !isConfirmingPurge ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                              <span>{t.restoreItem}</span>
                            </button>

                            {isConfirmingPurge ? (
                              <>
                                <button
                                  type="button"
                                  disabled={trashBusyId !== null}
                                  onClick={() =>
                                    void handlePurgeTrashItem(item.id)
                                  }
                                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/20 px-3 text-xs font-medium text-rose-200 transition-colors hover:bg-rose-500/30 disabled:opacity-50"
                                >
                                  {isBusy ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                  <span>{t.confirmPurge}</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={trashBusyId !== null}
                                  onClick={() => setConfirmPurgeId(null)}
                                  className="inline-flex h-8 items-center rounded-lg border border-white/[0.1] bg-black px-2.5 text-xs text-[#A1A1AA] hover:text-white"
                                >
                                  {t.cancel}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={trashBusyId !== null}
                                onClick={() => {
                                  setConfirmEmptyTrash(false);
                                  setConfirmPurgeId(item.id);
                                }}
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-black px-3 text-xs font-medium text-[#A1A1AA] transition-colors hover:border-rose-500/35 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>{t.purgeItem}</span>
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* Category: About & GitHub */}
            {activeCategory === 'about' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/[0.08] bg-[#111113] p-4 sm:p-5">
                    <div className="flex items-center gap-2 text-xs text-[#A1A1AA]">
                      <User className="h-3.5 w-3.5 text-accent" />
                      <span>{t.authorLabel}</span>
                    </div>
                    <div className="mt-2 text-base font-semibold text-[#FAFAFA]">
                      Zülfü Mirza Gür
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/[0.08] bg-[#111113] p-4 sm:p-5">
                    <div className="flex items-center gap-2 text-xs text-[#A1A1AA]">
                      <Tag className="h-3.5 w-3.5 text-accent" />
                      <span>{t.notikaVersionLabel}</span>
                    </div>
                    <div className="mt-2 font-mono text-base font-semibold text-[#FAFAFA]">
                      v{NOTIKA_VERSION}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/[0.08] bg-[#111113] p-4 sm:p-5">
                    <div className="flex items-center gap-2 text-xs text-[#A1A1AA]">
                      <GitBranch className="h-3.5 w-3.5 text-accent" />
                      <span>{t.githubRepoLabel}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-sm text-[#FAFAFA]">
                        zulfumirza/notika
                      </span>
                      <a
                        href="https://github.com/zulfumirza/notika"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-black px-3 text-xs font-medium text-[#E4E4E7] transition-colors hover:border-accent/50 hover:text-white"
                      >
                        <Star className="h-3.5 w-3.5 text-amber-400" />
                        <span>{t.starOnGithub}</span>
                      </a>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-between gap-4 rounded-xl border border-white/[0.08] bg-[#111113] p-4 sm:flex-row sm:items-center sm:p-5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-[#FAFAFA]">
                      <Bug className="h-4 w-4 text-accent" />
                      <span>{t.reportIssueTitle}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-[#A1A1AA]">
                      {t.reportIssueDesc}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href="https://github.com/zulfumirza/notika/issues"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary-tactile inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-xs font-medium whitespace-nowrap"
                    >
                      <Bug className="h-4 w-4" />
                      <span>{t.openGithubIssues}</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <a
                      href="https://github.com/zulfumirza/notika"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-black px-4 text-xs font-medium text-[#E4E4E7] whitespace-nowrap transition-colors hover:border-accent/50 hover:text-white"
                    >
                      <span>{t.openGithubRepo}</span>
                      <ExternalLink className="h-3.5 w-3.5 text-accent" />
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
