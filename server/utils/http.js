/**
 * 统一响应结构：{ code, message, data }
 * code = 0 表示成功；非 0 与 HTTP 状态码保持一致。
 */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function ok(res, data = null, message = 'ok') {
  res.json({ code: 0, message, data });
}

export const bad = (message = '请求参数有误') => new ApiError(400, message);
export const unauthorized = (message = '未登录或登录已过期') => new ApiError(401, message);
export const forbidden = (message = '无权访问该数据') => new ApiError(403, message);
export const notFound = (message = '数据不存在') => new ApiError(404, message);
export const conflict = (message = '数据已存在') => new ApiError(409, message);

/** 把 async 路由的异常转交给统一错误处理中间件 */
export const wrap = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
