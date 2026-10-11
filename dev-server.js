/**
 * dev-server.js — รันหน้าเว็บบนเครื่อง (แทน Live Server / npx serve): node dev-server.js → http://127.0.0.1:5500
 * เสิร์ฟไฟล์ใน docs/ (SPA: ไม่พบไฟล์ → index.html) + ส่งต่อ /api/* ไปบริการจริงแบบเดียวกับ nginx.conf
 * /api/notify = ตัวส่งแจ้งเตือนของ push-worker รันในโปรเซสนี้ (ต้องมี push-worker/worker.secret)
 * (Live Server / npx serve รับแค่ GET → AI / อ่านออกเสียง ได้ 405 — ปิด Live Server ก่อน เพราะใช้พอร์ต 5500 เหมือนกัน) · ไม่ใช้ใน Docker image — ไม่ต้องติดตั้ง package
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 5500;
const ROOT = path.join(__dirname, 'docs');
const NOTIFY_PORT = Number(process.env.NOTIFY_PORT) || 8790;

// /api/notify → ตัวส่งแจ้งเตือนชุดเดียวกับใน container (push-worker/notify-relay.js) รันในโปรเซสนี้
// ฐานข้อมูล/คีย์จาก docs/env-config.js · รหัสลับจาก push-worker/worker.secret
(async () => {
  try {
    const env = fs.readFileSync(path.join(ROOT, 'env-config.js'), 'utf8');
    const val = k => ((env.match(new RegExp('window\\.' + k + "\\s*=\\s*'([^']*)'")) || [])[1] || '');
    const base = val('SUPABASE_URL').replace(/\/+$/, ''), key = val('SUPABASE_ANON_KEY');
    const secret = fs.readFileSync(path.join(__dirname, 'push-worker', 'worker.secret'), 'utf8').trim();
    const rpc = async (fn, args = {}) => {
      const r = await fetch(base + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        headers: { apikey: key, authorization: 'Bearer ' + key, 'content-type': 'application/json' },
        body: JSON.stringify({ p_secret: secret, ...args }),
      });
      const t = await r.text();
      if (!r.ok) throw new Error(fn + ' ' + r.status + ': ' + t);
      return t ? JSON.parse(t) : null;
    };
    const { serveNotify } = await import('./push-worker/notify-relay.js');
    serveNotify(rpc, NOTIFY_PORT);
  } catch (e) { console.warn('แจ้งเตือน BMS Notify ใช้ไม่ได้บนเครื่องนี้:', e.message); }
})();

// ต้องตรงกับ location ใน nginx.conf
const ROUTES = [
  { re: /^\/api\/ai\/v1\/(models|chat\/completions)$/, to: m => 'https://vllm-gemma.bmscloud.in.th/v1/' + m[1] },
  { re: /^\/api\/tts$/, to: () => 'https://vox-cpm.bmscloud.in.th/v1/audio/speech' },
  { re: /^\/api\/notify$/, to: () => 'http://127.0.0.1:' + NOTIFY_PORT + '/notify', pass: ['x-bo-session'] },
  { re: /^\/api\/hcode\/(.*)$/, to: (m, search) => 'https://hcode.moph.go.th/api/' + m[1] + search, pass: ['authorization'] },
  { re: /^\/api\/emailjs\/send$/, to: () => 'https://api.emailjs.com/api/v1.0/email/send', pass: ['origin', 'referer', 'user-agent'] },
];

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.pdf': 'application/pdf',
};

async function proxy(req, res, url, pass = []) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = { 'content-type': req.headers['content-type'] || 'application/json', accept: req.headers.accept || '*/*' };
  for (const h of pass) if (req.headers[h]) headers[h] = req.headers[h];
  try {
    const up = await fetch(url, {
      method: req.method,
      headers,
      body: req.method === 'GET' ? undefined : Buffer.concat(chunks),
    });
    res.writeHead(up.status, { 'content-type': up.headers.get('content-type') || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(Buffer.from(await up.arrayBuffer()));
  } catch (e) {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream: ' + e.message }));
  }
}

function serveFile(req, res, pathname) {
  let file = path.join(ROOT, decodeURIComponent(pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = path.join(ROOT, 'index.html');
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const size = fs.statSync(file).size;
  // วิดีโอ/เสียง: Safari บน iPhone/iPad ขอเป็นช่วง (Range) และเล่นไม่ได้ถ้าไม่ตอบ 206 แบบเดียวกับ nginx
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && (m[1] || m[2])) {
    let start = m[1] ? +m[1] : Math.max(0, size - +m[2]);
    let end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { 'content-range': 'bytes */' + size });
      return res.end();
    }
    res.writeHead(206, { 'content-type': type, 'cache-control': 'no-cache', 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache', 'accept-ranges': 'bytes', 'content-length': size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const { pathname, search } = new URL(req.url, 'http://localhost');
  for (const r of ROUTES) {
    const m = pathname.match(r.re);
    if (m) return proxy(req, res, r.to(m, search), r.pass);
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveFile(req, res, pathname);
}).on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? 'พอร์ต ' + PORT + ' ถูกใช้อยู่ — ปิด Live Server (กด "Port : ' + PORT + '" ที่แถบล่าง VS Code) แล้วรันใหม่' : e.message);
  process.exit(1);
// ผูก 0.0.0.0 ตรง ๆ — ถ้าปล่อยค่าเริ่มต้น (IPv6 [::]) Windows ยอมให้เปิดซ้อน Live Server ได้ แล้ว 127.0.0.1 ยังวิ่งไป Live Server (405)
}).listen(PORT, '0.0.0.0', () => console.log('dev server → http://127.0.0.1:' + PORT));
