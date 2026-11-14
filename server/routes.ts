import express from 'express';
import type { Request, Response } from 'express';
import {
  clearSessionCookie,
  createSessionToken,
  getAuthConfig,
  isRequestAuthenticated,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from './auth.ts';
import { createMcpRouter } from './mcp.ts';
import {
  createShareOrInvite,
  getAppSettings,
  listSharesForNote,
  regenerateMcpToken,
  resolveSharedNote,
  revokeShare,
  saveSharedNote,
  updateAppSettings,
  updateSharePermission,
} from './shares.ts';
import {
  VaultError,
  createNote,
  createProject,
  deleteNote,
  deleteProject,
  listVaultTree,
  readNote,
  renameNote,
  renameProject,
  saveNote,
  searchNotes,
} from './vault.ts';

function handleRouteError(res: Response, err: unknown): void {
  if (err instanceof VaultError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  console.error('Vault API error:', err);
  res.status(500).json({ error: 'Sunucu tarafında beklenmeyen bir hata oluştu.' });
}

function getBodyObject(body: unknown): Record<string, unknown> {
  if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

export function createApiRouter(dataDir: string): express.Router {
  const router = express.Router();

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Public MCP endpoint (uses its own Bearer token verification)
  router.use('/mcp', createMcpRouter(dataDir));

  // Public Short Share / Invite Link endpoints (accessible without owner password)
  router.get('/public/share/:code', async (req: Request, res: Response) => {
    try {
      const note = await resolveSharedNote(dataDir, req.params.code);
      res.json({ note });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.put('/public/share/:code', async (req: Request, res: Response) => {
    try {
      const body = getBodyObject(req.body);
      const note = await saveSharedNote(
        dataDir,
        req.params.code,
        body.content
      );
      res.json({ note });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.get('/auth/status', (req: Request, res: Response) => {
    const config = getAuthConfig();
    res.json({
      authEnabled: config.authEnabled,
      authenticated: isRequestAuthenticated(req),
    });
  });

  router.post('/auth/login', (req: Request, res: Response) => {
    const config = getAuthConfig();
    if (!config.authEnabled) {
      res.json({ ok: true, authEnabled: false });
      return;
    }

    const body = getBodyObject(req.body);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!verifyPassword(password, config.password)) {
      res.status(401).json({ error: 'Girilen şifre hatalı.' });
      return;
    }

    const token = createSessionToken(config.secret);
    setSessionCookie(req, res, token);
    res.json({ ok: true, authEnabled: true });
  });

  router.post('/auth/logout', (req: Request, res: Response) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  router.use(requireAuth);

  router.get('/tree', async (_req: Request, res: Response) => {
    try {
      const projects = await listVaultTree(dataDir);
      res.json({ projects });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.post('/projects', async (req: Request, res: Response) => {
    try {
      const body = getBodyObject(req.body);
      const project = await createProject(dataDir, body.name);
      res.status(201).json({ project });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.patch('/projects/:project', async (req: Request, res: Response) => {
    try {
      const body = getBodyObject(req.body);
      const result = await renameProject(
        dataDir,
        req.params.project,
        body.newName
      );
      res.json(result);
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.delete('/projects/:project', async (req: Request, res: Response) => {
    try {
      await deleteProject(dataDir, req.params.project);
      res.json({ ok: true });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.get('/notes', async (req: Request, res: Response) => {
    try {
      const note = await readNote(dataDir, req.query.project, req.query.note);
      res.json({ note });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.post('/notes', async (req: Request, res: Response) => {
    try {
      const body = getBodyObject(req.body);
      const note = await createNote(
        dataDir,
        body.project,
        body.name,
        body.content
      );
      res.status(201).json({ note });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.put('/notes', async (req: Request, res: Response) => {
    try {
      const body = getBodyObject(req.body);
      const note = await saveNote(
        dataDir,
        body.project,
        body.name,
        body.content
      );
      res.json({ note });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.patch('/notes/rename', async (req: Request, res: Response) => {
    try {
      const body = getBodyObject(req.body);
      const note = await renameNote(
        dataDir,
        body.project,
        body.name,
        body.newName
      );
      res.json({ note });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.delete('/notes', async (req: Request, res: Response) => {
    try {
      await deleteNote(dataDir, req.query.project, req.query.note);
      res.json({ ok: true });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.get('/search', async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const results = await searchNotes(dataDir, q);
      res.json({ results });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  // Owner Share & Invite Management
  router.get('/shares', async (req: Request, res: Response) => {
    try {
      const shares = await listSharesForNote(
        dataDir,
        req.query.project,
        req.query.note
      );
      res.json({ shares });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.post('/shares', async (req: Request, res: Response) => {
    try {
      const body = getBodyObject(req.body);
      const share = await createShareOrInvite(dataDir, {
        project: body.project,
        note: body.note,
        permission: body.permission,
        kind: body.kind,
        inviteeName: body.inviteeName,
        inviteeEmail: body.inviteeEmail,
        expiresInHours: body.expiresInHours,
      });
      res.status(201).json({ share });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.patch('/shares/:code', async (req: Request, res: Response) => {
    try {
      const body = getBodyObject(req.body);
      const share = await updateSharePermission(
        dataDir,
        req.params.code,
        body.permission
      );
      res.json({ share });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.delete('/shares/:code', async (req: Request, res: Response) => {
    try {
      await revokeShare(dataDir, req.params.code);
      res.json({ ok: true });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  // App & MCP Settings
  router.get('/settings', async (_req: Request, res: Response) => {
    try {
      const settings = await getAppSettings(dataDir);
      res.json({ settings });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.patch('/settings', async (req: Request, res: Response) => {
    try {
      const body = getBodyObject(req.body);
      const settings = await updateAppSettings(dataDir, {
        mcpEnabled: body.mcpEnabled,
      });
      res.json({ settings });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.post(
    '/settings/regenerate-mcp-token',
    async (_req: Request, res: Response) => {
      try {
        const settings = await regenerateMcpToken(dataDir);
        res.json({ settings });
      } catch (err: unknown) {
        handleRouteError(res, err);
      }
    }
  );

  return router;
}
