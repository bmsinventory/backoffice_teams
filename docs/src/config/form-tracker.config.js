/**
 * form-tracker.config.js — Form Tracker: Constants & Global Stores
 * ส่วนย่อย "แบบฟอร์ม" ในหน้า "ติดตามโครงการติดตั้ง" (ไม่ใช่ module แยก) — ใช้ permission เดียวกับ
 * window.IMPL_MODULE และผูกข้อมูลตรงกับ window.IMPL_PROJECTS.id (project_id) ไม่มีโครงการของตัวเอง
 * Group (คลัง) → Item (แบบฟอร์ม)
 */
(function () {

  // ── Global Data Stores ──
  window.FORM_GROUPS    = [];
  window.FORM_ITEMS     = [];
  window.FORM_TEMPLATES = [];   // รายชื่อเอกสาร Template (kind: standard=มาตรฐาน / contract=ตามสัญญา) ผูกประเภทโครงการได้ 1 ประเภท (ptypeId ว่าง = ใช้ร่วม) ไม่ผูก project/group

  // ── Status Flow (ใช้ร่วมกันทั้ง Item) ──
  window.FORM_STATUS = [
    { id:'not_started', label:'รอดำเนินการ',    color:'#9ba3b8', icon:'⚪' },
    { id:'in_progress',  label:'กำลังดำเนินการ', color:'#4361ee', icon:'🔵' },
    { id:'done',         label:'ดำเนินการแล้ว',  color:'#06d6a0', icon:'✅' },
  ];

  // ── ประเภทแบบฟอร์ม ──
  window.FORM_TYPE = [
    { id:'form_new',  label:'แบบฟอร์มใหม่',   color:'#4361ee' },
    { id:'form_base', label:'แบบฟอร์มตั้งต้น', color:'#06a6a0' },
    { id:'form_contract', label:'แบบฟอร์มตามสัญญา', color:'#f59e0b' },
  ];

  // ── UI State ──
  window.ftkFilter = { q:'', groupId:'', formType:'', status:'open', owner:'' };   // status 'open' = แสดงเฉพาะที่ยังไม่เสร็จ (ค่าเริ่มต้น)
  window.ftkTemplatePickGroupId = null;  // group ปลายทางตอนเปิด Template modal แบบ "ดึงมาใช้" (null = โหมดจัดการอย่างเดียว)

})();
