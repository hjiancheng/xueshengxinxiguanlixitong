// 临时 CONNECT 代理：绕过本机 hosts 对 github.com 的劫持，供 git push 使用。
// 用法：node scripts/github-push-proxy.mjs
// 然后在另一个终端：git -c http.proxy=http://127.0.0.1:18888 push
// 本项目根目录的「推送到GitHub.bat」会自动完成这两步。
import net from 'node:net';

const PORT = 18888;
// hosts 把 github.com 指向 127.0.0.1，这里直接换成可达 IP 并轮询重试
const POOL = {
  'github.com': ['140.82.112.4', '140.82.113.4', '140.82.114.4', '140.82.121.4'],
  'api.github.com': ['140.82.112.6', '140.82.113.6', '140.82.114.6'],
  'codeload.github.com': ['140.82.112.9', '140.82.113.9', '140.82.114.9'],
};
const MAX_ATTEMPTS = 8;
const ATTEMPT_TIMEOUT = 5000;

const log = (...a) => console.log(new Date().toISOString(), ...a);

function tryConnect(host, port, attempt) {
  return new Promise((resolve, reject) => {
    const ips = POOL[host];
    const ip = ips ? ips[attempt % ips.length] : host;
    const sock = net.connect({ port, host: ip });
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      sock.destroy();
      reject(new Error(`attempt ${attempt} ${ip} timeout`));
    }, ATTEMPT_TIMEOUT);
    sock.on('connect', () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      log(`connected ${host} via ${ip} (attempt ${attempt})`);
      resolve(sock);
    });
    sock.on('error', (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(new Error(`attempt ${attempt} ${ip} ${e.message}`));
    });
  });
}

async function connectWithRetry(host, port) {
  let lastErr;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      return await tryConnect(host, port, i);
    } catch (e) {
      lastErr = e;
      log('retry:', e.message);
    }
  }
  throw lastErr || new Error('all attempts failed');
}

const server = net.createServer((client) => {
  let handled = false;
  let settled = false;
  const pending = []; // 上游连接建立前，客户端提前发来的字节必须先缓存，不能丢

  const onData = (buf) => {
    if (handled) {
      pending.push(buf);
      return;
    }
    const text = buf.toString('latin1');
    const m = /^CONNECT\s+([^:\s]+):(\d+)/i.exec(text);
    if (!m) {
      if (text.includes('\r\n\r\n')) {
        handled = true;
        settled = true;
        client.end('HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n');
      }
      return;
    }
    handled = true;
    const host = m[1];
    const port = Number(m[2]);
    const idx = text.indexOf('\r\n\r\n');
    const rest = idx >= 0 ? buf.subarray(idx + 4) : null;
    log(`CONNECT ${host}:${port}`);

    connectWithRetry(host, port).then((upstream) => {
      settled = true;
      if (client.destroyed) { upstream.destroy(); return; }
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (rest && rest.length) upstream.write(rest);
      for (const chunk of pending) upstream.write(chunk);
      pending.length = 0;
      client.removeListener('data', onData);
      upstream.pipe(client);
      client.pipe(upstream);
      upstream.on('error', () => client.destroy());
      client.on('error', () => upstream.destroy());
    }).catch((e) => {
      settled = true;
      log('CONNECT failed:', e.message);
      client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
    });
  };

  client.on('data', onData);
  client.on('close', () => { if (!settled) log('client closed before CONNECT settled'); });
});

server.listen(PORT, '127.0.0.1', () => log(`proxy listening on 127.0.0.1:${PORT}`));
server.on('error', (e) => { log('server error:', e.message); process.exit(1); });
