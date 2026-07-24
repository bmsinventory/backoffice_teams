const { esc, fd, pd, gT, avC } = window;

var _WL_THMON_S = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
var _WD = ['อา','จ','อ','พ','พฤ','ศ','ส'];

// store สรุปโครงการต่อคน (เติมทุกครั้ง renderWorkload)
window._WL_STAFF_PROJS = {};

window.wlStaffClick = function(e, sid) {
  e.stopPropagation();
  var data = window._WL_STAFF_PROJS[sid];
  if (!data) return;
  var popup = document.getElementById('wl-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'wl-popup';
    popup.style.cssText = 'position:fixed;z-index:9999;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.18);padding:14px 16px;min-width:220px;max-width:340px;display:none;';
    document.body.appendChild(popup);
    document.addEventListener('click', function() {
      var p = document.getElementById('wl-popup'); if (p) p.style.display = 'none';
    });
  }
  var html = '<div style="font-size:11px;font-weight:700;color:var(--txt3);margin-bottom:8px;letter-spacing:.4px;">📋 สรุปภาระงาน · ' + esc(data.name) + '</div>';
  if (!data.projs.length) {
    html += '<div style="font-size:12px;color:#06d6a0;font-weight:700;">✅ ว่างทั้งเดือน</div>';
  } else {
    data.projs.forEach(function(sp) {
      var periods = sp.periods || [];
      html += '<div style="padding:6px 0;border-bottom:1px solid var(--border);">' +
        '<div style="font-size:12px;font-weight:700;color:var(--txt);margin-bottom:3px;">● ' + esc(sp.p.name) + '</div>';
      if (periods.length > 1) {
        periods.forEach(function(per, idx) {
          html += '<div style="font-size:11px;color:var(--txt3);padding-left:12px;">ช่วงที่ ' + (idx+1) + ': ' + fd(per.s) + ' – ' + fd(per.e) + '</div>';
        });
      } else if (periods.length === 1) {
        html += '<div style="font-size:11px;color:var(--txt3);padding-left:12px;">' + fd(periods[0].s) + ' – ' + fd(periods[0].e) + '</div>';
      } else {
        var ps = sp.p.start, pe = sp.p.end;
        html += '<div style="font-size:11px;color:var(--txt3);padding-left:12px;">' + (ps ? fd(ps) : '—') + ' – ' + (pe ? fd(pe) : '—') + '</div>';
      }
      html += '</div>';
    });
  }
  popup.innerHTML = html;
  popup.style.display = 'block';
  var vw = window.innerWidth, vh = window.innerHeight;
  var x = e.clientX + 10, y = e.clientY + 10;
  popup.style.left = '0'; popup.style.top = '0';
  var pw = popup.offsetWidth || 260, ph = popup.offsetHeight || 160;
  if (x + pw > vw - 8) x = e.clientX - pw - 10;
  if (y + ph > vh - 8) y = e.clientY - ph - 10;
  popup.style.left = Math.max(8, x) + 'px';
  popup.style.top  = Math.max(8, y) + 'px';
};

// ── Popup ──
window.wlCellClick = function(e, projsStr, dateLabel, isFree) {
  e.stopPropagation();
  var popup = document.getElementById('wl-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'wl-popup';
    popup.style.cssText = 'position:fixed;z-index:9999;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.18);padding:14px 16px;min-width:200px;max-width:320px;display:none;';
    document.body.appendChild(popup);
    document.addEventListener('click', function() {
      var p = document.getElementById('wl-popup');
      if (p) p.style.display = 'none';
    });
  }
  var projs = projsStr ? projsStr.split('||') : [];
  var html = '<div style="font-size:11px;font-weight:700;color:var(--txt3);margin-bottom:8px;letter-spacing:.4px;">' + esc(dateLabel) + '</div>';
  if (isFree === '1') {
    html += '<div style="display:flex;align-items:center;gap:8px;color:#06d6a0;font-size:13px;font-weight:700;">✅ ว่าง</div>';
  } else {
    projs.forEach(function(name) {
      html += '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:' + (projs.length > 1 ? '#ff6b6b' : '#4361ee') + ';flex-shrink:0;"></span>' +
        '<span style="font-size:12px;font-weight:600;color:var(--txt);">' + esc(name) + '</span></div>';
    });
    if (projs.length > 1) {
      html += '<div style="margin-top:6px;font-size:10px;color:#ff6b6b;font-weight:700;">⚠ งานซ้อนกัน ' + projs.length + ' โครงการ</div>';
    }
  }
  popup.innerHTML = html;
  popup.style.display = 'block';
  var vw = window.innerWidth, vh = window.innerHeight;
  var x = e.clientX + 10, y = e.clientY + 10;
  popup.style.left = '0'; popup.style.top = '0';
  var pw = popup.offsetWidth || 220, ph = popup.offsetHeight || 120;
  if (x + pw > vw - 8) x = e.clientX - pw - 10;
  if (y + ph > vh - 8) y = e.clientY - ph - 10;
  popup.style.left = Math.max(8, x) + 'px';
  popup.style.top  = Math.max(8, y) + 'px';
};

window.wlNav = function(d) {
  window.wlM += d;
  if (window.wlM > 11) { window.wlM = 0; window.wlY++; }
  if (window.wlM < 0)  { window.wlM = 11; window.wlY--; }
  window.renderWorkload();
};

window.renderWorkload = function() {
  var statsEl   = document.getElementById('wl-stats');
  var headEl    = document.getElementById('wl-head');
  var grid      = document.getElementById('wl-grid');
  var deptSel   = document.getElementById('wl-dept-filter');
  if (!grid) return;

  var lbl = document.getElementById('wl-lbl');
  if (lbl) lbl.textContent = window.THMON[window.wlM] + ' ' + (window.wlY + 543);

  // ── populate dept filter ──
  if (deptSel && deptSel.options.length <= 1) {
    (window.DEPT_LIST || []).forEach(function(d) {
      var o = document.createElement('option');
      o.value = d.label; o.textContent = d.label;
      deptSel.appendChild(o);
    });
  }
  var deptFilt = deptSel ? deptSel.value : '';

  var monthStart = new Date(window.wlY, window.wlM, 1);
  var monthEnd   = new Date(window.wlY, window.wlM + 1, 0, 23, 59, 59);
  var dim = monthEnd.getDate();

  var now = new Date();
  var isNow = now.getFullYear() === window.wlY && now.getMonth() === window.wlM;
  var todayD = isNow ? now.getDate() : -1;

  var days = [];
  for (var d = 1; d <= dim; d++) {
    var dow = new Date(window.wlY, window.wlM, d).getDay();
    days.push({ d: d, dow: dow, we: dow === 0 || dow === 6 });
  }
  var workdays = days.filter(function(d) { return !d.we; }).length;

  // ── คำนวณข้อมูลต่อคน ──
  var staffRows = [];
  var cntOverload = 0, cntActive = 0, cntAvail = 0, cntOverlap = 0;

  (window.STAFF || []).filter(function(s) { return s.active !== false; }).forEach(function(s, gi) {
    var projs = [];
    (window.PROJECTS || []).forEach(function(p) {
      if (p.status === 'cancelled' || p.status === 'completed') return;
      // ── periods จาก visits (ถ้ามี) ──
      var visitPeriods = [];
      if (p.visits && p.visits.length > 0) {
        p.visits.forEach(function(v) {
          var vm = window._vtMember(v.team, s.id, v.start, v.end);
          if (vm && vm.s && vm.e) {
            visitPeriods.push({ sid: s.id, s: vm.s, e: vm.e });
          }
        });
      }
      // ── periods จาก members/team ──
      var mems = (p.members && p.members.length > 0)
        ? p.members
        : (p.team || []).map(function(id) { return { sid: id, s: p.start, e: p.end }; });
      var memberPeriods = mems.filter(function(m) { return m.sid === s.id && m.s && m.e; });
      // ใช้ visitPeriods ถ้ามี ไม่งั้น fallback ไป memberPeriods
      var mine = visitPeriods.length > 0 ? visitPeriods : memberPeriods;
      if (!mine.length) return;
      var ms = new Date(Math.min.apply(null, mine.map(function(m) { return pd(m.s).getTime(); })));
      var me = new Date(Math.max.apply(null, mine.map(function(m) { var dt = pd(m.e); dt.setHours(23,59,59); return dt.getTime(); })));
      if (ms <= monthEnd && me >= monthStart) projs.push({ p: p, s: ms, e: me, periods: mine });
    });

    var dayCount = new Array(dim + 2).fill(0);
    var dayProjs = {};
    projs.forEach(function(sp) {
      // ใช้แต่ละ period แยกกัน เพื่อไม่ให้ช่วงว่างระหว่าง period ถูกนับว่ามีงาน
      var segs = (sp.periods && sp.periods.length > 0)
        ? sp.periods.map(function(per) {
            var ps = pd(per.s); ps.setHours(0,0,0,0);
            var pe = pd(per.e); pe.setHours(23,59,59,999);
            return { s: ps, e: pe };
          })
        : [{ s: sp.s, e: sp.e }];
      segs.forEach(function(seg) {
        if (seg.s > monthEnd || seg.e < monthStart) return;
        var sd = seg.s < monthStart ? 1 : seg.s.getDate();
        var ed = seg.e > monthEnd   ? dim : seg.e.getDate();
        for (var dd = sd; dd <= ed; dd++) {
          dayCount[dd]++;
          if (!dayProjs[dd]) dayProjs[dd] = [];
          if (!dayProjs[dd].includes(sp.p.name)) dayProjs[dd].push(sp.p.name);
        }
      });
    });

    var busyDays   = days.filter(function(d) { return !d.we && dayCount[d.d] > 0; }).length;
    var hasOverlap = days.some(function(d) { return dayCount[d.d] >= 2; });
    var busyPct    = workdays > 0 ? Math.round(busyDays / workdays * 100) : 0;

    if (projs.length === 0) cntAvail++;
    else if (projs.length > 3) cntOverload++;
    else cntActive++;
    if (hasOverlap) cntOverlap++;

    window._WL_STAFF_PROJS[s.id] = { name: s.name, projs: projs };
    staffRows.push({ s: s, gi: gi, projs: projs, dayCount: dayCount, dayProjs: dayProjs,
                     busyDays: busyDays, busyPct: busyPct, hasOverlap: hasOverlap });
  });

  var totalStaff = staffRows.length;

  // ── จัดกลุ่มตามแผนก ──
  var deptOrder = (window.DEPT_LIST || []).map(function(d) { return d.label; });
  var grouped = {}, noDept = [];
  deptOrder.forEach(function(d) { grouped[d] = []; });
  staffRows.forEach(function(r) {
    if (r.s.dept && grouped[r.s.dept]) grouped[r.s.dept].push(r);
    else noDept.push(r);
  });
  var sortFn = function(a, b) { return b.busyDays - a.busyDays; };
  deptOrder.forEach(function(d) { grouped[d].sort(sortFn); });
  noDept.sort(sortFn);

  var allSections = [];
  deptOrder.forEach(function(d) { if (grouped[d] && grouped[d].length) allSections.push({ label: d, list: grouped[d] }); });
  if (noDept.length) allSections.push({ label: 'ไม่ระบุแผนก', list: noDept });

  // กรองแผนก
  var sections = deptFilt ? allSections.filter(function(s) { return s.label === deptFilt; }) : allSections;

  var CW     = 22;   // px/day
  var NAME_W = 240;  // px ชื่อ
  var SUM_W  = 120;  // px ภาระงาน

  // ── Legend ──
  var legend =
    '<div style="display:flex;align-items:center;gap:10px;margin-left:auto;flex-wrap:wrap;">' +
    [['rgba(6,214,160,.45)','ว่าง'],['#4361ee','มีงาน'],['#ff6b6b','งานซ้อน'],['var(--surface3)','ส–อา']]
    .map(function(t) {
      return '<span style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--txt3);">' +
        '<span style="width:14px;height:10px;border-radius:3px;background:'+t[0]+';display:inline-block;"></span>'+t[1]+'</span>';
    }).join('') + '</div>';

  // ── Stats chip ──
  function chip(icon, label, val, bg, col) {
    return '<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;background:'+bg+';border:1px solid '+col+'33;border-radius:10px;">' +
      '<span style="font-size:14px;">'+icon+'</span>' +
      '<div><div style="font-size:9px;font-weight:700;color:'+col+';letter-spacing:.5px;text-transform:uppercase;">'+label+'</div>' +
      '<div style="font-size:16px;font-weight:800;color:'+col+';line-height:1.1;">'+val+' <span style="font-size:10px;font-weight:600;">คน</span></div></div></div>';
  }

  if (statsEl) {
    statsEl.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;flex-wrap:wrap;">' +
      chip('👥','ทั้งหมด', totalStaff, 'var(--surface2)', 'var(--txt)') +
      chip('🔥','งานมาก',  cntOverload, 'rgba(255,107,107,.07)', '#ff6b6b') +
      chip('💼','มีงาน',   cntActive,   'rgba(67,97,238,.07)',   '#4361ee') +
      chip('✅','ว่าง',     cntAvail,    'rgba(6,214,160,.07)',   '#06d6a0') +
      (cntOverlap > 0 ? chip('⚠️','ซ้อนกัน', cntOverlap, 'rgba(255,107,107,.07)', '#ff6b6b') : '') +
      legend +
      '</div>';
  }

  // ── Day header ──
  if (headEl) {
    headEl.innerHTML =
      '<div style="display:flex;min-width:fit-content;">' +
      '<div style="width:'+NAME_W+'px;flex-shrink:0;padding:5px 14px;font-size:10px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;display:flex;align-items:center;border-right:1px solid var(--border);">พนักงาน / แผนก</div>' +
      '<div style="display:flex;">' +
        days.map(function(day) {
          var isT = day.d === todayD;
          return '<div style="width:'+CW+'px;flex-shrink:0;text-align:center;padding:4px 0;box-sizing:border-box;' +
            (day.we ? 'background:var(--surface2);' : '') +
            (isT    ? 'background:rgba(255,166,43,.18);' : '') + '">' +
            '<div style="font-size:7px;color:var(--txt3);line-height:1.2;">'+_WD[day.dow]+'</div>' +
            '<div style="font-size:9px;font-weight:'+(isT?'800':'600')+';color:'+(isT?'var(--amber)':day.we?'var(--txt3)':'var(--txt2)')+';">'+day.d+'</div>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<div style="width:'+SUM_W+'px;flex-shrink:0;padding:5px 14px;font-size:10px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;display:flex;align-items:center;justify-content:flex-end;border-left:1px solid var(--border);">ภาระงาน</div>' +
      '</div>';
  }

  // ── Staff row ──
  function staffRowHtml(r) {
    var s = r.s;
    var initials = s.name.split(' ').map(function(w) { return w.charAt(0); }).join('').substring(0,2).toUpperCase();
    var displayName = esc(s.name) + (s.nickname ? ' <span style="color:var(--txt3);font-weight:500;">('+esc(s.nickname)+')</span>' : '');

    var cells = days.map(function(day) {
      var cnt = r.dayCount[day.d];
      var isT = day.d === todayD;
      var bg, cursor = 'default', isFree = '0';
      if (day.we) {
        bg = 'background:var(--surface2);';
      } else if (cnt === 0) {
        bg = 'background:rgba(6,214,160,.18);';
        isFree = '1'; cursor = 'pointer';
      } else if (cnt === 1) {
        bg = 'background:#4361ee;'; cursor = 'pointer';
      } else {
        bg = 'background:#ff6b6b;'; cursor = 'pointer';
      }
      var bdr = isT ? 'box-shadow:inset 0 0 0 2px var(--amber);' : '';
      var dateLabel = day.d + ' ' + _WL_THMON_S[window.wlM];
      if (!day.we) {
        var projsEncoded = r.dayProjs[day.d] ? r.dayProjs[day.d].join('||') : '';
        return '<div style="width:'+CW+'px;flex-shrink:0;height:32px;'+bg+bdr+'cursor:'+cursor+';" ' +
          'onclick="window.wlCellClick(event,\''+projsEncoded.replace(/'/g,'&#39;')+'\',\''+esc(dateLabel)+'\',\''+isFree+'\')"></div>';
      }
      return '<div style="width:'+CW+'px;flex-shrink:0;height:32px;'+bg+bdr+'"></div>';
    }).join('');

    var projCount = r.projs.length;
    var statusClr = projCount === 0 ? '#06d6a0' : projCount > 3 ? '#ff6b6b' : '#4361ee';
    var statusTxt = projCount === 0 ? 'ว่าง' : projCount + ' งาน';
    var olBadge   = r.hasOverlap ? '<span style="font-size:8px;font-weight:700;color:#fff;background:#ff6b6b;padding:1px 5px;border-radius:4px;margin-left:4px;">⚠ซ้อน</span>' : '';

    return '<div style="display:flex;align-items:stretch;border-bottom:1px solid var(--border);transition:background .15s;min-width:fit-content;" onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'\'">' +
      '<div style="width:'+NAME_W+'px;flex-shrink:0;padding:6px 14px;display:flex;align-items:center;gap:10px;border-right:1px solid var(--border);cursor:pointer;" onclick="window.wlStaffClick(event,\''+esc(s.id)+'\')">' +
        '<div style="width:30px;height:30px;border-radius:9px;background:'+avC(r.gi)+';color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">'+initials+'</div>' +
        '<div style="min-width:0;">' +
          '<div style="font-size:12px;font-weight:700;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="'+esc(s.name+(s.nickname?' ('+s.nickname+')':''))+'">'+displayName+'</div>' +
          '<div style="font-size:10px;color:var(--txt3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(s.role||'—')+'</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:stretch;">'+cells+'</div>' +
      '<div style="width:'+SUM_W+'px;flex-shrink:0;padding:6px 14px;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;border-left:1px solid var(--border);">' +
        '<div style="font-size:13px;font-weight:800;color:'+statusClr+';">'+statusTxt+olBadge+'</div>' +
        (r.busyDays > 0
          ? '<div style="font-size:10px;color:var(--txt3);margin-top:1px;">'+r.busyDays+'/'+workdays+' วัน · '+r.busyPct+'%</div>'
          : '<div style="font-size:10px;color:#06d6a0;">พร้อมรับงาน</div>') +
      '</div>' +
    '</div>';
  }

  // ── Dept section ──
  function deptSectionHtml(label, list, di) {
    var dFree = list.filter(function(r) { return r.projs.length === 0; }).length;
    var dOver = list.filter(function(r) { return r.hasOverlap; }).length;
    return '<div>' +
      '<div style="display:flex;align-items:center;gap:8px;padding:7px 14px;background:var(--surface2);border-bottom:1px solid var(--border);border-top:2px solid var(--border);min-width:fit-content;">' +
        '<div style="width:4px;height:14px;border-radius:2px;background:'+avC(di*2)+';flex-shrink:0;"></div>' +
        '<span style="font-size:12px;font-weight:700;color:var(--txt);">'+esc(label)+'</span>' +
        '<span style="font-size:10px;background:var(--surface);border:1px solid var(--border);color:var(--txt3);padding:1px 8px;border-radius:10px;">'+list.length+' คน</span>' +
        (dFree>0 ? '<span style="font-size:10px;color:#06d6a0;background:rgba(6,214,160,.1);padding:1px 8px;border-radius:10px;font-weight:600;">✅ ว่าง '+dFree+'</span>' : '') +
        (dOver>0 ? '<span style="font-size:10px;color:#ff6b6b;background:rgba(255,107,107,.1);padding:1px 8px;border-radius:10px;font-weight:600;">⚠ ซ้อน '+dOver+'</span>' : '') +
      '</div>' +
      list.map(function(r) { return staffRowHtml(r); }).join('') +
    '</div>';
  }

  var body = sections.map(function(sec, i) { return deptSectionHtml(sec.label, sec.list, i); }).join('');
  if (!body) body = '<div style="padding:60px;text-align:center;color:var(--txt3);">ไม่มีข้อมูลพนักงาน</div>';

  grid.style.cssText = 'flex:1;overflow:auto;background:var(--bg);';
  grid.innerHTML = '<div style="min-width:fit-content;">' + body + '</div>';

  // ── Sync horizontal scroll ──
  var headWrap = document.getElementById('wl-head-wrap');
  grid.onscroll = function() {
    if (headWrap) headWrap.scrollLeft = grid.scrollLeft;
  };
};

// ══════════════════════════════════════════════════════════════════════════
// สรุปแจ้งงาน — รายงานวันที่ต้อง "เข้าไซต์" ที่ยังไม่ถึง มี 2 มุมมอง: รายคน / รายทีม-โครงการ
// สำหรับคัดลอกข้อความ/บันทึกภาพ ส่งเข้า LINE เอง หรือ Export เป็น Excel (ไม่ยิง API อัตโนมัติ)
// ใช้วันที่เข้าไซต์จริงของแต่ละคน (ต่อ visit/ต่อ member) ไม่ใช่วันเริ่ม-สิ้นสุดของโครงการโดยรวม
// เพราะโครงการเดียวอาจมีหลายรอบเข้าไซต์ (visits) คนละช่วงวันที่กัน ต้องแยกแสดงให้ครบทุกช่วง ──
window._WL_NOTIFY_DATA = {};      // sid -> { staff, projs:[{p,periods}] }
window._WL_NOTIFY_ROWS = [];      // มุมมองรายคน เรียงตามวันที่เข้าไซต์เร็วสุดก่อน
window._WL_NOTIFY_TEAM_ROWS = []; // มุมมองรายทีม/โครงการ: [{p, entries:[{label,s,e,staff:[...]}]}]
window._wlNotifyView = 'staff';
var WL_NOTIFY_COLLAPSE_AT = 4; // คนที่มีงานเกินจำนวนนี้ จะพับซ่อนส่วนเกินไว้ ให้การ์ดไม่ยาวเกินไป

window.openWlNotifyReport = function() {
  var todayD = new Date(); todayD.setHours(0, 0, 0, 0);
  var byStaff = {};
  (window.STAFF || []).filter(function(s) { return s.active !== false; }).forEach(function(s) {
    byStaff[s.id] = { staff: s, projs: [] };
  });
  var teamMap = {}; // pid -> { p, entries: { key -> {label,s,e,staff:[]} } }

  (window.PROJECTS || []).forEach(function(p) {
    if (p.status === 'cancelled' || p.status === 'completed') return;

    Object.keys(byStaff).forEach(function(sid) {
      var periods = [];
      if (p.visits && p.visits.length > 0) {
        p.visits.forEach(function(v, vi) {
          var vm = window._vtMember(v.team, sid, v.start, v.end);
          if (vm && vm.s && vm.e && pd(vm.s) > todayD) {
            periods.push({ s: vm.s, e: vm.e, label: 'รอบ ' + (v.no || (vi + 1)) });
          }
        });
      } else {
        var mems = (p.members && p.members.length > 0) ? p.members : (p.team || []).map(function(id) { return { sid: id, s: p.start, e: p.end }; });
        mems.filter(function(m) { return m.sid === sid && m.s && m.e && pd(m.s) > todayD; }).forEach(function(m) {
          periods.push({ s: m.s, e: m.e, label: '' });
        });
      }
      if (!periods.length) return;
      periods.sort(function(a, b) { return pd(a.s) - pd(b.s); });
      byStaff[sid].projs.push({ p: p, periods: periods });

      // ── รวมเข้ากลุ่ม "รายทีม/โครงการ" — จัดกลุ่มตาม (โครงการ + ช่วงวันที่ + ป้ายรอบ) เพื่อดูว่าไปด้วยกันกับใครบ้าง ──
      if (!teamMap[p.id]) teamMap[p.id] = { p: p, entries: {} };
      periods.forEach(function(per) {
        var key = per.label + '|' + per.s + '|' + per.e;
        if (!teamMap[p.id].entries[key]) teamMap[p.id].entries[key] = { label: per.label, s: per.s, e: per.e, staff: [] };
        teamMap[p.id].entries[key].staff.push(byStaff[sid].staff);
      });
    });
  });

  var rows = Object.keys(byStaff).map(function(sid) { return byStaff[sid]; }).filter(function(r) { return r.projs.length > 0; });
  rows.forEach(function(r) { r.projs.sort(function(a, b) { return pd(a.periods[0].s) - pd(b.periods[0].s); }); });
  rows.sort(function(a, b) { return pd(a.projs[0].periods[0].s) - pd(b.projs[0].periods[0].s); });

  var teamRows = Object.keys(teamMap).map(function(pid) {
    var t = teamMap[pid];
    var entries = Object.keys(t.entries).map(function(k) { return t.entries[k]; });
    entries.forEach(function(en) { en.staff.sort(function(a, b) { return a.name.localeCompare(b.name, 'th'); }); });
    entries.sort(function(a, b) { return pd(a.s) - pd(b.s); });
    return { p: t.p, entries: entries };
  }).filter(function(t) { return t.entries.length > 0; });
  teamRows.sort(function(a, b) { return pd(a.entries[0].s) - pd(b.entries[0].s); });

  window._WL_NOTIFY_DATA = {};
  rows.forEach(function(r) { window._WL_NOTIFY_DATA[r.staff.id] = r; });
  window._WL_NOTIFY_ROWS = rows;
  window._WL_NOTIFY_TEAM_ROWS = teamRows;

  window.wlNotifySetView(window._wlNotifyView || 'staff');
  window.openM('m-wl-notify');
};

// ── สลับมุมมอง รายคน ↔ รายทีม/โครงการ (ใช้ข้อมูลชุดเดียวกันที่คำนวณไว้แล้วตอนเปิด ไม่ต้องคำนวณซ้ำ) ──
window.wlNotifySetView = function(mode) {
  window._wlNotifyView = mode;
  [['wl-notify-tab-staff', 'staff'], ['wl-notify-tab-team', 'team']].forEach(function(pair) {
    var el = document.getElementById(pair[0]);
    if (!el) return;
    var on = mode === pair[1];
    el.style.background = on ? 'var(--violet)' : 'var(--surface2)';
    el.style.color = on ? '#fff' : 'var(--txt2)';
    el.style.border = '1px solid ' + (on ? 'var(--violet)' : 'var(--border)');
  });
  var body = document.getElementById('m-wl-notify-body');
  if (!body) return;
  if (mode === 'team') {
    body.innerHTML = window._WL_NOTIFY_TEAM_ROWS.length
      ? '<div style="display:flex;flex-direction:column;gap:14px;">' + window._WL_NOTIFY_TEAM_ROWS.map(_wlNotifyTeamCardHtml).join('') + '</div>'
      : '<div style="padding:40px;text-align:center;color:var(--txt3);">✅ ไม่มีโครงการที่ยังไม่ถึงวันเข้าไซต์</div>';
  } else {
    body.innerHTML = window._WL_NOTIFY_ROWS.length
      ? '<div style="display:flex;flex-direction:column;gap:14px;">' + window._WL_NOTIFY_ROWS.map(_wlNotifyCardHtml).join('') + '</div>'
      : '<div style="padding:40px;text-align:center;color:var(--txt3);">✅ ไม่มีวันเข้าไซต์ที่ยังไม่ถึง ที่มีทีมงานมอบหมายแล้ว</div>';
  }
};

// ── การ์ดรายคน — ถ้ามีหลายโครงการจนรก จะพับซ่อนส่วนเกินไว้หลัง WL_NOTIFY_COLLAPSE_AT รายการแรก พร้อมป้ายสรุปจำนวน ──
function _wlNotifyProjBlock(sp) {
  var periodsHtml = sp.periods.map(function(per) {
    return '<div style="font-size:12px;color:var(--txt3);margin-top:2px;">📅 ' + (per.label ? esc(per.label) + ' — ' : '') + 'เข้าไซต์ ' + fd(per.s) + ' – ' + fd(per.e) + '</div>';
  }).join('');
  return '<div style="padding:8px 0;border-bottom:1px solid var(--border);">' +
    '<div style="font-size:13px;font-weight:700;color:var(--txt);">📌 ' + esc(sp.p.name) + '</div>' +
    periodsHtml +
  '</div>';
}

function _wlNotifyCardHtml(r) {
  var s = r.staff;
  var initials = s.name.split(' ').map(function(w) { return w.charAt(0); }).join('').substring(0, 2).toUpperCase();
  var many = r.projs.length > WL_NOTIFY_COLLAPSE_AT;
  var visibleProjs = many ? r.projs.slice(0, WL_NOTIFY_COLLAPSE_AT) : r.projs;
  var hiddenProjs = many ? r.projs.slice(WL_NOTIFY_COLLAPSE_AT) : [];
  var visibleHtml = visibleProjs.map(_wlNotifyProjBlock).join('');
  var toggleHtml = many
    ? '<div id="wl-extra-' + esc(s.id) + '" style="display:none;">' + hiddenProjs.map(_wlNotifyProjBlock).join('') + '</div>' +
      '<button class="btn btn-ghost btn-sm wl-notify-toggle-btn" style="width:100%;margin-top:6px;" data-count="' + hiddenProjs.length + '" onclick="window.wlNotifyToggleExtra(\'' + esc(s.id) + '\',this)">▾ แสดงเพิ่มอีก ' + hiddenProjs.length + ' โครงการ</button>'
    : '';
  var totalPeriods = r.projs.reduce(function(n, sp) { return n + sp.periods.length; }, 0);
  var badge = '<span style="font-size:10px;font-weight:700;color:var(--violet);background:rgba(124,92,252,.12);padding:2px 8px;border-radius:10px;white-space:nowrap;">🗂 ' + r.projs.length + ' โครงการ' + (totalPeriods > r.projs.length ? ' · ' + totalPeriods + ' ช่วง' : '') + '</span>';
  return '<div class="wl-notify-card" id="wl-notify-card-' + esc(s.id) + '" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:6px;">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
        '<div style="width:36px;height:36px;border-radius:10px;background:var(--violet);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">' + esc(initials) + '</div>' +
        '<div><div style="font-size:14px;font-weight:800;color:var(--txt);display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' + esc(s.name) + (s.nickname ? ' <span style="color:var(--txt3);font-weight:500;font-size:12px;">(' + esc(s.nickname) + ')</span>' : '') + badge + '</div>' +
        '<div style="font-size:11px;color:var(--txt3);margin-top:2px;">' + esc(s.role || '') + (s.role && s.dept ? ' · ' : '') + esc(s.dept || '') + '</div></div>' +
      '</div>' +
      '<div class="wl-notify-card-actions" style="display:flex;gap:6px;">' +
        '<button class="btn btn-ghost btn-sm" onclick="window.wlNotifyCopy(\'' + esc(s.id) + '\')">📋 คัดลอกข้อความ</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="window.wlNotifySaveImg(\'' + esc(s.id) + '\')">🖼 บันทึกภาพ</button>' +
      '</div>' +
    '</div>' +
    visibleHtml + toggleHtml +
  '</div>';
}

window.wlNotifyToggleExtra = function(sid, btn) {
  var el = document.getElementById('wl-extra-' + sid);
  if (!el) return;
  var show = el.style.display === 'none';
  el.style.display = show ? 'block' : 'none';
  if (btn) btn.textContent = show ? '▴ ซ่อน' : ('▾ แสดงเพิ่มอีก ' + btn.getAttribute('data-count') + ' โครงการ');
};

// ── การ์ดรายทีม/โครงการ — 1 การ์ดต่อโครงการ แสดงว่าแต่ละช่วงวันที่เข้าไซต์มีใครไปด้วยกันบ้าง ──
function _wlNotifyTeamCardHtml(t) {
  var p = t.p;
  var totalPeople = {};
  t.entries.forEach(function(en) { en.staff.forEach(function(s) { totalPeople[s.id] = 1; }); });
  var entriesHtml = t.entries.map(function(en) {
    var names = en.staff.map(function(s) { return esc(s.nickname || s.name); }).join(', ');
    return '<div style="padding:8px 0;border-bottom:1px solid var(--border);">' +
      '<div style="font-size:12px;font-weight:700;color:var(--txt);">📅 ' + (en.label ? esc(en.label) + ' — ' : '') + 'เข้าไซต์ ' + fd(en.s) + ' – ' + fd(en.e) + '</div>' +
      '<div style="font-size:12px;color:var(--txt2);margin-top:3px;">👥 ' + names + '</div>' +
    '</div>';
  }).join('');
  return '<div class="wl-notify-card" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:6px;">' +
      '<div style="font-size:14px;font-weight:800;color:var(--txt);">📁 ' + esc(p.name) + '</div>' +
      '<span style="font-size:10px;font-weight:700;color:var(--violet);background:rgba(124,92,252,.12);padding:2px 8px;border-radius:10px;white-space:nowrap;">👥 ' + Object.keys(totalPeople).length + ' คน · ' + t.entries.length + ' ช่วง</span>' +
    '</div>' +
    entriesHtml +
  '</div>';
}

window.wlNotifyCopy = function(sid) {
  var r = window._WL_NOTIFY_DATA[sid];
  if (!r) return;
  var lines = ['📋 ตารางเข้าไซต์ที่กำลังจะมาถึง — ' + r.staff.name, ''];
  r.projs.forEach(function(sp) {
    lines.push('📌 ' + sp.p.name);
    sp.periods.forEach(function(per) {
      lines.push('📅 ' + (per.label ? per.label + ' — ' : '') + 'เข้าไซต์ ' + fd(per.s) + ' – ' + fd(per.e));
    });
    lines.push('');
  });
  navigator.clipboard.writeText(lines.join('\n').trim()).then(function() {
    window.showAlert && window.showAlert('คัดลอกแล้ว พร้อมวางส่ง LINE', 'success');
  });
};

window.wlNotifySaveImg = async function(sid) {
  if (!window.html2canvas) { window.showAlert && window.showAlert('ยังโหลดไลบรารีสร้างรูปภาพไม่เสร็จ ลองใหม่อีกครั้ง', 'error'); return; }
  var src = document.getElementById('wl-notify-card-' + sid);
  var r = window._WL_NOTIFY_DATA[sid];
  if (!src || !r) return;
  var clone = src.cloneNode(true);
  var actionsEl = clone.querySelector('.wl-notify-card-actions');
  if (actionsEl) actionsEl.remove();
  // บันทึกภาพต้องได้ครบทุกโครงการ ไม่ใช่แค่ส่วนที่พับแสดงอยู่บนจอ — เปิดส่วนที่ซ่อนไว้ก่อนแคป แล้วเอาปุ่ม toggle ออก
  var extraEl = clone.querySelector('[id^="wl-extra-"]');
  if (extraEl) extraEl.style.display = 'block';
  var toggleBtn = clone.querySelector('.wl-notify-toggle-btn');
  if (toggleBtn) toggleBtn.remove();
  clone.style.cssText = 'display:block;position:fixed;top:-100000px;left:0;width:480px;height:auto;background:#fff;padding:20px;';
  document.body.appendChild(clone);
  await new Promise(function(res) { requestAnimationFrame(function() { requestAnimationFrame(res); }); });
  try {
    var capW = clone.scrollWidth, capH = clone.scrollHeight;
    var canvas = await window.html2canvas(clone, { scale: 2, backgroundColor: '#ffffff', width: capW, height: capH, windowWidth: capW, windowHeight: capH });
    var safeName = (r.staff.name || 'staff').replace(/[^a-zA-Z0-9ก-๙]+/g, '_');
    var link = document.createElement('a');
    link.download = 'ตารางงาน_' + safeName + '_' + new Date().toISOString().slice(0, 10) + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (e) {
    window.showAlert && window.showAlert('สร้างรูปภาพไม่สำเร็จ: ' + (e.message || e), 'error');
  } finally {
    document.body.removeChild(clone);
  }
};

// ── Export Excel: 2 ชีท — "รายคน" (ต่อคน/ต่อโครงการ/ต่อช่วง) และ "รายทีม-โครงการ" (ต่อโครงการ/ต่อช่วง พร้อมรายชื่อทีม) ──
function _wlNotifyExcelSheet(wb, headers, rows, sheetName) {
  var ws = XLSX.utils.aoa_to_sheet([headers].concat(rows));
  var range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  for (var c = range.s.c; c <= range.e.c; c++) {
    var addr = XLSX.utils.encode_cell({ r: 0, c: c });
    if (!ws[addr]) continue;
    ws[addr].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '4361EE' } }, alignment: { horizontal: 'center' } };
  }
  ws['!cols'] = headers.map(function(h, i) {
    var max = h.length * 1.5;
    rows.forEach(function(row) { var v = String(row[i] == null ? '' : row[i]); if (v.length > max) max = v.length; });
    return { wch: Math.min(Math.max(max + 2, 8), 60) };
  });
  XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
}

window.wlNotifyExportExcel = function() {
  if (!window.XLSX) { window.showAlert && window.showAlert('ยังโหลด XLSX library ไม่เสร็จ ลองใหม่อีกครั้ง', 'error'); return; }
  var rows = window._WL_NOTIFY_ROWS || [];
  var teamRows = window._WL_NOTIFY_TEAM_ROWS || [];
  if (!rows.length && !teamRows.length) { window.showAlert && window.showAlert('ไม่มีข้อมูลให้ส่งออก', 'error'); return; }

  var wb = XLSX.utils.book_new();

  var staffHeaders = ['ชื่อพนักงาน', 'ชื่อเล่น', 'ตำแหน่ง', 'แผนก', 'โครงการ', 'รอบ/ช่วง', 'วันที่เข้าไซต์', 'วันที่ออกจากไซต์'];
  var staffData = [];
  rows.forEach(function(r) {
    r.projs.forEach(function(sp) {
      sp.periods.forEach(function(per) {
        staffData.push([r.staff.name, r.staff.nickname || '', r.staff.role || '', r.staff.dept || '', sp.p.name, per.label || '-', fd(per.s), fd(per.e)]);
      });
    });
  });
  _wlNotifyExcelSheet(wb, staffHeaders, staffData, 'รายคน');

  var teamHeaders = ['โครงการ', 'รอบ/ช่วง', 'วันที่เข้าไซต์', 'วันที่ออกจากไซต์', 'จำนวนคน', 'ทีมงาน'];
  var teamData = [];
  teamRows.forEach(function(t) {
    t.entries.forEach(function(en) {
      teamData.push([t.p.name, en.label || '-', fd(en.s), fd(en.e), en.staff.length, en.staff.map(function(s) { return s.nickname || s.name; }).join(', ')]);
    });
  });
  _wlNotifyExcelSheet(wb, teamHeaders, teamData, 'รายทีม-โครงการ');

  XLSX.writeFile(wb, 'สรุปแจ้งงานเข้าไซต์_' + new Date().toISOString().slice(0, 10) + '.xlsx');
};
