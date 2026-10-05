/**
 * routes.config.js — Module & Route Definitions
 * กำหนด view IDs, nav buttons, และ permission modules ทั้งระบบ
 */
(function () {

  // ── Permission Modules (ใช้กับระบบ permission) ──
  window.PERM_MODULES = [
    { id:'overview',     label:'Overview',       icon:'📊' },
    { id:'kanban',       label:'Delivery Board', icon:'📋' },
    { id:'projects',     label:'โครงการ',        icon:'🗂️' },
    { id:'advance',      label:'Advance',        icon:'💰' },
    { id:'expense_form', label:'Advance › เอกสารประกอบ', icon:'🧾' },
    { id:'lodging',      label:'ที่พัก',          icon:'🏨' },
    { id:'workload',     label:'สรุปภาระงาน',    icon:'📈' },
    { id:'calendar',     label:'ปฏิทินทีม',      icon:'📅' },
    { id:'leave',        label:'การลางาน',       icon:'🏖️' },
    { id:'timesheet',    label:'Timesheet',      icon:'⏱️' },
    { id:'cost',         label:'งบประมาณ › รายการค่าใช้จ่าย', icon:'💵' },
    { id:'budget',       label:'งบประมาณ & ค่าใช้จ่าย', icon:'💰' },
    { id:'availability', label:'ทีมว่าง',         icon:'👥' },
    { id:'holiday',      label:'วันหยุด',         icon:'🎌' },
    { id:'admin',        label:'Admin Panel',    icon:'⚙️' },
    { id:'targets',      label:'เป้าหมายทีม',    icon:'🎯' },
    { id:'hospital',     label:'รายชื่อ รพ.',     icon:'🏥' },
    { id:'contract',     label:'ข้อมูลสัญญา',     icon:'📄' },
    { id:'worklog',      label:'บันทึกงาน',       icon:'📝' },
    { id:'impl_tracker', label:'ติดตามสถานะโครงการ', icon:'🛠️' },
    { id:'all_issues',   label:'ภาพรวมปัญหาการใช้งาน', icon:'🩹' },
    { id:'helpdesk',     label:'ศูนย์ช่วยเหลือ',   icon:'🎧' },
    // ระบบอบรม + ระบบสอบ (/training/) — view-training ฝังหน้า /training/?embed=1 (src/modules/training.js) ใช้ session เดียวกัน
    { id:'training',     label:'ระบบอบรม', icon:'🎓' },
  ];

  // ── Module ที่เป็นแท็บย่อยในเมนูอื่น: moduleId → module ของปุ่มเมนูที่ต้องไฮไลต์ ──
  window.NAV_PARENT = {
    expense_form: 'advance',
    cost:         'budget',
    availability: 'workload',
  };

  // ── Route Map: moduleId → viewId ──
  window.ROUTE_MAP = {
    overview:     'view-overview',
    kanban:       'view-kanban',
    projects:     'view-projects',
    advance:      'view-advance',
    expense_form: 'view-expense-form',
    lodging:      'view-lodging',
    workload:     'view-workload',
    calendar:     'view-calendar',
    leave:        'view-leave',
    timesheet:    'view-timesheet',
    cost:         'view-cost',
    availability: 'view-availability',
    holiday:      'view-holidays',
    hospital:     'view-hospital',
    contract:     'view-contract',
    targets:      'view-targets',
    worklog:      'view-worklog',
    budget:       'view-budget',
    impl_tracker: 'view-impl-tracker',
    helpdesk:     'view-helpdesk',
    all_issues:   'view-all-issues',
    training:     'view-training',
    admin:        'view-admin',
  };

  // ── Default Route ──

})();
