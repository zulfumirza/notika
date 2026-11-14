import crypto from 'node:crypto';
import express from 'express';
import type { Request, Response } from 'express';
import { isNoteLocked } from './locks.ts';
import { getAppSettings } from './shares.ts';
import {
  VaultError,
  createNote,
  listVaultTree,
  readNote,
  resolveNotePath,
  saveNote,
  searchNotes,
} from './vault.ts';

interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

function getObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function verifyBearerToken(headerValue: string | undefined, expected: string): boolean {
  if (!headerValue) return false;
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  const provided = match?.[1]?.trim();
  if (!provided) return false;

  const providedHash = crypto.createHash('sha256').update(provided).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

const MCP_TOOLS = [
  {
    name: 'list_projects',
    description: 'Notika kasasındaki tüm proje klasörlerini ve not sayılarını listeler.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'list_notes',
    description: 'Belirli bir proje klasöründeki tüm .md ve .txt notlarını listeler.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Proje klasörü adı' },
      },
      required: ['project'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_note',
    description: 'Bir projenin içindeki not dosyasının tam içeriğini okur.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Proje klasörü adı' },
        note: { type: 'string', description: 'Not dosyası adı (.md veya .txt)' },
      },
      required: ['project', 'note'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_note',
    description: 'Belirtilen proje klasörü altında yeni bir not oluşturur.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Proje klasörü adı' },
        name: { type: 'string', description: 'Yeni not adı' },
        content: { type: 'string', description: 'Başlangıç içeriği' },
      },
      required: ['project', 'name'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_note',
    description: 'Mevcut bir notun içeriğini günceller.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Proje klasörü adı' },
        note: { type: 'string', description: 'Not dosyası adı' },
        content: { type: 'string', description: 'Yeni not içeriği' },
      },
      required: ['project', 'note', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_notes',
    description: 'Tüm projelerdeki not başlıklarında ve içeriklerinde tam metin araması yapar.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Arama sorgusu' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
];

export function createMcpRouter(dataDir: string): express.Router {
  const router = express.Router();

  router.get('/', async (_req: Request, res: Response) => {
    const settings = await getAppSettings(dataDir);
    res.json({
      name: 'notika-mcp',
      version: '1.0.0',
      protocolVersion: '2024-11-05',
      enabled: settings.mcpEnabled,
      transport: 'streamable-http-jsonrpc',
      tools: MCP_TOOLS.map((t) => t.name),
    });
  });

  router.post('/', async (req: Request, res: Response) => {
    const settings = await getAppSettings(dataDir);
    if (!settings.mcpEnabled) {
      res.status(403).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'MCP sunucusu ayarlar üzerinden devre dışı bırakılmış.' },
      });
      return;
    }

    const activeToken = process.env.MCP_TOKEN?.trim() || settings.mcpToken;
    if (!verifyBearerToken(req.headers.authorization, activeToken)) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32002, message: 'Geçersiz veya eksik MCP Bearer Token.' },
      });
      return;
    }

    const body = (typeof req.body === 'object' && req.body !== null
      ? req.body
      : {}) as JsonRpcRequest;
    const id = body.id ?? null;
    const method = typeof body.method === 'string' ? body.method : '';
    const params = getObject(body.params);

    try {
      if (method === 'initialize') {
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: false, listChanged: false },
            },
            serverInfo: {
              name: 'notika-mcp',
              version: '1.0.0',
            },
          },
        });
        return;
      }

      if (method === 'notifications/initialized') {
        res.status(204).end();
        return;
      }

      if (method === 'ping') {
        res.json({ jsonrpc: '2.0', id, result: {} });
        return;
      }

      if (method === 'tools/list') {
        res.json({
          jsonrpc: '2.0',
          id,
          result: { tools: MCP_TOOLS },
        });
        return;
      }

      if (method === 'resources/list') {
        const tree = await listVaultTree(dataDir);
        const resources = tree.flatMap((project) =>
          project.notes.map((note) => ({
            uri: `notika://${encodeURIComponent(project.name)}/${encodeURIComponent(note.name)}`,
            name: `${project.name} / ${note.title}`,
            mimeType: note.name.toLowerCase().endsWith('.txt')
              ? 'text/plain'
              : 'text/markdown',
          }))
        );
        res.json({
          jsonrpc: '2.0',
          id,
          result: { resources },
        });
        return;
      }

      if (method === 'resources/read') {
        const uri = typeof params.uri === 'string' ? params.uri : '';
        if (!uri.startsWith('notika://')) {
          res.json({
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Geçersiz notika:// URI.' },
          });
          return;
        }
        const stripped = uri.slice('notika://'.length);
        const slashIdx = stripped.indexOf('/');
        if (slashIdx === -1) {
          res.json({
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Eksik proje/not URI yolu.' },
          });
          return;
        }
        const project = decodeURIComponent(stripped.slice(0, slashIdx));
        const note = decodeURIComponent(stripped.slice(slashIdx + 1));
        const resolved = await resolveNotePath(dataDir, project, note);
        if (await isNoteLocked(dataDir, resolved.projectName, resolved.noteName)) {
          throw new VaultError('Bu not şifre ile kilitlidir.', 423);
        }
        const doc = await readNote(dataDir, project, note);

        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: doc.name.toLowerCase().endsWith('.txt')
                  ? 'text/plain'
                  : 'text/markdown',
                text: doc.content,
              },
            ],
          },
        });
        return;
      }

      if (method === 'tools/call') {
        const toolName = typeof params.name === 'string' ? params.name : '';
        const args = getObject(params.arguments);

        if (toolName === 'list_projects') {
          const tree = await listVaultTree(dataDir);
          res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    tree.map((p) => ({
                      name: p.name,
                      noteCount: p.noteCount,
                      updatedAt: p.updatedAt,
                    })),
                    null,
                    2
                  ),
                },
              ],
            },
          });
          return;
        }

        if (toolName === 'list_notes') {
          const tree = await listVaultTree(dataDir);
          const project = tree.find((p) => p.name === args.project);
          res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(project ? project.notes : [], null, 2),
                },
              ],
            },
          });
          return;
        }

        if (toolName === 'read_note') {
          const resolved = await resolveNotePath(dataDir, args.project, args.note);
          if (await isNoteLocked(dataDir, resolved.projectName, resolved.noteName)) {
            throw new VaultError('Bu not şifre ile kilitlidir.', 423);
          }
          const doc = await readNote(dataDir, args.project, args.note);
          res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: doc.content }],
            },
          });
          return;
        }

        if (toolName === 'create_note') {
          const doc = await createNote(
            dataDir,
            args.project,
            args.name,
            args.content
          );
          res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Oluşturuldu: ${doc.project}/${doc.name}`,
                },
              ],
            },
          });
          return;
        }

        if (toolName === 'update_note') {
          const resolved = await resolveNotePath(dataDir, args.project, args.note);
          if (await isNoteLocked(dataDir, resolved.projectName, resolved.noteName)) {
            throw new VaultError('Bu not şifre ile kilitlidir.', 423);
          }
          const doc = await saveNote(
            dataDir,
            args.project,
            args.note,
            args.content
          );
          res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Güncellendi: ${doc.project}/${doc.name} (${doc.size} byte)`,
                },
              ],
            },
          });
          return;
        }

        if (toolName === 'search_notes') {
          const query = typeof args.query === 'string' ? args.query : '';
          const results = await searchNotes(dataDir, query);
          res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                { type: 'text', text: JSON.stringify(results, null, 2) },
              ],
            },
          });
          return;
        }

        res.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Bilinmeyen araç: ${toolName}` },
        });
        return;
      }

      res.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Desteklenmeyen yöntem: ${method}` },
      });
    } catch (err: unknown) {
      const msg =
        err instanceof VaultError
          ? err.message
          : 'MCP işlemi sırasında hata oluştu.';
      res.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: msg },
      });
    }
  });

  return router;
}
