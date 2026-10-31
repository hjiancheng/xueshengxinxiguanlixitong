import express from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ok, wrap } from '../utils/http.js';

const router = express.Router();

/** 账号列表：仅管理员可见，供「指定班主任」下拉使用。绝不返回密码哈希。 */
router.get('/', requireAuth, requireRole('admin'), wrap((req, res) => {
  const list = db.prepare(
    `SELECT u.id, u.username, u.real_name, u.role, u.class_id, c.name AS class_name
     FROM users u LEFT JOIN classes c ON c.id = u.class_id
     ORDER BY u.role, u.id`
  ).all();
  ok(res, list);
}));

export default router;
