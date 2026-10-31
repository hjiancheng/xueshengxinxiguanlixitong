-- 学生信息管理系统 · 数据库结构（SQLite）
-- 7 张表：departments / classes / students / courses / scores / users / audit_logs

PRAGMA foreign_keys = ON;

-- 院系
CREATE TABLE IF NOT EXISTS departments (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE
);

-- 班级（head_teacher_id 指向 users，建表顺序无碍：SQLite 在写入时才校验）
CREATE TABLE IF NOT EXISTS classes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id   INTEGER NOT NULL REFERENCES departments(id),
  name            TEXT    NOT NULL,
  grade_year      INTEGER NOT NULL,
  head_teacher_id INTEGER REFERENCES users(id),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 学生（软删除：is_deleted = 1）
CREATE TABLE IF NOT EXISTS students (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_no  TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  gender      TEXT    NOT NULL CHECK (gender IN ('男','女')),
  birth_date  TEXT,
  class_id    INTEGER NOT NULL REFERENCES classes(id),
  phone       TEXT,
  email       TEXT,
  enroll_year INTEGER NOT NULL,
  status      TEXT    NOT NULL DEFAULT '在读' CHECK (status IN ('在读','休学','毕业')),
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 课程
CREATE TABLE IF NOT EXISTS courses (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  code   TEXT    NOT NULL UNIQUE,
  name   TEXT    NOT NULL,
  credit REAL    NOT NULL DEFAULT 0
);

-- 成绩（四元组唯一，杜绝重复录入）
CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  course_id  INTEGER NOT NULL REFERENCES courses(id),
  term       TEXT    NOT NULL,
  exam_type  TEXT    NOT NULL DEFAULT '期末' CHECK (exam_type IN ('期末','平时','补考')),
  score      REAL    NOT NULL CHECK (score >= 0 AND score <= 100),
  updated_by INTEGER NOT NULL,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (student_id, course_id, term, exam_type)
);

-- 账号
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  real_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','teacher')),
  class_id      INTEGER REFERENCES classes(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 操作日志（冗余 username，用户改名/删除后日志仍可读）
CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  username   TEXT    NOT NULL,
  action     TEXT    NOT NULL,
  entity     TEXT    NOT NULL,
  entity_id  TEXT,
  detail     TEXT,
  ip         TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_students_class  ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_name   ON students(name);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
CREATE INDEX IF NOT EXISTS idx_scores_student  ON scores(student_id);
CREATE INDEX IF NOT EXISTS idx_scores_course   ON scores(course_id);
CREATE INDEX IF NOT EXISTS idx_classes_dept    ON classes(department_id);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user      ON audit_logs(user_id);
