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

  // ── Format: Number → compact (1K, 1M) ──
  window.fcn = function (n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
    return String(n || 0);
  };

})();
