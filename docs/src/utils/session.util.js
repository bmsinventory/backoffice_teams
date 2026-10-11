/**
 * session.util.js — session Login ที่เดียวของทั้งระบบ (Backoffice + ระบบอบรม /training/) · แบบทดสอบส่ง uid/tok ให้ฐานข้อมูลตรวจ (trn_quiz_admin)
 * เก็บ { uid, tok } ใน sessionStorage (และ localStorage เมื่อติ๊ก "จดจำ") ภายใต้ key '_bms_sess'
 * tok = token จาก bo_login (db-schema.sql SECURITY) — ฐานข้อมูลเก็บแค่ SHA-256 · เปลี่ยนรหัสผ่าน/ปิดบัญชี/ออกจากระบบ = ใช้ไม่ได้ทันที
 * session แบบเดิม { uid, sig } (ก่อนมี token) แลกเป็น token ด้วย bo_session_upgrade — ดู resolve() ด้านล่าง
 */
(function () {
  var KEY = '_bms_sess';
  window.BmsSession = {
    get: function () {
      try { var raw = sessionStorage.getItem(KEY) || localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    },
    // ติ๊ก "จดจำ" ไว้ = มีใน localStorage
    persisted: function () {
      try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
    },
    token: function () { var s = this.get(); return (s && s.tok) || ''; },
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
    // ตรวจ session กับฐานข้อมูล → uid ของผู้ใช้ · null = ใช้ไม่ได้ (ลบทิ้งแล้ว) · throw = ติดต่อฐานข้อมูลไม่ได้ (ยังไม่ลบ)
    resolve: async function (sb) {
      var s = this.get();
      if (!s || !s.uid) return null;
      var persist = this.persisted(), r;
      if (s.tok) r = await sb.rpc('bo_session_check', { p_token: s.tok });
      else if (s.sig) r = await sb.rpc('bo_session_upgrade', { p_uid: String(s.uid), p_sig: s.sig, p_persist: persist });
      else { this.clear(); return null; }
      if (r.error) throw r.error;
      var d = r.data || {};
      if (!d.ok) { this.clear(); return null; }
      if (d.token) this.set({ uid: d.uid, tok: d.token }, persist);
      return String(d.uid);
    },
    // Login → { uid } · { error:'invalid' } · { error:'locked', minutes }
    login: async function (sb, username, password, persist) {
      var r = await sb.rpc('bo_login', { p_username: username, p_password: password, p_persist: !!persist });
      if (r.error) throw r.error;
      var d = r.data || {};
      if (!d.ok) return { error: d.error || 'invalid', minutes: d.minutes };
      this.set({ uid: d.uid, tok: d.token }, !!persist);
      return { uid: String(d.uid) };
    },
    logout: function (sb) {
      var tok = this.token();
      this.clear();
      if (tok && sb) sb.rpc('bo_logout', { p_token: tok }).then(function () {}, function () {});
    },
  };
  // รหัสผ่านที่ฟีเจอร์ "จดจำ" รุ่นก่อนเก็บไว้ในเครื่อง — เลิกเก็บแล้ว ล้างของเก่าทิ้ง
  try { localStorage.removeItem('_bms_rem_p'); } catch (e) {}
})();
