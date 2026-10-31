import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { writeAudit } from '../middleware/audit.js';
import { ok, wrap, unauthorized } from '../utils/http.js';
import { requireFields } from '../utils/validate.js';

const router = express.Router();

/** 对外返回的用户信息：绝不包含 password_hash */
function publicUser(user) {
  const cls = user.class_id
    ? db.prepare('SELECT name FROM classes WHERE id = ?').get(user.class_id)
    : null;
  return {
    id: user.id,
    username: user.username,
    real_name: user.real_name,
    role: user.role,
    class_id: user.class_id,
    class_name: cls?.name ?? null,
    scope: user.role === 'admin' ? '全校数据' : `仅 ${cls?.name ?? '本班'} 数据`,
  };
}

router.post('/login', wrap((req, res) => {
  const { username, password } = req.body || {};
  requireFields({ username, password }, ['username', 'password']);

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim());
  // 用户不存在与密码错误返回同一句提示，避免账号探测
  const passOk = user ? bcrypt.compareSync(String(password), user.password_hash) : false;
  if (!passOk) throw unauthorized('用户名或密码错误');

  const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
  writeAudit({ user, action: 'login', entity: 'users', entityId: user.id, ip: req.ip });
  ok(res, { token, user: publicUser(user) });
}));

router.get('/me', requireAuth, wrap((req, res) => ok(res, publicUser(req.user))));

router.post('/logout', requireAuth, wrap((req, res) => {
  writeAudit({ user: req.user, action: 'logout', entity: 'users', entityId: req.user.id, ip: req.ip });
  ok(res, null, '已退出');
}));

export default router;
