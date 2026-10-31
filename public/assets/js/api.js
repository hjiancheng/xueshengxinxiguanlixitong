/**
 * 统一的请求层：自动带 token、统一解析 { code, message, data }、401 自动跳登录页。
 */
const TOKEN_KEY = 'sis_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401) {
    clearToken();
    if (!location.pathname.endsWith('login.html')) location.replace('login.html');
    throw new Error('登录已过期，请重新登录');
  }

  const json = await res.json().catch(() => ({ code: res.status, message: '服务器返回异常' }));
  if (!res.ok || json.code !== 0) throw new Error(json.message || '请求失败');
  return json.data;
}

export const api = {
  // 认证
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: { username, password } }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me'),

  // 学生
  students: (query = {}) => request(`/api/students?${new URLSearchParams(query)}`),
  student: (id) => request(`/api/students/${id}`),
  createStudent: (body) => request('/api/students', { method: 'POST', body }),
  updateStudent: (id, body) => request(`/api/students/${id}`, { method: 'PUT', body }),
  deleteStudent: (id) => request(`/api/students/${id}`, { method: 'DELETE' }),

  // 班级 / 院系 / 课程
  classes: () => request('/api/classes'),
  createClass: (body) => request('/api/classes', { method: 'POST', body }),
  updateClass: (id, body) => request(`/api/classes/${id}`, { method: 'PUT', body }),
  deleteClass: (id) => request(`/api/classes/${id}`, { method: 'DELETE' }),

  departments: () => request('/api/departments'),
  courses: () => request('/api/courses'),
  createCourse: (body) => request('/api/courses', { method: 'POST', body }),
  updateCourse: (id, body) => request(`/api/courses/${id}`, { method: 'PUT', body }),
  deleteCourse: (id) => request(`/api/courses/${id}`, { method: 'DELETE' }),

  // 用户（选班主任用）
  users: () => request('/api/users'),

  // 成绩
  scores: (query = {}) => request(`/api/scores?${new URLSearchParams(query)}`),
  createScore: (body) => request('/api/scores', { method: 'POST', body }),
  updateScore: (id, body) => request(`/api/scores/${id}`, { method: 'PUT', body }),
  deleteScore: (id) => request(`/api/scores/${id}`, { method: 'DELETE' }),
  scoreStats: (query = {}) => request(`/api/scores/stats?${new URLSearchParams(query)}`),

  // 统计与日志
  overview: () => request('/api/stats/overview'),
  auditLogs: (query = {}) => request(`/api/audit-logs?${new URLSearchParams(query)}`),
};

/** 导出 CSV：走 fetch + blob，才能带上 Authorization 头 */
export async function downloadStudentsCsv(query = {}) {
  const res = await fetch(`/api/students/export?${new URLSearchParams(query)}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('导出失败，请稍后重试');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `学生名单-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
