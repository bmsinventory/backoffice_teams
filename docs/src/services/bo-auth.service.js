/**
 * bo-auth.service.js — บัญชี/สิทธิ์ของ Backoffice สำหรับระบบอบรม (/training/) — รวมแท็บแบบทดสอบ
 * session ใช้ตัวเดียวกับ Backoffice (src/utils/session.util.js) — Login ที่ไหนก็เข้าได้ทุกส่วน
 * สิทธิ์: Role admin = ทุกอย่าง · Role อื่นตามแถว "อบรม / แบบทดสอบ" (module training) ในหน้าสิทธิ์การใช้งานของ Backoffice
 *   view = เข้าหน้าผู้ดูแลได้ · add = นำเข้าข้อมูล · del = เคลียร์ข้อมูลตามโครงการ (ตรวจใน src/modules/training-app.js)
 * ต้องโหลดหลัง ../env-config.js และ session.util.js
 */
(function () {
  // ค่าเริ่มต้นเมื่อ Admin ยังไม่ได้ตั้งสิทธิ์ "อบรม" ให้ Role นั้น (ตรงกับ _roleDefaultPerms ใน src/utils/permission.util.js)
  var FULL = { view: true, add: true, edit: true, del: true }, NONE = { view: false, add: false, edit: false, del: false };
  var DEFAULT_PERM = { pm: FULL };

  // แถว users → รูปแบบเดียวกับ transform.USERS ของ Backoffice
  function norm(d) {
    return { id: String(d.user_id || d.id), username: d.username || '', password: d.password || '', name: d.name || d.display_name || '',
      role: d.role || 'viewer', active: d.is_active !== false && d.is_active !== 'FALSE', staffId: d.staff_id || '' };
  }
  // staffId = พนักงานที่ผูกกับบัญชี (ใช้หาว่าอยู่ในทีมโครงการไหน)
  function pub(u) { return { id: u.id, username: u.username, name: u.name || u.username, role: u.role, staffId: u.staffId }; }

  function rolePerms(sb) { return sb.from('settings').select('*').eq('id', 'role_permissions').maybeSingle().then(function (r) { return r.data; }, function () { return null; }); }
  // rp = แถว settings role_permissions (ส่งมา = ดึงไว้แล้ว)
  async function perm(sb, role, rp) {
    if (role === 'admin') return FULL;
    if (rp === undefined) rp = await rolePerms(sb);
    var p = rp && rp[role] && rp[role].training;
    if (p) return { view: !!p.view, add: !!p.add, edit: !!p.edit, del: !!p.del };
    return DEFAULT_PERM[role] || NONE;
  }

  window.BoAuth = {
    // ผู้ใช้ที่ Login อยู่ (ตรวจกับฐานข้อมูลทุกครั้ง) → { id, username, name, role, staffId, perm } หรือ null
    current: async function (sb) {
      var s = window.BmsSession.get();
      if (!s || !s.uid) return null;
      var id = String(s.uid);
      var res = await Promise.all([sb.from('users').select('*').or('id.eq.' + id + ',user_id.eq.' + id), rolePerms(sb)]); // พร้อมกัน
      var row = (res[0].data || []).map(norm).find(function (u) { return u.id === id; });
      if (!row || !row.active || window.BmsSession.sig(row) !== s.sig) return null;
      var u = pub(row);
      u.perm = await perm(sb, u.role, res[1]);
      return u;
    },
    // Login ด้วยบัญชี Backoffice (กฎเดียวกับหน้า Login หลัก) → สร้าง session ร่วม · ไม่ผ่านคืน null
    login: async function (sb, username, password, remember) {
      var r = await sb.from('users').select('*').eq('username', username);
      var row = (r.data || []).map(norm).find(function (u) { return u.username === username && u.password === password && u.active; });
      if (!row) return null;
      window.BmsSession.set({ uid: row.id, sig: window.BmsSession.sig(row) }, !!remember);
      var u = pub(row);
      u.perm = await perm(sb, u.role);
      return u;
    },
    logout: function () { window.BmsSession.clear(); },
  };
})();
