/**
 * app.config.js — Application Constants & Configuration
 * ค่าคงที่ทั่วระบบ: status flows, colors, import schemas, default settings
 */
(function () {

  // ── Global Data Stores (shared state) ──
  window.STAGES      = [];
  window.PTYPES      = [];
  window.STAFF       = [];
  window.USERS       = [];
  window.PROJECTS    = [];
  window.ADVANCES    = [];
  window.CONTRACTS   = [];
  window.DEPT_LIST   = [];
  window.POSITIONS   = [];
  window.PGROUPS     = [];
  window.LODGINGS    = [];
  window.HOLIDAYS    = [];
  window.LEAVES      = [];
  window.TIMESHEETS  = [];
  window.COSTS       = [];
  window.WORK_LOGS   = [];
  window.HSP_PRODUCTS = [];
  window.HOSPITALS   = [];
  window.DEPARTMENTS = ['IT','Finance','PM','HR','Marketing','Operations','Procurement','Other'];

  // ── Notification Tokens ──
  window.NOTIFY_TOKEN          = '';
  window.NOTIFY_ADVANCE_TOKEN  = '';
  window.NOTIFY_PROJECT_TOKEN  = '';
  window.NOTIFY_PROXY_URL      = '';
  window.YEAR_TARGETS          = [];
  window.TARGET_TYPE_GROUPS    = [];

  // ── App State Flags ──
  window.isDbLoaded  = false;
  window.cu          = null;

  // ── Default Settings (overridden by Supabase SETTINGS doc) ──
  window.SETTINGS = {
    allowance_weekday_normal: 350,
    allowance_holiday_normal: 650,
    allowance_weekday_border: 650,
    allowance_holiday_border: 1250,
  };

  // ── Advance Status Flow ──
  window.AFLW = [
    { id:'draft',    label:'Draft',       color:'#9ba3b8' },
    { id:'pending',  label:'รออนุมัติ',   color:'#ffa62b' },
    { id:'approved', label:'อนุมัติแล้ว', color:'#4361ee' },
    { id:'disbursed',label:'เบิกแล้ว',    color:'#7c5cfc' },
    { id:'clearing', label:'รอเคลียร์',   color:'#ff6b6b' },
    { id:'cleared',  label:'เคลียร์แล้ว', color:'#06d6a0' },
  ];
  window.ANXT = { draft:'pending', pending:'approved', approved:'disbursed', disbursed:'clearing', clearing:'cleared' };
  window.APRV = { pending:'draft', approved:'pending', disbursed:'approved', clearing:'disbursed', cleared:'clearing' };

  // ── Locale Constants ──
  window.THMON  = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  window.THMON_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  window.DNAMES = ['อา','จ','อ','พ','พฤ','ศ','ส'];

  // ── Color Palettes ──
  window.PCOLS = ['#4361ee','#7c5cfc','#ff6b6b','#06d6a0','#ffa62b','#4cc9f0','#f72585','#3a0ca3'];
  window.AVBG  = ['#7c5cfc','#ff6b6b','#06d6a0','#ffa62b','#4cc9f0','#f72585','#4361ee','#3a0ca3'];

  // ── UI State ──
  window.advFilter     = '';
  window.calY          = new Date().getFullYear();
  window.calM          = new Date().getMonth();
  window.wlY           = new Date().getFullYear();
  window.wlM           = new Date().getMonth();
  window.calView       = 'staff';
  window.calTime       = 'month';
  window.editPid       = null;
  window.editAid       = null;
  window.delTarget     = null;
  window.editLdId      = null;
  window.currentLdPid  = null;
  window.cStage        = null;
  window.cBudget       = null;
  window.kbPid         = null;
  window.admCur        = 'staff';
  window._loginRetryInterval = null;

  // ── Excel Import Schemas ──
  window.IMPORT_SCHEMAS = {
    PROJECTS:    { idField:'project_id', prefix:'P',    headers:['project_name','group_id','site_owner','type_id','stage_id','budget','start_date','end_date','revisit_1','revisit_2','progress_pct','note','pm_staff_id'], example:['โครงการตัวอย่าง A','','คุณสมชาย','gen','init','100000','2026-01-01','2026-12-31','','','0','หมายเหตุ',''] },
    STAFF:       { idField:'staff_id',   prefix:'S',    headers:['full_name','nickname','department','position','email','phone','start_date','birth_date','is_active','remark'], example:['สมชาย ใจดี','ชาย','IT','Developer','somchai@test.com','0812345678','2024-01-01','1990-01-01','TRUE',''] },
    USERS:       { idField:'user_id',    prefix:'U',    headers:['username','password','name','role','is_active'], example:['newuser','pass1234','ชื่อผู้ใช้','viewer','TRUE'] },
    ADVANCES:    { idField:'advance_id', prefix:'A',    headers:['project_id','purpose','amount_requested','amount_cleared','request_date','due_date','status','note','advance_no'], example:['P123','ค่าที่พัก','5000','0','2026-01-10','2026-01-20','draft','','ADV-001'] },
    PGROUPS:     { idField:'group_id',   prefix:'GRP',  headers:['label_th','color_hex'], example:['ภาคเหนือ','#4361ee'] },
    PTYPES:      { idField:'type_id',    prefix:'T',    headers:['label_th','color_hex'], example:['งานติดตั้ง','#06d6a0'] },
    POSITIONS:   { idField:'position_id',prefix:'POS',  headers:['label_th'], example:['Project Manager'] },
    DEPARTMENTS: { idField:'dept_id',    prefix:'DEPT', headers:['label_th'], example:['ฝ่ายไอที'] },
    TIMESHEETS:  { idField:'timesheet_id',prefix:'TS',  headers:['project_id','staff_id','work_date','hours','category','description'], example:['P001','S001','2026-04-01','8','fieldwork','สำรวจพื้นที่โครงการ'] },
    COSTS:       { idField:'cost_id',    prefix:'CST',  headers:['project_id','staff_id','category','amount','cost_date','description','receipt_no'], example:['P001','S001','travel','1500','2026-04-01','ค่าเดินทางไปพื้นที่','RCT-001'] },
    CONTRACTS:   { idField:'contract_id',prefix:'CT',   headers:['contract_id','project_name','customer_name','total_contract_value','contract_sign_date','contract_start_date','end_date','status','note'], example:['2026-0001','โครงการตัวอย่าง','โรงพยาบาลตัวอย่าง','500000','2026-01-01','2026-01-01','2026-12-31','active','หมายเหตุ'] },
  };

})();
