import { Router } from 'express';
import { transaction } from '../db/pool.js';
import {
  EXTRACT_MODES,
  INTENTS,
  STATUSES,
  createSession,
  getEntry,
  insertEntry,
  listEntries,
  updateEntry,
} from '../db/entries.js';
import { wrap } from '../middleware/auth.js';
import { discardFiles, toAsset, upload } from '../storage.js';

const router = Router();

const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|tiktok\.com|vimeo\.com)$/i;

function contentTypeForFile(mime) {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

function contentTypeForLink(url) {
  try {
    return VIDEO_HOSTS.test(new URL(url).hostname) ? 'video' : 'url';
  } catch {
    return 'url';
  }
}

function bool(v, fallback = false) {
  if (v === undefined || v === null || v === '') return fallback;
  return v === true || v === 'true' || v === '1' || v === 'on';
}

function parseJson(v, fallback) {
  if (v === undefined || v === '') return fallback;
  try {
    return typeof v === 'string' ? JSON.parse(v) : v;
  } catch {
    return fallback;
  }
}

function cleanUrl(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return ['http:', 'https:'].includes(u.protocol) ? u.toString().slice(0, 2048) : null;
  } catch {
    return null;
  }
}

/** Shared details from the form, validated. */
function readDetails(src) {
  const intent = src.intent && INTENTS.includes(src.intent) ? src.intent : null;
  const extractMode = EXTRACT_MODES.includes(src.extractMode) ? src.extractMode : 'text';
  return {
    title: String(src.title || '').trim().slice(0, 255) || null,
    whySaved: String(src.whySaved || '').trim() || null,
    intent,
    extractMode,
    tags: Array.isArray(src.tags) ? src.tags : parseJson(src.tags, []),
  };
}

/**
 * Save new entries.
 * multipart/form-data fields:
 *   files[]       0..20 files
 *   url           a shared link or the source link of a screenshot
 *   title, whySaved, intent, extractMode (text|code|none), tags (JSON array)
 *   transcript    for audio: "false" skips transcription (default true)
 *   onDashboard   default true
 *   listenOnlyOk  default false
 *   saveAs        when several files: linked (default) | separate | combined
 *   itemsMeta     optional JSON array, one object per file, overriding the shared details
 */
router.post(
  '/',
  upload.array('files', 20),
  wrap(async (req, res) => {
    const files = req.files || [];
    try {
      const shared = readDetails(req.body);
      const url = cleanUrl(req.body.url);
      const onDashboard = bool(req.body.onDashboard, true);
      const listenOnlyOk = bool(req.body.listenOnlyOk, false);
      const transcript = bool(req.body.transcript, true);
      const saveAs = ['linked', 'separate', 'combined'].includes(req.body.saveAs) ? req.body.saveAs : 'linked';
      const itemsMeta = parseJson(req.body.itemsMeta, []);

      if (files.length === 0 && !url && !shared.whySaved && !shared.title) {
        return res.status(400).json({ error: 'Add a file, a link, or a note' });
      }

      const ids = await transaction(async (conn) => {
        const base = { sourceUrl: url, onDashboard, listenOnlyOk };

        // No files: a link or a plain note.
        if (files.length === 0) {
          const contentType = url ? contentTypeForLink(url) : 'note';
          return [
            await insertEntry(conn, req.session.userId, { ...base, ...shared, contentType, extractMode: 'none' }, [], shared.tags),
          ];
        }

        const assets = files.map(toAsset);

        // Several files as one entry.
        if (saveAs === 'combined' || files.length === 1) {
          const contentType = contentTypeForFile(files[0].mimetype);
          const extractMode = contentType === 'audio' && !transcript ? 'none' : shared.extractMode;
          return [
            await insertEntry(
              conn,
              req.session.userId,
              { ...base, ...shared, contentType, extractMode },
              assets,
              shared.tags,
            ),
          ];
        }

        // Several files as separate entries, optionally linked in one session.
        const sessionId = saveAs === 'linked' ? await createSession(conn, req.session.userId) : null;
        const created = [];
        for (const [i, file] of files.entries()) {
          const own = itemsMeta[i] ? readDetails({ ...req.body, ...itemsMeta[i] }) : shared;
          const contentType = contentTypeForFile(file.mimetype);
          const extractMode = contentType === 'audio' && !transcript ? 'none' : own.extractMode;
          created.push(
            await insertEntry(
              conn,
              req.session.userId,
              { ...base, ...own, contentType, extractMode, sessionId },
              [assets[i]],
              own.tags,
            ),
          );
        }
        return created;
      });

      const entries = await Promise.all(ids.map((id) => getEntry(req.session.userId, id)));
      res.status(201).json({ entries });
    } catch (err) {
      discardFiles(files);
      throw err;
    }
  }),
);

/** List entries. Query: dashboard=1, tag, intent, status, q, limit */
router.get(
  '/',
  wrap(async (req, res) => {
    const { tag, intent, status, q, limit } = req.query;
    const entries = await listEntries(req.session.userId, {
      dashboard: bool(req.query.dashboard),
      tag: tag ? String(tag).replace(/^#/, '').toLowerCase() : null,
      intent: INTENTS.includes(intent) ? intent : null,
      status: STATUSES.includes(status) ? status : null,
      q: q ? String(q).slice(0, 200) : null,
      limit,
    });
    res.json({ entries });
  }),
);

router.get(
  '/:id',
  wrap(async (req, res) => {
    const entry = await getEntry(req.session.userId, req.params.id);
    if (!entry) return res.status(404).json({ error: 'Not found' });
    res.json({ entry });
  }),
);

/**
 * Change an entry. Body (JSON, all optional):
 *   onDashboard (false = hide), status (new|done|archived), title, whySaved,
 *   intent, sourceUrl, listenOnlyOk, tags (replaces all)
 */
router.patch(
  '/:id',
  wrap(async (req, res) => {
    const b = req.body || {};
    const patch = {};
    if ('onDashboard' in b) patch.onDashboard = Boolean(b.onDashboard);
    if ('status' in b) {
      if (!STATUSES.includes(b.status)) return res.status(400).json({ error: 'Invalid status' });
      patch.status = b.status;
    }
    if ('intent' in b) {
      if (b.intent && !INTENTS.includes(b.intent)) return res.status(400).json({ error: 'Invalid intent' });
      patch.intent = b.intent || null;
    }
    if ('title' in b) patch.title = String(b.title || '').slice(0, 255);
    if ('whySaved' in b) patch.whySaved = String(b.whySaved || '');
    if ('sourceUrl' in b) patch.sourceUrl = cleanUrl(b.sourceUrl);
    if ('listenOnlyOk' in b) patch.listenOnlyOk = Boolean(b.listenOnlyOk);
    if (Array.isArray(b.tags)) patch.tags = b.tags;

    const found = await transaction((conn) => updateEntry(conn, req.session.userId, req.params.id, patch));
    if (!found) return res.status(404).json({ error: 'Not found' });
    res.json({ entry: await getEntry(req.session.userId, req.params.id) });
  }),
);

export default router;
