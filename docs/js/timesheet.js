const { esc, fd, fc, pd, gSt, getColRef, getDocRef, getYearBE } = window;
const writeBatch = () => window.writeBatch();

const TS_CAT = {
  planning:  { label: 'วางแผน',        icon: '📋' },
  fieldwork: { label: 'งานภาคสนาม',    icon: '🏗' },
  reporting: { label: 'จัดทำรายงาน',   icon: '📄' },
  meeting:   { label: 'ประชุม',         icon: '👥' },
  training:  { label: 'อบรม',           icon: '📚' },
  other:     { label: 'อื่นๆ',          icon: '📝' },
};

// ── HOLIDAY / LEAVE INFO HELPERS ─────────────────────────────────────────────
function _countOverlapWorkDays(leaveStart, leaveEnd, workStart, workEnd) {
  var ls = pd(leaveStart), le = pd(leaveEnd);
  var ws = pd(workStart),  we = pd(workEnd);
  we.setHours(23, 59, 59);
  var cur = new Date(Math.max(ls.getTime(), ws.getTime()));
  var end = new Date(Math.min(le.getTime(), we.getTime()));
  end.setHours(23, 59, 59);
  if (cur > end) return 0;
  var count = 0;
  while (cur <= end) {
    var dow = cur.getDay();
    var ds = cur.getFullYear() + '-' + String(cur.getMonth()+1).padStart(2,'0') + '-' + String(cur.getDate()).padStart(2,'0');
    var isHol = (window.HOLIDAYS || []).some(function(h){ return h.date === ds; });
    if (dow !== 0 && dow !== 6 && !isHol) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function _getTsHolLeave(r) {
  var startDate = r.workDate;
  var endDate   = r.workDate;

  if (r.source === 'project') {
    // ใช้ visit_start/visit_end ที่เก็บไว้ตรง ๆ (visit-based records)
    if (r.visitStart && r.visitEnd) {
      startDate = r.visitStart;
      endDate   = r.visitEnd;
    } else {
      // fallback: member-based records (ID: TS-{pid}-M{i})
      var proj = (window.PROJECTS || []).find(function(p) { return p.id === r.pid; });
      if (proj) {
        if (Array.isArray(proj.members)) {
          var mem = null;
          var idxMatch = r.id && r.id.match(/M(\d+)$/);
          if (idxMatch) {
            var candidate = proj.members[parseInt(idxMatch[1])];
            if (candidate && candidate.sid === r.staffId) mem = candidate;
          }
          if (!mem) mem = proj.members.find(function(m) { return m.sid === r.staffId; });
          if (mem && mem.s) startDate = mem.s;
          if (mem && mem.e) endDate   = mem.e;
        }
        if (startDate === r.workDate && proj.start) startDate = proj.start;
        if (endDate   === r.workDate && proj.end)   endDate   = proj.end;
      }
    }
  }

  var sD = pd(startDate), eD = pd(endDate);
  eD.setHours(23, 59, 59);

  var hols = (window.HOLIDAYS || []).filter(function(h) {
    if (!h.date) return false;
    if (h.type !== 'company' && h.type !== 'both') return false;
    var hd = pd(h.date);
    return hd >= sD && hd <= eD;
  });

  var leaves = window.getStaffLeaveConflicts
    ? window.getStaffLeaveConflicts(r.staffId, startDate, endDate)
        .filter(function(x) { return x.leave.status !== 'rejected'; })
        .map(function(x) {
          return Object.assign({}, x, {
            days: _countOverlapWorkDays(x.leave.startDate, x.leave.endDate, startDate, endDate)
          });
        })
    : [];

  return { hols: hols, leaves: leaves };
}

function _holLeaveBadgesHtml(info) {
  var parts = [];
  if (info.hols.length) {
    parts.push('<span style="font-size:10px;color:var(--coral);background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.25);border-radius:5px;padding:1px 7px;white-space:nowrap;cursor:default;" title="' + info.hols.map(function(h){return h.name;}).join(', ') + '">🏢 วันหยุดบริษัท ' + info.hols.length + ' วัน</span>');
  }
  // group leaves by category key (emoji+label), sum days, collect titles
  var grouped = {};
  var groupOrder = [];
  info.leaves.forEach(function(x) {
    var key = x.emoji + '|' + x.label;
    if (!grouped[key]) {
      grouped[key] = { emoji: x.emoji, label: x.label, days: 0, titles: [] };
      groupOrder.push(key);
    }
    grouped[key].days += x.days;
    var lv = x.leave;
    grouped[key].titles.push(fd(lv.startDate) + ' – ' + fd(lv.endDate) + (lv.note ? ' (' + lv.note + ')' : ''));
  });
  groupOrder.forEach(function(key) {
    var g = grouped[key];
    var daysText = g.days > 0 ? ' <b>' + g.days + ' วัน</b>' : '';
    var title = esc(g.label + ': ' + g.titles.join(', '));
    parts.push('<span style="font-size:10px;color:var(--amber);background:rgba(255,166,43,.1);border:1px solid rgba(255,166,43,.25);border-radius:5px;padding:1px 7px;white-space:nowrap;cursor:default;" title="' + title + '">' + g.emoji + ' ' + g.label + daysText + '</span>');
  });
  return parts.length
    ? '<div style="display:flex;gap:3px;flex-wrap:nowrap;margin-top:4px;">' + parts.join('') + '</div>'
    : '';
}

// ── RENDER ────────────────────────────────────────────────────────────────────
window.renderTimesheet = function() {
  if (!window.cu) return;
  _populateTsFilters();

  const q          = (document.getElementById('ts-q')?.value || '').toLowerCase();
  const yr         = document.getElementById('ts-yr')?.value || '';
  const mon        = document.getElementById('ts-mon')?.value || '';
  const typeFilter = document.getElementById('ts-type')?.value || '';
  const projFilter = document.getElementById('ts-proj')?.value || '';
  const stf        = document.getElementById('ts-staff')?.value || '';

  let rows = window.TIMESHEETS.slice();

  if (typeFilter) rows = rows.filter(r => {
    const p = window.PROJECTS.find(p => p.id === r.pid);
    return p?.typeId === typeFilter;
  });
  if (projFilter) rows = rows.filter(r => r.pid === projFilter);
  if (stf)        rows = rows.filter(r => r.staffId === stf);
  if (yr)         rows = rows.filter(r => getYearBE(r.workDate) == yr);
  if (mon)        rows = rows.filter(r => r.workDate && new Date(r.workDate).getMonth() + 1 == mon);
  if (q)          rows = rows.filter(r => {
    const p = window.PROJECTS.find(p => p.id === r.pid);
    const s = gSt(r.staffId);
    return (p?.name || '').toLowerCase().includes(q) ||
           (s?.name || '').toLowerCase().includes(q) ||
           (r.description || '').toLowerCase().includes(q);
  });

  // Summary bar
  const totalHours = rows.reduce((s, r) => s + r.hours, 0);
  const byStaff    = {};
  rows.forEach(r => { byStaff[r.staffId] = (byStaff[r.staffId] || 0) + r.hours; });
  const topStaff   = Object.entries(byStaff).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const summaryEl = document.getElementById('ts-summary-bar');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="stat-card" style="flex:0 0 auto;min-width:160px;">
        <div class="stat-icon" style="background:rgba(76,201,240,.12);color:var(--sky)">⏱</div>
        <div><div class="stat-val">${totalHours % 1 === 0 ? totalHours.toFixed(0) : totalHours.toFixed(1)}</div><div class="stat-lbl">ชั่วโมงรวม</div></div>
      </div>
      <div class="stat-card" style="flex:0 0 auto;min-width:160px;">
        <div class="stat-icon" style="background:rgba(124,92,252,.12);color:var(--violet)">📋</div>
        <div><div class="stat-val">${rows.length}</div><div class="stat-lbl">รายการทั้งหมด</div></div>
      </div>
      ${topStaff.map(([sid, h]) => {
        const s = gSt(sid);
        return `<div class="stat-card" style="flex:0 0 auto;min-width:160px;">
          <div class="stat-icon" style="background:rgba(6,214,160,.12);color:var(--teal)">👤</div>
          <div><div class="stat-val">${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)} <span style="font-size:14px;font-weight:500">ชม.</span></div><div class="stat-lbl">${esc(s.nickname||s.name)}</div></div>
        </div>`;
      }).join('')}`;
  }

  // Group by project
  const projMap = {};
  rows.forEach(r => {
    if (!projMap[r.pid]) projMap[r.pid] = [];
    projMap[r.pid].push(r);
  });

  const cards = document.getElementById('ts-cards');
  if (!cards) return;

  const pids = Object.keys(projMap);
  if (!pids.length) {
    cards.innerHTML = `<div style="text-align:center;padding:56px 24px;color:var(--txt3);font-size:15px;">ไม่มีข้อมูล Timesheet</div>`;
    return;
  }

  // Preserve expanded cards across re-renders
  const openSet = new Set(
    Array.from(document.querySelectorAll('.ts-card.open')).map(el => el.dataset.pid)
  );
  // Auto-open when filtered to single project
  if (pids.length === 1 || projFilter) pids.forEach(p => openSet.add(p));

  // Sort: project end date descending (latest end first)
  pids.sort((a, b) => {
    const projA = window.PROJECTS.find(p => p.id === a);
    const projB = window.PROJECTS.find(p => p.id === b);
    const endA  = projA?.end || '';
    const endB  = projB?.end || '';
    return endB.localeCompare(endA);
  });

  cards.innerHTML = pids.map(pid => {
    const proj  = window.PROJECTS.find(p => p.id === pid);
    const pRows = projMap[pid].slice().sort((a, b) => a.workDate.localeCompare(b.workDate));
    const totalH   = pRows.reduce((s, r) => s + r.hours, 0);
    const members  = [...new Set(pRows.map(r => r.staffId))];
    const hasAuto  = pRows.some(r => r.source === 'project');
    const isOpen   = openSet.has(pid);

    const dates     = pRows.map(r => r.workDate).filter(Boolean).sort();
    const dateRange = dates.length === 0 ? '' :
                      dates[0] === dates[dates.length-1] ? fd(dates[0]) :
                      fd(dates[0]) + ' – ' + fd(dates[dates.length-1]);

    // วันทำงานของโครงการ = รวมวันทำงานตามช่วง (ไม่ใช่ person-days)
    const periods   = window.getProjPeriods(proj);
    const totalDays = periods.length
      ? periods.reduce((s, p) => s + (window.countWorkDays(p.s, p.e) || 0), 0)
      : totalH / 8;

    return `<div class="ts-card${isOpen ? ' open' : ''}" data-pid="${pid}">
      <div class="ts-card-head" onclick="window.tsToggleCard('${pid}')">
        <div style="width:44px;height:44px;border-radius:13px;background:rgba(76,201,240,.12);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">⏱</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:15px;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(proj?.name || pid)}</div>
          <div style="font-size:12px;color:var(--txt3);margin-top:3px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            ${proj?.code ? `<span style="background:var(--violet)15;color:var(--violet);padding:1px 7px;border-radius:6px;font-size:11px;font-weight:600;">${esc(proj.code)}</span>` : ''}
            ${(() => {
              const periods = window.getProjPeriods(proj);
              if (!periods.length) return dateRange ? `<span>📅 ${dateRange}</span>` : '';
              if (periods.length === 1) return `<span>📅 ${fd(periods[0].s)}${periods[0].e ? ' – ' + fd(periods[0].e) : ''}</span>`;
              return periods.map((p, i) => `<span style="white-space:nowrap;">ช่วง${i+1} 📅 ${fd(p.s)}${p.e ? ' – ' + fd(p.e) : ''}</span>`).join('<span style="color:var(--border);margin:0 2px;">|</span>');
            })()}
            ${hasAuto     ? `<span style="color:var(--teal);">🔄 sync อัตโนมัติ</span>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:20px;flex-shrink:0;margin-left:8px;">
          <div style="text-align:center;min-width:48px;">
            <div style="font-weight:800;font-size:20px;color:var(--sky);font-family:'JetBrains Mono',monospace;line-height:1.1;">${totalH % 1 === 0 ? totalH.toFixed(0) : totalH.toFixed(1)}</div>
            <div style="font-size:11px;color:var(--txt3);margin-top:1px;">ชม.</div>
          </div>
          <div style="text-align:center;min-width:36px;">
            <div style="font-weight:800;font-size:20px;color:var(--teal);font-family:'JetBrains Mono',monospace;line-height:1.1;">${totalDays % 1 === 0 ? totalDays.toFixed(0) : totalDays.toFixed(1)}</div>
            <div style="font-size:11px;color:var(--txt3);margin-top:1px;">วัน</div>
          </div>
          <div style="text-align:center;min-width:36px;">
            <div style="font-weight:800;font-size:20px;color:var(--violet);font-family:'JetBrains Mono',monospace;line-height:1.1;">${members.length}</div>
            <div style="font-size:11px;color:var(--txt3);margin-top:1px;">คน</div>
          </div>
          <div class="ts-arrow${isOpen ? ' open' : ''}">▼</div>
        </div>
      </div>
      <div class="ts-card-body"${isOpen ? '' : ' style="display:none"'}>
        ${pRows.map(r => {
          const s   = gSt(r.staffId);
          const cat = TS_CAT[r.category] || TS_CAT.other;
          const wd  = r.hours / 8;
          const initials = (s.nickname || s.name || '?').slice(0, 2).toUpperCase();
          const hlInfo   = _getTsHolLeave(r);
          const hlBadges = _holLeaveBadgesHtml(hlInfo);
          return `<div class="ts-row-item">
            <div class="ts-row-staff">
              <div style="width:36px;height:36px;border-radius:50%;background:rgba(124,92,252,.15);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--violet);flex-shrink:0;">${esc(initials)}</div>
              <div style="min-width:0;">
                <div style="font-weight:600;font-size:13px;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(s.nickname||s.name)}</div>
                <div style="font-size:11px;color:var(--txt3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(s.position||'')}</div>
                ${hlBadges}
              </div>
            </div>
            <div class="ts-row-meta">
              <span class="ts-badge-cat">${cat.icon} ${cat.label}</span>
              <span style="font-size:12px;color:var(--txt2);white-space:nowrap;">📅 ${fd(r.workDate)}</span>
              ${r.source === 'project' ? `<span style="font-size:11px;color:var(--teal);background:rgba(6,214,160,.12);padding:2px 8px;border-radius:8px;white-space:nowrap;">🔄 auto</span>` : ''}
            </div>
            <div style="font-size:12px;color:var(--txt2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(r.description)}">${esc(r.description||'–')}</div>
            <div style="text-align:right;flex-shrink:0;min-width:72px;">
              <div style="font-weight:700;font-size:17px;color:var(--sky);font-family:'JetBrains Mono',monospace;line-height:1.1;">${r.hours % 1 === 0 ? r.hours.toFixed(0) : r.hours.toFixed(1)} <span style="font-size:11px;font-weight:500;color:var(--txt3)">ชม.</span></div>
              <div style="font-size:11px;color:var(--txt3);margin-top:2px;">${wd % 1 === 0 ? wd.toFixed(0) : wd.toFixed(1)} วัน</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
};

window.tsToggleCard = function(pid) {
  const card = document.querySelector(`.ts-card[data-pid="${pid}"]`);
  if (!card) return;
  const isOpen = card.classList.toggle('open');
  card.querySelector('.ts-card-body').style.display = isOpen ? '' : 'none';
  const arrow = card.querySelector('.ts-arrow');
  if (arrow) arrow.classList.toggle('open', isOpen);
};

// ── FILTERS ───────────────────────────────────────────────────────────────────
function _populateTsFilters() {
  const yrSel   = document.getElementById('ts-yr');
  const typeSel = document.getElementById('ts-type');
  const projSel = document.getElementById('ts-proj');
  const stfSel  = document.getElementById('ts-staff');
  if (!yrSel) return;

  // Years from timesheets
  const years = [...new Set(window.TIMESHEETS.map(r => getYearBE(r.workDate)).filter(Boolean))].sort((a,b)=>b-a);
  const thisYrBE = new Date().getFullYear() + 543;
  const curYr = yrSel.value || (years.includes(thisYrBE) ? String(thisYrBE) : (years[0] ? String(years[0]) : ''));
  yrSel.innerHTML = '<option value="">ทุกปี พ.ศ.</option>' + years.map(y => `<option value="${y}"${y==curYr?' selected':''}>ปี พ.ศ. ${y}</option>`).join('');

  // Project types that appear in timesheets
  if (typeSel && (window.PTYPES || []).length) {
    const pids     = [...new Set(window.TIMESHEETS.map(r => r.pid).filter(Boolean))];
    const typeIds  = new Set(window.PROJECTS.filter(p => pids.includes(p.id)).map(p => p.typeId).filter(Boolean));
    const curType  = typeSel.value;
    typeSel.innerHTML = '<option value="">ทุกประเภท</option>' +
      window.PTYPES.filter(t => typeIds.has(t.id)).map(t => `<option value="${t.id}"${t.id===curType?' selected':''}>${esc(t.label)}</option>`).join('');
  }

  // Projects that have timesheets
  const pids = [...new Set(window.TIMESHEETS.map(r => r.pid).filter(Boolean))];
  const curProj = projSel.value;
  projSel.innerHTML = '<option value="">ทุกโครงการ</option>' +
    window.PROJECTS.filter(p => pids.includes(p.id)).map(p => `<option value="${p.id}"${p.id===curProj?' selected':''}>${esc(p.name)}</option>`).join('');

  // Staff that have timesheets
  const sids = [...new Set(window.TIMESHEETS.map(r => r.staffId).filter(Boolean))];
  const curStf = stfSel.value;
  stfSel.innerHTML = '<option value="">ทุกคน</option>' +
    window.STAFF.filter(s => s.active && sids.includes(s.id)).map(s => `<option value="${s.id}"${s.id===curStf?' selected':''}>${esc(s.name)}</option>`).join('');
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
