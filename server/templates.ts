import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { TemplateItem } from './types.ts';
import { VaultError, validateSafeName } from './vault.ts';

const TEMPLATES_DIR_NAME = 'templates';

const DEFAULT_TEMPLATES: Array<{ filename: string; content: string }> = [
  {
    filename: 'Toplanti-Notu.md',
    content: `---
tags: [meeting, notes]
date: {{date}}
status: draft
---

# {{title}}

## Katılımcılar
- 

## Gündem
1. 

## Kararlar ve Aksiyonlar
- [ ] 
`,
  },
  {
    filename: 'Proje-Ozeti.md',
    content: `---
tags: [project, spec]
created: {{date}}
owner: 
---

# {{title}}

## Amaç
Kısa proje hedefi ve kapsamı.

## Teknik Mimari
- Bileşenler:
- Bağımlılıklar:

## Yapılacaklar
- [ ] İlk adımı tanımla
`,
  },
];

async function ensureTemplatesDir(dataDir: string): Promise<string> {
  await fs.mkdir(dataDir, { recursive: true });
  const templatesDir = path.resolve(dataDir, TEMPLATES_DIR_NAME);
  const existed = fsSync.existsSync(templatesDir);
  await fs.mkdir(templatesDir, { recursive: true });

  if (!existed) {
    for (const tpl of DEFAULT_TEMPLATES) {
      const target = path.resolve(templatesDir, tpl.filename);
      await fs.writeFile(target, tpl.content, 'utf8');
    }
  }

  return templatesDir;
}

function assertInsideTemplatesDir(
  templatesDir: string,
  candidatePath: string
): void {
  const root = path.resolve(templatesDir);
  const candidate = path.resolve(candidatePath);
  if (candidate === root || !candidate.startsWith(root + path.sep)) {
    throw new VaultError('Geçersiz şablon yolu erişimi engellendi.', 400);
  }
}

function toTemplateMdName(rawName: unknown): string {
  const safe = validateSafeName(rawName, 'note');
  if (safe.toLowerCase().endsWith('.txt')) {
    return `${safe.slice(0, -4)}.md`;
  }
  return safe;
}

function stripExt(name: string): string {
  return name.toLowerCase().endsWith('.md') ? name.slice(0, -3) : name;
}

export async function listTemplates(dataDir: string): Promise<TemplateItem[]> {
  const templatesDir = await ensureTemplatesDir(dataDir);
  const entries = await fs.readdir(templatesDir, { withFileTypes: true });
  const items: TemplateItem[] = [];

  for (const entry of entries) {
    if (
      !entry.isFile() ||
      entry.name.startsWith('.') ||
      !entry.name.toLowerCase().endsWith('.md')
    ) {
      continue;
    }

    const filePath = path.resolve(templatesDir, entry.name);
    assertInsideTemplatesDir(templatesDir, filePath);
    const stat = await fs.stat(filePath);
    const content = await fs.readFile(filePath, 'utf8');

    items.push({
      name: entry.name,
      title: stripExt(entry.name),
      content,
      updatedAt: stat.mtime.toISOString(),
    });
  }

  items.sort((a, b) => a.title.localeCompare(b.title, 'tr'));
  return items;
}

export async function createOrSaveTemplate(
  dataDir: string,
  rawName: unknown,
  rawContent: unknown,
  options?: { previousName?: unknown; mustNotExist?: boolean }
): Promise<TemplateItem> {
  if (typeof rawContent !== 'string') {
    throw new VaultError('Şablon içeriği metin olmalıdır.', 400);
  }

  const templatesDir = await ensureTemplatesDir(dataDir);
  const safeName = toTemplateMdName(rawName);
  const targetPath = path.resolve(templatesDir, safeName);
  assertInsideTemplatesDir(templatesDir, targetPath);

  if (options?.mustNotExist && fsSync.existsSync(targetPath)) {
    throw new VaultError(`"${safeName}" adlı şablon zaten mevcut.`, 409);
  }

  if (typeof options?.previousName === 'string' && options.previousName.trim()) {
    const prevSafeName = toTemplateMdName(options.previousName);
    if (prevSafeName !== safeName) {
      const prevPath = path.resolve(templatesDir, prevSafeName);
      assertInsideTemplatesDir(templatesDir, prevPath);
      if (fsSync.existsSync(targetPath)) {
        throw new VaultError(`"${safeName}" adlı şablon zaten mevcut.`, 409);
      }
      if (fsSync.existsSync(prevPath)) {
        await fs.unlink(prevPath);
      }
    }
  }

  await fs.writeFile(targetPath, rawContent, 'utf8');
  const stat = await fs.stat(targetPath);

  return {
    name: safeName,
    title: stripExt(safeName),
    content: rawContent,
    updatedAt: stat.mtime.toISOString(),
  };
}

export async function deleteTemplate(
  dataDir: string,
  rawName: unknown
): Promise<void> {
  const templatesDir = await ensureTemplatesDir(dataDir);
  const safeName = toTemplateMdName(rawName);
  const targetPath = path.resolve(templatesDir, safeName);
  assertInsideTemplatesDir(templatesDir, targetPath);

  try {
    const stat = await fs.stat(targetPath);
    if (!stat.isFile()) {
      throw new VaultError('Şablon dosyası bulunamadı.', 404);
    }
  } catch (err: unknown) {
    if (err instanceof VaultError) throw err;
    throw new VaultError('Şablon dosyası bulunamadı.', 404);
  }

  await fs.unlink(targetPath);
}
