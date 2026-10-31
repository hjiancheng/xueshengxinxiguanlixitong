import { currentUser, logout } from './auth.js';

/* ---------------- 基础工具 ---------------- */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

export const fmtTime = (text) => String(text ?? '').slice(0, 16);

/* ---------------- 页面外壳 ---------------- */

const NAV = [
  { key: 'index', href: 'index.html', ico: '▦', label: '仪表盘' },
  { key: 'students', href: 'students.html', ico: '👤', label: '学生管理' },
  { key: 'classes', href: 'classes.html', ico: '🏫', label: '班级管理' },
  { key: 'courses', href: 'courses.html', ico: '📚', label: '课程管理' },
  { key: 'scores', href: 'scores.html', ico: '📝', label: '成绩管理' },
  { key: 'audit', href: 'audit.html', ico: '🧾', label: '操作日志', adminOnly: true },
];

/**
 * 渲染侧栏 + 顶栏，返回内容容器（页面把内容塞进去）。
 * 侧栏菜单只维护这一份，改导航不用改 7 个页面。
 */
export function mountShell({ active = 'index', title = '', sub = '' } = {}) {
  const user = currentUser() || {};
  const initial = (user.real_name || '用').slice(0, 1);
  const navHtml = NAV
    .filter((item) => !item.adminOnly || user.role === 'admin')
    .map((item) => `<a href="${item.href}" class="${item.key === active ? 'active' : ''}">
        <span class="ico">${item.ico}</span>${item.label}</a>`)
    .join('');

  $('#shell').innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand"><span class="logo">学</span>学生信息系统</div>
        <nav class="nav">${navHtml}</nav>
        <div class="sidebar-foot">
          v0.1 · 教育蓝<br />${user.role === 'admin' ? '管理员视图' : '教师视图'}
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <div class="crumb">首页 / <b>${esc(title)}</b></div>
          <div class="user">
            <span>${esc(user.real_name || '')}</span>
            <span class="badge ${user.role === 'admin' ? '' : 'gray'}">${user.role === 'admin' ? '管理员' : '教师'}</span>
            <span class="avatar">${esc(initial)}</span>
            <button class="btn btn-sm" id="btnLogout">退出</button>
          </div>
        </header>
        <main class="content">
          <h1 class="page-title">${esc(title)}</h1>
          ${sub ? `<p class="page-sub">${sub}</p>` : ''}
          <div id="pageBody"></div>
        </main>
      </div>
    </div>`;

  $('#btnLogout').addEventListener('click', logout);
  return $('#pageBody');
}

/* ---------------- 通用组件 ---------------- */

export function toast(message, type = 'ok') {
  let box = $('#toastBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toastBox';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast${type === 'err' ? ' err' : ''}`;
  el.textContent = message;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 220);
  }, 2400);
}

export const openModal = (id) => {
  const mask = document.getElementById(id);
  if (mask) mask.classList.add('show');
};
export const closeModal = (id) => {
  const mask = document.getElementById(id);
  if (mask) mask.classList.remove('show');
};

/** 点遮罩空白处关闭弹窗（弹窗内点击不关闭） */
export function bindMaskClose(id) {
  const mask = document.getElementById(id);
  if (!mask) return;
  mask.addEventListener('click', (e) => {
    if (e.target === mask) closeModal(id);
  });
}

export const statusBadge = (status) => {
  const cls = status === '在读' ? 'ok' : status === '休学' ? 'warn' : 'gray';
  return `<span class="badge ${cls}">${esc(status)}</span>`;
};

export const scoreClass = (score) => {
  const n = Number(score);
  return n >= 90 ? 'score-excellent' : n < 60 ? 'score-fail' : '';
};

/** 分页条：共 N 条 + 上一页/页码窗口/下一页 */
export function renderPager(container, { page, pageSize, total }, onChange) {
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const current = Math.min(Math.max(page, 1), totalPages);

  let start = Math.max(1, current - 2);
  const end = Math.min(totalPages, start + 4);
  start = Math.max(1, end - 4);

  const buttons = [];
  for (let p = start; p <= end; p += 1) {
    buttons.push(`<button data-page="${p}" class="${p === current ? 'active' : ''}">${p}</button>`);
  }

  container.innerHTML = `
    <span class="hint-inline">共 ${total} 条 · 第 ${current}/${totalPages} 页</span>
    <div class="pages">
      <button data-page="${current - 1}" ${current === 1 ? 'disabled' : ''}>上一页</button>
      ${buttons.join('')}
      <button data-page="${current + 1}" ${current === totalPages ? 'disabled' : ''}>下一页</button>
    </div>`;

  $$('button[data-page]', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = Number(btn.dataset.page);
      if (target >= 1 && target <= totalPages && target !== current) onChange(target);
    });
  });
}

/** CSS 条形图：不引第三方图表库，离线也能跑 */
export function renderBars(container, items) {
  if (!items || !items.length) {
    container.innerHTML = '<div class="empty">暂无数据</div>';
    return;
  }
  const max = Math.max(...items.map((i) => i.count), 1);
  container.innerHTML = items
    .map((i) => `
      <div class="bar-row">
        <span class="name" title="${esc(i.label)}">${esc(i.label)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.round((i.count / max) * 100)}%"></span></span>
        <span class="val">${i.count}</span>
      </div>`)
    .join('');
}

/** 统计卡片 */
export function statCard(label, value, hint = '') {
  return `<div class="card stat">
    <div class="label">${esc(label)}</div>
    <div class="value">${esc(value)}</div>
    ${hint ? `<div class="trend">${esc(hint)}</div>` : ''}
  </div>`;
}

/* 审计日志的中文映射 */
export const ACTION_LABEL = {
  create: '新增', update: '修改', delete: '删除',
  login: '登录', logout: '退出', export: '导出',
};
export const ENTITY_LABEL = {
  students: '学生', classes: '班级', courses: '课程',
  departments: '院系', scores: '成绩', users: '账号',
};

/** 页面统一的错误展示：给出原因和重试入口 */
export function showError(container, message, onRetry) {
  container.innerHTML = `<div class="err-box">加载失败：${esc(message)}</div>`;
  if (onRetry) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = '重试';
    btn.addEventListener('click', onRetry);
    container.querySelector('.err-box').appendChild(document.createElement('br'));
    container.querySelector('.err-box').appendChild(btn);
  }
}
