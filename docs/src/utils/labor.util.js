/**
 * labor.util.js — Labor Cost & Allowance Calculation Utilities
 */
(function () {

  // ── Daily Rate by Staff ──
  window.getStaffDailyRate = function (staffId) {
    var s = window.STAFF.find(function (x) { return x.id === staffId; });
    if (!s) return 0;
    if (s.dailyRate != null && s.dailyRate > 0) return s.dailyRate;
    var pos = window.POSITIONS.find(function (p) { return p.label === s.role; });
    return pos ? pos.dailyRate : 0;
  };

  // ── Allowance Rate (border / holiday) ──
  window.getAllowanceRate = function (isBorder, isHoliday) {
    var st = window.SETTINGS;
    if (isBorder) return isHoliday ? st.allowance_holiday_border : st.allowance_weekday_border;
    return isHoliday ? st.allowance_holiday_normal : st.allowance_weekday_normal;
  };

  // ── Staff Overlap Detection (ใช้กับ Project booking) ──
  window.getStaffOverlaps = function (sid, startStr, endStr, excludePid) {
    if (!startStr || !endStr) return [];
    var sDate = window.pd(startStr), eDate = window.pd(endStr);
    eDate.setHours(23,59,59);
    var overlaps = [];
    window.PROJECTS.forEach(function (p) {
      if (p.status === 'cancelled' || p.status === 'completed') return;
      if (excludePid && p.id === excludePid) return;
      var mems = (p.members && p.members.length > 0) ? p.members : p.team.map(function (id) { return { sid:id, s:p.start, e:p.end }; });
      mems.filter(function (m) { return m.sid === sid; }).forEach(function (mb) {
        if (mb.s && mb.e) {
          var ms = window.pd(mb.s), me = window.pd(mb.e);
          me.setHours(23,59,59);
          if (ms <= eDate && me >= sDate) overlaps.push({ project:p, from:ms>sDate?ms:sDate, to:me<eDate?me:eDate });
        }
      });
    });
    var seen = {};
    return overlaps.filter(function (o) { if (seen[o.project.id]) return false; seen[o.project.id] = true; return true; });
  };

  // ── Overlap Warning Text ──
  window.overlapWarnText = function (overlaps) {
    if (!overlaps || !overlaps.length) return '';
    return overlaps.map(function (o) {
      return '⚠ มีงานอื่นซ้อนทับ: ' + window.esc(o.project.name) + ' (' + window.fd(o.from.toISOString().slice(0,10)) + ' – ' + window.fd(o.to.toISOString().slice(0,10)) + ')';
    }).join('<br>');
  };

  // ── Staff Leave Conflicts ──
  window.getStaffLeaveConflicts = function (sid, startStr, endStr) {
    if (!startStr || !endStr || !window.LEAVES) return [];
    var sDate = window.pd(startStr), eDate = window.pd(endStr);
    eDate.setHours(23,59,59);
    var LEAVE_EMOJI  = { sick:'🤒', vacation:'🏖', personal:'📋', maternity:'🤱', ordain:'🙏', other:'📝' };
    var LEAVE_LABEL  = { sick:'ลาป่วย', vacation:'ลาพักร้อน', personal:'ลากิจ', maternity:'ลาคลอด', ordain:'ลาบวช', other:'อื่นๆ' };
    return window.LEAVES.filter(function (lv) {
      if (lv.staffId !== sid || lv.status === 'rejected') return false;
      if (!lv.startDate || !lv.endDate) return false;
      var ls = window.pd(lv.startDate), le = window.pd(lv.endDate);
      le.setHours(23,59,59);
      return ls <= eDate && le >= sDate;
    }).map(function (lv) {
      return { leave:lv, emoji:LEAVE_EMOJI[lv.leaveType]||'📝', label:LEAVE_LABEL[lv.leaveType]||lv.leaveType };
    });
  };

})();
