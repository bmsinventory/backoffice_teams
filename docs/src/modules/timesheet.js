const { esc, fd, pd, gSt, getDocRef, getYearBE } = window;
const writeBatch = () => window.writeBatch();

const TS_CAT = {
  planning:  { label: 'วางแผน',        icon: '📋' },
  fieldwork: { label: 'งานภาคสนาม',    icon: '🏗' },
  reporting: { label: 'จัดทำรายงาน',   icon: '📄' },
  meeting:   { label: 'ประชุม',         icon: '👥' },
  training:  { label: 'อบรม',           icon: '📚' },
  other:     { label: 'อื่นๆ',          icon: '📝' },
};
const TS_MON   = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const TS_VIEWS = [
  { id: 'staff',   icon: '👥', label: 'ภาระงานรายคน' },
  { id: 'month',   icon: '🗓', label: 'Heatmap รายเดือน' },
  { id: 'project', icon: '📁', label: 'ตามโครงการ' },
];
const TS_SORTS = { util: 'Utilization มาก→น้อย', free: 'ว่างมาก→น้อย', hours: 'ชั่วโมงมาก→น้อย', name: 'ชื่อ ก→ฮ' };
const TS_PAL   = ['#4361ee','#06d6a0','#ffa62b','#7c5cfc','#4cc9f0','#f72585','#ff6b6b','#2ec4b6','#8d99ae','#e9c46a'];
const TS_DAY_H = 8;

let _tsView = 'staff', _tsSort = 'util';
try { _tsView = localStorage.getItem('ts-view') || 'staff'; _tsSort = localStorage.getItem('ts-sort') || 'util'; } catch (e) {}
if (!TS_VIEWS.some(v => v.id === _tsView)) _tsView = 'staff';
if (!TS_SORTS[_tsSort]) _tsSort = 'util';

const _n1  = v => { const r = Math.round(v * 10) / 10; return r.toLocaleString('en-US', { maximumFractionDigits: 1 }); };
const _pad = n => String(n).padStart(2, '0');
const _ds  = window.ymd;
function _eachDay(s, e, fn) {
  const cur = pd(s), end = pd(e);
  while (cur <= end) { fn(cur, _ds(cur)); cur.setDate(cur.getDate() + 1); }
}
const _lvl = u => u === null ? 'na' : u > 105 ? 'over' : u >= 85 ? 'ok' : u >= 50 ? 'mid' : 'low';
const _lvlLabel = { over: 'เกินกำลัง', ok: 'เหมาะสม', mid: 'ปานกลาง', low: 'ใช้งานต่ำ', na: '–' };

// ── ช่วงวันที่ของรายการ (visit → member → project → workDate) ─────────────
// วันที่ที่ถูกบันทึกเป็นปี พ.ศ. (เช่น 2569-12-31) → แปลงกลับเป็น ค.ศ.
const _isBE = s => !!s && Number(String(s).slice(0, 4)) > 2400;
const _iso  = s => _isBE(s) ? (Number(s.slice(0, 4)) - 543) + s.slice(4) : s;
function _tsRange(r) {
  const g = _tsRangeRaw(r);
  return { s: _iso(g.s), e: _iso(g.e) };
}
// ── แคชภายในรอบ render (ดัชนี id → โครงการ/พนักงาน, วันหยุดบริษัท, วันลารายคน) ──
// ตั้งค่าเฉพาะระหว่าง renderTimesheet() — นอกรอบ render (เช่น export) ใช้ .find แบบเดิม
let _tsRC = null;
function _tsBuildRC() {
  const pm = new Map(), sm = new Map(), lvBy = new Map();
  (window.PROJECTS || []).forEach(p => { if (!pm.has(p.id)) pm.set(p.id, p); });
  (window.STAFF || []).forEach(s => { if (!sm.has(s.id)) sm.set(s.id, s); });
  const hol = (window.HOLIDAYS || []).filter(h => h.date && (h.type === 'company' || h.type === 'both')).map(h => ({ h, d: pd(h.date) }));
  (window.LEAVES || []).forEach(lv => {
    if (lv.status === 'rejected' || !lv.startDate || !lv.endDate) return;
    const le = pd(lv.endDate); le.setHours(23, 59, 59);
    const a = lvBy.get(lv.staffId) || (lvBy.set(lv.staffId, []), lvBy.get(lv.staffId));
    a.push({ ls: pd(lv.startDate), le });
  });
  return { pm, sm, hol, lvBy };
}
const _projById = pid => _tsRC ? _tsRC.pm.get(pid) : (window.PROJECTS || []).find(p => p.id === pid);
const _stById   = sid => (_tsRC && _tsRC.sm.get(sid)) || gSt(sid);

function _tsRangeRaw(r) {
  let s = r.workDate, e = r.workDate;
  if (r.source === 'project') {
    if (r.visitStart && r.visitEnd) return { s: r.visitStart, e: r.visitEnd };
    // fallback: member-based records (ID: TS-{pid}-M{i})
    const proj = _projById(r.pid);
    if (proj) {
      if (Array.isArray(proj.members)) {
        let mem = null;
        const idxMatch = r.id && r.id.match(/M(\d+)$/);
        if (idxMatch) {
          const candidate = proj.members[parseInt(idxMatch[1])];
          if (candidate && candidate.sid === r.staffId) mem = candidate;
        }
        if (!mem) mem = proj.members.find(m => m.sid === r.staffId);
        if (mem && mem.s) s = mem.s;
        if (mem && mem.e) e = mem.e;
      }
      if (s === r.workDate && proj.start) s = proj.start;
      if (e === r.workDate && proj.end)   e = proj.end;
    }
  }
  return { s, e };
}

// ── ALLOCATION ENGINE ────────────────────────────────────────────────────────
// กระจายชั่วโมงของแต่ละรายการลงวันทำงานจริง (ไม่นับเสาร์-อาทิตย์/วันหยุด/วันลา)
// เพื่อให้กรองรายเดือน, คำนวณ Utilization และหา "งานซ้อน" ได้ถูกต้อง
let _cache = null;
function _getCache() {
  const T = window.TIMESHEETS || [], L = window.LEAVES || [], H = window.HOLIDAYS || [], P = window.PROJECTS || [];
  if (_cache && _cache.T === T && _cache.L === L && _cache.H === H && _cache.P === P && _cache.n === T.length) return _cache;

  const hol = new Set(H.map(h => h.date).filter(Boolean));
  const isWork = (d, ds) => { const w = d.getDay(); return w !== 0 && w !== 6 && !hol.has(ds); };

  const leaveBy = {};   // sid → Set(วันทำงานที่ลา)
  L.forEach(lv => {
    if (lv.status === 'rejected' || !lv.staffId || !lv.startDate || !lv.endDate) return;
    const set = leaveBy[lv.staffId] || (leaveBy[lv.staffId] = new Set());
    _eachDay(_iso(lv.startDate), _iso(lv.endDate), (d, ds) => { if (isWork(d, ds)) set.add(ds); });
  });

  const alloc = new Map();   // record → { s, e, days[], per }
  const load  = {};          // sid → { date: { h, p:[pid] } }
  let minD = '', maxD = '';
  const years = new Set(), badBE = [];
  T.forEach(r => {
    const rg = _tsRange(r), days = [];
    const raw = _tsRangeRaw(r);
    if (_isBE(raw.s) || _isBE(raw.e) || _isBE(r.workDate)) badBE.push(r);
    if (rg.s && rg.e && rg.e >= rg.s) {
      const lv = leaveBy[r.staffId];
      _eachDay(rg.s, rg.e, (d, ds) => { if (isWork(d, ds) && !(lv && lv.has(ds))) days.push(ds); });
    }
    if (!days.length && (r.workDate || rg.s)) days.push(_iso(r.workDate) || rg.s);
    days.forEach(ds => years.add(Number(ds.slice(0, 4)) + 543));
    const per = days.length ? r.hours / days.length : 0;
    alloc.set(r, { s: rg.s || _iso(r.workDate), e: rg.e || _iso(r.workDate), days, per });
    const ld = load[r.staffId] || (load[r.staffId] = {});
    days.forEach(ds => {
      const x = ld[ds] || (ld[ds] = { h: 0, p: [] });
      x.h += per;
      if (!x.p.includes(r.pid)) x.p.push(r.pid);
    });
    if (days.length) {
      if (!minD || days[0] < minD) minD = days[0];
      if (!maxD || days[days.length - 1] > maxD) maxD = days[days.length - 1];
    }
  });

  if (badBE.length) console.warn('[Timesheet] พบรายการที่ลงวันที่เป็นปี พ.ศ. (แปลงเป็น ค.ศ. ให้อัตโนมัติ):', badBE.map(r => r.id));
  _cache = { T, L, H, P, n: T.length, hol, isWork, leaveBy, alloc, load, minD, maxD, years, badBE };
  return _cache;
}

// ── FILTER STATE ─────────────────────────────────────────────────────────────
function _tsFilters() {
  return {
    q:     (document.getElementById('ts-q')?.value || '').trim().toLowerCase(),
    yr:    document.getElementById('ts-yr')?.value || '',
    mon:   document.getElementById('ts-mon')?.value || '',
    types: window.msValues ? window.msValues('ts-type') : [],
    pid:   document.getElementById('ts-proj')?.value || '',
    sid:   document.getElementById('ts-staff')?.value || '',
  };
}

function _period(f, c) {
  if (f.yr) {
    const y = Number(f.yr) - 543;
    if (f.mon) {
      const m = Number(f.mon);
      return { s: `${y}-${_pad(m)}-01`, e: `${y}-${_pad(m)}-${_pad(new Date(y, m, 0).getDate())}`, mon: 0 };
    }
    return { s: `${y}-01-01`, e: `${y}-12-31`, mon: 0 };
  }
  return { s: c.minD, e: c.maxD, mon: f.mon ? Number(f.mon) : 0 };
}

function _periodLabel(f) {
  if (f.yr && f.mon) return TS_MON[f.mon - 1] + ' ' + f.yr;
  if (f.yr) return 'ปี พ.ศ. ' + f.yr;
  if (f.mon) return 'เดือน' + TS_MON[f.mon - 1] + ' ทุกปี';
  return 'ทุกช่วงเวลา';
}

// ── COMPUTE ──────────────────────────────────────────────────────────────────
function _tsCompute() {
  const c = _getCache(), f = _tsFilters(), P = _period(f, c);
  const inP = ds => ds >= P.s && ds <= P.e && (!P.mon || Number(ds.slice(5, 7)) === P.mon);
  const projOf = _projById;

  // วันทำงานในช่วงที่เลือก (ฐานคำนวณกำลังคน)
  const pDays = [];
  if (P.s && P.e) _eachDay(P.s, P.e, (d, ds) => { if (inP(ds) && c.isWork(d, ds)) pDays.push(ds); });

  // กรองรายการ (ยกเว้นช่วงเวลา ซึ่งใช้วิธีตัดชั่วโมงตามวันจริง)
  let recs = window.TIMESHEETS.slice();
  if (f.types.length) recs = recs.filter(r => { const p = projOf(r.pid); return p && f.types.includes(p.typeId); });
  if (f.pid) recs = recs.filter(r => r.pid === f.pid);
  if (f.sid) recs = recs.filter(r => r.staffId === f.sid);
  if (f.q)   recs = recs.filter(r => {
    const p = projOf(r.pid), s = _stById(r.staffId);
    return (p?.name || '').toLowerCase().includes(f.q) || (p?.code || '').toLowerCase().includes(f.q) ||
           (s?.name || '').toLowerCase().includes(f.q) || (s?.nickname || '').toLowerCase().includes(f.q) ||
           (r.description || '').toLowerCase().includes(f.q);
  });

  const rows = [];
  recs.forEach(r => {
    const a = c.alloc.get(r);
    if (!a) return;
    const n = a.days.filter(inP).length;
    if (!n) return;
    rows.push({ r, a, hp: a.per * n, dp: n });
  });

  // ── รายคน ──
  const narrowed = !!(f.types.length || f.pid || f.q);
  const sidSet = new Set(rows.map(x => x.r.staffId));
  if (!narrowed) {
    // แสดงคนที่เคยมี Timesheet ด้วย แม้ช่วงนี้ไม่มีงาน → เห็นกำลังคนว่าง
    const everSids = new Set(window.TIMESHEETS.map(r => r.staffId));
    window.STAFF.forEach(s => { if (s.active && everSids.has(s.id) && (!f.sid || s.id === f.sid)) sidSet.add(s.id); });
  }

  // จัดกลุ่มแถวตามพนักงานครั้งเดียว (แทน rows.filter ต่อคน) — ลำดับในกลุ่มคงเดิม
  const rowsBy = new Map();
  rows.forEach(x => { const k = x.r.staffId; (rowsBy.get(k) || (rowsBy.set(k, []), rowsBy.get(k))).push(x); });
  const staff = [...sidSet].map(sid => {
    const lv = c.leaveBy[sid], ld = c.load[sid] || {};
    let leaveDays = 0, overDays = 0, freeDays = 0;
    const overRanges = [];
    let run = null;
    pDays.forEach((ds, i) => {
      if (lv && lv.has(ds)) { leaveDays++; run = null; return; }
      const x = ld[ds];
      if (!x || x.h < 0.01) freeDays++;
      if (x && x.h > TS_DAY_H + 0.01) {
        overDays++;
        if (run && run.i === i - 1) { run.e = ds; run.i = i; x.p.forEach(p => run.p.add(p)); }
        else { run = { s: ds, e: ds, i, p: new Set(x.p), h: x.h }; overRanges.push(run); }
        run.h = Math.max(run.h, x.h);
      } else run = null;
    });
    const mine  = rowsBy.get(sid) || [];
    const hours = mine.reduce((s, x) => s + x.hp, 0);
    const cap   = Math.max(0, pDays.length - leaveDays) * TS_DAY_H;
    const projs = {};
    mine.forEach(x => {
      const p = projs[x.r.pid] || (projs[x.r.pid] = { pid: x.r.pid, h: 0, s: x.a.s, e: x.a.e });
      p.h += x.hp;
      if (x.a.s && x.a.s < p.s) p.s = x.a.s;
      if (x.a.e && x.a.e > p.e) p.e = x.a.e;
    });
    return {
      sid, s: _stById(sid), hours, cap, util: cap ? hours / cap * 100 : null,
      leaveDays, overDays, freeDays, overRanges,
      projs: Object.values(projs).sort((a, b) => b.h - a.h),
    };
  });

  // ── รายโครงการ ──
  const projMap = {};
  rows.forEach(x => { (projMap[x.r.pid] || (projMap[x.r.pid] = [])).push(x); });
  const projects = Object.keys(projMap).map(pid => {
    const list = projMap[pid];
    const byS  = {};
    list.forEach(x => { byS[x.r.staffId] = (byS[x.r.staffId] || 0) + x.hp; });
    return {
      pid, proj: projOf(pid), list,
      hours: list.reduce((s, x) => s + x.hp, 0),
      team: Object.entries(byS).map(([sid, h]) => ({ sid, h })).sort((a, b) => b.h - a.h),
    };
  }).sort((a, b) => b.hours - a.hours);

  return { c, f, P, pDays, rows, staff, projects, narrowed };
}

// ── HEATMAP DATA (ทั้งปี) ────────────────────────────────────────────────────
function _tsHeat(d) {
  const c = d.c, f = d.f;
  const yBE = Number(f.yr) || (new Date().getFullYear() + 543), y = yBE - 543;
  const mDays = Array.from({ length: 12 }, () => []);
  _eachDay(`${y}-01-01`, `${y}-12-31`, (dt, ds) => { if (c.isWork(dt, ds)) mDays[dt.getMonth()].push(ds); });

  // รายการที่ผ่านตัวกรอง (ไม่รวมตัวกรองเดือน)
  const recs = new Set();
  const projOf = _projById;
  window.TIMESHEETS.forEach(r => {
    if (f.types.length) { const p = projOf(r.pid); if (!p || !f.types.includes(p.typeId)) return; }
    if (f.pid && r.pid !== f.pid) return;
    if (f.sid && r.staffId !== f.sid) return;
    if (f.q) {
      const p = projOf(r.pid), s = _stById(r.staffId);
      if (!((p?.name || '').toLowerCase().includes(f.q) || (s?.name || '').toLowerCase().includes(f.q) ||
            (s?.nickname || '').toLowerCase().includes(f.q) || (r.description || '').toLowerCase().includes(f.q))) return;
    }
    recs.add(r);
  });

  const hBy = {};
  recs.forEach(r => {
    const a = c.alloc.get(r);
    if (!a) return;
    a.days.forEach(ds => {
      if (Number(ds.slice(0, 4)) !== y) return;
      const m = Number(ds.slice(5, 7)) - 1;
      const arr = hBy[r.staffId] || (hBy[r.staffId] = new Array(12).fill(0));
      arr[m] += a.per;
    });
  });

  const sids = new Set(Object.keys(hBy));
  if (!d.narrowed) d.staff.forEach(x => sids.add(x.sid));

  const staff = [...sids].map(sid => {
    const lv = c.leaveBy[sid];
    const hrs = hBy[sid] || new Array(12).fill(0);
    const cells = mDays.map((days, m) => {
      const leave = lv ? days.filter(ds => lv.has(ds)).length : 0;
      const cap = Math.max(0, days.length - leave) * TS_DAY_H;
      return { h: hrs[m], cap, leave, util: cap ? hrs[m] / cap * 100 : null };
    });
    const h = cells.reduce((s, x) => s + x.h, 0), cap = cells.reduce((s, x) => s + x.cap, 0);
    return { sid, s: _stById(sid), cells, h, cap, util: cap ? h / cap * 100 : null };
  }).sort((a, b) => (b.util || 0) - (a.util || 0));

  const team = mDays.map((_, m) => {
    const h = staff.reduce((s, x) => s + x.cells[m].h, 0), cap = staff.reduce((s, x) => s + x.cells[m].cap, 0);
    return { h, cap, util: cap ? h / cap * 100 : null };
  });
  return { yBE, mDays, staff, team };
}

// ── HOLIDAY / LEAVE BADGES (ต่อรายการ) ──────────────────────────────────────
function _getTsHolLeave(r) {
  const { s: startDate, e: endDate } = _tsRange(r);
  const c = _getCache();
  const sD = pd(startDate), eD = pd(endDate);
  eD.setHours(23, 59, 59);

  const hols = _tsRC
    ? _tsRC.hol.filter(x => x.d >= sD && x.d <= eD).map(x => x.h)
    : (window.HOLIDAYS || []).filter(h => {
    if (!h.date) return false;
    if (h.type !== 'company' && h.type !== 'both') return false;
    const hd = pd(h.date);
    return hd >= sD && hd <= eD;
  });

  const lvSet = c.leaveBy[r.staffId];
  // ตรวจล่วงหน้าจากวันลาที่แยกรายคนไว้ — ไม่ทับช่วงเลยก็ข้ามการสแกน LEAVES ทั้งก้อน (ผลเป็น [] เหมือนเดิม)
  const lvHit = !_tsRC || (startDate && endDate && (_tsRC.lvBy.get(r.staffId) || []).some(x => x.ls <= eD && x.le >= sD));
  const leaves = lvHit && window.getStaffLeaveConflicts
    ? window.getStaffLeaveConflicts(r.staffId, startDate, endDate)
        .filter(x => x.leave.status !== 'rejected')
        .map(x => {
          let days = 0;
          const ls = x.leave.startDate > startDate ? x.leave.startDate : startDate;
          const le = x.leave.endDate < endDate ? x.leave.endDate : endDate;
          if (ls <= le) _eachDay(ls, le, (d, ds) => { if (lvSet && lvSet.has(ds)) days++; });
          return Object.assign({}, x, { days });
        })
    : [];

  return { hols, leaves };
}

function _holLeaveBadgesHtml(info) {
  const parts = [];
  if (info.hols.length) {
    parts.push(`<span class="ts-chip ts-chip-hol" title="${esc(info.hols.map(h => h.name).join(', '))}">🏢 วันหยุดบริษัท ${info.hols.length} วัน</span>`);
  }
  // รวมการลาตามประเภท
  const grouped = {}, order = [];
  info.leaves.forEach(x => {
    const key = x.emoji + '|' + x.label;
    if (!grouped[key]) { grouped[key] = { emoji: x.emoji, label: x.label, days: 0, titles: [] }; order.push(key); }
    grouped[key].days += x.days;
    const lv = x.leave;
    grouped[key].titles.push(fd(lv.startDate) + ' – ' + fd(lv.endDate) + (lv.note ? ' (' + lv.note + ')' : ''));
  });
  order.forEach(key => {
    const g = grouped[key];
    parts.push(`<span class="ts-chip ts-chip-leave" title="${esc(g.label + ': ' + g.titles.join(', '))}">${g.emoji} ${g.label}${g.days > 0 ? ' <b>' + g.days + ' วัน</b>' : ''}</span>`);
  });
  return parts.length ? `<div class="ts-chips">${parts.join('')}</div>` : '';
}

// ── SMALL RENDER HELPERS ─────────────────────────────────────────────────────
const _initials = s => esc((s.nickname || s.name || '?').slice(0, 2).toUpperCase());
const _sName    = s => esc(s.nickname || s.name || '–');
const _sFull    = s => esc((s.name || s.nickname || '–') + (s.nickname && s.name && s.nickname !== s.name ? ' (' + s.nickname + ')' : ''));
const _pctTxt   = u => u === null ? '–' : Math.round(u) + '%';
function _pColor(pid, i) {
  const p = _projById(pid);
  const t = p && (window.PTYPES || []).find(x => x.id === p.typeId);
  return (t && t.color) || TS_PAL[i % TS_PAL.length];
}
function _rangeTxt(s, e) { return !s ? '' : (!e || s === e) ? fd(s) : fd(s) + ' – ' + fd(e); }
function _utilBar(u) {
  // สเกล 0–150% ; เส้นประที่ 100% = เต็มกำลัง
  const w = u === null ? 0 : Math.min(u, 150) / 150 * 100;
  return `<div class="ts-ubar"><div class="ts-ufill lv-${_lvl(u)}" style="width:${w}%"></div><span class="ts-u100" title="100% = เต็มกำลัง"></span></div>`;
}

// ── RENDER ───────────────────────────────────────────────────────────────────
window.renderTimesheet = function() {
  if (!window.cu) return;
  _tsRC = _tsBuildRC();
  try {
  _populateTsFilters();
  const d = _tsCompute();
  _renderKpis(d);
  _renderViewbar(d);

  const box = document.getElementById('ts-cards');
  if (!box) return;
  if (_tsView === 'month')        box.innerHTML = _renderHeat(d);
  else if (_tsView === 'project') box.innerHTML = _renderProjects(d);
  else                            box.innerHTML = _renderStaff(d);
  } finally { _tsRC = null; }
};

function _renderKpis(d) {
  const el = document.getElementById('ts-summary-bar');
  if (!el) return;
  const totalH  = d.rows.reduce((s, x) => s + x.hp, 0);
  const capped  = d.staff.filter(x => x.cap > 0);
  const capSum  = capped.reduce((s, x) => s + x.cap, 0);
  const teamU   = capSum ? capped.reduce((s, x) => s + x.hours, 0) / capSum * 100 : null;
  const over    = d.staff.filter(x => (x.util || 0) > 105 || x.overDays > 0);
  const overPD  = d.staff.reduce((s, x) => s + x.overDays, 0);
  const low     = capped.filter(x => x.util < 50);
  const freePD  = d.staff.reduce((s, x) => s + x.freeDays, 0);
  const leavePD = d.staff.reduce((s, x) => s + x.leaveDays, 0);

  const card = (lv, icon, val, lbl, sub, title) => `
    <div class="ts-kpi lv-${lv}">
      <div class="ts-kpi-ic">${icon}</div>
      <div class="ts-kpi-txt">
        <div class="ts-kpi-val">${val}</div>
        <div class="ts-kpi-lbl">${lbl}${window.calcTip(title)}</div>
        ${sub ? `<div class="ts-kpi-sub">${sub}</div>` : ''}
      </div>
    </div>`;

  el.innerHTML =
    card('info', '⏱', _n1(totalH) + '<small> ชม.</small>', 'ชั่วโมงที่จัดสรร', '= ' + _n1(totalH / TS_DAY_H) + ' คน-วัน · ' + esc(_periodLabel(d.f)),
         'ชั่วโมงทำงานที่ลงไว้ในช่วงเวลาที่เลือก (ตัดตามวันทำงานจริง)\nคน-วัน = ชั่วโมง ÷ ' + TS_DAY_H + ' ชม.') +
    card(_lvl(teamU), '📈', _pctTxt(teamU), 'Utilization ทีม', capped.length + ' คน · กำลังคน ' + _n1(capSum / TS_DAY_H) + ' คน-วัน',
         'ชั่วโมงที่จัดสรร ÷ ชั่วโมงที่ทำงานได้ × 100\nชั่วโมงที่ทำงานได้ = (วันทำงาน − วันลา) × ' + TS_DAY_H + ' ชม. รวมทุกคนที่มีกำลังคน\nต่ำ <50% · ปานกลาง 50–84% · เหมาะสม 85–105% · เกิน >105%') +
    card(over.length ? 'over' : 'ok', '🔥', over.length + '<small> คน</small>', 'งานเกินกำลัง / ซ้อน', overPD ? 'งานซ้อนรวม ' + overPD + ' คน-วัน' : 'ไม่มีงานซ้อน',
         'คนที่ Utilization > 105% หรือมีวันที่ถูกจัดงานเกิน 8 ชม./วัน') +
    card(low.length ? 'low' : 'ok', '🟢', low.length + '<small> คน</small>', 'มีเวลาว่าง (<50%)', 'วันว่างรวม ' + _n1(freePD) + ' คน-วัน',
         'คนที่ยังรับงานเพิ่มได้ — วันว่าง = วันทำงานที่ไม่มีงานและไม่ได้ลา') +
    card('info', '📁', d.projects.length, 'โครงการที่มีงาน', d.rows.length + ' รายการ', 'จำนวนโครงการ (ไม่ซ้ำ) ที่มีการลงชั่วโมงในช่วงเวลาที่เลือก\nรายการ = จำนวนแถว Timesheet ที่อยู่ในช่วงนั้น') +
    card('info', '🌴', leavePD + '<small> วัน</small>', 'วันลารวม', 'ในช่วงเวลาที่เลือก', 'วันทำงานที่ลา (ไม่นับที่ถูกปฏิเสธ)');
}

function _renderViewbar(d) {
  const el = document.getElementById('ts-viewbar');
  if (!el) return;
  const legend = _tsView === 'project' ? '' : `
    <div class="ts-legend">
      ${['low', 'mid', 'ok', 'over'].map(l => `<span><i class="lv-${l}"></i>${_lvlLabel[l]}</span>`).join('')}
      <span class="ts-legend-note">ต่ำ &lt;50% · ปานกลาง 50–84% · เหมาะสม 85–105% · เกิน &gt;105%</span>
    </div>`;
  el.innerHTML = `
    <div class="ts-seg">
      ${TS_VIEWS.map(v => `<button class="${v.id === _tsView ? 'on' : ''}" onclick="window.tsSetView('${v.id}')">${v.icon} ${v.label}</button>`).join('')}
    </div>
    ${_tsView === 'staff' ? `<select class="t-sel ts-sort" onchange="window.tsSetSort(this.value)">
      ${Object.entries(TS_SORTS).map(([k, l]) => `<option value="${k}"${k === _tsSort ? ' selected' : ''}>เรียง: ${l}</option>`).join('')}
    </select>` : ''}
    ${_badBEChip(d.c.badBE)}
    ${legend}`;
}

function _badBEChip(bad) {
  if (!bad.length) return '';
  const names = [...new Set(bad.map(r => window.PROJECTS.find(p => p.id === r.pid)?.name || r.pid))];
  return `<span class="ts-chip ts-chip-over" title="${esc('วันที่ถูกลงเป็นปี พ.ศ. แทน ค.ศ. — ระบบแปลงให้อัตโนมัติแล้ว แต่ควรแก้ที่โครงการ:\n' + names.join('\n'))}">⚠ วันที่ลงเป็น พ.ศ. ${bad.length} รายการ (${names.length} โครงการ)</span>`;
}

// ── VIEW 1: ภาระงานรายคน ─────────────────────────────────────────────────────
function _renderStaff(d) {
  if (!d.staff.length) return `<div class="ts-empty">ไม่มีข้อมูล Timesheet ในช่วงที่เลือก</div>`;
  const list = d.staff.slice();
  const cmp = {
    util:  (a, b) => (b.util ?? -1) - (a.util ?? -1),
    free:  (a, b) => b.freeDays - a.freeDays,
    hours: (a, b) => b.hours - a.hours,
    name:  (a, b) => (a.s.name || '').localeCompare(b.s.name || '', 'th'),
  }[_tsSort];
  list.sort(cmp);

  const openSet = new Set(Array.from(document.querySelectorAll('.ts-srow.open')).map(el => el.dataset.sid));
  if (list.length === 1) openSet.add(list[0].sid);

  return `<div class="ts-shead">
      <div>พนักงาน</div><div>Utilization (${d.pDays.length} วันทำงาน)${window.calcTip('ชั่วโมงที่ได้รับงาน ÷ ((วันทำงาน − วันลา) × ' + TS_DAY_H + ' ชม.) × 100\nแถบเต็มที่ 150% · เส้นประ = 100% เต็มกำลัง')}</div>
      <div class="r">ชม.${window.calcTip('ผลรวมชั่วโมงที่ลงไว้ของคนนี้ในช่วงที่เลือก')}</div><div class="r">คน-วัน${window.calcTip('ชั่วโมง ÷ ' + TS_DAY_H)}</div><div class="r">โครงการ</div><div>สัญญาณ${window.calcTip('ซ้อน = จำนวนวันที่ถูกจัดงานเกิน ' + TS_DAY_H + ' ชม.\nว่าง = วันทำงานที่ไม่มีงานและไม่ได้ลา\nลา = วันทำงานที่ลา (ไม่นับที่ถูกปฏิเสธ)')}</div><div></div>
    </div>` + list.map(x => {
    const lv = _lvl(x.util), isOpen = openSet.has(x.sid);
    const flags = [];
    if (x.overDays)  flags.push(`<span class="ts-chip ts-chip-over" title="วันที่ถูกจัดงานเกิน ${TS_DAY_H} ชม.">⚠ ซ้อน ${x.overDays} วัน</span>`);
    if (x.freeDays)  flags.push(`<span class="ts-chip ts-chip-free" title="วันทำงานที่ยังไม่มีงาน">ว่าง ${x.freeDays} วัน</span>`);
    if (x.leaveDays) flags.push(`<span class="ts-chip ts-chip-leave">🌴 ลา ${x.leaveDays} วัน</span>`);

    const stack = x.hours ? `<div class="ts-stack">${x.projs.map((p, i) =>
      `<span style="width:${p.h / x.hours * 100}%;background:${_pColor(p.pid, i)}" title="${esc(_projById(p.pid)?.name || p.pid)} · ${_n1(p.h)} ชม."></span>`).join('')}</div>` : '';

    const body = `
      <div class="ts-srow-body"${isOpen ? '' : ' style="display:none"'}>
        ${x.projs.length ? x.projs.map((p, i) => {
          const proj = _projById(p.pid);
          const share = x.cap ? p.h / x.cap * 100 : 0;
          return `<div class="ts-prow" onclick="window.tsOpenProject('${esc(p.pid)}')" title="ดูรายละเอียดโครงการ">
            <i class="ts-dot" style="background:${_pColor(p.pid, i)}"></i>
            <div class="ts-prow-name"><b>${esc(proj?.name || p.pid)}</b><small>📅 ${_rangeTxt(p.s, p.e)}</small></div>
            <div class="ts-prow-bar"><span style="width:${Math.min(share, 100)}%;background:${_pColor(p.pid, i)}"></span></div>
            <div class="ts-prow-num"><b>${_n1(p.h)}</b> ชม. <small>${_n1(p.h / TS_DAY_H)} วัน · ${Math.round(share)}% ของเวลา</small></div>
          </div>`;
        }).join('') : `<div class="ts-prow-empty">ไม่มีงานที่จัดสรรในช่วงนี้ — ว่างรับงานได้ ${x.freeDays} วัน</div>`}
        ${x.overRanges.length ? `<div class="ts-over-box">
          <div class="ts-over-ttl">⚠ ช่วงที่ถูกจัดงานซ้อน (เกิน ${TS_DAY_H} ชม./วัน)</div>
          ${x.overRanges.slice(0, 8).map(o => `<div class="ts-over-item">
            <b>${_rangeTxt(o.s, o.e)}</b> · สูงสุด ${_n1(o.h)} ชม./วัน ·
            ${[...o.p].map(pid => esc(_projById(pid)?.name || pid)).join(' ＋ ')}
          </div>`).join('')}
          ${x.overRanges.length > 8 ? `<div class="ts-over-item">…และอีก ${x.overRanges.length - 8} ช่วง</div>` : ''}
        </div>` : ''}
      </div>`;

    return `<div class="ts-srow${isOpen ? ' open' : ''}" data-sid="${esc(x.sid)}">
      <div class="ts-srow-head" onclick="window.tsToggle(this)">
        <div class="ts-who">
          <div class="ts-av lv-${lv}">${_initials(x.s)}</div>
          <div class="ts-who-txt"><b title="${_sFull(x.s)}">${_sFull(x.s)}</b><small>${esc(x.s.position || '')}</small></div>
        </div>
        <div class="ts-util">
          <div class="ts-util-top"><span class="ts-upct lv-${lv}">${_pctTxt(x.util)}</span><small>${_lvlLabel[lv]}</small></div>
          ${_utilBar(x.util)}
          ${stack}
        </div>
        <div class="ts-num"><b>${_n1(x.hours)}</b><small>/ ${_n1(x.cap)}</small></div>
        <div class="ts-num"><b>${_n1(x.hours / TS_DAY_H)}</b><small>คน-วัน</small></div>
        <div class="ts-num"><b>${x.projs.length}</b><small>โครงการ</small></div>
        <div class="ts-flags">${flags.join('')}</div>
        <div class="ts-arrow${isOpen ? ' open' : ''}">▼</div>
      </div>
      ${body}
    </div>`;
  }).join('');
}

// ── VIEW 2: Heatmap รายเดือน ─────────────────────────────────────────────────
function _renderHeat(d) {
  const H = _tsHeat(d);
  if (!H.staff.length) return `<div class="ts-empty">ไม่มีข้อมูล Timesheet ในปี พ.ศ. ${H.yBE}</div>`;
  const selM = d.f.yr && d.f.mon ? Number(d.f.mon) - 1 : -1;
  const cell = (x, m, isTeam) => {
    const lv = x.h < 0.01 ? (x.cap ? 'zero' : 'na') : _lvl(x.util);
    const title = `${TS_MON[m]} ${H.yBE} · ${_n1(x.h)} / ${_n1(x.cap)} ชม.` + (x.leave ? ` · ลา ${x.leave} วัน` : '');
    return `<div class="ts-hc lv-${lv}${m === selM ? ' sel' : ''}" title="${title}"${isTeam ? '' : ` onclick="window.tsPickMonth(${m + 1})"`}>
      ${x.util === null ? '–' : Math.round(x.util) + '<i>%</i>'}${!isTeam && x.leave ? '<em>🌴</em>' : ''}
    </div>`;
  };
  const teamH = H.team.reduce((s, x) => s + x.h, 0), teamC = H.team.reduce((s, x) => s + x.cap, 0);
  return `<div class="ts-heat-wrap"><div class="ts-heat">
    <div class="ts-hh ts-hname">พนักงาน · ปี ${H.yBE}</div>
    ${TS_MON.map((m, i) => `<div class="ts-hh${i === selM ? ' sel' : ''}" onclick="window.tsPickMonth(${i + 1})" title="${H.mDays[i].length} วันทำงาน">${m}<small>${H.mDays[i].length} วัน</small></div>`).join('')}
    <div class="ts-hh">ทั้งปี</div>
    ${H.staff.map(x => `
      <div class="ts-hname" onclick="window.tsPickStaff('${esc(x.sid)}')" title="ดูภาระงานของ ${esc(x.s.name || '')}">
        <div class="ts-av sm lv-${_lvl(x.util)}">${_initials(x.s)}</div><span title="${_sFull(x.s)}">${_sFull(x.s)}</span>
      </div>
      ${x.cells.map((c, m) => cell(c, m, false)).join('')}
      <div class="ts-htot lv-${_lvl(x.util)}"><b>${_pctTxt(x.util)}</b><small>${_n1(x.h)} ชม.</small></div>`).join('')}
    <div class="ts-hname ts-hteam">รวมทั้งทีม</div>
    ${H.team.map((c, m) => cell(c, m, true)).join('')}
    <div class="ts-htot lv-${_lvl(teamC ? teamH / teamC * 100 : null)}"><b>${_pctTxt(teamC ? teamH / teamC * 100 : null)}</b><small>${_n1(teamH)} ชม.</small></div>
  </div></div>
  <div class="ts-hint">💡 คลิกช่องเดือนเพื่อดูภาระงานรายคนของเดือนนั้น · คลิกชื่อเพื่อดูรายละเอียดของคนนั้น · 🌴 = มีวันลาในเดือน</div>`;
}

// ── VIEW 3: ตามโครงการ ───────────────────────────────────────────────────────
function _renderProjects(d) {
  if (!d.projects.length) return `<div class="ts-empty">ไม่มีข้อมูล Timesheet ในช่วงที่เลือก</div>`;
  const openSet = new Set(Array.from(document.querySelectorAll('.ts-card.open')).map(el => el.dataset.pid));
  if (d.projects.length === 1 || d.f.pid) d.projects.forEach(p => openSet.add(p.pid));
  const maxH = d.projects[0].hours || 1;

  return d.projects.map(P => {
    const proj = P.proj, isOpen = openSet.has(P.pid);
    const type = proj && (window.PTYPES || []).find(t => t.id === proj.typeId);
    const periods = window.getProjPeriods(proj);
    const dateTxt = !periods.length ? '' : periods.length === 1
      ? `<span>📅 ${_rangeTxt(periods[0].s, periods[0].e)}</span>`
      : periods.map((p, i) => `<span class="nw">ช่วง${i + 1} 📅 ${_rangeTxt(p.s, p.e)}</span>`).join('<span class="ts-sep">|</span>');
    const hasAuto = P.list.some(x => x.r.source === 'project');
    const pRows = P.list.slice().sort((a, b) => (a.a.s || '').localeCompare(b.a.s || ''));

    return `<div class="ts-card${isOpen ? ' open' : ''}" data-pid="${esc(P.pid)}">
      <div class="ts-card-head" onclick="window.tsToggle(this)">
        <div class="ts-pic" style="${type?.color ? `background:${type.color}22;color:${type.color}` : ''}">⏱</div>
        <div class="ts-ptitle">
          <b>${esc(proj?.name || P.pid)}</b>
          <div class="ts-pmeta">
            ${proj?.code ? `<span class="ts-code">${esc(proj.code)}</span>` : ''}
            ${type ? `<span class="ts-type" style="color:${type.color};background:${type.color}1a">${esc(type.label)}</span>` : ''}
            ${dateTxt}
            ${hasAuto ? `<span class="ts-auto">🔄 sync อัตโนมัติ</span>` : ''}
          </div>
          <div class="ts-team">
            <div class="ts-stack big" title="สัดส่วนชั่วโมงของแต่ละคน">${P.team.map((t, i) =>
              `<span style="width:${t.h / P.hours * 100}%;background:${TS_PAL[i % TS_PAL.length]}" title="${esc(gSt(t.sid).name || '')} · ${_n1(t.h)} ชม."></span>`).join('')}</div>
            <div class="ts-team-names">${P.team.slice(0, 6).map((t, i) =>
              `<span><i class="ts-dot" style="background:${TS_PAL[i % TS_PAL.length]}"></i>${_sName(gSt(t.sid))} ${Math.round(t.h / P.hours * 100)}%</span>`).join('')}${P.team.length > 6 ? `<span>+${P.team.length - 6}</span>` : ''}</div>
          </div>
        </div>
        <div class="ts-pnums">
          <div class="ts-num"><b class="c-sky">${_n1(P.hours)}</b><small>ชม.</small><span class="ts-share"><span style="width:${P.hours / maxH * 100}%"></span></span></div>
          <div class="ts-num"><b class="c-teal">${_n1(P.hours / TS_DAY_H)}</b><small>คน-วัน</small></div>
          <div class="ts-num"><b class="c-violet">${P.team.length}</b><small>คน</small></div>
          <div class="ts-arrow${isOpen ? ' open' : ''}">▼</div>
        </div>
      </div>
      <div class="ts-card-body"${isOpen ? '' : ' style="display:none"'}>
        ${pRows.map(x => {
          const r = x.r, s = gSt(r.staffId), cat = TS_CAT[r.category] || TS_CAT.other;
          const clipped = Math.abs(x.hp - r.hours) > 0.01;
          return `<div class="ts-row-item">
            <div class="ts-row-staff" onclick="event.stopPropagation();window.tsPickStaff('${esc(r.staffId)}')" title="ดูภาระงานของคนนี้">
              <div class="ts-av">${_initials(s)}</div>
              <div style="min-width:0;">
                <div class="ts-rname">${_sName(s)}</div>
                <div class="ts-rpos">${esc(s.position || '')}</div>
                ${_holLeaveBadgesHtml(_getTsHolLeave(r))}
              </div>
            </div>
            <div class="ts-row-meta">
              <span class="ts-badge-cat">${cat.icon} ${cat.label}</span>
              <span class="ts-rdate">📅 ${_rangeTxt(x.a.s, x.a.e)}</span>
              ${r.source === 'project' ? `<span class="ts-auto-pill">🔄 auto</span>` : ''}
            </div>
            <div class="ts-rdesc" title="${esc(r.description)}">${esc(r.description || '–')}</div>
            <div class="ts-rhours">
              <div><b>${_n1(x.hp)}</b> <small>ชม.</small></div>
              <small>${_n1(x.hp / TS_DAY_H)} วัน${clipped ? ` · จาก ${_n1(r.hours)}` : ''}</small>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
}

// ── INTERACTIONS ─────────────────────────────────────────────────────────────
window.tsToggle = function(head) {
  const card = head.parentElement;
  const isOpen = card.classList.toggle('open');
  const body = card.querySelector('.ts-card-body, .ts-srow-body');
  if (body) body.style.display = isOpen ? '' : 'none';
  head.querySelector('.ts-arrow')?.classList.toggle('open', isOpen);
};
window.tsSetView = function(v) {
  _tsView = v;
  try { localStorage.setItem('ts-view', v); } catch (e) {}
  window.renderTimesheet();
};
window.tsSetSort = function(s) {
  _tsSort = s;
  try { localStorage.setItem('ts-sort', s); } catch (e) {}
  window.renderTimesheet();
};
window.tsPickMonth = function(m) {
  const yr = document.getElementById('ts-yr'), mon = document.getElementById('ts-mon');
  if (yr && !yr.value) yr.value = String(new Date().getFullYear() + 543);
  if (mon) mon.value = String(m);
  window.tsSetView('staff');
};
window.tsPickStaff = function(sid) {
  const el = document.getElementById('ts-staff');
  if (el) el.value = sid;
  window.tsSetView('staff');
};
window.tsOpenProject = function(pid) {
  const el = document.getElementById('ts-proj');
  if (el) el.value = pid;
  window.tsSetView('project');
};

// ── EXPORT (เรียกจาก export.js) ──────────────────────────────────────────────
window.tsExportData = function() {
  const d = _tsCompute(), lbl = _periodLabel(d.f);
  if (_tsView === 'staff') {
    return {
      name: 'Timesheet_ภาระงานรายคน',
      headers: ['พนักงาน', 'ตำแหน่ง', 'ช่วงเวลา', 'ชม.จัดสรร', 'ชม.ทำงานได้', 'Utilization (%)', 'สถานะ', 'คน-วัน', 'จำนวนโครงการ', 'วันซ้อน', 'วันว่าง', 'วันลา', 'โครงการ (ชม.)'],
      rows: d.staff.sort((a, b) => (b.util ?? -1) - (a.util ?? -1)).map(x => [
        x.s.name || '', x.s.position || '', lbl, +x.hours.toFixed(1), x.cap,
        x.util === null ? '' : Math.round(x.util), _lvlLabel[_lvl(x.util)], +(x.hours / TS_DAY_H).toFixed(1),
        x.projs.length, x.overDays, x.freeDays, x.leaveDays,
        x.projs.map(p => (window.PROJECTS.find(q => q.id === p.pid)?.name || p.pid) + ' (' + _n1(p.h) + ')').join(', '),
      ]),
    };
  }
  if (_tsView === 'month') {
    const H = _tsHeat(d);
    return {
      name: 'Timesheet_Utilization_' + H.yBE,
      headers: ['พนักงาน', ...TS_MON.map(m => m + ' (%)'), 'ทั้งปี (%)', 'ชม.รวม'],
      rows: H.staff.map(x => [x.s.name || '', ...x.cells.map(c => c.util === null ? '' : Math.round(c.util)),
        x.util === null ? '' : Math.round(x.util), Math.round(x.h)]),
    };
  }
  const rows = d.rows.slice().sort((a, b) => (a.a.s || '').localeCompare(b.a.s || '')).map(x => [
    x.a.s, x.a.e, window.PROJECTS.find(p => p.id === x.r.pid)?.name || x.r.pid, gSt(x.r.staffId).name || '',
    +x.hp.toFixed(1), +(x.hp / TS_DAY_H).toFixed(1), x.r.hours, (TS_CAT[x.r.category] || TS_CAT.other).label, x.r.description,
  ]);
  rows.push(['', '', '', 'รวม', +rows.reduce((s, r) => s + r[4], 0).toFixed(1), +rows.reduce((s, r) => s + r[5], 0).toFixed(1), '', '', '']);
  return {
    name: 'Timesheet',
    headers: ['เริ่ม', 'สิ้นสุด', 'โครงการ', 'พนักงาน', 'ชม. (' + lbl + ')', 'คน-วัน', 'ชม.ทั้งรายการ', 'ประเภทงาน', 'รายละเอียด'],
    rows,
  };
};

// ── FILTERS ───────────────────────────────────────────────────────────────────
function _populateTsFilters() {
  const yrSel   = document.getElementById('ts-yr');
  const projSel = document.getElementById('ts-proj');
  const stfSel  = document.getElementById('ts-staff');
  if (!yrSel) return;

  // ปีจากช่วงวันที่จริงของแต่ละรายการ (รายการข้ามปีจะอยู่ทั้งสองปี)
  const c = _getCache();
  // ปีปัจจุบันเป็นค่าเริ่มต้นเสมอ (มีในรายการแม้ยังไม่มีงาน)
  const thisYrBE = new Date().getFullYear() + 543;
  const years = [...new Set([...c.years, thisYrBE])].sort((a, b) => b - a);
  let curYr = yrSel.value;
  if (!yrSel.dataset.init) { yrSel.dataset.init = '1'; curYr = String(thisYrBE); }
  yrSel.innerHTML = '<option value="">ทุกปี พ.ศ.</option>' + years.map(y => `<option value="${y}"${y == curYr ? ' selected' : ''}>ปี พ.ศ. ${y}</option>`).join('');

  // Project types that appear in timesheets
  if ((window.PTYPES || []).length) {
    const pids    = new Set(window.TIMESHEETS.map(r => r.pid).filter(Boolean));
    const typeIds = new Set(window.PROJECTS.filter(p => pids.has(p.id)).map(p => p.typeId).filter(Boolean));
    window.msFilter('ts-type', window.PTYPES.filter(t => typeIds.has(t.id)).map(t => ({ value: t.id, label: t.label, color: t.color })), { placeholder: 'ทุกประเภท', onChange: window.renderTimesheet });
  }

  // Projects that have timesheets
  const pids = new Set(window.TIMESHEETS.map(r => r.pid).filter(Boolean));
  const tsProjList = window.PROJECTS.filter(p => pids.has(p.id));
  const curProj = tsProjList.some(p => p.id === projSel.value) ? projSel.value : '';
  window.initProjectCombobox(window.projectComboIds('ts-proj-cmb', 'ts-proj'), tsProjList, curProj,
    () => window.renderTimesheet(), { allLabel: 'ทุกโครงการ', minWidth: 360 });

  // Staff that have timesheets
  const sids = new Set(window.TIMESHEETS.map(r => r.staffId).filter(Boolean));
  const curStf = stfSel.value;
  stfSel.innerHTML = '<option value="">ทุกคน</option>' +
    window.staffOptionsGrouped(window.STAFF.filter(s => s.active && sids.has(s.id)), curStf);
}

// ── AUTO-SYNC FROM PROJECT MEMBERS / VISITS ──────────────────────────────────
window.tsSyncProject = async function(pid, members) {
  if (!window.canEdit('projects')) return;
  var batch = writeBatch();

  // ลบรายการ auto-generate เก่าของโครงการนี้
  (window.TIMESHEETS || [])
    .filter(function(ts){ return ts.pid === pid && ts.source === 'project'; })
    .forEach(function(ts){ batch.delete(getDocRef('TIMESHEETS', ts.id)); });

  var proj   = (window.PROJECTS || []).find(function(p){ return p.id === pid; });
  var visits = proj && Array.isArray(proj.visits) && proj.visits.length
    ? proj.visits.filter(function(v){ return v.start && v.end && v.team && v.team.length; })
    : [];

  if (visits.length > 0) {
    // สร้าง 1 record ต่อคนต่อ visit — ID: TS-{pid}-V{vi}-{sid}
    visits.forEach(function(v, vi) {
      window._vtMembers(v.team, v.start, v.end).forEach(function(mem) {
        if (!mem.sid) return;
        var ms = mem.s || v.start;
        var me = mem.e || v.end;
        var info = window.countWorkDaysExcLeave(mem.sid, ms, me);
        var wd   = info.workDays;
        if (wd <= 0) return;
        var tsId      = 'TS-' + pid + '-V' + vi + '-' + mem.sid;
        var leaveNote = info.leaveDays > 0 ? ' (หักลา ' + info.leaveDays + ' วัน)' : '';
        var roundLabel = v.no ? ' รอบที่ ' + v.no : ' ช่วงที่ ' + (vi + 1);
        batch.set(getDocRef('TIMESHEETS', tsId), {
          timesheet_id: tsId,
          project_id:   pid,
          staff_id:     mem.sid,
          work_date:    ms,
          visit_start:  ms,
          visit_end:    me,
          hours:        wd * 8,
          category:     'fieldwork',
          description:  'ชั่วโมงทำงาน' + roundLabel + ' ' + wd + ' วัน' + leaveNote + ' (อัตโนมัติจากโครงการ)',
          source:       'project',
        });
      });
    });
  } else {
    // fallback: ใช้ members (กรณีไม่มี visits) — ID: TS-{pid}-M{i}
    members.forEach(function(m, i) {
      if (!m.sid || !m.s || !m.e) return;
      var info = window.countWorkDaysExcLeave(m.sid, m.s, m.e);
      var wd   = info.workDays;
      if (wd <= 0) return;
      var tsId      = 'TS-' + pid + '-M' + i;
      var leaveNote = info.leaveDays > 0 ? ' (หักลา ' + info.leaveDays + ' วัน)' : '';
      batch.set(getDocRef('TIMESHEETS', tsId), {
        timesheet_id: tsId,
        project_id:   pid,
        staff_id:     m.sid,
        work_date:    m.s,
        hours:        wd * 8,
        category:     'fieldwork',
        description:  'ชั่วโมงทำงาน ' + wd + ' วัน' + leaveNote + ' (อัตโนมัติจากโครงการ)',
        source:       'project',
      });
    });
  }

  await batch.commit();
  // Optimistic local sync handled in caller (saveProject) via renderAll
};
