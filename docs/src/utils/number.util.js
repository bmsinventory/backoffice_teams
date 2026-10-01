/**
 * number.util.js — Number & Currency Formatting Utilities
 */
(function () {

  // ── Format: Number → Thai Baht (no decimals) ──
  window.fc = function (n) {
    return new Intl.NumberFormat('th-TH', { style:'currency', currency:'THB', maximumFractionDigits:0 }).format(n || 0);
  };

  // ── Format: Number → Thai Baht (2 decimals) ──
  window.fca = function (n) {
    return new Intl.NumberFormat('th-TH', { style:'currency', currency:'THB', minimumFractionDigits:2, maximumFractionDigits:2 }).format(n || 0);
  };

})();
