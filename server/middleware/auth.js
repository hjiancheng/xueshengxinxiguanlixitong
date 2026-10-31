import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';
import { db } from '../db/index.js';
import { unauthorized, forbidden } from '../utils/http.js';

/**
 * 第一层：认证。校验 Authorization: Bearer <token>，
 * 每次请求都从数据库读一次用户，保证角色/班级变更立即生效。
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return next(unauthorized());

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return next(unauthorized('登录已过期，请重新登录'));
  }

  const user = db
    .prepare('SELECT id, username, real_name, role, class_id FROM users WHERE id = ?')
    .get(payload.sub);
  if (!user) return next(unauthorized('账号不存在'));

  req.user = user;
  next();
}

/** 第二层：角色。写在路由上，如 requireRole('admin') */
export function requireRole(...roles) {
  return (req, res, next) =>
    roles.includes(req.user.role) ? next() : next(forbidden('该操作仅管理员可用'));
}

/** 第三层：数据范围。admin 返回 null（不限），teacher 返回自己的班级 id */
export function scopeClassId(user) {
  return user.role === 'admin' ? null : user.class_id;
}

/** 教师只能碰自己班的数据；admin 直接放行 */
export function assertClassAccess(user, classId) {
  const scope = scopeClassId(user);
  if (scope !== null && Number(classId) !== Number(scope)) {
    throw forbidden('只能操作本班数据');
  }
}
