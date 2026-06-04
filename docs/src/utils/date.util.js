/**
 * date.util.js — Date Formatting & Calculation Utilities
 * ฟังก์ชันกลางสำหรับจัดการวันที่ทั้งระบบ
 */
(function () {

  // ── Format: Date → Thai date string (DD/MM/YYYY BE) ──
  window.fd = function (s) {
    if (!s) return '-';
    var d = new Date(s);
    if (isNaN(d)) return '-';
    return String(d.getDate()).padStart(2,'0') + '/' +
           String(d.getMonth() + 1).padStart(2,'0') + '/' +
           (d.getFullYear() + 543);
  };

  // ── Parse: ISO string → Date object (safe) ──
  window.pd = function (s) {
    if (!s) return new Date('1970-01-01');
    var p = s.split('-');
    if (p.length === 3) return new Date(p[0], p[1] - 1, p[2]);
    return new Date(s);
  };

  // ── Fiscal Year (Thai: Oct–Sep cycle, returns BE year) ──
  window.getFY = function (dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d)) return '';
    var y = d.getFullYear();
    if (d.getMonth() >= 9) y += 1;
    return y + 543;
  };

  // ── Year BE ──
  window.getYearBE = function (dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d)) return '';
    return d.getFullYear() + 543;
  };

  // ── Count Work Days (exclude weekends & holidays) ──
  window.countWorkDays = function (startStr, endStr) {
    if (!startStr || !endStr) return 0;
    var s = window.pd(startStr), e = window.pd(endStr);
    var count = 0, cur = new Date(s);
    while (cur <= e) {
      var dow = cur.getDay();
      var ds  = cur.getFullYear() + '-' + String(cur.getMonth()+1).padStart(2,'0') + '-' + String(cur.getDate()).padStart(2,'0');
      var isHol = (window.HOLIDAYS || []).some(function (h) { return h.date === ds; });
      if (dow !== 0 && dow !== 6 && !isHol) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  };

  // ── Count Work Days Excluding Leave ──
  window.countWorkDaysExcLeave = function (sid, startStr, endStr) {
    if (!startStr || !endStr) return { workDays:0, leaveDays:0, leaveInfo:[] };
    var baseWork = window.countWorkDays(startStr, endStr);
    if (!sid || !window.getStaffLeaveConflicts) return { workDays:baseWork, leaveDays:0, leaveInfo:[] };
    var leaveConflicts = window.getStaffLeaveConflicts(sid, startStr, endStr)
      .filter(function (x) { return x.leave.status !== 'rejected'; });
    if (!leaveConflicts.length) return { workDays:baseWork, leaveDays:0, leaveInfo:[] };
    var sD = window.pd(startStr), eD = window.pd(endStr);
    eD.setHours(23,59,59);
    var leaveWorkDates = new Set();
    leaveConflicts.forEach(function (x) {
      var lv = x.leave;
      var ls = window.pd(lv.startDate), le = window.pd(lv.endDate);
      le.setHours(23,59,59);
      var cur = new Date(Math.max(ls.getTime(), sD.getTime()));
      var end = new Date(Math.min(le.getTime(), eD.getTime()));
      while (cur <= end) {
        var dow = cur.getDay();
        var ds  = cur.getFullYear() + '-' + String(cur.getMonth()+1).padStart(2,'0') + '-' + String(cur.getDate()).padStart(2,'0');
        var isHol = (window.HOLIDAYS || []).some(function (h) { return h.date === ds; });
        if (dow !== 0 && dow !== 6 && !isHol) leaveWorkDates.add(ds);
        cur.setDate(cur.getDate() + 1);
      }
    });
    var leaveDays = leaveWorkDates.size;
    return { workDays:Math.max(0, baseWork - leaveDays), leaveDays:leaveDays, leaveInfo:leaveConflicts };
  };

  // ── Count Labor Days with Holiday & Leave info ──
  window.countLaborDaysInfo = function (sid, startStr, endStr) {
    if (!startStr || !endStr) return { workDays:0, holidayDays:0, leaveDays:0 };
    var s = window.pd(startStr), e = window.pd(endStr);
    var workSet = new Set(), holSet = new Set();
    var cur = new Date(s);
    while (cur <= e) {
      var dow = cur.getDay();
      if (dow !== 0 && dow !== 6) {
        var ds  = cur.getFullYear() + '-' + String(cur.getMonth()+1).padStart(2,'0') + '-' + String(cur.getDate()).padStart(2,'0');
        var hol = (window.HOLIDAYS || []).find(function (h) { return h.date === ds; });
        if (hol && (hol.type === 'company' || hol.type === 'both')) holSet.add(ds);
        else workSet.add(ds);
      }
      cur.setDate(cur.getDate() + 1);
    }
    var leaveDays = 0;
    if (sid && window.getStaffLeaveConflicts) {
      var sD = window.pd(startStr), eD = window.pd(endStr);
      eD.setHours(23,59,59);
      window.getStaffLeaveConflicts(sid, startStr, endStr)
        .filter(function (x) { return x.leave.status !== 'rejected'; })
        .forEach(function (x) {
          var lv = x.leave, ls = window.pd(lv.startDate), le = window.pd(lv.endDate);
          le.setHours(23,59,59);
          var c = new Date(Math.max(ls.getTime(), sD.getTime()));
          var end2 = new Date(Math.min(le.getTime(), eD.getTime()));
          while (c <= end2) {
            var d2 = c.getDay(), ds2 = c.getFullYear() + '-' + String(c.getMonth()+1).padStart(2,'0') + '-' + String(c.getDate()).padStart(2,'0');
            if (d2 !== 0 && d2 !== 6 && workSet.has(ds2)) { workSet.delete(ds2); leaveDays++; }
            c.setDate(c.getDate() + 1);
          }
        });
    }
    return { workDays:workSet.size, holidayDays:holSet.size, leaveDays:leaveDays };
  };

  // ── Get Project Periods (visits or main period) ──
  window.getProjPeriods = function (proj) {
    if (!proj) return [];
    var visits = (proj.visits || []).filter(function (v) { return v.start && v.end; });
    if (visits.length) return visits.slice().sort(function (a,b) { return (a.start||'').localeCompare(b.start||''); }).map(function (v) { return { s:v.start, e:v.end, label:v.purpose||'' }; });
    if (proj.start || proj.end) return [{ s:proj.start||'', e:proj.end||'' }];
    return [];
  };

})();
