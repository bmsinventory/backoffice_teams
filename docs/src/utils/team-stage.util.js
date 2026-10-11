/**
 * team-stage.util.js — ส่วนกลางของเวทีตัวการ์ตูน "แนะนำทีม" ใช้ร่วมกัน 2 หน้า
 *   src/modules/team-showcase.js (ในระบบ) · team.html?t=<token> (ลิงก์แชร์สาธารณะ ไม่ต้อง login)
 * window.TeamStage = { PALETTE, DUR, placeholderSvg, roleOf, styleFor, VOICE_MEMBER, NAME_END, VOICE_KEYS, speechOf }
 */
(function () {

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── ตัวการ์ตูนแทนสำหรับคนที่ยังไม่มีรูป (เงาคนสีขาวโปร่ง + ชื่อเล่น) ──
  function placeholderSvg(name) {
    return '<svg viewBox="0 0 300 500" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
      + '<g fill="#1a1d2e" opacity=".16">'
      + '<ellipse cx="150" cy="490" rx="90" ry="9"/>'
      + '<rect x="112" y="380" width="34" height="100" rx="15"/><rect x="154" y="380" width="34" height="100" rx="15"/>'
      + '<rect x="84" y="244" width="132" height="156" rx="46"/><circle cx="150" cy="150" r="98"/></g>'
      + '<text x="150" y="166" text-anchor="middle" font-size="44" font-weight="700" fill="#fff" font-family="Noto Sans Thai, sans-serif">'
      + escHtml(String(name || '?').slice(0, 6)) + '</text>'
      + '<text x="150" y="330" text-anchor="middle" font-size="20" fill="#fff" opacity=".9" font-family="Noto Sans Thai, sans-serif">ยังไม่มีรูป</text>'
      + '</svg>';
  }

  // ตำแหน่งของคนที่ i เมื่อคนที่ a อยู่ตรงกลาง (เกิน 4 คน = คนที่เหลือซ่อนไว้ด้านหลัง)
  function roleOf(i, n, a) {
    var d = (i - a + n) % n;
    if (d === 0) return 'center';
    if (n >= 2 && d === 1) return 'right';
    if (n >= 3 && d === n - 1) return 'left';
    if (n >= 4 && d === 2) return 'back';
    return 'hidden';
  }
  function styleFor(role, mob) {
    // คนตรงกลางไม่ขยายด้วย scale (รูปตัวการ์ตูนเต็มกรอบ ขยายแล้วหัวล้นจอ) — ใช้ความสูงแทน แอนิเมชันเลยมาจาก height
    if (role === 'center') return { transform: 'translateX(-50%) scale(1)', filter: 'blur(0)', opacity: 1, zIndex: 20, left: '50%', height: mob ? '62%' : '90%', bottom: mob ? '20%' : '0' };
    var side = { transform: 'translateX(-50%) scale(1)', filter: 'blur(2px)', opacity: .85, zIndex: 10, height: mob ? '16%' : '28%', bottom: mob ? '32%' : '12%' };
    if (role === 'left')  { side.left = mob ? '20%' : '30%'; return side; }
    if (role === 'right') { side.left = mob ? '80%' : '70%'; return side; }
    return { transform: 'translateX(-50%) scale(1)', filter: 'blur(4px)', opacity: role === 'back' ? 1 : 0, zIndex: 5, left: '50%', height: mob ? '13%' : '22%', bottom: mob ? '32%' : '12%' };
  }

  // ── 🔊 คำพูดแนะนำตัว (เล่นด้วย window.TTS — src/services/tts.service.js) ──
  // แม่แบบมีช่อง {ชื่อเล่น} ฯลฯ · 1 บรรทัด = 1 ท่อน (เว้นจังหวะ) · [ ... ] = ข้อมูลข้างในว่างก็ข้ามทั้งวงเล็บ
  //  บรรทัดที่ข้อมูลทุกช่องว่าง = ไม่พูดบรรทัดนั้น · คำทักทาย/ปิดท้ายว่าง = ไม่พูด
  // ลงท้าย "ค่ะ" ทุกบรรทัด — บริการเสียงชอบตัดพยางค์สุดท้าย (เช่น "ชำนาญการพิเศษ") ให้ "ค่ะ" เป็นคำสุดท้ายแทน
  //  ยกเว้นบรรทัดที่จบด้วยชื่อ ({ชื่อเล่น}/{ชื่อจริง}) — ไม่พูด "ค่ะ" ต่อท้ายชื่อคน (มี "ค่ะ" ท้ายชื่อ = ตัดออก)
  var VOICE_MEMBER = 'คนที่ {ลำดับ} คุณ{ชื่อเล่น} [{ชื่อจริง}]\n[{หัวข้อ}] [แผนก {แผนก}]ค่ะ\n{คำแนะนำ}ค่ะ';
  var NAME_END = /(\{(?:ชื่อเล่น|ชื่อจริง)\}\]?)\s*(?:ค่ะ)?\s*$/;
  var VOICE_KEYS = ['ลำดับ', 'ชื่อเล่น', 'ชื่อจริง', 'หัวข้อ', 'ตำแหน่ง', 'แผนก', 'คำแนะนำ', 'ทีม', 'จำนวน'];
  function fillVoice(tpl, vars) {
    var KEY = /\{([^{}]+)\}/g;
    var keysIn = function (str) { var r = [], x; KEY.lastIndex = 0; while ((x = KEY.exec(str))) if (x[1] in vars) r.push(x[1]); return r; };
    var sub = function (str) { return str.replace(KEY, function (all, k) { return k in vars ? vars[k] : all; }); };
    return String(tpl || '').split(/\r?\n/).map(function (line) {
      var name = NAME_END.test(line);
      if (name) line = line.replace(NAME_END, '$1');
      var ks = keysIn(line);
      if (ks.length && ks.every(function (k) { return !vars[k]; })) return null;
      line = line.replace(/\[([^\[\]]*)\]/g, function (all, inner) {
        return keysIn(inner).some(function (k) { return !vars[k]; }) ? '' : inner;
      });
      // คำแนะนำที่พิมพ์ "ค่ะ" ไว้เองอยู่แล้ว + แม่แบบต่อ "ค่ะ" → ไม่พูดซ้ำ "ค่ะค่ะ"
      var text = sub(line).replace(/\s+/g, ' ').trim().replace(/(ค่ะ|คะ|ครับ)\s*ค่ะ$/, '$1').replace(/\s+ค่ะ$/, 'ค่ะ');
      // บรรทัดจบด้วยชื่อ: TTS ไม่ต่อ "ค่ะ" ให้ (noPolite)
      return text ? { text: text, noPolite: name } : null;
    }).filter(Boolean);
  }
  function teamVars(t, n) { return { 'ทีม': t.name || '', 'จำนวน': window.TTS.num(n) }; }
  // m = { staff: { name, nickname, role, dept }, title, desc }
  function memberVars(t, m, i, n) {
    var s = m.staff, nk = s.nickname || s.name;
    return Object.assign(teamVars(t, n), {
      'ลำดับ': window.TTS.num(i + 1), 'ชื่อเล่น': nk, 'ชื่อจริง': s.name !== nk ? s.name : '',
      'หัวข้อ': m.title !== nk ? m.title : '', 'ตำแหน่ง': s.role || '', 'แผนก': s.dept || '', 'คำแนะนำ': m.desc || '',
    });
  }
  // ท่อนที่พูดตอนคนที่ i อยู่ตรงกลาง: (คำทักทาย ถ้า withIntro) + แนะนำตัว + (คำปิดท้าย ถ้าเป็นคนสุดท้าย)
  // t = { name, voice: { intro, member, outro } } · list[i].speech = บทพูดเฉพาะคน (ว่าง = ใช้แม่แบบทีม)
  function speechOf(t, list, i, withIntro) {
    var n = list.length, v = t.voice || {}, m = list[i];
    return [].concat(
      withIntro ? fillVoice(v.intro, teamVars(t, n)) : [],
      fillVoice(m.speech || v.member || VOICE_MEMBER, memberVars(t, m, i, n)),
      i === n - 1 ? fillVoice(v.outro, teamVars(t, n)) : []
    );
  }

  window.TeamStage = {
    PALETTE: ['#F4845F', '#6BBF7A', '#E882B4', '#6EB5FF', '#F2B33D', '#9B8CFF', '#4FC3C7', '#FF8A80'],
    DUR: 650,
    placeholderSvg: placeholderSvg,
    roleOf: roleOf,
    styleFor: styleFor,
    VOICE_MEMBER: VOICE_MEMBER, NAME_END: NAME_END, VOICE_KEYS: VOICE_KEYS,
    speechOf: speechOf,
  };

})();
