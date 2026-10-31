import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT, ROOT } from './config.js';
import { initSchema, isEmpty } from './db/index.js';
import { seed } from './db/seed.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import authRouter from './routes/auth.js';
import studentsRouter from './routes/students.js';
import classesRouter from './routes/classes.js';
import coursesRouter from './routes/courses.js';
import departmentsRouter from './routes/departments.js';
import scoresRouter from './routes/scores.js';
import auditRouter from './routes/audit.js';
import statsRouter from './routes/stats.js';
import usersRouter from './routes/users.js';

// 建表；空库时自动灌演示数据，保证 `npm start` 一条命令就能演示
initSchema();
if (isEmpty()) {
  console.log('[init] 检测到空数据库，正在生成演示数据…');
  seed();
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    code: 0,
    message: 'ok',
    data: { status: 'ok', time: new Date().toISOString(), uptime: Math.round(process.uptime()) },
  });
});

app.use('/api/auth', authRouter);
app.use('/api/students', studentsRouter);
app.use('/api/classes', classesRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/scores', scoresRouter);
app.use('/api/audit-logs', auditRouter);
app.use('/api/stats', statsRouter);
app.use('/api/users', usersRouter);

// 静态页面（含登录页作为默认首页）
app.use(express.static(path.join(ROOT, 'public'), { index: 'login.html' }));

app.use(notFoundHandler);
app.use(errorHandler);

const isMain = process.argv[1]
  && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isMain) {
  app.listen(PORT, () => {
    console.log('');
    console.log('  学生信息管理系统已启动');
    console.log(`  地址：http://localhost:${PORT}/login.html`);
    console.log('  账号：admin / 123456（管理员）  teacher / 123456（教师）');
    console.log('');
  });
}

export default app;
