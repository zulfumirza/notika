import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, KeyRound, Loader2, Lock, Menu, X } from 'lucide-react';
import {
  SUPPORTED_LANGUAGES,
  TRANSLATIONS,
  getLanguageMeta,
} from './i18n/translations';
import {
  ApiError,
  createNote,
  createProject,
  deleteNote,
  deleteProject,
  fetchNote,
  fetchTemplates,
  fetchTrash,
  fetchVaultTree,
  getAuthStatus,
  logout,
  moveNote,
  renameNote,
  renameProject,
  saveNote,
  toggleNotePin,
  unlockNote,
  updateNoteAppearance,
  updateProjectAppearance,
} from './lib/api';
import {
  DEFAULT_USER_PREFERENCES,
  type ActiveNoteRef,
  type AuthStatus,
  type EditorViewMode,
  type LanguageCode,
  type NoteColorId,
  type NoteDocument,
  type NoteIconId,
  type ProjectTreeItem,
  type SaveStatus,
  type TemplateItem,
  type UserPreferences,
} from './types/vault';
import { ConfirmDialog } from './components/ConfirmDialog';
import {
  CreateItemModal,
  type CreateModalState,
} from './components/CreateItemModal';
import { EditorWorkspace } from './components/EditorWorkspace';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { LoginScreen } from './components/LoginScreen';
import {
  NoteAppearanceModal,
  type AppearanceModalTarget,
} from './components/NoteAppearanceModal';
import { NoteLockModal } from './components/NoteLockModal';
import { QuickSearchModal } from './components/QuickSearchModal';
import {
  SettingsModal,
  type SettingsCategory,
} from './components/SettingsModal';
import { SharedNoteView } from './components/SharedNoteView';
import { ShareInviteModal } from './components/ShareInviteModal';
import { Sidebar } from './components/Sidebar';
import { VaultOverview } from './components/VaultOverview';

type DeleteDialogTarget =
  | { kind: 'project'; name: string }
  | { kind: 'note'; project: string; name: string }
  | null;

const LANGUAGE_STORAGE_KEY = 'notika_lang';
const DEFAULT_MODE_STORAGE_KEY = 'notika_default_mode';
const PREFS_STORAGE_KEY = 'notika_prefs';

function getInitialUserPreferences(): UserPreferences {
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_USER_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      accentColor:
        parsed.accentColor === 'emerald' ||
        parsed.accentColor === 'sky' ||
        parsed.accentColor === 'violet' ||
        parsed.accentColor === 'amber' ||
        parsed.accentColor === 'rose' ||
        parsed.accentColor === 'indigo'
          ? parsed.accentColor
          : DEFAULT_USER_PREFERENCES.accentColor,
      autosaveDelayMs:
        parsed.autosaveDelayMs === 0 ||
        parsed.autosaveDelayMs === 400 ||
        parsed.autosaveDelayMs === 800 ||
        parsed.autosaveDelayMs === 1500 ||
        parsed.autosaveDelayMs === 3000
          ? parsed.autosaveDelayMs
          : DEFAULT_USER_PREFERENCES.autosaveDelayMs,
      editorFontSize:
        parsed.editorFontSize === 13 ||
        parsed.editorFontSize === 14 ||
        parsed.editorFontSize === 15 ||
        parsed.editorFontSize === 16 ||
        parsed.editorFontSize === 18
          ? parsed.editorFontSize
          : DEFAULT_USER_PREFERENCES.editorFontSize,
      tabSize:
        parsed.tabSize === 2 || parsed.tabSize === 4
          ? parsed.tabSize
          : DEFAULT_USER_PREFERENCES.tabSize,
      spellcheck:
        typeof parsed.spellcheck === 'boolean'
          ? parsed.spellcheck
          : DEFAULT_USER_PREFERENCES.spellcheck,
      wordWrap:
        typeof parsed.wordWrap === 'boolean'
          ? parsed.wordWrap
          : DEFAULT_USER_PREFERENCES.wordWrap,
      enableTemplates:
        typeof parsed.enableTemplates === 'boolean'
          ? parsed.enableTemplates
          : DEFAULT_USER_PREFERENCES.enableTemplates,
      showFooterStats:
        typeof parsed.showFooterStats === 'boolean'
          ? parsed.showFooterStats
          : DEFAULT_USER_PREFERENCES.showFooterStats,
      showSidebarTags:
        typeof parsed.showSidebarTags === 'boolean'
          ? parsed.showSidebarTags
          : DEFAULT_USER_PREFERENCES.showSidebarTags,
      sidebarDefaultCollapsed:
        typeof parsed.sidebarDefaultCollapsed === 'boolean'
          ? parsed.sidebarDefaultCollapsed
          : DEFAULT_USER_PREFERENCES.sidebarDefaultCollapsed,
      highContrastFocus:
        typeof parsed.highContrastFocus === 'boolean'
          ? parsed.highContrastFocus
          : DEFAULT_USER_PREFERENCES.highContrastFocus,
      reducedMotion:
        typeof parsed.reducedMotion === 'boolean'
          ? parsed.reducedMotion
          : DEFAULT_USER_PREFERENCES.reducedMotion,
    };
  } catch {
    return DEFAULT_USER_PREFERENCES;
  }
}

function isSupportedLanguage(value: string | null): value is LanguageCode {
  return (
    value !== null &&
    SUPPORTED_LANGUAGES.some((item) => item.code === value)
  );
}

function getInitialLanguage(): LanguageCode {
  try {
    const params = new URLSearchParams(window.location.search);
    const queryLang = params.get('lang');
    if (isSupportedLanguage(queryLang)) {
      return queryLang;
    }
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(stored)) {
      return stored;
    }
  } catch {
    // Ignore storage read errors
  }
  return 'tr';
}

function getInitialDefaultViewMode(): EditorViewMode {
  try {
    const stored = window.localStorage.getItem(DEFAULT_MODE_STORAGE_KEY);
    if (
      stored === 'normal' ||
      stored === 'editor' ||
      stored === 'split' ||
      stored === 'preview'
    ) {
      return stored;
    }
  } catch {
    // Ignore storage read errors
  }
  return 'normal';
}

function getSharedCodeFromPath(): string | null {
  const match = /^\/s\/([a-z0-9]+)\/?$/i.exec(window.location.pathname);
  return match && match[1] ? match[1] : null;
}

export default function App() {
  const [language, setLanguage] = useState<LanguageCode>(getInitialLanguage);
  const [defaultViewMode, setDefaultViewMode] = useState<EditorViewMode>(
    getInitialDefaultViewMode
  );
  const [prefs, setPrefs] = useState<UserPreferences>(
    getInitialUserPreferences
  );
  const [shareCode] = useState<string | null>(getSharedCodeFromPath);

  const langMeta = getLanguageMeta(language);
  const t = TRANSLATIONS[language];

  useEffect(() => {
    document.documentElement.lang = langMeta.code;
    document.documentElement.dir = langMeta.dir;
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Ignore storage write errors
    }
  }, [language, langMeta]);

  useEffect(() => {
    document.documentElement.dataset.accent = prefs.accentColor;
    document.documentElement.classList.toggle(
      'a11y-focus-ring',
      prefs.highContrastFocus
    );
    document.documentElement.classList.toggle(
      'a11y-reduced-motion',
      prefs.reducedMotion
    );
    try {
      window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore storage write errors
    }
  }, [prefs]);

  const handleChangeDefaultViewMode = (mode: EditorViewMode) => {
    setDefaultViewMode(mode);
    setViewMode(mode);
    try {
      window.localStorage.setItem(DEFAULT_MODE_STORAGE_KEY, mode);
    } catch {
      // Ignore storage write errors
    }
  };

  const handleUpdatePrefs = (patch: Partial<UserPreferences>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
  };

  const handleResetPrefs = () => {
    setPrefs(DEFAULT_USER_PREFERENCES);
    handleChangeDefaultViewMode('normal');
  };

  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [projects, setProjects] = useState<ProjectTreeItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loadingVault, setLoadingVault] = useState(true);

  const [activeView, setActiveView] = useState<'overview' | 'editor'>(
    'overview'
  );
  const [activeNoteRef, setActiveNoteRef] = useState<ActiveNoteRef | null>(
    null
  );
  const [activeDocument, setActiveDocument] = useState<NoteDocument | null>(
    null
  );
  const [lockedNoteRef, setLockedNoteRef] = useState<ActiveNoteRef | null>(
    null
  );
  const [noteUnlockPassword, setNoteUnlockPassword] = useState('');
  const [noteUnlockBusy, setNoteUnlockBusy] = useState(false);
  const [noteUnlockError, setNoteUnlockError] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<EditorViewMode>(defaultViewMode);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => prefs.sidebarDefaultCollapsed
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] =
    useState<SettingsCategory>('general');
  const [trashCount, setTrashCount] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const [createModalState, setCreateModalState] =
    useState<CreateModalState>(null);
  const [appearanceTarget, setAppearanceTarget] =
    useState<AppearanceModalTarget | null>(null);
  const [appearanceBusy, setAppearanceBusy] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DeleteDialogTarget>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const autosaveTimerRef = useRef<number | null>(null);
  const latestDraftRef = useRef<{
    project: string;
    name: string;
    content: string;
    dirty: boolean;
  } | null>(null);

  const showError = useCallback((err: unknown, fallback: string) => {
    if (err instanceof ApiError) {
      if (err.status === 401) {
        setAuthStatus((prev) =>
          prev
            ? { ...prev, authenticated: false }
            : { authEnabled: true, authenticated: false }
        );
        return;
      }
      setBannerError(err.message);
      return;
    }
    setBannerError(fallback);
  }, []);

  const refreshTree = useCallback(async (): Promise<ProjectTreeItem[]> => {
    const nextTree = await fetchVaultTree();
    setProjects(nextTree);
    return nextTree;
  }, []);

  const refreshTemplates = useCallback(async () => {
    try {
      const nextTemplates = await fetchTemplates();
      setTemplates(nextTemplates);
    } catch {
      // Ignore transient template fetch errors
    }
  }, []);

  const refreshTrashCount = useCallback(async () => {
    try {
      const items = await fetchTrash();
      setTrashCount(items.length);
    } catch {
      // Ignore transient trash fetch errors
    }
  }, []);

  const persistCurrentDraft = useCallback(
    async (override?: { project: string; name: string; content: string }) => {
      const target = override ?? latestDraftRef.current;
      if (!target) return;

      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }

      setSaveStatus('saving');
      setSaveError(null);

      try {
        const updated = await saveNote(
          target.project,
          target.name,
          target.content
        );
        if (
          latestDraftRef.current &&
          latestDraftRef.current.project === target.project &&
          latestDraftRef.current.name === target.name
        ) {
          latestDraftRef.current.dirty =
            latestDraftRef.current.content !== target.content;
        }
        setActiveDocument((prev) =>
          prev &&
          prev.project === updated.project &&
          prev.name === updated.name
            ? updated
            : prev
        );
        setSaveStatus(latestDraftRef.current?.dirty ? 'dirty' : 'saved');
        await refreshTree();
      } catch (err: unknown) {
        setSaveStatus('error');
        const message =
          err instanceof ApiError ? err.message : t.saveError;
        setSaveError(message);
        if (err instanceof ApiError && err.status === 401) {
          setAuthStatus({ authEnabled: true, authenticated: false });
        }
      }
    },
    [refreshTree, t.saveError]
  );

  const openNote = useCallback(
    async (noteRef: ActiveNoteRef, options?: { startEditing?: boolean }) => {
      if (latestDraftRef.current && latestDraftRef.current.dirty) {
        await persistCurrentDraft({
          project: latestDraftRef.current.project,
          name: latestDraftRef.current.name,
          content: latestDraftRef.current.content,
        });
      }

      try {
        const doc = await fetchNote(noteRef.project, noteRef.name);
        setLockedNoteRef(null);
        setNoteUnlockPassword('');
        setNoteUnlockError(null);
        setActiveNoteRef({ project: doc.project, name: doc.name });
        setActiveDocument(doc);
        setEditorContent(doc.content);
        latestDraftRef.current = {
          project: doc.project,
          name: doc.name,
          content: doc.content,
          dirty: false,
        };
        setSaveStatus('saved');
        setSaveError(null);
        const shouldEdit = Boolean(options?.startEditing);
        setIsEditingNote(shouldEdit);
        if (shouldEdit) {
          setViewMode((prev) =>
            prev === 'preview'
              ? defaultViewMode === 'preview'
                ? 'normal'
                : defaultViewMode
              : prev
          );
        }
        setActiveView('editor');
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 423) {
          if (autosaveTimerRef.current !== null) {
            window.clearTimeout(autosaveTimerRef.current);
            autosaveTimerRef.current = null;
          }
          latestDraftRef.current = null;
          setIsEditingNote(false);
          setActiveNoteRef({ project: noteRef.project, name: noteRef.name });
          setActiveDocument(null);
          setEditorContent('');
          setLockedNoteRef({ project: noteRef.project, name: noteRef.name });
          setNoteUnlockPassword('');
          setNoteUnlockError(null);
          setBannerError(null);
          setActiveView('editor');
          return;
        }
        showError(err, 'Could not load note.');
      }
    },
    [defaultViewMode, persistCurrentDraft, showError]
  );

  const handleOpenOverview = useCallback(async () => {
    if (latestDraftRef.current && latestDraftRef.current.dirty) {
      await persistCurrentDraft({
        project: latestDraftRef.current.project,
        name: latestDraftRef.current.name,
        content: latestDraftRef.current.content,
      });
    }
    setLockedNoteRef(null);
    setActiveView('overview');
  }, [persistCurrentDraft]);

  const initializeVault = useCallback(async () => {
    if (shareCode) {
      setLoadingVault(false);
      return;
    }

    setLoadingVault(true);
    try {
      const status = await getAuthStatus();
      setAuthStatus(status);

      if (status.authEnabled && !status.authenticated) {
        setLoadingVault(false);
        return;
      }

      const [tree] = await Promise.all([
        refreshTree(),
        refreshTemplates(),
        refreshTrashCount(),
      ]);
      const firstUnlockedCandidate = tree
        .flatMap((p) =>
          p.notes
            .filter((n) => !n.isLocked)
            .map((n) => ({ project: p.name, name: n.name }))
        )[0];

      if (firstUnlockedCandidate) {
        try {
          const doc = await fetchNote(
            firstUnlockedCandidate.project,
            firstUnlockedCandidate.name
          );
          setActiveNoteRef({ project: doc.project, name: doc.name });
          setActiveDocument(doc);
          setEditorContent(doc.content);
          latestDraftRef.current = {
            project: doc.project,
            name: doc.name,
            content: doc.content,
            dirty: false,
          };
        } catch (err: unknown) {
          if (!(err instanceof ApiError && err.status === 423)) {
            throw err;
          }
        }
      }
      setActiveView('overview');
    } catch (err: unknown) {
      showError(err, 'Failed to initialize vault.');
    } finally {
      setLoadingVault(false);
    }
  }, [shareCode, refreshTree, refreshTemplates, refreshTrashCount, showError]);

  useEffect(() => {
    void initializeVault();
  }, [initializeVault]);

  useEffect(() => {
    if (shareCode) return;

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const isMod = event.ctrlKey || event.metaKey;
      const target = event.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable);

      if (!isMod && event.key === '?' && !isEditable) {
        event.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }

      if (!isMod) return;

      const keyLower = event.key.toLowerCase();
      if (keyLower === 'k') {
        event.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (keyLower === 's') {
        event.preventDefault();
        if (latestDraftRef.current) {
          void persistCurrentDraft();
        }
      } else if (event.key === '/') {
        event.preventDefault();
        setShortcutsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [shareCode, persistCurrentDraft]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  if (shareCode) {
    return <SharedNoteView code={shareCode} t={t} />;
  }

  const handleEditorContentChange = (nextContent: string) => {
    setEditorContent(nextContent);
    if (!activeNoteRef) return;

    latestDraftRef.current = {
      project: activeNoteRef.project,
      name: activeNoteRef.name,
      content: nextContent,
      dirty: true,
    };
    setSaveStatus('dirty');

    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    if (prefs.autosaveDelayMs === 0) {
      return;
    }

    const snapshot = {
      project: activeNoteRef.project,
      name: activeNoteRef.name,
      content: nextContent,
    };

    autosaveTimerRef.current = window.setTimeout(() => {
      void persistCurrentDraft(snapshot);
    }, prefs.autosaveDelayMs);
  };

  const handleCreateProject = async (
    name: string,
    appearance?: { icon?: NoteIconId | null; color?: NoteColorId | null }
  ): Promise<boolean> => {
    try {
      await createProject(name, appearance);
      await refreshTree();
      setBannerError(null);
      return true;
    } catch (err: unknown) {
      showError(err, 'Failed to create project.');
      return false;
    }
  };

  const handleRenameProject = async (
    oldName: string,
    newName: string
  ): Promise<boolean> => {
    try {
      const res = await renameProject(oldName, newName);
      await refreshTree();

      if (activeNoteRef && activeNoteRef.project === oldName) {
        const updatedRef = { project: res.newName, name: activeNoteRef.name };
        setActiveNoteRef(updatedRef);
        setActiveDocument((prev) =>
          prev ? { ...prev, project: res.newName } : prev
        );
        if (latestDraftRef.current?.project === oldName) {
          latestDraftRef.current.project = res.newName;
        }
      }
      if (lockedNoteRef && lockedNoteRef.project === oldName) {
        setLockedNoteRef({ project: res.newName, name: lockedNoteRef.name });
      }
      setBannerError(null);
      return true;
    } catch (err: unknown) {
      showError(err, 'Failed to rename project.');
      return false;
    }
  };

  const handleCreateNote = async (
    projectName: string,
    noteName: string,
    appearance?: { icon?: NoteIconId | null; color?: NoteColorId | null }
  ): Promise<boolean> => {
    try {
      const created = await createNote(projectName, noteName, undefined, appearance);
      await refreshTree();
      await openNote(
        { project: created.project, name: created.name },
        { startEditing: true }
      );
      setBannerError(null);
      return true;
    } catch (err: unknown) {
      showError(err, 'Failed to create note.');
      return false;
    }
  };

  const handleRenameNote = async (
    projectName: string,
    oldNoteName: string,
    newNoteName: string
  ): Promise<boolean> => {
    try {
      if (
        latestDraftRef.current &&
        latestDraftRef.current.project === projectName &&
        latestDraftRef.current.name === oldNoteName &&
        latestDraftRef.current.dirty
      ) {
        await persistCurrentDraft();
      }

      const updatedMeta = await renameNote(
        projectName,
        oldNoteName,
        newNoteName
      );
      await refreshTree();

      if (
        activeNoteRef &&
        activeNoteRef.project === projectName &&
        activeNoteRef.name === oldNoteName
      ) {
        setActiveNoteRef({ project: projectName, name: updatedMeta.name });
        setActiveDocument((prev) =>
          prev
            ? {
                ...prev,
                name: updatedMeta.name,
                title: updatedMeta.title,
                updatedAt: updatedMeta.updatedAt,
              }
            : prev
        );
        if (latestDraftRef.current) {
          latestDraftRef.current.name = updatedMeta.name;
        }
      }
      if (
        lockedNoteRef &&
        lockedNoteRef.project === projectName &&
        lockedNoteRef.name === oldNoteName
      ) {
        setLockedNoteRef({ project: projectName, name: updatedMeta.name });
      }
      setBannerError(null);
      return true;
    } catch (err: unknown) {
      showError(err, 'Failed to rename note.');
      return false;
    }
  };

  const handleMoveNote = async (
    fromProject: string,
    noteName: string,
    toProject: string
  ): Promise<void> => {
    if (fromProject === toProject) return;
    try {
      if (
        latestDraftRef.current &&
        latestDraftRef.current.project === fromProject &&
        latestDraftRef.current.name === noteName &&
        latestDraftRef.current.dirty
      ) {
        await persistCurrentDraft();
      }

      const moved = await moveNote(fromProject, noteName, toProject);
      await refreshTree();

      if (
        activeNoteRef &&
        activeNoteRef.project === fromProject &&
        activeNoteRef.name === noteName
      ) {
        setActiveNoteRef({ project: moved.project, name: moved.name });
        setActiveDocument((prev) =>
          prev
            ? {
                ...prev,
                project: moved.project,
                name: moved.name,
                title: moved.title,
                updatedAt: moved.updatedAt,
              }
            : prev
        );
        if (latestDraftRef.current) {
          latestDraftRef.current.project = moved.project;
          latestDraftRef.current.name = moved.name;
        }
      }

      if (
        lockedNoteRef &&
        lockedNoteRef.project === fromProject &&
        lockedNoteRef.name === noteName
      ) {
        setLockedNoteRef({ project: moved.project, name: moved.name });
      }
      setBannerError(null);
    } catch (err: unknown) {
      showError(err, 'Failed to move note.');
    }
  };

  const handleTogglePinNote = async (
    projectName: string,
    noteName: string,
    pinned: boolean
  ): Promise<void> => {
    try {
      if (
        latestDraftRef.current &&
        latestDraftRef.current.project === projectName &&
        latestDraftRef.current.name === noteName &&
        latestDraftRef.current.dirty
      ) {
        await persistCurrentDraft();
      }

      const updated = await toggleNotePin(projectName, noteName, pinned);
      await refreshTree();

      if (
        activeNoteRef &&
        activeNoteRef.project === projectName &&
        activeNoteRef.name === noteName
      ) {
        setActiveDocument({ ...updated.note, content: updated.content });
        setEditorContent(updated.content);
        latestDraftRef.current = {
          project: updated.note.project,
          name: updated.note.name,
          content: updated.content,
          dirty: false,
        };
        setSaveStatus('saved');
      }
      setBannerError(null);
    } catch (err: unknown) {
      showError(err, 'Failed to update pinned state.');
    }
  };

  const handleUpdateNoteAppearance = async (
    projectName: string,
    noteName: string,
    appearance: { icon: NoteIconId | null; color: NoteColorId | null }
  ): Promise<void> => {
    if (appearanceBusy) return;
    setAppearanceBusy(true);
    try {
      if (
        latestDraftRef.current &&
        latestDraftRef.current.project === projectName &&
        latestDraftRef.current.name === noteName &&
        latestDraftRef.current.dirty
      ) {
        await persistCurrentDraft();
      }

      const updated = await updateNoteAppearance(
        projectName,
        noteName,
        appearance
      );
      await refreshTree();

      if (
        activeNoteRef &&
        activeNoteRef.project === projectName &&
        activeNoteRef.name === noteName
      ) {
        setActiveDocument({ ...updated.note, content: updated.content });
        setEditorContent(updated.content);
        latestDraftRef.current = {
          project: updated.note.project,
          name: updated.note.name,
          content: updated.content,
          dirty: false,
        };
        setSaveStatus('saved');
      }

      setAppearanceTarget((prev) =>
        prev &&
        prev.kind !== 'project' &&
        prev.project === projectName &&
        prev.name === noteName
          ? {
              ...prev,
              icon: updated.note.icon,
              color: updated.note.color,
            }
          : prev
      );
      setBannerError(null);
    } catch (err: unknown) {
      showError(err, 'Failed to update note icon or color.');
    } finally {
      setAppearanceBusy(false);
    }
  };

  const handleUpdateProjectAppearance = async (
    projectName: string,
    appearance: { icon: NoteIconId | null; color: NoteColorId | null }
  ): Promise<void> => {
    if (appearanceBusy) return;
    setAppearanceBusy(true);
    try {
      const updated = await updateProjectAppearance(projectName, appearance);
      await refreshTree();

      setAppearanceTarget((prev) =>
        prev && prev.kind === 'project' && prev.project === projectName
          ? {
              ...prev,
              icon: updated.icon,
              color: updated.color,
            }
          : prev
      );
      setBannerError(null);
    } catch (err: unknown) {
      showError(err, 'Failed to update project icon or color.');
    } finally {
      setAppearanceBusy(false);
    }
  };

  const handleUnlockActiveNote = async (
    event: FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault();
    if (!lockedNoteRef || !noteUnlockPassword || noteUnlockBusy) return;
    setNoteUnlockBusy(true);
    setNoteUnlockError(null);
    try {
      await unlockNote(
        lockedNoteRef.project,
        lockedNoteRef.name,
        noteUnlockPassword
      );
      await refreshTree();
      await openNote(lockedNoteRef);
    } catch (err: unknown) {
      setNoteUnlockError(
        err instanceof ApiError ? err.message : t.saveError
      );
    } finally {
      setNoteUnlockBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);

    try {
      if (deleteTarget.kind === 'project') {
        await deleteProject(deleteTarget.name);
        if (activeNoteRef?.project === deleteTarget.name) {
          if (autosaveTimerRef.current !== null) {
            window.clearTimeout(autosaveTimerRef.current);
          }
          latestDraftRef.current = null;
          setActiveNoteRef(null);
          setActiveDocument(null);
          setLockedNoteRef(null);
          setEditorContent('');
          setActiveView('overview');
        }
      } else {
        await deleteNote(deleteTarget.project, deleteTarget.name);
        if (
          activeNoteRef?.project === deleteTarget.project &&
          activeNoteRef?.name === deleteTarget.name
        ) {
          if (autosaveTimerRef.current !== null) {
            window.clearTimeout(autosaveTimerRef.current);
          }
          latestDraftRef.current = null;
          setActiveNoteRef(null);
          setActiveDocument(null);
          setLockedNoteRef(null);
          setEditorContent('');
          setActiveView('overview');
        }
      }

      await Promise.all([refreshTree(), refreshTrashCount()]);
      setDeleteTarget(null);
      setBannerError(null);
    } catch (err: unknown) {
      showError(err, 'Delete operation failed.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setAuthStatus({ authEnabled: true, authenticated: false });
      setProjects([]);
      setTemplates([]);
      setTrashCount(0);
      setActiveNoteRef(null);
      setActiveDocument(null);
      setLockedNoteRef(null);
      setLockModalOpen(false);
      setEditorContent('');
      latestDraftRef.current = null;
    } catch (err: unknown) {
      showError(err, 'Logout failed.');
    }
  };

  if (loadingVault && !authStatus) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#09090B] text-sm text-[#8E939E]">
        {t.loadingVault}
      </div>
    );
  }

  if (authStatus?.authEnabled && !authStatus.authenticated) {
    return (
      <LoginScreen
        language={language}
        t={t}
        onChangeLanguage={setLanguage}
        onSuccess={() => void initializeVault()}
      />
    );
  }

  const vaultStats = projects.reduce(
    (acc, project) => {
      acc.projectCount += 1;
      acc.noteCount += project.notes.length;
      for (const note of project.notes) {
        acc.totalBytes += note.size;
      }
      return acc;
    },
    { projectCount: 0, noteCount: 0, totalBytes: 0 }
  );

  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-[#09090B] text-[#F4F4F6]">
      <Sidebar
        projects={projects}
        activeNote={activeNoteRef}
        activeView={activeView}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        authEnabled={authStatus?.authEnabled ?? false}
        showTags={prefs.showSidebarTags}
        t={t}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        onSelectOverview={() => void handleOpenOverview()}
        onSelectNote={(noteRef) => void openNote(noteRef)}
        onRequestNewProject={() => setCreateModalState({ kind: 'project' })}
        onRenameProject={handleRenameProject}
        onRequestDeleteProject={(name) =>
          setDeleteTarget({ kind: 'project', name })
        }
        onRequestNewNote={(projectName) =>
          setCreateModalState({ kind: 'note', project: projectName })
        }
        onRenameNote={handleRenameNote}
        onMoveNote={handleMoveNote}
        onTogglePinNote={handleTogglePinNote}
        onCustomizeNoteAppearance={(note) =>
          setAppearanceTarget({
            kind: 'note',
            project: note.project,
            name: note.name,
            title: note.title,
            icon: note.icon,
            color: note.color,
          })
        }
        onCustomizeProjectAppearance={(project) =>
          setAppearanceTarget({
            kind: 'project',
            project: project.name,
            title: project.name,
            icon: project.icon,
            color: project.color,
          })
        }
        onRequestDeleteNote={(project, name) =>
          setDeleteTarget({ kind: 'note', project, name })
        }
        trashCount={trashCount}
        onOpenQuickSearch={() => setSearchOpen(true)}
        onOpenTrash={() => {
          setSettingsCategory('trash');
          setSettingsModalOpen(true);
        }}
        onOpenSettings={() => {
          setSettingsCategory('general');
          setSettingsModalOpen(true);
        }}
        onLogout={() => void handleLogout()}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        {bannerError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 border-b border-rose-500/25 bg-rose-500/10 px-4 py-2 text-xs text-rose-300"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{bannerError}</span>
            </div>
            <button
              type="button"
              onClick={() => setBannerError(null)}
              aria-label={t.cancel}
              className="rounded p-1 hover:bg-rose-500/20"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {activeView === 'editor' && lockedNoteRef ? (
          <div className="flex flex-1 flex-col bg-[#09090B]">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.08] px-4 lg:px-6">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Open menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-[#141417] text-[#E4E4E7] lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
              <span className="truncate text-xs text-[#71717A]">
                {lockedNoteRef.project} / {lockedNoteRef.name}
              </span>
            </header>

            <div className="flex flex-1 items-center justify-center p-4">
              <div className="shadow-card w-full max-w-md rounded-2xl bg-[#18181B] p-2">
                <div className="rounded-xl border border-white/[0.08] bg-black p-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-300">
                      <Lock className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-medium text-[#FAFAFA]">
                        {t.noteLockedTitle}
                      </h2>
                      <p className="truncate text-xs text-[#A1A1AA]">
                        {lockedNoteRef.project} / {lockedNoteRef.name}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-[#A1A1AA]">
                    {t.noteLockedDesc}
                  </p>

                  <form
                    onSubmit={(e) => void handleUnlockActiveNote(e)}
                    className="mt-4 space-y-3"
                  >
                    <input
                      type="password"
                      autoFocus
                      value={noteUnlockPassword}
                      onChange={(e) => setNoteUnlockPassword(e.target.value)}
                      placeholder={t.notePasswordPlaceholder}
                      aria-label={t.notePasswordPlaceholder}
                      className="h-10 w-full rounded-lg border border-white/[0.1] bg-[#111113] px-3 text-sm text-[#FAFAFA] placeholder-[#71717A] outline-none focus:border-accent"
                    />

                    {noteUnlockError && (
                      <div
                        role="alert"
                        className="flex items-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
                      >
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{noteUnlockError}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void handleOpenOverview()}
                        className="rounded-lg border border-white/[0.1] px-3 py-2 text-xs text-[#A1A1AA] transition-colors hover:bg-[#18181B] hover:text-white"
                      >
                        {t.overview}
                      </button>
                      <button
                        type="submit"
                        disabled={noteUnlockBusy || !noteUnlockPassword}
                        className="btn-primary-tactile inline-flex h-10 items-center gap-2 rounded-lg px-4 text-xs font-medium disabled:opacity-50"
                      >
                        {noteUnlockBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <KeyRound className="h-4 w-4" />
                        )}
                        <span>{t.unlockNote}</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        ) : activeView === 'editor' && activeDocument ? (
          <EditorWorkspace
            note={activeDocument}
            projectIcon={
              projects.find((p) => p.name === activeDocument.project)?.icon
            }
            projectColor={
              projects.find((p) => p.name === activeDocument.project)?.color
            }
            content={editorContent}
            viewMode={viewMode}
            saveStatus={saveStatus}
            saveError={saveError}
            prefs={prefs}
            templates={templates}
            isEditing={isEditingNote}
            appearanceBusy={appearanceBusy}
            t={t}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onChangeContent={handleEditorContentChange}
            onChangeViewMode={setViewMode}
            onChangeAppearance={(next) =>
              handleUpdateNoteAppearance(
                activeDocument.project,
                activeDocument.name,
                next
              )
            }
            onStartEditing={() => {
              if (viewMode === 'preview') {
                setViewMode(
                  defaultViewMode === 'preview' ? 'normal' : defaultViewMode
                );
              }
              setIsEditingNote(true);
            }}
            onStopEditing={() => setIsEditingNote(false)}
            onManualSave={() => void persistCurrentDraft()}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenOverview={() => void handleOpenOverview()}
            onOpenShareModal={() => setShareModalOpen(true)}
            onOpenLockModal={() => setLockModalOpen(true)}
          />
        ) : (
          <VaultOverview
            projects={projects}
            locale={langMeta.locale}
            t={t}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onSelectNote={(noteRef) => void openNote(noteRef)}
            onRequestNewProject={() => setCreateModalState({ kind: 'project' })}
            onRequestNewNoteInProject={(projectName) =>
              setCreateModalState({ kind: 'note', project: projectName })
            }
            onOpenSearch={() => setSearchOpen(true)}
          />
        )}
      </main>

      <QuickSearchModal
        open={searchOpen}
        t={t}
        onClose={() => setSearchOpen(false)}
        onSelectNote={(noteRef) => void openNote(noteRef)}
      />

      <CreateItemModal
        state={createModalState}
        projects={projects}
        t={t}
        onCreateProject={handleCreateProject}
        onCreateNote={handleCreateNote}
        onClose={() => setCreateModalState(null)}
      />

      <NoteAppearanceModal
        target={appearanceTarget}
        busy={appearanceBusy}
        t={t}
        onSelect={async (next) => {
          if (!appearanceTarget) return;
          if (appearanceTarget.kind === 'project') {
            await handleUpdateProjectAppearance(appearanceTarget.project, next);
          } else if (appearanceTarget.name) {
            await handleUpdateNoteAppearance(
              appearanceTarget.project,
              appearanceTarget.name,
              next
            );
          }
        }}
        onClose={() => {
          if (!appearanceBusy) setAppearanceTarget(null);
        }}
      />

      {activeDocument && (
        <ShareInviteModal
          open={shareModalOpen}
          project={activeDocument.project}
          noteName={activeDocument.name}
          noteTitle={activeDocument.title}
          t={t}
          onClose={() => setShareModalOpen(false)}
        />
      )}

      {activeDocument && (
        <NoteLockModal
          open={lockModalOpen}
          project={activeDocument.project}
          noteName={activeDocument.name}
          noteTitle={activeDocument.title}
          isLocked={Boolean(activeDocument.isLocked)}
          t={t}
          onLockUpdated={(nextLocked, lockedSessionNow) => {
            setActiveDocument((prev) =>
              prev ? { ...prev, isLocked: nextLocked } : prev
            );
            void refreshTree();
            if (lockedSessionNow) {
              if (autosaveTimerRef.current !== null) {
                window.clearTimeout(autosaveTimerRef.current);
                autosaveTimerRef.current = null;
              }
              const target = {
                project: activeDocument.project,
                name: activeDocument.name,
              };
              latestDraftRef.current = null;
              setActiveDocument(null);
              setEditorContent('');
              setLockedNoteRef(target);
              setNoteUnlockPassword('');
              setNoteUnlockError(null);
              setActiveView('editor');
            }
          }}
          onClose={() => setLockModalOpen(false)}
        />
      )}

      <SettingsModal
        open={settingsModalOpen}
        suppressed={shortcutsOpen}
        initialCategory={settingsCategory}
        language={language}
        locale={langMeta.locale}
        defaultViewMode={defaultViewMode}
        prefs={prefs}
        authEnabled={authStatus?.authEnabled ?? false}
        trashCount={trashCount}
        vaultStats={vaultStats}
        t={t}
        onChangeLanguage={setLanguage}
        onChangeDefaultViewMode={handleChangeDefaultViewMode}
        onUpdatePrefs={handleUpdatePrefs}
        onResetPrefs={handleResetPrefs}
        onTemplatesChanged={() => void refreshTemplates()}
        onTrashChanged={async () => {
          await Promise.all([refreshTree(), refreshTrashCount()]);
        }}
        onOpenKeyboardShortcuts={() => setShortcutsOpen(true)}
        onLogout={() => void handleLogout()}
        onClose={() => setSettingsModalOpen(false)}
      />

      <KeyboardShortcutsModal
        open={shortcutsOpen}
        tabSize={prefs.tabSize}
        t={t}
        onClose={() => setShortcutsOpen(false)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={
          deleteTarget?.kind === 'project'
            ? `"${deleteTarget.name}" — ${t.deleteProjectTitle}`
            : `"${deleteTarget?.name ?? ''}" — ${t.deleteNoteTitle}`
        }
        description={
          deleteTarget?.kind === 'project'
            ? t.moveProjectToTrashDesc
            : t.moveNoteToTrashDesc
        }
        confirmLabel={t.moveToTrash}
        t={t}
        busy={deleteBusy}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => {
          if (!deleteBusy) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
