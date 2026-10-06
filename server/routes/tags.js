import { Router } from 'express';
import { listTags } from '../db/tags.js';
import { wrap } from '../middleware/auth.js';

const router = Router();

/** GET /api/tags?q=integ  -> matching tags; without q -> recently used first. */
router.get(
  '/',
  wrap(async (req, res) => {
    const tags = await listTags(req.session.userId, String(req.query.q || '').slice(0, 64));
    res.json({ tags });
  }),
);

export default router;
