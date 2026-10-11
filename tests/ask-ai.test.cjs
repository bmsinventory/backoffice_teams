const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global;
// DOM จำลองขั้นต่ำ — ask-ai.js สร้างหน้าต่างแชทเอง แล้วเขียนคำตอบลงบับเบิลของบอทใน #ask-msgs
function el(tag) {
  return {
    tagName: tag, className: '', innerHTML: '', value: '', disabled: false, style: {},
    children: [], isConnected: true,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(child) { this.children.push(child); return child; },
    querySelector(sel) { return sel === '.ask-bubble' ? (this.bubble ||= el('div')) : null; },
    querySelectorAll: () => [],
    focus() {},
    remove() { this.isConnected = false; },
  };
}
const elements = {};
for (const id of ['ask-chat', 'ask-q', 'ask-btn', 'ask-msgs']) elements[id] = el(id);
global.localStorage = { getItem: () => null, setItem() {} };
global.document = {
  readyState: 'complete',
  body: el('body'),
  getElementById: (id) => elements[id],
  createElement: el,
  addEventListener: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
};
// AI สรุปคำตอบไม่ได้ → แสดงรายการจริงจากโค้ดอย่างเดียว (สิ่งที่ test ตรวจ)
global.aiChat = async () => { throw new Error('summary disabled in test'); };
global.esc = (value) => String(value ?? '');
global.canView = () => true;
global.fd = (value) => value;
global.staffByRef = (id) => ({ id, dept: 'IT' });
global.staffNickByRef = (id) => ({ S1: 'เอ', S2: 'บี' }[id] || '');

const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const ym = `${year}-${month}`;
// วันที่ที่แสดงเป็นแบบไทย เช่น "1 ต.ค. 2569"
const thMonth = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][now.getMonth()];
const monthStart = `📅 1 ${thMonth} ${year + 543} –`;
global.LEAVES = [
  { id: 'L1', staffId: 'S1', leaveType: 'sick', startDate: `${ym}-10`, endDate: `${ym}-11`, status: 'approved', note: '' },
  { id: 'L2', staffId: 'S2', leaveType: 'personal', startDate: `${ym}-12`, endDate: `${ym}-12`, status: 'rejected', note: '' },
];
global.HOLIDAYS = [
  { id: 'H1', name: 'วันทดสอบ', date: `${ym}-15`, type: 'company' },
];

let aiPlan = {};
global.aiChatJson = async () => {
  if (aiPlan instanceof Error) throw aiPlan;
  return aiPlan;
};

vm.runInThisContext(fs.readFileSync('docs/src/modules/ask-ai.js', 'utf8'));

async function ask(question, plan) {
  elements['ask-q'].value = question;
  const basePlan = {
    source: 'none', understood: 'ทดสอบ', hospital: '', keyword: '', person: '', status: 'all',
    priority: [], severity: [], minAgeDays: 0, unassigned: false, overdue: false,
    dateFrom: '', dateTo: '', groupBy: 'none', sort: 'newest',
  };
  aiPlan = plan instanceof Error ? plan : Object.assign(basePlan, plan);
  await global.askAiRun();
  const msgs = elements['ask-msgs'].children;
  return msgs[msgs.length - 1].querySelector('.ask-bubble').innerHTML;
}

(async () => {
  const leaveHtml = await ask('เดือนนี้มีลาไหม', {
    source: 'none', keyword: 'เดือนนี้มีลาไหม', person: 'ใคร', status: 'open', dateFrom: '2000-01-01', dateTo: '2000-01-31',
  });
  assert.match(leaveHtml, /การลางาน/);
  assert.match(leaveHtml, /พบ <b>1<\/b> คน/);
  assert.ok(leaveHtml.includes(monthStart), 'ช่วงวันที่ผิดจาก AI ต้องถูกแทนด้วยเดือนนี้');

  const rejectedHtml = await ask('เดือนนี้มีใบลาที่ไม่อนุมัติไหม', { source: 'projects', status: 'all' });
  assert.match(rejectedHtml, /ไม่อนุมัติ/);
  assert.match(rejectedHtml, /พบ <b>1<\/b> คน/);
  assert.match(rejectedHtml, /บี — ลากิจ/);

  const holidayHtml = await ask('เดือนนี้มีวันหยุดไหม', { source: 'leaves', keyword: 'วันหยุด' });
  assert.match(holidayHtml, /วันหยุด/);
  assert.match(holidayHtml, /วันทดสอบ/);

  const allHtml = await ask('เดือนนี้ในระบบมีอะไรบ้าง', { source: 'none', keyword: 'มีอะไรบ้าง', status: 'open' });
  assert.match(allHtml, /ทุกข้อมูลในระบบ/);
  assert.match(allHtml, /เอ — ลาป่วย/);
  assert.match(allHtml, /วันทดสอบ/);

  const fallbackHtml = await ask('เดือนนี้มีลาไหม', new Error('AI unavailable'));
  assert.match(fallbackHtml, /AI ตีความภาษาไม่พร้อม/);
  assert.match(fallbackHtml, /เอ — ลาป่วย/);

  console.log('ask-ai regression tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
