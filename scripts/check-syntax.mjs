// 语法自检：对所有页面内联 module 脚本与 assets/js/*.js 做 node --check
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const tmp = '.tmp-check';
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

const files = [
  ...fs.readdirSync('public').filter((f) => f.endsWith('.html')).map((f) => `public/${f}`),
  'public/assets/js/api.js',
  'public/assets/js/auth.js',
  'public/assets/js/ui.js',
];

let failed = 0;
for (const file of files) {
  let code = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.html')) {
    const match = code.match(/<script type="module">([\s\S]*?)<\/script>/);
    if (!match) {
      console.log('NO MODULE SCRIPT', file);
      continue;
    }
    code = match[1];
  }
  const out = path.join(tmp, file.split(/[\\/]/).join('_') + '.mjs');
  fs.writeFileSync(out, code);
  try {
    execFileSync(process.execPath, ['--check', out], { stdio: 'pipe' });
    console.log('OK  ', file);
  } catch (err) {
    failed += 1;
    console.log('FAIL', file);
    console.log(String(err.stderr || err.message).slice(0, 800));
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `SYNTAX ERRORS: ${failed}` : 'ALL SYNTAX OK');
process.exit(failed ? 1 : 0);
