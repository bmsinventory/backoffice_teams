/**
 * theme.util.js — โหมดมืด/สว่าง ใช้ร่วมทุกหน้า (Backoffice, ระบบอบรม /training/, แบบประเมิน)
 * โหลดใน <head> ก่อน CSS วาด (ไม่กะพริบ) · ค่าที่เลือกเก็บใน localStorage '_bms_dark' ('dark' | 'light' | ไม่มี = ตามเครื่อง)
 * ปุ่มสลับอยู่ที่ Backoffice (src/modules/mobile.js toggleDarkMode) — หน้าอื่นที่เปิดอยู่ (รวม iframe ระบบอบรม) เปลี่ยนตามทันทีผ่าน storage event
 */
(function () {
  function apply() {
    var saved = null;
    try { saved = localStorage.getItem('_bms_dark'); } catch (e) {}
    var root = document.documentElement;
    // ไม่ได้เลือกเอง + เครื่องเป็นโหมดมืด → ตั้ง data-theme="dark" ให้ด้วย (สไตล์มืดของบางชิ้นส่วนอิง attribute นี้)
    var sysDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (saved === 'dark' || (saved !== 'light' && sysDark)) root.setAttribute('data-theme', 'dark');
    else if (saved === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
  }
  apply();
  window.addEventListener('storage', function (e) { if (e.key === '_bms_dark') apply(); });
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
  window.BmsTheme = {
    apply: apply,
    isDark: function () {
      var t = document.documentElement.getAttribute('data-theme');
      return t === 'dark' || (t !== 'light' && !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches));
    },
  };
})();
