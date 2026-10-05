/**
 * hospital-match.util.js — เดาโรงพยาบาลจากข้อความ (เช่น ชื่อโครงการ "ติดตั้ง Inventory โรงพยาบาลเชียงกลาง จ.น่าน")
 * ใช้ตั้งค่าเริ่มต้นให้ช่อง "โรงพยาบาล" ตอนเพิ่ม/แก้ไขโครงการ (src/modules/impl-tracker.js) และตอนเปิดอบรม (src/modules/training-app.js)
 * ผู้ใช้ยังเลือกเองได้เสมอ — แค่ช่วยไม่ต้องพิมพ์ค้นหา
 */
(function () {
  // ตัดช่องว่าง และคำว่า โรงพยาบาล / รพ. ออก ให้ "รพ.เชียงกลาง" กับ "โรงพยาบาลเชียงกลาง" เทียบกันได้
  function norm(t) {
    return String(t || '').replace(/\s+/g, '').replace(/โรงพยาบาล|รพ\./g, '').toLowerCase();
  }
  // hospitals = [{ id, name, ... }] → รพ. ที่ชื่ออยู่ในข้อความ (ชื่อยาวสุดก่อน กัน "เชียง" ชนะ "เชียงกลาง") หรือ null
  function guess(text, hospitals) {
    var t = norm(text);
    if (!t) return null;
    var best = null, bestLen = 0;
    (hospitals || []).forEach(function (h) {
      var n = norm(h.name);
      if (n.length >= 3 && n.length > bestLen && t.indexOf(n) !== -1) { best = h; bestLen = n.length; }
    });
    return best;
  }
  window.HospitalMatch = { guess: guess };
})();
