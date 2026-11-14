import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  AppSettings,
  PublicSharedNote,
  ShareKind,
  SharePermission,
  ShareRecord,
} from './types.ts';
import {
  VaultError,
  readNote,
  resolveNotePath,
  saveNote,
} from './vault.ts';

const SHARES_FILE = '.notika-shares.json';
const SETTINGS_FILE = '.notika-settings.json';
const SHORT_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789';

function generateShortCode(length = 7): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    const idx = (bytes[i] ?? 0) % SHORT_ALPHABET.length;
    out += SHORT_ALPHABET[idx] ?? 'x';
  }
  return out;
}

function generateMcpToken(): string {
  return `ntk_${crypto.randomBytes(24).toString('hex')}`;
}

async function readAllShares(dataDir: string): Promise<ShareRecord[]> {
  const filePath = path.join(dataDir, SHARES_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const nowIso = new Date().toISOString();
    return parsed.filter((item): item is ShareRecord => {
      if (typeof item !== 'object' || item === null) return false;
      const rec = item as Partial<ShareRecord>;
      if (
        typeof rec.code !== 'string' ||
        typeof rec.project !== 'string' ||
        typeof rec.note !== 'string'
      ) {
        return false;
      }
      if (rec.expiresAt && rec.expiresAt <= nowIso) {
        return false;
      }
      return true;
    });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return [];
    return [];
  }
}

async function writeAllShares(
  dataDir: string,
  shares: ShareRecord[]
): Promise<void> {
  const filePath = path.join(dataDir, SHARES_FILE);
  await fs.writeFile(filePath, JSON.stringify(shares, null, 2), 'utf8');
}

export async function listSharesForNote(
  dataDir: string,
  rawProject: unknown,
  rawNote: unknown
): Promise<ShareRecord[]> {
  const { projectName, noteName } = await resolveNotePath(
    dataDir,
    rawProject,
    rawNote
  );
  const all = await readAllShares(dataDir);
  return all.filter(
    (item) => item.project === projectName && item.note === noteName
  );
}

export interface CreateShareInput {
  project: unknown;
  note: unknown;
  permission: unknown;
  kind: unknown;
  inviteeName?: unknown;
  inviteeEmail?: unknown;
  expiresInHours?: unknown;
}

export async function createShareOrInvite(
  dataDir: string,
  input: CreateShareInput
): Promise<ShareRecord> {
  const { projectName, noteName } = await resolveNotePath(
    dataDir,
    input.project,
    input.note
  );

  // Verify note actually exists
  await readNote(dataDir, projectName, noteName);

  const permission: SharePermission =
    input.permission === 'edit' ? 'edit' : 'read';
  const kind: ShareKind = input.kind === 'invite' ? 'invite' : 'link';

  const inviteeName =
    typeof input.inviteeName === 'string' && input.inviteeName.trim().length > 0
      ? input.inviteeName.trim().slice(0, 80)
      : undefined;

  const inviteeEmail =
    typeof input.inviteeEmail === 'string' &&
    input.inviteeEmail.trim().length > 0
      ? input.inviteeEmail.trim().slice(0, 120)
      : undefined;

  if (kind === 'invite' && !inviteeName && !inviteeEmail) {
    throw new VaultError(
      'Davet edilecek kişinin adını veya e-posta adresini girin.',
      400
    );
  }

  let expiresAt: string | undefined;
  if (
    typeof input.expiresInHours === 'number' &&
    Number.isFinite(input.expiresInHours) &&
    input.expiresInHours > 0
  ) {
    const ms = Math.min(input.expiresInHours, 24 * 365) * 60 * 60 * 1000;
    expiresAt = new Date(Date.now() + ms).toISOString();
  }

  const all = await readAllShares(dataDir);
  let code = generateShortCode(7);
  while (all.some((s) => s.code === code)) {
    code = generateShortCode(7);
  }

  const record: ShareRecord = {
    code,
    project: projectName,
    note: noteName,
    permission,
    kind,
    inviteeName,
    inviteeEmail,
    createdAt: new Date().toISOString(),
    expiresAt,
  };

  all.unshift(record);
  await writeAllShares(dataDir, all);
  return record;
}

export async function updateSharePermission(
  dataDir: string,
  rawCode: unknown,
  rawPermission: unknown
): Promise<ShareRecord> {
  if (typeof rawCode !== 'string' || !/^[a-z0-9]{4,16}$/i.test(rawCode)) {
    throw new VaultError('Geçersiz paylaşım kodu.', 400);
  }
  const permission: SharePermission =
    rawPermission === 'edit' ? 'edit' : 'read';

  const all = await readAllShares(dataDir);
  const idx = all.findIndex((s) => s.code === rawCode);
  if (idx === -1 || !all[idx]) {
    throw new VaultError('Paylaşım bağlantısı bulunamadı.', 404);
  }

  const updated: ShareRecord = {
    ...all[idx],
    permission,
  };
  all[idx] = updated;
  await writeAllShares(dataDir, all);
  return updated;
}

export async function revokeShare(
  dataDir: string,
  rawCode: unknown
): Promise<void> {
  if (typeof rawCode !== 'string' || !/^[a-z0-9]{4,16}$/i.test(rawCode)) {
    throw new VaultError('Geçersiz paylaşım kodu.', 400);
  }

  const all = await readAllShares(dataDir);
  const next = all.filter((s) => s.code !== rawCode);
  if (next.length === all.length) {
    throw new VaultError('Paylaşım bağlantısı bulunamadı.', 404);
  }
  await writeAllShares(dataDir, next);
}

export async function resolveSharedNote(
  dataDir: string,
  rawCode: unknown
): Promise<PublicSharedNote> {
  if (typeof rawCode !== 'string' || !/^[a-z0-9]{4,16}$/i.test(rawCode)) {
    throw new VaultError('Geçersiz paylaşım bağlantısı.', 404);
  }

  const all = await readAllShares(dataDir);
  const share = all.find((s) => s.code === rawCode);
  if (!share) {
    throw new VaultError(
      'Bu paylaşım veya davet bağlantısı geçersiz ya da süresi dolmuş.',
      404
    );
  }

  const doc = await readNote(dataDir, share.project, share.note);
  return {
    code: share.code,
    project: doc.project,
    note: doc.name,
    title: doc.title,
    content: doc.content,
    updatedAt: doc.updatedAt,
    permission: share.permission,
    kind: share.kind,
    inviteeName: share.inviteeName,
  };
}

export async function saveSharedNote(
  dataDir: string,
  rawCode: unknown,
  content: unknown
): Promise<PublicSharedNote> {
  if (typeof rawCode !== 'string' || !/^[a-z0-9]{4,16}$/i.test(rawCode)) {
    throw new VaultError('Geçersiz paylaşım bağlantısı.', 404);
  }

  const all = await readAllShares(dataDir);
  const share = all.find((s) => s.code === rawCode);
  if (!share) {
    throw new VaultError(
      'Bu paylaşım bağlantısı geçersiz veya iptal edilmiş.',
      404
    );
  }

  if (share.permission !== 'edit') {
    throw new VaultError(
      'Bu bağlantı yalnızca okuma (salt okunur) iznine sahiptir.',
      403
    );
  }

  const doc = await saveNote(dataDir, share.project, share.note, content);
  return {
    code: share.code,
    project: doc.project,
    note: doc.name,
    title: doc.title,
    content: doc.content,
    updatedAt: doc.updatedAt,
    permission: share.permission,
    kind: share.kind,
    inviteeName: share.inviteeName,
  };
}

export async function getAppSettings(dataDir: string): Promise<AppSettings> {
  const filePath = path.join(dataDir, SETTINGS_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const mcpEnabled =
      typeof parsed.mcpEnabled === 'boolean' ? parsed.mcpEnabled : true;
    const mcpToken =
      typeof parsed.mcpToken === 'string' && parsed.mcpToken.length >= 16
        ? parsed.mcpToken
        : generateMcpToken();

    return { mcpEnabled, mcpToken };
  } catch {
    const defaults: AppSettings = {
      mcpEnabled: true,
      mcpToken: process.env.MCP_TOKEN?.trim() || generateMcpToken(),
    };
    await fs.writeFile(filePath, JSON.stringify(defaults, null, 2), 'utf8');
    return defaults;
  }
}

export async function updateAppSettings(
  dataDir: string,
  patch: { mcpEnabled?: unknown }
): Promise<AppSettings> {
  const current = await getAppSettings(dataDir);
  const next: AppSettings = {
    mcpEnabled:
      typeof patch.mcpEnabled === 'boolean'
        ? patch.mcpEnabled
        : current.mcpEnabled,
    mcpToken: current.mcpToken,
  };
  await fs.writeFile(
    path.join(dataDir, SETTINGS_FILE),
    JSON.stringify(next, null, 2),
    'utf8'
  );
  return next;
}

export async function regenerateMcpToken(
  dataDir: string
): Promise<AppSettings> {
  const current = await getAppSettings(dataDir);
  const next: AppSettings = {
    mcpEnabled: current.mcpEnabled,
    mcpToken: generateMcpToken(),
  };
  await fs.writeFile(
    path.join(dataDir, SETTINGS_FILE),
    JSON.stringify(next, null, 2),
    'utf8'
  );
  return next;
}
