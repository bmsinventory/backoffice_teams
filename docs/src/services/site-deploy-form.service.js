/**
 * site-deploy-form.service.js — Site Deploy Form (FM-AC-02): Data Layer
 * ต้องโหลดหลัง supabase.service.js + site-deploy-form.config.js
 * ลงทะเบียน onSnapshot ของตัวเอง (ไม่แก้ realtime.service.js เดิม) แบบ background
 * (ไม่ block loader หลัก เหมือน WORK_LOGS/CONTRACTS/HOSPITALS/IMPL_.../EXPENSE_CLEARING_FORMS)
 */
(function () {

  // ── Transform: raw Supabase row → app object ──
  function transform(d) {
    return {
      id: d.id,
      deptKey: d.dept_key || 'other',
      deptOtherNote: d.dept_other_note || '',
      hospitalId: d.hospital_id || '',
      siteLocation: d.site_location || '',
      province: d.province || '',
      workOpenNewSite: d.work_open_new_site === true,
      workPerContract: d.work_per_contract === true,
      workOther: d.work_other === true,
      workOtherNote: d.work_other_note || '',
      contractNo: d.contract_no || '',
      workRevisit: d.work_revisit === true,
      revisitNo: d.revisit_no || '',
      revisitTotal: d.revisit_total || '',
      workFixIssue: d.work_fix_issue === true,
      workCloseContract: d.work_close_contract === true,
      customerName: d.customer_name || '',
      customerDept: d.customer_dept || '',
      customerEmail: d.customer_email || '',
      customerPhone: d.customer_phone || '',
      preparationNotes: d.preparation_notes || '',
      advSlipCount: d.adv_slip_count === null || d.adv_slip_count === undefined ? '' : Number(d.adv_slip_count),
      advCollectedAmount: d.adv_collected_amount === null || d.adv_collected_amount === undefined ? '' : Number(d.adv_collected_amount),
      advTotalAmount: d.adv_total_amount === null || d.adv_total_amount === undefined ? '' : Number(d.adv_total_amount),
      advRemainingAmount: d.adv_remaining_amount === null || d.adv_remaining_amount === undefined ? '' : Number(d.adv_remaining_amount),
      advUsedAmount: d.adv_used_amount === null || d.adv_used_amount === undefined ? '' : Number(d.adv_used_amount),
      advUnclearedCount: d.adv_uncleared_count === null || d.adv_uncleared_count === undefined ? '' : Number(d.adv_uncleared_count),
      preparerName: d.preparer_name || '',
      preparerDate: d.preparer_date || '',
      createdAt: d.created_at || '',
      updatedAt: d.updated_at || '',
    };
  }

  // ── ID Generator (ตาม convention เดิม: prefix + Date.now()) ──
  window.sdfUid = function () { return 'SDF' + Date.now() + Math.floor(Math.random() * 1000); };

  // ── Optimistic Local Update (แยกจาก window._applyLocalDoc ใน realtime.service.js
  // เพราะ transform ของที่นั่นเป็น closure ส่วนตัว ไม่รู้จัก collection ใหม่นี้) ──
  window.sdfApplyLocal = function (id, rawData) {
    var arr = window.SITE_DEPLOY_FORMS;
    var obj = transform(Object.assign({ id: id }, rawData));
    var idx = arr.findIndex(function (x) { return x.id === id; });
    if (idx >= 0) arr[idx] = obj; else arr.unshift(obj);
  };

  window.sdfRemoveLocal = function (id) {
    window.SITE_DEPLOY_FORMS = window.SITE_DEPLOY_FORMS.filter(function (x) { return x.id !== id; });
  };

  // ── Realtime Subscription (background, ไม่ block loader) ──
  var _renderTimer = null;
  window.onSnapshot(window.getColRef('SITE_DEPLOY_FORMS'), function (s) {
    window.SITE_DEPLOY_FORMS = s.docs
      .map(function (doc) { return transform(doc.data()); })
      .sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    if (window._ownWrite && window._ownWrite.SITE_DEPLOY_FORMS) return;
    if (window.cu) {
      clearTimeout(_renderTimer);
      _renderTimer = setTimeout(function () {
        var el = document.getElementById('view-expense-form');
        if (el && el.classList.contains('on') && window.ecfActiveType === 'ac02') {
          window.sdfRefreshSavedList && window.sdfRefreshSavedList();
        }
      }, 300);
    }
  }, window.showDbError);

})();
