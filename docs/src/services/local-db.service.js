/**
 * local-db.service.js — LOCAL TEST MODE (ไม่ต้องมี backend / ไม่ต้องต่อเน็ต)
 *
 * แทนที่ db.service.js ทั้งชุด โดยเก็บข้อมูลไว้ใน localStorage ของเบราว์เซอร์
 * ใช้สำหรับ "กดเล่นทดสอบ" ก่อนอัปขึ้นฐานจริง — ข้อมูลไม่ออกไปไหน อยู่แค่ในเครื่องนี้
 *
 * เปิดใช้เมื่อ: ตั้ง window.LOCAL_TEST_MODE = true ใน env-config.js (opt-in เท่านั้น)
 * ค่าปกติ = ต่อ backend จริงตาม SUPABASE_URL เสมอ
 *
 * Exposes บน window เหมือน db.service.js เป๊ะ:
 *   getColRef, getDocRef, setDoc, updateDoc, deleteDoc,
 *   writeBatch, getDocs, onSnapshot, getDb
 * เพิ่มพิเศษ:
 *   localDbReset()  — ล้างข้อมูลทดสอบทั้งหมดแล้ว reload (แอปจะ seed ใหม่)
 */
(function () {

  // opt-in เท่านั้น: ตั้ง window.LOCAL_TEST_MODE = true ใน env-config.js ถึงจะเปิด
  // (ค่าปกติ = ต่อ backend จริงตาม SUPABASE_URL เสมอ แม้บน localhost)
  if (window.LOCAL_TEST_MODE !== true) return;

  // บอก db.service.js ให้ข้ามตัวเอง (มี guard เช็ค flag นี้ที่หัวไฟล์)
  window.__LOCAL_DB_ACTIVE__ = true;

  var KEY = '__ldb__';       // prefix ของตารางข้อมูล
  var FKEY = '__ldbfile__';  // prefix ของไฟล์แนบ

  // ── Collection Name Map (ให้ตรงกับ db.service.js) ──
  var COL_MAP = {
    STAGES:'stages', PTYPES:'ptypes', PGROUPS:'pgroups',
    POSITIONS:'positions', DEPARTMENTS:'departments', STAFF:'staff',
    USERS:'users', PROJECTS:'projects', ADVANCES:'advances',
    LODGINGS:'lodgings', HOLIDAYS:'holidays', LEAVES:'leaves',
    TIMESHEETS:'timesheets', COSTS:'costs', CONTRACTS:'contracts',
    HSP_PRODUCTS:'hsp_products', HOSPITALS:'hospitals',
    SETTINGS:'settings', WORK_LOGS:'work_logs',
  };
  function _sbName(fsName) { return COL_MAP[fsName] || String(fsName).toLowerCase(); }

  // ── localStorage helpers ──
  function _read(table) {
    try { return JSON.parse(localStorage.getItem(KEY + table)) || []; }
    catch (e) { return []; }
  }
  function _write(table, arr) {
    try { localStorage.setItem(KEY + table, JSON.stringify(arr)); }
    catch (e) { console.warn('[local-db] เขียนไม่สำเร็จ (localStorage เต็ม?) —', table, e); }
    _notify(table);
  }

  // ── live-update bus (ทำให้ onSnapshot อัปเดตตามเมื่อมีการแก้ข้อมูล) ──
  var _listeners = {};     // table -> [fn]
  var _notifyTimers = {};
  function _notify(table) {
    var ls = _listeners[table];
    if (!ls || !ls.length) return;
    clearTimeout(_notifyTimers[table]);
    _notifyTimers[table] = setTimeout(function () {
      ls.slice().forEach(function (fn) { try { fn(); } catch (e) { console.error('[local-db] listener error', e); } });
    }, 60);
  }

  // ── Ref Objects (Firebase-compatible — เหมือน db.service.js) ──
  window.getColRef = function (colName) {
    return { _type:'col', _fs:colName, _sb:_sbName(colName) };
  };
  window.getDocRef = function (colName, docId) {
    return { _type:'doc', _fs:colName, _sb:_sbName(colName), _id:docId };
  };

  // ── Snapshot Builders (คัดลอกจาก db.service.js) ──
  function _makeColSnap(fsName, records) {
    return {
      docs: (records || []).map(function (r) {
        return { id:r.id, ref:window.getDocRef(fsName, r.id), data:function () { return r; }, exists:true };
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

  // ── getDocs (one-shot) ──
  window.getDocs = async function (ref) {
    return _makeColSnap(ref._fs, _read(ref._sb));
  };

  // ── onSnapshot (จำลอง realtime ด้วย bus ภายในหน้า) ──
  window.onSnapshot = function (ref, callback, onError) {
    var isDoc = ref._type === 'doc';
    var table = ref._sb;

    function fire() {
      try {
        if (isDoc) {
          var rec = _read(table).find(function (r) { return r.id === ref._id; });
          callback(_makeDocSnap(rec || null));
        } else {
          callback(_makeColSnap(ref._fs, _read(table)));
        }
      } catch (e) {
        if (onError) onError(e);
        else console.error('[local-db] onSnapshot error [' + table + ']:', e);
      }
    }

    (_listeners[table] = _listeners[table] || []).push(fire);
    setTimeout(fire, 0); // initial push (async เหมือนของจริง)

    return function () { // unsubscribe
      var ls = _listeners[table] || [];
      var i = ls.indexOf(fire);
      if (i >= 0) ls.splice(i, 1);
    };
  };

  // ── Own-Write Suppression (ให้ realtime.service.js ทำงานเหมือนเดิม) ──
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
    var arr = _read(ref._sb);
    var rec = Object.assign({}, data, { id: ref._id });
    var i = arr.findIndex(function (r) { return r.id === ref._id; });
    if (i >= 0) arr[i] = rec; else arr.push(rec);
    _write(ref._sb, arr);
  };

  window.updateDoc = async function (ref, data) {
    _markOwnWrite(ref._fs);
    var arr = _read(ref._sb);
    var i = arr.findIndex(function (r) { return r.id === ref._id; });
    if (i >= 0) { arr[i] = Object.assign({}, arr[i], data); _write(ref._sb, arr); }
  };

  window.deleteDoc = async function (ref) {
    _markOwnWrite(ref._fs);
    _write(ref._sb, _read(ref._sb).filter(function (r) { return r.id !== ref._id; }));
  };

  // ── Batch (sequential — เหมือน db.service.js, ไม่สน argument ที่ส่งมา) ──
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

  // ── Raw Client stub (รองรับเฉพาะ storage ที่ impl-tracker ใช้) ──
  function _fileToDataUrl(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }
  window.getDb = function () {
    return {
      __localMock: true,
      storage: {
        from: function (bucket) {
          return {
            upload: async function (path, file) {
              try { localStorage.setItem(FKEY + bucket + '/' + path, await _fileToDataUrl(file)); }
              catch (e) { console.warn('[local-db] เก็บไฟล์แนบไม่สำเร็จ (ไฟล์ใหญ่ไป?) —', e); }
              return { data: { path: path }, error: null };
            },
            getPublicUrl: function (path) {
              var v = null;
              try { v = localStorage.getItem(FKEY + bucket + '/' + path); } catch (e) {}
              return { data: { publicUrl: v || ('local-attachment:///' + bucket + '/' + path) } };
            },
            remove: async function (paths) {
              (paths || []).forEach(function (p) { try { localStorage.removeItem(FKEY + bucket + '/' + p); } catch (e) {} });
              return { data: [], error: null };
            },
          };
        },
      },
      channel: function () { return { on: function () { return this; }, subscribe: function () { return this; } }; },
      removeChannel: function () {},
      from: function () { throw new Error('[local-db] raw .from() ไม่รองรับใน LOCAL TEST MODE'); },
    };
  };

  // ── ล้างข้อมูลทดสอบทั้งหมด แล้ว reload ให้แอป seed ใหม่ ──
  window.localDbReset = function () {
    Object.keys(localStorage)
      .filter(function (k) { return k.indexOf(KEY) === 0 || k.indexOf(FKEY) === 0; })
      .forEach(function (k) { localStorage.removeItem(k); });
    location.reload();
  };

  console.log(
    '%c[local-db] LOCAL TEST MODE ',
    'background:#f59e0b;color:#000;font-weight:700;padding:2px 6px;border-radius:3px',
    '— ข้อมูลเก็บใน localStorage ของเบราว์เซอร์นี้เท่านั้น ไม่แตะฐานจริง | ล้างข้อมูล: localDbReset()'
  );

})();
