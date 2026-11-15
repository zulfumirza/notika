import type {
  AppSettings,
  AuthStatus,
  NoteColorId,
  NoteDocument,
  NoteIconId,
  NoteMeta,
  ProjectTreeItem,
  PublicSharedNote,
  SearchResultItem,
  ShareKind,
  SharePermission,
  ShareRecord,
  TemplateItem,
  TrashItem,
} from '../types/vault';

export class ApiError extends Error {
  public readonly status: number;

  public constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? ((await response.json()) as unknown) : null;

  if (!response.ok) {
    const errorMessage =
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `İstek başarısız oldu (${response.status})`;
    throw new ApiError(errorMessage, response.status);
  }

  return data as T;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  return requestJson<AuthStatus>('/api/auth/status');
}

export async function loginWithPassword(password: string): Promise<void> {
  await requestJson<{ ok: boolean }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function logout(): Promise<void> {
  await requestJson<{ ok: boolean }>('/api/auth/logout', {
    method: 'POST',
  });
}

export async function fetchVaultTree(): Promise<ProjectTreeItem[]> {
  const data = await requestJson<{ projects: ProjectTreeItem[] }>('/api/tree');
  return data.projects;
}

export async function createProject(
  name: string,
  appearance?: {
    icon?: NoteIconId | null;
    color?: NoteColorId | null;
  }
): Promise<ProjectTreeItem> {
  const data = await requestJson<{ project: ProjectTreeItem }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      name,
      ...(appearance?.icon ? { icon: appearance.icon } : {}),
      ...(appearance?.color ? { color: appearance.color } : {}),
    }),
  });
  return data.project;
}

export async function updateProjectAppearance(
  project: string,
  appearance: {
    icon?: NoteIconId | null;
    color?: NoteColorId | null;
  }
): Promise<{ name: string; icon?: NoteIconId; color?: NoteColorId }> {
  const data = await requestJson<{
    project: { name: string; icon?: NoteIconId; color?: NoteColorId };
  }>('/api/projects/appearance', {
    method: 'POST',
    body: JSON.stringify({ project, ...appearance }),
  });
  return data.project;
}

export async function renameProject(
  currentName: string,
  newName: string
): Promise<{ oldName: string; newName: string }> {
  return requestJson<{ oldName: string; newName: string }>(
    `/api/projects/${encodeURIComponent(currentName)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ newName }),
    }
  );
}

export async function deleteProject(name: string): Promise<void> {
  await requestJson<{ ok: boolean }>(
    `/api/projects/${encodeURIComponent(name)}`,
    {
      method: 'DELETE',
    }
  );
}

export async function fetchNote(
  project: string,
  note: string
): Promise<NoteDocument> {
  const params = new URLSearchParams({ project, note });
  const data = await requestJson<{ note: NoteDocument }>(
    `/api/notes?${params.toString()}`
  );
  return data.note;
}

export async function createNote(
  project: string,
  name: string,
  content?: string,
  appearance?: {
    icon?: NoteIconId | null;
    color?: NoteColorId | null;
  }
): Promise<NoteDocument> {
  const data = await requestJson<{ note: NoteDocument }>('/api/notes', {
    method: 'POST',
    body: JSON.stringify({
      project,
      name,
      content,
      ...(appearance?.icon ? { icon: appearance.icon } : {}),
      ...(appearance?.color ? { color: appearance.color } : {}),
    }),
  });
  return data.note;
}

export async function saveNote(
  project: string,
  name: string,
  content: string
): Promise<NoteDocument> {
  const data = await requestJson<{ note: NoteDocument }>('/api/notes', {
    method: 'PUT',
    body: JSON.stringify({ project, name, content }),
  });
  return data.note;
}

export async function renameNote(
  project: string,
  name: string,
  newName: string
): Promise<NoteMeta> {
  const data = await requestJson<{ note: NoteMeta }>('/api/notes/rename', {
    method: 'PATCH',
    body: JSON.stringify({ project, name, newName }),
  });
  return data.note;
}

export async function moveNote(
  fromProject: string,
  noteName: string,
  toProject: string
): Promise<NoteMeta> {
  const data = await requestJson<{ note: NoteMeta }>('/api/notes/move', {
    method: 'POST',
    body: JSON.stringify({ fromProject, noteName, toProject }),
  });
  return data.note;
}

export async function toggleNotePin(
  project: string,
  name: string,
  pinned: boolean
): Promise<{ note: NoteMeta; content: string }> {
  return requestJson<{ note: NoteMeta; content: string }>('/api/notes/pin', {
    method: 'POST',
    body: JSON.stringify({ project, name, pinned }),
  });
}

export async function updateNoteAppearance(
  project: string,
  name: string,
  appearance: {
    icon?: NoteIconId | null;
    color?: NoteColorId | null;
  }
): Promise<{ note: NoteMeta; content: string }> {
  return requestJson<{ note: NoteMeta; content: string }>(
    '/api/notes/appearance',
    {
      method: 'POST',
      body: JSON.stringify({ project, name, ...appearance }),
    }
  );
}

export async function unlockNote(
  project: string,
  name: string,
  password: string
): Promise<void> {
  await requestJson<{ ok: boolean }>('/api/notes/unlock', {
    method: 'POST',
    body: JSON.stringify({ project, name, password }),
  });
}

export async function configureNoteLock(payload: {
  project: string;
  name: string;
  action: 'set' | 'remove' | 'lock-session';
  password?: string;
  currentPassword?: string;
}): Promise<{ ok: boolean; isLocked: boolean }> {
  return requestJson<{ ok: boolean; isLocked: boolean }>('/api/notes/lock', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteNote(project: string, note: string): Promise<void> {
  const params = new URLSearchParams({ project, note });
  await requestJson<{ ok: boolean }>(`/api/notes?${params.toString()}`, {
    method: 'DELETE',
  });
}

export async function searchVault(query: string): Promise<SearchResultItem[]> {
  const params = new URLSearchParams({ q: query });
  const data = await requestJson<{ results: SearchResultItem[] }>(
    `/api/search?${params.toString()}`
  );
  return data.results;
}

// Share & Invite APIs
export async function listNoteShares(
  project: string,
  note: string
): Promise<ShareRecord[]> {
  const params = new URLSearchParams({ project, note });
  const data = await requestJson<{ shares: ShareRecord[] }>(
    `/api/shares?${params.toString()}`
  );
  return data.shares;
}

export async function createShareOrInvite(payload: {
  project: string;
  note: string;
  permission: SharePermission;
  kind: ShareKind;
  inviteeName?: string;
  inviteeEmail?: string;
  password?: string;
}): Promise<ShareRecord> {
  const data = await requestJson<{ share: ShareRecord }>('/api/shares', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.share;
}

export async function updateSharePermission(
  code: string,
  permission: SharePermission
): Promise<ShareRecord> {
  const data = await requestJson<{ share: ShareRecord }>(
    `/api/shares/${encodeURIComponent(code)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ permission }),
    }
  );
  return data.share;
}

export async function revokeShare(code: string): Promise<void> {
  await requestJson<{ ok: boolean }>(
    `/api/shares/${encodeURIComponent(code)}`,
    {
      method: 'DELETE',
    }
  );
}

// Public Share Access
export async function fetchPublicShare(code: string): Promise<PublicSharedNote> {
  const data = await requestJson<{ note: PublicSharedNote }>(
    `/api/public/share/${encodeURIComponent(code)}`
  );
  return data.note;
}

export async function verifyPublicSharePassword(
  code: string,
  password: string
): Promise<PublicSharedNote> {
  const data = await requestJson<{ note: PublicSharedNote }>(
    `/api/public/share/${encodeURIComponent(code)}/verify`,
    {
      method: 'POST',
      body: JSON.stringify({ password }),
    }
  );
  return data.note;
}

export async function savePublicShare(
  code: string,
  content: string
): Promise<PublicSharedNote> {
  const data = await requestJson<{ note: PublicSharedNote }>(
    `/api/public/share/${encodeURIComponent(code)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }
  );
  return data.note;
}

// Templates
export async function fetchTemplates(): Promise<TemplateItem[]> {
  const data = await requestJson<{ templates: TemplateItem[] }>('/api/templates');
  return data.templates;
}

export async function createTemplate(
  name: string,
  content: string
): Promise<TemplateItem> {
  const data = await requestJson<{ template: TemplateItem }>('/api/templates', {
    method: 'POST',
    body: JSON.stringify({ name, content }),
  });
  return data.template;
}

export async function saveTemplate(
  name: string,
  content: string,
  newName?: string
): Promise<TemplateItem> {
  const data = await requestJson<{ template: TemplateItem }>(
    `/api/templates/${encodeURIComponent(name)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ content, newName }),
    }
  );
  return data.template;
}

export async function deleteTemplate(name: string): Promise<void> {
  await requestJson<{ ok: boolean }>(
    `/api/templates/${encodeURIComponent(name)}`,
    {
      method: 'DELETE',
    }
  );
}

// Settings & MCP
export async function fetchSettings(): Promise<AppSettings> {
  const data = await requestJson<{ settings: AppSettings }>('/api/settings');
  return data.settings;
}

export async function updateSettings(patch: {
  mcpEnabled: boolean;
}): Promise<AppSettings> {
  const data = await requestJson<{ settings: AppSettings }>('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data.settings;
}

export async function regenerateMcpToken(): Promise<AppSettings> {
  const data = await requestJson<{ settings: AppSettings }>(
    '/api/settings/regenerate-mcp-token',
    { method: 'POST' }
  );
  return data.settings;
}

// Trash
export async function fetchTrash(): Promise<TrashItem[]> {
  const data = await requestJson<{ items: TrashItem[] }>('/api/trash');
  return data.items;
}

export async function restoreTrashItem(id: string): Promise<{
  item: TrashItem;
  restoredProject: string;
  restoredNote?: string;
}> {
  return requestJson<{
    item: TrashItem;
    restoredProject: string;
    restoredNote?: string;
  }>(`/api/trash/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
  });
}

export async function purgeTrashItem(id: string): Promise<void> {
  await requestJson<{ ok: boolean }>(
    `/api/trash/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    }
  );
}

export async function emptyTrash(): Promise<void> {
  await requestJson<{ ok: boolean }>('/api/trash', {
    method: 'DELETE',
  });
}

