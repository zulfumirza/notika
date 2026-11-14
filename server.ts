import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createApiRouter } from './server/routes.ts';
import { ensureDataDir, getDataDir } from './server/vault.ts';

async function startServer(): Promise<void> {
  const port = Number.parseInt(process.env.PORT ?? '3000', 10) || 3000;
  const isProd = process.env.NODE_ENV === 'production';
  const dataDir = getDataDir();

  await ensureDataDir(dataDir);

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '5mb' }));

  app.use('/api', createApiRouter(dataDir));

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Notika server listening on http://0.0.0.0:${port}`);
    console.log(`Vault data directory: ${dataDir}`);
  });
}

startServer().catch((err: unknown) => {
  console.error('Failed to start Notika server:', err);
  process.exit(1);
});
