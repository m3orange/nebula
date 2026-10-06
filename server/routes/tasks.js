import { Router } from 'express';
import { createTask, deleteTask, listTasks, updateTask } from '../db/tasks.js';
import { wrap } from '../middleware/auth.js';

const router = Router();

function validDate(v) {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

router.get(
  '/',
  wrap(async (req, res) => {
    res.json({ tasks: await listTasks(req.session.userId) });
  }),
);

/** Body: { title, notes?, dueAt? (ISO time), entryId? } */
router.post(
  '/',
  wrap(async (req, res) => {
    const title = String(req.body?.title || '').trim().slice(0, 255);
    if (!title) return res.status(400).json({ error: 'A task needs a title' });
    const dueAt = validDate(req.body.dueAt);
    if (dueAt === undefined) return res.status(400).json({ error: 'Invalid due date' });
    const id = await createTask(req.session.userId, {
      title,
      notes: req.body.notes,
      dueAt,
      entryId: req.body.entryId,
    });
    res.status(201).json({ id });
  }),
);

/** Body: any of { title, notes, dueAt, done } */
router.patch(
  '/:id',
  wrap(async (req, res) => {
    const b = req.body || {};
    const patch = {};
    if ('title' in b) {
      patch.title = String(b.title || '').trim().slice(0, 255);
      if (!patch.title) return res.status(400).json({ error: 'A task needs a title' });
    }
    if ('notes' in b) patch.notes = b.notes;
    if ('dueAt' in b) {
      patch.dueAt = validDate(b.dueAt);
      if (patch.dueAt === undefined) return res.status(400).json({ error: 'Invalid due date' });
    }
    if ('done' in b) patch.done = Boolean(b.done);
    const ok = await updateTask(req.session.userId, req.params.id, patch);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  }),
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    const ok = await deleteTask(req.session.userId, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  }),
);

export default router;
