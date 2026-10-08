/**
 * routes.config.js — Module & Route Definitions
 * กำหนด view IDs, nav buttons, และ permission modules ทั้งระบบ
 */
(function () {

  // ── Permission Modules (ใช้กับระบบ permission) ──
  window.PERM_MODULES = [
    { id:'overview',     label:'Overview',       icon:'chart-bar' },
    { id:'kanban',       label:'Delivery Board', icon:'layout-kanban' },
    { id:'projects',     label:'โครงการ',        icon:'folder' },
    { id:'advance',      label:'Advance',        icon:'credit-card' },
    { id:'expense_form', label:'Advance › เอกสารประกอบ', icon:'receipt-2' },
    { id:'lodging',      label:'ที่พัก',          icon:'bed' },
    { id:'workload',     label:'สรุปภาระงาน',    icon:'chart-arrows-vertical' },
    { id:'calendar',     label:'ปฏิทินทีม',      icon:'calendar-event' },
    { id:'leave',        label:'การลางาน',       icon:'calendar-off' },
    { id:'timesheet',    label:'Timesheet',      icon:'clock-hour-4' },
    { id:'cost',         label:'งบประมาณ › รายการค่าใช้จ่าย', icon:'receipt' },
    { id:'budget',       label:'งบประมาณ & ค่าใช้จ่าย', icon:'wallet' },
    { id:'availability', label:'ทีมว่าง',         icon:'users-group' },
    { id:'holiday',      label:'วันหยุด',         icon:'calendar-star' },
    { id:'admin',        label:'Admin Panel',    icon:'settings' },
    { id:'targets',      label:'เป้าหมายทีม',    icon:'target-arrow' },
    { id:'hospital',     label:'รายชื่อ รพ.',     icon:'building-hospital' },
    { id:'contract',     label:'ข้อมูลสัญญา',     icon:'file-description' },
    { id:'worklog',      label:'บันทึกงาน',       icon:'notes' },
    { id:'impl_tracker', label:'ติดตามสถานะโครงการ', icon:'timeline-event' },
    { id:'all_issues',   label:'ภาพรวมปัญหาการใช้งาน', icon:'alert-hexagon' },
    { id:'helpdesk',     label:'ศูนย์ช่วยเหลือ',   icon:'headset' },
    // ผู้ช่วยทีม — แชทถามคำตอบ/โค้ดที่ทีมเก็บไว้ (src/modules/assist.js) · เพิ่ม/แก้/ลบ = จัดการคลังคำตอบ
    { id:'assist',       label:'ผู้ช่วยทีม',      icon:'messages' },
    // ขอใช้งานทีม Server (src/modules/server-request.js) · อนุมัติ = อนุมัติ/ไม่อนุมัติคำขอ · แก้ = จัดคน/ตั้งค่าตัวเลือก
    { id:'server_request', label:'ขอใช้งานทีม Server', icon:'server' },
    // ระบบอบรม + ระบบสอบ (/training/) — view-training ฝังหน้า /training/?embed=1 (src/modules/training.js) ใช้ session เดียวกัน
    { id:'training',     label:'ระบบอบรม', icon:'school' },
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
    assist:       'view-assist',
    server_request: 'view-server-request',
    all_issues:   'view-all-issues',
    training:     'view-training',
    admin:        'view-admin',
  };

  // ── Default Route ──

})();
