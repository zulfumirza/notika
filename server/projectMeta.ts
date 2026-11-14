import fs from 'node:fs/promises';
import path from 'node:path';
import {
  normalizeNoteColorId,
  normalizeNoteIconId,
  type NoteColorId,
  type NoteIconId,
} from '../shared/noteAppearance.ts';

const PROJECT_META_FILE = '.notika-projects.json';

export interface ProjectAppearance {
  icon?: NoteIconId;
  color?: NoteColorId;
}

export async function readProjectAppearanceMap(
  dataDir: string
): Promise<Record<string, ProjectAppearance>> {
  const filePath = path.join(dataDir, PROJECT_META_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, ProjectAppearance> = {};
    for (const [projectName, value] of Object.entries(parsed)) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        continue;
      }
      const record = value as { icon?: unknown; color?: unknown };
      const icon = normalizeNoteIconId(record.icon);
      const color = normalizeNoteColorId(record.color);
      if (icon || color) {
        out[projectName] = {
          ...(icon ? { icon } : {}),
          ...(color ? { color } : {}),
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function writeProjectAppearanceMap(
  dataDir: string,
  map: Record<string, ProjectAppearance>
): Promise<void> {
  const filePath = path.join(dataDir, PROJECT_META_FILE);
  await fs.writeFile(filePath, JSON.stringify(map, null, 2), 'utf8');
}

export async function setProjectAppearance(
  dataDir: string,
  projectName: string,
  appearance: { icon?: NoteIconId | null; color?: NoteColorId | null }
): Promise<ProjectAppearance> {
  const map = await readProjectAppearanceMap(dataDir);
  const existing = map[projectName] ?? {};

  const nextIcon =
    appearance.icon === undefined
      ? existing.icon
      : appearance.icon === null
        ? undefined
        : normalizeNoteIconId(appearance.icon);

  const nextColor =
    appearance.color === undefined
      ? existing.color
      : appearance.color === null
        ? undefined
        : normalizeNoteColorId(appearance.color);

  if (!nextIcon && !nextColor) {
    if (projectName in map) {
      delete map[projectName];
      await writeProjectAppearanceMap(dataDir, map);
    }
    return {};
  }

  const next: ProjectAppearance = {
    ...(nextIcon ? { icon: nextIcon } : {}),
    ...(nextColor ? { color: nextColor } : {}),
  };
  map[projectName] = next;
  await writeProjectAppearanceMap(dataDir, map);
  return next;
}

export async function relocateProjectAppearance(
  dataDir: string,
  oldName: string,
  newName: string
): Promise<void> {
  if (oldName === newName) return;
  const map = await readProjectAppearanceMap(dataDir);
  if (!(oldName in map)) return;
  const entry = map[oldName];
  delete map[oldName];
  if (entry) {
    map[newName] = entry;
  }
  await writeProjectAppearanceMap(dataDir, map);
}

export async function takeProjectAppearance(
  dataDir: string,
  projectName: string
): Promise<ProjectAppearance | undefined> {
  const map = await readProjectAppearanceMap(dataDir);
  const entry = map[projectName];
  if (!entry) return undefined;
  delete map[projectName];
  await writeProjectAppearanceMap(dataDir, map);
  return entry;
}

export async function restoreProjectAppearance(
  dataDir: string,
  projectName: string,
  appearance: ProjectAppearance
): Promise<void> {
  const icon = normalizeNoteIconId(appearance.icon);
  const color = normalizeNoteColorId(appearance.color);
  if (!icon && !color) return;
  const map = await readProjectAppearanceMap(dataDir);
  map[projectName] = {
    ...(icon ? { icon } : {}),
    ...(color ? { color } : {}),
  };
  await writeProjectAppearanceMap(dataDir, map);
}
