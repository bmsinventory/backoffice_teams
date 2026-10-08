import http from 'node:http';
import webpush from 'web-push';

const required = ['SUPABASE_URL', 'SERVICE_ROLE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`[push-worker] Missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const base = process.env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1';
const serviceKey = process.env.SERVICE_ROLE_KEY;
const appUrl = (process.env.APP_URL || '').replace(/\/+$/, '');
const pollMs = Math.max(1000, Number(process.env.PUSH_POLL_MS) || 3000);
const port = Number(process.env.PORT) || 8080;

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

async function rest(path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`PostgREST ${response.status}: ${await response.text()}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function patch(table, id, body) {
  return rest(`/${table}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) });
}

async function subscriptions() {
  return rest('/web_push_subscriptions?active=eq.true&select=id,endpoint,p256dh,auth');
}

function notification(job) {
  const p = job.payload || {};
  const ticketId = String(p.ticketId || '');
  const url = appUrl ? `${appUrl}/#helpdesk=${encodeURIComponent(ticketId)}` : `/#helpdesk=${encodeURIComponent(ticketId)}`;
  return JSON.stringify({
    title: p.title || 'BMS Backoffice Teams',
    body: p.body || 'มีข้อความใหม่ในศูนย์ช่วยเหลือ',
    tag: p.tag || `helpdesk-${ticketId}`,
    url,
  });
}

async function deliver(job) {
  const devices = await subscriptions();
  const payload = notification(job);
  let delivered = 0;
  for (const device of devices || []) {
    try {
      await webpush.sendNotification({
        endpoint: device.endpoint,
        keys: { p256dh: device.p256dh, auth: device.auth },
      }, payload, { TTL: 86400, urgency: 'high' });
      delivered++;
    } catch (error) {
      const code = error && error.statusCode;
      if (code === 404 || code === 410) {
        await patch('web_push_subscriptions', device.id, { active: false, updated_at: new Date().toISOString() });
      } else {
        console.warn(`[push-worker] Delivery failed for ${device.id}:`, code || '', error.message || error);
      }
    }
  }
  return delivered;
}

let running = false;
async function poll() {
  if (running) return;
  running = true;
  try {
    const now = new Date().toISOString();
    const jobs = await rest('/web_push_jobs?status=eq.pending&next_attempt_at=lte.' + encodeURIComponent(now) + '&order=created_at.asc&limit=20');
    for (const job of jobs || []) {
      try {
        await patch('web_push_jobs', job.id, { status: 'processing', attempts: (job.attempts || 0) + 1 });
        const count = await deliver(job);
        await patch('web_push_jobs', job.id, {
          status: 'sent', processed_at: new Date().toISOString(), last_error: '',
        });
        console.log(`[push-worker] ${job.id}: sent to ${count} device(s)`);
      } catch (error) {
        const attempts = (job.attempts || 0) + 1;
        const retry = attempts < 5;
        const delayMs = Math.min(15 * 60_000, 15_000 * Math.pow(2, attempts - 1));
        await patch('web_push_jobs', job.id, {
          status: retry ? 'pending' : 'failed',
          next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
          last_error: String(error.message || error).slice(0, 1000),
        });
        console.error(`[push-worker] ${job.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[push-worker] Poll failed:', error);
  } finally {
    running = false;
  }
}

http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404); res.end();
}).listen(port, () => console.log(`[push-worker] Health server listening on :${port}`));

console.log(`[push-worker] Polling every ${pollMs}ms`);
// A container may stop after claiming a job. Return such jobs to the queue on
// startup; source ids are unique, so retrying cannot create duplicate jobs.
rest('/web_push_jobs?status=eq.processing', {
  method: 'PATCH', body: JSON.stringify({ status: 'pending', next_attempt_at: new Date().toISOString() }),
}).catch((error) => console.error('[push-worker] Recovery failed:', error)).finally(poll);
setInterval(poll, pollMs);
