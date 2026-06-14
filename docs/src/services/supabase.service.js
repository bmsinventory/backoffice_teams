/**
 * supabase.service.js — Supabase API Adapter (Firebase Firestore-compatible API)
 * ต้องโหลดหลัง Supabase SDK และ api.config.js
 *
 * Exposes บน window:
 *   getColRef, getDocRef, setDoc, updateDoc, deleteDoc,
 *   writeBatch, getDocs, onSnapshot, getDb
 */
(function () {

  var cfg = window.API_CONFIG || {};
  var SUPABASE_URL      = cfg.supabaseUrl      || window.SUPABASE_URL      || 'https://YOUR-PROJECT.supabase.co';
  var SUPABASE_ANON_KEY = cfg.supabaseAnonKey  || window.SUPABASE_ANON_KEY || 'YOUR-ANON-KEY';
  var PAGE_SIZE         = cfg.paginationSize   || 1000;
  var DEBOUNCE_MS       = cfg.realtimeDebounceMs || 350;

  if (!window.supabase) {
    console.error('[supabase.service] Supabase SDK ยังไม่ถูกโหลด — ใส่ script tag SDK ก่อน');
    return;
  }

  var _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { params: { eventsPerSecond: cfg.realtimeEventsPerSecond || 10 } },
  });

  // ── Collection Name Map (Firestore → Supabase table) ──
  var COL_MAP = {
    STAGES:'stages', PTYPES:'ptypes', PGROUPS:'pgroups',
    POSITIONS:'positions', DEPARTMENTS:'departments', STAFF:'staff',
    USERS:'users', PROJECTS:'projects', ADVANCES:'advances',
    LODGINGS:'lodgings', HOLIDAYS:'holidays', LEAVES:'leaves',
    TIMESHEETS:'timesheets', COSTS:'costs', CONTRACTS:'contracts',
    HSP_PRODUCTS:'hsp_products', HOSPITALS:'hospitals',
    SETTINGS:'settings', WORK_LOGS:'work_logs',
  };

  function _sbName(fsName) {
    return COL_MAP[fsName] || fsName.toLowerCase();
  }

  // ── Ref Objects (Firebase-compatible) ──
  window.getColRef = function (colName) {
    return { _type:'col', _fs:colName, _sb:_sbName(colName) };
  };
  window.getDocRef = function (colName, docId) {
    return { _type:'doc', _fs:colName, _sb:_sbName(colName), _id:docId };
  };

  // ── Snapshot Builders ──
  function _makeColSnap(fsName, records) {
    return {
      docs: (records || []).map(function (r) {
        return { id:r.id, ref:window.getDocRef(fsName, r.id), data:function(){ return r; }, exists:true };
      }),
      empty: !records || records.length === 0,
    };
  }
  function _makeDocSnap(record) {
    return {
      exists: function () { return !!record; },
      data:   function () { return record || {}; },
      id: record ? record.id : '',
    };
  }

  // ── Paginated Fetch (Supabase default limit = 1000 rows/request) ──
  async function _fullList(sbTable) {
    var all = [], page = 0;
    while (true) {
      var res = await _sb.from(sbTable).select('*').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (res.error) throw res.error;
      if (!res.data || res.data.length === 0) break;
      all = all.concat(res.data);
      if (res.data.length < PAGE_SIZE) break;
      page++;
    }
    return all;
  }

  // ── getDocs (one-shot) ──
  window.getDocs = async function (ref) {
    try {
      var records = await _fullList(ref._sb);
      return _makeColSnap(ref._fs, records);
    } catch (e) {
      console.error('[supabase.service] getDocs error [' + ref._sb + ']:', e);
      return { docs:[], empty:true };
    }
  };

  // ── onSnapshot (realtime) ──
  window.onSnapshot = function (ref, callback, onError) {
    var isDoc   = ref._type === 'doc';
    var sbTable = ref._sb;
    var docId   = ref._id;

    async function _fetch() {
      try {
        if (isDoc) {
          var res = await _sb.from(sbTable).select('*').eq('id', docId).maybeSingle();
          if (res.error) throw res.error;
          callback(_makeDocSnap(res.data));
        } else {
          var records = await _fullList(sbTable);
          callback(_makeColSnap(ref._fs, records));
        }
      } catch (e) {
        if (onError) onError(e);
        else console.error('[supabase.service] onSnapshot error [' + sbTable + ']:', e);
      }
    }

    _fetch();

    var _debTimer = null;
    function _debouncedFetch() {
      clearTimeout(_debTimer);
      _debTimer = setTimeout(_fetch, DEBOUNCE_MS);
    }

    var channelName = 'snap-' + sbTable + (isDoc ? '-' + docId : '');
    var channel = _sb.channel(channelName)
      .on('postgres_changes', { event:'*', schema:'public', table:sbTable }, function () { _debouncedFetch(); })
      .subscribe(function (status) {
        if (status === 'CHANNEL_ERROR') console.warn('[supabase.service] Realtime subscribe error [' + sbTable + ']');
      });

    return function () { _sb.removeChannel(channel); };
  };

  // ── Own-Write Suppression: prevent realtime echo from re-rendering ──
  window._ownWrite      = window._ownWrite      || {};
  window._ownWriteTimer = window._ownWriteTimer || {};
  function _markOwnWrite(fsName) {
    if (!fsName) return;
    window._ownWrite[fsName] = true;
    clearTimeout(window._ownWriteTimer[fsName]);
    window._ownWriteTimer[fsName] = setTimeout(function () {
      window._ownWrite[fsName] = false;
    }, 2000);
  }

  // ── Write Operations ──
  window.setDoc = async function (ref, data, _options) {
    _markOwnWrite(ref._fs);
    var payload = Object.assign({}, data, { id: ref._id });
    var res = await _sb.from(ref._sb).upsert(payload, { onConflict:'id' });
    if (res.error) throw res.error;
  };

  window.updateDoc = async function (ref, data) {
    _markOwnWrite(ref._fs);
    var res = await _sb.from(ref._sb).update(data).eq('id', ref._id);
    if (res.error) throw res.error;
  };

  window.deleteDoc = async function (ref) {
    _markOwnWrite(ref._fs);
    var res = await _sb.from(ref._sb).delete().eq('id', ref._id);
    if (res.error) throw res.error;
  };

  // ── Batch (sequential — Supabase has no atomic batch) ──
  window.writeBatch = function () {
    var ops = [];
    return {
      set:    function (ref, data) { ops.push({ t:'set',    ref:ref, data:data }); },
      update: function (ref, data) { ops.push({ t:'update', ref:ref, data:data }); },
      delete: function (ref)       { ops.push({ t:'delete', ref:ref }); },
      commit: async function () {
        for (var i = 0; i < ops.length; i++) {
          var op = ops[i];
          if (op.t === 'set')    await window.setDoc(op.ref, op.data);
          if (op.t === 'update') await window.updateDoc(op.ref, op.data);
          if (op.t === 'delete') await window.deleteDoc(op.ref);
        }
      },
    };
  };

  // ── Raw Client ──
  window.getDb = function () { return _sb; };

  console.log('[supabase.service] Connected →', SUPABASE_URL);

})();
