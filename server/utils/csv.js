/**
 * 生成 CSV 文本。
 * 首字符写入 BOM（\uFEFF），保证 Excel / WPS 双击打开中文不乱码。
 */
export function toCsv(columns, rows) {
  const head = columns.map((c) => c.title).join(',');
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          const raw = row[c.key];
          const s = raw === null || raw === undefined ? '' : String(raw);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    )
    .join('\r\n');
  return `\uFEFF${head}\r\n${body}`;
}

/**
 * 让浏览器按“下载文件”处理。
 * HTTP 头只能是 ASCII：filename= 给英文后备名，filename*= 给 RFC 5987 编码的中文名。
 */
export function sendCsv(res, filename, csv, asciiName = 'export.csv') {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  res.send(csv);
}

/** 时间戳：20261031-1530，用于导出文件名 */
export function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
}
