import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 项目根目录（含 server/、public/、docs/） */
export const ROOT = path.resolve(HERE, '..');

/** 服务端口，默认 3000 */
export const PORT = Number(process.env.PORT || 3000);

/** JWT 签名密钥：演示项目给默认值，生产必须用环境变量覆盖 */
export const JWT_SECRET =
  process.env.JWT_SECRET || 'sis-demo-secret-2026-change-in-production';

/** JWT 有效期 2 小时 */
export const JWT_EXPIRES_IN = '2h';

/** SQLite 数据文件路径，可用 DB_PATH 覆盖（测试时指向临时库） */
export const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'school.db');
