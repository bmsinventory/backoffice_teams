/**
 * server-request.config.js — ใบขอใช้งานทีม Server: ค่าคงที่ที่ใช้ร่วมกันระหว่างแอป (โมดูล server_request)
 * และหน้า public docs/server-request.html — ห้ามอ้าง window.* อื่นของแอปในไฟล์นี้ (หน้า public โหลดไฟล์นี้เดี่ยว ๆ)
 */
(function () {

  // ── สถานะคำขอ (ลำดับ = ลำดับแท็บกรองในแอป) ──
  window.SRV_STATUS = {
    pending:   { label: 'รออนุมัติ',          color: '#c9820c', icon: 'hourglass' },
    approved:  { label: 'อนุมัติแล้ว · รอจัดคน', color: '#4361ee', icon: 'circle-check' },
    scheduled: { label: 'จัดคนแล้ว',           color: '#7c5cfc', icon: 'calendar-check' },
    done:      { label: 'เสร็จสิ้น',            color: '#0f9d6e', icon: 'flag' },
    rejected:  { label: 'ไม่อนุมัติ',           color: '#e5484d', icon: 'circle-x' },
    cancelled: { label: 'ยกเลิก',              color: '#8a90a0', icon: 'ban' },
  };

  // ── ชนิดตัวเลือกบนฟอร์ม (ตาราง server_request_options.kind) ──
  //   multi = เลือกได้หลายข้อ (checkbox) · required = บังคับเลือกบนฟอร์ม public
  window.SRV_OPTION_KINDS = [
    { kind: 'work_mode', label: 'ประเภทการทำงาน',            multi: false, required: true  },
    { kind: 'db_type',   label: 'ประเภทฐานข้อมูล',            multi: false, required: true  },
    { kind: 'task',      label: 'รายละเอียดที่ต้องการให้ทำ',      multi: true,  required: true  },
    { kind: 'phase',     label: 'ช่วงที่ต้องการใช้งาน',          multi: false, required: false },
  ];

  window.srvUid = function (prefix) { return (prefix || 'SR') + Date.now() + Math.floor(Math.random() * 1000); };

  // ── เลขที่คำขอ: SRV + ปี พ.ศ. 2 หลัก + เดือน + ลำดับ 3 หลัก (เช่น SRV6910001) ──
  window.srvReqNoPrefix = function (d) {
    d = d || new Date();
    return 'SRV' + String((d.getFullYear() + 543) % 100).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0');
  };
  window.srvNextReqNo = function (existingNos, d) {
    var prefix = window.srvReqNoPrefix(d), max = 0;
    (existingNos || []).forEach(function (no) {
      if (String(no || '').indexOf(prefix) !== 0) return;
      var n = parseInt(String(no).slice(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return prefix + String(max + 1).padStart(3, '0');
  };

  // ── วันที่ YYYY-MM-DD (เวลาเครื่อง) ──
  window.srvIso = function (d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  /**
   * นับคนว่างของทีมรายวัน — ใช้ทั้งในแอป (ตอนจัดคน) และหน้า public (ปฏิทินวันว่าง)
   * input: { staffIds:[], projects:[{status, start, end, members:[{sid,s,e}], team:[]}],
   *          leaves:[{staffId,status,startDate,endDate}], holidays:['YYYY-MM-DD'], from, to,
   *          reserved:[{s,e,n}] = คำขอที่อนุมัติแล้วแต่ยังไม่ระบุตัวคน (กันไว้ n คน) }
   * output: { 'YYYY-MM-DD': { free: n, total: n, busy: { sid: 'proj'|'leave' }, why: { sid: [ข้อความ] }, reserved: n, holiday: bool, weekend: bool } }
   */
  window.srvTeamFreeByDay = function (o) {
    var res = {}, staff = o.staffIds || [], hol = {};
    (o.holidays || []).forEach(function (h) { hol[h] = true; });
    var d = new Date(o.from + 'T00:00:00'), end = new Date(o.to + 'T00:00:00');
    var inTeam = {}; staff.forEach(function (s) { inTeam[s] = true; });
    var busyRanges = [];
    (o.projects || []).forEach(function (p) {
      if (p.status === 'cancelled' || p.status === 'completed') return;
      var mems = (p.members && p.members.length) ? p.members
        : (p.team || []).map(function (sid) { return { sid: sid, s: p.start, e: p.end }; });
      mems.forEach(function (m) { if (inTeam[m.sid] && m.s && m.e) busyRanges.push({ sid: m.sid, s: m.s, e: m.e, k: 'proj', t: p.name || '' }); });
    });
    (o.leaves || []).forEach(function (lv) {
      if (lv.status === 'rejected' || !inTeam[lv.staffId] || !lv.startDate || !lv.endDate) return;
      busyRanges.push({ sid: lv.staffId, s: lv.startDate, e: lv.endDate, k: 'leave', t: 'ลางาน' });
    });
    while (d <= end) {
      // busy[sid] = 'proj' | 'leave' (ลาชนะ) · why[sid] = ชื่อโครงการ/ลางาน ไว้แสดง tooltip
      var iso = window.srvIso(d), busy = {}, why = {};
      busyRanges.forEach(function (r) {
        if (r.s > iso || r.e < iso) return;
        busy[r.sid] = busy[r.sid] === 'leave' ? 'leave' : r.k;
        if (r.t) (why[r.sid] = why[r.sid] || []).push(r.t);
      });
      var nBusy = Object.keys(busy).length, nRes = 0;
      (o.reserved || []).forEach(function (r) { if (r.s <= iso && r.e >= iso) nRes += Number(r.n) || 1; });
      res[iso] = { free: Math.max(0, staff.length - nBusy - nRes), total: staff.length, busy: busy, why: why, reserved: nRes, holiday: !!hol[iso], weekend: d.getDay() === 0 || d.getDay() === 6 };
      d.setDate(d.getDate() + 1);
    }
    return res;
  };

})();
