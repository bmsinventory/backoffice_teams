/**
 * permission.util.js — สิทธิ์ตามกลุ่มสิทธิ์ (Role-Based Access Control)
 * ผู้ใช้มีได้หลายกลุ่ม (cu.roles = [roles.id]) → สิทธิ์ = รวมของทุกกลุ่ม (กลุ่มไหนให้ = ได้ · ไม่มีการห้ามทับ)
 * กลุ่ม is_super (Admin) = สิทธิ์เต็มทุกเมนู · ไม่มี key ใน perms = ไม่มีสิทธิ์
 * can(), canView(), canAdd(), canEdit(), canDel(), canApprove(), permScope(), isAdmin(), myRoles()
 */
(function () {

  window.ROLES = []; // ตาราง roles (realtime.service.js)

  var SCOPE_RANK = { own:1, dept:2, all:3 };

  // ── กลุ่มของผู้ใช้ (เรียงตาม sort_order) ──
  window.rolesOf = function (u) {
    var ids = (u && u.roles) || [];
    return (window.ROLES || []).filter(function (r) { return ids.indexOf(r.id) > -1; });
  };
  window.myRoles = function () { return window.rolesOf(window.cu); };

  // ── รวมสิทธิ์ของหลายกลุ่ม → { superUser, perms:{ module:{ view, add, edit, del, approve, scope } } }
  // ขอบเขต (scope) เอาที่กว้างที่สุด · กลุ่มที่ดูได้แต่ไม่ได้ตั้งขอบเขต = ทั้งหมด ──
  window.permsForRoles = function (roles) {
    var eff = { superUser:false, perms:{} };
    (roles || []).forEach(function (r) {
      if (r.super) eff.superUser = true;
      Object.keys(r.perms || {}).forEach(function (m) {
        var src = r.perms[m] || {}, dst = eff.perms[m] || (eff.perms[m] = {});
        ['view','add','edit','del','approve'].forEach(function (a) { if (src[a] === true) dst[a] = true; });
        if (src.view === true) {
          var sc = SCOPE_RANK[src.scope] ? src.scope : 'all';
          if (!dst.scope || SCOPE_RANK[sc] > SCOPE_RANK[dst.scope]) dst.scope = sc;
        }
      });
    });
    return eff;
  };

  // ── สิทธิ์รวมของผู้ใช้ที่ Login — คำนวณใหม่เมื่อผู้ใช้/ตาราง roles เปลี่ยน (realtime แทนที่ทั้ง object/array ทุกครั้ง
  // จึงเทียบ reference พอ — can() ถูกเรียกหลายร้อยครั้งต่อการวาดหน้าจอ) ──
  var _eff = null, _effCu = null, _effRoles = null;
  function _effective() {
    var cu = window.cu;
    if (_eff && cu === _effCu && window.ROLES === _effRoles) return _eff;
    _eff = window.permsForRoles(window.rolesOf(cu)); _effCu = cu; _effRoles = window.ROLES;
    return _eff;
  }

  // ── Core Permission Check ──
  window.can = function (action, module) {
    if (!window.cu) return false;
    var eff = _effective();
    if (eff.superUser) return true;
    return !!(eff.perms[module] && eff.perms[module][action]);
  };

  // ── Shorthand Checkers ──
  window.canView    = function (m) { return window.can('view',    m); };
  window.canAdd     = function (m) { return window.can('add',     m); };
  window.canEdit    = function (m) { return window.can('edit',    m); };
  window.canDel     = function (m) { return window.can('del',     m); };
  window.canApprove = function (m) { return window.can('approve', m); };

  // ── ขอบเขตข้อมูลของ module (PERM_MODULES ที่มี scope:true): 'own' ของตัวเอง · 'dept' ทั้งแผนก · 'all' ทั้งหมด ──
  window.permScope = function (m) {
    if (!window.cu) return 'own';
    var eff = _effective();
    if (eff.superUser) return 'all';
    return (eff.perms[m] && eff.perms[m].scope) || 'own';
  };

  // ── Role Helpers ──
  window.isAdmin = function () { return !!window.cu && _effective().superUser; };
  window.cl      = function () { return window.cu !== null; };

})();
