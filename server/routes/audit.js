import express from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ok, wrap } from '../utils/http.js';
import { parsePaging } from '../utils/validate.js';

const router = express.Router();

router.get('/', requireAuth, requireRole('admin'), wrap((req, res) => {
  const { page, pageSize, offset } = parsePaging(req.query, 20);
  const where = ['1 = 1'];
  const params = [];
  if (req.query.action) { where.push('action = ?'); params.push(String(req.query.action)); }
  if (req.query.entity) { where.push('entity = ?'); params.push(String(req.query.entity)); }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const total = db.prepare(`SELECT COUNT(*) AS c FROM audit_logs ${whereSql}`).get(...params).c;
  const list = db.prepare(
    `SELECT id, username, action, entity, entity_id, detail, ip, created_at
     FROM audit_logs ${whereSql}
     ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset);

  ok(res, {
    list: list.map((row) => ({
      ...row,
      detail: row.detail ? safeParse(row.detail) : null,
    })),
    total, page, pageSize,
  });
}));

function safeParse(text) {
  try { return JSON.parse(text); } catch { return text; }
}

export default router;
