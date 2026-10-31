import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 每次运行用独立临时库：不污染演示库 school.db，也不受上次残留影响
const TEST_DB = path.join(os.tmpdir(), `sis-test-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = TEST_DB;

const { default: app } = await import('../server/index.js');

let server;
let base;
let adminToken;
let teacherToken;
const baseline = {};

async function call(pathname, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + pathname, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = res.headers.get('content-type') || '';
  const payload = type.includes('json') ? await res.json() : await res.text();
  return { status: res.status, body: payload, res };
}

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  const admin = await call('/api/auth/login', {
    method: 'POST', body: { username: 'admin', password: '123456' },
  });
  adminToken = admin.body.data.token;

  const teacher = await call('/api/auth/login', {
    method: 'POST', body: { username: 'teacher', password: '123456' },
  });
  teacherToken = teacher.body.data.token;

  // 记录基线，后续断言用「相对变化」，避免用例之间互相污染
  const all = await call('/api/students?pageSize=1', { token: adminToken });
  baseline.students = all.body.data.total;
  const scoped = await call('/api/students?pageSize=1', { token: teacherToken });
  baseline.teacherStudents = scoped.body.data.total;
  const stats = await call('/api/scores/stats?classId=1', { token: adminToken });
  baseline.classScores = stats.body.data.total;
});

after(() => {
  server.close();
  try {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(TEST_DB + suffix, { force: true });
  } catch {
    // Windows 下文件可能仍被占用，临时目录自会清理
  }
});

test('健康检查返回 ok', async () => {
  const r = await call('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'ok');
});

test('密码错误返回 401 且提示统一', async () => {
  const r = await call('/api/auth/login', {
    method: 'POST', body: { username: 'admin', password: 'wrong' },
  });
  assert.equal(r.status, 401);
  assert.equal(r.body.message, '用户名或密码错误');
});

test('登录成功后返回 token 且不含密码哈希', async () => {
  const r = await call('/api/auth/login', {
    method: 'POST', body: { username: 'admin', password: '123456' },
  });
  assert.equal(r.status, 200);
  assert.ok(r.body.data.token.length > 50);
  assert.equal(r.body.data.user.role, 'admin');
  assert.ok(!('password_hash' in r.body.data.user));
});

test('未带 token 访问学生列表返回 401', async () => {
  const r = await call('/api/students');
  assert.equal(r.status, 401);
});

test('学生列表分页与总数正确', async () => {
  const r = await call('/api/students?page=1&pageSize=10', { token: adminToken });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.total, baseline.students);
  assert.equal(r.body.data.list.length, 10);
  assert.ok(r.body.data.list[0].class_name);
});

test('关键字搜索只返回匹配的姓名或学号', async () => {
  const r = await call('/api/students?keyword=张', { token: adminToken });
  assert.equal(r.status, 200);
  assert.ok(r.body.data.total > 0);
  for (const s of r.body.data.list) {
    assert.ok(s.name.includes('张') || s.student_no.includes('张'));
  }
});

test('教师只能看到本班学生', async () => {
  const r = await call('/api/students', { token: teacherToken });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.total, baseline.teacherStudents);
  assert.ok(r.body.data.list.every((s) => s.class_id === 1));
});

test('教师越权新建课程返回 403', async () => {
  const r = await call('/api/courses', {
    method: 'POST', token: teacherToken, body: { code: 'X999', name: '越权课程' },
  });
  assert.equal(r.status, 403);
});

test('学号为空返回 400 并指出字段', async () => {
  const r = await call('/api/students', {
    method: 'POST', token: adminToken,
    body: { student_no: '', name: '无学号', gender: '男', class_id: 1, enroll_year: 2023 },
  });
  assert.equal(r.status, 400);
  assert.match(r.body.message, /student_no/);
});

test('新增学生成功，学号重复返回 409，修改与详情一致', async () => {
  const body = {
    student_no: '20239999', name: '测试生', gender: '男', class_id: 1, enroll_year: 2023,
  };
  const created = await call('/api/students', { method: 'POST', token: adminToken, body });
  assert.equal(created.status, 200);
  const id = created.body.data.id;
  assert.ok(id > 0);

  const dup = await call('/api/students', { method: 'POST', token: adminToken, body });
  assert.equal(dup.status, 409);

  const updated = await call(`/api/students/${id}`, {
    method: 'PUT', token: adminToken, body: { ...body, name: '测试生改名', status: '休学' },
  });
  assert.equal(updated.status, 200);

  const detail = await call(`/api/students/${id}`, { token: adminToken });
  assert.equal(detail.body.data.name, '测试生改名');
  assert.equal(detail.body.data.status, '休学');
  assert.equal(detail.body.data.class_name, '计算机 1 班');

  const list = await call('/api/students?pageSize=1', { token: adminToken });
  assert.equal(list.body.data.total, baseline.students + 1);

  // 软删除：行还在库里，但列表不再返回
  const del = await call(`/api/students/${id}`, { method: 'DELETE', token: adminToken });
  assert.equal(del.status, 200);
  const afterDelete = await call('/api/students?keyword=20239999', { token: adminToken });
  assert.equal(afterDelete.body.data.total, 0);
});

test('成绩录入：重复返回 409，超范围返回 400', async () => {
  const score = {
    student_id: 2, course_id: 1, term: '2026-2027-1', exam_type: '期末', score: 88,
  };
  const first = await call('/api/scores', { method: 'POST', token: adminToken, body: score });
  assert.equal(first.status, 200);

  const dup = await call('/api/scores', { method: 'POST', token: adminToken, body: score });
  assert.equal(dup.status, 409);
  assert.match(dup.body.message, /已有成绩/);

  const invalid = await call('/api/scores', {
    method: 'POST', token: adminToken, body: { ...score, student_id: 3, score: 101 },
  });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.message, /0 ~ 100/);
});

test('成绩统计口径正确（本班记录数 +1）', async () => {
  const r = await call('/api/scores/stats?classId=1', { token: adminToken });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.total, baseline.classScores + 1);
  assert.ok(r.body.data.avg > 0 && r.body.data.avg <= 100);
  assert.equal(r.body.data.distribution.length, 5);
});

test('仪表盘概览返回核心指标', async () => {
  const r = await call('/api/stats/overview', { token: adminToken });
  assert.equal(r.status, 200);
  const d = r.body.data;
  assert.equal(d.studentCount, baseline.students);
  assert.equal(d.classCount, 10);
  assert.equal(d.classDistribution.length, 10);
  assert.ok(d.recentLogs.length > 0);
});

test('导出 CSV 带 UTF-8 BOM 且表头为中文', async () => {
  const res = await fetch(`${base}/api/students/export`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(buf.toString('utf8'), /学号,姓名,性别,班级,院系/);
});

test('操作日志：管理员可看，教师 403', async () => {
  const admin = await call('/api/audit-logs', { token: adminToken });
  assert.equal(admin.status, 200);
  assert.ok(admin.body.data.total > 0);
  assert.ok(admin.body.data.list.every((l) => 'username' in l));

  const teacher = await call('/api/audit-logs', { token: teacherToken });
  assert.equal(teacher.status, 403);
});

test('未知接口返回 404 JSON', async () => {
  const r = await call('/api/not-exist');
  assert.equal(r.status, 404);
  assert.match(r.body.message, /接口不存在/);
});
