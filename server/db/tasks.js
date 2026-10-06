import { pool, newId, now } from './pool.js';

function toTask(r) {
  return {
    id: r.id,
    entryId: r.entry_id,
    entryTitle: r.entry_title ?? null,
    title: r.title,
    notes: r.notes,
    dueAt: r.due_at,
    done: Boolean(r.done),
    doneAt: r.done_at,
    createdAt: r.created_at,
  };
}

/**
 * Open tasks, plus anything finished in the last 24 hours (so a task you just
 * ticked doesn't vanish before you see it). Grouping into Overdue / Today /
 * Later happens in the browser, which knows your time zone.
 */
export async function listTasks(userId) {
  const [rows] = await pool.query(
    `SELECT t.*, COALESCE(e.title, e.why_saved) AS entry_title
     FROM tasks t LEFT JOIN entries e ON e.id = t.entry_id
     WHERE t.user_id = ? AND (t.done = FALSE OR t.done_at > ?)
     ORDER BY t.done ASC, t.due_at IS NULL, t.due_at ASC, t.created_at DESC`,
    [userId, new Date(Date.now() - 24 * 60 * 60 * 1000)],
  );
  return rows.map(toTask);
}

export async function createTask(userId, { title, notes, dueAt, entryId }) {
  const id = newId();
  const ts = now();
  await pool.query(
    `INSERT INTO tasks (id, user_id, entry_id, title, notes, due_at, done, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, FALSE, ?, ?)`,
    [id, userId, entryId || null, title, notes || null, dueAt ? new Date(dueAt) : null, ts, ts],
  );
  return id;
}

export async function updateTask(userId, id, patch) {
  const sets = [];
  const params = [];
  if ('title' in patch) {
    sets.push('title = ?');
    params.push(patch.title);
  }
  if ('notes' in patch) {
    sets.push('notes = ?');
    params.push(patch.notes || null);
  }
  if ('dueAt' in patch) {
    sets.push('due_at = ?');
    params.push(patch.dueAt ? new Date(patch.dueAt) : null);
  }
  if ('done' in patch) {
    sets.push('done = ?', 'done_at = ?');
    params.push(Boolean(patch.done), patch.done ? now() : null);
  }
  sets.push('updated_at = ?');
  params.push(now());
  const [result] = await pool.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, [
    ...params,
    id,
    userId,
  ]);
  return result.affectedRows > 0;
}

export async function deleteTask(userId, id) {
  const [result] = await pool.query('DELETE FROM tasks WHERE id = ? AND user_id = ?', [id, userId]);
  return result.affectedRows > 0;
}
