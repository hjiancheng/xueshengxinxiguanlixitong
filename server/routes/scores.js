import express from 'express';
import { db } from '../db/index.js';
import { requireAuth, scopeClassId, assertClassAccess } from '../middleware/auth.js';
import { writeAudit } from '../middleware/audit.js';
import { ok, wrap, bad, notFound, conflict, forbidden } from '../utils/http.js';
import { requireFields, toNumberInRange, parsePaging, oneOf } from '../utils/validate.js';

const router = express.Router();
const EXAM_TYPES = ['期末', '平时', '补考'];

const BASE_SQL = `
  SELECT sc.id, sc.student_id, sc.course_id, sc.term, sc.exam_type, sc.score, sc.updated_at,
         st.student_no, st.name AS student_name, st.class_id,
         c.name AS class_name,
         co.code AS course_code, co.name AS course_name, co.credit
  FROM scores sc
  JOIN students st ON st.id = sc.student_id
  JOIN classes  c  ON c.id  = st.class_id
  JOIN courses  co ON co.id = sc.course_id
`;

/** 构造 WHERE（含教师范围） */
function buildFilter(req) {
  const { classId, courseId, term, studentId, examType } = req.query;
  const where = ['st.is_deleted = 0'];
  const params = [];

  const scope = scopeClassId(req.user);
  if (scope !== null) {
    where.push('st.class_id = ?');
    params.push(scope);
  }
  if (classId) { where.push('st.class_id = ?'); params.push(Number(classId)); }
  if (courseId) { where.push('sc.course_id = ?'); params.push(Number(courseId)); }
  if (term) { where.push('sc.term = ?'); params.push(String(term)); }
  if (studentId) { where.push('sc.student_id = ?'); params.push(Number(studentId)); }
  if (examType) { where.push('sc.exam_type = ?'); params.push(String(examType)); }

  return { whereSql: `WHERE ${where.join(' AND ')}`, params };
}

function findScore(id) {
  const row = db.prepare(`${BASE_SQL} WHERE sc.id = ?`).get(Number(id));
  if (!row) throw notFound('成绩记录不存在');
  return row;
}

function assertScoreScope(user, studentId) {
  const stu = db.prepare('SELECT id, class_id, name FROM students WHERE id = ? AND is_deleted = 0').get(studentId);
  if (!stu) throw bad('学生不存在或已删除');
  assertClassAccess(user, stu.class_id);
  return stu;
}

/** 唯一冲突统一翻译成 409 */
function isUniqueError(err) {
  return /UNIQUE constraint failed/i.test(err?.message || '');
}

// 查询
router.get('/', requireAuth, wrap((req, res) => {
  const { page, pageSize, offset } = parsePaging(req.query, 20);
  const { whereSql, params } = buildFilter(req);
  const total = db.prepare(
    `SELECT COUNT(*) AS c FROM scores sc
     JOIN students st ON st.id = sc.student_id
     ${whereSql}`
  ).get(...params).c;
  const list = db
    .prepare(`${BASE_SQL} ${whereSql} ORDER BY st.student_no, co.code LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  ok(res, { list, total, page, pageSize });
}));

// 统计（必须在 /:id 之前）
router.get('/stats', requireAuth, wrap((req, res) => {
  const { whereSql, params } = buildFilter(req);
  const row = db.prepare(
    `SELECT COUNT(*) AS total,
            COALESCE(ROUND(AVG(sc.score), 1), 0) AS avg,
            COALESCE(SUM(CASE WHEN sc.score >= 60 THEN 1 ELSE 0 END), 0) AS pass,
            COALESCE(SUM(CASE WHEN sc.score >= 90 THEN 1 ELSE 0 END), 0) AS excellent,
            COALESCE(SUM(CASE WHEN sc.score < 60 THEN 1 ELSE 0 END), 0) AS fail
     FROM scores sc JOIN students st ON st.id = sc.student_id
     ${whereSql}`
  ).get(...params);

  const buckets = db.prepare(
    `SELECT
       SUM(CASE WHEN sc.score >= 90 THEN 1 ELSE 0 END) AS b90,
       SUM(CASE WHEN sc.score >= 80 AND sc.score < 90 THEN 1 ELSE 0 END) AS b80,
       SUM(CASE WHEN sc.score >= 70 AND sc.score < 80 THEN 1 ELSE 0 END) AS b70,
       SUM(CASE WHEN sc.score >= 60 AND sc.score < 70 THEN 1 ELSE 0 END) AS b60,
       SUM(CASE WHEN sc.score < 60 THEN 1 ELSE 0 END) AS b0
     FROM scores sc JOIN students st ON st.id = sc.student_id
     ${whereSql}`
  ).get(...params);

  const total = row.total || 0;
  ok(res, {
    total,
    avg: row.avg || 0,
    passRate: total ? Math.round((row.pass / total) * 1000) / 10 : 0,
    excellent: row.excellent || 0,
    fail: row.fail || 0,
    distribution: [
      { label: '90-100', count: buckets.b90 || 0 },
      { label: '80-89', count: buckets.b80 || 0 },
      { label: '70-79', count: buckets.b70 || 0 },
      { label: '60-69', count: buckets.b60 || 0 },
      { label: '60 以下', count: buckets.b0 || 0 },
    ],
  });
}));

// 录入
router.post('/', requireAuth, wrap((req, res) => {
  const body = req.body || {};
  requireFields(body, ['student_id', 'course_id', 'term', 'score']);
  const examType = body.exam_type || '期末';
  oneOf(examType, EXAM_TYPES, '考试类型');
  const score = toNumberInRange(body.score, '分数', 0, 100);
  const studentId = Number(body.student_id);
  const courseId = Number(body.course_id);
  const term = String(body.term).trim();

  const stu = assertScoreScope(req.user, studentId);
  if (!db.prepare('SELECT id FROM courses WHERE id = ?').get(courseId)) throw bad('课程不存在');

  let info;
  try {
    info = db.prepare(
      `INSERT INTO scores (student_id, course_id, term, exam_type, score, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(studentId, courseId, term, examType, score, req.user.id);
  } catch (err) {
    if (isUniqueError(err)) throw conflict('该学生在这门课/学期/考试类型下已有成绩');
    throw err;
  }

  const id = Number(info.lastInsertRowid);
  writeAudit({
    user: req.user, action: 'create', entity: 'scores', entityId: id,
    detail: { student: stu.name, course_id: courseId, term, score }, ip: req.ip,
  });
  ok(res, { id }, '录入成功');
}));

// 修改分数
router.put('/:id', requireAuth, wrap((req, res) => {
  const old = findScore(req.params.id);
  assertClassAccess(req.user, old.class_id);

  const body = req.body || {};
  requireFields(body, ['score']);
  const score = toNumberInRange(body.score, '分数', 0, 100);

  db.prepare(
    "UPDATE scores SET score = ?, updated_by = ?, updated_at = datetime('now','localtime') WHERE id = ?"
  ).run(score, req.user.id, old.id);

  writeAudit({
    user: req.user, action: 'update', entity: 'scores', entityId: old.id,
    detail: { student: old.student_name, course: old.course_name, before: old.score, after: score },
    ip: req.ip,
  });
  ok(res, { id: old.id }, '保存成功');
}));

// 删除
router.delete('/:id', requireAuth, wrap((req, res) => {
  const old = findScore(req.params.id);
  assertClassAccess(req.user, old.class_id);

  db.prepare('DELETE FROM scores WHERE id = ?').run(old.id);
  writeAudit({
    user: req.user, action: 'delete', entity: 'scores', entityId: old.id,
    detail: { student: old.student_name, course: old.course_name, score: old.score }, ip: req.ip,
  });
  ok(res, null, '已删除');
}));

export default router;
