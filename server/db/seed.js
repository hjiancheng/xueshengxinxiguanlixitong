import bcrypt from 'bcryptjs';
import { db, initSchema } from './index.js';

/** 固定种子随机数：保证每次生成的演示数据一致，测试断言与演示截图可复现 */
function makeRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const SURNAMES = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴',
  '徐', '孙', '马', '朱', '胡', '郭', '何', '高', '林', '罗'];
const GIVEN = ['伟', '芳', '娜', '敏', '静', '磊', '洋', '勇', '艳', '杰'];

const DEPARTMENTS = [
  { name: '计算机学院', code: 'CS' },
  { name: '软件学院', code: 'SE' },
  { name: '信息工程学院', code: 'IEE' },
];

const CLASSES = [
  { name: '计算机 1 班', dept: 1 }, { name: '计算机 2 班', dept: 1 },
  { name: '计算机 3 班', dept: 1 }, { name: '计算机 4 班', dept: 1 },
  { name: '软件 1 班', dept: 2 }, { name: '软件 2 班', dept: 2 }, { name: '软件 3 班', dept: 2 },
  { name: '信工 1 班', dept: 3 }, { name: '信工 2 班', dept: 3 }, { name: '信工 3 班', dept: 3 },
];

const COURSES = [
  { code: 'MATH101', name: '高等数学', credit: 4 },
  { code: 'ENG101', name: '大学英语', credit: 3 },
  { code: 'PE101', name: '体育', credit: 1 },
  { code: 'CS201', name: '数据结构', credit: 4 },
  { code: 'CS301', name: '数据库原理', credit: 3 },
  { code: 'CS302', name: '计算机网络', credit: 3 },
];

const TERMS = ['2025-2026-2', '2026-2027-1'];
const STUDENT_COUNT = 200;
const GRADE_YEAR = 2023;

/**
 * 写入演示数据（幂等：已有院系数据则直接跳过）。
 * @returns {boolean} 是否真的写入了数据
 */
export function seed({ verbose = true } = {}) {
  initSchema();

  const exists = db.prepare('SELECT COUNT(*) AS c FROM departments').get().c;
  if (exists > 0) {
    if (verbose) console.log('[seed] 已存在数据，跳过（如需重置，删除 school.db 后重跑）');
    return false;
  }

  const rng = makeRng(20261031);
  const hash = bcrypt.hashSync('123456', 10);
  const deptInsert = db.prepare(
    'INSERT INTO departments (name, code) VALUES (?, ?)'
  );
  const classInsert = db.prepare(
    'INSERT INTO classes (department_id, name, grade_year) VALUES (?, ?, ?)'
  );
  const studentInsert = db.prepare(
    `INSERT INTO students (student_no, name, gender, birth_date, class_id, phone, email, enroll_year, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const courseInsert = db.prepare('INSERT INTO courses (code, name, credit) VALUES (?, ?, ?)');
  const userInsert = db.prepare(
    'INSERT INTO users (username, password_hash, real_name, role, class_id) VALUES (?, ?, ?, ?, ?)'
  );
  const scoreInsert = db.prepare(
    `INSERT INTO scores (student_id, course_id, term, exam_type, score, updated_by)
     VALUES (?, ?, ?, '期末', ?, ?)`
  );

  db.exec('BEGIN');
  try {
    // 1. 院系
    for (const d of DEPARTMENTS) deptInsert.run(d.name, d.code);

    // 2. 班级（先不带班主任）
    for (const c of CLASSES) classInsert.run(c.dept, c.name, GRADE_YEAR);

    // 3. 账号：管理员 + 班主任（teacher 绑定 1 班）
    userInsert.run('admin', hash, '王管理', 'admin', null);
    const teacherId = Number(userInsert.run('teacher', hash, '李老师', 'teacher', 1).lastInsertRowid);
    db.prepare('UPDATE classes SET head_teacher_id = ? WHERE id = 1').run(teacherId);
    const adminId = 1;

    // 4. 学生：每班 20 人
    for (let i = 0; i < STUDENT_COUNT; i += 1) {
      const studentNo = `${GRADE_YEAR}${String(i + 1).padStart(4, '0')}`;
      const name = SURNAMES[i % SURNAMES.length] + GIVEN[Math.floor(i / SURNAMES.length) % GIVEN.length];
      const gender = i % 2 === 0 ? '男' : '女';
      const classId = Math.floor(i / 20) + 1;
      const birth = `2005-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`;
      const phone = `138${String(10000000 + i).padStart(8, '0')}`;
      const email = `${studentNo}@example.edu.cn`;
      const status = i % 37 === 0 ? '休学' : i % 53 === 0 ? '毕业' : '在读';
      studentInsert.run(studentNo, name, gender, birth, classId, phone, email, GRADE_YEAR, status);
    }

    // 5. 课程
    for (const c of COURSES) courseInsert.run(c.code, c.name, c.credit);

    // 6. 成绩：两个学期，各 3 门课，每生共 6 条
    for (let s = 0; s < STUDENT_COUNT; s += 1) {
      const studentId = s + 1;
      for (let t = 0; t < TERMS.length; t += 1) {
        for (let k = 0; k < 3; k += 1) {
          const courseId = t * 3 + k + 1;
          const score = Math.round(55 + rng() * 45); // 55~100，约 11% 不及格
          scoreInsert.run(studentId, courseId, TERMS[t], score, adminId);
        }
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const stats = {
    departments: db.prepare('SELECT COUNT(*) AS c FROM departments').get().c,
    classes: db.prepare('SELECT COUNT(*) AS c FROM classes').get().c,
    students: db.prepare('SELECT COUNT(*) AS c FROM students').get().c,
    courses: db.prepare('SELECT COUNT(*) AS c FROM courses').get().c,
    scores: db.prepare('SELECT COUNT(*) AS c FROM scores').get().c,
    users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
  };
  if (verbose) console.log('[seed] 完成：', stats);
  return true;
}

// 直接运行 `npm run seed` 时执行
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seed();
}
