/**
 * routes.config.js — Module & Route Definitions
 * กำหนด view IDs, nav buttons, และ permission modules ทั้งระบบ
 */
(function () {

  // ── Permission Modules (ใช้กับระบบ permission — กลุ่มสิทธิ์ในตาราง roles.perms ใช้ id เหล่านี้) ──
  // g = หมวดเมนูใน sidebar (จัดกลุ่มแถวในหน้าสิทธิ์การใช้งาน) · approve = มีสิทธิ์ "อนุมัติ" แยกจาก "แก้"
  // scope = มีขอบเขตข้อมูล (ของตัวเอง / ทั้งแผนก / ทั้งหมด) — ดู window.permScope ใน permission.util.js
  window.PERM_MODULES = [
    { id:'overview',     g:'Workspace', label:'Overview',       icon:'chart-bar' },
    { id:'kanban',       g:'Workspace', label:'Delivery Board', icon:'layout-kanban' },
    { id:'projects',     g:'Workspace', label:'โครงการ',        icon:'folder' },
    { id:'advance',      g:'Workspace', label:'Advance',        icon:'credit-card' },
    { id:'expense_form', g:'Workspace', label:'Advance › เอกสารประกอบ', icon:'receipt-2' },
    { id:'lodging',      g:'Workspace', label:'ที่พัก',          icon:'bed', approve:true },
    { id:'impl_tracker', g:'Workspace', label:'ติดตามสถานะโครงการ', icon:'timeline-event' },
    // แท็บ 🎓 อบรม ในติดตามสถานะโครงการ (src/modules/training.js ?project=) — สิทธิ์แยกจากเมนูระบบอบรม (training)
    // ดู = เข้าแท็บ/งานอบรมของโครงการที่อยู่ในทีม · เพิ่ม = เปิดอบรม · ลบ = เคลียร์ข้อมูล/ปิดอบรม · นำเข้าข้อมูล = แถวถัดไป
    { id:'impl_training', g:'Workspace', label:'ติดตามสถานะโครงการ › อบรม', icon:'school' },
    // ปุ่ม 📥 นำเข้าข้อมูล (CSV/Excel) ในแท็บอบรมของโครงการ — แยกจาก "เพิ่ม" ของแถวบน · ใช้แค่สิทธิ์ "ดู" (ต้องดูแถวบนได้ด้วย)
    { id:'impl_training_import', g:'Workspace', label:'ติดตามสถานะโครงการ › อบรม › นำเข้าข้อมูล', icon:'table-import' },
    { id:'all_issues',   g:'Workspace', label:'ภาพรวมปัญหาการใช้งาน', icon:'alert-hexagon' },
    // ระบบอบรม + ระบบสอบ (/training/) — view-training ฝังหน้า /training/?embed=1 (src/modules/training.js) ใช้ session เดียวกัน
    { id:'training',     g:'Workspace', label:'ระบบอบรม', icon:'school' },
    { id:'timesheet',    g:'ต้นทุน', label:'Timesheet',      icon:'clock-hour-4' },
    { id:'budget',       g:'ต้นทุน', label:'งบประมาณ & ค่าใช้จ่าย', icon:'wallet' },
    { id:'cost',         g:'ต้นทุน', label:'งบประมาณ › รายการค่าใช้จ่าย', icon:'receipt' },
    // แนะนำทีม — ตัวการ์ตูน 3D ของสมาชิกหมุนสลับ (src/modules/team-showcase.js) · แก้ = จัดทีม/สี/คลังรูป
    { id:'team_showcase', g:'ทีม', label:'แนะนำทีม',      icon:'friends' },
    { id:'workload',     g:'ทีม', label:'สรุปภาระงาน',    icon:'chart-arrows-vertical' },
    // แผนที่ทีม 3 มิติ — ทีมลงพื้นที่จังหวัดไหน/เส้นทางรายเดือน จากโครงการ + รพ. (src/modules/team-map.js) · ใช้แค่สิทธิ์ ดู
    { id:'team_map',     g:'ทีม', label:'แผนที่ทีม',       icon:'map-2' },
    { id:'availability', g:'ทีม', label:'ทีมว่าง',         icon:'users-group' },
    { id:'calendar',     g:'ทีม', label:'ปฏิทินทีม',      icon:'calendar-event' },
    // ขอใช้งานทีม Server (src/modules/server-request.js) · อนุมัติ = อนุมัติ/ไม่อนุมัติคำขอ · แก้ = จัดคน/ตั้งค่าตัวเลือก
    { id:'server_request', g:'ทีม', label:'ขอใช้งานทีม Server', icon:'server', approve:true },
    { id:'leave',        g:'ทีม', label:'การลางาน',       icon:'calendar-off', scope:true },
    { id:'worklog',      g:'ทีม', label:'บันทึกงาน',       icon:'notes' },
    { id:'targets',      g:'ทีม', label:'เป้าหมายทีม',    icon:'target-arrow' },
    { id:'helpdesk',     g:'ศูนย์ช่วยเหลือ', label:'ศูนย์ช่วยเหลือ',   icon:'headset' },
    // ผู้ช่วยทีม — แชทถามคำตอบ/โค้ดที่ทีมเก็บไว้ (src/modules/assist.js) · เพิ่ม/แก้/ลบ = จัดการคลังคำตอบ
    { id:'assist',       g:'ศูนย์ช่วยเหลือ', label:'ผู้ช่วยทีม',      icon:'messages' },
    // ตรวจไฟล์ข้อมูลพื้นฐาน (Excel/CSV) — แถบในเมนู ผู้ช่วยทีม (src/modules/datacheck.js) · ใช้แค่สิทธิ์ "ดู"
    { id:'datacheck',    g:'ศูนย์ช่วยเหลือ', label:'ผู้ช่วยทีม › ตรวจไฟล์ข้อมูลพื้นฐาน', icon:'file-search' },
    { id:'hospital',     g:'ข้อมูลอ้างอิง', label:'รายชื่อ รพ.',     icon:'building-hospital' },
    { id:'contract',     g:'ข้อมูลอ้างอิง', label:'ข้อมูลสัญญา',     icon:'file-description' },
    { id:'admin',        g:'ระบบ', label:'Admin Panel',    icon:'settings' },
    { id:'holiday',      g:'ระบบ', label:'วันหยุด',         icon:'calendar-star' },
  ];

  // ── Module ที่เป็นแท็บย่อยในเมนูอื่น: moduleId → module ของปุ่มเมนูที่ต้องไฮไลต์ ──
  window.NAV_PARENT = {
    expense_form: 'advance',
    cost:         'budget',
    availability: 'workload',
    datacheck:    'assist',
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
    datacheck:    'view-datacheck',
    server_request: 'view-server-request',
    all_issues:   'view-all-issues',
    training:     'view-training',
    team_showcase: 'view-team-showcase',
    team_map:     'view-team-map',
    admin:        'view-admin',
  };

  // ── Default Route ──

})();
