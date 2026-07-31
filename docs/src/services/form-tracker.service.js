/**
 * form-tracker.service.js — Form Tracker: Data Layer
 * ต้องโหลดหลัง supabase.service.js + form-tracker.config.js
 * ลงทะเบียน onSnapshot ของตัวเอง (ไม่แก้ realtime.service.js เดิม) แบบ background
 * เหมือนแพทเทิร์นของ impl-tracker.service.js — re-render ผ่าน window.renderImplTracker()
 * เพราะแท็บ "แบบฟอร์ม" เป็นส่วนหนึ่งของหน้า impl_tracker แล้ว (ไม่มี view/หน้าของตัวเอง)
 */
(function () {

  // ── Transform: raw Supabase row → app object ──
  var transform = {
    FORM_GROUPS: function (d) {
      return { id:d.id, projectId:d.project_id, name:d.group_name||'', order:Number(d.sort_order)||99, createdAt:d.created_at||'' };
    },
    FORM_ITEMS: function (d) {
      return { id:d.id, projectId:d.project_id, groupId:d.group_id, name:d.form_name||'', formType:d.form_type||'', status:d.status||'not_started', owner:d.owner||'', receivedDate:d.received_date||'', description:d.description||'', order:Number(d.sort_order)||99, createdAt:d.created_at||'', updatedAt:d.updated_at||'' };
    },
    FORM_TEMPLATES: function (d) {
      return { id:d.id, name:d.name||'', order:Number(d.sort_order)||99, createdAt:d.created_at||'' };
    },
  };

  var FORM_COLLECTIONS = ['FORM_GROUPS', 'FORM_ITEMS', 'FORM_TEMPLATES'];

  // ── ID Generator (ตาม convention เดิม: prefix + Date.now()) ──
  window.ftkUid = function (prefix) { return prefix + Date.now() + Math.floor(Math.random()*1000); };

  // ── Optimistic Local Update (เหมือน window.imtApplyLocal — transform เป็น closure ส่วนตัวของไฟล์นี้) ──
  window.ftkApplyLocal = function (jsName, id, rawData) {
    var arr = window[jsName];
    if (!Array.isArray(arr)) return;
    var fn = transform[jsName];
    var obj = fn ? fn(Object.assign({ id:id }, rawData)) : Object.assign({}, rawData, { id:id });
    var idx = arr.findIndex(function (x) { return x.id === id; });
    if (idx >= 0) arr[idx] = obj; else arr.push(obj);
  };

  window.ftkRemoveLocal = function (jsName, id) {
    if (!Array.isArray(window[jsName])) return;
    window[jsName] = window[jsName].filter(function (x) { return x.id !== id; });
  };

  // ── Progress Calculators (bottom-up: Item → Group → Project) ──
  window.calcFormGroupProgress = function (group) {
    if (!group) return 0;
    var items = window.FORM_ITEMS.filter(function (i) { return i.groupId === group.id; });
    if (!items.length) return 0;
    var doneCount = items.filter(function (i) { return i.status === 'done'; }).length;
    return Math.round((doneCount / items.length) * 100);
  };

  // ── รับ id ของ impl_project ตรง ๆ (ไม่มี "โครงการแบบฟอร์ม" แยกให้ resolve อีกชั้นแล้ว) ──
  window.calcFormProjectProgress = function (pid) {
    if (!pid) return 0;
    var items = window.FORM_ITEMS.filter(function (i) { return i.projectId === pid; });
    if (!items.length) return 0;
    var doneCount = items.filter(function (i) { return i.status === 'done'; }).length;
    return Math.round((doneCount / items.length) * 100);
  };

  // ── Re-render Router: แท็บ "แบบฟอร์ม" อยู่ในหน้า impl_tracker แล้ว ใช้ dispatcher เดียวกัน ──
  function _rerender() {
    if (!window.cu || !window._von('view-impl-tracker')) return;
    window.renderImplTracker && window.renderImplTracker();
  }

  // ── Setup Realtime (background collections — ไม่ block checkLoaded หลัก) ──
  window.FormTrackerService = {
    setup: function () {
      var debounced = {};
      function deferRerender(key) {
        clearTimeout(debounced[key]);
        debounced[key] = setTimeout(_rerender, 300);
      }
      FORM_COLLECTIONS.forEach(function (jsName) {
        window.onSnapshot(window.getColRef(jsName), function (s) {
          window[jsName] = s.docs.map(function (doc) { return transform[jsName](doc.data()); });
          if (window._ownWrite && window._ownWrite[jsName]) return;
          deferRerender(jsName);
        }, function (e) { console.warn('[form-tracker.service] onSnapshot error [' + jsName + ']:', e.message || e); });
      });
    },
  };

})();
