/**
 * chat-import.util.js — นำเข้าแชท LINE ให้ AI แยกเป็นรายการ แล้วตรวจทานก่อนบันทึก
 * ใช้ร่วมกัน: ศูนย์ช่วยเหลือ "วางแชท LINE" (→ Ticket) · ติดตามสถานะโครงการ "วางแชท LINE (AI)" (→ ปัญหาการใช้งาน)
 *
 *  window.lineChat  — อ่านไฟล์บันทึกแชท LINE (.txt) / ข้อความที่วาง: หัววันที่ + เวลา/ผู้ส่ง/ข้อความ,
 *                     แผงวางแชท + เลือกช่วงวันที่ (ค่าเริ่มต้น 7 วันย้อนหลัง), แบ่งก้อนข้อความส่ง AI
 *  window.aiReview  — ขั้นตรวจทานผลที่ AI แยก: หน้าต่างขยายเกือบเต็มจอ 2 ฝั่ง (รายการ | รายละเอียด + แชทต้นทาง)
 *                     แต่ละโมดูลกำหนดเองว่ารายการมีช่องอะไร/ขาดอะไร/บันทึกอย่างไร ผ่าน config
 */
(function () {
  function esc(s) { return window.esc(s); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function $(id) { return document.getElementById(id); }

  // ══ 1) อ่านแชท LINE ══════════════════════════════════════════════════════
  var TH_MON = {
    'ม.ค.': 1, 'มกราคม': 1, 'ก.พ.': 2, 'กุมภาพันธ์': 2, 'มี.ค.': 3, 'มีนาคม': 3, 'เม.ย.': 4, 'เมษายน': 4,
    'พ.ค.': 5, 'พฤษภาคม': 5, 'มิ.ย.': 6, 'มิถุนายน': 6, 'ก.ค.': 7, 'กรกฎาคม': 7, 'ส.ค.': 8, 'สิงหาคม': 8,
    'ก.ย.': 9, 'กันยายน': 9, 'ต.ค.': 10, 'ตุลาคม': 10, 'พ.ย.': 11, 'พฤศจิกายน': 11, 'ธ.ค.': 12, 'ธันวาคม': 12,
  };
  // บรรทัดหัววันที่ → 'YYYY-MM-DD' ('' = ไม่ใช่) · รองรับ 2026.09.29 / 29/09/2569 / Tue, 09/29/2026 / 29 ก.ย. 2569
  function lineDate(line) {
    var s = String(line || '').trim();
    if (!s || s.length > 45 || /^\[?\d{1,2}[:.]\d{2}\b/.test(s)) return '';
    var m, y, mo, d;
    if ((m = s.match(/(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = s.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/))) {
      var a = +m[1], b = +m[2]; y = +m[3];
      if (a > 12) { d = a; mo = b; } else if (b > 12) { mo = a; d = b; }
      else if (/^(mon|tue|wed|thu|fri|sat|sun)/i.test(s)) { mo = a; d = b; } // LINE ภาษาอังกฤษ = เดือน/วัน
      else { d = a; mo = b; }
    } else if ((m = s.match(/(\d{1,2})\s*([ก-๙.]+)\s*(\d{4})/)) && TH_MON[m[2]]) { d = +m[1]; mo = TH_MON[m[2]]; y = +m[3]; }
    else return '';
    if (y > 2400) y -= 543;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    return y + '-' + pad2(mo) + '-' + pad2(d);
  }
  // → { group, msgs:[{date,time,name,body}], sawDate }
  function parse(text) {
    var lines = String(text || '').replace(/^﻿/, '').replace(/\r/g, '').split('\n');
    var out = { group: '', msgs: [], sawDate: false }, curDate = '', last = null, prevBlank = true;
    var gm = (lines[0] || '').match(/^\[LINE\]\s*(?:Chat history (?:in|with)|ประวัติ(?:การ)?แชท(?:กลุ่ม)?(?:ใน|กับ)?)\s*(.+)$/i);
    if (gm) { out.group = gm[1].trim(); lines.shift(); }
    lines.forEach(function (ln) {
      var blank = !ln.trim(), s = ln.trim();
      // หัววันที่: บรรทัดที่ "ขึ้นต้นด้วยวันที่" (2025.01.30 วันพฤหัสบดี / Tue, 09/29/2026 / อ. 29/09/2569) นับเสมอ
      // เพราะไฟล์บันทึกแชทบางรุ่นไม่มีบรรทัดว่างคั่น · รูปแบบอื่นนับเฉพาะหลังบรรทัดว่าง กันข้อความที่พิมพ์วันที่ถูกอ่านเป็นหัววันที่
      var strict = s.length <= 30 && /^(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}|\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}|[A-Za-zก-๙.]{1,12},?\s+\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})(\s+\S+)?$/.test(s);
      var dt = (strict || prevBlank || !last) ? lineDate(ln) : '';
      prevBlank = blank;
      if (dt) { curDate = dt; out.sawDate = true; last = null; return; }
      var m = ln.match(/^\[?(\d{1,2})[:.](\d{2})(?:\s*([AaPp][Mm]))?\]?\s+(.+)$/);
      if (m && +m[1] < 24) {
        var h = +m[1];
        if (m[3]) { var pm = /p/i.test(m[3]); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
        var rest = m[4], name = '', body = rest, tab = rest.split('\t');
        if (tab.length >= 2) { name = tab[0].trim(); body = tab.slice(1).join(' '); }
        else { var c = rest.match(/^([^:：]{1,40})[:：]\s+(.*)$/); if (c) { name = c[1].trim(); body = c[2]; } }
        last = { date: curDate, time: pad2(h) + ':' + m[2], name: name, body: body.trim().replace(/^"/, '') };
        out.msgs.push(last);
        return;
      }
      if (last && !blank) last.body += '\n' + ln.trim();
    });
    out.msgs.forEach(function (x) { x.body = x.body.replace(/"$/, ''); });
    // ตัดข้อความที่ไม่มีเนื้อหาให้อ่าน (รูป/สติกเกอร์/ไฟล์สื่อ + ข้อความระบบของกลุ่ม) — ไม่ต้องแสดง และไม่ต้องส่งให้ AI
    var n0 = out.msgs.length;
    out.msgs = out.msgs.filter(function (x) { return !isNoise(x.body); });
    out.skipped = n0 - out.msgs.length;
    return out;
  }
  // ไฟล์บันทึกแชทบางรุ่นไม่แยกชื่อผู้ส่งด้วย tab (body = "ชื่อ ข้อความ") จึงเช็คคำท้ายหลังเว้นวรรคด้วย
  var MEDIA_RE = /(^|\s)(รูป|รูปภาพ|สติกเกอร์|วิดีโอ|ข้อความเสียง|Photos?|Stickers?|Videos?|Voice message|\(emoji\)|เขียนโน้ตใหม่|แชร์โน้ต|รายชื่อติดต่อ|Contacts?)$/i;
  var SYSTEM_RE = /(เข้าร่วมกลุ่ม|ออกจากกลุ่ม|จากกลุ่ม$|เข้ากลุ่ม($| โปรดรอ)|ยกเลิกข้อความ(แล้ว)?$|Unsent a message|joined the group|left the group|สร้างอัลบั้ม|รายการในอัลบั้มแล้ว|ลบอัลบั้ม|เปลี่ยนชื่ออัลบั้ม|การโทรแบบกลุ่มแล้ว|เปลี่ยนการตั้งค่า|เข้าร่วมกลุ่มโดยใช้ลิงก์|เพิ่ม<u>ประกาศ<\/u>)/i;
  function isNoise(body) {
    var b = String(body || '').trim();
    return !b || (b.length <= 80 && MEDIA_RE.test(b)) || SYSTEM_RE.test(b);
  }
  function msgIso(x) {
    if (!x || !x.date) return '';
    var d = new Date(x.date + 'T' + x.time + ':00');
    return isNaN(d) ? '' : d.toISOString();
  }
  function fmt(x) {
    var dm = x.date ? x.date.slice(8, 10) + '/' + x.date.slice(5, 7) + ' ' : '';
    return '[' + dm + x.time + '] ' + (x.name ? x.name + ': ' : '') + x.body;
  }
  // ชื่อกลุ่มจากชื่อไฟล์บันทึกแชท เช่น "[LINE]INVENTORY รพ.น่าน.txt" / "[LINE] Chat with XXX.txt" → "INVENTORY รพ.น่าน"
  function groupFromFile(name) {
    if (!/^\s*\[LINE\]/i.test(name || '')) return ''; // ไฟล์ที่ไม่ได้ตั้งชื่อโดย LINE (เช่น chat.txt) → ให้กรอกเอง
    return String(name || '').replace(/\.txt$/i, '').replace(/^\s*\[LINE\]\s*/i, '')
      .replace(/^(Chat history (in|with)|Chat with|ประวัติ(การ)?แชท(กลุ่ม)?(ใน|กับ)?|แชทกับ)\s*/i, '').trim();
  }

  // ── แผงวางแชท (ใช้ id ขึ้นต้นด้วย pfx เช่น 'hdl' → hdl-src / hdl-info / hdl-from / hdl-to) ──
  // opts: onFile(ชื่อกลุ่มจากไฟล์) · onScan(ชื่อกลุ่ม) — ให้โมดูลนำชื่อกลุ่มไปใช้ต่อ (เช่น เติมช่องกลุ่ม LINE / เดาโรงพยาบาล)
  var _st = {};
  function panelHtml(pfx) {
    var P = "'" + pfx + "'";
    return '<div class="lc-head">'
      + '<div class="lc-hint">วางข้อความแชท หรือเปิดไฟล์บันทึกแชทของ LINE (ในห้องแชท: ≡ → การตั้งค่า → บันทึกแชท) — ระบบอ่านวันที่ของข้อความให้ เลือกเฉพาะช่วงวันที่ที่ต้องการได้</div>'
      + '<label class="btn btn-ghost btn-sm" style="cursor:pointer;">📂 เปิดไฟล์แชท (.txt)<input type="file" accept=".txt,text/plain" style="display:none;" onchange="window.lineChat.file(' + P + ',this)"></label>'
      + '</div>'
      + '<textarea id="' + pfx + '-src" class="f-input" rows="7" placeholder="วางแชท LINE / บันทึกประชุม / รายการปัญหา ที่นี่..." oninput="window.lineChat.scanSoon(' + P + ')"></textarea>'
      + '<div id="' + pfx + '-info" class="lc-info"></div>'
      + '<div class="lc-range">'
      +   '<div class="f-group"><label class="f-label">ตั้งแต่วันที่</label><input type="date" id="' + pfx + '-from" class="f-input" onchange="window.lineChat.scan(' + P + ')"></div>'
      +   '<div class="f-group"><label class="f-label">ถึงวันที่</label><input type="date" id="' + pfx + '-to" class="f-input" onchange="window.lineChat.scan(' + P + ')"></div>'
      + '</div>';
  }
  function bind(pfx, opts) {
    _st[pfx] = { opts: opts || {}, fileGroup: '', timer: null };
    setRange(pfx, ymd(new Date())); // ค่าเริ่มต้น: ย้อนหลัง 1 สัปดาห์นับจากวันนี้
  }
  // ช่วงวันที่ = 7 วันย้อนหลังถึงวันที่ endYmd (รวมวันนั้น)
  function setRange(pfx, endYmd) {
    var fromEl = $(pfx + '-from'), toEl = $(pfx + '-to');
    if (!fromEl || !toEl) return;
    var d = new Date(endYmd + 'T00:00:00'); d.setDate(d.getDate() - 7);
    fromEl.value = ymd(d); toEl.value = endYmd;
    if (($(pfx + '-src') || {}).value) scan(pfx);
  }
  function file(pfx, input) {
    var f = input.files && input.files[0], st = _st[pfx];
    if (!f || !st) return;
    var r = new FileReader();
    r.onload = function () {
      var ta = $(pfx + '-src'); if (!ta) return;
      ta.value = String(r.result || '');
      st.fileGroup = groupFromFile(f.name);
      // ชื่อกลุ่ม: หัวไฟล์ [LINE] ก่อน ถ้าไม่มีใช้ชื่อไฟล์ — ไม่มีทั้งคู่ให้กรอกเอง
      if (st.opts.onFile) st.opts.onFile(parse(ta.value).group || st.fileGroup);
      scan(pfx);
    };
    r.readAsText(f, 'utf-8');
    input.value = '';
  }
  function scanSoon(pfx) {
    var st = _st[pfx]; if (!st) return;
    st.fileGroup = ''; // วาง/พิมพ์ข้อความเอง → ไม่ผูกกับชื่อไฟล์เดิมแล้ว
    clearTimeout(st.timer); st.timer = setTimeout(function () { scan(pfx); }, 300);
  }
  function inRange(pfx, p) {
    if (!p.sawDate) return p.msgs;
    var f = ($(pfx + '-from') || {}).value || '', t = ($(pfx + '-to') || {}).value || '';
    return p.msgs.filter(function (x) { return x.date && (!f || x.date >= f) && (!t || x.date <= t); });
  }
  function scan(pfx) {
    var st = _st[pfx] || { opts: {} }, src = ($(pfx + '-src') || {}).value || '';
    var info = $(pfx + '-info'), fromEl = $(pfx + '-from'), toEl = $(pfx + '-to');
    if (!info) return;
    var p = parse(src);
    if (!p.msgs.length) {
      info.innerHTML = src.trim() ? 'ไม่พบรูปแบบแชท LINE (เวลา + ชื่อ + ข้อความ) — AI จะอ่านข้อความทั้งหมดตามที่วาง' : '';
      return;
    }
    fromEl.disabled = toEl.disabled = !p.sawDate;
    var dates = p.msgs.map(function (x) { return x.date; }).filter(Boolean).sort();
    var lo = dates[0], hi = dates[dates.length - 1];
    var grp = p.group || st.fileGroup || '';
    if (st.opts.onScan) st.opts.onScan(grp);
    var n = inRange(pfx, p).length;
    info.innerHTML = 'พบ <b>' + p.msgs.length + '</b> ข้อความ'
      + (dates.length ? ' · แชทช่วง ' + window.fd(lo) + ' – ' + window.fd(hi) + ' · <b style="color:var(--violet);">อยู่ในช่วงที่เลือก ' + n + ' ข้อความ</b>' : ' (ไม่มีวันที่ในข้อความ — ใช้ทั้งหมด)')
      // ช่วง 7 วันล่าสุดไม่ตรงกับแชท (เช่น ไฟล์แชทเก่า) → ปุ่มลัดเลือก 7 วันสุดท้ายของแชทแทน
      + (dates.length && !n ? ' · <a href="javascript:void(0)" style="color:var(--violet);font-weight:600;" onclick="window.lineChat.setRange(\'' + pfx + '\',\'' + hi + '\')">ใช้ 7 วันสุดท้ายของแชท</a>' : '')
      + (grp ? ' · กลุ่ม ' + esc(grp) : '')
      + (p.skipped ? '<div style="margin-top:2px;">ข้ามรูป/สติกเกอร์/ข้อความระบบของกลุ่ม ' + p.skipped + ' ข้อความ (ไม่มีเนื้อหาให้ AI อ่าน)</div>' : '');
  }
  // ข้อความในช่วงที่เลือก + ก้อนข้อความส่ง AI (~7,000 ตัวอักษร ตัดตามขอบข้อความ · เลข # ต่อเนื่องทั้งช่วง
  // ใช้ย้อนหาเวลา/ข้อความต้นทางของแต่ละรายการ) — ไม่พบรูปแบบแชท = ส่งข้อความดิบทั้งก้อน
  function collect(pfx) {
    var src = (($(pfx + '-src') || {}).value || '').trim();
    if (!src) return { error: 'วางข้อความแชทก่อน' };
    var p = parse(src), msgs = p.msgs.length ? inRange(pfx, p) : [];
    if (p.msgs.length && !msgs.length) return { error: 'ไม่มีข้อความในช่วงวันที่ที่เลือก' };
    if (msgs.length > 2500) return { error: 'ข้อความในช่วงนี้มีมากเกินไป (' + msgs.length + ') — เลือกช่วงวันที่ให้แคบลง' };
    var chunks = [];
    if (msgs.length) {
      var cur = '';
      msgs.forEach(function (x, i) {
        var line = '#' + (i + 1) + ' ' + fmt(Object.assign({}, x, { body: x.body.slice(0, 500).replace(/\n+/g, ' ⏎ ') })) + '\n';
        if (cur && cur.length + line.length > 7000) { chunks.push(cur); cur = ''; }
        cur += line;
      });
      if (cur) chunks.push(cur);
    } else chunks = [src.slice(0, 8000)];
    return { msgs: msgs, chunks: chunks, numbered: msgs.length > 0 };
  }
  // ช่วงแชทที่เป็นที่มาของรายการ (จากเลขข้อความ first/last ที่ AI ตอบ) → เวลาแจ้ง/เวลาจบ/ข้อความต้นทาง
  function excerpt(msgs, first, last) {
    if (!msgs || !msgs.length) return { createdAt: '', endAt: '', whenLabel: '', chat: '' };
    var fi = Math.min(msgs.length - 1, Math.max(0, (parseInt(first, 10) || 1) - 1));
    var li = Math.min(msgs.length - 1, Math.max(fi, (parseInt(last, 10) || 0) - 1));
    var fm = msgs[fi], lm = msgs[li];
    return {
      createdAt: msgIso(fm), endAt: msgIso(lm) || msgIso(fm),
      whenLabel: fmt(fm).match(/^\[([^\]]+)\]/)[1],
      chat: msgs.slice(fi, li + 1).slice(0, 40).map(fmt).join('\n').slice(0, 3000),
    };
  }
  // ชื่อผู้ส่งในแชท (เช่น "เอก BMS") → คนในรายชื่อ: ตรงชื่อ/ชื่อเล่น หรือมีชื่อเล่นเป็นคำหนึ่งในชื่อที่แสดง
  function matchPerson(name, people) {
    var q = String(name || '').trim().toLowerCase();
    if (!q) return null;
    var words = q.split(/[\s()\[\]\-_.,|/]+/).filter(Boolean);
    return (people || []).find(function (s) {
      var nm = String(s.name || '').toLowerCase(), nk = String(s.nickname || '').toLowerCase().trim();
      return nm === q || nk === q || (nm.length >= 3 && q.indexOf(nm) > -1) || (nk.length >= 2 && words.indexOf(nk) > -1);
    }) || null;
  }

  window.lineChat = {
    parse: parse, msgIso: msgIso, fmt: fmt, groupFromFile: groupFromFile, matchPerson: matchPerson,
    panelHtml: panelHtml, bind: bind, setRange: setRange, file: file, scanSoon: scanSoon, scan: scan,
    collect: collect, excerpt: excerpt,
  };

  // ══ 2) ตรวจทานผลที่ AI แยก ═══════════════════════════════════════════════
  // ซ้าย = รายการแบบกะทัดรัด (เห็นทั้งหมดในจอเดียว + ตัวกรองตามสถานะ) · ขวา = รายละเอียด/แก้ไขทีละรายการ + แชทต้นทาง
  // ค่าที่แก้เก็บในรายการ (cfg.items) โดยตรง ไม่อิง DOM · มือถือ: รายการเต็มจอ แตะแล้วเปิดรายละเอียด
  //
  // cfg: modalId, step1Id, step2Id, reviewId, footId — ส่วนของหน้าต่าง (ขั้นที่ 1 = วางแชท, ขั้นที่ 2 = ตรวจทาน)
  //      items[]      — รายการ (ช่องของโมดูลเอง + whenLabel / chat / dup ที่ระบบใช้แสดง)
  //      unit         — คำเรียกสิ่งที่จะสร้าง เช่น 'Ticket' / 'รายการ'
  //      ctxHtml()    — ข้อความบริบทแถบบน (เช่น โรงพยาบาล/โครงการ)
  //      title(x)     — หัวข้อการ์ด · missing(x) → [ชื่อช่องที่ยังขาด]
  //      card(x)      — { status, badges (HTML), chips: [[ไอคอน, ชื่อช่อง, ค่า, คำอธิบาย]], note (HTML), done (ขอบเขียว) }
  //      filters      — [[key, label, fn]] ตัวกรองเฉพาะโมดูล (มี ทั้งหมด / ข้อมูลไม่ครบ / อาจซ้ำ ให้เสมอ)
  //      statusKey, statuses [{v, label, cls:'open'|'done'|''}] — ปุ่มสลับสถานะ
  //      fields(x, i, h) — HTML ช่องแก้ไข (h = ตัวช่วยสร้างช่องที่ผูกค่ากับรายการแล้ว · h.fld(ชื่อ, html, 1) = ช่องต้องระบุ มี * แดง)
  //      beforeSave() → false = ยังไม่บันทึก · saveOne(x) — บันทึกทีละรายการ · onDone(made, todo) — เสร็จแล้ว
  var R = null;
  function mount(cfg) {
    R = cfg; R.filter = 'all'; R.cur = 0;
    R.allFilters = [['all', 'ทั้งหมด', null]].concat(cfg.filters || []).concat([
      ['need', '❗ ข้อมูลไม่ครบ', function (x) { return cfg.missing(x).length > 0; }],
      ['dup', '⚠️ อาจซ้ำ', function (x) { return !!x.dup; }],
    ]);
    cfg.items.forEach(function (x) { if (x.sel === undefined) x.sel = !x.dup; });
    R.root = $(cfg.reviewId);
    R.root.innerHTML = '<div class="air"><div class="air-top"></div><div class="air-body"><div class="air-list"></div><div class="air-detail"></div></div></div>';
    step(2);
  }
  // เปิดหน้าต่างใหม่: ล้างการตรวจทานเดิม + ปุ่มท้ายเริ่มต้น
  function reset(modalId, footId) {
    R = null;
    var m = $(modalId); if (m) m.classList.remove('air-on');
    var f = $(footId);
    if (f) f.innerHTML = '<div style="flex:1"></div><button class="btn btn-ghost" onclick="window.closeM(\'' + modalId + '\')">ยกเลิก</button>';
  }
  function step(n) {
    if (!R) return;
    $(R.step1Id).style.display = n === 1 ? '' : 'none';
    $(R.step2Id).style.display = n === 2 ? '' : 'none';
    $(R.modalId).classList.toggle('air-on', n === 2);
    if (n === 2) drawAll(); else foot();
  }
  function q(sel) { return R && R.root ? R.root.querySelector(sel) : null; }
  function live() { return R.items.filter(function (x) { return !x.created; }); }
  function match(x, f) { var t = R.allFilters.find(function (y) { return y[0] === f; }); return !t || !t[2] || t[2](x); }
  function drawAll() { top(); list(); detail(); foot(); }

  function top() {
    var el = q('.air-top'); if (!el) return;
    var L = live(), cnt = function (k) { return L.filter(function (x) { return match(x, k); }).length; };
    var sel = L.filter(function (x) { return x.sel; }).length;
    el.innerHTML = '<div class="air-bar">'
      +   '<button type="button" class="btn btn-ghost btn-sm" onclick="window.aiReview.back()">← แก้ข้อความ / ช่วงวันที่</button>'
      +   '<div class="air-ctx">' + (R.ctxHtml ? R.ctxHtml() : '') + '</div>'
      + '</div>'
      + '<div class="air-bar">'
      +   '<div class="air-filters">' + R.allFilters.filter(function (t) { return t[0] === 'all' || cnt(t[0]); }).map(function (t) {
            return '<button type="button" class="air-fbtn' + (R.filter === t[0] ? ' on' : '') + '" onclick="window.aiReview.setFilter(\'' + t[0] + '\')">' + t[1] + '<b>' + cnt(t[0]) + '</b></button>';
          }).join('') + '</div>'
      +   '<span style="flex:1"></span>'
      +   '<span class="air-sel">เลือกสร้าง <b>' + sel + '</b> / ' + L.length + '</span>'
      +   '<button type="button" class="btn btn-ghost btn-sm" onclick="window.aiReview.pickAll(true)">เลือกทั้งหมด</button>'
      +   '<button type="button" class="btn btn-ghost btn-sm" onclick="window.aiReview.pickAll(false)">ไม่เลือก</button>'
      + '</div>'
      + '<div class="air-note">🤖 ข้อมูลเติมโดย AI — คลิกแต่ละรายการเพื่อตรวจ/แก้ และเทียบกับแชทต้นทาง</div>';
  }
  function chatHtml(chat) { return esc(chat).replace(/^(\[[^\]]+\])/gm, '<b>$1</b>'); }
  // รายการแบบการ์ดอ่านง่าย: สถานะ/ความสำคัญ/เวลา · หัวข้อตัวหนา · ป้ายข้อมูล (ขาด = แดง) · หมายเหตุ (เช่น วิธีแก้) · แชทต้นทาง
  function list() {
    var el = q('.air-list'); if (!el) return;
    var chip = function (ch) { // [ไอคอน, ชื่อช่อง, ค่า, คำอธิบายเมื่อชี้]
      return '<span class="air-chip' + (ch[2] ? '' : ' miss') + '"' + (ch[3] ? ' title="' + esc(ch[3]) + '"' : '') + '>' + ch[0] + ' ' + esc(ch[2] || 'ไม่ระบุ' + ch[1]) + '</span>';
    };
    var html = R.items.map(function (x, i) {
      if (!x.created && !match(x, R.filter)) return '';
      var c = R.card(x), miss = x.created ? [] : R.missing(x);
      var cls = (i === R.cur && q('.air').classList.contains('editing') ? ' on' : '') + (x.sel ? '' : ' off') + (x.created ? ' made' : '')
        + (miss.length ? ' need' : '') + (c.done ? ' done' : '') + (x.dup && !x.created ? ' dup' : '');
      return '<div class="air-card' + cls + '">'
        + '<label class="air-pick" title="เลือกเพื่อสร้าง"><input type="checkbox"' + (x.sel ? ' checked' : '') + (x.created ? ' disabled' : '') + ' onchange="window.aiReview.pick(' + i + ',this.checked)"><span>' + (i + 1) + '</span></label>'
        + '<div class="air-card-main">'
        +   '<div class="air-line1">' + (x.created ? '<b class="air-made">✔ สร้างแล้ว</b>' : '') + (c.status || '') + (c.badges || '')
        +     (x.whenLabel ? '<span class="air-when">🕘 แจ้ง ' + esc(x.whenLabel) + '</span>' : '') + '</div>'
        +   '<div class="air-title">' + esc(R.title(x) || '(ไม่มีรายละเอียด)') + '</div>'
        +   '<div class="air-chips">' + (c.chips || []).map(chip).join('') + '</div>'
        +   (c.note || '')
        +   (x.dup && !x.created ? '<div class="air-warn">⚠️ ' + esc(x.dup) + '</div>' : '')
        +   (miss.length ? '<div class="air-miss">❗ ยังขาด: ' + miss.join(', ') + '</div>' : '')
        +   (x.chat ? '<details class="air-card-chat"><summary>💬 ดูข้อความแชทต้นทาง</summary><div class="air-chat-b">' + chatHtml(x.chat) + '</div></details>' : '')
        + '</div>'
        + '<button type="button" class="btn btn-ghost btn-sm air-edit-btn" onclick="window.aiReview.select(' + i + ')">' + (x.created ? '👁 ดู' : '✏️ แก้ไข') + '</button>'
        + '</div>';
    }).join('');
    el.innerHTML = html || '<div class="air-empty">ไม่มีรายการในตัวกรองนี้</div>';
  }
  function detail() {
    var el = q('.air-detail'); if (!el) return;
    var i = R.cur, x = R.items[i], n = R.items.length;
    if (!x) { el.innerHTML = ''; return; }
    var miss = R.missing(x);
    var h = { // ตัวช่วยสร้างช่องแก้ไข: txt = ช่องพิมพ์ (เก็บค่าเงียบ ๆ ไม่วาดใหม่ กันเคอร์เซอร์หลุด) · pick = ช่องเลือก (วาดใหม่ให้คำเตือนอัปเดต)
      fld: function (label, html, req) { return '<label class="air-f"><span>' + label + (req ? ' <b class="air-req">*</b>' : '') + '</span>' + html + '</label>'; },
      opt: function (v, label, sel) { return '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(label) + '</option>'; },
      bad: function (label) { return miss.indexOf(label) > -1 ? ' hd-invalid' : ''; },
      txt: function (k, req) { return (req ? ' data-req="1"' : '') + ' oninput="window.aiReview.set(' + i + ',\'' + k + '\',this.value,this)"'; },
      pick: function (k) { return ' onchange="window.aiReview.set(' + i + ',\'' + k + '\',this.value)"'; },
    };
    el.innerHTML = '<div class="air-d-head">'
      +   '<b>✏️ แก้ไขรายการ ' + (i + 1) + ' / ' + n + '</b>'
      +   (x.whenLabel ? '<span class="air-when">🕘 แจ้ง ' + esc(x.whenLabel) + '</span>' : '')
      +   '<span style="flex:1"></span>'
      +   (x.created ? '<b style="color:var(--teal);">✔ สร้างแล้ว</b>'
            : '<label class="air-d-pick"><input type="checkbox"' + (x.sel ? ' checked' : '') + ' onchange="window.aiReview.pick(' + i + ',this.checked)"> สร้างรายการนี้</label>')
      +   '<button type="button" class="btn btn-ghost btn-sm" onclick="window.aiReview.go(-1)"' + (i <= 0 ? ' disabled' : '') + '>‹ ก่อนหน้า</button>'
      +   '<button type="button" class="btn btn-ghost btn-sm" onclick="window.aiReview.go(1)"' + (i >= n - 1 ? ' disabled' : '') + '>ถัดไป ›</button>'
      +   '<button type="button" class="btn btn-ghost btn-sm" onclick="window.aiReview.closeDetail()" title="ปิดช่องแก้ไข">✕ ปิด</button>'
      + '</div>'
      + (x.created ? '' : '<div class="air-req-hint">ช่องที่มี <b class="air-req">*</b> ต้องระบุ</div>')
      + (x.dup ? '<div class="air-warn">⚠️ ' + esc(x.dup) + '</div>' : '')
      + '<div class="air-miss air-d-miss">' + (miss.length && !x.created ? '❗ ยังขาด: ' + miss.join(', ') : '') + '</div>'
      + (R.statuses ? '<div class="air-seg">' + R.statuses.map(function (s, k) {
          return '<button type="button" class="' + (x[R.statusKey] === s.v ? 'on ' + (s.cls || 'mid') : '') + '" onclick="window.aiReview.setStatus(' + i + ',' + k + ')">' + s.label + '</button>';
        }).join('') + '</div>' : '')
      + R.fields(x, i, h)
      + (x.chat ? '<div class="air-chat"><div class="air-chat-h">💬 ข้อความแชทต้นทาง</div><div class="air-chat-b">' + chatHtml(x.chat) + '</div></div>' : '');
    if (x.created) el.querySelectorAll('.air-f input, .air-f select, .air-f textarea, .air-seg button').forEach(function (e) { e.disabled = true; });
  }
  function foot() {
    if (!R) return;
    var f = $(R.footId); if (!f) return;
    var reviewing = $(R.modalId).classList.contains('air-on');
    var n = R.items.filter(function (x) { return x.sel && !x.created; }).length;
    f.innerHTML = '<div style="flex:1"></div>'
      + '<button class="btn btn-ghost" onclick="window.closeM(\'' + R.modalId + '\')">ยกเลิก</button>'
      + (reviewing
        ? '<button class="btn btn-pri air-save" onclick="window.aiReview.save()"' + (n ? '' : ' disabled') + '>💾 สร้าง ' + n + ' ' + (R.unit || 'รายการ') + '</button>'
        : (live().length ? '<button class="btn btn-ghost" onclick="window.aiReview.toReview()">ไปหน้าตรวจทาน ›</button>' : ''));
  }

  function set(i, k, v, inputEl) {
    var x = R && R.items[i]; if (!x) return;
    x[k] = v;
    if (inputEl) { // กำลังพิมพ์ — อัปเดตแค่คำเตือน/กรอบแดง
      if (inputEl.dataset.req) inputEl.classList.toggle('hd-invalid', !String(v).trim());
      var miss = R.missing(x), m = q('.air-d-miss');
      if (m) m.textContent = miss.length ? '❗ ยังขาด: ' + miss.join(', ') : '';
    } else detail();
    top(); list(); foot();
  }
  // เปิดช่องแก้ไขของรายการ i — จอกว้าง: แผงด้านขวาข้างรายการการ์ด · มือถือ: เต็มจอ
  function select(i) {
    R.cur = i;
    var rv = q('.air'), d = q('.air-detail');
    if (rv) rv.classList.add('editing');
    list(); detail();
    if (d) d.scrollTop = 0;
    var card = q('.air-list .air-card.on');
    if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
  }
  function pick(i, on) {
    var x = R && R.items[i]; if (!x || x.created) return;
    x.sel = !!on;
    top(); list(); if (i === R.cur) detail(); foot();
  }
  // เลือก/ไม่เลือกเฉพาะรายการที่แสดงตามตัวกรองอยู่
  function pickAll(on) {
    R.items.forEach(function (x) { if (!x.created && match(x, R.filter)) x.sel = on; });
    drawAll();
  }
  function setFilter(f) {
    R.filter = f;
    var cur = R.items[R.cur];
    if (!cur || cur.created || !match(cur, f)) { // รายการที่เปิดอยู่ไม่อยู่ในตัวกรอง → เปิดรายการแรกของตัวกรองแทน
      var first = R.items.findIndex(function (x) { return !x.created && match(x, f); });
      if (first > -1) R.cur = first;
    }
    top(); list(); detail();
  }
  async function save() {
    if (!R) return;
    if (R.beforeSave && R.beforeSave() === false) return;
    var todo = R.items.filter(function (x) { return x.sel && !x.created; });
    if (!todo.length) return;
    var bad = todo.find(function (x) { return R.missing(x).length; });
    if (bad) {
      var bi = R.items.indexOf(bad);
      window.showAlert && window.showAlert('รายการที่ ' + (bi + 1) + ' ข้อมูลยังไม่ครบ: ' + R.missing(bad).join(', '), 'warn');
      R.filter = 'all'; top(); select(bi);
      return;
    }
    var btn = ($(R.footId) || document).querySelector('.air-save'), cfg = R, made = 0;
    if (btn) btn.disabled = true;
    try {
      for (var k = 0; k < todo.length; k++) {
        if (btn) btn.textContent = '⏳ สร้าง ' + (k + 1) + '/' + todo.length;
        await cfg.saveOne(todo[k]);
        todo[k].created = true; todo[k].sel = false; // สร้างแล้ว — ถ้าพลาดกลางทาง กดซ้ำจะไม่สร้างซ้ำ
        made++;
      }
      cfg.onDone && cfg.onDone(made, todo);
    } catch (e) {
      window.showDbError ? window.showDbError(e) : alert(e.message || e);
      if (R === cfg) drawAll();
      cfg.onFail && cfg.onFail(made);
    }
  }

  window.aiReview = {
    mount: mount, reset: reset, set: set, select: select, pick: pick, pickAll: pickAll, setFilter: setFilter, save: save,
    setStatus: function (i, k) { set(i, R.statusKey, R.statuses[k].v); },
    go: function (d) { var i = R.cur + d; if (i >= 0 && i < R.items.length) select(i); },
    back: function () { step(1); },
    toReview: function () { if (R) step(2); },
    closeDetail: function () { var rv = q('.air'); if (rv) rv.classList.remove('editing'); if (R) list(); },
  };
})();
