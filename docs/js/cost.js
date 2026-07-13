const { esc, fd, fc, fca, pd, gSt, uid, getColRef, getDocRef, getYearBE } = window;
const setDoc = (...a) => window.setDoc(...a);

const COST_CAT = {
  phone:      { label: 'ค่าโทรศัพท์',          icon: '📱', color: '#4cc9f0' },
  travel:     { label: 'ค่าเดินทาง',            icon: '🚗', color: '#4361ee' },
  postal:     { label: 'ค่าไปรษณีย์',           icon: '📮', color: '#7c5cfc' },
  taxi:       { label: 'ค่าแท็กซี่',            icon: '🚕', color: '#f72585' },
  fuel:       { label: 'ค่าน้ำมัน',             icon: '⛽', color: '#ffa62b' },
  toll:       { label: 'ค่าทางด่วน',            icon: '🛣️', color: '#06d6a0' },
  food:       { label: 'ค่าอาหาร',              icon: '🍱', color: '#ff6b6b' },
  lodging:    { label: 'ค่าที่พัก',             icon: '🏨', color: '#3a0ca3' },
  stationery: { label: 'เครื่องเขียนแบบพิมพ์',  icon: '🖨️', color: '#9ba3b8' },
  labor:      { label: 'ค่าแรง',                icon: '👷', color: '#f72585' },
  allowance:  { label: 'ค่าเบี้ยเลี้ยง',        icon: '💵', color: '#06d6a0' },
  other:      { label: 'อื่นๆ',                 icon: '📝', color: '#9ba3b8' },
};
window.COST_CAT = COST_CAT;

// ── STATE ─────────────────────────────────────────────────────────────────────
var _costExpanded  = new Set();    // which project pids are open
var _costActiveCat = {};           // { pid: activeCatKey } – which category panel is showing

// Toggle project accordion
window._toggleCostDetail = function(pid) {
  if (_costExpanded.has(pid)) _costExpanded.delete(pid);
  else _costExpanded.add(pid);
  const el = document.getElementById('cost-detail-' + pid);
  const ch = document.getElementById('cost-chevron-' + pid);
  if (!el) return;
  const open = _costExpanded.has(pid);
  el.style.display = open ? '' : 'none';
  if (ch) ch.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
};

// Toggle category item panel (one active at a time per project)
window._selectCostCat = function(pid, cat) {
  const isSame = _costActiveCat[pid] === cat;

  // deactivate previous card
  const prev = _costActiveCat[pid];
  if (prev) {
    const prevCard = document.getElementById(`ccard-${pid}-${prev}`);
    if (prevCard) {
      prevCard.style.borderColor = 'var(--border)';
      prevCard.style.background  = 'var(--surface)';
    }
    const prevPanel = document.getElementById(`cpanel-${pid}-${prev}`);
    if (prevPanel) prevPanel.style.display = 'none';
  }

  if (isSame) { delete _costActiveCat[pid]; return; }

  _costActiveCat[pid] = cat;
  const card = document.getElementById(`ccard-${pid}-${cat}`);
  if (card) {
    const color = card.dataset.color || 'var(--indigo)';
    card.style.borderColor = color;
    card.style.background  = color + '12';
  }
  const panel = document.getElementById(`cpanel-${pid}-${cat}`);
  if (panel) panel.style.display = '';
};

// ── HOLIDAY / LEAVE CHECK (per date) ─────────────────────────────────────────
function _costHolLeave(staffId, dateStr) {
  if (!dateStr) return { hols: [], leaves: [] };
  var sD = pd(dateStr), eD = pd(dateStr);
  eD.setHours(23, 59, 59);

  var hols = (window.HOLIDAYS || []).filter(function(h) {
    if (!h.date) return false;
    var hd = pd(h.date);
    return hd >= sD && hd <= eD;
  });

  var leaves = (staffId && window.getStaffLeaveConflicts)
    ? window.getStaffLeaveConflicts(staffId, dateStr, dateStr)
        .filter(function(x) { return x.leave.status !== 'rejected'; })
    : [];

  return { hols: hols, leaves: leaves };
}

// ── RENDER ────────────────────────────────────────────────────────────────────
window.renderCost = function() {
  if (!window.cu) return;
  _populateCostFilters();

  const q    = (document.getElementById('cost-q')?.value || '').toLowerCase();
  const yr   = document.getElementById('cost-yr')?.value || '';
  const mon  = document.getElementById('cost-mon')?.value || '';
  const type = window.msValues('cost-type');
  const proj = document.getElementById('cost-proj')?.value || '';
  const cat  = document.getElementById('cost-cat')?.value || '';

  let rows = window.COSTS.slice();

  if (type.length) rows = rows.filter(r => {
    const p = window.PROJECTS.find(p => p.id === r.pid);
    return p && type.includes(p.typeId);
  });
  if (proj) rows = rows.filter(r => r.pid === proj);
  if (cat)  rows = rows.filter(r => r.category === cat);
  if (yr)   rows = rows.filter(r => getYearBE(r.costDate) == yr);
  if (mon)  rows = rows.filter(r => r.costDate && new Date(r.costDate).getMonth() + 1 == mon);
  if (q)    rows = rows.filter(r => {
    const p = window.PROJECTS.find(p => p.id === r.pid);
    return (p?.name || '').toLowerCase().includes(q) ||
           (r.description || '').toLowerCase().includes(q) ||
           (r.receiptNo || '').toLowerCase().includes(q);
  });

  rows.sort((a, b) => (b.costDate || '').localeCompare(a.costDate || ''));

  // ── Summary bar ──────────────────────────────────────────────────────────
  const totalCost    = rows.reduce((s, r) => s + r.amount, 0);
  const byCatAll     = {};
  rows.forEach(r => { byCatAll[r.category] = (byCatAll[r.category] || 0) + r.amount; });
  const topCats      = Object.entries(byCatAll).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const filteredPids = [...new Set(rows.map(r => r.pid))];
  const totalBudget  = window.PROJECTS
    .filter(p => filteredPids.includes(p.id))
    .reduce((s, p) => s + (p.cost || 0), 0);
  const burnPct   = totalBudget > 0 ? Math.min(Math.round(totalCost / totalBudget * 100), 999) : 0;
  const burnColor = burnPct >= 90 ? 'var(--coral)' : burnPct >= 70 ? 'var(--amber)' : 'var(--teal)';

  const summaryEl = document.getElementById('cost-summary-bar');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="stat-card" style="flex:0 0 auto;min-width:180px;">
        <div class="stat-icon" style="background:rgba(6,214,160,.12);color:var(--teal)">💰</div>
        <div><div class="stat-val">${fc(totalCost)}</div><div class="stat-lbl">ค่าใช้จ่ายรวม</div></div>
      </div>
      ${totalBudget > 0 ? `
      <div class="stat-card" style="flex:0 0 auto;min-width:200px;">
        <div class="stat-icon" style="background:rgba(67,97,238,.12);color:var(--indigo)">📊</div>
        <div>
          <div class="stat-val" style="color:${burnColor}">${burnPct}%</div>
          <div class="stat-lbl">Burn Rate (vs ${fc(totalBudget)})</div>
          <div style="margin-top:4px;height:4px;background:var(--border);border-radius:4px;overflow:hidden;width:120px;">
            <div style="height:100%;width:${Math.min(burnPct,100)}%;background:${burnColor};border-radius:4px;transition:width .4s;"></div>
          </div>
        </div>
      </div>` : ''}
      <div class="stat-card" style="flex:0 0 auto;min-width:140px;">
        <div class="stat-icon" style="background:rgba(124,92,252,.12);color:var(--violet)">📋</div>
        <div><div class="stat-val">${rows.length}</div><div class="stat-lbl">รายการ</div></div>
      </div>
      ${topCats.map(([c, amt]) => {
        const info = COST_CAT[c] || COST_CAT.other;
        return `<div class="stat-card" style="flex:0 0 auto;min-width:160px;">
          <div class="stat-icon" style="background:${info.color}18;color:${info.color}">${info.icon}</div>
          <div><div class="stat-val">${fc(amt)}</div><div class="stat-lbl">${info.label}</div></div>
        </div>`;
      }).join('')}`;
  }

  // ── Project-grouped cards ─────────────────────────────────────────────────
  const container = document.getElementById('cost-project-list');
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = `<div style="text-align:center;padding:56px 24px;color:var(--txt3);font-size:14px;">ไม่มีข้อมูลค่าใช้จ่าย</div>`;
    return;
  }

  // group by pid
  const pidOrder  = [];
  const byProject = {};
  rows.forEach(r => {
    if (!byProject[r.pid]) { pidOrder.push(r.pid); byProject[r.pid] = []; }
    byProject[r.pid].push(r);
  });

  // Sort: project end date descending (latest end first)
  pidOrder.sort((a, b) => {
    const projA = window.PROJECTS.find(p => p.id === a);
    const projB = window.PROJECTS.find(p => p.id === b);
    const endA  = projA?.end || '';
    const endB  = projB?.end || '';
    return endB.localeCompare(endA);
  });

  // auto-expand single project filter
  if (proj && !_costExpanded.has(proj)) _costExpanded.add(proj);

  container.innerHTML = pidOrder.map(pid => {
    const items  = byProject[pid];
    const p      = window.PROJECTS.find(p => p.id === pid);
    const total  = items.reduce((s, r) => s + r.amount, 0);
    const budget = p?.cost || 0;
    const bp     = budget > 0 ? Math.min(Math.round(total / budget * 100), 999) : 0;
    const bc     = bp >= 90 ? 'var(--coral)' : bp >= 70 ? 'var(--amber)' : 'var(--teal)';
    const isOpen = _costExpanded.has(pid);
    const activeCat = _costActiveCat[pid] || null;

    // group items by category
    const catMap = {};
    items.forEach(r => {
      if (!catMap[r.category]) catMap[r.category] = [];
      catMap[r.category].push(r);
    });
    const catEntries = Object.entries(catMap).sort((a, b) =>
      b[1].reduce((s,r)=>s+r.amount,0) - a[1].reduce((s,r)=>s+r.amount,0)
    );

    // category chips for header (all categories, with label)
    const chips = catEntries.map(([c, its]) => {
      const info = COST_CAT[c] || COST_CAT.other;
      const amt  = its.reduce((s,r)=>s+r.amount,0);
      return `<span style="display:inline-flex;align-items:center;gap:4px;background:${info.color}15;color:${info.color};border:1px solid ${info.color}35;border-radius:20px;padding:3px 10px;font-size:10px;font-weight:600;white-space:nowrap;">${info.icon} ${info.label} <span style="opacity:.75;">·</span> ${fc(amt)}</span>`;
    }).join('');

    // ── Category cards ──
    const catCards = catEntries.map(([c, its]) => {
      const info   = COST_CAT[c] || COST_CAT.other;
      const catAmt = its.reduce((s,r)=>s+r.amount,0);
      const pct    = total > 0 ? Math.round(catAmt / total * 100) : 0;
      const isAct  = activeCat === c;
      const latestDate = its.map(r=>r.costDate).filter(Boolean).sort().reverse()[0] || '';

      return `
      <div id="ccard-${pid}-${c}" data-color="${info.color}"
           onclick="window._selectCostCat('${pid}','${c}')"
           style="position:relative;border:2px solid ${isAct ? info.color : 'var(--border)'};border-radius:14px;padding:14px 14px 12px;cursor:pointer;background:${isAct ? info.color+'12' : 'var(--surface)'};transition:border-color .18s,background .18s;overflow:hidden;min-width:0;">
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${info.color};border-radius:14px 14px 0 0;"></div>
        <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;">
          <div style="width:32px;height:32px;border-radius:9px;background:${info.color}18;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;margin-top:1px;">${info.icon}</div>
          <div style="min-width:0;">
            <div style="font-size:11px;font-weight:700;color:var(--txt);line-height:1.4;">${info.label}</div>
            <div style="font-size:10px;color:var(--txt3);">${its.length} รายการ${latestDate ? ' · ล่าสุด '+fd(latestDate) : ''}</div>
          </div>
        </div>
        <div style="font-size:16px;font-weight:800;color:${info.color};font-family:'JetBrains Mono',monospace;margin-bottom:6px;">${fc(catAmt)}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
          <div style="flex:1;height:5px;background:var(--border);border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${info.color};border-radius:3px;"></div>
          </div>
          <span style="font-size:10px;font-weight:700;color:${info.color};min-width:28px;text-align:right;">${pct}%</span>
        </div>
        ${isAct ? `<div style="position:absolute;bottom:6px;right:8px;font-size:9px;color:${info.color};font-weight:600;opacity:.7;">▲ ดูรายการ</div>` : `<div style="position:absolute;bottom:6px;right:8px;font-size:9px;color:var(--txt3);opacity:.6;">▼ ดูรายการ</div>`}
      </div>`;
    }).join('');

    // ── Item panels (one per category, hidden unless active) ──
    const catPanels = catEntries.map(([c, its]) => {
      const info   = COST_CAT[c] || COST_CAT.other;
      const catAmt = its.reduce((s,r)=>s+r.amount,0);
      const isAct  = activeCat === c;
      // sort items newest first
      const sorted = its.slice().sort((a,b)=>(b.costDate||'').localeCompare(a.costDate||''));

      const itemRows = sorted.map((r,idx) => {
        const s = gSt(r.staffId);
        const staffLabel = s.nickname || s.name || '';
        const isAdv = r.source === 'advance';
        const hlInfo = _costHolLeave(r.staffId, r.costDate);
        const hlParts = [];
        if (hlInfo.hols.length) hlParts.push(`<span style="font-size:10px;color:var(--coral);background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.25);border-radius:5px;padding:1px 5px;white-space:nowrap;" title="${esc(hlInfo.hols.map(h=>h.name).join(', '))}">🎌 วันหยุด</span>`);
        hlInfo.leaves.forEach(x => hlParts.push(`<span style="font-size:10px;color:var(--amber);background:rgba(255,166,43,.1);border:1px solid rgba(255,166,43,.25);border-radius:5px;padding:1px 5px;white-space:nowrap;" title="${esc(x.label+': '+fd(x.leave.startDate)+' – '+fd(x.leave.endDate))}">${x.emoji} ${x.label}</span>`));
        const hlHtml = hlParts.length ? `<div style="display:flex;gap:3px;margin-top:3px;flex-wrap:wrap;">${hlParts.join('')}</div>` : '';
        return `
        <tr style="border-bottom:1px solid var(--border);${idx%2===1?'background:var(--surface2)':''}">
          <td style="padding:9px 10px;white-space:nowrap;font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--txt3);">${fd(r.costDate)}</td>
          <td style="padding:9px 8px;max-width:260px;">
            <div style="font-size:12px;font-weight:500;color:var(--txt);line-height:1.4;">${esc(r.description||'-')}</div>
            <div style="display:flex;gap:6px;margin-top:2px;flex-wrap:wrap;">
              ${r.receiptNo ? `<span style="font-size:10px;color:var(--txt3);background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:0 5px;">🧾 ${esc(r.receiptNo)}</span>` : ''}
              ${isAdv ? `<span style="font-size:10px;color:var(--indigo);background:rgba(67,97,238,.08);border:1px solid rgba(67,97,238,.2);border-radius:4px;padding:0 5px;">📋 จากเบิก</span>` : ''}
            </div>
          </td>
          <td style="padding:9px 8px;">
            ${staffLabel ? `<div style="display:inline-flex;align-items:center;gap:5px;">
              <div style="width:22px;height:22px;border-radius:50%;background:${info.color}20;color:${info.color};font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${(staffLabel[0]||'?').toUpperCase()}</div>
              <span style="font-size:11px;color:var(--txt2);">${esc(staffLabel)}</span>
            </div>${hlHtml}` : '<span style="font-size:11px;color:var(--txt3);">—</span>'}
          </td>
          <td style="padding:9px 10px;text-align:right;font-size:13px;font-weight:700;color:${info.color};font-family:'JetBrains Mono',monospace;white-space:nowrap;">${fc(r.amount)}</td>
        </tr>`;
      }).join('');

      return `
      <div id="cpanel-${pid}-${c}" style="display:${isAct?'':'none'};border-top:2px solid ${info.color}35;animation:fadeIn .15s ease;">
        <!-- Panel header -->
        <div style="display:flex;align-items:center;gap:10px;padding:11px 18px;background:${info.color}08;flex-wrap:wrap;">
          <div style="width:28px;height:28px;border-radius:8px;background:${info.color}20;display:flex;align-items:center;justify-content:center;font-size:15px;">${info.icon}</div>
          <div style="font-size:13px;font-weight:700;color:${info.color};">${info.label}</div>
          <span style="font-size:11px;color:var(--txt3);background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:1px 8px;">${sorted.length} รายการ</span>
          <div style="flex:1;"></div>
          <div style="font-size:15px;font-weight:800;color:${info.color};font-family:'JetBrains Mono',monospace;">${fc(catAmt)}</div>
        </div>
        <!-- Table -->
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;min-width:560px;">
            <thead>
              <tr style="background:var(--surface2);border-bottom:1px solid var(--border);">
                <th style="padding:6px 10px;text-align:left;font-size:10px;color:var(--txt3);font-weight:600;white-space:nowrap;">วันที่</th>
                <th style="padding:6px 8px;text-align:left;font-size:10px;color:var(--txt3);font-weight:600;">รายละเอียด</th>
                <th style="padding:6px 8px;text-align:left;font-size:10px;color:var(--txt3);font-weight:600;">ผู้บันทึก</th>
                <th style="padding:6px 10px;text-align:right;font-size:10px;color:var(--txt3);font-weight:600;">จำนวน (฿)</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
            <tfoot>
              <tr style="border-top:2px solid ${info.color}30;background:${info.color}06;">
                <td colspan="3" style="padding:8px 10px;font-size:11px;color:var(--txt2);font-weight:600;">รวม ${sorted.length} รายการ</td>
                <td style="padding:8px 10px;text-align:right;font-size:14px;font-weight:800;color:${info.color};font-family:'JetBrains Mono',monospace;">${fc(catAmt)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>`;
    }).join('');

    const periods   = window.getProjPeriods(p);
    const dateRange = periods.length > 1
      ? periods.map((r, i) => `<span style="font-size:10px;color:var(--txt3);white-space:nowrap;">ช่วง${i+1} 📅 ${fd(r.s)}${r.e ? ' – ' + fd(r.e) : ''}</span>`).join('<span style="font-size:10px;color:var(--border);margin:0 3px;">|</span>')
      : periods.length === 1
        ? `<span style="font-size:10px;color:var(--txt3);">📅 ${fd(periods[0].s)}${periods[0].e ? ' – ' + fd(periods[0].e) : ''}</span>`
        : '';

    return `
    <div style="border:1px solid var(--border);border-radius:16px;overflow:hidden;margin-bottom:12px;background:var(--surface);box-shadow:var(--sh-sm);">

      <!-- Project header (accordion trigger) -->
      <div onclick="window._toggleCostDetail('${pid}')"
           style="display:flex;align-items:center;gap:14px;padding:16px 20px;cursor:pointer;user-select:none;transition:background .15s;"
           onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background=''">

        <!-- Left: project name + meta -->
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:15px;color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p?.name || pid)}</div>
          <div style="display:flex;align-items:center;gap:10px;margin-top:5px;flex-wrap:wrap;">
            ${dateRange}
            <span style="font-size:10px;color:var(--txt3);">${items.length} รายการ · ${catEntries.length} หมวด</span>
          </div>
          <!-- Category chips row -->
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;">${chips}</div>
        </div>

        <!-- Right: financial summary -->
        <div style="text-align:right;flex-shrink:0;min-width:130px;">
          <div style="font-size:11px;color:var(--txt3);margin-bottom:2px;">ค่าใช้จ่ายรวม</div>
          <div style="font-size:20px;font-weight:800;color:var(--teal);font-family:'JetBrains Mono',monospace;line-height:1.1;">${fc(total)}</div>
          ${budget > 0 ? `
            <div style="font-size:10px;color:var(--txt3);margin-top:4px;">งบ ${fc(budget)}</div>
            <div style="display:flex;align-items:center;gap:5px;margin-top:3px;justify-content:flex-end;">
              <div style="width:80px;height:4px;background:var(--border);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:${Math.min(bp,100)}%;background:${bc};border-radius:3px;transition:width .4s;"></div>
              </div>
              <span style="font-size:10px;font-weight:700;color:${bc};">${bp}%</span>
            </div>
          ` : ''}
        </div>

        <div id="cost-chevron-${pid}" style="font-size:12px;color:var(--txt3);transition:transform .2s;transform:${isOpen ? 'rotate(180deg)' : 'rotate(0deg)'};">▼</div>
      </div>

      <!-- Expanded detail -->
      <div id="cost-detail-${pid}" style="display:${isOpen ? '' : 'none'};border-top:1px solid var(--border);">

        <!-- Category cards grid -->
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;padding:16px 20px;">
          ${catCards}
        </div>

        <!-- Category item panels (only one visible at a time) -->
        ${catPanels}

      </div>
    </div>`;
  }).join('');
};

// ── FILTERS ───────────────────────────────────────────────────────────────────
function _populateCostFilters() {
  const yrSel   = document.getElementById('cost-yr');
  const projSel = document.getElementById('cost-proj');
  if (!yrSel) return;

  const years = [...new Set(window.COSTS.map(r => getYearBE(r.costDate)).filter(Boolean))].sort((a,b)=>b-a);
  const thisYrBE = new Date().getFullYear() + 543;
  const curYr = yrSel.value || (years.includes(thisYrBE) ? String(thisYrBE) : (years[0] ? String(years[0]) : ''));
  yrSel.innerHTML = '<option value="">ทุกปี พ.ศ.</option>' + years.map(y => `<option value="${y}"${y==curYr?' selected':''}>ปี พ.ศ. ${y}</option>`).join('');

  // Project types that appear in costs
  if ((window.PTYPES || []).length) {
    const pids    = [...new Set(window.COSTS.map(r => r.pid).filter(Boolean))];
    const typeIds = new Set(window.PROJECTS.filter(p => pids.includes(p.id)).map(p => p.typeId).filter(Boolean));
    window.msFilter('cost-type', window.PTYPES.filter(t => typeIds.has(t.id)).map(t => ({value:t.id,label:t.label,color:t.color})), {placeholder:'ทุกประเภท',onChange:window.renderCost});
  }

  const pids = [...new Set(window.COSTS.map(r => r.pid).filter(Boolean))];
  const curProj = projSel.value;
  projSel.innerHTML = '<option value="">ทุกโครงการ</option>' +
    window.PROJECTS.filter(p => pids.includes(p.id)).map(p => `<option value="${p.id}"${p.id===curProj?' selected':''}>${esc(p.name)}</option>`).join('');
}

// ── MODAL ─────────────────────────────────────────────────────────────────────
window.openCostModal = function(id) {
  const c = id ? window.COSTS.find(r => r.id === id) : null;
  if (c ? !window.canEdit('cost') : !window.canAdd('cost')) return;
  document.getElementById('m-cost-title').textContent = c ? 'แก้ไขค่าใช้จ่าย' : 'บันทึกค่าใช้จ่าย';
  document.getElementById('cost-edit-id').value = c ? c.id : '';

  const projSel = document.getElementById('costf-proj');
  projSel.innerHTML = '<option value="">-- เลือกโครงการ --</option>' +
    window.PROJECTS.filter(p => p.status !== 'cancelled').map(p => `<option value="${p.id}"${c && c.pid===p.id?' selected':''}>${esc(p.name)}</option>`).join('');

  document.getElementById('costf-cat').value = c ? c.category : 'travel';
  document.getElementById('costf-amount').value = c ? c.amount : '';
  document.getElementById('costf-date').value = c ? c.costDate : new Date().toISOString().slice(0,10);
  document.getElementById('costf-desc').value = c ? c.description : '';
  document.getElementById('costf-receipt').value = c ? c.receiptNo : '';

  const stfSel = document.getElementById('costf-staff');
  const defaultStaff = (!c && window.cu.staffId) ? window.cu.staffId : '';
  stfSel.innerHTML = '<option value="">-- เลือกพนักงาน --</option>' +
    window.STAFF.filter(s => s.active).map(s => {
      const sel = c ? (c.staffId === s.id) : (defaultStaff === s.id);
      return `<option value="${s.id}"${sel?' selected':''}>${esc(s.name)}</option>`;
    }).join('');

  window.openM('m-cost');
};

window.saveCost = async function() {
  const id      = document.getElementById('cost-edit-id').value;
  if (id ? !window.canEdit('cost') : !window.canAdd('cost')) return;
  const pid     = document.getElementById('costf-proj').value;
  const cat     = document.getElementById('costf-cat').value;
  const amount  = parseFloat(document.getElementById('costf-amount').value);
  const date    = document.getElementById('costf-date').value;
  const desc    = document.getElementById('costf-desc').value.trim();
  const receipt = document.getElementById('costf-receipt').value.trim();
  const staffId = document.getElementById('costf-staff').value;

  if (!pid || !cat || !amount || amount <= 0 || !date || !desc) {
    alert('กรุณากรอกข้อมูลให้ครบถ้วน (โครงการ, หมวด, จำนวนเงิน, วันที่, รายละเอียด)');
    return;
  }

  const docId = id || ('CST' + uid());
  const data = {
    cost_id:     docId,
    project_id:  pid,
    staff_id:    staffId,
    category:    cat,
    amount:      amount,
    cost_date:   date,
    description: desc,
    receipt_no:  receipt,
  };

  try {
    await setDoc(getDocRef('COSTS', docId), data);
    window._applyLocalDoc('COSTS', docId, data);
    _costExpanded.add(pid);       // keep project open
    _costActiveCat[pid] = cat;    // show the saved category panel
    window.renderCost&&window.renderCost();
    window.renderOverview&&window.renderOverview();
    window.closeM('m-cost');
  } catch(e) { alert('บันทึกไม่สำเร็จ: ' + e.message); }
};

window.delCost = function(id, label) {
  window.askDel('cost', id, 'ค่าใช้จ่าย: ' + label);
};
