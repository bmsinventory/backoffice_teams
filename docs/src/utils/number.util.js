/**
 * number.util.js — Number & Currency Formatting Utilities
 */
(function () {

  // สร้างตัวจัดรูปแบบครั้งเดียว — เดิมสร้าง Intl.NumberFormat ใหม่ทุกครั้งที่เรียก (หน้าเดียวเรียกเป็นพันครั้ง)
  var _fc  = new Intl.NumberFormat('th-TH', { style:'currency', currency:'THB', maximumFractionDigits:0 });
  var _fca = new Intl.NumberFormat('th-TH', { style:'currency', currency:'THB', minimumFractionDigits:2, maximumFractionDigits:2 });

  // ── Format: Number → Thai Baht (no decimals) ──
  window.fc = function (n) {
    return _fc.format(n || 0);
  };

  // ── Format: Number → Thai Baht (2 decimals) ──
  window.fca = function (n) {
    return _fca.format(n || 0);
  };

})();
