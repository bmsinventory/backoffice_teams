// ตัวส่ง Web Push — รันอยู่ใน frontend container เดียวกับ nginx (docker-entrypoint.sh สั่ง start)
// ไม่ต้องตั้งค่าอะไรบน server เพิ่ม: ใช้ SUPABASE_ANON_KEY + API_UPSTREAM/SUPABASE_URL ที่ container มีอยู่แล้ว
// VAPID key คำนวณจาก worker.secret (ฝังใน image ตอน build) — private key ไม่ถูกเก็บที่ไหนเลย
// ฐานข้อมูลเก็บแค่ public key · RPC ของตัวส่งต้องแนบรหัสลับ (ดู WEB PUSH ใน db-schema.sql)
import { createECDH, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import webpush from 'web-push';

const base = (process.env.API_UPSTREAM || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const anonKey = process.env.SUPABASE_ANON_KEY || '';
const pollMs = Math.max(1000, Number(process.env.PUSH_POLL_MS) || 3000);

let secret = '';
try { secret = readFileSync(new URL('./worker.secret', import.meta.url), 'utf8').trim(); } catch (_) {}
if (!base || !anonKey || !secret) {
  console.warn('[push-worker] ไม่มี SUPABASE_URL / SUPABASE_ANON_KEY / worker.secret — ปิดการส่ง Web Push');
  process.exit(0);
}

// รหัสลับเดิม → VAPID key คู่เดิมเสมอ (container restart / deploy ใหม่ ไม่ทำให้ผู้ใช้ต้องสมัครใหม่)
function vapidKeys() {
  for (let i = 0; ; i++) {
    const priv = createHmac('sha256', secret).update('vapid-p256:' + i).digest();
    try {
      const ecdh = createECDH('prime256v1');
      ecdh.setPrivateKey(priv);
      return { publicKey: ecdh.getPublicKey().toString('base64url'), privateKey: priv.toString('base64url') };
    } catch (_) { /* นอกช่วงของ P-256 (โอกาสแทบเป็นศูนย์) → ลองค่าถัดไป */ }
  }
}

async function rpc(fn, args = {}) {
  const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: anonKey, authorization: `Bearer ${anonKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_secret: secret, ...args }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function notification(job) {
  const p = job.payload || {};
  const ticketId = String(p.ticketId || '');
  return JSON.stringify({
    title: p.title || 'BMS Backoffice Teams',
    body: p.body || 'มีข้อความใหม่ในศูนย์ช่วยเหลือ',
    tag: p.tag || `helpdesk-${ticketId}`,
    url: `/#helpdesk=${encodeURIComponent(ticketId)}`,
  });
}

async function deliver(job) {
  const devices = await rpc('web_push_worker_subscriptions');
  const payload = notification(job);
  let sent = 0;
  for (const d of devices || []) {
    try {
      await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
        payload, { TTL: 86400, urgency: 'high' });
      sent++;
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) await rpc('web_push_worker_drop', { p_id: d.id });
      else console.warn(`[push-worker] ส่งไม่สำเร็จ ${d.id}:`, (e && e.statusCode) || '', (e && e.message) || e);
    }
  }
  return sent;
}

let running = false;
async function poll() {
  if (running) return;
  running = true;
  try {
    const jobs = await rpc('web_push_worker_claim', { p_limit: 20 });
    for (const job of jobs || []) {
      try {
        const n = await deliver(job);
        await rpc('web_push_worker_finish', { p_id: job.id, p_ok: true, p_error: '' });
        console.log(`[push-worker] ${job.id}: ส่งถึง ${n} เครื่อง`);
      } catch (e) {
        await rpc('web_push_worker_finish', { p_id: job.id, p_ok: false, p_error: String((e && e.message) || e) })
          .catch(() => {});
        console.error(`[push-worker] ${job.id}:`, (e && e.message) || e);
      }
    }
  } catch (e) {
    console.error('[push-worker] poll:', (e && e.message) || e);
  } finally {
    running = false;
  }
}

async function start() {
  const keys = vapidKeys();
  webpush.setVapidDetails('mailto:admin@bmscloud.in.th', keys.publicKey, keys.privateKey);
  // ยังไม่ได้รัน SQL ส่วน Web Push / DB ยังไม่พร้อม → รอแล้วลองใหม่ (nginx ทำงานต่อปกติ)
  for (;;) {
    try { await rpc('web_push_worker_init', { p_public: keys.publicKey }); break; }
    catch (e) {
      console.warn('[push-worker] ยังเริ่มไม่ได้ (ลองใหม่ใน 60 วินาที):', (e && e.message) || e);
      await new Promise((r) => setTimeout(r, 60_000));
    }
  }
  console.log(`[push-worker] พร้อมส่ง Web Push · ตรวจคิวทุก ${pollMs}ms`);
  poll();
  setInterval(poll, pollMs);
}

start();
