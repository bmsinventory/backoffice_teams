/**
 * site-notice-form.service.js — Site Notice Letter (หนังสือแจ้งออกไซต์): Data Layer
 * ต้องโหลดหลัง supabase.service.js + site-notice-form.config.js
 * ลงทะเบียน onSnapshot ของตัวเอง (ไม่แก้ realtime.service.js เดิม) แบบ background
 * (ไม่ block loader หลัก เหมือน WORK_LOGS/CONTRACTS/HOSPITALS/IMPL_.../EXPENSE_CLEARING_FORMS/SITE_DEPLOY_FORMS)
 */
(function () {

  // ── Transform: raw Supabase row → app object ──
  function transform(d) {
    return {
      id: d.id,
      docNo: d.doc_no || '',
      docDate: d.doc_date || '',
      requesterName: d.requester_name || '',
      requesterPosition: d.requester_position || '',
      requesterDept: d.requester_dept || '',
      attachCopies: d.attach_copies || '',
      attachSheets: d.attach_sheets || '',
      systemKey: d.system_key || 'other',
      systemOtherNote: d.system_other_note || '',
      taskInstall: d.task_install === true,
      taskRevisit: d.task_revisit === true,
      revisitNo: d.revisit_no || '',
      revisitTotal: d.revisit_total || '',
      taskReplyLecturer: d.task_reply_lecturer === true,
      taskMa: d.task_ma === true,
      maNo: d.ma_no || '',
      maTotal: d.ma_total || '',
      taskPresent: d.task_present === true,
      presentType: d.present_type || '',
      taskOther: d.task_other === true,
      taskOtherNote: d.task_other_note || '',
      taskSurvey: d.task_survey === true,
      taskDelivery: d.task_delivery === true,
      deliveryNo: d.delivery_no || '',
      deliveryTotal: d.delivery_total || '',
      taskCopydata: d.task_copydata === true,
      copydataStatus: d.copydata_status || '',
      workStart: d.work_start || '',
      workEnd: d.work_end || '',
      siteLocation: d.site_location || '',
      attendees: Array.isArray(d.attendees) ? d.attendees : [],
      addresseeKey: d.addressee_key || 'hospital_director',
      addresseeOtherNote: d.addressee_other_note || '',
      purposeKey: d.purpose_key || 'inform',
      contractNo: d.contract_no || '',
      contractAmount: d.contract_amount === null || d.contract_amount === undefined ? '' : Number(d.contract_amount),
      contractDate: d.contract_date || '',
      quoteNo: d.quote_no || '',
      deliverMail: d.deliver_mail === true,
      deliverEmail: d.deliver_email === true,
      emailTo: d.email_to || '',
      emailCc: d.email_cc || '',
      createdAt: d.created_at || '',
      updatedAt: d.updated_at || '',
    };
  }

  // ── ID Generator (ตาม convention เดิม: prefix + Date.now()) ──
  window.snlUid = function () { return 'SNL' + Date.now() + Math.floor(Math.random() * 1000); };

  // ── Optimistic Local Update (แยกจาก window._applyLocalDoc ใน realtime.service.js
  // เพราะ transform ของที่นั่นเป็น closure ส่วนตัว ไม่รู้จัก collection ใหม่นี้) ──
  window.snlApplyLocal = function (id, rawData) {
    var arr = window.SITE_NOTICE_FORMS;
    var obj = transform(Object.assign({ id: id }, rawData));
    var idx = arr.findIndex(function (x) { return x.id === id; });
    if (idx >= 0) arr[idx] = obj; else arr.unshift(obj);
  };

  window.snlRemoveLocal = function (id) {
    window.SITE_NOTICE_FORMS = window.SITE_NOTICE_FORMS.filter(function (x) { return x.id !== id; });
  };

  // ── Realtime Subscription (background, ไม่ block loader) ──
  var _renderTimer = null;
  window.onSnapshot(window.getColRef('SITE_NOTICE_FORMS'), function (s) {
    window.SITE_NOTICE_FORMS = s.docs
      .map(function (doc) { return transform(doc.data()); })
      .sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    if (window._ownWrite && window._ownWrite.SITE_NOTICE_FORMS) return;
    if (window.cu) {
      clearTimeout(_renderTimer);
      _renderTimer = setTimeout(function () {
        var el = document.getElementById('view-expense-form');
        if (el && el.classList.contains('on') && window.ecfActiveType === 'ac03') {
          window.snlRefreshSavedList && window.snlRefreshSavedList();
        }
      }, 300);
    }
  }, function (e) { window.showDbErrorSoft(e, 'แจ้งเข้าดำเนินงานหน้างาน'); });

})();
