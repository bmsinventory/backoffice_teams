/**
 * expense-form.service.js — Expense Clearing Form: Data Layer
 * ต้องโหลดหลัง supabase.service.js + expense-form.config.js
 * ลงทะเบียน onSnapshot ของตัวเอง (ไม่แก้ realtime.service.js เดิม) แบบ background
 * (ไม่ block loader หลัก เหมือน WORK_LOGS/CONTRACTS/HOSPITALS/IMPL_*)
 */
(function () {

  // ── Transform: raw Supabase row → app object ──
  function transform(d) {
    return {
      id: d.id,
      formNo: d.form_no || '',
      projectId: d.project_id || '',
      categoryKey: d.category_key || 'other',
      categoryOtherNote: d.category_other_note || '',
      staffName: d.staff_name || '',
      staffPhone: d.staff_phone || '',
      workStart: d.work_start || '',
      workEnd: d.work_end || '',
      workLocation: d.work_location || '',
      assignedTask: d.assigned_task || '',
      requestedAmount: Number(d.requested_amount) || 0,
      peopleCount: Number(d.people_count) || 1,
      travelFuelToll: Number(d.travel_fuel_toll) || 0,
      travelTransport: Number(d.travel_transport) || 0,
      travelOther: Number(d.travel_other) || 0,
      lodgingNights: Number(d.lodging_nights) || 0,
      lodgingRooms: Number(d.lodging_rooms) || 0,
      lodgingRate: Number(d.lodging_rate) || 0,
      workers: Array.isArray(d.workers) ? d.workers : [],
      others: Array.isArray(d.others) ? d.others : [],
      totalAmount: Number(d.total_amount) || 0,
      noteScheduleSigned: d.note_schedule_signed === true,
      noteLetterSent: d.note_letter_sent === true,
      createdAt: d.created_at || '',
      updatedAt: d.updated_at || '',
    };
  }

  // ── ID Generator (ตาม convention เดิม: prefix + Date.now()) ──
  window.ecfUid = function () { return 'ECF' + Date.now() + Math.floor(Math.random() * 1000); };

  // ── Optimistic Local Update (แยกจาก window._applyLocalDoc ใน realtime.service.js
  // เพราะ transform ของที่นั่นเป็น closure ส่วนตัว ไม่รู้จัก collection ใหม่นี้) ──
  window.ecfApplyLocal = function (id, rawData) {
    var arr = window.EXPENSE_CLEARING_FORMS;
    var obj = transform(Object.assign({ id: id }, rawData));
    var idx = arr.findIndex(function (x) { return x.id === id; });
    if (idx >= 0) arr[idx] = obj; else arr.unshift(obj);
  };

  window.ecfRemoveLocal = function (id) {
    window.EXPENSE_CLEARING_FORMS = window.EXPENSE_CLEARING_FORMS.filter(function (x) { return x.id !== id; });
  };

  // ── Realtime Subscription (background, ไม่ block loader) ──
  var _renderTimer = null;
  window.onSnapshot(window.getColRef('EXPENSE_CLEARING_FORMS'), function (s) {
    window.EXPENSE_CLEARING_FORMS = s.docs
      .map(function (doc) { return transform(doc.data()); })
      .sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    if (window._ownWrite && window._ownWrite.EXPENSE_CLEARING_FORMS) return;
    if (window.cu) {
      clearTimeout(_renderTimer);
      _renderTimer = setTimeout(function () {
        var el = document.getElementById('view-expense-form');
        if (el && el.classList.contains('on')) window.ecfRefreshSavedList && window.ecfRefreshSavedList();
      }, 300);
    }
  }, window.showDbError);

})();
