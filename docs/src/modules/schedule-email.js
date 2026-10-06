/**
 * schedule-email.js — ✉️ ร่าง Email ขออนุมัติตารางดำเนินงาน (ปุ่มในหน้าต่างโครงการ #m-proj)
 *
 * หลักการ: Subject / เนื้อหา / รายการเอกสารแนบ สร้างจากข้อมูลโครงการในโค้ดนี้ทั้งหมด (ระบบ, รพ., จังหวัด, ช่วงวัน)
 * → ไม่มีชื่อ รพ./วันที่ผิดจากการก๊อปอีเมลเก่ามาแก้ · AI ใช้เฉพาะปุ่ม "✨ AI ช่วยเขียนรายละเอียดเพิ่มเติม"
 * (เรียบเรียงทีมงาน/วันหยุด/รอบเข้าไซต์จากข้อเท็จจริงที่ส่งให้ ห้ามแต่งเพิ่ม) · ตัวเรียก AI กลาง: src/services/ai.service.js
 * ชื่อผู้อนุมัติ + คำลงท้าย (ครับ/ค่ะ) จำไว้ใน localStorage ของผู้ใช้แต่ละคน
 */
(function () {

  var esc = function (s) { return window.esc(s); };
  var TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var LS_APPROVER = 'sem-approver', LS_POLITE = 'sem-polite';
  var DEFAULT_APPROVER = 'พี่เกรียง';

  // ── เอกสารแนบตามระบบ — {sys} แทนด้วยชื่อระบบ · training: เฉพาะระบบที่มีตารางอบรม (คลังสินค้า) ──
  var ATTACH_TEMPLATE = [
    'ตารางดำเนินงานติดตั้งระบบ{sys}',
    { text: 'ตารางอบรมการใช้งานระบบ{sys}', training: true },
    'ไฟล์ประมาณการค่าใช้จ่าย',
    'ไฟล์รายละเอียดพิมพ์เอกสารคู่มือ',
    'แบบฟอร์ม แจ้งทำหนังสือออกติดตั้งระบบ{sys}',
    'ปัญหาที่พบจากไซต์ก่อนหน้า ในการติดตั้งระบบ{sys}',
  ];
  var TRAINING_SYSTEMS = ['คลังสินค้า'];

  // ระบบ + ช่วงวัน ไม่แสดงเป็นช่องกรอก (กินพื้นที่) — เก็บไว้ตอนเปิดหน้าต่าง แก้ได้ใน Subject โดยตรง
  var _pid = null, _aiNote = '', _sys = '', _range = '';

  function lsGet(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* โหมดส่วนตัว — ไม่ต้องจำ */ } }
  function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }

  // ── ชื่อระบบ: ประเภทงาน (PTYPES.label) ก่อน แล้วค่อยดูชื่อโครงการ ──
  function systemName(p) {
    var label = (window.gT(p.typeId) || {}).label || '';
    var hay = label + ' ' + (p.name || '');
    if (/คลังสินค้า|inventory/i.test(hay)) return 'คลังสินค้า';
    if (/ครุภัณฑ์/.test(hay)) return 'ครุภัณฑ์';
    return label.replace(/^(งาน)?(ติดตั้ง)?ระบบ/, '').trim() || label;
  }

  // ── รพ. + จังหวัด: ผูก hospitalId ก่อน ไม่มีค่อยจับชื่อ รพ. ในชื่อโครงการ ──
  function shortHosp(name) { return String(name || '').replace(/^โรงพยาบาล\s*/, 'รพ.').trim(); }
  function place(p) {
    var hs = window.HOSPITALS || [];
    var h = p.hospitalId ? hs.find(function (x) { return x.id === p.hospitalId; }) : null;
    if (!h) h = hs.filter(function (x) { return x.name && (p.name || '').indexOf(x.name) > -1; })
      .sort(function (a, b) { return b.name.length - a.name.length; })[0];
    if (h) return { hosp: shortHosp(h.name), prov: String(h.province || '').replace(/^จังหวัด\s*/, '').trim() };
    var m = (p.name || '').match(/(โรงพยาบาล|รพ\.)\S+/);
    return { hosp: m ? shortHosp(m[0]) : '', prov: '' };
  }

  // ── ช่วงวันแบบไทย: 19 - 23 ต.ค. 2569 / 28 ต.ค. - 1 พ.ย. 2569 / 28 ธ.ค. 2569 - 2 ม.ค. 2570 ──
  function thRange(s, e) {
    if (!s) return '';
    var a = window.pd(s), b = window.pd(e || s);
    var ya = a.getFullYear() + 543, yb = b.getFullYear() + 543;
    var A = a.getDate(), B = b.getDate(), ma = TH_MONTHS[a.getMonth()], mb = TH_MONTHS[b.getMonth()];
    if (a.getTime() === b.getTime()) return A + ' ' + ma + ' ' + ya;
    if (ya !== yb) return A + ' ' + ma + ' ' + ya + ' - ' + B + ' ' + mb + ' ' + yb;
    if (ma !== mb) return A + ' ' + ma + ' - ' + B + ' ' + mb + ' ' + yb;
    return A + ' - ' + B + ' ' + mb + ' ' + yb;
  }

  function defaultAttachments(sys) {
    var hasTraining = TRAINING_SYSTEMS.indexOf(sys) > -1;
    return ATTACH_TEMPLATE.filter(function (t) { return typeof t === 'string' || hasTraining; })
      .map(function (t) { return (typeof t === 'string' ? t : t.text).replace(/\{sys\}/g, sys); });
  }

  // ── ประกอบ Subject + เนื้อหา จากช่องกรอกด้านบน ──
  function compose() {
    var appr = val('sem-approver').trim() || DEFAULT_APPROVER;
    var pol = val('sem-polite') || 'ครับ';
    var where = val('sem-place').trim();
    var what = 'ติดตั้งระบบ' + _sys + (where ? ' ' + where : '');
    var atts = val('sem-atts').split('\n').map(function (x) { return x.replace(/^\s*\d+\.\s*/, '').trim(); }).filter(Boolean);
    var subject = 'ขออนุมัติตารางดำเนินงาน' + what + (_range ? ' (' + _range + ')' : '');
    var body = 'เรียน ' + appr + ' 👨\n'
      + '- ขออนุญาตส่งแผนดำเนินการ ' + what + ' ให้ตรวจสอบ' + pol + '\n'
      + 'รบกวน' + appr + 'ตรวจสอบ และอนุมัติ เพื่อจัดเตรียม Advance ต่อไป' + pol + '\n'
      + '#ขอบคุณ' + pol + '🙏\n'
      + (_aiNote ? '\nรายละเอียดเพิ่มเติม\n' + _aiNote + '\n' : '')
      + (atts.length ? '\nเอกสารแนบมาด้วย ดังนี้\n' + atts.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n') : '');
    return { subject: subject, body: body };
  }

  window.semRender = function () {
    var c = compose();
    var s = document.getElementById('sem-subject'), b = document.getElementById('sem-body');
    if (s) s.value = c.subject;
    if (b) b.value = c.body;
  };
  window.semSavePrefs = function () {
    lsSet(LS_APPROVER, val('sem-approver').trim());
    lsSet(LS_POLITE, val('sem-polite'));
    window.semRender();
  };
  window.openScheduleEmail = function (pid) {
    var p = (window.PROJECTS || []).find(function (x) { return x.id === pid; });
    if (!p) return;
    _pid = pid; _aiNote = ''; _sys = systemName(p); _range = thRange(p.start, p.end);
    var pl = place(p), pol = lsGet(LS_POLITE, 'ครับ');
    var row = function (label, html) { return '<div class="f-group" style="margin:0;"><label class="f-label">' + label + '</label>' + html + '</div>'; };
    var inp = function (id, v, extra) { return '<input class="f-input" id="' + id + '" value="' + esc(v) + '" ' + (extra || 'oninput="window.semRender()"') + '>'; };
    document.getElementById('m-sem-body').innerHTML =
      '<div class="f-grid" style="margin-bottom:10px;">'
      + row('ผู้อนุมัติ', inp('sem-approver', lsGet(LS_APPROVER, DEFAULT_APPROVER), 'oninput="window.semSavePrefs()"'))
      + row('คำลงท้าย', '<select class="f-input" id="sem-polite" onchange="window.semSavePrefs()">'
        + ['ครับ', 'ค่ะ'].map(function (x) { return '<option' + (x === pol ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>')
      + '</div>'
      + '<div style="margin-bottom:10px;">' + row('โรงพยาบาล / จังหวัด', inp('sem-place', [pl.hosp, pl.prov ? 'จ.' + pl.prov : ''].filter(Boolean).join(' '),
        'placeholder="เช่น รพ.บ้านหลวง จ.น่าน" oninput="window.semRender()"')) + '</div>'
      + row('เอกสารแนบ <span style="font-weight:400;color:var(--txt3);">(บรรทัดละ 1 รายการ — ระบบใส่เลขข้อให้เอง)</span>',
        '<textarea class="f-input" id="sem-atts" rows="5" oninput="window.semRender()">' + esc(defaultAttachments(_sys).join('\n')) + '</textarea>')
      + '<div style="border-top:1px dashed var(--border);margin:14px 0 10px;"></div>'
      + row('Subject <button type="button" class="btn btn-ghost btn-sm" style="margin-left:6px;padding:1px 8px;" onclick="window.semCopy(\'sem-subject\')">📋 คัดลอก</button>',
        '<input class="f-input" id="sem-subject">')
      + '<div style="height:10px;"></div>'
      + row('เนื้อหา <button type="button" class="btn btn-ghost btn-sm" style="margin-left:6px;padding:1px 8px;" onclick="window.semCopy(\'sem-body\')">📋 คัดลอก</button>',
        '<textarea class="f-input" id="sem-body" rows="13" style="line-height:1.6;"></textarea>')
      + '<div id="sem-ai-msg" style="font-size:12px;margin-top:6px;"></div>'
      + '<div style="color:var(--txt3);font-size:10.5px;margin-top:4px;">* แก้ช่องด้านบนแล้ว Subject/เนื้อหาจะสร้างใหม่ — ถ้าจะแก้ข้อความเอง ให้แก้เป็นขั้นตอนสุดท้ายก่อนคัดลอก</div>';
    document.getElementById('m-sem-foot').innerHTML =
      '<button class="btn btn-ghost" onclick="window.closeM(\'m-sem\')">ปิด</button>'
      + '<button class="btn btn-ghost" id="sem-ai-btn" onclick="window.semAiNote()">✨ AI ช่วยเขียนรายละเอียดเพิ่มเติม</button>'
      + '<button class="btn btn-teal" onclick="window.semMailto()">✉️ เปิดในโปรแกรมอีเมล</button>';
    window.semRender();
    window.openM('m-sem');
  };

  window.semCopy = function (id) {
    var text = val(id);
    if (!text || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(function () { window.showAlert && window.showAlert('คัดลอกแล้ว', 'success'); });
  };
  window.semMailto = function () {
    location.href = 'mailto:?subject=' + encodeURIComponent(val('sem-subject')) + '&body=' + encodeURIComponent(val('sem-body'));
  };

  // ── ✨ AI: เรียบเรียงทีมงาน/วันหยุด/รอบเข้าไซต์ เป็น 2–4 บรรทัด — ข้อเท็จจริงคำนวณในโค้ด ──
  function facts(p) {
    var mems = (p.members && p.members.length ? p.members : (p.team || []).map(function (id) { return { sid: id }; }));
    var lines = mems.map(function (m) {
      var s = (window.STAFF || []).find(function (x) { return x.id === m.sid; });
      return '  • ' + (s ? s.name + (s.nickname ? ' (' + s.nickname + ')' : '') : 'ไม่ทราบชื่อ') + ' | ' + thRange(m.s || p.start, m.e || p.end);
    });
    var hol = window.getProjectHolidayCount ? window.getProjectHolidayCount(p) : 0;
    var visits = (p.visits || []).filter(function (v) { return v.start; });
    return [
      'โครงการ: ' + p.name,
      'ช่วงดำเนินงาน: ' + thRange(p.start, p.end),
      'ทีมงาน ' + mems.length + ' คน' + (lines.length ? ':\n' + lines.join('\n') : ''),
      hol ? 'มีวันหยุดในช่วงงาน ' + hol + ' วัน' : '',
      visits.length ? 'รอบเข้าไซต์: ' + visits.map(function (v) { return 'ครั้งที่ ' + v.no + ' ' + thRange(v.start, v.end) + (v.purpose ? ' (' + v.purpose + ')' : ''); }).join(', ') : '',
      p.note ? 'หมายเหตุโครงการ: ' + String(p.note).slice(0, 300) : '',
    ].filter(Boolean).join('\n');
  }
  window.semAiNote = async function () {
    var p = (window.PROJECTS || []).find(function (x) { return x.id === _pid; });
    var msg = document.getElementById('sem-ai-msg'), btn = document.getElementById('sem-ai-btn');
    if (!p || !msg) return;
    msg.innerHTML = '<span style="color:var(--txt3);">⏳ AI กำลังเขียน...</span>';
    if (btn) btn.disabled = true;
    var system = 'คุณเป็นผู้ช่วยฝ่ายปฏิบัติการ บริษัทติดตั้งระบบซอฟต์แวร์โรงพยาบาล เขียน "รายละเอียดเพิ่มเติม" ภาษาไทย 2-4 บรรทัด '
      + 'สำหรับแทรกในอีเมลขออนุมัติตารางดำเนินงานถึงหัวหน้า สุภาพ กระชับ\n'
      + 'ใส่: ทีมงาน (บรรทัด "- ทีมงาน N คน: ชื่อเล่นหรือชื่อ คั่นด้วยจุลภาค" ถ้าวันของทุกคนตรงกับช่วงดำเนินงาน ถ้าไม่ตรงให้วงเล็บช่วงวันท้ายชื่อคนนั้น), '
      + 'วันหยุดในช่วงงาน, รอบเข้าไซต์, และหมายเหตุที่เกี่ยวกับการอนุมัติ (ถ้ามี)\n'
      + 'ทุกบรรทัดขึ้นต้นด้วย "- " · ห้ามใช้ Markdown อื่น · ห้ามคำขึ้นต้น/ลงท้ายจดหมาย · ใช้ชื่อ วันที่ ตัวเลข ตามข้อมูลที่ให้เท่านั้น ห้ามแต่งเพิ่ม · ข้อมูลที่ไม่มีให้ข้าม';
    try {
      var text = await window.aiChat(system, facts(p), { maxTokens: 400, temperature: 0.2 });
      _aiNote = text.replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim();
      window.semRender();
      msg.innerHTML = '<span style="color:var(--teal);">✅ เพิ่ม "รายละเอียดเพิ่มเติม" แล้ว — ตรวจทานก่อนส่ง</span> '
        + '<a href="#" onclick="event.preventDefault();window.semClearAi()" style="color:var(--violet);">เอาออก</a>';
    } catch (e) {
      msg.innerHTML = '<span style="color:var(--coral);">' + esc(String(e.message || e)) + '</span>';
    }
    if (btn) btn.disabled = false;
  };
  window.semClearAi = function () {
    _aiNote = '';
    window.semRender();
    var msg = document.getElementById('sem-ai-msg');
    if (msg) msg.innerHTML = '';
  };

})();
