import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import multer from 'multer';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { MySqlSessionStore } from './db/sessionStore.js';
import { getAsset } from './db/entries.js';
import { requireAuth, wrap } from './middleware/auth.js';
import { absolutePath } from './storage.js';
import authRoutes from './routes/auth.js';
import entryRoutes from './routes/entries.js';
import tagRoutes from './routes/tags.js';
import taskRoutes from './routes/tasks.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, '../web/dist');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Hostinger serves the app behind a proxy (needed for secure cookies)

app.use(express.json({ limit: '1mb' }));
app.use(
  session({
    name: 'capture.sid',
    secret: config.sessionSecret,
    store: new MySqlSessionStore(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: 1000 * 60 * 60 * 24 * 30, // stay signed in for 30 days of inactivity
    },
  }),
);

// --- API ---
app.get('/api/health', wrap(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
}));
app.use('/api/auth', authRoutes);
app.use('/api/entries', requireAuth, entryRoutes);
app.use('/api/tags', requireAuth, tagRoutes);
app.use('/api/tasks', requireAuth, taskRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// --- Files (only for the signed-in owner) ---
app.get(
  '/files/:assetId',
  requireAuth,
  wrap(async (req, res) => {
    const asset = await getAsset(req.session.userId, req.params.assetId);
    if (!asset) return res.status(404).end();
    res.type(asset.mime_type);
    res.set('Cache-Control', 'private, max-age=86400');
    if (asset.original_name && req.query.download) res.attachment(asset.original_name);
    res.sendFile(absolutePath(asset.path));
  }),
);

// --- The React app ---
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(webDist, 'index.html')));
} else {
  app.get('/', (req, res) => res.type('text').send('API is running. Build the web app with `npm run build`.'));
}

// --- Errors ---
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? `File is larger than ${config.maxUploadMb} MB` : err.message;
    return res.status(status).json({ error: message });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server' : err.message });
});

app.listen(config.port, () => {
  console.log(`Nebula listening on port ${config.port}`);
});
