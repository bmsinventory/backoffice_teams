// hospital.js — รายชื่อโรงพยาบาล
const { esc, fc, uid, getColRef, getDocRef } = window;

window.HOSPITALS = window.HOSPITALS || [];

// ── MOPH HCODE API ─────────────────────────────────────────────────────────
const HCODE_BASE        = 'https://hcode.moph.go.th/api';
const HCODE_TOKEN_KEY   = 'hcode_access';
const HCODE_EXPIRY_KEY  = 'hcode_expiry';
const HCODE_REFRESH_KEY = 'hcode_refresh';
const HCODE_USER_KEY    = 'hcode_username';

async function _hspGetToken() {
  var access  = localStorage.getItem(HCODE_TOKEN_KEY);
  var expiry  = Number(localStorage.getItem(HCODE_EXPIRY_KEY) || 0);
  if (access && expiry > Date.now()) return access;

  var refresh = localStorage.getItem(HCODE_REFRESH_KEY);
  if (refresh) {
    try {
      var r = await fetch(HCODE_BASE + '/token/refresh/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh })
      });
      if (r.ok) {
        var d = await r.json();
        _hspSaveToken(d.access, refresh);
        return d.access;
      }
      // 401 = refresh หมดอายุจริง → ล้าง; error อื่น (500, network) → เก็บไว้ก่อน
      if (r.status === 401) localStorage.removeItem(HCODE_REFRESH_KEY);
    } catch(_) {
      // network error — ไม่ล้าง refresh token
    }
  }
  return null;
}

// per-user token cache key prefix
function _hspUserTokBase(u) { return 'hcode_tok_' + u; }

function _hspSaveToken(access, refresh) {
  var expiry = String(Date.now() + 225 * 60 * 1000); // 225 min
  localStorage.setItem(HCODE_TOKEN_KEY,   access);
  localStorage.setItem(HCODE_EXPIRY_KEY,  expiry);
  if (refresh) localStorage.setItem(HCODE_REFRESH_KEY, refresh);
  // บันทึกแยกต่อ user เพื่อ switch account โดยไม่ต้องเรียก /token/ ซ้ำ
  var u = localStorage.getItem(HCODE_USER_KEY);
  if (u) {
    var b = _hspUserTokBase(u);
    localStorage.setItem(b + '_a', access);
    localStorage.setItem(b + '_e', expiry);
    if (refresh) localStorage.setItem(b + '_r', refresh);
  }
}

// Login ด้วย username/password
window.hspApiLogin = async function() {
  var u    = document.getElementById('hsp-api-user')?.value.trim();
  var p    = document.getElementById('hsp-api-pass')?.value;
  var btn  = document.getElementById('hsp-api-login-btn');
  var stat = document.getElementById('hsp-api-stat');
  var errBox = document.getElementById('hsp-api-err');

  function showErr(msg) {
    if (errBox) { errBox.textContent = msg; errBox.style.display = ''; }
    if (stat) stat.innerHTML = '<span style="color:#ff6b6b;">❌ เชื่อมต่อไม่สำเร็จ</span>';
  }
  function applyToken(access, refresh, fromCache) {
    localStorage.setItem(HCODE_USER_KEY, u);
    _hspSaveToken(access, refresh);
    _hspApiRateLimited = false;  // login ใหม่สำเร็จ → reset flag เสมอ
    document.getElementById('hsp-api-pass').value = '';
    _hspApiUpdateStatus();
    _hspRenderSavedAccounts();
    _hspApiUpdateQuota();
    window.showAlert('เชื่อมต่อ MOPH API สำเร็จ' + (fromCache ? ' (ใช้ token ที่บันทึกไว้)' : ''), 'success');
  }

  if (errBox) errBox.style.display = 'none';
  if (!u || !p) { showErr('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'กำลังเชื่อมต่อ...'; }
  if (stat) stat.innerHTML = '<span style="color:var(--txt-muted);">⏳ กำลังตรวจสอบ...</span>';

  try {
    // ── ตรวจ token cache ของ user นี้ก่อน (ไม่ต้องเรียก /token/ ซ้ำ) ────────
    var b       = _hspUserTokBase(u);
    var cachedA = localStorage.getItem(b + '_a');
    var cachedE = Number(localStorage.getItem(b + '_e') || 0);
    var cachedR = localStorage.getItem(b + '_r');

    if (cachedA && cachedE > Date.now()) {
      applyToken(cachedA, cachedR, true);
      return;
    }

    // มี refresh token → ลอง refresh โดยไม่ต้องใช้ password (ประหยัด quota /token/)
    if (cachedR) {
      try {
        var rr = await fetch(HCODE_BASE + '/token/refresh/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: cachedR })
        });
        if (rr.ok) {
          var dd = await rr.json();
          applyToken(dd.access, cachedR, true);
          return;
        }
        if (rr.status === 401) {
          localStorage.removeItem(b + '_r');
          localStorage.removeItem(b + '_a');
          localStorage.removeItem(b + '_e');
        }
      } catch(_) {}
    }

    // ── ไม่มี cache — เรียก /token/ ด้วย password ────────────────────────────
    var r = await fetch(HCODE_BASE + '/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });

    var bodyText = '';
    try { bodyText = await r.text(); } catch(_) {}

    if (!r.ok) {
      var detail = '';
      try { var j = JSON.parse(bodyText); detail = j.detail || j.message || JSON.stringify(j); } catch(_) { detail = bodyText; }
      if (r.status === 401 || r.status === 400) {
        showErr('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' + (detail ? '  (' + detail + ')' : ''));
      } else if (r.status === 429) {
        // หา reset time จาก quota ของ user ปัจจุบัน
        var curUser = localStorage.getItem(HCODE_USER_KEY) || '';
        var qReset  = Number(localStorage.getItem('hcode_quota_' + curUser + '_reset') || 0);
        var resetStr = qReset > Date.now()
          ? ' · รีเซ็ตเวลา ' + new Date(qReset).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
          : '';
        showErr('เซิร์ฟเวอร์จำกัด request (429) จาก IP นี้ เปลี่ยนบัญชีไม่ช่วย เพราะใช้ IP เดียวกัน' + resetStr);
      } else {
        showErr('เซิร์ฟเวอร์ตอบกลับ HTTP ' + r.status + (detail ? ': ' + detail : ''));
      }
      return;
    }

    var d = JSON.parse(bodyText);
    if (!d.access) { showErr('API ตอบกลับแต่ไม่มี access token — โปรดตรวจสอบ endpoint'); return; }

    applyToken(d.access, d.refresh, false);

  } catch(e) {
    if (e.name === 'TypeError' && e.message.toLowerCase().includes('fetch')) {
      showErr('เชื่อมต่อไม่ได้ (Network error / CORS) — ตรวจสอบว่า browser อนุญาต cross-origin request ไปยัง hcode.moph.go.th');
    } else {
      showErr(e.message);
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔗 เชื่อมต่อ'; }
  }
};

// ทดสอบ token ที่มีอยู่
window.hspApiTest = async function() {
  var stat   = document.getElementById('hsp-api-stat');
  var errBox = document.getElementById('hsp-api-err');
  if (errBox) errBox.style.display = 'none';
  if (stat) stat.innerHTML = '<span style="color:var(--txt-muted);">⏳ กำลังทดสอบ...</span>';
  try {
    var token = await _hspGetToken();
    if (!token) {
      if (stat) stat.innerHTML = '<span style="color:#ff6b6b;">❌ ไม่มี token — กรุณาล็อกอินใหม่</span>';
      return;
    }
    _hspApiTrackCall();
    var r = await fetch(HCODE_BASE + '/health_office/?code5=10669&page_size=1', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (r.status === 429) {
      _hspApiRateLimited = true;
      var errBox2 = document.getElementById('hsp-api-err');
      if (errBox2) { errBox2.textContent = 'ถูกจำกัดการใช้งาน (HTTP 429) — limit 100 req/hr กรุณารอสักครู่แล้วลองใหม่'; errBox2.style.display = ''; }
      if (stat) stat.innerHTML = '<span style="color:#ffa62b;">⚠️ Rate limited — ใช้ quota ครบแล้ว</span>';
    } else if (r.ok) {
      _hspApiRateLimited = false;
      if (stat) stat.innerHTML = '<span style="color:#06d6a0;">✅ เชื่อมต่อสำเร็จ (HTTP ' + r.status + ')</span>';
    } else {
      var bodyText = ''; try { bodyText = await r.text(); } catch(_) {}
      if (stat) stat.innerHTML = '<span style="color:#ff6b6b;">❌ HTTP ' + r.status + (bodyText ? ': ' + esc(bodyText.slice(0,80)) : '') + '</span>';
    }
  } catch(e) {
    if (stat) stat.innerHTML = '<span style="color:#ff6b6b;">❌ ' + esc(e.message) + '</span>';
  }
  _hspApiUpdateQuota();
};

window.hspApiLogout = function() {
  localStorage.removeItem(HCODE_TOKEN_KEY);
  localStorage.removeItem(HCODE_EXPIRY_KEY);
  localStorage.removeItem(HCODE_REFRESH_KEY);
  _hspApiUpdateStatus();
  window.showAlert('ตัดการเชื่อมต่อแล้ว', 'success');
};

function _hspApiUpdateStatus() {
  var stat = document.getElementById('hsp-api-stat');
  if (!stat) return;
  var expiry     = Number(localStorage.getItem(HCODE_EXPIRY_KEY) || 0);
  var hasAccess  = !!localStorage.getItem(HCODE_TOKEN_KEY) && expiry > Date.now();
  var hasRefresh = !!localStorage.getItem(HCODE_REFRESH_KEY);
  var logoutBtn  = document.getElementById('hsp-api-logout-btn');
  var testBtn    = document.getElementById('hsp-api-test-btn');

  if (hasAccess || hasRefresh) {
    var expiryStr = expiry > Date.now()
      ? 'token หมดอายุ ' + new Date(expiry).toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' })
      : 'access หมดอายุแล้ว (มี refresh token)';
    stat.innerHTML =
      '<span style="color:#06d6a0;font-weight:700;">✅ เชื่อมต่อแล้ว</span>' +
      '<span style="color:var(--txt-muted);font-size:11px;font-weight:400;margin-left:8px;">' + expiryStr + '</span>';
    if (logoutBtn) logoutBtn.style.display = '';
    if (testBtn)   testBtn.style.display   = '';
  } else {
    stat.innerHTML = '<span style="color:var(--txt-muted);">⚠️ ยังไม่ได้เชื่อมต่อ</span>';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (testBtn)   testBtn.style.display   = 'none';
  }
}

// แสดงบัญชีที่บันทึกไว้ใน localStorage ให้กด switch ได้โดยไม่ต้องเรียก /token/
function _hspRenderSavedAccounts() {
  var wrap = document.getElementById('hsp-api-saved-accounts');
  if (!wrap) return;

  var curUser = localStorage.getItem(HCODE_USER_KEY) || '';
  var users = [];
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.endsWith('_a') && k.startsWith('hcode_tok_')) {
      var name = k.slice('hcode_tok_'.length, -2);
      if (!users.includes(name)) users.push(name);
    }
  }

  if (!users.length) { wrap.innerHTML = ''; return; }

  var now = Date.now();
  var html = '<div style="margin-bottom:10px;">' +
    '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--txt-muted);margin-bottom:6px;">บัญชีที่บันทึกไว้</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;">';

  users.forEach(function(u) {
    var b     = _hspUserTokBase(u);
    var expiry = Number(localStorage.getItem(b + '_e') || 0);
    var hasR  = !!localStorage.getItem(b + '_r');
    var isCur = u === curUser;
    var valid = expiry > now || hasR;
    var qBase  = 'hcode_quota_' + u;
    var qCount = Number(localStorage.getItem(qBase + '_count') || 0);
    var qReset = Number(localStorage.getItem(qBase + '_reset') || 0);
    var remaining = qReset > now ? Math.max(0, _HSP_API_LIMIT - qCount) : _HSP_API_LIMIT;
    var quotaColor = remaining < 20 ? '#ff6b6b' : remaining < 50 ? '#ffa62b' : '#06d6a0';

    html +=
      '<div onclick="' + (isCur ? '' : 'window._hspSwitchCachedUser(\'' + esc(u) + '\')') + '" ' +
      'style="display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:10px;cursor:' + (isCur ? 'default' : 'pointer') + ';' +
      'border:1.5px solid ' + (isCur ? 'var(--primary)' : 'var(--border)') + ';' +
      'background:' + (isCur ? 'rgba(67,97,238,.08)' : 'var(--surface)') + ';' +
      (isCur ? '' : 'transition:border-color .15s;') + '" ' +
      (isCur ? '' : 'onmouseover="this.style.borderColor=\'var(--primary)\'" onmouseout="this.style.borderColor=\'var(--border)\'"') + '>' +
        '<span style="font-size:13px;font-weight:700;color:' + (isCur ? 'var(--primary)' : 'var(--txt)') + ';">' + esc(u) + '</span>' +
        (isCur ? '<span style="font-size:10px;background:var(--primary);color:#fff;padding:1px 6px;border-radius:8px;">ใช้งานอยู่</span>' : '') +
        '<span style="font-size:11px;color:' + quotaColor + ';margin-left:auto;">' + remaining + '/' + _HSP_API_LIMIT + '</span>' +
        (!valid ? '<span style="font-size:10px;color:#ff6b6b;" title="token หมดอายุ กรุณา login ใหม่">⚠️</span>' : '') +
      '</div>';
  });

  html += '</div></div>';
  wrap.innerHTML = html;
}

window._hspSwitchCachedUser = function(u) {
  var b      = _hspUserTokBase(u);
  var access  = localStorage.getItem(b + '_a');
  var expiry  = Number(localStorage.getItem(b + '_e') || 0);
  var refresh = localStorage.getItem(b + '_r');
  var now     = Date.now();

  if (access && expiry > now) {
    // access token ยังใช้ได้
    localStorage.setItem(HCODE_USER_KEY, u);
    _hspSaveToken(access, refresh);
    _hspApiRateLimited = false;  // switch account → reset flag เสมอ
    _hspApiUpdateStatus();
    _hspRenderSavedAccounts();
    _hspApiUpdateQuota();
    window.showAlert('เปลี่ยนบัญชีเป็น ' + u + ' สำเร็จ', 'success');
    return;
  }

  if (refresh) {
    // ลอง refresh
    (async function() {
      try {
        var r = await fetch(HCODE_BASE + '/token/refresh/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: refresh })
        });
        if (r.ok) {
          var d = await r.json();
          localStorage.setItem(HCODE_USER_KEY, u);
          _hspSaveToken(d.access, refresh);
          _hspApiRateLimited = false;
          _hspApiUpdateStatus();
          _hspRenderSavedAccounts();
          _hspApiUpdateQuota();
          window.showAlert('เปลี่ยนบัญชีเป็น ' + u + ' สำเร็จ', 'success');
          return;
        }
        if (r.status === 401) {
          localStorage.removeItem(b + '_r');
          localStorage.removeItem(b + '_a');
          localStorage.removeItem(b + '_e');
        }
      } catch(_) {}
      // refresh ใช้ไม่ได้ → แจ้งให้ login ใหม่
      document.getElementById('hsp-api-user').value = u;
      document.getElementById('hsp-api-pass').value = '';
      document.getElementById('hsp-api-pass').focus();
      var errBox = document.getElementById('hsp-api-err');
      if (errBox) { errBox.textContent = 'token ของ ' + u + ' หมดอายุ — กรุณากรอก Password ใหม่'; errBox.style.display = ''; }
      _hspRenderSavedAccounts();
    })();
    return;
  }

  // ไม่มี token เลย
  document.getElementById('hsp-api-user').value = u;
  document.getElementById('hsp-api-pass').value = '';
  document.getElementById('hsp-api-pass').focus();
};

window.openHspApiSettings = function() {
  document.getElementById('hsp-api-user').value = '';
  document.getElementById('hsp-api-pass').value = '';
  var errBox = document.getElementById('hsp-api-err');
  if (errBox) errBox.style.display = 'none';
  _hspApiUpdateStatus();
  _hspRenderSavedAccounts();
  _hspApiUpdateQuota();
  window.openM('m-hsp-api');
};

// ── API Rate-limit tracker & cache ───────────────────────────────────────────
var _hspApiCache       = {};        // code5 → mapped result (session memory)
var _hspApiRateLimited = false;     // flag: ถูก 429 อยู่
var _HSP_API_LIMIT     = 100;       // limit จาก server (req/hr per account)

// อ่านและ normalize quota จาก localStorage ตาม MOPH username
function _hspApiQuota() {
  var user  = localStorage.getItem(HCODE_USER_KEY) || '_';
  var base  = 'hcode_quota_' + user;
  var now   = Date.now();
  var reset = Number(localStorage.getItem(base + '_reset') || 0);
  var count = Number(localStorage.getItem(base + '_count') || 0);
  if (now > reset) {
    count = 0; reset = now + 3600000;
    localStorage.setItem(base + '_count', '0');
    localStorage.setItem(base + '_reset', String(reset));
    _hspApiRateLimited = false;
  }
  return { user: user === '_' ? '' : user, count: count, reset: reset, remaining: Math.max(0, _HSP_API_LIMIT - count) };
}

function _hspApiTrackCall() {
  var user  = localStorage.getItem(HCODE_USER_KEY) || '_';
  var base  = 'hcode_quota_' + user;
  var q     = _hspApiQuota();
  localStorage.setItem(base + '_count', String(q.count + 1));
  _hspApiUpdateQuota();
}

function _hspApiUpdateQuota() {
  var el = document.getElementById('hsp-api-quota');
  if (!el) return;
  var q  = _hspApiQuota();
  var userStr = q.user ? ' (' + q.user + ')' : '';
  el.textContent = 'quota' + userStr + ': ' + q.remaining + '/' + _HSP_API_LIMIT + ' req/hr';
  el.style.color = q.remaining < 20 ? '#ff6b6b' : q.remaining < 50 ? '#ffa62b' : 'var(--txt-muted)';
}

// Lookup รพ. จาก MOPH API ด้วย code5
// คืน null ถ้าไม่พบ, คืน { _rateLimited:true } ถ้าโดน 429
async function _hspApiLookup(code5) {
  // ดึงจาก cache ก่อน
  if (_hspApiCache[code5] !== undefined) return _hspApiCache[code5];

  // ถูก rate-limit อยู่ — ให้ _hspApiQuota() ตรวจก่อนว่าหน้าต่างเวลาหมดหรือยัง
  if (_hspApiRateLimited) {
    _hspApiQuota(); // side-effect: reset flag ถ้าครบชั่วโมงแล้ว
    if (_hspApiRateLimited) return { _rateLimited: true };
  }

  var token = await _hspGetToken();
  if (!token) return null;

  _hspApiTrackCall();
  try {
    var r = await fetch(HCODE_BASE + '/health_office/?code5=' + encodeURIComponent(code5) + '&page_size=1&active=1', {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (r.status === 429) {
      _hspApiRateLimited = true;
      _hspApiUpdateQuota();
      return { _rateLimited: true };
    }
    if (!r.ok) { _hspApiCache[code5] = null; return null; }

    var data = await r.json();
    if (!data.results || !data.results.length) { _hspApiCache[code5] = null; return null; }
    var result = _hspMapApiResult(data.results[0]);
    _hspApiCache[code5] = result;
    return result;
  } catch(_) { return null; }
}

// แปลง field ที่อาจเป็น string / object / URL → ได้ string ชื่อ
function _hspAddrName(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v.name || v.name_th || v.label || String(v.id || '');
  return String(v);
}

// แปลง hospital_level + health_office_type + เตียง → type code (A/S/M1/M2/F1/F2/F3/P/other)
function _hspGuessType(item) {
  var beds = Number(item.bed) || 0;

  // ── ดึง hospital_level (อาจเป็น string / object / URL) ─────────────────
  var raw = item.hospital_level || '';
  var lvlStr = '';
  if (typeof raw === 'string')      lvlStr = raw;
  else if (typeof raw === 'object') lvlStr = raw.name || raw.code || String(raw.id || '');
  lvlStr = lvlStr.trim();

  // ── ตรงตัวจาก hospital_level (รองรับ "A", "ระดับ A", "level A" ฯลฯ) ──
  var lvlUp = lvlStr.toUpperCase().replace(/\s+/g, '').replace('ระดับ','').replace('LEVEL','');
  var directMap = { A:'A', S:'S', M1:'M1', M2:'M2', F1:'F1', F2:'F2', F3:'F3', P:'P', M:'M1' };
  if (directMap[lvlUp]) return directMap[lvlUp];

  // ── ดึง health_office_type (ชื่อภาษาไทยเต็ม) ───────────────────────────
  var raw2 = item.health_office_type || '';
  var hotStr = '';
  if (typeof raw2 === 'string')      hotStr = raw2;
  else if (typeof raw2 === 'object') hotStr = raw2.name || raw2.name_th || raw2.label || '';
  var hot = hotStr.toLowerCase();

  // เอกชน
  if (hot.includes('เอกชน') || hot.includes('private') || hot.includes('คลินิก')) return 'P';

  // โรงพยาบาลชุมชน (รพช.) → F1/F2/F3 โดยเตียง
  if (hot.includes('ชุมชน') || hot.includes('รพช') || hot.includes('district hospital')) {
    if (beds >= 60) return 'F1';
    if (beds >= 30) return 'F2';
    return 'F3';
  }
  // โรงพยาบาลทั่วไป (รพท.) → M1/M2
  if (hot.includes('ทั่วไป') || hot.includes('รพท') || hot.includes('general hospital')) {
    return beds >= 150 ? 'M1' : 'M2';
  }
  // โรงพยาบาลศูนย์ (รพศ.) / ศูนย์การแพทย์ → A/S
  if (hot.includes('ศูนย์') || hot.includes('รพศ') || hot.includes('regional') || hot.includes('มหาวิทยาลัย')) {
    return beds >= 500 ? 'A' : 'S';
  }

  // ── ประมาณจากเตียงเป็น fallback สุดท้าย ────────────────────────────────
  if (beds >= 500) return 'A';
  if (beds >= 300) return 'S';
  if (beds >= 150) return 'M1';
  if (beds >= 90)  return 'M2';
  if (beds >= 60)  return 'F1';
  if (beds >= 30)  return 'F2';
  if (beds > 0)    return 'F3';

  return 'other';
}

// แปลงข้อมูลจาก MOPH API → format ของแอปเรา
function _hspMapApiResult(item) {
  // address อาจเป็น array, object, หรือ null
  var addrList = Array.isArray(item.address) ? item.address : (item.address ? [item.address] : []);
  var addr = addrList[0] || {};

  var conts = Array.isArray(item.contact) ? item.contact : [];

  // หาเบอร์โทร
  var telObj = conts.find(function(c) {
    var ct = (c.contact_type || '').toLowerCase();
    return ct.includes('โทร') || ct.includes('tel') || ct.includes('phone') || ct.includes('มือถือ');
  });
  if (!telObj) telObj = conts.find(function(c) { return /\d{2,}/.test(c.name || ''); });
  var tel = telObj ? (telObj.name || '') : '';

  var province = _hspAddrName(addr.province);
  var district = _hspAddrName(addr.district);
  var tambon   = _hspAddrName(addr.subdistrict);

  // สร้างที่อยู่จาก field ย่อย
  var streetParts = [];
  if (addr.number)  streetParts.push(addr.number);
  if (addr.moo)     streetParts.push('หมู่ ' + addr.moo);
  if (addr.village) streetParts.push(addr.village);
  if (addr.alley)   streetParts.push('ซ.' + addr.alley);
  if (addr.street)  streetParts.push('ถ.' + addr.street);
  // รวมที่อยู่ถนน + ตำบล + อำเภอ + จังหวัด ให้เห็นครบ
  var locationParts = [];
  if (tambon)   locationParts.push('ต.' + tambon);
  if (district) locationParts.push('อ.' + district);
  if (province) locationParts.push('จ.' + province);
  if (addr.zipcode) locationParts.push(addr.zipcode);
  var addrStr = [...streetParts, ...locationParts].filter(Boolean).join(' ');

  return {
    id:          '',
    code:        item.code5        || '',
    name:        item.name         || '',
    type:        _hspGuessType(item),
    beds:        Number(item.bed)  || 0,
    province,
    district,
    tambon,
    address:     addrStr,
    tel:         tel,
    website:     '',
    affiliation: item.organization || item.department || '',
    note:        '',
    _fromApi:    true,
  };
}

// ── CONSTANTS ──────────────────────────────────────────────────────────────
const HSP_TYPES = [
  { id:'A',  label:'A – ระดับสูงสุด (500+ เตียง)',        color:'#7c5cfc' },
  { id:'S',  label:'S – ศูนย์/ทั่วไปใหญ่ (300–499)',      color:'#4361ee' },
  { id:'M1', label:'M1 – ทั่วไปกลาง (150–299)',           color:'#4cc9f0' },
  { id:'M2', label:'M2 – ทั่วไปเล็ก (90–149)',            color:'#06d6a0' },
  { id:'F1', label:'F1 – ชุมชนใหญ่ (60–89)',              color:'#ffa62b' },
  { id:'F2', label:'F2 – ชุมชนกลาง (30–59)',              color:'#ff8c42' },
  { id:'F3', label:'F3 – ชุมชนเล็ก (<30)',                color:'#ff6b6b' },
  { id:'P',  label:'P – เอกชน',                           color:'#f72585' },
  { id:'other', label:'อื่นๆ',                            color:'#9ba3b8' },
];
const HSP_TYPE_MAP = Object.fromEntries(HSP_TYPES.map(t => [t.id, t]));

const TH_PROVINCES = [
  'กรุงเทพมหานคร','กระบี่','กาญจนบุรี','กาฬสินธุ์','กำแพงเพชร','ขอนแก่น',
  'จันทบุรี','ฉะเชิงเทรา','ชลบุรี','ชัยนาท','ชัยภูมิ','ชุมพร','เชียงราย',
  'เชียงใหม่','ตรัง','ตราด','ตาก','นครนายก','นครปฐม','นครพนม','นครราชสีมา',
  'นครศรีธรรมราช','นครสวรรค์','นนทบุรี','นราธิวาส','น่าน','บึงกาฬ','บุรีรัมย์',
  'ปทุมธานี','ประจวบคีรีขันธ์','ปราจีนบุรี','ปัตตานี','พระนครศรีอยุธยา','พะเยา',
  'พังงา','พัทลุง','พิจิตร','พิษณุโลก','เพชรบุรี','เพชรบูรณ์','แพร่','ภูเก็ต',
  'มหาสารคาม','มุกดาหาร','แม่ฮ่องสอน','ยโสธร','ยะลา','ร้อยเอ็ด','ระนอง',
  'ระยอง','ราชบุรี','ลพบุรี','ลำปาง','ลำพูน','เลย','ศรีสะเกษ','สกลนคร',
  'สงขลา','สตูล','สมุทรปราการ','สมุทรสงคราม','สมุทรสาคร','สระแก้ว','สระบุรี',
  'สิงห์บุรี','สุโขทัย','สุพรรณบุรี','สุราษฎร์ธานี','สุรินทร์','หนองคาย',
  'หนองบัวลำภู','อ่างทอง','อำนาจเจริญ','อุดรธานี','อุตรดิตถ์','อุทัยธานี','อุบลราชธานี',
];

// ── STATE ──────────────────────────────────────────────────────────────────
window._hspPage = 1;
var _hspPerPage = 50;

// ── HELPERS ────────────────────────────────────────────────────────────────
function _hspType(id) { return HSP_TYPE_MAP[id] || HSP_TYPE_MAP['other']; }

// ── MULTI-PRODUCT FILTER ──────────────────────────────────────────────────
window._hspSelectedProds = window._hspSelectedProds || [];

window._hspBuildProdMulti = function() {
  var wrap = document.getElementById('hsp-prod-multi-wrap');
  if (!wrap) return;
  var prods = window.HSP_PRODUCTS || [];
  if (!prods.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  var GRP_ABR = { his_front:'F', his_back:'B', interconnect:'I', application:'A', smart:'S' };
  var sel = window._hspSelectedProds;
  var isActive = sel.length > 0;
  var iS = 'display:flex;align-items:center;gap:8px;padding:5px 10px;border-radius:7px;cursor:pointer;font-size:12px;color:var(--txt);user-select:none;transition:background .1s;';

  var panelHtml =
    '<label style="' + iS + '" onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\'">' +
    '<input type="checkbox" id="hsp-pmc-all" ' + (!isActive ? 'checked' : '') + ' onchange="window._hspProdAllChange()" style="accent-color:var(--primary);width:14px;height:14px;">' +
    '<span style="font-weight:600;">ทั้งหมด</span></label>' +
    '<div style="border-top:1px solid var(--border);margin:4px 2px;"></div>';

  HSP_PROD_GROUPS.forEach(function(grp) {
    var grpProds = prods.filter(function(p){ return p.group === grp.id; });
    if (!grpProds.length) return;
    panelHtml += '<div style="font-size:10px;font-weight:700;color:' + grp.color + ';text-transform:uppercase;letter-spacing:.4px;padding:4px 10px 2px;">' + esc(grp.label) + '</div>';
    grpProds.forEach(function(p) {
      panelHtml += '<label style="' + iS + '" onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\'">' +
        '<input type="checkbox" value="' + esc(p.id) + '" ' + (sel.includes(p.id) ? 'checked' : '') + ' onchange="window._hspProdCheckChange()" style="accent-color:' + p.color + ';width:14px;height:14px;">' +
        '<span style="background:' + p.color + '22;color:' + p.color + ';padding:1px 6px;border-radius:5px;font-size:10px;font-weight:800;flex-shrink:0;">' + (GRP_ABR[grp.id] || '') + '</span>' +
        '<span>' + esc(p.name) + '</span></label>';
    });
  });

  var ungrouped = prods.filter(function(p){ return !HSP_PROD_GROUPS.some(function(g){ return g.id === p.group; }); });
  if (ungrouped.length) {
    panelHtml += '<div style="border-top:1px solid var(--border);margin:4px 2px;"></div>';
    panelHtml += '<div style="font-size:10px;font-weight:700;color:var(--txt-muted);text-transform:uppercase;letter-spacing:.4px;padding:4px 10px 2px;">อื่นๆ</div>';
    ungrouped.forEach(function(p) {
      panelHtml += '<label style="' + iS + '" onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\'">' +
        '<input type="checkbox" value="' + esc(p.id) + '" ' + (sel.includes(p.id) ? 'checked' : '') + ' onchange="window._hspProdCheckChange()" style="accent-color:var(--primary);width:14px;height:14px;">' +
        '<span>' + esc(p.name) + '</span></label>';
    });
  }

  var btnBorder = isActive ? 'var(--violet)' : 'var(--border)';
  var btnColor  = isActive ? 'var(--violet)' : 'var(--txt2)';
  var btnLabel  = isActive ? '📦 Product (' + sel.length + ')' : '📦 Product';

  wrap.innerHTML =
    '<button id="hsp-pmc-btn" onclick="window._hspToggleProdPanel(event)" ' +
    'style="background:var(--surface2);border:1.5px solid ' + btnBorder + ';color:' + btnColor + ';' +
    'border-radius:10px;padding:7px 12px;font-size:12px;font-family:inherit;cursor:pointer;' +
    'display:flex;align-items:center;gap:6px;white-space:nowrap;transition:all .2s;min-height:36px;">' +
    btnLabel + '<span style="font-size:10px;color:var(--txt-muted);">▾</span></button>' +
    '<div id="hsp-prod-panel" style="display:none;position:absolute;top:calc(100% + 4px);right:0;min-width:240px;max-height:310px;overflow-y:auto;' +
    'background:var(--surface);border:1px solid var(--border);border-radius:12px;' +
    'box-shadow:0 4px 24px rgba(0,0,0,.14);z-index:999;padding:6px;">' +
    panelHtml + '</div>';
};

window._hspToggleProdPanel = function(e) {
  if (e) e.stopPropagation();
  var panel = document.getElementById('hsp-prod-panel');
  if (!panel) return;
  var isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    setTimeout(function() {
      document.addEventListener('click', window._hspProdOutside, { once: true });
    }, 0);
  }
};

window._hspProdOutside = function(e) {
  var wrap = document.getElementById('hsp-prod-multi-wrap');
  if (!wrap) return;
  if (wrap.contains(e.target)) {
    document.addEventListener('click', window._hspProdOutside, { once: true });
  } else {
    var panel = document.getElementById('hsp-prod-panel');
    if (panel) panel.style.display = 'none';
  }
};

window._hspProdAllChange = function() {
  var wrap = document.getElementById('hsp-prod-multi-wrap');
  var allCb = document.getElementById('hsp-pmc-all');
  if (!wrap || !allCb) return;
  if (allCb.checked) {
    wrap.querySelectorAll('input[type=checkbox][value]').forEach(function(c){ c.checked = false; });
    window._hspSelectedProds = [];
  } else {
    allCb.checked = true;
  }
  _hspUpdateProdBtn();
  _hspTriggerRender();
};

window._hspProdCheckChange = function() {
  var wrap = document.getElementById('hsp-prod-multi-wrap');
  if (!wrap) return;
  var checked = Array.from(wrap.querySelectorAll('input[type=checkbox][value]:checked')).map(function(c){ return c.value; });
  window._hspSelectedProds = checked;
  var allCb = document.getElementById('hsp-pmc-all');
  if (allCb) allCb.checked = checked.length === 0;
  _hspUpdateProdBtn();
  _hspTriggerRender();
};

function _hspTriggerRender() {
  var mode = window._hspViewMode;
  if (mode === 'analysis') {
    window._hspAnalysisPage = 1;
    window._hspAnalysisLastFilter = '';
    window.renderHspAnalysis && window.renderHspAnalysis();
  } else {
    window._hspPage = 1;
    window.renderHospital && window.renderHospital();
  }
}

function _hspUpdateProdBtn() {
  var btn = document.getElementById('hsp-pmc-btn');
  if (!btn) return;
  var sel = window._hspSelectedProds;
  var isActive = sel.length > 0;
  btn.innerHTML = (isActive ? '📦 Product (' + sel.length + ')' : '📦 Product') +
    '<span style="font-size:10px;color:var(--txt-muted);">▾</span>';
  btn.style.borderColor = isActive ? 'var(--violet)' : 'var(--border)';
  btn.style.color = isActive ? 'var(--violet)' : 'var(--txt2)';
}

function _hspFiltered() {
  var q    = (document.getElementById('hsp-q')?.value || '').trim().toLowerCase();
  var prov = document.getElementById('hsp-prov')?.value || '';
  var dist = document.getElementById('hsp-dist')?.value || '';
  var typ  = document.getElementById('hsp-type')?.value || '';
  var selectedProds = window._hspSelectedProds || [];
  var prodUsage = document.getElementById('hsp-prod-usage-filter')?.value || '';

  return (window.HOSPITALS || []).filter(h => {
    if (prov && h.province !== prov) return false;
    if (dist && h.district !== dist) return false;
    if (typ  && h.type    !== typ)   return false;
    if (selectedProds.length) {
      var hProds = h.products || [];
      if (!selectedProds.every(function(id){ return hProds.includes(id); })) return false;
    }
    if (prodUsage === 'has'  && !(h.products||[]).length) return false;
    if (prodUsage === 'none' &&  (h.products||[]).length) return false;
    if (q) {
      var hay = (h.code + ' ' + h.name + ' ' + (h.district||'') + ' ' + (h.tambon||'') + ' ' + (h.affiliation||'')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (a.code || '').localeCompare(b.code || '', 'th'));
}

// ── RENDER ─────────────────────────────────────────────────────────────────
window.renderHospital = function() {
  var body = document.getElementById('hsp-body');
  if (!body) return;

  var all  = _hspFiltered();
  var total = all.length;
  var start = (window._hspPage - 1) * _hspPerPage;
  var rows  = all.slice(start, start + _hspPerPage);

  // update count
  var cnt = document.getElementById('hsp-count');
  if (cnt) cnt.textContent = total.toLocaleString() + ' แห่ง';

  // pagination
  var totalPages = Math.max(1, Math.ceil(total / _hspPerPage));
  if (window._hspPage > totalPages) window._hspPage = 1;

  var canEdit = window.isAdmin ? window.isAdmin() : false;
  if (!canEdit && window.canEdit) canEdit = window.canEdit('hospital');

  if (!rows.length) {
    body.innerHTML = '<div style="text-align:center;color:var(--txt-muted);padding:48px 24px;">ไม่พบข้อมูลโรงพยาบาล</div>';
    _renderHspPager(totalPages);
    return;
  }

  var allProds = window.HSP_PRODUCTS || [];
  var GRP_ABBR_L = { his_front:'F', his_back:'B', interconnect:'I', application:'A', smart:'S' };

  body.innerHTML = rows.map(function(h) {
    var t      = _hspType(h.type);
    var cs     = h.contacts || [];
    var hProds = h.products || [];
    var prods  = allProds;

    // ── Header ──
    var typeBadge = '<span style="background:' + t.color + '22;color:' + t.color + ';padding:2px 9px;border-radius:7px;font-size:11px;font-weight:700;white-space:nowrap;">' + esc(h.type||'?') + '</span>';
    var locStr    = [h.province, h.district].filter(Boolean).map(esc).join(' · ');
    var editBtns  = canEdit
      ? '<div style="display:flex;gap:4px;margin-left:auto;flex-shrink:0;" onclick="event.stopPropagation()">' +
        '<button class="btn btn-ghost btn-sm" onclick="window.openHospitalModal(\'' + esc(h.id) + '\')" title="แก้ไข">✏️</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="window.deleteHospital(\'' + esc(h.id) + '\')" title="ลบ" style="color:var(--coral)">🗑</button>' +
        '</div>'
      : '';
    var header = '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--bg);flex-wrap:wrap;">' +
      typeBadge +
      '<span style="font-family:monospace;color:var(--primary);font-size:12px;font-weight:700;">' + esc(h.code||'—') + '</span>' +
      '<span style="font-weight:700;color:var(--txt);font-size:13px;flex:1;min-width:140px;">' + esc(h.name) + '</span>' +
      (locStr ? '<span style="font-size:11px;color:var(--txt-muted);white-space:nowrap;">' + locStr + '</span>' : '') +
      editBtns +
      '</div>';

    // ── Section 1: ข้อมูลทั่วไป ──
    function infoRow(icon, label, val) {
      if (!val) return '';
      return '<div style="display:flex;gap:5px;margin-bottom:5px;align-items:flex-start;">' +
        '<span style="font-size:12px;flex-shrink:0;">' + icon + '</span>' +
        '<span style="color:var(--txt-muted);font-size:11px;white-space:nowrap;flex-shrink:0;">' + label + '</span>' +
        '<span style="color:var(--txt);font-size:11px;font-weight:500;">' + val + '</span></div>';
    }
    var fullAddr = h.address || [h.tambon ? 'ต.' + h.tambon : '', h.district ? 'อ.' + h.district : '', h.province || ''].filter(Boolean).join(' ');
    var sec1Body =
      infoRow('🏢', 'สังกัด', esc(h.affiliation||'')) +
      infoRow('🛏', 'เตียง', h.beds ? Number(h.beds).toLocaleString() + ' เตียง' : '') +
      infoRow('📍', 'ที่อยู่', esc(fullAddr)) +
      infoRow('📞', 'โทรศัพท์', esc(h.tel||'')) +
      (h.website ? '<div style="display:flex;gap:5px;margin-bottom:5px;align-items:flex-start;"><span style="font-size:12px;">🌐</span><span style="color:var(--txt-muted);font-size:11px;white-space:nowrap;">เว็บไซต์</span><a href="' + esc(h.website) + '" target="_blank" onclick="event.stopPropagation()" style="color:var(--primary);font-size:11px;word-break:break-all;">' + esc(h.website) + '</a></div>' : '') +
      (h.note ? '<div style="margin-top:6px;padding:6px 8px;background:var(--warn)11;border-radius:6px;font-size:11px;color:var(--txt-muted);border-left:2px solid var(--warn);">💬 ' + esc(h.note) + '</div>' : '');
    var sec1 = '<div style="padding:12px 14px;border-right:1px solid var(--border);">' +
      '<div style="font-size:10px;font-weight:700;color:var(--txt-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:9px;">🏥 ข้อมูลทั่วไป</div>' +
      (sec1Body || '<span style="color:var(--txt-muted);font-size:11px;">—</span>') +
      '</div>';

    // ── Section 2: ผู้ติดต่อ ──
    var sec2Body;
    if (cs.length) {
      sec2Body = cs.map(function(c) {
        return '<div style="margin-bottom:8px;padding:8px 10px;background:var(--bg);border-radius:8px;border:1px solid var(--border);">' +
          '<div style="font-size:12px;font-weight:700;color:var(--txt);">' + esc(c.name||'—') + '</div>' +
          (c.position ? '<div style="font-size:10px;color:var(--violet);font-weight:600;margin-top:1px;">' + esc(c.position) + '</div>' : '') +
          '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:5px;">' +
          (c.phone ? '<span style="font-size:11px;color:var(--txt-muted);">📞 ' + esc(c.phone) + '</span>' : '') +
          (c.email ? '<span style="font-size:11px;color:var(--txt-muted);word-break:break-all;">✉️ ' + esc(c.email) + '</span>' : '') +
          (c.note  ? '<span style="font-size:11px;color:var(--txt-muted);">💬 ' + esc(c.note) + '</span>' : '') +
          '</div></div>';
      }).join('');
    } else {
      sec2Body = '<span style="color:var(--txt-muted);font-size:11px;font-style:italic;">ยังไม่มีผู้ติดต่อ</span>';
    }
    var sec2 = '<div style="padding:12px 14px;border-right:1px solid var(--border);">' +
      '<div style="font-size:10px;font-weight:700;color:var(--txt-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:9px;">👤 ผู้ติดต่อ' +
      (cs.length ? ' <span style="background:var(--violet)22;color:var(--violet);padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700;">' + cs.length + '</span>' : '') +
      '</div>' + sec2Body + '</div>';

    // ── Section 3: Product ──
    var groupDots = HSP_PROD_GROUPS.map(function(grp) {
      var hasGrp = prods.some(function(p){ return p.group === grp.id && hProds.includes(p.id); });
      var abbr = GRP_ABBR_L[grp.id] || grp.id[0].toUpperCase();
      return '<span title="' + esc(grp.label) + '" style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:5px;font-size:10px;font-weight:900;margin-right:3px;' +
        (hasGrp ? 'background:' + grp.color + ';color:#fff;' : 'background:var(--bg);border:1.5px solid var(--border);color:var(--txt-muted);') +
        '">' + abbr + '</span>';
    }).join('');
    var myProdObjs = prods.filter(function(p){ return hProds.includes(p.id); });
    var prodChips = myProdObjs.length
      ? myProdObjs.map(function(p){
          return '<span style="background:' + p.color + '18;color:' + p.color + ';border:1px solid ' + p.color + '44;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;white-space:nowrap;display:inline-block;margin:2px 2px 0 0;">' + esc(p.name) + '</span>';
        }).join('')
      : '<span style="color:var(--txt-muted);font-size:11px;font-style:italic;">— ยังไม่มี Product</span>';
    var sec3 = '<div style="padding:12px 14px;">' +
      '<div style="font-size:10px;font-weight:700;color:var(--txt-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:9px;">📦 Product' +
      (hProds.length ? ' <span style="background:var(--teal)22;color:var(--teal);padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700;">' + hProds.length + '</span>' : '') +
      '</div>' +
      '<div style="margin-bottom:8px;">' + groupDots + '</div>' +
      '<div style="line-height:1.7;">' + prodChips + '</div>' +
      '</div>';

    return '<div style="border:1px solid var(--border);border-left:3px solid ' + t.color + ';border-radius:12px;overflow:hidden;margin-bottom:10px;background:var(--surface);cursor:pointer;transition:box-shadow .15s;" onclick="window.openHospitalDetail(\'' + esc(h.id) + '\')" onmouseover="this.style.boxShadow=\'0 2px 14px rgba(0,0,0,.09)\'" onmouseout="this.style.boxShadow=\'\'">' +
      header +
      '<div style="display:grid;grid-template-columns:minmax(160px,1.2fr) minmax(160px,1fr) minmax(160px,1.2fr);">' +
      sec1 + sec2 + sec3 +
      '</div></div>';
  }).join('');

  _renderHspPager(totalPages);
};

function _renderHspPager(totalPages) {
  var pg = document.getElementById('hsp-pager');
  if (!pg) return;
  if (totalPages <= 1) { pg.innerHTML = ''; return; }
  var btns = '';
  btns += `<button class="btn btn-ghost btn-sm" onclick="window._hspGo(${window._hspPage-1})" ${window._hspPage<=1?'disabled':''}>‹</button>`;
  for (var p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - window._hspPage) <= 2) {
      btns += `<button class="btn btn-sm ${p===window._hspPage?'btn-pri':'btn-ghost'}" onclick="window._hspGo(${p})">${p}</button>`;
    } else if (Math.abs(p - window._hspPage) === 3) {
      btns += '<span style="color:var(--txt-muted);padding:0 4px;">…</span>';
    }
  }
  btns += `<button class="btn btn-ghost btn-sm" onclick="window._hspGo(${window._hspPage+1})" ${window._hspPage>=totalPages?'disabled':''}>›</button>`;
  pg.innerHTML = `<div style="display:flex;gap:4px;align-items:center;justify-content:center;flex-wrap:wrap;">${btns}</div>`;
}

window._hspGo = function(p) {
  var total = _hspFiltered().length;
  var max = Math.max(1, Math.ceil(total / _hspPerPage));
  window._hspPage = Math.max(1, Math.min(p, max));
  window.renderHospital();
};

// ── DETAIL POPUP ────────────────────────────────────────────────────────────
window._hspDetailId = null;

window._hspDetailTab = function(name) {
  var panels = {
    info:     document.getElementById('m-hsp-detail-panel-info'),
    contacts: document.getElementById('m-hsp-detail-panel-contacts'),
    products: document.getElementById('m-hsp-detail-panel-products'),
  };
  var tabs = {
    info:     document.getElementById('m-hsp-dtab-info'),
    contacts: document.getElementById('m-hsp-dtab-contacts'),
    products: document.getElementById('m-hsp-dtab-products'),
  };
  Object.keys(panels).forEach(function(k) {
    if (!panels[k] || !tabs[k]) return;
    var active = k === name;
    panels[k].style.display = active ? '' : 'none';
    tabs[k].style.color             = active ? 'var(--violet)' : 'var(--txt-muted)';
    tabs[k].style.borderBottomColor = active ? 'var(--violet)' : 'transparent';
  });
};

window.openHospitalDetail = function(id) {
  var h = (window.HOSPITALS || []).find(x => x.id === id);
  if (!h) return;
  var t = _hspType(h.type);
  var canEdit = (window.isAdmin && window.isAdmin()) || (window.canEdit && window.canEdit('hospital'));
  var cs = h.contacts || [];

  window._hspDetailId = id;

  // ── Panel: ข้อมูลทั่วไป ──
  var fullAddr = h.address || [
    h.tambon   ? 'ต.' + h.tambon   : '',
    h.district ? 'อ.' + h.district : '',
    h.province || ''
  ].filter(Boolean).join(' ');

  document.getElementById('m-hsp-detail-panel-info').innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
      <div style="width:48px;height:48px;border-radius:12px;background:${t.color}22;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">🏥</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:17px;font-weight:700;color:var(--txt);line-height:1.3;">${esc(h.name)}</div>
        <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">
          <span style="background:${t.color}22;color:${t.color};padding:2px 10px;border-radius:8px;font-size:12px;font-weight:700;">${esc(h.type||'?')}</span>
          <span style="background:var(--bg);color:var(--txt-muted);padding:2px 10px;border-radius:8px;font-size:12px;font-family:monospace;">รหัส: ${esc(h.code)}</span>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${_detailRow('🏢', 'สังกัด', h.affiliation)}
      ${_detailRow('🛏', 'จำนวนเตียง', h.beds ? Number(h.beds).toLocaleString() + ' เตียง' : '')}
      ${_detailRow('📍', 'จังหวัด', h.province)}
      ${_detailRow('🏘', 'อำเภอ/เขต', h.district)}
      ${_detailRow('🏡', 'ตำบล/แขวง', h.tambon)}
      ${_detailRow('📞', 'โทรศัพท์', h.tel)}
      ${_detailRow('🌐', 'Website', h.website)}
    </div>
    ${fullAddr ? `<div style="margin-top:12px;padding:10px 12px;background:var(--bg);border-radius:8px;font-size:12px;color:var(--txt-muted);"><b>📮 ที่อยู่:</b> ${esc(fullAddr)}</div>` : ''}
    ${h.note ? `<div style="margin-top:10px;padding:10px 12px;background:var(--warn)11;border-radius:8px;font-size:12px;color:var(--txt-muted);"><b>หมายเหตุ:</b> ${esc(h.note)}</div>` : ''}`;

  // ── Panel: ผู้ติดต่อ ──
  if (cs.length) {
    document.getElementById('m-hsp-detail-panel-contacts').innerHTML =
      `<div style="display:flex;flex-direction:column;gap:10px;">` +
      cs.map(function(c) {
        return `<div style="background:var(--bg);border-radius:10px;padding:14px 16px;border:1px solid var(--border);">
          <div style="font-size:14px;font-weight:700;color:var(--txt);">${esc(c.name||'—')}</div>
          ${c.position ? `<div style="font-size:11px;color:var(--violet);margin-top:2px;font-weight:600;">${esc(c.position)}</div>` : ''}
          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;font-size:12px;color:var(--txt-muted);">
            ${c.phone ? `<span>📞 ${esc(c.phone)}</span>` : ''}
            ${c.email ? `<span>✉️ ${esc(c.email)}</span>` : ''}
            ${c.note  ? `<span>💬 ${esc(c.note)}</span>` : ''}
          </div>
        </div>`;
      }).join('') +
      `</div>`;
  } else {
    document.getElementById('m-hsp-detail-panel-contacts').innerHTML =
      `<div style="text-align:center;color:var(--txt-muted);padding:48px 24px;font-size:13px;">ยังไม่มีข้อมูลผู้ติดต่อ</div>`;
  }

  // ── Panel: Product ──
  var prodPanel = document.getElementById('m-hsp-detail-panel-products');
  if (prodPanel) {
    var allProds = window.HSP_PRODUCTS || [];
    var selIds   = h.products || [];
    var myProds  = allProds.filter(function(p) { return selIds.includes(p.id); });
    if (!myProds.length) {
      prodPanel.innerHTML = '<div style="text-align:center;color:var(--txt-muted);padding:48px 24px;font-size:13px;">ยังไม่มี Product ที่ใช้งาน</div>';
    } else {
      var dpHtml = '';
      HSP_PROD_GROUPS.forEach(function(g) {
        var gProds = myProds.filter(function(p) { return p.group === g.id; });
        if (!gProds.length) return;
        dpHtml += '<div style="margin-bottom:14px;">' +
          '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:' + g.color + ';margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid ' + g.color + '33;">' + esc(g.label) + '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
          gProds.map(function(p) {
            return '<span style="background:' + p.color + '22;color:' + p.color + ';border:1px solid ' + p.color + '44;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:700;">' + esc(p.name) + '</span>';
          }).join('') + '</div></div>';
      });
      var noGrp2 = myProds.filter(function(p) { return !HSP_PROD_GROUPS.some(function(g){return g.id===p.group;}); });
      if (noGrp2.length) {
        dpHtml += '<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:700;color:var(--txt-muted);margin-bottom:8px;">อื่นๆ</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
          noGrp2.map(function(p) {
            return '<span style="background:' + p.color + '22;color:' + p.color + ';border:1px solid ' + p.color + '44;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:700;">' + esc(p.name) + '</span>';
          }).join('') + '</div></div>';
      }
      prodPanel.innerHTML = dpHtml;
    }
  }

  // ── Badge & edit button ──
  var badge = document.getElementById('m-hsp-dtab-contacts-badge');
  if (badge) {
    if (cs.length) { badge.textContent = cs.length; badge.style.display = ''; }
    else badge.style.display = 'none';
  }
  var prodBadge = document.getElementById('m-hsp-dtab-products-badge');
  if (prodBadge) {
    var pCount = (h.products || []).length;
    prodBadge.textContent = pCount; prodBadge.style.display = pCount ? '' : 'none';
  }
  var editBtn = document.getElementById('m-hsp-detail-edit-btn');
  if (editBtn) editBtn.style.display = canEdit ? '' : 'none';

  window._hspDetailTab('info');
  window.openM('m-hsp-detail');
};

function _detailRow(icon, label, val) {
  if (!val) return '';
  return `<div style="background:var(--bg);border-radius:8px;padding:10px 12px;">
    <div style="font-size:10px;color:var(--txt-muted);margin-bottom:2px;">${icon} ${label}</div>
    <div style="font-size:13px;color:var(--txt);font-weight:500;">${esc(String(val))}</div>
  </div>`;
}

// ── MODAL TABS ──────────────────────────────────────────────────────────────
window._hspTab = function(name) {
  var panels = { info: document.getElementById('m-hsp-panel-info'), contacts: document.getElementById('m-hsp-panel-contacts'), products: document.getElementById('m-hsp-panel-products') };
  var tabs   = { info: document.getElementById('m-hsp-tab-info'),   contacts: document.getElementById('m-hsp-tab-contacts'),   products: document.getElementById('m-hsp-tab-products') };
  Object.keys(panels).forEach(function(k) {
    if (!panels[k] || !tabs[k]) return;
    var active = k === name;
    panels[k].style.display = active ? '' : 'none';
    tabs[k].style.color             = active ? 'var(--violet)' : 'var(--txt-muted)';
    tabs[k].style.borderBottomColor = active ? 'var(--violet)' : 'transparent';
  });
};

// ── CONTACTS HELPERS ────────────────────────────────────────────────────────
function _hspUpdateContactBadge() {
  var list  = document.getElementById('hsp-contacts-list');
  var badge = document.getElementById('m-hsp-tab-contacts-badge');
  if (!badge) return;
  var count = list ? list.querySelectorAll('.hsp-contact-row').length : 0;
  badge.textContent = count;
  badge.style.display = count ? '' : 'none';
}

window._hspAddContact = function(c) {
  var list = document.getElementById('hsp-contacts-list');
  var empty = document.getElementById('hsp-contacts-empty');
  if (!list) return;
  if (empty) empty.style.display = 'none';

  var row = document.createElement('div');
  row.className = 'hsp-contact-row';
  row.style.cssText = 'background:var(--bg);border-radius:8px;padding:10px 12px;margin-bottom:8px;border:1px solid var(--border);';
  row.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">' +
      '<input class="f-input" placeholder="ชื่อ-นามสกุล" data-cf="name" value="' + esc(c?.name||'') + '" style="margin:0;">' +
      '<input class="f-input" placeholder="เบอร์โทร" data-cf="phone" value="' + esc(c?.phone||'') + '" style="margin:0;">' +
      '<input class="f-input" placeholder="ตำแหน่ง" data-cf="position" value="' + esc(c?.position||'') + '" style="margin:0;">' +
      '<input class="f-input" placeholder="Email" data-cf="email" type="email" value="' + esc(c?.email||'') + '" style="margin:0;">' +
      '<input class="f-input" placeholder="หมายเหตุ" data-cf="note" value="' + esc(c?.note||'') + '" style="margin:0;grid-column:1/-1;">' +
    '</div>' +
    '<div style="text-align:right;">' +
      '<button type="button" class="btn btn-ghost btn-sm" onclick="window._hspRemoveContact(this)" style="color:var(--coral);font-size:11px;">🗑 ลบผู้ติดต่อ</button>' +
    '</div>';
  list.appendChild(row);
  _hspUpdateContactBadge();
};

window._hspRemoveContact = function(btn) {
  var row = btn.closest('.hsp-contact-row');
  if (row) row.remove();
  var list = document.getElementById('hsp-contacts-list');
  var empty = document.getElementById('hsp-contacts-empty');
  if (empty && list && !list.querySelector('.hsp-contact-row')) empty.style.display = '';
  _hspUpdateContactBadge();
};

function _hspGetContacts() {
  var contacts = [];
  document.querySelectorAll('#hsp-contacts-list .hsp-contact-row').forEach(function(row) {
    var name     = (row.querySelector('[data-cf="name"]').value     || '').trim();
    var phone    = (row.querySelector('[data-cf="phone"]').value    || '').trim();
    var position = (row.querySelector('[data-cf="position"]').value || '').trim();
    var email    = (row.querySelector('[data-cf="email"]').value    || '').trim();
    var note     = (row.querySelector('[data-cf="note"]').value     || '').trim();
    if (name || phone || email) contacts.push({ name, phone, position, email, note });
  });
  return contacts;
}

// ── ADD / EDIT MODAL ────────────────────────────────────────────────────────
window.openHospitalModal = function(id) {
  var h = id ? (window.HOSPITALS || []).find(x => x.id === id) : null;
  var isNew = !h;

  document.getElementById('m-hsp-title').textContent = isNew ? '➕ เพิ่มโรงพยาบาล' : '✏️ แก้ไขโรงพยาบาล';
  document.getElementById('m-hsp-id').value = h?.id || '';

  document.getElementById('m-hsp-code').value        = h?.code || '';
  document.getElementById('m-hsp-name').value        = h?.name || '';
  document.getElementById('m-hsp-type').value        = h?.type || '';
  document.getElementById('m-hsp-beds').value        = h?.beds || '';
  document.getElementById('m-hsp-province').value    = h?.province || '';
  document.getElementById('m-hsp-district').value    = h?.district || '';
  document.getElementById('m-hsp-tambon').value      = h?.tambon || '';
  document.getElementById('m-hsp-address').value     = h?.address || '';
  document.getElementById('m-hsp-tel').value         = h?.tel || '';
  document.getElementById('m-hsp-website').value     = h?.website || '';
  document.getElementById('m-hsp-affiliation').value = h?.affiliation || '';
  document.getElementById('m-hsp-note').value        = h?.note || '';

  // ── ผู้ติดต่อ ────────────────────────────────────────────────────────────
  var cl = document.getElementById('hsp-contacts-list');
  var ce = document.getElementById('hsp-contacts-empty');
  if (cl) cl.innerHTML = '';
  var contacts = h?.contacts || [];
  if (ce) ce.style.display = contacts.length ? 'none' : '';
  contacts.forEach(function(c) { window._hspAddContact(c); });
  _hspUpdateContactBadge();

  // ดึงตัวเลือก district/tambon ตามจังหวัดที่เลือก
  window._hspFormProvinceChanged(false);
  window._hspFormDistrictChanged(false);

  // ── Product checkboxes ───────────────────────────────────────────────────
  var cbList  = document.getElementById('hsp-products-cb-list');
  var cbEmpty = document.getElementById('hsp-products-cb-empty');
  var prods   = window.HSP_PRODUCTS || [];
  var selProds = h?.products || [];
  if (cbList) {
    if (!prods.length) {
      cbList.innerHTML = '';
      if (cbEmpty) cbEmpty.style.display = '';
    } else {
      if (cbEmpty) cbEmpty.style.display = 'none';
      var cbHtml = '';
      HSP_PROD_GROUPS.forEach(function(g) {
        var gProds = prods.filter(function(p) { return p.group === g.id; });
        if (!gProds.length) return;
        cbHtml += '<div style="width:100%;margin:10px 0 6px;">' +
          '<span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;' +
          'color:' + g.color + ';padding:2px 10px 2px 0;border-bottom:2px solid ' + g.color + '44;">' + esc(g.label) + '</span>' +
          '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px;">' +
          gProds.map(function(p) {
            var checked = selProds.includes(p.id);
            return '<label style="display:flex;align-items:center;gap:6px;padding:6px 13px;border-radius:20px;border:2px solid ' +
              (checked ? p.color : 'var(--border)') + ';background:' + (checked ? p.color + '22' : 'var(--bg)') +
              ';cursor:pointer;font-size:12px;font-weight:600;transition:all .15s;" ' +
              'onchange="window._hspProdCbChange(this.querySelector(\'input\'),\'' + esc(p.color) + '\')">' +
              '<input type="checkbox" class="hsp-prod-cb" data-pid="' + esc(p.id) + '" ' + (checked ? 'checked' : '') +
              ' style="accent-color:' + p.color + ';width:13px;height:13px;">' +
              '<span style="width:7px;height:7px;border-radius:50%;background:' + p.color + ';display:inline-block;"></span>' +
              esc(p.name) + '</label>';
          }).join('') + '</div>';
      });
      // ungrouped
      var noGrp = prods.filter(function(p) { return !HSP_PROD_GROUPS.some(function(g){return g.id===p.group;}); });
      if (noGrp.length) {
        cbHtml += '<div style="width:100%;margin:10px 0 6px;"><span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--txt-muted);">อื่นๆ</span></div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
          noGrp.map(function(p) {
            var checked = selProds.includes(p.id);
            return '<label style="display:flex;align-items:center;gap:6px;padding:6px 13px;border-radius:20px;border:2px solid ' +
              (checked ? p.color : 'var(--border)') + ';background:' + (checked ? p.color + '22' : 'var(--bg)') +
              ';cursor:pointer;font-size:12px;font-weight:600;transition:all .15s;" ' +
              'onchange="window._hspProdCbChange(this.querySelector(\'input\'),\'' + esc(p.color) + '\')">' +
              '<input type="checkbox" class="hsp-prod-cb" data-pid="' + esc(p.id) + '" ' + (checked ? 'checked' : '') +
              ' style="accent-color:' + p.color + ';width:13px;height:13px;">' +
              esc(p.name) + '</label>';
          }).join('') + '</div>';
      }
      cbList.innerHTML = cbHtml;
    }
  }
  // badge
  var prodBadge = document.getElementById('m-hsp-tab-products-badge');
  if (prodBadge) { prodBadge.textContent = selProds.length; prodBadge.style.display = selProds.length ? '' : 'none'; }

  window._hspTab('info');
  window.openM('m-hsp');
};

window.saveHospital = async function() {
  var id   = document.getElementById('m-hsp-id').value;
  var code = document.getElementById('m-hsp-code').value.trim();
  var name = document.getElementById('m-hsp-name').value.trim();

  if (!code) { window.showAlert('กรุณากรอกรหัสสถานพยาบาล', 'warn'); return; }
  if (!name) { window.showAlert('กรุณากรอกชื่อโรงพยาบาล', 'warn'); return; }

  var dup = (window.HOSPITALS || []).find(function(h) { return h.code === code && h.id !== id; });
  if (dup) { window.showAlert('รหัส ' + code + ' มีอยู่แล้ว (' + dup.name + ')', 'warn'); return; }

  var btn = document.getElementById('m-hsp-save');
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'กำลังบันทึก...'; }

    // ── รวบรวมค่าจากฟอร์ม ────────────────────────────────────────────────
    var fName        = name;
    var fType        = document.getElementById('m-hsp-type').value.trim();
    var fBeds        = Number(document.getElementById('m-hsp-beds').value) || 0;
    var fProvince    = document.getElementById('m-hsp-province').value.trim();
    var fDistrict    = document.getElementById('m-hsp-district').value.trim();
    var fTambon      = document.getElementById('m-hsp-tambon').value.trim();
    var fAddress     = document.getElementById('m-hsp-address').value.trim();
    var fTel         = document.getElementById('m-hsp-tel').value.trim();
    var fWebsite     = document.getElementById('m-hsp-website').value.trim();
    var fAffiliation = document.getElementById('m-hsp-affiliation').value.trim();
    var fNote        = document.getElementById('m-hsp-note').value.trim();
    var fContacts    = _hspGetContacts();
    var fProducts    = Array.from(document.querySelectorAll('#hsp-products-cb-list .hsp-prod-cb:checked')).map(cb => cb.getAttribute('data-pid'));

    // ── ดึง MOPH API เมื่อมี field ที่ว่าง ───────────────────────────────
    var missingFields = !fProvince || !fDistrict || !fType || !fTel || !fAffiliation;
    var hasApiStored  = !!(localStorage.getItem(HCODE_REFRESH_KEY) || localStorage.getItem(HCODE_TOKEN_KEY));
    var enriched = false;

    if (missingFields && hasApiStored) {
      if (btn) btn.textContent = 'กำลังตรวจสอบ token...';
      var validToken = await _hspGetToken();

      if (!validToken) {
        // token หมดอายุและ refresh ใช้ไม่ได้ → เปิด login modal ทันที
        if (btn) { btn.disabled = false; btn.textContent = '💾 บันทึก'; }
        // inject hint ใน modal เพื่อบอกว่าต้อง login แล้วบันทึกใหม่
        var apiStat = document.getElementById('hsp-api-stat');
        if (apiStat) apiStat.innerHTML =
          '<span style="color:#ffa62b;font-weight:700;">⚠️ Session หมดอายุ</span>' +
          '<span style="color:var(--txt-muted);font-size:11px;margin-left:8px;">ล็อกอินใหม่แล้วกด บันทึก อีกครั้ง</span>';
        var errBox = document.getElementById('hsp-api-err');
        if (errBox) { errBox.textContent = 'กรุณาล็อกอินใหม่เพื่อให้ระบบเติมข้อมูล ' + code + ' จาก MOPH API โดยอัตโนมัติ'; errBox.style.display = ''; }
        window.openM('m-hsp-api');
        return;
      }

      if (btn) btn.textContent = 'กำลังดึงข้อมูลจาก MOPH...';
      var api = await _hspApiLookup(code);
      if (api && !api._rateLimited) {
        // ใช้ค่าจาก API เฉพาะ field ที่ว่างเท่านั้น — ค่าที่กรอกมีความสำคัญกว่า
        if (!fProvince    && api.province)    { fProvince    = api.province;    enriched = true; }
        if (!fDistrict    && api.district)    { fDistrict    = api.district;    enriched = true; }
        if (!fTambon      && api.tambon)      { fTambon      = api.tambon;      enriched = true; }
        if (!fAddress     && api.address)     { fAddress     = api.address;     enriched = true; }
        if (!fTel         && api.tel)         { fTel         = api.tel;         enriched = true; }
        if (!fAffiliation && api.affiliation) { fAffiliation = api.affiliation; enriched = true; }
        if (!fType || fType === 'other') {
          var apiType = api.type;
          if (apiType && apiType !== 'other') { fType = apiType; enriched = true; }
        }
        if (fBeds === 0 && api.beds > 0)      { fBeds = api.beds;              enriched = true; }
        // อัปเดตค่าในฟอร์มให้เห็น
        if (enriched) {
          document.getElementById('m-hsp-type').value        = fType;
          document.getElementById('m-hsp-beds').value        = fBeds || '';
          document.getElementById('m-hsp-province').value    = fProvince;
          document.getElementById('m-hsp-district').value    = fDistrict;
          document.getElementById('m-hsp-tambon').value      = fTambon;
          document.getElementById('m-hsp-address').value     = fAddress;
          document.getElementById('m-hsp-tel').value         = fTel;
          document.getElementById('m-hsp-affiliation').value = fAffiliation;
          window._hspFormProvinceChanged(false);
          window._hspFormDistrictChanged(false);
        }
      }
    }

    if (btn) btn.textContent = 'กำลังบันทึก...';

    var data = {
      hospital_id:  id || uid(),
      code,
      name:        fName,
      type:        fType        || 'other',
      beds:        fBeds,
      province:    fProvince,
      district:    fDistrict,
      tambon:      fTambon,
      address:     fAddress,
      tel:         fTel,
      website:     fWebsite,
      affiliation: fAffiliation,
      note:        fNote,
      contacts:    fContacts,
      products:    fProducts,
    };

    await window.setDoc(getDocRef('HOSPITALS', data.hospital_id), data);
    window.closeM('m-hsp');

    var msg = id ? 'อัปเดตข้อมูลแล้ว' : 'เพิ่มโรงพยาบาลแล้ว';
    if (enriched) msg += ' · เติมข้อมูลจาก MOPH API';
    window.showAlert(msg, 'success');

  } catch(e) {
    window.showAlert('บันทึกไม่สำเร็จ: ' + e.message, 'warn');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 บันทึก'; }
  }
};

window.deleteHospital = async function(id) {
  var h = (window.HOSPITALS || []).find(x => x.id === id);
  if (!h) return;
  if (!await window.confirmAsync('ลบ "'+h.name+'" ออกจากระบบ?',{icon:'🗑️',title:'ลบโรงพยาบาล'})) return;
  try {
    await window.deleteDoc(getDocRef('HOSPITALS', id));
    window.showAlert('ลบข้อมูลแล้ว', 'success');
  } catch(e) {
    window.showAlert('ลบไม่สำเร็จ: ' + e.message, 'warn');
  }
};

// ── DOWNLOAD TEMPLATE ────────────────────────────────────────────────────────
window.downloadHospitalTemplate = function() {
  var wb = XLSX.utils.book_new();

  // ── Sheet 1: รายชื่อ รพ. (ข้อมูลหลัก) ──────────────────────────────────
  var headers = [
    'hospital_code','hospital_name','hospital_type','beds',
    'province','district','tambon','address',
    'tel','website','affiliation','note',
  ];

  var examples = [
    // แบบ code only (ถ้าเชื่อมต่อ MOPH API จะดึงข้อมูลให้อัตโนมัติ)
    ['10669','','','','','','','','','','',''],
    ['10710','','','','','','','','','','',''],
    ['10736','','','','','','','','','','',''],
    // แบบกรอกข้อมูลครบ
    ['11001','โรงพยาบาลนนทบุรี','S',388,'นนทบุรี','เมืองนนทบุรี','สวรรค์ใต้','68 ถ.รัตนาธิเบศร์ ต.สวรรค์ใต้ อ.เมือง จ.นนทบุรี','02-589-5000','','กระทรวงสาธารณสุข',''],
    ['10773','โรงพยาบาลรามาธิบดี','A',1200,'กรุงเทพมหานคร','ราษฎร์บูรณะ','','270 ถ.พระรามหก แขวงทุ่งพญาไท เขตราษฎร์บูรณะ','02-201-1000','www.rama.mahidol.ac.th','มหาวิทยาลัยมหิดล',''],
    ['13770','โรงพยาบาลชัยบาดาล','F1',90,'ลพบุรี','ชัยบาดาล','ลำนารายณ์','ถ.พหลโยธิน ต.ลำนารายณ์ อ.ชัยบาดาล จ.ลพบุรี 15130','036-459-009','','กระทรวงสาธารณสุข',''],
    ['11101','คลินิกเวชกรรมตัวอย่าง','P',0,'กรุงเทพมหานคร','บางรัก','','12/34 ถ.สีลม แขวงบางรัก','02-000-0000','','เอกชน','ตัวอย่างประเภท P'],
  ];

  var ws1 = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  ws1['!cols'] = [
    {wch:14},{wch:38},{wch:13},{wch:7},
    {wch:20},{wch:18},{wch:16},{wch:46},
    {wch:15},{wch:28},{wch:22},{wch:22},
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'รายชื่อ รพ.');

  // ── Sheet 2: คำแนะนำ ─────────────────────────────────────────────────────
  var guide = [
    ['=== คู่มือการกรอกไฟล์นำเข้าโรงพยาบาล ==='],
    [''],
    ['● ชื่อคอลัมน์ (Header) ที่ระบบรองรับ'],
    ['ชื่อคอลัมน์หลัก','ชื่อทางเลือก (ใช้แทนกันได้)','คำอธิบาย','จำเป็น?'],
    ['hospital_code',  'รหัสสถานพยาบาล, รหัส, code, hcode',  'รหัส 5 หลัก (HOS Code)',                   '✅ จำเป็น'],
    ['hospital_name',  'ชื่อโรงพยาบาล, ชื่อ, name',           'ชื่อโรงพยาบาล (ว่างได้ถ้าเชื่อม MOPH API)', '—'],
    ['hospital_type',  'ระดับ, ประเภท, type',                  'รหัสระดับ รพ. (ดูตารางด้านล่าง)',            '—'],
    ['beds',           'เตียง, จำนวนเตียง',                     'จำนวนเตียง (ตัวเลข)',                        '—'],
    ['province',       'จังหวัด',                               'ชื่อจังหวัด เช่น กรุงเทพมหานคร',            '—'],
    ['district',       'อำเภอ, เขต',                            'ชื่ออำเภอ/เขต',                              '—'],
    ['tambon',         'subdistrict, ตำบล, แขวง',               'ชื่อตำบล/แขวง',                             '—'],
    ['address',        'ที่อยู่',                                'ที่อยู่เต็ม',                                '—'],
    ['tel',            'telephone, โทรศัพท์, phone',            'หมายเลขโทรศัพท์',                           '—'],
    ['website',        'เว็บ',                                   'URL เว็บไซต์',                               '—'],
    ['affiliation',    'สังกัด',                                 'สังกัด เช่น กระทรวงสาธารณสุข',             '—'],
    ['note',           'หมายเหตุ',                              'หมายเหตุเพิ่มเติม',                          '—'],
    [''],
    ['● รหัสระดับโรงพยาบาล (hospital_type)'],
    ['รหัส','ความหมาย','จำนวนเตียงอ้างอิง'],
    ['A',     'โรงพยาบาลศูนย์ระดับสูงสุด',       '500+ เตียง'],
    ['S',     'โรงพยาบาลศูนย์/ทั่วไปขนาดใหญ่',  '300–499 เตียง'],
    ['M1',    'โรงพยาบาลทั่วไปขนาดกลาง',        '150–299 เตียง'],
    ['M2',    'โรงพยาบาลทั่วไปขนาดเล็ก',         '90–149 เตียง'],
    ['F1',    'โรงพยาบาลชุมชนขนาดใหญ่',         '60–89 เตียง'],
    ['F2',    'โรงพยาบาลชุมชนขนาดกลาง',         '30–59 เตียง'],
    ['F3',    'โรงพยาบาลชุมชนขนาดเล็ก',          '<30 เตียง'],
    ['P',     'โรงพยาบาลเอกชน / คลินิก',         '—'],
    ['other', 'อื่นๆ / ไม่ระบุ',                 '—'],
    [''],
    ['● หมายเหตุสำคัญ'],
    ['1. หากเชื่อมต่อ MOPH API แล้ว กรอกแค่ hospital_code ก็พอ ระบบดึงชื่อ/ที่อยู่/ระดับให้อัตโนมัติ'],
    ['2. ข้อมูลที่กรอกในไฟล์จะมีความสำคัญเหนือกว่า MOPH API เสมอ'],
    ['3. รหัสที่ซ้ำกันในไฟล์ — ระบบจะเก็บเฉพาะแถวแรก'],
    ['4. รหัสที่มีอยู่ในระบบแล้ว — ระบบจะ "อัปเดต" ข้อมูล ไม่สร้างซ้ำ'],
    ['5. ถ้าเลือก "ลบข้อมูลเดิมก่อนนำเข้า" — ข้อมูลเดิมทั้งหมดจะถูกลบแล้วแทนที่ด้วยไฟล์นี้'],
  ];

  var ws2 = XLSX.utils.aoa_to_sheet(guide);
  ws2['!cols'] = [{wch:18},{wch:40},{wch:30},{wch:12}];
  XLSX.utils.book_append_sheet(wb, ws2, 'คำแนะนำ');

  XLSX.writeFile(wb, 'Template_HOSPITALS.xlsx');
};

// ── CONTACTS IMPORT ──────────────────────────────────────────────────────────

window.downloadHospitalContactsTemplate = function() {
  var wb = XLSX.utils.book_new();

  var headers = ['hospital_code','contact_name','phone','position','email','note'];
  var examples = [
    ['10669','นพ.สมชาย ใจดี','043-246-100 ต่อ 101','ผู้อำนวยการ','director@kkhospital.go.th','ติดต่อได้วันจันทร์-ศุกร์'],
    ['10669','นางสาวสมหญิง รักงาน','081-234-5678','พยาบาลวิชาชีพ','nurse@kkhospital.go.th',''],
    ['10710','นายพิชัย มั่นคง','042-512-000','เลขานุการ','secretary@udonhosp.go.th',''],
  ];
  var wsData = [headers, ...examples];
  var ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{wch:14},{wch:22},{wch:18},{wch:20},{wch:28},{wch:28}];
  XLSX.utils.book_append_sheet(wb, ws, 'ผู้ติดต่อ รพ.');

  var guide = [
    ['คอลัมน์','คำอธิบาย','ตัวอย่าง','จำเป็น'],
    ['hospital_code','รหัสสถานพยาบาล 5 หลัก','10669','✅'],
    ['contact_name','ชื่อ-นามสกุลผู้ติดต่อ','นพ.สมชาย ใจดี','✅'],
    ['phone','เบอร์โทรศัพท์','043-246-100 ต่อ 101',''],
    ['position','ตำแหน่งงาน','ผู้อำนวยการ',''],
    ['email','อีเมล','director@hospital.go.th',''],
    ['note','หมายเหตุ','ติดต่อได้ในเวลาราชการ',''],
    ['','','',''],
    ['หมายเหตุ','1 แถว = 1 ผู้ติดต่อ · รพ.เดียวกันใส่หลายแถวได้','',''],
    ['','ตัวเลือก "เพิ่มเติม": เพิ่มผู้ติดต่อใหม่โดยไม่ลบรายเดิม','',''],
    ['','ค่าเริ่มต้น: แทนที่ผู้ติดต่อทั้งหมดของ รพ. ที่อยู่ในไฟล์','',''],
  ];
  var ws2 = XLSX.utils.aoa_to_sheet(guide);
  ws2['!cols'] = [{wch:18},{wch:46},{wch:28},{wch:8}];
  XLSX.utils.book_append_sheet(wb, ws2, 'คำแนะนำ');

  XLSX.writeFile(wb, 'Template_HOSPITAL_CONTACTS.xlsx');
};

// pending state
window._hspContactsImportPending = null;

window.importHospitalContactsFromFile = async function(file) {
  try {
    var ab = await file.arrayBuffer();
    var wb = XLSX.read(ab);
    var ws = wb.Sheets[wb.SheetNames[0]];
    var rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rows.length) { window.showAlert('ไม่พบข้อมูลในไฟล์', 'warn'); return; }

    // หา column keys
    var headers = Object.keys(rows[0]);
    function findCol(aliases) {
      for (var a of aliases) {
        var found = headers.find(function(h) { return h.trim().toLowerCase() === a.toLowerCase(); });
        if (found) return found;
      }
      return null;
    }
    var colCode     = findCol(['hospital_code','รหัสสถานพยาบาล','รหัส','code','hcode']);
    var colName     = findCol(['contact_name','ชื่อผู้ติดต่อ','ชื่อ-นามสกุล','ชื่อ','name']);
    var colPhone    = findCol(['phone','เบอร์โทร','โทรศัพท์','tel','telephone']);
    var colPosition = findCol(['position','ตำแหน่ง','ตำแหน่งงาน']);
    var colEmail    = findCol(['email','อีเมล','e-mail']);
    var colNote     = findCol(['note','หมายเหตุ','remark']);

    if (!colCode) { window.showAlert('ไม่พบคอลัมน์รหัสสถานพยาบาล (hospital_code)', 'warn'); return; }
    if (!colName) { window.showAlert('ไม่พบคอลัมน์ชื่อผู้ติดต่อ (contact_name)', 'warn'); return; }

    // จัดกลุ่ม contacts ตาม hospital_code
    var groups = {}; // code → [{name,phone,position,email,note}]
    var errorRows = [];

    rows.forEach(function(row, i) {
      var code    = String(colCode ? row[colCode] : '').trim();
      var cName   = String(colName     ? row[colName]     : '').trim();
      var cPhone  = String(colPhone    ? row[colPhone]    : '').trim();
      var cPos    = String(colPosition ? row[colPosition] : '').trim();
      var cEmail  = String(colEmail    ? row[colEmail]    : '').trim();
      var cNote   = String(colNote     ? row[colNote]     : '').trim();

      if (!code) { errorRows.push({ rowNum: i + 2, reason: 'ไม่มีรหัสสถานพยาบาล' }); return; }
      if (!cName) { errorRows.push({ rowNum: i + 2, code, reason: 'ไม่มีชื่อผู้ติดต่อ' }); return; }

      if (!groups[code]) groups[code] = [];
      groups[code].push({ name: cName, phone: cPhone, position: cPos, email: cEmail, note: cNote });
    });

    // จับคู่กับ window.HOSPITALS
    var hospitals = window.HOSPITALS || [];
    var entries = Object.keys(groups).map(function(code) {
      var h = hospitals.find(function(x) { return x.code === code; });
      return {
        code,
        hospName:    h ? h.name : null,
        hospId:      h ? h.id   : null,
        contacts:    groups[code],
        existing:    h ? (h.contacts || []).length : 0,
        status:      !h ? 'not_found' : (h.contacts && h.contacts.length) ? 'update' : 'new',
      };
    });

    window._hspContactsImportPending = { entries, errorRows, fileName: file.name };
    _hspShowContactsImportPreview();

  } catch(err) {
    window.showAlert('อ่านไฟล์ไม่สำเร็จ: ' + err.message, 'warn');
  }
};

function _hspShowContactsImportPreview() {
  var pending = window._hspContactsImportPending;
  if (!pending) return;
  var { entries, errorRows, fileName } = pending;

  var found    = entries.filter(function(e) { return e.status !== 'not_found'; });
  var notFound = entries.filter(function(e) { return e.status === 'not_found'; });
  var totalContacts = found.reduce(function(s, e) { return s + e.contacts.length; }, 0);

  var statusColor = { new: 'var(--teal)', update: 'var(--violet)', not_found: 'var(--coral)' };
  var statusLabel = { new: '🟢 ใหม่', update: '🔵 มีอยู่แล้ว', not_found: '🔴 ไม่พบ รพ.' };

  var html =
    '<div style="padding:16px 24px 0;">' +
      // summary
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">' +
        _cimportStat('🏥 รพ.ที่พบ', found.length, 'var(--teal)') +
        _cimportStat('👤 ผู้ติดต่อ', totalContacts, 'var(--violet)') +
        _cimportStat('🔴 ไม่พบ รพ.', notFound.length, notFound.length ? 'var(--coral)' : 'var(--txt-muted)') +
        _cimportStat('⚠ แถวผิดพลาด', errorRows.length, errorRows.length ? '#ffa62b' : 'var(--txt-muted)') +
      '</div>' +
      '<div style="font-size:11px;color:var(--txt-muted);margin-bottom:12px;">📄 ' + esc(fileName) + '</div>' +
    '</div>' +
    '<div style="padding:0 24px 16px;">' +
      // header row
      '<div style="display:grid;grid-template-columns:110px 1fr 60px 70px;gap:8px;padding:6px 10px;font-size:11px;font-weight:700;color:var(--txt-muted);border-bottom:1px solid var(--border);margin-bottom:6px;">' +
        '<div>รหัส</div><div>โรงพยาบาล</div><div style="text-align:center;">ผู้ติดต่อ</div><div style="text-align:center;">สถานะ</div>' +
      '</div>' +
      entries.map(function(e) {
        var sc = statusColor[e.status];
        return '<div style="display:grid;grid-template-columns:110px 1fr 60px 70px;gap:8px;padding:7px 10px;' +
          'border-radius:6px;font-size:12px;border-bottom:1px solid var(--border);align-items:center;">' +
          '<div style="font-family:monospace;color:var(--txt-muted);">' + esc(e.code) + '</div>' +
          '<div style="color:var(--txt);">' + (e.hospName ? esc(e.hospName) : '<span style="color:var(--coral);font-style:italic;">ไม่พบในระบบ</span>') + '</div>' +
          '<div style="text-align:center;font-weight:600;color:var(--violet);">' + e.contacts.length + '</div>' +
          '<div style="text-align:center;"><span style="font-size:11px;color:' + sc + ';font-weight:600;">' + statusLabel[e.status] + '</span></div>' +
          '</div>';
      }).join('') +
      (errorRows.length ?
        '<div style="margin-top:12px;padding:10px 12px;background:#ffa62b18;border:1px solid #ffa62b44;border-radius:8px;font-size:12px;">' +
        '<b style="color:#ffa62b;">⚠ แถวที่มีปัญหา (' + errorRows.length + ' แถว)</b>' +
        errorRows.slice(0,5).map(function(r){ return '<div style="color:var(--txt-muted);margin-top:4px;">แถว ' + r.rowNum + ': ' + esc(r.reason) + (r.code?' ('+esc(r.code)+')':'') + '</div>'; }).join('') +
        (errorRows.length > 5 ? '<div style="color:var(--txt-muted);margin-top:4px;">... และอีก ' + (errorRows.length-5) + ' แถว</div>' : '') +
        '</div>' : '') +
    '</div>';

  var body = document.getElementById('m-hsp-cimport-body');
  if (body) body.innerHTML = html;

  var confirmBtn = document.getElementById('m-hsp-cimport-confirm-btn');
  if (confirmBtn) confirmBtn.disabled = found.length === 0;

  var appendCb = document.getElementById('hsp-cimport-append-cb');
  if (appendCb) appendCb.checked = false;

  window.openM('m-hsp-cimport');
}

function _cimportStat(label, val, color) {
  return '<div style="background:var(--bg);border-radius:8px;padding:10px 16px;flex:1;min-width:100px;border:1px solid var(--border);">' +
    '<div style="font-size:20px;font-weight:800;color:' + color + ';">' + val + '</div>' +
    '<div style="font-size:11px;color:var(--txt-muted);margin-top:2px;">' + label + '</div>' +
    '</div>';
}

window.confirmImportHospitalContacts = async function() {
  var pending = window._hspContactsImportPending;
  if (!pending) return;

  var append = document.getElementById('hsp-cimport-append-cb')?.checked || false;
  var found  = pending.entries.filter(function(e) { return e.status !== 'not_found'; });
  if (!found.length) return;

  var btn = document.getElementById('m-hsp-cimport-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'กำลังบันทึก...'; }

  var body = document.getElementById('m-hsp-cimport-body');

  try {
    var db = window.getDb();
    var batch = window.writeBatch(db);
    var batchCount = 0;

    for (var i = 0; i < found.length; i++) {
      var e = found[i];
      var h = (window.HOSPITALS || []).find(function(x) { return x.id === e.hospId; });
      if (!h) continue;

      var newContacts = append
        ? (h.contacts || []).concat(e.contacts)
        : e.contacts;

      batch.set(
        getDocRef('HOSPITALS', h.id),
        Object.assign({}, h, { hospital_id: h.id, contacts: newContacts }),
        { merge: true }
      );
      batchCount++;

      if (batchCount % 400 === 0) {
        await batch.commit();
        batch = window.writeBatch(db);
      }

      if (body) body.innerHTML = '<div style="padding:32px;text-align:center;color:var(--txt-muted);">กำลังบันทึก ' + (i+1) + ' / ' + found.length + ' โรงพยาบาล...</div>';
    }

    if (batchCount % 400 !== 0) await batch.commit();

    window.closeM('m-hsp-cimport');
    window._hspContactsImportPending = null;
    var totalContacts = found.reduce(function(s, e) { return s + e.contacts.length; }, 0);
    window.showAlert('นำเข้าผู้ติดต่อสำเร็จ · ' + found.length + ' รพ. · ' + totalContacts + ' ผู้ติดต่อ', 'success');

  } catch(err) {
    window.showAlert('บันทึกไม่สำเร็จ: ' + err.message, 'warn');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✅ ยืนยันนำเข้า'; }
  }
};

// ── EXCEL IMPORT — STEP 1: อ่านไฟล์ + สร้าง Preview ────────────────────────

// column aliases สำหรับ import (ใช้ร่วมกันทั้ง preview และ confirm)
var _HSP_COL_MAP = {
  code:        ['hospital_code','รหัสสถานพยาบาล','รหัส','code','hcode','hcode5'],
  name:        ['hospital_name','ชื่อ','ชื่อโรงพยาบาล','name'],
  type:        ['hospital_type','ระดับ','ประเภท','type'],
  beds:        ['beds','เตียง','จำนวนเตียง'],
  province:    ['province','จังหวัด'],
  district:    ['district','อำเภอ','เขต'],
  tambon:      ['tambon','subdistrict','ตำบล','แขวง'],
  address:     ['address','ที่อยู่'],
  tel:         ['tel','telephone','โทรศัพท์','phone'],
  website:     ['website','เว็บ'],
  affiliation: ['affiliation','สังกัด'],
  note:        ['note','หมายเหตุ'],
};

function _hspGetColKeys(headers) {
  var colKeys = {};
  for (var field in _HSP_COL_MAP) {
    var aliases = _HSP_COL_MAP[field];
    var found = null;
    for (var k of aliases) {
      found = headers.find(function(h) { return h.trim().toLowerCase() === k.toLowerCase(); });
      if (found) break;
    }
    colKeys[field] = found || null;
  }
  return colKeys;
}

// pending import state
window._hspImportPending = null;

window.importHospitalsFromFile = async function(file) {
  var progressEl = document.getElementById('hsp-import-progress');
  function setProgress(msg) { if (progressEl) progressEl.textContent = msg; }

  try {
    setProgress('กำลังอ่านไฟล์...');
    var ab = await file.arrayBuffer();
    var wb = XLSX.read(ab);
    var ws = wb.Sheets[wb.SheetNames[0]];
    var rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rows.length) { window.showAlert('ไม่พบข้อมูลในไฟล์', 'warn'); setProgress(''); return; }

    var headers = Object.keys(rows[0]);
    var colKeys = _hspGetColKeys(headers);
    var seenCodes = new Set();
    var items = [];

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var code = String(colKeys.code ? row[colKeys.code] : '').trim();

      if (!code) {
        items.push({ rowNum: i + 2, code: '', name: '', province: '', type: '', status: 'error', reason: 'ไม่มีรหัสสถานพยาบาล', rowData: row });
        continue;
      }

      var exName     = String(colKeys.name     ? row[colKeys.name]     : '').trim();
      var exProvince = String(colKeys.province  ? row[colKeys.province] : '').trim();
      var exType     = String(colKeys.type      ? row[colKeys.type]     : '').trim();

      if (seenCodes.has(code)) {
        items.push({ rowNum: i + 2, code, name: exName, province: exProvince, type: exType, status: 'dup_file', reason: 'รหัสซ้ำในไฟล์', rowData: row });
        continue;
      }
      seenCodes.add(code);

      var existing = (window.HOSPITALS || []).find(function(h) { return h.code === code; });
      items.push({
        rowNum: i + 2,
        code,
        name:       exName     || existing?.name     || '',
        province:   exProvince || existing?.province || '',
        type:       exType     || existing?.type     || '',
        status:     existing ? 'update' : 'new',
        reason:     '',
        existingId: existing ? existing.id : null,
        rowData:    row,
      });
    }

    setProgress('');
    window._hspImportPending = { items, colKeys, fileName: file.name };
    _hspShowImportPreview();

  } catch(err) {
    setProgress('');
    window.showAlert('อ่านไฟล์ไม่สำเร็จ: ' + err.message, 'warn');
  }
};

window.importHospitalsExcel = function() {
  var inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.xlsx,.xls,.csv';
  inp.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    window.importHospitalsFromFile(file);
  };
  inp.click();
};

// ── STEP 2: แสดง Preview Modal ───────────────────────────────────────────────

function _hspShowImportPreview() {
  var pending = window._hspImportPending;
  if (!pending) return;
  var { items, fileName } = pending;

  var counts = { new: 0, update: 0, dup_file: 0, error: 0 };
  items.forEach(function(it) { counts[it.status] = (counts[it.status] || 0) + 1; });
  var canImport = counts.new + counts.update;

  var STATUS_CFG = {
    new:      { label: '🟢 ใหม่',        color: '#06d6a0', bg: '#06d6a022' },
    update:   { label: '🔵 อัปเดต',      color: '#4361ee', bg: '#4361ee22' },
    dup_file: { label: '🟡 ซ้ำในไฟล์',   color: '#ffa62b', bg: '#ffa62b22' },
    error:    { label: '🔴 ข้อผิดพลาด',  color: '#ff6b6b', bg: '#ff6b6b22' },
  };

  var confirmBtn = document.getElementById('m-hsp-import-confirm-btn');
  if (confirmBtn) confirmBtn.disabled = canImport === 0;

  var body = document.getElementById('m-hsp-import-body');
  if (!body) return;

  // Summary bar
  var summaryHtml = '<div style="padding:14px 20px;border-bottom:1px solid var(--border);background:var(--bg);">' +
    '<div style="font-size:12px;color:var(--txt-muted);margin-bottom:8px;">ไฟล์: <b>' + esc(fileName) + '</b> · ทั้งหมด ' + items.length + ' แถว</div>' +
    '<div style="display:flex;gap:12px;flex-wrap:wrap;">' +
    Object.entries(counts).filter(function(e){ return e[1] > 0; }).map(function(e) {
      var k = e[0]; var v = e[1]; var cfg = STATUS_CFG[k];
      return '<span style="background:' + cfg.bg + ';color:' + cfg.color + ';padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">' +
        cfg.label + ' ' + v + '</span>';
    }).join('') +
    '</div>' +
    (counts.new === 0 && counts.update === 0
      ? '<div style="margin-top:8px;font-size:12px;color:var(--coral);">ไม่มีรายการที่นำเข้าได้</div>'
      : '<div style="margin-top:8px;font-size:12px;color:var(--txt-muted);">จะนำเข้า <b style="color:var(--txt);">' + canImport + '</b> รายการ · ข้าม ' + (counts.dup_file + counts.error) + ' รายการ</div>') +
  '</div>';

  // Table
  var tableHtml = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">' +
    '<thead><tr style="background:var(--bg);color:var(--txt-muted);font-size:11px;text-transform:uppercase;letter-spacing:.4px;position:sticky;top:0;z-index:1;">' +
    '<th style="padding:7px 12px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap;">แถว</th>' +
    '<th style="padding:7px 12px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap;">สถานะ</th>' +
    '<th style="padding:7px 12px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap;">รหัส</th>' +
    '<th style="padding:7px 12px;text-align:left;border-bottom:1px solid var(--border);">ชื่อโรงพยาบาล</th>' +
    '<th style="padding:7px 12px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap;">จังหวัด</th>' +
    '<th style="padding:7px 12px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap;">ระดับ</th>' +
    '<th style="padding:7px 12px;text-align:left;border-bottom:1px solid var(--border);">หมายเหตุ</th>' +
    '</tr></thead><tbody>' +
    items.map(function(it) {
      var cfg = STATUS_CFG[it.status];
      var rowStyle = it.status === 'dup_file' || it.status === 'error'
        ? 'opacity:.55;'
        : '';
      return '<tr style="border-bottom:1px solid var(--border);' + rowStyle + '">' +
        '<td style="padding:7px 12px;color:var(--txt-muted);font-size:11px;">' + it.rowNum + '</td>' +
        '<td style="padding:7px 12px;white-space:nowrap;">' +
          '<span style="background:' + cfg.bg + ';color:' + cfg.color + ';padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">' + cfg.label + '</span>' +
        '</td>' +
        '<td style="padding:7px 12px;font-family:monospace;font-weight:700;color:var(--primary);white-space:nowrap;">' + esc(it.code || '—') + '</td>' +
        '<td style="padding:7px 12px;color:var(--txt);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
          (it.name ? esc(it.name) : '<span style="color:var(--txt-muted);font-style:italic;">ดึงจาก MOPH</span>') + '</td>' +
        '<td style="padding:7px 12px;color:var(--txt-muted);white-space:nowrap;">' + esc(it.province || '—') + '</td>' +
        '<td style="padding:7px 12px;color:var(--txt-muted);white-space:nowrap;">' + esc(it.type || '—') + '</td>' +
        '<td style="padding:7px 12px;color:var(--txt-muted);font-size:11px;">' + esc(it.reason || '') + '</td>' +
      '</tr>';
    }).join('') +
    '</tbody></table></div>';

  body.innerHTML = summaryHtml + tableHtml;
  window.openM('m-hsp-import');
}

// ── STEP 3: ยืนยันนำเข้า — แสดง Progress + Error ใน Modal ──────────────────

window.confirmImportHospitals = async function() {
  var pending = window._hspImportPending;
  if (!pending) return;

  var clearFirst = document.getElementById('hsp-import-clear-cb')?.checked;
  var { items, colKeys } = pending;
  var toImport = items.filter(function(it) { return it.status === 'new' || it.status === 'update'; });

  if (!toImport.length) { window.showAlert('ไม่มีรายการที่นำเข้าได้', 'warn'); return; }

  var total = toImport.length;

  // ── สลับ Modal body → Progress view ──────────────────────────────────────
  var modalBody = document.getElementById('m-hsp-import-body');
  var modalFoot = document.querySelector('#m-hsp-import .m-foot');

  if (modalBody) {
    modalBody.innerHTML =
      '<div style="padding:24px 20px;">' +
        // progress bar
        '<div style="margin-bottom:20px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<span id="_hprog-label" style="font-size:13px;font-weight:600;color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;margin-right:12px;">กำลังเตรียมข้อมูล...</span>' +
            '<span id="_hprog-count" style="font-size:12px;color:var(--txt-muted);white-space:nowrap;flex-shrink:0;">0 / ' + total + '</span>' +
          '</div>' +
          '<div style="height:10px;background:var(--border);border-radius:10px;overflow:hidden;">' +
            '<div id="_hprog-bar" style="height:100%;width:0%;background:var(--primary);border-radius:10px;transition:width .12s;"></div>' +
          '</div>' +
        '</div>' +
        // stats row
        '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;">' +
          '<div style="background:var(--bg);border-radius:8px;padding:8px 14px;flex:1;min-width:80px;">' +
            '<div style="font-size:10px;color:var(--txt-muted);margin-bottom:2px;">✅ สำเร็จ</div>' +
            '<div id="_hprog-ok" style="font-size:20px;font-weight:800;color:#06d6a0;">0</div>' +
          '</div>' +
          '<div style="background:var(--bg);border-radius:8px;padding:8px 14px;flex:1;min-width:80px;">' +
            '<div style="font-size:10px;color:var(--txt-muted);margin-bottom:2px;">🌐 จาก MOPH</div>' +
            '<div id="_hprog-api" style="font-size:20px;font-weight:800;color:var(--primary);">0</div>' +
          '</div>' +
          '<div style="background:var(--bg);border-radius:8px;padding:8px 14px;flex:1;min-width:80px;">' +
            '<div style="font-size:10px;color:var(--txt-muted);margin-bottom:2px;">❌ ข้ามไป</div>' +
            '<div id="_hprog-skip" style="font-size:20px;font-weight:800;color:#ff6b6b;">0</div>' +
          '</div>' +
        '</div>' +
        // error list
        '<div id="_hprog-err-wrap" style="display:none;">' +
          '<div style="font-size:11px;font-weight:600;color:var(--coral,#ff6b6b);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">รายการที่ไม่สำเร็จ</div>' +
          '<div id="_hprog-err-list" style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:4px;"></div>' +
        '</div>' +
      '</div>';
  }

  if (modalFoot) {
    modalFoot.innerHTML =
      '<div style="flex:1;font-size:12px;color:var(--txt-muted);" id="_hprog-foot-note"></div>' +
      '<button class="btn btn-ghost" id="_hprog-close-btn" disabled onclick="window.closeM(\'m-hsp-import\')">ปิด</button>';
  }

  // helpers
  function setLabel(msg) {
    var el = document.getElementById('_hprog-label');
    if (el) el.textContent = msg;
  }
  function setBar(done) {
    var pct = total ? Math.round(done / total * 100) : 100;
    var bar = document.getElementById('_hprog-bar');
    var cnt = document.getElementById('_hprog-count');
    if (bar) bar.style.width = pct + '%';
    if (cnt) cnt.textContent = done + ' / ' + total;
  }
  function setStat(ok, api, skip) {
    var eOk = document.getElementById('_hprog-ok');
    var eApi = document.getElementById('_hprog-api');
    var eSk  = document.getElementById('_hprog-skip');
    if (eOk)  eOk.textContent  = ok;
    if (eApi) eApi.textContent = api;
    if (eSk)  eSk.textContent  = skip;
  }
  function addError(msg) {
    var wrap = document.getElementById('_hprog-err-wrap');
    var list = document.getElementById('_hprog-err-list');
    if (!list) return;
    if (wrap) wrap.style.display = '';
    var div = document.createElement('div');
    div.style.cssText = 'padding:5px 8px;border-radius:5px;font-size:12px;color:#ff6b6b;border-bottom:1px solid var(--border);';
    div.textContent = msg;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
  }
  function finalize(ok, api, skip, fatalErr) {
    var bar = document.getElementById('_hprog-bar');
    if (bar) {
      bar.style.width = '100%';
      bar.style.background = fatalErr ? '#ff6b6b' : '#06d6a0';
    }
    if (fatalErr) {
      setLabel('เกิดข้อผิดพลาด: ' + fatalErr);
    } else {
      var txt = 'นำเข้าสำเร็จ ' + ok + ' รายการ';
      if (api)  txt += '  ·  MOPH ' + api + ' แห่ง';
      if (skip) txt += '  ·  ข้าม ' + skip + ' รายการ';
      setLabel(txt);
    }
    var note = document.getElementById('_hprog-foot-note');
    if (note && clearFirst) note.textContent = 'ลบข้อมูลเดิมก่อนนำเข้าแล้ว';
    var closeBtn = document.getElementById('_hprog-close-btn');
    if (closeBtn) closeBtn.disabled = false;
    // clear toolbar progress text
    var tp = document.getElementById('hsp-import-progress');
    if (tp) tp.textContent = '';
  }

  try {
    var db = window.getDb();

    // ── ลบข้อมูลเดิม (ถ้าเลือก) ──────────────────────────────────────────
    if (clearFirst) {
      var allIds = (window.HOSPITALS || []).map(function(h) { return h.id; });
      if (allIds.length) {
        setLabel('กำลังลบข้อมูลเดิม ' + allIds.length + ' รายการ...');
        var delBatch = null;
        for (var di = 0; di < allIds.length; di++) {
          if (!delBatch) delBatch = window.writeBatch(db);
          delBatch.delete(getDocRef('HOSPITALS', allIds[di]));
          if ((di + 1) % 400 === 0) { await delBatch.commit(); delBatch = null; }
        }
        if (delBatch) await delBatch.commit();
      }
    }

    // ── นำเข้าทีละรายการ ─────────────────────────────────────────────────
    var hasApi = !!(localStorage.getItem(HCODE_REFRESH_KEY) || localStorage.getItem(HCODE_TOKEN_KEY));
    var batch = null;
    var batchCount = 0;
    var count = 0;
    var apiCount = 0;
    var skipCount = 0;

    for (var i = 0; i < total; i++) {
      var it = toImport[i];
      var row = it.rowData;
      var code = it.code;

      setLabel('(' + (i + 1) + '/' + total + ')  ' + code + (it.name ? '  —  ' + it.name : ''));
      setBar(i);

      var exName        = String(colKeys.name        ? row[colKeys.name]        : '').trim();
      var exType        = String(colKeys.type        ? row[colKeys.type]        : '').trim();
      var exBeds        = Number(colKeys.beds        ? row[colKeys.beds]        : 0) || 0;
      var exProvince    = String(colKeys.province    ? row[colKeys.province]    : '').trim();
      var exDistrict    = String(colKeys.district    ? row[colKeys.district]    : '').trim();
      var exTambon      = String(colKeys.tambon      ? row[colKeys.tambon]      : '').trim();
      var exAddress     = String(colKeys.address     ? row[colKeys.address]     : '').trim();
      var exTel         = String(colKeys.tel         ? row[colKeys.tel]         : '').trim();
      var exWebsite     = String(colKeys.website     ? row[colKeys.website]     : '').trim();
      var exAffiliation = String(colKeys.affiliation ? row[colKeys.affiliation] : '').trim();
      var exNote        = String(colKeys.note        ? row[colKeys.note]        : '').trim();

      // ดึงจาก MOPH API ถ้าข้อมูลไม่ครบ
      var api = null;
      if (hasApi && (!exName || !exProvince || !exDistrict)) {
        try { api = await _hspApiLookup(code); } catch(_) {}
        if (api && api._rateLimited) {
          // โดน 429 — หยุดเรียก API ทุก row ที่เหลือ แต่ import ต่อจาก Excel
          addError('⚠️ ถูกจำกัด quota (429) ตั้งแต่รหัส ' + code + ' — รายการที่เหลือใช้ข้อมูลจาก Excel เท่านั้น');
          hasApi = false;
          api = null;
        } else if (api) {
          apiCount++;
        }
      }

      var name = exName || (api && api.name) || '';
      if (!name) {
        var errMsg = 'แถว ' + it.rowNum + '  รหัส ' + code + ': ไม่พบชื่อ รพ.' +
          (!hasApi && !_hspApiRateLimited ? '  (ลองเชื่อมต่อ MOPH API)' : '');
        addError(errMsg);
        skipCount++;
        setStat(count, apiCount, skipCount);
        continue;
      }

      var docId = (!clearFirst && it.existingId) ? it.existingId : uid();
      var data = {
        hospital_id:  docId,
        code,
        name,
        type:        exType        || (api && api.type)        || 'other',
        beds:        exBeds > 0 ? exBeds : ((api && api.beds > 0) ? api.beds : 0),
        province:    exProvince    || (api && api.province)    || '',
        district:    exDistrict    || (api && api.district)    || '',
        tambon:      exTambon      || (api && api.tambon)      || '',
        address:     exAddress     || (api && api.address)     || '',
        tel:         exTel         || (api && api.tel)         || '',
        website:     exWebsite     || (api && api.website)     || '',
        affiliation: exAffiliation || (api && api.affiliation) || '',
        note:        exNote        || '',
      };

      if (!batch) batch = window.writeBatch(db);
      batch.set(getDocRef('HOSPITALS', docId), data);
      batchCount++;
      count++;
      setStat(count, apiCount, skipCount);

      if (batchCount % 400 === 0) { await batch.commit(); batch = null; batchCount = 0; }
    }
    if (batch) await batch.commit();

    setBar(total);
    window._hspImportPending = null;
    finalize(count, apiCount, skipCount, null);

  } catch(err) {
    finalize(0, 0, 0, err.message);
  }
};

// ── HOS CODE LOOKUP — ค้นหาจาก window.HOSPITALS (Firestore realtime) ─────────
// ไม่ต้องโหลดหรือ import เพิ่ม — ใช้ข้อมูลที่ sync จาก Firestore โดยตรง

window.openHspLookup = function() {
  var inp = document.getElementById('hsp-lookup-q');
  var box = document.getElementById('hsp-lookup-result');
  if (inp) inp.value = '';
  if (box) box.innerHTML = _hspLookupPlaceholder();
  window.openM('m-hsp-lookup');
  setTimeout(function(){ if(inp) inp.focus(); }, 200);
};

function _hspLookupPlaceholder() {
  var total = (window.HOSPITALS || []).length;
  if (!total) {
    return '<div style="text-align:center;padding:32px 20px;">' +
      '<div style="font-size:32px;margin-bottom:8px;">🏥</div>' +
      '<div style="font-weight:600;color:var(--txt);margin-bottom:6px;">ยังไม่มีข้อมูลโรงพยาบาลในระบบ</div>' +
      '<div style="font-size:12px;color:var(--txt-muted);">Admin สามารถนำเข้าผ่านปุ่ม 📥 Import Excel</div>' +
    '</div>';
  }
  return '<div style="text-align:center;color:var(--txt-muted);padding:24px;font-size:13px;">' +
    '🔍 พิมพ์รหัส HOS Code หรือชื่อ รพ.<br>' +
    '<span style="font-size:11px;">มีข้อมูล ' + total.toLocaleString() + ' แห่ง</span>' +
  '</div>';
}

window.hspLookupSearch = function() {
  var q   = (document.getElementById('hsp-lookup-q')?.value || '').trim().toLowerCase();
  var box = document.getElementById('hsp-lookup-result');
  if (!box) return;

  var list = window.HOSPITALS || [];

  if (!list.length) { box.innerHTML = _hspLookupPlaceholder(); return; }

  if (q.length < 1) { box.innerHTML = _hspLookupPlaceholder(); return; }

  var hits = list.filter(function(h) {
    return h.code.toLowerCase().includes(q) ||
           h.name.toLowerCase().includes(q) ||
           (h.province || '').toLowerCase().includes(q) ||
           (h.district || '').toLowerCase().includes(q) ||
           (h.affiliation || '').toLowerCase().includes(q);
  }).sort(function(a, b) {
    // exact code match first
    var aEx = a.code.toLowerCase() === q ? 0 : 1;
    var bEx = b.code.toLowerCase() === q ? 0 : 1;
    return aEx - bEx || (a.code || '').localeCompare(b.code || '');
  }).slice(0, 40);

  if (!hits.length) {
    box.innerHTML = '<div style="text-align:center;color:var(--txt-muted);padding:32px;">' +
      'ไม่พบ "' + esc(q) + '"<br><span style="font-size:11px;">ลองค้นหาด้วยรหัสหรือชื่อภาษาไทย</span></div>';
    return;
  }

  box.innerHTML = hits.map(function(h) {
    var t = _hspType(h.type);
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;' +
      'border-bottom:1px solid var(--border);cursor:pointer;transition:background .1s;" ' +
      'onclick="window.openHospitalDetail(\'' + esc(h.id) + '\');window.closeM(\'m-hsp-lookup\');" ' +
      'onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\'">' +
      '<div style="font-family:monospace;font-weight:700;color:var(--primary);white-space:nowrap;min-width:58px;font-size:13px;">' + esc(h.code) + '</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:600;font-size:13px;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(h.name) + '</div>' +
        '<div style="font-size:11px;color:var(--txt-muted);">' +
          esc(h.province || '') +
          (h.district ? ' · ' + esc(h.district) : '') +
          (h.beds ? ' · ' + Number(h.beds).toLocaleString() + ' เตียง' : '') +
          (h.affiliation ? ' · ' + esc(h.affiliation) : '') +
        '</div>' +
      '</div>' +
      '<span style="background:' + t.color + '22;color:' + t.color + ';padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;flex-shrink:0;">' + esc(h.type || '?') + '</span>' +
    '</div>';
  }).join('');
};

// ── SMART CODE AUTOFILL — Live search while typing ───────────────────────────
var _hspCodeTimer = null;

window.hspCodeLiveSearch = function() {
  var code = (document.getElementById('m-hsp-code')?.value || '').trim();
  var status = document.getElementById('m-hsp-code-status');
  var hint   = document.getElementById('m-hsp-code-hint');
  var dd     = document.getElementById('m-hsp-code-dd');

  clearTimeout(_hspCodeTimer);

  if (!code) {
    if (status) status.textContent = '';
    if (hint)   hint.textContent   = '';
    if (dd)     dd.style.display   = 'none';
    return;
  }

  var list = window.HOSPITALS || [];

  // ── 1. ตรวจรหัสตรงทันทีจาก Firestore ──────────────────────────────────
  var exact = list.find(function(h) { return h.code === code; });
  if (exact) {
    _hspCodeFill(exact);
    if (status) status.textContent = '✅';
    if (hint)   hint.innerHTML = '<span style="color:var(--green,#06d6a0);font-weight:600;">✓ ' + esc(exact.name) + '</span>';
    if (dd)     dd.style.display = 'none';
    return;
  }

  // ── 2. แสดง dropdown จาก local + เรียก MOPH API ────────────────────────
  if (status) status.textContent = code.length >= 2 ? '🔍' : '';
  if (hint)   hint.textContent   = '';

  _hspCodeTimer = setTimeout(async function() {
    var hits = list.filter(function(h) {
      return h.code.startsWith(code) ||
             h.name.toLowerCase().includes(code.toLowerCase());
    }).sort(function(a, b) {
      var aStart = a.code.startsWith(code) ? 0 : 1;
      var bStart = b.code.startsWith(code) ? 0 : 1;
      return aStart - bStart || a.code.localeCompare(b.code);
    }).slice(0, 8);

    if (hits.length) {
      _hspRenderCodeDD(hits, code);
      if (dd) dd.style.display = 'block';
    } else if (dd) {
      dd.style.display = 'none';
    }

    // ── 3. รหัสครบ 5 หลัก + ไม่พบ local → ดึงจาก MOPH API ──────────────
    if (code.length >= 5) {
      if (status) status.textContent = '⏳';
      if (hint)   hint.innerHTML = '<span style="color:var(--txt-muted);font-size:11px;">กำลังค้นหาจาก MOPH API...</span>';

      var hasToken = !!(localStorage.getItem(HCODE_REFRESH_KEY) || localStorage.getItem(HCODE_TOKEN_KEY));
      if (!hasToken) {
        if (status) status.textContent = '';
        if (hint) hint.innerHTML =
          '<span style="color:var(--txt-muted);">ไม่พบในระบบ — ' +
          '<a href="#" style="color:var(--primary);" onclick="event.preventDefault();window.openHspApiSettings()">ตั้งค่า MOPH API</a>' +
          ' เพื่อค้นหาจากกระทรวงสาธารณสุข</span>';
        return;
      }

      try {
        var apiResult = await _hspApiLookup(code);
        // ตรวจรหัสใน input ยังตรงกันอยู่ไหม (user อาจเปลี่ยนระหว่างรอ)
        var curCode = (document.getElementById('m-hsp-code')?.value || '').trim();
        if (curCode !== code) return;

        if (apiResult && apiResult._rateLimited) {
          if (status) status.textContent = '⚠️';
          if (hint) hint.innerHTML =
            '<span style="color:#ffa62b;">ถูกจำกัด quota (429) — limit 100 req/hr · ' +
            '<a href="#" style="color:var(--primary);" onclick="event.preventDefault();window.openHspApiSettings()">ดู quota</a></span>';
        } else if (apiResult) {
          if (status) status.textContent = '✅';
          if (hint) hint.innerHTML =
            '<span style="color:#06d6a0;font-weight:600;">✓ พบจาก MOPH: ' + esc(apiResult.name) + '</span>' +
            (apiResult._fromApi ? ' <span style="color:var(--txt-muted);font-size:10px;">(ยังไม่ได้บันทึก)</span>' : '');
          _hspCodeFill(apiResult);
          if (dd) dd.style.display = 'none';
        } else {
          if (status) status.textContent = '❌';
          if (hint) hint.innerHTML = '<span style="color:var(--txt-muted);">ไม่พบรหัส ' + esc(code) + ' ในระบบและ MOPH API</span>';
        }
      } catch(_) {
        if (status) status.textContent = '';
        if (hint) hint.innerHTML = '<span style="color:var(--txt-muted);">ค้นหาจาก MOPH API ไม่สำเร็จ</span>';
      }
    } else if (!hits.length && code.length >= 3) {
      if (hint) hint.innerHTML = '<span style="color:var(--txt-muted);">พิมพ์รหัสให้ครบ 5 หลักเพื่อค้นหาจาก MOPH...</span>';
    }
  }, 300);
};

// render dropdown items
function _hspRenderCodeDD(hits, code) {
  var dd = document.getElementById('m-hsp-code-dd');
  if (!dd) return;
  dd.innerHTML = hits.map(function(h) {
    var t = _hspType(h.type);
    var codeHL = h.code.startsWith(code)
      ? '<b style="color:var(--primary);">' + esc(h.code.slice(0, code.length)) + '</b>' + esc(h.code.slice(code.length))
      : esc(h.code);
    return '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;' +
      'border-bottom:1px solid var(--border);transition:background .1s;" ' +
      'onmousedown="window._hspCodePick(\'' + esc(h.id) + '\')" ' +
      'onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\'">' +
      '<div style="font-family:monospace;font-weight:700;font-size:13px;min-width:60px;white-space:nowrap;">' + codeHL + '</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:600;font-size:13px;color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(h.name) + '</div>' +
        '<div style="font-size:11px;color:var(--txt-muted);">' +
          (h.province ? esc(h.province) : '') +
          (h.district ? ' · ' + esc(h.district) : '') +
          (h.beds ? ' · ' + Number(h.beds).toLocaleString() + ' เตียง' : '') +
        '</div>' +
      '</div>' +
      '<span style="background:' + t.color + '22;color:' + t.color + ';padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;flex-shrink:0;">' + esc(h.type || '?') + '</span>' +
    '</div>';
  }).join('');
}

// เลือก รพ. จาก dropdown → เติมทุกฟิลด์
window._hspCodePick = function(id) {
  var h = (window.HOSPITALS || []).find(function(x) { return x.id === id; });
  if (!h) return;
  document.getElementById('m-hsp-code').value = h.code;
  _hspCodeFill(h);
  var status = document.getElementById('m-hsp-code-status');
  var hint   = document.getElementById('m-hsp-code-hint');
  var dd     = document.getElementById('m-hsp-code-dd');
  if (status) status.textContent = '✅';
  if (hint)   hint.innerHTML = '<span style="color:var(--green,#06d6a0);font-weight:600;">✓ ' + esc(h.name) + '</span>';
  if (dd)     dd.style.display = 'none';
};

// ซ่อน dropdown เมื่อ blur
window._hspCodeHideDD = function() {
  var dd = document.getElementById('m-hsp-code-dd');
  if (dd) dd.style.display = 'none';
};

// เติมฟิลด์ทั้งหมดจากข้อมูล รพ.
function _hspCodeFill(h) {
  document.getElementById('m-hsp-name').value        = h.name        || '';
  document.getElementById('m-hsp-type').value        = h.type        || '';
  document.getElementById('m-hsp-beds').value        = h.beds        || '';
  document.getElementById('m-hsp-province').value    = h.province    || '';
  document.getElementById('m-hsp-district').value    = h.district    || '';
  document.getElementById('m-hsp-tambon').value      = h.tambon      || '';
  document.getElementById('m-hsp-address').value     = h.address     || '';
  document.getElementById('m-hsp-tel').value         = h.tel         || '';
  document.getElementById('m-hsp-website').value     = h.website     || '';
  document.getElementById('m-hsp-affiliation').value = h.affiliation || '';
  document.getElementById('m-hsp-note').value        = h.note        || '';
  window._hspFormProvinceChanged(false);
  window._hspFormDistrictChanged(false);
}

// compat — เก็บไว้ในกรณีที่ code อื่นยังเรียก
window.hspCodeAutofill = window.hspCodeLiveSearch;

// ── POPULATE FILTERS ────────────────────────────────────────────────────────
window._hspPopulateFilters = function() {
  var provSel = document.getElementById('hsp-prov');
  if (!provSel) return;
  var curProv = provSel.value;
  var usedProvs = [...new Set((window.HOSPITALS||[]).map(h=>h.province).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th'));
  provSel.innerHTML = '<option value="">ทุกจังหวัด</option>' +
    usedProvs.map(p => `<option value="${esc(p)}"${p===curProv?' selected':''}>${esc(p)}</option>`).join('');
  _hspUpdateDistrictFilter();

  // single select no longer used — multi-wrap replaces it for all views
  var prods = window.HSP_PRODUCTS || [];
  var prodSel = document.getElementById('hsp-product-filter');
  if (prodSel) prodSel.style.display = 'none';
  var usageSel = document.getElementById('hsp-prod-usage-filter');
  if (usageSel) usageSel.style.display = prods.length ? '' : 'none';
  // rebuild multi-checkbox when in list or analysis mode
  var mode = window._hspViewMode;
  if (mode === 'list' || mode === 'analysis') window._hspBuildProdMulti();
};

// อัปเดต dropdown อำเภอใน toolbar ตามจังหวัดที่เลือก
function _hspUpdateDistrictFilter() {
  var distSel = document.getElementById('hsp-dist');
  if (!distSel) return;
  var prov = document.getElementById('hsp-prov')?.value || '';
  var curDist = distSel.value;
  var dists = [...new Set(
    (window.HOSPITALS || []).filter(h => !prov || h.province === prov)
      .map(h => h.district).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'th'));
  distSel.innerHTML = '<option value="">ทุกอำเภอ</option>' +
    dists.map(d => `<option value="${esc(d)}"${d===curDist?' selected':''}>${esc(d)}</option>`).join('');
}

// Province filter เปลี่ยน → รีเซ็ต district แล้ว render ใหม่
window._hspProvChanged = function() {
  var distSel = document.getElementById('hsp-dist');
  if (distSel) distSel.value = '';
  _hspUpdateDistrictFilter();
  window._hspPage = 1;
  window.renderHospital();
  if (window._hspViewMode === 'analysis')  window.renderHspAnalysis  && window.renderHspAnalysis();
  if (window._hspViewMode === 'dashboard') window.renderHspDashboard && window.renderHspDashboard();
};

window._hspDistChanged = function() {
  window._hspPage = 1;
  window.renderHospital();
  if (window._hspViewMode === 'analysis')  window.renderHspAnalysis  && window.renderHspAnalysis();
  if (window._hspViewMode === 'dashboard') window.renderHspDashboard && window.renderHspDashboard();
};

// ── CASCADE ในฟอร์ม Add/Edit ─────────────────────────────────────────────────

// Province เปลี่ยนใน form → ดึง district datalist + เคลียร์ district/tambon
// clearFields=true เมื่อ user เปลี่ยนจังหวัดใหม่, false เมื่อ load ข้อมูลเดิม
window._hspFormProvinceChanged = function(clearFields) {
  if (clearFields === undefined) clearFields = true;
  var prov = document.getElementById('m-hsp-province')?.value || '';
  var dl = document.getElementById('dl-hsp-district');
  if (dl) {
    var dists = [...new Set(
      (window.HOSPITALS || []).filter(h => h.province === prov)
        .map(h => h.district).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'th'));
    dl.innerHTML = dists.map(d => `<option value="${esc(d)}">`).join('');
  }
  if (clearFields) {
    var distInp = document.getElementById('m-hsp-district');
    if (distInp) distInp.value = '';
    var tambonInp = document.getElementById('m-hsp-tambon');
    if (tambonInp) tambonInp.value = '';
  }
  window._hspFormDistrictChanged(false);
};

// District เปลี่ยนใน form → ดึง tambon datalist
window._hspFormDistrictChanged = function(clearTambon) {
  if (clearTambon === undefined) clearTambon = true;
  var prov = document.getElementById('m-hsp-province')?.value || '';
  var dist = document.getElementById('m-hsp-district')?.value || '';
  var dl = document.getElementById('dl-hsp-tambon');
  if (dl) {
    var tambons = [...new Set(
      (window.HOSPITALS || []).filter(h => (!prov || h.province === prov) && h.district === dist)
        .map(h => h.tambon).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'th'));
    dl.innerHTML = tambons.map(t => `<option value="${esc(t)}">`).join('');
  }
  if (clearTambon) {
    var tambonInp = document.getElementById('m-hsp-tambon');
    if (tambonInp) tambonInp.value = '';
  }
};

// ── AUTO-ENRICH: เติมข้อมูลที่ไม่ครบถ้วนจาก MOPH API ─────────────────────────

// ตรวจว่า รพ. รายนี้ข้อมูลไม่ครบถ้วนหรือไม่
function _hspIsIncomplete(h) {
  return !h.province || !h.district || !h.type || h.type === 'other' ||
         !h.affiliation || !h.beds || !h.tambon;
}

// สร้าง badge แสดง field ที่หายไปของแต่ละ รพ.
function _hspMissingBadges(h) {
  var missing = [];
  if (!h.province || !h.district)    missing.push('ที่ตั้ง');
  if (!h.tambon)                     missing.push('ตำบล');
  if (!h.type || h.type === 'other') missing.push('ระดับ');
  if (!h.affiliation)                missing.push('สังกัด');
  if (!h.beds)                       missing.push('เตียง');
  return missing.map(function(m) {
    return '<span style="background:var(--border);color:var(--txt-muted);font-size:10px;padding:1px 6px;border-radius:8px;margin-right:3px;">' + m + '</span>';
  }).join('');
}

window.openHspAutoEnrich = async function() {
  var body       = document.getElementById('m-hsp-enrich-body');
  var confirmBtn = document.getElementById('m-hsp-enrich-confirm-btn');
  var footNote   = document.getElementById('m-hsp-enrich-foot-note');

  if (body) body.innerHTML = '<div style="padding:32px;text-align:center;color:var(--txt-muted);">⏳ กำลังตรวจสอบ...</div>';
  window.openM('m-hsp-enrich');

  // ── ตรวจสอบ token ────────────────────────────────────────────────────────
  var hasApiStored = !!(localStorage.getItem(HCODE_REFRESH_KEY) || localStorage.getItem(HCODE_TOKEN_KEY));
  if (!hasApiStored) {
    window.closeM('m-hsp-enrich');
    var errBox = document.getElementById('hsp-api-err');
    if (errBox) { errBox.textContent = 'กรุณาเชื่อมต่อ MOPH API ก่อนใช้งานฟีเจอร์เติมข้อมูลอัตโนมัติ'; errBox.style.display = ''; }
    window.openM('m-hsp-api');
    return;
  }

  var token = await _hspGetToken();
  if (!token) {
    window.closeM('m-hsp-enrich');
    var apiStat = document.getElementById('hsp-api-stat');
    if (apiStat) apiStat.innerHTML = '<span style="color:#ffa62b;font-weight:700;">⚠️ Session หมดอายุ — กรุณาล็อกอินใหม่</span>';
    var errBox2 = document.getElementById('hsp-api-err');
    if (errBox2) { errBox2.textContent = 'กรุณาล็อกอินใหม่เพื่อใช้งานฟีเจอร์เติมข้อมูลอัตโนมัติ'; errBox2.style.display = ''; }
    window.openM('m-hsp-api');
    return;
  }

  // ── สแกน รพ. ที่ข้อมูลไม่ครบทั้งหมด ─────────────────────────────────────
  var all = window.HOSPITALS || [];
  window._hspEnrichAllIncomplete = all.filter(function(h) { return h.code && _hspIsIncomplete(h); });

  if (!body) return;

  // render province select + preview (เริ่มต้นทุกจังหวัด)
  var usedProvs = [...new Set(window._hspEnrichAllIncomplete.map(function(h){return h.province;}).filter(Boolean))].sort(function(a,b){return a.localeCompare(b,'th');});
  var provSelectHtml =
    '<div style="padding:12px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
      '<span style="font-size:12px;font-weight:600;color:var(--txt-muted);white-space:nowrap;">เลือกจังหวัด:</span>' +
      '<select id="hsp-enrich-prov" class="t-sel" style="min-width:180px;" onchange="window._hspEnrichRenderPreview(this.value)">' +
        '<option value="">ทุกจังหวัด (' + window._hspEnrichAllIncomplete.length + ' รพ.)</option>' +
        usedProvs.map(function(p) {
          var cnt = window._hspEnrichAllIncomplete.filter(function(h){return h.province===p;}).length;
          return '<option value="' + esc(p) + '">' + esc(p) + ' (' + cnt + ' รพ.)</option>';
        }).join('') +
      '</select>' +
      '<span style="font-size:11px;color:var(--txt-muted);">เติมเฉพาะ field ที่ว่างเท่านั้น · ไม่เขียนทับข้อมูลที่มีอยู่แล้ว</span>' +
    '</div>' +
    '<div id="hsp-enrich-preview"></div>';

  body.innerHTML = provSelectHtml;
  window._hspEnrichRenderPreview('');
};

window._hspEnrichRenderPreview = function(prov) {
  var preview    = document.getElementById('hsp-enrich-preview');
  var confirmBtn = document.getElementById('m-hsp-enrich-confirm-btn');
  var footNote   = document.getElementById('m-hsp-enrich-foot-note');
  if (!preview) return;

  var allInc    = window._hspEnrichAllIncomplete || [];
  var incomplete = prov ? allInc.filter(function(h) { return h.province === prov; }) : allInc;
  var complete   = (window.HOSPITALS || []).length - allInc.length;

  var _q        = _hspApiQuota();
  var remaining = _q.remaining;
  var needCall  = incomplete.filter(function(h) { return _hspApiCache[h.code] === undefined; }).length;
  var fromCache = incomplete.length - needCall;
  var quotaWarn = needCall > remaining;

  window._hspEnrichPending = { incomplete };

  var summaryHtml =
    '<div style="padding:16px 20px;border-bottom:1px solid var(--border);background:var(--bg);">' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;">' +
        '<div style="background:var(--surface);border-radius:10px;padding:10px 16px;flex:1;min-width:90px;text-align:center;">' +
          '<div style="font-size:22px;font-weight:800;color:#ff6b6b;">' + incomplete.length + '</div>' +
          '<div style="font-size:11px;color:var(--txt-muted);">ข้อมูลไม่ครบ</div>' +
        '</div>' +
        '<div style="background:var(--surface);border-radius:10px;padding:10px 16px;flex:1;min-width:90px;text-align:center;">' +
          '<div style="font-size:22px;font-weight:800;color:#06d6a0;">' + complete + '</div>' +
          '<div style="font-size:11px;color:var(--txt-muted);">ครบถ้วนแล้ว</div>' +
        '</div>' +
        '<div style="background:var(--surface);border-radius:10px;padding:10px 16px;flex:1;min-width:90px;text-align:center;">' +
          '<div style="font-size:22px;font-weight:800;color:var(--primary);">' + needCall + '</div>' +
          '<div style="font-size:11px;color:var(--txt-muted);">เรียก API' + (fromCache ? ' (+' + fromCache + ' cache)' : '') + '</div>' +
        '</div>' +
        '<div style="background:var(--surface);border-radius:10px;padding:10px 16px;flex:1;min-width:90px;text-align:center;">' +
          '<div style="font-size:22px;font-weight:800;' + (remaining < 20 ? 'color:#ff6b6b' : remaining < 50 ? 'color:#ffa62b' : 'color:var(--txt)') + ';">' + remaining + '</div>' +
          '<div style="font-size:11px;color:var(--txt-muted);">quota คงเหลือ/hr' + (_q.user ? ' · ' + _q.user : '') + '</div>' +
        '</div>' +
      '</div>' +
      (quotaWarn
        ? '<div style="background:#ffa62b18;border:1px solid #ffa62b44;border-radius:8px;padding:8px 12px;font-size:12px;color:#ffa62b;margin-bottom:8px;">' +
            '⚠️ ต้องการ <b>' + needCall + '</b> req แต่ quota เหลือ <b>' + remaining + '</b> · ระบบจะหยุดเรียก API เมื่อถึงขีดจำกัด' +
          '</div>'
        : '') +
      (incomplete.length === 0
        ? '<div style="color:#06d6a0;font-weight:600;font-size:13px;">✅ ข้อมูลทุกรายการครบถ้วนแล้ว ไม่มีรายการที่ต้องเติม</div>'
        : '') +
    '</div>';

  var tableHtml = '';
  if (incomplete.length > 0) {
    tableHtml =
      '<div style="overflow-x:auto;">' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
      '<thead><tr style="background:var(--bg);color:var(--txt-muted);font-size:11px;text-transform:uppercase;letter-spacing:.4px;position:sticky;top:0;z-index:1;">' +
        '<th style="padding:7px 12px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap;">รหัส</th>' +
        '<th style="padding:7px 12px;text-align:left;border-bottom:1px solid var(--border);">ชื่อโรงพยาบาล</th>' +
        '<th style="padding:7px 12px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap;">จังหวัด</th>' +
        '<th style="padding:7px 12px;text-align:left;border-bottom:1px solid var(--border);">ระดับ</th>' +
      '</tr></thead><tbody>' +
      incomplete.map(function(h) {
        var cached = _hspApiCache[h.code] !== undefined;
        var t = _hspType(h.type);
        return '<tr style="border-bottom:1px solid var(--border);">' +
          '<td style="padding:7px 12px;font-family:monospace;font-weight:700;color:var(--primary);white-space:nowrap;">' +
            esc(h.code) + (cached ? ' <span title="มีใน cache" style="font-size:10px;opacity:.5;">📦</span>' : '') +
          '</td>' +
          '<td style="padding:7px 12px;color:var(--txt);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(h.name) + '</td>' +
          '<td style="padding:7px 12px;color:var(--txt-muted);white-space:nowrap;">' + esc(h.province || '—') + '</td>' +
          '<td style="padding:7px 12px;">' +
            (h.type && h.type !== 'other'
              ? '<span style="background:' + t.color + '22;color:' + t.color + ';padding:1px 7px;border-radius:8px;font-size:11px;font-weight:700;">' + esc(h.type) + '</span>'
              : '<span style="color:var(--txt-muted);font-size:11px;">—</span>') +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  preview.innerHTML = summaryHtml + tableHtml;

  if (confirmBtn) confirmBtn.disabled = incomplete.length === 0;
  if (footNote)   footNote.textContent = incomplete.length > 0 ? 'เติมข้อมูล ' + incomplete.length + ' รายการ' : '';
};

// ── ยืนยัน: รัน enrichment จริง ──────────────────────────────────────────────

window.confirmHspAutoEnrich = async function() {
  var pending = window._hspEnrichPending;
  if (!pending || !pending.incomplete.length) return;

  var incomplete = pending.incomplete;
  var total      = incomplete.length;
  var savedProv  = (document.getElementById('hsp-enrich-prov') || {}).value || '';

  // ── สลับ body → progress view ────────────────────────────────────────────
  var body = document.getElementById('m-hsp-enrich-body');
  var foot = document.getElementById('m-hsp-enrich-foot');

  if (body) {
    body.innerHTML =
      '<div style="padding:24px 20px;">' +
        '<div style="margin-bottom:20px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<span id="_enrich-label" style="font-size:13px;font-weight:600;color:var(--txt);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:12px;">กำลังเตรียมข้อมูล...</span>' +
            '<span id="_enrich-count" style="font-size:12px;color:var(--txt-muted);white-space:nowrap;flex-shrink:0;">0 / ' + total + '</span>' +
          '</div>' +
          '<div style="height:10px;background:var(--border);border-radius:10px;overflow:hidden;">' +
            '<div id="_enrich-bar" style="height:100%;width:0%;background:#06d6a0;border-radius:10px;transition:width .12s;"></div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;">' +
          '<div style="background:var(--bg);border-radius:8px;padding:8px 14px;flex:1;min-width:80px;">' +
            '<div style="font-size:10px;color:var(--txt-muted);margin-bottom:2px;">✅ อัปเดตแล้ว</div>' +
            '<div id="_enrich-ok" style="font-size:20px;font-weight:800;color:#06d6a0;">0</div>' +
          '</div>' +
          '<div style="background:var(--bg);border-radius:8px;padding:8px 14px;flex:1;min-width:80px;">' +
            '<div style="font-size:10px;color:var(--txt-muted);margin-bottom:2px;">📦 จาก Cache</div>' +
            '<div id="_enrich-cache" style="font-size:20px;font-weight:800;color:var(--primary);">0</div>' +
          '</div>' +
          '<div style="background:var(--bg);border-radius:8px;padding:8px 14px;flex:1;min-width:80px;">' +
            '<div style="font-size:10px;color:var(--txt-muted);margin-bottom:2px;">⏭ ข้ามไป</div>' +
            '<div id="_enrich-skip" style="font-size:20px;font-weight:800;color:var(--txt-muted);">0</div>' +
          '</div>' +
          '<div style="background:var(--bg);border-radius:8px;padding:8px 14px;flex:1;min-width:80px;">' +
            '<div style="font-size:10px;color:var(--txt-muted);margin-bottom:2px;">🌐 quota เหลือ</div>' +
            '<div id="_enrich-quota" style="font-size:20px;font-weight:800;color:var(--txt);">' + _hspApiQuota().remaining + '</div>' +
          '</div>' +
        '</div>' +
        '<div id="_enrich-err-wrap" style="display:none;">' +
          '<div style="font-size:11px;font-weight:600;color:#ffa62b;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">รายการที่ไม่พบข้อมูลเพิ่มเติม</div>' +
          '<div id="_enrich-err-list" style="max-height:160px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:4px;font-size:12px;"></div>' +
        '</div>' +
      '</div>';
  }

  if (foot) {
    foot.innerHTML =
      '<div style="flex:1;font-size:12px;color:var(--txt-muted);" id="_enrich-foot-note"></div>' +
      '<button class="btn btn-ghost" id="_enrich-close-btn" disabled onclick="window.closeM(\'m-hsp-enrich\')">ปิด</button>';
  }

  function setLabel(msg)   { var e = document.getElementById('_enrich-label');   if (e) e.textContent = msg; }
  function setBar(done)    {
    var pct = total ? Math.round(done / total * 100) : 100;
    var bar = document.getElementById('_enrich-bar');
    var cnt = document.getElementById('_enrich-count');
    if (bar) bar.style.width = pct + '%';
    if (cnt) cnt.textContent = done + ' / ' + total;
  }
  function setStat(ok, cache, skip) {
    var eOk  = document.getElementById('_enrich-ok');
    var eCa  = document.getElementById('_enrich-cache');
    var eSk  = document.getElementById('_enrich-skip');
    var eQu  = document.getElementById('_enrich-quota');
    if (eOk) eOk.textContent   = ok;
    if (eCa) eCa.textContent   = cache;
    if (eSk) eSk.textContent   = skip;
    var rem = _hspApiQuota().remaining;
    if (eQu) { eQu.textContent = rem; eQu.style.color = rem < 20 ? '#ff6b6b' : rem < 50 ? '#ffa62b' : 'var(--txt)'; }
  }
  function addNote(msg) {
    var wrap = document.getElementById('_enrich-err-wrap');
    var list = document.getElementById('_enrich-err-list');
    if (!list) return;
    if (wrap) wrap.style.display = '';
    var div = document.createElement('div');
    div.style.cssText = 'padding:5px 8px;border-bottom:1px solid var(--border);color:var(--txt-muted);';
    div.textContent = msg;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
  }
  function finalize(ok, cache, skip, rateLimited) {
    var bar = document.getElementById('_enrich-bar');
    if (bar) { bar.style.width = '100%'; bar.style.background = rateLimited ? '#ffa62b' : '#06d6a0'; }
    var txt = 'อัปเดตสำเร็จ ' + ok + ' รายการ';
    if (cache) txt += '  ·  จาก cache ' + cache;
    if (skip)  txt += '  ·  ไม่พบข้อมูล ' + skip;
    if (rateLimited) txt += '  ·  หยุดเพราะ quota หมด';
    setLabel(txt);
    window._hspEnrichPending = null;

    // คืน footer + province selector ให้รันอีกรอบได้
    var foot2 = document.getElementById('m-hsp-enrich-foot');
    if (foot2) {
      foot2.innerHTML =
        '<div style="flex:1;font-size:12px;color:var(--teal);font-weight:600;">' + txt + '</div>' +
        '<button class="btn btn-ghost" onclick="window.closeM(\'m-hsp-enrich\')">ปิด</button>' +
        '<button class="btn btn-teal" id="m-hsp-enrich-confirm-btn" onclick="window.confirmHspAutoEnrich()">🔄 เติมข้อมูลอีกรอบ</button>';
    }
    // ลบเฉพาะรายการที่ถูกอัปเดตจริงๆ (ไม่ลบที่ skip / ไม่พบข้อมูล)
    var remainList = (window._hspEnrichAllIncomplete || []).filter(function(x) {
      return !actuallyUpdated.includes(x.id || x.code);
    });
    window._hspEnrichAllIncomplete = remainList;
    var curProv = savedProv;
    // re-render province select + preview
    var body2 = document.getElementById('m-hsp-enrich-body');
    if (body2) {
      var uProvs = [...new Set(remainList.map(function(h){return h.province;}).filter(Boolean))].sort(function(a,b){return a.localeCompare(b,'th');});
      body2.innerHTML =
        '<div style="padding:12px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
          '<span style="font-size:12px;font-weight:600;color:var(--txt-muted);white-space:nowrap;">เลือกจังหวัด:</span>' +
          '<select id="hsp-enrich-prov" class="t-sel" style="min-width:180px;" onchange="window._hspEnrichRenderPreview(this.value)">' +
            '<option value="">ทุกจังหวัด (' + remainList.length + ' รพ.)</option>' +
            uProvs.map(function(p) {
              var cnt = remainList.filter(function(h){return h.province===p;}).length;
              return '<option value="' + esc(p) + '"' + (p===curProv?' selected':'') + '>' + esc(p) + ' (' + cnt + ' รพ.)</option>';
            }).join('') +
          '</select>' +
          '<span style="font-size:11px;color:var(--txt-muted);">เติมเฉพาะ field ที่ว่างเท่านั้น · ไม่เขียนทับข้อมูลที่มีอยู่แล้ว</span>' +
        '</div>' +
        '<div id="hsp-enrich-preview"></div>';
      window._hspEnrichRenderPreview(curProv);
    }
  }

  try {
    var db             = window.getDb();
    var okCount        = 0;
    var cacheCount     = 0;
    var skipCount      = 0;
    var rateLimited    = false;
    var batch          = null;
    var batchCount     = 0;
    var actuallyUpdated = [];

    for (var i = 0; i < total; i++) {
      var h    = incomplete[i];
      setLabel('(' + (i + 1) + '/' + total + ')  ' + h.code + '  —  ' + h.name);
      setBar(i);
      setStat(okCount, cacheCount, skipCount);

      // ตรวจ rate limit
      if (rateLimited) { skipCount++; addNote(h.code + ' ' + h.name + ': ข้ามเพราะ quota หมด'); continue; }

      var fromCache = _hspApiCache[h.code] !== undefined;
      var api = await _hspApiLookup(h.code);

      if (api && api._rateLimited) {
        rateLimited = true;
        skipCount++;
        addNote(h.code + ' ' + h.name + ': quota หมด (429)');
        setStat(okCount, cacheCount, skipCount);
        continue;
      }

      if (!api) {
        skipCount++;
        addNote(h.code + ' ' + h.name + ': ไม่พบข้อมูลใน MOPH API');
        setStat(okCount, cacheCount, skipCount);
        continue;
      }

      // เติมเฉพาะ field ที่ว่าง
      var updated = Object.assign({}, h);
      var changed = false;
      var _fill = function(field, val) { if (!updated[field] && val) { updated[field] = val; changed = true; } };
      _fill('province',    api.province);
      _fill('district',    api.district);
      _fill('tambon',      api.tambon);
      _fill('address',     api.address);
      _fill('affiliation', api.affiliation);
      if ((!updated.type || updated.type === 'other') && api.type && api.type !== 'other') { updated.type = api.type; changed = true; }
      if ((!updated.beds || updated.beds === 0) && api.beds > 0)                           { updated.beds = api.beds; changed = true; }

      if (changed) {
        // แปลง id กลับเป็น hospital_id field
        var docData = Object.assign({}, updated, { hospital_id: updated.id });
        delete docData.id;

        if (!batch) batch = window.writeBatch(db);
        batch.set(getDocRef('HOSPITALS', updated.id), docData);
        batchCount++;
        if (fromCache) cacheCount++; else okCount++;

        // อัปเดต in-memory ทันที ป้องกันถูกนับซ้ำใน "เติมอีกรอบ"
        Object.assign(h, updated);
        actuallyUpdated.push(h.id || h.code);

        if (batchCount % 400 === 0) { await batch.commit(); batch = null; batchCount = 0; }
      } else {
        skipCount++;
        if (fromCache) cacheCount++;
      }
      setStat(okCount, cacheCount, skipCount);
    }

    if (batch) await batch.commit();
    setBar(total);
    finalize(okCount, cacheCount, skipCount, rateLimited);

  } catch(err) {
    setLabel('เกิดข้อผิดพลาด: ' + err.message);
    var cb2 = document.getElementById('_enrich-close-btn');
    if (cb2) cb2.disabled = false;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
window.HSP_PRODUCTS = window.HSP_PRODUCTS || [];

const HSP_PROD_GROUPS = [
  { id: 'his_front',    label: 'HIS Front Office',  color: '#2563eb' },
  { id: 'his_back',     label: 'HIS Back Office',   color: '#7c3aed' },
  { id: 'interconnect', label: 'Interconnection',   color: '#0891b2' },
  { id: 'application',  label: 'Application',       color: '#059669' },
  { id: 'smart',        label: 'Smart Hospital',    color: '#d97706' },
];

window.openHspProductMgmt = function() {
  window.renderHspProductMgmt();
  // ซ่อน form เพิ่ม/แก้ไข ตอนเปิด
  var editArea = document.getElementById('hsp-prod-edit-area');
  if (editArea) editArea.style.display = 'none';
  document.getElementById('hsp-prod-edit-id') && (document.getElementById('hsp-prod-edit-id').value = '');
  window.openM('m-hsp-products');
};

window.renderHspProductMgmt = function() {
  var body = document.getElementById('hsp-prod-list');
  if (!body) return;
  var prods = window.HSP_PRODUCTS || [];
  if (!prods.length) {
    body.innerHTML = '<div style="text-align:center;color:var(--txt-muted);padding:32px 0;font-size:13px;border:1px dashed var(--border);border-radius:8px;">ยังไม่มี Product · กด ➕ เพิ่มใหม่</div>';
    return;
  }
  var html = '';
  HSP_PROD_GROUPS.forEach(function(g) {
    var gProds = prods.filter(function(p) { return p.group === g.id; });
    if (!gProds.length) return;
    html += '<div style="margin-bottom:12px;">' +
      '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:' + g.color + ';padding:4px 0 6px;border-bottom:2px solid ' + g.color + '33;margin-bottom:4px;">' + esc(g.label) + '</div>' +
      gProds.map(function(p) {
        return '<div style="display:flex;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid var(--border);">' +
          '<span style="width:10px;height:10px;border-radius:50%;background:' + p.color + ';flex-shrink:0;"></span>' +
          '<span style="flex:1;font-size:13px;font-weight:600;color:var(--txt);">' + esc(p.name) + '</span>' +
          (p.note ? '<span style="font-size:11px;color:var(--txt-muted);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(p.note) + '</span>' : '') +
          '<button class="btn btn-ghost btn-sm" onclick="window.openHspProductEdit(\'' + esc(p.id) + '\')" title="แก้ไข">✏️</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="window.deleteHspProduct(\'' + esc(p.id) + '\')" style="color:var(--coral);" title="ลบ">🗑</button>' +
          '</div>';
      }).join('') + '</div>';
  });
  // product ที่ยังไม่ได้กำหนดกลุ่ม
  var noGroup = prods.filter(function(p) { return !HSP_PROD_GROUPS.some(function(g){return g.id===p.group;}); });
  if (noGroup.length) {
    html += '<div style="margin-bottom:12px;">' +
      '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--txt-muted);padding:4px 0 6px;border-bottom:2px solid var(--border);margin-bottom:4px;">ยังไม่ได้กำหนดกลุ่ม</div>' +
      noGroup.map(function(p) {
        return '<div style="display:flex;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid var(--border);">' +
          '<span style="width:10px;height:10px;border-radius:50%;background:' + p.color + ';flex-shrink:0;"></span>' +
          '<span style="flex:1;font-size:13px;font-weight:600;color:var(--txt);">' + esc(p.name) + '</span>' +
          '<button class="btn btn-ghost btn-sm" onclick="window.openHspProductEdit(\'' + esc(p.id) + '\')" title="แก้ไข">✏️</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="window.deleteHspProduct(\'' + esc(p.id) + '\')" style="color:var(--coral);" title="ลบ">🗑</button>' +
          '</div>';
      }).join('') + '</div>';
  }
  body.innerHTML = html || '<div style="text-align:center;color:var(--txt-muted);padding:32px 0;font-size:13px;border:1px dashed var(--border);border-radius:8px;">ยังไม่มี Product · กด ➕ เพิ่มใหม่</div>';
};

window.openHspProductEdit = function(id) {
  var p = id ? (window.HSP_PRODUCTS || []).find(function(x) { return x.id === id; }) : null;
  document.getElementById('hsp-prod-edit-id').value    = id || '';
  document.getElementById('hsp-prod-edit-name').value  = p ? p.name  : '';
  document.getElementById('hsp-prod-edit-color').value = p ? p.color : '#7c3aed';
  document.getElementById('hsp-prod-edit-group').value = p ? p.group : '';
  document.getElementById('hsp-prod-edit-note').value  = p ? p.note  : '';
  var editArea = document.getElementById('hsp-prod-edit-area');
  if (editArea) editArea.style.display = '';
  var nameInput = document.getElementById('hsp-prod-edit-name');
  if (nameInput) nameInput.focus();
};

window.cancelHspProductEdit = function() {
  var editArea = document.getElementById('hsp-prod-edit-area');
  if (editArea) editArea.style.display = 'none';
  document.getElementById('hsp-prod-edit-id').value = '';
};

window.saveHspProduct = async function() {
  var id    = document.getElementById('hsp-prod-edit-id').value;
  var name  = (document.getElementById('hsp-prod-edit-name').value || '').trim();
  var color = document.getElementById('hsp-prod-edit-color').value || '#7c3aed';
  var group = document.getElementById('hsp-prod-edit-group').value || '';
  var note  = (document.getElementById('hsp-prod-edit-note').value || '').trim();
  if (!name)  { window.showAlert('กรุณากรอกชื่อ Product', 'warn');  return; }
  if (!group) { window.showAlert('กรุณาเลือกกลุ่ม Product', 'warn'); return; }
  var pid = id || uid();
  try {
    await window.setDoc(getDocRef('HSP_PRODUCTS', pid), { product_id: pid, name, color, group, note });
    window.cancelHspProductEdit();
    window.showAlert(id ? 'อัปเดต Product แล้ว' : 'เพิ่ม Product แล้ว', 'success');
  } catch(e) {
    window.showAlert('บันทึกไม่สำเร็จ: ' + e.message, 'warn');
  }
};

window.deleteHspProduct = function(id) {
  var p = (window.HSP_PRODUCTS || []).find(function(x) { return x.id === id; });
  if (!p) return;
  window.showConfirm('ลบ Product "' + p.name + '" ?\nข้อมูล รพ. ที่เชื่อมกับ Product นี้จะไม่ถูกลบ', async function() {
    try {
      await window.deleteDoc(getDocRef('HSP_PRODUCTS', id));
      window.showAlert('ลบแล้ว', 'success');
    } catch(e) {
      window.showAlert('ลบไม่สำเร็จ: ' + e.message, 'warn');
    }
  }, { icon: '📦', title: 'ยืนยันลบ Product', okColor: 'var(--coral)', okText: 'ลบ' });
};

// helper: อัพเดท label style เมื่อ toggle checkbox
window._hspProdCbChange = function(cb, color) {
  var label = cb ? cb.closest('label') : null;
  if (!label) return;
  label.style.borderColor = cb.checked ? color : 'var(--border)';
  label.style.background  = cb.checked ? color + '22' : 'var(--bg)';
  // อัพเดท badge จำนวน product ที่เลือก
  var count = document.querySelectorAll('#hsp-products-cb-list .hsp-prod-cb:checked').length;
  var badge = document.getElementById('m-hsp-tab-products-badge');
  if (badge) { badge.textContent = count; badge.style.display = count ? '' : 'none'; }
};

// ─────────────────────────────────────────────────────────────────────────────
// VIEW TOGGLE: รายชื่อ ↔ วิเคราะห์ Product
// ─────────────────────────────────────────────────────────────────────────────
window._hspViewMode = 'dashboard';
window._hspAnalysisTier = '';
window._hspAnalysisPage = 1;
window._hspAnalysisLastFilter = '';
var HSP_ANALYSIS_PAGE_SIZE = 100;

window.goHspView = function(mode) {
  window._hspViewMode = mode;
  var listArea  = document.getElementById('hsp-list-area');
  var dashArea  = document.getElementById('hsp-dashboard-area');
  var analyArea = document.getElementById('hsp-analysis-area');
  var tabList   = document.getElementById('hsp-vtab-list');
  var tabDash   = document.getElementById('hsp-vtab-dashboard');
  var tabAnaly  = document.getElementById('hsp-vtab-analysis');
  if (listArea)  listArea.style.display  = mode === 'list'      ? '' : 'none';
  if (dashArea)  dashArea.style.display  = mode === 'dashboard' ? '' : 'none';
  if (analyArea) analyArea.style.display = mode === 'analysis'  ? '' : 'none';
  [['list', tabList], ['dashboard', tabDash], ['analysis', tabAnaly]].forEach(function(p) {
    if (!p[1]) return;
    var active = mode === p[0];
    p[1].style.color            = active ? 'var(--violet)' : 'var(--txt-muted)';
    p[1].style.borderBottomColor = active ? 'var(--violet)' : 'transparent';
  });
  var multiWrap  = document.getElementById('hsp-prod-multi-wrap');
  var singleSel  = document.getElementById('hsp-product-filter');
  var usageSel   = document.getElementById('hsp-prod-usage-filter');

  var hasProds = (window.HSP_PRODUCTS||[]).length > 0;
  if (mode === 'list') {
    if (multiWrap) window._hspBuildProdMulti();
    if (singleSel) singleSel.style.display = 'none';
    if (usageSel)  usageSel.style.display = hasProds ? '' : 'none';
    window.renderHospital();
  }
  if (mode === 'analysis') {
    if (multiWrap) window._hspBuildProdMulti();
    if (singleSel) singleSel.style.display = 'none';
    if (usageSel)  usageSel.style.display = hasProds ? '' : 'none';
    window._hspPopulateFilters();
    window.renderHspAnalysis();
  }
  if (mode === 'dashboard') {
    if (multiWrap) multiWrap.style.display = 'none';
    if (singleSel) singleSel.style.display = 'none';
    window.renderHspDashboard();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ANALYSIS VIEW
// ─────────────────────────────────────────────────────────────────────────────

function _hspCalcTier(h, prods) {
  var hProdIds = h.products || [];
  var hasGroup = function(gid) {
    return prods.some(function(p) { return p.group === gid && hProdIds.includes(p.id); });
  };
  var hasFront = hasGroup('his_front');
  var hasBack  = hasGroup('his_back');
  var hasIC    = hasGroup('interconnect');
  var hasApp   = hasGroup('application');
  var hasSmart = hasGroup('smart');
  if (!hProdIds.length)                                   return { tier: 4, label: 'Tier 4', color: '#6b7280', desc: 'ยังไม่มี Product' };
  if (hasFront && hasBack && hasIC && hasApp && hasSmart) return { tier: 0, label: 'Full',   color: '#059669', desc: 'ครบทุกกลุ่ม' };
  if (hasFront && !hasBack)                               return { tier: 1, label: 'Tier 1', color: '#dc2626', desc: 'มี HIS Front ขาด Back Office' };
  if ((hasFront || hasBack) && !hasIC)                    return { tier: 2, label: 'Tier 2', color: '#d97706', desc: 'มี HIS ขาด Interconnection' };
  if (hasFront && hasBack && (!hasApp || !hasSmart))      return { tier: 3, label: 'Tier 3', color: '#2563eb', desc: 'พร้อม Upsell Digital' };
  return { tier: 3, label: 'Tier 3', color: '#2563eb', desc: 'มีโอกาสต่อยอด' };
}

window.renderHspAnalysis = function() {
  var body = document.getElementById('hsp-analysis-body');
  if (!body) return;
  var prods       = window.HSP_PRODUCTS || [];
  var hosps       = window.HOSPITALS    || [];
  var filterProds = window._hspSelectedProds || [];
  var filterTier  = window._hspAnalysisTier || '';
  var filterProv  = (document.getElementById('hsp-prov')  || {}).value || '';
  var filterDist  = (document.getElementById('hsp-dist')  || {}).value || '';
  var filterQ     = ((document.getElementById('hsp-q')    || {}).value || '').trim().toLowerCase();
  var filterType  = (document.getElementById('hsp-type')  || {}).value || '';

  if (!prods.length) {
    body.innerHTML = '<div style="text-align:center;color:var(--txt-muted);padding:64px 24px;font-size:14px;">ยังไม่มี Product ในระบบ<br><span style="font-size:12px;">ไปที่ Admin Panel → Product เพื่อเพิ่ม</span></div>';
    return;
  }

  var totalHosps   = hosps.length;
  var withProd     = hosps.filter(function(h) { return (h.products||[]).length > 0; }).length;
  var tier4Count   = hosps.filter(function(h) { return (h.products||[]).length === 0; }).length;
  var filled       = hosps.reduce(function(s,h) { return s + (h.products||[]).length; }, 0);
  var whitespace   = totalHosps * prods.length - filled;
  var topWS        = prods.reduce(function(mx, p) {
    var miss = hosps.filter(function(h) { return !(h.products||[]).includes(p.id); }).length;
    return miss > mx.miss ? { p: p, miss: miss } : mx;
  }, { p: prods[0], miss: -1 });

  // ── KPI CARDS ──────────────────────────────────────────────────────────────
  function kpiCard(label, val, unit, color) {
    return '<div style="background:var(--surface);border:1px solid var(--border);border-top:3px solid ' + color + ';border-radius:12px;padding:14px 16px;">' +
      '<div style="font-size:11px;color:var(--txt-muted);margin-bottom:6px;">' + label + '</div>' +
      '<div style="font-size:22px;font-weight:800;color:' + color + ';line-height:1.1;">' + val + '</div>' +
      (unit ? '<div style="font-size:11px;color:var(--txt-muted);margin-top:3px;">' + unit + '</div>' : '') +
      '</div>';
  }
  var pct = totalHosps ? Math.round(withProd / totalHosps * 100) : 0;
  var kpiHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px;">' +
    kpiCard('🏥 โรงพยาบาลทั้งหมด', totalHosps, 'รพ.', 'var(--primary)') +
    kpiCard('✅ มี Product แล้ว', withProd + ' (' + pct + '%)', 'จาก ' + totalHosps + ' รพ.', 'var(--teal)') +
    kpiCard('❌ ยังไม่มี Product', tier4Count, 'รพ. (Tier 4)', '#dc2626') +
    kpiCard('📦 Whitespace Slots', whitespace, 'โอกาสการขายรวม', 'var(--violet)') +
    kpiCard('🎯 Top Whitespace', topWS.p ? esc(topWS.p.name) : '—', topWS.p ? topWS.miss + ' รพ. ยังไม่ใช้' : '', topWS.p ? topWS.p.color : 'var(--txt-muted)') +
    '</div>';

  // ── PENETRATION BARS ───────────────────────────────────────────────────────
  var penetHtml = '<div style="margin-bottom:24px;">' +
    '<div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:12px;">📊 Product Penetration Rate</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;">';
  HSP_PROD_GROUPS.forEach(function(grp) {
    var grpProds = prods.filter(function(p) { return p.group === grp.id; });
    if (!grpProds.length) return;
    penetHtml += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;">' +
      '<div style="font-size:11px;font-weight:700;color:' + grp.color + ';text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">' + esc(grp.label) + '</div>';
    grpProds.forEach(function(p) {
      var haveN = hosps.filter(function(h) { return (h.products||[]).includes(p.id); }).length;
      var barPct = totalHosps ? Math.round(haveN / totalHosps * 100) : 0;
      penetHtml += '<div style="margin-bottom:7px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">' +
        '<span style="font-size:12px;color:var(--txt);">' + esc(p.name) + '</span>' +
        '<span style="font-size:11px;font-weight:700;color:' + p.color + ';">' + barPct + '% · ' + haveN + ' รพ.</span></div>' +
        '<div style="background:var(--border);border-radius:4px;height:7px;overflow:hidden;">' +
        '<div style="width:' + barPct + '%;background:' + p.color + ';height:100%;border-radius:4px;"></div></div></div>';
    });
    penetHtml += '</div>';
  });
  penetHtml += '</div></div>';

  // ── TIER SUMMARY (clickable filter) ────────────────────────────────────────
  var tierDefs = [
    { tier: 1, label: 'Tier 1',    sublabel: 'Quick Win',      color: '#dc2626', desc: 'มี HIS Front ขาด Back Office',   icon: '🔴' },
    { tier: 2, label: 'Tier 2',    sublabel: 'Strategic',      color: '#d97706', desc: 'มี HIS ขาด Interconnection',      icon: '🟠' },
    { tier: 3, label: 'Tier 3',    sublabel: 'Upsell',         color: '#2563eb', desc: 'พร้อม Upsell Digital',             icon: '🔵' },
    { tier: 4, label: 'Tier 4',    sublabel: 'New Land',       color: '#6b7280', desc: 'ยังไม่มี Product',                  icon: '⚫' },
    { tier: 0, label: 'Full',      sublabel: 'Full Coverage',  color: '#059669', desc: 'ครบทุกกลุ่ม',                      icon: '🟢' },
  ];
  var tierCounts = {};
  hosps.forEach(function(h) { var t = _hspCalcTier(h, prods).tier; tierCounts[t] = (tierCounts[t]||0)+1; });

  var tierHtml = '<div style="margin-bottom:24px;">' +
    '<div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:12px;">🎯 Customer Segmentation by Tier <span style="font-size:11px;font-weight:400;color:var(--txt-muted);">(คลิกเพื่อกรอง)</span></div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:10px;">' +
    tierDefs.map(function(td) {
      var cnt = tierCounts[td.tier] || 0;
      var isAct = filterTier === String(td.tier);
      return '<div onclick="window._hspAnalysisTier=window._hspAnalysisTier===\'' + td.tier + '\'?\'\':\'' + td.tier + '\';window.renderHspAnalysis();" ' +
        'style="background:var(--surface);border:2px solid ' + (isAct ? td.color : 'var(--border)') + ';border-radius:12px;padding:12px 16px;min-width:120px;cursor:pointer;transition:border .15s;' + (isAct ? 'background:' + td.color + '18;' : '') + '">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">' +
        '<span style="font-size:16px;">' + td.icon + '</span>' +
        '<span style="font-size:13px;font-weight:800;color:' + td.color + ';">' + td.label + '</span>' +
        '<span style="font-size:10px;font-weight:600;color:var(--txt-muted);">— ' + td.sublabel + '</span></div>' +
        '<div style="font-size:24px;font-weight:900;color:' + td.color + ';line-height:1.1;">' + cnt + '</div>' +
        '<div style="font-size:10px;color:var(--txt-muted);margin-top:3px;">' + esc(td.desc) + '</div></div>';
    }).join('') + '</div></div>';

  // ── FILTERED TABLE ─────────────────────────────────────────────────────────
  var prodUsage = (document.getElementById('hsp-prod-usage-filter') || {}).value || '';
  var showHosps = hosps;
  if (filterProv) showHosps = showHosps.filter(function(h) { return h.province === filterProv; });
  if (filterDist) showHosps = showHosps.filter(function(h) { return h.district === filterDist; });
  if (filterType) showHosps = showHosps.filter(function(h) { return (h.level||h.type||'') === filterType; });
  if (filterQ)    showHosps = showHosps.filter(function(h) { return (h.name||'').toLowerCase().includes(filterQ) || (h.code||'').toLowerCase().includes(filterQ) || (h.district||'').toLowerCase().includes(filterQ); });
  if (filterTier) showHosps = showHosps.filter(function(h) { return String(_hspCalcTier(h, prods).tier) === filterTier; });
  if (filterProds.length) showHosps = showHosps.filter(function(h) { return filterProds.every(function(id){ return (h.products||[]).includes(id); }); });
  if (prodUsage === 'has')  showHosps = showHosps.filter(function(h) { return (h.products||[]).length > 0; });
  if (prodUsage === 'none') showHosps = showHosps.filter(function(h) { return !(h.products||[]).length; });

  // ── PAGINATION: reset to page 1 เมื่อ filter เปลี่ยน ─────────────────────
  var filterKey = [filterProds.join(','), filterTier, filterProv, filterDist, filterQ, filterType, prodUsage].join('|');
  if (filterKey !== window._hspAnalysisLastFilter) {
    window._hspAnalysisPage = 1;
    window._hspAnalysisLastFilter = filterKey;
  }
  var totalItems = showHosps.length;
  var totalPages = Math.max(1, Math.ceil(totalItems / HSP_ANALYSIS_PAGE_SIZE));
  var curPage    = Math.min(Math.max(1, window._hspAnalysisPage), totalPages);
  window._hspAnalysisPage = curPage;
  var pageHosps  = showHosps.slice((curPage - 1) * HSP_ANALYSIS_PAGE_SIZE, curPage * HSP_ANALYSIS_PAGE_SIZE);

  var selProdNames = filterProds.map(function(id){ return (prods.find(function(p){return p.id===id;})||{}).name||id; });

  var ctxParts = [];
  if (filterTier) { var td2 = tierDefs.find(function(x){return String(x.tier)===filterTier;}); if(td2) ctxParts.push(td2.label + ' — ' + td2.sublabel); }
  if (filterProv) ctxParts.push(filterProv);
  if (filterDist) ctxParts.push(filterDist);
  if (filterQ)    ctxParts.push('"' + filterQ + '"');
  if (selProdNames.length) ctxParts.push('มี ' + selProdNames.map(esc).join(' / '));
  var ctxStr = ctxParts.length ? ' <span style="font-size:11px;color:var(--txt-muted);font-weight:400;">· ' + ctxParts.join(' · ') + '</span>' : '';

  var rangeStart = totalItems ? (curPage - 1) * HSP_ANALYSIS_PAGE_SIZE + 1 : 0;
  var rangeEnd   = Math.min(curPage * HSP_ANALYSIS_PAGE_SIZE, totalItems);
  var rangeText  = totalItems ? (rangeStart + '–' + rangeEnd + ' จาก ' + totalItems) : '0';

  var tableTitle = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">' +
    '<div style="font-size:13px;font-weight:700;color:var(--txt);">📋 รายชื่อ รพ. ตามเงื่อนไข' + ctxStr + '</div>' +
    '<span style="font-size:12px;color:var(--txt-muted);margin-left:4px;">(' + rangeText + ' รายการ)</span>' +
    '<button class="btn btn-ghost btn-sm" onclick="window._hspExportAnalysis()" style="margin-left:auto;" title="Export CSV">⬇️ Export CSV</button>' +
    '</div>';

  if (!showHosps.length) {
    body.innerHTML = kpiHtml + penetHtml + tierHtml + tableTitle +
      '<div style="text-align:center;color:var(--teal);padding:32px 24px;font-size:14px;font-weight:700;border:1px solid var(--teal)44;border-radius:12px;background:var(--teal)11;">✅ ไม่มี รพ. ที่ตรงเงื่อนไขนี้</div>';
    return;
  }

  var GRP_ABBR = { his_front:'F', his_back:'B', interconnect:'I', application:'A', smart:'S' };

  // ── HOSPITAL CARDS ─────────────────────────────────────────────────────────
  var cardsHtml = pageHosps.map(function(h, idx) {
    var ti     = _hspCalcTier(h, prods);
    var hProds = h.products || [];
    var rowNum = rangeStart + idx;
    var htype  = _hspType(h.type);

    // ── Header ──
    var tierBadge = '<span style="background:' + ti.color + '22;color:' + ti.color + ';padding:3px 10px;border-radius:8px;font-size:11px;font-weight:800;white-space:nowrap;">' + ti.label + '</span>';
    var typeBadge = h.type
      ? '<span style="background:' + htype.color + '22;color:' + htype.color + ';padding:2px 7px;border-radius:6px;font-size:10px;font-weight:700;white-space:nowrap;">' + esc(h.type) + '</span>'
      : '';
    var locStr = [h.province, h.district].filter(Boolean).map(esc).join(' · ');

    var header = '<div style="display:flex;align-items:center;gap:7px;padding:9px 14px;border-bottom:1px solid var(--border);background:var(--bg);flex-wrap:wrap;">' +
      '<span style="font-size:10px;color:var(--txt-muted);min-width:20px;text-align:right;">' + rowNum + '</span>' +
      tierBadge +
      '<span style="font-family:monospace;color:var(--primary);font-size:12px;font-weight:700;">' + esc(h.code||'—') + '</span>' +
      '<span style="font-weight:600;color:var(--txt);font-size:13px;flex:1;min-width:150px;">' + esc(h.name) + '</span>' +
      (locStr ? '<span style="font-size:11px;color:var(--txt-muted);margin-left:auto;white-space:nowrap;">' + locStr + '</span>' : '') +
      '</div>';

    // ── Section 1: ข้อมูล รพ. ──
    var infoRows = '';
    if (h.type)     infoRows += '<div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;"><span style="color:var(--txt-muted);font-size:11px;min-width:40px;">ประเภท</span>' + typeBadge + '</div>';
    if (h.province) infoRows += '<div style="display:flex;gap:5px;margin-bottom:4px;"><span style="color:var(--txt-muted);font-size:11px;min-width:40px;">จังหวัด</span><span style="color:var(--txt);font-size:11px;font-weight:500;">' + esc(h.province) + '</span></div>';
    if (h.district) infoRows += '<div style="display:flex;gap:5px;margin-bottom:4px;"><span style="color:var(--txt-muted);font-size:11px;min-width:40px;">อำเภอ</span><span style="color:var(--txt);font-size:11px;">' + esc(h.district) + '</span></div>';
    if (h.beds)     infoRows += '<div style="display:flex;gap:5px;"><span style="color:var(--txt-muted);font-size:11px;min-width:40px;">เตียง</span><span style="color:var(--txt);font-size:11px;">' + Number(h.beds).toLocaleString() + ' เตียง</span></div>';
    var sec1 = '<div style="padding:12px 14px;border-right:1px solid var(--border);">' +
      '<div style="font-size:10px;font-weight:700;color:var(--txt-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">🏥 ข้อมูล รพ.</div>' +
      (infoRows || '<span style="color:var(--txt-muted);font-size:11px;">—</span>') +
      '</div>';

    // ── Section 2: ข้อมูล Product ──
    var groupDots = HSP_PROD_GROUPS.map(function(grp) {
      var hasGrp = prods.some(function(p){ return p.group === grp.id && hProds.includes(p.id); });
      var abbr = GRP_ABBR[grp.id] || grp.id[0].toUpperCase();
      return '<span title="' + esc(grp.label) + '" style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:5px;font-size:10px;font-weight:900;margin-right:3px;' +
        (hasGrp ? 'background:' + grp.color + ';color:#fff;' : 'background:var(--bg);border:1.5px solid var(--border);color:var(--txt-muted);') +
        '">' + abbr + '</span>';
    }).join('');
    var showProdsObjs = prods.filter(function(p){ return hProds.includes(p.id); });
    var prodChips = showProdsObjs.length
      ? showProdsObjs.map(function(p){
          return '<span style="background:' + p.color + '18;color:' + p.color + ';border:1px solid ' + p.color + '44;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;white-space:nowrap;display:inline-block;margin:2px 2px 0 0;">' + esc(p.name) + '</span>';
        }).join('')
      : '<span style="color:var(--txt-muted);font-size:11px;font-style:italic;">— ยังไม่มี Product</span>';
    var sec2 = '<div style="padding:12px 14px;border-right:1px solid var(--border);">' +
      '<div style="font-size:10px;font-weight:700;color:var(--txt-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">📦 ข้อมูล Product</div>' +
      '<div style="margin-bottom:7px;">' + groupDots + '</div>' +
      '<div style="line-height:1.7;">' + prodChips + '</div>' +
      '</div>';

    // ── Section 3: กลุ่มที่ขาด (แสดงเสมอตาม product group) ──
    var missing = HSP_PROD_GROUPS.filter(function(grp){
      return !prods.some(function(p){ return p.group === grp.id && hProds.includes(p.id); });
    });
    var sec3Content = missing.length === 0
      ? '<span style="color:var(--teal);font-size:12px;font-weight:700;">ครบทุกกลุ่ม ✅</span>'
      : missing.map(function(grp){
          return '<span style="background:' + grp.color + '18;color:' + grp.color + ';border:1px solid ' + grp.color + '55;padding:3px 11px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;display:inline-block;margin:2px;">' + esc(grp.label) + '</span>';
        }).join('');
    var sec3 = '<div style="padding:12px 14px;">' +
      '<div style="font-size:10px;font-weight:700;color:var(--txt-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">⚠️ กลุ่มที่ขาด</div>' +
      '<div style="line-height:1.8;">' + sec3Content + '</div>' +
      '</div>';

    return '<div style="border:1px solid var(--border);border-left:3px solid ' + ti.color + ';border-radius:12px;overflow:hidden;margin-bottom:10px;background:var(--surface);cursor:pointer;transition:box-shadow .15s;" onclick="window.openHospitalDetail(\'' + esc(h.id) + '\')" onmouseover="this.style.boxShadow=\'0 2px 14px rgba(0,0,0,.09)\'" onmouseout="this.style.boxShadow=\'\'">' +
      header +
      '<div style="display:grid;grid-template-columns:minmax(150px,1fr) minmax(180px,2fr) minmax(160px,1.5fr);">' +
      sec1 + sec2 + sec3 +
      '</div></div>';
  }).join('');

  // ── PAGINATION CONTROLS ────────────────────────────────────────────────────
  function _pagBtn(n, label, active, disabled) {
    var base = 'display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:32px;padding:0 8px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid;transition:all .12s;font-family:inherit;';
    if (disabled) return '<button disabled style="' + base + 'border-color:var(--border);background:var(--bg);color:var(--txt-muted);cursor:not-allowed;opacity:.4;">' + label + '</button>';
    if (active)   return '<button style="' + base + 'border-color:var(--violet);background:var(--violet);color:#fff;" onclick="window._hspAnalysisGoPage(' + n + ')">' + label + '</button>';
    return '<button style="' + base + 'border-color:var(--border);background:var(--bg);color:var(--txt2);" onclick="window._hspAnalysisGoPage(' + n + ')" onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'var(--bg)\'">' + label + '</button>';
  }

  var pagParts = [];
  pagParts.push(_pagBtn(curPage - 1, '← ก่อนหน้า', false, curPage <= 1));

  var pageNums = [];
  if (totalPages <= 7) {
    for (var pi = 1; pi <= totalPages; pi++) pageNums.push(pi);
  } else {
    pageNums.push(1);
    if (curPage > 3) pageNums.push('…');
    for (var pi = Math.max(2, curPage - 1); pi <= Math.min(totalPages - 1, curPage + 1); pi++) pageNums.push(pi);
    if (curPage < totalPages - 2) pageNums.push('…');
    pageNums.push(totalPages);
  }
  pageNums.forEach(function(pn) {
    if (pn === '…') {
      pagParts.push('<span style="display:inline-flex;align-items:center;padding:0 4px;color:var(--txt-muted);font-size:13px;">…</span>');
    } else {
      pagParts.push(_pagBtn(pn, pn, pn === curPage, false));
    }
  });

  pagParts.push(_pagBtn(curPage + 1, 'ถัดไป →', false, curPage >= totalPages));

  var paginationHtml = totalPages > 1
    ? '<div style="display:flex;align-items:center;justify-content:center;gap:4px;padding:16px 0 4px;flex-wrap:wrap;">'
      + pagParts.join('') + '</div>'
    : '';

  body.innerHTML = kpiHtml + penetHtml + tierHtml + tableTitle + cardsHtml + paginationHtml;
};

window._hspAnalysisGoPage = function(n) {
  window._hspAnalysisPage = n;
  window.renderHspAnalysis();
  // เลื่อน scroll ไปที่ส่วนรายชื่อ รพ.
  var body = document.getElementById('hsp-analysis-body');
  if (body) {
    var firstCard = body.querySelector('[onclick*="openHospitalDetail"]');
    if (firstCard) firstCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

// Export analysis table to CSV
window._hspExportAnalysis = function() {
  var prods       = window.HSP_PRODUCTS || [];
  var hosps       = window.HOSPITALS    || [];
  var filterProds = window._hspSelectedProds || [];
  var filterTier  = window._hspAnalysisTier || '';
  var filterProv  = (document.getElementById('hsp-prov')  || {}).value || '';
  var filterDist  = (document.getElementById('hsp-dist')  || {}).value || '';
  var filterQ     = ((document.getElementById('hsp-q')    || {}).value || '').trim().toLowerCase();
  var filterType  = (document.getElementById('hsp-type')  || {}).value || '';

  var rows = hosps;
  if (filterProv) rows = rows.filter(function(h){ return h.province === filterProv; });
  if (filterDist) rows = rows.filter(function(h){ return h.district === filterDist; });
  if (filterType) rows = rows.filter(function(h){ return (h.level||h.type||'') === filterType; });
  if (filterQ)    rows = rows.filter(function(h){ return (h.name||'').toLowerCase().includes(filterQ)||(h.code||'').toLowerCase().includes(filterQ); });
  if (filterTier) rows = rows.filter(function(h){ return String(_hspCalcTier(h, prods).tier) === filterTier; });
  if (filterProds.length) rows = rows.filter(function(h){ return filterProds.every(function(id){ return (h.products||[]).includes(id); }); });

  var showProds = filterProds.length ? prods.filter(function(p){ return filterProds.includes(p.id); }) : prods;
  var headers   = ['Tier', 'รหัส', 'ชื่อ รพ.', 'จังหวัด', 'อำเภอ', 'Product Count'].concat(showProds.map(function(p){ return p.name; }));
  var csvRows   = [headers.join(',')];
  rows.forEach(function(h) {
    var ti  = _hspCalcTier(h, prods);
    var row = [
      ti.label,
      '"' + (h.code||'').replace(/"/g,'""') + '"',
      '"' + (h.name||'').replace(/"/g,'""') + '"',
      '"' + (h.province||'').replace(/"/g,'""') + '"',
      '"' + (h.district||'').replace(/"/g,'""') + '"',
      (h.products||[]).length,
    ].concat(showProds.map(function(p){ return (h.products||[]).includes(p.id) ? '1' : '0'; }));
    csvRows.push(row.join(','));
  });
  var blob = new Blob(['\uFEFF' + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url; a.download = 'hospital_analysis.csv'; a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
};

// ─────────────────────────────────────────────────────────────────────────────
// HOSPITAL PRODUCTS IMPORT
// ─────────────────────────────────────────────────────────────────────────────

window.downloadHospitalProductsTemplate = function() {
  var prods = window.HSP_PRODUCTS || [];
  if (!prods.length) { window.showAlert('ยังไม่มี Product ในระบบ กรุณาเพิ่ม Product ก่อน', 'warn'); return; }

  var wb = XLSX.utils.book_new();
  var headers = ['hospital_code', 'hospital_name'].concat(prods.map(function(p){ return p.name; }));

  var hosps = (window.HOSPITALS || []).slice(0, 10);
  var dataRows = hosps.map(function(h) {
    return [h.code, h.name].concat(prods.map(function(p){
      return (h.products || []).includes(p.id) ? 'Y' : 'N';
    }));
  });
  if (!dataRows.length) {
    dataRows.push(['10669', ''].concat(prods.map(function(){ return 'N'; })));
    dataRows.push(['10710', ''].concat(prods.map(function(){ return 'N'; })));
  }

  var ws = XLSX.utils.aoa_to_sheet([headers].concat(dataRows));
  ws['!cols'] = [{wch:14},{wch:36}].concat(prods.map(function(){ return {wch:12}; }));
  XLSX.utils.book_append_sheet(wb, ws, 'Products รพ.');

  var guide = [
    ['=== คู่มือนำเข้า Products โรงพยาบาล ==='],
    [''],
    ['คอลัมน์', 'คำอธิบาย', 'ค่าที่รองรับ', 'จำเป็น'],
    ['hospital_code', 'รหัสสถานพยาบาล', '10669, 10710 ...', '✅'],
    ['hospital_name', 'ชื่อ รพ. (ใช้อ้างอิงเท่านั้น ไม่ถูกนำเข้า)', '—', '—'],
    ['[ชื่อ Product]', 'แต่ละ Product = 1 คอลัมน์', 'Y / N', '—'],
    [''],
    ['ค่าที่ถือว่า "ใช้งาน":', 'Y, YES, TRUE, 1, ✓, มี, ใช้'],
    ['ค่าอื่นๆ ถือว่า "ไม่ใช้งาน"'],
    [''],
    ['หมายเหตุ:'],
    ['• ระบบอัปเดตเฉพาะ รพ. ที่อยู่ในไฟล์ (รพ. ที่ไม่ได้ระบุจะไม่ถูกแก้ไข)'],
    ['• ชื่อ Product ต้องตรงกับชื่อในระบบ (Template นี้ generate ให้อัตโนมัติแล้ว)'],
    ['• ค่า Y/N แต่ละแถวจะ "แทนที่" products ของ รพ. นั้นทั้งหมด'],
  ];
  var ws2 = XLSX.utils.aoa_to_sheet(guide);
  ws2['!cols'] = [{wch:20},{wch:50},{wch:26},{wch:8}];
  XLSX.utils.book_append_sheet(wb, ws2, 'คำแนะนำ');

  XLSX.writeFile(wb, 'Template_HOSPITAL_PRODUCTS.xlsx');
};

window._hspProdImportPending = null;

window.importHospitalProductsFromFile = async function(file) {
  try {
    var ab = await file.arrayBuffer();
    var wb = XLSX.read(ab);
    var ws = wb.Sheets[wb.SheetNames[0]];
    var rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rows.length) { window.showAlert('ไม่พบข้อมูลในไฟล์', 'warn'); return; }

    var allProds  = window.HSP_PRODUCTS || [];
    var hospitals = window.HOSPITALS || [];
    var headers   = Object.keys(rows[0]);

    var skipCols = ['hospital_code','รหัสสถานพยาบาล','รหัส','code','hcode',
                    'hospital_name','ชื่อโรงพยาบาล','ชื่อ','name'];

    var colCode = headers.find(function(h) {
      return ['hospital_code','รหัสสถานพยาบาล','รหัส','code','hcode'].indexOf(h.trim().toLowerCase()) >= 0;
    }) || headers[0];

    // map คอลัมน์ → product id
    var prodCols = {};
    headers.forEach(function(h) {
      if (skipCols.indexOf(h.trim().toLowerCase()) >= 0) return;
      var p = allProds.find(function(p){ return p.name.trim().toLowerCase() === h.trim().toLowerCase(); });
      if (p) prodCols[h] = p.id;
    });

    if (!Object.keys(prodCols).length) {
      window.showAlert(
        'ไม่พบคอลัมน์ชื่อ Product ที่ตรงกับระบบ\n'
        + 'ใช้ปุ่ม "โหลดไฟล์ Template" เพื่อรับไฟล์ที่มีชื่อคอลัมน์ถูกต้อง', 'warn');
      return;
    }

    var TRUTHY = ['y','yes','true','1','✓','มี','ใช้'];
    var items = [];
    rows.forEach(function(row, i) {
      var code = String(row[colCode] || '').trim();
      if (!code) return;
      var h = hospitals.find(function(x){ return x.code === code; });
      var newProdIds = Object.keys(prodCols).filter(function(col){
        return TRUTHY.indexOf(String(row[col] || '').trim().toLowerCase()) >= 0;
      }).map(function(col){ return prodCols[col]; });

      items.push({
        rowNum:   i + 2,
        code,
        hospName: h ? h.name : null,
        hospId:   h ? h.id   : null,
        oldProds: h ? (h.products || []) : [],
        newProds: newProdIds,
        status:   !h ? 'not_found' : 'update',
      });
    });

    if (!items.length) { window.showAlert('ไม่พบแถวข้อมูล', 'warn'); return; }

    window._hspProdImportPending = { items, prodCols, fileName: file.name };
    _hspShowProdImportPreview();

  } catch(err) {
    window.showAlert('อ่านไฟล์ไม่สำเร็จ: ' + err.message, 'warn');
  }
};

function _hspShowProdImportPreview() {
  var pending = window._hspProdImportPending;
  if (!pending) return;
  var items    = pending.items;
  var prodCols = pending.prodCols;
  var fileName = pending.fileName;

  var found    = items.filter(function(e){ return e.status !== 'not_found'; });
  var notFound = items.filter(function(e){ return e.status === 'not_found'; });
  var prodCount = Object.keys(prodCols).length;

  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';

  var tableRows = found.map(function(e){
    var changed = JSON.stringify(e.oldProds.slice().sort()) !== JSON.stringify(e.newProds.slice().sort());
    return '<tr style="border-top:1px solid var(--border);' + (changed ? '' : 'opacity:.55;') + '">'
      + '<td style="padding:5px 10px;font-family:monospace;font-size:11px;color:var(--txt3);">' + esc(e.code) + '</td>'
      + '<td style="padding:5px 10px;font-weight:600;font-size:12px;">' + esc(e.hospName || '') + '</td>'
      + '<td style="padding:5px 10px;text-align:center;color:var(--txt3);font-size:12px;">' + e.oldProds.length + '</td>'
      + '<td style="padding:5px 10px;text-align:center;font-weight:700;font-size:12px;color:' + (changed ? 'var(--teal)' : 'var(--txt3)') + ';">' + e.newProds.length + '</td>'
      + '</tr>';
  }).join('');

  var notFoundHtml = notFound.length
    ? '<div style="margin-top:10px;padding:9px 13px;background:rgba(255,107,107,.08);border:1px solid #ff6b6b44;border-radius:8px;font-size:11px;">'
      + '<span style="color:var(--coral);font-weight:700;">ไม่พบในระบบ (จะข้าม): </span>'
      + notFound.map(function(e){ return esc(e.code); }).join(', ')
      + '</div>'
    : '';

  ov.innerHTML = '<div style="background:var(--surface);border-radius:16px;padding:0;max-width:560px;width:100%;box-shadow:0 12px 48px rgba(0,0,0,.3);border:1px solid var(--border);overflow:hidden;">'
    + '<div style="padding:20px 24px 14px;border-bottom:1px solid var(--border);">'
      + '<div style="font-size:22px;margin-bottom:6px;">📦</div>'
      + '<div style="font-size:15px;font-weight:700;color:var(--txt);">ยืนยันนำเข้า Products</div>'
      + '<div style="font-size:11px;color:var(--txt3);margin-top:2px;">' + esc(fileName) + '</div>'
    + '</div>'
    + '<div style="padding:16px 24px;">'
      + '<div style="display:flex;gap:14px;margin-bottom:14px;flex-wrap:wrap;">'
        + '<div style="background:var(--surface2);border-radius:10px;padding:10px 16px;flex:1;min-width:100px;text-align:center;">'
          + '<div style="font-size:10px;color:var(--txt3);text-transform:uppercase;font-weight:700;">Product</div>'
          + '<div style="font-size:18px;font-weight:800;color:var(--violet);">' + prodCount + '</div>'
        + '</div>'
        + '<div style="background:var(--surface2);border-radius:10px;padding:10px 16px;flex:1;min-width:100px;text-align:center;">'
          + '<div style="font-size:10px;color:var(--txt3);text-transform:uppercase;font-weight:700;">จะอัปเดต</div>'
          + '<div style="font-size:18px;font-weight:800;color:var(--teal);">' + found.length + ' รพ.</div>'
        + '</div>'
        + (notFound.length ? '<div style="background:rgba(255,107,107,.1);border-radius:10px;padding:10px 16px;flex:1;min-width:100px;text-align:center;">'
          + '<div style="font-size:10px;color:var(--coral);text-transform:uppercase;font-weight:700;">ไม่พบ</div>'
          + '<div style="font-size:18px;font-weight:800;color:var(--coral);">' + notFound.length + ' รพ.</div>'
        + '</div>' : '')
      + '</div>'
      + (found.length ? '<div style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;margin-bottom:10px;">'
        + '<table style="width:100%;border-collapse:collapse;">'
        + '<thead><tr style="background:var(--surface2);position:sticky;top:0;">'
          + '<th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:700;color:var(--txt3);">รหัส</th>'
          + '<th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:700;color:var(--txt3);">ชื่อ รพ.</th>'
          + '<th style="padding:6px 10px;text-align:center;font-size:11px;font-weight:700;color:var(--txt3);">เดิม</th>'
          + '<th style="padding:6px 10px;text-align:center;font-size:11px;font-weight:700;color:var(--txt3);">ใหม่</th>'
        + '</tr></thead><tbody>' + tableRows + '</tbody></table>'
        + '</div>' : '')
      + notFoundHtml
    + '</div>'
    + '<div style="padding:14px 24px 20px;display:flex;gap:10px;justify-content:flex-end;border-top:1px solid var(--border);">'
      + '<button id="_hprod-cancel" style="padding:9px 20px;background:var(--surface2);color:var(--txt2);border:1px solid var(--border);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">ยกเลิก</button>'
      + (found.length ? '<button id="_hprod-ok" style="padding:9px 20px;background:var(--teal);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">✅ นำเข้า ' + found.length + ' รพ.</button>' : '')
    + '</div>'
  + '</div>';

  ov.querySelector('#_hprod-cancel').onclick = function(){ ov.remove(); };
  var okBtn = ov.querySelector('#_hprod-ok');
  if (okBtn) {
    okBtn.onclick = function() {
      ov.remove();
      window._execHspProdImport();
    };
  }
  ov.addEventListener('click', function(e){ if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}


// ── DASHBOARD VIEW ──────────────────────────────────────────────────────────
var _hspDashCharts = {};

var _HSP_REGIONS = {
  'ภาคเหนือ':               { color:'#4cc9f0', provinces:['เชียงราย','เชียงใหม่','น่าน','พะเยา','แพร่','แม่ฮ่องสอน','ลำปาง','ลำพูน','กำแพงเพชร','ตาก','นครสวรรค์','พิจิตร','พิษณุโลก','เพชรบูรณ์','สุโขทัย','อุตรดิตถ์','อุทัยธานี'] },
  'ภาคกลาง':                { color:'#7c5cfc', provinces:['กรุงเทพมหานคร','นครนายก','นครปฐม','นนทบุรี','ปทุมธานี','พระนครศรีอยุธยา','สมุทรปราการ','สมุทรสงคราม','สมุทรสาคร','อ่างทอง','ชัยนาท','ลพบุรี','สระบุรี','สิงห์บุรี','สุพรรณบุรี','กาญจนบุรี','ประจวบคีรีขันธ์','เพชรบุรี','ราชบุรี'] },
  'ภาคตะวันออก':            { color:'#06d6a0', provinces:['จันทบุรี','ฉะเชิงเทรา','ชลบุรี','ตราด','ปราจีนบุรี','ระยอง','สระแก้ว'] },
  'ภาคตะวันออกเฉียงเหนือ': { color:'#ffa62b', provinces:['กาฬสินธุ์','ขอนแก่น','ชัยภูมิ','นครพนม','นครราชสีมา','บึงกาฬ','บุรีรัมย์','มหาสารคาม','มุกดาหาร','ยโสธร','ร้อยเอ็ด','เลย','ศรีสะเกษ','สกลนคร','สุรินทร์','หนองคาย','หนองบัวลำภู','อำนาจเจริญ','อุดรธานี','อุบลราชธานี'] },
  'ภาคใต้':                 { color:'#f72585', provinces:['กระบี่','ชุมพร','ตรัง','นครศรีธรรมราช','นราธิวาส','ปัตตานี','พังงา','พัทลุง','ภูเก็ต','ยะลา','ระนอง','สงขลา','สตูล','สุราษฎร์ธานี'] },
};

// ── DASHBOARD HELPERS ────────────────────────────────────────────────────────

// แสดง popup รายชื่อ รพ. จาก filter
window._hspDashPopup = function(title, filter) {
  var all = window.HOSPITALS || [];
  var list = all.filter(function(h) {
    if (filter.type      && h.type     !== filter.type)      return false;
    if (filter.province  && h.province !== filter.province)  return false;
    if (filter.provinces && filter.provinces.indexOf(h.province) < 0) return false;
    if (filter.affil) {
      var a = (h.affiliation || '').trim().toLowerCase();
      if (a !== filter.affil.toLowerCase()) return false;
    }
    return true;
  }).sort(function(a,b){ return (a.code||'').localeCompare(b.code||'','th'); });

  var rows = list.map(function(h) {
    var t = HSP_TYPE_MAP[h.type] || HSP_TYPE_MAP['other'];
    return '<tr onclick="window.openHospitalDetail(\'' + esc(h.id) + '\')" style="cursor:pointer;border-bottom:1px solid var(--border);transition:background .12s;" onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\'">'
      + '<td style="padding:8px 12px;font-family:monospace;font-weight:700;color:var(--primary);font-size:12px;white-space:nowrap;">' + esc(h.code) + '</td>'
      + '<td style="padding:8px 12px;font-weight:500;color:var(--txt);">' + esc(h.name) + '</td>'
      + '<td style="padding:8px 12px;text-align:center;"><span style="background:' + t.color + '22;color:' + t.color + ';padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700;">' + esc(h.type||'?') + '</span></td>'
      + '<td style="padding:8px 12px;color:var(--txt-muted);font-size:12px;white-space:nowrap;">' + esc(h.province||'—') + '</td>'
      + '<td style="padding:8px 12px;color:var(--txt-muted);font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(h.affiliation||'—') + '</td>'
      + '</tr>';
  }).join('');

  var ov = document.createElement('div');
  ov.className = 'hsp-dash-popup-ov';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:48px 16px 24px;overflow-y:auto;';
  ov.innerHTML = ''
    + '<div style="background:var(--surface);border-radius:16px;width:100%;max-width:820px;box-shadow:0 20px 60px rgba(0,0,0,.3);display:flex;flex-direction:column;max-height:80vh;">'
      + '<div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">'
        + '<div>'
          + '<div style="font-size:15px;font-weight:700;color:var(--txt);">' + esc(title) + '</div>'
          + '<div style="font-size:12px;color:var(--txt-muted);margin-top:2px;">' + list.length.toLocaleString() + ' โรงพยาบาล</div>'
        + '</div>'
        + '<button class="hsp-dash-popup-close" style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:6px 14px;cursor:pointer;font-size:13px;color:var(--txt);font-family:inherit;">✕ ปิด</button>'
      + '</div>'
      + '<div style="overflow-y:auto;flex:1;">'
        + (rows
          ? '<table style="width:100%;border-collapse:collapse;">'
              + '<thead style="position:sticky;top:0;background:var(--surface);z-index:1;">'
                + '<tr style="border-bottom:2px solid var(--border);">'
                  + '<th style="padding:7px 12px;text-align:left;font-size:10px;color:var(--txt-muted);font-weight:700;text-transform:uppercase;">รหัส</th>'
                  + '<th style="padding:7px 12px;text-align:left;font-size:10px;color:var(--txt-muted);font-weight:700;text-transform:uppercase;">ชื่อโรงพยาบาล</th>'
                  + '<th style="padding:7px 12px;text-align:center;font-size:10px;color:var(--txt-muted);font-weight:700;text-transform:uppercase;">ระดับ</th>'
                  + '<th style="padding:7px 12px;text-align:left;font-size:10px;color:var(--txt-muted);font-weight:700;text-transform:uppercase;">จังหวัด</th>'
                  + '<th style="padding:7px 12px;text-align:left;font-size:10px;color:var(--txt-muted);font-weight:700;text-transform:uppercase;">สังกัด</th>'
                + '</tr>'
              + '</thead>'
              + '<tbody>' + rows + '</tbody>'
            + '</table>'
          : '<div style="text-align:center;color:var(--txt-muted);padding:48px;">ไม่พบข้อมูล</div>')
      + '</div>'
    + '</div>';

  ov.querySelector('.hsp-dash-popup-close').onclick = function(){ ov.remove(); };
  ov.addEventListener('click', function(e){ if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
};

// popup ภาค → แสดงจังหวัด → คลิกจังหวัด → popup รพ.
window._hspDashRegionPopup = function(regionName) {
  var rdef = _HSP_REGIONS[regionName];
  if (!rdef) return;
  var all  = window.HOSPITALS || [];
  var byP  = {};
  all.forEach(function(h) {
    var p = (h.province||'').trim();
    if (rdef.provinces.indexOf(p) >= 0) byP[p] = (byP[p]||0) + 1;
  });
  var provList = rdef.provinces.filter(function(p){ return byP[p]; })
    .map(function(p){ return { name:p, count:byP[p]||0 }; })
    .sort(function(a,b){ return b.count - a.count; });
  var maxP = provList.length ? provList[0].count : 1;
  var total = provList.reduce(function(s,p){ return s+p.count; }, 0);

  var cards = provList.map(function(pv) {
    var w = Math.round(pv.count/maxP*100);
    return '<div onclick="window._hspDashPopup(\'' + esc(pv.name) + ' (' + pv.count + ' แห่ง)\',{province:\'' + esc(pv.name) + '\'})"'
      + ' style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px;cursor:pointer;transition:background .12s;"'
      + ' onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'var(--surface)\'">'
      + '<div style="font-size:13px;font-weight:600;color:var(--txt);margin-bottom:6px;">' + esc(pv.name) + '</div>'
      + '<div style="font-size:20px;font-weight:800;color:' + rdef.color + ';">' + pv.count.toLocaleString() + '</div>'
      + '<div style="background:' + rdef.color + '25;border-radius:3px;height:5px;margin-top:8px;">'
        + '<div style="background:' + rdef.color + ';border-radius:3px;height:5px;width:' + w + '%;"></div>'
      + '</div>'
      + '</div>';
  }).join('');

  var ov = document.createElement('div');
  ov.className = 'hsp-dash-popup-ov';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:48px 16px 24px;overflow-y:auto;';
  ov.innerHTML = ''
    + '<div style="background:var(--surface);border-radius:16px;width:100%;max-width:640px;box-shadow:0 20px 60px rgba(0,0,0,.3);">'
      + '<div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">'
        + '<div>'
          + '<div style="font-size:15px;font-weight:700;color:var(--txt);">🗺️ ' + esc(regionName) + '</div>'
          + '<div style="font-size:12px;color:var(--txt-muted);margin-top:2px;">' + total.toLocaleString() + ' โรงพยาบาล · ' + provList.length + ' จังหวัด · คลิกจังหวัดเพื่อดูรายชื่อ</div>'
        + '</div>'
        + '<button class="hsp-dash-popup-close" style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:6px 14px;cursor:pointer;font-size:13px;color:var(--txt);font-family:inherit;">✕ ปิด</button>'
      + '</div>'
      + '<div style="padding:20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;">'
        + cards
      + '</div>'
    + '</div>';

  ov.querySelector('.hsp-dash-popup-close').onclick = function(){ ov.remove(); };
  ov.addEventListener('click', function(e){ if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
};

window.renderHspDashboard = function() {
  var body = document.getElementById('hsp-dashboard-body');
  if (!body) return;

  var hosps = window.HOSPITALS || [];
  if (!hosps.length) {
    body.innerHTML = '<div style="text-align:center;color:var(--txt-muted);padding:64px 24px;">ยังไม่มีข้อมูลโรงพยาบาล</div>';
    return;
  }

  Object.keys(_hspDashCharts).forEach(function(k){ try { _hspDashCharts[k].destroy(); } catch(_){} });
  _hspDashCharts = {};

  // ── aggregate ──────────────────────────────────────────────────────────────
  var withProd = 0, withContact = 0;
  var byType = {}, byProv = {}, byAffil = {};

  hosps.forEach(function(h) {
    if ((h.products || []).length) withProd++;
    if ((h.contacts || []).length) withContact++;

    var t = h.type || 'other';
    if (!byType[t]) byType[t] = { count:0 };
    byType[t].count++;

    var p = (h.province   || '').trim() || '(ไม่ระบุ)';
    if (!byProv[p])  byProv[p]  = { count:0 };
    byProv[p].count++;

    var a = (h.affiliation || '').trim() || '(ไม่ระบุ)';
    if (!byAffil[a]) byAffil[a] = { count:0 };
    byAffil[a].count++;
  });

  // regional
  var byRegion = {};
  Object.keys(_HSP_REGIONS).forEach(function(rn) {
    byRegion[rn] = { count:0, color:_HSP_REGIONS[rn].color };
  });
  hosps.forEach(function(h) {
    var p = (h.province || '').trim();
    Object.keys(_HSP_REGIONS).forEach(function(rn) {
      if (_HSP_REGIONS[rn].provinces.indexOf(p) >= 0) byRegion[rn].count++;
    });
  });

  var typeSorted  = HSP_TYPES.filter(function(t){ return byType[t.id]; })
    .map(function(t){ return Object.assign({}, t, byType[t.id]); });
  var provSorted  = Object.keys(byProv).map(function(k){ return { name:k, count:byProv[k].count }; })
    .sort(function(a,b){ return b.count - a.count; });
  var affilSorted = Object.keys(byAffil).map(function(k){ return { name:k, count:byAffil[k].count }; })
    .sort(function(a,b){ return b.count - a.count; });

  var provCount = Object.keys(byProv).filter(function(p){ return p !== '(ไม่ระบุ)'; }).length;
  var penetPct  = hosps.length ? Math.round(withProd / hosps.length * 100) : 0;
  var maxType   = typeSorted.length  ? typeSorted[0].count  : 1;
  var maxProv   = provSorted.length  ? provSorted[0].count  : 1;
  var maxAffil  = affilSorted.length ? affilSorted[0].count : 1;
  var maxRegion = Math.max.apply(null, Object.keys(byRegion).map(function(rn){ return byRegion[rn].count; }).concat([1]));

  function miniBar(val, max, color) {
    var w = max ? Math.round(val / max * 100) : 0;
    return '<div style="background:' + color + '28;border-radius:3px;height:6px;min-width:50px;flex:1;">'
      + '<div style="background:' + color + ';border-radius:3px;height:6px;width:' + w + '%;"></div></div>';
  }

  function kpiCard(icon, label, val, sub, color) {
    return '<div style="background:var(--surface);border:1px solid var(--border);border-top:3px solid ' + color + ';border-radius:12px;padding:14px 18px;min-width:0;">'
      + '<div style="font-size:10px;color:var(--txt-muted);margin-bottom:4px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;">' + icon + ' ' + label + '</div>'
      + '<div style="font-size:22px;font-weight:800;color:' + color + ';line-height:1.1;">' + val + '</div>'
      + (sub ? '<div style="font-size:11px;color:var(--txt-muted);margin-top:3px;">' + sub + '</div>' : '')
      + '</div>';
  }

  var html = '';

  // 1. KPI
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:18px;">'
    + kpiCard('🏥','โรงพยาบาลรวม',  hosps.length.toLocaleString(),              'แห่ง',   '#7c5cfc')
    + kpiCard('📍','ครอบคลุมจังหวัด',provCount + ' / 77',                       'จังหวัด','#4cc9f0')
    + kpiCard('📦','มี Product',      withProd + ' (' + penetPct + '%)',          'แห่ง',   '#ffa62b')
    + kpiCard('👤','มีผู้ติดต่อ',      withContact.toLocaleString(),              'แห่ง',  '#f72585')
    + '</div>';

  // 2. Level + Region
  html += '<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:16px;">';

  // Level card — full-width bar table (cleaner, no donut)
  var typeRows = typeSorted.map(function(t) {
    var pct = hosps.length ? Math.round(t.count / hosps.length * 100) : 0;
    var barW = maxType ? Math.round(t.count / maxType * 100) : 0;
    var shortLabel = t.label.replace(/^[A-Za-z0-9]+\s*–\s*/, '').replace(/\s*\(.*?\)\s*$/, '').trim();
    var popCall = 'window._hspDashPopup(\'' + esc(t.id) + ' – ' + esc(shortLabel) + ' (' + t.count + ' แห่ง)\',{type:\'' + t.id + '\'})';
    return '<tr onclick="' + popCall + '" style="cursor:pointer;transition:background .15s;border-bottom:1px solid var(--border);" '
      + 'onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\'">'
      + '<td style="padding:9px 8px 9px 0;">'
        + '<span style="display:inline-block;background:' + t.color + '20;color:' + t.color + ';padding:3px 9px;border-radius:6px;font-size:11px;font-weight:800;letter-spacing:.2px;">' + esc(t.id) + '</span>'
      + '</td>'
      + '<td style="padding:9px 10px;font-size:11px;color:var(--txt-muted);white-space:nowrap;">' + esc(shortLabel) + '</td>'
      + '<td style="padding:9px 6px;">'
        + '<div style="background:' + t.color + '20;border-radius:4px;height:12px;overflow:hidden;">'
          + '<div style="background:' + t.color + ';border-radius:4px;height:12px;width:' + barW + '%;"></div>'
        + '</div>'
      + '</td>'
      + '<td style="padding:9px 0 9px 10px;text-align:right;font-size:14px;font-weight:800;color:var(--txt);white-space:nowrap;">' + t.count.toLocaleString() + '</td>'
      + '<td style="padding:9px 0 9px 6px;text-align:right;font-size:10px;color:var(--txt-muted);white-space:nowrap;">' + pct + '%</td>'
      + '</tr>';
  }).join('');

  html += '<div style="flex:1 1 380px;min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px;overflow:hidden;">';
  html += '<div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:16px;">🏷️ แยกตามระดับ รพ. <span style="font-size:10px;font-weight:400;color:var(--txt-muted);">คลิกเพื่อดูรายชื่อ</span></div>';
  html += '<table style="width:100%;border-collapse:collapse;table-layout:fixed;">'
    + '<colgroup><col style="width:50px;"><col style="width:115px;"><col><col style="width:50px;"><col style="width:36px;"></colgroup>'
    + '<tbody>' + typeRows + '</tbody></table>';
  html += '</div>';

  // Region card — horizontal bar chart (Chart.js, each bar in region colour)
  var regionNames = Object.keys(byRegion);
  var regionChartH = Math.max(190, regionNames.length * 44) + 'px';
  html += '<div style="flex:1 1 300px;min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px;">';
  html += '<div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:14px;">🗺️ แยกตามภาค <span style="font-size:10px;font-weight:400;color:var(--txt-muted);">คลิกเพื่อดูรายชื่อ</span></div>';
  html += '<div style="position:relative;height:' + regionChartH + ';"><canvas id="hsp-dash-region-chart"></canvas></div>';
  html += '</div>';
  html += '</div>'; // end row 2

  // 3. Province + Affiliation charts
  var provTop  = provSorted.slice(0, 15);
  var affilTop = affilSorted.slice(0, 12);
  var provH    = Math.max(280, provTop.length * 22) + 'px';
  var affilH   = Math.max(240, affilTop.length * 24) + 'px';

  function expandRows(items, maxCount, color, filterKey) {
    return items.map(function(item) {
      var popCall = filterKey === 'province'
        ? 'window._hspDashPopup(\'' + esc(item.name) + ' (' + item.count + ' แห่ง)\',{province:\'' + esc(item.name) + '\'})'
        : 'window._hspDashPopup(\'' + esc(item.name) + ' (' + item.count + ' แห่ง)\',{affil:\'' + esc(item.name) + '\'})';
      var pct = maxCount ? Math.round(item.count / maxCount * 100) : 0;
      return '<tr onclick="' + popCall + '" style="cursor:pointer;border-bottom:1px solid var(--border)22;transition:background .1s;" onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\'">'
        + '<td style="padding:5px 8px;color:var(--txt);font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(item.name) + '">' + esc(item.name) + '</td>'
        + '<td style="padding:5px 8px;text-align:right;font-weight:700;font-size:12px;white-space:nowrap;">' + item.count.toLocaleString() + '</td>'
        + '<td style="padding:5px 8px;width:80px;">' + miniBar(item.count, maxCount, color) + '</td>'
        + '<td style="padding:5px 8px;font-size:10px;color:var(--txt-muted);white-space:nowrap;">' + pct + '%</td>'
        + '</tr>';
    }).join('');
  }

  html += '<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:8px;">';

  // Province
  html += '<div style="flex:1 1 340px;min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px;">';
  html += '<div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:14px;">📍 แยกตามจังหวัด'
    + ' <span style="font-size:10px;font-weight:400;color:var(--txt-muted);">Top ' + provTop.length + ' · คลิกเพื่อดูรายชื่อ</span></div>';
  html += '<div style="position:relative;height:' + provH + ';"><canvas id="hsp-dash-prov-chart"></canvas></div>';
  if (provSorted.length > provTop.length) {
    html += '<details style="margin-top:12px;">'
      + '<summary style="font-size:11px;color:var(--txt-muted);cursor:pointer;padding:4px 0;user-select:none;">&#9658; ดูทั้งหมด ' + provSorted.length + ' จังหวัด</summary>'
      + '<div style="max-height:240px;overflow-y:auto;margin-top:8px;">'
      + '<table style="width:100%;border-collapse:collapse;"><tbody>'
      + expandRows(provSorted, maxProv, '#4cc9f0', 'province')
      + '</tbody></table></div></details>';
  }
  html += '</div>';

  // Affiliation
  html += '<div style="flex:1 1 300px;min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px;">';
  html += '<div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:14px;">🏢 แยกตามสังกัด'
    + ' <span style="font-size:10px;font-weight:400;color:var(--txt-muted);">Top ' + affilTop.length + ' · คลิกเพื่อดูรายชื่อ</span></div>';
  html += '<div style="position:relative;height:' + affilH + ';"><canvas id="hsp-dash-affil-chart"></canvas></div>';
  if (affilSorted.length > affilTop.length) {
    html += '<details style="margin-top:12px;">'
      + '<summary style="font-size:11px;color:var(--txt-muted);cursor:pointer;padding:4px 0;user-select:none;">&#9658; ดูทั้งหมด ' + affilSorted.length + ' สังกัด</summary>'
      + '<div style="max-height:240px;overflow-y:auto;margin-top:8px;">'
      + '<table style="width:100%;border-collapse:collapse;"><tbody>'
      + expandRows(affilSorted, maxAffil, '#06d6a0', 'affil')
      + '</tbody></table></div></details>';
  }
  html += '</div>';
  html += '</div>'; // end row 3

  body.innerHTML = html;

  if (!window.Chart) return;

  // Region bar chart (horizontal, each bar in region colour, click → region popup)
  (function() {
    var ctx = document.getElementById('hsp-dash-region-chart');
    if (!ctx) return;
    var rNames = Object.keys(byRegion);
    _hspDashCharts.region = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: rNames,
        datasets: [{
          data:            rNames.map(function(rn){ return byRegion[rn].count; }),
          backgroundColor: rNames.map(function(rn){ return byRegion[rn].color + 'bb'; }),
          borderColor:     rNames.map(function(rn){ return byRegion[rn].color; }),
          borderWidth: 1, borderRadius: 6, borderSkipped: false,
        }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function(c){
            var pct = hosps.length ? Math.round(c.raw / hosps.length * 100) : 0;
            return ' ' + c.raw.toLocaleString() + ' แห่ง (' + pct + '%)';
          }}},
        },
        scales: {
          x: { beginAtZero:true, ticks:{ precision:0, font:{size:10} }, grid:{ color:'rgba(0,0,0,.04)' } },
          y: { ticks:{ font:{ size:11 }, color: function(ctx) {
            return byRegion[rNames[ctx.index]] ? byRegion[rNames[ctx.index]].color : undefined;
          }}},
        },
        onClick: function(e, items) {
          if (!items.length) return;
          var rn = rNames[items[0].index];
          if (rn) window._hspDashRegionPopup(rn);
        },
        onHover: function(e, items) { e.native.target.style.cursor = items.length ? 'pointer' : 'default'; },
      },
    });
  })();

  // Province bar (horizontal, click → popup)
  (function() {
    var ctx = document.getElementById('hsp-dash-prov-chart');
    if (!ctx) return;
    _hspDashCharts.prov = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: provTop.map(function(p){ return p.name; }),
        datasets: [{
          data:            provTop.map(function(p){ return p.count; }),
          backgroundColor: '#4cc9f0bb', borderColor: '#4cc9f0', borderWidth:1, borderRadius:4,
        }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function(c){ return ' ' + c.raw.toLocaleString() + ' แห่ง'; }}},
        },
        scales: {
          x: { beginAtZero:true, ticks:{ precision:0, font:{size:10} }, grid:{ color:'rgba(0,0,0,.04)' } },
          y: { ticks:{ font:{size:11} } },
        },
        onClick: function(e, items) {
          if (!items.length) return;
          var pv = provTop[items[0].index];
          if (pv) window._hspDashPopup(pv.name + ' (' + pv.count + ' แห่ง)', { province: pv.name });
        },
        onHover: function(e, items) { e.native.target.style.cursor = items.length ? 'pointer' : 'default'; },
      },
    });
  })();

  // Affiliation bar (horizontal, click → popup)
  (function() {
    var ctx = document.getElementById('hsp-dash-affil-chart');
    if (!ctx) return;
    _hspDashCharts.affil = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: affilTop.map(function(a){ return a.name; }),
        datasets: [{
          data:            affilTop.map(function(a){ return a.count; }),
          backgroundColor: '#06d6a0bb', borderColor: '#06d6a0', borderWidth:1, borderRadius:4,
        }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function(c){ return ' ' + c.raw.toLocaleString() + ' แห่ง'; }}},
        },
        scales: {
          x: { beginAtZero:true, ticks:{ precision:0, font:{size:10} }, grid:{ color:'rgba(0,0,0,.04)' } },
          y: { ticks:{ font:{size:11}, callback: function(val){
            var label = this.getLabelForValue(val);
            return label && label.length > 20 ? label.slice(0,18) + '…' : label;
          }}},
        },
        onClick: function(e, items) {
          if (!items.length) return;
          var a = affilTop[items[0].index];
          if (a) window._hspDashPopup(a.name + ' (' + a.count + ' แห่ง)', { affil: a.name });
        },
        onHover: function(e, items) { e.native.target.style.cursor = items.length ? 'pointer' : 'default'; },
      },
    });
  })();
};




window._execHspProdImport = async function() {
  var pending = window._hspProdImportPending;
  if (!pending) return;
  var toUpdate = pending.items.filter(function(e){ return e.status !== 'not_found' && e.hospId; });
  if (!toUpdate.length) { window.showAlert('ไม่มีรายการที่จะอัปเดต', 'warn'); return; }

  try {
    var db    = window.getDb();
    var batch = window.writeBatch(db);
    var count = 0;

    for (var i = 0; i < toUpdate.length; i++) {
      var e = toUpdate[i];
      batch.update(getDocRef('HOSPITALS', e.hospId), { products: e.newProds });
      count++;
      if (count % 400 === 0) {
        await batch.commit();
        batch = window.writeBatch(db);
      }
    }
    if (count % 400 !== 0) await batch.commit();

    window._hspProdImportPending = null;
    window.showAlert('อัปเดต Products สำเร็จ ' + toUpdate.length + ' โรงพยาบาล', 'success');
  } catch(err) {
    window.showAlert('เกิดข้อผิดพลาด: ' + err.message, 'warn');
  }
};