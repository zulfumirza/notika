import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
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
  fetchVaultTree,
  getAuthStatus,
  logout,
  renameNote,
  renameProject,
  saveNote,
} from './lib/api';
import type {
  ActiveNoteRef,
  AuthStatus,
  EditorViewMode,
  LanguageCode,
  NoteDocument,
  ProjectTreeItem,
  SaveStatus,
} from './types/vault';
import { ConfirmDialog } from './components/ConfirmDialog';
import { EditorWorkspace } from './components/EditorWorkspace';
import { LoginScreen } from './components/LoginScreen';
import { QuickSearchModal } from './components/QuickSearchModal';
import { SettingsModal } from './components/SettingsModal';
import { SharedNoteView } from './components/SharedNoteView';
import { ShareInviteModal } from './components/ShareInviteModal';
import { Sidebar } from './components/Sidebar';
import { VaultOverview } from './components/VaultOverview';

type DeleteDialogTarget =
  | { kind: 'project'; name: string }
  | { kind: 'note'; project: string; name: string }
  | null;

const AUTOSAVE_DELAY_MS = 800;
const LANGUAGE_STORAGE_KEY = 'notika_lang';
const DEFAULT_MODE_STORAGE_KEY = 'notika_default_mode';

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

  const handleChangeDefaultViewMode = (mode: EditorViewMode) => {
    setDefaultViewMode(mode);
    setViewMode(mode);
    try {
      window.localStorage.setItem(DEFAULT_MODE_STORAGE_KEY, mode);
    } catch {
      // Ignore storage write errors
    }
  };

  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [projects, setProjects] = useState<ProjectTreeItem[]>([]);
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
  const [editorContent, setEditorContent] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<EditorViewMode>(defaultViewMode);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const [creatingProjectTrigger, setCreatingProjectTrigger] = useState(0);
  const [creatingNoteProject, setCreatingNoteProject] = useState<string | null>(
    null
  );

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
    async (noteRef: ActiveNoteRef) => {
      if (latestDraftRef.current && latestDraftRef.current.dirty) {
        await persistCurrentDraft({
          project: latestDraftRef.current.project,
          name: latestDraftRef.current.name,
          content: latestDraftRef.current.content,
        });
      }

      try {
        const doc = await fetchNote(noteRef.project, noteRef.name);
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
        setActiveView('editor');
      } catch (err: unknown) {
        showError(err, 'Could not load note.');
      }
    },
    [persistCurrentDraft, showError]
  );

  const handleOpenOverview = useCallback(async () => {
    if (latestDraftRef.current && latestDraftRef.current.dirty) {
      await persistCurrentDraft({
        project: latestDraftRef.current.project,
        name: latestDraftRef.current.name,
        content: latestDraftRef.current.content,
      });
    }
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

      const tree = await refreshTree();
      const firstProjectWithNotes = tree.find((p) => p.notes.length > 0);
      if (firstProjectWithNotes && firstProjectWithNotes.notes[0]) {
        const doc = await fetchNote(
          firstProjectWithNotes.name,
          firstProjectWithNotes.notes[0].name
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
      }
      setActiveView('overview');
    } catch (err: unknown) {
      showError(err, 'Failed to initialize vault.');
    } finally {
      setLoadingVault(false);
    }
  }, [shareCode, refreshTree, showError]);

  useEffect(() => {
    void initializeVault();
  }, [initializeVault]);

  useEffect(() => {
    if (shareCode) return;

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const isMod = event.ctrlKey || event.metaKey;
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
    }

    const snapshot = {
      project: activeNoteRef.project,
      name: activeNoteRef.name,
      content: nextContent,
    };

    autosaveTimerRef.current = window.setTimeout(() => {
      void persistCurrentDraft(snapshot);
    }, AUTOSAVE_DELAY_MS);
  };

  const handleCreateProject = async (name: string): Promise<boolean> => {
    try {
      await createProject(name);
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
      setBannerError(null);
      return true;
    } catch (err: unknown) {
      showError(err, 'Failed to rename project.');
      return false;
    }
  };

  const handleCreateNote = async (
    projectName: string,
    noteName: string
  ): Promise<boolean> => {
    try {
      const created = await createNote(projectName, noteName);
      await refreshTree();
      await openNote({ project: created.project, name: created.name });
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
      setBannerError(null);
      return true;
    } catch (err: unknown) {
      showError(err, 'Failed to rename note.');
      return false;
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
          setEditorContent('');
          setActiveView('overview');
        }
      }

      await refreshTree();
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
      setActiveNoteRef(null);
      setActiveDocument(null);
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

  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-[#09090B] text-[#F4F4F6]">
      <Sidebar
        projects={projects}
        activeNote={activeNoteRef}
        activeView={activeView}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        authEnabled={authStatus?.authEnabled ?? false}
        creatingProjectTrigger={creatingProjectTrigger}
        creatingNoteProject={creatingNoteProject}
        t={t}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onClearCreatingNoteProject={() => setCreatingNoteProject(null)}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        onSelectOverview={() => void handleOpenOverview()}
        onSelectNote={(noteRef) => void openNote(noteRef)}
        onCreateProject={handleCreateProject}
        onRenameProject={handleRenameProject}
        onRequestDeleteProject={(name) =>
          setDeleteTarget({ kind: 'project', name })
        }
        onCreateNote={handleCreateNote}
        onRenameNote={handleRenameNote}
        onRequestDeleteNote={(project, name) =>
          setDeleteTarget({ kind: 'note', project, name })
        }
        onOpenQuickSearch={() => setSearchOpen(true)}
        onOpenSettings={() => setSettingsModalOpen(true)}
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

        {activeView === 'editor' && activeDocument ? (
          <EditorWorkspace
            note={activeDocument}
            content={editorContent}
            viewMode={viewMode}
            saveStatus={saveStatus}
            saveError={saveError}
            t={t}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onChangeContent={handleEditorContentChange}
            onChangeViewMode={setViewMode}
            onManualSave={() => void persistCurrentDraft()}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenOverview={() => void handleOpenOverview()}
            onOpenShareModal={() => setShareModalOpen(true)}
          />
        ) : (
          <VaultOverview
            projects={projects}
            locale={langMeta.locale}
            t={t}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onSelectNote={(noteRef) => void openNote(noteRef)}
            onRequestNewProject={() => {
              setSidebarCollapsed(false);
              setMobileSidebarOpen(true);
              setCreatingProjectTrigger((n) => n + 1);
            }}
            onRequestNewNoteInProject={(projectName) => {
              setSidebarCollapsed(false);
              setMobileSidebarOpen(true);
              setCreatingNoteProject(projectName);
            }}
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

      <SettingsModal
        open={settingsModalOpen}
        language={language}
        defaultViewMode={defaultViewMode}
        authEnabled={authStatus?.authEnabled ?? false}
        t={t}
        onChangeLanguage={setLanguage}
        onChangeDefaultViewMode={handleChangeDefaultViewMode}
        onLogout={() => void handleLogout()}
        onClose={() => setSettingsModalOpen(false)}
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
            ? t.deleteProjectDesc
            : t.deleteNoteDesc
        }
        confirmLabel={t.deletePermanently}
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
