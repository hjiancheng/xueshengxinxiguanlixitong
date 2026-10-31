# 学生信息管理系统 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个可一键启动、含 7 个功能模块与角色权限的迷你学生信息管理系统（SSR 静态页 + JSON API）。

**Architecture:** Express 单进程提供 `/api/*` JSON 接口与 `public/` 静态页面；SQLite（Node 24 内置 `node:sqlite`，零原生编译）单文件存储；JWT 鉴权 + 三层校验（认证 → 角色 → 数据范围）；前端零构建，原生 ES Module。

**Tech Stack:** Node 24 / Express 4 / node:sqlite / jsonwebtoken / bcryptjs / 原生 HTML+CSS+JS（ES Module）

> **技术栈变更（相对设计文档 v0.1）**：数据库驱动由 `better-sqlite3` 改为 Node 24 内置 `node:sqlite`。理由：Windows 上无需编译原生模块，`npm install` 只装 3 个纯 JS 包，小白零踩坑；SQL 写法不变。已验证：`node -e "require('node:sqlite')"` 可用（带 ExperimentalWarning，不影响功能）。

---

## 文件结构

```
server/
├── index.js              # 组装 Express、挂路由、错误处理、启动
├── config.js             # 端口 / JWT 密钥 / DB 路径
├── db/
│   ├── schema.sql        # 7 张表 + 索引
│   ├── index.js          # 打开数据库、初始化表
│   └── seed.js           # 演示数据（可重复执行）
├── middleware/
│   ├── auth.js           # requireAuth / requireRole / scopeClassId
│   ├── audit.js          # writeAudit()
│   └── error.js          # 404 + 统一错误处理
├── utils/
│   ├── http.js           # ok() / ApiError / wrap()
│   ├── csv.js            # 带 BOM 的 CSV 生成
│   └── validate.js       # 必填、枚举、范围校验
└── routes/
    ├── auth.js  students.js  classes.js  courses.js
    ├── departments.js  scores.js  audit.js  stats.js
public/
├── login.html  index.html  students.html  classes.html
├── courses.html  scores.html  audit.html
└── assets/
    ├── style.css                     # 复制 prototype/assets/style.css + 追加
    └── js/{api.js, auth.js, ui.js}   # 请求层 / 登录态 / 外壳与组件
test/api.test.mjs        # node --test 接口测试（15 条）
docs/需求说明.md docs/接口文档.md docs/测试记录.md
README.md
```

职责边界：`routes/*` 只做参数校验与编排，不写复杂 SQL 拼接逻辑之外的东西；`utils/*` 无业务语义；`public/assets/js/ui.js` 唯一负责页面外壳与通用组件，页面内联脚本只写本页逻辑。

---

## Task 1: 工程骨架与统一响应

**Files:** Create `package.json`, `.gitignore`(已存在), `server/config.js`, `server/utils/http.js`, `server/middleware/error.js`, `server/index.js`

- [ ] **Step 1: 建 package.json**

```json
{
  "name": "student-info-management",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server/index.js",
    "seed": "node server/db/seed.js",
    "test": "node --test test/"
  },
  "dependencies": { "bcryptjs": "^2.4.3", "express": "^4.21.2", "jsonwebtoken": "^9.0.2" }
}
```

- [ ] **Step 2: 写统一响应与错误**

`server/utils/http.js`：`ApiError(status,message)`；`ok(res,data)` → `{code:0,message:'ok',data}`；快捷构造 `bad/unauthorized/forbidden/notFound/conflict`；`wrap(fn)` 捕获 async 异常转 `next`。

- [ ] **Step 3: 写错误处理中间件**

`server/middleware/error.js`：`notFoundHandler` 返回 404 `{code:404,...}`；`errorHandler` 取 `err.status || 500`，500 时 `console.error` 但不回传堆栈。

- [ ] **Step 4: 写 config + 最小 index.js**

`config.js` 导出 `PORT(3000)`、`JWT_SECRET`（env 可覆盖，默认 demo 值）、`DB_PATH`、`ROOT`。
`index.js` 挂 `express.json()`、`express.static('public')`、`GET /api/health` 返回 `{status:'ok',time}`，末尾 `404` + 错误处理。

- [ ] **Step 5: 验证**

```bash
npm install && npm start &
curl -s http://localhost:3000/api/health
```
Expected: `{"code":0,"message":"ok","data":{"status":"ok",...}}`

- [ ] **Step 6: Commit** `feat: 工程骨架与统一响应`

---

## Task 2: 数据库建表与演示数据

**Files:** Create `server/db/schema.sql`, `server/db/index.js`, `server/db/seed.js`

- [ ] **Step 1: 写 schema.sql（7 张表）**

关键 DDL（完整版按设计文档 6.2 节字段）：

```sql
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  name TEXT NOT NULL,
  grade_year INTEGER NOT NULL,
  head_teacher_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK(gender IN ('男','女')),
  birth_date TEXT,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  phone TEXT, email TEXT,
  enroll_year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT '在读' CHECK(status IN ('在读','休学','毕业')),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  credit REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  course_id INTEGER NOT NULL REFERENCES courses(id),
  term TEXT NOT NULL,
  exam_type TEXT NOT NULL DEFAULT '期末' CHECK(exam_type IN ('期末','平时','补考')),
  score REAL NOT NULL CHECK(score >= 0 AND score <= 100),
  updated_by INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(student_id, course_id, term, exam_type)
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  real_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','teacher')),
  class_id INTEGER REFERENCES classes(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_name  ON students(name);
CREATE INDEX IF NOT EXISTS idx_scores_student ON scores(student_id);
CREATE INDEX IF NOT EXISTS idx_scores_course  ON scores(course_id);
CREATE INDEX IF NOT EXISTS idx_audit_created  ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_classes_dept    ON classes(department_id);
```

注意：`classes.head_teacher_id REFERENCES users(id)` 而 `users` 后建 —— SQLite 允许（外键检查在写入时生效），保持建表顺序为 departments → classes → students → courses → scores → users → audit_logs，但 `PRAGMA foreign_keys` 打开时 `users.class_id REFERENCES classes(id)` 与 `classes.head_teacher_id REFERENCES users(id)` 互为引用，插入时先插 classes（head_teacher_id 为 NULL）再插 users 再 UPDATE，可满足约束。

- [ ] **Step 2: 写 db/index.js**

```js
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { DB_PATH, ROOT } from '../config.js';
export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
export function initSchema() {
  db.exec(fs.readFileSync(path.join(ROOT, 'server/db/schema.sql'), 'utf8'));
}
```

- [ ] **Step 3: 写 seed.js（幂等）**

3 院系、10 班级、6 课程、200 学生、5 门课×成绩约 1000 条、2 账号（admin/teacher，密码 123456，bcrypt 哈希）；顶部 `if (count(departments)>0) return;` 保证重复执行不重复插入；姓名、手机号全为虚构；随机数用固定种子 LCG 保证每次数据一致（便于测试断言与答辩演示）。

- [ ] **Step 4: 验证**

```bash
npm run seed && node -e "import('./server/db/index.js').then(({db})=>{console.log(db.prepare('select count(*) c from students').get(), db.prepare('select count(*) c from scores').get())})"
```
Expected: `{ c: 200 } { c: ~1000 }`

- [ ] **Step 5: Commit** `feat: 数据库建表与演示数据`

---

## Task 3: 登录与 JWT 鉴权

**Files:** Create `server/routes/auth.js`, `server/middleware/auth.js`; Modify `server/index.js`

- [ ] **Step 1: 中间件**

```js
// middleware/auth.js
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';
import { db } from '../db/index.js';
import { unauthorized, forbidden } from '../utils/http.js';

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare(
      'SELECT id, username, real_name, role, class_id FROM users WHERE id = ?'
    ).get(payload.sub);
    if (!user) return next(unauthorized('账号不存在'));
    req.user = user;
    next();
  } catch {
    next(unauthorized('登录已过期，请重新登录'));
  }
}

export function requireRole(...roles) {
  return (req, res, next) =>
    roles.includes(req.user.role) ? next() : next(forbidden('该操作仅管理员可用'));
}

export const scopeClassId = (user) => (user.role === 'admin' ? null : user.class_id);
```

- [ ] **Step 2: 登录接口**

`POST /api/auth/login`：校验 `username/password` 非空 → 查用户 → `bcrypt.compareSync` → 失败统一返回 `401 用户名或密码错误`（不区分不存在/密码错）→ 成功 `jwt.sign({sub:user.id, role:user.role}, JWT_SECRET, {expiresIn:'2h'})` → 写 audit `login` → 返回 `{token, user}`（**不含 password_hash**）。

- [ ] **Step 3: me / logout**

`GET /api/auth/me` → 返回当前用户 + 班级名 + 权限范围描述；`POST /api/auth/logout` → 写 audit 后返回 ok（JWT 无状态，前端清 token）。

- [ ] **Step 4: 验证**

```bash
curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"123456"}'
curl -s localhost:3000/api/auth/me
```
Expected: 第一条返回 token + role=admin；第二条（无头）返回 401。

- [ ] **Step 5: Commit** `feat: 登录与 JWT 鉴权`

---

## Task 4: 学生 CRUD（含搜索、分页、软删除、范围控制）

**Files:** Create `server/routes/students.js`; Modify `server/index.js`

- [ ] **Step 1: 列表接口**

```js
router.get('/', requireAuth, wrap((req, res) => {
  const { keyword = '', classId, status } = req.query;
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 10, 1), 100);
  const scope = scopeClassId(req.user);
  const where = ['s.is_deleted = 0'];
  const params = [];
  if (scope != null) { where.push('s.class_id = ?'); params.push(scope); }
  if (keyword) { where.push('(s.name LIKE ? OR s.student_no LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
  if (classId) { where.push('s.class_id = ?'); params.push(Number(classId)); }
  if (status)  { where.push('s.status = ?');   params.push(status); }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) AS c FROM students s ${whereSql}`).get(...params).c;
  const list = db.prepare(`
    SELECT s.id, s.student_no, s.name, s.gender, s.birth_date, s.class_id,
           s.phone, s.email, s.enroll_year, s.status, s.created_at,
           c.name AS class_name, d.name AS department_name
    FROM students s
    JOIN classes c ON c.id = s.class_id
    JOIN departments d ON d.id = c.department_id
    ${whereSql}
    ORDER BY s.student_no LIMIT ? OFFSET ?`
  ).all(...params, pageSize, (page - 1) * pageSize);
  ok(res, { list, total, page, pageSize });
}));
```

- [ ] **Step 2: 写接口（POST/PUT/DELETE）+ 校验**

必填：`student_no/name/gender/class_id/enroll_year`；`gender` ∈ 男/女；`status` ∈ 在读/休学/毕业。
学号重复（含已软删除记录）→ 409。
教师只能操作 `class_id === req.user.class_id` 的数据，否则 403（POST 校验 body.class_id，PUT/DELETE 校验库中记录）。
每次写操作 `writeAudit(req, {action:'create'|'update'|'delete', entity:'students', entityId, detail})`，PUT 的 detail 含改动前后值。
DELETE 只执行 `UPDATE students SET is_deleted=1, updated_at=...`。

- [ ] **Step 3: 验证**

```bash
# 登录拿 token 后
curl -s "localhost:3000/api/students?keyword=张&pageSize=5" -H "Authorization: Bearer $T"
curl -s -X DELETE localhost:3000/api/students/1 -H "Authorization: Bearer $T"
curl -s "localhost:3000/api/students?classId=1" -H "Authorization: Bearer $TEACHER_T"   # 只能看到 1 班
```
Expected: 列表含 `class_name`；删除后该学生不再出现；教师访问他班返回 403 或空集。

- [ ] **Step 4: Commit** `feat: 学生 CRUD 与范围控制`

---

## Task 5: 院系 / 班级 / 课程

**Files:** Create `server/routes/departments.js`, `server/routes/classes.js`, `server/routes/courses.js`

- [ ] **Step 1: 院系**

GET 公开给登录用户（下拉框用）；POST/PUT/DELETE 仅 admin；删除时若存在班级 → 409 `该院系下还有班级，无法删除`。

- [ ] **Step 2: 班级**

GET 返回 `id, name, grade_year, department_id, department_name, head_teacher_id, head_teacher_name, student_count`（LEFT JOIN users + 子查询统计人数）。
POST/PUT 仅 admin；PUT 若传 `head_teacher_id`，在同一事务中：更新 `classes.head_teacher_id` + 更新该教师 `users.class_id`，并把原班主任的 `users.class_id` 置 NULL。

- [ ] **Step 3: 课程**

GET 登录可见；写操作 admin；`code` 重复 → 409。

- [ ] **Step 4: 验证与 Commit**

```bash
curl -s localhost:3000/api/classes -H "Authorization: Bearer $T"
curl -s -X POST localhost:3000/api/courses -H "Authorization: Bearer $TEACHER_T" -H 'Content-Type: application/json' -d '{"code":"X","name":"Y","credit":1}'
```
Expected: 班级含 `student_count`；教师建课程 403。

`feat: 院系班级课程接口`

---

## Task 6: 成绩录入与统计

**Files:** Create `server/routes/scores.js`

- [ ] **Step 1: 查询**

`GET /api/scores?classId&courseId&term&studentId`：JOIN students/classes/courses，返回 `student_no, student_name, class_name, course_name, term, exam_type, score`；教师强制 `st.class_id = ?`；默认按 `student_no` 排序，支持 `page/pageSize`。

- [ ] **Step 2: 写入与唯一冲突**

POST/PUT/DELETE；教师范围校验同学生模块。
插入用 try/catch：`err.code === 'ERR_SQLITE_ERROR'` 或 message 含 `UNIQUE` → `conflict('该学生此课程/学期/考试类型已有成绩')`。
score 校验 `0 ≤ score ≤ 100` 且为数字 → 否则 400。
record 的 `updated_by = req.user.id`、`updated_at = datetime('now','localtime')`。

- [ ] **Step 3: 统计**

`GET /api/scores/stats?classId&courseId&term`：

```js
SELECT COUNT(*) AS total,
       ROUND(AVG(score), 1) AS avg,
       SUM(CASE WHEN score >= 60 THEN 1 ELSE 0 END) AS pass,
       SUM(CASE WHEN score >= 90 THEN 1 ELSE 0 END) AS excellent,
       SUM(CASE WHEN score < 60  THEN 1 ELSE 0 END) AS fail
FROM scores sc JOIN students st ON st.id = sc.student_id
WHERE st.is_deleted = 0 {scope} {filters}
```
返回 `{total, avg, passRate, excellent, distribution:[{label:'90-100',count},...]}`，无数据时 `avg=0, passRate=0`（不返回 null）。

- [ ] **Step 4: 验证与 Commit**

```bash
curl -s -X POST localhost:3000/api/scores -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"student_id":1,"course_id":1,"term":"2026-2027-1","exam_type":"期末","score":88}'
# 再执行一次 → 409
```
`feat: 成绩录入、唯一校验与统计`

---

## Task 7: 导出、审计日志、概览统计

**Files:** Create `server/utils/csv.js`, `server/middleware/audit.js`, `server/routes/audit.js`, `server/routes/stats.js`

- [ ] **Step 1: CSV**

```js
export function toCsv(columns, rows) {
  const head = columns.map((c) => c.title).join(',');
  const body = rows.map((r) => columns.map((c) => {
    const s = String(r[c.key] ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
  return '\uFEFF' + head + '\r\n' + body;   // BOM：Excel 双击不乱码
}
```
导出接口 `GET /api/students/export`：响应头 `Content-Type: text/csv; charset=utf-8`、`Content-Disposition: attachment; filename*=UTF-8''students.csv`，并写 audit `export`。

- [ ] **Step 2: 审计**

`writeAudit(req, {...})` 见设计文档 6.2 节；`GET /api/audit-logs` 仅 admin，支持 `action/entity` 过滤与分页，按 `created_at DESC, id DESC`。

- [ ] **Step 3: 概览**

`GET /api/stats/overview`：学生数、班级数、平均分、及格率、班级人数分布（前 8）、成绩分段分布、最近 5 条日志。教师返回本班口径。

- [ ] **Step 4: 验证与 Commit**

```bash
curl -s localhost:3000/api/students/export -H "Authorization: Bearer $T" -o out.csv; head -c 60 out.csv | xxd | head -2
```
Expected: 前三字节 `ef bb bf`（BOM）。`feat: CSV 导出、审计日志与概览统计`

---

## Task 8: 前端公共层

**Files:** Create `public/assets/style.css`（复制原型并追加）, `public/assets/js/api.js`, `public/assets/js/auth.js`, `public/assets/js/ui.js`

- [ ] **Step 1: 样式**

`copy prototype/assets/style.css public/assets/style.css`，追加：`.table tbody tr:hover`、`.loading`、`.err`、`.btn-link`、`.row-actions`、`.tag`、`.chart-legend`。

- [ ] **Step 2: api.js**

```js
const TOKEN_KEY = 'sis_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) { clearToken(); location.href = 'login.html'; throw new Error('未登录'); }
  const json = await res.json().catch(() => ({ code: res.status, message: '服务器返回异常' }));
  if (!res.ok || json.code !== 0) throw new Error(json.message || '请求失败');
  return json.data;
}
export const api = {
  login: (username, password) => request('/api/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request('/api/auth/me'),
  students: (q) => request(`/api/students?${new URLSearchParams(q)}`),
  createStudent: (b) => request('/api/students', { method: 'POST', body: b }),
  updateStudent: (id, b) => request(`/api/students/${id}`, { method: 'PUT', body: b }),
  deleteStudent: (id) => request(`/api/students/${id}`, { method: 'DELETE' }),
  classes: () => request('/api/classes'),
  departments: () => request('/api/departments'),
  courses: () => request('/api/courses'),
  scores: (q) => request(`/api/scores?${new URLSearchParams(q)}`),
  createScore: (b) => request('/api/scores', { method: 'POST', body: b }),
  updateScore: (id, b) => request(`/api/scores/${id}`, { method: 'PUT', body: b }),
  deleteScore: (id) => request(`/api/scores/${id}`, { method: 'DELETE' }),
  scoreStats: (q) => request(`/api/scores/stats?${new URLSearchParams(q)}`),
  overview: () => request('/api/stats/overview'),
  auditLogs: (q) => request(`/api/audit-logs?${new URLSearchParams(q)}`),
};
```

- [ ] **Step 3: auth.js**

`requireLogin()`：无 token → 跳 login.html；有则 `api.me()` 缓存到 `currentUser()`；`isAdmin()`；`logout()` 清 token 跳登录。

- [ ] **Step 4: ui.js**

导出：`mountShell({active, title, crumb})` 渲染侧栏（6 项，日志仅 admin 可见）+ 顶栏（真实姓名 + 角色徽标 + 退出）；`toast(msg, type)`；`openModal(id)`/`closeModal(id)`；`renderPager(el, {page,pageSize,total}, onChange)`；`statusBadge(status)`；`escapeHtml(s)`；`fmtDate(s)`。

- [ ] **Step 5: Commit** `feat: 前端公共层`

---

## Task 9: 前端页面（7 个）

**Files:** Create `public/login.html`, `public/index.html`, `public/students.html`, `public/classes.html`, `public/courses.html`, `public/scores.html`, `public/audit.html`

- [ ] **Step 1: login.html**

表单提交 → `api.login` → `setToken` → 跳 `index.html`；失败在表单内显示红字错误；演示账号提示「admin/123456 · teacher/123456」。

- [ ] **Step 2: 仪表盘 index.html**

`api.overview()` 填 4 张统计卡 + 两个分布（CSS 条形）+ 最近操作表；加载中骨架、失败重试按钮。

- [ ] **Step 3: 学生列表 students.html（重点页）**

工具栏（关键词、班级下拉、状态下拉、重置、导出、新增）→ 表格 → 分页；新增/编辑共用弹窗，提交前前端校验学号/姓名非空；删除 `confirm` 后调接口；成功后 toast + 刷新当前页；分页保留筛选条件（state 对象）；导出用 `location.href='/api/students/export?token=...'` 不可行 → 改用 fetch + blob 下载。

- [ ] **Step 4: 班级 / 课程 / 成绩 / 日志页**

班级页：列表 + 新增编辑弹窗（院系、班主任）；课程页：列表 + 弹窗；成绩页：班级+课程+学期筛选、录入弹窗、删除、下方统计卡与分段条；日志页：表格 + 动作筛选 + 分页。

- [ ] **Step 5: 验证**

```bash
npm start  # 浏览器打开 http://localhost:3000/login.html，admin/123456 登录
```
逐项走查：登录 → 仪表盘有数 → 学生增删改查 → 教师账号只看 1 班 → 成绩录入重复报 409 提示 → 导出能打开 → 日志有记录。

- [ ] **Step 6: Commit** `feat: 前端 7 个页面`

---

## Task 10: 接口测试与文档

**Files:** Create `test/api.test.mjs`, `README.md`, `docs/需求说明.md`, `docs/接口文档.md`, `docs/测试记录.md`

- [ ] **Step 1: 测试**

`test/api.test.mjs` 用 `node:test`：先 `DB_PATH=test.db` 建库+seed，`app.listen(0)` 取随机端口，`fetch` 断言 15 条用例：健康检查、登录成功/失败、无 token 401、me、学生列表分页/关键词、学生新增 400、学号重复 409、教师越权 403、教师只能看本班、成绩重复 409、成绩越界 400、统计数值、导出 BOM、日志仅 admin。

- [ ] **Step 2: 跑测试**

```bash
npm test
```
Expected: `# pass 15` `# fail 0`

- [ ] **Step 3: 文档**

README：安装、启动、账号、目录结构、常见问题（端口占用/重置数据）；接口文档：每接口方法、路径、参数、响应示例、错误码；测试记录：用例表 + 实际结果 + 截图位（文字描述）；需求说明：功能清单与验收标准。

- [ ] **Step 4: Commit** `test: 接口测试与交付文档`

---

## 自审

- **Spec 覆盖**：F1 学生（Task 4、9）· F2 班级院系（Task 5、9）· F3 课程（Task 5、9）· F4 成绩（Task 6、9）· F5 登录权限（Task 3、4、5）· F6 统计（Task 6、7、9）· F7 导出（Task 7、9）· F8 日志（Task 7、9）。非功能：端口/依赖/安全/兼容均在 Task 1、3、8 落地。
- **Spec 缺口补丁**：设计文档第 7 节接口表缺 `GET /api/stats/overview`（仪表盘 4 张卡需要），已在本计划 Task 7 补齐，实施后同步更新设计文档。
- **偏差声明**：① 数据库驱动 better-sqlite3 → node:sqlite；② 图表用 CSS 条形替代 Chart.js（离线可用、少一个 CDN 依赖）。两处都在交付时写进 README「与设计文档的差异」。
- **命名一致性**：`ok/wrap/ApiError`、`requireAuth/requireRole/scopeClassId`、`writeAudit`、`toCsv`、`mountShell` 在各任务中同名复用。
