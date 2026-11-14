import type { NoteColorId, NoteIconId } from '../../shared/noteAppearance';

export type { NoteColorId, NoteIconId };

export interface NoteMeta {
  name: string;
  title: string;
  project: string;
  updatedAt: string;
  size: number;
  tags?: string[];
  pinned?: boolean;
  icon?: NoteIconId;
  color?: NoteColorId;
  isLocked?: boolean;
}

export interface ProjectTreeItem {
  name: string;
  noteCount: number;
  updatedAt: string;
  icon?: NoteIconId;
  color?: NoteColorId;
  notes: NoteMeta[];
}

export interface NoteDocument {
  project: string;
  name: string;
  title: string;
  content: string;
  updatedAt: string;
  size: number;
  pinned?: boolean;
  icon?: NoteIconId;
  color?: NoteColorId;
  isLocked?: boolean;
}

export interface SearchResultItem {
  project: string;
  name: string;
  title: string;
  updatedAt: string;
  matchType: 'title' | 'content' | 'both';
  snippet: string;
  matchCount: number;
  isLocked?: boolean;
}

export interface AuthStatus {
  authEnabled: boolean;
  authenticated: boolean;
}

export type EditorViewMode = 'normal' | 'editor' | 'split' | 'preview';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

export interface ActiveNoteRef {
  project: string;
  name: string;
}

export type SharePermission = 'read' | 'edit';
export type ShareKind = 'link' | 'invite';

export interface ShareRecord {
  code: string;
  project: string;
  note: string;
  permission: SharePermission;
  kind: ShareKind;
  inviteeName?: string;
  inviteeEmail?: string;
  createdAt: string;
  expiresAt?: string;
  hasPassword?: boolean;
}

export interface PublicSharedNote {
  code: string;
  project: string;
  note: string;
  title: string;
  content: string;
  updatedAt: string;
  permission: SharePermission;
  kind: ShareKind;
  inviteeName?: string;
  hasPassword?: boolean;
  requiresPassword?: boolean;
}

export interface AppSettings {
  mcpEnabled: boolean;
  mcpToken: string;
}

export interface TemplateItem {
  name: string;
  title: string;
  content: string;
  updatedAt: string;
}

export interface TrashItem {
  id: string;
  kind: 'note' | 'project';
  name: string;
  title: string;
  project: string;
  deletedAt: string;
  size: number;
  noteCount?: number;
}

export type LanguageCode =
  | 'tr'
  | 'en'
  | 'de'
  | 'fr'
  | 'es'
  | 'pt'
  | 'ru'
  | 'ar'
  | 'ja'
  | 'zh';

export type AccentColor =
  | 'emerald'
  | 'sky'
  | 'violet'
  | 'amber'
  | 'rose'
  | 'indigo';

export const NOTIKA_VERSION = '1.0.0';

export interface UserPreferences {
  accentColor: AccentColor;
  autosaveDelayMs: 0 | 400 | 800 | 1500 | 3000;
  editorFontSize: 13 | 14 | 15 | 16 | 18;
  tabSize: 2 | 4;
  spellcheck: boolean;
  wordWrap: boolean;
  enableTemplates: boolean;
  showFooterStats: boolean;
  showSidebarTags: boolean;
  sidebarDefaultCollapsed: boolean;
  highContrastFocus: boolean;
  reducedMotion: boolean;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  accentColor: 'emerald',
  autosaveDelayMs: 800,
  editorFontSize: 15,
  tabSize: 2,
  spellcheck: false,
  wordWrap: true,
  enableTemplates: false,
  showFooterStats: true,
  showSidebarTags: true,
  sidebarDefaultCollapsed: false,
  highContrastFocus: false,
  reducedMotion: false,
};

