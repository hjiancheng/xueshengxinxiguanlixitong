/**
 * 真浏览器端到端自检（零依赖）：启动 headless Chrome/Edge，用 CDP 驱动真实页面。
 * 覆盖：登录表单跳转 → 仪表盘卡片 → 学生列表 → 搜索 → 弹窗 → 教师数据范围。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const BASE = 'http://localhost:3000';
const PORT = 9333;

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

const exe = CANDIDATES.find((p) => fs.existsSync(p));
if (!exe) {
  console.error('未找到 Chrome/Edge，跳过浏览器自检');
  process.exit(2);
}

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sis-check-'));
const browser = spawn(exe, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForJson(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      // 浏览器还没起来
    }
    await sleep(250);
  }
  throw new Error(`浏览器未就绪：${url}`);
}

let ws;
let seq = 0;
const pending = new Map();
const consoleErrors = [];

function send(method, params = {}, sessionId) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP 超时：${method}`));
      }
    }, 15000);
  });
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true,
  });
  if (res.exceptionDetails) {
    const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
    throw new Error(`页面脚本报错：${desc}`);
  }
  return res.result.value;
}

async function goto(url) {
  await send('Page.navigate', { url });
  await sleep(900);
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  → ${detail}` : ''}`);
}

const SHOT_DIR = 'docs/screenshots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(SHOT_DIR, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(`SHOT  ${file}`);
}

try {
  await waitForJson(`http://127.0.0.1:${PORT}/json/version`);

  const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })
    .then((r) => r.json());

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      consoleErrors.push(`${msg.params.entry.text} ${msg.params.entry.url || ''}`);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });

  // 1. 登录表单：真实填表提交，应跳转仪表盘
  await goto(`${BASE}/login.html`);
  await evaluate(`(() => {
    document.getElementById('username').value = 'admin';
    document.getElementById('password').value = '123456';
    document.getElementById('loginForm').dispatchEvent(new Event('submit', { cancelable: true }));
    return true;
  })()`);
  await sleep(1600);
  const afterLogin = await evaluate('({ path: location.pathname, token: !!localStorage.getItem("sis_token") })');
  check('登录表单提交后跳转仪表盘', afterLogin.path === '/index.html' && afterLogin.token, JSON.stringify(afterLogin));

  // 2. 仪表盘：4 张卡片 + 数字
  const dashboard = await evaluate(`({
    cards: document.querySelectorAll('.card.stat').length,
    values: Array.from(document.querySelectorAll('.card.stat .value')).map(e => e.textContent.trim()),
    bars: document.querySelectorAll('.bar-row').length,
    logs: document.querySelectorAll('#logs tbody tr, #logs .empty').length,
    user: document.querySelector('.topbar .user')?.textContent.trim()
  })`);
  check('仪表盘渲染 4 张统计卡',
    dashboard.cards === 4 && dashboard.values[0] === '200',
    JSON.stringify(dashboard.values));
  check('仪表盘两个分布图有数据', dashboard.bars >= 12, `bars=${dashboard.bars}`);
  check('顶栏显示登录用户', /王管理/.test(dashboard.user || ''), dashboard.user);
  await shot('01-dashboard');

  // 3. 学生列表：10 行 + 总数 200
  await goto(`${BASE}/students.html`);
  await sleep(600);
  const students = await evaluate(`({
    rows: document.querySelectorAll('#tableWrap tbody tr').length,
    pager: document.querySelector('#pager')?.textContent.replace(/\\s+/g, ' ').trim(),
    firstNo: document.querySelector('#tableWrap tbody tr td')?.textContent.trim()
  })`);
  check('学生列表默认 10 行', students.rows === 10, `rows=${students.rows}`);
  check('分页显示总条数 200', /共 200 条/.test(students.pager || ''), students.pager);
  await shot('02-students');

  // 4. 搜索：关键字「张」应只留下姓张的
  await evaluate(`(() => {
    document.getElementById('kw').value = '张';
    document.getElementById('btnSearch').click();
    return true;
  })()`);
  await sleep(900);
  const searched = await evaluate(`(() => {
    const names = Array.from(document.querySelectorAll('#tableWrap tbody tr')).map(tr => tr.children[1].textContent.trim());
    return { count: names.length, allZhang: names.every(n => n.startsWith('张')), names: names.slice(0, 3) };
  })()`);
  check('搜索「张」过滤正确', searched.allZhang && searched.count > 0, JSON.stringify(searched));

  // 5. 新增弹窗能打开、必填校验生效
  await evaluate(`document.getElementById('btnAdd').click()`);
  await sleep(300);
  const modal = await evaluate(`({
    open: document.getElementById('studentModal').classList.contains('show'),
    classOptions: document.getElementById('fClass').options.length
  })`);
  check('新增弹窗打开且班级下拉已填充', modal.open && modal.classOptions === 10, JSON.stringify(modal));
  await shot('03-student-modal');

  await evaluate(`(() => {
    document.getElementById('fStudentNo').value = '';
    document.getElementById('studentForm').dispatchEvent(new Event('submit', { cancelable: true }));
    return document.getElementById('formErr').textContent;
  })()`).then((msg) => check('空学号提交被拦截', /学号/.test(msg), msg));

  // 6. 教师账号：只能看到本班 20 人
  await evaluate(`(async () => {
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'teacher', password: '123456' })
    });
    const json = await r.json();
    localStorage.setItem('sis_token', json.data.token);
    return true;
  })()`);
  await goto(`${BASE}/students.html`);
  await sleep(700);
  const teacher = await evaluate(`({
    pager: document.querySelector('#pager')?.textContent.replace(/\\s+/g, ' ').trim(),
    classes: Array.from(new Set(Array.from(document.querySelectorAll('#tableWrap tbody tr')).map(tr => tr.children[3].textContent.trim()))),
    navAudit: !!document.querySelector('a[href="audit.html"]')
  })`);
  check('教师只看到本班 20 条', /共 20 条/.test(teacher.pager || ''), teacher.pager);
  check('教师列表只有一个班级', teacher.classes.length === 1, JSON.stringify(teacher.classes));
  check('教师侧栏无操作日志入口', teacher.navAudit === false, String(teacher.navAudit));

  // 7. 控制台错误
  check('页面无 JS 异常', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (err) {
  console.error('自检中断：', err.message);
  results.push({ name: '执行未跑完', ok: false, detail: err.message });
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  browser.kill();
  await sleep(300);
  fs.rmSync(userDataDir, { recursive: true, force: true });

  const failed = results.filter((r) => !r.ok);
  console.log('');
  console.log(`结果：${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) {
    console.log('未通过：', failed.map((f) => f.name).join('；'));
    process.exit(1);
  }
}
