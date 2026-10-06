import { pool, newId, now } from './pool.js';
import { ensureTags } from './tags.js';

export const CONTENT_TYPES = ['image', 'video', 'document', 'url', 'audio', 'note'];
export const INTENTS = ['watch', 'read', 'try', 'research', 'reference'];
export const EXTRACT_MODES = ['text', 'code', 'none'];
export const STATUSES = ['new', 'done', 'archived'];

export async function createSession(conn, userId, name = null) {
  const id = newId();
  await conn.query('INSERT INTO capture_sessions (id, user_id, name, created_at) VALUES (?, ?, ?, ?)', [
    id,
    userId,
    name,
    now(),
  ]);
  return id;
}

/**
 * Inserts one entry with its files and tags. `conn` is a transaction connection.
 * assets: [{ id, path, originalName, mimeType, sizeBytes }]
 */
export async function insertEntry(conn, userId, data, assets, tagNames) {
  const id = newId();
  const ts = now();
  const needsExtraction = ['image', 'audio', 'video', 'document'].includes(data.contentType) && assets.length > 0;
  const extractStatus = needsExtraction && data.extractMode !== 'none' ? 'pending' : 'skipped';

  await conn.query(
    `INSERT INTO entries
      (id, user_id, session_id, content_type, title, why_saved, intent, source_url, cover_path,
       extract_mode, extract_status, listen_only_ok, on_dashboard, added_to_dashboard_at,
       status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
    [
      id,
      userId,
      data.sessionId || null,
      data.contentType,
      data.title || null,
      data.whySaved || null,
      data.intent || null,
      data.sourceUrl || null,
      data.contentType === 'image' && assets[0] ? assets[0].path : null, // first image is the cover
      data.extractMode,
      extractStatus,
      Boolean(data.listenOnlyOk),
      Boolean(data.onDashboard),
      data.onDashboard ? ts : null,
      ts,
      ts,
    ],
  );

  for (const [position, a] of assets.entries()) {
    await conn.query(
      `INSERT INTO entry_assets (id, entry_id, path, original_name, mime_type, size_bytes, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.id, id, a.path, a.originalName, a.mimeType, a.sizeBytes, position, ts],
    );
  }

  const tagIds = await ensureTags(conn, userId, tagNames);
  for (const tagId of tagIds) {
    await conn.query('INSERT INTO entry_tags (entry_id, tag_id, added_at) VALUES (?, ?, ?)', [id, tagId, ts]);
  }
  return id;
}

/** Entries with their tags and files. Filters: dashboard, tag, intent, status, q. */
export async function listEntries(userId, filters = {}) {
  const where = ['e.user_id = ?'];
  const params = [userId];

  if (filters.dashboard) where.push('e.on_dashboard = TRUE');
  if (filters.status) {
    where.push('e.status = ?');
    params.push(filters.status);
  } else {
    where.push("e.status <> 'archived'");
  }
  if (filters.intent) {
    where.push('e.intent = ?');
    params.push(filters.intent);
  }
  if (filters.tag) {
    where.push(
      'EXISTS (SELECT 1 FROM entry_tags et2 JOIN tags t2 ON t2.id = et2.tag_id WHERE et2.entry_id = e.id AND t2.name = ?)',
    );
    params.push(filters.tag);
  }
  if (filters.q) {
    where.push('(e.title LIKE ? OR e.why_saved LIKE ? OR e.extracted_text LIKE ? OR e.source_url LIKE ?)');
    const like = `%${filters.q}%`;
    params.push(like, like, like, like);
  }

  const orderBy = filters.dashboard ? 'e.added_to_dashboard_at DESC' : 'e.created_at DESC';
  const [rows] = await pool.query(
    `SELECT e.* FROM entries e WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT ?`,
    [...params, Math.min(Number(filters.limit) || 200, 500)],
  );
  return attachDetails(rows);
}

export async function getEntry(userId, id) {
  const [rows] = await pool.query('SELECT * FROM entries WHERE id = ? AND user_id = ?', [id, userId]);
  if (!rows[0]) return null;
  return (await attachDetails(rows))[0];
}

async function attachDetails(rows) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [tagRows] = await pool.query(
    `SELECT et.entry_id, t.name FROM entry_tags et JOIN tags t ON t.id = et.tag_id
     WHERE et.entry_id IN (?) ORDER BY t.name`,
    [ids],
  );
  const [assetRows] = await pool.query(
    `SELECT id, entry_id, original_name, mime_type, size_bytes FROM entry_assets
     WHERE entry_id IN (?) ORDER BY position`,
    [ids],
  );
  const tagsBy = groupBy(tagRows, 'entry_id');
  const assetsBy = groupBy(assetRows, 'entry_id');

  return rows.map((e) => {
    const assets = (assetsBy.get(e.id) || []).map((a) => ({
      id: a.id,
      originalName: a.original_name,
      mimeType: a.mime_type,
      sizeBytes: Number(a.size_bytes),
      url: `/files/${a.id}`,
    }));
    const coverAsset = e.cover_path ? assets.find((a) => a.mimeType.startsWith('image/')) : null;
    return {
      id: e.id,
      sessionId: e.session_id,
      contentType: e.content_type,
      title: e.title,
      whySaved: e.why_saved,
      intent: e.intent,
      sourceUrl: e.source_url,
      coverUrl: coverAsset ? coverAsset.url : null,
      extractMode: e.extract_mode,
      extractStatus: e.extract_status,
      extractedText: e.extracted_text,
      listenOnlyOk: Boolean(e.listen_only_ok),
      onDashboard: Boolean(e.on_dashboard),
      addedToDashboardAt: e.added_to_dashboard_at,
      status: e.status,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
      tags: (tagsBy.get(e.id) || []).map((t) => t.name),
      assets,
    };
  });
}

function groupBy(rows, key) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r[key])) map.set(r[key], []);
    map.get(r[key]).push(r);
  }
  return map;
}

/** Partial update. Only the listed fields can change. */
export async function updateEntry(conn, userId, id, patch) {
  const sets = [];
  const params = [];
  const ts = now();
  const map = { title: 'title', whySaved: 'why_saved', intent: 'intent', sourceUrl: 'source_url', status: 'status' };
  for (const [key, col] of Object.entries(map)) {
    if (key in patch) {
      sets.push(`${col} = ?`);
      params.push(patch[key] || null);
    }
  }
  if ('listenOnlyOk' in patch) {
    sets.push('listen_only_ok = ?');
    params.push(Boolean(patch.listenOnlyOk));
  }
  if ('onDashboard' in patch) {
    sets.push('on_dashboard = ?', 'added_to_dashboard_at = ?');
    params.push(Boolean(patch.onDashboard), patch.onDashboard ? ts : null);
  }
  sets.push('updated_at = ?');
  params.push(ts);

  const [result] = await conn.query(`UPDATE entries SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, [
    ...params,
    id,
    userId,
  ]);
  if (result.affectedRows === 0) return false;

  if (Array.isArray(patch.tags)) {
    await conn.query('DELETE FROM entry_tags WHERE entry_id = ?', [id]);
    const tagIds = await ensureTags(conn, userId, patch.tags);
    for (const tagId of tagIds) {
      await conn.query('INSERT INTO entry_tags (entry_id, tag_id, added_at) VALUES (?, ?, ?)', [id, tagId, ts]);
    }
  }
  return true;
}

/** File lookup for downloads, checking that it belongs to this user. */
export async function getAsset(userId, assetId) {
  const [rows] = await pool.query(
    `SELECT a.path, a.mime_type, a.original_name FROM entry_assets a
     JOIN entries e ON e.id = a.entry_id
     WHERE a.id = ? AND e.user_id = ?`,
    [assetId, userId],
  );
  return rows[0] || null;
}
