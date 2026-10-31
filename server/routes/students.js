import express from 'express';
import { db } from '../db/index.js';
import { requireAuth, scopeClassId, assertClassAccess } from '../middleware/auth.js';
import { writeAudit } from '../middleware/audit.js';
import { ok, wrap, bad, notFound, conflict } from '../utils/http.js';
import {
  requireFields, oneOf, optionalString, optionalDate, parsePaging,
} from '../utils/validate.js';
import { toCsv, sendCsv, stamp } from '../utils/csv.js';

const router = express.Router();
const GENDERS = ['男', '女'];
const STATUSES = ['在读', '休学', '毕业'];

const LIST_SQL = `
  SELECT s.id, s.student_no, s.name, s.gender, s.birth_date, s.class_id,
         s.phone, s.email, s.enroll_year, s.status, s.created_at,
         c.name AS class_name, d.name AS department_name
  FROM students s
  JOIN classes c ON c.id = s.class_id
  JOIN departments d ON d.id = c.department_id
`;

/** 把 query 参数翻译成 WHERE 片段（含教师数据范围） */
function buildFilter(req) {
  const { keyword = '', classId, status } = req.query;
  const where = ['s.is_deleted = 0'];
  const params = [];

  const scope = scopeClassId(req.user);
  if (scope !== null) {
    where.push('s.class_id = ?');
    params.push(scope);
  }
  if (String(keyword).trim()) {
    where.push('(s.name LIKE ? OR s.student_no LIKE ?)');
    const kw = `%${String(keyword).trim()}%`;
    params.push(kw, kw);
  }
  if (classId) {
    where.push('s.class_id = ?');
    params.push(Number(classId));
  }
  if (status) {
    where.push('s.status = ?');
    params.push(status);
  }
  return { whereSql: `WHERE ${where.join(' AND ')}`, params };
}

function normalizeStudent(body) {
  requireFields(body, ['student_no', 'name', 'gender', 'class_id', 'enroll_year']);
  oneOf(body.gender, GENDERS, '性别');
  const status = body.status || '在读';
  oneOf(status, STATUSES, '学籍状态');

  const classId = Number(body.class_id);
  const cls = db.prepare('SELECT id FROM classes WHERE id = ?').get(classId);
  if (!cls) throw bad('班级不存在');

  return {
    student_no: String(body.student_no).trim(),
    name: String(body.name).trim(),
    gender: body.gender,
    birth_date: optionalDate(body.birth_date, '出生日期'),
    class_id: classId,
    phone: optionalString(body.phone, '联系电话', 20),
    email: optionalString(body.email, '邮箱', 100),
    enroll_year: Number(body.enroll_year),
    status,
  };
}

function findStudent(id) {
  const row = db
    .prepare('SELECT * FROM students WHERE id = ? AND is_deleted = 0')
    .get(Number(id));
  if (!row) throw notFound('学生不存在或已删除');
  return row;
}

/** 学号查重（包含已软删除记录，避免恢复冲突） */
function assertStudentNoFree(studentNo, excludeId = 0) {
  const dup = db.prepare('SELECT id FROM students WHERE student_no = ? AND id <> ?').get(studentNo, excludeId);
  if (dup) throw conflict(`学号 ${studentNo} 已存在`);
}

// 列表
router.get('/', requireAuth, wrap((req, res) => {
  const { page, pageSize, offset } = parsePaging(req.query);
  const { whereSql, params } = buildFilter(req);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM students s ${whereSql}`).get(...params).c;
  const list = db
    .prepare(`${LIST_SQL} ${whereSql} ORDER BY s.student_no LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  ok(res, { list, total, page, pageSize });
}));

// 导出（注意：必须放在 /:id 之前，否则 export 会被当成 id）
router.get('/export', requireAuth, wrap((req, res) => {
  const { whereSql, params } = buildFilter(req);
  const rows = db.prepare(`${LIST_SQL} ${whereSql} ORDER BY s.student_no`).all(...params);
  const csv = toCsv(
    [
      { key: 'student_no', title: '学号' },
      { key: 'name', title: '姓名' },
      { key: 'gender', title: '性别' },
      { key: 'class_name', title: '班级' },
      { key: 'department_name', title: '院系' },
      { key: 'phone', title: '联系电话' },
      { key: 'enroll_year', title: '入学年份' },
      { key: 'status', title: '学籍状态' },
    ],
    rows
  );
  writeAudit({
    user: req.user, action: 'export', entity: 'students',
    detail: { rows: rows.length }, ip: req.ip,
  });
  sendCsv(res, `学生名单-${stamp()}.csv`, csv, `students-${stamp()}.csv`);
}));

// 详情
router.get('/:id', requireAuth, wrap((req, res) => {
  const student = findStudent(req.params.id);
  assertClassAccess(req.user, student.class_id);
  const scores = db.prepare(
    `SELECT sc.id, sc.term, sc.exam_type, sc.score, co.name AS course_name, co.credit
     FROM scores sc JOIN courses co ON co.id = sc.course_id
     WHERE sc.student_id = ? ORDER BY sc.term DESC, co.name`
  ).all(student.id);
  const cls = db.prepare(
    'SELECT c.name AS class_name, d.name AS department_name FROM classes c JOIN departments d ON d.id = c.department_id WHERE c.id = ?'
  ).get(student.class_id);
  ok(res, { ...student, ...cls, scores });
}));

// 新增
router.post('/', requireAuth, wrap((req, res) => {
  const data = normalizeStudent(req.body || {});
  assertClassAccess(req.user, data.class_id);
  assertStudentNoFree(data.student_no);

  const info = db.prepare(
    `INSERT INTO students (student_no, name, gender, birth_date, class_id, phone, email, enroll_year, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    data.student_no, data.name, data.gender, data.birth_date, data.class_id,
    data.phone, data.email, data.enroll_year, data.status
  );

  const id = Number(info.lastInsertRowid);
  writeAudit({
    user: req.user, action: 'create', entity: 'students', entityId: id,
    detail: { student_no: data.student_no, name: data.name }, ip: req.ip,
  });
  ok(res, { id }, '新增成功');
}));

// 修改
router.put('/:id', requireAuth, wrap((req, res) => {
  const old = findStudent(req.params.id);
  assertClassAccess(req.user, old.class_id);

  const data = normalizeStudent(req.body || {});
  assertClassAccess(req.user, data.class_id);
  assertStudentNoFree(data.student_no, old.id);

  db.prepare(
    `UPDATE students SET student_no = ?, name = ?, gender = ?, birth_date = ?, class_id = ?,
       phone = ?, email = ?, enroll_year = ?, status = ?, updated_at = datetime('now','localtime')
     WHERE id = ?`
  ).run(
    data.student_no, data.name, data.gender, data.birth_date, data.class_id,
    data.phone, data.email, data.enroll_year, data.status, old.id
  );

  writeAudit({
    user: req.user, action: 'update', entity: 'students', entityId: old.id,
    detail: {
      before: { name: old.name, class_id: old.class_id, status: old.status, phone: old.phone },
      after: { name: data.name, class_id: data.class_id, status: data.status, phone: data.phone },
    },
    ip: req.ip,
  });
  ok(res, { id: old.id }, '保存成功');
}));

// 软删除
router.delete('/:id', requireAuth, wrap((req, res) => {
  const student = findStudent(req.params.id);
  assertClassAccess(req.user, student.class_id);

  db.prepare(
    "UPDATE students SET is_deleted = 1, updated_at = datetime('now','localtime') WHERE id = ?"
  ).run(student.id);

  writeAudit({
    user: req.user, action: 'delete', entity: 'students', entityId: student.id,
    detail: { student_no: student.student_no, name: student.name }, ip: req.ip,
  });
  ok(res, null, '已删除');
}));

export default router;
