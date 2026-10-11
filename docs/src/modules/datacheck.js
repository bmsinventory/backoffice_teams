/**
 * datacheck.js — 🧹 ตรวจไฟล์ข้อมูลพื้นฐาน (แถบในเมนู ผู้ช่วยทีม · โมดูลสิทธิ์ 'datacheck')
 * วางไฟล์ Excel/CSV → 1) ยืนยันว่าแต่ละคอลัมน์เป็นข้อมูลแบบไหน (รหัส/ชื่อ/ตัวเลือก/ตัวเลข — ระบบเดาให้จากหัวคอลัมน์)
 * → 2) ตัดสินปัญหาทีละกลุ่ม (แยกตามปัญหา + คอลัมน์) — ให้ AI ช่วยดูทั้งกลุ่ม / ใช้ผล AI / ข้ามทั้งกลุ่ม ได้ในคลิกเดียว หรือตัดสินทีละช่อง
 *   ช่องที่ระบบแก้อักขระได้เองอยู่กลุ่ม "ระบบแก้ให้อัตโนมัติ" · ข้อมูลซ้ำ/ชื่อคล้ายอยู่หมวดตรวจเพิ่มเติม
 * → 3) ดาวน์โหลดไฟล์ที่แก้แล้ว: ช่องที่แก้/มีปัญหามี Comment บอกค่าเดิม + ชีต "ผลตรวจ" สรุปทุกจุด
 * ไฟล์ไม่ถูกส่งขึ้นเซิร์ฟเวอร์ — AI (ผ่าน backend /api/ai) เห็นเฉพาะแถวของช่อง/คู่ชื่อที่กดส่งไปถามเท่านั้น
 */
(function () {
  var esc = function (s) { return window.esc(s); };
  var ch = function (c) { return String.fromCharCode(c); };
  var rx = function (src, f) { return new RegExp(src, f == null ? 'g' : f); };

  // ── สถานะไฟล์ที่เปิดอยู่ (คงไว้ตอนสลับแถบไปมา) ──
  var S = { name: '', note: '', wb: null, sheet: '', aoa: [], base: { r: 0, c: 0 }, hdr: 0, cols: [],
            forbid: '\' " \\ |', thr: 0.85, res: null, view: '', limit: 50, ai: {}, cellAi: {}, dec: {}, step: 'cols', aiBusy: false, busy: false };

  // ══ กฎตรวจอักขระ — เรียงตามลำดับที่แก้ (แก้ตัวก่อนหน้าแล้วค่อยตรวจตัวถัดไป) ══
  // label = ปัญหาที่เจอ · fix = ระบบแก้อะไรให้ (มี to/fn) · how = ผู้ใช้ต้องทำอะไร (แก้อัตโนมัติไม่ได้)
  // when = ตรวจเฉพาะเมื่อทั้งช่องตรงเงื่อนไข
  var TH_MARK = '\\u0E31\\u0E34-\\u0E3A\\u0E47-\\u0E4E';   // สระบน/ล่าง + วรรณยุกต์ (ต้องเกาะพยัญชนะ)
  var ZW_RE = rx('[\\u200B-\\u200D\\u2060\\uFEFF\\u00AD]');
  // ตัวอักษรรัสเซีย/กรีกที่หน้าตาเหมือนภาษาอังกฤษ → ตัวอังกฤษ
  var HOMO = {};
  [[0x410,'A'],[0x412,'B'],[0x415,'E'],[0x41A,'K'],[0x41C,'M'],[0x41D,'H'],[0x41E,'O'],[0x420,'P'],[0x421,'C'],[0x422,'T'],[0x425,'X'],
   [0x430,'a'],[0x435,'e'],[0x43E,'o'],[0x440,'p'],[0x441,'c'],[0x443,'y'],[0x445,'x'],[0x406,'I'],[0x456,'i'],[0x408,'J'],[0x458,'j'],
   [0x391,'A'],[0x392,'B'],[0x395,'E'],[0x396,'Z'],[0x397,'H'],[0x399,'I'],[0x39A,'K'],[0x39C,'M'],[0x39D,'N'],[0x39F,'O'],[0x3A1,'P'],
   [0x3A4,'T'],[0x3A5,'Y'],[0x3A7,'X'],[0x3BF,'o']].forEach(function (p) { HOMO[ch(p[0])] = p[1]; });
  var HOMO_RE = rx('[' + Object.keys(HOMO).map(function (c) { return '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4); }).join('') + ']');

  var RULES = [
    { id:'mojibake', label:'ภาษาไทยเพี้ยน (ไฟล์บันทึกผิด encoding)', how:'พิมพ์ข้อความช่องนี้ใหม่ หรือบันทึกไฟล์ต้นฉบับใหม่เป็น UTF-8', re:rx('\\u00E0[\\u00B8\\u00B9][\\u0080-\\u00FF]?') },
    { id:'broken',   label:'มีตัวอักษรเสีย (�)', how:'พิมพ์ข้อความช่องนี้ใหม่', re:rx('\\uFFFD+') },
    { id:'ctrl',     label:'มีการขึ้นบรรทัดใหม่/แท็บในช่อง', fix:'เปลี่ยนการขึ้นบรรทัด/แท็บเป็นเว้นวรรค', re:rx('[\\u0000-\\u001F\\u007F-\\u009F]+'), to:' ' },
    { id:'zw',       label:'มีอักขระที่มองไม่เห็น', fix:'ลบอักขระที่มองไม่เห็นออก', re:rx('[\\u200B-\\u200D\\u2060\\uFEFF\\u00AD]+'), to:'' },
    { id:'nbsp',     label:'มีเว้นวรรคแบบพิเศษ (NBSP)', fix:'เปลี่ยนเว้นวรรคพิเศษเป็นเว้นวรรคปกติ', re:rx('[\\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000]+'), fn:function (m) { return m.replace(/[^]/g, ' '); } },
    { id:'fullwidth', label:'ตัวอักษร/ตัวเลขแบบเต็มความกว้าง', fix:'เปลี่ยนเป็นตัวอักษร/ตัวเลขปกติ', re:rx('[\\uFF01-\\uFF5E]+'), fn:function (m) { return m.replace(/[^]/g, function (c) { return ch(c.charCodeAt(0) - 0xFEE0); }); } },
    { id:'quote',    label:'เครื่องหมายคำพูดแบบโค้ง', fix:'เปลี่ยนเป็นเครื่องหมายคำพูดปกติ', re:rx('[\\u2018-\\u201F\\u2032\\u2033]'), fn:function (m) { return rx('[\\u201C-\\u201F\\u2033]', '').test(m) ? '"' : '\''; } },
    { id:'dash',     label:'ขีดแบบพิเศษ (– —)', fix:'เปลี่ยนเป็นขีด - ปกติ', re:rx('[\\u2010-\\u2015\\u2212]'), to:'-' },
    { id:'homo',     label:'ตัวอักษรรัสเซีย/กรีกที่หน้าตาเหมือนภาษาอังกฤษ', fix:'เปลี่ยนเป็นตัวอักษรภาษาอังกฤษ', re:HOMO_RE, fn:function (m) { return HOMO[m]; }, when:/[A-Za-z]/ },
    { id:'sara_am',  label:'สระอำพิมพ์แยกเป็น ํ + า', fix:'รวม ํ + า เป็นสระอำ', re:rx('\\u0E4D([\\u0E48-\\u0E4B]?)\\u0E32'), to:'$1' + ch(0x0E33) },
    { id:'sara_ae',  label:'สระแอพิมพ์เป็น เ + เ', fix:'เปลี่ยน เ + เ เป็นสระแอ', re:rx('\\u0E40\\u0E40'), to:ch(0x0E41) },
    { id:'th_order', label:'พิมพ์วรรณยุกต์ก่อนสระ', fix:'สลับวรรณยุกต์ไปไว้หลังสระ', re:rx('([\\u0E48-\\u0E4C])([\\u0E31\\u0E34-\\u0E3A])'), to:'$2$1' },
    { id:'th_dup',   label:'สระ/วรรณยุกต์ซ้อนซ้ำ', fix:'ลบสระ/วรรณยุกต์ที่ซ้ำออก', re:rx('([' + TH_MARK + '])\\1+'), to:'$1' },
    { id:'th_orphan', label:'สระ/วรรณยุกต์ลอย (ไม่มีพยัญชนะนำ)', how:'ลบสระ/วรรณยุกต์ที่ลอยอยู่ หรือพิมพ์คำนี้ใหม่', re:rx('(?:^|(?<=[^\\u0E01-\\u0E2E' + TH_MARK + ']))[' + TH_MARK + ']+') },
    { id:'emoji',    label:'มีอีโมจิ/สัญลักษณ์ภาพ', how:'ลบอีโมจิออก', re:rx('\\p{Extended_Pictographic}', 'gu') },
    { id:'forbid',   label:'มีอักขระต้องห้าม', how:'ลบหรือเปลี่ยนอักขระที่ไฮไลต์', re:null },     // สร้างจากช่อง "อักขระต้องห้าม" (forbidRe)
    { id:'dblspace', label:'เว้นวรรคซ้อนหลายช่อง', fix:'ลดเว้นวรรคซ้อนเหลือช่องเดียว', re:/ {2,}/g, to:' ' },
    { id:'trim',     label:'มีเว้นวรรคหน้า/ท้าย', fix:'ลบเว้นวรรคหน้า/ท้ายออก', re:/^ +| +$/g, to:'' },
  ];
  // กฎเฉพาะคอลัมน์รหัส (ติ๊ก "ห้ามซ้ำ") — เตือนให้ตรวจเอง ไม่แก้ให้
  var CODE_RULES = [
    { id:'code_space', label:'รหัสมีเว้นวรรคข้างใน', how:'ตรวจว่ารหัสควรมีเว้นวรรคหรือไม่', re:/\S \S/g },
    { id:'code_th',    label:'รหัสมีตัวอักษรไทยปน', how:'ตรวจว่าพิมพ์ภาษาไทยปนโดยไม่ตั้งใจหรือไม่', re:rx('[\\u0E00-\\u0E7F]+'), when:/[A-Za-z0-9]/ },
    { id:'code_o0',    label:'ตัว O / I / l ติดกับตัวเลข', how:'ตรวจว่าเป็นตัวอักษร O, I หรือตัวเลข 0, 1', re:/(?<=\d)[OoIl]|[OoIl](?=\d)/g },
  ];
  var LABEL = {};
  RULES.concat(CODE_RULES).forEach(function (r) { LABEL[r.id] = r; });
  LABEL.empty   = { label:'ช่องนี้ห้ามว่าง', how:'กรอกข้อมูลช่องนี้' };
  LABEL.num_fmt = { label:'ตัวเลขมีจุลภาค/หน่วยปน', fix:'ตัดจุลภาค/หน่วยออก เหลือแต่ตัวเลข' };
  LABEL.num_bad = { label:'ไม่ใช่ตัวเลข', how:'แก้ให้เป็นตัวเลข' };
  function isFix(c) { return !!(LABEL[c] && LABEL[c].fix); }

  function forbidRe() {
    var cs = Array.from(new Set(String(S.forbid || '').replace(/\s+/g, '').split('')));
    return cs.length ? new RegExp('[' + cs.map(function (c) { return c.replace(/[\]\\^-]/g, '\\$&'); }).join('') + ']+', 'g') : null;
  }

  // ตรวจ + แก้ค่าในช่องเดียว → { fixed, codes:[id], left (มีที่ต้องแก้เอง), marks:[[start,end]] (ตำแหน่งในค่าเดิม) }
  function checkText(v, col, fre) {
    var out = { fixed: v, codes: [], left: false, marks: [] };
    var cur = v;
    RULES.concat(col.unique ? CODE_RULES : []).forEach(function (r) {
      var re = r.id === 'forbid' ? fre : r.re;
      if (!re || (r.when && !r.when.test(cur))) return;
      re.lastIndex = 0;
      if (!re.test(cur)) return;
      out.codes.push(r.id);
      // ไฮไลต์ตำแหน่งในค่าเดิม (ตรวจค่าเดิมอีกรอบ — กฎที่เกิดหลังแก้ เช่น เว้นวรรคซ้อนจาก NBSP ก็ยังชี้ได้)
      re.lastIndex = 0;
      var m;
      while ((m = re.exec(v))) { out.marks.push([m.index, m.index + Math.max(1, m[0].length)]); if (!m[0].length) re.lastIndex++; }
      re.lastIndex = 0;
      if (r.fix) cur = cur.replace(re, r.fn || r.to);
      else out.left = true;
    });
    if (cur !== v) cur = cur.normalize('NFC');
    out.fixed = cur;
    return out;
  }

  // ── ค่าที่ใช้เทียบซ้ำ: หลังแก้อักขระ + ตัวเล็ก · loose = ตัดเว้นวรรค/เครื่องหมายทั้งหมด ──
  function keyOf(s) { return String(s).toLowerCase(); }
  function looseOf(s) { return String(s).toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ''); }
  function numSig(s) { return (String(s).match(/\d+(?:[.,]\d+)?/g) || []).map(function (n) { return n.replace(',', '.').replace(/^0+(?=\d)/, ''); }).join('|'); }

  // ══ อ่านไฟล์ ══
  function decodeText(buf) {
    try { return { t: new TextDecoder('utf-8', { fatal: true }).decode(buf), enc: '' }; }
    catch (e) {
      try { return { t: new TextDecoder('windows-874').decode(buf), enc: 'ไฟล์ CSV นี้เข้ารหัสแบบ TIS-620 / Windows-874 — ระบบแปลงให้อ่านได้แล้ว' }; }
      catch (e2) { return { t: new TextDecoder('utf-8').decode(buf), enc: '' }; }
    }
  }
  window.dcPick = function () { var i = document.getElementById('dc-file'); if (i) { i.value = ''; i.click(); } };
  window.dcDrop = function (e) {
    e.preventDefault();
    var z = document.getElementById('dc-drop'); if (z) z.classList.remove('over');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) window.dcLoad(f);
  };
  window.dcDrag = function (e, on) { e.preventDefault(); var z = document.getElementById('dc-drop'); if (z) z.classList.toggle('over', on); };
  window.dcLoad = async function (f) {
    if (!f) return;
    if (!/\.(xlsx|xlsm|xls|csv|tsv|txt)$/i.test(f.name)) { window.showAlert('รองรับไฟล์ .xlsx .xls .csv เท่านั้น', 'warn'); return; }
    if (f.size > 30 * 1024 * 1024) { window.showAlert('ไฟล์ใหญ่เกิน 30 MB — แบ่งไฟล์ก่อนตรวจ', 'warn'); return; }
    if (!(await window.LibLoader.need('xlsx'))) return;
    setBody('<div class="dc-card dc-wait">⏳ กำลังอ่านไฟล์ ' + esc(f.name) + '…</div>');
    try {
      var buf = await f.arrayBuffer(), wb, note = '';
      if (/\.(csv|tsv|txt)$/i.test(f.name)) {
        var d = decodeText(buf);
        note = d.enc;
        // raw:true = เก็บทุกช่องเป็นข้อความตามไฟล์ (รหัสที่ขึ้นต้นด้วย 0 ไม่หาย)
        wb = window.XLSX.read(d.t.replace(rx('^\uFEFF', ''), ''), { type: 'string', raw: true, FS: /\.tsv$/i.test(f.name) ? '\t' : undefined });
      } else {
        wb = window.XLSX.read(buf, { type: 'array', cellDates: true });
      }
      Object.assign(S, { name: f.name, note: note, wb: wb, res: null, ai: {}, cellAi: {}, dec: {}, step: 'cols', view: '' });
      useSheet(wb.SheetNames[0]);
    } catch (e) {
      S.wb = null;
      window.showAlert('อ่านไฟล์ไม่สำเร็จ: ' + (e.message || e), 'error');
      render(); return;
    }
    render();
  };
  function useSheet(name) {
    var ws = S.wb.Sheets[name];
    S.sheet = name;
    S.aoa = ws && ws['!ref'] ? window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true }) : [];
    var rg = ws && ws['!ref'] ? window.XLSX.utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 } };
    S.base = { r: rg.s.r, c: rg.s.c };
    // หัวตาราง = แถวแรก (ใน 20 แถวแรก) ที่มีข้อมูลตั้งแต่ 2 ช่อง
    var h = 0;
    for (var i = 0; i < Math.min(20, S.aoa.length); i++) {
      if (S.aoa[i].filter(function (x) { return String(x).trim() !== ''; }).length >= 2) { h = i; break; }
    }
    setHeader(h);
  }
  function setHeader(h) {
    S.hdr = Math.max(0, Math.min(h, Math.max(0, S.aoa.length - 1)));
    var hr = S.aoa[S.hdr] || [], n = 0;
    S.aoa.forEach(function (r) { n = Math.max(n, r.length); });
    S.cols = [];
    for (var c = 0; c < n; c++) {
      var name = String(hr[c] == null ? '' : hr[c]).trim() || ('คอลัมน์ ' + colLetter(c));
      var seen = {}, sm = [];
      for (var r = S.hdr + 1; r < S.aoa.length && sm.length < 3 && r < S.hdr + 300; r++) {
        var v = S.aoa[r][c];
        v = v instanceof Date ? v.toLocaleDateString('th-TH') : String(v == null ? '' : v).trim();
        if (v && !seen[v]) { seen[v] = 1; sm.push(cut(v, 40)); }
      }
      S.cols.push(guessCol(c, name, sm.join(' · ')));
    }
    S.res = null; S.ai = {}; S.cellAi = {}; S.dec = {};
  }

  // ══ ขั้นที่ 1: ผู้ใช้ยืนยันว่าแต่ละคอลัมน์เป็นข้อมูลแบบไหน → กำหนดว่าตรวจอะไร ══
  // เลือกผิด (เช่น ตั้งคอลัมน์ชื่อเป็นรหัส) = เตือนเรื่องที่ไม่ใช่ปัญหาเป็นร้อยช่อง จึงให้ยืนยันก่อนตรวจ
  var ROLES = [
    { id: 'code',   label: 'รหัส',         d: 'ห้ามซ้ำ ห้ามเว้นวรรค ห้ามมีภาษาไทยปน' },
    { id: 'name',   label: 'ชื่อ',          d: 'แก้อักขระพิเศษ และหาชื่อที่คล้ายกัน (อาจบันทึกซ้ำ)' },
    { id: 'choice', label: 'ตัวเลือก',      d: 'ค่าซ้ำกันได้ เช่น หน่วยนับ ประเภท — แก้อักขระพิเศษ' },
    { id: 'num',    label: 'ตัวเลข',       d: 'ตัดจุลภาค/หน่วยออก เตือนค่าที่ไม่ใช่ตัวเลข' },
    { id: 'text',   label: 'ข้อความทั่วไป', d: 'แก้อักขระพิเศษอย่างเดียว' },
    { id: 'skip',   label: 'ไม่ตรวจ',       d: 'ข้ามคอลัมน์นี้' },
  ];
  function roleLabel(id) { var r = ROLES.filter(function (x) { return x.id === id; })[0]; return r ? r.label : id; }
  function setRole(col, role) {
    col.role = role;
    col.chars = role !== 'num' && role !== 'skip';
    col.unique = role === 'code';
    col.similar = role === 'name';
    col.number = role === 'num';
    if (role === 'skip') col.required = false;
  }
  // เดาจากชื่อหัวคอลัมน์ ("ประเภทรายการ" = ตัวเลือก ต้องเช็คก่อนคำว่า "รายการ")
  function guessCol(i, name, sample) {
    var n = name.toLowerCase().trim(), role = 'text';
    if (/^(ลำดับ(ที่)?|ที่|no\.?|#|seq)$/.test(n)) role = 'skip';
    else if (/รหัส|code|sku|barcode|บาร์โค้ด|\bid\b/.test(n)) role = 'code';
    else if (/ชื่อ|name|desc|รายละเอียด/.test(n)) role = 'name';
    else if (/ราคา|price|cost|ทุน|จำนวน|qty|quantity|ขั้นต่ำ|สูงสุด|min|max|อัตรา|rate|มูลค่า/.test(n)) role = 'num';
    else if (/ประเภท|หมวด|กลุ่ม|หน่วย|unit|type|category|class|สถานะ|status/.test(n)) role = 'choice';
    else if (/รายการ/.test(n)) role = 'name';
    var col = { i: i, name: name, sample: sample, guess: role,
                required: (role === 'code' && !/barcode|บาร์โค้ด/.test(n)) || role === 'name' };
    setRole(col, role);
    return col;
  }
  function colLetter(c) { return window.XLSX ? window.XLSX.utils.encode_col(S.base.c + c) : String(c + 1); }
  function rowNo(i) { return S.base.r + i + 1; }
  function dataRows() {
    var n = 0;
    for (var i = S.hdr + 1; i < S.aoa.length; i++) if (S.aoa[i].some(function (x) { return String(x).trim() !== ''; })) n++;
    return n;
  }

  window.dcSheet = function (v) { useSheet(v); S.step = 'cols'; render(); };
  window.dcHeader = function (v) { setHeader((parseInt(v, 10) || 1) - S.base.r - 1); S.step = 'cols'; render(); };
  window.dcRole = function (i, role) { var c = S.cols[i]; if (c) { setRole(c, role); render(); } };
  window.dcReq = function (i, on) { var c = S.cols[i]; if (c) { c.required = on; render(); } };
  window.dcOpt = function (k, v) { S[k] = k === 'thr' ? parseFloat(v) : v; };
  window.dcStep = function (s) { S.step = s; render(); };
  window.dcStart = function () { S.step = 'review'; run(); };
  // ปุ่มในกล่อง "ต้นเหตุ" — เปลี่ยนบทบาท/ห้ามว่างของคอลัมน์แล้วตรวจใหม่ (คำตัดสินช่องอื่นยังอยู่)
  window.dcFixRole = function (c, role) { var col = S.cols[c]; if (col) { setRole(col, role); run(); } };
  window.dcFixReq = function (c) { var col = S.cols[c]; if (col) { col.required = false; run(); } };
  window.dcReset = function () { Object.assign(S, { name: '', wb: null, aoa: [], cols: [], res: null, ai: {}, cellAi: {}, dec: {} }); render(); };

  // ══ ตรวจ ══
  async function run() {
    if (S.busy) return;
    S.busy = true; render();
    await tick();
    try {
      var fre = forbidRe();
      var res = { rows: 0, cells: [], dups: [], sims: [], cellAt: {}, dupAt: {} };
      var keys = {}, simItems = {};
      for (var i = S.hdr + 1; i < S.aoa.length; i++) {
        var row = S.aoa[i];
        if (!row.some(function (x) { return String(x).trim() !== ''; })) continue;
        res.rows++;
        S.cols.forEach(function (col) {
          var raw = row[col.i], cell = null, val;
          if (raw instanceof Date || typeof raw === 'boolean') return;
          val = raw == null ? '' : String(raw);
          var mk = function () { return cell || (cell = { r: i, c: col.i, v: val, fixed: val, codes: [], left: false, marks: [] }); };
          if (typeof raw === 'string' && col.chars && val) {
            var ck = checkText(val, col, fre);
            if (ck.codes.length) cell = { r: i, c: col.i, v: val, fixed: ck.fixed, codes: ck.codes, left: ck.left, marks: ck.marks };
            val = ck.fixed;
          } else if (typeof raw === 'string') {
            val = val.replace(ZW_RE, '').replace(/\s+/g, ' ').trim();
          }
          if (col.number && typeof raw === 'string' && val.trim()) {
            var t = val.replace(/[,\s฿]|บาท/g, '');
            if (/^-?\d+(\.\d+)?$/.test(t)) { if (t !== val) { mk().codes.push('num_fmt'); cell.fixed = Number(t); } }
            else { mk().codes.push('num_bad'); cell.left = true; }
          }
          if (col.required && !String(val).trim()) { mk().codes.push('empty'); cell.left = true; }
          if (cell) { res.cells.push(cell); res.cellAt[i + ':' + col.i] = cell; }
          var s = String(val).trim();
          if (s && (col.unique || col.similar)) {
            var kk = col.i + '|' + keyOf(s);
            (keys[kk] = keys[kk] || []).push({ r: i, v: raw == null ? '' : String(raw), s: s });
          }
          if (s && col.similar) (simItems[col.i] = simItems[col.i] || []).push({ r: i, s: s });
        });
        if (i % 2000 === 0) await tick();
      }
      // ข้อมูลซ้ำ (ค่าเดียวกันหลังแก้อักขระ / ไม่สนตัวพิมพ์เล็กใหญ่)
      Object.keys(keys).forEach(function (k) {
        var g = keys[k];
        if (g.length < 2) return;
        var c = parseInt(k, 10);
        var d = { c: c, items: g, hidden: g.some(function (x) { return x.v !== g[0].v; }) };
        res.dups.push(d);
        g.forEach(function (x) { res.dupAt[x.r + ':' + c] = d; });
      });
      res.dups.sort(function (a, b) { return a.c - b.c || a.items[0].r - b.items[0].r; });
      // ชื่อคล้ายกัน
      var cols = Object.keys(simItems);
      for (var ci = 0; ci < cols.length; ci++) res.sims = res.sims.concat(await similarPairs(simItems[cols[ci]], S.thr, +cols[ci]));
      res.sims.sort(function (a, b) { return b.sim - a.sim; });
      res.simCut = res.sims.length > 3000;
      if (res.simCut) res.sims = res.sims.slice(0, 3000);
      // คำตัดสินเดิมที่ค่ายังเหมือนเดิม ใช้ต่อ (ตรวจใหม่หลังกดปุ่มในกล่องต้นเหตุ)
      res.cells.forEach(function (x) {
        x.sys = x.fixed; x.dec = '';
        var d = S.dec[cellKey(x)];
        if (d && d.v === x.v) setDec(x, d);
      });
      Object.keys(S.dec).forEach(function (k) { var x = res.cellAt[k]; if (!x || x.v !== S.dec[k].v) delete S.dec[k]; });
      buildGroups(res);
      S.res = res; S.limit = 50; S.ai = {};
      if (!res.groupAt[S.view] || (S.view !== 'auto' && !remainOf(res.groupAt[S.view]))) S.view = firstView(res);
    } finally {
      S.busy = false;
      render();
    }
  }
  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

  // ══ กลุ่มปัญหา: ช่องที่ต้องตัดสิน แยกตาม ปัญหาแรกที่ต้องแก้เอง + คอลัมน์ · ช่องที่ระบบแก้ได้หมดอยู่กลุ่ม auto ══
  function groupOf(x) {
    for (var i = 0; i < x.codes.length; i++) if (!isFix(x.codes[i])) return x.codes[i] + '|' + x.c;
    return 'auto';
  }
  function buildGroups(res) {
    var map = { auto: { key: 'auto', code: 'auto', c: -1, cells: [] } }, list = [];
    res.cells.forEach(function (x) {
      var k = x.left ? groupOf(x) : 'auto';
      if (!map[k]) { var p = k.split('|'); map[k] = { key: k, code: p[0], c: +p[1], cells: [] }; list.push(map[k]); }
      map[k].cells.push(x);
    });
    res.groups = list.sort(function (a, b) { return b.cells.length - a.cells.length || a.c - b.c; });
    res.auto = map.auto;
    res.total = list.reduce(function (a, g) { return a + g.cells.length; }, 0);
    map.dup = { key: 'dup' }; map.sim = { key: 'sim' };
    res.groupAt = map;
  }
  function remainOf(g) { return g.cells && g.key !== 'auto' ? g.cells.filter(function (x) { return !x.dec; }).length : 0; }
  function firstView(res) {
    var g = res.groups.filter(remainOf)[0];
    return g ? g.key : res.auto.cells.length ? 'auto' : res.dups.length ? 'dup' : 'sim';
  }

  // จับคู่ชื่อคล้าย: Dice ของ bigram ≥ thr · ต้องมีตัวเลขชุดเดียวกัน (500mg ≠ 250mg) · ค่าซ้ำตรงตัวไม่นับ (อยู่ในหมวดซ้ำแล้ว)
  // แบ่งกลุ่มตามชุดตัวเลข + ดัชนี bigram → ไม่ต้องเทียบทุกคู่
  async function similarPairs(items, thr, c) {
    var blocks = {}, out = [], seenKey = {};
    items.forEach(function (it) {
      var k = keyOf(it.s);
      if (seenKey[k]) return;                       // ค่าซ้ำตรงตัว — ใช้ตัวแรกเป็นตัวแทน
      seenKey[k] = 1;
      it.l = looseOf(it.s);
      if (it.l.length < 3) return;
      var bg = {}; for (var i = 0; i < it.l.length - 1; i++) bg[it.l.substr(i, 2)] = 1;
      it.bg = Object.keys(bg);
      var sig = numSig(it.s);
      (blocks[sig] = blocks[sig] || []).push(it);
    });
    var done = 0;
    for (var sig in blocks) {
      var list = blocks[sig], idx = {};
      for (var j = 0; j < list.length; j++) {
        var a = list[j], cnt = {};
        a.bg.forEach(function (g) { (idx[g] || []).forEach(function (p) { cnt[p] = (cnt[p] || 0) + 1; }); });
        for (var p in cnt) {
          var b = list[p], sim = 2 * cnt[p] / (a.bg.length + b.bg.length);
          if (sim >= thr) out.push({ c: c, a: b.r, b: a.r, va: b.s, vb: a.s, sim: sim, loose: a.l === b.l });
        }
        a.bg.forEach(function (g) { (idx[g] = idx[g] || []).push(j); });
        if (++done % 300 === 0) await tick();
        if (out.length > 5000) return out;
      }
    }
    return out;
  }

  // ══ AI ตัดสินคู่ชื่อคล้าย — ส่งทีละชุด ทีละไม่เกิน 100 คู่ต่อการกด ══
  function pairKey(p) { return p.c + ':' + p.a + ':' + p.b; }
  window.dcAi = async function () {
    if (S.aiBusy || !S.res) return;
    var todo = S.res.sims.filter(function (p) { return !S.ai[pairKey(p)]; }).slice(0, 100);
    if (!todo.length) { window.showToast('AI ตรวจครบทุกคู่แล้ว', 'success'); return; }
    S.aiBusy = true; render();
    var sys = 'คุณเป็นผู้ตรวจข้อมูลพื้นฐาน (master data) ของระบบคลังสินค้า/เวชภัณฑ์/วัสดุในโรงพยาบาล '
      + 'ตัดสินว่าแต่ละคู่เป็น "รายการเดียวกันที่บันทึกซ้ำ" หรือไม่ '
      + 'ถ้าต่างกันที่ ขนาด ความแรง สี รุ่น ยี่ห้อ ขนาดบรรจุ เพศ/ข้าง (ซ้าย/ขวา) หรือชนิดย่อย ให้ถือว่าคนละรายการ '
      + 'ถ้าต่างกันแค่การสะกด ภาษาไทย/อังกฤษ ตัวย่อ เว้นวรรค หรือเครื่องหมาย ให้ถือว่ารายการเดียวกัน\n'
      + 'ตอบ JSON เท่านั้น: {"r":[{"i":1,"v":"same|diff|unsure","why":"เหตุผลสั้น ๆ ภาษาไทยไม่เกิน 15 คำ"}]}';
    var ok = 0;
    try {
      for (var k = 0; k < todo.length; k += 12) {
        var batch = todo.slice(k, k + 12);
        setAiStatus('🤖 AI กำลังตรวจคู่ที่ ' + (k + 1) + '–' + (k + batch.length) + ' จาก ' + todo.length + '…');
        var user = batch.map(function (p, n) { return (n + 1) + ') A: ' + p.va + '  |  B: ' + p.vb; }).join('\n');
        var out = await window.aiChatJson(sys, user, { maxTokens: 900, temperature: 0 });
        (Array.isArray(out.r) ? out.r : []).forEach(function (x) {
          var p = batch[(parseInt(x.i, 10) || 0) - 1];
          if (!p) return;
          S.ai[pairKey(p)] = { v: /^(same|diff|unsure)$/.test(x.v) ? x.v : 'unsure', why: String(x.why || '').slice(0, 120) };
          ok++;
        });
      }
    } catch (e) {
      window.showAlert('AI ตรวจไม่สำเร็จ: ' + (e.message || e), 'error');
    } finally {
      S.aiBusy = false;
      render();
      if (ok) window.showToast('AI ตรวจแล้ว ' + ok + ' คู่', 'success');
    }
  };
  function setAiStatus(t) { var el = document.getElementById('dc-ai-st'); if (el) el.textContent = t; }

  // ══ AI วิเคราะห์ช่องในกลุ่ม — เสนอค่าที่ถูก · ยืนยันว่าไม่ต้องแก้ · หรือบอกว่าต้องให้คนดู ══
  // ส่งครั้งละไม่เกิน 600 ช่องต่อการกด · ชุดละ 15 ช่อง ยิงพร้อมกัน 3 ชุด · AI เห็นค่าช่องนั้น + ช่องอื่นในแถวเดียวกัน
  function cellKey(x) { return x.r + ':' + x.c; }
  function cut(s, n) { s = String(s == null ? '' : s).trim(); return s.length > n ? s.slice(0, n) + '…' : s; }
  // ผล AI ของช่อง — ใช้ได้เฉพาะเมื่อค่าในไฟล์ยังเป็นค่าเดียวกับที่ส่งไปถาม
  function aiOf(x) { var a = S.cellAi[cellKey(x)]; return a && a.src === x.v ? a : null; }
  // ช่องอื่นในแถว (ค่าหลังแก้) ให้ AI รู้ว่าเป็นรายการอะไร / อนุมานช่องที่ว่างได้
  function rowCtx(r, skip) {
    return S.cols.filter(function (c) { return c.i !== skip; }).map(function (c) {
      var o = S.res.cellAt[r + ':' + c.i], v = o ? o.fixed : S.aoa[r][c.i];
      v = v instanceof Date ? v.toLocaleDateString('th-TH') : cut(v, 60);
      return v ? c.name + '=' + v : '';
    }).filter(Boolean).slice(0, 10).join(' · ');
  }
  // ค่าที่พบบ่อยในคอลัมน์ — ให้ AI เลือกจากค่าที่มีอยู่แล้วตอนเติมช่องที่ว่าง
  function colTop(c) {
    var R = S.res;
    R.colTop = R.colTop || {};
    if (R.colTop[c]) return R.colTop[c];
    var cnt = {};
    for (var i = S.hdr + 1; i < S.aoa.length; i++) {
      var o = R.cellAt[i + ':' + c], v = cut(o ? o.fixed : S.aoa[i][c], 40);
      if (v) cnt[v] = (cnt[v] || 0) + 1;
    }
    var keys = Object.keys(cnt);
    // คอลัมน์ที่ค่าไม่ค่อยซ้ำ (รหัส/ชื่อ) ไม่ต้องส่ง — ไม่ใช่ตัวเลือก
    return (R.colTop[c] = keys.length > 60 ? [] : keys.sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 20));
  }
  // ค่าที่ AI เสนอ / ผู้ใช้พิมพ์ — ผ่านกฎแก้อักขระอีกรอบ · คอลัมน์ตัวเลขแปลงเป็นตัวเลข
  function cleanVal(x, to) {
    var col = S.cols[x.c] || {};
    to = to == null ? '' : String(to);
    if (col.chars && to) to = checkText(to, col, forbidRe()).fixed;
    if (col.number && /^-?\d+(\.\d+)?$/.test(to.trim())) return Number(to.trim());
    return to;
  }

  async function aiCells(todo) {
    var sys = 'คุณเป็นผู้ตรวจข้อมูลพื้นฐาน (master data) ของระบบคลังสินค้า/เวชภัณฑ์/วัสดุในโรงพยาบาล ก่อนนำเข้าระบบ\n'
      + 'แต่ละรายการคือ 1 ช่องในไฟล์ มี คอลัมน์ · ค่าเดิม · ค่าหลังระบบแก้อักขระอัตโนมัติ · ปัญหาที่ยังเหลือ · ข้อมูลช่องอื่นในแถวเดียวกัน\n'
      + 'ตัดสินค่าสุดท้ายที่ควรใช้ในช่องนั้น:\n'
      + '- "fix" = เสนอค่าที่ถูกต้องใน "to" เช่น ลบอักขระต้องห้าม/อีโมจิ/สระลอย, แก้คำสะกดผิดที่ชัดเจน, แก้ตัวไทยหรือตัว O/I ที่พิมพ์ปนในรหัส, '
      + 'เติมช่องว่างเมื่ออนุมานได้ชัดจากข้อมูลอื่นในแถว (เลือกจากค่าที่มีอยู่แล้วในคอลัมน์นั้นถ้ามีให้)\n'
      + '- "ok" = ค่าหลังระบบแก้ใช้ได้แล้ว ไม่ต้องแก้เพิ่ม เช่น ชื่อยา/สินค้าที่เว้นวรรคตามปกติ หรือระบบแก้อัตโนมัติถูกต้องแล้ว\n'
      + '- "skip" = ตัดสินไม่ได้ ต้องให้คนตรวจ เช่น ข้อมูลหายและอนุมานไม่ได้, ภาษาไทยเพี้ยนที่กู้คืนไม่ได้, มีหลายรหัสในช่องเดียว\n'
      + 'ห้ามเดาข้อมูลที่ไม่มีหลักฐาน ห้ามเปลี่ยนความหมาย ขนาด ความแรง หน่วย หรือรหัส นอกจากจุดที่เป็นปัญหา'
      + (S.forbid.replace(/\s+/g, '') ? ' · ค่าที่เสนอห้ามมีอักขระ: ' + S.forbid : '') + '\n'
      + 'ตอบ JSON เท่านั้น: {"r":[{"i":1,"v":"fix|ok|skip","to":"ค่าที่เสนอ (เฉพาะ fix)","why":"เหตุผลสั้น ๆ ภาษาไทยไม่เกิน 15 คำ"}]}';
    var ok = 0, done = 0, failed = '', batches = [];
    for (var k = 0; k < todo.length; k += 15) batches.push(todo.slice(k, k + 15));
    var ask = async function (batch) {
      var cols = {};
      batch.forEach(function (x) { if (x.codes.indexOf('empty') >= 0) cols[x.c] = 1; });
      var hint = Object.keys(cols).map(function (c) {
        var top = colTop(+c);
        return top.length ? 'ค่าที่มีอยู่แล้วในคอลัมน์ "' + colName(+c) + '": ' + top.join(' | ') : '';
      }).filter(Boolean).join('\n');
      var user = (hint ? hint + '\n\n' : '') + batch.map(function (x, n) {
        var td = x.codes.filter(function (c) { return !isFix(c); }).map(function (c) { return LABEL[c].label; });
        return (n + 1) + ') คอลัมน์: ' + colName(x.c) + ' (' + roleLabel((S.cols[x.c] || {}).role) + ')'
          + '\n   ค่าเดิม: "' + plainVal(x.v) + '"'
          + (x.sys !== x.v ? '\n   หลังระบบแก้: "' + plainVal(x.sys) + '" (' + fixText(x).join(', ') + ')' : '')
          + '\n   ปัญหาที่เหลือ: ' + (td.length ? td.join(' / ') : 'ไม่มี — ตรวจทานว่าระบบแก้ถูกต้อง')
          + '\n   ข้อมูลอื่นในแถว: ' + (rowCtx(x.r, x.c) || '-');
      }).join('\n');
      var out = await window.aiChatJson(sys, user, { maxTokens: 1600, temperature: 0 });
      (Array.isArray(out.r) ? out.r : []).forEach(function (a) {
        var x = batch[(parseInt(a.i, 10) || 0) - 1];
        if (!x) return;
        var v = /^(fix|ok|skip)$/.test(a.v) ? a.v : 'skip', to = null;
        if (v === 'fix') {
          to = cleanVal(x, a.to);
          if (String(to) === String(x.sys)) v = 'ok';
          else if (!String(to).trim()) v = 'skip';
        }
        S.cellAi[cellKey(x)] = { v: v, to: v === 'fix' ? to : null, why: String(a.why || '').slice(0, 120), src: x.v };
        ok++;
      });
    };
    var next = 0;
    var worker = async function () {
      while (next < batches.length) {
        var b = batches[next++];
        try { await ask(b); } catch (e) { failed = e.message || String(e); }
        done += b.length;
        setAiStatus('🤖 AI กำลังดู ' + done.toLocaleString() + ' / ' + todo.length.toLocaleString() + ' ช่อง…');
      }
    };
    setAiStatus('🤖 AI กำลังดู 0 / ' + todo.length.toLocaleString() + ' ช่อง…');
    await Promise.all([worker(), worker(), worker()]);
    if (failed) window.showAlert('AI ดูไม่สำเร็จบางส่วน: ' + failed, 'error');
    return ok;
  }
  window.dcGroupAi = async function (key) {
    var g = S.res && S.res.groupAt[key];
    if (!g || !g.cells || S.aiBusy) return;
    var todo = g.cells.filter(function (x) { return !x.dec && !aiOf(x); }).slice(0, 600);
    if (!todo.length) { window.showToast('AI ดูครบทุกช่องแล้ว', 'success'); return; }
    S.aiBusy = true; render();
    var ok = 0;
    try { ok = await aiCells(todo); }
    finally {
      S.aiBusy = false; render();
      if (ok) window.showToast('AI ดูแล้ว ' + ok.toLocaleString() + ' ช่อง', 'success');
    }
  };

  // ══ คำตัดสินของแต่ละช่อง: fixed = ใช้ค่าใหม่ (AI เสนอ / พิมพ์เอง) · kept = ไม่ต้องแก้ คงค่าหลังระบบแก้ ══
  // เก็บใน S.dec ตาม แถว:คอลัมน์ + ค่าเดิม → ตรวจใหม่แล้วยังใช้ได้ถ้าค่าเดิมไม่เปลี่ยน
  function setDec(x, d) { x.dec = d.d; x.how = d.how; x.fixed = d.d === 'fixed' ? d.to : x.sys; }
  function decide(x, d, to, how) { var o = { d: d, to: to, how: how, v: x.v }; S.dec[cellKey(x)] = o; setDec(x, o); }
  function undoDec(x) { delete S.dec[cellKey(x)]; x.dec = ''; x.how = ''; x.fixed = x.sys; }
  function findCell(r, c) { return S.res && S.res.cellAt[r + ':' + c]; }
  window.dcDec = function (r, c, act) {
    var x = findCell(r, c); if (!x) return;
    if (act === 'undo') undoDec(x);
    else if (act === 'keep') decide(x, 'kept', null, 'user');
    else if (act === 'ai') { var a = aiOf(x); if (!a || a.v !== 'fix') return; decide(x, 'fixed', a.to, 'ai'); }
    else if (act === 'typed') {
      var el = document.getElementById('dc-in-' + r + '-' + c), to = cleanVal(x, el ? el.value : '');
      if (!String(to).trim()) { window.showToast('พิมพ์ค่าที่ถูกต้องก่อน', 'warn'); if (el) el.focus(); return; }
      decide(x, 'fixed', to, 'typed');
    }
    render();
  };
  // ใช้ผล AI ทั้งกลุ่ม: แนะนำแก้ → ใช้ค่าใหม่ · ไม่ต้องแก้ → คงค่าเดิม · ให้คนดู → เหลือไว้
  window.dcGroupApply = function (key) {
    var g = S.res && S.res.groupAt[key], n = 0;
    if (!g || !g.cells) return;
    g.cells.forEach(function (x) {
      var a = aiOf(x);
      if (x.dec || !a) return;
      if (a.v === 'fix') { decide(x, 'fixed', a.to, 'ai'); n++; }
      else if (a.v === 'ok' && key !== 'auto') { decide(x, 'kept', null, 'ai'); n++; }
    });
    render();
    if (n) window.showToast('ใช้ผล AI แล้ว ' + n.toLocaleString() + ' ช่อง', 'success');
  };
  window.dcGroupSkip = function (key) {
    var g = S.res && S.res.groupAt[key];
    if (!g || !g.cells) return;
    g.cells.forEach(function (x) { if (!x.dec) decide(x, 'kept', null, 'bulk'); });
    render();
  };
  window.dcGroupUndo = function (key) {
    var g = S.res && S.res.groupAt[key];
    if (!g || !g.cells) return;
    g.cells.forEach(function (x) { if (x.dec) undoDec(x); });
    render();
  };
  // ผล AI ที่ยังไม่ได้ใช้ — ต่อท้ายข้อความในไฟล์ที่ดาวน์โหลด
  function aiHint(a) {
    if (!a) return '';
    return a.v === 'fix' ? ' · AI แนะนำ: "' + plainVal(a.to) + '" — ' + a.why
      : a.v === 'ok' ? ' · AI: น่าจะไม่ต้องแก้ — ' + a.why : ' · AI: ต้องให้คนตรวจ — ' + a.why;
  }

  // ══ แสดงค่า — อักขระที่มองไม่เห็นแสดงเป็นป้าย ══
  var INVIS = {};
  [[0x20,'␣'],[0xA0,'NBSP'],[0x3000,'SP'],[0x0A,'↵'],[0x0D,'↵'],[0x09,'TAB'],[0x200B,'ZW'],[0x200C,'ZW'],[0x200D,'ZW'],[0x2060,'ZW'],[0xFEFF,'ZW'],[0xAD,'ZW']]
    .forEach(function (p) { INVIS[ch(p[0])] = p[1]; });
  var SP_RE = rx('[\\u1680\\u2000-\\u200A\\u202F\\u205F]', '');
  var MARK_START = rx('^[' + TH_MARK + ']', '');
  function invisLabel(c) {
    if (INVIS[c]) return INVIS[c];
    var n = c.charCodeAt(0);
    if (n < 32 || (n >= 0x7F && n <= 0x9F)) return 'CTRL';
    return SP_RE.test(c) ? 'SP' : '';
  }
  // marks = ช่วงที่ผิด (ไฮไลต์แดง) · เว้นวรรคปกตินอกช่วงที่ผิดแสดงตามจริง
  function showVal(v, marks) {
    v = String(v == null ? '' : v);
    if (!v) return '<span class="dc-empty">(ว่าง)</span>';
    var on = new Array(v.length);
    (marks || []).forEach(function (m) { for (var i = m[0]; i < m[1] && i < v.length; i++) on[i] = 1; });
    var html = '', i = 0;
    while (i < v.length) {
      var j = i;
      while (j < v.length && !!on[j] === !!on[i]) j++;
      var seg = v.slice(i, j), h = '';
      for (var k = 0; k < seg.length; k++) {
        var lb = on[i] ? invisLabel(seg[k]) : (seg[k] !== ' ' && invisLabel(seg[k]));
        h += lb ? '<i class="dc-inv">' + esc(lb) + '</i>' : esc(seg[k]);
      }
      if (on[i] && MARK_START.test(seg)) h = '◌' + h;   // สระ/วรรณยุกต์ลอย — ใส่วงกลมให้มองเห็น
      html += on[i] ? '<mark class="dc-mk">' + h + '</mark>' : h;
      i = j;
    }
    return html;
  }
  // ข้อความเดียวกันสำหรับไฟล์ — อักขระที่มองไม่เห็นเป็น [ป้าย]
  function plainVal(v) {
    return String(v == null ? '' : v).replace(/[^]/g, function (c) { var lb = c !== ' ' && invisLabel(c); return lb ? '[' + lb + ']' : c; })
      .replace(/^ +| +$/g, function (m) { return m.replace(/ /g, '[␣]'); });
  }
  function fixText(x) { return x.codes.filter(isFix).map(function (c) { return LABEL[c].fix; }); }
  function todoText(x) { return x.codes.filter(function (c) { return !isFix(c); }).map(function (c) { return LABEL[c].label + ' — ' + LABEL[c].how; }); }
  function colName(c) { var col = S.cols[c]; return col ? col.name : colLetter(c); }
  function setBody(html) { var b = document.getElementById('dc-body'); if (b) b.innerHTML = html; }

  // ══ หน้าหลัก ══
  window.renderDatacheck = function () {
    var view = document.getElementById('view-datacheck');
    if (!view) return;
    if (!view.querySelector('.dc-wrap')) {
      view.innerHTML = '<div class="dc-wrap">'
        + '<div class="as-head"><div class="adv-seg" data-assist-subnav></div></div>'
        + '<input type="file" id="dc-file" accept=".xlsx,.xlsm,.xls,.csv,.tsv,.txt" style="display:none" onchange="window.dcLoad(this.files[0])">'
        + '<div class="dc-body" id="dc-body"></div></div>';
    }
    window.assistRenderSubnav && window.assistRenderSubnav();
    render();
  };

  function render() {
    var b = document.getElementById('dc-body');
    if (!b) return;
    if (!S.wb) { b.innerHTML = dropHtml(); return; }
    var y = b.scrollTop;
    b.innerHTML = fileHtml() + stepsHtml() + (S.step === 'cols' ? colsHtml()
      : S.busy ? '<div class="dc-card dc-wait">⏳ กำลังตรวจ…</div>' : S.res ? reviewHtml() : '');
    b.scrollTop = y;
  }

  var IC_CHECK = '<svg class="dc-ic-ok" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';

  function dropHtml() {
    return '<div class="dc-drop" id="dc-drop" onclick="window.dcPick()" ondragover="window.dcDrag(event,true)" ondragleave="window.dcDrag(event,false)" ondrop="window.dcDrop(event)">'
      + '<div class="dc-drop-ic">🧹</div><div class="dc-drop-t">ลากไฟล์ Excel / CSV มาวางตรงนี้ หรือกดเพื่อเลือกไฟล์</div>'
      + '<div class="dc-drop-s">ไฟล์ตรวจในเครื่องนี้ ไม่ถูกส่งขึ้นเซิร์ฟเวอร์ · AI เห็นเฉพาะแถวที่กดให้ช่วยดู</div></div>'
      + '<div class="dc-how">'
      + howStep('1', '🧩', 'ยืนยันคอลัมน์', 'ดูว่าระบบเดาถูกไหม คอลัมน์ไหนเป็นรหัส ชื่อ ตัวเลข')
      + howStep('2', '✅', 'ตัดสินปัญหาทีละกลุ่ม', 'ส่วนใหญ่กดครั้งเดียวจบทั้งกลุ่ม ให้ AI ช่วยได้')
      + howStep('3', '⬇️', 'ดาวน์โหลดไฟล์ที่แก้แล้ว', 'ช่องที่ถูกแก้มี Comment บอกค่าเดิม')
      + '</div>';
  }
  function howStep(n, ic, t, d) { return '<div class="dc-how-i"><span class="dc-how-n">' + n + '</span><span class="dc-how-ic">' + ic + '</span><div><b>' + esc(t) + '</b><div class="dc-sub">' + esc(d) + '</div></div></div>'; }

  function fileHtml() {
    var rev = S.step === 'review';
    return '<div class="dc-file"><span class="dc-file-ic">📗</span>'
      + '<div style="min-width:0;flex:1"><div class="dc-file-n">' + esc(S.name) + '</div><div class="dc-sub">' + (S.wb.SheetNames.length > 1 ? 'ชีต ' + esc(S.sheet) + ' · ' : '')
      + 'หัวตารางแถว ' + rowNo(S.hdr) + ' · ' + dataRows().toLocaleString() + ' แถว · ' + S.cols.length + ' คอลัมน์</div></div>'
      + (rev ? '<button type="button" class="btn btn-ghost" onclick="window.dcStep(\'cols\')">🧩 คอลัมน์</button>' : '')
      + '<button type="button" class="btn btn-ghost" onclick="window.dcPick()">📂 เปิดไฟล์อื่น</button>'
      + (rev && S.res ? '<button type="button" class="btn btn-pri" onclick="window.dcExport()">⬇️ ดาวน์โหลดไฟล์ที่แก้แล้ว</button>' : '')
      + (S.note ? '<div class="dc-note" style="flex-basis:100%">ℹ️ ' + esc(S.note) + '</div>' : '')
      + '</div>';
  }

  function stepsHtml() {
    var rev = S.step === 'review', left = rev && S.res ? totalRemain() : -1;
    var st = function (n, t, cls, click) {
      return (click ? '<button type="button" class="dc-step ' + cls + '" onclick="' + click + '">' : '<span class="dc-step ' + cls + '">')
        + (cls === 'done' ? IC_CHECK : '<b>' + n + '</b>') + esc(t) + (click ? '</button>' : '</span>');
    };
    return '<nav class="dc-steps" aria-label="ขั้นตอน">'
      + st(1, 'ยืนยันคอลัมน์', rev ? 'done' : 'on', rev ? 'window.dcStep(\'cols\')' : '')
      + st(2, 'ตัดสินปัญหาทีละกลุ่ม', !rev ? '' : left === 0 ? 'done' : 'on', '')
      + st(3, 'ดาวน์โหลดไฟล์', left === 0 ? 'on' : '', left === 0 ? 'window.dcExport()' : '')
      + '</nav>';
  }

  // ── ขั้นที่ 1: ยืนยันคอลัมน์ ──
  function colsHtml() {
    var legend = ROLES.filter(function (r) { return r.id !== 'text' && r.id !== 'skip'; }).map(function (r) {
      return '<div class="dc-role-i"><b>' + esc(r.label) + '</b><div>' + esc(r.d) + '</div></div>';
    }).join('');
    return '<div class="dc-card dc-pad">'
      + '<h2 class="dc-h">แต่ละคอลัมน์คือข้อมูลอะไร?</h2>'
      + '<p class="dc-p">ระบบเดาจากชื่อหัวคอลัมน์ให้แล้ว ดูแค่ว่าถูกไหม — ถ้าเลือกผิด เช่น ตั้งคอลัมน์ชื่อสินค้าเป็น “รหัส” ระบบจะเตือนเรื่องที่ไม่ใช่ปัญหาเป็นร้อยช่อง</p>'
      + '<div class="dc-roles">' + legend + '</div>'
      + '<div class="dc-clist"><div class="dc-crow dc-chead"><span>คอลัมน์ / ตัวอย่างค่า</span><span>เป็นข้อมูลแบบ</span><span>ห้ามว่าง</span></div>'
      + S.cols.map(function (c) {
        var changed = c.role !== c.guess;
        return '<div class="dc-crow' + (changed ? ' changed' : '') + '">'
          + '<div style="min-width:0"><div class="dc-cname">' + esc(c.name) + ' <span class="dc-sub">คอลัมน์ ' + esc(colLetter(c.i)) + '</span></div>'
          + '<div class="dc-csample">' + (c.sample ? esc(c.sample) : '<span class="dc-empty">(ว่างทั้งคอลัมน์)</span>') + '</div></div>'
          + '<div style="min-width:0"><div class="dc-pills" role="group" aria-label="' + esc(c.name) + '">'
          + ROLES.map(function (r) {
            return '<button type="button" class="dc-pill' + (r.id === c.role ? ' on' : '') + '" title="' + esc(r.d) + '" onclick="window.dcRole(' + c.i + ',\'' + r.id + '\')">' + esc(r.label) + '</button>';
          }).join('') + '</div>'
          + (changed ? '<div class="dc-cnote">เปลี่ยนจากที่ระบบเดา (' + esc(roleLabel(c.guess)) + ')</div>' : '') + '</div>'
          + '<label class="dc-req"><input type="checkbox"' + (c.required ? ' checked' : '') + (c.role === 'skip' ? ' disabled' : '')
          + ' onchange="window.dcReq(' + c.i + ',this.checked)"><span>' + (c.required ? 'ห้ามว่าง' : 'ว่างได้') + '</span></label>'
          + '</div>';
      }).join('') + '</div>'
      + '<details class="dc-more-opt"><summary>ตัวเลือกเพิ่มเติม — ชีต · แถวหัวตาราง · อักขระต้องห้าม · ความคล้ายของชื่อ</summary><div class="dc-opts">'
      + (S.wb.SheetNames.length > 1 ? '<label class="dc-fld">ชีต <select class="f-input" onchange="window.dcSheet(this.value)">'
        + S.wb.SheetNames.map(function (n) { return '<option' + (n === S.sheet ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select></label>' : '')
      + '<label class="dc-fld">หัวตารางอยู่แถว <input class="f-input" type="number" min="1" style="width:70px" value="' + rowNo(S.hdr) + '" onchange="window.dcHeader(this.value)"></label>'
      + '<label class="dc-fld">อักขระต้องห้าม <input class="f-input" style="width:120px;font-family:var(--mono)" value="' + esc(S.forbid) + '" onchange="window.dcOpt(\'forbid\',this.value)" title="อักขระที่ระบบปลายทางไม่รับ"></label>'
      + '<label class="dc-fld">ชื่อคล้ายกันตั้งแต่ <select class="f-input" onchange="window.dcOpt(\'thr\',this.value)">'
      + [0.7, 0.75, 0.8, 0.85, 0.9, 0.95].map(function (t) { return '<option value="' + t + '"' + (t === S.thr ? ' selected' : '') + '>' + Math.round(t * 100) + '%</option>'; }).join('')
      + '</select></label></div></details>'
      + '</div>'
      + '<div class="dc-go"><span class="dc-sub">ไฟล์ตรวจในเครื่องนี้ ไม่ถูกส่งขึ้นเซิร์ฟเวอร์ · AI เห็นเฉพาะแถวที่กดให้ช่วยดู</span>'
      + '<button type="button" class="btn btn-pri dc-big" onclick="window.dcStart()">เริ่มตรวจ ' + dataRows().toLocaleString() + ' แถว →</button></div>';
  }

  // ── ขั้นที่ 2: ตัดสินปัญหาทีละกลุ่ม ──
  function totalRemain() { return S.res.groups.reduce(function (a, g) { return a + remainOf(g); }, 0); }
  var PLAIN = {
    code_space: 'รหัสไม่ควรมีเว้นวรรค — ระบบปลายทางอาจมองเป็นคนละรหัส หรือนำเข้าไม่ได้',
    code_th: 'รหัสมีตัวอักษรไทยปน — มักเกิดจากลืมเปลี่ยนภาษาแป้นพิมพ์',
    code_o0: 'อาจพิมพ์ตัวอักษร O, I, l แทนเลข 0, 1 — หน้าตาเหมือนกันแต่เป็นคนละรหัส',
    empty: 'ช่องเหล่านี้ต้องมีข้อมูลก่อนนำเข้า — AI เติมให้ได้เมื่อดูจากข้อมูลอื่นในแถวแล้วรู้ชัด',
    forbid: 'ระบบปลายทางไม่รับอักขระเหล่านี้ ต้องลบหรือเปลี่ยนเป็นคำ',
    num_bad: 'คอลัมน์นี้ต้องเป็นตัวเลข แต่มีค่าที่ไม่ใช่ตัวเลข',
    mojibake: 'ภาษาไทยอ่านไม่ออกเพราะไฟล์ถูกบันทึกผิดรูปแบบ — ต้องพิมพ์ใหม่หรือบันทึกไฟล์ต้นฉบับใหม่เป็น UTF-8',
    auto: 'อักขระที่มองไม่เห็นหรือพิมพ์เกิน ระบบแก้ให้เองแล้วในไฟล์ที่ดาวน์โหลด — ดูเพื่อความมั่นใจได้ ไม่ต้องกดอะไร',
  };
  function gTitle(g) { return g.key === 'auto' ? 'ระบบแก้ให้อัตโนมัติ' : LABEL[g.code].label; }
  function gCol(g) { return g.key === 'auto' ? 'เว้นวรรคเกิน อักขระแฝง ขีดพิเศษ ฯลฯ' : 'คอลัมน์ ' + colLetter(g.c) + ' · ' + colName(g.c); }

  function reviewHtml() {
    var R = S.res;
    if (!R.groups.length && !R.auto.cells.length && !R.dups.length && !R.sims.length) {
      return '<div class="dc-card dc-clean"><div class="dc-clean-ic">🎉</div><b>ไฟล์นี้ไม่มีปัญหา</b>'
        + '<div class="dc-sub">ตรวจ ' + R.rows.toLocaleString() + ' แถวแล้ว ไม่พบอักขระพิเศษ ข้อมูลซ้ำ หรือช่องที่ว่าง</div></div>';
    }
    var left = totalRemain(), autoN = R.auto.cells.length, base = autoN + R.total || 1;
    var pct = function (n) { return (n / base * 100).toFixed(2) + '%'; };
    var hero = '<div class="dc-card dc-hero"><div class="dc-hero-l">'
      + (left ? '<div class="dc-hero-k">เหลือต้องตัดสิน</div><div class="dc-hero-n"><b>' + left.toLocaleString() + '</b> ช่อง จาก ' + R.total.toLocaleString() + '</div>'
        + '<div class="dc-p">ทำทีละกลุ่มปัญหาด้านซ้าย — ส่วนใหญ่กดครั้งเดียวจบทั้งกลุ่ม</div>'
        : '<div class="dc-hero-k">ตรวจ ' + R.rows.toLocaleString() + ' แถว</div><div class="dc-hero-n"><b class="ok">ตัดสินครบแล้ว</b></div>'
        + '<div class="dc-p">กด ⬇️ ดาวน์โหลดไฟล์ที่แก้แล้ว ได้เลย</div>')
      + '</div><div class="dc-hero-r"><div class="dc-prog" role="img" aria-label="ความคืบหน้า"><i class="a" style="width:' + pct(autoN) + '"></i><i class="d" style="width:' + pct(R.total - left) + '"></i></div>'
      + '<div class="dc-prog-lg"><span><i class="a"></i>ระบบแก้ให้อัตโนมัติ ' + autoN.toLocaleString() + '</span>'
      + '<span><i class="d"></i>ตัดสินแล้ว ' + (R.total - left).toLocaleString() + '</span><span><i></i>เหลือ ' + left.toLocaleString() + '</span></div></div></div>';

    var item = function (key, title, sub, n, tone) {
      var done = !n;
      return '<button type="button" class="dc-grp' + (S.view === key ? ' on' : '') + (done ? ' done' : '') + '" onclick="window.dcView(\'' + key + '\')">'
        + '<span class="dc-grp-t"><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></span>'
        + (done ? IC_CHECK : '<span class="dc-cnt ' + tone + '">' + n.toLocaleString() + '</span>') + '</button>';
    };
    var aside = '<aside class="dc-side">'
      + (R.groups.length ? '<div class="dc-side-h">ต้องตัดสิน</div>' + R.groups.map(function (g) { return item(g.key, gTitle(g), gCol(g), remainOf(g), ''); }).join('') : '')
      + (R.dups.length || R.sims.length ? '<div class="dc-side-h">ตรวจเพิ่มเติม (ไม่บังคับ)</div>'
        + (R.dups.length ? item('dup', 'ข้อมูลซ้ำ', R.dups.length.toLocaleString() + ' กลุ่ม · ค่าเดียวกันหลายแถว', R.dups.length, 'x') : '')
        + (R.sims.length ? item('sim', 'ชื่อคล้ายกัน', R.sims.length.toLocaleString() + ' คู่ · อาจเป็นรายการซ้ำ', R.sims.filter(function (p) { return !S.ai[pairKey(p)]; }).length, 'x') : '') : '')
      + (autoN ? '<div class="dc-side-h">เสร็จแล้ว ไม่ต้องทำอะไร</div>' + item('auto', 'ระบบแก้ให้อัตโนมัติ', autoN.toLocaleString() + ' ช่อง', 0, '') : '')
      + '</aside>';

    var main = S.view === 'dup' ? dupHtml() : S.view === 'sim' ? simHtml() : groupHtml(R.groupAt[S.view] || R.auto);
    return hero + '<div class="dc-split">' + aside + '<main class="dc-main">' + main + '</main></div>';
  }
  window.dcView = function (v) {
    S.view = v; S.limit = 50; render();
    var m = document.querySelector('.dc-main');
    if (m && window.innerWidth < 900) m.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  window.dcMore = function () { S.limit += 50; render(); };
  function moreHtml(total, unit) {
    return total > S.limit ? '<div class="dc-more"><button type="button" class="btn btn-ghost btn-sm" onclick="window.dcMore()">แสดงเพิ่ม (เหลืออีก ' + (total - S.limit).toLocaleString() + ' ' + unit + ')</button></div>' : '';
  }
  function none(t) { return '<div class="dc-none">✅ ' + esc(t) + '</div>'; }

  function groupHtml(g) {
    var isAuto = g.key === 'auto', n = g.cells.length, left = remainOf(g);
    var pend = g.cells.filter(function (x) { return !x.dec; });
    var cnt = { fix: 0, ok: 0, skip: 0 }, noAi = 0;
    pend.forEach(function (x) { var a = aiOf(x); if (a) cnt[a.v]++; else noAi++; });
    var seen = cnt.fix + cnt.ok + cnt.skip, use = cnt.fix + (isAuto ? 0 : cnt.ok), decided = n - pend.length;
    var h = '<div class="dc-gh"><div class="dc-gh-t"><h2 class="dc-h">' + esc(gTitle(g)) + '</h2><span class="dc-sub">'
      + (isAuto ? n.toLocaleString() + ' ช่อง' : left ? 'เหลือ ' + left.toLocaleString() + ' จาก ' + n.toLocaleString() + ' ช่อง' : 'เสร็จแล้ว ' + n.toLocaleString() + ' ช่อง')
      + '</span></div>'
      + (isAuto ? '' : '<div class="dc-sub">' + esc(gCol(g)) + '</div>')
      + '<p class="dc-p">' + esc(PLAIN[g.code] || (LABEL[g.code].how ? 'ต้องทำ: ' + LABEL[g.code].how : '')) + '</p>';

    // กล่องต้นเหตุ — ปัญหาที่เกิดจากตั้งค่าคอลัมน์ไม่ตรง
    var col = S.cols[g.c];
    if (left && col && /^code_/.test(g.code)) {
      h += rootHtml('ถ้าคอลัมน์ “' + col.name + '” <b>ไม่ใช่รหัส</b> (เช่น เป็นชื่อยา/สินค้า) เว้นวรรคและภาษาไทยในค่าเป็นเรื่องปกติ',
        'ตั้งเป็นคอลัมน์ “ชื่อ” แล้วตรวจใหม่', 'window.dcFixRole(' + g.c + ',\'name\')');
    } else if (left && col && g.code === 'empty') {
      h += rootHtml('ถ้าคอลัมน์ “' + col.name + '” <b>ว่างได้</b> ตามปกติ ไม่ต้องกรอกทุกแถว', 'ตั้งเป็น “ว่างได้” แล้วตรวจใหม่', 'window.dcFixReq(' + g.c + ')');
    }

    // แถบ AI / ทำทั้งกลุ่ม
    var aiBtn = noAi ? '<button type="button" class="btn ' + (seen ? 'btn-ghost' : 'btn-pri') + '" onclick="window.dcGroupAi(\'' + g.key + '\')"' + (S.aiBusy ? ' disabled' : '') + '>✨ '
      + (isAuto ? 'ให้ AI ตรวจทาน' : seen ? 'ให้ AI ดูต่อ' : 'ให้ AI ช่วยดูทั้ง ' + noAi.toLocaleString() + ' ช่อง') + '</button>' : '';
    var useBtn = use ? '<button type="button" class="btn btn-pri" onclick="window.dcGroupApply(\'' + g.key + '\')"' + (S.aiBusy ? ' disabled' : '') + '>✔ '
      + (isAuto ? 'ใช้ค่าที่ AI แนะนำ (' : 'ใช้ผล AI ทั้งกลุ่ม (') + use.toLocaleString() + ')</button>' : '';
    var undoBtn = decided ? '<button type="button" class="dc-link" onclick="window.dcGroupUndo(\'' + g.key + '\')">ยกเลิกที่ตัดสินแล้ว (' + decided.toLocaleString() + ')</button>' : '';
    var stTxt = S.aiBusy ? '🤖 AI กำลังดู…'
      : seen ? 'AI ดูแล้ว ' + seen.toLocaleString() + ' จาก ' + pend.length.toLocaleString() + ' ช่อง · '
        + (isAuto ? 'แนะนำแก้เพิ่ม ' + cnt.fix + ' · ถูกต้องแล้ว ' + cnt.ok : 'แก้ได้ ' + cnt.fix.toLocaleString() + ' · ไม่ต้องแก้ ' + cnt.ok.toLocaleString() + ' · ให้คนดู ' + cnt.skip.toLocaleString())
        + (noAi > 0 ? ' · ยังไม่ได้ดู ' + noAi.toLocaleString() : '')
      : isAuto ? 'ถ้าอยากแน่ใจ ให้ AI ตรวจทานว่าระบบแก้ถูก หรือมีคำสะกดผิดที่ควรแก้เพิ่ม'
        : 'AI ดูแต่ละช่องพร้อมข้อมูลอื่นในแถว แล้วแยกว่าช่องไหนแก้ได้ · ไม่ต้องแก้ · ต้องให้คนดู';
    if (!isAuto && !left) {
      var nx = S.res.groups.filter(function (x) { return x !== g && remainOf(x); })[0];
      h += '<div class="dc-done">' + IC_CHECK + '<b>กลุ่มนี้เสร็จแล้ว</b>' + undoBtn
        + (nx ? '<button type="button" class="btn btn-pri btn-sm" onclick="window.dcView(\'' + nx.key + '\')">ไปกลุ่มถัดไป: ' + esc(gTitle(nx)) + ' →</button>' : '') + '</div>';
    } else {
      h += '<div class="dc-ai-bar"><div style="flex:1;min-width:0"><div class="dc-sub" id="dc-ai-st">' + esc(stTxt) + '</div></div>'
        + aiBtn + useBtn
        + (isAuto ? '' : '<button type="button" class="btn btn-ghost" onclick="window.dcGroupSkip(\'' + g.key + '\')">ไม่ใช่ปัญหา — ข้ามทั้งกลุ่ม</button>')
        + undoBtn + '</div>';
    }
    h += '</div>';

    // รายการ: ยังไม่ตัดสินขึ้นก่อน
    var list = pend.concat(g.cells.filter(function (x) { return x.dec; }));
    var ctxCols = S.cols.filter(function (c) { return (c.unique || c.similar) && c.i !== g.c; }).length;
    h += '<div class="dc-row dc-rhead"><span>แถวในไฟล์</span><span>' + (isAuto ? 'ค่าเดิม → ค่าใหม่' : 'ค่าในไฟล์ (สีแดง = จุดที่ผิด)') + '</span><span>' + (isAuto ? '' : 'ตัดสิน') + '</span></div>'
      + list.slice(0, S.limit).map(function (x) { return rowHtml(x, g, isAuto, ctxCols); }).join('')
      + moreHtml(list.length, 'ช่อง');
    return h;
  }
  function rootHtml(t, btn, click) {
    return '<div class="dc-root"><span class="dc-root-ic">💡</span><div class="dc-root-t"><b>ต้นเหตุที่เป็นไปได้:</b> ' + t + '</div>'
      + '<button type="button" class="btn btn-ghost btn-sm" onclick="' + click + '">' + esc(btn) + '</button></div>';
  }

  function rowHtml(x, g, isAuto, ctxCols) {
    var a = aiOf(x), rc = x.r + ',' + x.c;
    var cx = ctx(x.r, x.c) || (ctxCols ? '' : cut(rowCtx(x.r, x.c), 60));
    var h = '<div class="dc-row' + (x.dec ? ' fin' : '') + '"><div class="dc-row-n"><b>แถว ' + rowNo(x.r) + '</b>'
      + (cx ? '<small>' + esc(cx) + '</small>' : '') + (g.key === 'auto' ? '<small>' + esc(colName(x.c)) + '</small>' : '') + '</div><div class="dc-row-v">';
    if (isAuto) {
      h += '<div class="dc-val">' + showVal(x.v, x.marks) + '</div>'
        + '<div class="dc-auto"><span>แก้เป็น</span><span class="dc-val">' + showVal(x.sys, []) + '</span><span>· ' + esc(fixText(x).join(', ')) + '</span></div>';
    } else {
      h += '<div class="dc-val">' + showVal(x.sys, x.sys === x.v ? x.marks : []) + '</div>'
        + (x.sys !== x.v ? '<div class="dc-old">ค่าเดิม: ' + showVal(x.v, x.marks) + '</div>' : '');
      var more = x.codes.filter(function (c) { return !isFix(c) && c !== g.code; });
      if (more.length) h += '<div class="dc-also">ปัญหาอื่นในช่องนี้: ' + esc(more.map(function (c) { return LABEL[c].label; }).join(' · ')) + '</div>';
    }
    if (a && !x.dec) {
      var lb = { fix: 'AI แนะนำให้แก้เป็น', ok: isAuto ? 'AI: ระบบแก้ถูกต้องแล้ว' : 'AI: ไม่ต้องแก้', skip: 'AI: ต้องให้คนดู' }[a.v];
      h += '<div class="dc-ai ' + a.v + '"><b>🤖 ' + lb + '</b>' + (a.v === 'fix' ? '<span class="dc-ai-to">' + showVal(a.to, []) + '</span>' : '')
        + (a.why ? '<span class="dc-ai-why">— ' + esc(a.why) + '</span>' : '') + '</div>';
    }
    h += '</div><div class="dc-row-a">';
    if (x.dec) {
      h += '<span class="dc-pill-st ' + x.dec + '">' + IC_CHECK + esc(x.dec === 'fixed' ? 'แก้เป็น “' + cut(x.fixed, 40) + '”' : 'ไม่ต้องแก้ (คงค่าเดิม)') + '</span>'
        + '<button type="button" class="dc-link" onclick="window.dcDec(' + rc + ',\'undo\')">เปลี่ยนใจ</button>';
    } else if (!isAuto) {
      if (a && a.v === 'fix') h += '<button type="button" class="btn btn-sm dc-b rec" onclick="window.dcDec(' + rc + ',\'ai\')">✔ ใช้ค่านี้</button>';
      else h += '<label class="dc-in-l">แก้เป็น<input id="dc-in-' + x.r + '-' + x.c + '" class="f-input" placeholder="พิมพ์ค่าที่ถูกต้อง" onkeydown="if(event.key===\'Enter\')window.dcDec(' + rc + ',\'typed\')"></label>'
        + '<button type="button" class="btn btn-sm dc-b" onclick="window.dcDec(' + rc + ',\'typed\')">บันทึกค่าที่พิมพ์</button>';
      h += '<button type="button" class="btn btn-sm dc-b' + (a && a.v === 'ok' ? ' rec' : '') + '" onclick="window.dcDec(' + rc + ',\'keep\')">ไม่ต้องแก้</button>';
    } else if (a && a.v === 'fix') {
      h += '<button type="button" class="btn btn-sm dc-b rec" onclick="window.dcDec(' + rc + ',\'ai\')">✔ ใช้ค่านี้</button>';
    }
    return h + '</div></div>';
  }

  // ── ข้อมูลซ้ำ + ชื่อคล้าย ──
  // ค่าในคอลัมน์รหัส/ชื่อ (ที่ไม่ใช่คอลัมน์ที่ซ้ำ) ประกอบ ให้รู้ว่าเป็นรายการไหน
  function ctx(r, skip) {
    return S.cols.filter(function (c) { return (c.unique || c.similar) && c.i !== skip; }).slice(0, 2).map(function (c) {
      var o = S.res.cellAt[r + ':' + c.i], v = o ? o.fixed : S.aoa[r][c.i];
      return String(v == null ? '' : v).trim();
    }).filter(Boolean).join(' · ');
  }
  function dupHtml() {
    var R = S.res;
    return '<div class="dc-gh"><div class="dc-gh-t"><h2 class="dc-h">ข้อมูลซ้ำ</h2><span class="dc-sub">' + R.dups.length.toLocaleString() + ' กลุ่ม</span></div>'
      + '<p class="dc-p">ค่าเดียวกันอยู่หลายแถว — เลือกเก็บแถวเดียว แล้วลบหรือแก้แถวที่เหลือในไฟล์ต้นฉบับ · <b>ซ้ำแบบมองไม่เห็น</b> = หน้าตาต่างกันแค่เว้นวรรค/อักขระแฝง/ตัวพิมพ์เล็กใหญ่</p></div>'
      + (R.dups.length ? '<div class="dc-groups">' + R.dups.slice(0, S.limit).map(function (g) {
        return '<div class="dc-group"><div class="dc-group-h"><b>' + esc(colName(g.c)) + '</b> ซ้ำกัน ' + g.items.length + ' แถว'
          + (g.hidden ? ' <span class="dc-chip err">ซ้ำแบบมองไม่เห็น</span>' : '') + '</div>'
          + g.items.map(function (x) {
            var cx = ctx(x.r, g.c);
            return '<div class="dc-group-i"><span class="dc-rn">แถว ' + rowNo(x.r) + '</span><span class="dc-val">' + showVal(x.v, g.hidden ? markAll(x.v) : []) + '</span>'
              + (cx ? '<span class="dc-sub">' + esc(cx) + '</span>' : '') + '</div>';
          }).join('') + '</div>';
      }).join('') + '</div>' + moreHtml(R.dups.length, 'กลุ่ม') : none('ไม่พบข้อมูลซ้ำ'));
  }
  function simHtml() {
    var R = S.res;
    var left = R.sims.filter(function (p) { return !S.ai[pairKey(p)]; }).length;
    var vl = { same: ['err', '🤖 น่าจะเป็นรายการเดียวกัน'], diff: ['ok', '🤖 คนละรายการ'], unsure: ['warn', '🤖 ไม่แน่ใจ'] };
    var h = '<div class="dc-gh"><div class="dc-gh-t"><h2 class="dc-h">ชื่อคล้ายกัน</h2><span class="dc-sub">' + R.sims.length.toLocaleString() + ' คู่</span></div>'
      + '<p class="dc-p">ชื่อที่หน้าตาเกือบเหมือนกันอาจเป็นสินค้าตัวเดียวกันที่บันทึกซ้ำ ระบบไม่ลบให้เอง — ผลจะบันทึกไว้ในชีต “ผลตรวจ” ของไฟล์ที่ดาวน์โหลด</p>'
      + '<div class="dc-ai-bar"><div style="flex:1;min-width:0"><div class="dc-sub" id="dc-ai-st">' + (S.aiBusy ? '🤖 AI กำลังตรวจ…' : (left ? 'AI เห็นเฉพาะชื่อของแต่ละคู่ · ตรวจครั้งละ 100 คู่ · เหลือ ' + left.toLocaleString() + ' คู่' : 'AI ตรวจครบทุกคู่แล้ว')) + '</div></div>'
      + (left ? '<button type="button" class="btn btn-pri" onclick="window.dcAi()"' + (S.aiBusy ? ' disabled' : '') + '>✨ ' + (Object.keys(S.ai).length ? 'ตรวจต่อ' : 'ให้ AI ตรวจ') + '</button>' : '') + '</div>'
      + (R.simCut ? '<div class="dc-note warn">⚠️ คู่ที่คล้ายมีมากเกินไป แสดง 3,000 คู่แรก — ปรับ “ชื่อคล้ายกันตั้งแต่” ในขั้นยืนยันคอลัมน์ › ตัวเลือกเพิ่มเติม ให้สูงขึ้น</div>' : '')
      + '</div>';
    return h + '<div class="dc-tbl-wrap"><table class="dc-tbl"><thead><tr><th>แถว</th><th>ชื่อ</th><th>แถว</th><th>ชื่อที่คล้าย</th><th>คล้าย</th><th>ผลจาก AI</th></tr></thead><tbody>'
      + R.sims.slice(0, S.limit).map(function (p) {
        var a = S.ai[pairKey(p)];
        return '<tr><td class="dc-rn">' + rowNo(p.a) + '</td><td class="dc-val">' + esc(p.va) + '<div class="dc-sub">' + esc(ctx(p.a, p.c)) + '</div></td>'
          + '<td class="dc-rn">' + rowNo(p.b) + '</td><td class="dc-val">' + esc(p.vb) + '<div class="dc-sub">' + esc(ctx(p.b, p.c)) + '</div></td>'
          + '<td class="dc-rn">' + (p.loose ? '<span title="ต่างกันแค่เว้นวรรค/เครื่องหมาย">เกือบเหมือน</span>' : Math.round(p.sim * 100) + '%') + '</td>'
          + '<td>' + (a ? '<span class="dc-chip ' + vl[a.v][0] + '">' + vl[a.v][1] + '</span><div class="dc-sub">' + esc(a.why) + '</div>' : '<span class="dc-sub">ยังไม่ได้ตรวจ</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' + moreHtml(R.sims.length, 'คู่');
  }
  // ไฮไลต์อักขระที่มองไม่เห็น/เว้นวรรคเกินในค่าที่ซ้ำแบบมองไม่เห็น
  var WS_RE = rx('[\\s\\u200B-\\u200D\\u2060\\uFEFF\\u00AD]');
  function markAll(v) {
    var out = [], m;
    WS_RE.lastIndex = 0;
    while ((m = WS_RE.exec(v))) {
      var i = m.index;
      if (v[i] !== ' ' || i === 0 || i === v.length - 1 || v[i - 1] === ' ' || v[i + 1] === ' ') out.push([i, i + 1]);
    }
    return out;
  }

  // ══ ดาวน์โหลด — ชีตที่ตรวจ: ค่าที่แก้แล้ว + Comment ที่ช่องที่แก้/มีปัญหา · ชีตอื่นคงเดิม · + ชีต "ผลตรวจ" ══
  window.dcExport = async function () {
    if (!S.res || !(await window.LibLoader.need('xlsx'))) return;
    var X = window.XLSX, R = S.res, wb = X.utils.book_new(), used = {};
    var add = function (ws, name) {
      var n = name.slice(0, 31), k = 2;
      while (used[n]) n = name.slice(0, 28) + ' ' + (k++);
      used[n] = 1; X.utils.book_append_sheet(wb, ws, n);
    };
    var fixedBy = function (x, a) { return x.how === 'ai' ? '🤖 AI แก้ให้' + (a && a.why ? ': ' + a.why : '') : '✏️ ผู้ตรวจพิมพ์ค่าใหม่'; };
    var keptBy = function (x, a) { return '✔ ตรวจแล้ว ไม่ต้องแก้' + (x.how === 'ai' && a ? ' (AI: ' + a.why + ')' : x.how === 'bulk' ? ' (ข้ามทั้งกลุ่ม)' : ''); };
    // หมายเหตุของแต่ละช่อง
    var notes = {};
    var note = function (r, c, t) { var k = r + ':' + c; notes[k] = (notes[k] ? notes[k] + '\n' : '') + t; };
    R.cells.forEach(function (x) {
      var f = fixText(x), td = todoText(x), a = aiOf(x);
      if (f.length) note(x.r, x.c, '✅ ระบบแก้ให้แล้ว: ' + f.join(', ') + '\nค่าเดิม: ' + plainVal(x.v));
      if (x.dec === 'fixed') note(x.r, x.c, fixedBy(x, a) + '\nก่อนแก้: ' + plainVal(x.sys));
      else if (x.dec === 'kept') { if (td.length) note(x.r, x.c, keptBy(x, a) + '\nระบบเคยเตือน: ' + td.join(' / ')); }
      else if (td.length) note(x.r, x.c, '✋ ต้องแก้เอง: ' + td.join(' / ') + aiHint(a));
    });
    R.dups.forEach(function (g) {
      g.items.forEach(function (x) { note(x.r, g.c, '👯 ซ้ำกับแถว ' + g.items.filter(function (y) { return y !== x; }).map(function (y) { return rowNo(y.r); }).join(', ')); });
    });
    S.wb.SheetNames.forEach(function (n) {
      if (n !== S.sheet) { add(S.wb.Sheets[n], n); return; }
      var aoa = S.aoa.map(function (row, i) {
        return row.map(function (v, c) { var x = R.cellAt[i + ':' + c]; return x ? x.fixed : v; });
      });
      var ws = X.utils.aoa_to_sheet(aoa, { cellDates: true, origin: { r: S.base.r, c: S.base.c } });
      Object.keys(notes).forEach(function (k) {
        var p = k.split(':'), addr = X.utils.encode_cell({ r: S.base.r + +p[0], c: S.base.c + +p[1] });
        if (!ws[addr]) ws[addr] = { t: 's', v: '' };
        ws[addr].c = [{ a: 'Backoffice DataCheck', t: notes[k] }];
        ws[addr].c.hidden = true;
      });
      var src = S.wb.Sheets[n];
      if (src['!cols']) ws['!cols'] = src['!cols'];
      if (src['!merges']) ws['!merges'] = src['!merges'];
      add(ws, n);
    });
    // ชีต ผลตรวจ — ทุกจุดในตารางเดียว เรียงตามแถว
    var out = [];
    R.cells.forEach(function (x) {
      var f = fixText(x), td = todoText(x), a = aiOf(x), cn = colName(x.c);
      if (f.length) out.push([x.r, 1, '✅ ระบบแก้แล้ว', cn, plainVal(x.v), plainVal(x.sys), f.join(', ')]);
      if (x.dec === 'fixed') out.push([x.r, 2, x.how === 'ai' ? '🤖 AI แก้แล้ว' : '✏️ แก้แล้ว', cn, plainVal(x.sys), plainVal(x.fixed),
        fixedBy(x, a) + (td.length ? ' (เดิม: ' + td.join(' / ') + ')' : '')]);
      else if (x.dec === 'kept') { if (td.length) out.push([x.r, 2, '✔ ไม่ต้องแก้', cn, plainVal(x.sys), '', keptBy(x, a) + ' · ระบบเคยเตือน: ' + td.join(' / ')]); }
      else if (td.length) out.push([x.r, 2, '✋ ต้องแก้เอง', cn, plainVal(x.sys), '', td.join(' / ') + aiHint(a)]);
    });
    R.dups.forEach(function (g) {
      g.items.forEach(function (x) {
        out.push([x.r, 3, '👯 ข้อมูลซ้ำ', colName(g.c), plainVal(x.v), '',
          'ซ้ำกับแถว ' + g.items.filter(function (y) { return y !== x; }).map(function (y) { return rowNo(y.r); }).join(', ') + (g.hidden ? ' (ต่างกันแค่เว้นวรรค/อักขระแฝง/ตัวพิมพ์)' : '')]);
      });
    });
    var vt = { same: 'AI: น่าจะเป็นรายการเดียวกัน', diff: 'AI: คนละรายการ', unsure: 'AI: ไม่แน่ใจ' };
    R.sims.forEach(function (p) {
      var a = S.ai[pairKey(p)];
      out.push([p.a, 4, '🔎 ชื่อคล้ายกัน', colName(p.c), p.va, '',
        'คล้ายกับแถว ' + rowNo(p.b) + ' "' + p.vb + '"' + (a ? ' · ' + vt[a.v] + (a.why ? ' — ' + a.why : '') : '')]);
    });
    out.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var rep = [['แถว', 'สถานะ', 'คอลัมน์', 'ค่าในไฟล์เดิม', 'แก้เป็น', 'รายละเอียด']]
      .concat(out.map(function (x) { return [rowNo(x[0])].concat(x.slice(2)); }));
    var wsR = X.utils.aoa_to_sheet(rep);
    wsR['!cols'] = [{ wch: 7 }, { wch: 16 }, { wch: 20 }, { wch: 40 }, { wch: 40 }, { wch: 60 }];
    wsR['!autofilter'] = { ref: 'A1:F' + rep.length };
    add(wsR, 'ผลตรวจ');
    X.writeFile(wb, S.name.replace(/\.[^.]+$/, '') + '_ตรวจแล้ว.xlsx');
  };

})();
