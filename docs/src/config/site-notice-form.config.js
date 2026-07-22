/**
 * site-notice-form.config.js — Site Notice Letter (หนังสือแจ้งออกไซต์): Constants & Global Store
 * Module ใหม่: ฟอร์มดิจิทัลของ "หนังสือแจ้งหน่วยงานภายนอก" (แจ้ง รพ./หน่วยงานก่อนออกไซต์) กรอก→พิมพ์
 * เลือกได้เป็นฟอร์มที่ 3 ในหน้า "เอกสารประกอบ Adv." (module เดิม expense_form) คู่กับ FM-AC-01 / FM-AC-02
 * แยกอิสระจาก window.EXPENSE_CLEARING_FORMS / window.SITE_DEPLOY_FORMS เดิม (คนละตาราง คนละวัตถุประสงค์)
 */
(function () {

  // ── Module Id (ใช้กับ PERM_MODULES / ROUTE_MAP / can() — ใช้ module เดียวกับ FM-AC-01/02) ──
  window.SNL_MODULE = 'expense_form';

  // ── Global Data Store ──
  // ชื่อ global ตรงกับชื่อ table แบบ UPPERCASE (getColRef fallback lower-case ชื่อ collection
  // เป็นชื่อ table โดยอัตโนมัติเมื่อไม่มีอยู่ใน COL_MAP ของ supabase.service.js — ห้ามเปลี่ยนชื่อนี้
  // โดยไม่ตรงกับชื่อ table ใน supabase-migration-site-notice-form.sql)
  window.SITE_NOTICE_FORMS = [];

  // ── ระบบที่แจ้ง (ช่อง checkbox บนฟอร์มกระดาษ — เลือกได้ 1 ระบบ) ──
  window.SNL_SYSTEMS = [
    { key:'hosxp',       label:'BMS-HOSxP' },
    { key:'hosxp_xe',    label:'BMS-HOSxP XE' },
    { key:'data_center', label:'BMS Data Center' },
    { key:'inventory',   label:'BMS-INVENTORY' },
    { key:'other',       label:'อื่นๆ ระบุ' },
  ];

  // ── หนังสือแจ้งถึง (เลือกได้ 1) ──
  window.SNL_ADDRESSEES = [
    { key:'hospital_director', label:'เรียน ผู้อำนวยการโรงพยาบาล' },
    { key:'health_office',     label:'นายแพทย์สำนักงานสาธารณสุข' },
    { key:'other',             label:'อื่นๆ โปรดระบุ' },
  ];

  // ── หนังสือแจ้งเพื่อ (เลือกได้ 1) ──
  window.SNL_PURPOSES = [
    { key:'inform',    label:'เพื่อทราบ' },
    { key:'committee', label:'ให้คณะกรรมการดำเนินการตรวจรับและเบิกจ่ายเงินต่อไป (กรณีที่ตรวจรับเบิกจ่ายเงิน ถ้าเป็นสัญญาจ้าง ให้ระบุเลขที่สัญญา, วันที่ลงนามในสัญญา, แต่ถ้าตอบรับใบเสนอราคา ให้ระบุใบเสนอราคา)' },
  ];

  // ── UI State ──
  window.snlEditId = null;   // id ของฟอร์มที่กำลังแก้ไข (null = ฟอร์มใหม่)

})();
