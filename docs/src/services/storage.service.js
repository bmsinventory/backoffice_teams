/**
 * storage.service.js — LocalStorage / SessionStorage Wrapper
 * จัดการ token, user session, และ app preferences
 */
(function () {

  window.StorageService = {

    // ── Auth Token ──
    getRememberedUser: function () {
      try { return localStorage.getItem('_bms_rem') || null; } catch { return null; }
    },
    setRememberedUser: function (username) {
      try { localStorage.setItem('_bms_rem', username); } catch {}
    },
    clearRememberedUser: function () {
      try { localStorage.removeItem('_bms_rem'); } catch {}
    },

    // ── Dark Mode ──
    getTheme: function () {
      try { return localStorage.getItem('_bms_theme') || 'system'; } catch { return 'system'; }
    },
    setTheme: function (theme) {
      try { localStorage.setItem('_bms_theme', theme); } catch {}
    },

    // ── Sidebar State ──
    getSidebarSlim: function () {
      try { return localStorage.getItem('_bms_sb_slim') === '1'; } catch { return false; }
    },
    setSidebarSlim: function (slim) {
      try { localStorage.setItem('_bms_sb_slim', slim ? '1' : '0'); } catch {}
    },

    // ── Target Groups (cached from Supabase) ──
    getTargetGroups: function () {
      try {
        var raw = localStorage.getItem('_tgt_groups');
        return raw ? JSON.parse(raw) : [];
      } catch { return []; }
    },
    setTargetGroups: function (groups) {
      try { localStorage.setItem('_tgt_groups', JSON.stringify(groups)); } catch {}
    },

    // ── Target Grouped Flag ──
    getTargetGrouped: function () {
      try { return localStorage.getItem('tgt_grouped') === '1'; } catch { return false; }
    },
    setTargetGrouped: function (val) {
      try { localStorage.setItem('tgt_grouped', val ? '1' : '0'); } catch {}
    },

    // ── Generic Helpers ──
    get: function (key, fallback) {
      try { var v = localStorage.getItem(key); return v !== null ? v : (fallback !== undefined ? fallback : null); } catch { return fallback || null; }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, value); } catch {}
    },
    remove: function (key) {
      try { localStorage.removeItem(key); } catch {}
    },
  };

})();
