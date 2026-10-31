import { api, getToken, clearToken } from './api.js';

let cachedUser = null;

/** 页面入口统一调用：无 token 直接跳登录页，有则拉一次当前用户 */
export async function requireLogin() {
  if (!getToken()) {
    location.replace('login.html');
    throw new Error('未登录');
  }
  if (!cachedUser) cachedUser = await api.me();
  return cachedUser;
}

export const currentUser = () => cachedUser;
export const isAdmin = () => cachedUser?.role === 'admin';

export async function logout() {
  try {
    await api.logout();
  } catch {
    // 退出失败也要清本地状态
  }
  clearToken();
  location.href = 'login.html';
}
