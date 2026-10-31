# 接口文档

- 基础地址：`http://localhost:3000`
- 所有接口返回 JSON（导出接口除外），统一结构：

```json
{ "code": 0, "message": "ok", "data": {} }
```

- 需要登录的接口在请求头带 token：

```
Authorization: Bearer <登录返回的 token>
```

- 出错时 HTTP 状态码非 2xx，响应体为 `{ "code": 状态码, "message": "中文原因" }`。

| 状态码 | 含义 |
| --- | --- |
| 400 | 参数不合法（缺字段、格式错、分数越界等） |
| 401 | 未登录或 token 过期 |
| 403 | 已登录但没有权限（教师改课程、看日志） |
| 404 | 资源或接口不存在 |
| 409 | 冲突（学号重复、编码重复、成绩重复、有子数据不能删） |
| 500 | 服务端异常（详情只写服务端日志，不回给前端） |

## 认证

### POST /api/auth/login

```json
{ "username": "admin", "password": "123456" }
```

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "token": "eyJhbGciOi...",
    "user": {
      "id": 1,
      "username": "admin",
      "real_name": "王管理",
      "role": "admin",
      "class_id": null,
      "class_name": null,
      "scope": "全校数据"
    }
  }
}
```

账号或密码错误统一返回 `401 {"message":"用户名或密码错误"}`，不区分「用户不存在」和「密码错」，避免被枚举账号。

### GET /api/auth/me

返回当前用户（结构同上）。用于前端刷新页面后恢复登录态，同时保证角色/班级变更立即生效。

### POST /api/auth/logout

写一条登出日志，返回 `{ code: 0 }`。token 本身无状态，由前端删除。

## 学生

### GET /api/students

查询参数：`page`（默认 1）、`pageSize`（默认 10，上限 100）、`keyword`（匹配姓名或学号，模糊）、`classId`、`status`（在读 / 休学 / 毕业）。

```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": 1, "student_no": "20230001", "name": "张伟", "gender": "男",
        "class_id": 1, "class_name": "计算机 1 班", "department_name": "计算机学院",
        "phone": "13810000000", "email": null, "birth_date": null,
        "enroll_year": 2023, "status": "在读", "created_at": "2026-10-31 12:00:00"
      }
    ],
    "total": 200, "page": 1, "pageSize": 10
  }
}
```

教师调用时后端强制加 `class_id = 自己班级` 条件，传别的 `classId` 也只会返回空。

### GET /api/students/:id

返回单个学生 + `scores` 数组（课程名、学期、考试类型、分数）。已软删除的学生返回 404。

### POST /api/students

```json
{
  "student_no": "20230199", "name": "李四", "gender": "男", "class_id": 1,
  "birth_date": "2005-03-01", "phone": "13900000000", "email": "lisi@example.com",
  "enroll_year": 2023, "status": "在读"
}
```

必填：`student_no`、`name`、`gender`、`class_id`、`enroll_year`。学号重复返回 409。

### PUT /api/students/:id

字段同上，整体覆盖。日志里记录修改前后对比。

### DELETE /api/students/:id

软删除（`is_deleted = 1`）：列表和详情不再返回，数据仍留在库里，便于教务留档。

### GET /api/students/export

返回 `text/csv`，文件名 `students-20261031-1530.csv`（UTF-8 带 BOM，Excel 直接双击不乱码）。支持与学生列表相同的筛选参数。

```
Content-Disposition: attachment; filename="students-20261031-1530.csv"; filename*=UTF-8''students-20261031-1530.csv
```

## 班级 / 院系 / 课程

| 接口 | 说明 |
| --- | --- |
| `GET /api/departments` | 院系列表 |
| `POST /api/departments`、`PUT/DELETE /api/departments/:id` | 院系维护（仅管理员） |
| `GET /api/classes` | 班级列表，含 `department_name`、`head_teacher_name`、`student_count` |
| `POST /api/classes`、`PUT/DELETE /api/classes/:id` | 班级维护（仅管理员）；仍有学生的班级删除返回 409 |
| `GET /api/courses` | 课程列表 |
| `POST /api/courses`、`PUT/DELETE /api/courses/:id` | 课程维护（仅管理员）；编码重复 409，已有成绩 409 |

班级保存时如果换了班主任，会在同一事务里同步 `users.class_id` 与 `classes.head_teacher_id` —— 教师的数据范围只有一个来源：`users.class_id`。

## 成绩

### GET /api/scores

参数：`classId`、`courseId`、`term`、`studentId`、`examType`、`page`、`pageSize`（默认 20）。

```json
{
  "code": 0,
  "data": {
    "list": [
      { "id": 1, "student_id": 1, "student_no": "20230001", "student_name": "张伟",
        "class_id": 1, "class_name": "计算机 1 班", "course_id": 1, "course_name": "高等数学",
        "term": "2025-2026-2", "exam_type": "期末", "score": 87,
        "created_at": "...", "updated_at": "..." }
    ],
    "total": 1200, "page": 1, "pageSize": 20
  }
}
```

### GET /api/scores/stats

参数同列表（教师自动限本班）：

```json
{
  "code": 0,
  "data": {
    "total": 120, "avg": 78.8, "passRate": 91.7,
    "excellent": 30, "fail": 10,
    "distribution": [
      { "label": "90-100", "count": 30 }, { "label": "80-89", "count": 40 },
      { "label": "70-79", "count": 25 }, { "label": "60-69", "count": 15 },
      { "label": "60 以下", "count": 10 }
    ]
  }
}
```

### POST /api/scores

```json
{ "student_id": 1, "course_id": 1, "term": "2026-2027-1", "exam_type": "期末", "score": 88 }
```

- `score` 必须在 0 ~ 100，否则 400
- 同一 `student_id + course_id + term + exam_type` 只能一条，重复 409「该学生在这门课/学期/考试类型下已有成绩」
- `exam_type` 可选：期末 / 平时 / 补考，默认期末

### PUT /api/scores/:id

只允许改分数：`{ "score": 92 }`。

### DELETE /api/scores/:id

物理删除（成绩录错就是录错，不保留脏数据）。

## 统计与日志

### GET /api/stats/overview

```json
{
  "code": 0,
  "data": {
    "studentCount": 200, "classCount": 10,
    "avgScore": 77.5, "passRate": 90.4, "totalScores": 1200,
    "classDistribution": [{ "label": "计算机 1 班", "count": 20 }],
    "scoreDistribution": [{ "label": "90-100", "count": 273 }],
    "recentLogs": [{ "username": "admin", "action": "login", "entity": "users", "entity_id": 1, "created_at": "..." }]
  }
}
```

教师登录时，学生数、成绩、及格率都按本班口径计算。

### GET /api/audit-logs（仅管理员）

参数：`page`、`pageSize`、`action`（create/update/delete/login/logout/export）、`entity`（students/classes/courses/departments/scores/users）。

```json
{
  "code": 0,
  "data": {
    "list": [
      { "id": 12, "username": "admin", "action": "update", "entity": "students",
        "entity_id": 1, "detail": { "before": { "name": "张伟" }, "after": { "name": "张玮" } },
        "ip": "::1", "created_at": "2026-10-31 12:00:00" }
    ],
    "total": 36, "page": 1, "pageSize": 20
  }
}
```

## 其他

### GET /api/users（仅管理员）

返回账号列表（id、username、real_name、role、class_id、class_name），供「指定班主任」下拉使用。永远不返回 `password_hash`。

### GET /api/health

```json
{ "code": 0, "message": "ok", "data": { "status": "ok", "time": "2026-10-31T04:00:00.000Z" } }
```
