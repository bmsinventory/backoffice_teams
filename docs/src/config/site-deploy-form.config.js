/**
 * site-deploy-form.config.js — Site Deploy Form (FM-AC-02): Constants & Global Store
 * Module ใหม่: ฟอร์มดิจิทัลของ "แบบฟอร์มการออกปฏิบัติงาน" กรอก→พิมพ์
 * เลือกได้เป็นฟอร์มที่ 2 ในหน้า "เอกสารประกอบ Adv." (module เดิม expense_form) คู่กับ FM-AC-01
 * แยกอิสระจาก window.EXPENSE_CLEARING_FORMS เดิม (คนละตาราง คนละวัตถุประสงค์)
 */
(function () {

  // ── Module Id (ใช้กับ PERM_MODULES / ROUTE_MAP / can() — ใช้ module เดียวกับ FM-AC-01) ──
  window.SDF_MODULE = 'expense_form';

  // ── Global Data Store ──
  // ชื่อ global ตรงกับชื่อ table แบบ UPPERCASE (getColRef fallback lower-case ชื่อ collection
  // เป็นชื่อ table โดยอัตโนมัติเมื่อไม่มีอยู่ใน COL_MAP ของ supabase.service.js — ห้ามเปลี่ยนชื่อนี้
  // โดยไม่ตรงกับชื่อ table ใน supabase-migration-site-deploy-form.sql)
  window.SITE_DEPLOY_FORMS = [];

  // ── 7 หมวดแผนกตายตัวตามช่อง checkbox บนฟอร์มกระดาษ FM-AC-02 (มี "MA" แทน "MKT."
  // ต่างจาก window.ECF_CATEGORIES ของ FM-AC-01 — ห้ามใช้ list เดียวกัน) ──
  window.SDF_DEPTS = [
    { key:'data_center', label:'Data Center' },
    { key:'training',    label:'Training' },
    { key:'implement',   label:'Implement' },
    { key:'lis',         label:'LIS' },
    { key:'inventory',   label:'Inventory' },
    { key:'ma',          label:'MA' },
    { key:'other',       label:'อื่นๆ' },
  ];

  // ── ค่าเริ่มต้นของ "การเตรียมความพร้อม" (ตามฟอร์มกระดาษตัวอย่าง) — เติมอัตโนมัติตอนสร้างฟอร์มใหม่ แก้ไขได้ ──
  window.SDF_PREP_DEFAULT =
    '1. ประสานงานกับเจ้าหน้าที่ รพ. เพื่อแจ้งกำหนดการ รายชื่อทีม และจำนวนผู้เข้าปฏิบัติงาน\n' +
    '2. ยืนยันขอบเขตงาน และวัตถุประสงค์ของการเข้า Site กับผู้ประสานงาน\n' +
    '3. จัดหาที่พัก วางแผนการเดินทาง และเตรียมยานพาหนะ\n' +
    '4. จัดทำแผนการดำเนินงาน และตารางอบรมผู้ใช้งาน\n' +
    '5. ตรวจสอบความพร้อมของข้อมูลพื้นฐานที่โรงพยาบาลต้องจัดเตรียม\n' +
    '6. เตรียมเอกสารประกอบการติดตั้ง คู่มือการใช้งาน และแบบฟอร์มต่าง ๆ';

  // ── UI State ──
  window.sdfEditId = null;   // id ของฟอร์มที่กำลังแก้ไข (null = ฟอร์มใหม่)

})();
