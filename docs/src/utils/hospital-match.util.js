/**
 * hospital-match.util.js — เดาโรงพยาบาลจากข้อความ (เช่น ชื่อโครงการ "ติดตั้ง Inventory โรงพยาบาลเชียงกลาง จ.น่าน")
 * ใช้ตั้งค่าเริ่มต้นให้ช่อง "โรงพยาบาล" ตอนเพิ่ม/แก้ไขโครงการ (src/modules/projects.js) และตอนเปิดอบรม (src/modules/training-app.js)
 * ผู้ใช้ยังเลือกเองได้เสมอ — แค่ช่วยไม่ต้องพิมพ์ค้นหา
 *
 * guess()   — ชื่อ รพ. อยู่ในข้อความตรง ๆ เท่านั้น · ชื่อซ้ำหลายจังหวัดแล้วแยกด้วยจังหวัดไม่ได้ → null (ไม่เดา)
 * aiGuess() — ใช้เมื่อ guess() ไม่เจอ (สะกดผิด/ย่อ/ชื่ออังกฤษ) ให้ AI เลือกจาก "รายชื่อ รพ. ในระบบ" ที่คัดมาให้เท่านั้น
 *             และต้องชี้คำในชื่อโครงการที่ใช้อ้างอิงได้ ไม่งั้นถือว่าไม่พบ — ผลลัพธ์เป็นแค่คำแนะนำ ผู้ใช้กดยืนยันเอง
 */
(function () {
  // ตัดช่องว่าง และคำว่า โรงพยาบาล / รพ. ออก ให้ "รพ.เชียงกลาง" กับ "โรงพยาบาลเชียงกลาง" เทียบกันได้
  function norm(t) {
    return String(t || '').replace(/\s+/g, '').replace(/โรงพยาบาล|รพ\./g, '').toLowerCase();
  }
  function normProv(t) { return String(t || '').replace(/\s+/g, '').replace(/^จังหวัด|^จ\./, ''); }

  // hospitals = [{ id, name, province, ... }] → รพ. ที่ชื่ออยู่ในข้อความ (ชื่อยาวสุดก่อน กัน "เชียง" ชนะ "เชียงกลาง") หรือ null
  function guess(text, hospitals) {
    var t = norm(text);
    if (!t) return null;
    var best = [], bestLen = 0;
    (hospitals || []).forEach(function (h) {
      var n = norm(h.name);
      if (n.length < 3 || n.length < bestLen || t.indexOf(n) === -1) return;
      if (n.length > bestLen) { best = []; bestLen = n.length; }
      best.push(h);
    });
    if (best.length <= 1) return best[0] || null;
    // ชื่อเดียวกันหลายแห่ง — เลือกได้เฉพาะเมื่อข้อความระบุจังหวัดตรงแห่งเดียว
    var raw = String(text || '').replace(/\s+/g, '');
    var inProv = best.filter(function (h) { var p = normProv(h.province); return p && raw.indexOf(p) !== -1; });
    return inProv.length === 1 ? inProv[0] : null;
  }

  // ── รายชื่อ รพ. ที่น่าจะใช่ (ส่งให้ AI เลือก) — ความคล้ายของชื่อ + รหัส 5 หลักในข้อความ + จังหวัดที่ระบุในข้อความ ──
  function candidates(text, hospitals, limit) {
    var t = norm(text), raw = String(text || '').replace(/\s+/g, '');
    var sim = window.aiTextSim || function () { return 0; };
    var codes = String(text || '').match(/\d{5}/g) || [];
    return (hospitals || []).map(function (h) {
      var n = norm(h.name), p = normProv(h.province);
      var s = 0;
      // ความคล้ายเทียบกับช่วงของข้อความที่ยาวเท่าชื่อ (ชื่อโครงการยาวกว่าชื่อ รพ. มาก เทียบทั้งก้อนคะแนนจะต่ำเกิน)
      if (n.length >= 2) {
        for (var i = 0; i + n.length <= t.length + 2; i++) s = Math.max(s, sim(n, t.substr(i, n.length + 2)));
      }
      if (h.code && codes.indexOf(String(h.code)) !== -1) s += 1;
      if (p && raw.indexOf(p) !== -1) s += 0.15;
      return { h: h, score: s };
    }).filter(function (x) { return x.score >= 0.35; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, limit || 25)
      .map(function (x) { return x.h; });
  }

  // → { hospital, by:'rule'|'ai', evidence, reason } หรือ null (ไม่พบที่ตรงแน่ชัด)
  async function aiGuess(text, hospitals) {
    var exact = guess(text, hospitals);
    if (exact) return { hospital: exact, by: 'rule', evidence: exact.name, reason: 'ชื่อโรงพยาบาลอยู่ในชื่อโครงการ' };
    if (!window.aiChatJson) return null;
    var list = candidates(text, hospitals, 25);
    // ชื่อ รพ. เป็นภาษาอังกฤษ (เช่น "Chiang Klang Hospital") เทียบอักษรกับชื่อไทยไม่ได้ — ให้ AI ถอดเป็นชื่อไทยก่อนแล้วค่อยคัดรายชื่อ
    if (!list.length && /[a-z]{4,}/i.test(text)) {
      var th = await window.aiChatJson('ดึงชื่อโรงพยาบาลจากชื่อโครงการ แล้วเขียนเป็นภาษาไทย (ไม่ต้องมีคำว่าโรงพยาบาล) ถ้าไม่มีชื่อโรงพยาบาลตอบ null\nตอบ JSON เท่านั้น: {"th": "<ชื่อไทย หรือ null>"}',
        'ชื่อโครงการ: ' + text, { maxTokens: 100, temperature: 0 });
      if (th && th.th && th.th !== 'null') list = candidates(text + ' ' + th.th, hospitals, 25);
    }
    if (!list.length) return null;
    var sys = 'คุณช่วยจับคู่ "ชื่อโครงการ" กับโรงพยาบาลในรายการที่ให้เท่านั้น\n'
      + 'กติกา:\n'
      + '- ตอบเลขลำดับ (no) ที่อยู่ในรายการเท่านั้น ห้ามแต่งเลขหรือชื่อขึ้นเอง\n'
      + '- เลือกเฉพาะเมื่อชื่อโครงการพูดถึงโรงพยาบาลนั้นชัดเจน (สะกดต่าง/ย่อ/ภาษาอังกฤษ/พิมพ์ผิดเล็กน้อยได้)\n'
      + '- ถ้าชื่อโรงพยาบาลซ้ำกันหลายจังหวัด และชื่อโครงการไม่ระบุจังหวัด ให้ตอบ null\n'
      + '- ไม่แน่ใจ ไม่มีชื่อ รพ. ในชื่อโครงการ หรือไม่มีในรายการ → ตอบ null ห้ามเดา\n'
      + 'ตอบเป็น JSON เท่านั้น: {"no": <เลขลำดับ หรือ null>, "evidence": "<คำที่คัดลอกมาจากชื่อโครงการตรงตัว ที่หมายถึง รพ. นี้>", "confidence": <0-1>, "reason": "<เหตุผลสั้น ๆ ภาษาไทย>"}';
    // ใช้เลขลำดับแทน id ในระบบ — โมเดลชอบตอบรหัส รพ. 5 หลักมาแทน id
    var user = 'ชื่อโครงการ: ' + text + '\n\nรายการโรงพยาบาล (no | รหัส | ชื่อ | จังหวัด):\n'
      + list.map(function (h, i) { return (i + 1) + ' | ' + (h.code || '-') + ' | ' + h.name + ' | ' + (h.province || '-'); }).join('\n');
    var res = await window.aiChatJson(sys, user, { maxTokens: 300, temperature: 0 });
    var h = res && list[parseInt(res.no, 10) - 1];
    // ตรวจซ้ำฝั่งเรา: ต้องอยู่ในรายการ, มั่นใจพอ, และคำอ้างอิงต้องมีอยู่จริงในชื่อโครงการ
    if (!h || !(Number(res.confidence) >= 0.7)) return null;
    var ev = String(res.evidence || '').trim();
    if (norm(ev).length < 2 || norm(text).indexOf(norm(ev)) === -1) return null;
    return { hospital: h, by: 'ai', evidence: ev, reason: String(res.reason || '') };
  }

  window.HospitalMatch = { guess: guess, candidates: candidates, aiGuess: aiGuess };
})();
