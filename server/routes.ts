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
import {
  addUnlockedNoteCookie,
  addUnlockedShareCookie,
  getUnlockedNoteKeys,
  getUnlockedShareCodes,
  isNoteLocked,
  makeNoteKey,
  relocateNoteLock,
  relocateProjectLocks,
  removeNotePassword,
  removeUnlockedNoteCookie,
  setNotePassword,
  verifyNotePassword,
} from './locks.ts';
import { createMcpRouter } from './mcp.ts';
import { relocateProjectAppearance } from './projectMeta.ts';
import {
  createShareOrInvite,
  deleteSharesForNote,
  deleteSharesForProject,
  getAppSettings,
  listSharesForNote,
  regenerateMcpToken,
  relocateShareNoteReferences,
  relocateShareProjectReferences,
  resolveSharedNote,
  revokeShare,
  saveSharedNote,
  updateAppSettings,
  updateSharePermission,
  verifySharePassword,
} from './shares.ts';
import {
  createOrSaveTemplate,
  deleteTemplate,
  listTemplates,
} from './templates.ts';
import {
  emptyTrash,
  listTrash,
  moveNoteToTrash,
  moveProjectToTrash,
  purgeTrashItem,
  restoreTrashItem,
} from './trash.ts';
import {
  VaultError,
  createNote,
  createProject,
  listVaultTree,
  moveNote,
  readNote,
  renameNote,
  renameProject,
  resolveNotePath,
  saveNote,
  searchNotes,
  setNoteAppearance,
  setNotePinned,
  updateProjectAppearance,
} from './vault.ts';

function handleRouteError(res: Response, err: unknown): void {
  if (err instanceof VaultError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  console.error('Vault API error:', err);
  res
    .status(500)
    .json({ error: 'Sunucu tarafında beklenmeyen bir hata oluştu.' });
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
      const unlockedCodes = getUnlockedShareCodes(req);
      const note = await resolveSharedNote(
        dataDir,
        req.params.code,
        unlockedCodes
      );
      res.json({ note });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.post(
    '/public/share/:code/verify',
    async (req: Request, res: Response) => {
      try {
        const body = getBodyObject(req.body);
        const code = typeof req.params.code === 'string' ? req.params.code : '';
        await verifySharePassword(dataDir, code, body.password);
        addUnlockedShareCookie(req, res, code);
        const unlockedCodes = getUnlockedShareCodes(req);
        unlockedCodes.add(code);
        const note = await resolveSharedNote(dataDir, code, unlockedCodes);
        res.json({ note });
      } catch (err: unknown) {
        handleRouteError(res, err);
      }
    }
  );

  router.put('/public/share/:code', async (req: Request, res: Response) => {
    try {
      const body = getBodyObject(req.body);
      const unlockedCodes = getUnlockedShareCodes(req);
      const note = await saveSharedNote(
        dataDir,
        req.params.code,
        body.content,
        unlockedCodes
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
      const project = await createProject(dataDir, body.name, {
        icon: body.icon,
        color: body.color,
      });
      res.status(201).json({ project });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.post('/projects/appearance', async (req: Request, res: Response) => {
    try {
      const body = getBodyObject(req.body);
      const project = await updateProjectAppearance(
        dataDir,
        body.project,
        body.icon,
        body.color
      );
      res.json({ project });
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
      await relocateProjectAppearance(dataDir, result.oldName, result.newName);
      await relocateProjectLocks(dataDir, result.oldName, result.newName);
      await relocateShareProjectReferences(
        dataDir,
        result.oldName,
        result.newName
      );
      res.json(result);
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.delete('/projects/:project', async (req: Request, res: Response) => {
    try {
      const projectName =
        typeof req.params.project === 'string' ? req.params.project : '';
      const trashed = await moveProjectToTrash(dataDir, projectName);
      await deleteSharesForProject(dataDir, projectName);
      res.json({ ok: true, trashed });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.get('/notes', async (req: Request, res: Response) => {
    try {
      const resolved = await resolveNotePath(
        dataDir,
        req.query.project,
        req.query.note
      );
      const locked = await isNoteLocked(
        dataDir,
        resolved.projectName,
        resolved.noteName
      );
      const unlockedKeys = getUnlockedNoteKeys(req);
      const noteKey = makeNoteKey(resolved.projectName, resolved.noteName);

      if (locked && !unlockedKeys.has(noteKey)) {
        res.status(423).json({
          error: 'Bu not şifre ile korunuyor.',
          locked: true,
          project: resolved.projectName,
          name: resolved.noteName,
        });
        return;
      }

      const note = await readNote(dataDir, req.query.project, req.query.note);
      res.json({ note: { ...note, ...(locked ? { isLocked: true } : {}) } });
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
        body.content,
        { icon: body.icon, color: body.color }
      );
      res.status(201).json({ note });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.put('/notes', async (req: Request, res: Response) => {
    try {
      const body = getBodyObject(req.body);
      const resolved = await resolveNotePath(dataDir, body.project, body.name);
      const locked = await isNoteLocked(
        dataDir,
        resolved.projectName,
        resolved.noteName
      );
      const unlockedKeys = getUnlockedNoteKeys(req);
      const noteKey = makeNoteKey(resolved.projectName, resolved.noteName);

      if (locked && !unlockedKeys.has(noteKey)) {
        res.status(423).json({
          error: 'Bu notu kaydetmek için önce kilidini açmalısınız.',
          locked: true,
        });
        return;
      }

      const note = await saveNote(dataDir, body.project, body.name, body.content);
      res.json({ note: { ...note, ...(locked ? { isLocked: true } : {}) } });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.post('/notes/pin', async (req: Request, res: Response) => {
    try {
      const body = getBodyObject(req.body);
      const resolved = await resolveNotePath(dataDir, body.project, body.name);
      const locked = await isNoteLocked(
        dataDir,
        resolved.projectName,
        resolved.noteName
      );
      const unlockedKeys = getUnlockedNoteKeys(req);
      const noteKey = makeNoteKey(resolved.projectName, resolved.noteName);

      if (locked && !unlockedKeys.has(noteKey)) {
        res.status(423).json({
          error: 'Bu notun sabitlenme durumunu değiştirmek için kilidini açmalısınız.',
          locked: true,
        });
        return;
      }

      const result = await setNotePinned(
        dataDir,
        body.project,
        body.name,
        Boolean(body.pinned)
      );
      res.json({
        note: { ...result.meta, ...(locked ? { isLocked: true } : {}) },
        content: result.content,
      });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.post('/notes/appearance', async (req: Request, res: Response) => {
    try {
      const body = getBodyObject(req.body);
      const resolved = await resolveNotePath(dataDir, body.project, body.name);
      const locked = await isNoteLocked(
        dataDir,
        resolved.projectName,
        resolved.noteName
      );
      const unlockedKeys = getUnlockedNoteKeys(req);
      const noteKey = makeNoteKey(resolved.projectName, resolved.noteName);

      if (locked && !unlockedKeys.has(noteKey)) {
        res.status(423).json({
          error: 'Bu notun görünümünü değiştirmek için kilidini açmalısınız.',
          locked: true,
        });
        return;
      }

      const result = await setNoteAppearance(
        dataDir,
        body.project,
        body.name,
        body.icon,
        body.color
      );
      res.json({
        note: { ...result.meta, ...(locked ? { isLocked: true } : {}) },
        content: result.content,
      });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.patch('/notes/rename', async (req: Request, res: Response) => {
    try {
      const body = getBodyObject(req.body);
      const resolved = await resolveNotePath(dataDir, body.project, body.name);
      const locked = await isNoteLocked(
        dataDir,
        resolved.projectName,
        resolved.noteName
      );
      const note = await renameNote(
        dataDir,
        body.project,
        body.name,
        body.newName
      );
      await relocateNoteLock(
        dataDir,
        resolved.projectName,
        resolved.noteName,
        note.project,
        note.name
      );
      await relocateShareNoteReferences(
        dataDir,
        resolved.projectName,
        resolved.noteName,
        note.project,
        note.name
      );

      const oldKey = makeNoteKey(resolved.projectName, resolved.noteName);
      const unlockedKeys = getUnlockedNoteKeys(req);
      if (unlockedKeys.has(oldKey)) {
        addUnlockedNoteCookie(req, res, makeNoteKey(note.project, note.name));
      }

      res.json({ note: { ...note, ...(locked ? { isLocked: true } : {}) } });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.post('/notes/move', async (req: Request, res: Response) => {
    try {
      const body = getBodyObject(req.body);
      const source = await resolveNotePath(
        dataDir,
        body.fromProject,
        body.noteName
      );
      const note = await moveNote(
        dataDir,
        body.fromProject,
        body.noteName,
        body.toProject
      );
      await relocateNoteLock(
        dataDir,
        source.projectName,
        source.noteName,
        note.project,
        note.name
      );
      await relocateShareNoteReferences(
        dataDir,
        source.projectName,
        source.noteName,
        note.project,
        note.name
      );

      const oldKey = makeNoteKey(source.projectName, source.noteName);
      const unlockedKeys = getUnlockedNoteKeys(req);
      if (unlockedKeys.has(oldKey)) {
        addUnlockedNoteCookie(req, res, makeNoteKey(note.project, note.name));
      }

      res.json({ note });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.post('/notes/unlock', async (req: Request, res: Response) => {
    try {
      const body = getBodyObject(req.body);
      const resolved = await resolveNotePath(dataDir, body.project, body.name);
      const password = typeof body.password === 'string' ? body.password : '';
      const valid = await verifyNotePassword(
        dataDir,
        resolved.projectName,
        resolved.noteName,
        password
      );
      if (!valid) {
        res.status(401).json({ error: 'Not şifresi hatalı.' });
        return;
      }

      addUnlockedNoteCookie(
        req,
        res,
        makeNoteKey(resolved.projectName, resolved.noteName)
      );
      res.json({ ok: true });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.post('/notes/lock', async (req: Request, res: Response) => {
    try {
      const body = getBodyObject(req.body);
      const resolved = await resolveNotePath(dataDir, body.project, body.name);
      const key = makeNoteKey(resolved.projectName, resolved.noteName);
      const action = typeof body.action === 'string' ? body.action : 'set';
      const currentlyLocked = await isNoteLocked(
        dataDir,
        resolved.projectName,
        resolved.noteName
      );
      const unlockedKeys = getUnlockedNoteKeys(req);

      if (action === 'lock-session') {
        if (!currentlyLocked) {
          throw new VaultError('Bu notta henüz bir şifre tanımlı değil.', 400);
        }
        removeUnlockedNoteCookie(req, res, key);
        res.json({ ok: true, isLocked: true });
        return;
      }

      if (currentlyLocked && !unlockedKeys.has(key)) {
        const currentPw =
          typeof body.currentPassword === 'string' ? body.currentPassword : '';
        const ok = await verifyNotePassword(
          dataDir,
          resolved.projectName,
          resolved.noteName,
          currentPw
        );
        if (!ok) {
          res.status(401).json({ error: 'Mevcut not şifresi hatalı.' });
          return;
        }
      }

      if (action === 'remove') {
        await removeNotePassword(
          dataDir,
          resolved.projectName,
          resolved.noteName
        );
        removeUnlockedNoteCookie(req, res, key);
        res.json({ ok: true, isLocked: false });
        return;
      }

      const password = typeof body.password === 'string' ? body.password : '';
      if (password.length < 1) {
        throw new VaultError('Lütfen geçerli bir şifre girin.', 400);
      }

      await setNotePassword(
        dataDir,
        resolved.projectName,
        resolved.noteName,
        password
      );
      addUnlockedNoteCookie(req, res, key);
      res.json({ ok: true, isLocked: true });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.delete('/notes', async (req: Request, res: Response) => {
    try {
      const resolved = await resolveNotePath(
        dataDir,
        req.query.project,
        req.query.note
      );
      const trashed = await moveNoteToTrash(
        dataDir,
        resolved.projectName,
        resolved.noteName
      );
      await deleteSharesForNote(
        dataDir,
        resolved.projectName,
        resolved.noteName
      );
      removeUnlockedNoteCookie(
        req,
        res,
        makeNoteKey(resolved.projectName, resolved.noteName)
      );
      res.json({ ok: true, trashed });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  // Trash Management (stored in DATA_DIR/.trash)
  router.get('/trash', async (_req: Request, res: Response) => {
    try {
      const items = await listTrash(dataDir);
      res.json({ items });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.post('/trash/:id/restore', async (req: Request, res: Response) => {
    try {
      const result = await restoreTrashItem(dataDir, req.params.id);
      res.json(result);
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.delete('/trash/:id', async (req: Request, res: Response) => {
    try {
      await purgeTrashItem(dataDir, req.params.id);
      res.json({ ok: true });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.delete('/trash', async (_req: Request, res: Response) => {
    try {
      await emptyTrash(dataDir);
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

  // Templates Management (stored in DATA_DIR/templates)
  router.get('/templates', async (_req: Request, res: Response) => {
    try {
      const templates = await listTemplates(dataDir);
      res.json({ templates });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.post('/templates', async (req: Request, res: Response) => {
    try {
      const body = getBodyObject(req.body);
      const template = await createOrSaveTemplate(
        dataDir,
        body.name,
        body.content,
        { mustNotExist: true }
      );
      res.status(201).json({ template });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.put('/templates/:name', async (req: Request, res: Response) => {
    try {
      const body = getBodyObject(req.body);
      const targetName =
        typeof body.newName === 'string' && body.newName.trim().length > 0
          ? body.newName
          : req.params.name;
      const template = await createOrSaveTemplate(
        dataDir,
        targetName,
        body.content,
        { previousName: req.params.name }
      );
      res.json({ template });
    } catch (err: unknown) {
      handleRouteError(res, err);
    }
  });

  router.delete('/templates/:name', async (req: Request, res: Response) => {
    try {
      await deleteTemplate(dataDir, req.params.name);
      res.json({ ok: true });
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
        password: body.password,
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
