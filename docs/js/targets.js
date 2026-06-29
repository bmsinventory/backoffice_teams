// ── TEAM TARGETS ──
(function () {
'use strict';

// ── CONSTANTS ──
var CUR_YEAR = new Date().getFullYear();
var _tgtYear = CUR_YEAR;

// ── HELPERS ──
function _tgt(year) {
  return (window.YEAR_TARGETS || []).find(function (t) { return t.year === year; }) || null;
}

function _projsInYear(year) {
  var y = String(year);
  return (window.PROJECTS || []).filter(function (p) {
    if (p.status === 'cancelled') return false;
    var s = (p.start || '').slice(0, 4);
    var e = (p.end   || '').slice(0, 4);
    return s === y || e === y;
  });
}

function _closedProjsInYear(year) {
  var y = String(year);
  var closedStages = (window.STAGES || [])
    .filter(function (s) { return s.id === 'close' || (s.label || '').toLowerCase().includes('close'); })
    .map(function (s) { return s.id; });
  return (window.PROJECTS || []).filter(function (p) {
    if (p.status === 'cancelled') return false;
    var e = (p.end || '').slice(0, 4);
    return e === y && closedStages.includes(p.stage);
  });
}

function _pct(actual, target) {
  if (!target) return 0;
  return Math.min(100, Math.round((actual / target) * 100));
}

function _pbar(pct, color) {
  color = color || 'var(--violet)';
  return '<div style="background:var(--border);border-radius:100px;height:8px;overflow:hidden;margin-top:6px;">'
    + '<div style="height:8px;border-radius:100px;background:' + color + ';width:' + pct + '%;transition:width .4s;"></div>'
    + '</div>';
}

function _statChip(label, value, color) {
  return '<div style="background:' + (color || 'var(--surface2)') + '1a;border:1px solid ' + (color || 'var(--border)') + '33;border-radius:8px;padding:10px 14px;display:inline-flex;flex-direction:column;gap:2px;min-width:90px;">'
    + '<div style="font-size:10px;color:var(--txt3);">' + label + '</div>'
    + '<div style="font-size:16px;font-weight:800;color:' + (color || 'var(--txt)') + ';">' + value + '</div>'
    + '</div>';
}

function _typeLabel(tid) {
  var t = (window.PTYPES || []).find(function (x) { return x.id === tid; });
  return t ? t.label : tid;
}

function _typeColor(tid) {
  var t = (window.PTYPES || []).find(function (x) { return x.id === tid; });
  return t ? (t.color || '#7c5cfc') : '#7c5cfc';
}

// ── RENDER MAIN VIEW ──
window.renderTargets = function () {
  var body = document.getElementById('targets-body');
  if (!body) return;

  var tgt   = _tgt(_tgtYear);
  var projs = _projsInYear(_tgtYear);
  var closed = _closedProjsInYear(_tgtYear);

  var actualRevenue = projs.reduce(function (s, p) { return s + (p.cost || 0); }, 0);
  var closedRevenue = closed.reduce(function (s, p) { return s + (p.cost || 0); }, 0);
  var actualCount   = projs.length;
  var closedCount   = closed.length;

  var revTarget = tgt ? (tgt.revenue || 0) : 0;
  var cntTarget = tgt ? (tgt.count   || 0) : 0;

  var revPct = _pct(closedRevenue, revTarget);
  var cntPct = _pct(closedCount,   cntTarget);

  var canAdm = window.isAdmin && window.isAdmin();

  // ── Year selector ──
  var yearOpts = '';
  var years = [];
  for (var y = CUR_YEAR + 1; y >= CUR_YEAR - 4; y--) years.push(y);
  years.forEach(function (y) {
    yearOpts += '<option value="' + y + '"' + (y === _tgtYear ? ' selected' : '') + '>' + (y + 543) + ' (CE ' + y + ')</option>';
  });

  var html = '';

  // ── Header controls ──
  html += '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px;">'
    + '<select class="f-input" id="tgt-year-sel" onchange="window._tgtSetYear(+this.value)" style="width:180px;font-weight:700;">' + yearOpts + '</select>'
    + (canAdm
      ? '<button onclick="window.openTargetModal()" class="btn btn-pri" style="padding:7px 18px;font-size:13px;">⚙️ ตั้งค่าเป้าหมาย</button>'
      : '')
    + '</div>';

  if (!tgt) {
    html += '<div style="background:var(--surface);border:1px dashed var(--border);border-radius:14px;padding:40px 24px;text-align:center;color:var(--txt3);">'
      + '<div style="font-size:32px;margin-bottom:10px;">🎯</div>'
      + '<div style="font-size:14px;font-weight:600;">ยังไม่ได้กำหนดเป้าหมายสำหรับปี ' + (_tgtYear + 543) + '</div>'
      + (canAdm ? '<div style="margin-top:14px;"><button onclick="window.openTargetModal()" class="btn btn-pri" style="padding:8px 20px;font-size:13px;">+ กำหนดเป้าหมาย</button></div>' : '')
      + '</div>';
    body.innerHTML = html;
    return;
  }

  // ── Revenue card ──
  html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px 24px;margin-bottom:14px;">'
    + '<div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:14px;">💰 เป้าหมายรายได้</div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">'
    + _statChip('เป้าหมาย', revTarget ? window.fc(revTarget) + ' ฿' : '—', '#4361ee')
    + _statChip('ปิดแล้ว', window.fc(closedRevenue) + ' ฿', '#06d6a0')
    + _statChip('รวมทั้งปี', window.fc(actualRevenue) + ' ฿', '#ffa62b')
    + (revTarget ? _statChip('คงเหลือ', window.fc(Math.max(0, revTarget - closedRevenue)) + ' ฿', '#ff6b6b') : '')
    + '</div>'
    + (revTarget
      ? '<div style="display:flex;align-items:center;gap:10px;">'
        + _pbar(revPct, revPct >= 100 ? '#06d6a0' : '#4361ee')
        + '<span style="font-size:12px;font-weight:700;color:' + (revPct >= 100 ? '#06d6a0' : 'var(--txt2)') + ';white-space:nowrap;">' + revPct + '%</span>'
        + '</div>'
      : '')
    + '</div>';

  // ── Project count card ──
  html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px 24px;margin-bottom:14px;">'
    + '<div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:14px;">📁 เป้าหมายจำนวนโครงการ</div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">'
    + _statChip('เป้าหมาย', cntTarget || '—', '#7c5cfc')
    + _statChip('ปิดแล้ว', closedCount, '#06d6a0')
    + _statChip('ดำเนินการ', actualCount, '#ffa62b')
    + (cntTarget ? _statChip('คงเหลือ', Math.max(0, cntTarget - closedCount), '#ff6b6b') : '')
    + '</div>'
    + (cntTarget
      ? '<div style="display:flex;align-items:center;gap:10px;">'
        + _pbar(cntPct, cntPct >= 100 ? '#06d6a0' : '#7c5cfc')
        + '<span style="font-size:12px;font-weight:700;color:' + (cntPct >= 100 ? '#06d6a0' : 'var(--txt2)') + ';white-space:nowrap;">' + cntPct + '%</span>'
        + '</div>'
      : '')
    + '</div>';

  // ── Type breakdown ──
  var typeTargets = tgt.typeTargets || {};
  var allTypeIds = Object.keys(typeTargets);

  // Collect types from projects this year
  var typeStats = {};
  projs.forEach(function (p) {
    var tid = p.typeId || 'other';
    if (!typeStats[tid]) typeStats[tid] = { count: 0, revenue: 0, closed: 0, closedRev: 0 };
    typeStats[tid].count++;
    typeStats[tid].revenue += (p.cost || 0);
  });
  closed.forEach(function (p) {
    var tid = p.typeId || 'other';
    if (!typeStats[tid]) typeStats[tid] = { count: 0, revenue: 0, closed: 0, closedRev: 0 };
    typeStats[tid].closed++;
    typeStats[tid].closedRev += (p.cost || 0);
  });

  var showTypeIds = Array.from(new Set(allTypeIds.concat(Object.keys(typeStats)))).filter(function (tid) {
    var ts = typeStats[tid];
    var tt = typeTargets[tid];
    return ts || tt;
  });

  if (showTypeIds.length > 0) {
    html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px 24px;margin-bottom:14px;">'
      + '<div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:14px;">📊 แยกตามประเภทโครงการ</div>';

    showTypeIds.forEach(function (tid) {
      var ts  = typeStats[tid] || { count: 0, revenue: 0, closed: 0, closedRev: 0 };
      var tt  = typeTargets[tid] || {};
      var col = _typeColor(tid);
      var lbl = _typeLabel(tid);

      var tRev = tt.revenue || 0;
      var tCnt = tt.count   || 0;
      var revP = _pct(ts.closedRev, tRev);
      var cntP = _pct(ts.closed,    tCnt);

      html += '<div style="border-bottom:1px solid var(--border);padding:12px 0;">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
        + '<span style="width:10px;height:10px;border-radius:50%;background:' + col + ';flex-shrink:0;display:inline-block;"></span>'
        + '<span style="font-size:12px;font-weight:700;color:var(--txt);">' + window.esc(lbl) + '</span>'
        + '<span style="font-size:10px;color:var(--txt3);margin-left:auto;">' + ts.count + ' โครงการ / ปิด ' + ts.closed + '</span>'
        + '</div>';

      if (tRev) {
        html += '<div style="font-size:10px;color:var(--txt3);margin-bottom:2px;">รายได้: ' + window.fc(ts.closedRev) + ' / ' + window.fc(tRev) + ' บาท (' + revP + '%)</div>'
          + _pbar(revP, col);
      } else if (ts.revenue) {
        html += '<div style="font-size:10px;color:var(--txt3);">รายได้รวม: ' + window.fc(ts.revenue) + ' บาท</div>';
      }

      if (tCnt) {
        html += '<div style="font-size:10px;color:var(--txt3);margin-top:6px;margin-bottom:2px;">จำนวน: ' + ts.closed + ' / ' + tCnt + ' โครงการ (' + cntP + '%)</div>'
          + _pbar(cntP, col);
      }

      html += '</div>';
    });

    html += '</div>';
  }

  // ── Notes ──
  if (tgt.notes) {
    html += '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px 18px;font-size:12px;color:var(--txt2);line-height:1.7;">'
      + '📝 ' + window.esc(tgt.notes)
      + '</div>';
  }

  body.innerHTML = html;
};

// ── SET YEAR ──
window._tgtSetYear = function (y) {
  _tgtYear = y;
  window.renderTargets();
};

// ── MODAL: ตั้งค่าเป้าหมาย ──
window.openTargetModal = function () {
  if (!window.isAdmin || !window.isAdmin()) { window.showAlert && window.showAlert('เฉพาะ Admin เท่านั้น', 'warn'); return; }

  var tgt = _tgt(_tgtYear) || { year: _tgtYear, revenue: 0, count: 0, typeTargets: {}, notes: '' };
  var typeTargets = tgt.typeTargets || {};

  var yearOpts = '';
  for (var y = CUR_YEAR + 2; y >= CUR_YEAR - 5; y--) {
    yearOpts += '<option value="' + y + '"' + (y === _tgtYear ? ' selected' : '') + '>' + (y + 543) + ' (CE ' + y + ')</option>';
  }

  // Type targets section
  var typeRows = (window.PTYPES || []).map(function (pt) {
    var tt = typeTargets[pt.id] || {};
    return '<div style="display:grid;grid-template-columns:auto 1fr 1fr;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">'
      + '<span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--txt);min-width:0;">'
      + '<span style="width:8px;height:8px;border-radius:50%;background:' + (pt.color || '#7c5cfc') + ';flex-shrink:0;display:inline-block;"></span>'
      + window.esc(pt.label)
      + '</span>'
      + '<div><label style="font-size:9px;color:var(--txt3);display:block;margin-bottom:2px;">รายได้ (฿)</label><input type="number" class="f-input tgt-type-rev" data-tid="' + pt.id + '" min="0" step="100000" value="' + (tt.revenue || '') + '" placeholder="0" style="font-size:12px;padding:5px 8px;height:30px;"></div>'
      + '<div><label style="font-size:9px;color:var(--txt3);display:block;margin-bottom:2px;">จำนวน (โครงการ)</label><input type="number" class="f-input tgt-type-cnt" data-tid="' + pt.id + '" min="0" step="1" value="' + (tt.count || '') + '" placeholder="0" style="font-size:12px;padding:5px 8px;height:30px;"></div>'
      + '</div>';
  }).join('');

  var html = '<div style="padding:20px;">'
    + '<div style="margin-bottom:16px;">'
    + '<label class="f-label">ปีงบประมาณ</label>'
    + '<select class="f-input" id="tgt-m-year" onchange="window._tgtModalYearChange(+this.value)">' + yearOpts + '</select>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">'
    + '<div><label class="f-label">เป้าหมายรายได้ (฿)</label><input type="number" class="f-input" id="tgt-m-rev" min="0" step="100000" value="' + (tgt.revenue || '') + '" placeholder="0"></div>'
    + '<div><label class="f-label">เป้าหมายจำนวนโครงการ</label><input type="number" class="f-input" id="tgt-m-cnt" min="0" step="1" value="' + (tgt.count || '') + '" placeholder="0"></div>'
    + '</div>'
    + (typeRows
      ? '<div style="margin-bottom:16px;">'
        + '<label class="f-label" style="margin-bottom:8px;">เป้าหมายแยกตามประเภทโครงการ</label>'
        + '<div style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:0 12px;">'
        + typeRows
        + '</div>'
        + '</div>'
      : '')
    + '<div style="margin-bottom:4px;"><label class="f-label">หมายเหตุ</label><textarea class="f-input" id="tgt-m-notes" rows="2" placeholder="หมายเหตุเพิ่มเติม...">' + window.esc(tgt.notes || '') + '</textarea></div>'
    + '</div>';

  var mBody = document.getElementById('m-targets-body');
  if (mBody) mBody.innerHTML = html;

  // Show/hide delete button
  var delBtn = document.getElementById('m-targets-del');
  if (delBtn) delBtn.style.display = _tgt(_tgtYear) ? '' : 'none';

  window.openM('m-targets');
};

// ── Reload modal when year changes inside modal ──
window._tgtModalYearChange = function (y) {
  _tgtYear = y;
  window.openTargetModal();
};

// ── SAVE ──
window.saveTarget = async function () {
  if (!window.isAdmin || !window.isAdmin()) return;

  var year = +((document.getElementById('tgt-m-year') || {}).value || _tgtYear);
  var rev  = +((document.getElementById('tgt-m-rev')  || {}).value || 0);
  var cnt  = +((document.getElementById('tgt-m-cnt')  || {}).value || 0);
  var notes = ((document.getElementById('tgt-m-notes') || {}).value || '').trim();

  // Collect type targets
  var typeTargets = {};
  document.querySelectorAll('.tgt-type-rev').forEach(function (el) {
    var tid = el.getAttribute('data-tid');
    var rv  = +el.value;
    if (!typeTargets[tid]) typeTargets[tid] = {};
    if (rv) typeTargets[tid].revenue = rv;
  });
  document.querySelectorAll('.tgt-type-cnt').forEach(function (el) {
    var tid = el.getAttribute('data-tid');
    var cv  = +el.value;
    if (!typeTargets[tid]) typeTargets[tid] = {};
    if (cv) typeTargets[tid].count = cv;
  });

  // Remove entries with no values
  Object.keys(typeTargets).forEach(function (tid) {
    if (!typeTargets[tid].revenue && !typeTargets[tid].count) delete typeTargets[tid];
  });

  // Build updated year_targets array
  var existing = (window.YEAR_TARGETS || []).filter(function (t) { return t.year !== year; });
  var newEntry = { year: year };
  if (rev)                           newEntry.revenue     = rev;
  if (cnt)                           newEntry.count       = cnt;
  if (Object.keys(typeTargets).length) newEntry.typeTargets = typeTargets;
  if (notes)                         newEntry.notes       = notes;

  existing.push(newEntry);

  // Preserve TARGET_TYPE_GROUPS entry
  var tgEntry = (window.TARGET_TYPE_GROUPS || []).length
    ? [{ _typeGroups: window.TARGET_TYPE_GROUPS }]
    : [];
  var payload = existing.concat(tgEntry);

  try {
    await window.setDoc(window.getDocRef('SETTINGS', 'app'), { year_targets: payload }, { merge: true });
    window.YEAR_TARGETS = existing;
    _tgtYear = year;
    window.renderTargets();
    window.closeM('m-targets');
    window.showAlert && window.showAlert('บันทึกเป้าหมายเรียบร้อย', 'success');
  } catch (e) {
    window.showAlert && window.showAlert('เกิดข้อผิดพลาด: ' + e.message, 'error');
  }
};

// ── DELETE ──
window.deleteTarget = async function () {
  if (!window.isAdmin || !window.isAdmin()) return;
  var year = +((document.getElementById('tgt-m-year') || {}).value || _tgtYear);
  if (!await window.confirmAsync('ต้องการลบเป้าหมายปี ' + (year + 543) + ' ใช่หรือไม่?', { icon: '🗑️', title: 'ลบเป้าหมาย' })) return;

  var remaining = (window.YEAR_TARGETS || []).filter(function (t) { return t.year !== year; });
  var tgEntry = (window.TARGET_TYPE_GROUPS || []).length
    ? [{ _typeGroups: window.TARGET_TYPE_GROUPS }]
    : [];
  var payload = remaining.concat(tgEntry);

  try {
    await window.setDoc(window.getDocRef('SETTINGS', 'app'), { year_targets: payload }, { merge: true });
    window.YEAR_TARGETS = remaining;
    window.renderTargets();
    window.closeM('m-targets');
    window.showAlert && window.showAlert('ลบเป้าหมายเรียบร้อย', 'success');
  } catch (e) {
    window.showAlert && window.showAlert('เกิดข้อผิดพลาด: ' + e.message, 'error');
  }
};

})();
