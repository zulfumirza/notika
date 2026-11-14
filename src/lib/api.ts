import type {
  AppSettings,
  AuthStatus,
  NoteDocument,
  NoteMeta,
  ProjectTreeItem,
  PublicSharedNote,
  SearchResultItem,
  ShareKind,
  SharePermission,
  ShareRecord,
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

export async function createProject(name: string): Promise<ProjectTreeItem> {
  const data = await requestJson<{ project: ProjectTreeItem }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name }),
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
  content?: string
): Promise<NoteDocument> {
  const data = await requestJson<{ note: NoteDocument }>('/api/notes', {
    method: 'POST',
    body: JSON.stringify({ project, name, content }),
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
