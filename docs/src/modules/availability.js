// ── TEAM AVAILABILITY ──
const { esc, fd, pd, avC } = window;

// ── helpers ──
function _ds(d) {
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function _todayStr() { return _ds(new Date()); }
function _addDays(str, n) { var d = pd(str); d.setDate(d.getDate()+n); return _ds(d); }
function _weeks(days) {
  if (days <= 0) return '0 สัปดาห์';
  var w = days / 5;
  if (w < 1) return days + ' วัน';
  return w % 1 === 0 ? w + ' สัปดาห์' : w.toFixed(1) + ' สัปดาห์';
}

var _THMON_S = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

// แปลง dateStr เป็น "5 เม.ย." หรือ "5 เม.ย. 68"
function _dmon(str, showYear) {
  var d = pd(str);
  var s = d.getDate()+' '+_THMON_S[d.getMonth()];
  if (showYear) s += ' '+(d.getFullYear()+543).toString().slice(2);
  return s;
}

// จัดกลุ่มวันว่างที่ติดกัน (เว้นวันหยุด ส-อา) → [{start, end, days}]
// วิธี: loop ทุก จ-ศ ใน range ถ้าวันนั้นอยู่ใน freeSet → extend range, ไม่อยู่ → ปิด range
function _toDateRanges(freeSet, startStr, endStr) {
  var ranges = [], rStart = null, rEnd = null, rDays = 0;
  var cur = pd(startStr), e = pd(endStr); e.setHours(23,59,59);
  while (cur <= e) {
    var dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      var ds = _ds(cur);
      if (freeSet.has(ds)) {
        if (!rStart) rStart = ds;
        rEnd = ds; rDays++;
      } else {
        if (rStart) { ranges.push({ start:rStart, end:rEnd, days:rDays }); rStart=null; rEnd=null; rDays=0; }
      }
    }
    cur.setDate(cur.getDate()+1);
  }
  if (rStart) ranges.push({ start:rStart, end:rEnd, days:rDays });
  return ranges;
}

// แสดงช่วงวันเป็น string: "1–15 เม.ย.", "28 มี.ค. – 5 เม.ย."
function _fmtRange(r) {
  var ds = pd(r.start), de = pd(r.end);
  if (r.start === r.end) return _dmon(r.start);
  if (ds.getMonth() === de.getMonth() && ds.getFullYear() === de.getFullYear()) {
    return ds.getDate()+'–'+de.getDate()+' '+_THMON_S[ds.getMonth()];
  }
  return _dmon(r.start)+' – '+_dmon(r.end);
}

// คำนวณ workdays + company holidays ในช่วง
function _calcAvailability(sid, startStr, endStr) {
  var zero = { totalDays:0, freeDays:0, busyDays:0, leaveDays:0, wlDays:0, holDays:0, busyProjects:[], leaveInfo:[], wlInfo:[] };
  if (!startStr || !endStr) return zero;
  var s = pd(startStr), e = pd(endStr); e.setHours(23,59,59);
  if (s > e) return zero;

  // สร้าง set วันทำงาน (จ-ศ) แยก company holiday ออก
  var workSet = new Set(), holSet = new Set();
  var cur = new Date(s);
  while (cur <= e) {
    var dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      var ds = _ds(cur);
      var hol = (window.HOLIDAYS || []).find(function(h) { return h.date === ds; });
      if (hol && (hol.type === 'company' || hol.type === 'both')) holSet.add(ds);
      else workSet.add(ds);
    }
    cur.setDate(cur.getDate()+1);
  }

  // วันติดงานจาก PROJECTS
  var projBusySet = new Set(), busyProjects = [];
  (window.PROJECTS || []).forEach(function(proj) {
    if (!proj.start || !proj.end || proj.status === 'cancelled') return;
    var mems = (proj.members && proj.members.length > 0)
      ? proj.members
      : (proj.team || []).map(function(id) { return { sid:id, s:proj.start, e:proj.end }; });
    var myMems = mems.filter(function(m) { return m.sid === sid; });
    if (!myMems.length) return;
    var projDayCount = 0;
    myMems.forEach(function(m) {
      var ms = m.s || proj.start, me2 = m.e || proj.end;
      if (!ms || !me2) return;
      var ps = pd(ms), pe = pd(me2); pe.setHours(23,59,59);
      var c = new Date(Math.max(ps.getTime(), s.getTime()));
      var end2 = new Date(Math.min(pe.getTime(), e.getTime()));
      while (c <= end2) {
        var dow2 = c.getDay();
        if (dow2 !== 0 && dow2 !== 6) {
          var ds2 = _ds(c);
          if (workSet.has(ds2) && !projBusySet.has(ds2)) { projBusySet.add(ds2); projDayCount++; }
        }
        c.setDate(c.getDate()+1);
      }
    });
    if (projDayCount > 0) busyProjects.push({ proj:proj, days:projDayCount });
  });

  // วันลา
  var leaveBusySet = new Set(), leaveInfo = [];
  if (window.getStaffLeaveConflicts) {
    window.getStaffLeaveConflicts(sid, startStr, endStr)
      .filter(function(x) { return x.leave.status !== 'rejected'; })
      .forEach(function(x) {
        var lv = x.leave;
        var ls = pd(lv.startDate), le2 = pd(lv.endDate); le2.setHours(23,59,59);
        var c = new Date(Math.max(ls.getTime(), s.getTime()));
        var end2 = new Date(Math.min(le2.getTime(), e.getTime()));
        var lvDays = 0;
        while (c <= end2) {
          var dow2 = c.getDay();
          if (dow2 !== 0 && dow2 !== 6) {
            var ds2 = _ds(c);
            if (workSet.has(ds2) && !projBusySet.has(ds2) && !leaveBusySet.has(ds2)) {
              leaveBusySet.add(ds2); lvDays++;
            }
          }
          c.setDate(c.getDate()+1);
        }
        if (lvDays > 0) leaveInfo.push({ days:lvDays, start:lv.startDate, end:lv.endDate, status:lv.status });
      });
  }

  // วันติดงานจาก WORK_LOGS
  var wlBusySet = new Set(), wlInfo = [];
  (window.WORK_LOGS||[]).forEach(function(wl){
    var wlStart, wlEnd;
    if(wl.scope==='personal' && wl.staffId===sid){
      wlStart = wl.type==='daily' ? wl.date : wl.startDate;
      wlEnd   = wl.type==='daily' ? wl.date : wl.endDate;
    } else if(wl.scope==='group'){
      var pt = (wl.participants||[]).find(function(p){ return p.sid===sid; });
      if(pt){ wlStart = pt.s||(wl.type==='daily'?wl.date:wl.startDate); wlEnd = pt.e||(wl.type==='daily'?wl.date:wl.endDate); }
    }
    if(!wlStart||!wlEnd) return;
    var ws2 = pd(wlStart), we2 = pd(wlEnd); we2.setHours(23,59,59);
    var c2  = new Date(Math.max(ws2.getTime(), s.getTime()));
    var end2= new Date(Math.min(we2.getTime(), e.getTime()));
    var dayCount = 0;
    while(c2 <= end2){
      var dow2 = c2.getDay();
      if(dow2!==0&&dow2!==6){ var ds2=_ds(c2); if(workSet.has(ds2)&&!projBusySet.has(ds2)&&!leaveBusySet.has(ds2)&&!wlBusySet.has(ds2)){ wlBusySet.add(ds2); dayCount++; } }
      c2.setDate(c2.getDate()+1);
    }
    if(dayCount>0) wlInfo.push({days:dayCount, title:wl.title, start:wlStart, end:wlEnd, category:wl.category});
  });

  var totalBusy = new Set([...projBusySet, ...leaveBusySet, ...wlBusySet]);
  var freeSet = new Set([...workSet].filter(function(d) { return !totalBusy.has(d); }));
  return {
    totalDays: workSet.size, freeDays: freeSet.size,
    busyDays: projBusySet.size, leaveDays: leaveBusySet.size, wlDays: wlBusySet.size, holDays: holSet.size,
    freeSet: freeSet,
    busyProjects: busyProjects, leaveInfo: leaveInfo, wlInfo: wlInfo,
  };
}

// ── RENDER ──
window.renderAvailability = function() {
  window.teamRenderSubnav && window.teamRenderSubnav();
  var body = document.getElementById('avl-body');
  if (!body) return;

  var startStr = (document.getElementById('avl-start') || {}).value || _todayStr();
  var endStr   = (document.getElementById('avl-end')   || {}).value || _addDays(_todayStr(), 29);
  var deptFilter = (document.getElementById('avl-dept') || {}).value || '';

  if (!startStr || !endStr || pd(startStr) > pd(endStr)) {
    body.innerHTML = '<div style="text-align:center;color:var(--txt3);padding:60px;font-size:14px;">⚠ กรุณาเลือกช่วงวันที่ให้ถูกต้อง</div>';
    return;
  }

  var staffList = (window.STAFF || []).filter(function(s) {
    if (s.active === false) return false;
    if (deptFilter && s.dept !== deptFilter) return false;
    return true;
  });

  // คำนวณ availability ทุกคน
  var results = staffList.map(function(s, i) {
    return { s:s, i:i, info:_calcAvailability(s.id, startStr, endStr) };
  }).sort(function(a, b) { return b.info.freeDays - a.info.freeDays; });

  var fullyFree = results.filter(function(r) { return r.info.freeDays > 0 && r.info.freeDays === r.info.totalDays; });
  var partial   = results.filter(function(r) { return r.info.freeDays > 0 && r.info.freeDays < r.info.totalDays; });
  var busy      = results.filter(function(r) { return r.info.freeDays === 0; });
  var rangeDays = results.length > 0 ? results[0].info.totalDays : 0;
  var holDays   = results.length > 0 ? results[0].info.holDays : 0;

  // Summary bar
  var sumEl = document.getElementById('avl-summary');
  if (sumEl) {
    sumEl.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
      '<span style="font-size:12px;color:var(--txt3);">📅 '+fd(startStr)+' – '+fd(endStr)+'</span>' +
      '<span style="font-size:12px;color:var(--txt3);">· <b style="color:var(--txt);">'+rangeDays+'</b> วันทำงาน ('+_weeks(rangeDays)+')'+(holDays?' &nbsp;🏢 หยุดบริษัท '+holDays+' วัน':'')+'</span>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-left:auto;">' +
        '<span style="padding:4px 14px;border-radius:20px;font-size:12px;font-weight:600;background:rgba(6,214,160,.12);color:#06d6a0;">🟢 ว่างทั้งช่วง '+fullyFree.length+' คน</span>' +
        '<span style="padding:4px 14px;border-radius:20px;font-size:12px;font-weight:600;background:rgba(255,166,43,.12);color:var(--amber);">🟡 ว่างบางส่วน '+partial.length+' คน</span>' +
        '<span style="padding:4px 14px;border-radius:20px;font-size:12px;font-weight:600;background:rgba(255,107,107,.12);color:var(--coral);">🔴 ไม่ว่าง '+busy.length+' คน</span>' +
      '</div></div>';
  }

  // Staff row
  function staffRow(r) {
    var s = r.s, info = r.info;
    var freePct = info.totalDays > 0 ? Math.round(info.freeDays / info.totalDays * 100) : 0;
    var initials = s.name.split(' ').map(function(w) { return w.charAt(0); }).join('').substring(0, 2).toUpperCase();
    var isFull = info.freeDays === info.totalDays;
    var isZero = info.freeDays === 0;
    var dotColor = isFull ? '#06d6a0' : isZero ? 'var(--coral)' : 'var(--amber)';
    var barColor = isFull ? '#06d6a0' : isZero ? 'var(--coral)' : 'var(--amber)';
    var numColor = isFull ? '#06d6a0' : isZero ? 'var(--coral)' : 'var(--amber)';

    // ช่วงว่าง
    var freeRanges = !isZero ? _toDateRanges(info.freeSet || new Set(), startStr, endStr) : [];
    var freeRangeHtml = freeRanges.map(function(rng) {
      var tip = rng.days + ' วัน · ' + _fmtRange(rng);
      return '<span style="font-size:10px;background:rgba(6,214,160,.12);color:#06d6a0;border:1px solid rgba(6,214,160,.3);border-radius:6px;padding:2px 9px;white-space:nowrap;font-weight:600;" title="'+tip+'">✓ '+_fmtRange(rng)+(rng.days>1?' <span style="opacity:.7;">('+rng.days+'วัน)</span>':'')+'</span>';
    }).join('');

    // งานที่ติด
    var projTags = info.busyProjects.map(function(bp) {
      var nm = bp.proj.name.length > 22 ? bp.proj.name.substring(0,22)+'…' : bp.proj.name;
      return '<span onclick="event.stopPropagation();window.openProjModal&&window.openProjModal(\''+bp.proj.id+'\')" style="font-size:10px;background:rgba(67,97,238,.1);color:var(--indigo);border:1px solid rgba(67,97,238,.2);border-radius:6px;padding:2px 8px;white-space:nowrap;cursor:pointer;" title="'+esc(bp.proj.name)+' · '+bp.days+' วัน">📁 '+esc(nm)+' <span style="opacity:.7;">'+bp.days+'วัน</span></span>';
    }).join('');
    var leaveTags = info.leaveInfo.map(function(lv) {
      return '<span style="font-size:10px;background:rgba(255,107,107,.1);color:#c0392b;border:1px solid rgba(255,107,107,.2);border-radius:6px;padding:2px 8px;white-space:nowrap;">🏖 ลา <b>'+lv.days+'วัน</b>'+(lv.status==='pending'?' <span style="opacity:.7;">(รอยืนยัน)</span>':'')+'</span>';
    }).join('');
    var wlTags = (info.wlInfo||[]).map(function(w) {
      var nm = w.title.length > 20 ? w.title.substring(0,20)+'…' : w.title;
      return '<span style="font-size:10px;background:rgba(255,166,43,.1);color:#b87800;border:1px solid rgba(255,166,43,.25);border-radius:6px;padding:2px 8px;white-space:nowrap;">📝 '+esc(nm)+' <span style="opacity:.7;">'+w.days+'วัน</span></span>';
    }).join('');

    var bottomRow = [freeRangeHtml, projTags, leaveTags, wlTags].filter(Boolean).join('');

    return '<div style="display:flex;align-items:flex-start;gap:14px;padding:14px 18px;transition:background .15s;" onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'\'">' +
      '<div style="width:40px;height:40px;border-radius:11px;background:'+avC(r.i)+';color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0;margin-top:2px;">'+initials+'</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="display:flex;align-items:center;gap:7px;margin-bottom:1px;">' +
          '<div style="font-size:13px;font-weight:700;color:var(--txt);">'+esc(s.name)+(s.nickname?'<span style="font-size:11px;color:var(--txt3);font-weight:400;"> ('+esc(s.nickname)+')</span>':'')+'</div>' +
          '<div style="width:7px;height:7px;border-radius:50%;background:'+dotColor+';flex-shrink:0;"></div>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--txt3);margin-bottom:8px;">'+esc(s.role||'—')+' · '+esc(s.dept||'—')+'</div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:'+(bottomRow?'7':'0')+'px;">' +
          '<div style="flex:1;height:6px;background:var(--surface3);border-radius:6px;overflow:hidden;"><div style="height:100%;width:'+freePct+'%;background:'+barColor+';border-radius:6px;transition:width .6s;"></div></div>' +
          '<span style="font-size:10px;color:var(--txt3);white-space:nowrap;min-width:28px;text-align:right;">'+freePct+'%</span>' + window.calcTip('วันว่าง ÷ วันทำงานในช่วงที่เลือก × 100\nวันทำงาน = จันทร์–ศุกร์ ที่ไม่ใช่วันหยุดบริษัท\nวันว่าง = วันทำงานที่ไม่ติดโครงการ ไม่ลา และไม่มีงานอื่นที่บันทึกไว้') +
        '</div>' +
        (bottomRow ? '<div style="display:flex;flex-wrap:wrap;gap:5px;">'+bottomRow+'</div>' : '') +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0;min-width:78px;">' +
        '<div style="font-size:22px;font-weight:800;color:'+numColor+';line-height:1;">'+info.freeDays+'</div>' +
        '<div style="font-size:10px;color:var(--txt3);margin-top:1px;">/ '+info.totalDays+' วัน</div>' +
        '<div style="font-size:11px;font-weight:600;color:'+numColor+';margin-top:3px;">'+_weeks(info.freeDays)+'</div>' +
      '</div>' +
    '</div>';
  }

  function section(title, list, accentColor, bgTag) {
    if (!list.length) return '';
    var divider = '<div style="height:1px;background:var(--border);margin:0 18px;"></div>';
    return '<div class="fade" style="margin-bottom:20px;">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;padding:0 2px;">' +
        '<div style="width:4px;height:18px;border-radius:2px;background:'+accentColor+';flex-shrink:0;"></div>' +
        '<div style="font-size:13px;font-weight:700;color:var(--txt);">'+title+'</div>' +
        '<span style="font-size:11px;'+bgTag+';padding:1px 10px;border-radius:20px;">'+list.length+' คน</span>' +
      '</div>' +
      '<div style="background:var(--surface);border:1px solid var(--border);border-radius:13px;overflow:hidden;">' +
        list.map(function(r, i) { return (i > 0 ? divider : '') + staffRow(r); }).join('') +
      '</div></div>';
  }

  body.innerHTML =
    section('ว่างทั้งช่วง', fullyFree, '#06d6a0', 'background:rgba(6,214,160,.12);color:#06d6a0') +
    section('ว่างบางส่วน',  partial,   'var(--amber)', 'background:rgba(255,166,43,.12);color:var(--amber)') +
    section('ไม่ว่าง / ติดงาน', busy, 'var(--coral)', 'background:rgba(255,107,107,.12);color:var(--coral)') +
    (results.length === 0 ? '<div style="text-align:center;color:var(--txt3);padding:60px;font-size:14px;">ไม่พบพนักงาน</div>' : '');
};

// preset quick ranges
window.avlPreset = function(days) {
  var s = document.getElementById('avl-start');
  var e = document.getElementById('avl-end');
  if (!s || !e) return;
  var today = _todayStr();
  s.value = today;
  e.value = _addDays(today, days - 1);
  window.renderAvailability();
};

// dept filter populate
window.avlPopulateDept = function() {
  var sel = document.getElementById('avl-dept');
  if (!sel) return;
  var cur = sel.value;
  sel.innerHTML = '<option value="">🏢 ทุกแผนก</option>' +
    (window.DEPT_LIST || []).map(function(d) {
      return '<option value="'+esc(d.label)+'">'+esc(d.label)+'</option>';
    }).join('');
  sel.value = cur;
};
