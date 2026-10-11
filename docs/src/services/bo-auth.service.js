/**
 * bo-auth.service.js — บัญชี/สิทธิ์ของ Backoffice สำหรับระบบอบรม (/training/) — รวมแท็บแบบทดสอบ
 * session ใช้ตัวเดียวกับ Backoffice (src/utils/session.util.js) — Login ที่ไหนก็เข้าได้ทุกส่วน
 * สิทธิ์: กลุ่ม is_super = ทุกอย่าง · นอกนั้นรวมสิทธิ์ "ระบบอบรม" (module training) ของทุกกลุ่มของผู้ใช้ (ตาราง roles)
 *   view = เข้าหน้าผู้ดูแลได้ · add = นำเข้าข้อมูล · del = เคลียร์ข้อมูลตามโครงการ (ตรวจใน src/modules/training-app.js)
 * ต้องโหลดหลัง ../env-config.js และ session.util.js
 */
(function () {
  var ACTS = ['view', 'add', 'edit', 'del'];

  // แถว users → รูปแบบเดียวกับ transform.USERS ของ Backoffice
  function norm(d) {
    return { id: String(d.user_id || d.id), username: d.username || '', name: d.name || d.display_name || '',
      roles: Array.isArray(d.roles) ? d.roles : [], active: d.is_active !== false && d.is_active !== 'FALSE', staffId: d.staff_id || '' };
  }
  // staffId = พนักงานที่ผูกกับบัญชี (ใช้หาว่าอยู่ในทีมโครงการไหน)
  function pub(u) { return { id: u.id, username: u.username, name: u.name || u.username, staffId: u.staffId }; }

  // กลุ่มของผู้ใช้ → { super, perm } (perm = สิทธิ์ training รวมทุกกลุ่ม)
  async function access(sb, roleIds) {
    var r = roleIds.length ? await sb.from('roles').select('is_super,perms').in('id', roleIds) : { data: [] };
    var out = { super: false, perm: {} };
    ACTS.forEach(function (a) { out.perm[a] = false; });
    (r.data || []).forEach(function (x) {
      if (x.is_super) out.super = true;
      var p = (x.perms && x.perms.training) || {};
      ACTS.forEach(function (a) { if (x.is_super || p[a] === true) out.perm[a] = true; });
    });
    return out;
  }
  async function withAccess(sb, row) {
    var u = pub(row), a = await access(sb, row.roles);
    u.super = a.super;
    u.perm = a.perm;
    return u;
  }

  // แถวผู้ใช้ตาม uid ของ session (ฐานข้อมูลตรวจรหัสผ่าน/session ให้แล้ว — src/utils/session.util.js)
  async function rowOf(sb, id) {
    var res = await sb.from('users').select('*').or('id.eq.' + id + ',user_id.eq.' + id);
    return (res.data || []).map(norm).find(function (u) { return u.id === id && u.active; }) || null;
  }

  window.BoAuth = {
    // ผู้ใช้ที่ Login อยู่ (ตรวจกับฐานข้อมูลทุกครั้ง) → { id, username, name, staffId, super, perm } หรือ null
    current: async function (sb) {
      var id = await window.BmsSession.resolve(sb);
      var row = id && await rowOf(sb, id);
      return row ? withAccess(sb, row) : null;
    },
    // Login ด้วยบัญชี Backoffice (กฎเดียวกับหน้า Login หลัก) → สร้าง session ร่วม · ไม่ผ่านคืน null · ถูกล็อก → { locked: นาที }
    login: async function (sb, username, password, remember) {
      var r = await window.BmsSession.login(sb, username, password, remember);
      if (r.error === 'locked') return { locked: r.minutes || 15 };
      var row = r.uid && await rowOf(sb, r.uid);
      return row ? withAccess(sb, row) : null;
    },
    logout: function (sb) { window.BmsSession.logout(sb); },
  };
})();
