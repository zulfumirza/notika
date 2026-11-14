export interface NoteMeta {
  name: string;
  title: string;
  project: string;
  updatedAt: string;
  size: number;
}

export interface ProjectTreeItem {
  name: string;
  noteCount: number;
  updatedAt: string;
  notes: NoteMeta[];
}

export interface NoteDocument {
  project: string;
  name: string;
  title: string;
  content: string;
  updatedAt: string;
  size: number;
}

export interface SearchResultItem {
  project: string;
  name: string;
  title: string;
  updatedAt: string;
  matchType: 'title' | 'content' | 'both';
  snippet: string;
  matchCount: number;
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
}

export interface AppSettings {
  mcpEnabled: boolean;
  mcpToken: string;
}
