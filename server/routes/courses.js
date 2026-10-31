import express from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../middleware/audit.js';
import { ok, wrap, notFound, conflict } from '../utils/http.js';
import { requireFields, toNumberInRange } from '../utils/validate.js';

const router = express.Router();

router.get('/', requireAuth, wrap((req, res) => {
  ok(res, db.prepare('SELECT id, code, name, credit FROM courses ORDER BY code').all());
}));

router.post('/', requireAuth, requireRole('admin'), wrap((req, res) => {
  const body = req.body || {};
  requireFields(body, ['code', 'name']);
  const code = String(body.code).trim().toUpperCase();
  if (db.prepare('SELECT id FROM courses WHERE code = ?').get(code)) {
    throw conflict(`课程编码 ${code} 已存在`);
  }
  const credit = body.credit === undefined ? 0 : toNumberInRange(body.credit, '学分', 0, 20);

  const info = db.prepare('INSERT INTO courses (code, name, credit) VALUES (?, ?, ?)').run(
    code, String(body.name).trim(), credit
  );
  writeAudit({ user: req.user, action: 'create', entity: 'courses', entityId: Number(info.lastInsertRowid), detail: { code, name: body.name }, ip: req.ip });
  ok(res, { id: Number(info.lastInsertRowid) }, '新增成功');
}));

router.put('/:id', requireAuth, requireRole('admin'), wrap((req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM courses WHERE id = ?').get(id);
  if (!old) throw notFound('课程不存在');

  const body = req.body || {};
  requireFields(body, ['code', 'name']);
  const code = String(body.code).trim().toUpperCase();
  const dup = db.prepare('SELECT id FROM courses WHERE code = ? AND id <> ?').get(code, id);
  if (dup) throw conflict(`课程编码 ${code} 已存在`);
  const credit = body.credit === undefined ? old.credit : toNumberInRange(body.credit, '学分', 0, 20);

  db.prepare('UPDATE courses SET code = ?, name = ?, credit = ? WHERE id = ?').run(
    code, String(body.name).trim(), credit, id
  );
  writeAudit({ user: req.user, action: 'update', entity: 'courses', entityId: id, detail: { before: old, after: { code, name: body.name, credit } }, ip: req.ip });
  ok(res, { id }, '保存成功');
}));

router.delete('/:id', requireAuth, requireRole('admin'), wrap((req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM courses WHERE id = ?').get(id);
  if (!old) throw notFound('课程不存在');

  const used = db.prepare('SELECT COUNT(*) AS c FROM scores WHERE course_id = ?').get(id).c;
  if (used > 0) throw conflict(`该课程下还有 ${used} 条成绩记录，无法删除`);

  db.prepare('DELETE FROM courses WHERE id = ?').run(id);
  writeAudit({ user: req.user, action: 'delete', entity: 'courses', entityId: id, detail: old, ip: req.ip });
  ok(res, null, '已删除');
}));

export default router;
