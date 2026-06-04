/**
 * dom.util.js — DOM Manipulation & UI State Utilities
 * showLoader, hideLoader, showDbError, และ DOM helpers
 */
(function () {

  // ── System Loader ──
  window.showLoader = function (txt) {
    var el   = document.getElementById('sys-loader');
    var text = document.getElementById('sys-loader-text');
    var pulse = document.querySelector('#sys-loader .pulse');
    if (text)  text.innerHTML = txt || 'กำลังโหลดข้อมูล...';
    if (pulse) pulse.style.display = 'inline-block';
    if (el)    el.classList.add('on');
  };

  window.hideLoader = function () {
    var el = document.getElementById('sys-loader');
    if (el) el.classList.remove('on');
  };

  // ── Database Error Display ──
  window.showDbError = function (err) {
    console.error('Supabase Error:', err);
    var errMsg   = err && err.message ? window.esc(err.message) : '';
    var isNoTable = errMsg.includes('does not exist') || errMsg.includes('relation') || errMsg.includes('42P01');

    var msg = '<div style="color:var(--coral);font-weight:bold;font-size:16px;margin-bottom:10px;">❌ ไม่สามารถเชื่อมต่อ Supabase ได้</div>';
    msg += '<div style="font-size:13px;color:var(--txt);text-align:left;background:var(--surface2);padding:14px;border-radius:8px;border:1px solid var(--border);max-width:520px;line-height:1.7;">';

    if (isNoTable) {
      msg += '<strong style="color:var(--coral);">⚠ ตารางยังไม่ถูกสร้างใน Supabase</strong><br><br>';
      msg += 'กรุณารัน <code>supabase-schema.sql</code> ใน Supabase SQL Editor ก่อน:<br>';
      msg += '<a href="https://supabase.com/dashboard" target="_blank" style="color:var(--violet);font-weight:600;">→ เปิด Supabase Dashboard</a><br><br>';
    } else {
      msg += '<strong>ตรวจสอบ:</strong><br>';
      msg += '1. รัน <code>supabase-schema.sql</code> ใน SQL Editor แล้วหรือไม่<br>';
      msg += '2. <code>SUPABASE_URL</code> และ <code>SUPABASE_ANON_KEY</code> ถูกต้อง<br>';
      msg += '3. RLS policy อนุญาต <code>anon</code> หรือไม่<br>';
    }
    if (errMsg) msg += '<code style="font-size:11px;color:var(--coral);word-break:break-all;">' + errMsg + '</code>';
    msg += '</div>';
    msg += '<button onclick="location.reload()" style="margin-top:14px;padding:8px 20px;background:var(--violet);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">🔄 ลองใหม่</button>';

    var text  = document.getElementById('sys-loader-text');
    var pulse = document.querySelector('#sys-loader .pulse');
    var el    = document.getElementById('sys-loader');
    if (text)  text.innerHTML = msg;
    if (pulse) pulse.style.display = 'none';
    if (el)    el.classList.add('on');
  };

  // ── View Active Check ──
  window._von = function (id) {
    var el = document.getElementById(id);
    return el && el.classList.contains('on');
  };

})();
