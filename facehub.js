// ================================================================
// facehub.js — Backend เข้าสู่ระบบด้วยใบหน้า (njs ทำงานใน nginx ของ container หน้าเว็บ)
// เบราว์เซอร์เรียกแค่ /api/face/* ของเว็บนี้ (ดู nginx.conf) → ไฟล์นี้เป็นคนเรียก FaceHub พร้อม
// API key + hcode จาก ENV · เบราว์เซอร์ไม่เห็น key และไม่เรียก FaceHub โดยตรงเด็ดขาด
// เปิดเฉพาะงานที่ระบบนี้ใช้: ตรวจสถานะ / สแกนเข้าระบบ / ลืมรหัสผ่าน (สแกนแล้วตั้งรหัสใหม่)
// / ลงทะเบียน-ลบใบหน้าของตัวเอง (ต้องยืนยันรหัสผ่าน)
// ไม่มีทางดูรายชื่อ/ลบใบหน้าของคนอื่น
// ENV: FACEHUB_API_KEY, FACEHUB_HCODE (จำเป็น) · FACEHUB_URL (ค่าเริ่มต้น https://facehub.bmscloud.in.th)
//      SUPABASE_URL, SUPABASE_ANON_KEY (ใช้ตรวจรหัสผ่านตอนลงทะเบียน/ลบ — ตัวเดียวกับที่หน้าเว็บใช้อยู่แล้ว)
// ================================================================

// ป้ายในใบหน้าที่ลงทะเบียน — hcode เดียวกันอาจมีระบบอื่นลงทะเบียนไว้ด้วย นับเฉพาะของระบบนี้
var APP = 'backoffice-teams';
// คีย์ทดลองที่เปิดเผยในหน้า demo ของ FaceHub — ใครก็ใช้ได้ (เพิ่มใบหน้าตัวเองเข้าบัญชีคนอื่นได้)
// ระหว่างใช้คีย์นี้ ปิดใบหน้าสำหรับ Role admin (ลงทะเบียน/เข้าสู่ระบบ) · เปลี่ยนเป็นคีย์จริงแล้วเปิดเอง
var DEMO_KEY = 'demo-key-123';
var MAX_IMAGES = 5;
var MAX_IMAGE_CHARS = 2500000; // base64 ต่อรูป (~1.8MB)

function cfg() {
  var e = process.env;
  return {
    url: String(e.FACEHUB_URL || 'https://facehub.bmscloud.in.th').replace(/\/+$/, ''),
    key: e.FACEHUB_API_KEY || '',
    hcode: e.FACEHUB_HCODE || '',
    sbUrl: String(e.SUPABASE_URL || '').replace(/\/+$/, ''),
    sbKey: e.SUPABASE_ANON_KEY || '',
  };
}
function enabled(c) { return !!(c.key && c.hcode); }
function isDemo(c) { return c.key === DEMO_KEY; }
var ADMIN_BLOCKED = 'บัญชี Admin ยังใช้ใบหน้าไม่ได้ระหว่างใช้คีย์ทดลอง — เข้าสู่ระบบด้วยรหัสผ่าน';

function send(r, code, obj) {
  r.headersOut['Content-Type'] = 'application/json; charset=utf-8';
  r.headersOut['Cache-Control'] = 'no-store';
  r.return(code, JSON.stringify(obj));
}
function fail(r, code, msg) { send(r, code, { error: msg }); }

function body(r) {
  try { return JSON.parse(r.requestText || ''); } catch (e) { return null; }
}
// รับได้ทั้ง base64 ล้วน และ data URL (data:image/jpeg;base64,...)
function cleanImage(s) {
  if (typeof s !== 'string') return '';
  var i = s.indexOf('base64,');
  var b = (i > -1 ? s.slice(i + 7) : s).replace(/\s+/g, '');
  if (!b || b.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/=]+$/.test(b)) return '';
  return b;
}

async function facehub(c, method, path, payload) {
  var opt = { method: method, headers: { 'Authorization': 'Bearer ' + c.key, 'Content-Type': 'application/json' } };
  if (payload) opt.body = JSON.stringify(payload);
  var res = await ngx.fetch(c.url + path, opt);
  var data = null;
  try { data = await res.json(); } catch (e) {}
  return { status: res.status, data: data };
}

async function users(c, filter) {
  var q = c.sbUrl + '/rest/v1/users?select=id,user_id,username,password,role,is_active&' + filter;
  var res = await ngx.fetch(q, { headers: { 'apikey': c.sbKey, 'Authorization': 'Bearer ' + c.sbKey } });
  if (res.status !== 200) throw new Error('users ' + res.status);
  return await res.json();
}
// ── ตรวจชื่อผู้ใช้ + รหัสผ่านกับตาราง users (กฎเดียวกับหน้า Login: ตรงตัว + บัญชีเปิดอยู่) → { id, role } ──
async function verifyUser(c, username, password) {
  if (!username || !password) return null;
  var rows = await users(c, 'username=eq.' + encodeURIComponent(username));
  for (var i = 0; i < rows.length; i++) {
    var u = rows[i];
    if (u.username === username && u.password === password && u.is_active !== false) return { id: String(u.user_id || u.id), role: u.role };
  }
  return null;
}
async function roleOf(c, userId) {
  var id = encodeURIComponent(userId);
  var rows = await users(c, 'or=(id.eq.' + id + ',user_id.eq.' + id + ')');
  return rows.length ? rows[0].role : '';
}

// ใบหน้าของผู้ใช้คนนี้ที่ระบบนี้ลงทะเบียนไว้ (กรองป้าย APP กันชนกับระบบอื่นใน hcode เดียวกัน)
async function mySubjects(c, userId) {
  var r = await facehub(c, 'GET', '/subject/find?key=user_id&value=' + encodeURIComponent(userId) + '&hcode=' + encodeURIComponent(c.hcode));
  if (r.status !== 200) throw new Error('find ' + r.status);
  return ((r.data && r.data.subjects) || []).filter(function (s) { return s.metadata && s.metadata.app === APP; });
}
async function removeSubjects(c, subjects) {
  for (var i = 0; i < subjects.length; i++) {
    var d = await facehub(c, 'DELETE', '/subject/' + encodeURIComponent(subjects[i].subject_id));
    if (d.status !== 200) throw new Error('delete ' + d.status);
  }
}

function guard(r, method) {
  var c = cfg();
  if (r.method !== method) { fail(r, 405, 'method not allowed'); return null; }
  if (!enabled(c)) { fail(r, 503, 'ยังไม่ได้ตั้งค่าเข้าสู่ระบบด้วยใบหน้า'); return null; }
  return c;
}
function upstreamError(r, e) {
  ngx.log(ngx.ERR, 'facehub: ' + (e && e.message || e));
  fail(r, 502, 'เชื่อมต่อระบบใบหน้าไม่ได้ ลองใหม่อีกครั้ง');
}

// GET /api/face/config → หน้าเว็บใช้ตัดสินว่าจะแสดงปุ่ม "เข้าสู่ระบบด้วยใบหน้า" ไหม
function config(r) { var c = cfg(); send(r, 200, { enabled: enabled(c), demo: isDemo(c) }); }

// POST /api/face/match { image } → { matched, user_id?, score? }
async function match(r) {
  var c = guard(r, 'POST'); if (!c) return;
  var b = body(r), img = b && cleanImage(b.image);
  if (!img) return fail(r, 400, 'ไม่มีรูปใบหน้า');
  try {
    var m = await facehub(c, 'POST', '/match', { hcode: c.hcode, base64: img });
    if (m.status !== 200) return upstreamError(r, 'match ' + m.status);
    var res = m.data && m.data.result, meta = res && res.metadata;
    if (m.data.matched && meta && meta.app === APP && meta.user_id) {
      if (isDemo(c) && (await roleOf(c, String(meta.user_id))) === 'admin') return fail(r, 403, ADMIN_BLOCKED);
      return send(r, 200, { matched: true, user_id: String(meta.user_id), score: res.score });
    }
    send(r, 200, { matched: false });
  } catch (e) { upstreamError(r, e); }
}

// POST /api/face/reset { image, password } → ลืมรหัสผ่าน: สแกนเจอใบหน้าของใคร ตั้งรหัสผ่านใหม่ให้บัญชีนั้น
// (เซิร์ฟเวอร์ตัดสินบัญชีจากใบหน้าเอง หน้าเว็บเลือกบัญชีไม่ได้) → { ok, username }
async function reset(r) {
  var c = guard(r, 'POST'); if (!c) return;
  var b = body(r), img = b && cleanImage(b.image), pw = b && typeof b.password === 'string' ? b.password : '';
  if (!img) return fail(r, 400, 'ไม่มีรูปใบหน้า');
  if (pw.length < 4) return fail(r, 400, 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร');
  try {
    var m = await facehub(c, 'POST', '/match', { hcode: c.hcode, base64: img });
    if (m.status !== 200) return upstreamError(r, 'match ' + m.status);
    var res = m.data && m.data.result, meta = res && res.metadata;
    if (!(m.data.matched && meta && meta.app === APP && meta.user_id)) return fail(r, 404, 'ไม่พบใบหน้านี้ในระบบ');
    var id = encodeURIComponent(String(meta.user_id));
    var rows = await users(c, 'or=(id.eq.' + id + ',user_id.eq.' + id + ')');
    var u = rows[0];
    if (!u || u.is_active === false) return fail(r, 403, 'บัญชีนี้ถูกปิดการใช้งาน ติดต่อ Admin');
    if (isDemo(c) && u.role === 'admin') return fail(r, 403, ADMIN_BLOCKED);
    var patch = function (data) {
      return ngx.fetch(c.sbUrl + '/rest/v1/users?id=eq.' + encodeURIComponent(u.id), {
        method: 'PATCH', body: JSON.stringify(data),
        headers: { 'apikey': c.sbKey, 'Authorization': 'Bearer ' + c.sbKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      });
    };
    var p = await patch({ password: pw });
    if (p.status !== 204 && p.status !== 200) throw new Error('update password ' + p.status);
    // ล้างคำขอรีเซ็ตที่ค้างไว้ถึง Admin (ถ้ามี) — คอลัมน์ยังไม่มีก็ไม่เป็นไร
    try { await patch({ pw_reset_requested_at: null }); } catch (e) {}
    send(r, 200, { ok: true, username: u.username });
  } catch (e) { upstreamError(r, e); }
}

// POST /api/face/status { user_id } → { registered }
async function status(r) {
  var c = guard(r, 'POST'); if (!c) return;
  var b = body(r);
  if (!b || !b.user_id) return fail(r, 400, 'ไม่มีรหัสผู้ใช้');
  try { send(r, 200, { registered: (await mySubjects(c, String(b.user_id))).length > 0 }); }
  catch (e) { upstreamError(r, e); }
}

// POST /api/face/register { username, password, images[] } → ลงทะเบียนใหม่แทนของเดิม (ถ้ามี)
async function register(r) {
  var c = guard(r, 'POST'); if (!c) return;
  var b = body(r);
  if (!b || !Array.isArray(b.images) || !b.images.length || b.images.length > MAX_IMAGES) return fail(r, 400, 'ต้องมีรูปใบหน้า 1–' + MAX_IMAGES + ' รูป');
  var imgs = b.images.map(cleanImage);
  if (imgs.some(function (x) { return !x; })) return fail(r, 400, 'รูปใบหน้าไม่ถูกต้อง');
  try {
    var u = await verifyUser(c, String(b.username || ''), String(b.password || ''));
    if (!u) return fail(r, 401, 'รหัสผ่านไม่ถูกต้อง');
    if (isDemo(c) && u.role === 'admin') return fail(r, 403, ADMIN_BLOCKED);
    var userId = u.id;
    await removeSubjects(c, await mySubjects(c, userId));
    var reg = await facehub(c, 'POST', '/register', {
      hcode: c.hcode, images: imgs, save_image: false,
      metadata: { app: APP, user_id: userId, username: String(b.username) },
    });
    if (reg.status === 422 || reg.status === 400) return fail(r, 422, 'ตรวจไม่พบใบหน้าในรูป ลองถ่ายใหม่ให้เห็นหน้าชัด ๆ');
    if (reg.status !== 200) return upstreamError(r, 'register ' + reg.status);
    send(r, 200, { ok: true, faces: ((reg.data && reg.data.face_ids) || []).length });
  } catch (e) { upstreamError(r, e); }
}

// POST /api/face/remove { username, password } → ลบใบหน้าของตัวเองออกจากระบบ
async function remove(r) {
  var c = guard(r, 'POST'); if (!c) return;
  var b = body(r) || {};
  try {
    var u = await verifyUser(c, String(b.username || ''), String(b.password || ''));
    if (!u) return fail(r, 401, 'รหัสผ่านไม่ถูกต้อง');
    var subs = await mySubjects(c, u.id);
    await removeSubjects(c, subs);
    send(r, 200, { ok: true, removed: subs.length });
  } catch (e) { upstreamError(r, e); }
}

export default { config, match, reset, status, register, remove };
