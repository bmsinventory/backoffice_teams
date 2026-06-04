/**
 * string.util.js — String & ID Utilities
 */
(function () {

  // ── Escape HTML (prevent XSS) ──
  window.esc = function (s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  // ── Generate Short Random ID ──
  window.uid = function () {
    return Math.random().toString(36).slice(2, 9);
  };

  // ── Role Label ──
  window.roleLabel = function (r) {
    return r === 'pm' ? 'DM/PM' : r === 'viewer' ? 'Viewer' : r ? r.toUpperCase() : '';
  };

  // ── Lookup Helpers (cached lookups against global stores) ──
  window.gS  = function (id) { return window.STAGES.find(function (s) { return s.id === id; }) || { label:id, color:'#9ba3b8' }; };
  window.gT  = function (id) { return window.PTYPES.find(function (t) { return t.id === id; }) || { label:id, color:'#9ba3b8' }; };
  window.gG  = function (id) { return window.PGROUPS.find(function (g) { return g.id === id; }) || null; };
  window.gSt = function (id) { return window.STAFF.find(function (s) { return s.id === id; }) || { name:'?', dept:'' }; };
  window.gC  = function (i)  { return window.PCOLS[i % window.PCOLS.length]; };
  window.avC = function (i)  { return window.AVBG[i % window.AVBG.length]; };

  // ── Team Member helpers ──
  window._vtMember = function (team, staffId, fallbackStart, fallbackEnd) {
    if (!team || !team.length) return null;
    if (typeof team[0] === 'object') {
      var found = team.find(function (t) { return t.sid === staffId; });
      if (!found) return null;
      return { sid:found.sid, s:found.s||fallbackStart||'', e:found.e||fallbackEnd||'' };
    }
    return team.includes(staffId) ? { sid:staffId, s:fallbackStart||'', e:fallbackEnd||'' } : null;
  };

  window._vtMembers = function (team, fallbackStart, fallbackEnd) {
    if (!team || !team.length) return [];
    return team.map(function (t) {
      if (typeof t === 'object') return { sid:t.sid, s:t.s||fallbackStart||'', e:t.e||fallbackEnd||'' };
      return { sid:t, s:fallbackStart||'', e:fallbackEnd||'' };
    }).filter(function (m) { return m.sid; });
  };

})();
