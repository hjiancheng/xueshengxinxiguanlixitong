import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { DB_PATH, ROOT } from '../config.js';

/** 单例数据库连接。node:sqlite 是 Node 22.5+ 内置模块，无需编译原生依赖。 */
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

/** 建表（幂等，可重复执行） */
export function initSchema() {
  const sql = fs.readFileSync(path.join(ROOT, 'server', 'db', 'schema.sql'), 'utf8');
  db.exec(sql);
}

/** 库里是否还没有任何业务数据 */
export function isEmpty() {
  return db.prepare('SELECT COUNT(*) AS c FROM departments').get().c === 0;
}

/** 简单事务包装（node:sqlite 没有 better-sqlite3 的 db.transaction） */
export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
