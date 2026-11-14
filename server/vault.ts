import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import type {
  NoteDocument,
  NoteMeta,
  ProjectTreeItem,
  SearchResultItem,
} from './types.ts';

export class VaultError extends Error {
  public readonly statusCode: number;

  public constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'VaultError';
    this.statusCode = statusCode;
  }
}

const INVALID_CHARS_REGEX = /[<>:"/\\|?*\x00-\x1F]/;
const WINDOWS_RESERVED_REGEX = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
const MAX_NAME_LENGTH = 120;

export function getDataDir(): string {
  const configured = process.env.DATA_DIR?.trim();
  return path.resolve(configured && configured.length > 0 ? configured : './data');
}

export async function ensureDataDir(dataDir: string): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  const seededMarker = path.join(dataDir, '.notika-seeded');

  if (!fsSync.existsSync(seededMarker)) {
    const notikaProject = path.join(dataDir, 'Notika');
    await fs.mkdir(notikaProject, { recursive: true });

    const welcomeContent = `# Notika'ya Hoş Geldiniz

**Notika**, Obsidian mantığında çalışan, veritabanı gerektirmeyen, tamamen yerel dosya sistemi tabanlı ve self-host edilebilir açık kaynak not çalışma alanınızdır.

Tüm projeleriniz \`DATA_DIR\` altında gerçek klasörler, tüm notlarınız ise gerçek \`.md\` ve \`.txt\` dosyaları olarak saklanır.

## Temel Yetenekler

- **Normal ve Markdown Modu:** Markdown sözdizimi bilmeden araç çubuklu **Normal** editörde yazabilir veya tek tıkla **Markdown**, **Yan Yana** ve **Önizleme** modlarına geçebilirsiniz.
- **Kısa Paylaşım Linki ve Davet:** Herhangi bir not için kısa \`/s/...\` paylaşım bağlantısı oluşturun veya belirli bir kişiyi salt okunur / düzenleyici rolüyle notunuza davet edin.
- **MCP Desteği (Model Context Protocol):** Claude Desktop, Cursor ve uyumlu yapay zeka araçlarını \`/api/mcp\` üzerinden doğrudan not kasanıza bağlayın.
- **10 Dil Desteği ve %100 Mobil Uyum:** Türkçe, İngilizce, Almanca, Fransızca, İspanyolca, Portekizce, Rusça, Arapça, Japonca ve Çince arayüz; telefon, tablet ve masaüstünde kesintisiz deneyim.

- [x] Yerel dosya sistemi kasasını başlat
- [x] Path Traversal ve HMAC oturum güvenliğini etkinleştir
- [ ] İlk proje notunuzu oluşturun
`;

    const howToUseContent = `# Nasıl Kullanılır?

## 1. Proje ve Not Oluşturma

1. Sol menüdeki **Yeni** butonuna tıklayarak yeni bir proje klasörü oluşturun.
2. Proje satırının üzerine gelerek **Yeni Not** simgesine tıklayın.
3. Dosya adı sonuna \`.txt\` yazarsanız düz metin notu, uzantı yazmazsanız veya \`.md\` yazarsanız Markdown notu oluşturulur.

## 2. Yazım Modları

- **Normal:** Başlık, kalın, italik, liste, görev kutusu, alıntı ve bağlantı araç çubuğuyla doğrudan görsel editör.
- **Markdown:** Saf monospace Markdown kaynak editörü (\`Tab\` tuşu 2 boşluk ekler).
- **Yan Yana:** Sol tarafta Markdown yazarken sağ tarafta canlı GFM + kod renklendirmeli önizlemeyi görün.
- **Önizleme:** Okuma odaklı tam ekran görünüm.

## 3. Kısa Paylaşım Linki ve Davet Etme

- Editörün sağ üstündeki **Paylaş** butonuna tıklayın.
- **Kısa Link Oluştur** sekmesinden salt okunur veya düzenlenebilir kısa bağlantı üretin.
- **Kişi Davet Et** sekmesinden davet edeceğiniz kişinin adını/e-postasını ve yetkisini seçerek kişisel davet linki oluşturun; istediğiniz zaman erişimi iptal edebilirsiniz.

## 4. MCP Entegrasyonu (AI İstemcileri)

Sol alt menüdeki **Ayarlar** bölümünden **MCP Token** bilginizi ve hazır JSON yapılandırmasını kopyalayarak Claude Desktop veya Cursor üzerinden notlarınızı okuyabilir, arayabilir ve güncelleyebilirsiniz.

| Kısayol | İşlev |
| :--- | :--- |
| \`Ctrl / Cmd + K\` | Tüm projelerde anlık arama |
| \`Ctrl / Cmd + S\` | Aktif notu anında diske kaydetme |
| \`Tab\` | Markdown editöründe girinti ekleme |
`;

    const licenseContent = `# MIT Lisansı (MIT License)

Copyright (c) 2026 Notika Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

    const publisherNoteContent = `# Yayıncının Notu

Merhaba,

**Notika**'yı geliştirirken temel amacımız şuydu: *Notlarınız sizin kendi diskinizde, açık ve taşınabilir formatlarda (\`.md\` ve \`.txt\`) kalmalı; hiçbir kapalı veritabanına veya bulut platformuna kilitlenmemelisiniz.*

İster tek başınıza günlük mühendislik notları tutun, ister ekibinizle kısa paylaşım linkleri üzerinden belirli bir not üzerinde birlikte çalışın, ister MCP protokolü ile kendi yapay zeka asistanınızı yerel kasanıza bağlayın — tüm kontrol tamamen sizde.

Notika tamamen açık kaynaklıdır ve MIT lisansı ile sunulmaktadır. Geri bildirimleriniz, hata bildirimleriniz ve katkılarınız projeyi büyütmeye devam edecektir.

İyi üretimler!
— **Notika Ekibi**
`;

    await fs.writeFile(
      path.join(notikaProject, '01-Hos-Geldiniz.md'),
      welcomeContent,
      'utf8'
    );
    await fs.writeFile(
      path.join(notikaProject, '02-Nasil-Kullanilir.md'),
      howToUseContent,
      'utf8'
    );
    await fs.writeFile(
      path.join(notikaProject, '03-Lisans.md'),
      licenseContent,
      'utf8'
    );
    await fs.writeFile(
      path.join(notikaProject, '04-Yayincinin-Notu.md'),
      publisherNoteContent,
      'utf8'
    );

    await fs.writeFile(seededMarker, new Date().toISOString(), 'utf8');
  }
}

export function validateSafeName(rawName: unknown, kind: 'project' | 'note'): string {
  if (typeof rawName !== 'string') {
    throw new VaultError('Geçersiz isim formatı.', 400);
  }

  let normalized = rawName.trim();
  let noteExt: '.md' | '.txt' = '.md';

  if (kind === 'note') {
    if (normalized.toLowerCase().endsWith('.txt')) {
      normalized = normalized.slice(0, -4).trim();
      noteExt = '.txt';
    } else if (normalized.toLowerCase().endsWith('.md')) {
      normalized = normalized.slice(0, -3).trim();
      noteExt = '.md';
    }
  }

  if (normalized.length === 0) {
    throw new VaultError(
      kind === 'project' ? 'Proje adı boş olamaz.' : 'Not adı boş olamaz.',
      400
    );
  }

  if (normalized.length > MAX_NAME_LENGTH) {
    throw new VaultError(
      `İsim en fazla ${MAX_NAME_LENGTH} karakter olabilir.`,
      400
    );
  }

  if (
    normalized.startsWith('.') ||
    normalized.endsWith('.') ||
    normalized.includes('..') ||
    INVALID_CHARS_REGEX.test(normalized)
  ) {
    throw new VaultError(
      'İsim geçersiz karakterler içeriyor (/, \\, .. veya nokta ile başlama/bitme yasaktır).',
      400
    );
  }

  if (WINDOWS_RESERVED_REGEX.test(normalized)) {
    throw new VaultError('Bu isim sistem tarafından rezerve edilmiştir.', 400);
  }

  return kind === 'note' ? `${normalized}${noteExt}` : normalized;
}

function assertInsideRoot(rootDir: string, candidatePath: string): void {
  const normalizedRoot = path.resolve(rootDir);
  const resolvedCandidate = path.resolve(candidatePath);

  if (
    resolvedCandidate === normalizedRoot ||
    !resolvedCandidate.startsWith(normalizedRoot + path.sep)
  ) {
    throw new VaultError('Geçersiz dosya yolu erişimi engellendi.', 400);
  }
}

async function assertRealPathInsideRoot(
  rootDir: string,
  targetPath: string
): Promise<void> {
  const realRoot = await fs.realpath(rootDir);
  try {
    const realTarget = await fs.realpath(targetPath);
    if (
      realTarget === realRoot ||
      !realTarget.startsWith(realRoot + path.sep)
    ) {
      throw new VaultError('Sembolik bağ ile dizin dışına çıkış engellendi.', 400);
    }
  } catch (err: unknown) {
    if (err instanceof VaultError) {
      throw err;
    }
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      throw err;
    }
  }
}

export async function resolveProjectPath(
  dataDir: string,
  rawProject: unknown
): Promise<{ projectName: string; projectPath: string }> {
  const projectName = validateSafeName(rawProject, 'project');
  const projectPath = path.resolve(dataDir, projectName);
  assertInsideRoot(dataDir, projectPath);
  await assertRealPathInsideRoot(dataDir, projectPath);
  return { projectName, projectPath };
}

export async function resolveNotePath(
  dataDir: string,
  rawProject: unknown,
  rawNote: unknown
): Promise<{ projectName: string; noteName: string; projectPath: string; notePath: string }> {
  const { projectName, projectPath } = await resolveProjectPath(dataDir, rawProject);
  const noteName = validateSafeName(rawNote, 'note');
  const notePath = path.resolve(projectPath, noteName);
  assertInsideRoot(projectPath, notePath);
  await assertRealPathInsideRoot(dataDir, notePath);
  return { projectName, noteName, projectPath, notePath };
}

function isSupportedNoteFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.txt');
}

function stripMdExtension(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.md')) return fileName.slice(0, -3);
  if (lower.endsWith('.txt')) return fileName.slice(0, -4);
  return fileName;
}

export async function listVaultTree(dataDir: string): Promise<ProjectTreeItem[]> {
  await fs.mkdir(dataDir, { recursive: true });
  const entries = await fs.readdir(dataDir, { withFileTypes: true });
  const projects: ProjectTreeItem[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      continue;
    }

    const projectPath = path.resolve(dataDir, entry.name);
    assertInsideRoot(dataDir, projectPath);

    const dirStat = await fs.stat(projectPath);
    const noteEntries = await fs.readdir(projectPath, { withFileTypes: true });
    const notes: NoteMeta[] = [];

    for (const noteEntry of noteEntries) {
      if (
        !noteEntry.isFile() ||
        noteEntry.name.startsWith('.') ||
        !isSupportedNoteFile(noteEntry.name)
      ) {
        continue;
      }

      const notePath = path.resolve(projectPath, noteEntry.name);
      assertInsideRoot(projectPath, notePath);
      const stat = await fs.stat(notePath);

      notes.push({
        name: noteEntry.name,
        title: stripMdExtension(noteEntry.name),
        project: entry.name,
        updatedAt: stat.mtime.toISOString(),
        size: stat.size,
      });
    }

    notes.sort((a, b) => a.title.localeCompare(b.title, 'tr'));

    const latestNoteUpdate = notes.reduce((latest, note) => {
      return note.updatedAt > latest ? note.updatedAt : latest;
    }, dirStat.mtime.toISOString());

    projects.push({
      name: entry.name,
      noteCount: notes.length,
      updatedAt: latestNoteUpdate,
      notes,
    });
  }

  projects.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  return projects;
}

export async function createProject(
  dataDir: string,
  rawName: unknown
): Promise<ProjectTreeItem> {
  const { projectName, projectPath } = await resolveProjectPath(dataDir, rawName);

  try {
    await fs.access(projectPath);
    throw new VaultError(`"${projectName}" adlı proje zaten mevcut.`, 409);
  } catch (err: unknown) {
    if (err instanceof VaultError) {
      throw err;
    }
  }

  await fs.mkdir(projectPath, { recursive: false });
  const stat = await fs.stat(projectPath);

  return {
    name: projectName,
    noteCount: 0,
    updatedAt: stat.mtime.toISOString(),
    notes: [],
  };
}

export async function renameProject(
  dataDir: string,
  rawCurrentName: unknown,
  rawNewName: unknown
): Promise<{ oldName: string; newName: string }> {
  const current = await resolveProjectPath(dataDir, rawCurrentName);
  const next = await resolveProjectPath(dataDir, rawNewName);

  try {
    const stat = await fs.stat(current.projectPath);
    if (!stat.isDirectory()) {
      throw new VaultError('Proje klasörü bulunamadı.', 404);
    }
  } catch (err: unknown) {
    if (err instanceof VaultError) throw err;
    throw new VaultError('Proje klasörü bulunamadı.', 404);
  }

  if (current.projectName === next.projectName) {
    return { oldName: current.projectName, newName: next.projectName };
  }

  try {
    await fs.access(next.projectPath);
    throw new VaultError(`"${next.projectName}" adlı proje zaten mevcut.`, 409);
  } catch (err: unknown) {
    if (err instanceof VaultError) throw err;
  }

  await fs.rename(current.projectPath, next.projectPath);
  return { oldName: current.projectName, newName: next.projectName };
}

export async function deleteProject(
  dataDir: string,
  rawName: unknown
): Promise<void> {
  const { projectPath } = await resolveProjectPath(dataDir, rawName);

  try {
    const stat = await fs.stat(projectPath);
    if (!stat.isDirectory()) {
      throw new VaultError('Proje klasörü bulunamadı.', 404);
    }
  } catch (err: unknown) {
    if (err instanceof VaultError) throw err;
    throw new VaultError('Proje klasörü bulunamadı.', 404);
  }

  await fs.rm(projectPath, { recursive: true, force: false });
}

export async function readNote(
  dataDir: string,
  rawProject: unknown,
  rawNote: unknown
): Promise<NoteDocument> {
  const { projectName, noteName, notePath } = await resolveNotePath(
    dataDir,
    rawProject,
    rawNote
  );

  try {
    const stat = await fs.stat(notePath);
    if (!stat.isFile()) {
      throw new VaultError('Not dosyası bulunamadı.', 404);
    }
    const content = await fs.readFile(notePath, 'utf8');
    return {
      project: projectName,
      name: noteName,
      title: stripMdExtension(noteName),
      content,
      updatedAt: stat.mtime.toISOString(),
      size: stat.size,
    };
  } catch (err: unknown) {
    if (err instanceof VaultError) throw err;
    throw new VaultError('Not dosyası bulunamadı.', 404);
  }
}

export async function createNote(
  dataDir: string,
  rawProject: unknown,
  rawNote: unknown,
  initialContent?: unknown
): Promise<NoteDocument> {
  const { projectName, noteName, projectPath, notePath } = await resolveNotePath(
    dataDir,
    rawProject,
    rawNote
  );

  try {
    const dirStat = await fs.stat(projectPath);
    if (!dirStat.isDirectory()) {
      throw new VaultError('Hedef proje klasörü bulunamadı.', 404);
    }
  } catch (err: unknown) {
    if (err instanceof VaultError) throw err;
    throw new VaultError('Hedef proje klasörü bulunamadı.', 404);
  }

  try {
    await fs.access(notePath);
    throw new VaultError(`"${noteName}" adlı not zaten mevcut.`, 409);
  } catch (err: unknown) {
    if (err instanceof VaultError) throw err;
  }

  const title = stripMdExtension(noteName);
  const isTxt = noteName.toLowerCase().endsWith('.txt');
  const content =
    typeof initialContent === 'string'
      ? initialContent
      : isTxt
        ? `${title}\n\n`
        : `# ${title}\n\n`;

  await fs.writeFile(notePath, content, 'utf8');
  const stat = await fs.stat(notePath);

  return {
    project: projectName,
    name: noteName,
    title,
    content,
    updatedAt: stat.mtime.toISOString(),
    size: stat.size,
  };
}

export async function saveNote(
  dataDir: string,
  rawProject: unknown,
  rawNote: unknown,
  content: unknown
): Promise<NoteDocument> {
  if (typeof content !== 'string') {
    throw new VaultError('Not içeriği metin formatında olmalıdır.', 400);
  }

  const { projectName, noteName, notePath } = await resolveNotePath(
    dataDir,
    rawProject,
    rawNote
  );

  try {
    const stat = await fs.stat(notePath);
    if (!stat.isFile()) {
      throw new VaultError('Kaydedilecek not dosyası bulunamadı.', 404);
    }
  } catch (err: unknown) {
    if (err instanceof VaultError) throw err;
    throw new VaultError('Kaydedilecek not dosyası bulunamadı.', 404);
  }

  await fs.writeFile(notePath, content, 'utf8');
  const stat = await fs.stat(notePath);

  return {
    project: projectName,
    name: noteName,
    title: stripMdExtension(noteName),
    content,
    updatedAt: stat.mtime.toISOString(),
    size: stat.size,
  };
}

export async function renameNote(
  dataDir: string,
  rawProject: unknown,
  rawCurrentNote: unknown,
  rawNewNote: unknown
): Promise<NoteMeta> {
  const current = await resolveNotePath(dataDir, rawProject, rawCurrentNote);
  const next = await resolveNotePath(dataDir, rawProject, rawNewNote);

  try {
    const stat = await fs.stat(current.notePath);
    if (!stat.isFile()) {
      throw new VaultError('Not dosyası bulunamadı.', 404);
    }
  } catch (err: unknown) {
    if (err instanceof VaultError) throw err;
    throw new VaultError('Not dosyası bulunamadı.', 404);
  }

  if (current.noteName !== next.noteName) {
    try {
      await fs.access(next.notePath);
      throw new VaultError(`"${next.noteName}" adlı not zaten mevcut.`, 409);
    } catch (err: unknown) {
      if (err instanceof VaultError) throw err;
    }

    await fs.rename(current.notePath, next.notePath);
  }

  const stat = await fs.stat(next.notePath);
  return {
    name: next.noteName,
    title: stripMdExtension(next.noteName),
    project: next.projectName,
    updatedAt: stat.mtime.toISOString(),
    size: stat.size,
  };
}

export async function deleteNote(
  dataDir: string,
  rawProject: unknown,
  rawNote: unknown
): Promise<void> {
  const { notePath } = await resolveNotePath(dataDir, rawProject, rawNote);

  try {
    const stat = await fs.stat(notePath);
    if (!stat.isFile()) {
      throw new VaultError('Not dosyası bulunamadı.', 404);
    }
  } catch (err: unknown) {
    if (err instanceof VaultError) throw err;
    throw new VaultError('Not dosyası bulunamadı.', 404);
  }

  await fs.unlink(notePath);
}

function buildSnippet(content: string, queryLower: string): { snippet: string; matchCount: number } {
  const lines = content.split(/\r?\n/);
  let firstMatchLine = '';
  let matchCount = 0;

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    let idx = lowerLine.indexOf(queryLower);
    if (idx !== -1 && firstMatchLine.length === 0) {
      firstMatchLine = line.trim();
    }
    while (idx !== -1) {
      matchCount += 1;
      idx = lowerLine.indexOf(queryLower, idx + queryLower.length);
    }
  }

  if (firstMatchLine.length > 0) {
    const trimmed =
      firstMatchLine.length > 140
        ? `${firstMatchLine.slice(0, 140)}…`
        : firstMatchLine;
    return { snippet: trimmed, matchCount };
  }

  const previewLine =
    lines.find((line) => line.trim().length > 0)?.trim() ?? '';
  return {
    snippet:
      previewLine.length > 140 ? `${previewLine.slice(0, 140)}…` : previewLine,
    matchCount: 0,
  };
}

export async function searchNotes(
  dataDir: string,
  rawQuery: string
): Promise<SearchResultItem[]> {
  const query = rawQuery.trim();
  const tree = await listVaultTree(dataDir);

  if (query.length === 0) {
    const recent: SearchResultItem[] = [];
    for (const project of tree) {
      for (const note of project.notes) {
        recent.push({
          project: project.name,
          name: note.name,
          title: note.title,
          updatedAt: note.updatedAt,
          matchType: 'title',
          snippet: `${project.name} klasöründeki not`,
          matchCount: 0,
        });
      }
    }
    recent.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return recent.slice(0, 20);
  }

  const queryLower = query.toLowerCase();
  const results: SearchResultItem[] = [];

  for (const project of tree) {
    for (const note of project.notes) {
      const notePath = path.resolve(dataDir, project.name, note.name);
      assertInsideRoot(dataDir, notePath);

      const content = await fs.readFile(notePath, 'utf8');
      const titleMatch =
        note.title.toLowerCase().includes(queryLower) ||
        project.name.toLowerCase().includes(queryLower);

      const { snippet, matchCount } = buildSnippet(content, queryLower);
      const contentMatch = matchCount > 0;

      if (titleMatch || contentMatch) {
        results.push({
          project: project.name,
          name: note.name,
          title: note.title,
          updatedAt: note.updatedAt,
          matchType:
            titleMatch && contentMatch
              ? 'both'
              : titleMatch
                ? 'title'
                : 'content',
          snippet: snippet || `${project.name} / ${note.title}`,
          matchCount: matchCount + (titleMatch ? 1 : 0),
        });
      }
    }
  }

  results.sort((a, b) => {
    if (b.matchCount !== a.matchCount) {
      return b.matchCount - a.matchCount;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  return results.slice(0, 50);
}
