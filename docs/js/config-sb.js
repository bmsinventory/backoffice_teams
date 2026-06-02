// config-sb.js — เหมือน config.js แต่ใช้ Supabase แทน Firebase
// supabase-adapter.js โหลดก่อนไฟล์นี้และตั้งค่า window.getColRef / window.getDocRef แล้ว

// ── Global data stores ──
window.STAGES = [];
window.PTYPES = [];
window.STAFF = [];
window.USERS = [];
window.PROJECTS = [];
window.ADVANCES = [];
window.CONTRACTS = [];
window.DEPARTMENTS = ['IT','Finance','PM','HR','Marketing','Operations','Procurement','Other'];
window.DEPT_LIST = [];
window.POSITIONS = [];
window.PGROUPS = [];
window.LODGINGS = [];
window.HOLIDAYS = [];
window.LEAVES = [];
window.TIMESHEETS = [];
window.COSTS = [];
window.NOTIFY_TOKEN = '';
window.NOTIFY_ADVANCE_TOKEN = '';
window.NOTIFY_PROJECT_TOKEN = '';
window.NOTIFY_PROXY_URL = '';

window.AFLW=[
  {id:'draft',label:'Draft',color:'#9ba3b8'},
  {id:'pending',label:'รออนุมัติ',color:'#ffa62b'},
  {id:'approved',label:'อนุมัติแล้ว',color:'#4361ee'},
  {id:'disbursed',label:'เบิกแล้ว',color:'#7c5cfc'},
  {id:'clearing',label:'รอเคลียร์',color:'#ff6b6b'},
  {id:'cleared',label:'เคลียร์แล้ว',color:'#06d6a0'},
];
window.ANXT={draft:'pending',pending:'approved',approved:'disbursed',disbursed:'clearing',clearing:'cleared'};
window.APRV={pending:'draft',approved:'pending',disbursed:'approved',clearing:'disbursed',cleared:'clearing'};
window.THMON=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
window.DNAMES=['อา','จ','อ','พ','พฤ','ศ','ส'];
window.PCOLS=['#4361ee','#7c5cfc','#ff6b6b','#06d6a0','#ffa62b','#4cc9f0','#f72585','#3a0ca3'];
window.AVBG=['#7c5cfc','#ff6b6b','#06d6a0','#ffa62b','#4cc9f0','#f72585','#4361ee','#3a0ca3'];

window.IMPORT_SCHEMAS = {
  'PROJECTS': { idField:'project_id',prefix:'P', headers:["project_name","group_id","site_owner","type_id","stage_id","budget","start_date","end_date","revisit_1","revisit_2","progress_pct","note","pm_staff_id"], example:["โครงการตัวอย่าง A","","คุณสมชาย","gen","init","100000","2026-01-01","2026-12-31","","","0","หมายเหตุ",""] },
  'STAFF': { idField:'staff_id',prefix:'S', headers:["full_name","nickname","department","position","email","phone","start_date","birth_date","is_active","remark"], example:["สมชาย ใจดี","ชาย","IT","Developer","somchai@test.com","0812345678","2024-01-01","1990-01-01","TRUE",""] },
  'USERS': { idField:'user_id',prefix:'U', headers:["username","password","name","role","is_active"], example:["newuser","pass1234","ชื่อผู้ใช้","viewer","TRUE"] },
  'ADVANCES': { idField:'advance_id',prefix:'A', headers:["project_id","purpose","amount_requested","amount_cleared","request_date","due_date","status","note","advance_no"], example:["P123","ค่าที่พัก","5000","0","2026-01-10","2026-01-20","draft","","ADV-001"] },
  'PGROUPS': { idField:'group_id',prefix:'GRP', headers:["label_th","color_hex"], example:["ภาคเหนือ","#4361ee"] },
  'PTYPES': { idField:'type_id',prefix:'T', headers:["label_th","color_hex"], example:["งานติดตั้ง","#06d6a0"] },
  'POSITIONS': { idField:'position_id',prefix:'POS', headers:["label_th"], example:["Project Manager"] },
  'DEPARTMENTS': { idField:'dept_id',prefix:'DEPT', headers:["label_th"], example:["ฝ่ายไอที"] },
  'TIMESHEETS': { idField:'timesheet_id',prefix:'TS', headers:["project_id","staff_id","work_date","hours","category","description"], example:["P001","S001","2026-04-01","8","fieldwork","สำรวจพื้นที่โครงการ"] },
  'COSTS': { idField:'cost_id',prefix:'CST', headers:["project_id","staff_id","category","amount","cost_date","description","receipt_no"], example:["P001","S001","travel","1500","2026-04-01","ค่าเดินทางไปพื้นที่","RCT-001"] }
};

window.isDbLoaded = false;
window.cu = null;
window.SETTINGS = {
  allowance_weekday_normal: 350,
  allowance_holiday_normal: 650,
  allowance_weekday_border: 650,
  allowance_holiday_border: 1250,
};

// ── LABOR HELPERS ──────────────────────────────────────────────────────────────
window.getStaffDailyRate = function(staffId) {
  var s = window.STAFF.find(function(x){return x.id===staffId;});
  if(!s) return 0;
  if(s.dailyRate != null && s.dailyRate > 0) return s.dailyRate;
  var pos = window.POSITIONS.find(function(p){return p.label===s.role;});
  return pos ? pos.dailyRate : 0;
};

window.getAllowanceRate = function(isBorder, isHoliday) {
  var st = window.SETTINGS;
  if(isBorder)  return isHoliday ? st.allowance_holiday_border  : st.allowance_weekday_border;
  return isHoliday ? st.allowance_holiday_normal : st.allowance_weekday_normal;
};

window.countWorkDays = function(startStr, endStr) {
  if(!startStr || !endStr) return 0;
  var s = window.pd(startStr), e = window.pd(endStr);
  var count = 0;
  var cur = new Date(s);
  while(cur <= e) {
    var dow = cur.getDay();
    var ds = cur.getFullYear()+'-'+String(cur.getMonth()+1).padStart(2,'0')+'-'+String(cur.getDate()).padStart(2,'0');
    var isHol = window.HOLIDAYS.some(function(h){return h.date===ds;});
    if(dow!==0 && dow!==6 && !isHol) count++;
    cur.setDate(cur.getDate()+1);
  }
  return count;
};

window.countLaborDaysInfo = function(sid, startStr, endStr) {
  if(!startStr || !endStr) return {workDays:0, holidayDays:0, leaveDays:0};
  var s = window.pd(startStr), e = window.pd(endStr);
  var workSet = new Set(), holSet = new Set();
  var cur = new Date(s);
  while(cur <= e) {
    var dow = cur.getDay();
    if(dow !== 0 && dow !== 6) {
      var ds = cur.getFullYear()+'-'+String(cur.getMonth()+1).padStart(2,'0')+'-'+String(cur.getDate()).padStart(2,'0');
      var hol = (window.HOLIDAYS||[]).find(function(h){return h.date===ds;});
      if(hol && (hol.type==='company'||hol.type==='both')) holSet.add(ds);
      else workSet.add(ds);
    }
    cur.setDate(cur.getDate()+1);
  }
  var leaveDays = 0;
  if(sid && window.getStaffLeaveConflicts) {
    var sD = window.pd(startStr), eD = window.pd(endStr);
    eD.setHours(23,59,59);
    window.getStaffLeaveConflicts(sid, startStr, endStr)
      .filter(function(x){return x.leave.status!=='rejected';})
      .forEach(function(x){
        var lv=x.leave, ls=window.pd(lv.startDate), le=window.pd(lv.endDate);
        le.setHours(23,59,59);
        var c=new Date(Math.max(ls.getTime(),sD.getTime()));
        var end2=new Date(Math.min(le.getTime(),eD.getTime()));
        while(c<=end2){
          var d2=c.getDay(), ds2=c.getFullYear()+'-'+String(c.getMonth()+1).padStart(2,'0')+'-'+String(c.getDate()).padStart(2,'0');
          if(d2!==0&&d2!==6&&workSet.has(ds2)){workSet.delete(ds2);leaveDays++;}
          c.setDate(c.getDate()+1);
        }
      });
  }
  return {workDays:workSet.size, holidayDays:holSet.size, leaveDays:leaveDays};
};

window.countWorkDaysExcLeave = function(sid, startStr, endStr) {
  if(!startStr || !endStr) return {workDays:0, leaveDays:0, leaveInfo:[]};
  var baseWork = window.countWorkDays(startStr, endStr);
  if(!sid || !window.getStaffLeaveConflicts) return {workDays:baseWork, leaveDays:0, leaveInfo:[]};
  var leaveConflicts = window.getStaffLeaveConflicts(sid, startStr, endStr)
    .filter(function(x){ return x.leave.status !== 'rejected'; });
  if(!leaveConflicts.length) return {workDays:baseWork, leaveDays:0, leaveInfo:[]};
  var sD = window.pd(startStr), eD = window.pd(endStr);
  eD.setHours(23,59,59);
  var leaveWorkDates = new Set();
  leaveConflicts.forEach(function(x){
    var lv = x.leave;
    var ls = window.pd(lv.startDate), le = window.pd(lv.endDate);
    le.setHours(23,59,59);
    var cur = new Date(Math.max(ls.getTime(), sD.getTime()));
    var end = new Date(Math.min(le.getTime(), eD.getTime()));
    while(cur <= end){
      var dow = cur.getDay();
      var ds = cur.getFullYear()+'-'+String(cur.getMonth()+1).padStart(2,'0')+'-'+String(cur.getDate()).padStart(2,'0');
      var isHol = (window.HOLIDAYS||[]).some(function(h){ return h.date===ds; });
      if(dow!==0 && dow!==6 && !isHol) leaveWorkDates.add(ds);
      cur.setDate(cur.getDate()+1);
    }
  });
  var leaveDays = leaveWorkDates.size;
  return { workDays: Math.max(0, baseWork - leaveDays), leaveDays: leaveDays, leaveInfo: leaveConflicts };
};

window.getProjPeriods = function(proj) {
  if (!proj) return [];
  var visits = (proj.visits || []).filter(function(v) { return v.start && v.end; });
  if (visits.length) {
    return visits.slice().sort(function(a,b){return(a.start||'').localeCompare(b.start||'');})
      .map(function(v){return{s:v.start,e:v.end,label:v.purpose||''};});
  }
  if (proj.start || proj.end) return [{ s: proj.start || '', e: proj.end || '' }];
  return [];
};

window._vtMember = function(team, staffId, fallbackStart, fallbackEnd) {
  if (!team || !team.length) return null;
  if (typeof team[0] === 'object') {
    var found = team.find(function(t) { return t.sid === staffId; });
    if (!found) return null;
    return { sid: found.sid, s: found.s || fallbackStart || '', e: found.e || fallbackEnd || '' };
  }
  return team.includes(staffId) ? { sid: staffId, s: fallbackStart || '', e: fallbackEnd || '' } : null;
};
window._vtMembers = function(team, fallbackStart, fallbackEnd) {
  if (!team || !team.length) return [];
  return team.map(function(t) {
    if (typeof t === 'object') return { sid: t.sid, s: t.s || fallbackStart || '', e: t.e || fallbackEnd || '' };
    return { sid: t, s: fallbackStart || '', e: fallbackEnd || '' };
  }).filter(function(m) { return m.sid; });
};

window.advFilter = '';
window.calY = new Date().getFullYear();
window.calM = new Date().getMonth();
window.wlY = new Date().getFullYear();
window.wlM = new Date().getMonth();
window.calView = 'staff';
window.calTime = 'month';
window.editPid = null;
window.editAid = null;
window.delTarget = null;
window.editLdId = null;
window.currentLdPid = null;
window.cStage = null;
window.cBudget = null;
window.kbPid = null;
window.admCur = 'staff';
window._loginRetryInterval = null;

window.isAdmin = function() { return window.cu && window.cu.role === 'admin'; };
window.ce = function() { return window.cu && (window.cu.role === 'admin' || window.cu.role === 'pm'); };
window.cl = function() { return window.cu !== null; };
window.roleLabel = function(r){ return r==='pm'?'DM/PM':r==='viewer'?'Viewer':r?r.toUpperCase():''; };
window.ROLE_PERMISSIONS = {};

window.PERM_MODULES = [
  { id:'overview',     label:'Overview',       icon:'📊' },
  { id:'kanban',       label:'Delivery Board', icon:'📋' },
  { id:'projects',     label:'โครงการ',        icon:'🗂️' },
  { id:'advance',      label:'Advance',        icon:'💰' },
  { id:'lodging',      label:'ที่พัก',          icon:'🏨' },
  { id:'workload',     label:'สรุปภาระงาน',    icon:'📈' },
  { id:'calendar',     label:'ปฏิทินทีม',      icon:'📅' },
  { id:'leave',        label:'การลางาน',       icon:'🏖️' },
  { id:'timesheet',    label:'Timesheet',      icon:'⏱️' },
  { id:'cost',         label:'Cost Tracking',  icon:'💵' },
  { id:'availability', label:'ทีมว่าง',         icon:'👥' },
  { id:'holiday',      label:'วันหยุด',         icon:'🎌' },
  { id:'admin',        label:'Admin Panel',    icon:'⚙️' },
  { id:'targets',      label:'เป้าหมายทีม',    icon:'🎯' },
  { id:'hospital',     label:'รายชื่อ รพ.',     icon:'🏥' },
  { id:'contract',     label:'ข้อมูลสัญญา',     icon:'📄' },
];

function _roleDefaultPerms(role) {
  var full={view:true,add:true,edit:true,del:true};
  var ro={view:true,add:false,edit:false,del:false};
  var none={view:false,add:false,edit:false,del:false};
  var vadd={view:true,add:true,edit:false,del:false};
  if(role==='pm'){return{overview:ro,kanban:full,projects:full,advance:full,lodging:full,workload:ro,calendar:full,leave:full,timesheet:ro,cost:ro,availability:ro,holiday:ro,admin:none,targets:none,hospital:ro,contract:full};}
  if(role==='viewer'){return{overview:ro,kanban:ro,projects:none,advance:full,lodging:full,workload:ro,calendar:ro,leave:vadd,timesheet:ro,cost:ro,availability:ro,holiday:none,admin:none,targets:none,hospital:ro,contract:ro};}
  return{overview:ro,kanban:ro,projects:ro,advance:ro,lodging:ro,workload:ro,calendar:ro,leave:ro,timesheet:ro,cost:ro,availability:ro,holiday:none,admin:none,targets:none,hospital:ro,contract:ro};
}
window.can = function(action,module){
  if(!window.cu) return false;
  var role=window.cu.role;
  if(role==='admin') return true;
  var rp=window.ROLE_PERMISSIONS&&window.ROLE_PERMISSIONS[role];
  var modPerm=rp?rp[module]:null;
  if(!modPerm) modPerm=_roleDefaultPerms(role)[module]||{};
  return !!modPerm[action];
};
window.canView=function(m){return window.can('view',m);};
window.canAdd=function(m){return window.can('add',m);};
window.canEdit=function(m){return window.can('edit',m);};
window.canDel=function(m){return window.can('del',m);};

window.uid=function(){return Math.random().toString(36).slice(2,9);};
window.fc=function(n){return new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',maximumFractionDigits:0}).format(n||0);};
window.fca=function(n){return new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0);};
window.fd=function(s){if(!s)return'-';var d=new Date(s);if(isNaN(d))return'-';return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+(d.getFullYear()+543);};
window.getFY=function(dateStr){if(!dateStr)return'';let d=new Date(dateStr);if(isNaN(d))return'';let y=d.getFullYear();let m=d.getMonth();if(m>=9)y+=1;return y+543;};
window.getYearBE=function(dateStr){if(!dateStr)return'';let d=new Date(dateStr);if(isNaN(d))return'';return d.getFullYear()+543;};
window.pd=function(s){if(!s)return new Date('1970-01-01');let p=s.split('-');if(p.length===3)return new Date(p[0],p[1]-1,p[2]);return new Date(s);};
window.gS=function(id){return window.STAGES.find(s=>s.id===id)||{label:id,color:'#9ba3b8'};};
window.gT=function(id){return window.PTYPES.find(t=>t.id===id)||{label:id,color:'#9ba3b8'};};
window.gG=function(id){return window.PGROUPS.find(g=>g.id===id)||null;};
window.gSt=function(id){return window.STAFF.find(s=>s.id===id)||{name:'?',dept:''};};
window.gC=function(i){return window.PCOLS[i%window.PCOLS.length];};
window.avC=function(i){return window.AVBG[i%window.AVBG.length];};
window.esc=function(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');};

window.getStaffOverlaps=function(sid,startStr,endStr,excludePid){
  if(!startStr||!endStr)return[];
  let sDate=window.pd(startStr);let eDate=window.pd(endStr);eDate.setHours(23,59,59);
  let overlaps=[];
  window.PROJECTS.forEach(p=>{
    if(p.status==='cancelled'||p.status==='completed')return;
    if(excludePid&&p.id===excludePid)return;
    let mems=p.members&&p.members.length>0?p.members:p.team.map(id=>({sid:id,s:p.start,e:p.end}));
    let mbList=mems.filter(m=>m.sid===sid);
    mbList.forEach(mb=>{
      if(mb.s&&mb.e){
        let ms=window.pd(mb.s),me=window.pd(mb.e);me.setHours(23,59,59);
        if(ms<=eDate&&me>=sDate){overlaps.push({project:p,from:ms>sDate?ms:sDate,to:me<eDate?me:eDate});}
      }
    });
  });
  let seen={};
  return overlaps.filter(o=>{if(seen[o.project.id])return false;seen[o.project.id]=true;return true;});
};

window.overlapWarnText=function(overlaps){
  if(!overlaps||!overlaps.length)return'';
  return overlaps.map(function(o){
    return`⚠ มีงานอื่นซ้อนทับ: ${window.esc(o.project.name)} (${window.fd(o.from.toISOString().slice(0,10))} – ${window.fd(o.to.toISOString().slice(0,10))})`;
  }).join('<br>');
};

window.getStaffLeaveConflicts=function(sid,startStr,endStr){
  if(!startStr||!endStr||!window.LEAVES)return[];
  var sDate=window.pd(startStr);var eDate=window.pd(endStr);eDate.setHours(23,59,59);
  var LEAVE_EMOJI={sick:'🤒',vacation:'🏖',personal:'📋',maternity:'🤱',ordain:'🙏',other:'📝'};
  var LEAVE_LABEL={sick:'ลาป่วย',vacation:'ลาพักร้อน',personal:'ลากิจ',maternity:'ลาคลอด',ordain:'ลาบวช',other:'อื่นๆ'};
  return window.LEAVES.filter(function(lv){
    if(lv.staffId!==sid)return false;if(lv.status==='rejected')return false;
    if(!lv.startDate||!lv.endDate)return false;
    var ls=window.pd(lv.startDate),le=window.pd(lv.endDate);le.setHours(23,59,59);
    return ls<=eDate&&le>=sDate;
  }).map(function(lv){return{leave:lv,emoji:LEAVE_EMOJI[lv.leaveType]||'📝',label:LEAVE_LABEL[lv.leaveType]||lv.leaveType};});
};

window.showLoader=function(txt){
  document.getElementById('sys-loader-text').innerHTML=txt||'กำลังโหลดข้อมูล...';
  var pulse=document.querySelector('#sys-loader .pulse');if(pulse)pulse.style.display='inline-block';
  document.getElementById('sys-loader').classList.add('on');
};
window.hideLoader=function(){document.getElementById('sys-loader').classList.remove('on');};

window.showDbError=function(err){
  console.error('Supabase Error:',err);
  var errMsg=err&&err.message?window.esc(err.message):'';
  var isNoTable=errMsg.includes('does not exist')||errMsg.includes('relation')||errMsg.includes('42P01');
  var msg='<div style="color:var(--coral);font-weight:bold;font-size:16px;margin-bottom:10px;">❌ ไม่สามารถเชื่อมต่อ Supabase ได้</div>';
  msg+='<div style="font-size:13px;color:var(--txt);text-align:left;background:var(--surface2);padding:14px;border-radius:8px;border:1px solid var(--border);max-width:520px;line-height:1.7;">';
  if(isNoTable){
    msg+='<strong style="color:var(--coral);">⚠ ตารางยังไม่ถูกสร้างใน Supabase</strong><br><br>';
    msg+='กรุณารัน <code>supabase-schema.sql</code> ใน Supabase SQL Editor ก่อน:<br>';
    msg+='<a href="https://supabase.com/dashboard/project/zsxllqiygochmldmtpgc/sql/new" target="_blank" style="color:var(--violet);font-weight:600;">→ เปิด SQL Editor</a><br><br>';
  } else {
    msg+='<strong>ตรวจสอบ:</strong><br>';
    msg+='1. รัน <code>supabase-schema.sql</code> ใน SQL Editor แล้วหรือไม่<br>';
    msg+='2. <code>SUPABASE_URL</code> และ <code>SUPABASE_ANON_KEY</code> ถูกต้อง<br>';
    msg+='3. RLS policy อนุญาต <code>anon</code> หรือไม่<br>';
  }
  if(errMsg) msg+='<code style="font-size:11px;color:var(--coral);word-break:break-all;">'+errMsg+'</code>';
  msg+='</div>';
  msg+='<button onclick="location.reload()" style="margin-top:14px;padding:8px 20px;background:var(--violet);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">🔄 ลองใหม่</button>';
  document.getElementById('sys-loader-text').innerHTML=msg;
  var pulse=document.querySelector('#sys-loader .pulse');if(pulse)pulse.style.display='none';
  document.getElementById('sys-loader').classList.add('on');
};
