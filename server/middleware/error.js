/** 未命中任何路由 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    code: 404,
    message: `接口不存在：${req.method} ${req.originalUrl}`,
    data: null,
  });
}

/** 统一错误出口：4xx 回传业务提示，5xx 只回传通用文案并打日志 */
export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (status >= 500) {
    console.error('[error]', req.method, req.originalUrl, err);
  }
  res.status(status).json({
    code: status,
    message: status >= 500 ? '服务器内部错误，请稍后重试' : err.message,
    data: null,
  });
}
