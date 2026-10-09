/**
 * db.service.js — Backend DB API Adapter (Firebase Firestore-compatible API)
 * ต้องโหลดหลัง PostgREST client library และ api.config.js
 *
 * Exposes บน window:
 *   getColRef, getDocRef, setDoc, updateDoc, deleteDoc,
 *   writeBatch, getDocs, onSnapshot, getDb
 */
(function () {

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
  // คืนแถวทั้งตาราง · all.wm = sync_at ล่าสุด (ตารางที่ยังไม่มีคอลัมน์ = null → ไม่ใช้แคช/delta)
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
    all.wm = _takeWm(all, null);
    return all;
  }

  // ── แคชข้อมูลในเครื่อง + ดึงเฉพาะส่วนที่เปลี่ยน (ตารางที่ข้อมูลสะสมตามเวลา) ─────────────────────────
  // ข้อมูลที่หน้าจอได้ = ทั้งตารางเหมือนเดิมทุกประการ ต่างแค่วิธีได้มา: เปิดแอปครั้งถัดไปอ่านจากแคช (IndexedDB) แล้วถาม
  // ฐานข้อมูลเฉพาะแถวที่เพิ่ม/แก้ (คอลัมน์ sync_at) และถูกลบ (ตาราง sync_deleted) ตั้งแต่ครั้งก่อน — ข้อมูลสะสมกี่ปีก็โหลดเท่าเดิม
  // (คอลัมน์/ตาราง/trigger: db-schema.sql) · ตรวจจำนวนแถวกับฐานข้อมูลทุกครั้ง ไม่ตรง = ดึงทั้งตารางใหม่
  // แคชมีเฉพาะตอนมีคน Login ค้าง (ไม่มี session/ออกจากระบบ = ลบทิ้ง) · deploy เวอร์ชันใหม่ / เกิน 7 วัน = เริ่มใหม่
  var DELTA_TABLES = {
    projects:1, advances:1, lodgings:1, leaves:1, timesheets:1, costs:1, work_logs:1, contracts:1, hospitals:1, hsp_products:1,
    impl_projects:1, impl_phases:1, impl_tasks:1, impl_checklist_items:1, impl_issues:1, impl_comments:1, impl_attachments:1,
    impl_activity_log:1, form_items:1, expense_clearing_forms:1, site_deploy_forms:1, site_notice_forms:1,
    helpdesk_tickets:1, helpdesk_problems:1, assist_replies:1, server_requests:1,
  };
  var SYNC_MARGIN_MS = 2 * 60 * 1000;            // ถามย้อนเผื่อ 2 นาที (transaction ที่ commit ช้า)
  var CACHE_MAX_AGE_MS = 7 * 24 * 3600 * 1000;   // แคชเก่ากว่านี้ = ดึงทั้งตาราง (ฐานข้อมูลเก็บประวัติการลบไว้ 90 วัน)

  var _cache = (function () {
    var DB_NAME = 'bms_bo_cache', STORE = 'tables', _dbp = null;
    function open() {
      if (_dbp) return _dbp;
      _dbp = new Promise(function (resolve) {
        try {
          var req = indexedDB.open(DB_NAME, 1);
          req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
      return _dbp;
    }
    function tx(mode, fn) {
      return open().then(function (db) {
        if (!db) return null;
        return new Promise(function (resolve) {
          try {
            var t = db.transaction(STORE, mode), st = t.objectStore(STORE), out = fn(st);
            t.oncomplete = function () { resolve(out && out.result); };
            t.onerror = t.onabort = function () { resolve(null); };
          } catch (e) { resolve(null); }
        });
      });
    }
    return {
      get:   function (k) { return tx('readonly', function (st) { return st.get(k); }); },
      put:   function (k, v) { return tx('readwrite', function (st) { st.put(v, k); }); },
      clear: function () { return tx('readwrite', function (st) { st.clear(); }); },
    };
  })();
  // แคชผูกกับเวอร์ชันแอป (ตัวเลขที่ sidebar) — deploy ใหม่อาจมีคอลัมน์ใหม่ที่แถวในแคชยังไม่มี
  function _cacheVer() { var el = document.querySelector('#sidebar .sb-sub'); return el ? el.textContent.trim() : ''; }
  function _hasSession() { return !!(window.BmsSession && window.BmsSession.get()); }
  if (!_hasSession()) _cache.clear(); // ไม่มีใคร Login ค้าง → ไม่เก็บข้อมูลไว้ในเครื่อง
  window.clearDataCache = function () { return _cache.clear(); }; // auth.service.js doLogout
  // Login หลังข้อมูลโหลดแล้ว (ตอนนั้นยังไม่มี session จึงยังไม่เก็บ) → เก็บแคชตอนนี้ · auth.service.js _enterApp
  var _cacheSavers = [];
  window.saveDataCache = function () { _cacheSavers.forEach(function (fn) { fn(); }); };

  // แถวจากฐานข้อมูล: แยก sync_at ออก (หน้าจอไม่เคยมีคอลัมน์นี้) และจำค่าล่าสุดไว้เป็นจุดเริ่มถามครั้งถัดไป
  // wm = เวลาเป็นมิลลิวินาที (null = ตารางยังไม่มีคอลัมน์ sync_at)
  function _takeWm(rows, wm) {
    (rows || []).forEach(function (r) {
      if (r.sync_at == null) return;
      var ms = Date.parse(r.sync_at);
      if (ms && (!wm || ms > wm)) wm = ms;
      delete r.sync_at;
    });
    return wm;
  }
  // ดึงทุกหน้าของ query (สร้างใหม่ทุกหน้า) เรียงตาม id ให้แบ่งหน้าได้ไม่ซ้ำ/ไม่ตก
  async function _allPages(mk) {
    var all = [];
    for (var page = 0; ; page++) {
      var res = await mk().order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (res.error) throw res.error;
      all = all.concat(res.data || []);
      if (!res.data || res.data.length < PAGE_SIZE) return all;
    }
  }
  // ถามเฉพาะที่เปลี่ยนตั้งแต่ wm แล้วรวมกับ base → คืน { rows, wm } หรือ null (ต้องดึงทั้งตาราง)
  async function _deltaMerge(sbTable, base, wm) {
    var since = new Date(wm - SYNC_MARGIN_MS).toISOString();
    var res = await Promise.all([
      _allPages(function () { return _sb.from(sbTable).select('*').gte('sync_at', since); }),
      _allPages(function () { return _sb.from('sync_deleted').select('id,deleted_at').eq('tbl', sbTable).gte('deleted_at', since); }),
      _sb.from(sbTable).select('id', { count: 'exact', head: true }),
    ]);
    if (res[2].error) throw res[2].error;
    var changed = res[0], gone = res[1], byId = {}, del = {}, next = [];
    // ลบก่อนแล้วค่อยใส่แถวที่เปลี่ยน — แถวที่ถูกลบแล้วเพิ่มกลับด้วย id เดิมจึงยังอยู่
    gone.forEach(function (d) { del[String(d.id)] = true; var ms = Date.parse(d.deleted_at); if (ms > wm) wm = ms; });
    wm = _takeWm(changed, wm);
    changed.forEach(function (r) { byId[String(r.id)] = r; });
    base.forEach(function (r) {
      var k = String(r.id);
      if (byId[k]) { next.push(byId[k]); delete byId[k]; }
      else if (!del[k]) next.push(r);
    });
    Object.keys(byId).forEach(function (k) { next.push(byId[k]); });
    if (next.length !== res[2].count) return null; // ไม่ตรงกับฐานข้อมูล (เช่นมีการลบแบบที่ไม่ผ่าน trigger) → ดึงใหม่ทั้งตาราง
    return { rows: next, wm: wm };
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
    // collection: เก็บแถวล่าสุดไว้ (_records) เพื่ออัปเดตเฉพาะแถวที่เปลี่ยนตอน realtime แจ้ง
    // ส่งสำเนาให้ callback — หน้าจอแก้ object ได้โดยไม่กระทบ _records ที่ใช้รวมรอบถัดไป
    var _records = null;
    var _delta = !isDoc && !!DELTA_TABLES[sbTable];
    // _wm = ถามฐานข้อมูลครบทุกการเปลี่ยนแปลงถึงเวลานี้แล้ว — ขยับเฉพาะตอนดึงทั้งตาราง/ถาม delta
    // (ไม่ขยับจาก realtime รายแถว: ถ้าพลาด event ช่วงหลุดการเชื่อมต่อ รอบถัดไปยังถามย้อนครอบคลุม)
    var _wm = null, _saveTimer = null;
    function _emitCol(records) {
      _records = records;
      if (_delta) _saveCache();
      var json = JSON.stringify(records), sig = (_writeGen[ref._fs] || 0) + '|' + json;
      if (sig === _lastSig) return;
      _lastSig = sig;
      callback(_makeColSnap(ref._fs, JSON.parse(json)));
    }
    function _saveCache() {
      clearTimeout(_saveTimer);
      _saveTimer = setTimeout(function () {
        if (_removed || !_wm || !_records || !_hasSession()) return;
        _cache.put(sbTable, { ver: _cacheVer(), wm: _wm, at: Date.now(), rows: _records });
      }, 1500);
    }
    // ทั้งตาราง: แคช/ข้อมูลที่มีอยู่ + ส่วนที่เปลี่ยน (ถ้าทำได้) ไม่งั้นดึงทั้งตารางเหมือนเดิม
    async function _loadCol() {
      if (_delta) {
        var base = _records, wm = _wm;
        if (!base && _hasSession()) {
          var c = await _cache.get(sbTable);
          if (c && c.ver === _cacheVer() && c.wm && Array.isArray(c.rows) && Date.now() - c.at < CACHE_MAX_AGE_MS) { base = c.rows; wm = c.wm; }
        }
        if (base && wm) {
          try {
            var d = await _deltaMerge(sbTable, base, wm);
            if (d) { _wm = d.wm; return d.rows; }
          } catch (e) { console.warn('[db.service] delta sync failed [' + sbTable + '] — ดึงทั้งตาราง', e); }
        }
      }
      var rows = await _fullList(sbTable);
      _wm = rows.wm;
      return rows;
    }
    async function _fetch() {
      _dirty = {}; _needFull = false; // ดึงทั้งตาราง = ครอบคลุมทุกแถวที่รออัปเดตอยู่แล้ว
      try {
        if (isDoc) {
          var res = await _sb.from(sbTable).select('*').eq('id', docId).maybeSingle();
          if (res.error) throw res.error;
          if (_changed(res.data)) callback(_makeDocSnap(res.data));
        } else {
          _emitCol(await _loadCol());
        }
      } catch (e) {
        if (onError) onError(e);
        else console.error('[db.service] onSnapshot error [' + sbTable + ']:', e);
      }
    }

    // ── realtime แจ้งว่าแถวไหนเปลี่ยน → ดึงเฉพาะแถวนั้น (เดิมดึงทั้งตารางใหม่ทุกครั้ง เช่นแก้ รพ. 1 แห่ง = ทุกเครื่องโหลด ~680 KB)
    // ดึงผ่าน API ตามปกติ (ไม่ใช้ข้อมูลใน event ตรง ๆ — รูปแบบวันที่/ตัวเลขอาจต่างจากที่ API ส่ง และ event ของแถวใหญ่ถูกตัดข้อมูลได้)
    // _dirty[id] = 'del' | 'up' · ไม่รู้ id / ยังไม่เคยโหลด / เปลี่ยนเยอะ → ดึงทั้งตารางเหมือนเดิม ──
    var _dirty = {}, _needFull = false;
    var MAX_PARTIAL = 100;
    function _onRealtime(p) {
      var row = p && (p.eventType === 'DELETE' ? p.old : p.new);
      if (isDoc || !row || row.id == null || (p.errors && p.errors.length)) _needFull = true;
      else _dirty[String(row.id)] = p.eventType === 'DELETE' ? 'del' : 'up';
      _debouncedFetch();
    }
    async function _sync() {
      var ids = Object.keys(_dirty);
      if (_needFull || !_records || ids.length > MAX_PARTIAL) return _fetch();
      var dirty = _dirty; _dirty = {};
      var up = ids.filter(function (k) { return dirty[k] === 'up'; });
      try {
        var byId = {};
        if (up.length) {
          var res = await _sb.from(sbTable).select('*').in('id', up);
          if (res.error) throw res.error;
          _takeWm(res.data, null); // แค่แยก sync_at ออก — ไม่ขยับ _wm (ดูหมายเหตุที่ _wm)
          (res.data || []).forEach(function (r) { byId[String(r.id)] = r; });
        }
        // แถวที่ถูกลบ หรือขอแล้วไม่พบ (ลบไปแล้ว/ไม่มีสิทธิ์เห็น) → เอาออก · แถวที่มีอยู่ → แทนที่ตำแหน่งเดิม · แถวใหม่ → ต่อท้าย
        var seen = {}, next = [];
        _records.forEach(function (r) {
          var k = String(r.id);
          if (!dirty[k]) { next.push(r); return; }
          if (byId[k]) { next.push(byId[k]); seen[k] = true; }
        });
        Object.keys(byId).forEach(function (k) { if (!seen[k]) next.push(byId[k]); });
        _emitCol(next);
      } catch (e) {
        console.warn('[db.service] partial sync failed [' + sbTable + '] — ดึงทั้งตาราง', e);
        _fetch();
      }
    }

    _fetch();
    _liveFetchers.push(_fetch);
    if (_delta) _cacheSavers.push(_saveCache);

    var _debTimer = null;
    function _debouncedFetch() {
      clearTimeout(_debTimer);
      _debTimer = setTimeout(_sync, DEBOUNCE_MS);
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
        .on('postgres_changes', { event:'*', schema:'public', table:sbTable }, _onRealtime)
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
      var si = _cacheSavers.indexOf(_saveCache);
      if (si > -1) _cacheSavers.splice(si, 1);
    };
  };

  // ── กลับมาที่แท็บหลังพักไว้ (สลับแท็บ/สลับแอพมือถือ) — บาง browser suspend WebSocket ตอน background
  // ทำให้พลาด event ระหว่างนั้น รีเฟรชข้อมูลทุก collection ที่ subscribe อยู่ทันทีกันตกหล่น
  // เฉพาะเมื่อพักไว้นานพอ (≥ 60 วินาที) — สลับแท็บแป๊บเดียว WebSocket ยังไม่หลุด แต่เดิมดึงใหม่ทั้ง ~20 ตาราง (~1.3 MB) ทุกครั้ง ──
  var REFETCH_AFTER_HIDDEN_MS = 60000;
  var _hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') { _hiddenAt = Date.now(); return; }
    if (!_hiddenAt || Date.now() - _hiddenAt < REFETCH_AFTER_HIDDEN_MS) return;
    _hiddenAt = 0;
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
