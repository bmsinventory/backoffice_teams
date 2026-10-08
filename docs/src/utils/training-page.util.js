/**
 * training-page.util.js — ระบบอบรม /training/ มีหน้าเดียว (training/index.html) แบ่ง 4 ส่วน
 *   ไม่ระบุ page      → หน้าหลัก (ลงทะเบียน · เช็คชื่อ · Analytics · ผู้ดูแล)   ?site=รหัส รพ.
 *   ?page=survey      → แบบประเมินหลังอบรม (ผู้เข้าอบรมกรอก ไม่ต้อง Login)    ?page=survey&site=รหัส รพ.
 *   ?page=quiz        → แบบทดสอบหลังอบรม + ดูใบประกาศ (ไม่ต้อง Login)          ?page=quiz&site=…  /  ?page=quiz&cert=เลขที่
 *   ?page=manual      → คู่มือการใช้งาน
 * หน้าตาแต่ละส่วนอยู่ใน <template id="trn-page-..."> ของ index.html · ตัวนี้ใส่ส่วนที่เลือก แล้วโหลดเฉพาะ style/script
 * ของส่วนนั้น (โค้ดแต่ละส่วนใช้ชื่อตัวแปรซ้ำกัน เช่น currentSite / showToast — โหลดพร้อมกันไม่ได้)
 * โหลดใน <head> (ซ่อนหน้าไว้จนกว่า style ของส่วนนั้นโหลดเสร็จ — ไม่กะพริบ)
 */
(function () {
  var LIB = {
    supabase: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js', // URL เดียวกับ Backoffice (index.html) → ใช้แคชร่วม ไม่โหลดซ้ำ
    env:      '../env-config.js',  // ฐานข้อมูลเดียวกับ Backoffice (container สร้างตอน start)
  };
  var PAGES = {
    app: {
      title: 'BMS Training System',
      css: ['../src/styles/modules/training.css', '../src/styles/components/calc-tip.css'],
      js: [LIB.supabase, LIB.env, '../src/utils/session.util.js', '../src/services/bo-auth.service.js', '../src/utils/project-team.util.js',
        'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js',
        '../src/services/ai.service.js', // ตัวเรียก AI กลางตัวเดียวกับ Backoffice
        '../src/utils/trn-cert.util.js', // ใบประกาศ/ส่งอีเมล — ใช้ร่วมกับหน้าแบบทดสอบ
        '../src/utils/calc-tip.util.js', // ปุ่ม ⓘ คำนวณจากอะไร
        '../src/modules/training-app.js',
        '../src/modules/training-ai.js',
        '../src/modules/training-quiz.js'], // แบบทดสอบ: ข้อสอบ/ผลสอบ/ตั้งค่าใบประกาศ (แท็บผู้ดูแล) // AI: สรุปผลประเมิน / สรุปการอบรม / ร่างข้อความเชิญ // Excel/กราฟ/สร้างรูป/ครอปรูป/อ่าน QR โหลดเมื่อจะใช้ (_needLib ใน src/modules/training-app.js)
    },
    survey: {
      title: 'แบบประเมินความพึงพอใจการอบรม — BMS Training',
      css: ['../src/styles/modules/training-survey.css'],
      js: [LIB.supabase, LIB.env, '../src/modules/training-survey.js'],
    },
    quiz: {
      title: 'แบบทดสอบหลังอบรม — BMS Training',
      css: ['../src/styles/modules/training-quiz-take.css'],
      js: [LIB.supabase, LIB.env, 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js',
        '../src/services/ai.service.js', // อธิบายข้อที่ตอบผิด
        '../src/utils/trn-cert.util.js', '../src/modules/training-quiz-take.js'],
    },
    manual: {
      title: 'คู่มือการใช้งาน BMS Training',
      css: ['../src/styles/modules/training-manual.css'],
      js: ['../src/modules/training-manual.js'],
    },
  };
  // ใช้ร่วมทุกส่วน: แผงตัวเลือกของ <select> หน้าตาเดียวกันทุกเครื่อง (แทน popup ของระบบ) · แปลงอีโมจิเป็นไอคอน Tabler
  var COMMON = { css: ['../src/styles/components/select-ui.css', '../src/styles/components/emoji-icons.css'], js: ['../src/utils/select-ui.util.js', '../src/utils/icons.util.js'] };
  var name = new URLSearchParams(location.search).get('page');
  if (!PAGES[name]) name = 'app';
  var page = { title: PAGES[name].title, css: COMMON.css.concat(PAGES[name].css), js: COMMON.js.concat(PAGES[name].js) };
  window.TRN_PAGE = name;
  document.title = page.title;
  // เริ่มดาวน์โหลด script ทุกตัวพร้อมกันตั้งแต่ตอนนี้ (ตัว <script> จริงใส่หลัง DOMContentLoaded — ไม่ต้องรอ HTML ทั้งหน้าก่อนค่อยโหลด)
  page.js.forEach(function (src) {
    var l = document.createElement('link');
    l.rel = 'preload'; l.as = 'script'; l.href = src;
    document.head.appendChild(l);
  });

  // ซ่อนหน้าไว้ก่อน จนกว่า style ของส่วนนี้โหลดเสร็จ
  var root = document.documentElement;
  root.classList.add('trn-boot');
  document.head.insertAdjacentHTML('beforeend', '<style>html.trn-boot body{visibility:hidden}</style>');
  var show = function () { root.classList.remove('trn-boot'); };
  setTimeout(show, 4000); // กันค้าง ถ้า style โหลดไม่ขึ้น

  var pending = page.css.length;
  page.css.forEach(function (href) {
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    l.onload = l.onerror = function () { if (--pending === 0) show(); };
    document.head.appendChild(l);
  });

  document.addEventListener('DOMContentLoaded', function () {
    var tpl = document.getElementById('trn-page-' + name);
    document.body.replaceChildren(tpl.content.cloneNode(true)); // เหลือเฉพาะส่วนที่เลือก
    // script ต้องรันตามลำดับ (ไลบรารีก่อน → โค้ดของส่วนนั้นท้ายสุด) และหลังใส่หน้าตาแล้ว
    page.js.forEach(function (src) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      document.body.appendChild(s);
    });
    if (location.hash) { // ลิงก์ไปหัวข้อในคู่มือ (#survey ฯลฯ) — เนื้อหาเพิ่งใส่ จึงเลื่อนเอง
      var t = document.getElementById(location.hash.slice(1));
      if (t) setTimeout(function () { t.scrollIntoView(); }, 50);
    }
  });
})();
