import { db } from '../db/index.js';

/**
 * 写一条操作日志。
 * 显式传入 user，而不是依赖 req.user —— 登录接口此时还没有 req.user。
 */
export function writeAudit({ user = null, action, entity, entityId = null, detail = null, ip = null }) {
  try {
    db.prepare(
      `INSERT INTO audit_logs (user_id, username, action, entity, entity_id, detail, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`
    ).run(
      user?.id ?? 0,
      user?.username ?? 'anonymous',
      action,
      entity,
      entityId === null || entityId === undefined ? null : String(entityId),
      detail ? JSON.stringify(detail) : null,
      ip
    );
  } catch (err) {
    // 日志失败不能中断业务
    console.error('[audit] 写入失败', err.message);
  }
}
