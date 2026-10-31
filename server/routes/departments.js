import express from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../middleware/audit.js';
import { ok, wrap, bad, notFound, conflict } from '../utils/http.js';
import { requireFields } from '../utils/validate.js';

const router = express.Router();

router.get('/', requireAuth, wrap((req, res) => {
  const list = db.prepare(
    `SELECT d.id, d.name, d.code,
            (SELECT COUNT(*) FROM classes c WHERE c.department_id = d.id) AS class_count
     FROM departments d ORDER BY d.id`
  ).all();
  ok(res, list);
}));

router.post('/', requireAuth, requireRole('admin'), wrap((req, res) => {
  const { name, code } = req.body || {};
  requireFields({ name, code }, ['name', 'code']);
  const dup = db.prepare('SELECT id FROM departments WHERE name = ? OR code = ?').get(name, code);
  if (dup) throw conflict('院系名称或编码已存在');

  const info = db.prepare('INSERT INTO departments (name, code) VALUES (?, ?)').run(
    String(name).trim(), String(code).trim().toUpperCase()
  );
  writeAudit({ user: req.user, action: 'create', entity: 'departments', entityId: Number(info.lastInsertRowid), detail: { name, code }, ip: req.ip });
  ok(res, { id: Number(info.lastInsertRowid) }, '新增成功');
}));

router.put('/:id', requireAuth, requireRole('admin'), wrap((req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
  if (!old) throw notFound('院系不存在');

  const { name, code } = req.body || {};
  requireFields({ name, code }, ['name', 'code']);
  const dup = db.prepare('SELECT id FROM departments WHERE (name = ? OR code = ?) AND id <> ?').get(name, code, id);
  if (dup) throw conflict('院系名称或编码已存在');

  db.prepare('UPDATE departments SET name = ?, code = ? WHERE id = ?').run(
    String(name).trim(), String(code).trim().toUpperCase(), id
  );
  writeAudit({ user: req.user, action: 'update', entity: 'departments', entityId: id, detail: { before: old, after: { name, code } }, ip: req.ip });
  ok(res, { id }, '保存成功');
}));

router.delete('/:id', requireAuth, requireRole('admin'), wrap((req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
  if (!old) throw notFound('院系不存在');

  const used = db.prepare('SELECT COUNT(*) AS c FROM classes WHERE department_id = ?').get(id).c;
  if (used > 0) throw conflict(`该院系下还有 ${used} 个班级，无法删除`);

  db.prepare('DELETE FROM departments WHERE id = ?').run(id);
  writeAudit({ user: req.user, action: 'delete', entity: 'departments', entityId: id, detail: old, ip: req.ip });
  ok(res, null, '已删除');
}));

export default router;
