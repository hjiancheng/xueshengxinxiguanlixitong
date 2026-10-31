# 学生信息管理系统 · 设计文档

- 版本：v0.1
- 日期：2026-10-31
- 状态：待用户评审
- 定位：课程作业 / 毕业设计级（可演示、可答辩）
- 原型：`prototype/login.html`、`prototype/index.html`、`prototype/students.html`

---

## 1. 项目概述

一个面向单所院校的迷你教务系统，核心是**学生档案 + 成绩**的管理与统计。目标是两周内交付一个结构完整、能稳定演示、经得起答辩追问的 Web 应用。

**明确不做**（YAGNI）：选课、排课、考勤、缴费、家校沟通、消息推送、移动 App、多租户、微服务、高可用集群。

### 1.1 成功标准

| 维度 | 标准 |
|---|---|
| 功能 | F1–F8 八个模块全部可用，主流程无阻断性缺陷 |
| 演示 | 一条命令启动，预置演示数据，5 分钟内完整演示 |
| 答辩 | 能讲清楚架构分层、ER 关系、权限模型、审计设计 |
| 文档 | 需求、设计、接口、测试、部署五份文档齐全 |

---

## 2. 用户与角色

| 角色 | 说明 | 数据范围 |
|---|---|---|
| 管理员 admin | 教务管理员 | 全部院系 / 班级 / 学生 / 成绩 |
| 教师 teacher | 班主任，绑定一个班级 | 仅本班学生与成绩 |
| 学生（不登录） | 本期不提供学生端登录，学生信息由管理员维护 | — |

设计取舍：学生端登录（查自己的成绩）演示价值有限、权限分支多，一期不做；如答辩需要，可作为演示时的“扩展点”口头说明。

---

## 3. 功能范围

| 编号 | 模块 | 功能点 | 优先级 |
|---|---|---|---|
| F1 | 学生档案 | 列表（搜索/筛选/分页）、新增、编辑、软删除、详情 | P0 |
| F2 | 班级/院系 | 院系列表、班级 CRUD、班主任绑定 | P0 |
| F3 | 课程 | 课程 CRUD（编码、名称、学分） | P0 |
| F4 | 成绩 | 按班级/课程/学期查询、录入、修改、删除、唯一性校验 | P0 |
| F5 | 登录与权限 | 登录、登出、角色鉴权、数据范围控制 | P0 |
| F6 | 统计 | 平均分、及格率、分数段分布、班级人数分布 | P1 |
| F7 | 导出 | 学生名单 CSV、成绩单 CSV（UTF-8 BOM，Excel 可直接打开） | P1 |
| F8 | 操作日志 | 记录新增/修改/删除/导出，管理员可查 | P1 |

---

## 4. 非功能需求

| 项 | 要求 |
|---|---|
| 部署 | 单机运行，`npm install && npm start`，默认端口 3000 |
| 数据规模 | 演示数据 3 院系 / 10 班 / 200 学生 / 约 1000 条成绩 |
| 性能 | 列表接口 P95 < 200ms（本地 SQLite） |
| 兼容 | Chrome / Edge 最近两个大版本；≥1024px 桌面优先，移动端可用 |
| 安全 | 密码 bcrypt 哈希；JWT 鉴权；SQL 参数化；三层权限校验 |
| 可用性 | 空状态、加载态、错误提示三态齐全；关键操作二次确认 |
| 可维护 | 分层清晰，单文件不超过 300 行，接口统一返回结构 |

---

## 5. 总体架构

```
┌─────────────────────────────────────────────────────┐
│ 浏览器                                               │
│  HTML + CSS + 原生 JS + Bootstrap(CDN) + Chart.js    │
│  public/js/api.js 统一封装 fetch                     │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP + JSON（Authorization: Bearer <JWT>）
┌──────────────────────▼──────────────────────────────┐
│ Express 应用（Node.js）                              │
│  ├─ routes/       路由：auth students classes ...    │
│  ├─ middleware/   auth.js  role.js  scope.js  audit  │
│  ├─ services/     业务逻辑（校验、统计、导出）        │
│  ├─ db/           SQLite 连接、建表、种子数据         │
│  └─ utils/        统一响应、错误处理、CSV 生成        │
└──────────────────────┬──────────────────────────────┘
                       │ SQL（参数化）
┌──────────────────────▼──────────────────────────────┐
│ SQLite 文件 school.db（7 张表）                       │
└─────────────────────────────────────────────────────┘
```

### 5.1 技术选型与理由

| 层 | 选择 | 理由 |
|---|---|---|
| 前端 | 原生 HTML/CSS/JS + Bootstrap 5(CDN) + Chart.js(CDN) | 无构建工具，改完刷新即生效，小白友好 |
| 后端 | Node.js + Express | 与前端同一门语言，学习成本最低 |
| 数据库 | SQLite（better-sqlite3） | 免安装、单文件、可随项目拷贝，SQL 为标准写法 |
| 鉴权 | JWT（jsonwebtoken）+ bcryptjs | 无状态、易理解、答辩好讲 |
| 运行 | Node 18+ | 环境单一 |

**迁移说明**：SQL 使用标准语法，若后续换 MySQL，仅需替换数据库驱动与少量方言（如 `AUTOINCREMENT`），业务层不动。

---

## 6. 数据库设计

### 6.1 ER 关系

```
departments 1 ──< classes 1 ──< students
                                   │
courses 1 ──────────< scores >─────┘
users 1 ──< audit_logs
users 1 ──< scores (updated_by)
classes 1 ── users (head_teacher_id, 逻辑关联)
```

### 6.2 表结构

**departments（院系）**

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| name | TEXT | NOT NULL UNIQUE | 院系名称 |
| code | TEXT | NOT NULL UNIQUE | 院系编码 |

**classes（班级）**

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | INTEGER | PK | |
| department_id | INTEGER | NOT NULL, FK → departments(id) | |
| name | TEXT | NOT NULL | 班级名称 |
| grade_year | INTEGER | NOT NULL | 入学年份 |
| head_teacher_id | INTEGER | NULL, FK → users(id) | 班主任，决定教师数据范围 |
| created_at | TEXT | NOT NULL DEFAULT (datetime('now','localtime')) | |

索引：`idx_classes_department (department_id)`

**students（学生）**

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | INTEGER | PK | |
| student_no | TEXT | NOT NULL UNIQUE | 学号 |
| name | TEXT | NOT NULL | 姓名 |
| gender | TEXT | NOT NULL CHECK(gender IN ('男','女')) | |
| birth_date | TEXT | NULL | YYYY-MM-DD |
| class_id | INTEGER | NOT NULL, FK → classes(id) | |
| phone | TEXT | NULL | 联系电话 |
| email | TEXT | NULL | |
| enroll_year | INTEGER | NOT NULL | 入学年份 |
| status | TEXT | NOT NULL DEFAULT '在读' CHECK(status IN ('在读','休学','毕业')) | 学籍状态 |
| is_deleted | INTEGER | NOT NULL DEFAULT 0 | 软删除标记 |
| created_at / updated_at | TEXT | NOT NULL | |

索引：`idx_students_class (class_id)`、`idx_students_name (name)`、`idx_students_no (student_no)`

**courses（课程）**

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | INTEGER | PK | |
| code | TEXT | NOT NULL UNIQUE | 课程编码 |
| name | TEXT | NOT NULL | 课程名称 |
| credit | REAL | NOT NULL DEFAULT 0 | 学分 |

**scores（成绩）**

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | INTEGER | PK | |
| student_id | INTEGER | NOT NULL, FK → students(id) | |
| course_id | INTEGER | NOT NULL, FK → courses(id) | |
| term | TEXT | NOT NULL | 学期，如 `2026-2027-1` |
| exam_type | TEXT | NOT NULL DEFAULT '期末' CHECK(exam_type IN ('期末','平时','补考')) | |
| score | REAL | NOT NULL CHECK(score >= 0 AND score <= 100) | |
| updated_by | INTEGER | NOT NULL, FK → users(id) | 最后修改人 |
| updated_at | TEXT | NOT NULL | |

唯一约束：`UNIQUE(student_id, course_id, term, exam_type)`，防止重复录入。
索引：`idx_scores_student (student_id)`、`idx_scores_course (course_id)`

**users（账号）**

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | INTEGER | PK | |
| username | TEXT | NOT NULL UNIQUE | |
| password_hash | TEXT | NOT NULL | bcrypt，禁止明文 |
| real_name | TEXT | NOT NULL | |
| role | TEXT | NOT NULL CHECK(role IN ('admin','teacher')) | |
| class_id | INTEGER | NULL, FK → classes(id) | 教师的班级范围（冗余加速） |
| created_at | TEXT | NOT NULL | |

**audit_logs（操作日志）**

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | INTEGER | PK | |
| user_id | INTEGER | NOT NULL | 操作人 |
| username | TEXT | NOT NULL | 冗余保存，防止用户删除后日志失真 |
| action | TEXT | NOT NULL | create / update / delete / export / login |
| entity | TEXT | NOT NULL | 实体名，如 students |
| entity_id | TEXT | NULL | 目标主键 |
| detail | TEXT | NULL | JSON 字符串：变更前后值 |
| ip | TEXT | NULL | |
| created_at | TEXT | NOT NULL | |

索引：`idx_audit_created (created_at DESC)`、`idx_audit_user (user_id)`

### 6.3 三个关键设计决策

1. **软删除**：学生只置 `is_deleted=1`，所有查询默认过滤。理由：学籍数据需留存，删除会破坏统计口径；答辩可讲“数据不可逆丢失”的风险。
2. **成绩唯一约束**：`(student_id, course_id, term, exam_type)` 四元组唯一，从数据库层杜绝重复录入，而不是只靠前端校验。
3. **审计独立成表**：业务表不承担审计职责；日志冗余保存 username，避免用户改名/删除后日志失去可读性。

---

## 7. 接口设计

统一响应：`{ code: 0, message: "ok", data: ... }`；错误时 `code != 0`，HTTP 状态码同步语义（400/401/403/404/500）。

| 模块 | 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|---|
| 认证 | POST | /api/auth/login | 公开 | 返回 JWT 与用户信息 |
| 认证 | POST | /api/auth/logout | 登录 | 前端清除令牌，记录日志 |
| 认证 | GET | /api/auth/me | 登录 | 当前用户与权限范围 |
| 院系 | GET/POST/PUT/DELETE | /api/departments[/:id] | admin | CRUD |
| 班级 | GET/POST/PUT/DELETE | /api/classes[/:id] | admin | CRUD；教师仅 GET 本班 |
| 学生 | GET | /api/students | 登录 | 参数：keyword, classId, status, page, pageSize |
| 学生 | GET | /api/students/:id | 登录 | 详情 |
| 学生 | POST/PUT/DELETE | /api/students[/:id] | admin 或本班教师 | 删除为软删除 |
| 学生 | GET | /api/students/export | 登录 | 返回 CSV 附件 |
| 课程 | GET/POST/PUT/DELETE | /api/courses[/:id] | admin | CRUD |
| 成绩 | GET | /api/scores | 登录 | 参数：classId, courseId, term, studentId |
| 成绩 | POST/PUT/DELETE | /api/scores[/:id] | admin 或本班教师 | 唯一冲突返回 409 |
| 成绩 | GET | /api/scores/stats | 登录 | 参数：classId, courseId, term |
| 日志 | GET | /api/audit-logs | admin | 分页查询 |
| 健康 | GET | /api/health | 公开 | 用于自检与演示前检查 |

---

## 8. 前端设计

### 8.1 页面清单

| 页面 | 路由 | 核心内容 |
|---|---|---|
| 登录 | login.html | 用户名/密码/角色，错误提示 |
| 仪表盘 | index.html | 4 张统计卡、班级人数分布、成绩分布、最近操作 |
| 学生管理 | students.html | 搜索/筛选/分页/新增编辑弹窗/删除确认/导出 |
| 班级管理 | classes.html | 院系与班级两级列表，班级绑定班主任 |
| 课程管理 | courses.html | 课程列表与编辑弹窗 |
| 成绩管理 | scores.html | 按班级+课程+学期筛选，录入/修改，统计区 |
| 操作日志 | audit.html | 时间、操作人、动作、对象、详情，仅管理员 |

### 8.2 UI/UX 决策对照

| UI 做法 | UX 目标 |
|---|---|
| 左侧深蓝导航常驻 | 模块入口一眼可见 |
| 面包屑 | 明确当前位置 |
| 首页统计卡片 | 3 秒理解整体情况 |
| 工具栏与表格同区 | 搜索/筛选/新增路径最短 |
| 弹窗编辑 | 保留列表上下文，不丢失筛选条件 |
| toast + 行内状态 | 操作有明确反馈 |
| 空/加载/错误三态 | 不让用户面对白屏 |
| 软删除二次确认 | 防误操作 |
| 打印样式隐藏导航 | 纸质导出干净 |

### 8.3 视觉规范

| 项 | 值 |
|---|---|
| 主色 | `#1a4d8f`（教育蓝） |
| 深色 | `#123a6b`（侧栏） |
| 浅色底 | `#e8f0fb` |
| 页面背景 | `#f5f7fa` |
| 成功/警告/危险 | `#1f9d55` / `#d97706` / `#dc2626` |
| 圆角 | 8–10px |
| 字体 | system-ui / 微软雅黑 / PingFang SC |
| 表格行高 | 44–48px |

### 8.4 前端目录

```
public/
├── login.html
├── index.html
├── students.html
├── classes.html
├── courses.html
├── scores.html
├── audit.html
└── assets/
    ├── style.css
    └── js/
        ├── api.js      # fetch 封装、令牌注入、统一错误处理
        ├── auth.js     # 登录态、路由守卫、角色显隐
        └── ui.js       # toast、弹窗、分页、表格渲染
```

---

## 9. 权限模型

三层校验，顺序不可颠倒：

1. **认证**：请求是否携带有效 JWT。
2. **角色**：该角色是否有权访问该接口（admin / teacher）。
3. **数据范围**：teacher 只能操作 `class_id` 等于本人绑定班级的数据；admin 不受限。

| 能力 | admin | teacher |
|---|:---:|:---:|
| 学生查看 | 全部 | 仅本班 |
| 学生增删改 | ✅ | 仅本班 |
| 成绩录入/修改 | ✅ | 仅本班 |
| 导出 | ✅ | 仅本班 |
| 班级/课程/用户管理 | ✅ | ❌ |
| 操作日志 | ✅ | ❌ |

**实现要点**：数据范围在 SQL 的 WHERE 条件中拼接，不在前端过滤；前端隐藏按钮只是体验优化。

---

## 10. 安全设计

| 风险 | 措施 |
|---|---|
| 密码泄露 | bcryptjs 哈希（cost 10），登录失败不区分“用户不存在/密码错误” |
| SQL 注入 | 全部使用参数化查询（better-sqlite3 prepared statement） |
| 越权访问 | 三层校验；教师数据范围强制拼接 |
| XSS | 前端渲染使用 `textContent`，禁止拼接未转义的 HTML |
| 令牌过期 | JWT 有效期 2 小时，过期重新登录 |
| 审计缺失 | 所有写操作与导出写 audit_logs |
| 敏感数据 | 演示数据使用虚构姓名与手机号；日志中手机号脱敏 |

---

## 11. 测试策略

| 层级 | 内容 | 工具 |
|---|---|---|
| 接口测试 | 15 条核心用例：登录成功/失败、无令牌 401、越权 403、学生 CRUD、成绩唯一冲突 409、导出、统计 | Node 脚本 + fetch 断言 |
| 手工验收 | 7 个页面逐项走查清单 | 浏览器 |
| 数据校验 | 种子脚本执行两次不产生重复数据 | 脚本 |
| 演示验证 | 一键启动 + 完整演示脚本演练 | 手工 |

**必测边界**：空关键词查询、跨班越权、成绩 0 分与 100 分、重复学号、删除后列表过滤、分页越界。

---

## 12. 交付物

| 交付物 | 位置 |
|---|---|
| 源代码 | `server/`、`public/` |
| 设计文档 | `docs/superpowers/specs/2026-10-31-student-info-management-design.md` |
| 需求说明 | `docs/需求说明.md` |
| 接口文档 | `docs/接口文档.md` |
| 测试记录 | `docs/测试记录.md` |
| 部署说明 | `README.md` |
| 演示数据 | `server/db/seed.js` |
| 静态原型 | `prototype/`（保留作设计留痕） |

---

## 13. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| M1 | 工程骨架、数据库建表、登录与 JWT、统一响应 | 能登录，`/api/health` 返回正常 |
| M2 | 学生 CRUD + 搜索分页 + 前端列表页 | 学生管理全流程可用 |
| M3 | 院系/班级/课程 CRUD | 基础数据可维护 |
| M4 | 成绩录入/查询/统计 | 唯一冲突被拦截，统计数字正确 |
| M5 | 导出、操作日志、仪表盘图表 | CSV 可打开，日志可查 |
| M6 | 接口测试、文档、演示数据、答辩演练 | 测试全绿，5 分钟演示无卡顿 |

---

## 14. 假设与风险

| 项 | 说明 | 应对 |
|---|---|---|
| 单校单租户 | 不做多学校隔离 | 答辩时说明为“可扩展点” |
| 无学生端 | 学生不登录 | 作为二期规划口头说明 |
| SQLite 并发弱 | 演示场景无并发压力 | 明确“生产可换 MySQL” |
| CDN 依赖 | Bootstrap/Chart.js 走 CDN | 提供本地降级文件，离线可演示 |
| 时间风险 | 小白首次开发，环境问题可能卡住 | 第一天先跑通最小链路，再扩展 |

---

## 15. 评审记录

| 日期 | 评审人 | 结论 | 备注 |
|---|---|---|---|
| 2026-10-31 | 用户 | 方向确认 | 原型通过，待提具体小修改 |
