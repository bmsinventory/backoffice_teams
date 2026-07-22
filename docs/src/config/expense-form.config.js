/**
 * expense-form.config.js — Expense Clearing Form (FM-AC-01): Constants & Global Store
 * Module ใหม่: ฟอร์มดิจิทัลของ "ใบเบิกเงินทดรองจ่าย" กรอก→พิมพ์
 * แยกอิสระจาก window.ADVANCES เดิม (คนละวัตถุประสงค์: เดิม = ติดตามสถานะเบิก/เคลียร์เงิน
 * ตัวนี้ = จำลองฟอร์มกระดาษให้กรอกแล้วพิมพ์ออกมาได้ตรงต้นฉบับ)
 */
(function () {

  // ── Module Id (ใช้กับ PERM_MODULES / ROUTE_MAP / can()) ──
  window.ECF_MODULE = 'expense_form';

  // ── Global Data Store ──
  // ชื่อ global ตรงกับชื่อ table แบบ UPPERCASE (getColRef fallback lower-case ชื่อ collection
  // เป็นชื่อ table โดยอัตโนมัติเมื่อไม่มีอยู่ใน COL_MAP ของ supabase.service.js — ห้ามเปลี่ยนชื่อนี้
  // โดยไม่ตรงกับชื่อ table ใน supabase-migration-expense-clearing.sql)
  window.EXPENSE_CLEARING_FORMS = [];

  // ── 7 หมวดโครงการตายตัวตามช่อง checkbox บนฟอร์มกระดาษ (ไม่ผูกกับ window.PTYPES
  // ที่เป็น dynamic — ฟอร์มกระดาษพิมพ์ตายตัวมาแล้ว 7 ช่องนี้เท่านั้น) ──
  window.ECF_CATEGORIES = [
    { key:'data_center', label:'Data Center',  keywords:['data center','ดาต้าเซ็นเตอร์'] },
    { key:'inventory',   label:'Inventory',    keywords:['inventory','คลังสินค้า','คลังยา','สต๊อก','สต็อก'] },
    { key:'lis',         label:'LIS',          keywords:['lis'] },
    { key:'mkt',         label:'MKT.',         keywords:['mkt','marketing','การตลาด'] },
    { key:'implement',   label:'Implement',    keywords:['implement','ติดตั้งระบบ','ติดตั้ง'] },
    { key:'training',    label:'Training',     keywords:['training','อบรม'] },
    { key:'other',       label:'OFF. / Other', keywords:[] },
  ];

  // ── จับคู่ label ของ project type (window.PTYPES) → 1 ใน 7 หมวดข้างบน ──
  window.ecfMatchCategory = function (typeLabel) {
    var lb = (typeLabel || '').toLowerCase();
    if (!lb) return 'other';
    for (var i = 0; i < window.ECF_CATEGORIES.length; i++) {
      var cat = window.ECF_CATEGORIES[i];
      for (var j = 0; j < cat.keywords.length; j++) {
        if (lb.indexOf(cat.keywords[j]) >= 0) return cat.key;
      }
    }
    return 'other';
  };

  // ── UI State ──
  window.ecfEditId   = null;   // id ของฟอร์มที่กำลังแก้ไข (null = ฟอร์มใหม่)
  window.ecfWorkers   = [];    // rowId ของแถวผู้ปฏิบัติงานที่กำลังแสดงผล

})();
