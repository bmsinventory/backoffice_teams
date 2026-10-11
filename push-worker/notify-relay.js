// ตัวส่งแจ้งเตือน BMS Notify (กลุ่ม Line) — หน้าเว็บส่งแค่ { channel, content } มาที่ /api/notify (nginx → ที่นี่)
// token อ่านจากฐานข้อมูลด้วยรหัสลับของตัวส่ง (notify_worker_token ใน db-schema.sql) — เบราว์เซอร์ไม่เคยเห็น token
// ใช้ใน index.js (ใน container) และ dev-server.js (รันบนเครื่อง)
import { createServer } from 'node:http';

const NOTIFY_URL = 'https://api-notify.bmscloud.in.th/api/v1/push-notify';
// ส่งได้เฉพาะผู้ที่ Login (แอปหลัก) · ช่องอื่นมาจากหน้าสาธารณะด้วย (แจ้งปัญหา / ขอใช้ทีม Server / ลงทะเบียนอบรม)
const LOGIN_ONLY = new Set(['leave', 'advance', 'project']);
const PUBLIC = new Set(['helpdesk', 'server', 'training']);
const MAX_BODY = 64 * 1024, MAX_CONTENT = 5000;

const json = (status, obj) => ({ status, type: 'application/json', body: JSON.stringify(obj) });

// body = { channel, content, site?, token? } · session = header x-bo-session
// token ใน body = ปุ่ม "ทดสอบ" Token ที่เพิ่งพิมพ์ยังไม่บันทึก (ระบบอบรม) — ต้อง Login
// → { status, type, body } · 204 = ช่องนี้ไม่ได้ตั้ง token / ปิดแจ้งเตือน (ไม่ได้ส่ง)
export async function relayNotify(rpc, body, session) {
  const channel = String(body?.channel || '');
  const content = String(body?.content || '').trim();
  const site = String(body?.site || '').slice(0, 80);
  const testToken = String(body?.token || '').trim();
  if (!LOGIN_ONLY.has(channel) && !PUBLIC.has(channel)) return json(400, { error: 'ไม่รู้จักช่องแจ้งเตือน' });
  if (!content) return json(400, { error: 'ไม่มีข้อความ' });
  if (content.length > MAX_CONTENT) return json(413, { error: 'ข้อความยาวเกินไป' });

  const r = await rpc('notify_worker_token', { p_channel: channel, p_site: site, p_session: String(session || '') });
  if ((testToken || LOGIN_ONLY.has(channel)) && !r?.login) return json(401, { error: 'กรุณาเข้าสู่ระบบใหม่' });
  const token = testToken || r?.token;
  if (!token) return { status: 204, type: 'text/plain', body: '' };

  const up = await fetch(NOTIFY_URL, {
    method: 'POST',
    headers: { Token: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, receiver: null }),
    signal: AbortSignal.timeout(30_000),
  });
  return { status: up.status, type: up.headers.get('content-type') || 'text/plain', body: await up.text() };
}

// HTTP ภายใน container (nginx /api/notify → 127.0.0.1:port) — ไม่เปิดออกนอกเครื่อง
export function serveNotify(rpc, port, host = '127.0.0.1') {
  const server = createServer(async (req, res) => {
    let out;
    try {
      if (req.method !== 'POST') out = json(405, { error: 'method not allowed' });
      else {
        const chunks = []; let size = 0;
        for await (const c of req) { size += c.length; if (size > MAX_BODY) break; chunks.push(c); }
        if (size > MAX_BODY) out = json(413, { error: 'ข้อมูลใหญ่เกินไป' });
        else {
          let body = null;
          try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (_) {}
          out = body ? await relayNotify(rpc, body, req.headers['x-bo-session']) : json(400, { error: 'JSON ไม่ถูกต้อง' });
        }
      }
    } catch (e) {
      console.error('[notify]', (e && e.message) || e);
      out = json(502, { error: 'ส่งแจ้งเตือนไม่สำเร็จ' });
    }
    res.writeHead(out.status, { 'content-type': out.type, 'cache-control': 'no-store' });
    res.end(out.status === 204 ? undefined : out.body);
  });
  server.on('error', (e) => console.error('[notify] เปิดพอร์ตไม่ได้:', e.message));
  server.listen(port, host, () => console.log(`[notify] พร้อมส่งแจ้งเตือน BMS Notify · http://${host}:${port}`));
  return server;
}
