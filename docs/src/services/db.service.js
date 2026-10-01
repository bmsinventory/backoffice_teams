/**
 * db.service.js — Backend DB API Adapter (Firebase Firestore-compatible API)
 * ต้องโหลดหลัง PostgREST client library และ api.config.js
 *
 * Exposes บน window:
 *   getColRef, getDocRef, setDoc, updateDoc, deleteDoc,
 *   writeBatch, getDocs, onSnapshot, getDb
 */
(function () {

  // LOCAL TEST MODE เปิดอยู่ → local-db.service.js จัดการ data layer ทั้งหมดแล้ว ข้ามตัวเอง
  if (window.__LOCAL_DB_ACTIVE__) {
    console.log('[db.service] ข้าม — กำลังใช้ LOCAL TEST MODE (local-db.service.js)');
    return;
  }

  var cfg = window.API_CONFIG || {};
  var DB_URL = cfg.dbUrl || window.SUPABASE_URL      || 'https://YOUR-PROJECT.example';
  var DB_KEY = cfg.dbKey || window.SUPABASE_ANON_KEY || 'YOUR-ANON-KEY';
  var PAGE_SIZE         = cfg.paginationSize   || 1000;
  var DEBOUNCE_MS       = cfg.realtimeDebounceMs || 350;

  // window.supabase = global ของ PostgREST client library ที่ vendor มา (คงชื่อ vendor ไว้)
  if (!window.supabase) {
    console.error('[db.service] client library ยังไม่ถูกโหลด — ใส่ script tag ก่อน');
    return;
  }

  var _sb = window.supabase.createClient(DB_URL, DB_KEY, {
    realtime: { params: { eventsPerSecond: cfg.realtimeEventsPerSecond || 10 } },
  });

  // ── Collection Name Map (Firestore → DB table) ──
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

  // ── Paginated Fetch (PostgREST default limit = 1000 rows/request) ──
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
      console.error('[db.service] getDocs error [' + ref._sb + ']:', e);
      return { docs:[], empty:true };
    }
  };

  // ── ทุก onSnapshot ที่ยัง active อยู่ — ให้ visibilitychange listener ด้านล่างเรียก fetch ซ้ำได้ทั้งหมด
  // (ใช้ตอนกลับมาที่แท็บหลังพักไว้นาน เผื่อ browser suspend WebSocket ตอนอยู่ background) ──
  var _liveFetchers = [];

  // ── onSnapshot (realtime) ──
  window.onSnapshot = function (ref, callback, onError) {
    var isDoc   = ref._type === 'doc';
    var sbTable = ref._sb;
    var docId   = ref._id;
    var _removed = false;
    var _channel = null;
    var _retryTimer = null;
    var _retryDelay = 2000; // exponential backoff เริ่ม 2s, cap 30s
    var _reconnectPending = false; // กันจอง retry ซ้อนกันหลายอันตอน event ยิงรัว ๆ

    // ── ข้อมูลไม่เปลี่ยนจากครั้งก่อน → ไม่เรียก callback (ไม่วาดหน้าจอซ้ำ) — ต้นเหตุหน้าจอกระตุก: กลับมาที่แท็บ
    // ดึงใหม่ทุก collection พร้อมกัน / realtime ต่อใหม่ / event ที่ไม่ได้เปลี่ยนข้อมูลจริง ต่างสั่งวาดใหม่ทั้งที่ข้อมูลเหมือนเดิม
    // ครั้งแรกเรียกเสมอ (realtime.service นับจำนวน collection ที่โหลดครบจาก callback แรก)
    // หลังเราเขียน collection นี้ (_writeGen เปลี่ยน) → ส่งรอบถัดไปเสมอ แม้ข้อมูลเท่าเดิม: กันกรณีเขียนไม่สำเร็จ
    // แต่หน้าจอแก้ค่าในเครื่องไปแล้ว (optimistic) จะได้กลับเป็นข้อมูลจริงจากฐาน ──
    var _lastSig = null;
    function _changed(data) {
      var sig = (_writeGen[ref._fs] || 0) + '|' + JSON.stringify(data);
      if (sig === _lastSig) return false;
      _lastSig = sig; return true;
    }
    async function _fetch() {
      try {
        if (isDoc) {
          var res = await _sb.from(sbTable).select('*').eq('id', docId).maybeSingle();
          if (res.error) throw res.error;
          if (_changed(res.data)) callback(_makeDocSnap(res.data));
        } else {
          var records = await _fullList(sbTable);
          if (_changed(records)) callback(_makeColSnap(ref._fs, records));
        }
      } catch (e) {
        if (onError) onError(e);
        else console.error('[db.service] onSnapshot error [' + sbTable + ']:', e);
      }
    }

    _fetch();
    _liveFetchers.push(_fetch);

    var _debTimer = null;
    function _debouncedFetch() {
      clearTimeout(_debTimer);
      _debTimer = setTimeout(_fetch, DEBOUNCE_MS);
    }

    // ── ตั้ง subscribe ใหม่ทุกครั้งที่ channel หลุด (network blip / proxy ตัด connection ที่ค้างไว้นาน /
    // browser suspend WebSocket ตอนแท็บอยู่ background ฯลฯ) — supabase-js "ไม่" join channel เดิมคืนให้
    // อัตโนมัติเสมอไปในทุกกรณี ถ้าไม่ resubscribe เอง ตารางนี้จะหยุดอัปเดตแบบ realtime เงียบๆ
    // (ต้องกด F5 ถึงจะเห็นข้อมูลใหม่) — เป็นจุดเดียวที่ทุก collection ในระบบใช้ร่วมกัน แก้ที่นี่ที่เดียวครอบคลุมทั้งหมด
    //
    // ระวัง: ตั้งใจ "ไม่" ตอบสนอง status 'CLOSED' — ทดสอบจริงพบว่า removeChannel() ของเราเอง (ตอน retry)
    // ก็ทำให้ channel เดิมยิง 'CLOSED' กลับมาที่ callback นี้ด้วย ถ้าปฏิบัติกับมันเหมือน error จะกลาย
    // เป็นวนซ้อน retry ไม่จบ (ตัวเองสร้าง CLOSED ให้ตัวเองอีกที) จนยิง reconnect รัวหลักพัน/วินาทีถล่ม
    // Realtime server เอง (เจอจริงตอนทดสอบจำลอง disconnect) — CHANNEL_ERROR/TIMED_OUT ที่มาจาก
    // การหลุดจริงจะจับได้ก่อน CLOSED เสมอ (state machine ของ Phoenix channel: errored → closed)
    // จึงพอแล้วที่จะ react แค่ 2 status นี้ และมี guard _reconnectPending กันจองซ้อนตอน event รัว ──
    function _subscribe() {
      var myChannel;
      var channelName = 'snap-' + sbTable + (isDoc ? '-' + docId : '') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      myChannel = _sb.channel(channelName)
        .on('postgres_changes', { event:'*', schema:'public', table:sbTable }, function () { _debouncedFetch(); })
        .subscribe(function (status) {
          if (_removed || myChannel !== _channel) return; // channel เก่าที่ถูกแทนที่ไปแล้ว — เมิน event สาย
          if (status === 'SUBSCRIBED') { _retryDelay = 2000; _reconnectPending = false; return; }
          if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !_reconnectPending) {
            _reconnectPending = true;
            var delay = _retryDelay;
            _retryDelay = Math.min(_retryDelay * 2, 30000);
            console.warn('[db.service] Realtime ' + status + ' [' + sbTable + '] — reconnect in ' + delay + 'ms');
            clearTimeout(_retryTimer);
            _retryTimer = setTimeout(function () {
              _reconnectPending = false;
              if (_removed) return;
              _sb.removeChannel(myChannel);
              _subscribe();
              _fetch(); // เผื่อพลาด event ระหว่างหลุดการเชื่อมต่อ
            }, delay);
          }
        });
      _channel = myChannel;
    }
    _subscribe();

    return function () {
      _removed = true;
      clearTimeout(_retryTimer);
      if (_channel) _sb.removeChannel(_channel);
      var idx = _liveFetchers.indexOf(_fetch);
      if (idx > -1) _liveFetchers.splice(idx, 1);
    };
  };

  // ── กลับมาที่แท็บหลังพักไว้ (สลับแท็บ/สลับแอพมือถือ) — บาง browser suspend WebSocket ตอน background
  // ทำให้พลาด event ระหว่างนั้น รีเฟรชข้อมูลทุก collection ที่ subscribe อยู่ทันทีกันตกหล่น ──
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    _liveFetchers.slice().forEach(function (fn) { fn(); });
  });

  // ── Own-Write Suppression: prevent realtime echo from re-rendering ──
  window._ownWrite      = window._ownWrite      || {};
  window._ownWriteTimer = window._ownWriteTimer || {};
  var _writeGen = {}; // นับการเขียนต่อ collection — onSnapshot ใช้บังคับส่งข้อมูลรอบถัดไปหลังเขียน (ดู _changed)
  function _markOwnWrite(fsName) {
    if (!fsName) return;
    _writeGen[fsName] = (_writeGen[fsName] || 0) + 1;
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

  // ── Batch (sequential — PostgREST has no atomic batch) ──
  window.writeBatch = function () {
    var ops = [];
    return {
      set:    function (ref, data) { ops.push({ t:'set',    ref:ref, data:data }); },
      update: function (ref, data) { ops.push({ t:'update', ref:ref, data:data }); },
      delete: function (ref)       { ops.push({ t:'delete', ref:ref }); },
      commit: async function (onOp) {   // onOp(): เรียกหลังเขียนแต่ละรายการเสร็จ (ใช้ทำหลอดความคืบหน้า)
        for (var i = 0; i < ops.length; i++) {
          var op = ops[i];
          if (op.t === 'set')    await window.setDoc(op.ref, op.data);
          if (op.t === 'update') await window.updateDoc(op.ref, op.data);
          if (op.t === 'delete') await window.deleteDoc(op.ref);
          if (onOp) onOp();
        }
      },
    };
  };

  // ── Raw Client ──
  window.getDb = function () { return _sb; };

  console.log('[db.service] Connected →', DB_URL);

})();
