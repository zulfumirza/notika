import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import { getAuthConfig, parseCookies } from './auth.ts';

const LOCKS_FILE = '.notika-locks.json';
const NOTE_UNLOCK_COOKIE = 'notika_note_unlocks';
const SHARE_UNLOCK_COOKIE = 'notika_share_unlocks';
const UNLOCK_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export function makeNoteKey(project: string, note: string): string {
  return `${project}/${note}`;
}

export function hashPasswordSecret(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPasswordSecret(
  password: string,
  storedHash: string
): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, hexKey] = parts;
  if (!salt || !hexKey) return false;

  try {
    const keyBuf = Buffer.from(hexKey, 'hex');
    const derived = crypto.scryptSync(password, salt, 64);
    if (keyBuf.length !== derived.length) return false;
    return crypto.timingSafeEqual(keyBuf, derived);
  } catch {
    return false;
  }
}

async function readLocksMap(dataDir: string): Promise<Record<string, string>> {
  const filePath = path.join(dataDir, LOCKS_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.includes(':')) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function writeLocksMap(
  dataDir: string,
  map: Record<string, string>
): Promise<void> {
  const filePath = path.join(dataDir, LOCKS_FILE);
  await fs.writeFile(filePath, JSON.stringify(map, null, 2), 'utf8');
}

export async function listLockedNoteKeys(dataDir: string): Promise<Set<string>> {
  const map = await readLocksMap(dataDir);
  return new Set(Object.keys(map));
}

export async function isNoteLocked(
  dataDir: string,
  project: string,
  note: string
): Promise<boolean> {
  const map = await readLocksMap(dataDir);
  return typeof map[makeNoteKey(project, note)] === 'string';
}

export async function verifyNotePassword(
  dataDir: string,
  project: string,
  note: string,
  password: string
): Promise<boolean> {
  const map = await readLocksMap(dataDir);
  const hash = map[makeNoteKey(project, note)];
  if (!hash) return true;
  return verifyPasswordSecret(password, hash);
}

export async function setNotePassword(
  dataDir: string,
  project: string,
  note: string,
  password: string
): Promise<void> {
  const map = await readLocksMap(dataDir);
  map[makeNoteKey(project, note)] = hashPasswordSecret(password);
  await writeLocksMap(dataDir, map);
}

export async function removeNotePassword(
  dataDir: string,
  project: string,
  note: string
): Promise<void> {
  const map = await readLocksMap(dataDir);
  const key = makeNoteKey(project, note);
  if (key in map) {
    delete map[key];
    await writeLocksMap(dataDir, map);
  }
}

export async function relocateNoteLock(
  dataDir: string,
  oldProject: string,
  oldNote: string,
  newProject: string,
  newNote: string
): Promise<void> {
  const oldKey = makeNoteKey(oldProject, oldNote);
  const newKey = makeNoteKey(newProject, newNote);
  if (oldKey === newKey) return;

  const map = await readLocksMap(dataDir);
  const hash = map[oldKey];
  if (!hash) return;
  delete map[oldKey];
  map[newKey] = hash;
  await writeLocksMap(dataDir, map);
}

export async function relocateProjectLocks(
  dataDir: string,
  oldProject: string,
  newProject: string
): Promise<void> {
  if (oldProject === newProject) return;
  const map = await readLocksMap(dataDir);
  const prefix = `${oldProject}/`;
  let changed = false;
  const next: Record<string, string> = {};

  for (const [k, v] of Object.entries(map)) {
    if (k.startsWith(prefix)) {
      next[`${newProject}/${k.slice(prefix.length)}`] = v;
      changed = true;
    } else {
      next[k] = v;
    }
  }

  if (changed) {
    await writeLocksMap(dataDir, next);
  }
}

export async function deleteProjectLocks(
  dataDir: string,
  project: string
): Promise<void> {
  const map = await readLocksMap(dataDir);
  const prefix = `${project}/`;
  let changed = false;
  for (const key of Object.keys(map)) {
    if (key.startsWith(prefix)) {
      delete map[key];
      changed = true;
    }
  }
  if (changed) {
    await writeLocksMap(dataDir, map);
  }
}

export async function takeNoteLockHash(
  dataDir: string,
  project: string,
  note: string
): Promise<string | undefined> {
  const map = await readLocksMap(dataDir);
  const key = makeNoteKey(project, note);
  const hash = map[key];
  if (!hash) return undefined;
  delete map[key];
  await writeLocksMap(dataDir, map);
  return hash;
}

export async function restoreNoteLockHash(
  dataDir: string,
  project: string,
  note: string,
  hash: string
): Promise<void> {
  const map = await readLocksMap(dataDir);
  map[makeNoteKey(project, note)] = hash;
  await writeLocksMap(dataDir, map);
}

export async function takeProjectLockHashes(
  dataDir: string,
  project: string
): Promise<Record<string, string>> {
  const map = await readLocksMap(dataDir);
  const prefix = `${project}/`;
  const extracted: Record<string, string> = {};
  let changed = false;

  for (const [key, value] of Object.entries(map)) {
    if (key.startsWith(prefix)) {
      extracted[key.slice(prefix.length)] = value;
      delete map[key];
      changed = true;
    }
  }

  if (changed) {
    await writeLocksMap(dataDir, map);
  }
  return extracted;
}

export async function restoreProjectLockHashes(
  dataDir: string,
  project: string,
  noteHashes: Record<string, string>
): Promise<void> {
  const entries = Object.entries(noteHashes);
  if (entries.length === 0) return;
  const map = await readLocksMap(dataDir);
  for (const [noteName, hash] of entries) {
    map[makeNoteKey(project, noteName)] = hash;
  }
  await writeLocksMap(dataDir, map);
}

interface UnlockCookiePayload {
  items: string[];
  exp: number;
}

function sign(encoded: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');
}

function readSignedSetCookie(req: Request, cookieName: string): Set<string> {
  const cookies = parseCookies(req.headers.cookie);
  const rawToken = cookies[cookieName];
  if (!rawToken) return new Set();

  const parts = rawToken.split('.');
  if (parts.length !== 2) return new Set();
  const [encoded, signature] = parts;
  if (!encoded || !signature) return new Set();

  const { secret } = getAuthConfig();
  const expected = sign(encoded, secret);
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as Partial<UnlockCookiePayload>;
    if (
      typeof parsed.exp !== 'number' ||
      parsed.exp <= Math.floor(Date.now() / 1000) ||
      !Array.isArray(parsed.items)
    ) {
      return new Set();
    }
    return new Set(
      parsed.items.filter((item): item is string => typeof item === 'string')
    );
  } catch {
    return new Set();
  }
}

function isHttpsRequest(req: Request): boolean {
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string') {
    return forwardedProto.split(',')[0]?.trim().toLowerCase() === 'https';
  }
  return req.secure;
}

function writeSignedSetCookie(
  req: Request,
  res: Response,
  cookieName: string,
  items: Set<string>
): void {
  const payload: UnlockCookiePayload = {
    items: Array.from(items).slice(-80),
    exp: Math.floor(Date.now() / 1000) + UNLOCK_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  );
  const { secret } = getAuthConfig();
  const token = `${encoded}.${sign(encoded, secret)}`;

  const parts = [
    `${cookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${UNLOCK_TTL_SECONDS}`,
  ];
  if (isHttpsRequest(req)) {
    parts.push('Secure');
  }
  res.append('Set-Cookie', parts.join('; '));
}

export function getUnlockedNoteKeys(req: Request): Set<string> {
  return readSignedSetCookie(req, NOTE_UNLOCK_COOKIE);
}

export function addUnlockedNoteCookie(
  req: Request,
  res: Response,
  noteKey: string
): void {
  const current = getUnlockedNoteKeys(req);
  current.add(noteKey);
  writeSignedSetCookie(req, res, NOTE_UNLOCK_COOKIE, current);
}

export function removeUnlockedNoteCookie(
  req: Request,
  res: Response,
  noteKey: string
): void {
  const current = getUnlockedNoteKeys(req);
  if (current.delete(noteKey)) {
    writeSignedSetCookie(req, res, NOTE_UNLOCK_COOKIE, current);
  }
}

export function getUnlockedShareCodes(req: Request): Set<string> {
  return readSignedSetCookie(req, SHARE_UNLOCK_COOKIE);
}

export function addUnlockedShareCookie(
  req: Request,
  res: Response,
  code: string
): void {
  const current = getUnlockedShareCodes(req);
  current.add(code);
  writeSignedSetCookie(req, res, SHARE_UNLOCK_COOKIE, current);
}
