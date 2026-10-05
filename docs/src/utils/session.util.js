/**
 * session.util.js — session Login ที่เดียวของทั้งระบบ (Backoffice + ระบบอบรม /training/) · แบบทดสอบส่ง uid/sig ให้ฐานข้อมูลตรวจ (trn_quiz_admin)
 * เก็บ { uid, sig } ใน sessionStorage (และ localStorage เมื่อติ๊ก "จดจำ") ภายใต้ key '_bms_sess'
 * sig = djb2(id|password) — เปลี่ยนรหัสผ่านแล้ว session เก่าใช้ไม่ได้ทันที (ไม่เก็บรหัสผ่านเอง)
 */
(function () {
  var KEY = '_bms_sess';
  window.BmsSession = {
    sig: function (u) {
      var s = String(u.id) + '|' + String(u.password || ''), h = 5381;
      for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
      return (h >>> 0).toString(36);
    },
    get: function () {
      try { var raw = sessionStorage.getItem(KEY) || localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    },
    set: function (sess, persist) {
      try {
        var raw = JSON.stringify(sess);
        sessionStorage.setItem(KEY, raw);
        if (persist) localStorage.setItem(KEY, raw); else localStorage.removeItem(KEY);
      } catch (e) {}
    },
    clear: function () {
      try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch (e) {}
    },
  };
})();
