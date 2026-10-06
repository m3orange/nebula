import { pool, newId, now } from './pool.js';

/** "#My Tag " -> "my-tag". Tags are stored lowercase, without "#". */
export function normalizeTag(raw) {
  return String(raw)
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * Tags for the picker. With a query: matches first (starts-with, then contains).
 * Without: most recently used first. Each tag carries how many entries use it.
 */
export async function listTags(userId, q = '', limit = 30) {
  const term = normalizeTag(q);
  const params = [userId];
  let where = 't.user_id = ?';
  let order = 'last_used DESC, t.name ASC';
  if (term) {
    where += ' AND t.name LIKE ?';
    params.push(`%${term}%`);
    order = `CASE WHEN t.name LIKE ? THEN 0 ELSE 1 END, ${order}`;
  }
  const sql = `
    SELECT t.id, t.name, COUNT(et.entry_id) AS entry_count, MAX(et.added_at) AS last_used
    FROM tags t
    LEFT JOIN entry_tags et ON et.tag_id = t.id
    WHERE ${where}
    GROUP BY t.id, t.name
    ORDER BY ${order}
    LIMIT ?`;
  if (term) params.push(`${term}%`);
  params.push(limit);
  const [rows] = await pool.query(sql, params);
  return rows.map((r) => ({ id: r.id, name: r.name, entryCount: Number(r.entry_count) }));
}

/** Returns tag ids for the given names, creating any that don't exist yet. */
export async function ensureTags(conn, userId, names) {
  const clean = [...new Set(names.map(normalizeTag).filter(Boolean))];
  if (clean.length === 0) return [];
  const [existing] = await conn.query('SELECT id, name FROM tags WHERE user_id = ? AND name IN (?)', [userId, clean]);
  const byName = new Map(existing.map((t) => [t.name, t.id]));
  for (const name of clean) {
    if (!byName.has(name)) {
      const id = newId();
      await conn.query('INSERT INTO tags (id, user_id, name, created_at) VALUES (?, ?, ?, ?)', [id, userId, name, now()]);
      byName.set(name, id);
    }
  }
  return clean.map((n) => byName.get(n));
}
