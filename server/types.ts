import type { NoteColorId, NoteIconId } from '../shared/noteAppearance.ts';

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

export interface AuthStatusResponse {
  authEnabled: boolean;
  authenticated: boolean;
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

export interface StoredShareRecord extends ShareRecord {
  passwordHash?: string;
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
