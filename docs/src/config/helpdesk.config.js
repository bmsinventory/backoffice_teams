/**
 * helpdesk.config.js — Helpdesk (ศูนย์ช่วยเหลือ): Constants & Global Stores
 * โมดูล 'helpdesk' — เก็บเฉพาะปัญหาลูกค้า (โรงพยาบาล)
 * ต้องโหลดก่อน helpdesk.service.js และ js/helpdesk.js
 *
 * ชื่อ global store ตัวพิมพ์ใหญ่ = ชื่อ table lowercase อัตโนมัติ (ดู _sbName ใน db.service.js)
 *   HELPDESK_TICKETS  → helpdesk_tickets
 */
(function () {

  // ── Global Data Stores ──
  window.HELPDESK_TICKETS    = [];
  window.HELPDESK_CATEGORIES = [];
  window.HELPDESK_SLA        = [];

  // ── Status Flow / Priority / ความเร่งด่วน — ชุด id คงที่ (ผูกกับ logic คำนวณ SLA, ลำดับ workflow
  // ฯลฯ ทั่วทั้งแอป) Admin ปรับได้แค่ label/color/icon (และ priority mapping ของความเร่งด่วน) ผ่าน
  // Admin Panel → "ตัวเลือกแจ้งปัญหา" ไม่ใช่เพิ่ม/ลบรายการ — ดู hdApplyOptionOverrides ใน
  // helpdesk.service.js ที่ merge ค่าที่ Admin ตั้งไว้ (เก็บใน settings.app) ทับชุดค่าเริ่มต้นนี้ ──
  window.HD_STATUS_DEFAULTS = [
    { id:'new',          label:'ใหม่',            color:'#9ba3b8', icon:'🆕', open:true  },
    { id:'triage',       label:'กำลังจัดหมวด',    color:'#7c5cfc', icon:'🗂', open:true  },
    { id:'assigned',     label:'มอบหมายแล้ว',     color:'#4361ee', icon:'📌', open:true  },
    { id:'in_progress',  label:'กำลังดำเนินการ',  color:'#4361ee', icon:'🔧', open:true  },
    { id:'pending_user', label:'รอข้อมูลจากผู้แจ้ง', color:'#ffa62b', icon:'⏳', open:true, pauseSla:true },
    { id:'resolved',     label:'แก้ไขแล้ว',       color:'#06d6a0', icon:'✅', open:false },
    { id:'closed',       label:'ปิดงาน',          color:'#5b6377', icon:'🔒', open:false },
    { id:'reopened',     label:'เปิดใหม่',        color:'#ff6b6b', icon:'♻️', open:true  },
    { id:'cancelled',    label:'ยกเลิก',          color:'#9ba3b8', icon:'🚫', open:false },
  ];

  window.HD_PRIORITY_DEFAULTS = [
    { id:'p1', label:'P1 วิกฤต',    short:'P1', color:'#e5484d' },
    { id:'p2', label:'P2 สูง',      short:'P2', color:'#c9820c' },
    { id:'p3', label:'P3 ปานกลาง',  short:'P3', color:'#4361ee' },
    { id:'p4', label:'P4 ต่ำ',      short:'P4', color:'#5b6377' },
  ];

  // ── ความเร่งด่วนแบบผู้แจ้งเลือก (map → priority เบื้องต้น, Agent ปรับได้) ──
  window.HD_URGENCY_DEFAULTS = [
    { id:'blocked', label:'ทำงานไม่ได้เลย',    priority:'p2' },
    { id:'partial', label:'กระทบบางส่วน',       priority:'p3' },
    { id:'ask',     label:'สอบถาม / ขอปรับแต่ง', priority:'p4' },
  ];

  // ── สำเนาที่ใช้งานจริงทั้งแอป — hdApplyOptionOverrides ใน helpdesk.service.js จะ reassign
  // ตัวแปรเหล่านี้ใหม่ทุกครั้งที่ settings.app เปลี่ยน (merge default + override) ──
  window.HD_STATUS   = window.HD_STATUS_DEFAULTS.map(function (x) { return Object.assign({}, x); });
  window.HD_PRIORITY = window.HD_PRIORITY_DEFAULTS.map(function (x) { return Object.assign({}, x); });
  window.HD_URGENCY  = window.HD_URGENCY_DEFAULTS.map(function (x) { return Object.assign({}, x); });

  // ── ช่องทางรับแจ้ง ──
  window.HD_CHANNEL = [
    { id:'line',   label:'LINE (เจ้าหน้าที่แจ้งแทน)' },
    { id:'web',    label:'ฟอร์มเว็บ (ลูกค้าแจ้งเอง)' },
    { id:'phone',  label:'โทรศัพท์' },
    { id:'import', label:'นำเข้าจากระบบเดิม' },
  ];

  // ── ชนิด Event ใน timeline ──
  window.HD_EVENT_TYPE = {
    comment:       { label:'ความคิดเห็น',        icon:'💬' },
    status_change: { label:'เปลี่ยนสถานะ',       icon:'🔄' },
    assignment:    { label:'มอบหมายงาน',         icon:'📌' },
    field_change:  { label:'แก้ไขข้อมูล',        icon:'✏️' },
    attachment:    { label:'แนบไฟล์',            icon:'📎' },
    rating:        { label:'ให้คะแนน',           icon:'⭐' },
    system:        { label:'ระบบ',               icon:'⚙️' },
  };

  // ── หมายเหตุ: "ระบบที่ใช้งาน" ในฟอร์มไม่มีรายการของตัวเอง — ดึงชื่อมาจาก window.HSP_PRODUCTS
  // (คลัง Product เดิมที่จัดการได้ที่ Admin Panel → "📦 Product" อยู่แล้ว) ตอน build dropdown ใน
  // helpdesk.js โดยตรง ไม่ต้องเก็บ store แยก ──

  // ── เวลาทำการ (ใช้คำนวณ due date ฝั่ง client — P0 ไม่มีงานเบื้องหลัง) ──
  window.HD_BIZ_HOURS = { startMin: 8 * 60 + 30, endMin: 17 * 60 + 30, days: [1,2,3,4,5] }; // จ–ศ 08:30–17:30

  // ── AI ช่วยวิเคราะห์ (ตัวเรียก AI กลาง: src/services/ai.service.js) ──
  window.HD_AI_SYSTEM_PROMPT =
    'คุณเป็นผู้ช่วยทีม Helpdesk ของบริษัทซอฟต์แวร์โรงพยาบาล วิเคราะห์ปัญหาที่ผู้ใช้แจ้ง ' +
    'แล้วตอบกลับ "เฉพาะ JSON" (ไม่มีข้อความอื่น ไม่มี markdown) ตามรูปแบบนี้เท่านั้น: ' +
    '{"category_id":"<id หมวดจากรายการที่ให้ หรือ empty ถ้าไม่แน่ใจ>",' +
    '"priority":"p1|p2|p3|p4",' +
    '"resolution_hint":"<แนวทางแก้ไขเบื้องต้นสั้น ๆ ภาษาไทย 1–3 ประโยค>",' +
    '"confidence":"low|medium|high",' +
    '"reason":"<เหตุผลสั้น ๆ ภาษาไทย>"}. ' +
    'p1=ระบบใช้งานไม่ได้ทั้ง รพ., p2=ฟังก์ชันหลักใช้ไม่ได้บางส่วน, p3=ปัญหาทั่วไป, p4=สอบถาม/ขอปรับแต่ง.';
  // ร่างข้อความตอบผู้แจ้ง (เจ้าหน้าที่ รพ.) — ตอบเป็นข้อความล้วน พร้อมวางลงช่องตอบกลับ
  window.HD_AI_REPLY_PROMPT =
    'คุณเป็นเจ้าหน้าที่ Helpdesk ของบริษัทซอฟต์แวร์โรงพยาบาล ร่างข้อความตอบกลับเจ้าหน้าที่โรงพยาบาลที่แจ้งปัญหา ' +
    'เป็นภาษาไทย สุภาพ กระชับ เป็นกันเอง ใช้คำลงท้าย "ครับ/ค่ะ" แบบ "ครับ" · ' +
    'ถ้ามีวิธีแก้ให้อธิบายเป็นขั้นตอนสั้น ๆ ที่ผู้ใช้ทำตามได้ · ถ้ายังต้องใช้ข้อมูลเพิ่ม ให้ถามเฉพาะสิ่งที่จำเป็น · ' +
    'ห้ามเปิดเผยเนื้อหา "โน้ตภายใน" ตรง ๆ (ใช้เป็นข้อมูลประกอบได้) · ห้ามแต่งข้อเท็จจริงหรือสัญญาเวลาที่ไม่มีในข้อมูล · ' +
    'ตอบเฉพาะตัวข้อความที่จะส่ง ไม่ต้องมีหัวข้อ คำอธิบาย หรือ markdown';

  // ── อายุ Ticket ค้าง (aging buckets) สำหรับแดชบอร์ด ──
  window.HD_AGING = [
    { id:'d0', label:'0–1 วัน',  maxDays:1  },
    { id:'d1', label:'1–3 วัน',  maxDays:3  },
    { id:'d3', label:'3–7 วัน',  maxDays:7  },
    { id:'d7', label:'> 7 วัน',  maxDays:Infinity },
  ];

  // ── UI State ──
  window.hdTab      = 'queue';   // queue | mine | dashboard
  window.hdFilter   = { q:'', status:'', priority:'', assignee:'', category:'' };
  window.hdOpenId   = null;      // ticket id ที่เปิดหน้ารายละเอียดอยู่ (null = แสดงตาราง)
  window.hdEditId   = null;      // ticket id ที่กำลังแก้ใน modal (null = สร้างใหม่)
  window.hdPage     = 1;         // หน้าปัจจุบันของตารางทะเบียน
  window.hdPageSize = 50;        // จำนวนแถว/หน้า — ตัวเลือก: 50/100/500/1000

})();
