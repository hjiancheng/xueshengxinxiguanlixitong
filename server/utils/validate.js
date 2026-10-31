import { bad } from './http.js';

/** 校验必填字段（空字符串、null、undefined 都算缺失） */
export function requireFields(obj, fields) {
  const missing = fields.filter(
    (f) => obj[f] === undefined || obj[f] === null || String(obj[f]).trim() === ''
  );
  if (missing.length) throw bad(`缺少必填字段：${missing.join('、')}`);
}

/** 枚举校验 */
export function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw bad(`${label || '取值'}必须是：${allowed.join(' / ')}`);
  }
  return value;
}

/** 转整数并做范围校验 */
export function toInt(value, label, { min, max } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n)) throw bad(`${label}必须是整数`);
  if (min !== undefined && n < min) throw bad(`${label}不能小于 ${min}`);
  if (max !== undefined && n > max) throw bad(`${label}不能大于 ${max}`);
  return n;
}

/** 转数字（允许小数）并做范围校验 */
export function toNumberInRange(value, label, min, max) {
  const n = Number(value);
  if (Number.isNaN(n)) throw bad(`${label}必须是数字`);
  if (n < min || n > max) throw bad(`${label}必须在 ${min} ~ ${max} 之间`);
  return n;
}

/** 可选字符串字段：空值转 null，限制长度 */
export function optionalString(value, label, maxLen = 100) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const s = String(value).trim();
  if (s.length > maxLen) throw bad(`${label}长度不能超过 ${maxLen}`);
  return s;
}

/** 可选日期：仅接受 YYYY-MM-DD */
export function optionalDate(value, label) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw bad(`${label}格式应为 YYYY-MM-DD`);
  return s;
}

/** 分页参数：页码从 1 开始，每页 1~100 */
export function parsePaging(query, defaultSize = 10) {
  const page = Math.max(Number(query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(query.pageSize) || defaultSize, 1), 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}
