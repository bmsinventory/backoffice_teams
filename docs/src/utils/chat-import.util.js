/**
 * chat-import.util.js — นำเข้าแชท LINE ให้ AI แยกเป็นรายการ แล้วตรวจทานก่อนบันทึก
 * ใช้ร่วมกัน: ศูนย์ช่วยเหลือ "วางแชท LINE" (→ Ticket) · ติดตามสถานะโครงการ "วางแชท LINE (AI)" (→ ปัญหาการใช้งาน)
 *
 *  window.lineChat  — อ่านไฟล์บันทึกแชท LINE (.txt) / ข้อความที่วาง: หัววันที่ + เวลา/ผู้ส่ง/ข้อความ,
 *                     แผงวางแชท + ปุ่มช่วงวันที่ (วันนี้ / 7 วัน / 30 วัน / ทั้งหมด / กำหนดเอง · ค่าเริ่มต้น 7 วัน), แบ่งก้อนข้อความส่ง AI
 *                     โหมดหลายแหล่ง (multi): เปิดหลายไฟล์ + ข้อความที่วาง แยกการ์ดต่อแหล่ง ดูแชทก่อนนำเข้าได้
 *  window.aiReview  — ขั้นตรวจทานผลที่ AI แยก: หน้าต่างขยายเกือบเต็มจอ (แถบกลุ่มซ้าย | ตัวกรอง + กล่องต่อกลุ่ม แก้ไขในการ์ด)
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
  // multi = โหมดหลายแหล่ง (ดู "หลายแหล่ง" ด้านล่าง) — ต้องส่งทั้ง panelHtml และ bind
  var _st = {};
  function panelHtml(pfx, popts) {
    var P = "'" + pfx + "'", multi = !!(popts && popts.multi);
    return '<div class="lc-head">'
      + '<div class="lc-hint">' + (multi
          ? 'เปิดไฟล์บันทึกแชทของ LINE ได้หลายไฟล์พร้อมกัน (ในห้องแชท: ≡ → การตั้งค่า → บันทึกแชท) หรือวางข้อความแชท — แต่ละไฟล์ผูกกับโรงพยาบาลของตัวเอง ระบบอ่านวันที่ของข้อความให้ เลือกช่วงวันที่ได้'
          : 'วางข้อความแชท หรือเปิดไฟล์บันทึกแชทของ LINE (ในห้องแชท: ≡ → การตั้งค่า → บันทึกแชท) — ระบบอ่านวันที่ของข้อความให้ เลือกเฉพาะช่วงวันที่ที่ต้องการได้') + '</div>'
      + '<label class="btn btn-ghost btn-sm" style="cursor:pointer;">📂 ' + (multi ? 'เปิดไฟล์แชท (.txt) — เลือกได้หลายไฟล์' : 'เปิดไฟล์แชท (.txt)')
      +   '<input type="file" accept=".txt,text/plain"' + (multi ? ' multiple' : '') + ' style="display:none;" onchange="window.lineChat.file(' + P + ',this)"></label>'
      + '</div>'
      + '<textarea id="' + pfx + '-src" class="f-input" rows="' + (multi ? 4 : 7) + '" placeholder="' + (multi ? 'หรือวางข้อความแชท LINE / บันทึกประชุม / รายการปัญหา ที่นี่ (นับเป็นอีก 1 แหล่ง)...' : 'วางแชท LINE / บันทึกประชุม / รายการปัญหา ที่นี่...') + '" oninput="window.lineChat.scanSoon(' + P + ')"></textarea>'
      + '<div class="lc-range">'
      +   '<span class="lc-range-l">ช่วงแชท</span>'
      +   '<div class="air-seg lc-preset" id="' + pfx + '-preset" role="group" aria-label="ช่วงแชท">' + PRESETS.map(function (p) {
            return '<button type="button" data-v="' + p[0] + '" onclick="window.lineChat.preset(' + P + ',\'' + p[0] + '\')">' + p[1] + '</button>';
          }).join('') + '</div>'
      +   '<div class="lc-custom" id="' + pfx + '-custom" hidden>'
      +     '<input type="date" id="' + pfx + '-from" class="f-input" aria-label="ตั้งแต่วันที่" onchange="window.lineChat.scan(' + P + ')">'
      +     '<span>ถึง</span>'
      +     '<input type="date" id="' + pfx + '-to" class="f-input" aria-label="ถึงวันที่" onchange="window.lineChat.scan(' + P + ')">'
      +   '</div>'
      + '</div>'
      + '<div id="' + pfx + '-info" class="lc-info"></div>'
      + (multi ? '<div id="' + pfx + '-srcs" class="lc-srcs"></div>' : '');
  }
  function bind(pfx, opts) {
    opts = opts || {};
    _st[pfx] = { opts: opts, multi: !!opts.multi, sources: [], seq: 0, fileGroup: '', timer: null };
    preset(pfx, '7'); // ค่าเริ่มต้น: ย้อนหลัง 1 สัปดาห์นับจากวันนี้
  }
  // ปุ่มช่วงแชท: จำนวนวันย้อนหลังนับจากวันนี้ (1 = วันนี้) · all = ไม่จำกัด · custom = เลือกวันที่เอง
  var PRESETS = [['1', 'วันนี้'], ['7', '7 วันล่าสุด'], ['30', '30 วัน'], ['all', 'ทั้งหมด'], ['custom', 'กำหนดเอง']];
  function markPreset(pfx, v) {
    var box = $(pfx + '-preset'), cu = $(pfx + '-custom');
    if (box) box.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); b.classList.toggle('mid', b.dataset.v === v); });
    if (cu) cu.hidden = v !== 'custom';
  }
  function preset(pfx, v) {
    var fromEl = $(pfx + '-from'), toEl = $(pfx + '-to');
    if (!fromEl || !toEl) return;
    markPreset(pfx, v);
    if (v === 'custom') return;
    var today = ymd(new Date()), d = new Date();
    d.setDate(d.getDate() - (+v || 0) + 1);
    fromEl.value = v === 'all' ? '' : ymd(d);
    toEl.value = v === 'all' ? '' : today;
    if (($(pfx + '-src') || {}).value || (_st[pfx] && _st[pfx].sources.length)) scan(pfx);
  }
  // ช่วงวันที่ = 7 วันสุดท้ายถึงวันที่ endYmd (รวมวันนั้น) — ใช้กับไฟล์แชทเก่าที่ไม่มีข้อความในช่วงล่าสุด
  function setRange(pfx, endYmd) {
    var fromEl = $(pfx + '-from'), toEl = $(pfx + '-to');
    if (!fromEl || !toEl) return;
    var d = new Date(endYmd + 'T00:00:00'); d.setDate(d.getDate() - 6);
    fromEl.value = ymd(d); toEl.value = endYmd;
    markPreset(pfx, 'custom');
    if (($(pfx + '-src') || {}).value || (_st[pfx] && _st[pfx].sources.length)) scan(pfx);
  }
  function file(pfx, input) {
    var f = input.files && input.files[0], st = _st[pfx];
    if (!f || !st) return;
    if (st.multi) { addFiles(pfx, input); return; }
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
    if (!st.multi) st.fileGroup = ''; // วาง/พิมพ์ข้อความเอง → ไม่ผูกกับชื่อไฟล์เดิมแล้ว (โหมดหลายแหล่ง: ข้อความที่วางเป็นอีกแหล่ง)
    clearTimeout(st.timer); st.timer = setTimeout(function () { scan(pfx); }, 300);
  }
  function inRange(pfx, p) {
    if (!p.sawDate) return p.msgs;
    var f = ($(pfx + '-from') || {}).value || '', t = ($(pfx + '-to') || {}).value || '';
    return p.msgs.filter(function (x) { return x.date && (!f || x.date >= f) && (!t || x.date <= t); });
  }
  function scan(pfx) {
    if (_st[pfx] && _st[pfx].multi) { scanMulti(pfx); return; }
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
    if (_st[pfx] && _st[pfx].multi) return collectMulti(pfx);
    var src = (($(pfx + '-src') || {}).value || '').trim();
    if (!src) return { error: 'วางข้อความแชทก่อน' };
    return build(pfx, src, parse(src));
  }
  function build(pfx, src, p) {
    var msgs = p.msgs.length ? inRange(pfx, p) : [];
    if (p.msgs.length && !msgs.length) return { error: 'ไม่มีข้อความในช่วงวันที่ที่เลือก', empty: true };
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
  // ── หลายแหล่ง (bind(pfx, { multi: true })): เปิดหลายไฟล์พร้อมกัน + ข้อความที่วาง = แหล่งละก้อน ──
  // แหล่ง = { id, label (ชื่อไฟล์ / 'ข้อความที่วาง'), isFile, text, group (กลุ่ม LINE แก้ได้), p (ผลอ่าน), meta {} ให้โมดูลเก็บค่าเอง }
  // ช่วงวันที่ใช้ร่วมกันทุกแหล่ง · การ์ดแหล่งแสดงจำนวนข้อความ/ช่วงแชท/ดูแชทก่อนนำเข้า/ลบ
  // opts: sourceHtml(src, n) → HTML ส่วนของโมดูลในการ์ด (เช่น เลือกโรงพยาบาล) · afterSources(list) → ผูก combobox
  //       onSources(list) → แหล่งเปลี่ยน (เพิ่ม/ลบ/ข้อความเปลี่ยน) ก่อนวาดการ์ด · onGroup(src) → แก้ชื่อกลุ่ม LINE
  //       compact(src) → true = การ์ดแถวเดียว (sourceHtml แสดงสรุปท้ายแถว ไม่มีช่องกลุ่ม LINE)
  function srcOf(pfx, id) { var st = _st[pfx]; return st ? st.sources.find(function (s) { return s.id === id; }) || null : null; }
  function parsedSrc(s) {
    if (s._t !== s.text) {
      s._t = s.text; s.p = parse(s.text);
      if (!s.groupEdited) s.group = s.p.group || s.fileGroup || '';
    }
    return s.p;
  }
  function addFiles(pfx, input) {
    var st = _st[pfx], files = Array.prototype.slice.call(input.files || []);
    input.value = '';
    Promise.all(files.map(function (f) {
      return new Promise(function (ok) {
        var r = new FileReader();
        r.onload = function () { ok({ name: f.name, text: String(r.result || '') }); };
        r.onerror = function () { ok(null); };
        r.readAsText(f, 'utf-8');
      });
    })).then(function (res) {
      res.forEach(function (f) {
        if (!f) return;
        // เปิดไฟล์ชื่อเดิมซ้ำ = แทนที่ข้อความของไฟล์นั้น (เก็บโรงพยาบาลที่เลือกไว้)
        var s = st.sources.find(function (x) { return x.isFile && x.label === f.name; });
        if (!s) { s = { id: 's' + (++st.seq), label: f.name, isFile: true, meta: {} }; st.sources.push(s); }
        s.text = f.text; s.fileGroup = groupFromFile(f.name);
      });
      scan(pfx);
    });
  }
  function syncPaste(st, txt) {
    var s = st.sources.find(function (x) { return x.id === 'paste'; });
    if (!txt.trim()) { if (s) st.sources.splice(st.sources.indexOf(s), 1); return; }
    if (!s) { s = { id: 'paste', label: 'ข้อความที่วาง', isFile: false, fileGroup: '', meta: {} }; st.sources.push(s); }
    s.text = txt;
  }
  function scanMulti(pfx) {
    var st = _st[pfx], info = $(pfx + '-info'), box = $(pfx + '-srcs');
    if (!st || !info || !box) return;
    syncPaste(st, ($(pfx + '-src') || {}).value || '');
    var all = [], inN = 0, sawDate = false, skipped = 0;
    st.sources.forEach(function (s) {
      var p = parsedSrc(s);
      s.inN = p.msgs.length ? inRange(pfx, p).length : 0;
      inN += s.inN; skipped += p.skipped || 0; if (p.sawDate) sawDate = true;
      p.msgs.forEach(function (x) { if (x.date) all.push(x.date); });
    });
    if (st.opts.onSources) st.opts.onSources(st.sources);
    $(pfx + '-from').disabled = $(pfx + '-to').disabled = st.sources.length > 0 && !sawDate;
    all.sort();
    var hi = all[all.length - 1];
    info.innerHTML = !st.sources.length ? '' : '<b>' + st.sources.length + '</b> แหล่ง'
      + (all.length ? ' · แชทช่วง ' + window.fd(all[0]) + ' – ' + window.fd(hi) + ' · <b style="color:var(--violet);">อยู่ในช่วงที่เลือก ' + inN + ' ข้อความ</b>' : '')
      + (all.length && !inN ? ' · <a href="javascript:void(0)" style="color:var(--violet);font-weight:600;" onclick="window.lineChat.setRange(\'' + pfx + '\',\'' + hi + '\')">ใช้ 7 วันสุดท้ายของแชท</a>' : '')
      + (skipped ? '<div style="margin-top:2px;">ข้ามรูป/สติกเกอร์/ข้อความระบบของกลุ่ม ' + skipped + ' ข้อความ (ไม่มีเนื้อหาให้ AI อ่าน)</div>' : '');
    var P = "'" + pfx + "'";
    box.innerHTML = st.sources.map(function (s) {
      var p = s.p, ds = p.msgs.map(function (x) { return x.date; }).filter(Boolean).sort(), I = "'" + s.id + "'";
      // compact(s) = โมดูลจับคู่ข้อมูลของแหล่งนี้ได้แล้ว → แถวเดียว ซ่อนช่องกลุ่ม LINE (โมดูลมีปุ่ม "เปลี่ยน" ให้กางกลับ)
      var cmp = !!(st.opts.compact && st.opts.compact(s));
      return '<div class="lc-src' + (cmp ? ' compact' : '') + (p.msgs.length && !s.inN ? ' idle' : '') + '" id="' + pfx + '-sc-' + s.id + '">'
        + '<div class="lc-src-h">'
        +   '<span class="lc-src-ic">' + (s.isFile ? '📄' : '📋') + '</span>'
        +   '<div class="lc-src-t"><b title="' + esc(s.label) + '">' + esc(s.label) + '</b>'
        +     '<span>' + (p.msgs.length
                ? '<b class="' + (s.inN ? 'on' : 'off') + '">' + (s.inN ? s.inN + ' ข้อความในช่วง' : 'ไม่มีข้อความในช่วงที่เลือก — ข้ามแหล่งนี้') + '</b>'
                  + (ds.length ? ' · แชท ' + window.fd(ds[0]) + ' – ' + window.fd(ds[ds.length - 1]) : '')
                : 'ไม่พบรูปแบบแชท LINE — AI จะอ่านข้อความทั้งหมดตามที่วาง') + '</span></div>'
        +   (cmp ? '<div class="lc-src-m" id="' + pfx + '-sx-' + s.id + '">' + st.opts.sourceHtml(s, s.inN) + '</div>' : '')
        +   (p.msgs.length ? '<button type="button" class="btn btn-ghost btn-sm" onclick="window.lineChat.preview(' + P + ',' + I + ',this)">👁 ดูแชท</button>' : '')
        +   '<button type="button" class="btn btn-ghost btn-sm lc-src-x" title="เอาแหล่งนี้ออก" aria-label="เอาแหล่งนี้ออก" onclick="window.lineChat.removeSource(' + P + ',' + I + ')">✕</button>'
        + '</div>'
        + (cmp ? '' : '<div class="lc-src-b">'
        +   '<label class="lc-src-g"><span>กลุ่ม LINE</span><input class="f-input" value="' + esc(s.group || '') + '" placeholder="ไม่พบชื่อกลุ่ม — พิมพ์เอง" oninput="window.lineChat.setGroup(' + P + ',' + I + ',this.value)"></label>'
        +   '<div class="lc-src-m" id="' + pfx + '-sx-' + s.id + '">' + (st.opts.sourceHtml ? st.opts.sourceHtml(s, s.inN) : '') + '</div>'
        + '</div>')
        + '<div class="lc-src-pv" id="' + pfx + '-pv-' + s.id + '" hidden></div>'
        + '</div>';
    }).join('');
    if (st.opts.afterSources) st.opts.afterSources(st.sources);
  }
  // วาดส่วนของโมดูลในการ์ดแหล่งใหม่ (เช่น หลังเลือกโรงพยาบาล) โดยไม่วาดช่องกลุ่ม LINE ใหม่ — กันเคอร์เซอร์หลุดตอนพิมพ์
  function refreshSource(pfx, id) {
    var st = _st[pfx], s = srcOf(pfx, id), el = $(pfx + '-sx-' + id);
    if (!st || !s || !el) return;
    el.innerHTML = st.opts.sourceHtml ? st.opts.sourceHtml(s, s.inN) : '';
    if (st.opts.afterSources) st.opts.afterSources([s]);
  }
  function setGroup(pfx, id, v) {
    var st = _st[pfx], s = srcOf(pfx, id); if (!s) return;
    s.group = String(v || '').trim(); s.groupEdited = true;
    if (st.opts.onGroup) st.opts.onGroup(s);
  }
  function removeSource(pfx, id) {
    var st = _st[pfx]; if (!st) return;
    if (id === 'paste') { var ta = $(pfx + '-src'); if (ta) ta.value = ''; }
    st.sources = st.sources.filter(function (s) { return s.id !== id; });
    scan(pfx);
  }
  // ดูข้อความแชทในช่วงวันที่ที่เลือกก่อนส่ง AI (สูงสุด 400 ข้อความ)
  function preview(pfx, id, btn) {
    var s = srcOf(pfx, id), el = $(pfx + '-pv-' + id);
    if (!s || !el) return;
    if (!el.hidden) { el.hidden = true; if (btn) btn.textContent = '👁 ดูแชท'; return; }
    var msgs = inRange(pfx, s.p);
    el.innerHTML = msgs.length
      ? msgs.slice(0, 400).map(function (x) { return '<div>' + esc(fmt(x)).replace(/^(\[[^\]]+\])/, '<b>$1</b>') + '</div>'; }).join('')
        + (msgs.length > 400 ? '<div class="lc-src-more">… อีก ' + (msgs.length - 400) + ' ข้อความ</div>' : '')
      : '<div class="lc-src-more">ไม่มีข้อความในช่วงวันที่ที่เลือก</div>';
    el.hidden = false; if (btn) btn.textContent = '🙈 ซ่อนแชท';
  }
  // → { sources: [{ src, msgs, chunks, numbered }], idle: [แหล่งที่ไม่มีข้อความในช่วง] } หรือ { error }
  function collectMulti(pfx) {
    var st = _st[pfx];
    syncPaste(st, ($(pfx + '-src') || {}).value || '');
    if (!st.sources.length) return { error: 'เปิดไฟล์แชท หรือวางข้อความแชทก่อน' };
    var out = [], idle = [], err = '';
    st.sources.forEach(function (s) {
      var c = build(pfx, String(s.text || '').trim(), parsedSrc(s));
      if (c.empty) idle.push(s);
      else if (c.error) err = err || s.label + ': ' + c.error;
      else out.push(Object.assign(c, { src: s }));
    });
    if (err) return { error: err };
    if (!out.length) return { error: 'ไม่มีข้อความในช่วงวันที่ที่เลือก' };
    return { sources: out, idle: idle };
  }

  // แชทที่เป็นที่มาของรายการ → เวลาแจ้ง/เวลาจบ/ข้อความต้นทาง
  // ids = เลขข้อความที่ AI บอกว่าเกี่ยวกับเรื่องนี้โดยตรง → แสดงเฉพาะข้อความเหล่านั้น (ข้ามช่วง = ⋯)
  // ไม่มี ids → ใช้ช่วง first..last ทั้งช่วงเหมือนเดิม
  function excerpt(msgs, first, last, ids) {
    if (!msgs || !msgs.length) return { createdAt: '', endAt: '', whenLabel: '', chat: '' };
    var pick = (Array.isArray(ids) ? ids : []).map(function (n) { return parseInt(n, 10) - 1; })
      .filter(function (i, k, a) { return i >= 0 && i < msgs.length && a.indexOf(i) === k; })
      .sort(function (a, b) { return a - b; }).slice(0, 25);
    if (!pick.length) {
      var fi = Math.min(msgs.length - 1, Math.max(0, (parseInt(first, 10) || 1) - 1));
      var li = Math.min(msgs.length - 1, Math.max(fi, (parseInt(last, 10) || 0) - 1));
      for (var i = fi; i <= li && pick.length < 40; i++) pick.push(i);
    }
    var fm = msgs[pick[0]], lm = msgs[pick[pick.length - 1]];
    // view = สำหรับแสดงตอนตรวจทาน: ข้อความที่ AI ใช้ (key) + ข้อความข้างเคียง 1 ข้อความหน้า/หลัง (บริบท แสดงจาง)
    // chat (ข้อความที่บันทึกลงรายการ) ยังเป็นเฉพาะข้อความที่ AI ใช้เหมือนเดิม
    var keyOf = {}, idx = [];
    pick.forEach(function (i) { keyOf[i] = 1; });
    pick.forEach(function (i) { [i - 1, i, i + 1].forEach(function (j) { if (j >= 0 && j < msgs.length && idx.indexOf(j) < 0) idx.push(j); }); });
    idx.sort(function (a, b) { return a - b; });
    return {
      createdAt: msgIso(fm), endAt: msgIso(lm) || msgIso(fm),
      whenLabel: fmt(fm).match(/^\[([^\]]+)\]/)[1],
      chat: pick.map(function (i, k) { return (k && i > pick[k - 1] + 1 ? '⋯\n' : '') + fmt(msgs[i]); }).join('\n').slice(0, 3000),
      view: idx.slice(0, 60).map(function (i, k) { return { gap: k > 0 && i > idx[k - 1] + 1, key: !!keyOf[i], line: fmt(msgs[i]) }; }),
    };
  }
  // ชื่อผู้ส่งในแชท (เช่น "เอก BMS", "พี่เอก") → คนในรายชื่อ: ตรงชื่อ/ชื่อเล่น หรือมีชื่อเล่นเป็นคำหนึ่งในชื่อที่แสดง
  // (ตัดคำนำหน้า พี่/น้อง/คุณ ก่อนเทียบ) · ตรงหลายคน = ไม่แน่ใจ → null ไม่เดาเอาคนแรก
  function matchPerson(name, people) {
    var strip = function (s) { return String(s || '').trim().toLowerCase().replace(/^(พี่|น้อง|คุณ|นาย|นางสาว|นาง|ป้า|ลุง|น้า|อา)\s*/, ''); };
    var q = strip(name);
    if (!q) return null;
    var words = q.split(/[\s()\[\]\-_.,|/]+/).map(strip).filter(Boolean);
    var ps = people || [];
    var info = function (s) { return { nm: String(s.name || '').toLowerCase().trim(), nk: String(s.nickname || '').toLowerCase().trim() }; };
    var exact = ps.filter(function (s) { var x = info(s); return x.nm === q || (x.nk && x.nk === q); });
    if (exact.length) return exact.length === 1 ? exact[0] : null;
    var part = ps.filter(function (s) {
      var x = info(s);
      return (x.nm.length >= 3 && q.indexOf(x.nm) > -1) || (x.nk.length >= 2 && words.indexOf(x.nk) > -1);
    });
    return part.length === 1 ? part[0] : null;
  }

  window.lineChat = {
    parse: parse, msgIso: msgIso, fmt: fmt, groupFromFile: groupFromFile, matchPerson: matchPerson,
    panelHtml: panelHtml, bind: bind, preset: preset, setRange: setRange, file: file, scanSoon: scanSoon, scan: scan,
    collect: collect, excerpt: excerpt,
    sources: function (pfx) { return _st[pfx] ? _st[pfx].sources : []; },
    refreshSource: refreshSource, setGroup: setGroup, removeSource: removeSource, preview: preview,
  };

  // ══ 2) ตรวจทานผลที่ AI แยก ═══════════════════════════════════════════════
  // หน้าต่างขยาย: ซ้าย = รายชื่อกลุ่ม (เช่น โรงพยาบาล) + จำนวน/ไม่ครบ — กดแล้วขวาแสดงเรื่องของกลุ่มนั้นทันที (มีกลุ่มเดียว = ไม่มีแถบซ้าย)
  // ขวา = ตัวกรองสถานะ (ทั้งหมด / ข้อมูลไม่ครบ / อาจซ้ำ / ตัวกรองของโมดูล) + กล่องต่อกลุ่ม (เลือกทั้งกลุ่ม · พับ/กาง)
  // ในกล่องเรียง ข้อมูลไม่ครบ (เลือกช่องที่ขาดได้ในการ์ดเลย) → พร้อมสร้าง (แถวย่อ) → อาจซ้ำ (ไม่เลือกไว้) → สร้างแล้ว
  // กดที่เรื่อง = กางช่องแก้ไขทุกช่อง + แชทต้นทางในการ์ดนั้น (เปิดได้ทีละเรื่อง) · กดสร้าง = สร้างเลย ไม่มีหน้าต่างยืนยันซ้ำ
  // ค่าที่แก้เก็บในรายการ (cfg.items) โดยตรง ไม่อิง DOM
  //
  // cfg: modalId, step1Id, step2Id, reviewId, footId — ส่วนของหน้าต่าง (ขั้นที่ 1 = วางแชท, ขั้นที่ 2 = ตรวจทาน)
  //      items[]      — รายการ (ช่องของโมดูลเอง + whenLabel / chat / view / dup ที่ระบบใช้แสดง)
  //      unit         — คำเรียกสิ่งที่จะสร้าง เช่น 'Ticket' / 'รายการ'
  //      ctxHtml()    — ข้อความบริบทใต้หัวข้อ (เช่น จำนวนแหล่งแชท/โครงการ)
  //      title(x)     — หัวข้อการ์ด · missing(x) → [ชื่อช่องที่ยังขาด]
  //      card(x)      — { badges (HTML หน้าหัวข้อ), chips: [[ไอคอน, ชื่อช่อง, ค่า]], note (HTML ในช่องแก้ไข), done (แก้แล้ว) }
  //      group(x)     — (ไม่บังคับ) { key, title, sub } กลุ่มของรายการ · groupLabel = หัวแถบซ้าย
  //      bulk         — (ไม่บังคับ) [{ k, label, miss (ชื่อใน missing() ถ้าไม่ตรง label), type: 'select'|'text', options() → [[ค่า, ชื่อ]], list, after(x) }]
  //                     ช่องที่ "เลือกได้ในการ์ดที่ไม่ครบ" + ใช้กับเรื่องอื่นในกลุ่มเดียวกันที่ช่องนั้นยังว่าง
  //      filters      — [[key, label, fn]] ตัวกรองเฉพาะโมดูล (มี ทั้งหมด / ข้อมูลไม่ครบ / อาจซ้ำ ให้เสมอ)
  //      statusKey, statuses [{v, label, cls:'open'|'done'|''}] — ปุ่มสลับสถานะในแถว
  //      fields(x, i, h) — HTML ช่องแก้ไข (h = ตัวช่วยสร้างช่องที่ผูกค่ากับรายการแล้ว · h.fld(ชื่อ, html, 1) = ช่องต้องระบุ มี * แดง)
  //      afterFields(x, i) — (ไม่บังคับ) เรียกหลังวาดช่องแก้ไขแล้ว เช่น ผูก combobox
  //      beforeSave() → false = ยังไม่บันทึก · saveOne(x) — บันทึกทีละรายการ · onDone(made, todo) — เสร็จแล้ว
  var R = null;
  function mount(cfg) {
    R = cfg; R.filter = 'all'; R.gf = 'all'; R.closed = {}; R.cur = -1; R.applyAll = true;
    R.allFilters = [
      ['all', 'ทั้งหมด', null],
      ['need', 'ข้อมูลไม่ครบ', function (x) { return cfg.missing(x).length > 0; }],
      ['dup', 'อาจซ้ำ', function (x) { return !!x.dup; }],
    ].concat(cfg.filters || []);
    cfg.items.forEach(function (x) { if (x.sel === undefined) x.sel = !x.dup; });
    R.root = $(cfg.reviewId);
    R.root.innerHTML = '<div class="air"><div class="air-top"></div><div class="air-body"><nav class="air-side" aria-label="' + esc(cfg.groupLabel || 'กลุ่ม') + '"></nav>'
      + '<div class="air-main"><div class="air-fbar"></div><div class="air-list"></div></div></div></div>';
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
  function drawAll() { top(); side(); bar(); list(); foot(); }

  // ── กลุ่ม ──
  function gOf(x) { var g = R.group ? R.group(x) : null; return g && g.key ? g : { key: '_', title: '', sub: '' }; }
  function groups() {
    var out = [], by = {};
    R.items.forEach(function (x, i) {
      var g = gOf(x);
      if (!by[g.key]) { by[g.key] = { key: g.key, title: g.title, sub: g.sub, idx: [] }; out.push(by[g.key]); }
      by[g.key].idx.push(i);
    });
    return out;
  }
  function needOf(x) { return x.created ? [] : R.missing(x); }
  function kind(x) { return x.created ? 'made' : needOf(x).length ? 'need' : x.dup ? 'dup' : 'ok'; }
  var RANK = { need: 0, ok: 1, dup: 2, made: 3 };
  function inGf(x) { return R.gf === 'all' || gOf(x).key === R.gf; }
  function shown(x) { return inGf(x) && (x.created ? R.filter === 'all' : match(x, R.filter)); }

  function top() {
    var el = q('.air-top'); if (!el) return;
    var need = live().filter(function (x) { return needOf(x).length; }).length;
    el.innerHTML = '<button type="button" class="btn btn-ghost btn-sm" onclick="window.aiReview.back()" title="กลับไปแก้ข้อความ / ช่วงวันที่">‹ แชท</button>'
      + '<div class="air-head"><b>AI แยกได้ ' + R.items.length + ' เรื่อง</b>'
      + '<span>' + (R.ctxHtml ? R.ctxHtml() + ' · ' : '')
      + (need ? '<em>ข้อมูลไม่ครบ ' + need + ' เรื่อง</em> — เลือกช่องที่ขาดในการ์ดสีแดงได้เลย' : 'ข้อมูลครบแล้ว — ดูผ่าน ๆ แล้วกดสร้างได้เลย') + '</span></div>';
  }
  // แถบซ้าย: ทั้งหมด + ทีละกลุ่ม (จำนวนตามตัวกรองสถานะ · บอกว่ายังไม่ครบกี่เรื่อง)
  function side() {
    var el = q('.air-side'), rv = q('.air'), G = groups();
    if (!el || !rv) return;
    rv.classList.toggle('multi', G.length > 1);
    if (G.length < 2) { el.innerHTML = ''; return; }
    var row = function (key, title, its, gi) {
      var L = its.filter(function (x) { return !x.created; });
      var need = L.filter(function (x) { return needOf(x).length; }).length;
      var n = L.filter(function (x) { return match(x, R.filter); }).length;
      return '<button type="button" class="air-sbtn' + (R.gf === key ? ' on' : '') + '" aria-pressed="' + (R.gf === key) + '" onclick="window.aiReview.setGroupFilter(' + gi + ')">'
        + '<span class="air-sbtn-t"><b title="' + esc(title) + '">' + esc(title) + '</b>'
        + '<span class="' + (need ? 'need' : 'ok') + '">' + (!L.length ? 'สร้างแล้ว' : need ? 'ไม่ครบ ' + need + ' เรื่อง' : 'ครบแล้ว') + '</span></span>'
        + '<i>' + n + '</i></button>';
    };
    el.innerHTML = '<div class="air-side-h">' + esc(R.groupLabel || 'กลุ่ม') + '</div>'
      + row('all', 'ทั้งหมด', R.items, -1)
      + G.map(function (g, gi) { return row(g.key, g.title || 'ไม่ระบุ', g.idx.map(function (i) { return R.items[i]; }), gi); }).join('');
  }
  // ตัวกรองสถานะ — นับเฉพาะกลุ่มที่เลือกทางซ้าย · "ข้อมูลไม่ครบ" เป็นสีแดงเมื่อยังมีเรื่องที่ขาด
  function bar() {
    var el = q('.air-fbar'); if (!el) return;
    var base = R.items.filter(function (x) { return !x.created && inGf(x); });
    el.innerHTML = R.allFilters.map(function (t) {
      var n = base.filter(function (x) { return match(x, t[0]); }).length;
      return '<button type="button" class="air-fbtn' + (R.filter === t[0] ? ' on' : '') + (t[0] === 'need' && n ? ' warn' : '') + '" aria-pressed="' + (R.filter === t[0]) + '"'
        + ' onclick="window.aiReview.setFilter(\'' + t[0] + '\')">' + t[1] + '<b>' + n + '</b></button>';
    }).join('');
  }
  function chatHtml(chat) { return esc(chat).replace(/^(\[[^\]]+\])/gm, '<b>$1</b>'); }
  // แชทต้นทาง: view (ข้อความที่ AI ใช้ + ข้อความข้างเคียงแบบจาง) ถ้ามี · ไม่มีใช้ chat เดิม
  function chatView(x) {
    if (!Array.isArray(x.view) || !x.view.length) return chatHtml(x.chat || '');
    return x.view.map(function (v) {
      return (v.gap ? '<div class="air-c-gap">⋯</div>' : '') + '<div class="' + (v.key ? 'air-c-key' : 'air-c-ctx') + '">' + chatHtml(v.line) + '</div>';
    }).join('');
  }
  function segHtml(x, i) {
    if (!R.statuses) return '';
    return '<div class="air-seg" role="group" aria-label="สถานะ">' + R.statuses.map(function (s, k) {
      return '<button type="button" class="' + (x[R.statusKey] === s.v ? 'on ' + (s.cls || 'mid') : '') + '" onclick="window.aiReview.setStatus(' + i + ',' + k + ')">' + s.label + '</button>';
    }).join('') + '</div>';
  }
  // ช่องที่ขาดซึ่งเลือกได้ในการ์ดเลย (จาก cfg.bulk) · ช่องอื่นที่ขาด = ปุ่มเปิดช่องแก้ไข
  function quickHtml(x, i, miss) {
    var bs = (R.bulk || []).filter(function (b) { return miss.indexOf(b.miss || b.label) > -1; });
    var covered = bs.map(function (b) { return b.miss || b.label; });
    var rest = miss.filter(function (m) { return covered.indexOf(m) < 0; });
    var on = function (b) { return ' onchange="window.aiReview.quick(' + i + ',' + R.bulk.indexOf(b) + ',this.value)"'; };
    return '<div class="air-quick">'
      + bs.map(function (b) {
          var ctl = b.type === 'text'
            ? '<input class="f-input"' + (b.list ? ' list="' + b.list + '"' : '') + ' placeholder="พิมพ์' + esc(b.label) + '"' + on(b) + '>'
            : '<select class="f-input"' + on(b) + '><option value="">— เลือก —</option>' + (b.options ? b.options() : []).map(function (o) {
                return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>';
              }).join('') + '</select>';
          return '<label class="air-q-f"><span>' + esc(b.label) + '</span>' + ctl + '</label>';
        }).join('')
      + (rest.length ? '<button type="button" class="btn btn-ghost btn-sm" onclick="window.aiReview.select(' + i + ',true)">✏️ กรอก' + esc(rest.join(', ')) + '</button>' : '')
      + (bs.length ? '<label class="air-q-all"><input type="checkbox"' + (R.applyAll ? ' checked' : '') + ' onchange="window.aiReview.setApplyAll(this.checked)"> ใช้กับเรื่องอื่นในกลุ่มนี้ที่ยังว่าง</label>' : '')
      + '</div>';
  }
  // ช่องแก้ไขทุกช่อง + แชทต้นทาง (กางในการ์ด)
  function editHtml(x, i) {
    var miss = needOf(x), c = R.card(x);
    var h = { // ตัวช่วยสร้างช่องแก้ไข: txt = ช่องพิมพ์ (เก็บค่าเงียบ ๆ ไม่วาดใหม่ กันเคอร์เซอร์หลุด) · pick = ช่องเลือก (วาดใหม่ให้สถานะอัปเดต)
      fld: function (label, html, req) { return '<label class="air-f"><span>' + label + (req ? ' <b class="air-req">*</b>' : '') + '</span>' + html + '</label>'; },
      opt: function (v, label, sel) { return '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(label) + '</option>'; },
      bad: function (label) { return miss.indexOf(label) > -1 ? ' air-bad' : ''; },
      txt: function (k, req) { return (req ? ' data-req="1"' : '') + ' oninput="window.aiReview.set(' + i + ',\'' + k + '\',this.value,this)" onchange="window.aiReview.set(' + i + ',\'' + k + '\',this.value)"'; },
      pick: function (k) { return ' onchange="window.aiReview.set(' + i + ',\'' + k + '\',this.value)"'; },
    };
    return '<div class="air-edit-f">' + (c.note || '') + R.fields(x, i, h) + '</div>'
      + (x.chat ? '<div class="air-chat"><div class="air-chat-h">💬 แชทต้นทาง' + (Array.isArray(x.view) && x.view.length ? ' <span>ตัวหนา = ข้อความที่ AI ใช้สรุป</span>' : '') + '</div><div class="air-chat-b">' + chatView(x) + '</div></div>' : '');
  }
  function cardHtml(x, i) {
    var c = R.card(x), k = kind(x), on = i === R.cur, miss = needOf(x);
    var meta = (c.chips || []).map(function (ch) { return ch[2] ? esc(ch[2]) : ''; }).filter(Boolean).join(' · ');
    return '<div class="air-card k-' + k + (on ? ' on' : '') + (x.sel || x.created ? '' : ' off') + (c.done ? ' done' : '') + '" data-i="' + i + '">'
      + '<div class="air-row">'
      +   '<input type="checkbox" class="air-chk" aria-label="เลือกสร้างเรื่องนี้"' + (x.sel ? ' checked' : '') + (x.created ? ' disabled' : '') + ' onchange="window.aiReview.pick(' + i + ',this.checked)">'
      +   '<button type="button" class="air-row-main" aria-expanded="' + on + '" onclick="window.aiReview.select(' + i + ')">'
      +     '<span class="air-title">' + (c.badges || '') + '<span>' + esc(R.title(x) || '(ไม่มีรายละเอียด)') + '</span></span>'
      +     '<span class="air-oneline">' + (x.created ? '<b class="air-made">✔ สร้างแล้ว</b> · ' : '') + meta + (x.whenLabel ? (meta ? ' · ' : '') + 'แจ้ง ' + esc(x.whenLabel) : '') + '</span>'
      +   '</button>'
      +   (k === 'need' ? '<span class="air-miss-tag">ยังขาด: ' + esc(miss.join(', ')) + '</span>'
          : k === 'dup' ? '<button type="button" class="btn btn-ghost btn-sm air-dup-btn' + (x.sel ? ' on' : '') + '" onclick="window.aiReview.pick(' + i + ',' + !x.sel + ')">' + (x.sel ? 'ยกเลิกการสร้าง' : 'ไม่ซ้ำ สร้างด้วย') + '</button>'
          : k === 'ok' ? segHtml(x, i) : '')
      + '</div>'
      + (k === 'dup' ? '<div class="air-warn">⚠️ ' + esc(x.dup) + '</div>' : '')
      + (k === 'need' ? quickHtml(x, i, miss) : '')
      + (on ? '<div class="air-edit">' + editHtml(x, i) + '</div>' : '')
      + '</div>';
  }
  function list() {
    var el = q('.air-list'); if (!el) return;
    var G = groups(), multi = G.length > 1;
    var html = G.map(function (g, gi) {
      if (!inGf(R.items[g.idx[0]])) return '';
      var vis = g.idx.filter(function (i) { return shown(R.items[i]); })
        .sort(function (a, b) { return RANK[kind(R.items[a])] - RANK[kind(R.items[b])] || a - b; });
      if (!vis.length) return '';
      var one = R.gf !== 'all', open = one || !R.closed[g.key]; // เลือกกลุ่มทางซ้าย = กางเสมอ
      var its = g.idx.map(function (i) { return R.items[i]; }), L = its.filter(function (x) { return !x.created; });
      var pickable = L.filter(function (x) { return !x.dup; });
      var allOn = pickable.length > 0 && pickable.every(function (x) { return x.sel; });
      var need = L.filter(function (x) { return needOf(x).length; }).length;
      var dup = L.filter(function (x) { return x.dup; }).length;
      var done = L.filter(function (x) { return R.card(x).done; }).length;
      return '<section class="air-grp' + (open ? '' : ' shut') + '">'
        + '<div class="air-gh">'
        +   (pickable.length ? '<input type="checkbox" class="air-chk" aria-label="เลือกทั้งกลุ่ม" title="เลือก/ไม่เลือกทั้งกลุ่ม"' + (allOn ? ' checked' : '') + ' onchange="window.aiReview.pickGroup(' + gi + ',this.checked)">' : '')
        +   '<button type="button" class="air-gtog" aria-expanded="' + open + '"' + (one ? ' disabled' : ' onclick="window.aiReview.toggleGroup(' + gi + ')"') + '>'
        +     '<span class="air-gt"><b>' + esc(multi ? g.title || 'ไม่ระบุ' : 'ทุกเรื่อง') + '</b>' + (multi && g.sub ? '<span>' + esc(g.sub) + '</span>' : '') + '</span>'
        +     '<span class="air-gc"><span>' + its.length + ' เรื่อง</span>'
        +       (need ? '<span class="need">ไม่ครบ ' + need + '</span>' : '') + (dup ? '<span class="dup">อาจซ้ำ ' + dup + '</span>' : '')
        +       (done ? '<span class="done">แก้แล้ว ' + done + '</span>' : '') + '</span>'
        +     (one ? '' : '<span class="air-chev" aria-hidden="true">▾</span>')
        +   '</button>'
        + '</div>'
        + (open ? '<div class="air-gb">' + vis.map(function (i) { return cardHtml(R.items[i], i); }).join('') + '</div>' : '')
        + '</section>';
    }).join('');
    el.innerHTML = html || '<div class="air-empty">ไม่มีเรื่องในตัวกรองนี้ · <a href="javascript:void(0)" onclick="window.aiReview.setGroupFilter(-1,\'all\')">ดูทั้งหมด</a></div>';
    var x = R.items[R.cur];
    if (x && q('.air-card.on')) {
      if (R.afterFields) R.afterFields(x, R.cur);
      if (x.created) q('.air-card.on .air-edit').querySelectorAll('input, select, textarea').forEach(function (e) { e.disabled = true; });
    }
  }
  function foot() {
    if (!R) return;
    var f = $(R.footId); if (!f) return;
    var cancel = '<button class="btn btn-ghost" onclick="window.closeM(\'' + R.modalId + '\')">ยกเลิก</button>';
    if (!$(R.modalId).classList.contains('air-on')) {
      f.innerHTML = '<div style="flex:1"></div>' + cancel + (live().length ? '<button class="btn btn-ghost" onclick="window.aiReview.toReview()">ไปหน้าตรวจทาน ›</button>' : '');
      return;
    }
    var todo = R.items.filter(function (x) { return x.sel && !x.created; });
    var blocked = todo.filter(function (x) { return R.missing(x).length; }).length;
    var done = todo.filter(function (x) { return R.card(x).done; }).length;
    var by = {}, names = [];
    todo.forEach(function (x) { var t = gOf(x).title; if (!(t in by)) { by[t] = 0; names.push(t); } by[t]++; });
    var sum = !todo.length ? 'ยังไม่ได้เลือกเรื่องไหน'
      : names.length > 1 || names[0] ? names.map(function (t) { return esc(t || 'ไม่ระบุ') + ' ' + by[t]; }).join(' · ')
      : 'เลือกไว้ ' + todo.length + ' ' + esc(R.unit || 'รายการ');
    f.innerHTML = '<div class="air-sum"><b>' + sum + '</b><span>'
      + (blocked ? '<em>เติมข้อมูลที่ขาดก่อน ' + blocked + ' เรื่อง</em>' : done ? 'แก้แล้ว ' + done + ' เรื่อง (บันทึกเป็นปิดงาน)' : '') + '</span></div>'
      + cancel
      + '<button class="btn btn-pri air-save' + (blocked ? ' is-blocked' : '') + '" onclick="window.aiReview.save()"' + (todo.length ? '' : ' disabled') + '>💾 สร้าง ' + todo.length + ' ' + esc(R.unit || 'รายการ') + '</button>';
  }

  function scrollTop() { var l = q('.air-list'); if (l) l.scrollTop = 0; }
  function set(i, k, v, inputEl) {
    var x = R && R.items[i]; if (!x) return;
    x[k] = v;
    if (inputEl) { // กำลังพิมพ์ — ไม่วาดการ์ดใหม่ (กันเคอร์เซอร์หลุด) อัปเดตแค่กรอบแดง/ตัวนับ
      if (inputEl.dataset.req) inputEl.classList.toggle('air-bad', !String(v).trim());
      top(); side(); bar(); foot();
    } else drawAll();
  }
  // กดที่เรื่อง = กาง/พับช่องแก้ไข (force = กางเสมอ)
  function select(i, force) {
    R.cur = R.cur === i && !force ? -1 : i;
    list();
    var card = q('.air-card.on');
    if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
  }
  function pick(i, on) {
    var x = R && R.items[i]; if (!x || x.created) return;
    x.sel = !!on;
    drawAll();
  }
  // เลือก/ไม่เลือกทั้งกลุ่ม (ไม่รวมเรื่องที่อาจซ้ำ — เลือกทีละเรื่องเอง)
  function pickGroup(gi, on) {
    var g = groups()[gi]; if (!g) return;
    g.idx.forEach(function (i) { var x = R.items[i]; if (!x.created && !x.dup) x.sel = on; });
    drawAll();
  }
  function setFilter(f) { R.filter = f; drawAll(); scrollTop(); }
  // gi = -1 → ทุกกลุ่ม · f = เปลี่ยนตัวกรองสถานะด้วย (เช่น ล้างตัวกรอง)
  function setGroupFilter(gi, f) {
    var g = groups()[gi];
    R.gf = g ? g.key : 'all';
    if (f) R.filter = f;
    drawAll(); scrollTop();
  }
  function toggleGroup(gi) {
    var g = groups()[gi]; if (!g) return;
    R.closed[g.key] = !R.closed[g.key];
    list();
  }
  // เลือกช่องที่ขาดในการ์ด → ใช้กับเรื่องอื่นในกลุ่มเดียวกันที่ช่องนั้นยังว่างด้วย (ไม่ทับค่าที่มีแล้ว)
  function quick(i, bi, v) {
    var x = R && R.items[i], b = R && (R.bulk || [])[bi];
    v = String(v || '').trim();
    if (!x || !b || !v) return;
    var key = gOf(x).key, n = 0;
    R.items.forEach(function (y) {
      if (y.created) return;
      if (y !== x && !(R.applyAll && gOf(y).key === key && !String(y[b.k] || '').trim())) return;
      y[b.k] = v;
      if (b.after) b.after(y);
      if (y !== x) n++;
    });
    drawAll();
    if (n && window.showAlert) window.showAlert('เติม' + b.label + 'ให้อีก ' + n + ' เรื่องในกลุ่มเดียวกัน', 'success');
  }

  async function save() {
    if (!R) return;
    if (R.beforeSave && R.beforeSave() === false) return;
    var todo = R.items.filter(function (x) { return x.sel && !x.created; });
    if (!todo.length) return;
    var bad = todo.filter(function (x) { return R.missing(x).length; });
    if (bad.length) { // พาไปดูเรื่องที่ยังไม่ครบ
      R.filter = 'need'; R.gf = 'all'; R.closed = {};
      drawAll(); scrollTop();
      window.showAlert && window.showAlert('ยังมี ' + bad.length + ' เรื่องที่ข้อมูลไม่ครบ — เลือกช่องที่ขาดในการ์ดสีแดงก่อน', 'warn');
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
    mount: mount, reset: reset, set: set, select: select, pick: pick, pickGroup: pickGroup,
    setFilter: setFilter, setGroupFilter: setGroupFilter, toggleGroup: toggleGroup, quick: quick, save: save,
    setApplyAll: function (on) { if (R) { R.applyAll = !!on; list(); } },
    setStatus: function (i, k) { set(i, R.statusKey, R.statuses[k].v); },
    back: function () { step(1); },
    toReview: function () { if (R) step(2); },
  };
})();
