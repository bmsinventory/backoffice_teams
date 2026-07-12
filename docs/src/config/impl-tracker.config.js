/**
 * impl-tracker.config.js — Implementation Tracker: Constants & Global Stores
 * Module ใหม่: ติดตามงานโครงการติดตั้งระบบ (Project → Phase → Task → Checklist)
 * แยกอิสระจาก window.PROJECTS เดิม (คนละความหมาย: เดิม = advance/ที่พัก/ทีมงาน)
 */
(function () {

  // ── Module Id (ใช้กับ PERM_MODULES / ROUTE_MAP / can()) ──
  window.IMPL_MODULE = 'impl_tracker';

  // ── Global Data Stores ──
  // ชื่อ global ตรงกับชื่อ table แบบ UPPERCASE ทุกตัว (getColRef fallback lower-case ชื่อ collection
  // เป็นชื่อ table โดยอัตโนมัติเมื่อไม่มีอยู่ใน COL_MAP ของ supabase.service.js — ห้ามเปลี่ยนชื่อเหล่านี้
  // โดยไม่ตรงกับชื่อ table ใน supabase-migration-impl-tracker.sql)
  window.IMPL_TEMPLATES       = [];
  window.IMPL_PROJECTS        = [];
  window.IMPL_PHASES          = [];
  window.IMPL_TASKS           = [];
  window.IMPL_CHECKLIST_ITEMS = [];
  window.IMPL_ISSUES          = [];
  window.IMPL_RISKS           = [];
  window.IMPL_COMMENTS        = [];
  window.IMPL_ATTACHMENTS     = [];
  window.IMPL_ACTIVITY_LOG    = [];

  // ── Status Flow (ใช้ร่วมกันทุก entity: project/phase/task) ──
  window.IMPL_STATUS = [
    { id:'not_started', label:'ยังไม่เริ่ม',      color:'#9ba3b8', icon:'⚪' },
    { id:'in_progress',  label:'กำลังดำเนินการ',  color:'#4361ee', icon:'🔵' },
    { id:'review',       label:'รอตรวจสอบ',       color:'#ffa62b', icon:'🟠' },
    { id:'done',         label:'เสร็จแล้ว',        color:'#06d6a0', icon:'✅' },
    { id:'delayed',      label:'ล่าช้า',           color:'#ff6b6b', icon:'⏰' },
    { id:'issue',        label:'มีปัญหา',          color:'#f72585', icon:'⚠️' },
    { id:'cancelled',    label:'ยกเลิก',           color:'#6c757d', icon:'🚫' },
  ];

  window.IMPL_PRIORITY = [
    { id:'low',    label:'ต่ำ',    color:'#9ba3b8' },
    { id:'medium', label:'ปานกลาง', color:'#4361ee' },
    { id:'high',   label:'สูง',    color:'#ffa62b' },
    { id:'urgent', label:'เร่งด่วน', color:'#ff6b6b' },
  ];

  window.IMPL_SEVERITY = [
    { id:'low',      label:'น้อย',      color:'#9ba3b8' },
    { id:'medium',   label:'ปานกลาง',   color:'#ffa62b' },
    { id:'high',     label:'สูง',       color:'#ff6b6b' },
    { id:'critical',  label:'วิกฤต',     color:'#f72585' },
  ];

  window.IMPL_ISSUE_STATUS = [
    { id:'open',        label:'เปิดอยู่',     color:'#ff6b6b' },
    { id:'in_progress', label:'กำลังแก้ไข',  color:'#4361ee' },
    { id:'closed',       label:'ปิดแล้ว',     color:'#06d6a0' },
  ];

  window.IMPL_IMPACT = [
    { id:'low',    label:'ต่ำ',    color:'#9ba3b8' },
    { id:'medium', label:'ปานกลาง', color:'#ffa62b' },
    { id:'high',   label:'สูง',    color:'#ff6b6b' },
  ];

  window.IMPL_PROBABILITY = [
    { id:'low',    label:'น้อย',    color:'#9ba3b8' },
    { id:'medium', label:'ปานกลาง', color:'#ffa62b' },
    { id:'high',   label:'สูง',    color:'#ff6b6b' },
  ];

  window.IMPL_RISK_STATUS = [
    { id:'open',      label:'เฝ้าระวัง',  color:'#ffa62b' },
    { id:'mitigated', label:'บรรเทาแล้ว', color:'#06d6a0' },
    { id:'closed',    label:'ปิดแล้ว',    color:'#6c757d' },
  ];

  // ── UI State ──
  window.imtTab            = 'dashboard';  // dashboard | projects | detail | calendar | issues | risks | report
  window.imtBoardView       = 'card';       // card | list | kanban  (มุมมอง Task ภายในหน้ารายละเอียดโครงการ)
  window.imtCurrentProjectId = '';
  window.imtCurrentTaskId    = '';
  window.imtCalY            = new Date().getFullYear();
  window.imtCalM            = new Date().getMonth();
  window.imtTaskFilter      = { q:'', status:'', owner:'', phaseId:'' };
  window.imtDashHealthFilter = 'all';  // all | delayed | risk | ontrack (ตัวกรองการ์ดสถานะโครงการใน Dashboard)
  window.imtEditProjectId   = null;
  window.imtEditPhaseId     = null;
  window.imtEditTaskId      = null;
  window.imtEditIssueId     = null;
  window.imtEditRiskId      = null;
  window.imtDragTaskId      = null;
  window.imtDragTaskPhaseId = null;  // ใช้จำกัดการลากสลับลำดับ Task (Card view) ให้ทำได้แค่ภายใน Phase เดียวกัน
  window.imtDragPhaseId     = null;  // ลากสลับลำดับ Phase (Card view)
  window.imtTplDragPhaseIdx = null;  // ลากสลับลำดับ Phase ใน Template Builder
  window.imtTplDragTaskPi   = null;  // ลากสลับลำดับ Task ใน Template Builder (index Phase ต้นทาง)
  window.imtTplDragTaskTi   = null;  // ลากสลับลำดับ Task ใน Template Builder (index Task ต้นทาง)

})();
