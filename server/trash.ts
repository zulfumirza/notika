import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  restoreNoteLockHash,
  restoreProjectLockHashes,
  takeNoteLockHash,
  takeProjectLockHashes,
} from './locks.ts';
import {
  restoreProjectAppearance,
  takeProjectAppearance,
  type ProjectAppearance,
} from './projectMeta.ts';
import type { TrashItem } from './types.ts';
import {
  VaultError,
  resolveNotePath,
  resolveProjectPath,
  validateSafeName,
} from './vault.ts';

const TRASH_DIR_NAME = '.trash';
const TRASH_ITEMS_DIR_NAME = 'items';
const MANIFEST_FILE_NAME = 'manifest.json';
const TRASH_ID_REGEX = /^[a-z0-9_-]{6,64}$/i;

interface StoredTrashItem extends TrashItem {
  lockHashes?: Record<string, string>;
  projectAppearance?: ProjectAppearance;
}

function getTrashDirs(dataDir: string): {
  trashDir: string;
  itemsDir: string;
  manifestPath: string;
} {
  const trashDir = path.resolve(dataDir, TRASH_DIR_NAME);
  const itemsDir = path.resolve(trashDir, TRASH_ITEMS_DIR_NAME);
  const manifestPath = path.resolve(trashDir, MANIFEST_FILE_NAME);
  return { trashDir, itemsDir, manifestPath };
}

async function ensureTrashDirs(dataDir: string): Promise<{
  trashDir: string;
  itemsDir: string;
  manifestPath: string;
}> {
  const dirs = getTrashDirs(dataDir);
  await fs.mkdir(dirs.itemsDir, { recursive: true });
  return dirs;
}

function toPublicTrashItem(record: StoredTrashItem): TrashItem {
  const {
    lockHashes: _lockHashes,
    projectAppearance: _projectAppearance,
    ...rest
  } = record;
  return rest;
}

async function readManifest(dataDir: string): Promise<StoredTrashItem[]> {
  const { manifestPath } = getTrashDirs(dataDir);
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is StoredTrashItem => {
      if (typeof entry !== 'object' || entry === null) return false;
      const item = entry as Partial<StoredTrashItem>;
      return (
        typeof item.id === 'string' &&
        TRASH_ID_REGEX.test(item.id) &&
        (item.kind === 'note' || item.kind === 'project') &&
        typeof item.name === 'string' &&
        typeof item.title === 'string' &&
        typeof item.project === 'string' &&
        typeof item.deletedAt === 'string' &&
        typeof item.size === 'number'
      );
    });
  } catch {
    return [];
  }
}

async function writeManifest(
  dataDir: string,
  items: StoredTrashItem[]
): Promise<void> {
  const { manifestPath } = await ensureTrashDirs(dataDir);
  await fs.writeFile(manifestPath, JSON.stringify(items, null, 2), 'utf8');
}

function generateTrashId(): string {
  return `${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
}

function assertTrashItemPath(itemsDir: string, id: string): string {
  if (!TRASH_ID_REGEX.test(id)) {
    throw new VaultError('Geçersiz çöp kutusu öğe kimliği.', 400);
  }
  const normalizedItems = path.resolve(itemsDir);
  const candidate = path.resolve(normalizedItems, id);
  if (!candidate.startsWith(normalizedItems + path.sep)) {
    throw new VaultError('Geçersiz çöp kutusu yolu engellendi.', 400);
  }
  return candidate;
}

function stripExt(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.md')) return fileName.slice(0, -3);
  if (lower.endsWith('.txt')) return fileName.slice(0, -4);
  return fileName;
}

function splitNoteExt(fileName: string): { base: string; ext: '.md' | '.txt' } {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.txt')) {
    return { base: fileName.slice(0, -4), ext: '.txt' };
  }
  if (lower.endsWith('.md')) {
    return { base: fileName.slice(0, -3), ext: '.md' };
  }
  return { base: fileName, ext: '.md' };
}

async function moveFsEntry(source: string, dest: string): Promise<void> {
  try {
    await fs.rename(source, dest);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EXDEV') {
      await fs.cp(source, dest, { recursive: true });
      await fs.rm(source, { recursive: true, force: true });
      return;
    }
    throw err;
  }
}

async function computeDirectoryStats(
  dirPath: string
): Promise<{ totalBytes: number; noteCount: number }> {
  let totalBytes = 0;
  let noteCount = 0;
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const sub = await computeDirectoryStats(fullPath);
      totalBytes += sub.totalBytes;
      noteCount += sub.noteCount;
    } else if (entry.isFile()) {
      const stat = await fs.stat(fullPath);
      totalBytes += stat.size;
      const lower = entry.name.toLowerCase();
      if (lower.endsWith('.md') || lower.endsWith('.txt')) {
        noteCount += 1;
      }
    }
  }
  return { totalBytes, noteCount };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function listTrash(dataDir: string): Promise<TrashItem[]> {
  const items = await readManifest(dataDir);
  return items
    .map(toPublicTrashItem)
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export async function moveNoteToTrash(
  dataDir: string,
  rawProject: unknown,
  rawNote: unknown
): Promise<TrashItem> {
  const { projectName, noteName, notePath } = await resolveNotePath(
    dataDir,
    rawProject,
    rawNote
  );

  let stat;
  try {
    stat = await fs.stat(notePath);
    if (!stat.isFile()) {
      throw new VaultError('Not dosyası bulunamadı.', 404);
    }
  } catch (err: unknown) {
    if (err instanceof VaultError) throw err;
    throw new VaultError('Not dosyası bulunamadı.', 404);
  }

  const { itemsDir } = await ensureTrashDirs(dataDir);
  const id = generateTrashId();
  const itemContainer = assertTrashItemPath(itemsDir, id);
  await fs.mkdir(itemContainer, { recursive: true });
  const trashedFilePath = path.resolve(itemContainer, noteName);

  await moveFsEntry(notePath, trashedFilePath);
  const lockHash = await takeNoteLockHash(dataDir, projectName, noteName);

  const record: StoredTrashItem = {
    id,
    kind: 'note',
    name: noteName,
    title: stripExt(noteName),
    project: projectName,
    deletedAt: new Date().toISOString(),
    size: stat.size,
    ...(lockHash ? { lockHashes: { [noteName]: lockHash } } : {}),
  };

  const manifest = await readManifest(dataDir);
  manifest.unshift(record);
  await writeManifest(dataDir, manifest);
  return toPublicTrashItem(record);
}

export async function moveProjectToTrash(
  dataDir: string,
  rawProject: unknown
): Promise<TrashItem> {
  const { projectName, projectPath } = await resolveProjectPath(
    dataDir,
    rawProject
  );

  try {
    const stat = await fs.stat(projectPath);
    if (!stat.isDirectory()) {
      throw new VaultError('Proje klasörü bulunamadı.', 404);
    }
  } catch (err: unknown) {
    if (err instanceof VaultError) throw err;
    throw new VaultError('Proje klasörü bulunamadı.', 404);
  }

  const stats = await computeDirectoryStats(projectPath);
  const { itemsDir } = await ensureTrashDirs(dataDir);
  const id = generateTrashId();
  const itemContainer = assertTrashItemPath(itemsDir, id);
  await fs.mkdir(itemContainer, { recursive: true });
  const trashedProjectPath = path.resolve(itemContainer, projectName);

  await moveFsEntry(projectPath, trashedProjectPath);
  const lockHashes = await takeProjectLockHashes(dataDir, projectName);
  const projectAppearance = await takeProjectAppearance(dataDir, projectName);

  const record: StoredTrashItem = {
    id,
    kind: 'project',
    name: projectName,
    title: projectName,
    project: projectName,
    deletedAt: new Date().toISOString(),
    size: stats.totalBytes,
    noteCount: stats.noteCount,
    ...(Object.keys(lockHashes).length > 0 ? { lockHashes } : {}),
    ...(projectAppearance ? { projectAppearance } : {}),
  };

  const manifest = await readManifest(dataDir);
  manifest.unshift(record);
  await writeManifest(dataDir, manifest);
  return toPublicTrashItem(record);
}

export async function restoreTrashItem(
  dataDir: string,
  rawId: unknown
): Promise<{
  item: TrashItem;
  restoredProject: string;
  restoredNote?: string;
}> {
  if (typeof rawId !== 'string' || !TRASH_ID_REGEX.test(rawId)) {
    throw new VaultError('Geçersiz çöp kutusu öğe kimliği.', 400);
  }

  const manifest = await readManifest(dataDir);
  const idx = manifest.findIndex((entry) => entry.id === rawId);
  if (idx === -1 || !manifest[idx]) {
    throw new VaultError('Çöp kutusu öğesi bulunamadı.', 404);
  }

  const record = manifest[idx];
  const { itemsDir } = await ensureTrashDirs(dataDir);
  const itemContainer = assertTrashItemPath(itemsDir, record.id);

  if (record.kind === 'note') {
    const safeProject = validateSafeName(record.project, 'project');
    const safeNote = validateSafeName(record.name, 'note');
    const sourcePath = path.resolve(itemContainer, safeNote);
    if (!(await pathExists(sourcePath))) {
      manifest.splice(idx, 1);
      await writeManifest(dataDir, manifest);
      throw new VaultError('Çöp kutusundaki not dosyası artık mevcut değil.', 404);
    }

    const { projectPath } = await resolveProjectPath(dataDir, safeProject);
    await fs.mkdir(projectPath, { recursive: true });

    let targetNoteName = safeNote;
    let targetNoteResolved = await resolveNotePath(
      dataDir,
      safeProject,
      targetNoteName
    );

    if (await pathExists(targetNoteResolved.notePath)) {
      const { base, ext } = splitNoteExt(safeNote);
      let attempt = 1;
      while (await pathExists(targetNoteResolved.notePath)) {
        const suffix = attempt === 1 ? ' (restored)' : ` (restored ${attempt})`;
        targetNoteName = validateSafeName(`${base}${suffix}${ext}`, 'note');
        targetNoteResolved = await resolveNotePath(
          dataDir,
          safeProject,
          targetNoteName
        );
        attempt += 1;
      }
    }

    await moveFsEntry(sourcePath, targetNoteResolved.notePath);
    await fs.rm(itemContainer, { recursive: true, force: true });

    const originalLockHash = record.lockHashes?.[record.name];
    if (originalLockHash) {
      await restoreNoteLockHash(
        dataDir,
        safeProject,
        targetNoteName,
        originalLockHash
      );
    }

    manifest.splice(idx, 1);
    await writeManifest(dataDir, manifest);

    return {
      item: toPublicTrashItem(record),
      restoredProject: safeProject,
      restoredNote: targetNoteName,
    };
  }

  // Restore project folder
  const safeProject = validateSafeName(record.name, 'project');
  const sourcePath = path.resolve(itemContainer, safeProject);
  if (!(await pathExists(sourcePath))) {
    manifest.splice(idx, 1);
    await writeManifest(dataDir, manifest);
    throw new VaultError('Çöp kutusundaki proje klasörü artık mevcut değil.', 404);
  }

  let targetProjectName = safeProject;
  let targetResolved = await resolveProjectPath(dataDir, targetProjectName);
  if (await pathExists(targetResolved.projectPath)) {
    let attempt = 1;
    while (await pathExists(targetResolved.projectPath)) {
      const suffix = attempt === 1 ? ' (restored)' : ` (restored ${attempt})`;
      targetProjectName = validateSafeName(`${safeProject}${suffix}`, 'project');
      targetResolved = await resolveProjectPath(dataDir, targetProjectName);
      attempt += 1;
    }
  }

  await moveFsEntry(sourcePath, targetResolved.projectPath);
  await fs.rm(itemContainer, { recursive: true, force: true });

  if (record.lockHashes) {
    await restoreProjectLockHashes(
      dataDir,
      targetProjectName,
      record.lockHashes
    );
  }
  if (record.projectAppearance) {
    await restoreProjectAppearance(
      dataDir,
      targetProjectName,
      record.projectAppearance
    );
  }

  manifest.splice(idx, 1);
  await writeManifest(dataDir, manifest);

  return {
    item: toPublicTrashItem(record),
    restoredProject: targetProjectName,
  };
}

export async function purgeTrashItem(
  dataDir: string,
  rawId: unknown
): Promise<void> {
  if (typeof rawId !== 'string' || !TRASH_ID_REGEX.test(rawId)) {
    throw new VaultError('Geçersiz çöp kutusu öğe kimliği.', 400);
  }

  const manifest = await readManifest(dataDir);
  const idx = manifest.findIndex((entry) => entry.id === rawId);
  if (idx === -1 || !manifest[idx]) {
    throw new VaultError('Çöp kutusu öğesi bulunamadı.', 404);
  }

  const { itemsDir } = getTrashDirs(dataDir);
  const itemContainer = assertTrashItemPath(itemsDir, manifest[idx].id);
  await fs.rm(itemContainer, { recursive: true, force: true });

  manifest.splice(idx, 1);
  await writeManifest(dataDir, manifest);
}

export async function emptyTrash(dataDir: string): Promise<void> {
  const { itemsDir } = getTrashDirs(dataDir);
  await fs.rm(itemsDir, { recursive: true, force: true });
  await writeManifest(dataDir, []);
}
