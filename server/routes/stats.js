import express from 'express';
import { db } from '../db/index.js';
import { requireAuth, scopeClassId } from '../middleware/auth.js';
import { ok, wrap } from '../utils/http.js';

const router = express.Router();

/** 仪表盘概览：4 张卡片 + 两个分布 + 最近操作。教师只看本班口径。 */
router.get('/overview', requireAuth, wrap((req, res) => {
  const scope = scopeClassId(req.user);
  const scopeSql = scope === null ? '' : ' AND s.class_id = ?';
  const scopeParams = scope === null ? [] : [scope];

  const studentCount = db.prepare(
    `SELECT COUNT(*) AS c FROM students s WHERE s.is_deleted = 0${scopeSql}`
  ).get(...scopeParams).c;

  const classCount = scope === null
    ? db.prepare('SELECT COUNT(*) AS c FROM classes').get().c
    : 1;

  const agg = db.prepare(
    `SELECT COUNT(*) AS total,
            COALESCE(ROUND(AVG(sc.score), 1), 0) AS avg,
            COALESCE(SUM(CASE WHEN sc.score >= 60 THEN 1 ELSE 0 END), 0) AS pass
     FROM scores sc JOIN students s ON s.id = sc.student_id
     WHERE s.is_deleted = 0${scopeSql}`
  ).get(...scopeParams);

  const classDistribution = db.prepare(
    `SELECT c.name, COUNT(s.id) AS count
     FROM classes c
     LEFT JOIN students s ON s.class_id = c.id AND s.is_deleted = 0
     ${scope === null ? '' : 'WHERE c.id = ?'}
     GROUP BY c.id ORDER BY c.id`
  ).all(...scopeParams);

  const buckets = db.prepare(
    `SELECT
       SUM(CASE WHEN sc.score >= 90 THEN 1 ELSE 0 END) AS b90,
       SUM(CASE WHEN sc.score >= 80 AND sc.score < 90 THEN 1 ELSE 0 END) AS b80,
       SUM(CASE WHEN sc.score >= 70 AND sc.score < 80 THEN 1 ELSE 0 END) AS b70,
       SUM(CASE WHEN sc.score >= 60 AND sc.score < 70 THEN 1 ELSE 0 END) AS b60,
       SUM(CASE WHEN sc.score < 60 THEN 1 ELSE 0 END) AS b0
     FROM scores sc JOIN students s ON s.id = sc.student_id
     WHERE s.is_deleted = 0${scopeSql}`
  ).get(...scopeParams);

  const logSql = scope === null ? '' : 'WHERE user_id = ?';
  const recentLogs = db.prepare(
    `SELECT id, username, action, entity, entity_id, created_at
     FROM audit_logs ${logSql} ORDER BY created_at DESC, id DESC LIMIT 5`
  ).all(...scopeParams);

  ok(res, {
    studentCount,
    classCount,
    avgScore: agg.avg || 0,
    passRate: agg.total ? Math.round((agg.pass / agg.total) * 1000) / 10 : 0,
    totalScores: agg.total || 0,
    classDistribution: classDistribution.map((r) => ({ label: r.name, count: r.count })),
    scoreDistribution: [
      { label: '90-100', count: buckets.b90 || 0 },
      { label: '80-89', count: buckets.b80 || 0 },
      { label: '70-79', count: buckets.b70 || 0 },
      { label: '60-69', count: buckets.b60 || 0 },
      { label: '60 以下', count: buckets.b0 || 0 },
    ],
    recentLogs,
  });
}));

export default router;
