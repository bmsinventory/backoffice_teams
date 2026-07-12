/**
 * permission.util.js — Role-Based Access Control Utilities
 * can(), canView(), canAdd(), canEdit(), canDel(), isAdmin(), ce()
 */
(function () {

  window.ROLE_PERMISSIONS = {};

  // ── Default Permissions by Role ──
  function _roleDefaultPerms(role) {
    var full = { view:true,  add:true,  edit:true,  del:true  };
    var ro   = { view:true,  add:false, edit:false, del:false };
    var none = { view:false, add:false, edit:false, del:false };
    var vadd = { view:true,  add:true,  edit:false, del:false };

    if (role === 'pm') return {
      overview:ro, kanban:full, projects:full, advance:full, lodging:full,
      workload:ro, calendar:full, leave:full, timesheet:ro, cost:ro,
      availability:ro, holiday:ro, admin:none, targets:none, hospital:ro, contract:full,
      impl_tracker:full,
    };
    if (role === 'viewer') return {
      overview:ro, kanban:ro, projects:none, advance:full, lodging:full,
      workload:ro, calendar:ro, leave:vadd, timesheet:ro, cost:ro,
      availability:ro, holiday:none, admin:none, targets:none, hospital:ro, contract:ro,
      impl_tracker:ro,
    };
    return {
      overview:ro, kanban:ro, projects:ro, advance:ro, lodging:ro,
      workload:ro, calendar:ro, leave:ro, timesheet:ro, cost:ro,
      availability:ro, holiday:none, admin:none, targets:none, hospital:ro, contract:ro,
      impl_tracker:ro,
    };
  }

  // ── Core Permission Check ──
  window.can = function (action, module) {
    if (!window.cu) return false;
    var role = window.cu.role;
    if (role === 'admin') return true;
    var rp      = window.ROLE_PERMISSIONS && window.ROLE_PERMISSIONS[role];
    var modPerm = rp ? rp[module] : null;
    if (!modPerm) modPerm = _roleDefaultPerms(role)[module] || {};
    return !!modPerm[action];
  };

  // ── Shorthand Checkers ──
  window.canView = function (m) { return window.can('view', m); };
  window.canAdd  = function (m) { return window.can('add',  m); };
  window.canEdit = function (m) { return window.can('edit', m); };
  window.canDel  = function (m) { return window.can('del',  m); };

  // ── Role Helpers ──
  window.isAdmin = function () { return window.cu && window.cu.role === 'admin'; };
  window.ce      = function () { return window.cu && (window.cu.role === 'admin' || window.cu.role === 'pm'); };
  window.cl      = function () { return window.cu !== null; };

})();
