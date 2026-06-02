/**
 * supabase-adapter.js
 * Compatibility layer: Firebase Firestore API → Supabase
 * โหลดหลัง Supabase SDK และก่อน config-sb.js / auth-sb.js
 *
 * ตั้งค่า SUPABASE_URL และ SUPABASE_ANON_KEY ก่อน load ไฟล์นี้:
 *   <script>
 *     window.SUPABASE_URL = 'https://xxxx.supabase.co';
 *     window.SUPABASE_ANON_KEY = 'eyJ...';
 *   </script>
 *
 * expose บน window:
 *   getColRef, getDocRef, setDoc, updateDoc, deleteDoc,
 *   writeBatch, getDocs, onSnapshot, getDb
 */
(function () {
  var SUPABASE_URL      = window.SUPABASE_URL      || 'https://YOUR-PROJECT.supabase.co';
  var SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'YOUR-ANON-KEY';

  if (!window.supabase) {
    console.error('[supabase-adapter] Supabase SDK ยังไม่ถูกโหลด — ใส่ script tag SDK ก่อน');
    return;
  }

  var _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { params: { eventsPerSecond: 10 } },
  });

  // ── map ชื่อ Firestore collection → Supabase table ──
  var COL_MAP = {
    STAGES:       'stages',
    PTYPES:       'ptypes',
    PGROUPS:      'pgroups',
    POSITIONS:    'positions',
    DEPARTMENTS:  'departments',
    STAFF:        'staff',
    USERS:        'users',
    PROJECTS:     'projects',
    ADVANCES:     'advances',
    LODGINGS:     'lodgings',
    HOLIDAYS:     'holidays',
    LEAVES:       'leaves',
    TIMESHEETS:   'timesheets',
    COSTS:        'costs',
    CONTRACTS:    'contracts',
    HSP_PRODUCTS: 'hsp_products',
    HOSPITALS:    'hospitals',
    SETTINGS:     'settings',
    WORK_LOGS:    'work_logs',
  };

  function _sbName(fsName) {
    return COL_MAP[fsName] || fsName.toLowerCase();
  }

  // ── ref objects (เลียนแบบ Firebase) ──
  window.getColRef = function (colName) {
    return { _type: 'col', _fs: colName, _sb: _sbName(colName) };
  };
  window.getDocRef = function (colName, docId) {
    return { _type: 'doc', _fs: colName, _sb: _sbName(colName), _id: docId };
  };

  // ── snapshot builders ──
  function _makeColSnap(fsName, records) {
    return {
      docs: (records || []).map(function (r) {
        return {
          id: r.id,
          ref: window.getDocRef(fsName, r.id),
          data: function () { return r; },
          exists: true,
        };
      }),
      empty: !records || records.length === 0,
    };
  }

  function _makeDocSnap(record) {
    return {
      exists: function () { return !!record; },
      data: function () { return record || {}; },
      id: record ? record.id : '',
    };
  }

  // ── ดึงข้อมูลทั้งหมดแบบ paginate (Supabase default limit = 1000 rows/request) ──
  async function _fullList(sbTable) {
    var all = [];
    var page = 0;
    var size = 1000;
    while (true) {
      var res = await _sb.from(sbTable).select('*').range(page * size, (page + 1) * size - 1);
      if (res.error) throw res.error;
      if (!res.data || res.data.length === 0) break;
      all = all.concat(res.data);
      if (res.data.length < size) break;
      page++;
    }
    return all;
  }

  // ── getDocs (one-shot, all pages) ──
  window.getDocs = async function (ref) {
    try {
      var records = await _fullList(ref._sb);
      return _makeColSnap(ref._fs, records);
    } catch (e) {
      console.error('[supabase-adapter] getDocs error [' + ref._sb + ']:', e);
      return { docs: [], empty: true };
    }
  };

  // ── onSnapshot (realtime) ──
  // รับการเปลี่ยนแปลงผ่าน Supabase Realtime → re-fetch ทั้ง collection
  window.onSnapshot = function (ref, callback, onError) {
    var isDoc  = ref._type === 'doc';
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
        else console.error('[supabase-adapter] onSnapshot error [' + sbTable + ']:', e);
      }
    }

    // โหลดครั้งแรก
    _fetch();

    // Debounce: รอ 350ms หลัง event สุดท้ายก่อน fetch (ป้องกัน render ซ้ำ)
    var _debTimer = null;
    function _debouncedFetch() {
      clearTimeout(_debTimer);
      _debTimer = setTimeout(_fetch, 350);
    }

    // Subscribe Realtime (Postgres Changes)
    var channelName = 'snap-' + sbTable + (isDoc ? '-' + docId : '');
    var channel = _sb.channel(channelName)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: sbTable },
        function () { _debouncedFetch(); }
      )
      .subscribe(function (status) {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[supabase-adapter] Realtime subscribe error [' + sbTable + ']');
        }
      });

    // คืน unsubscribe function
    return function () {
      _sb.removeChannel(channel);
    };
  };

  // ── setDoc (upsert โดยใช้ id เป็น primary key) ──
  window.setDoc = async function (ref, data, _options) {
    var payload = Object.assign({}, data, { id: ref._id });
    var res = await _sb.from(ref._sb).upsert(payload, { onConflict: 'id' });
    if (res.error) throw res.error;
  };

  // ── updateDoc (partial update) ──
  window.updateDoc = async function (ref, data) {
    var res = await _sb.from(ref._sb).update(data).eq('id', ref._id);
    if (res.error) throw res.error;
  };

  // ── deleteDoc ──
  window.deleteDoc = async function (ref) {
    var res = await _sb.from(ref._sb).delete().eq('id', ref._id);
    if (res.error) throw res.error;
  };

  // ── writeBatch (sequential ops — Supabase ไม่มี atomic batch) ──
  window.writeBatch = function () {
    var ops = [];
    return {
      set:    function (ref, data) { ops.push({ t: 'set',    ref: ref, data: data }); },
      update: function (ref, data) { ops.push({ t: 'update', ref: ref, data: data }); },
      delete: function (ref)       { ops.push({ t: 'delete', ref: ref }); },
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

  // ── getDb (คืน Supabase client) ──
  window.getDb = function () { return _sb; };

  console.log('[supabase-adapter] Supabase adapter loaded →', SUPABASE_URL);
})();
