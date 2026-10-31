import express from 'express';
import { db, transaction } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../middleware/audit.js';
import { ok, wrap, bad, notFound, conflict } from '../utils/http.js';
import { requireFields, toInt } from '../utils/validate.js';

const router = express.Router();

const LIST_SQL = `
  SELECT c.id, c.name, c.grade_year, c.department_id,
         d.name AS department_name,
         c.head_teacher_id, u.real_name AS head_teacher_name,
         (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.is_deleted = 0) AS student_count
  FROM classes c
  JOIN departments d ON d.id = c.department_id
  LEFT JOIN users u ON u.id = c.head_teacher_id
`;

router.get('/', requireAuth, wrap((req, res) => {
  ok(res, db.prepare(`${LIST_SQL} ORDER BY d.id, c.name`).all());
}));

router.post('/', requireAuth, requireRole('admin'), wrap((req, res) => {
  const body = req.body || {};
  requireFields(body, ['department_id', 'name', 'grade_year']);

  const dept = db.prepare('SELECT id FROM departments WHERE id = ?').get(Number(body.department_id));
  if (!dept) throw bad('院系不存在');

  const info = db.prepare(
    'INSERT INTO classes (department_id, name, grade_year) VALUES (?, ?, ?)'
  ).run(Number(body.department_id), String(body.name).trim(), toInt(body.grade_year, '年级', { min: 1900, max: 2100 }));

  const id = Number(info.lastInsertRowid);
  writeAudit({ user: req.user, action: 'create', entity: 'classes', entityId: id, detail: { name: body.name }, ip: req.ip });
  ok(res, { id }, '新增成功');
}));

router.put('/:id', requireAuth, requireRole('admin'), wrap((req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM classes WHERE id = ?').get(id);
  if (!old) throw notFound('班级不存在');

  const body = req.body || {};
  requireFields(body, ['department_id', 'name', 'grade_year']);
  const dept = db.prepare('SELECT id FROM departments WHERE id = ?').get(Number(body.department_id));
  if (!dept) throw bad('院系不存在');

  const name = String(body.name).trim();
  const gradeYear = toInt(body.grade_year, '年级', { min: 1900, max: 2100 });
  const headTeacherId = body.head_teacher_id ? Number(body.head_teacher_id) : null;

  if (headTeacherId !== null) {
    const teacher = db.prepare("SELECT id, role FROM users WHERE id = ?").get(headTeacherId);
    if (!teacher) throw bad('班主任账号不存在');
    if (teacher.role !== 'teacher') throw bad('只能指定教师角色为班主任');
  }

  transaction(() => {
    // 原班主任解绑
    if (old.head_teacher_id && old.head_teacher_id !== headTeacherId) {
      db.prepare('UPDATE users SET class_id = NULL WHERE id = ?').run(old.head_teacher_id);
    }
    db.prepare(
      'UPDATE classes SET department_id = ?, name = ?, grade_year = ?, head_teacher_id = ? WHERE id = ?'
    ).run(Number(body.department_id), name, gradeYear, headTeacherId, id);
    // 新班主任绑定（权威字段是 users.class_id）
    if (headTeacherId !== null) {
      db.prepare('UPDATE users SET class_id = ? WHERE id = ?').run(id, headTeacherId);
    }
  });

  writeAudit({
    user: req.user, action: 'update', entity: 'classes', entityId: id,
    detail: { before: { name: old.name, head_teacher_id: old.head_teacher_id }, after: { name, head_teacher_id: headTeacherId } },
    ip: req.ip,
  });
  ok(res, { id }, '保存成功');
}));

router.delete('/:id', requireAuth, requireRole('admin'), wrap((req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM classes WHERE id = ?').get(id);
  if (!old) throw notFound('班级不存在');

  const students = db.prepare('SELECT COUNT(*) AS c FROM students WHERE class_id = ? AND is_deleted = 0').get(id).c;
  if (students > 0) throw conflict(`该班级下还有 ${students} 名学生，无法删除`);

  transaction(() => {
    db.prepare('UPDATE users SET class_id = NULL WHERE class_id = ?').run(id);
    db.prepare('DELETE FROM classes WHERE id = ?').run(id);
  });
  writeAudit({ user: req.user, action: 'delete', entity: 'classes', entityId: id, detail: old, ip: req.ip });
  ok(res, null, '已删除');
}));

export default router;
