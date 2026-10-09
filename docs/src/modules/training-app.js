/* ================================================================
   training-app.js — หน้าระบบอบรม /training/ (ลงทะเบียน · เช็คชื่อ · Analytics · ผู้ดูแล)
   หน้าหลักของ training/index.html (<template id="trn-page-app">) — โหลดโดย src/utils/training-page.util.js · ฝังใน Backoffice ผ่าน src/modules/training.js (iframe ?embed=1)
   ลิงก์/รูปในไฟล์นี้คำนวณจากตำแหน่งหน้า (/training/) ไม่ใช่ตำแหน่งไฟล์นี้
================================================================ */
/* ══════════════════════════════════════════════
   DATA STORE
══════════════════════════════════════════════ */
const CM={
  blue:  {bg:'#e8f0fb',c:'#1a56a0',g1:'#1e3a8a',g2:'#2563eb'},
  teal:  {bg:'#d1fae5',c:'#065f46',g1:'#0f766e',g2:'#0d9488'},
  amber: {bg:'#fef3c7',c:'#92400e',g1:'#b45309',g2:'#d97706'},
  red:   {bg:'#fee2e2',c:'#991b1b',g1:'#9f1239',g2:'#e11d48'},
  purple:{bg:'#ede9fe',c:'#5b21b6',g1:'#4c1d95',g2:'#7c3aed'},
  green: {bg:'#dcfce7',c:'#166534',g1:'#14532d',g2:'#16a34a'}
};

// หลักสูตรอบรม = ของกลาง (trn_categories) · allCategories = ทุกหลักสูตร · categories = เฉพาะที่เปิดในโครงการนี้ (trn_site_categories)
let allCategories=[],categories=[];
let venues=[],departments=[],prefixes=[];
// วิทยากร = พนักงานในระบบ (ตาราง staff ของ Backoffice) [{id,name,nickname,position}]
let trainerStaff=[];
const _staffName=id=>{const t=trainerStaff.find(x=>x.id===id);return t?t.name:(id||'');}
// impl_projects / projects (โหลดใน loadAllData) — ใช้หาทีมของโครงการ (กรองตามสิทธิ์ + ตัวเลือกวิทยากร)
let _implRows=[],_projRows=[];
let sessions=[];
let registrations=[];
let locations=[];
let allSessionsFull=[];
let loginVerifyData=[];
let _lvEdits={};
let keyEntryData=[];
let keSearchTxt='';
let _keReasonTimers={};
let selectedCatId=null,selectedSessId=null,sessFilt='all';
let scanStream=null,scanLog=[],scanInterval=null,currentFacingMode='environment',_scanLogIds=new Set();
let _charts={};
let isAdminLoggedIn=false;
let currentAdminUser=null;
// Token แจ้งเตือนลงทะเบียน: Token กลาง (settings.notify_training_token จาก Admin Panel ของ Backoffice)
// + ค่าทับรายโครงการ siteNotifyTokens[รหัส] = token เฉพาะโครงการ | NOTIFY_OFF · ไม่มี key = ใช้ Token กลาง
const NOTIFY_OFF='off';
let globalNotifyToken='';
let siteNotifyTokens={};
const _siteNotifyToken=code=>{const v=siteNotifyTokens[code];return v===NOTIFY_OFF?'':(v||globalNotifyToken);};
let pendingPage='admin';
// โครงการ = รหัสโครงการ (trn_sites.code เช่น 10700-01) — 1 โครงการในติดตามสถานะโครงการ = 1 การอบรม
// ไม่ระบุ ?site= → ใช้โครงการแรก (ตั้งตอนโหลดข้อมูล)
let HOME_SITE=new URLSearchParams(location.search).get('site')||'';
/* ── ฝังอยู่ใน Backoffice (เมนู "ระบบอบรม" เปิดหน้านี้ใน iframe ด้วย ?embed=1) ──
   ซ่อนแถบเมนูของตัวเอง ให้แถบแท็บ/เลือกโครงการของ Backoffice คุมแทน (Backoffice เรียก showPage / embedGo ตรง ๆ ได้
   เพราะโดเมนเดียวกัน) · ทุกครั้งที่หน้า/โครงการ/สถานะ Login เปลี่ยน แจ้งกลับไปที่ parent.trnEmbedState ── */
const EMBED=new URLSearchParams(location.search).get('embed')==='1'&&window.parent!==window;
/* ── เปิดจาก Backoffice 2 แบบ (ทั้งคู่ ?embed=1):
   ?project=<รหัสโครงการในติดตามสถานะโครงการ> = แท็บ "🎓 อบรม" ของโครงการ — ล็อกโครงการเดียว ไม่มีตัวเลือกโครงการ
   ?view=overview = เมนู "ระบบอบรม" — ภาพรวมทุกโครงการ + ตั้งค่ากลาง (ตามสิทธิ์) + ตั้งค่าของ Admin ── */
const _qs=new URLSearchParams(location.search);
let PROJECT_ID=_qs.get('project')||''; // เปลี่ยนได้ผ่าน embedOpenProject
const OVERVIEW=_qs.get('view')==='overview';
// แท็บอบรมของโครงการ: เมนูซ้ายของ Backoffice (src/modules/training.js) คุมหน้าทั้งหมด รวมแท็บย่อยของผู้ดูแล → ซ่อนแถบแท็บ/การ์ดสถิติของหน้า Admin
if(EMBED&&PROJECT_ID)document.documentElement.classList.add('trn-embed-proj');
function _embedNotify(){
  if(!EMBED)return;
  try{
    const act=document.querySelector('.page.active');
    const loc=locations.find(l=>l.code===currentSite);
    // ส่ง iframe ตัวเองไปด้วย — Backoffice มีได้ 2 iframe (เมนูอบรม + แท็บอบรมของโครงการ) แถบควบคุมคนละชุด
    let page=act?act.id.replace('page-',''):'register';
    if(page==='admin'){const t=document.querySelector('.admin-tab.active');if(t)page='admin:'+t.dataset.tab;}
    window.parent.trnEmbedState&&window.parent.trnEmbedState({
      page,
      tabs:isAdminLoggedIn?getMyAllowedTabs():null, // แท็บย่อยผู้ดูแลที่มีสิทธิ์ (null = ยังไม่ Login)
      site:currentSite,
      siteName:loc?loc.name:'',
      sites:locations.map(l=>({code:l.code,name:l.name})),
      canSwitch:isAdminLoggedIn&&!PROJECT_ID&&!OVERVIEW,
      admin:isAdminLoggedIn,
      superadmin:currentAdminUser?.role==='superadmin',
    },window.frameElement);
  }catch(e){}
}
let currentSite=HOME_SITE;

let _liveQuizTitle={}; // แบบทดสอบในคลังกลางที่เปิดใช้งาน {id: ชื่อ} — แสดงในหน้าหลักสูตรอบรมของโครงการ
let _quizCatIds=new Set(); // หลักสูตรอบรมที่เปิดสอบอยู่ (เลือกชุดจากคลังกลาง + quiz_open · src/modules/training-quiz.js อัปเดตเมื่อเลือก/ปิด)

/* ── ไลบรารีหนัก โหลดเฉพาะตอนจะใช้ (เดิมโหลดทั้งหมด ~1.3 MB ก่อนเปิดหน้าได้) ──
   await _needLib('xlsx') → true เมื่อพร้อม · false = โหลดไม่สำเร็จ (แจ้งเตือนแล้ว) · Admin โหลดล่วงหน้าตอนเครื่องว่าง (_prefetchLibs) */
const _LIBS={
  // xlsx/chart/html2canvas = URL เดียวกับ Backoffice (index.html) → เปิดในแท็บอบรมใช้แคชร่วม ไม่โหลดซ้ำ
  xlsx:       {js:'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',        ok:()=>window.XLSX},
  chart:      {js:'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',     ok:()=>window.Chart},
  html2canvas:{js:'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', ok:()=>window.html2canvas},
  cropper:    {js:'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js',   ok:()=>window.Cropper,
               css:'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css'},
  jsqr:       {js:'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',                 ok:()=>window.jsQR}, // ลิงก์ cdnjs เดิมตอบ 404 (สแกน QR ด้วยกล้องโหลดไม่ขึ้น)
  // อ่านข้อความจากไฟล์แนบ (AI ร่างข้อสอบ): PDF / Word (.docx) / PowerPoint (.pptx = zip ของ XML)
  pdfjs:      {js:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',        ok:()=>window.pdfjsLib},
  mammoth:    {js:'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js', ok:()=>window.mammoth},
  jszip:      {js:'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',         ok:()=>window.JSZip},
};
const _libLoading={};
function _loadLib(name){
  const L=_LIBS[name];
  if(L.ok())return Promise.resolve();
  return _libLoading[name]||(_libLoading[name]=new Promise((resolve,reject)=>{
    if(L.css){const l=document.createElement('link');l.rel='stylesheet';l.href=L.css;document.head.appendChild(l);}
    const sc=document.createElement('script');
    sc.src=L.js;
    sc.onload=()=>L.ok()?resolve():reject(new Error(name));
    sc.onerror=()=>{delete _libLoading[name];sc.remove();reject(new Error(name));};
    document.head.appendChild(sc);
  }));
}
async function _needLib(...names){
  try{await Promise.all(names.map(_loadLib));return true;}
  catch(e){showToast('โหลดส่วนประกอบไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่','danger');return false;}
}
function _prefetchLibs(){
  const go=()=>Promise.all(['chart','xlsx','html2canvas'].map(n=>_loadLib(n).catch(()=>{})));
  (window.requestIdleCallback||(f=>setTimeout(f,1500)))(go);
}

/* ══════════════════════════════════════════════
   SUPABASE
══════════════════════════════════════════════ */
// ฐานข้อมูลเดียวกับ Backoffice (ตาราง trn_*) — ค่าจาก ../env-config.js ที่ container สร้างตอน start
const _sb=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
// parallel id arrays for master_items (index matches the string arrays)
let masterIds={venue:[],dept:[],prefix:[]};
// ── ข้อมูลพื้นฐาน (trn_master_items) — รอบอบรม/ผู้ลงทะเบียน/ตรวจสอบสิทธิ์/คีย์ยอด ผูกด้วยรหัส (venue_id/dept_id/prefix_id)
// masterById = ทุกโครงการที่โหลดมา (หน้าผู้ดูแลเห็นผู้ลงทะเบียนหลายโครงการ) · ข้อความที่แสดง = value ของรายการนั้น ──
let masterById={};
const _mVal=id=>id!=null&&masterById[id]?masterById[id].value:'';
// ช่องเลือกในฟอร์มแสดง/เก็บชื่อรายการหลักของโครงการ (ไม่ซ้ำกันตาม unique(type,value,site)) → แปลงเป็นรหัสตอนบันทึก
const _mId=(type,val,site=currentSite)=>{
  if(!val)return null;
  const m=Object.values(masterById).find(x=>x.type===type&&x.site===site&&x.value===val);
  return m?m.id:null;
};
// นำเข้าจากไฟล์: ค่าที่ยังไม่มีในรายการหลัก → เพิ่มเข้ารายการหลักของโครงการให้ แล้วคืนรหัส
async function _ensureMasterId(type,val,site=currentSite){
  if(!val)return null;
  const id=_mId(type,val,site);if(id)return id;
  const sort=Object.values(masterById).filter(x=>x.type===type&&x.site===site).length;
  const {data,error}=await _sb.from('trn_master_items').upsert({type,value:val,sort_order:sort,site},{onConflict:'type,value,site'}).select().single();
  if(error)throw new Error(error.message);
  masterById[data.id]=data;
  return data.id;
}
// ลบไม่ได้เพราะยังมีข้อมูลอ้างอยู่ — 23001 = foreign key แบบ on delete restrict · 23503 = แบบ no action
const _isInUse=e=>e&&(e.code==='23001'||e.code==='23503');
// row mappers: DB → app format
// sc = แถว trn_site_categories ของโครงการนี้ (ไม่มี = ยังไม่เปิดหลักสูตรนี้ในโครงการ)
const _mCat=(r,sc)=>({id:r.id,name:r.name,desc:r.description||'',icon:r.icon||'box',color:r.color||'blue',bannerUrl:r.banner_url||null,quizId:r.quiz_id||null,typeId:r.type_id||'',certCode:r.cert_code||'',enabled:!!sc,quizOpen:!!sc&&sc.quiz_open!==false});
const _mSess=r=>({id:r.id,catId:r.cat_id,name:r.name,date:r.date,timeStart:r.time_start,timeEnd:r.time_end,venueId:r.venue_id??null,venue:_mVal(r.venue_id),trainerId:r.trainer||'',trainer:_staffName(r.trainer),capacity:r.capacity});
const _mReg=r=>({id:r.id,sessionId:r.session_id,prefixId:r.prefix_id??null,prefix:_mVal(r.prefix_id),fname:r.fname,lname:r.lname,position:r.position||'',deptId:r.dept_id??null,dept:_mVal(r.dept_id),email:r.email||'',regDate:r.reg_date,attended:r.attended||false,attendedTime:r.attended_time||null,isWalkin:r.is_walkin||false});
// ตรวจสอบสิทธิ์ Login / คีย์ยอดรายแผนก — เก็บ dept_id · dept = ชื่อแผนก (ใช้แสดง/จับคู่กับรายการแผนก)
const _mDeptRow=r=>({...r,dept:_mVal(r.dept_id)});

async function pushNotify(reg){
  const token=_siteNotifyToken(currentSite);
  if(!token)return;
  const s=getSess(reg.sessionId);
  const loc=locations.find(l=>l.code===currentSite);
  const dateStr=s?fmtDate(s.date):'-';
  const timeStr=s?`${s.timeStart} - ${s.timeEnd} น.`:'-';
  const lines=[
    '📢 มีผู้ลงทะเบียนใหม่',
    `🏢 โครงการ: ${currentSite}${loc?' : '+loc.name:''}`,
    `👤 ชื่อ-สกุล: ${reg.prefix}${reg.fname} ${reg.lname}`,
    `💼 ตำแหน่ง: ${reg.position||'-'}`,
    `🏢 หน่วยงาน: ${reg.dept||'-'}`,
    `📚 หัวข้อ: ${s?`${getCat(s.catId)?.name||'-'} : ${s.name}`:'-'}`,
    `📅 เวลา: ${dateStr} เวลา ${timeStr}`,
  ];
  try{
    await fetch('https://api-notify.bmscloud.in.th/api/v1/push-notify',{
      method:'POST',
      headers:{'Token':token,'Content-Type':'application/json'},
      body:JSON.stringify({content:lines.join('\n'),receiver:null})
    });
  }catch(e){}
}

const ICON_LIST=[
  'box','boxes','package','package-import','package-export','packages',
  'truck','truck-delivery','truck-loading','truck-return',
  'building-warehouse','building-factory','building','building-store',
  'archive','stack','stack-2','layers-subtract',
  'clipboard','clipboard-check','clipboard-list','clipboard-text','clipboard-data',
  'chart-bar','chart-line','chart-pie','trending-up','trending-down',
  'users','user','user-check','user-plus','user-group','user-star',
  'certificate','award','medal','trophy',
  'book','book-2','book-open','books','school',
  'pencil','pencil-plus','edit','notes','presentation',
  'settings','adjustments','adjustments-horizontal','tool','tools',
  'barcode','scan','qrcode',
  'calculator','coin','currency-baht','receipt',
  'list','list-check','list-details','table','database',
  'calendar','calendar-event','clock','alarm',
  'star','heart','flag','tag','tags','bookmark',
  'check-circle','circle-check','alert-circle','info',
  'refresh','arrows-exchange',
  'map-pin','location','compass',
  'forklift','crane',
  'category','category-2','layout-grid','layout-list',
  'recycle','leaf','plant-2',
  'shield','lock','key','eye',
];

const ADMIN_TABS=[
  {id:'sessions',     label:'รอบอบรม'},
  {id:'categories',   label:'หลักสูตร'},
  {id:'masters',      label:'ข้อมูลพื้นฐาน'},
  {id:'registrations',label:'ผู้ลงทะเบียน'},
  {id:'loginverify',  label:'ตรวจสอบสิทธิ์'},
  {id:'keyentry',     label:'ตรวจสอบคีย์ยอด'},
  {id:'survey',       label:'ผลประเมิน'},
  {id:'quiz',         label:'ผลสอบ & ใบประกาศ'},
  {id:'projsettings', label:'ตั้งค่าโครงการ'},
];
const ADMIN_ACTIONS=[
  {id:'action:import',       label:'นำเข้าข้อมูล\n(Import CSV)',   btnId:'btn-import'},
  {id:'action:clear_regs',   label:'เคียร์ผู้ลงทะเบียน\nตามโครงการ', btnId:'btn-clear-regs'},
  {id:'action:clear_survey', label:'เคียร์ผลประเมิน\nตามโครงการ',   btnId:'btn-clear-survey'},
];

/* ══════════════════ HELPERS ══════════════════ */
const getCount=sid=>registrations.filter(r=>r.sessionId===sid).length;
const getAttCount=sid=>registrations.filter(r=>r.sessionId===sid&&r.attended).length;
const getCat=id=>categories.find(c=>c.id===id);
const getSess=id=>sessions.find(s=>s.id===id);
const getReg=id=>registrations.find(r=>r.id===id);
// ถ้าปีใน date string เป็น พ.ศ. (>2500) ให้ลบ 543 ก่อน เพื่อให้ toLocaleDateString('th-TH') แสดง พ.ศ. ถูกต้อง
const _parseDate=d=>{if(!d)return new Date(NaN);const[y,...rest]=String(d).split('-');const yr=parseInt(y);return new Date([yr>2500?yr-543:yr,...rest].join('-'));};
const fmtDate=d=>{if(!d)return'-';return _parseDate(d).toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'})};
const fmtDateShort=d=>{if(!d)return'-';return _parseDate(d).toLocaleDateString('th-TH',{year:'2-digit',month:'short',day:'numeric'})};
const getDay=d=>_parseDate(d).getDate();
const getMon=d=>_parseDate(d).toLocaleDateString('th-TH',{month:'short'});
// สีแถบที่นั่ง (การ์ดหลักสูตร + การ์ดรอบอบรม)
const _fillColor=p=>p>=100?'#DC2626':p>=75?'#D97706':p>=40?'#F59E0B':'#059669';
const capBadge=p=>{
  if(p>=100)return'<span class="badge badge-danger"><i class="ti ti-lock"></i>เต็มแล้ว</span>';
  if(p>=75)return'<span class="badge badge-warn"><i class="ti ti-alert-triangle"></i>ใกล้เต็ม</span>';
  return'<span class="badge badge-success"><i class="ti ti-circle-check"></i>มีที่ว่าง</span>';
};
/* ── Category card helpers ── */
const BMS_TAGS=['PR','PO','Stock','Lot','Exp','BMS','QR','Card','Manual','Real time','LAB','ERP','HR'];
function extractTags(text){return BMS_TAGS.filter(t=>(text||'').includes(t)).slice(0,5);}
function calcDuration(ts,te){
  if(!ts||!te)return'';
  const[sh,sm]=(ts||'09:00').split(':').map(Number);
  const[eh,em]=(te||'16:00').split(':').map(Number);
  const h=Math.floor(((eh*60+em)-(sh*60+sm))/60);
  const rm=((eh*60+em)-(sh*60+sm))%60;
  return h+(rm?'.5':'')+' ชม.';
}
let catSearchTxt='',catStatusFilter='all';
function filterCats(){
  catSearchTxt=document.getElementById('cat-search').value.toLowerCase();
  renderCategories();
}
function setCatFilter(val,el){
  catStatusFilter=val;
  document.querySelectorAll('.cat-filter-pill').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  renderCategories();
}
const nowTime=()=>new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
const sessTxt=s=>s?`${s.timeStart||''} – ${s.timeEnd||''} น.`:'';
/* ── จับคู่ชื่อแบบยืดหยุ่น — ช่องว่างซ้ำ/หัวท้าย · อักษรล่องหน (zero-width) · ตัวพิมพ์เล็ก-ใหญ่ ไม่ทำให้คนเดียวกันกลายเป็นคนละคน
   _nameKey = ถือว่า "ชื่อเดียวกัน" · _nameSim = ความคล้าย 0–1 (bigram เหมือน aiTextSim — ใช้กับภาษาไทยได้) ไว้เตือน "ชื่อใกล้เคียง" ── */
const _normTxt=s=>String(s||'').replace(/[​-‍﻿]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
const _nameKey=(f,l)=>_normTxt(f)+'|'+_normTxt(l);
function _txtSim(a,b){
  const bg=s=>{const t=_normTxt(s).replace(/[\s.\-]/g,''),o={};for(let i=0;i<t.length-1;i++)o[t.substr(i,2)]=1;return o;};
  const A=bg(a),B=bg(b);let inter=0,na=0,nb=0;
  for(const k in A){na++;if(B[k])inter++;}for(const k in B)nb++;
  return(na+nb)?2*inter/(na+nb):0;
}
const _nameSim=(f1,l1,f2,l2)=>_txtSim(f1+l1,f2+l2);
const NAME_NEAR=0.75; // ต่างกัน ~1 ตัวอักษรในชื่อไทยสั้น ๆ ยังจับได้ · คนละชื่อนามสกุลเดียวกันได้ราว 0.5 — ไม่เตือน
// ค่าในรายการหลัก (แผนก/คำนำหน้า) ที่ตรงกับข้อความที่พิมพ์มา — ตรงเป๊ะ > ตรงเมื่อตัดช่องว่าง/ตัวพิมพ์ > คล้ายมาก (≥0.85)
function _matchMaster(val,list){
  if(!val)return null;
  if(list.includes(val))return val;
  const n=_normTxt(val).replace(/\s/g,'');
  const same=list.find(x=>_normTxt(x).replace(/\s/g,'')===n);
  if(same)return same;
  let best=null,bs=0;
  list.forEach(x=>{const s=_txtSim(val,x);if(s>bs){bs=s;best=x;}});
  return bs>=0.85?best:null;
}
function findDupReg(fname,lname,catId,excludeRegId=null){
  const key=_nameKey(fname,lname);
  return registrations.find(r=>{
    if(excludeRegId!=null&&r.id===excludeRegId)return false;
    if(_nameKey(r.fname,r.lname)!==key)return false;
    const s=getSess(r.sessionId);
    return s&&s.catId===catId;
  });
}
// ชื่อใกล้เคียง (ไม่ใช่ชื่อเดียวกัน) ที่ลงทะเบียนหลักสูตรเดียวกันไว้แล้ว — อาจพิมพ์ผิด/สะกดต่างกันของคนเดียวกัน
function findSimilarReg(fname,lname,catId,excludeRegId=null){
  const key=_nameKey(fname,lname);let best=null,bs=0;
  registrations.forEach(r=>{
    if(excludeRegId!=null&&r.id===excludeRegId)return;
    if(_nameKey(r.fname,r.lname)===key)return;
    const s=getSess(r.sessionId);if(!s||s.catId!==catId)return;
    const sc=_nameSim(fname,lname,r.fname,r.lname);
    if(sc>bs){bs=sc;best=r;}
  });
  return bs>=NAME_NEAR?best:null;
}
function canEditReg(reg){
  const s=getSess(reg.sessionId);
  if(!s||reg.attended)return false;
  const today=new Date();today.setHours(0,0,0,0);
  const sessDay=new Date(s.date);sessDay.setHours(0,0,0,0);
  return today<sessDay;
}
/* ── บังคับกรอกอีเมล: เปิดเฉพาะโครงการที่ตั้งค่าไว้ (locations.require_email) ── */
const _emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const siteRequiresEmail=()=>!!locations.find(l=>l.code===currentSite)?.require_email;
function _syncEmailField(wrapId,inputId,val=''){
  const wrap=document.getElementById(wrapId);
  if(wrap)wrap.style.display=siteRequiresEmail()?'':'none';
  const inp=document.getElementById(inputId);
  if(inp)inp.value=val;
}

/* ══════════════════ DB INIT ══════════════════ */
function setLoading(on){document.getElementById('app-loading').classList.toggle('hidden',!on);}
// ดึงทุกแถว — PostgREST ตัดผลที่ max-rows จึงขอทีละหน้าจนครบ (ปกติจบในคำขอเดียว) · mk = ()=>query ใหม่ทุกหน้า
async function _allRows(mk,size=1000){
  const out=[];
  for(let from=0;;from+=size){
    const r=await mk().range(from,from+size-1);
    if(r.error)return{error:r.error};
    out.push(...(r.data||[]));
    if((r.data||[]).length<size)return{data:out};
  }
}
// ผู้ลงทะเบียนของโครงการ (trn_sites.code) — กรองผ่านรอบอบรม (join) ในคำขอเดียว ไม่ต้องรอรู้รหัสรอบก่อน
const _regsOfSites=(codes,cols='*')=>codes.length
  ?_allRows(()=>_sb.from('trn_registrations').select(cols+',trn_sessions!inner(site)').in('trn_sessions.site',codes).order('id'))
  :Promise.resolve({data:[]});
const _NONE=Promise.resolve({data:null});
// คอลัมน์ที่ใช้จริง (เดิม select * — projects มีคอลัมน์อื่นอีกมาก ขนาดเกือบเท่าตัว)
const PROJ_COLS='id,project_id,project_name,pm_staff_id,team,members,hospital_id,type_id';
const _qImpl=()=>_sb.from('impl_projects').select('id,project_name,source_project_id');
const _qProj=()=>_sb.from('projects').select(PROJ_COLS);
// ข้อมูลอ้างอิงที่ไม่ค่อยเปลี่ยน — โหลดตอนเปิดหน้า/สั่งโหลดใหม่ ไม่โหลดซ้ำทุกครั้งที่ Realtime แจ้ง (เช่นทุกครั้งที่เช็คชื่อ)
let _teamReady=false; // impl_projects / projects (ทีมโครงการ)
let _refReady=false;  // พนักงาน · Token แจ้งเตือน · หลักสูตรที่มีแบบทดสอบ
let _early=null;      // คำขอรอบ 1 ที่ initApp ยิงไปพร้อมตรวจ session (ไม่ต้องรอกัน)
// query ของ supabase-js ยังไม่ส่งจนกว่าจะถูก await/then → Promise.resolve ให้เริ่มส่งทันที
function _baseQueries(){
  const go=q=>q&&Promise.resolve(q);
  return{
    loc:go(_sb.from('trn_locations').select('*').order('id')),
    all:OVERVIEW?_NONE:go(_sb.from('trn_sessions').select('id,site,capacity').order('id')), // ภาพรวมโหลดรอบอบรมเองใน renderOverview
    // แท็บอบรมของโครงการใช้ทีมเสมอ (ตัวเลือกวิทยากร) · ภาพรวมใช้เฉพาะคนที่กรองตามทีม (รู้หลังตรวจ session)
    ip:OVERVIEW?null:go(_qImpl()), pj:OVERVIEW?null:go(_qProj()),
  };
}
// light = เรียกจาก Realtime → ใช้ข้อมูลอ้างอิงเดิม โหลดเฉพาะข้อมูลอบรม
async function loadAllData(light=false){
  if(!light){_teamReady=false;_refReady=false;}
  const scoped=_teamScoped();
  const q=_early||_baseQueries();_early=null;
  const needTeam=!_teamReady&&(!OVERVIEW||scoped);
  // รอบ 1 (พร้อมกัน): โครงการที่เปิดอบรม + รอบอบรมทุกโครงการ (id/site เท่านั้น) + ทีมโครงการ
  const [lR,asR,ipR,pR]=await Promise.all([q.loc,q.all,needTeam?(q.ip||_qImpl()):_NONE,needTeam?(q.pj||_qProj()):_NONE]);
  if(lR.error)throw new Error('โหลดข้อมูลล้มเหลว');
  if(needTeam){_implRows=ipR.data||[];_projRows=pR.data||[];_teamReady=!ipR.error&&!pR.error;}
  const mine=scoped?_mySiteCodes(lR.data||[],_implRows,_projRows):null;
  locations=(lR.data||[]).filter(l=>!mine||mine.has(l.code));
  if(PROJECT_ID){const pl=locations.find(l=>l.project_id===PROJECT_ID);currentSite=pl?pl.code:'';} // ยังไม่เปิดอบรม/ไม่อยู่ทีม → ''
  else{
    if(!locations.some(l=>l.code===currentSite)&&locations.length){currentSite=locations[0].code;if(!HOME_SITE)HOME_SITE=currentSite;}
    if(mine&&!locations.length)currentSite='';
  } // ยังไม่อยู่ในทีมโครงการไหนที่เปิดอบรม → ไม่เห็นข้อมูลของใคร
  allSessionsFull=(asR.data||[]);
  if(OVERVIEW)return; // ภาพรวมใช้แค่รายการโครงการ — ตัวเลขโหลดใน renderOverview รอบเดียว
  // ผู้ลงทะเบียน: เฉพาะโครงการที่เปิดอยู่เท่านั้น (ทุกหน้าใช้แค่ของโครงการนี้ · ตัวเลขข้ามโครงการให้ฐานข้อมูลนับ — trn_overview_stats)
  const site=currentSite,none=!site,needRef=!_refReady; // ยังไม่มีโครงการ → ไม่ต้องถามข้อมูลของโครงการ
  const regSites=none?[]:[site];
  // รอบ 2 (พร้อมกัน): ข้อมูลของโครงการ (+ ข้อมูลอ้างอิงถ้ายังไม่มี)
  const [cR,scR,sR,rR,mR,lvR,qzR,snR,stR,gnR,psR]=await Promise.all([
    none?_NONE:_sb.from('trn_categories').select('*').order('id'),
    none?_NONE:_sb.from('trn_site_categories').select('cat_id,quiz_open').eq('site',site),
    none?_NONE:_sb.from('trn_sessions').select('*').eq('site',site).order('id'),
    _regsOfSites(regSites),
    none?_NONE:_sb.from('trn_master_items').select('*').eq('site',site).order('type,sort_order,id'),
    none?_NONE:_sb.from('trn_login_verify').select('*').eq('site',site),
    none?_NONE:_sb.from('trn_quizzes').select('id,title').eq('is_active',true),
    needRef?_sb.from('trn_settings').select('value').eq('key','site_notify_tokens').maybeSingle():_NONE,
    needRef?_sb.from('staff').select('id,staff_id,full_name,nickname,position,is_active'):_NONE,
    needRef?_sb.from('settings').select('notify_training_token').eq('id','app').maybeSingle():_NONE,
    needRef?_sb.from('positions').select('id,position_id,label_th,label'):_NONE, // staff.position = รหัสตำแหน่ง
  ]);
  if(cR.error||scR.error||sR.error||rR.error||mR.error)throw new Error('โหลดข้อมูลล้มเหลว');
  if(needRef){ // ก่อน map รอบอบรม (_mSess ใช้ชื่อวิทยากรจาก trainerStaff)
    const posLabel=Object.fromEntries((psR.data||[]).map(p=>[p.position_id||p.id,p.label_th||p.label||'']));
    trainerStaff=(stR.data||[]).filter(d=>d.is_active!==false&&d.is_active!=='FALSE')
      .map(d=>({id:String(d.staff_id||d.id),name:d.full_name||'',nickname:d.nickname||'',position:posLabel[d.position]||''}))
      .filter(t=>t.name).sort((a,b)=>a.name.localeCompare(b.name,'th'));
    try{siteNotifyTokens=JSON.parse(snR.data?.value||'{}');}catch(e){siteNotifyTokens={};}
    globalNotifyToken=gnR.data?.notify_training_token||'';
    _refReady=!stR.error;
  }
  const scOf=Object.fromEntries((scR.data||[]).map(x=>[x.cat_id,x]));
  allCategories=(cR.data||[]).map(r=>_mCat(r,scOf[r.id]));
  categories=allCategories.filter(c=>c.enabled);
  _liveQuizTitle=Object.fromEntries((qzR.data||[]).map(q=>[q.id,q.title]));
  const liveQz=new Set((qzR.data||[]).map(q=>q.id));
  _quizCatIds=new Set(categories.filter(c=>c.quizOpen&&liveQz.has(c.quizId)).map(c=>c.id));
  // ข้อมูลพื้นฐานก่อน map รอบอบรม/ผู้ลงทะเบียน (_mSess/_mReg แปลงรหัส → ชื่อจาก masterById)
  masterById=Object.fromEntries((mR.data||[]).map(m=>[m.id,m]));
  const ms=(mR.data||[]).filter(m=>m.site===site);
  sessions=(sR.data||[]).map(_mSess);
  registrations=(rR.data||[]).map(_mReg);
  loginVerifyData=(lvR.data||[]).map(_mDeptRow);
  venues=ms.filter(m=>m.type==='venue').map(m=>m.value);
  departments=ms.filter(m=>m.type==='dept').map(m=>m.value);
  prefixes=ms.filter(m=>m.type==='prefix').map(m=>m.value);
  masterIds.venue=ms.filter(m=>m.type==='venue').map(m=>m.id);
  masterIds.dept=ms.filter(m=>m.type==='dept').map(m=>m.id);
  masterIds.prefix=ms.filter(m=>m.type==='prefix').map(m=>m.id);
}
/* ── โครงการที่ผู้ดูแลคนนี้เห็น: Admin = ทุกโครงการ · คนอื่น = โครงการที่ตัวเองเป็น PM/อยู่ในทีม
   (ทีมตามโครงการต้นทางใน Backoffice — ตรรกะเดียวกับติดตามสถานะโครงการ src/utils/project-team.util.js)
   null = ไม่จำกัด (Admin หรือยังไม่ Login — ผู้เข้าอบรมเปิดตามลิงก์ ?site= ของโครงการตัวเอง) ── */
// แถว projects (โครงการต้นทาง) → รูปแบบที่ ProjectTeam ใช้ (เหมือน window.PROJECTS ของ Backoffice)
const _mapProjects=rows=>(rows||[]).map(d=>({id:d.project_id||d.id,name:d.project_name||'',pm:d.pm_staff_id||'',team:d.team||[],members:d.members||[],hospitalId:d.hospital_id||'',typeId:d.type_id||''}));
// ประเภทของโครงการที่กำลังเปิด: impl_projects.source_project_id → projects.type_id
// ใช้กรองรายการหลักสูตรที่เลือกเปิด/สร้างรอบ ไม่ให้ข้ามประเภทโครงการ
function _currentProjectTypeId(){
  const pid=PROJECT_ID||locations.find(l=>l.code===currentSite)?.project_id||'';
  const impl=_implRows.find(p=>String(p.id)===String(pid));
  if(!impl)return'';
  const sourceId=String(impl.source_project_id||'');
  const source=_projRows.find(p=>String(p.id)===sourceId||String(p.project_id||'')===sourceId);
  return source?.type_id||'';
}
function _availableCategories(){
  const typeId=_currentProjectTypeId();
  return typeId?allCategories.filter(c=>c.typeId===typeId):[];
}
const _teamScoped=()=>isAdminLoggedIn&&!!currentAdminUser&&currentAdminUser.role!=='superadmin';
// locs = trn_locations · implRows/projRows = impl_projects / projects (โหลดพร้อมกันใน loadAllData)
function _mySiteCodes(locs,implRows,projRows){
  const a=currentAdminUser;
  if(!a.staffId)return new Set();
  const projects=_mapProjects(projRows);
  const impl=Object.fromEntries((implRows||[]).map(d=>[d.id,{sourceProjectId:d.source_project_id||''}]));
  return new Set(locs.filter(l=>l.project_id&&ProjectTeam.isMember(a.staffId,impl[l.project_id],projects)).map(l=>l.code));
}
function _warnNoProjects(){
  if(_teamScoped()&&!locations.length&&!PROJECT_ID)showToast('บัญชีนี้ยังไม่อยู่ในทีมโครงการที่เปิดอบรม (ผูกบัญชีกับพนักงาน และเพิ่มในทีมโครงการที่ Backoffice)','warn');
}
// Login ระหว่างใช้งาน: Role ที่ไม่ใช่ Admin โหลดใหม่ให้เหลือเฉพาะโครงการของตัวเอง
async function _applySiteScope(){
  if(currentAdminUser?.role==='superadmin')return;
  setLoading(true);
  try{await loadAllData();}catch(e){console.error(e);showToast('โหลดข้อมูลไม่สำเร็จ','danger');}
  setLoading(false);
  _warnNoProjects();
  _syncSiteUI();
}
function _syncSiteUI(){
  const badge=document.getElementById('nav-site-badge');
  const loc=locations.find(l=>l.code===currentSite);
  if(badge)badge.textContent=loc?loc.name:currentSite;
  _embedNotify();
  window._tqaSiteChanged?.(); // src/modules/training-quiz.js — แท็บแบบทดสอบเปิดอยู่ → โหลดของโครงการใหม่
}
async function initApp(){
  setLoading(true);
  // ตรวจ session พร้อมกับยิงคำขอรอบ 1 (ไม่ขึ้นกับสิทธิ์) — รู้สิทธิ์แล้วค่อยกรองตามทีมใน loadAllData
  _early=_baseQueries();
  await _restoreBoSession();
  try{await loadAllData();}
  catch(e){console.error(e);showToast('โหลดข้อมูลไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ','danger');}
  setLoading(false);
  _warnNoProjects();
  _syncSiteUI();
  if(isAdminLoggedIn&&!OVERVIEW)_prefetchLibs(); // ภาพรวมไม่ใช้ Excel/กราฟ/สร้างรูป
  renderCategories();
  initRealtime();
  // มาจากเมนู "อบรม" ของ Backoffice (?admin=1) → เปิดหน้าผู้ดูแลเลย
  if(new URLSearchParams(location.search).get('admin')==='1'){
    const q=new URLSearchParams(location.search);q.delete('admin');
    history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:''));
    showPage(OVERVIEW?'overview':PROJECT_ID?'track':'admin'); // แท็บอบรมของโครงการ เริ่มที่ตรวจสอบรายชื่อ
  }
}

/* ══════════════════ REALTIME SYNC ══════════════════ */
let _rtChannel=null;
let _rtDebounceTimer=null;
let _rtReconnectTimer=null;

function _scheduleRtRefresh(){
  if(_rtDebounceTimer)clearTimeout(_rtDebounceTimer);
  _rtDebounceTimer=setTimeout(async()=>{
    try{await loadAllData(true);refreshCurrentView();}
    catch(e){console.error('RT refresh:',e);}
  },400);
}

// ผู้ลงทะเบียนเปลี่ยน (ลงทะเบียน/เช็คชื่อ — วันอบรมเกิดถี่มาก) → แก้รายการในเครื่องแล้ววาดหน้าใหม่ ไม่โหลดข้อมูลทั้งหมดซ้ำ
// เก็บเฉพาะของโครงการที่เปิดอยู่ (รอบอบรมอยู่ใน sessions) · หน้าภาพรวมถามตัวเลขจากฐานข้อมูลใหม่เอง (_ovRefresh)
let _rtRenderTimer=null;
function _scheduleRtRender(){
  clearTimeout(_rtRenderTimer);
  _rtRenderTimer=setTimeout(refreshCurrentView,400);
}
function _rtUpsertReg(row){
  const reg=getReg(row.id),mine=!!getSess(row.session_id);
  if(reg&&mine)Object.assign(reg,_mReg(row));
  else if(reg)registrations=registrations.filter(r=>r.id!==row.id); // ย้ายไปรอบของโครงการอื่น
  else if(mine)registrations.push(_mReg(row));
}
function initRealtime(){
  if(_rtChannel)return;
  if(_rtReconnectTimer){clearTimeout(_rtReconnectTimer);_rtReconnectTimer=null;}
  _rtChannel=_sb.channel('bms-rt-v3')
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'trn_registrations'},(p)=>{
      if(p.new)_rtUpsertReg(p.new);
      _scheduleRtRender();
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'trn_registrations'},(p)=>{
      if(!p.new)return;
      _rtUpsertReg(p.new);
      updateCheckinHeroStats();
      _mergeRealtimeScanLog();
      const sub=document.querySelector('.checkin-sub.active');
      if(sub&&sub.id==='csub-list')loadAttendance();
      _scheduleRtRender();
    })
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'trn_registrations'},(p)=>{
      if(!p.old)return;
      const idx=registrations.findIndex(r=>r.id===p.old.id);
      if(idx!==-1)registrations.splice(idx,1);
      _scheduleRtRender();
    })
    // ตาราง sessions / categories / master_items / locations: debounce full reload
    .on('postgres_changes',{event:'*',schema:'public',table:'trn_sessions'},()=>_scheduleRtRefresh())
    .on('postgres_changes',{event:'*',schema:'public',table:'trn_categories'},()=>_scheduleRtRefresh())
    .on('postgres_changes',{event:'*',schema:'public',table:'trn_site_categories'},()=>_scheduleRtRefresh())
    .on('postgres_changes',{event:'*',schema:'public',table:'trn_master_items'},()=>_scheduleRtRefresh())
    .on('postgres_changes',{event:'*',schema:'public',table:'trn_sites'},()=>_scheduleRtRefresh())
    .subscribe((status)=>{
      if(status==='SUBSCRIBED'){
        if(_rtReconnectTimer){clearTimeout(_rtReconnectTimer);_rtReconnectTimer=null;}
      } else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){
        _rtChannel=null;
        _rtReconnectTimer=setTimeout(initRealtime,5000);
      }
    });
}

function refreshCurrentView() {
  const activePage = document.querySelector('.page.active');
  if (!activePage) return;
  const pid = activePage.id;
  if (pid === 'page-overview') { _ovRefresh(); return; }
  if (pid === 'page-unopened') { if (currentSite) showPage('admin'); return; } // มีคนเปิดอบรมโครงการนี้แล้ว

  if (pid === 'page-register') {
    renderCategories();
    if (selectedCatId) renderSessionList();
    
    // หากผู้ใช้กำลังเปิดหน้าต่างลงทะเบียนอยู่ ให้อัปเดตที่นั่งที่เหลือแบบเรียลไทม์
    const modalReg = document.getElementById('modal-register');
    if (modalReg && modalReg.classList.contains('open') && selectedSessId) _renderRegSeat();
  } else if (pid === 'page-checkin') {
    updateCheckinHeroStats();
    _mergeRealtimeScanLog();
    const activeSub = document.querySelector('.checkin-sub.active');
    if (activeSub && activeSub.id === 'csub-list') {
      loadAttendance();
    }
  } else if (pid === 'page-track') {
    trackSearch();
  } else if (pid === 'page-analytics') {
    renderAnalytics();
  } else if (pid === 'page-admin') {
    renderAdmin();
  }
}

/* ══════════════════ PAGE NAV ══════════════════ */
function showPage(p){
  if((p==='admin'||p==='checkin'||p==='overview'||p==='print')&&!isAdminLoggedIn){pendingPage=p;openAdminLogin();_embedNotify();return;}
  // แท็บอบรมของโครงการที่ยังไม่เปิดอบรม (หรือไม่อยู่ทีม) → ทุกหน้าแสดงหน้า "ยังไม่เปิดอบรม" แทน
  if(PROJECT_ID&&!currentSite&&p!=='register')p='unopened';
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(x=>x.classList.remove('active'));
  document.getElementById('page-'+p).classList.add('active');
  document.getElementById('tab-'+p)?.classList.add('active');
  if(p==='overview')renderOverview();
  if(p==='unopened')renderUnopened();
  if(p==='register')goBackToCategories();
  if(p==='checkin')initCheckinPage();
  if(p==='track'){populateTrackFilters();trackSearch();}
  if(p==='admin')renderAdmin();
  if(p==='print')initPrintSection();
  if(p==='analytics')renderAnalytics();
  _embedNotify();
}
/* ══════════════════ ADMIN LOGIN ══════════════════
   ใช้บัญชีของ Backoffice (src/services/bo-auth.service.js) — Login ที่นี่ = Login Backoffice ด้วย (session เดียวกัน) และกลับกัน
   Role admin ของ Backoffice = superadmin ที่นี่ · Role อื่นต้องมีสิทธิ์ "อบรม" ในหน้าสิทธิ์การใช้งานของ Backoffice */
function openAdminLogin(){
  document.getElementById('login-user').value='';
  document.getElementById('login-pass').value='';
  document.getElementById('login-remember').checked=false;
  document.getElementById('login-pass').style.webkitTextSecurity='disc';
  document.getElementById('login-eye-icon').className='ti ti-eye';
  document.getElementById('login-error').style.display='none';
  document.getElementById('modal-admin-login').classList.add('open');
  setTimeout(()=>document.getElementById('login-user').focus(),100);
}
function toggleLoginPass(){
  const inp=document.getElementById('login-pass');
  const icon=document.getElementById('login-eye-icon');
  const hidden=inp.style.webkitTextSecurity!=='none';
  inp.style.webkitTextSecurity=hidden?'none':'disc';
  icon.className=hidden?'ti ti-eye-off':'ti ti-eye';
}
// ผู้ใช้ Backoffice → ผู้ดูแลของระบบอบรม (null = ไม่มีสิทธิ์อบรม)
function _boToAdmin(u){
  if(!u||!u.perm||!u.perm.view)return null;
  return{id:u.id,username:u.username,name:u.name,role:u.role==='admin'?'superadmin':u.role,staffId:u.staffId||'',perm:u.perm};
}
function _setAdmin(a){
  isAdminLoggedIn=true;
  currentAdminUser=a;
  _embedNotify();
}
// เปิดหน้ามาแล้ว Login Backoffice ค้างอยู่ → เข้าโหมดผู้ดูแลเลย ไม่ต้อง Login ซ้ำ
async function _restoreBoSession(){
  try{
    const a=_boToAdmin(await BoAuth.current(_sb));
    if(a)_setAdmin(a);
  }catch(e){console.warn('[training] ตรวจ session Backoffice ไม่สำเร็จ',e);}
}
async function adminLogin(){
  const u=document.getElementById('login-user').value.trim();
  const p=document.getElementById('login-pass').value;
  const btn=document.querySelector('#modal-admin-login .btn-primary');
  const showErr=msg=>{
    const errEl=document.getElementById('login-error');
    document.getElementById('login-error-msg').textContent=msg;
    errEl.style.cssText='display:flex;color:var(--danger);font-size:13px;margin-top:4px;padding:8px 12px;background:#fee2e2;border-radius:8px;align-items:center;gap:6px;';
  };
  if(!u||!p){showErr('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');return;}
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader-2" style="animation:spin .8s linear infinite"></i>กำลังตรวจสอบ...';}
  let user=null;
  try{user=await BoAuth.login(_sb,u,p,document.getElementById('login-remember').checked);}catch(e){console.error(e);}
  if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-login"></i>เข้าสู่ระบบ';}
  if(!user){
    showErr('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    document.getElementById('login-pass').value='';
    document.getElementById('login-pass').focus();
    return;
  }
  const a=_boToAdmin(user);
  if(!a){showErr('บัญชีนี้ยังไม่มีสิทธิ์ "อบรม" — ติดต่อ Admin ของ Backoffice');return;}
  _setAdmin(a);
  closeModal('modal-admin-login');
  await _applySiteScope();
  _prefetchLibs();
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(x=>x.classList.remove('active'));
  document.getElementById('page-'+pendingPage).classList.add('active');
  document.getElementById('tab-'+pendingPage)?.classList.add('active');
  if(pendingPage==='overview')renderOverview(); // เดิมไม่วาด → ภาพรวมว่างหลัง Login ในหน้า
  if(pendingPage==='admin')renderAdmin();
  if(pendingPage==='checkin')initCheckinPage();
  if(pendingPage==='print')initPrintSection();
  if(pendingPage==='admin'&&_pendingAdminTab){switchAdminTab(_pendingAdminTab);_pendingAdminTab=null;}
  _embedNotify();
  showToast(`ยินดีต้อนรับ ${a.name||a.username}`,'success');
}
/* ══════════════════ DATA IMPORT ══════════════════ */
const IMPORT_CFG={
  venue:  {label:'สถานที่',   cols:['สถานที่']},
  dept:   {label:'แผนก',      cols:['แผนก']},
  prefix: {label:'คำนำหน้า', cols:['คำนำหน้า']},
  session:{label:'รอบอบรม',
    cols:['หลักสูตร (ชื่อ) *','ชื่อรอบ *','วันที่ (YYYY-MM-DD) *','เวลาเริ่ม','เวลาจบ','สถานที่','วิทยากร','จำนวนที่นั่ง']},
  registration:{label:'ผู้ลงทะเบียน (Excel/CSV)',
    cols:['หลักสูตร (ชื่อ) *','ชื่อรอบ *','คำนำหน้า','ชื่อ *','นามสกุล *','ตำแหน่ง *','แผนก *','อีเมล']},
};
let _importRows=[];
let _importPreviewFilter='all'; // 'all' | 'ok' | 'dup' | 'error' — คลิกป้ายสรุปเพื่อกรองดูเฉพาะแถวที่ซ้ำ/error
function openImportModal(){
  document.getElementById('import-type').value='venue';
  document.getElementById('import-file-input').value='';
  document.getElementById('import-preview-area').style.display='none';
  document.getElementById('import-submit-btn').style.display='none';
  document.getElementById('import-clear').checked=false;
  document.getElementById('import-reg-clear').checked=false;
  document.getElementById('import-reg-hint').style.display='none';
  document.getElementById('import-clear-wrap').style.display='';
  document.getElementById('import-reg-clear-wrap').style.display='none';
  _importRows=[];
  _importPreviewFilter='all';
  _resetDropzone();
  document.getElementById('modal-import').classList.add('open');
}
/* ผู้ลงทะเบียนรองรับไฟล์ Excel จริง (ผ่าน XLSX ที่โหลดไว้อยู่แล้วสำหรับ export) นอกเหนือจาก .csv */
function _importAllowedExts(type){return type==='registration'?['csv','xlsx','xls']:['csv'];}
function _importAccept(type){return _importAllowedExts(type).map(e=>'.'+e).join(',');}
function _resetDropzone(){
  const type=document.getElementById('import-type').value;
  const accept=_importAccept(type);
  const hint=type==='registration'?'รองรับไฟล์ .xlsx, .xls หรือ .csv (UTF-8)':'รองรับเฉพาะไฟล์ .csv (UTF-8 หรือ UTF-8 BOM)';
  document.getElementById('import-dropzone').innerHTML=`
    <input type="file" id="import-file-input" accept="${accept}" style="display:none;" onchange="onImportFileChange(event)">
    <i class="ti ti-file-spreadsheet" style="font-size:32px;"></i>
    <div style="font-weight:600;font-size:14px;">คลิกหรือลากไฟล์มาวางที่นี่</div>
    <div style="font-size:12px;opacity:.7;">${hint}</div>`;
}
function onImportTypeChange(){
  document.getElementById('import-preview-area').style.display='none';
  document.getElementById('import-submit-btn').style.display='none';
  _importRows=[];
  _importPreviewFilter='all';
  const type=document.getElementById('import-type').value;
  const isReg=type==='registration';
  document.getElementById('import-reg-hint').style.display=isReg?'':'none';
  document.getElementById('import-clear-wrap').style.display=isReg?'none':'';
  document.getElementById('import-reg-clear-wrap').style.display=isReg?'':'none';
  document.getElementById('import-reg-clear').checked=false;
  _resetDropzone();
}
function downloadImportTemplate(){
  const type=document.getElementById('import-type').value;
  const cfg=IMPORT_CFG[type];
  const escape=v=>v.includes(',')||v.includes('"')?`"${v.replace(/"/g,'""')}"`:v;
  let csv='﻿'+cfg.cols.map(escape).join(',')+'\n';
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  a.download=`template_${type}.csv`;a.click();
  showToast(`ดาวน์โหลด template_${type}.csv สำเร็จ`,'success');
}
function onImportFileChange(e){
  const f=e.target.files[0];if(!f)return;
  const type=document.getElementById('import-type').value;
  const ext=(f.name.split('.').pop()||'').toLowerCase();
  if(!_importAllowedExts(type).includes(ext)){showToast('กรุณาเลือกไฟล์ '+_importAccept(type),'danger');return;}
  _readImportFile(f);
}
function onImportFileDrop(e){
  const f=e.dataTransfer.files[0];
  const type=document.getElementById('import-type').value;
  const ext=(f?.name.split('.').pop()||'').toLowerCase();
  if(f&&_importAllowedExts(type).includes(ext))_readImportFile(f);
  else showToast('กรุณาเลือกไฟล์ '+_importAccept(type),'danger');
}
async function _readImportFile(file){
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(ext==='xlsx'||ext==='xls'){
    if(!await _needLib('xlsx'))return;
    const r=new FileReader();
    r.onload=e=>{
      try{
        const wb=XLSX.read(e.target.result,{type:'array'});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''})
          .map(row=>row.map(c=>String(c??'').trim()))
          .filter(row=>row.some(c=>c!==''));
        _processImportRows(rows,file.name);
      }catch(err){showToast('อ่านไฟล์ Excel ไม่สำเร็จ: '+err.message,'danger');}
    };
    r.readAsArrayBuffer(file);
  }else{
    const r=new FileReader();
    r.onload=e=>_processImportCSV(e.target.result,file.name);
    r.readAsText(file,'UTF-8');
  }
}
function _parseCSV(text){
  text=text.replace(/^﻿/,'');
  return text.split(/\r?\n/).filter(l=>l.trim()).map(line=>{
    const cols=[];let cur='',inQ=false;
    for(const c of line){
      if(c==='"')inQ=!inQ;
      else if(c===','&&!inQ){cols.push(cur.trim());cur='';}
      else cur+=c;
    }
    cols.push(cur.trim());return cols;
  });
}
function _processImportCSV(text,filename){
  _processImportRows(_parseCSV(text),filename);
}
function _processImportRows(all,filename){
  const type=document.getElementById('import-type').value;
  if(all.length<2){showToast('ไฟล์ไม่มีข้อมูล หรือมีแค่ header','warn');return;}
  _importRows=_validateRows(all.slice(1),type);
  _renderImportPreview();
  document.getElementById('import-preview-area').style.display='block';
  document.getElementById('import-submit-btn').style.display='flex';
  refreshImportStats();
  const dz=document.getElementById('import-dropzone');
  dz.innerHTML=`<input type="file" id="import-file-input" accept="${_importAccept(type)}" style="display:none;" onchange="onImportFileChange(event)">
    <i class="ti ti-circle-check" style="font-size:28px;color:var(--success);"></i>
    <div style="font-weight:600;font-size:14px;color:var(--success);">${filename} — ${_importRows.length} แถว</div>
    <div style="font-size:12px;color:var(--text-muted);">คลิกเพื่อเลือกไฟล์ใหม่</div>`;
}
// ชื่อวิทยากรจากไฟล์นำเข้า → รหัสพนักงาน (ตรงกับชื่อเต็มหรือชื่อเล่น) · ไม่พบเก็บข้อความเดิมไว้ (แสดงตามที่พิมพ์)
function _staffIdByName(n){
  if(!n)return'';
  const t=trainerStaff.find(x=>x.name===n||x.nickname===n||(x.name+' ('+x.nickname+')')===n);
  return t?t.id:n;
}
function _validateRows(rows,type){
  const MASTER_TYPES=['venue','dept','prefix'];
  return rows.map((row,i)=>{
    const r={row:i+2,raw:row,status:'ok',note:'',value:null};
    if(MASTER_TYPES.includes(type)){
      const val=(row[0]||'').trim();
      if(!val){r.status='error';r.note='ค่าว่าง';return r;}
      if(MASTER_CFG[type].list().includes(val)){r.status='dup';r.note='มีอยู่แล้ว';}
      r.value=val;
    } else if(type==='session'){
      const catName=(row[0]||'').trim(),sessName=(row[1]||'').trim(),date=(row[2]||'').trim();
      if(!catName||!sessName||!date){r.status='error';r.note='ข้อมูลจำเป็นไม่ครบ';return r;}
      // หลักสูตรเป็นของกลาง — ยังไม่เปิดในโครงการก็ได้ (สร้างรอบแล้วระบบเปิดให้เอง)
      const cat=allCategories.find(c=>c.name===catName);
      if(!cat){r.status='error';r.note=`ไม่พบหลักสูตร "${catName}" ในหลักสูตรอบรมกลาง`;return r;}
      if(sessions.find(s=>s.catId===cat.id&&s.name===sessName)){r.status='dup';r.note='รอบนี้มีอยู่แล้ว';}
      r.value={catId:cat.id,name:sessName,date,
        timeStart:(row[3]||'09:00').trim()||'09:00',timeEnd:(row[4]||'16:00').trim()||'16:00',
        venue:(row[5]||'').trim(),trainer:_staffIdByName((row[6]||'').trim()),capacity:parseInt(row[7])||20};
      if((row[6]||'').trim()&&!trainerStaff.some(t=>t.id===r.value.trainer))r.note=(r.note?r.note+' · ':'')+'ไม่พบวิทยากรในรายชื่อพนักงาน';
      if(r.value.venue&&!venues.includes(r.value.venue))r.note=(r.note?r.note+' · ':'')+'สถานที่นี้ไม่มีในรายการหลัก (จะเพิ่มเข้ารายการหลักให้)';
    } else if(type==='registration'){
      // จับคู่รอบอบรมจากคอลัมน์ "หลักสูตร"+"ชื่อรอบ" ต่อแถว — 1 ไฟล์นำเข้าได้หลายรอบพร้อมกัน ไม่ต้องเลือกรอบล่วงหน้า
      const catName=(row[0]||'').trim(),sessName=(row[1]||'').trim();
      const prefix=(row[2]||'').trim(),fname=(row[3]||'').trim(),lname=(row[4]||'').trim();
      const pos=(row[5]||'').trim(),dept=(row[6]||'').trim(),email=(row[7]||'').trim();
      if(!catName||!sessName||!fname||!lname||!pos||!dept){r.status='error';r.note='ข้อมูลจำเป็นไม่ครบ (หลักสูตร/ชื่อรอบ/ชื่อ/นามสกุล/ตำแหน่ง/แผนก)';return r;}
      const cat=categories.find(c=>c.name===catName);
      if(!cat){r.status='error';r.note=`ไม่พบหลักสูตร "${catName}"`;return r;}
      const sess=sessions.find(s=>s.catId===cat.id&&s.name===sessName);
      if(!sess){r.status='error';r.note=`ไม่พบรอบ "${sessName}" ในหลักสูตร "${catName}"`;return r;}
      // เช็คซ้ำเฉพาะตอนนำเข้า: หลักสูตร+ชื่อรอบ (=sess.id) + ชื่อ-นามสกุล เสมอ และถ้าโครงการนี้เปิดบังคับกรอกอีเมล จะเช็ค "อีเมล" เพิ่มเป็นเงื่อนไขที่ 4 ด้วย
      // ต่างจากการลงทะเบียนเอง/แอดมินเพิ่มเอง/แก้ไข ที่ยังใช้ findDupReg() เช็คซ้ำด้วยชื่อ-นามสกุลทั้งหลักสูตรตามเดิม (ไม่แยกตามรอบ)
      const reqEmailDup=siteRequiresEmail();
      const emailKey=email.toLowerCase();
      const emailValid=_emailRe.test(emailKey); // อีเมลว่าง/ผิดรูปแบบ ห้ามใช้เทียบซ้ำ (ว่างเทียบว่างไม่ถือว่าตรงกัน)
      const nk=_nameKey(fname,lname); // เทียบชื่อแบบตัดช่องว่างซ้ำ/อักษรล่องหน (_nameKey)
      const dupExisting=registrations.find(rg=>rg.sessionId===sess.id&&_nameKey(rg.fname,rg.lname)===nk&&(!reqEmailDup||(emailValid&&(rg.email||'').toLowerCase()===emailKey)));
      const dupInFile=rows.slice(0,i).some(rw=>
        (rw[0]||'').trim()===catName&&(rw[1]||'').trim()===sessName&&
        _nameKey(rw[3],rw[4])===nk&&
        (!reqEmailDup||(emailValid&&(rw[7]||'').trim().toLowerCase()===emailKey))
      );
      if(dupExisting){
        r.status='dup';r.note=reqEmailDup?'มีชื่อ-นามสกุลและอีเมลนี้ลงทะเบียนรอบนี้อยู่แล้ว':'มีชื่อ-นามสกุลนี้ลงทะเบียนรอบนี้อยู่แล้ว';
      }else if(dupInFile){
        r.status='dup';r.note=reqEmailDup?'ชื่อ-นามสกุลและอีเมลซ้ำกันเองในไฟล์ (หลักสูตร+รอบเดียวกัน)':'ชื่อ-นามสกุลซ้ำกันเองในไฟล์ (หลักสูตร+รอบเดียวกัน)';
      }
      const notes=[];
      // อีเมลไม่บังคับตอนนำเข้า (ต่างจากลงทะเบียนเองที่ยังบังคับตามเดิม) — แค่เตือน ไม่บล็อกการนำเข้า
      if(siteRequiresEmail()&&!_emailRe.test(email))notes.push('ไม่มีอีเมล/อีเมลไม่ถูกต้อง — โครงการนี้บังคับกรอกตอนลงทะเบียนเอง แต่ยังนำเข้ารายการนี้ได้');
      // ชื่อใกล้เคียงกับคนที่ลงหลักสูตรนี้ไว้แล้ว (สะกดต่างกันเล็กน้อย) — เตือนให้ตรวจ ไม่บล็อก
      if(r.status==='ok'){const near=findSimilarReg(fname,lname,cat.id);if(near)notes.push(`ชื่อใกล้เคียง "${near.fname} ${near.lname}" ลงทะเบียนหลักสูตรนี้แล้ว — ตรวจว่าเป็นคนเดียวกันหรือไม่`);}
      // แผนก/คำนำหน้าที่เขียนต่างจากรายการหลักเล็กน้อย (ช่องว่าง/ตัวพิมพ์/สะกด) → ใช้ชื่อในรายการหลัก ข้อมูลจะได้รวมกลุ่มถูก
      const mDept=_matchMaster(dept,departments),mPrefix=_matchMaster(prefix,prefixes);
      if(dept&&!mDept)notes.push('แผนกนี้ไม่มีในรายการหลัก (จะเพิ่มเข้ารายการหลักให้)');
      else if(mDept&&mDept!==dept)notes.push(`แผนก "${dept}" → ใช้ "${mDept}" ตามรายการหลัก`);
      if(prefix&&!mPrefix)notes.push('คำนำหน้านี้ไม่มีในรายการหลัก (จะเพิ่มเข้ารายการหลักให้)');
      else if(mPrefix&&mPrefix!==prefix)notes.push(`คำนำหน้า "${prefix}" → ใช้ "${mPrefix}"`);
      if(notes.length)r.note=[r.note,...notes].filter(Boolean).join(' · ');
      r.value={prefix:mPrefix||prefix,fname,lname,position:pos,dept:mDept||dept,email:email||null,sessionId:sess.id};
    }
    return r;
  });
}
function refreshImportStats(){
  const type=document.getElementById('import-type').value;
  const isReg=type==='registration';
  // "ผู้ลงทะเบียน" ใช้ checkbox แยก (import-reg-clear: ลบเฉพาะรอบในไฟล์นี้) แทน checkbox ทั่วไป (import-clear: ลบข้อมูลเดิมทั้งโครงการ) ที่ถูกซ่อนไว้
  const clear=isReg?(document.getElementById('import-reg-clear')?.checked||false):document.getElementById('import-clear').checked;
  const ok=_importRows.filter(r=>r.status==='ok').length;
  const dup=_importRows.filter(r=>r.status==='dup').length;
  const err=_importRows.filter(r=>r.status==='error').length;
  const toImport=clear?ok+dup:ok;
  // ถ้ากรองไว้แล้วแถวหมวดนั้นเหลือ 0 (เช่นแก้ไขจนไม่มี error เหลือแล้ว) ให้เด้งกลับไปดู "รวม" อัตโนมัติ
  const filterCounts={all:_importRows.length,ok,dup,error:err};
  if(_importPreviewFilter!=='all'&&!filterCounts[_importPreviewFilter])_importPreviewFilter='all';
  const pillBtn=(f,label,bg,fg)=>`<button type="button" onclick="setImportPreviewFilter('${f}')" style="font-family:inherit;cursor:pointer;background:${bg};color:${fg};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;border:1.5px solid ${_importPreviewFilter===f?fg:'transparent'};box-shadow:${_importPreviewFilter===f?'0 0 0 1px '+fg+' inset':'none'};">${label}</button>`;
  document.getElementById('import-stats').innerHTML=`
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
      ${pillBtn('all',`รวม ${_importRows.length} แถว`,'var(--bg)','var(--text-secondary)')}
      ${pillBtn('ok',`<i class="ti ti-circle-plus"></i> ใหม่ ${ok}`,'#dcfce7','#166534')}
      ${pillBtn('dup',`<i class="ti ti-copy"></i> ซ้ำ ${dup}`,'#fef3c7','#92400e')}
      ${err?pillBtn('error',`<i class="ti ti-alert-circle"></i> Error ${err}`,'#fee2e2','#991b1b'):''}
      ${_importPreviewFilter!=='all'?`<span style="font-size:11px;color:var(--text-muted);">— กำลังกรองดูเฉพาะรายการนี้ในตารางด้านล่าง</span>`:''}
    </div>`;
  const modeInfoHtml=clear
    ?(isReg
      ?`<i class="ti ti-trash" style="color:var(--danger);"></i> จะ<strong>ลบผู้ลงทะเบียนเดิมของรอบที่อยู่ในไฟล์นี้</strong> แล้วนำเข้า <strong>${toImport} รายการ</strong> (รวมรายการที่เดิมนับว่าซ้ำ)`
      :`<i class="ti ti-trash" style="color:var(--danger);"></i> จะ<strong>ลบข้อมูลเดิมทั้งหมด</strong>แล้วนำเข้า <strong>${toImport} รายการ</strong> (รวมรายการซ้ำ)`)
    :`<i class="ti ti-git-merge" style="color:var(--primary);"></i> จะเพิ่ม <strong>${toImport} รายการใหม่</strong> — ข้ามรายการซ้ำ ${dup} รายการ`;
  const modeInfoEl=document.getElementById(isReg?'import-reg-clear-info':'import-mode-info');
  if(modeInfoEl)modeInfoEl.innerHTML=modeInfoHtml;
  const btn=document.getElementById('import-submit-btn');
  btn.innerHTML=`<i class="ti ti-table-import"></i>นำเข้า ${toImport} รายการ`;
  btn.disabled=toImport===0;
}
function setImportPreviewFilter(f){
  _importPreviewFilter=f;
  refreshImportStats();
  _renderImportPreview();
}
function _renderImportPreview(){
  const type=document.getElementById('import-type').value;
  const cfg=IMPORT_CFG[type];
  const SC={ok:'#f0fdf4',dup:'#fefce8',error:'#fff1f2'};
  const SL={ok:'#166534',dup:'#92400e',error:'#991b1b'};
  const SN={ok:'ใหม่',dup:'ซ้ำ',error:'Error'};
  const filtered=_importPreviewFilter==='all'?_importRows:_importRows.filter(r=>r.status===_importPreviewFilter);
  const cap=_importPreviewFilter==='all'?15:200; // กรองแล้วเปิดโควตาแสดงผลกว้างขึ้น เพราะจำนวนที่กรองมักไม่เยอะเท่าทั้งไฟล์
  const show=filtered.slice(0,cap);
  // แยก "สถานะ" (ป้ายสั้นๆ ไม่ห่อบรรทัด) ออกจาก "หมายเหตุ" (ข้อความยาวอ่านง่ายเป็นย่อหน้า) เพราะเดิมยัดข้อความยาวลงป้ายกลมทำให้ตัวอักษรถูกบีบขึ้นบรรทัดละคำ อ่านไม่ออก
  let html=`<table style="width:100%;border-collapse:collapse;min-width:640px;">
    <thead><tr style="background:var(--bg);position:sticky;top:0;">
      <th style="padding:8px 10px;text-align:center;font-size:11px;color:var(--text-muted);white-space:nowrap;">#</th>
      ${cfg.cols.map(c=>`<th style="padding:8px 10px;text-align:left;font-size:11px;color:var(--text-muted);white-space:nowrap;">${c.replace(' *','')}</th>`).join('')}
      <th style="padding:8px 10px;text-align:center;font-size:11px;color:var(--text-muted);white-space:nowrap;">สถานะ</th>
      <th style="padding:8px 10px;text-align:left;font-size:11px;color:var(--text-muted);min-width:240px;">หมายเหตุ</th>
    </tr></thead><tbody>`;
  if(!filtered.length){
    html+=`<tr><td colspan="${cfg.cols.length+3}" style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">ไม่มีแถวในหมวดนี้</td></tr>`;
  }
  show.forEach(r=>{
    html+=`<tr style="background:${SC[r.status]};border-top:1px solid ${SL[r.status]}22;">
      <td style="padding:8px 10px;text-align:center;color:var(--text-muted);font-size:11px;vertical-align:top;">${r.row}</td>
      ${cfg.cols.map((_,i)=>`<td style="padding:8px 10px;font-size:12.5px;vertical-align:top;">${r.raw[i]?_esc(String(r.raw[i])):'<span style="color:var(--text-placeholder);">—</span>'}</td>`).join('')}
      <td style="padding:8px 10px;text-align:center;vertical-align:top;"><span style="display:inline-block;white-space:nowrap;background:var(--card);color:${SL[r.status]};border:1.5px solid ${SL[r.status]};padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;">${SN[r.status]}</span></td>
      <td style="padding:8px 10px;font-size:12.5px;line-height:1.55;color:${SL[r.status]};vertical-align:top;">${r.note?_esc(r.note):'<span style="color:var(--text-placeholder);">—</span>'}</td>
    </tr>`;
  });
  if(filtered.length>cap)html+=`<tr><td colspan="${cfg.cols.length+3}" style="padding:10px;text-align:center;color:var(--text-muted);font-size:11px;">... และอีก ${filtered.length-cap} แถว</td></tr>`;
  html+='</tbody></table>';
  document.getElementById('import-preview-table').innerHTML=html;
}
async function executeImport(){
  const type=document.getElementById('import-type').value;
  const isReg=type==='registration';
  // "ผู้ลงทะเบียน" ไม่ใช้ checkbox ทั่วไป (ลบทั้งโครงการ) — มี checkbox แยกที่ลบเฉพาะรอบที่อยู่ในไฟล์นี้เท่านั้น (ปลอดภัยกว่า)
  const clear=isReg?(document.getElementById('import-reg-clear')?.checked||false):document.getElementById('import-clear').checked;
  const toImport=clear?_importRows.filter(r=>r.status!=='error'):_importRows.filter(r=>r.status==='ok');
  if(!toImport.length){showToast('ไม่มีรายการที่จะนำเข้า','warn');return;}
  if(isReg){
    // ไฟล์เดียวอาจมีผู้ลงทะเบียนกระจายหลายรอบ (จับคู่จากคอลัมน์หลักสูตร+ชื่อรอบต่อแถวแล้ว) — เช็คที่นั่งแยกทีละรอบ
    const bySess={};
    toImport.forEach(r=>{(bySess[r.value.sessionId]=bySess[r.value.sessionId]||[]).push(r);});
    const sessIds=Object.keys(bySess).map(Number);
    if(clear){
      // ลบเฉพาะผู้ลงทะเบียนของ "รอบที่ปรากฏในไฟล์นี้" และเฉพาะโครงการปัจจุบัน (sessIds มาจาก sessions ในหน่วยความจำที่กรองตาม currentSite ไว้แล้ว จึงไม่มีทางหลุดไปแตะโครงการอื่น)
      const existing=registrations.filter(r=>sessIds.includes(r.sessionId));
      if(existing.length){
        const affectedNames=sessIds.map(id=>getSess(id)?.name).filter(Boolean).join(', ');
        const attendedCount=existing.filter(r=>r.attended).length;
        const ok=await showConfirm(
          `ลบผู้ลงทะเบียนเดิม ${existing.length} รายการก่อนนำเข้า?`,
          `ลบเฉพาะรอบที่ปรากฏในไฟล์นี้ (${affectedNames}) และเฉพาะโครงการปัจจุบันเท่านั้น ไม่กระทบโครงการอื่นหรือรอบอื่น`+
            (attendedCount?` — มี ${attendedCount} รายการที่เช็คชื่อเข้าอบรมแล้วในรอบเหล่านี้ จะถูกลบไปด้วย`:''),
          {okLabel:'ลบแล้วนำเข้าใหม่',danger:true});
        if(!ok)return;
        const {error:delErr}=await _sb.from('trn_registrations').delete().in('session_id',sessIds);
        if(delErr){showToast('ลบข้อมูลเดิมไม่สำเร็จ: '+delErr.message,'danger');return;}
        registrations=registrations.filter(r=>!sessIds.includes(r.sessionId));
      }
    }
    // เช็คที่นั่งหลังลบข้อมูลเดิม (ถ้ามี) แล้ว เพื่อให้ getCount สะท้อนของจริงก่อนตัดสินใจขยายที่นั่ง
    const toExpand=[];
    for(const sidStr in bySess){
      const sess=getSess(parseInt(sidStr));
      if(!sess)continue;
      const needed=getCount(sess.id)+bySess[sidStr].length;
      if(needed>sess.capacity)toExpand.push({sess,needed});
    }
    if(toExpand.length){
      const listTxt=toExpand.map(x=>`• ${x.sess.name}: ${x.sess.capacity} → ${x.needed} ที่นั่ง`).join(' ​ ');
      const ok=await showConfirm(
        toExpand.length>1?`มี ${toExpand.length} รอบที่ที่นั่งว่างไม่พอ`:`ที่นั่งว่างไม่พอ`,
        `ระบบจะขยายที่นั่งอัตโนมัติเพื่อรองรับผู้ลงทะเบียนทั้งหมดที่นำเข้า: ${listTxt}`,
        {okLabel:'ขยายที่นั่งและนำเข้าทั้งหมด',danger:false});
      if(!ok)return;
      for(const x of toExpand){
        const {error:capErr}=await _sb.from('trn_sessions').update({capacity:x.needed}).eq('id',x.sess.id);
        if(capErr){showToast('ขยายที่นั่งไม่สำเร็จ: '+capErr.message,'danger');return;}
        x.sess.capacity=x.needed;
      }
    }
  }
  const btn=document.getElementById('import-submit-btn');
  btn.disabled=true;
  btn.innerHTML='<i class="ti ti-loader-2" style="animation:spin .8s linear infinite;"></i>กำลังนำเข้า...';
  try{
    if(clear&&!isReg)await _clearImportType(type); // registration ลบแบบ scoped ไปแล้วข้างบน ไม่ต้องเรียกซ้ำ
    await _insertImportRows(type,toImport);
    if(!type.startsWith('quiz')){await loadAllData();renderAdmin();}
    closeModal('modal-import');
    showToast(`นำเข้า ${toImport.length} รายการสำเร็จ`,'success');
  }catch(e){
    showToast('นำเข้าไม่สำเร็จ: '+e.message,'danger');
    btn.disabled=false;refreshImportStats();
  }
}
async function _clearImportType(type){
  const MASTER=['venue','dept','prefix'];
  let err;
  if(MASTER.includes(type)){
    // รายการที่ถูกใช้อยู่ (รอบอบรม/ผู้ลงทะเบียน/ตรวจสอบสิทธิ์/คีย์ยอด อ้างรหัสไว้) ลบไม่ได้ — คงไว้ ลบเฉพาะที่ไม่ได้ใช้
    let kept=0;
    for(const id of masterIds[type]||[]){
      const {error:e}=await _sb.from('trn_master_items').delete().eq('id',id);
      if(e){if(_isInUse(e)){kept++;continue;}throw new Error(e.message);}
    }
    if(kept)showToast(`คงไว้ ${kept} รายการที่ยังถูกใช้งานอยู่`,'warn');
  } else if(type==='session'){
    ({error:err}=await _sb.from('trn_sessions').delete().eq('site',currentSite));
  }
  if(err)throw new Error(err.message);
}
async function _insertImportRows(type,rows){
  const MASTER=['venue','dept','prefix'];
  let error;
  if(MASTER.includes(type)){
    const cur=MASTER_CFG[type].list();
    ({error}=await _sb.from('trn_master_items').upsert(
      rows.map((r,i)=>({type,value:r.value,sort_order:cur.length+i,site:currentSite})),
      {onConflict:'type,value,site',ignoreDuplicates:true}
    ));
  } else if(type==='session'){
    // สถานที่ → รหัสรายการหลัก (ไม่มี → เพิ่มให้) · ทำทีละค่าตามลำดับ กันเพิ่มค่าเดียวกันซ้ำพร้อมกัน
    for(const r of rows)r.value.venueId=await _ensureMasterId('venue',r.value.venue);
    ({error}=await _sb.from('trn_sessions').insert(rows.map(r=>({cat_id:r.value.catId,name:r.value.name,date:r.value.date,time_start:r.value.timeStart,time_end:r.value.timeEnd,venue_id:r.value.venueId,trainer:r.value.trainer,capacity:r.value.capacity,site:currentSite}))));
  } else if(type==='registration'){
    for(const r of rows){
      r.value.prefixId=await _ensureMasterId('prefix',r.value.prefix);
      r.value.deptId=await _ensureMasterId('dept',r.value.dept);
    }
    // ไม่ set is_walkin → ถือเป็นการลงทะเบียนล่วงหน้าปกติ (เหมือนกรอกฟอร์ม/แอดมินเพิ่มเอง) ไม่ใช่ walk-in
    ({error}=await _sb.from('trn_registrations').insert(rows.map(r=>({
      session_id:r.value.sessionId,prefix_id:r.value.prefixId,fname:r.value.fname,lname:r.value.lname,
      position:r.value.position,dept_id:r.value.deptId,email:r.value.email,
      reg_date:new Date().toISOString().split('T')[0],attended:false,
    }))));
  }
  if(error)throw new Error(error.message);
}
function switchCheckinTab(tab, el){
  document.querySelectorAll('.checkin-subtab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.checkin-sub').forEach(s=>s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('csub-'+tab).classList.add('active');
  if(tab==='list')initAttendancePage();
  updateCheckinHeroStats();
}
function initCheckinPage(){
  updateCheckinHeroStats();
  // default sub tab = scan
  document.querySelectorAll('.checkin-subtab').forEach((t,i)=>t.classList.toggle('active',i===0));
  document.querySelectorAll('.checkin-sub').forEach((s,i)=>s.classList.toggle('active',i===0));
}
function updateCheckinHeroStats(){
  // แท็บรายชื่อ + เลือกรอบแล้ว → สถิติของรอบนั้น, นอกนั้น → รวมทุกรอบ
  const listActive=document.getElementById('csub-list')?.classList.contains('active');
  const sid=listActive?parseInt(document.getElementById('att-sess-sel')?.value)||0:0;
  const s=sid?getSess(sid):null;
  const siteRegs=s?registrations.filter(r=>r.sessionId===sid):registrations.filter(r=>!!getSess(r.sessionId));
  const total=siteRegs.filter(r=>!r.isWalkin).length;
  const present=siteRegs.filter(r=>r.attended).length;
  const walkin=siteRegs.filter(r=>r.isWalkin).length;
  const absent=total-siteRegs.filter(r=>r.attended&&!r.isWalkin).length;
  const pct=siteRegs.length?Math.round(present/siteRegs.length*100):0;
  const sub=document.querySelector('#page-checkin .hero-sub');
  if(sub)sub.textContent=s?`สถิติ: ${getCat(s.catId)?.name||''} — ${s.name}`:'สแกน QR Code หรือติ๊กชื่อจากรายการ';
  const el=document.getElementById('checkin-live-stats');
  if(!el)return;
  el.innerHTML=`
    <div class="hero-stat"><div class="hero-stat-num">${total}</div><div class="hero-stat-lbl">ลงทะเบียน${calcTip("จำนวนผู้ลงทะเบียนล่วงหน้า (ไม่นับ Walk-in) ของรอบที่เลือก หรือทุกรอบของโครงการ")}</div></div>
    <div class="hero-stat" style="background:rgba(16,185,129,.2);border-color:rgba(16,185,129,.3);"><div class="hero-stat-num" style="color:#6ee7b7;">${present}</div><div class="hero-stat-lbl">เข้าอบรม${calcTip("ผู้ที่เช็คชื่อเข้าอบรมแล้ว (รวม Walk-in)")}</div></div>
    <div class="hero-stat" style="background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.25);"><div class="hero-stat-num" style="color:#fca5a5;">${absent}</div><div class="hero-stat-lbl">ขาด${calcTip("ผู้ลงทะเบียนล่วงหน้า − ผู้ลงทะเบียนล่วงหน้าที่เช็คชื่อแล้ว")}</div></div>
    <div class="hero-stat" style="background:rgba(245,158,11,.15);border-color:rgba(245,158,11,.25);"><div class="hero-stat-num" style="color:var(--accent);">${pct}%</div><div class="hero-stat-lbl">เข้าร่วม${calcTip("ผู้เข้าอบรม ÷ รายชื่อทั้งหมด (รวม Walk-in) × 100")}</div></div>
    ${walkin?`<div class="hero-stat" style="background:rgba(139,92,246,.15);border-color:rgba(139,92,246,.25);"><div class="hero-stat-num" style="color:#c4b5fd;">${walkin}</div><div class="hero-stat-lbl">Walk-in${calcTip("ผู้ที่ไม่ได้ลงทะเบียนล่วงหน้า แต่มาเพิ่มหน้างาน")}</div></div>`:''}`;
}

/* ══════════════════ ADMIN TABS ══════════════════ */
function toggleAdminTabsMenu(){
  const tabs=document.getElementById('admin-tabs');
  const toggle=document.getElementById('admin-tabs-toggle');
  if(!tabs||!toggle)return;
  const willOpen=!tabs.classList.contains('open');
  tabs.classList.toggle('open',willOpen);
  toggle.classList.toggle('open',willOpen);
}
function closeAdminTabsMenu(){
  document.getElementById('admin-tabs')?.classList.remove('open');
  document.getElementById('admin-tabs-toggle')?.classList.remove('open');
}
document.addEventListener('click',(e)=>{
  const tabs=document.getElementById('admin-tabs');
  const toggle=document.getElementById('admin-tabs-toggle');
  if(!tabs||!toggle||!tabs.classList.contains('open'))return;
  if(tabs.contains(e.target)||toggle.contains(e.target))return;
  closeAdminTabsMenu();
});
function switchAdminTab(name){
  if(isAdminLoggedIn&&!new Set(getMyAllowedTabs()).has(name))return;
  document.querySelectorAll('.admin-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.admin-section').forEach(s=>s.classList.remove('active'));
  const btn=document.querySelector(`.admin-tab[data-tab="${name}"]`);
  if(btn){
    btn.classList.add('active');
    // เลื่อนเฉพาะแถบแท็บ (#admin-tabs) เอง ห้ามใช้ scrollIntoView ตรงๆ เพราะมันไล่เลื่อน ancestor อื่นเช่น <body> ไปด้วย ทำให้หน้าเพี้ยน
    const strip=document.getElementById('admin-tabs');
    if(strip){
      const target=btn.offsetLeft-(strip.clientWidth-btn.offsetWidth)/2;
      strip.scrollTo({left:Math.max(0,target),behavior:'smooth'});
    }
  }
  document.getElementById('asec-'+name).classList.add('active');
  const toggleLbl=document.getElementById('admin-tabs-toggle-label');
  const tabDef=ADMIN_TABS.find(t=>t.id===name);
  if(toggleLbl&&tabDef)toggleLbl.textContent=tabDef.label;
  const ttl=document.getElementById('admin-title');
  if(ttl&&EMBED&&PROJECT_ID&&tabDef)ttl.textContent=tabDef.label; // แท็บอบรมของโครงการ: หัวข้อ = หน้าที่เลือกจากเมนูซ้าย
  closeAdminTabsMenu();
  if(name==='keyentry'){loadKeyEntryStatus();}
  if(name==='survey'){_initSvdSiteSelect();loadSurveyDashboard();}
  if(name==='quiz'){_initQuizAdmin();}
  if(name==='projsettings')renderProjSettings();
  _embedNotify();
}
/* ── เมนูซ้ายของ Backoffice (แท็บอบรมของโครงการ) เรียก — id = หน้า (track/checkin/…) หรือ "admin:<แท็บย่อย>" ── */
let _pendingAdminTab=null;
function embedGo(id){
  if(!id.startsWith('admin:')){showPage(id);return;}
  const tab=id.slice(6);
  if(!isAdminLoggedIn){_pendingAdminTab=tab;showPage('admin');return;}
  showPage('admin');
  switchAdminTab(tab);
}

/* ══════════════════════════════════════════════════════════
   SURVEY DASHBOARD
══════════════════════════════════════════════════════════ */
const SVD_SECTIONS=[
  {num:1,title:'พฤติกรรมบริการ',icon:'ti-heart-handshake',color:'#2563eb',
   qs:['วิทยากรและทีมงานมีความพร้อมให้บริการ','ให้บริการสุภาพและเป็นกันเอง','มนุษยสัมพันธ์ดี','ประสานงาน/อำนวยความสะดวกเหมาะสม','ตอบสนองปัญหา/ข้อซักถามรวดเร็ว','ทีมงานเอาใจใส่ผู้เข้าอบรม'],
   keys:['q1_1','q1_2','q1_3','q1_4','q1_5','q1_6']},
  {num:2,title:'การเตรียมความพร้อม',icon:'ti-clipboard-check',color:'#0891b2',
   qs:['จัดเตรียมเอกสารครบถ้วน','คู่มือ/เอกสารเข้าใจง่าย','ลำดับเนื้อหา/Flow ชัดเจน','สื่อ/PowerPoint เหมาะสม','ระบบ/อุปกรณ์พร้อมใช้','Workshop สอดคล้องงานจริง','ระยะเวลาเหมาะสม'],
   keys:['q2_1','q2_2','q2_3','q2_4','q2_5','q2_6','q2_7']},
  {num:3,title:'ทักษะการสอน',icon:'ti-presentation',color:'#7c3aed',
   qs:['ความรู้/ความเข้าใจในระบบดี','อธิบายชัดเจน เข้าใจง่าย','ลำดับเนื้อหาต่อเนื่อง','ยกตัวอย่างเหมาะสม','เปิดโอกาสซักถาม/มีส่วนร่วม','ตอบคำถามตรงประเด็น','วิเคราะห์/เสนอแนวทางแก้ไขได้','สรุปประเด็นสำคัญก่อนจบ','มี Workshop ปฏิบัติจริง','ทีมงานสนับสนุนเพียงพอ'],
   keys:['q3_1','q3_2','q3_3','q3_4','q3_5','q3_6','q3_7','q3_8','q3_9','q3_10']},
  {num:4,title:'การมีส่วนร่วม',icon:'ti-users',color:'#059669',
   qs:['ผู้เรียนพร้อมรับการอบรม','ผู้เรียนให้ความร่วมมือดี','มีส่วนร่วมซักถาม/แลกเปลี่ยน','ตั้งใจ/สนใจเนื้อหา','บรรยากาศเอื้อต่อการเรียนรู้'],
   keys:['q4_1','q4_2','q4_3','q4_4','q4_5']},
  {num:5,title:'ผลลัพธ์หลังอบรม',icon:'ti-award',color:'#d97706',
   qs:['เข้าใจการใช้งานระบบมากขึ้น','ใช้งานระบบถูกต้องมากขึ้น','นำไปประยุกต์ใช้งานได้','ช่วยลดปัญหาในการใช้งาน','มั่นใจหลังอบรม','ตอบโจทย์การปฏิบัติงาน','พร้อม Go-Live'],
   keys:['q5_1','q5_2','q5_3','q5_4','q5_5','q5_6','q5_7']},
  {num:6,title:'ความพึงพอใจโดยรวม',icon:'ti-star',color:'#e11d48',
   qs:['ความพึงพอใจโดยรวม','ความเหมาะสมของเนื้อหา','ความเหมาะสมของเวลา','ความพึงพอใจต่อวิทยากร','ความพึงพอใจต่อระบบ/Workshop'],
   keys:['q6_1','q6_2','q6_3','q6_4','q6_5']},
];

let _svData=[],_svSessions=[],_svCats=[],_svCharts={};

// โครงการที่เลือกได้ในหน้าย่อย — แท็บอบรมของโครงการเห็นแค่โครงการนั้น (ข้อมูลผู้ลงทะเบียนก็โหลดมาเฉพาะโครงการนั้น)
const _workSites=()=>PROJECT_ID?locations.filter(l=>l.code===currentSite):locations;
function _initSvdSiteSelect(){
  const el=document.getElementById('svd-site');
  if(!el||el.options.length>0)return;
  _workSites().forEach(l=>{
    const o=document.createElement('option');
    o.value=l.code;o.textContent=`${l.code} : ${l.name}`;
    if(l.code===currentSite)o.selected=true;
    el.appendChild(o);
  });
}

async function onSvdSiteChange(){await loadSurveyDashboard();}

async function loadSurveyDashboard(){
  const siteEl=document.getElementById('svd-site');
  if(!siteEl)return;
  const site=siteEl.value||currentSite;

  document.getElementById('svd-loading').style.display='block';
  document.getElementById('svd-content').style.display='none';
  document.getElementById('svd-empty').style.display='none';

  try{
    const[sR,cR,svR]=await Promise.all([
      _sb.from('trn_sessions').select('id,name,cat_id,date,trainer').eq('site',site).order('date'),
      _sb.from('trn_categories').select('id,name,color'),
      _sb.from('trn_survey_responses').select('*').eq('site',site).order('submitted_at',{ascending:false}),
    ]);
    _svSessions=(sR.data||[]).map(x=>({...x,trainer:_staffName(x.trainer)}));_svCats=cR.data||[];_svData=svR.data||[];

    const sessEl=document.getElementById('svd-sess');
    sessEl.innerHTML='<option value="">ทุกรอบ</option>';
    const sessWithData=_svSessions.filter(s=>_svData.some(r=>+r.session_id===+s.id));
    sessWithData.forEach(s=>{
      const cat=_svCats.find(c=>c.id===s.cat_id);
      const cnt=_svData.filter(r=>r.session_id===s.id).length;
      const o=document.createElement('option');
      o.value=s.id;
      o.textContent=`[${cat?.name||'—'}] ${s.name}${s.trainer?' · '+s.trainer:''} (${fmtDateShort(s.date)}) · ${cnt} ราย`;
      sessEl.appendChild(o);
    });
    renderSurveyCharts();
  }catch(e){
    console.error(e);
    document.getElementById('svd-loading').style.display='none';
    showToast('โหลดข้อมูลการประเมินไม่สำเร็จ','danger');
  }
}

function _svFiltered(){
  let d=[..._svData];
  const sessId=parseInt(document.getElementById('svd-sess')?.value);
  if(sessId)d=d.filter(r=>r.session_id===sessId);
  const period=document.getElementById('svd-period')?.value;
  if(period&&period!=='all'){
    const cut=new Date();cut.setDate(cut.getDate()-parseInt(period));
    d=d.filter(r=>new Date(r.submitted_at)>=cut);
  }
  return d;
}

const _avg=arr=>{const v=arr.filter(x=>x!=null&&x>=1);return v.length?v.reduce((a,b)=>a+b,0)/v.length:0;};
const _avgKey=(data,k)=>_avg(data.map(r=>r[k]));
const _scoreColor=v=>v>=4.5?'#16a34a':v>=4.0?'#65a30d':v>=3.0?'#ca8a04':v>=2.0?'#ea580c':'#dc2626';
const _scoreBg=v=>v>=4.5?'#dcfce7':v>=4.0?'#ecfccb':v>=3.0?'#fef9c3':v>=2.0?'#ffedd5':'#fee2e2';
const _scoreLabel=v=>v>=4.5?'ดีมาก':v>=4.0?'ดี':v>=3.0?'พอใช้':v>=2.0?'ต้องปรับปรุง':'ต่ำมาก';

async function renderSurveyCharts(){
  if(!await _needLib('chart'))return;
  document.getElementById('svd-loading').style.display='none';
  const data=_svFiltered();

  if(!data.length){
    document.getElementById('svd-content').style.display='none';
    document.getElementById('svd-empty').style.display='block';
    return;
  }
  document.getElementById('svd-empty').style.display='none';
  document.getElementById('svd-content').style.display='block';

  // destroy old charts
  Object.values(_svCharts).forEach(c=>{try{c.destroy();}catch(e){}});
  _svCharts={};

  // ── compute section averages ──
  const secAvgs=SVD_SECTIONS.map(sec=>{
    const qAvgs=sec.keys.map((k,i)=>({key:k,label:sec.qs[i],secNum:sec.num,secTitle:sec.title,secColor:sec.color,avg:_avgKey(data,k)}));
    const avg=_avg(qAvgs.map(q=>q.avg).filter(v=>v>0));
    return{...sec,avg,qAvgs};
  });
  const overallAvg=_avg(secAvgs.map(s=>s.avg).filter(v=>v>0));

  // ── KPI ──
  const bestSec=[...secAvgs].sort((a,b)=>b.avg-a.avg)[0];
  const worstSec=[...secAvgs].sort((a,b)=>a.avg-b.avg)[0];
  const ynRows=data.filter(r=>r.q6_6!=null);
  const ynYes=ynRows.filter(r=>r.q6_6===true).length;
  const ynPct=ynRows.length?Math.round(ynYes/ynRows.length*100):0;
  const allQAvgs=secAvgs.flatMap(s=>s.qAvgs).filter(q=>q.avg>0);

  document.getElementById('svd-kpi').innerHTML=`
    <div class="stat-card blue" style="min-width:0;">
      <div class="stat-label"><i class="ti ti-clipboard-check" style="margin-right:3px;"></i>ผู้ประเมิน${calcTip("จำนวนแบบประเมินที่ส่งเข้ามา (ตามตัวกรอง)")}</div>
      <div class="stat-value">${data.length}<span style="font-size:13px;font-weight:400;color:var(--text-muted);"> ราย</span></div>
    </div>
    <div class="stat-card" style="background:${_scoreBg(overallAvg)};border:1px solid var(--border);min-width:0;">
      <div class="stat-label">คะแนนเฉลี่ยรวม${calcTip("ค่าเฉลี่ยของคะแนนเฉลี่ยแต่ละด้าน (เต็ม 5)\nแต่ละด้าน = ค่าเฉลี่ยของคะแนนแต่ละข้อในด้านนั้น · ไม่นับข้อที่ไม่ได้ตอบ\nดีมาก ≥ 4.5 · ดี ≥ 4.0 · พอใช้ ≥ 3.0 · ต้องปรับปรุง ≥ 2.0")}</div>
      <div style="font-size:28px;font-weight:700;color:${_scoreColor(overallAvg)};line-height:1.1;margin-top:4px;">${overallAvg.toFixed(2)}<span style="font-size:13px;font-weight:400;color:var(--text-muted);"> /5</span></div>
      <div style="font-size:11px;font-weight:600;color:${_scoreColor(overallAvg)};margin-top:3px;">${_scoreLabel(overallAvg)}</div>
    </div>
    <div class="stat-card green" style="min-width:0;">
      <div class="stat-label"><i class="ti ti-award"></i> ด้านดีที่สุด${calcTip("ด้านที่คะแนนเฉลี่ยสูงที่สุด")}</div>
      <div style="font-size:12px;font-weight:600;color:var(--success);margin-top:4px;line-height:1.3;">${bestSec.title}</div>
      <div style="font-size:20px;font-weight:700;color:var(--success);">${bestSec.avg.toFixed(2)}</div>
    </div>
    <div class="stat-card amber" style="min-width:0;">
      <div class="stat-label"><i class="ti ti-tool"></i> ควรพัฒนา${calcTip("ด้านที่คะแนนเฉลี่ยต่ำที่สุด")}</div>
      <div style="font-size:12px;font-weight:600;color:var(--warn);margin-top:4px;line-height:1.3;">${worstSec.title}</div>
      <div style="font-size:20px;font-weight:700;color:var(--warn);">${worstSec.avg.toFixed(2)}</div>
    </div>
    <div class="stat-card" style="background:var(--card);border:1px solid var(--border);min-width:0;">
      <div class="stat-label"><i class="ti ti-repeat" style="color:#7c3aed;"></i> ต้องการอบรมเพิ่ม${calcTip("ผู้ตอบ \"ต้องการ\" ÷ ผู้ที่ตอบข้อนี้ × 100")}</div>
      <div style="font-size:28px;font-weight:700;color:#7c3aed;line-height:1.1;margin-top:4px;">${ynPct}%</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${ynYes} / ${ynRows.length} ราย</div>
    </div>`;

  // ── Section progress bars ──
  document.getElementById('svd-section-bars').innerHTML=secAvgs.map(sec=>`
    <div style="margin-bottom:13px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
        <div style="display:flex;align-items:center;gap:7px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${sec.color};flex-shrink:0;display:inline-block;"></span>
          <span style="font-size:13px;font-weight:600;">${sec.num}. ${sec.title}</span>
          <span style="font-size:10px;color:var(--text-muted);">(${sec.keys.length} ข้อ)</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:10px;font-weight:600;padding:1px 7px;border-radius:20px;background:${_scoreBg(sec.avg)};color:${_scoreColor(sec.avg)};">${_scoreLabel(sec.avg)}</span>
          <span style="font-size:17px;font-weight:700;color:${_scoreColor(sec.avg)};min-width:36px;text-align:right;">${sec.avg.toFixed(2)}</span>
        </div>
      </div>
      <div style="height:10px;background:var(--surface3);border-radius:5px;overflow:hidden;">
        <div style="width:${(sec.avg/5)*100}%;height:100%;background:linear-gradient(90deg,${sec.color},${sec.color}cc);border-radius:5px;transition:width .6s ease;"></div>
      </div>
    </div>`).join('');

  // ── Chart.js shared config ──
  Chart.defaults.font.family='Sarabun,sans-serif';
  const fnt=(sz=11,w='normal')=>({family:'Sarabun,sans-serif',size:sz,weight:w});
  const tip={backgroundColor:'#0f172a',padding:11,cornerRadius:9,titleFont:fnt(12,'600'),bodyFont:fnt(11),titleColor:'#f1f5f9',bodyColor:'#cbd5e1',displayColors:true,boxWidth:8,boxHeight:8,boxPadding:3};
  const leg=(pos='bottom')=>({position:pos,labels:{font:fnt(10),boxWidth:10,boxHeight:10,padding:10,usePointStyle:true,pointStyleWidth:10}});

  // ── Radar ──
  const ctxR=document.getElementById('svd-chart-radar');
  if(ctxR) _svCharts.radar=new Chart(ctxR,{
    type:'radar',
    data:{
      labels:secAvgs.map(s=>`${s.num}. ${s.title.length>8?s.title.slice(0,8)+'…':s.title}`),
      datasets:[{
        label:'คะแนน',data:secAvgs.map(s=>+s.avg.toFixed(2)),
        backgroundColor:'rgba(124,58,237,.12)',borderColor:'#7c3aed',pointBackgroundColor:secAvgs.map(s=>s.color),
        pointBorderColor:'#fff',pointBorderWidth:2,pointRadius:5,borderWidth:2,
      }]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{...tip,callbacks:{label:ctx=>`${ctx.dataset.label}: ${ctx.raw} / 5`}}},
      scales:{r:{min:0,max:5,ticks:{stepSize:1,font:fnt(9),color:'#94a3b8',backdropColor:'transparent'},
        grid:{color:'rgba(226,232,240,.6)'},pointLabels:{font:fnt(10,'600'),color:'#475569'}}}}
  });

  // ── Distribution stacked bar (%) ──
  const DIST_COLORS={5:'#22c55e',4:'#84cc16',3:'#eab308',2:'#f97316',1:'#ef4444'};
  const DIST_LABELS={5:'5 – มากที่สุด',4:'4 – มาก',3:'3 – ปานกลาง',2:'2 – น้อย',1:'1 – น้อยที่สุด'};
  const distDs=[5,4,3,2,1].map(v=>({
    label:DIST_LABELS[v],backgroundColor:DIST_COLORS[v],borderRadius:3,borderSkipped:false,stack:'d',
    data:secAvgs.map(sec=>{
      const tot=data.length*sec.keys.length;
      const cnt=sec.keys.reduce((s,k)=>s+data.filter(r=>r[k]===v).length,0);
      return tot?+(cnt/tot*100).toFixed(1):0;
    })
  }));
  const ctxD=document.getElementById('svd-chart-dist');
  if(ctxD) _svCharts.dist=new Chart(ctxD,{
    type:'bar',data:{labels:secAvgs.map(s=>`ด้าน ${s.num}`),datasets:distDs},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:leg(),tooltip:{...tip,callbacks:{label:ctx=>`${ctx.dataset.label}: ${ctx.raw}%`}}},
      scales:{x:{grid:{display:false},ticks:{font:fnt(10),color:'#64748b'},border:{display:false},stacked:true},
        y:{grid:{color:'rgba(226,232,240,.5)'},ticks:{font:fnt(10),color:'#64748b',callback:v=>v+'%'},border:{display:false},stacked:true,max:100}}}
  });

  // ── Q6.6 Donut ──
  const ynNo=ynRows.length-ynYes;
  const ctxY=document.getElementById('svd-chart-yn');
  if(ctxY) _svCharts.yn=new Chart(ctxY,{
    type:'doughnut',
    data:{labels:[`ต้องการ (${ynYes} ราย)`,`ไม่ต้องการ (${ynNo} ราย)`],
      datasets:[{data:[ynYes||0,ynNo||0],backgroundColor:['#22c55e','#ef4444'],borderWidth:0,hoverOffset:6}]},
    options:{responsive:true,maintainAspectRatio:false,
      cutout:'65%',
      plugins:{legend:leg(),tooltip:{...tip}}}
  });
  document.getElementById('svd-yn-stats').innerHTML=`<span style="font-size:26px;font-weight:700;color:${ynPct>=50?'#16a34a':'#dc2626'};">${ynPct}%</span><br><span style="font-size:11px;">ต้องการอบรมเพิ่มเติม</span>`;

  // ── Best / Worst 5 questions ──
  const renderQL=(qs,type)=>qs.map((q,i)=>`
    <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--surface3);">
      <span style="min-width:22px;height:22px;border-radius:50%;background:${type==='best'?'#dcfce7':'#fef2f2'};color:${type==='best'?'#15803d':'#991b1b'};font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i+1}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;line-height:1.45;color:var(--text);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${q.label}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${q.secTitle}</div>
      </div>
      <div style="flex-shrink:0;text-align:right;">
        <div style="font-size:16px;font-weight:700;color:${_scoreColor(q.avg)};">${q.avg.toFixed(2)}</div>
      </div>
    </div>`).join('');

  const sortedQs=[...allQAvgs].sort((a,b)=>b.avg-a.avg);
  document.getElementById('svd-best-qs').innerHTML=renderQL(sortedQs.slice(0,5),'best');
  document.getElementById('svd-worst-qs').innerHTML=renderQL([...allQAvgs].sort((a,b)=>a.avg-b.avg).slice(0,5),'worst');

  // ── Heatmap table (all questions) ──
  let hmHtml='';
  SVD_SECTIONS.forEach(sec=>{
    hmHtml+=`<div style="margin-bottom:12px;">
      <div style="font-size:12px;font-weight:700;color:${sec.color};margin-bottom:6px;display:flex;align-items:center;gap:6px;"><i class="ti ${sec.icon}"></i>${sec.num}. ${sec.title}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:5px;">`;
    const sAvg=secAvgs.find(s=>s.num===sec.num);
    (sAvg?.qAvgs||[]).forEach((q,i)=>{
      hmHtml+=`<div style="display:flex;align-items:center;gap:7px;padding:6px 10px;border-radius:8px;background:${_scoreBg(q.avg)};border:1px solid ${q.avg>=4?'transparent':'rgba(0,0,0,.05)'};">
        <span style="font-size:10px;font-weight:700;color:${_scoreColor(q.avg)};min-width:18px;">${sec.num}.${i+1}</span>
        <span style="font-size:11px;color:var(--text);flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;" title="${q.label}">${q.label}</span>
        <span style="font-size:14px;font-weight:700;color:${_scoreColor(q.avg)};min-width:30px;text-align:right;">${q.avg>0?q.avg.toFixed(2):'—'}</span>
      </div>`;
    });
    hmHtml+='</div></div>';
  });
  document.getElementById('svd-heatmap').innerHTML=hmHtml;

  // ── Session comparison bar ──
  const sessComp=_svSessions.map(s=>{
    const sd=data.filter(r=>r.session_id===s.id);
    if(!sd.length)return null;
    const avg=_avg(SVD_SECTIONS.flatMap(sec=>sec.keys).map(k=>_avgKey(sd,k)).filter(v=>v>0));
    const cat=_svCats.find(c=>c.id===s.cat_id);
    return{label:`${cat?.name||''}`,sublabel:`${s.name}${s.trainer?' · '+s.trainer:''}`,date:fmtDateShort(s.date),avg,cnt:sd.length};
  }).filter(Boolean);

  const ctxS=document.getElementById('svd-chart-sess');
  if(ctxS) _svCharts.sess=new Chart(ctxS,{
    type:'bar',
    data:{
      labels:sessComp.map(s=>`${s.sublabel} (${s.date})`),
      datasets:[{label:'คะแนนเฉลี่ย',data:sessComp.map(s=>+s.avg.toFixed(2)),
        backgroundColor:sessComp.map(s=>_scoreColor(s.avg)+'cc'),borderRadius:7,borderSkipped:false}]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{...tip,callbacks:{
        title:([ctx])=>sessComp[ctx.dataIndex]?.sublabel||'',
        label:ctx=>[` คะแนน: ${ctx.raw} / 5.00`,` ผู้ประเมิน: ${sessComp[ctx.dataIndex]?.cnt} ราย`]
      }}},
      scales:{
        x:{grid:{display:false},ticks:{font:fnt(10),color:'#64748b',maxRotation:30},border:{display:false}},
        y:{grid:{color:'rgba(226,232,240,.5)'},ticks:{font:fnt(10),color:'#64748b'},border:{display:false},min:0,max:5,
          afterDataLimits:s=>{s.max=5;}}
      }}
  });

  // ── Trend line chart (per section) ──
  const trendSessions=_svSessions.filter(s=>data.some(r=>r.session_id===s.id));
  const trendDs=SVD_SECTIONS.map(sec=>({
    label:`ด้าน ${sec.num}`,borderColor:sec.color,backgroundColor:sec.color+'22',
    data:trendSessions.map(s=>{
      const sd=data.filter(r=>r.session_id===s.id);
      const avg=_avg(sec.keys.map(k=>_avgKey(sd,k)).filter(v=>v>0));
      return avg>0?+avg.toFixed(2):null;
    }),
    tension:.35,borderWidth:2,pointRadius:4,pointHoverRadius:6,fill:false,spanGaps:true,
  }));
  const ctxT=document.getElementById('svd-chart-trend');
  if(ctxT) _svCharts.trend=new Chart(ctxT,{
    type:'line',
    data:{labels:trendSessions.map(s=>`${s.name} (${fmtDateShort(s.date)})`),datasets:trendDs},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:leg('right'),tooltip:{...tip,mode:'index',intersect:false}},
      scales:{
        x:{grid:{display:false},ticks:{font:fnt(10),color:'#64748b',maxRotation:25},border:{display:false}},
        y:{grid:{color:'rgba(226,232,240,.5)'},ticks:{font:fnt(10),color:'#64748b'},border:{display:false},min:0,max:5}
      }}
  });

  // ── Comments ──
  const comments=data.filter(r=>r.comments?.trim());
  document.getElementById('svd-comment-count').textContent=comments.length?`(${comments.length} รายการ)`:'';
  if(!comments.length){
    document.getElementById('svd-comments-list').innerHTML=`<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;"><i class="ti ti-message-off" style="font-size:28px;display:block;margin-bottom:8px;opacity:.3;"></i>ไม่มีข้อเสนอแนะ</div>`;
  } else {
    document.getElementById('svd-comments-list').innerHTML=comments.slice(0,30).map(r=>{
      const s=_svSessions.find(x=>x.id===r.session_id);
      const cat=_svCats.find(c=>c.id===s?.cat_id);
      const rAllKeys=SVD_SECTIONS.flatMap(sec=>sec.keys);
      const rAvg=_avg(rAllKeys.map(k=>r[k]||0).filter(v=>v>0));
      const d=r.submitted_at?new Date(r.submitted_at).toLocaleString('th-TH',{year:'2-digit',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
      return`<div style="padding:12px;background:var(--bg-subtle);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:7px;flex-wrap:wrap;">
          ${cat?`<span style="font-size:11px;background:var(--primary-light);color:var(--primary);padding:2px 8px;border-radius:12px;font-weight:600;">${cat.name}</span>`:''}
          ${s?`<span style="font-size:11px;color:var(--text-muted);">${s.name}${s.trainer?' · '+s.trainer:''}</span>`:''}
          <span style="margin-left:auto;font-size:10px;color:var(--text-muted);">${d}</span>
          ${rAvg>0?`<span style="font-size:13px;font-weight:700;color:${_scoreColor(rAvg)};padding:1px 7px;border-radius:12px;background:${_scoreBg(rAvg)};">${rAvg.toFixed(2)}</span>`:''}
        </div>
        <p style="font-size:13px;color:var(--text);line-height:1.6;margin:0;">"${_esc(r.comments)}"</p>
      </div>`;
    }).join('')+(comments.length>30?`<div style="text-align:center;font-size:12px;color:var(--text-muted);padding:8px;">แสดง 30 รายการล่าสุด จากทั้งหมด ${comments.length} รายการ</div>`:'');
  }
}

async function exportSurveyExcel(){
  if(!await _needLib('xlsx'))return;
  const data=_svFiltered();
  if(!data.length){showToast('ไม่มีข้อมูลสำหรับ Export','danger');return;}
  const allQs=SVD_SECTIONS.flatMap(sec=>sec.keys.map((k,i)=>({key:k,label:`${sec.num}.${i+1} ${sec.qs[i]}`})));
  const headers=['ลำดับ','โครงการ','หลักสูตรอบรม','รอบอบรม','วิทยากร','วันที่ประเมิน',...allQs.map(q=>q.label),'6.6 ต้องการอบรมเพิ่ม','ข้อเสนอแนะ','คะแนนเฉลี่ย'];
  const rows=data.map((r,i)=>{
    const s=_svSessions.find(x=>x.id===r.session_id);
    const cat=_svCats.find(c=>c.id===s?.cat_id);
    const avgR=_avg(allQs.map(q=>r[q.key]||0).filter(v=>v>0));
    return[i+1,r.site,cat?.name||'',s?.name||'',s?.trainer||'',
      r.submitted_at?new Date(r.submitted_at).toLocaleDateString('th-TH'):'',
      ...allQs.map(q=>r[q.key]||''),
      r.q6_6==null?'':r.q6_6?'ต้องการ':'ไม่ต้องการ',
      r.comments||'',avgR.toFixed(2)];
  });
  const ws=XLSX.utils.aoa_to_sheet([headers,...rows]);
  // set col widths
  ws['!cols']=[{wch:6},{wch:12},{wch:18},{wch:20},{wch:16},{wch:14},...allQs.map(()=>({wch:12})),{wch:14},{wch:30},{wch:10}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'ผลประเมิน');
  const site=document.getElementById('svd-site')?.value||currentSite;
  XLSX.writeFile(wb,`survey_${site}_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast('Export สำเร็จ','success');
}

async function saveSurveyImage(){
  if(!await _needLib('html2canvas'))return;
  const data=_svFiltered();
  if(!data.length){showToast('ไม่มีข้อมูลสำหรับบันทึก','danger');return;}

  const site=document.getElementById('svd-site')?.value||currentSite;
  const sessId=parseInt(document.getElementById('svd-sess')?.value)||0;
  const period=document.getElementById('svd-period')?.value||'all';
  const selSess=_svSessions.find(s=>+s.id===sessId);
  const selCat=selSess?_svCats.find(c=>c.id===selSess.cat_id):null;
  const loc=locations.find(l=>l.code===site);

  const _pLabel=v=>v>=4.5?'มากที่สุด':v>=3.5?'มาก':v>=2.5?'ปานกลาง':v>=1.5?'น้อย':'น้อยที่สุด';
  const _pColor=v=>v>=4.5?'#16a34a':v>=3.5?'#65a30d':v>=2.5?'#ca8a04':v>=1.5?'#ea580c':'#dc2626';
  const _pBg  =v=>v>=4.5?'#dcfce7':v>=3.5?'#ecfccb':v>=2.5?'#fef9c3':v>=1.5?'#ffedd5':'#fee2e2';
  const _pStd =arr=>{const v=arr.filter(x=>x!=null&&x>=1&&x<=5);if(v.length<2)return 0;const m=v.reduce((a,b)=>a+b,0)/v.length;return Math.sqrt(v.reduce((s,x)=>s+(x-m)**2,0)/(v.length-1));};

  // header chips
  const chips=[];
  if(selSess){
    if(selCat?.name)chips.push(`หลักสูตร: ${selCat.name}`);
    chips.push(`รอบ: ${selSess.name}`);
    chips.push(`วันที่: ${fmtDateShort(selSess.date)}`);
    if(selSess.trainer)chips.push(`วิทยากร: ${selSess.trainer}`);
  }else{
    chips.push(`โครงการ: ${loc?.name||site}`);
    chips.push('ทุกรอบ');
    chips.push(`ช่วงเวลา: ${period==='all'?'ทั้งหมด':period+' วันล่าสุด'}`);
  }

  const secData=SVD_SECTIONS.map(sec=>({...sec,qData:sec.keys.map((k,i)=>{
    const vals=data.map(r=>r[k]).filter(x=>x!=null&&x>=1&&x<=5);
    const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;
    return{label:sec.qs[i],avg,std:_pStd(vals),counts:[5,4,3,2,1].map(v=>vals.filter(x=>x===v).length)};
  })}));

  const overallAvg=_avg(secData.flatMap(s=>s.qData).map(q=>q.avg).filter(v=>v>0));
  const ynRows=data.filter(r=>r.q6_6!=null);
  const ynYes=ynRows.filter(r=>r.q6_6===true).length;
  const ynPct=ynRows.length?Math.round(ynYes/ynRows.length*100):0;
  const comments=data.filter(r=>r.comments?.trim());

  // Attendance stats — scope depends on active filter
  const svSessIdSet=new Set(_svSessions.map(s=>s.id));
  let attSessIds;
  if(sessId){
    // Specific session selected
    attSessIds=[sessId];
  }else if(period&&period!=='all'){
    // Period filter active: use sessions that appear in filtered survey data AND belong to this site
    attSessIds=[...new Set(data.map(r=>r.session_id).filter(id=>id&&svSessIdSet.has(id)))];
  }else{
    // No filter: all sessions for the site
    attSessIds=_svSessions.map(s=>s.id);
  }
  let attRegs=[];
  if(attSessIds.length>0){
    const{data:regData}=await _sb.from('trn_registrations').select('attended,is_walkin').in('session_id',attSessIds);
    attRegs=regData||[];
  }
  const walkinRegs=attRegs.filter(r=>r.is_walkin);
  const preRegRegs=attRegs.filter(r=>!r.is_walkin);
  const totalReg=attRegs.length;
  const attendedReg=attRegs.filter(r=>r.attended).length;
  const absentReg=preRegRegs.filter(r=>!r.attended).length;
  const walkinCount=walkinRegs.length;
  const attPct=totalReg?Math.round(attendedReg/totalReg*100):0;

  const F="font-family:'Noto Sans Thai','Plus Jakarta Sans',Arial,sans-serif;";
  const Tb=`border:1px solid var(--border);padding:7px 8px;vertical-align:middle;${F}`;
  const Th=`border:1px solid #1e293b;padding:9px 7px;vertical-align:middle;${F}`;

  // build table rows
  let rows='';
  secData.forEach(sec=>{
    sec.qData.forEach((q,qi)=>{
      const rowBg=qi%2===0?'#ffffff':'#f8fafc';
      const lbl=q.avg>0?_pLabel(q.avg):'—';
      const clr=q.avg>0?_pColor(q.avg):'#94a3b8';
      const bg =q.avg>0?_pBg(q.avg) :'#f1f5f9';
      rows+=`<tr>
        ${qi===0?`<td rowspan="${sec.qData.length}" style="${Tb}background:${sec.color}18;text-align:center;font-weight:700;font-size:12px;color:${sec.color};line-height:1.7;white-space:nowrap;width:90px;">${sec.num}.<br>${sec.title}</td>`:''}
        <td style="${Tb}font-size:13px;color:var(--text);background:${rowBg};">${q.label}</td>
        ${q.counts.map(c=>`<td style="${Tb}text-align:center;font-size:13px;background:${rowBg};">${c||0}</td>`).join('')}
        <td style="${Tb}text-align:center;font-weight:800;color:#1d4ed8;font-size:15px;background:${rowBg};">${q.avg>0?q.avg.toFixed(2):'—'}</td>
        <td style="${Tb}text-align:center;font-size:12px;color:var(--text-muted);background:${rowBg};">${q.std>0?q.std.toFixed(2):'0.00'}</td>
        <td style="${Tb}text-align:center;background:${rowBg};"><span style="background:${bg};color:${clr};padding:4px 11px;border-radius:20px;font-size:11.5px;font-weight:700;white-space:nowrap;border:1.5px solid ${clr}44;${F}">${lbl}</span></td>
      </tr>`;
    });
  });

  const legRows=[
    {lbl:'มากที่สุด',lo:'4.5',hi:'5.00',bg:'#16a34a',tc:'#fff'},
    {lbl:'มาก',      lo:'3.5',hi:'4.49',bg:'#84cc16',tc:'#14532d'},
    {lbl:'ปานกลาง', lo:'2.5',hi:'3.49',bg:'#f59e0b',tc:'#451a03'},
    {lbl:'น้อย',     lo:'1.5',hi:'2.49',bg:'#ea580c',tc:'#fff'},
    {lbl:'น้อยที่สุด',lo:'1.0',hi:'1.49',bg:'#dc2626',tc:'#fff'},
  ].map(l=>`<tr>
    <td style="${Tb}background:${l.bg};color:${l.tc};font-weight:700;text-align:center;font-size:12px;">${l.lbl}</td>
    <td style="${Tb}text-align:center;font-size:12px;">${l.lo}</td>
    <td style="${Tb}text-align:center;font-size:12px;">${l.hi}</td>
  </tr>`).join('');

  const wrap=document.createElement('div');
  wrap.setAttribute('data-theme','light'); // ภาพที่ส่งออกพื้นสว่างเสมอ แม้หน้าจอเป็นโหมดมืด
  wrap.style.cssText=`position:fixed;left:-9999px;top:0;width:990px;background:var(--surface3);padding:22px;${F}z-index:-999;`;
  wrap.innerHTML=`
  <!-- HEADER -->
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a6e 55%,#1d4ed8 100%);border-radius:16px;padding:24px 30px;margin-bottom:16px;">
    <div style="${F}color:#fff;font-size:22px;font-weight:700;letter-spacing:.5px;margin-bottom:12px;">สรุปผลการประเมินของผู้เข้าร่วมรับการอบรม</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${chips.map(c=>`<span style="${F}background:rgba(255,255,255,.15);color:#e0f2fe;font-size:12.5px;padding:5px 14px;border-radius:20px;border:1px solid rgba(255,255,255,.22);">${c}</span>`).join('')}
    </div>
  </div>

  <!-- TABLE + SIDE -->
  <div style="display:flex;gap:14px;margin-bottom:14px;align-items:flex-start;">

    <!-- EVAL TABLE -->
    <div style="flex:1;min-width:0;background:var(--card);border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.07);">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#0f172a;">
            <th style="${Th}background:#0f172a;color:#ffffff;font-size:11px;font-weight:700;text-align:center;width:90px;">หัวข้อ<br>การประเมิน</th>
            <th style="${Th}background:#0f172a;color:#ffffff;font-size:11px;font-weight:700;text-align:left;">หัวข้อคำถาม</th>
            <th style="${Th}background:#16a34a;color:#ffffff;font-size:14px;font-weight:800;text-align:center;width:32px;">5</th>
            <th style="${Th}background:#4d7c0f;color:#ffffff;font-size:14px;font-weight:800;text-align:center;width:32px;">4</th>
            <th style="${Th}background:#a16207;color:#ffffff;font-size:14px;font-weight:800;text-align:center;width:32px;">3</th>
            <th style="${Th}background:#c2410c;color:#ffffff;font-size:14px;font-weight:800;text-align:center;width:32px;">2</th>
            <th style="${Th}background:#b91c1c;color:#ffffff;font-size:14px;font-weight:800;text-align:center;width:32px;">1</th>
            <th style="${Th}background:#0f172a;color:#bfdbfe;font-size:11px;font-weight:700;text-align:center;width:52px;">AVG</th>
            <th style="${Th}background:#0f172a;color:#cbd5e1;font-size:11px;font-weight:700;text-align:center;width:48px;">STD</th>
            <th style="${Th}background:#0f172a;color:#ffffff;font-size:11px;font-weight:700;text-align:center;width:84px;">แปลผล</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <!-- SIDE PANEL -->
    <div style="min-width:208px;flex-shrink:0;display:flex;flex-direction:column;gap:12px;">

      <!-- Attendance card -->
      <div style="background:var(--card);border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.07);">
        <div style="${F}background:linear-gradient(90deg,#0369a1,#0ea5e9);color:#fff;padding:11px 15px;font-size:13px;font-weight:700;">สถิติการเข้าร่วมอบรม</div>
        <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px;">

          <!-- ลงทะเบียนทั้งหมด -->
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
              <span style="${F}font-size:12px;font-weight:700;color:var(--text);">ลงทะเบียนทั้งหมด</span>
              <span style="${F}font-size:20px;font-weight:800;color:#0369a1;">${totalReg}<span style="font-size:11px;font-weight:500;color:var(--text-muted);"> คน</span></span>
            </div>
            <div style="display:flex;flex-direction:column;gap:3px;padding-left:10px;border-left:3px solid #e0f2fe;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="${F}font-size:11px;color:var(--text-secondary);">📋 ลงทะเบียนล่วงหน้า</span>
                <span style="${F}font-size:13px;font-weight:700;color:#0369a1;">${preRegRegs.length} คน</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="${F}font-size:11px;color:#6d28d9;">🚶 Walk-in</span>
                <span style="${F}font-size:13px;font-weight:700;color:#6d28d9;">${walkinCount} คน</span>
              </div>
            </div>
          </div>

          <div style="height:1px;background:#e2e8f0;"></div>

          <!-- เข้าอบรมทั้งหมด -->
          <div style="background:#dcfce7;border-radius:9px;padding:9px 12px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">
              <span style="${F}font-size:12px;font-weight:700;color:#15803d;">✅ เข้าอบรมทั้งหมด</span>
              <span style="${F}font-size:20px;font-weight:800;color:#15803d;">${attendedReg}<span style="font-size:11px;font-weight:500;"> คน</span></span>
            </div>
            <div style="${F}font-size:10px;color:#16a34a;opacity:.8;">(Walk-in + ลงทะเบียนล่วงหน้าที่เช็คชื่อแล้ว)</div>
          </div>

          <!-- ไม่เข้าอบรม -->
          <div style="background:#fee2e2;border-radius:9px;padding:9px 12px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="${F}font-size:12px;font-weight:700;color:#b91c1c;">❌ ไม่เข้าอบรม</span>
              <span style="${F}font-size:20px;font-weight:800;color:#b91c1c;">${absentReg}<span style="font-size:11px;font-weight:500;"> คน</span></span>
            </div>
          </div>

          <!-- Progress bar -->
          ${totalReg>0?`<div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px;font-family:'Noto Sans Thai','Plus Jakarta Sans',sans-serif;"><span>อัตราเข้าร่วม</span><span style="font-weight:700;color:#0369a1;">${attPct}%</span></div>
            <div style="height:7px;background:#e2e8f0;border-radius:4px;overflow:hidden;"><div style="height:100%;width:${attPct}%;background:linear-gradient(90deg,#0369a1,#0ea5e9);border-radius:4px;"></div></div>
          </div>`:''}

        </div>
      </div>

      <!-- Legend card -->
      <div style="background:var(--card);border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.07);">
        <div style="${F}background:#0f172a;color:#e2e8f0;padding:11px 15px;font-size:13px;font-weight:700;">ตารางแปรผลคะแนน</div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="${Tb}background:var(--bg-subtle);text-align:center;color:var(--text-secondary);font-size:11px;">ระดับ</th>
              <th style="${Tb}background:var(--bg-subtle);text-align:center;color:var(--text-secondary);font-size:11px;">ต่ำสุด</th>
              <th style="${Tb}background:var(--bg-subtle);text-align:center;color:var(--text-secondary);font-size:11px;">สูงสุด</th>
            </tr>
          </thead>
          <tbody>${legRows}</tbody>
        </table>
      </div>

      ${ynRows.length?`
      <!-- YN card -->
      <div style="background:var(--card);border-radius:14px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,.07);">
        <div style="${F}font-size:12px;font-weight:700;color:#374151;margin-bottom:10px;letter-spacing:.3px;">ต้องการอบรมเพิ่มเติม</div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:56px;height:56px;border-radius:50%;background:${ynPct>=50?'#dcfce7':'#fee2e2'};border:3px solid ${ynPct>=50?'#16a34a':'#dc2626'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <span style="${F}font-size:14px;font-weight:800;color:${ynPct>=50?'#16a34a':'#dc2626'};">${ynPct}%</span>
          </div>
          <div>
            <div style="${F}font-size:22px;font-weight:800;color:${ynPct>=50?'#16a34a':'#dc2626'};line-height:1.1;">${ynYes}<span style="font-size:13px;font-weight:500;color:var(--text-muted);"> ราย</span></div>
            <div style="${F}font-size:11px;color:var(--text-muted);margin-top:2px;">จากทั้งหมด ${ynRows.length} ราย</div>
          </div>
        </div>
      </div>`:''}

      ${overallAvg>0?`
      <!-- KPI card (ใต้ตารางแปรผล) -->
      <div style="background:linear-gradient(160deg,#1e3a5f,#2563eb);border-radius:14px;padding:18px 16px;box-shadow:0 4px 16px rgba(37,99,235,.28);">
        <div style="${F}font-size:11px;color:#93c5fd;letter-spacing:.4px;margin-bottom:4px;">คะแนนเฉลี่ยรวม</div>
        <div style="${F}font-size:46px;font-weight:800;color:#fff;line-height:1;letter-spacing:-1px;">${overallAvg.toFixed(2)}</div>
        <div style="${F}font-size:11px;color:#93c5fd;margin-top:2px;">/ 5.00 คะแนน</div>
        <div style="margin:12px 0;height:1px;background:rgba(255,255,255,.2);"></div>
        <div style="${F}font-size:11px;color:#93c5fd;margin-bottom:4px;">ระดับความพึงพอใจ</div>
        <div style="${F}font-size:20px;font-weight:700;color:#fff;">${_pLabel(overallAvg)}</div>
        <div style="margin:12px 0;height:1px;background:rgba(255,255,255,.2);"></div>
        <div style="${F}font-size:11px;color:#93c5fd;margin-bottom:4px;">ผู้ทำแบบประเมิน</div>
        <div style="${F}font-size:36px;font-weight:800;color:#fff;line-height:1;">${data.length}<span style="font-size:14px;font-weight:400;"> ราย</span></div>
      </div>`:''}
    </div>
  </div>

  <!-- COMMENTS -->
  <div style="background:var(--card);border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.07);">
    <div style="${F}background:linear-gradient(90deg,#d97706,#fbbf24);padding:12px 18px;font-weight:700;font-size:13px;color:#fff;letter-spacing:.3px;">💬 ข้อเสนอแนะเพิ่มเติม (Comments)</div>
    <div style="padding:14px 20px;">
      ${comments.length
        ?`<ul style="padding-left:20px;margin:0;">${comments.map(r=>`<li style="${F}font-size:13px;padding:5px 0;color:var(--text-secondary);line-height:1.7;border-bottom:1px solid var(--surface3);">${_esc(r.comments)}</li>`).join('')}</ul>`
        :`<p style="${F}color:var(--text-muted);font-size:13px;text-align:center;padding:10px 0;">ไม่มีข้อเสนอแนะ</p>`}
    </div>
  </div>`;

  document.body.appendChild(wrap);
  showToast('กำลังสร้างภาพ กรุณารอสักครู่...','info');
  try{
    await new Promise(r=>setTimeout(r,400));
    const canvas=await html2canvas(wrap,{scale:3,useCORS:true,backgroundColor:'#f1f5f9',width:990,windowWidth:1200,logging:false,letterRendering:true,imageTimeout:0});
    const link=document.createElement('a');
    link.download=`survey_${site}_${new Date().toISOString().slice(0,10)}.png`;
    link.href=canvas.toDataURL('image/png');
    link.click();
    showToast('บันทึกภาพสำเร็จ','success');
  }catch(e){
    console.error(e);
    showToast('บันทึกภาพไม่สำเร็จ','danger');
  }finally{
    document.body.removeChild(wrap);
  }
}

/* ══════════════════ STEP ══════════════════ */
function setStep(n){
  for(let i=1;i<=3;i++)document.getElementById('step'+i).className='step'+(i<n?' done':i===n?' active':'');
  document.getElementById('line1').className='step-line'+(n>1?' done':'');
  document.getElementById('line2').className='step-line'+(n>2?' done':'');
}

/* ══════════════════ REGISTER ══════════════════ */
function renderCategories(){
  renderCatHero();
  const today=new Date().toISOString().split('T')[0];
  // filter by search + status
  let list=categories.filter(c=>{
    if(catSearchTxt){
      const hay=(c.name+' '+(c.desc||'')).toLowerCase();
      if(!hay.includes(catSearchTxt))return false;
    }
    if(catStatusFilter==='all')return true;
    const cs=sessions.filter(s=>s.catId===c.id);
    const totalCap=cs.reduce((a,s)=>a+s.capacity,0);
    const totalReg=cs.reduce((a,s)=>a+getCount(s.id),0);
    const pct=totalCap?totalReg/totalCap*100:0;
    if(catStatusFilter==='full')return pct>=100;
    if(catStatusFilter==='near')return pct>=60&&pct<100;
    if(catStatusFilter==='avail')return pct<60;
    return true;
  });
  const grid=document.getElementById('cat-grid');
  const empty=document.getElementById('cat-empty');
  if(!list.length){
    grid.innerHTML='';
    const msg=document.getElementById('cat-empty-msg');
    if(msg)msg.textContent=categories.length?'ไม่พบหลักสูตรที่ค้นหา':'ยังไม่มีหลักสูตรที่เปิดลงทะเบียน';
    if(empty)empty.classList.add('show');
    return;
  }
  if(empty)empty.classList.remove('show');
  grid.innerHTML=list.map((c,idx)=>{
    const cm=CM[c.color]||CM.blue;
    const cs=sessions.filter(s=>s.catId===c.id);
    const totalCap=cs.reduce((a,s)=>a+s.capacity,0);
    const totalReg=cs.reduce((a,s)=>a+getCount(s.id),0);
    const avSess=cs.filter(s=>getCount(s.id)<s.capacity).length;
    const avSeats=cs.reduce((a,s)=>a+Math.max(0,s.capacity-getCount(s.id)),0);
    const fillPct=totalCap?Math.round(totalReg/totalCap*100):0;
    const fillColor=_fillColor(fillPct);
    // next available session
    const nextSess=cs.filter(s=>s.date>=today&&getCount(s.id)<s.capacity)
      .sort((a,b)=>a.date.localeCompare(b.date))[0];
    // duration from first session
    const durSet=[...new Set(cs.map(s=>calcDuration(s.timeStart,s.timeEnd)).filter(Boolean))];
    const durTxt=durSet.length===1?durSet[0]:durSet.length?durSet[0]+'+':'';
    // unique trainers
    const utrain=[...new Set(cs.map(s=>s.trainer).filter(Boolean))];
    // tags from description
    const tags=extractTags(c.name+' '+(c.desc||''));
    const tagsHtml=tags.map(t=>`<span class="cat-tag">${t}</span>`).join('');
    // status badge
    const avBadge=fillPct>=100
      ?`<span class="cat-avbadge full"><i class="ti ti-lock"></i>เต็มแล้ว</span>`
      :fillPct>=75
        ?`<span class="cat-avbadge near"><i class="ti ti-alert-circle"></i>ใกล้เต็ม</span>`
        :`<span class="cat-avbadge avail"><i class="ti ti-circle-check"></i>${avSess} รอบว่าง</span>`;
    const canReg=avSess>0;
    // หน้านี้เป็นช่วงลงทะเบียน — ปุ่มทำแบบทดสอบอยู่ที่ ?page=quiz (ไม่แสดงในการ์ด)
    const bannerInner=c.bannerUrl
      ?`<div class="cat-banner-img-overlay"></div>`
      :`<i class="ti ti-${c.icon} cat-banner-deco"></i><div class="cat-banner-icon"><i class="ti ti-${c.icon}"></i></div>`;
    const bannerStyle=c.bannerUrl
      ?`background-image:url(${c.bannerUrl});background-size:cover;background-position:center;`
      :`background:linear-gradient(135deg,${cm.g1} 0%,${cm.g2} 100%);`;
    return`<div class="cat-card${canReg?'':' is-full'}" style="--cg1:${cm.g1};--cg2:${cm.g2};--i:${idx};" onclick="${canReg?`selectCategory(${c.id})`:''}">
      <div class="cat-banner" style="${bannerStyle}">
        ${bannerInner}
        <span class="cat-banner-shine"></span>
        ${nextSess?`<div class="cat-banner-next"><i class="ti ti-calendar-event"></i>ถัดไป ${fmtDateShort(nextSess.date)}</div>`:''}
        <div class="cat-banner-badge">${avBadge}</div>
      </div>
      <div class="cat-card-header">
        <div class="cat-name">${c.name}</div>
        <div class="cat-desc">${c.desc||'—'}</div>
        ${tagsHtml?`<div class="cat-tags">${tagsHtml}</div>`:''}
      </div>
      <div class="cat-cap-wrap">
        <div class="cat-progress-meta">
          <span class="cat-reg-count">ลงทะเบียนแล้ว <strong>${totalReg}</strong> / ${totalCap} คน</span>
          <span class="cat-reg-pct" style="color:${fillColor};">${fillPct}%</span>
        </div>
        <div class="cat-cap-bar"><div class="cat-cap-fill" style="width:${Math.min(fillPct,100)}%;--fc:${fillColor};"></div></div>
        ${avSeats>0?`<div class="cat-seats-left"><span class="cat-seats-dot"></span>เหลือ <strong>${avSeats}</strong> ที่นั่งว่าง</div>`:''}
      </div>
      <div class="cat-stats">
        <div class="cat-stat-item"><i class="ti ti-calendar-event"></i><strong>${cs.length}</strong>รอบ</div>
        <div class="cat-stat-item"><i class="ti ti-armchair"></i><strong>${totalCap}</strong>ที่นั่ง</div>
        ${durTxt?`<div class="cat-stat-item"><i class="ti ti-clock-hour-4"></i><strong>${durTxt}</strong></div>`:''}
      </div>
      <div class="cat-cta">
        ${canReg
          ?`<button class="cat-cta-btn" onclick="selectCategory(${c.id});event.stopPropagation()"><span>เลือกรอบอบรม</span><i class="ti ti-arrow-right"></i></button>`
          :`<button class="cat-cta-btn disabled" disabled><i class="ti ti-lock"></i> เต็มทุกรอบแล้ว</button>`
        }
      </div>
    </div>`;
  }).join('');
  // เล่นแอนิเมชันการ์ดเฉพาะครั้งแรก — Realtime รีเฟรชแล้วไม่กระพริบซ้ำ
  grid.classList.toggle('cat-grid-anim',!grid.dataset.shown);grid.dataset.shown='1';
}
// Hero หน้าเลือกหลักสูตร: ชื่อโครงการ + ตัวเลขสรุปทุกหลักสูตรที่เปิดในโครงการนี้
function renderCatHero(){
  const box=document.getElementById('reg-hero-stats');if(!box)return;
  const site=document.getElementById('reg-hero-site');
  if(site){const loc=locations.find(l=>l.code===currentSite);site.textContent=loc?loc.name:(currentSite||'');}
  const today=new Date().toISOString().split('T')[0];
  const cs=sessions.filter(s=>categories.some(c=>c.id===s.catId));
  const openSess=cs.filter(s=>getCount(s.id)<s.capacity);
  const seats=cs.reduce((a,s)=>a+Math.max(0,s.capacity-getCount(s.id)),0);
  const next=openSess.filter(s=>s.date>=today).sort((a,b)=>a.date.localeCompare(b.date))[0];
  const st=(icon,val,lbl,tip)=>`<div class="reg-stat"><i class="ti ti-${icon}"></i><div><div class="reg-stat-num">${val}</div><div class="reg-stat-lbl">${lbl}${calcTip(tip)}</div></div></div>`;
  box.innerHTML=st('books',categories.length,'หลักสูตร')
    +st('calendar-check',openSess.length,'รอบที่เปิดรับ','รอบอบรมที่จำนวนผู้ลงทะเบียนยังไม่เต็มจำนวนที่นั่ง')
    +st('armchair',seats,'ที่นั่งว่าง','ผลรวมของ (จำนวนที่นั่ง − ผู้ลงทะเบียน) ทุกรอบ')
    +st('rocket',next?fmtDateShort(next.date):'—','รอบถัดไป','วันที่ของรอบที่ยังเปิดรับและใกล้วันนี้ที่สุด');
}
function selectCategory(catId){
  selectedCatId=catId;setStep(2);
  document.getElementById('view-categories').style.display='none';
  document.getElementById('view-sessions').style.display='block';
  sessFilt='all';
  const showFullChk=document.getElementById('sess-show-full');if(showFullChk)showFullChk.checked=false;
  document.querySelectorAll('#sess-filters .cat-filter-pill').forEach((t,i)=>t.classList.toggle('active',i===0));
  delete document.getElementById('session-list').dataset.shown; // เข้าหลักสูตรใหม่ → เล่นแอนิเมชันการ์ดอีกครั้ง
  renderSessionList();
  window.scrollTo({top:0,behavior:'smooth'});
}
function goBackToCategories(){
  selectedCatId=null;selectedSessId=null;setStep(1);
  document.getElementById('view-categories').style.display='block';
  document.getElementById('view-sessions').style.display='none';
  renderCategories();
}
function filterSess(type,el){
  sessFilt=type;
  document.querySelectorAll('#sess-filters .cat-filter-pill').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');renderSessionList();
}
// Hero หลักสูตรที่เลือก: ปุ่มกลับ · ชื่อ/คำอธิบาย · ตัวเลขสรุปรอบ (อัปเดตตาม Realtime ผ่าน renderSessionList)
function renderSessHero(){
  const box=document.getElementById('sess-hero');const cat=getCat(selectedCatId);
  if(!box||!cat)return;
  const cm=CM[cat.color]||CM.blue;
  const today=new Date().toISOString().split('T')[0];
  const cs=sessions.filter(s=>s.catId===cat.id);
  const openSess=cs.filter(s=>getCount(s.id)<s.capacity);
  const seats=cs.reduce((a,s)=>a+Math.max(0,s.capacity-getCount(s.id)),0);
  const next=openSess.filter(s=>s.date>=today).sort((a,b)=>a.date.localeCompare(b.date))[0];
  const durSet=[...new Set(cs.map(s=>calcDuration(s.timeStart,s.timeEnd)).filter(Boolean))];
  const chip=(icon,html)=>`<span class="sess-hero-chip"><i class="ti ti-${icon}"></i>${html}</span>`;
  box.style.cssText=`--cg1:${cm.g1};--cg2:${cm.g2};`+(cat.bannerUrl?`--hero-img:url(${cat.bannerUrl});`:'');
  box.className='sess-hero'+(cat.bannerUrl?' has-img':'');
  box.innerHTML=`<i class="ti ti-${cat.icon} sess-hero-deco"></i>
    <div class="sess-hero-top">
      <button class="sess-back" onclick="goBackToCategories()"><i class="ti ti-arrow-left"></i>เลือกหลักสูตรอื่น</button>
      <div class="sess-crumb"><span onclick="goBackToCategories()">หลักสูตรอบรม</span><i class="ti ti-chevron-right"></i><b>${cat.name}</b></div>
    </div>
    <div class="sess-hero-main">
      <div class="sess-hero-icon"><i class="ti ti-${cat.icon}"></i></div>
      <div class="sess-hero-text">
        <h2 class="sess-hero-title">${cat.name}</h2>
        ${cat.desc?`<p class="sess-hero-desc">${cat.desc}</p>`:''}
      </div>
    </div>
    <div class="sess-hero-chips">
      ${chip('calendar-check',`<b>${openSess.length}</b>/${cs.length} รอบเปิดรับ`)}
      ${chip('armchair',`ว่าง <b>${seats}</b> ที่นั่ง`)}
      ${durSet.length?chip('clock-hour-4',`<b>${durSet[0]}${durSet.length>1?'+':''}</b> / รอบ`):''}
      ${next?chip('rocket',`รอบถัดไป <b>${fmtDateShort(next.date)}</b>`):''}
    </div>`;
}
// ป้าย "วันนี้ / พรุ่งนี้ / อีก N วัน" ของหัวกลุ่มวันที่
function _relDay(d){
  const t=new Date();t.setHours(0,0,0,0);
  const n=Math.round((_parseDate(d)-t)/864e5);
  if(n===0)return{txt:'วันนี้',cls:'hot'};
  if(n===1)return{txt:'พรุ่งนี้',cls:'hot'};
  if(n>1)return{txt:`อีก ${n} วัน`,cls:n<=7?'soon':''};
  return{txt:'ผ่านมาแล้ว',cls:'past'};
}
function renderSessionList(){
  renderSessHero();
  let list=sessions.filter(s=>s.catId===selectedCatId);
  if(sessFilt==='avail')list=list.filter(s=>getCount(s.id)<s.capacity);
  if(sessFilt==='full')list=list.filter(s=>getCount(s.id)>=s.capacity);
  // ซ่อนรอบที่เต็มแล้วเป็นค่าเริ่มต้น (ยกเว้นติ๊ก "แสดงรอบที่เต็มแล้ว" หรือกำลังดูแท็บ "เต็มแล้ว" อยู่แล้วโดยตรง)
  const showFull=document.getElementById('sess-show-full')?.checked;
  if(sessFilt!=='full'&&!showFull)list=list.filter(s=>getCount(s.id)<s.capacity);
  const c=document.getElementById('session-list');
  if(!list.length){c.innerHTML='<div class="sess-empty"><i class="ti ti-calendar-off"></i><p>ไม่มีรอบอบรมตามตัวกรองนี้</p></div>';return;}

  // Group ตามวันที่ เรียงวันที่ ASC แล้วเรียงเวลาในวันเดียวกัน ASC
  const byDate={};
  list.forEach(s=>{(byDate[s.date]=byDate[s.date]||[]).push(s);});
  const dateKeys=Object.keys(byDate).sort();
  let idx=0;
  c.innerHTML=dateKeys.map(dateKey=>{
    const daySessions=byDate[dateKey].slice().sort((a,b)=>(a.timeStart||'').localeCompare(b.timeStart||''));
    const rel=_relDay(dateKey);
    const wd=_parseDate(dateKey).toLocaleDateString('th-TH',{weekday:'long'});
    const rows=daySessions.map(s=>{
      const cnt=getCount(s.id),pct=Math.round(cnt/s.capacity*100),full=cnt>=s.capacity,left=Math.max(0,s.capacity-cnt);
      const fc=_fillColor(pct);
      return`<div class="sess-card${full?' full':''}" style="--i:${idx++};--fc:${fc};" onclick="${full?'':`openRegister(${s.id})`}">
        <div class="sess-tile"><span class="sess-tile-m">${getMon(s.date)}</span><span class="sess-tile-d">${getDay(s.date)}</span><span class="sess-tile-w">${wd.replace('วัน','')}</span></div>
        <div class="sess-body">
          <div class="sess-name">${s.name}${capBadge(pct)}</div>
          <div class="sess-meta">
            <span><i class="ti ti-clock"></i>${sessTxt(s)}</span>
            ${s.venue?`<span><i class="ti ti-map-pin"></i>${s.venue}</span>`:''}
            ${s.trainer?`<span><i class="ti ti-presentation"></i>${s.trainer}</span>`:''}
          </div>
          <div class="sess-cap-bar"><div class="sess-cap-fill" style="width:${Math.min(pct,100)}%;"></div></div>
          <div class="sess-cap-txt"><span>ลงทะเบียนแล้ว <b>${cnt}</b> / ${s.capacity} คน</span><span>${pct}%</span></div>
        </div>
        <div class="sess-side">
          <div class="sess-ring" style="--p:${Math.min(pct,100)};"><div><b>${left}</b><small>ที่ว่าง</small></div></div>
          ${full
            ?`<button class="sess-btn" disabled><i class="ti ti-lock"></i>เต็มแล้ว</button>`
            :`<button class="sess-btn" onclick="event.stopPropagation();openRegister(${s.id})"><span>ลงทะเบียน</span><i class="ti ti-arrow-right"></i></button>`}
        </div>
      </div>`;
    }).join('');
    return`<div class="sess-day">
      <div class="sess-day-head"><span class="sess-day-dot"></span><b>${wd}ที่ ${fmtDate(dateKey)}</b>${rel.txt?`<span class="sess-day-rel ${rel.cls}">${rel.txt}</span>`:''}<span class="sess-day-count">${daySessions.length} รอบ</span></div>
      <div class="sess-day-items">${rows}</div>
    </div>`;
  }).join('');
  // เล่นแอนิเมชันการ์ดเฉพาะครั้งแรกที่เข้าหลักสูตร — Realtime รีเฟรชแล้วไม่กระพริบซ้ำ
  c.classList.toggle('sess-anim',!c.dataset.shown);c.dataset.shown='1';
}

function populateSelect(id,arr,placeholder='เลือก...'){
  const el=document.getElementById(id);if(!el)return;
  el.innerHTML=`<option value="">${placeholder}</option>`+arr.map(v=>`<option value="${v}">${v}</option>`).join('');
}
function openRegister(sessId){
  selectedSessId=sessId;setStep(3);
  const s=getSess(sessId),cat=getCat(s.catId);
  const cm=CM[cat?.color]||CM.blue;
  const head=document.getElementById('reg-modal-header');
  head.style.cssText=`--cg1:${cm.g1};--cg2:${cm.g2};`;
  document.getElementById('reg-head-deco').className=`ti ti-${cat?.icon||'pencil-plus'} rg-head-deco`;
  document.getElementById('reg-cat-name').textContent=cat?cat.name:'กรอกข้อมูลเพื่อลงทะเบียน';
  document.getElementById('reg-sess-title').textContent=s.name;
  document.getElementById('reg-sess-meta').innerHTML=`
    <span><i class="ti ti-calendar"></i>${fmtDate(s.date)}</span>
    <span><i class="ti ti-clock"></i>${sessTxt(s)}</span>
    ${s.venue?`<span><i class="ti ti-map-pin"></i>${s.venue}</span>`:''}
    ${s.trainer?`<span><i class="ti ti-presentation"></i>${s.trainer}</span>`:''}`;
  _renderRegSeat();
  ['reg-fname','reg-lname','reg-pos'].forEach(id=>document.getElementById(id).value='');
  const prev=document.getElementById('reg-name-preview');
  if(prev)prev.style.display='none';
  populateSelect('reg-prefix',prefixes,'คำนำหน้า...');
  populateSelect('reg-dept',departments,'เลือกแผนก...');
  _syncEmailField('reg-email-wrap','reg-email');
  document.getElementById('modal-register').classList.add('open');
}
function previewRegName(){
  const pre=document.getElementById('reg-prefix').value;
  const fn=document.getElementById('reg-fname').value.trim();
  const ln=document.getElementById('reg-lname').value.trim();
  const prev=document.getElementById('reg-name-preview');
  const txt=document.getElementById('reg-name-preview-txt');
  if(!prev)return;
  if(fn||ln){
    prev.style.display='flex';txt.textContent=`${pre} ${fn} ${ln}`.trim();
    document.getElementById('reg-name-avatar').textContent=(fn||ln).charAt(0);
  }
  else{prev.style.display='none';}
}
// แถบที่นั่งว่างในหัวฟอร์มลงทะเบียน (เปิดฟอร์ม + Realtime)
function _renderRegSeat(){
  const s=getSess(selectedSessId),box=document.getElementById('reg-seat-info');
  if(!s||!box)return;
  const cnt=getCount(s.id),left=Math.max(0,s.capacity-cnt),pct=Math.min(100,Math.round(cnt/s.capacity*100));
  box.className='rg-seat'+(left<=3?' low':'');
  box.innerHTML=`<div class="rg-seat-bar"><div class="rg-seat-fill" style="width:${pct}%;"></div></div>
    <span class="rg-seat-pill"><i class="ti ti-armchair"></i>ว่าง <b>${left}</b> / ${s.capacity} ที่นั่ง</span>`;
}
async function submitReg(){
  const prefix=document.getElementById('reg-prefix').value;
  const fname=document.getElementById('reg-fname').value.trim();
  const lname=document.getElementById('reg-lname').value.trim();
  const pos=document.getElementById('reg-pos').value.trim();
  const dept=document.getElementById('reg-dept').value;
  const reqEmail=siteRequiresEmail();
  const email=document.getElementById('reg-email')?.value.trim()||'';
  if(!prefix||!fname||!lname||!pos||!dept){showToast('กรุณากรอกข้อมูลให้ครบถ้วน','danger');return;}
  if(reqEmail&&!_emailRe.test(email)){showToast('กรุณากรอกอีเมลให้ถูกต้อง','danger');return;}
  const s=getSess(selectedSessId);
  if(getCount(selectedSessId)>=s.capacity){showToast('ที่นั่งเต็มแล้ว','danger');return;}
  const dup=findDupReg(fname,lname,s.catId);
  if(dup){
    const dupSess=getSess(dup.sessionId);
    const msg=dup.sessionId===selectedSessId
      ?`${fname} ${lname} ลงทะเบียนรอบนี้ไว้แล้ว`
      :`${fname} ${lname} ลงทะเบียน "${dupSess?dupSess.name:'รอบอื่น'}" ในหลักสูตรนี้ไว้แล้ว`;
    showToast(msg,'danger');return;
  }
  const near=findSimilarReg(fname,lname,s.catId);
  if(near){
    const nearSess=getSess(near.sessionId);
    if(!await showConfirm(`พบชื่อใกล้เคียง "${near.prefix}${near.fname} ${near.lname}" ลงทะเบียน "${nearSess?nearSess.name:'รอบอื่น'}" ไว้แล้ว`,
      'ถ้าเป็นคุณ (สะกดชื่อต่างกันเล็กน้อย) ไม่ต้องลงทะเบียนซ้ำ · ถ้าเป็นคนละคน กด "ลงทะเบียนต่อ"',{okLabel:'ลงทะเบียนต่อ',danger:false}))return;
  }
  const {data,error}=await _sb.from('trn_registrations').insert({
    session_id:selectedSessId,prefix_id:_mId('prefix',prefix),fname,lname,position:pos,dept_id:_mId('dept',dept),email:reqEmail?email:null,
    reg_date:new Date().toISOString().split('T')[0],attended:false
  }).select().single();
  if(error){showToast('บันทึกไม่สำเร็จ','danger');return;}
  const nr=_mReg(data);
  registrations.push(nr);
  closeModal('modal-register');renderSessionList();renderCategories();
  showToast(`ลงทะเบียนสำเร็จ! ${prefix}${fname} ${lname}`,'success');
  pushNotify(nr);
  setTimeout(()=>showQR(nr.id),600);
}

/* ══════════════════ QR CODE ══════════════════ */
function buildQRPayload(reg){
  return JSON.stringify({v:2,regId:reg.id});
}

/* ─── Pure-canvas QR renderer using qrcode-generator ─── */
function makeQRCanvas(text, size, darkColor){
  darkColor = darkColor || '#1a56a0';
  var qr = qrcode(0, 'H');
  qr.addData(text);
  qr.make();
  var modules = qr.getModuleCount();
  var cell = size / modules;
  var cvs = document.createElement('canvas');
  cvs.width = size; cvs.height = size;
  var ctx = cvs.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = darkColor;
  for(var row = 0; row < modules; row++){
    for(var col = 0; col < modules; col++){
      if(qr.isDark(row, col)){
        ctx.fillRect(
          Math.floor(col * cell), Math.floor(row * cell),
          Math.ceil(cell), Math.ceil(cell)
        );
      }
    }
  }
  return cvs;
}

// บัตรเข้าอบรม (ตั๋ว): สีตามหลักสูตร · QR ในกรอบสแกน · รอยปรุ · ข้อมูลรอบ
function showQR(regId){
  const reg=getReg(regId);if(!reg)return;
  window._currentQRReg=reg;
  const s=getSess(reg.sessionId),cat=s?getCat(s.catId):null;
  const cm=CM[cat?.color]||CM.blue;
  const regNo='REG-'+String(reg.id).padStart(5,'0');
  const info=(icon,lbl,val)=>val?`<div class="qt-info-item"><i class="ti ti-${icon}"></i><div><small>${lbl}</small><b>${val}</b></div></div>`:'';
  const inner=document.getElementById('qr-modal-inner');
  inner.innerHTML=`<div class="qt" style="--cg1:${cm.g1};--cg2:${cm.g2};">
    <div class="qt-head">
      <i class="ti ti-${cat?.icon||'certificate'} qt-head-deco"></i>
      <div class="qt-head-top">
        <span class="qt-brand"><i class="ti ti-ticket"></i>บัตรเข้าอบรม</span>
        <button type="button" class="rg-close" onclick="closeModal('modal-qr')" title="ปิด"><i class="ti ti-x"></i></button>
      </div>
      <div class="qt-course">${cat?cat.name:'BMS Training'}</div>
      ${s?`<div class="qt-round">${s.name}</div>`:''}
    </div>
    <div class="qt-qr-wrap">
      <div class="qt-qr" id="qr-canvas-wrap"><span class="qt-scan"></span><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i></div>
      <div class="qt-regno">${regNo}</div>
    </div>
    <div class="qt-perf"></div>
    <div class="qt-body">
      <div class="qt-name">${reg.prefix||''}${reg.fname} ${reg.lname}</div>
      <div class="qt-sub">${reg.position||'-'} · ${reg.dept||'-'}</div>
      ${s?`<div class="qt-info">
        ${info('calendar',"วันที่",fmtDate(s.date))}
        ${info('clock',"เวลา",sessTxt(s))}
        ${info('map-pin',"สถานที่",s.venue)}
        ${info('presentation',"วิทยากร",s.trainer)}
      </div>`:''}
      <div class="qt-status ${reg.attended?'present':''}">
        <i class="ti ti-${reg.attended?'circle-check':'hourglass'}"></i>${reg.attended?`เช็คชื่อแล้ว${reg.attendedTime?' — '+reg.attendedTime:''}`:'ยังไม่ได้เช็คชื่อ — แสดง QR นี้ต่อเจ้าหน้าที่'}
      </div>
      ${reg.attended?'':'<div class="qt-tip"><i class="ti ti-bulb"></i>เพิ่มความสว่างหน้าจอ หรือบันทึกรูปไว้ เพื่อสแกนได้เร็วขึ้น</div>'}
    </div>
  </div>`;
  document.getElementById('modal-qr').classList.add('open');
  requestAnimationFrame(()=>{
    const wrap=document.getElementById('qr-canvas-wrap');if(!wrap)return;
    try{
      const qrCvs=makeQRCanvas(buildQRPayload(reg),440,cm.g1); // วาด 2 เท่า แสดง 220px ให้คมบนจอความละเอียดสูง
      qrCvs.className='qt-qr-img';
      wrap.prepend(qrCvs);
    }catch(e){
      wrap.insertAdjacentHTML('afterbegin',`<div class="qt-qr-err">QR Error: ${e.message}</div>`);
    }
  });
}

// ตัดข้อความให้พอดีความกว้าง (canvas)
function _fitText(ctx,text,maxW){
  if(ctx.measureText(text).width<=maxW)return text;
  while(text.length&&ctx.measureText(text+'…').width>maxW)text=text.slice(0,-1);
  return text+'…';
}
async function saveQRasImage(){
  const reg=window._currentQRReg;
  if(!reg){showToast('ไม่พบข้อมูล QR','danger');return;}
  const btn=event.currentTarget;
  btn.disabled=true;
  btn.innerHTML='<i class="ti ti-loader-2" style="animation:spin .8s linear infinite"></i>กำลังสร้างรูป...';
  try{
    await document.fonts?.ready; // ฟอนต์ไทยของหน้าโหลดครบก่อนวาด
    const s=getSess(reg.sessionId),cat=s?getCat(s.catId):null;
    const cm=CM[cat?.color]||CM.blue;
    const F="'Noto Sans Thai','Plus Jakarta Sans',sans-serif";
    const rows=s?[['วันที่',fmtDate(s.date)],['เวลา',sessTxt(s)],['สถานที่',s.venue],['วิทยากร',s.trainer]].filter(r=>r[1]):[];
    const W=380,dpr=2,headH=s?118:96,qrSize=210,qrTop=headH+24;
    const perfY=qrTop+qrSize+20+34;
    const infoTop=perfY+86,infoH=Math.ceil(rows.length/2)*52+12;
    const H=infoTop+infoH+(rows.length?20:0)+60;
    const card=document.createElement('canvas');
    card.width=W*dpr;card.height=H*dpr;
    const ctx=card.getContext('2d');
    ctx.scale(dpr,dpr);
    ctx.textBaseline='alphabetic';

    // พื้นบัตร + หัวบัตรสีตามหลักสูตร
    drawRR(ctx,0,0,W,H,24,'#ffffff');
    const hg=ctx.createLinearGradient(0,0,W,headH);
    hg.addColorStop(0,'#0b1024');hg.addColorStop(.55,cm.g1);hg.addColorStop(1,cm.g2);
    drawRR(ctx,0,0,W,headH,{tl:24,tr:24,bl:0,br:0},hg);
    ctx.fillStyle='rgba(255,255,255,.14)';
    for(let x=W*.45;x<W;x+=16)for(let y=8;y<headH;y+=16){ctx.beginPath();ctx.arc(x,y,1,0,Math.PI*2);ctx.fill();}
    ctx.textAlign='left';
    ctx.fillStyle='rgba(255,255,255,.75)';ctx.font=`700 11px ${F}`;
    ctx.fillText('BMS TRAINING  ·  บัตรเข้าอบรม',24,32);
    ctx.fillStyle='#fff';ctx.font=`800 20px ${F}`;
    ctx.fillText(_fitText(ctx,cat?cat.name:'BMS Training',W-48),24,64);
    if(s){ctx.fillStyle='rgba(255,255,255,.85)';ctx.font=`600 13px ${F}`;ctx.fillText(_fitText(ctx,s.name,W-48),24,90);}

    // QR + มุมกรอบสแกน
    const qrX=(W-qrSize)/2;
    drawRR(ctx,qrX-14,qrTop-14,qrSize+28,qrSize+28,18,'#f8fafc');
    ctx.drawImage(makeQRCanvas(buildQRPayload(reg),qrSize*dpr,cm.g1),qrX,qrTop,qrSize,qrSize);
    ctx.strokeStyle=cm.g2;ctx.lineWidth=4;ctx.lineCap='round';
    const L=22,o=14,x0=qrX-o,y0=qrTop-o,x1=qrX+qrSize+o,y1=qrTop+qrSize+o;
    [[x0,y0+L,x0,y0,x0+L,y0],[x1-L,y0,x1,y0,x1,y0+L],[x0,y1-L,x0,y1,x0+L,y1],[x1-L,y1,x1,y1,x1,y1-L]].forEach(p=>{
      ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(p[2],p[3]);ctx.lineTo(p[4],p[5]);ctx.stroke();});
    ctx.textAlign='center';ctx.fillStyle='#64748b';ctx.font=`700 12px 'Plus Jakarta Sans',monospace`;
    ctx.fillText('REG-'+String(reg.id).padStart(5,'0'),W/2,qrTop+qrSize+40);

    // รอยปรุ (เจาะครึ่งวงกลมสองข้าง + เส้นประ)
    ctx.save();ctx.globalCompositeOperation='destination-out';
    [0,W].forEach(cx=>{ctx.beginPath();ctx.arc(cx,perfY,13,0,Math.PI*2);ctx.fill();});
    ctx.restore();
    ctx.strokeStyle='#e2e8f0';ctx.lineWidth=2;ctx.setLineDash([7,6]);
    ctx.beginPath();ctx.moveTo(22,perfY);ctx.lineTo(W-22,perfY);ctx.stroke();ctx.setLineDash([]);

    // ชื่อผู้เข้าอบรม
    ctx.fillStyle='#0f172a';ctx.font=`800 22px ${F}`;
    ctx.fillText(_fitText(ctx,(reg.prefix||'')+reg.fname+' '+reg.lname,W-40),W/2,perfY+42);
    ctx.fillStyle='#64748b';ctx.font=`500 13px ${F}`;
    ctx.fillText(_fitText(ctx,(reg.position||'-')+' · '+(reg.dept||'-'),W-40),W/2,perfY+64);

    // ข้อมูลรอบ 2 คอลัมน์
    if(rows.length){
      drawRR(ctx,20,infoTop,W-40,infoH,16,'#f8fafc');
      const colW=(W-40)/2;
      rows.forEach((r,i)=>{
        const x=20+16+(i%2)*colW,y=infoTop+12+Math.floor(i/2)*52;
        ctx.textAlign='left';
        ctx.fillStyle='#94a3b8';ctx.font=`600 11px ${F}`;ctx.fillText(r[0],x,y+16);
        ctx.fillStyle='#1e293b';ctx.font=`700 13px ${F}`;ctx.fillText(_fitText(ctx,r[1],colW-24),x,y+36);
      });
    }

    // สถานะ
    const ok=reg.attended,badgeY=infoTop+infoH+(rows.length?20:0);
    const bTxt=ok?'✓ เช็คชื่อแล้ว'+(reg.attendedTime?' — '+reg.attendedTime:''):'แสดง QR นี้ต่อเจ้าหน้าที่เพื่อเช็คชื่อ';
    ctx.font=`700 13px ${F}`;
    const bW=Math.min(W-40,ctx.measureText(bTxt).width+40);
    drawRR(ctx,(W-bW)/2,badgeY,bW,34,17,ok?'#d1fae5':cm.g1);
    ctx.textAlign='center';ctx.fillStyle=ok?'#065f46':'#ffffff';
    ctx.fillText(bTxt,W/2,badgeY+22);

    const link=document.createElement('a');
    link.download='QR_'+reg.fname+reg.lname+'_REG'+String(reg.id).padStart(5,'0')+'.png';
    link.href=card.toDataURL('image/png');
    link.click();
    showToast('บันทึก QR สำเร็จ! 📥','success');
  }catch(e){
    showToast('เกิดข้อผิดพลาด: '+e.message,'danger');
    console.error(e);
  }
  btn.disabled=false;
  btn.innerHTML='<i class="ti ti-download"></i>บันทึกรูปลงเครื่อง';
}

function drawRR(ctx,x,y,w,h,r,fill){
  var tl=r,tr=r,br=r,bl=r;
  if(typeof r==='object'){tl=r.tl||0;tr=r.tr||0;br=r.br||0;bl=r.bl||0;}
  ctx.beginPath();
  ctx.moveTo(x+tl,y);
  ctx.lineTo(x+w-tr,y); ctx.quadraticCurveTo(x+w,y,x+w,y+tr);
  ctx.lineTo(x+w,y+h-br); ctx.quadraticCurveTo(x+w,y+h,x+w-br,y+h);
  ctx.lineTo(x+bl,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-bl);
  ctx.lineTo(x,y+tl); ctx.quadraticCurveTo(x,y,x+tl,y);
  ctx.closePath();
  if(fill){ctx.fillStyle=fill;ctx.fill();}
}


/* ══════════════════ SCAN QR ══════════════════ */
async function startScan(){
  if(!await _needLib('jsqr'))return;
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    const needHttps=location.protocol!=='https:'&&location.hostname!=='localhost';
    showToast(needHttps?'iPhone/iOS ต้องเปิดผ่าน HTTPS เท่านั้น':'Browser ไม่รองรับกล้อง','danger');
    return;
  }
  try{
    let stream;
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:currentFacingMode},width:{ideal:1280},height:{ideal:720}}});
    }catch(e){
      // fallback สำหรับ iOS ที่ resolution constraint ทำให้ fail
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:currentFacingMode}}});
    }
    scanStream=stream;
    const v=document.getElementById('scanner-video');
    v.srcObject=stream;
    try{await v.play();}catch(pe){console.warn('video.play:',pe);}
    if('BarcodeDetector' in window&&!_barcodeDetector){
      try{_barcodeDetector=new BarcodeDetector({formats:['qr_code']});}catch(e){_barcodeDetector=null;}
    }
    document.getElementById('scan-idle').style.display='none';
    document.getElementById('scan-overlay').style.display='flex';
    document.getElementById('btn-start-scan').style.display='none';
    document.getElementById('btn-stop-scan').style.display='flex';
    document.getElementById('btn-switch-cam').style.display='flex';
    const dot=document.getElementById('scan-status-dot');
    const txt=document.getElementById('scan-status-txt');
    if(dot){dot.className='status-dot online';}
    if(txt){txt.textContent=_barcodeDetector?'กล้องทำงาน — พร้อมสแกน (Native)':'กล้องทำงาน — พร้อมสแกน';}
    scanInterval=setInterval(()=>processFrame(v),250);
    showToast('เปิดกล้องสำเร็จ พร้อมสแกน','success');
  }catch(e){
    const msg=e.name==='NotAllowedError'?'กรุณาอนุญาตการใช้กล้องในการตั้งค่า Browser':
               e.name==='NotFoundError'?'ไม่พบกล้องในอุปกรณ์นี้':
               'ไม่สามารถเข้าถึงกล้อง — ใช้ปุ่มเช็คชื่อด้วยตนเองแทน';
    showToast(msg,'warn');
  }
}
function stopScan(){
  _scanBusy=false;
  if(scanStream)scanStream.getTracks().forEach(t=>t.stop());
  if(scanInterval)clearInterval(scanInterval);
  scanStream=null;scanInterval=null;
  const v=document.getElementById('scanner-video');v.srcObject=null;
  document.getElementById('scan-idle').style.display='flex';
  document.getElementById('scan-overlay').style.display='none';
  document.getElementById('btn-start-scan').style.display='flex';
  document.getElementById('btn-stop-scan').style.display='none';
  document.getElementById('btn-switch-cam').style.display='none';
  const dot=document.getElementById('scan-status-dot');
  const txt=document.getElementById('scan-status-txt');
  if(dot){dot.className='status-dot offline';}
  if(txt){txt.textContent='กล้องปิดอยู่';}
}
function toggleCamera(){
  currentFacingMode=currentFacingMode==='environment'?'user':'environment';
  if(scanStream){
    stopScan();
    setTimeout(()=>startScan(), 300); // หน่วงเวลาเล็กน้อยเพื่อให้กล้องตัวเก่าปิดสนิทก่อนเปิดกล้องใหม่
  }
}
let _scanCanvas=null,_scanCtx=null,_barcodeDetector=null,_scanBusy=false;
function processFrame(video){
  if(!video.videoWidth||!video.videoHeight)return;
  if(_scanBusy)return;

  // ── Native BarcodeDetector (Chrome Android / Safari iOS 17+) ──
  if(_barcodeDetector){
    _scanBusy=true;
    _barcodeDetector.detect(video)
      .then(barcodes=>{
        if(barcodes.length&&barcodes[0].rawValue){
          if(navigator.vibrate)navigator.vibrate(100);
          handleQRData(barcodes[0].rawValue);
          stopScan();
        }
      })
      .catch(e=>console.warn('BarcodeDetector:',e))
      .finally(()=>{_scanBusy=false;});
    return;
  }

  // ── Fallback: jsQR ──
  try{
    if(!_scanCanvas){_scanCanvas=document.createElement('canvas');_scanCtx=_scanCanvas.getContext('2d',{willReadFrequently:true});}
    const scale=Math.min(1,1280/video.videoWidth);
    _scanCanvas.width=Math.round(video.videoWidth*scale);
    _scanCanvas.height=Math.round(video.videoHeight*scale);
    _scanCtx.drawImage(video,0,0,_scanCanvas.width,_scanCanvas.height);
    const id=_scanCtx.getImageData(0,0,_scanCanvas.width,_scanCanvas.height);
    const d=id.data;
    for(let i=0;i<d.length;i+=4){
      const g=d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114;
      const c=Math.min(255,Math.max(0,Math.round((g-90)*2.5)));
      d[i]=d[i+1]=d[i+2]=c;
    }
    const code=jsQR(d,id.width,id.height,{inversionAttempts:'attemptBoth'});
    if(code&&code.data){
      if(navigator.vibrate)navigator.vibrate(100);
      handleQRData(code.data);
      stopScan();
    }
  }catch(e){console.error('QR scan error:',e);}
}
function handleQRData(raw){
  try{
    const data=JSON.parse(raw);
    if(data.v===2||data.regId){
      processSmartCheckIn(data);
    } else {
      showScanResult('error','QR รุ่นเก่า','กรุณาพิมพ์ QR ใหม่จากระบบ',null);
    }
  }catch(e){showScanResult('error','QR ไม่ถูกต้อง','ไม่สามารถอ่านข้อมูล QR ได้',null);}
}
async function processSmartCheckIn(data){
  const reg=getReg(data.regId);
  if(!reg){showScanResult('error','ไม่พบข้อมูล',`ไม่พบ REG-${data.regId} ในระบบ`,null,data);return;}
  if(reg.attended){showScanResult('already',`เช็คชื่อไปแล้ว เวลา ${reg.attendedTime}`,'',reg,data);return;}
  showConfirmCheckIn(reg,data);
}
function showConfirmCheckIn(reg,qrData){
  const s=getSess(reg.sessionId);
  const cat=s?getCat(s.catId):null;
  const dSess=qrData||{};
  document.getElementById('scan-result-area').innerHTML=`
    <div class="scan-result confirm">
      <div class="scan-result-header confirm">
        <div class="scan-result-icon confirm"><i class="ti ti-user-question"></i></div>
        <div>
          <div class="scan-result-title">ยืนยันการเข้าอบรม?</div>
          <div style="font-size:12px;margin-top:2px;">กรุณาตรวจสอบข้อมูลก่อนกดยืนยัน</div>
        </div>
      </div>
      <div class="scan-result-body">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="width:44px;height:44px;border-radius:50%;background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;"><i class="ti ti-user"></i></div>
          <div>
            <div style="font-weight:700;font-size:16px;">${reg.prefix||''}${reg.fname} ${reg.lname}</div>
            <div style="font-size:12px;color:var(--text-muted);">${reg.position||''} — ${reg.dept}</div>
          </div>
        </div>
        <div style="background:var(--bg);border-radius:8px;padding:10px 12px;font-size:12px;display:flex;flex-direction:column;gap:5px;margin-bottom:14px;">
          ${cat||dSess.catName?`<div style="display:flex;gap:8px;align-items:center;"><i class="ti ti-category" style="color:var(--primary);font-size:13px;"></i><span><strong>${cat?cat.name:dSess.catName||''}</strong></span></div>`:''}
          ${s||dSess.sessName?`<div style="display:flex;gap:8px;align-items:center;"><i class="ti ti-calendar-event" style="color:var(--primary);font-size:13px;"></i><span>${s?s.name:dSess.sessName||''}</span></div>`:''}
          ${s||dSess.date?`<div style="display:flex;gap:8px;align-items:center;"><i class="ti ti-calendar" style="color:var(--primary);font-size:13px;"></i><span>${fmtDate(s?s.date:dSess.date)}</span></div>`:''}
          ${s||dSess.timeStart?`<div style="display:flex;gap:8px;align-items:center;"><i class="ti ti-clock" style="color:var(--primary);font-size:13px;"></i><span>${s?sessTxt(s):(dSess.timeStart||'')+' – '+(dSess.timeEnd||'')+' น.'}</span></div>`:''}
          ${s||dSess.venue?`<div style="display:flex;gap:8px;align-items:center;"><i class="ti ti-map-pin" style="color:var(--primary);font-size:13px;"></i><span>${s?s.venue:dSess.venue||''}</span></div>`:''}
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('scan-result-area').innerHTML='';startScan()"><i class="ti ti-x"></i>ยกเลิก</button>
          <button class="btn btn-success" id="confirm-checkin-btn" onclick="confirmCheckIn(${reg.id})" style="flex:1;justify-content:center;font-size:15px;padding:11px;"><i class="ti ti-circle-check"></i>ยืนยันเข้าอบรม</button>
        </div>
      </div>
    </div>`;
  setTimeout(()=>document.getElementById('scan-result-area').scrollIntoView({behavior:'smooth',block:'nearest'}),100);
}
async function confirmCheckIn(regId){
  const btn=document.getElementById('confirm-checkin-btn');
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i>กำลังบันทึก...';}
  const reg=getReg(regId);
  if(!reg)return;
  const time=nowTime();
  const {error}=await _sb.from('trn_registrations').update({attended:true,attended_time:time}).eq('id',reg.id);
  if(error){showScanResult('error','บันทึกไม่สำเร็จ','กรุณาลองใหม่',null,null);return;}
  reg.attended=true;reg.attendedTime=time;
  if(navigator.vibrate)navigator.vibrate([100,50,200]);
  addScanLog(reg,'ok');
  showScanResult('ok','เช็คชื่อสำเร็จ! ✓','',reg,null);
  updateCheckinHeroStats();
  const sid=parseInt(document.getElementById('att-sess-sel').value||0);
  if(sid===reg.sessionId)loadAttendance();
}
function showScanResult(type,title,sub,reg,qrData=null){
  const icons={ok:'circle-check',already:'clock',error:'circle-x'};
  const s=reg?getSess(reg.sessionId):null;
  const cat=s?getCat(s.catId):null;
  const dSess=qrData||{};
  document.getElementById('scan-result-area').innerHTML=`
    <div class="scan-result ${type}">
      <div class="scan-result-header ${type}">
        <div class="scan-result-icon ${type}"><i class="ti ti-${icons[type]}"></i></div>
        <div><div class="scan-result-title">${title}</div>${sub?`<div style="font-size:12px;margin-top:2px;">${sub}</div>`:''}</div>
      </div>
      <div class="scan-result-body">
        ${reg?`
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="width:44px;height:44px;border-radius:50%;background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;"><i class="ti ti-user"></i></div>
            <div>
              <div style="font-weight:700;font-size:15px;">${reg.prefix||''}${reg.fname} ${reg.lname}</div>
              <div style="font-size:12px;color:var(--text-muted);">${reg.position||''} — ${reg.dept}</div>
            </div>
          </div>
          <div style="background:var(--bg);border-radius:8px;padding:10px 12px;font-size:12px;display:flex;flex-direction:column;gap:5px;">
            ${cat||dSess.catName?`<div style="display:flex;gap:8px;align-items:center;"><i class="ti ti-category" style="color:var(--primary);font-size:13px;"></i><span><strong>${cat?cat.name:dSess.catName||''}</strong></span></div>`:''}
            ${s||dSess.sessName?`<div style="display:flex;gap:8px;align-items:center;"><i class="ti ti-calendar-event" style="color:var(--primary);font-size:13px;"></i><span>${s?s.name:dSess.sessName||''}</span></div>`:''}
            ${s||dSess.date?`<div style="display:flex;gap:8px;align-items:center;"><i class="ti ti-calendar" style="color:var(--primary);font-size:13px;"></i><span>${fmtDate(s?s.date:dSess.date)}</span></div>`:''}
            ${s||dSess.timeStart?`<div style="display:flex;gap:8px;align-items:center;"><i class="ti ti-clock" style="color:var(--primary);font-size:13px;"></i><span>${s?sessTxt(s):(dSess.timeStart||'')+' – '+(dSess.timeEnd||'')+' น.'}</span></div>`:''}
            ${s||dSess.venue?`<div style="display:flex;gap:8px;align-items:center;"><i class="ti ti-map-pin" style="color:var(--primary);font-size:13px;"></i><span>${s?s.venue:dSess.venue||''}</span></div>`:''}
            ${type==='ok'?`<div style="display:flex;gap:8px;align-items:center;"><i class="ti ti-clock-check" style="color:var(--success);font-size:13px;"></i><span style="color:var(--success);font-weight:600;">เวลาเข้า: ${reg.attendedTime}</span></div>`:''}
          </div>`
        :''}
        <div style="margin-top:12px;display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('scan-result-area').innerHTML=''"><i class="ti ti-x"></i>ปิด</button>
          <button class="btn btn-primary btn-sm" onclick="startScan()"><i class="ti ti-camera"></i>สแกนต่อ</button>
          ${reg?`<button class="btn btn-ghost btn-sm" onclick="showQR(${reg.id})"><i class="ti ti-qrcode"></i>ดู QR</button>`:''}
        </div>
      </div>
    </div>`;
  setTimeout(()=>document.getElementById('scan-result-area').scrollIntoView({behavior:'smooth',block:'nearest'}),100);
}
function addScanLog(reg,type){
  const s=getSess(reg.sessionId);
  _scanLogIds.add(reg.id);
  scanLog.unshift({regId:reg.id,name:`${reg.prefix||''}${reg.fname} ${reg.lname}`,sess:s?s.name:'-',date:s?fmtDateShort(s.date):'',time:nowTime(),type});
  renderScanLog();
}
function renderScanLog(){
  const c=document.getElementById('scan-log-list');
  if(!scanLog.length){c.innerHTML='<div class="empty" style="padding:20px;"><i class="ti ti-clock"></i><p>ยังไม่มีการสแกน</p></div>';return;}
  c.innerHTML=scanLog.slice(0,12).map(l=>`
    <div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--border);">
      <div style="width:30px;height:30px;border-radius:50%;background:${l.type==='ok'?'var(--success-light)':'var(--warn-light)'};color:${l.type==='ok'?'#065f46':'#9a3412'};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">
        <i class="ti ti-${l.type==='ok'?'circle-check':'clock'}"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${l.name}</div>
        <div style="font-size:11px;color:var(--text-muted);">${l.sess} &nbsp;|&nbsp; ${l.date}</div>
      </div>
      <div style="font-size:12px;color:var(--text-muted);flex-shrink:0;">${l.time}</div>
    </div>`).join('');
}
function clearScanLog(){scanLog=[];_scanLogIds.clear();renderScanLog();}
function _mergeRealtimeScanLog(){
  const toAdd=registrations.filter(r=>r.attended&&!!getSess(r.sessionId)&&!_scanLogIds.has(r.id));
  if(!toAdd.length)return;
  toAdd.forEach(r=>{
    const s=getSess(r.sessionId);
    _scanLogIds.add(r.id);
    scanLog.push({regId:r.id,name:`${r.prefix||''}${r.fname} ${r.lname}`,sess:s?s.name:'-',date:s?fmtDateShort(s.date):'',time:r.attendedTime||'',type:'ok'});
  });
  scanLog.sort((a,b)=>b.time.localeCompare(a.time));
  renderScanLog();
}
function manualCheckIn(){
  document.getElementById('manual-search').value='';
  document.getElementById('manual-results').innerHTML='';
  document.getElementById('modal-manual').classList.add('open');
}
function manualSearchResult(){
  const q=document.getElementById('manual-search').value.trim().toLowerCase();
  const c=document.getElementById('manual-results');
  if(!q){c.innerHTML='';return;}
  const regs=registrations.filter(r=>!!getSess(r.sessionId)&&(r.fname+r.lname).toLowerCase().includes(q));
  if(!regs.length){c.innerHTML='<div class="empty" style="padding:16px;"><i class="ti ti-user-x"></i><p>ไม่พบรายชื่อ</p></div>';return;}
  c.innerHTML=regs.map(r=>{
    const s=getSess(r.sessionId);
    return`<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;background:${r.attended?'#f0fdf4':'#fff'};">
      <div style="flex:1;">
        <div style="font-weight:600;font-size:13px;">${r.prefix||''}${r.fname} ${r.lname}</div>
        <div style="font-size:12px;color:var(--text-muted);">${r.position||''} — ${r.dept}</div>
        ${s?`<div style="font-size:11px;color:var(--text-muted);margin-top:2px;"><i class="ti ti-calendar" style="vertical-align:-1px;"></i> ${s.name} — ${fmtDate(s.date)}</div>`:''}
      </div>
      ${r.attended
        ?`<span class="badge badge-success"><i class="ti ti-check"></i>เช็คแล้ว ${r.attendedTime}</span>`
        :`<button class="btn btn-success btn-sm" onclick="manualMark(${r.id})"><i class="ti ti-check"></i>เช็คชื่อ</button>`}
    </div>`;
  }).join('');
}
async function manualMark(regId){
  const reg=getReg(regId);if(!reg)return;
  const time=nowTime();
  const {error}=await _sb.from('trn_registrations').update({attended:true,attended_time:time}).eq('id',regId);
  if(error){showToast('บันทึกไม่สำเร็จ','danger');return;}
  reg.attended=true;reg.attendedTime=time;
  addScanLog(reg,'ok');manualSearchResult();
  showToast(`เช็คชื่อ ${reg.prefix||''}${reg.fname} สำเร็จ`,'success');
}

/* ══════════════════ ATTENDANCE ══════════════════ */
function initAttendancePage(){
  document.getElementById('att-cat-sel').innerHTML='<option value="">ทุกหลักสูตร</option>'+categories.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  attFilterCat();
}
function attFilterCat(){
  const cid=document.getElementById('att-cat-sel').value;
  const list=cid?sessions.filter(s=>s.catId==cid):sessions;
  document.getElementById('att-sess-sel').innerHTML='<option value="">เลือกรอบ...</option>'+list.map(s=>`<option value="${s.id}">${s.name} — ${fmtDateShort(s.date)}</option>`).join('');
  loadAttendance();
}
function loadAttendance(){
  const sid=parseInt(document.getElementById('att-sess-sel').value);
  const c=document.getElementById('att-content');
  updateCheckinHeroStats();
  if(!sid){c.innerHTML='<div class="empty"><i class="ti ti-calendar-event"></i><p>เลือกรอบอบรมเพื่อดูรายชื่อ</p></div>';return;}
  const s=getSess(sid),cat=getCat(s.catId);
  const regs=registrations.filter(r=>r.sessionId===sid);
  const present=regs.filter(r=>r.attended).length;
  const walkinCount=regs.filter(r=>r.isWalkin).length;
  const pct=regs.length?Math.round(present/regs.length*100):0;
  c.innerHTML=`
    <div class="card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div style="min-width:0;">
          <div style="font-family:var(--heading);font-size:15px;font-weight:600;color:var(--primary);">${cat.name} — ${s.name}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:3px;display:flex;flex-wrap:wrap;gap:12px;">
            <span><i class="ti ti-calendar"></i> ${fmtDate(s.date)}</span>
            <span><i class="ti ti-clock"></i> ${sessTxt(s)}</span>
            <span><i class="ti ti-map-pin"></i> ${s.venue}</span>
            <span><i class="ti ti-user-check"></i> ${s.trainer}</span>
          </div>
        </div>
        <div class="att-progress-mini"${walkinCount?` title="รวม Walk-in ${walkinCount} คน"`:''}>
          <div class="att-progress-bar"><div class="att-progress-fill" style="width:${pct}%;"></div></div>
          <span>${present}/${regs.length} คน</span>
        </div>
      </div>
    </div>
    <div class="card" style="padding:0;overflow:hidden;">
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
        <div style="font-family:var(--heading);font-size:14px;font-weight:600;color:var(--primary);display:flex;align-items:center;gap:8px;"><i class="ti ti-users"></i>รายชื่อ</div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm" style="background:#7c3aed;color:#fff;border:none;gap:5px;" onclick="openWalkinModal(${sid})"><i class="ti ti-walk"></i>Walk-in</button>
          <button class="btn btn-success btn-sm" onclick="markAllPresent(${sid})"><i class="ti ti-check-all"></i>เช็คทั้งหมด</button>
          <button class="btn btn-ghost btn-sm" onclick="clearAllAtt(${sid})"><i class="ti ti-x"></i>ล้าง</button>
        </div>
      </div>
      ${!regs.length?'<div class="empty"><i class="ti ti-users-minus"></i><p>ยังไม่มีผู้ลงทะเบียน</p></div>':
        '<div>'+regs.map(r=>{
          const ini=(r.fname[0]||'')+(r.lname[0]||'');
          return`<div class="att-row ${r.attended?'present':''}">
            <div class="att-avatar ${r.attended?'present':'absent'}">${ini}</div>
            <div class="att-info">
              <div class="att-name">${r.prefix||''}${r.fname} ${r.lname}${r.isWalkin?'<span style="margin-left:6px;font-size:10px;font-weight:700;background:#ede9fe;color:#7c3aed;padding:1px 6px;border-radius:10px;vertical-align:middle;">🚶 Walk-in</span>':''}</div>
              <div class="att-sub">${r.position||'-'} | ${r.dept}</div>
            </div>
            <div style="font-size:11px;color:var(--text-muted);text-align:right;min-width:80px;">
              ${r.attended?`<span class="badge badge-success"><i class="ti ti-clock"></i>${r.attendedTime}</span>`:'<span style="color:var(--text-muted);">ยังไม่เช็ค</span>'}
            </div>
            ${r.isWalkin
              ?`<button class="check-btn checked" style="background:#dc2626;" onclick="deleteWalkin(${r.id})" title="ลบ Walk-in"><i class="ti ti-trash"></i></button>`
              :`<button class="check-btn ${r.attended?'checked':''}" onclick="toggleAtt(${r.id})" title="${r.attended?'ยกเลิก':'เช็คชื่อ'}"><i class="ti ti-${r.attended?'check':''}"></i></button>`
            }
          </div>`;
        }).join('')+'</div>'
      }
    </div>`;
}
async function toggleAtt(regId){
  const reg=getReg(regId);if(!reg)return;
  const newAtt=!reg.attended,newTime=newAtt?nowTime():null;
  const {error}=await _sb.from('trn_registrations').update({attended:newAtt,attended_time:newTime}).eq('id',regId);
  if(error){showToast('บันทึกไม่สำเร็จ','danger');return;}
  reg.attended=newAtt;reg.attendedTime=newTime;
  loadAttendance();updateCheckinHeroStats();
  showToast(reg.attended?`✓ เช็คชื่อ ${reg.prefix||''}${reg.fname}`:`ยกเลิกเช็คชื่อ ${reg.fname}`,reg.attended?'success':'warn');
}
async function markAllPresent(sid){
  const toMark=registrations.filter(r=>r.sessionId===sid&&!r.attended);
  if(!toMark.length)return;
  const time=nowTime();
  const {error}=await _sb.from('trn_registrations').update({attended:true,attended_time:time}).in('id',toMark.map(r=>r.id));
  if(error){showToast('บันทึกไม่สำเร็จ','danger');return;}
  toMark.forEach(r=>{r.attended=true;r.attendedTime=time;});
  loadAttendance();showToast('เช็คชื่อทั้งหมดสำเร็จ','success');
}
async function clearAllAtt(sid){
  if(!await showConfirm('ล้างการเช็คชื่อทั้งหมดในรอบนี้?','',{okLabel:'ล้างข้อมูล',danger:true}))return;
  const toClr=registrations.filter(r=>r.sessionId===sid&&r.attended);
  if(!toClr.length){showToast('ไม่มีรายการที่เช็คชื่อ','warn');return;}
  const {error}=await _sb.from('trn_registrations').update({attended:false,attended_time:null}).in('id',toClr.map(r=>r.id));
  if(error){showToast('บันทึกไม่สำเร็จ','danger');return;}
  toClr.forEach(r=>{r.attended=false;r.attendedTime=null;});
  loadAttendance();showToast('ล้างการเช็คชื่อแล้ว','warn');
}
/* ══════════════════ WALK-IN ══════════════════ */
function openWalkinModal(sid){
  const pickerWrap=document.getElementById('walkin-sess-picker-wrap');
  if(!sid){
    // ยังไม่ได้เลือกรอบมาก่อน (เช่น เปิดจากแท็บ Scan QR) → ให้เลือกรอบได้เลยในหน้าต่างนี้ ไม่ต้องสลับไปแท็บ "รายชื่อ"
    const picker=document.getElementById('walkin-sess-picker');
    picker.innerHTML='<option value="">เลือกรอบอบรม...</option>'+sessions.map(s=>{
      const cnt=getCount(s.id),cat=getCat(s.catId),full=cnt>=s.capacity;
      return `<option value="${s.id}"${full?' disabled':''}>${cat?cat.name+' — ':''}${s.name} (${fmtDateShort(s.date)})${full?' [เต็มแล้ว]':' — ว่าง '+(s.capacity-cnt)+' ที่'}</option>`;
    }).join('');
    picker.value='';
    if(pickerWrap)pickerWrap.style.display='';
    document.getElementById('walkin-sess-id').value='';
    document.getElementById('walkin-sess-title').textContent='กรุณาเลือกรอบอบรม';
    document.getElementById('walkin-sess-meta').textContent='';
    ['walkin-fname','walkin-lname','walkin-pos'].forEach(id=>document.getElementById(id).value='');
    populateSelect('walkin-prefix',prefixes,'คำนำหน้า...');
    populateSelect('walkin-dept',departments,'เลือกแผนก...');
    _syncEmailField('walkin-email-wrap','walkin-email');
    document.getElementById('modal-walkin').classList.add('open');
    setTimeout(()=>picker?.focus(),200);
    return;
  }
  if(pickerWrap)pickerWrap.style.display='none';
  _openWalkinForSess(sid);
}
function onWalkinSessPick(){
  const sid=parseInt(document.getElementById('walkin-sess-picker').value);
  if(!sid)return;
  document.getElementById('walkin-sess-picker-wrap').style.display='none';
  _openWalkinForSess(sid);
}
function _openWalkinForSess(sid){
  const s=getSess(sid);
  if(!s){showToast('ไม่พบข้อมูลรอบอบรม','danger');return;}
  const cnt=getCount(sid);
  if(cnt>=s.capacity){
    closeModal('modal-walkin');
    showAlert(
      `ที่นั่งเต็มแล้ว — ไม่สามารถเพิ่ม Walk-in ได้`,
      `รอบ "${s.name}" รับได้ ${s.capacity} คน มีผู้ลงทะเบียนแล้ว ${cnt} คน\nกรุณาไปที่ Admin → จัดการรอบอบรม แล้วเพิ่มจำนวนที่นั่งก่อน`
    );
    return;
  }
  const cat=getCat(s.catId);
  document.getElementById('walkin-sess-id').value=sid;
  document.getElementById('walkin-sess-title').textContent=`${cat?.name||''} — ${s.name}`;
  document.getElementById('walkin-sess-meta').textContent=`${fmtDate(s.date)} · ${sessTxt(s)}`;
  ['walkin-fname','walkin-lname','walkin-pos'].forEach(id=>document.getElementById(id).value='');
  populateSelect('walkin-prefix',prefixes,'คำนำหน้า...');
  populateSelect('walkin-dept',departments,'เลือกแผนก...');
  _syncEmailField('walkin-email-wrap','walkin-email');
  document.getElementById('modal-walkin').classList.add('open');
  setTimeout(()=>document.getElementById('walkin-fname').focus(),200);
}
async function submitWalkin(){
  const sid=parseInt(document.getElementById('walkin-sess-id').value);
  const prefix=document.getElementById('walkin-prefix').value;
  const fname=document.getElementById('walkin-fname').value.trim();
  const lname=document.getElementById('walkin-lname').value.trim();
  const pos=document.getElementById('walkin-pos').value.trim();
  const dept=document.getElementById('walkin-dept').value;
  const reqEmail=siteRequiresEmail();
  const email=document.getElementById('walkin-email')?.value.trim()||'';
  if(!fname||!lname||!pos||!dept){showToast('กรอกข้อมูลให้ครบทุกช่อง','danger');return;}
  if(reqEmail&&!_emailRe.test(email)){showToast('กรุณากรอกอีเมลให้ถูกต้อง','danger');return;}
  const s=getSess(sid);
  if(s&&getCount(sid)>=s.capacity){
    closeModal('modal-walkin');
    showAlert(
      `ที่นั่งเต็มแล้ว — ไม่สามารถเพิ่ม Walk-in ได้`,
      `รอบ "${s.name}" รับได้ ${s.capacity} คน มีผู้ลงทะเบียนแล้ว ${getCount(sid)} คน\nกรุณาเพิ่มจำนวนที่นั่งใน Admin ก่อน`
    );
    return;
  }
  const time=nowTime();
  const {data,error}=await _sb.from('trn_registrations').insert({
    session_id:sid,prefix_id:_mId('prefix',prefix),fname,lname,position:pos,dept_id:_mId('dept',dept),email:reqEmail?email:null,
    reg_date:new Date().toISOString().split('T')[0],
    attended:true,attended_time:time,is_walkin:true,
  }).select().single();
  if(error){showToast('บันทึกไม่สำเร็จ: '+error.message,'danger');return;}
  registrations.push(_mReg(data));
  closeModal('modal-walkin');
  loadAttendance();updateCheckinHeroStats();
  showToast(`✓ Walk-in: ${prefix||''}${fname} ${lname}`,'success');
}
async function deleteWalkin(regId){
  const reg=getReg(regId);if(!reg||!reg.isWalkin)return;
  if(!await showConfirm(`ลบ Walk-in "${reg.prefix||''}${reg.fname} ${reg.lname}" ออก?`,'',{okLabel:'ลบ',danger:true}))return;
  const {error}=await _sb.from('trn_registrations').delete().eq('id',regId);
  if(error){showToast('ลบไม่สำเร็จ','danger');return;}
  const idx=registrations.findIndex(r=>r.id===regId);
  if(idx!==-1)registrations.splice(idx,1);
  loadAttendance();updateCheckinHeroStats();
  showToast('ลบ Walk-in แล้ว','warn');
}

async function exportAttendance(){
  if(!await _needLib('xlsx'))return;
  const sid=parseInt(document.getElementById('att-sess-sel').value);
  if(!sid){showToast('กรุณาเลือกรอบอบรมก่อน','danger');return;}
  const s=getSess(sid),cat=s?getCat(s.catId):null;
  const regs=registrations.filter(r=>r.sessionId===sid);
  const wb=XLSX.utils.book_new();

  // Info sheet
  const info=[
    ['หลักสูตรอบรม',cat?cat.name:'-'],
    ['รอบอบรม',s.name],
    ['วันที่',fmtDate(s.date)],
    ['สถานที่',s.venue||'-'],
    ['วิทยากร',s.trainer||'-'],
    ['ลงทะเบียน',regs.length],
    ['เข้าอบรม',regs.filter(r=>r.attended).length],
    ['ขาด',regs.filter(r=>!r.attended).length],
  ];
  const wsInfo=XLSX.utils.aoa_to_sheet(info);
  wsInfo['!cols']=[{wch:18},{wch:35}];
  XLSX.utils.book_append_sheet(wb,wsInfo,'ข้อมูลรอบอบรม');

  // Attendance sheet
  const rows=regs.map((r,i)=>({
    'ลำดับ':i+1,
    'คำนำหน้า':r.prefix||'',
    'ชื่อ':r.fname,
    'นามสกุล':r.lname,
    'ตำแหน่ง':r.position||'',
    'แผนก':r.dept,
    'อีเมล':r.email||'',
    'ประเภท':r.isWalkin?'Walk-in':'ลงทะเบียน',
    'สถานะ':r.attended?'เข้าอบรม':'ขาด',
    'เวลาเข้า':r.attendedTime||'-',
  }));
  const wsAtt=XLSX.utils.json_to_sheet(rows);
  wsAtt['!cols']=[{wch:6},{wch:10},{wch:16},{wch:16},{wch:18},{wch:22},{wch:24},{wch:12},{wch:10},{wch:10}];
  XLSX.utils.book_append_sheet(wb,wsAtt,'รายชื่อเช็คชื่อ');

  XLSX.writeFile(wb,`เช็คชื่อ_${s.name}_${s.date}.xlsx`);
  showToast('Export Excel สำเร็จ','success');
}
async function exportAllRegsExcel(){
  if(!await _needLib('xlsx'))return;
  const wb=XLSX.utils.book_new();
  const siteRegs=registrations.filter(r=>!!getSess(r.sessionId));

  // Sheet 1: All registrations
  const allRows=siteRegs.map((r,i)=>{
    const s=getSess(r.sessionId),cat=s?getCat(s.catId):null;
    return{
      'ลำดับ':i+1,
      'คำนำหน้า':r.prefix||'',
      'ชื่อ':r.fname,
      'นามสกุล':r.lname,
      'ตำแหน่ง':r.position||'',
      'แผนก':r.dept,
      'อีเมล':r.email||'',
      'หลักสูตรอบรม':cat?cat.name:'-',
      'รอบอบรม':s?s.name:'-',
      'วันที่อบรม':s?s.date:'-',
      'สถานที่':s?s.venue:'-',
      'วิทยากร':s?s.trainer:'-',
      'วันที่ลงทะเบียน':r.regDate||'-',
      'สถานะ':r.attended?'เข้าอบรม':'ขาด',
      'เวลาเข้า':r.attendedTime||'-',
    };
  });
  const ws1=XLSX.utils.json_to_sheet(allRows);
  ws1['!cols']=[{wch:5},{wch:10},{wch:16},{wch:16},{wch:18},{wch:22},{wch:24},{wch:20},{wch:22},{wch:12},{wch:18},{wch:16},{wch:14},{wch:10},{wch:10}];
  XLSX.utils.book_append_sheet(wb,ws1,'ผู้ลงทะเบียนทั้งหมด');

  // Sheet 2: Summary by department
  const deptMap={};
  siteRegs.forEach(r=>{
    if(!deptMap[r.dept])deptMap[r.dept]={cnt:0,att:0};
    deptMap[r.dept].cnt++;
    if(r.attended)deptMap[r.dept].att++;
  });
  const deptRows=Object.entries(deptMap).map(([dept,v])=>({
    'แผนก':dept,
    'ลงทะเบียน':v.cnt,
    'เข้าอบรม':v.att,
    'ขาด':v.cnt-v.att,
    'อัตราเข้าร่วม (%)':v.cnt?Math.round(v.att/v.cnt*100):0,
  })).sort((a,b)=>b['ลงทะเบียน']-a['ลงทะเบียน']);
  const ws2=XLSX.utils.json_to_sheet(deptRows);
  ws2['!cols']=[{wch:28},{wch:12},{wch:12},{wch:8},{wch:18}];
  XLSX.utils.book_append_sheet(wb,ws2,'สรุปตามแผนก');

  // Sheet 3: Summary by session
  const sessRows=sessions.map(s=>{
    const regs=registrations.filter(r=>r.sessionId===s.id);
    const att=regs.filter(r=>r.attended).length;
    const cat=getCat(s.catId);
    return{
      'หลักสูตรอบรม':cat?cat.name:'-',
      'รอบอบรม':s.name,
      'วันที่':s.date,
      'สถานที่':s.venue||'-',
      'วิทยากร':s.trainer||'-',
      'ลงทะเบียน':regs.length,
      'เข้าอบรม':att,
      'ขาด':regs.length-att,
      'อัตราเข้าร่วม (%)':regs.length?Math.round(att/regs.length*100):0,
    };
  }).filter(r=>r['ลงทะเบียน']>0);
  const ws3=XLSX.utils.json_to_sheet(sessRows);
  ws3['!cols']=[{wch:20},{wch:24},{wch:12},{wch:18},{wch:16},{wch:10},{wch:10},{wch:8},{wch:18}];
  XLSX.utils.book_append_sheet(wb,ws3,'สรุปตามรอบ');

  const today=new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb,`BMS_Training_${today}.xlsx`);
  showToast(`Export Excel สำเร็จ — ${siteRegs.length} รายการ`,'success');
}

/* ══════════════════ TRACK ══════════════════ */
function populateTrackFilters(){
  document.getElementById('track-cat').innerHTML='<option value="">ทุกหลักสูตร</option>'+categories.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  _populateTrackSessOptions();
  trackSearch();
}
/* รายการ "รอบ" ให้เหลือเฉพาะรอบของหลักสูตรที่เลือกไว้ (ถ้าไม่เลือกหลักสูตร แสดงทุกรอบ) เรียงตามวันที่-เวลา */
function _populateTrackSessOptions(){
  const cid=document.getElementById('track-cat').value;
  const list=(cid?sessions.filter(s=>s.catId==cid):sessions).slice().sort((a,b)=>{
    const dtA=`${a.date} ${a.timeStart||'00:00'}`,dtB=`${b.date} ${b.timeStart||'00:00'}`;
    return dtA<dtB?-1:dtA>dtB?1:0;
  });
  const sel=document.getElementById('track-sess');
  const prevVal=sel.value;
  sel.innerHTML='<option value="">ทุกรอบ</option>'+list.map(s=>`<option value="${s.id}">${s.name} – ${fmtDateShort(s.date)}</option>`).join('');
  if([...sel.options].some(o=>o.value===prevVal))sel.value=prevVal; // คงค่าที่เคยเลือกไว้ถ้ายังอยู่ในรายการใหม่
}
function onTrackCatChange(){
  _populateTrackSessOptions();
  trackSearch();
}
// Hero หน้าตรวจสอบการลงทะเบียน: ตัวเลขสรุปของโครงการปัจจุบัน
function renderTrackHero(){
  const box=document.getElementById('track-hero-stats');if(!box)return;
  const regs=registrations.filter(r=>!!getSess(r.sessionId));
  const today=new Date().toISOString().split('T')[0];
  const upcoming=sessions.filter(s=>s.date>=today).length;
  const st=(icon,val,lbl,tip)=>`<div class="reg-stat"><i class="ti ti-${icon}"></i><div><div class="reg-stat-num">${val}</div><div class="reg-stat-lbl">${lbl}${calcTip(tip)}</div></div></div>`;
  box.innerHTML=st('users',regs.length,'ผู้ลงทะเบียน')
    +st('circle-check',regs.filter(r=>r.attended).length,'เข้าอบรมแล้ว','ผู้ลงทะเบียนที่เช็คชื่อเข้าอบรมแล้ว')
    +st('books',categories.length,'หลักสูตร')
    +st('calendar-time',upcoming,'รอบที่กำลังจะถึง','รอบอบรมที่วันที่ตั้งแต่วันนี้เป็นต้นไป');
}
function trackSearch(){
  renderTrackHero();
  const nq=(document.getElementById('track-name').value||'').toLowerCase();
  const pq=(document.getElementById('track-pos').value||'').toLowerCase();
  const cid=document.getElementById('track-cat').value;
  const sid=document.getElementById('track-sess').value;
  let regs=registrations.filter(r=>!!getSess(r.sessionId)); // เฉพาะรอบของโครงการปัจจุบัน (กันชื่อโครงการอื่น/รอบที่ถูกลบมาโผล่)
  if(nq)regs=regs.filter(r=>(r.fname+' '+r.lname).toLowerCase().includes(nq));
  if(pq)regs=regs.filter(r=>(r.position||'').toLowerCase().includes(pq));
  if(cid){const sids=sessions.filter(s=>s.catId==cid).map(s=>s.id);regs=regs.filter(r=>sids.includes(r.sessionId));}
  if(sid)regs=regs.filter(r=>r.sessionId==sid);
  const c=document.getElementById('track-results');
  const emptyBox=(icon,title,sub,cta)=>`<div class="tk-empty"><div class="tk-empty-ic"><i class="ti ti-${icon}"></i></div><b>${title}</b><p>${sub}</p>${cta||''}</div>`;
  if(!nq&&!pq&&!cid&&!sid){c.innerHTML=emptyBox('user-search','ค้นหาชื่อของคุณ','พิมพ์ชื่อ-นามสกุล หรือเลือกหลักสูตร/รอบอบรม เพื่อดูรายชื่อและ QR Code');return;}
  if(!regs.length){c.innerHTML=emptyBox('user-x','ไม่พบผู้ลงทะเบียน','ลองค้นหาด้วยคำอื่น หรือยังไม่ได้ลงทะเบียน — ลงทะเบียนได้เลย',
    `<button class="tk-empty-cta" onclick="showPage('register')"><i class="ti ti-pencil-plus"></i>ไปหน้าลงทะเบียน</button>`);return;}

  // Group ตามรอบที่ลงทะเบียน (วันที่+เวลา+รอบ) เรียงกลุ่มตามวันที่-เวลา แล้วเรียงคนในกลุ่มตามชื่อ ก-ฮ
  const groups={};
  regs.forEach(r=>{(groups[r.sessionId]=groups[r.sessionId]||[]).push(r);});
  const sortedKeys=Object.keys(groups).sort((ka,kb)=>{
    const sa=getSess(parseInt(ka)),sb=getSess(parseInt(kb));
    const dtA=sa?`${sa.date} ${sa.timeStart||'00:00'}`:'9999-99-99';
    const dtB=sb?`${sb.date} ${sb.timeStart||'00:00'}`:'9999-99-99';
    return dtA<dtB?-1:dtA>dtB?1:0;
  });
  const summary=`<div class="tk-summary"><span>พบ <b>${regs.length}</b> คน ใน <b>${sortedKeys.length}</b> รอบอบรม</span><span class="tk-legend"><i class="att"></i>เข้าอบรมแล้ว<i></i>รอเข้าอบรม</span></div>`;
  c.innerHTML=summary+sortedKeys.map(key=>{
    const s=getSess(parseInt(key)),cat=s?getCat(s.catId):null;
    const cm=CM[cat?.color]||CM.blue;
    const cnt=s?getCount(s.id):0,pct=s?Math.round(cnt/s.capacity*100):0;
    const list=groups[key].slice().sort((a,b)=>(a.fname||'').localeCompare(b.fname||'','th')||(a.lname||'').localeCompare(b.lname||'','th'));
    const header=s
      ?`<div class="tk-group-head" style="--cg1:${cm.g1};--cg2:${cm.g2};">
          <div class="tk-g-tile"><span>${getMon(s.date)}</span><b>${getDay(s.date)}</b></div>
          <div class="tk-g-info">
            <div class="tk-g-title">${s.name}${cat?`<span>${cat.name}</span>`:''}</div>
            <div class="tk-g-meta"><span><i class="ti ti-calendar"></i>${fmtDate(s.date)}</span><span><i class="ti ti-clock"></i>${sessTxt(s)}</span>${s.venue?`<span><i class="ti ti-map-pin"></i>${s.venue}</span>`:''}</div>
          </div>
          <div class="tk-g-right"><span class="tk-g-count"><i class="ti ti-users"></i>${list.length} คน</span>${capBadge(pct)}</div>
        </div>`
      :`<div class="tk-group-head none"><div class="tk-g-info"><div class="tk-g-title">ไม่พบข้อมูลรอบอบรม</div></div></div>`;
    const cards=list.map(r=>{
      const can=canEditReg(r);
      return`<div class="tk-card${r.attended?' att':''}" title="ลงทะเบียน ${fmtDateShort(r.regDate)}${r.attended?' · เข้าอบรมแล้ว':''}">
      <div class="tk-avatar">${(r.fname||'?').charAt(0)}${r.attended?'<i class="ti ti-check"></i>':''}</div>
      <div class="tk-c-info">
        <div class="tk-c-name">${r.prefix||''}${r.fname} ${r.lname}</div>
        <div class="tk-c-sub">${r.position||'-'} · ${r.dept}</div>
        <span class="tk-c-status">${r.attended?'<i class="ti ti-circle-check"></i>เข้าอบรมแล้ว':'<i class="ti ti-hourglass"></i>รอเข้าอบรม'}</span>
      </div>
      <div class="tk-c-act">
        <button class="tk-btn qr" onclick="showQR(${r.id})" title="ดู QR Code"><i class="ti ti-qrcode"></i></button>
        ${can
          ?`<button class="tk-btn" onclick="openEditReg(${r.id})" title="แก้ไข"><i class="ti ti-edit"></i></button>`
          :`<button class="tk-btn" disabled title="เลยกำหนดแก้ไข"><i class="ti ti-edit-off"></i></button>`}
        ${can&&siteRequiresEmail()&&r.email
          ?`<button class="tk-btn danger" onclick="openCancelReg(${r.id})" title="ยกเลิกการลงทะเบียน"><i class="ti ti-calendar-x"></i></button>`
          :''}
      </div>
    </div>`;}).join('');
    return`<div class="tk-group">${header}<div class="tk-grid">${cards}</div></div>`;
  }).join('');
}
function clearTrack(){
  ['track-name','track-pos'].forEach(id=>document.getElementById(id).value='');
  ['track-cat','track-sess'].forEach(id=>document.getElementById(id).value='');
  trackSearch();
}
/* ══════════════════ ยกเลิกการลงทะเบียนด้วยตนเอง (เฉพาะโครงการที่บังคับกรอกอีเมล) ══════════════════
   ป้องกันการยกเลิกของคนอื่น: ต้องพิมพ์อีเมลที่ตรงกับที่ลงทะเบียนไว้ให้ถูกต้องก่อนถึงจะยกเลิกได้จริง
   (ใช้เงื่อนไขเวลาเดียวกับการแก้ไข — canEditReg: ยังไม่ถึงวันอบรมและยังไม่เช็คชื่อ) */
function openCancelReg(regId){
  const reg=getReg(regId);if(!reg)return;
  if(!canEditReg(reg)){showToast('ไม่สามารถยกเลิกได้ — เลยกำหนดหรือเช็คชื่อเข้าอบรมแล้ว','danger');return;}
  if(!siteRequiresEmail()||!reg.email){showToast('โครงการนี้ยังไม่รองรับการยกเลิกด้วยตนเอง กรุณาติดต่อเจ้าหน้าที่','warn');return;}
  const s=getSess(reg.sessionId);
  document.getElementById('cancel-reg-id').value=regId;
  document.getElementById('cancel-reg-email').value='';
  document.getElementById('cancel-reg-summary').innerHTML=`<strong>${reg.prefix||''}${reg.fname} ${reg.lname}</strong><br>${s?`${s.name} — ${fmtDate(s.date)} ${sessTxt(s)}`:'-'}`;
  document.getElementById('modal-cancel-reg').classList.add('open');
  setTimeout(()=>document.getElementById('cancel-reg-email').focus(),150);
}
async function submitCancelReg(){
  const regId=parseInt(document.getElementById('cancel-reg-id').value);
  const reg=getReg(regId);
  if(!reg){closeModal('modal-cancel-reg');return;}
  const typed=(document.getElementById('cancel-reg-email').value||'').trim().toLowerCase();
  if(!typed){showToast('กรุณากรอกอีเมลที่ใช้ลงทะเบียน','danger');return;}
  if(typed!==(reg.email||'').toLowerCase()){showToast('อีเมลไม่ตรงกับที่ลงทะเบียนไว้ กรุณาลองใหม่','danger');return;}
  if(!canEditReg(reg)){showToast('ไม่สามารถยกเลิกได้ — เลยกำหนดหรือเช็คชื่อเข้าอบรมแล้ว','danger');closeModal('modal-cancel-reg');return;}
  if(!await showConfirm(`ยืนยันยกเลิกการลงทะเบียนของ "${reg.prefix||''}${reg.fname} ${reg.lname}"?`,'รายการนี้จะถูกลบออกจากระบบทันทีและไม่สามารถกู้คืนได้',{okLabel:'ยืนยันยกเลิก',danger:true}))return;
  const {error}=await _sb.from('trn_registrations').delete().eq('id',regId);
  if(error){showToast('ยกเลิกไม่สำเร็จ: '+error.message,'danger');return;}
  registrations=registrations.filter(r=>r.id!==regId);
  closeModal('modal-cancel-reg');
  trackSearch();renderCategories();
  showToast('ยกเลิกการลงทะเบียนสำเร็จ','success');
}

/* ══════════════════ ADMIN ══════════════════ */
function renderAdmin(){
  document.getElementById('admin-stats').style.display=OVERVIEW?'none':''; // หน้าตั้งค่าของเมนูอบรม ไม่ผูกโครงการใด
  const siteRegs=registrations.filter(r=>!!getSess(r.sessionId));
  document.getElementById('admin-stats').innerHTML=`
    <div class="stat-card blue"><div class="stat-label">หลักสูตรอบรม</div><div class="stat-value">${categories.length}</div></div>
    <div class="stat-card amber"><div class="stat-label">รอบอบรม</div><div class="stat-value">${sessions.length}</div></div>
    <div class="stat-card green"><div class="stat-label">ผู้ลงทะเบียน</div><div class="stat-value" id="stat-reg-count">${siteRegs.length}</div></div>
    <div class="stat-card green"><div class="stat-label">เข้าอบรมแล้ว</div><div class="stat-value" id="stat-att-count">${siteRegs.filter(r=>r.attended).length}</div></div>`;
  renderAdminCats();
  const catOpts='<option value="">ทุกหลักสูตร</option>'+categories.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  ['admin-filter-cat','admin-reg-filter-cat'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=catOpts;});
  document.getElementById('admin-filter-sess').innerHTML='<option value="">ทุกรอบ</option>'+sessions.slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'','th',{numeric:true,sensitivity:'base'})).map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  renderAdminSessions();renderMasters();renderAdminRegs();renderLoginVerify();
  _applyAdminTabVisibility();
}

/* ══════════════════ ANALYTICS ══════════════════
   ประเมินผลการอบรมของโครงการทุกมิติ: การจัด (รอบ/ที่นั่ง) · การเข้าร่วม · ความครอบคลุมหน่วยงาน
   · คุณภาพ (ผลประเมิน/ผลสอบ) · ความพร้อมใช้งาน (สิทธิ์ Login/คีย์ยอด) · รายหน่วยงาน · รายรอบ · รายวิทยากร
   อัตราเข้าร่วม/ขาด คิดเฉพาะรอบที่จัดแล้ว (ถึงวันแล้ว) — ผู้ลงทะเบียนรอบที่ยังไม่ถึงนับเป็น "รออบรม" ไม่นับเป็นขาด */
let _analyticsNoRegStats={noRegDepts:[],regCount:0,total:0,regPct:0};
let _anFacts=null;   // ตัวเลขผลประเมิน/ผลสอบล่าสุด — ใช้ใน AI สรุป (training-ai.js)
let _anDept=[];      // แถวตารางรายหน่วยงาน (ค้นหา/กรองในหน้าโดยไม่โหลดใหม่)
let _anTrainers=[];  // แถวตารางรายวิทยากร (กดแถว → รายชื่อ)
let _anDonut=[];     // [ชื่อสถานะ, รายชื่อ] ของโดนัท (กดรายการใต้กราฟ → รายชื่อ)
let _anSeq=0;        // Realtime เรียกซ้อนกันได้ — ใช้ผลของครั้งล่าสุดเท่านั้น
const _AN_CLR={ok:'var(--success)',warn:'var(--warn)',bad:'var(--danger)',na:'var(--text-muted)',info:'var(--primary)'};
const _AN_LBL={ok:'ดี',warn:'เฝ้าระวัง',bad:'ต้องติดตาม',na:'ไม่มีข้อมูล',info:'ความคืบหน้า'};
const _anCls=(p,good=80,warn=60)=>p==null?'na':p>=good?'ok':p>=warn?'warn':'bad';
const _anPct=(a,b)=>b?Math.round(a/b*100):null;
const _anBar=(p,cls)=>`<div class="an-bar"><span style="width:${Math.max(0,Math.min(100,p||0))}%;background:${_AN_CLR[cls]}"></span></div>`;
const _anMini=(p,cls)=>p==null?'<span style="color:var(--text-muted)">—</span>':`<div class="an-mini">${_anBar(p,cls)}<b style="color:${_AN_CLR[cls]}">${p}%</b></div>`;
const _anPill=(cls,txt)=>`<span class="an-pill ${cls==='info'?'na':cls}">${txt||_AN_LBL[cls]}</span>`;
const _anSessIso=s=>_ymd(_parseDate(s.date));

// ข้อมูลที่หน้าอื่นไม่ได้โหลดไว้: ผลประเมิน · ผลสอบ (+ชื่อแบบทดสอบ) · คีย์ยอด (ถ้ายังไม่เคยเปิดหน้าคีย์ยอด)
async function _analyticsExtra(){
  const keys=SVD_SECTIONS.flatMap(s=>s.keys);
  const [svR,qR,keR]=await Promise.all([
    _allRows(()=>_sb.from('trn_survey_responses').select('id,session_id,q6_6,'+keys.join(',')).eq('site',currentSite).order('id')),
    _allRows(()=>_sb.from('trn_quiz_attempts').select('id,quiz_id,email,full_name,dept,percent,status').eq('site',currentSite).neq('status','started').order('id')),
    keyEntryData.length?Promise.resolve({data:keyEntryData}):_sb.from('trn_key_entry_status').select('dept_id,status').eq('site',currentSite).then(r=>({...r,data:(r.data||[]).map(_mDeptRow)})),
  ]);
  const qa=qR.data||[];
  const qids=[...new Set(qa.map(a=>a.quiz_id))];
  const cR=qids.length?await _sb.from('trn_quizzes').select('id,title,pass_percent').in('id',qids):{data:[]};
  const courses=(cR.data||[]).map(q=>({id:q.id,name:q.title,pass_percent:q.pass_percent}));
  return{sv:svR.data||[],qa,courses,ke:keR.data||[]};
}

async function renderAnalytics(){
  if(!await _needLib('chart'))return;
  const seq=++_anSeq;
  let ex={sv:[],qa:[],courses:[],ke:[]};
  try{ex=await _analyticsExtra();}catch(e){console.warn('analytics extra',e);}
  if(seq!==_anSeq)return;

  const siteRegs=registrations.filter(r=>!!getSess(r.sessionId));
  const today=_ymd(new Date());
  const heldIds=new Set(sessions.filter(s=>_anSessIso(s)<=today).map(s=>s.id));
  const isHeld=r=>heldIds.has(r.sessionId);

  // ── การจัด / การเข้าร่วม ──
  const total=siteRegs.length;
  const attended=siteRegs.filter(r=>r.attended).length;
  const heldRegs=siteRegs.filter(isHeld);
  const absent=heldRegs.filter(r=>!r.attended).length;
  const pending=siteRegs.filter(r=>!isHeld(r)&&!r.attended).length;
  const attPct=_anPct(heldRegs.filter(r=>r.attended).length,heldRegs.length);
  const walkin=siteRegs.filter(r=>r.isWalkin).length;
  const capSum=sessions.reduce((a,s)=>a+(+s.capacity||0),0);
  const seatPct=_anPct(total,capSum);
  const nextSess=sessions.filter(s=>_anSessIso(s)>today).sort((a,b)=>_anSessIso(a).localeCompare(_anSessIso(b)))[0];

  // ── ความครอบคลุมหน่วยงาน ──
  const registeredDepts=new Set(siteRegs.map(r=>r.dept));
  const noRegDepts=departments.filter(d=>!registeredDepts.has(d)).sort();
  const regCount=departments.length-noRegDepts.length;
  const regPct=departments.length?Math.round(regCount/departments.length*100):0;
  _analyticsNoRegStats={noRegDepts,regCount,total:departments.length,regPct};

  // ── คุณภาพ: ผลประเมิน ──
  const sv=ex.sv;
  const svScores=r=>SVD_SECTIONS.flatMap(s=>s.keys).map(k=>+r[k]).filter(v=>v>=1&&v<=5);
  const svAll=sv.flatMap(svScores);
  const svAvg=svAll.length?svAll.reduce((a,b)=>a+b,0)/svAll.length:null;
  const svRespPct=attended?Math.min(100,_anPct(sv.length,attended)):null; // แบบประเมินไม่ผูกรายชื่อ — ตอบเกินผู้เข้าอบรมได้
  const svSec=SVD_SECTIONS.map(sec=>({...sec,avg:_avg(sv.flatMap(r=>sec.keys.map(k=>r[k])))||null}));
  const yn=sv.filter(r=>r.q6_6!=null),wantMore=_anPct(yn.filter(r=>r.q6_6).length,yn.length);

  // ── คุณภาพ: ผลสอบ — นับรายคน (อีเมล) ต่อหลักสูตร ใช้ครั้งที่ดีที่สุด ──
  const people={};
  ex.qa.forEach(a=>{
    const k=a.quiz_id+'|'+String(a.email||a.full_name||'').trim().toLowerCase();
    const p=people[k]||(people[k]={course:a.quiz_id,dept:a.dept||'',pass:false,best:0,tries:0});
    p.tries++;if(a.status==='PASS')p.pass=true;p.best=Math.max(p.best,+a.percent||0);
  });
  const testers=Object.values(people);
  const passN=testers.filter(p=>p.pass).length;
  const passPct=_anPct(passN,testers.length);
  const quizOn=testers.length>0||categories.some(c=>_quizCatIds.has(c.id));

  // ── ความพร้อมใช้งาน: สิทธิ์ Login · คีย์ยอด ──
  const lv=loginVerifyData||[];
  const lvHas=lv.filter(x=>x.login_status==='has_login').length;
  const lvPct=_anPct(lvHas,lv.length);
  const keyUsed=ex.ke.length>0;
  const keyed=new Set(ex.ke.filter(x=>x.status==='keyed').map(x=>x.dept));
  const keyedN=departments.filter(d=>keyed.has(d)).length;
  const keyPct=keyUsed?_anPct(keyedN,departments.length):null;

  _anFacts={svN:sv.length,svAvg,svRespPct,svSec:svSec.filter(s=>s.avg).map(s=>({title:s.title,avg:s.avg})),wantMore,
    testers:testers.length,passN,passPct,attPct,absent,pending,seatPct,walkin};

  // ══ KPI ══
  const kpi=(icon,lbl,val,sub,p,cls)=>`<div class="an-kpi">
    <div class="an-kpi-lbl"><i class="ti ti-${icon}" style="color:${_AN_CLR[cls]}"></i>${lbl}</div>
    <div class="an-kpi-val">${val}</div><div class="an-kpi-sub" title="${sub}">${sub}</div>
    ${p!=null?_anBar(p,cls):''}</div>`;
  document.getElementById('analytics-summary').innerHTML=[
    kpi('calendar-event','รอบอบรมที่จัดแล้ว',`${heldIds.size}<small> / ${sessions.length} รอบ</small>`,nextSess?`รอบถัดไป ${fmtDateShort(nextSess.date)}`:'ไม่มีรอบที่กำลังจะถึง',_anPct(heldIds.size,sessions.length),'info'),
    kpi('users','ผู้ลงทะเบียน',`${total}<small> คน</small>`,`Walk-in ${walkin} · ใช้ที่นั่ง ${seatPct??0}%`,seatPct,_anCls(seatPct,70,50)),
    kpi('user-check','เข้าอบรมแล้ว',`${attended}<small> คน</small>`,`อัตราเข้าร่วม ${attPct??'-'}% (รอบที่จัดแล้ว)`,attPct,_anCls(attPct)),
    kpi('user-x','ขาดอบรม',`${absent}<small> คน</small>`,`รออบรม (รอบที่ยังไม่ถึง) ${pending} คน`,null,absent?'bad':'ok'),
    kpi('building-community','หน่วยงานที่ลงทะเบียน',`${regCount}<small> / ${departments.length}</small>`,noRegDepts.length?`ยังไม่ลงทะเบียน ${noRegDepts.length} หน่วยงาน`:'ครบทุกหน่วยงาน',departments.length?regPct:null,_anCls(departments.length?regPct:null)),
    kpi('star','ความพึงพอใจเฉลี่ย',svAvg!=null?`${svAvg.toFixed(2)}<small> / 5</small>`:'—',`ผู้ตอบ ${sv.length} คน${svRespPct!=null?` (${svRespPct}% ของผู้เข้าอบรม)`:''}`,svAvg!=null?Math.round(svAvg/5*100):null,svAvg==null?'na':_anCls(svAvg/5*100,80,70)),
    kpi('certificate','สอบผ่าน',testers.length?`${passN}<small> / ${testers.length} คน</small>`:'—',testers.length?`อัตราสอบผ่าน ${passPct}%`:(quizOn?'ยังไม่มีผู้สอบ':'ไม่มีแบบทดสอบ'),passPct,_anCls(passPct)),
    kpi('key','มีสิทธิ์เข้าใช้งาน',lv.length?`${lvHas}<small> / ${lv.length} คน</small>`:'—',keyUsed?`คีย์ยอดแล้ว ${keyedN}/${departments.length} หน่วยงาน`:'ยังไม่มีข้อมูลคีย์ยอด',lvPct,_anCls(lvPct)),
  ].join('');

  // ══ Scorecard ทุกมิติ ══
  const dims=[
    {g:'การจัดอบรม',n:'ความคืบหน้าแผนอบรม',s:`จัดแล้ว ${heldIds.size} จาก ${sessions.length} รอบ`,p:_anPct(heldIds.size,sessions.length),info:true},
    {g:'การจัดอบรม',n:'การใช้ที่นั่ง',s:`ลงทะเบียน ${total} / ที่นั่ง ${capSum}`,p:seatPct==null?null:Math.min(100,seatPct),c:_anCls(seatPct,70,50)},
    {g:'การเข้าร่วม',n:'ความครอบคลุมหน่วยงาน',s:`มีผู้ลงทะเบียน ${regCount} / ${departments.length} หน่วยงาน`,p:departments.length?regPct:null},
    {g:'การเข้าร่วม',n:'อัตราเข้าร่วมอบรม',s:`เฉพาะรอบที่จัดแล้ว · ขาด ${absent} คน`,p:attPct},
    {g:'คุณภาพ',n:'การตอบแบบประเมิน',s:`ตอบ ${sv.length} / เข้าอบรม ${attended} คน`,p:svRespPct==null?null:Math.min(100,svRespPct),c:_anCls(svRespPct,70,40)},
    {g:'คุณภาพ',n:'ความพึงพอใจ',s:svAvg!=null?`เฉลี่ย ${svAvg.toFixed(2)} / 5 · ${_scoreLabel(svAvg)}`:'ยังไม่มีผลประเมิน',p:svAvg!=null?Math.round(svAvg/5*100):null,c:svAvg==null?'na':_anCls(svAvg/5*100,80,70),v:svAvg!=null?svAvg.toFixed(2):null},
    {g:'คุณภาพ',n:'การทำแบบทดสอบ',s:quizOn?`ผู้สอบ ${testers.length} / เข้าอบรม ${attended} คน`:'โครงการนี้ไม่มีแบบทดสอบ',p:quizOn&&attended?Math.min(100,_anPct(testers.length,attended)):null},
    {g:'คุณภาพ',n:'อัตราสอบผ่าน',s:testers.length?`ผ่าน ${passN} / ${testers.length} คน`:'ยังไม่มีผู้สอบ',p:passPct},
    {g:'ความพร้อมใช้งาน',n:'สิทธิ์เข้าใช้งานระบบ',s:lv.length?`มีสิทธิ์ ${lvHas} / ${lv.length} คน`:'ยังไม่ได้นำเข้ารายชื่อตรวจสิทธิ์',p:lvPct},
    {g:'ความพร้อมใช้งาน',n:'คีย์ยอดรายหน่วยงาน',s:keyUsed?`คีย์แล้ว ${keyedN} / ${departments.length} หน่วยงาน`:'ยังไม่เริ่มบันทึกคีย์ยอด',p:keyPct},
  ].map(d=>({...d,c:d.info?'info':(d.c||_anCls(d.p))}));
  const scored=dims.filter(d=>!d.info&&d.p!=null);
  const overall=scored.length?Math.round(scored.reduce((a,d)=>a+d.p,0)/scored.length):null;
  const oc=_anCls(overall);
  document.getElementById('analytics-score-total').innerHTML=overall==null?'':
    `<span class="an-total" title="ค่าเฉลี่ยของทุกมิติที่มีข้อมูล (ไม่รวมความคืบหน้าแผนอบรม)">คะแนนรวม <b style="color:${_AN_CLR[oc]}">${overall}%</b>${_anPill(oc)}</span>`;
  const groups=[...new Set(dims.map(d=>d.g))];
  document.getElementById('analytics-scorecard').innerHTML=groups.map(g=>`<div class="an-sc-group">
    <div class="an-sc-g">${g}</div>
    ${dims.filter(d=>d.g===g).map(d=>`<div class="an-sc">
      <div class="an-sc-top">
        <div class="an-sc-name">${d.n}<small>${d.s}</small></div>
        <div class="an-sc-val" style="color:${_AN_CLR[d.c]}">${d.p==null?'—':(d.v?d.v+'/5':d.p+'%')}</div>
        ${_anPill(d.c)}
      </div>
      ${_anBar(d.p,d.c)}
    </div>`).join('')}
  </div>`).join('');

  // ══ Charts ══
  Object.values(_charts).forEach(c=>{try{c.destroy();}catch(e){}});
  _charts={};
  const P={
    ok:'rgba(16,185,129,0.88)',fail:'rgba(244,63,94,0.80)',wait:'rgba(148,163,184,0.55)',cap:'#7c5cfc',
    grid:'rgba(148,163,184,0.18)',txt:'#64748b',
    dark:getComputedStyle(document.body).color||'#0f172a', // ตามโหมดสว่าง/มืด
  };
  Chart.defaults.font.family='Sarabun, sans-serif';
  const fnt=(sz=12,w='normal')=>({family:'Sarabun,sans-serif',size:sz,weight:w});
  const leg={position:'bottom',labels:{font:fnt(11),color:P.txt,boxWidth:10,boxHeight:10,padding:14,usePointStyle:true,pointStyleWidth:10}};
  const tip={backgroundColor:'#0f172a',padding:12,cornerRadius:10,titleFont:fnt(12,'600'),bodyFont:fnt(12),
    titleColor:'#f1f5f9',bodyColor:'#cbd5e1',displayColors:true,boxWidth:8,boxHeight:8,boxPadding:4};
  const scX={grid:{display:false},ticks:{font:fnt(11),color:P.txt},border:{display:false}};
  const scY={grid:{color:P.grid},ticks:{font:fnt(11),color:P.txt},border:{display:false}};
  const hover=(e,els)=>{e.native.target.style.cursor=els.length?'pointer':'default';};

  // ── Donut: เข้าอบรม / ขาด / รออบรม ──
  const centerText={id:'ctr',beforeDatasetsDraw(chart){
    const{ctx,chartArea:a}=chart;const cx=(a.left+a.right)/2,cy=(a.top+a.bottom)/2;
    ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='700 28px Sarabun,sans-serif';ctx.fillStyle=P.dark;ctx.fillText(attPct==null?'—':`${attPct}%`,cx,cy-10);
    ctx.font='11px Sarabun,sans-serif';ctx.fillStyle=P.txt;ctx.fillText('อัตราเข้าร่วม',cx,cy+13);ctx.restore();
  }};
  const donutSets=[['เข้าอบรม',r=>r.attended],['ขาดอบรม',r=>!r.attended&&isHeld(r)],['รออบรม',r=>!r.attended&&!isHeld(r)]];
  const ctxO=document.getElementById('chart-overall');
  if(ctxO)_charts.overall=new Chart(ctxO,{type:'doughnut',plugins:[centerText],
    data:{labels:[`เข้าอบรม (${attended})`,`ขาด (${absent})`,`รออบรม (${pending})`],
      datasets:[{data:[attended,absent,pending],backgroundColor:[P.ok,P.fail,P.wait],borderWidth:0,hoverOffset:8}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'72%',animation:{animateRotate:true,duration:700},
      onClick:(e,els)=>{if(!els.length)return;const[l,f]=donutSets[els[0].index];showAnalyticsDetail(l,siteRegs.filter(f));},
      onHover:hover,
      plugins:{legend:{display:false},tooltip:{...tip,callbacks:{label:c=>` ${c.label}: ${total?Math.round(c.raw/total*100):0}%`}}}}});
  _anDonut=donutSets.map(([l,f])=>[l,siteRegs.filter(f)]);
  const dsEl=document.getElementById('analytics-donut-stats');
  if(dsEl)dsEl.innerHTML=[P.ok,P.fail,P.wait].map((clr,i)=>{const n=_anDonut[i][1].length;
    return`<button type="button" class="an-dstat" onclick="_anDonutDetail(${i})"><span class="an-dot" style="background:${clr}"></span>${donutSets[i][0]}<b>${n}</b><small>${total?Math.round(n/total*100):0}%</small></button>`;}).join('')
    +`<div class="an-dstat-total">ลงทะเบียนทั้งหมด <b>${total}</b> คน</div>`;

  // ── แยกตามหลักสูตรอบรม ──
  const tri=rs=>{const h=rs.filter(isHeld);
    return{cnt:rs.length,att:rs.filter(r=>r.attended).length,absent:h.filter(r=>!r.attended).length,
      wait:rs.filter(r=>!r.attended&&!isHeld(r)).length,pct:_anPct(h.filter(r=>r.attended).length,h.length)};};
  const catData=categories.map(c=>{
    const sids=new Set(sessions.filter(s=>s.catId===c.id).map(s=>s.id));
    const rs=siteRegs.filter(r=>sids.has(r.sessionId));
    return{name:c.name,rs,...tri(rs)};
  }).filter(d=>d.cnt>0);
  const stackSets=data=>[
    {label:'เข้าอบรม',data:data.map(d=>d.att),backgroundColor:P.ok,borderRadius:5,borderSkipped:false,stack:'s'},
    {label:'ขาด',data:data.map(d=>d.absent),backgroundColor:P.fail,borderRadius:5,borderSkipped:false,stack:'s'},
    {label:'รออบรม',data:data.map(d=>d.wait),backgroundColor:P.wait,borderRadius:5,borderSkipped:false,stack:'s'},
  ];
  const stackLabel=(d,i)=>[` เข้าอบรม ${d.att} คน${d.pct!=null?` — ${d.pct}%`:''}`,` ขาด ${d.absent} คน`,` รออบรม ${d.wait} คน`][i];
  const ctxC=document.getElementById('chart-by-cat');
  const catBox=document.getElementById('chart-by-cat-box');
  if(catBox)catBox.style.height=Math.max(150,catData.length*48+50)+'px'; // แท่งแนวนอน — สูงตามจำนวนหลักสูตร
  if(ctxC)_charts.byCat=new Chart(ctxC,{type:'bar',data:{labels:catData.map(d=>d.name.length>34?d.name.slice(0,33)+'…':d.name),datasets:stackSets(catData).map(x=>({...x,maxBarThickness:22}))},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:600},
      onClick:(e,els)=>{if(!els.length)return;const d=catData[els[0].index];if(d)showAnalyticsDetail(d.name,d.rs,`ลงทะเบียน ${d.cnt} · เข้าอบรม ${d.att} คน${d.pct!=null?` (${d.pct}%)`:''}`);},
      onHover:hover,
      indexAxis:'y',
      plugins:{legend:leg,tooltip:{...tip,callbacks:{title:([c])=>catData[c.dataIndex]?.name||'',label:c=>stackLabel(catData[c.dataIndex],c.datasetIndex)}}},
      scales:{y:{...scX,stacked:true},x:{...scY,stacked:true,beginAtZero:true,ticks:{...scY.ticks,precision:0}}}}});

  // ── ผลประเมินรายด้าน ──
  document.getElementById('analytics-survey-note').textContent=sv.length?`ผู้ตอบ ${sv.length} คน${wantMore!=null?` · ต้องการอบรมเพิ่ม ${wantMore}%`:''}`:'';
  document.getElementById('analytics-survey-sec').innerHTML=!sv.length
    ?`<div class="an-empty"><i class="ti ti-clipboard-off" style="font-size:28px;display:block;opacity:.4;margin-bottom:6px;"></i>ยังไม่มีผลประเมินของโครงการนี้</div>`
    :svSec.map(s=>{const v=s.avg;return`<div class="an-sv">
      <div class="an-sv-name"><i class="ti ${s.icon}" style="color:${s.color}"></i>${s.title}</div>
      <div class="an-bar" style="margin:0;height:8px;"><span style="width:${v?v/5*100:0}%;background:${v?_scoreColor(v):'transparent'}"></span></div>
      <b style="font-size:12px;text-align:right;color:${v?_scoreColor(v):'var(--text-muted)'}">${v?v.toFixed(2):'—'}</b></div>`;}).join('')
      +`<div style="font-size:11px;color:var(--text-muted);margin-top:8px;">เกณฑ์: ≥4.50 ดีมาก · ≥4.00 ดี · ≥3.00 พอใช้ · ต่ำกว่านั้นต้องปรับปรุง — รายข้อดูที่เมนู <b>ผลประเมิน</b></div>`;

  // ── ผลแต่ละรอบ: เข้าอบรม/ขาด/รออบรม + เส้นจำนวนที่นั่ง ──
  const sessData=sessions.slice().sort((a,b)=>_anSessIso(a).localeCompare(_anSessIso(b))).map(s=>{
    const rs=siteRegs.filter(r=>r.sessionId===s.id);
    return{id:s.id,name:s.name,date:fmtDateShort(s.date),cap:+s.capacity||0,rs,...tri(rs)};
  });
  const ctxS=document.getElementById('chart-by-sess');
  if(ctxS)_charts.bySess=new Chart(ctxS,{type:'bar',
    data:{labels:sessData.map(d=>[d.name.length>22?d.name.slice(0,21)+'…':d.name,d.date]),datasets:[...stackSets(sessData),
      {type:'line',label:'ที่นั่ง',data:sessData.map(d=>d.cap),borderColor:P.cap,backgroundColor:P.cap,borderWidth:2,borderDash:[5,4],pointRadius:3,tension:0,stack:'cap'}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:600},
      onClick:(e,els)=>{if(!els.length)return;const d=sessData[els[0].index];if(d)showAnalyticsDetail(d.name,d.rs,`${d.date} · ลงทะเบียน ${d.cnt}/${d.cap} ที่นั่ง · เข้าอบรม ${d.att} คน`);},
      onHover:hover,
      plugins:{legend:leg,tooltip:{...tip,callbacks:{
        title:([c])=>`${sessData[c.dataIndex]?.name||''} · ${sessData[c.dataIndex]?.date||''}`,
        label:c=>{const d=sessData[c.dataIndex];return c.datasetIndex===3?` ที่นั่ง ${d.cap} (ใช้ ${_anPct(d.cnt,d.cap)??0}%)`:stackLabel(d,c.datasetIndex);}}}},
      scales:{x:{...scX,stacked:true,ticks:{font:fnt(10),color:P.txt,maxRotation:0,autoSkip:true}},y:{...scY,stacked:true,beginAtZero:true,ticks:{...scY.ticks,precision:0}}}}});

  // ══ ผลงานรายวิทยากร (ผลประเมินผูกกับรอบที่ผู้ตอบเลือก) ══
  const svBySess={};
  sv.forEach(r=>{if(r.session_id==null)return;const x=svBySess[r.session_id]||(svBySess[r.session_id]={n:0,scores:[]});x.n++;x.scores.push(...svScores(r));});
  const trMap={};
  sessions.forEach(s=>{
    const k=s.trainerId||'';
    const t=trMap[k]||(trMap[k]={name:s.trainer||'ไม่ระบุวิทยากร',sess:0,held:0,rs:[],scores:[],svN:0});
    t.sess++;if(heldIds.has(s.id))t.held++;
    t.rs.push(...siteRegs.filter(r=>r.sessionId===s.id));
    const x=svBySess[s.id];if(x){t.scores.push(...x.scores);t.svN+=x.n;}
  });
  _anTrainers=Object.values(trMap).sort((a,b)=>b.sess-a.sess||b.rs.length-a.rs.length);
  document.getElementById('analytics-trainer').innerHTML=!_anTrainers.length?'<div class="an-empty">ยังไม่มีรอบอบรม</div>'
    :`<table class="adetail-table"><thead><tr><th>วิทยากร</th><th class="num">รอบ (จัดแล้ว)</th><th class="num">ผู้ลงทะเบียน</th><th>อัตราเข้าร่วม</th><th class="num">ความพึงพอใจ</th></tr></thead><tbody>`
      +_anTrainers.map((t,i)=>{
        const h=t.rs.filter(isHeld),p=_anPct(h.filter(r=>r.attended).length,h.length);
        const avg=t.scores.length?t.scores.reduce((a,b)=>a+b,0)/t.scores.length:null;
        return`<tr class="clk" onclick="_anTrainerDetail(${i})"><td style="font-weight:600;">${_esc(t.name)}</td><td class="num">${t.sess} (${t.held})</td><td class="num">${t.rs.length}</td>
          <td>${_anMini(p,_anCls(p))}</td>
          <td class="num">${avg!=null?`<b style="color:${_scoreColor(avg)}">${avg.toFixed(2)}</b> <span style="font-size:11px;color:var(--text-muted)">(${t.svN} คน)</span>`:'<span style="color:var(--text-muted)">—</span>'}</td></tr>`;
      }).join('')+'</tbody></table>';

  // ══ ผลการทดสอบรายแบบทดสอบ ══
  const qEl=document.getElementById('analytics-quiz');
  document.getElementById('analytics-quiz-note').textContent=testers.length?`ผู้สอบ ${testers.length} คน · สอบทั้งหมด ${ex.qa.length} ครั้ง`:'';
  if(!testers.length){
    qEl.innerHTML=`<div class="an-empty"><i class="ti ti-file-certificate" style="font-size:28px;display:block;opacity:.4;margin-bottom:6px;"></i>${quizOn?'ยังไม่มีผู้ทำแบบทดสอบ':'หลักสูตรอบรมของโครงการนี้ยังไม่มีแบบทดสอบ'}</div>`;
  }else{
    const byC={};
    testers.forEach(p=>{const c=byC[p.course]||(byC[p.course]={n:0,pass:0,sum:0,tries:0});c.n++;c.tries+=p.tries;c.sum+=p.best;if(p.pass)c.pass++;});
    qEl.innerHTML=`<table class="adetail-table"><thead><tr><th>แบบทดสอบ</th><th class="num">ผู้สอบ</th><th>สอบผ่าน</th><th class="num">คะแนนเฉลี่ย</th><th class="num">สอบเฉลี่ย/คน</th></tr></thead><tbody>`
      +Object.entries(byC).sort((a,b)=>b[1].n-a[1].n).map(([cid,c])=>{
        const co=ex.courses.find(x=>String(x.id)===cid),p=_anPct(c.pass,c.n);
        return`<tr><td style="font-weight:600;">${_esc(co?co.name:'(แบบทดสอบที่ถูกลบ)')}${co?`<div style="font-size:11px;color:var(--text-muted);font-weight:400;">เกณฑ์ผ่าน ${co.pass_percent}%</div>`:''}</td>
          <td class="num">${c.n}</td><td>${_anMini(p,_anCls(p))}</td><td class="num">${Math.round(c.sum/c.n)}%</td><td class="num">${(c.tries/c.n).toFixed(1)} ครั้ง</td></tr>`;
      }).join('')+'</tbody></table>';
  }

  // ══ สรุปรายหน่วยงาน (ทุกมิติ) ══
  const lvByDept={},qByDept={};
  lv.forEach(x=>{const d=lvByDept[x.dept]||(lvByDept[x.dept]={n:0,has:0});d.n++;if(x.login_status==='has_login')d.has++;});
  testers.forEach(p=>{const d=qByDept[p.dept]||(qByDept[p.dept]={n:0,pass:0});d.n++;if(p.pass)d.pass++;});
  const deptNames=[...new Set([...departments,...siteRegs.map(r=>r.dept).filter(Boolean)])];
  _anDept=deptNames.map(dept=>{
    const rs=siteRegs.filter(r=>r.dept===dept),t=tri(rs),l=lvByDept[dept],q=qByDept[dept];
    const issues=[];
    if(!rs.length)issues.push(['bad','ยังไม่มีผู้ลงทะเบียน']);
    if(t.absent)issues.push(['bad',`ขาดอบรม ${t.absent} คน`]);
    if(q&&q.pass<q.n)issues.push(['warn',`สอบไม่ผ่าน ${q.n-q.pass} คน`]);
    if(l&&l.has<l.n)issues.push(['warn',`ยังไม่มีสิทธิ์ ${l.n-l.has} คน`]);
    if(keyUsed&&departments.includes(dept)&&!keyed.has(dept))issues.push(['warn','ยังไม่คีย์ยอด']);
    return{dept,rs,...t,l,q,keyed:keyed.has(dept),issues};
  }).sort((a,b)=>b.issues.length-a.issues.length||b.cnt-a.cnt||a.dept.localeCompare(b.dept,'th'));
  document.getElementById('analytics-dept-total').textContent=`${_anDept.length} หน่วยงาน · ต้องติดตาม ${_anDept.filter(d=>d.issues.length).length}`;
  renderAnalyticsDeptTable();

  // ══ หน่วยงานที่ยังไม่ลงทะเบียน ══
  const noRegEl=document.getElementById('analytics-noreg-list');
  if(noRegEl){
    if(!departments.length){
      noRegEl.innerHTML=`<div style="color:var(--text-muted);font-size:13px;padding:12px 0;text-align:center;">ยังไม่มีข้อมูลหน่วยงาน — กรุณาเพิ่มใน <b>ข้อมูลพื้นฐาน</b></div>`;
    } else {
      let html=`
        <div style="margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
            <span style="font-size:12px;color:var(--text-muted);">มีผู้ลงทะเบียนแล้ว</span>
            <span style="font-size:13px;font-weight:700;color:var(--text);">${regCount}<span style="font-weight:400;color:var(--text-muted);"> / ${departments.length} หน่วยงาน</span></span>
          </div>
          <div class="an-bar" style="height:8px;"><span style="width:${regPct}%;background:${_AN_CLR[_anCls(regPct)]}"></span></div>
        </div>`;
      if(!noRegDepts.length){
        html+=`<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--success-light);border-radius:10px;">
          <i class="ti ti-circle-check-filled" style="font-size:22px;color:var(--success);flex-shrink:0;"></i>
          <div><div style="font-weight:700;font-size:13px;color:var(--success);">ครบทุกหน่วยงาน</div><div style="font-size:11px;color:var(--text-muted);margin-top:1px;">ทุกหน่วยงานมีผู้ลงทะเบียนเข้าอบรมแล้ว</div></div>
        </div>`;
      } else {
        html+=`<div style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:.4px;margin-bottom:8px;">${noRegDepts.length} หน่วยงานที่ยังไม่มีผู้ลงทะเบียน</div>
          <div class="an-noreg">
          ${noRegDepts.map((d,i)=>`
            <div style="display:flex;align-items:center;gap:8px;background:var(--warn-light);border-radius:8px;padding:7px 12px;">
              <span style="font-size:11px;font-weight:700;color:var(--warn);min-width:20px;text-align:right;">${i+1}</span>
              <span style="font-size:12px;color:var(--text);line-height:1.3;">${_esc(d)}</span>
            </div>`).join('')}
          </div>`;
      }
      noRegEl.innerHTML=html;
    }
  }
}

function _anDonutDetail(i){
  const d=_anDonut[i];if(d)showAnalyticsDetail(d[0],d[1]);
}
function _anTrainerDetail(i){
  const t=_anTrainers[i];if(!t)return;
  showAnalyticsDetail(t.name,t.rs,`${t.sess} รอบ · ผู้ลงทะเบียน ${t.rs.length} คน`);
}
function _anDeptDetail(i){
  const d=_anDept[i];if(!d||!d.rs.length)return;
  showAnalyticsDetail(d.dept,d.rs,`ลงทะเบียน ${d.cnt} · เข้าอบรม ${d.att} คน${d.pct!=null?` (${d.pct}%)`:''}`);
}
// ตารางรายหน่วยงาน — ค้นหา/กรองในหน้า (ข้อมูลจาก renderAnalytics)
function renderAnalyticsDeptTable(){
  const el=document.getElementById('analytics-dept-table');
  if(!el)return;
  const q=_normTxt(document.getElementById('an-dept-q')?.value);
  const f=document.getElementById('an-dept-f')?.value||'';
  const rows=_anDept.map((d,i)=>({d,i})).filter(({d})=>(!q||_normTxt(d.dept).includes(q))&&(!f||(f==='issue'?d.issues.length>0:!d.issues.length)));
  if(!rows.length){el.innerHTML='<div class="an-empty">ไม่มีหน่วยงานตามเงื่อนไข</div>';return;}
  const frac=x=>x?`${x[0]}/${x[1]}`:'<span style="color:var(--text-muted)">—</span>';
  el.innerHTML=`<table class="adetail-table"><thead><tr><th>#</th><th>หน่วยงาน</th><th class="num">ลงทะเบียน</th><th class="num">เข้าอบรม</th><th>อัตราเข้าร่วม</th><th class="num">ขาด</th><th class="num">สอบผ่าน</th><th class="num">มีสิทธิ์ใช้งาน</th><th class="ctr">คีย์ยอด</th><th>สถานะ / สิ่งที่ต้องติดตาม</th></tr></thead><tbody>`
    +rows.map(({d,i},n)=>`<tr class="clk" onclick="_anDeptDetail(${i})">
      <td style="color:var(--text-muted);font-size:12px;">${n+1}</td>
      <td style="font-weight:600;min-width:140px;">${_esc(d.dept)}</td>
      <td class="num">${d.cnt}</td><td class="num">${d.att}</td>
      <td>${_anMini(d.pct,_anCls(d.pct))}</td>
      <td class="num" style="color:${d.absent?'var(--danger)':'inherit'}">${d.absent||'-'}</td>
      <td class="num">${frac(d.q&&[d.q.pass,d.q.n])}</td>
      <td class="num">${frac(d.l&&[d.l.has,d.l.n])}</td>
      <td class="ctr">${d.keyed?'<i class="ti ti-circle-check-filled" style="color:var(--success);font-size:17px;"></i>':'<i class="ti ti-circle-dashed" style="color:var(--text-muted);font-size:17px;"></i>'}</td>
      <td style="min-width:170px;">${d.issues.length?d.issues.map(([c,x])=>_anPill(c,x)).join(' '):_anPill('ok','พร้อม')}</td>
    </tr>`).join('')+'</tbody></table>';
}

/* ── Analytics Detail Modal ── */
let _aDetailRegs=[];
function showAnalyticsDetail(title,regs,sub=''){
  _aDetailRegs=regs;
  document.getElementById('adetail-title').textContent=title;
  document.getElementById('adetail-sub').textContent=sub||(regs.length+' คน');
  document.querySelectorAll('.adetail-tab').forEach(t=>t.classList.remove('active'));
  document.querySelector('#adetail-tabs .adetail-tab').classList.add('active');
  _renderADetailTable(regs);
  document.getElementById('modal-analytics-detail').classList.add('open');
}
function filterAnalyticsDetail(f,el){
  document.querySelectorAll('.adetail-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  const rows=f==='all'?_aDetailRegs:f==='ok'?_aDetailRegs.filter(r=>r.attended):_aDetailRegs.filter(r=>!r.attended);
  document.getElementById('adetail-sub').textContent=rows.length+' คน';
  _renderADetailTable(rows);
}
function _renderADetailTable(regs){
  const el=document.getElementById('adetail-body');
  if(!regs.length){el.innerHTML='<div class="empty" style="padding:40px;"><i class="ti ti-mood-empty" style="font-size:36px;display:block;margin-bottom:8px;opacity:.3;"></i><p>ไม่มีข้อมูล</p></div>';return;}
  el.innerHTML=`<table class="adetail-table"><thead><tr><th>#</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง / หน่วยงาน</th><th>รอบอบรม</th><th>วันที่</th><th>เวลาเช็คชื่อ</th><th>สถานะ</th></tr></thead><tbody>`+
    regs.map((r,i)=>{
      const s=getSess(r.sessionId);
      const badge=r.attended
        ?`<span class="badge badge-success" style="gap:3px;"><i class="ti ti-check" style="font-size:11px;"></i>เข้าอบรม</span>`
        :`<span class="badge badge-danger" style="gap:3px;"><i class="ti ti-x" style="font-size:11px;"></i>ขาด</span>`;
      return`<tr>
        <td style="color:var(--text-muted);font-size:12px;">${i+1}</td>
        <td><div style="font-weight:600;font-size:13px;">${r.prefix||''}${r.fname} ${r.lname}</div></td>
        <td><div style="font-size:12px;">${r.position||'-'}</div><div style="font-size:11px;color:var(--text-muted);">${r.dept||'-'}</div></td>
        <td style="font-size:12px;max-width:160px;">${s?s.name:'-'}</td>
        <td style="font-size:12px;white-space:nowrap;">${s?fmtDateShort(s.date):'-'}</td>
        <td style="font-size:12px;color:${r.attended?'var(--success)':'var(--text-muted)'};">${r.attendedTime||'—'}</td>
        <td>${badge}</td>
      </tr>`;
    }).join('')+`</tbody></table>`;
}
function closeAnalyticsDetail(){closeModal('modal-analytics-detail');}

/* ── หลักสูตรอบรมในโครงการนี้ — ติ๊กเลือกจากหลักสูตรกลาง (trn_site_categories) · แบบทดสอบมากับหลักสูตร · เปิด/ปิดสอบเฉพาะโครงการ
   เพิ่ม/แก้/ลบตัวหลักสูตร = เมนู "ระบบอบรม" › หลักสูตรอบรม (_ovCats) · ภาพรวม (?view=overview) ใช้ _ovCatsRender แทน ── */
function renderAdminCats(){
  if(OVERVIEW){_ovCatsRender();return;}
  const el=document.getElementById('admin-cat-tbody');
  if(!el)return;
  const central=_canCentral(),available=_availableCategories();
  document.getElementById('btn-central-cats').style.display=central?'':'none';
  if(!available.length){
    const msg=allCategories.length?'ยังไม่มีหลักสูตรอบรมที่ตรงกับประเภทของโครงการนี้':'ยังไม่มีหลักสูตรอบรมกลาง';
    el.innerHTML=`<div class="cat-empty"><i class="ti ti-category"></i><div>${msg}</div>${central
      ?'<button class="btn btn-primary btn-sm" onclick="goCentralTraining(\x27cats\x27)"><i class="ti ti-arrow-right"></i>ไปเพิ่มที่ระบบอบรม › หลักสูตรอบรม</button>'
      :'<div style="font-size:12px;">ติดต่อ Admin หรือ PM ให้เพิ่มที่เมนูระบบอบรม › หลักสูตรอบรม</div>'}</div>`;
    return;
  }
  el.innerHTML=`<div class="tqa-note"><i class="ti ti-info-circle"></i>แสดงเฉพาะหลักสูตรที่ตรงกับประเภทโครงการนี้ — เมื่อสร้างรอบอบรม ระบบจะเปิดหลักสูตรพร้อมแบบทดสอบที่ผูกไว้ให้อัตโนมัติ</div>
    <div class="card tqa-use">${available.map(c=>{
      const cm=CM[c.color]||CM.blue,ns=sessions.filter(s=>s.catId===c.id).length,qt=_liveQuizTitle[c.quizId];
      const sub=!c.enabled?'ไม่ได้เปิดในโครงการนี้':`แบบทดสอบ: ${qt?_esc(qt):'ไม่มี'} · ${ns} รอบอบรม`;
      return`<div class="tqa-use-row tqa-cat-row${c.enabled?'':' off'}">
        <label class="tqa-cat-pick" title="${c.enabled?'เปิดในโครงการนี้อยู่':'เปิดหลักสูตรนี้ในโครงการ'}">
          <input type="checkbox" ${c.enabled?'checked':''} onchange="toggleSiteCat(${c.id},this.checked)">
          <span class="tqa-cat-ic" style="background:${c.enabled?cm.bg:'var(--bg)'};color:${c.enabled?cm.c:'var(--text-muted)'};"><i class="ti ti-${c.icon}"></i></span>
          <span class="tqa-use-cat"><b>${_esc(c.name)}</b><small>${sub}</small></span>
        </label>
        <div class="tqa-use-act">${c.enabled&&qt?`
          <label class="tqa-switch" title="${c.quizOpen?'เปิดให้สอบ — กดเพื่อปิด (เฉพาะโครงการนี้)':'ปิดสอบอยู่ — กดเพื่อเปิด'}"><input type="checkbox" ${c.quizOpen?'checked':''} onchange="setSiteCatQuizOpen(${c.id},this.checked)"><span></span></label>
          <span class="tqa-use-st ${c.quizOpen?'on':''}">${c.quizOpen?'เปิดสอบ':'ปิดสอบ'}</span>
          <button class="btn btn-ghost btn-sm" onclick="_tqaCopyLink(${c.id})" title="คัดลอกลิงก์สอบ"><i class="ti ti-link"></i></button>
          <a class="btn btn-ghost btn-sm" href="${_tqaLink(c.id)}" target="_blank" title="เปิดหน้าสอบ"><i class="ti ti-external-link"></i></a>`:''}
        </div></div>`;
    }).join('')}</div>`;
}
async function toggleSiteCat(id,on){
  const c=allCategories.find(x=>x.id===id);
  if(!on){
    const n=sessions.filter(s=>s.catId===id).length;
    if(n){showToast(`ปิดไม่ได้ — "${c.name}" มีรอบอบรม ${n} รอบในโครงการนี้`,'warn');renderAdminCats();return;}
  }
  const {error}=on
    ?await _sb.from('trn_site_categories').upsert({site:currentSite,cat_id:id},{onConflict:'site,cat_id',ignoreDuplicates:true})
    :await _sb.from('trn_site_categories').delete().eq('site',currentSite).eq('cat_id',id);
  if(error){showToast('บันทึกไม่สำเร็จ: '+error.message,'danger');renderAdminCats();return;}
  Object.assign(c,{enabled:on,quizOpen:on});
  categories=allCategories.filter(x=>x.enabled);
  if(on&&_liveQuizTitle[c.quizId])_quizCatIds.add(id);else _quizCatIds.delete(id);
  showToast(on?`เปิด "${c.name}" ในโครงการนี้แล้ว`:`ปิด "${c.name}" ในโครงการนี้แล้ว`,'success');
  renderAdmin();
}
async function setSiteCatQuizOpen(id,on){
  const c=allCategories.find(x=>x.id===id);
  const {error}=await _sb.from('trn_site_categories').update({quiz_open:on}).eq('site',currentSite).eq('cat_id',id);
  if(error){showToast('บันทึกไม่สำเร็จ: '+error.message,'danger');renderAdminCats();return;}
  c.quizOpen=on;
  if(on&&_liveQuizTitle[c.quizId])_quizCatIds.add(id);else _quizCatIds.delete(id);
  showToast(on?'เปิดให้สอบแล้ว':'ปิดสอบแล้ว (เฉพาะโครงการนี้)');
  renderAdminCats();
}
// ไปเมนู "ระบบอบรม" ของ Backoffice (ตั้งค่ากลาง) — src/modules/training.js trnOpenCentral
function goCentralTraining(tab){
  if(!_canCentral())return;
  if(EMBED&&window.parent.trnOpenCentral)window.parent.trnOpenCentral(tab);
  else location.href=`${location.pathname}?view=overview&admin=1&tab=${encodeURIComponent(tab)}`;
}
function renderAdminSessions(){
  const cf=document.getElementById('admin-filter-cat').value;
  const list=(cf?sessions.filter(s=>s.catId==cf):sessions).slice().sort((a,b)=>{
    // ภายในหลักสูตร: 1) วันที่ + เวลา  2) รอบ
    const dtA=`${a.date} ${a.timeStart||'00:00'}`,dtB=`${b.date} ${b.timeStart||'00:00'}`;
    if(dtA!==dtB)return dtA<dtB?-1:1;
    return (a.name||'').localeCompare(b.name||'','th');
  });
  // จัดกลุ่มตามหลักสูตร เรียงตามลำดับหลักสูตร — รอบที่หลักสูตรถูกปิดไปแล้วรวมไว้ท้ายสุด
  const groups=categories.map(c=>({cat:c,items:list.filter(s=>s.catId==c.id)}));
  const orphan=list.filter(s=>!getCat(s.catId));
  if(orphan.length)groups.push({cat:null,items:orphan});
  document.getElementById('admin-sess-tbody').innerHTML=groups.filter(g=>g.items.length).map(g=>{
    const reg=g.items.reduce((a,s)=>a+getCount(s.id),0),cap=g.items.reduce((a,s)=>a+(+s.capacity||0),0);
    return`<tr class="sess-grp"><td colspan="9"><i class="ti ti-book"></i>${g.cat?g.cat.name:'ไม่ระบุหลักสูตร'}
      <span class="sess-grp-meta">${g.items.length} รอบ · ลงทะเบียน ${reg}/${cap}</span></td></tr>`+g.items.map(_adminSessRow).join('');
  }).join('')||'<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-muted);">ยังไม่มีรอบอบรม</td></tr>';
}
function _adminSessRow(s){
  const cnt=getCount(s.id),att=getAttCount(s.id),pct=Math.round(cnt/s.capacity*100);
  return`<tr>
      <td class="tc-title" data-label="รอบอบรม" style="font-weight:600;font-size:13px;">${s.name}</td>
      <td data-label="วันที่" style="font-size:12px;">${fmtDateShort(s.date)}</td>
      <td data-label="เวลา" style="font-size:12px;">${sessTxt(s)}</td>
      <td class="tc-full" data-label="สถานที่" style="font-size:12px;">${s.venue}</td>
      <td class="tc-full" data-label="วิทยากร" style="font-size:12px;">${s.trainer}</td>
      <td data-label="ลง/ทั้งหมด" style="font-weight:600;">${cnt}/${s.capacity}</td>
      <td data-label="เข้าอบรม"><span class="badge badge-success">${att}</span></td>
      <td data-label="สถานะ">${capBadge(pct)}</td>
      <td data-label="จัดการ"><div style="display:flex;gap:4px;">
        <button class="btn btn-ghost btn-sm" onclick="openEditSession(${s.id})" title="แก้ไข"><i class="ti ti-edit"></i></button>
        <button class="btn btn-ghost btn-sm" onclick="goToAttendance(${s.id})" title="เช็คชื่อ"><i class="ti ti-user-check"></i></button>
        <button class="btn btn-danger btn-sm" onclick="deleteSess(${s.id})"><i class="ti ti-trash"></i></button>
      </div></td>
    </tr>`;
}

/* ══ MASTERS (Trainer / Venue / Dept / Prefix) ══ */
const MASTER_CFG={
  venue:  {list:()=>venues,  setList:v=>{venues=v;},  icon:'map-pin',   inputId:'new-venue-input',  listId:'venue-list'},
  dept:   {list:()=>departments,setList:v=>{departments=v;},icon:'building',inputId:'new-dept-input',listId:'dept-list'},
  prefix: {list:()=>prefixes,setList:v=>{prefixes=v;},icon:'id-badge',  inputId:'new-prefix-input', listId:'prefix-list'},
};
/* ── รอบอบรม/ผู้ลงทะเบียน/ตรวจสอบสิทธิ์/คีย์ยอด ผูกรายการหลักด้วยรหัส — แก้ชื่อรายการหลักที่เดียว ทุกที่เปลี่ยนตาม
   (ข้อมูลในหน่วยความจำเก็บชื่อไว้แสดง → map ใหม่จาก masterById หลังแก้/เพิ่ม) ── */
function _relabelMasters(){
  sessions.forEach(s=>{s.venue=_mVal(s.venueId);});
  registrations.forEach(r=>{r.dept=_mVal(r.deptId);r.prefix=_mVal(r.prefixId);});
  loginVerifyData.forEach(r=>{r.dept=_mVal(r.dept_id);});
  keyEntryData.forEach(r=>{r.dept=_mVal(r.dept_id);});
}
function renderMasters(){
  Object.entries(MASTER_CFG).forEach(([key,cfg])=>{
    const el=document.getElementById(cfg.listId);
    if(!el)return;
    const arr=cfg.list();
    if(!arr.length){el.innerHTML='<div style="text-align:center;padding:10px;font-size:12px;color:var(--text-muted);">ยังไม่มีข้อมูล</div>';return;}
    el.innerHTML=arr.map((v,i)=>`<div class="master-item" id="mi-${key}-${i}">
      <span><i class="ti ti-${cfg.icon} item-icon"></i>${v}</span>
      <div style="display:flex;gap:4px;">
        <button class="btn btn-ghost btn-sm" onclick="editMasterInline('${key}',${i})"><i class="ti ti-edit"></i></button>
        <button class="btn btn-danger btn-sm" onclick="removeMaster('${key}',${i})"><i class="ti ti-trash"></i></button>
      </div>
    </div>`).join('');
  });
}
async function addMaster(key){
  const cfg=MASTER_CFG[key];
  const input=document.getElementById(cfg.inputId);
  const val=input.value.trim();
  if(!val){showToast('กรุณาระบุข้อมูล','danger');return;}
  const arr=cfg.list();
  if(arr.includes(val)){showToast('มีข้อมูลนี้อยู่แล้ว','danger');return;}
  const {data,error}=await _sb.from('trn_master_items').insert({type:key,value:val,sort_order:arr.length,site:currentSite}).select().single();
  if(error){showToast('บันทึกไม่สำเร็จ','danger');return;}
  cfg.setList([...arr,val]);
  masterIds[key]=[...(masterIds[key]||[]),data.id];
  masterById[data.id]=data;
  input.value='';renderMasters();showToast(`เพิ่ม "${val}" สำเร็จ`,'success');
}
async function removeMaster(key,idx){
  const cfg=MASTER_CFG[key];
  const arr=cfg.list();
  if(!await showConfirm(`ลบ "${arr[idx]}"?`,'',{okLabel:'ลบ'}))return;
  const id=(masterIds[key]||[])[idx];
  if(id){
    const {error}=await _sb.from('trn_master_items').delete().eq('id',id);
    // ยังมีรอบอบรม/ผู้ลงทะเบียน/ตรวจสอบสิทธิ์ อ้างรายการนี้อยู่
    if(error){showToast(_isInUse(error)?`ลบ "${arr[idx]}" ไม่ได้ — ยังมีข้อมูลที่ใช้รายการนี้อยู่ (แก้ชื่อแทนได้)`:'ลบไม่สำเร็จ','danger');return;}
    delete masterById[id];
  }
  const name=arr[idx];
  cfg.setList(arr.filter((_,i)=>i!==idx));
  if(masterIds[key])masterIds[key]=masterIds[key].filter((_,i)=>i!==idx);
  renderMasters();showToast(`ลบ "${name}" สำเร็จ`,'success');
}
function editMasterInline(key,idx){
  const cfg=MASTER_CFG[key];
  const arr=cfg.list();
  const el=document.getElementById(`mi-${key}-${idx}`);if(!el)return;
  el.innerHTML=`<input class="form-control" id="mi-inp-${key}-${idx}" value="${arr[idx]}" style="flex:1;height:32px;font-size:13px;"
    onkeydown="if(event.key==='Enter')saveMasterInline('${key}',${idx});if(event.key==='Escape')renderMasters();">
    <div style="display:flex;gap:4px;">
      <button class="btn btn-success btn-sm" onclick="saveMasterInline('${key}',${idx})"><i class="ti ti-check"></i></button>
      <button class="btn btn-ghost btn-sm" onclick="renderMasters()"><i class="ti ti-x"></i></button>
    </div>`;
  el.style.cssText='display:flex;align-items:center;gap:8px;padding:6px 14px;border-bottom:1px solid var(--border);';
  setTimeout(()=>document.getElementById(`mi-inp-${key}-${idx}`)?.focus(),30);
}
async function saveMasterInline(key,idx){
  const cfg=MASTER_CFG[key];
  const arr=cfg.list();
  const input=document.getElementById(`mi-inp-${key}-${idx}`);if(!input)return;
  const val=input.value.trim();
  if(!val){showToast('กรุณาระบุข้อมูล','danger');return;}
  if(arr.find((v,i)=>i!==idx&&v===val)){showToast('มีข้อมูลนี้อยู่แล้ว','danger');return;}
  const id=(masterIds[key]||[])[idx];
  if(id){
    const {error}=await _sb.from('trn_master_items').update({value:val}).eq('id',id);
    if(error){showToast('บันทึกไม่สำเร็จ','danger');return;}
    if(masterById[id])masterById[id].value=val;
  }
  const old=arr[idx];arr[idx]=val;cfg.setList([...arr]);
  _relabelMasters();
  renderMasters();
  if(key==='venue')renderAdminSessions();
  if(key==='dept'||key==='prefix')renderAdminRegs();
  showToast(`แก้ไข "${old}" → "${val}" สำเร็จ`,'success');
}

/* ══ ADD/EDIT SESSION ══ */
// วิทยากร = ทีมของโครงการนี้ (PM + ทีมของโครงการต้นทาง) · โครงการยังไม่ผูกทีม → พนักงานทั้งหมด
// keepId = วิทยากรเดิมของรอบที่แก้ไข (ถ้าไม่อยู่ในทีมแล้วก็ยังแสดงให้)
// รหัสพนักงานในทีมของโครงการอบรม siteCode (PM + ทีมของโครงการต้นทาง)
function _siteTeamIds(siteCode){
  const loc=locations.find(l=>l.code===siteCode);
  const impl=_implRows.find(d=>d.id===loc?.project_id);
  const projects=_mapProjects(_projRows);
  const implProj=impl&&{sourceProjectId:impl.source_project_id||''};
  const sp=ProjectTeam.source(implProj,projects);
  return [sp?.pm,...ProjectTeam.staffIds(implProj,projects)].filter(Boolean).map(String);
}
function _sessTrainers(keepId){
  const ids=_siteTeamIds(currentSite);
  if(!ids.length)return trainerStaff;
  return trainerStaff.filter(t=>ids.includes(t.id)||t.id===String(keepId||''));
}
function populateSessionDropdowns(keepTrainerId){
  // เฉพาะหลักสูตรกลางที่ตรงกับประเภทโครงการ — หลักสูตรที่ยังไม่เปิดจะเปิดให้อัตโนมัติเมื่อบันทึกรอบ
  const opt=c=>`<option value="${c.id}">${_esc(c.name)}</option>`;
  const available=_availableCategories();
  const on=available.filter(c=>c.enabled),off=available.filter(c=>!c.enabled);
  document.getElementById('ns-cat').innerHTML=`<option value="">${available.length?'เลือกหลักสูตร...':'ไม่พบหลักสูตรที่ตรงกับประเภทโครงการ'}</option>`
    +(on.length?`<optgroup label="เปิดในโครงการนี้แล้ว">${on.map(opt).join('')}</optgroup>`:'')
    +(off.length?`<optgroup label="หลักสูตรประเภทเดียวกับโครงการ (เปิดให้เมื่อบันทึก)">${off.map(opt).join('')}</optgroup>`:'');
  populateSelect('ns-venue',venues.map((v,i)=>({v:masterIds.venue[i],l:v})),'เลือกสถานที่...',true); // ค่า = รหัสรายการหลัก
  const tr=_sessTrainers(keepTrainerId);
  populateSelect('ns-trainer',tr.map(t=>({v:t.id,l:t.name+(t.nickname?' ('+t.nickname+')':'')})),'เลือกวิทยากร (ทีมโครงการ)...',true);
  // มีตัวเลือกเดียว → เลือกให้เลย
  if(venues.length===1)document.getElementById('ns-venue').value=masterIds.venue[0];
  if(tr.length===1)document.getElementById('ns-trainer').value=tr[0].id;
}
// วันที่รอบอบรม: เก็บ ค.ศ. ใน input[type=date] (ซ่อน) · แสดง วว/ดด/ปปปป พ.ศ.
function _syncSessDateBE(){
  const v=document.getElementById('ns-date').value;
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  document.getElementById('ns-date-be').value=m?`${m[3]}/${m[2]}/${+m[1]+543}`:'';
}
function openSessDatePicker(){
  const el=document.getElementById('ns-date');
  try{el.showPicker();}catch(e){el.focus();}
}
function populateSelect(id,arr,placeholder='เลือก...',isObj=false){
  const el=document.getElementById(id);if(!el)return;
  if(el.tagName==='SELECT'){
    if(isObj){
      el.innerHTML=`<option value="">${placeholder}</option>`+arr.map(a=>`<option value="${a.v}">${a.l}</option>`).join('');
    }else{
      while(el.options.length)el.options.remove(0);
      el.options.add(new Option(placeholder,''));
      arr.forEach(v=>el.options.add(new Option(v,v)));
    }
  }else{
    // custom dropdown (hidden input + .csel-list div)
    const list=document.getElementById('csell-'+id);
    const btn=document.getElementById('cselb-'+id);
    if(!list||!btn)return;
    el.value='';
    const btnSpan=btn.querySelector('.csel-btn-txt');
    if(btnSpan)btnSpan.textContent=placeholder;else btn.firstChild.textContent=placeholder;
    btn.dataset.empty='1';
    btn.dataset.placeholder=placeholder;
    list.innerHTML='';
    // Use div container + button items — buttons reliably fire click in all WebViews
    const opts=document.createElement('div');
    opts.className='csel-options';
    // รายการยาว → พิมพ์ค้นหาในช่องได้เลย (combobox) แทนปุ่ม + ช่องค้นหาในรายการ
    const combo=arr.length>5?cselEnsureCombo(id,btn,placeholder):null;
    if(combo)combo.value='';
    list.appendChild(opts);
    const addLi=(val,label)=>{
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='csel-option';
      btn.dataset.val=String(val);
      btn.dataset.label=label;
      btn.textContent=label;
      btn.addEventListener('mousedown',e=>e.preventDefault()); // คงโฟกัสไว้ที่ช่องพิมพ์
      btn.addEventListener('click',()=>cselPick(id,val,label));
      opts.appendChild(btn);
    };
    if(isObj)arr.forEach(a=>addLi(a.v,a.l));
    else arr.forEach(v=>addLi(v,v));
    // Also populate native select overlay (used on touch devices)
    const nat=document.getElementById('cselm-'+id);
    if(nat){
      nat.innerHTML=`<option value="">${placeholder}</option>`;
      if(isObj)arr.forEach(a=>{const o=document.createElement('option');o.value=String(a.v);o.textContent=a.l;nat.appendChild(o);});
      else arr.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;nat.appendChild(o);});
    }
  }
}
function cselCombo(id){return document.getElementById('cselc-'+id);}
function cselEnsureCombo(id,btn,placeholder){
  let ci=cselCombo(id);
  if(!ci){
    ci=document.createElement('input');
    ci.type='text';ci.id='cselc-'+id;ci.className='form-control csel-combo';ci.autocomplete='off';
    btn.parentElement.classList.add('csel-combo-on');
    btn.parentElement.insertBefore(ci,btn);
    ci.addEventListener('focus',()=>{ci.select();cselOpen(id);});
    ci.addEventListener('click',()=>cselOpen(id));
    ci.addEventListener('input',()=>{cselOpen(id);cselFilter(id,ci.value);});
    ci.addEventListener('keydown',e=>cselComboKey(id,e));
    ci.addEventListener('blur',()=>setTimeout(()=>{
      const list=document.getElementById('csell-'+id);
      if(document.activeElement!==ci&&list&&list.classList.contains('open'))cselCloseList(list);
    },150));
  }
  ci.placeholder=placeholder;
  return ci;
}
function cselFilter(id,q){
  const list=document.getElementById('csell-'+id);if(!list)return;
  q=String(q||'').toLowerCase().trim();
  const vis=[];
  list.querySelectorAll('.csel-option').forEach(btn=>{
    const match=!q||btn.dataset.label.toLowerCase().includes(q);
    btn.style.display=match?'':'none';
    btn.classList.remove('csel-active');
    if(match)vis.push(btn);
  });
  if(q&&vis.length)vis[0].classList.add('csel-active');
  const opts=list.querySelector('.csel-options');
  let nr=list.querySelector('.csel-no-result');
  if(!vis.length){
    if(!nr&&opts){nr=document.createElement('div');nr.className='csel-no-result';nr.textContent='ไม่พบผลลัพธ์';opts.appendChild(nr);}
    if(nr)nr.style.display='';
  }else if(nr){nr.style.display='none';}
}
function cselComboKey(id,e){
  const list=document.getElementById('csell-'+id);if(!list)return;
  const open=list.classList.contains('open');
  const vis=[...list.querySelectorAll('.csel-option')].filter(b=>b.style.display!=='none');
  let i=vis.findIndex(b=>b.classList.contains('csel-active'));
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();
    if(!open)cselOpen(id);
    if(!vis.length)return;
    if(i>=0)vis[i].classList.remove('csel-active');
    i=e.key==='ArrowDown'?Math.min(i+1,vis.length-1):Math.max(i-1,0);
    vis[i].classList.add('csel-active');vis[i].scrollIntoView({block:'nearest'});
  }else if(e.key==='Enter'&&open){
    e.preventDefault();
    const b=vis[i>=0?i:0];if(b)b.click();
  }else if(e.key==='Escape'&&open){
    e.preventDefault();e.stopPropagation();cselCloseList(list);
  }
}
function cselResetSearch(list){
  list.querySelectorAll('.csel-option').forEach(btn=>{btn.style.display='';btn.classList.remove('csel-active');});
  const nr=list.querySelector('.csel-no-result');if(nr)nr.style.display='none';
  // ช่องพิมพ์ที่พิมพ์ค้างไว้แต่ไม่ได้เลือก → คืนเป็นรายการที่เลือกอยู่
  const id=list.id.replace(/^csell-/,''),ci=cselCombo(id);
  if(ci){
    const btn=document.getElementById('cselb-'+id);
    ci.value=btn&&btn.dataset.empty!=='1'?(btn.querySelector('.csel-btn-txt')||btn).textContent:'';
  }
}
function cselCloseList(x){
  cselResetSearch(x);
  x.classList.remove('open','csel-desktop');
  x.style.cssText='';
  if(x._onOutside){document.removeEventListener('touchstart',x._onOutside);x._onOutside=null;}
}
function cselNativePick(id,sel){
  const val=sel.value;
  const lbl=val?sel.options[sel.selectedIndex].textContent:'';
  const input=document.getElementById(id);
  const btn=document.getElementById('cselb-'+id);
  if(input)input.value=val;
  if(btn){
    const span=btn.querySelector('.csel-btn-txt');
    if(val&&lbl){if(span)span.textContent=lbl;btn.dataset.empty='';}
    else{btn.dataset.empty='1';}
  }
  const ci=cselCombo(id);if(ci)ci.value=val?lbl:'';
}
function cselOpen(id){
  const list=document.getElementById('csell-'+id);
  if(list&&!list.classList.contains('open'))cselToggle(id);
}
function cselToggle(id){
  const isTouch='ontouchstart' in window;
  const isLine=/Line\//.test(navigator.userAgent);
  const combo=cselCombo(id);
  if(isTouch&&!isLine&&!combo)return; // regular touch: native select overlay handles it
  const list=document.getElementById('csell-'+id);
  const btn=combo||document.getElementById('cselb-'+id);
  if(!list||!btn)return;
  const wasOpen=list.classList.contains('open');
  document.querySelectorAll('.csel-list.open').forEach(x=>cselCloseList(x));
  if(!wasOpen){
    if(isTouch){
      // Line WebView: inline expansion inside modal (no fixed — avoids WebView stacking bugs)
      list.style.maxHeight='none'; // let modal scroll handle overflow
      list.classList.add('open');
      const onOutside=(e)=>{
        if(!list.contains(e.target)&&!btn.contains(e.target))
          document.querySelectorAll('.csel-list.open').forEach(x=>cselCloseList(x));
      };
      setTimeout(()=>document.addEventListener('touchstart',onOutside,{passive:true}),200);
      list._onOutside=onOutside;
    }else{
      // Desktop: floating near button (position:fixed set via JS only, never CSS)
      const r=btn.getBoundingClientRect();
      const below=window.innerHeight-r.bottom;
      const above=r.top;
      list.style.position='fixed';
      list.style.zIndex='9999';
      list.style.left=r.left+'px';
      list.style.width=r.width+'px';
      list.style.maxHeight=Math.min(260,Math.max(below,above)-8)+'px';
      if(below>=120||below>=above){list.style.top=(r.bottom+2)+'px';list.style.bottom='auto';}
      else{list.style.top='auto';list.style.bottom=(window.innerHeight-r.top+2)+'px';}
      list.classList.add('open','csel-desktop');
    }
  }
}
function cselPick(id,val,label){
  const input=document.getElementById(id);
  const btn=document.getElementById('cselb-'+id);
  const list=document.getElementById('csell-'+id);
  if(input)input.value=val;
  if(btn){
    const span=btn.querySelector('.csel-btn-txt');
    if(span)span.textContent=label;else btn.firstChild.textContent=label;
    btn.dataset.empty='';
  }
  const ci=cselCombo(id);if(ci)ci.value=label;
  if(list){
    list.querySelectorAll('.csel-selected').forEach(el=>el.classList.remove('csel-selected'));
    list.querySelectorAll('.csel-option').forEach(li=>{
      if(li.dataset.val===String(val))li.classList.add('csel-selected');
    });
    cselCloseList(list);
  }
}
function cselSetVal(id,val,placeholder){
  const input=document.getElementById(id);
  const btn=document.getElementById('cselb-'+id);
  if(!input)return;
  if(input.tagName==='SELECT'){input.value=val;return;}
  input.value=val;
  if(btn){
    const span=btn.querySelector('.csel-btn-txt');
    const txt=val||placeholder||'เลือก...';
    if(span)span.textContent=txt;else btn.firstChild.textContent=txt;
    btn.dataset.empty=val?'':'1';
  }
  const ci=cselCombo(id);if(ci)ci.value=val||'';
  // Sync native select value
  const nat=document.getElementById('cselm-'+id);
  if(nat)nat.value=val||'';
}
document.addEventListener('click',e=>{
  if(!e.target.closest('.csel-wrap')&&!e.target.closest('.csel-list')&&!e.target.closest('.csel-backdrop'))
    document.querySelectorAll('.csel-list.open').forEach(x=>cselCloseList(x));
});
function openAddSession(){
  document.getElementById('sess-modal-title').innerHTML='<i class="ti ti-calendar-plus"></i>เพิ่มรอบอบรม';
  document.getElementById('sess-edit-id').value='';
  document.getElementById('ns-name').value='';
  document.getElementById('ns-cap').value='15';
  document.getElementById('ns-date').value='';
  _syncSessDateBE();
  document.getElementById('ns-time-start').value='09:00';
  document.getElementById('ns-time-end').value='16:00';
  populateSessionDropdowns();
  document.getElementById('modal-session').classList.add('open');
}
function openEditSession(id){
  const s=getSess(id);
  document.getElementById('sess-modal-title').innerHTML='<i class="ti ti-edit"></i>แก้ไขรอบอบรม';
  document.getElementById('sess-edit-id').value=s.id;
  document.getElementById('ns-name').value=s.name;
  document.getElementById('ns-date').value=s.date;
  _syncSessDateBE();
  document.getElementById('ns-time-start').value=s.timeStart||'09:00';
  document.getElementById('ns-time-end').value=s.timeEnd||'16:00';
  document.getElementById('ns-cap').value=s.capacity;
  populateSessionDropdowns(s.trainerId);
  setTimeout(()=>{
    document.getElementById('ns-cat').value=s.catId;
    document.getElementById('ns-venue').value=s.venueId??'';
    document.getElementById('ns-trainer').value=s.trainerId;
  },50);
  document.getElementById('modal-session').classList.add('open');
}
async function submitSession(){
  const editId=document.getElementById('sess-edit-id').value;
  const catId=parseInt(document.getElementById('ns-cat').value);
  const name=document.getElementById('ns-name').value.trim();
  const date=document.getElementById('ns-date').value;
  const timeStart=document.getElementById('ns-time-start').value;
  const timeEnd=document.getElementById('ns-time-end').value;
  const venueId=parseInt(document.getElementById('ns-venue').value)||null;
  const trainer=document.getElementById('ns-trainer').value;
  const cap=parseInt(document.getElementById('ns-cap').value);
  if(!catId||!name||!date||!timeStart||!timeEnd||!venueId||!trainer||!cap){showToast('กรุณากรอกข้อมูลให้ครบ','danger');return;}
  if(!_availableCategories().some(c=>c.id===catId)){showToast('หลักสูตรไม่ตรงกับประเภทของโครงการนี้','danger');return;}
  if(timeEnd<=timeStart){showToast('เวลาสิ้นสุดต้องหลังเวลาเริ่ม','danger');return;}
  if(editId){
    const s=getSess(parseInt(editId));
    const cnt=getCount(s.id);
    if(cap<cnt){showToast(`ที่นั่งต้องไม่น้อยกว่าผู้ลงทะเบียน (${cnt} คน)`,'danger');return;}
    const {error}=await _sb.from('trn_sessions').update({cat_id:catId,name,date,time_start:timeStart,time_end:timeEnd,venue_id:venueId,trainer,capacity:cap}).eq('id',s.id);
    if(error){showToast('บันทึกไม่สำเร็จ','danger');return;}
    Object.assign(s,{catId,name,date,timeStart,timeEnd,venueId,venue:_mVal(venueId),trainerId:trainer,trainer:_staffName(trainer),capacity:cap});
    showToast('แก้ไขรอบสำเร็จ','success');
  } else {
    const {data,error}=await _sb.from('trn_sessions').insert({cat_id:catId,name,date,time_start:timeStart,time_end:timeEnd,venue_id:venueId,trainer,capacity:cap,site:currentSite}).select().single();
    if(error){showToast('บันทึกไม่สำเร็จ','danger');return;}
    sessions.push(_mSess(data));
    showToast('เพิ่มรอบอบรมสำเร็จ','success');
  }
  const cat=allCategories.find(c=>c.id===catId);
  if(cat&&!cat.enabled){ // ฐานข้อมูลเปิดหลักสูตรนี้ในโครงการให้แล้ว (trigger) — อัปเดตในหน้าให้ตรงกัน
    Object.assign(cat,{enabled:true,quizOpen:true});
    categories=allCategories.filter(c=>c.enabled);
    if(cat.quizId)_quizCatIds.add(cat.id); // Realtime โหลดใหม่ตามมา (ตรวจว่าแบบทดสอบยังเปิดใช้งานอยู่)
    showToast(`เปิดหลักสูตร "${cat.name}" ในโครงการนี้ให้แล้ว`,'success');
  }
  closeModal('modal-session');renderAdmin();
}
async function deleteSess(id){
  if(!await showConfirm('ลบรอบอบรมนี้?','',{okLabel:'ลบ'}))return;
  const {error}=await _sb.from('trn_sessions').delete().eq('id',id);
  if(error){showToast('ลบไม่สำเร็จ','danger');return;}
  sessions=sessions.filter(x=>x.id!==id);
  registrations=registrations.filter(r=>r.sessionId!==id);
  renderAdmin();showToast('ลบรอบสำเร็จ','success');
}

/* ══ ADD / EDIT CATEGORY ══ */
function _setBannerPreview(url,label=''){
  const wrap=document.getElementById('nc-banner-wrap');
  wrap.style.backgroundImage=`url("${url}")`;
  wrap.style.backgroundSize='cover';
  wrap.style.backgroundPosition='center';
  document.getElementById('nc-banner-placeholder').style.display='none';
  document.getElementById('nc-banner-clear-btn').style.display='flex';
  if(label)document.getElementById('nc-banner-filename').textContent=label;
}
function clearCatBanner(){
  const wrap=document.getElementById('nc-banner-wrap');
  wrap.style.backgroundImage='';
  document.getElementById('nc-banner-placeholder').style.display='flex';
  document.getElementById('nc-banner-file').value='';
  document.getElementById('nc-banner-filename').textContent='';
  document.getElementById('nc-banner-clear-btn').style.display='none';
  document.getElementById('nc-banner-url').value='';
  croppedBlob=null;
}

let cropper = null;
let croppedBlob = null;

async function previewCatBanner(event){
  if(!await _needLib('cropper'))return;
  const file=event.target.files[0];
  if(!file)return;
  
  croppedBlob = null;
  const reader=new FileReader();
  reader.onload=e=>{
    const imgTarget = document.getElementById('crop-image-target');
    imgTarget.src = e.target.result;
    document.getElementById('modal-crop').classList.add('open');
    
    if(cropper) {
      cropper.destroy();
    }
    
    setTimeout(() => {
      cropper = new Cropper(imgTarget, {
        aspectRatio: 800 / 300,
        viewMode: 1,
        autoCropArea: 1,
      });
    }, 50);
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}
function cancelCrop() {
  closeModal('modal-crop');
  if(cropper) cropper.destroy();
  cropper = null;
}
function applyCrop() {
  if(!cropper) return;
  const canvas = cropper.getCroppedCanvas({
    width: 800,
    height: 300,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  });
  if(!canvas) { showToast('เกิดข้อผิดพลาดในการตัดรูป', 'danger'); return; }
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  _setBannerPreview(dataUrl, 'Cropped_Image.jpg');
  document.getElementById('nc-banner-url').value='__new__';
  canvas.toBlob(blob => { croppedBlob = blob; }, 'image/jpeg', 0.9);
  closeModal('modal-crop');
  cropper.destroy();
  cropper = null;
}
function openAddCat(){
  if(window.trnAiCourseReset)window.trnAiCourseReset();
  document.getElementById('nc-edit-id').value='';
  document.getElementById('modal-add-cat-title').innerHTML='<i class="ti ti-category-plus"></i>เพิ่มหลักสูตรอบรม';
  ['nc-name','nc-desc','nc-cert-code'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('nc-color').value='blue';
  selectIcon('box');
  _fillCatTypeSelect('');
  _fillCatQuizSelect(null,'');
  clearCatBanner();
  document.getElementById('modal-add-cat').classList.add('open');
}
function openEditCat(id){
  if(window.trnAiCourseReset)window.trnAiCourseReset();
  const c=getCat(id);
  document.getElementById('nc-edit-id').value=id;
  document.getElementById('modal-add-cat-title').innerHTML='<i class="ti ti-edit"></i>แก้ไขหลักสูตรอบรม';
  document.getElementById('nc-name').value=c.name;
  document.getElementById('nc-desc').value=c.desc||'';
  document.getElementById('nc-cert-code').value=c.certCode||'';
  document.getElementById('nc-color').value=c.color||'blue';
  selectIcon(c.icon||'box');
  _fillCatTypeSelect(c.typeId);
  _fillCatQuizSelect(c.quizId,c.typeId,c.id);
  clearCatBanner();
  if(c.bannerUrl){
    _setBannerPreview(c.bannerUrl);
    document.getElementById('nc-banner-url').value=c.bannerUrl;
  }
  document.getElementById('modal-add-cat').classList.add('open');
}
function toggleIconPicker(){
  const panel=document.getElementById('icon-picker-panel');
  const chev=document.getElementById('icon-picker-chevron');
  const trigger=document.getElementById('icon-picker-btn');
  if(!panel.hidden){
    panel.hidden=true;trigger.setAttribute('aria-expanded','false');chev.style.transform='rotate(0deg)';return;
  }
  renderIconGrid('');
  document.getElementById('icon-search').value='';
  panel.hidden=false;trigger.setAttribute('aria-expanded','true');chev.style.transform='rotate(180deg)';
  setTimeout(()=>document.getElementById('icon-search').focus(),50);
}
function filterIcons(){renderIconGrid(document.getElementById('icon-search').value.trim().toLowerCase());}
function clearIconSearch(){
  const search=document.getElementById('icon-search');
  search.value='';renderIconGrid('');search.focus();
}
function renderIconGrid(q){
  const cur=document.getElementById('nc-icon').value||'box';
  const list=q?ICON_LIST.filter(n=>n.includes(q)):ICON_LIST;
  document.getElementById('icon-result-count').textContent=`${list.length} ไอคอน`;
  if(!list.length){
    document.getElementById('icon-grid').innerHTML='<div class="icon-picker-empty"><i class="ti ti-search-off"></i><b>ไม่พบไอคอน</b><span>ลองค้นหาด้วยคำอื่น เช่น box, user หรือ book</span></div>';
    return;
  }
  document.getElementById('icon-grid').innerHTML=list.map(n=>`<button type="button" onclick="selectIcon('${n}')" title="เลือก ${n}" role="option" aria-selected="${n===cur}" class="icon-pick-item${n===cur?' selected':''}"><i class="ti ti-${n}"></i><span>${n}</span>${n===cur?'<i class="ti ti-check icon-pick-check"></i>':''}</button>`).join('');
}
function selectIcon(name){
  document.getElementById('nc-icon').value=name;
  document.getElementById('icon-picker-preview').innerHTML=`<i class="ti ti-${name}"></i>`;
  document.getElementById('icon-picker-name').textContent=name;
  document.getElementById('icon-picker-panel').hidden=true;
  document.getElementById('icon-picker-btn').setAttribute('aria-expanded','false');
  document.getElementById('icon-picker-chevron').style.transform='rotate(0deg)';
  _ncPreview();
}
// ตัวอย่างหลักสูตรในฟอร์ม (ไอคอน + สีธีม + ชื่อ + รหัส) — หน้าตาเดียวกับแถวในหน้า "หลักสูตรอบรม"
function _ncPreview(){
  const el=document.getElementById('nc-preview');
  if(!el)return;
  const cm=CM[document.getElementById('nc-color').value]||CM.blue;
  const name=document.getElementById('nc-name').value.trim(),code=document.getElementById('nc-cert-code').value.trim();
  el.style.setProperty('--nc-c',cm.c);
  el.innerHTML=`<span class="tqa-cat-ic" style="background:${cm.bg};color:${cm.c};"><i class="ti ti-${_esc(document.getElementById('nc-icon').value||'box')}"></i></span>
    <div style="min-width:0;"><small>ตัวอย่างการแสดงผล</small>
      <div class="ov-cr-name nc-preview-name${name?'':' empty'}">${name?_esc(name):'ชื่อหลักสูตรอบรม'}${code?`<span class="ov-cr-code">${_esc(code)}</span>`:''}</div></div>`;
}
async function submitAddCat(){
  const name=document.getElementById('nc-name').value.trim();
  if(!name){showToast('กรุณาระบุชื่อหลักสูตรอบรม','danger');return;}
  const bannerUrlField=document.getElementById('nc-banner-url').value||'';
  let bannerUrl=null;
  if(croppedBlob){
    // ชื่อไฟล์ไม่มีนามสกุล — proxy หน้าเซิร์ฟเวอร์จริงตีกลับ URL storage ที่ลงท้าย .jpg (ชนิดไฟล์ใช้ contentType แทน)
    const path=`cat_${Date.now()}`;
    showToast('กำลังอัปโหลดรูป...','info');
    const {data:upData,error:upErr}=await _sb.storage.from('trn-banners').upload(path,croppedBlob,{upsert:true,contentType:'image/jpeg'});
    if(upErr){showToast('อัปโหลดรูปไม่สำเร็จ: '+upErr.message,'danger');return;}
    bannerUrl=_sb.storage.from('trn-banners').getPublicUrl(upData.path).data.publicUrl;
  } else if(bannerUrlField&&bannerUrlField!=='__new__'){
    // AI-generated URL or existing URL → use as-is
    bannerUrl=bannerUrlField;
  }
  const payload={name,description:document.getElementById('nc-desc').value.trim(),icon:document.getElementById('nc-icon').value.trim()||'box',color:document.getElementById('nc-color').value,banner_url:bannerUrl,quiz_id:+document.getElementById('nc-quiz').value||null,cert_code:document.getElementById('nc-cert-code').value.trim().toUpperCase(),type_id:document.getElementById('nc-type').value};
  const editId=document.getElementById('nc-edit-id').value;
  if(allCategories.some(c=>c.name.trim().toLowerCase()===name.toLowerCase()&&String(c.id)!==editId)){showToast(`มีหลักสูตรอบรม "${name}" อยู่แล้ว`,'warn');return;}
  if(editId){
    const {error}=await _sb.from('trn_categories').update(payload).eq('id',parseInt(editId));
    if(error){showToast('บันทึกไม่สำเร็จ: '+error.message,'danger');return;}
    showToast(`แก้ไข "${name}" สำเร็จ — มีผลทุกโครงการที่ใช้หลักสูตรนี้`,'success');
  } else {
    const {error}=await _sb.from('trn_categories').insert(payload);
    if(error){showToast('บันทึกไม่สำเร็จ: '+error.message,'danger');return;}
    showToast(`เพิ่มหลักสูตรอบรม "${name}" สำเร็จ — ทุกโครงการเลือกใช้ได้`,'success');
  }
  closeModal('modal-add-cat');_ovCats();
}
// ลบหลักสูตรกลาง — ได้เฉพาะที่ยังไม่มีรอบอบรมในโครงการใด (ฐานข้อมูลกันซ้ำ: trn_sessions.cat_id on delete restrict)
async function deleteCat(id){
  const c=getCat(id),u=_ovCatUse[id]||{sites:0,sess:0};
  if(u.sess){showToast(`ลบไม่ได้ — "${c.name}" มีรอบอบรม ${u.sess} รอบ`,'warn');return;}
  if(!await showConfirm(`ลบหลักสูตร "${c.name}"?`,u.sites?`เปิดใช้อยู่ ${u.sites} โครงการ (ยังไม่มีรอบอบรม) — จะหายจากโครงการเหล่านั้นด้วย`:'',{okLabel:'ลบ'}))return;
  const {error}=await _sb.from('trn_categories').delete().eq('id',id);
  if(error){showToast('ลบไม่สำเร็จ'+(_isInUse(error)?' — มีรอบอบรมใช้หลักสูตรนี้อยู่':''),'danger');_ovCats();return;}
  showToast('ลบหลักสูตรสำเร็จ','success');_ovCats();
}

/* ══ เปิดอบรมให้โครงการ (หน้า "ยังไม่เปิดอบรม" ในแท็บอบรมของโครงการ) ══ */
// ── รพ. ของโครงการ = รพ. ที่เลือกไว้ตอนเพิ่ม/แก้ไขโครงการในเมนูโครงการ (projects.hospital_id ของโครงการต้นทาง) ที่เดียว
// ระบบอบรมไม่มีช่องเลือก รพ. ของตัวเอง · รหัส รพ. เป็นต้นรหัสโครงการ (เช่น 10700-01) จึงต้องมีรหัส ──
// ip = แถว impl_projects → { sp: โครงการต้นทาง, h: { id, code, name } | null }
async function _projectHospital(ip){
  if(!ip)return{sp:null,h:null};
  const {data}=await _qProj();
  const sp=ProjectTeam.source({sourceProjectId:ip.source_project_id||''},_mapProjects(data));
  if(!sp||!sp.hospitalId)return{sp,h:null};
  const {data:h}=await _sb.from('hospitals').select('id,code,name').eq('id',sp.hospitalId).maybeSingle();
  return{sp,h:h||null};
}
// ข้อความบอกสถานะ รพ. ของโครงการ (null = พร้อมเปิดอบรม)
function _hospitalProblem(ph){
  if(!ph.sp)return'โครงการนี้ไม่ได้ผูกกับโครงการในเมนูโครงการ — ผูกได้ที่ ✏️ แก้ไขโครงการ ในติดตามสถานะโครงการ';
  if(!ph.h)return`ยังไม่ได้ระบุโรงพยาบาลของโครงการ "${_esc(ph.sp.name)}" — เลือกได้ที่เมนูโครงการ › แก้ไขโครงการ › 🏥 โรงพยาบาล`;
  if(!ph.h.code)return`${_esc(ph.h.name)} ยังไม่มีรหัส รพ. — ใส่รหัสได้ที่เมนูรายชื่อ รพ.`;
  return null;
}
const _hspText=h=>`${h.name} (${h.code})`;
// รหัสโครงการถัดไปของ รพ. — นับทั้งโครงการที่เปิดอยู่และรหัสที่เคยใช้ (ข้อมูลเก่ายังอ้างอยู่) กันข้อมูลปนกัน
function _nextSiteCode(hcode){
  const used=new Set([...locations.map(l=>l.code),...allSessionsFull.map(s=>s.site)]);
  let n=1;
  while(used.has(`${hcode}-${String(n).padStart(2,'0')}`))n++;
  return `${hcode}-${String(n).padStart(2,'0')}`;
}
// เปิดอบรมให้โครงการ (หน้า "ยังไม่เปิดอบรม" ในแท็บอบรมของโครงการ) → รหัสโครงการ หรือ null
// h = รพ. ของโครงการ · reuseCode = เปิดด้วยรหัสเดิมที่ถูกเอาออกไป (ข้อมูลเดิมกลับมา — ต้องเป็นรหัสของ รพ. เดียวกัน)
async function _openTraining(p,h,reuseCode){
  if(!p||!h)return null;
  if(reuseCode&&reuseCode.replace(/-\d+$/,'')!==h.code){showToast(`รหัส ${reuseCode} เป็นของ รพ. อื่น ไม่ใช่ ${h.name}`,'danger');return null;}
  const code=reuseCode||_nextSiteCode(h.code);
  const {error}=await _sb.from('trn_sites').insert({code,hospital_id:h.id,project_id:p.id});
  if(error){showToast('บันทึกไม่สำเร็จ','danger');return null;}
  showToast(`เปิดอบรมโครงการ "${p.project_name}" แล้ว (รหัส ${code})`,'success');
  return code;
}

/* ══ แท็บอบรมของโครงการ (?project=) ที่ยังไม่เปิดอบรม ══
   เปิดได้เลยในหน้านี้: Admin ทุกโครงการ · PM/ทีมที่มีสิทธิ์ "เพิ่ม" ของอบรม เฉพาะโครงการที่ตัวเองอยู่ในทีม
   รพ. มาจากโครงการ (เมนูโครงการ) — ไม่ต้องเลือกที่นี่ */
async function _canOpenTraining(p){
  const a=currentAdminUser;
  if(!a||!p)return false;
  if(a.role==='superadmin')return true;
  if(!a.perm?.add||!a.staffId)return false;
  const {data}=await _qProj();
  return ProjectTeam.isMember(a.staffId,{sourceProjectId:p.source_project_id||''},_mapProjects(data));
}
async function renderUnopened(){
  const el=document.getElementById('unopened-content');
  if(!el)return;
  el.innerHTML='<div style="color:var(--text-muted);">กำลังโหลด...</div>';
  const [sR,pR]=await Promise.all([
    _sb.from('trn_sites').select('code').eq('project_id',PROJECT_ID).maybeSingle(),
    _sb.from('impl_projects').select('id,project_name,source_project_id').eq('id',PROJECT_ID).maybeSingle(),
  ]);
  const p=pR.data;
  const head=(icon,title,desc)=>`<i class="ti ti-${icon}" style="font-size:44px;color:var(--primary);"></i>
    <div style="font-size:17px;font-weight:700;margin:10px 0 6px;">${title}</div>
    <div style="font-size:13px;color:var(--text-muted);line-height:1.7;">${desc}</div>`;
  if(sR.data){
    el.innerHTML=head('lock','คุณไม่อยู่ในทีมของโครงการนี้',`การอบรมของโครงการนี้เปิดแล้ว (รหัส ${_esc(sR.data.code)}) แต่บัญชีของคุณไม่ได้เป็น PM หรืออยู่ในทีมโครงการ<br>ติดต่อ PM หรือ Admin เพื่อเพิ่มเข้าทีม (บัญชีต้องผูกกับพนักงาน)`);
    return;
  }
  if(!await _canOpenTraining(p)){
    el.innerHTML=head('school','โครงการนี้ยังไม่เปิดอบรม','ให้ PM ของโครงการ หรือ Admin เปิดอบรมที่หน้านี้');
    return;
  }
  const ph=await _projectHospital(p);
  const prob=_hospitalProblem(ph);
  if(prob){
    // แก้ที่เมนูโครงการ (เปิดฟอร์มแก้ไขโครงการของ Backoffice ได้เลยถ้าฝังอยู่ใน Backoffice) แล้วกดตรวจอีกครั้ง
    const canEditSrc=EMBED&&ph.sp&&window.parent.openProjModal;
    el.innerHTML=head('building-hospital','ยังเปิดอบรมไม่ได้',prob)+`
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:18px;">
        ${canEditSrc?`<button class="btn btn-primary" onclick="window.parent.openProjModal('${_esc(ph.sp.id)}')"><i class="ti ti-edit"></i>แก้ไขโครงการ</button>`:''}
        <button class="btn btn-ghost" onclick="renderUnopened()"><i class="ti ti-refresh"></i>ตรวจอีกครั้ง</button>
      </div>`;
    return;
  }
  el.innerHTML=head('school','โครงการนี้ยังไม่เปิดอบรม','เปิดอบรมเพื่อจัดรอบอบรม ลงทะเบียน เช็คชื่อ ประเมิน และแบบทดสอบของโครงการนี้<br>ข้อมูลแยกจากโครงการอื่นทั้งหมด')+`
    <div style="margin:18px 0 14px;font-size:14px;font-weight:600;"><i class="ti ti-building-hospital" style="color:var(--primary);"></i> ${_esc(_hspText(ph.h))}</div>
    <button class="btn btn-primary" onclick="openThisProjectTraining()"><i class="ti ti-plus"></i>เปิดอบรม</button>`;
}
async function openThisProjectTraining(){
  // อ่านใหม่ตอนกด (ไม่ใช้ค่าที่จำไว้ตอนแสดงหน้า — หน้านี้อาจถูกวาดใหม่ระหว่างนั้น)
  const {data:p}=await _sb.from('impl_projects').select('id,project_name,source_project_id').eq('id',PROJECT_ID).maybeSingle();
  const ph=await _projectHospital(p);
  if(_hospitalProblem(ph)){renderUnopened();return;}
  if(!await _openTraining(p,ph.h))return;
  setLoading(true);
  try{await loadAllData();}catch(e){console.error(e);}
  setLoading(false);
  _syncSiteUI();
  showPage('admin');
}

// Backoffice สลับโครงการในแท็บ 🎓 อบรม → โหลดข้อมูลโครงการใหม่ในหน้าเดิม อยู่หน้าย่อยเดิม (ไม่โหลดหน้า/ไลบรารีใหม่)
async function embedOpenProject(pid){
  if(!PROJECT_ID||!pid||pid===PROJECT_ID)return;
  PROJECT_ID=pid;
  const cur=((document.querySelector('.page.active')||{}).id||'').replace('page-','');
  try{stopScan();}catch(e){} // ปิดกล้องของโครงการก่อน (ถ้าเปิดสแกนค้างไว้)
  setLoading(true);
  try{await loadAllData(true);}catch(e){console.error(e);showToast('โหลดข้อมูลไม่สำเร็จ','danger');} // true = ใช้ทีม/พนักงานที่โหลดไว้แล้ว โหลดเฉพาะข้อมูลอบรมของโครงการใหม่
  setLoading(false);
  const svd=document.getElementById('svd-site');if(svd)svd.innerHTML=''; // ตัวเลือกโครงการของผลประเมิน สร้างใหม่ตามโครงการ
  _syncSiteUI();
  showPage(['track','analytics','checkin','admin','print'].includes(cur)?cur:'track');
  const tab=document.querySelector('.admin-tab.active');
  if(currentSite&&cur==='admin'&&tab)switchAdminTab(tab.dataset.tab); // แท็บย่อยที่โหลดข้อมูลเอง (ผลประเมิน/คีย์ยอด/แบบทดสอบ)
}

/* ══════════════════ ภาพรวมทุกโครงการ (?view=overview — เมนู "อบรม / แบบทดสอบ" ของ Backoffice) ══════════════════
   โครงการที่ผู้ใช้เห็น (locations กรองตามทีมแล้ว: Admin = ทุกโครงการ · PM/ทีม = ของตัวเอง) · กดแถว → แท็บอบรมของโครงการ */
const _ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function _ovStat(label,value,sub,cls,tip){
  return `<div class="stat-card ${cls||''}"><div class="stat-label">${label}${calcTip(tip)}</div><div class="stat-value">${value}</div>${sub?`<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${sub}</div>`:''}</div>`;
}
/* ── เมนู "ระบบอบรม" (?view=overview) — แท็บ: ภาพรวมผลการอบรม · หลักสูตรอบรม (กลาง) · คลังแบบทดสอบ · ใบประกาศ & อีเมล
   ?tab= เปิดแท็บนั้นเลย (ลิงก์ "จัดการหลักสูตรกลาง" จากแท็บอบรมของโครงการ — src/modules/training.js trnOpenCentral) ── */
let _ovTab=_qs.get('tab')||'overview';
// ตั้งค่ากลาง (หลักสูตรอบรม · คลังแบบทดสอบ · ใบประกาศ & อีเมล) กระทบทุกโครงการ — สิทธิ์ "ระบบอบรม" แค่ ดู = เห็นเฉพาะภาพรวม
// มี เพิ่ม/แก้ไข/ลบ อย่างใดอย่างหนึ่ง (หรือ Admin) = เห็นทุกแท็บ · ตั้งในหน้าสิทธิ์การใช้งานของ Backoffice
const OV_CENTRAL=['cats','quiz','cert'];
const _canCentral=()=>{const a=currentAdminUser,p=a&&a.perm;return !!a&&(a.role==='superadmin'||!!(p&&(p.add||p.edit||p.del)));};
function ovTab(t){
  _ovTab=t;
  renderOverview();
}
function renderOverview(){
  const central=_canCentral();
  if(!central&&OV_CENTRAL.includes(_ovTab))_ovTab='overview';
  document.getElementById('ov-tabs').style.display=central?'':'none'; // เหลือแท็บเดียว (ภาพรวม) ไม่ต้องแสดงแถบ
  document.querySelectorAll('#ov-tabs .tqa-subtab').forEach(b=>b.classList.toggle('active',b.dataset.t===_ovTab));
  if(_ovTab==='cats')return _ovCats();
  if(_ovTab==='quiz'){_tqaTab='quizzes';_tqaQ=null;return _tqaRender();}
  if(_ovTab==='cert'){_tqaTab='settings';return _tqaRender();}
  return _ovSummary();
}
// Realtime: วาดใหม่เฉพาะแท็บที่เป็นตัวเลข (คลังแบบทดสอบ/ใบประกาศ มีฟอร์มที่กำลังแก้อยู่ — ไม่ล้างทิ้ง)
function _ovRefresh(){if(_ovTab==='overview'||_ovTab==='cats')renderOverview();}

/* ── หลักสูตรอบรม (กลาง) — เพิ่ม/แก้ (รวมผูกแบบทดสอบ) = ฟอร์ม modal-add-cat · การ์ดแสดงอย่างเดียว · แก้ได้เฉพาะสิทธิ์ "แก้ไข" (กระทบทุกโครงการ) ── */
let _ovCatUse={},_ovQuizzes=[],_ovPtypes=[],_ovCatSeq=0;
// แถว ptypes (ประเภทโครงการ) → {id,label,color} เรียงชื่อ — ใช้จัดกลุ่มหน้า หลักสูตรอบรม / คลังแบบทดสอบ
const _mapPtypes=rows=>(rows||[]).map(t=>({id:t.type_id||t.id,label:t.label_th||t.label||'',color:t.color_hex||'#9ba3b8'})).sort((a,b)=>a.label.localeCompare(b.label,'th'));
async function _ovCats(){
  const seq=++_ovCatSeq,el=document.getElementById('ov-content');
  if(!el.querySelector('#ov-cat-table'))el.innerHTML='<div class="tqa-empty">กำลังโหลด...</div>';
  const [cR,uR,qR,tR]=await Promise.all([
    _sb.from('trn_categories').select('*').order('id'),
    _sb.rpc('trn_category_usage'), // ฐานข้อมูลนับให้: เปิดกี่โครงการ / กี่รอบอบรม ต่อหลักสูตร
    _sb.from('trn_quizzes').select('id,title,is_active').order('title'),
    _sb.from('ptypes').select('id,type_id,label_th,label,color_hex'), // ประเภทโครงการ (จัดกลุ่มหลักสูตร)
  ]);
  if(seq!==_ovCatSeq)return;
  if(cR.error||uR.error||qR.error){el.innerHTML='<div class="tqa-empty">โหลดข้อมูลไม่สำเร็จ</div>';return;}
  allCategories=categories=(cR.data||[]).map(r=>_mCat(r,null));
  _ovQuizzes=qR.data||[];
  _ovPtypes=_mapPtypes(tR.data);
  _ovCatUse=Object.fromEntries((uR.data||[]).map(x=>[x.cat_id,{sites:+x.sites,sess:+x.sess}]));
  _ovCatsRender();
}
// แถบสรุป (ทั้งหมด/มีแบบทดสอบ/ยังไม่มี — กดชิปเพื่อกรอง) + ค้นหา · ตารางเดิมคำอธิบายยาวดันคอลัมน์อื่นจนอ่านยาก → แสดงเป็นการ์ด
let _ovCatQ='',_ovCatF='all';
function _ovCatsRender(){
  const el=document.getElementById('ov-content');
  if(!el||_ovTab!=='cats')return;
  const edit=_tqaCanEdit();
  const withQ=allCategories.filter(c=>c.quizId).length,noQ=allCategories.length-withQ;
  const chip=(f,ic,label,n,cls)=>`<button type="button" class="ov-cat-chip${cls?' '+cls:''}${_ovCatF===f?' active':''}" onclick="_ovCatFilter('${f}')"><i class="ti ti-${ic}"></i>${label} <b>${n}</b></button>`;
  el.innerHTML=`<div class="card" id="ov-cat-table"><div class="card-header">
      <div><div class="card-title"><i class="ti ti-category"></i>หลักสูตรอบรม (กลาง)</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">ผูกแบบทดสอบครั้งเดียวที่นี่ — ทุกโครงการที่ใช้หลักสูตรนี้ได้แบบทดสอบชุดเดียวกัน${edit?'':' · คุณดูได้อย่างเดียว (แก้ไขต้องมีสิทธิ์ "แก้ไข" ของเมนูอบรม)'}</div></div>
      ${edit?'<button class="btn btn-primary btn-sm" onclick="openAddCat()"><i class="ti ti-plus"></i>เพิ่มหลักสูตรอบรม</button>':''}</div>
    ${allCategories.length?`<div class="ov-cat-bar">
        <div class="ov-cat-chips">${chip('all','list','ทั้งหมด',allCategories.length)}${chip('quiz','circle-check','มีแบบทดสอบ',withQ,'ok')}${chip('noquiz','alert-triangle','ยังไม่มีแบบทดสอบ',noQ,'warn')}</div>
        <div class="ov-cat-search"><i class="ti ti-search"></i><input class="form-control" placeholder="ค้นหาหลักสูตรอบรม..." value="${_esc(_ovCatQ)}" oninput="_ovCatQ=this.value;_ovCatGrid()"></div>
      </div>
      <div id="ov-cat-grid"></div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:12px;"><i class="ti ti-info-circle"></i> ลบได้เฉพาะหลักสูตรที่ยังไม่มีรอบอบรมในโครงการใด · แก้ชื่อ/รูป/แบบทดสอบ มีผลกับทุกโครงการที่ใช้หลักสูตรนี้</div>`
      :'<div class="tqa-empty">ยังไม่มีหลักสูตรอบรม</div>'}</div>`;
  if(allCategories.length)_ovCatGrid();
}
function _ovCatFilter(f){_ovCatF=f;_ovCatsRender();}
// วาดเฉพาะกริด — พิมพ์ค้นหาแล้วช่องค้นหาไม่หลุดโฟกัส
function _ovCatGrid(){
  const el=document.getElementById('ov-cat-grid');
  if(!el)return;
  const edit=_tqaCanEdit(),kw=_ovCatQ.trim().toLowerCase();
  const list=allCategories.filter(c=>(_ovCatF==='all'||(_ovCatF==='quiz')===!!c.quizId)
    &&(!kw||(c.name+' '+(c.desc||'')+' '+c.certCode).toLowerCase().includes(kw)));
  if(!list.length){el.innerHTML='<div class="tqa-empty">ไม่พบหลักสูตรอบรมที่ตรงกับเงื่อนไข</div>';return;}
  // จัดกลุ่มตามประเภทโครงการ (เรียงชื่อประเภท · "ยังไม่ระบุ" ไว้ท้าย) · 1 หลักสูตรต่อ 1 การ์ดยาว
  const known=new Set(_ovPtypes.map(t=>t.id));
  const groups=[..._ovPtypes,{id:'',label:'ยังไม่ระบุประเภทโครงการ',color:'var(--text-muted)'}]
    .map(t=>({t,items:list.filter(c=>t.id?c.typeId===t.id:!known.has(c.typeId)).sort((a,b)=>a.name.localeCompare(b.name,'th'))}))
    .filter(g=>g.items.length);
  const row=c=>{
    const cm=CM[c.color]||CM.blue,u=_ovCatUse[c.id]||{sites:0,sess:0},q=_ovQuizzes.find(x=>x.id===c.quizId);
    return`<article class="ov-cr ov-course-card">
      <span class="tqa-cat-ic" style="background:${cm.bg};color:${cm.c};"><i class="ti ti-${c.icon}"></i></span>
      <div class="ov-cr-main">
        <div class="ov-cr-name">${_esc(c.name)}${c.certCode?`<span class="ov-cr-code" title="รหัสหลักสูตรในเลขที่ใบประกาศ">${_esc(c.certCode)}</span>`:''}</div>
        ${c.desc?`<div class="ov-cr-desc" title="${_esc(c.desc)}">${_esc(c.desc)}</div>`:''}
      </div>
      ${edit?`<div class="ov-cr-act">
        <button class="btn btn-ghost btn-sm" onclick="openEditCat(${c.id})" title="แก้ไข"><i class="ti ti-edit"></i></button>
        <button class="btn btn-ghost btn-sm" onclick="deleteCat(${c.id})" ${u.sess?'disabled':''} title="${u.sess?'ลบไม่ได้ — มีรอบอบรมใช้อยู่':'ลบ'}"><i class="ti ti-trash" style="color:var(--danger)"></i></button></div>`:''}
      <div class="ov-course-meta">
        <div class="ov-cr-use"><span title="โครงการที่เปิดใช้"><i class="ti ti-building-hospital"></i><b>${u.sites}</b> โครงการ</span><span title="รอบอบรม"><i class="ti ti-calendar-event"></i><b>${u.sess}</b> รอบ</span></div>
        <div class="ov-cr-quiz${q?'':' none'}" title="${q?'แบบทดสอบ: '+_esc(q.title):'ยังไม่ได้ผูกแบบทดสอบ'}"><i class="ti ti-${q?'circle-check':'alert-triangle'}"></i><span>${q?_esc(q.title):'ยังไม่ผูกแบบทดสอบ'}</span>${q&&!q.is_active?' <span class="badge badge-gray">ปิดใช้งาน</span>':''}</div>
      </div>
    </article>`;
  };
  el.innerHTML=groups.map(g=>`<div class="ov-cg">
      <div class="ov-cg-head"><span class="ov-cg-dot" style="background:${g.t.color};"></span>${_esc(g.t.label)}<b>${g.items.length}</b></div>
      <div class="ov-cg-list">${g.items.map(row).join('')}</div>
    </div>`).join('');
}
// ตัวเลือกประเภทโครงการในฟอร์มหลักสูตร (modal-add-cat)
function _fillCatTypeSelect(cur){
  document.getElementById('nc-type').innerHTML='<option value="">— ไม่ระบุ —</option>'
    +_ovPtypes.map(t=>`<option value="${_esc(t.id)}"${t.id===cur?' selected':''}>${_esc(t.label)}</option>`).join('');
}
// ตัวเลือกแบบทดสอบในฟอร์มหลักสูตร — จัดกลุ่มตามประเภทโครงการของหลักสูตรที่ผูกใช้อยู่
// ชุดเดียวที่ใช้ข้ามหลายประเภทอยู่กลุ่มกลางเพียงครั้งเดียว (ไม่สร้าง option value ซ้ำ)
function _fillCatQuizSelect(cur,typeId,editId){
  const currentId=cur==null?null:Number(cur),currentType=typeId||'';
  const currentQuiz=_ovQuizzes.find(x=>x.id===currentId);
  const quizzes=[..._ovQuizzes.filter(x=>x.is_active),...(currentQuiz&&!currentQuiz.is_active?[currentQuiz]:[])];
  const usage=new Map(quizzes.map(q=>[q.id,new Set()]));
  allCategories.forEach(c=>{
    if(String(c.id)===String(editId||''))return; // ใช้ค่าประเภทที่กำลังแก้ในฟอร์มแทนค่าเดิม
    if(c.quizId&&usage.has(c.quizId))usage.get(c.quizId).add(c.typeId||'');
  });
  if(currentId&&usage.has(currentId))usage.get(currentId).add(currentType);

  const known=new Set(_ovPtypes.map(t=>t.id));
  const groups=[..._ovPtypes.map(t=>({id:t.id,label:t.label,items:[]})),
    {id:'__multi',label:'ใช้ร่วมหลายประเภทโครงการ',items:[]},
    {id:'',label:'ยังไม่ระบุประเภทโครงการ',items:[]}];
  quizzes.forEach(q=>{
    const types=usage.get(q.id)||new Set(),valid=[...types].filter(id=>known.has(id));
    const groupId=valid.length>1?'__multi':valid.length===1?valid[0]:'';
    groups.find(g=>g.id===groupId).items.push(q);
  });
  const option=q=>`<option value="${q.id}"${q.id===currentId?' selected':''}>${_esc(q.title)}${q.is_active?'':' (ปิดใช้งาน)'}</option>`;
  document.getElementById('nc-quiz').innerHTML='<option value="">— ไม่มีแบบทดสอบ —</option>'
    +groups.filter(g=>g.items.length).map(g=>`<optgroup label="${_esc(g.label)}">${g.items.sort((a,b)=>a.title.localeCompare(b.title,'th')).map(option).join('')}</optgroup>`).join('');
}

let _ovSeq=0; // Realtime เรียกซ้อนกันได้ — ใช้ผลของครั้งล่าสุดเท่านั้น
async function _ovSummary(){
  const seq=++_ovSeq;
  const el=document.getElementById('ov-content');
  if(!el)return;
  const isSup=currentAdminUser?.role==='superadmin';
  if(!locations.length){
    el.innerHTML=`<div class="card" style="text-align:center;padding:32px;color:var(--text-muted);">${isSup
      ?'ยังไม่มีโครงการที่เปิดอบรม — เปิดได้ที่แท็บ 🎓 อบรม ของโครงการในเมนูติดตามสถานะโครงการ'
      :'ยังไม่มีโครงการที่คุณเป็น PM/อยู่ในทีม และเปิดอบรมแล้ว'}</div>`;
    return;
  }
  if(!el.querySelector('.stats-grid'))el.innerHTML='<div style="padding:30px;text-align:center;color:var(--text-muted);">กำลังโหลด...</div>'; // Realtime วาดใหม่ทับของเดิม ไม่กะพริบ
  const codes=locations.map(l=>l.code);
  // ทุกอย่างในรอบเดียว · ผู้ลงทะเบียน/แบบประเมิน/ผลสอบ ให้ฐานข้อมูลนับ (trn_overview_stats — db-training.sql)
  // ได้แค่ตัวเลขต่อรอบ/ต่อโครงการ ไม่ดึงทุกแถวมานับเอง → ข้อมูลสะสมมากแค่ไหนก็โหลดเร็วเท่าเดิม
  const [sR,cR,stR,ipR]=await Promise.all([
    _sb.from('trn_sessions').select('id,site,cat_id,name,date,time_start,time_end,capacity').in('site',codes),
    _sb.from('trn_categories').select('id,name'),
    _sb.rpc('trn_overview_stats',{p_sites:codes}),
    isSup?_sb.from('impl_projects').select('id,project_name,status'):Promise.resolve({data:[]}),
  ]);
  if(seq!==_ovSeq)return;
  if(sR.error||stR.error){el.innerHTML='<div class="tqa-empty">โหลดข้อมูลไม่สำเร็จ</div>';return;}
  const sess=sR.data||[],cats=cR.data||[],st=stR.data||{};
  const regOf=Object.fromEntries((st.regs||[]).map(r=>[r.id,r])); // รอบอบรม → {n, att}
  const nRegs=id=>regOf[id]?.n||0;
  const svOf=Object.fromEntries((st.survey||[]).map(r=>[r.site,r]));
  const qzOf=Object.fromEntries((st.quiz||[]).map(r=>[r.site,r]));
  const today=_ymd(new Date()),in14=_ymd(new Date(Date.now()+14*864e5));

  const rows=locations.map(l=>{
    const ss=sess.filter(s=>s.site===l.code);
    const sv=svOf[l.code]||{},qz=qzOf[l.code]||{};
    const next=ss.filter(s=>s.date>=today).sort((a,b)=>a.date.localeCompare(b.date))[0];
    return{l,n:ss.length,done:ss.filter(s=>s.date<today).length,next,
      regs:ss.reduce((t,s)=>t+nRegs(s.id),0),att:ss.reduce((t,s)=>t+(regOf[s.id]?.att||0),0),
      svN:sv.n||0,sv:sv.cnt?sv.sum/sv.cnt:null,svSum:sv.sum||0,svCnt:sv.cnt||0,qN:qz.n||0,qPass:qz.pass||0};
  });
  const sum=k=>rows.reduce((t,r)=>t+r[k],0);
  const pct=(a,b)=>b?Math.round(a/b*100)+'%':'—';
  const allSv=sum('svCnt')?sum('svSum')/sum('svCnt'):null;
  const upcoming=sess.filter(s=>s.date>=today&&s.date<=in14).sort((a,b)=>(a.date+a.time_start).localeCompare(b.date+b.time_start));

  const kpi=`<div class="stats-grid">
    ${_ovStat('โครงการที่เปิดอบรม',rows.length,'','blue')}
    ${_ovStat('รอบอบรม',sum('n'),`จัดแล้ว ${sum('done')} · รอจัด ${sum('n')-sum('done')}`,'amber','รอบอบรมทุกโครงการ · จัดแล้ว = วันที่ก่อนวันนี้ · รอจัด = วันนี้เป็นต้นไป')}
    ${_ovStat('ผู้ลงทะเบียน',sum('regs'),'','green','ผู้ลงทะเบียนทุกรอบของทุกโครงการ (รวม Walk-in)')}
    ${_ovStat('เข้าอบรมจริง',pct(sum('att'),sum('regs')),`${sum('att')} คน`,'green','ผู้ที่เช็คชื่อเข้าอบรม ÷ ผู้ลงทะเบียนทั้งหมด × 100')}
    ${_ovStat('คะแนนประเมินเฉลี่ย',allSv!=null?allSv.toFixed(2):'—',`จาก 5 · ${sum('svN')} แบบประเมิน`,'blue','ค่าเฉลี่ยของคะแนนทุกข้อ (1–5) จากแบบประเมินทุกฉบับรวมกัน')}
    ${_ovStat('สอบผ่าน',pct(sum('qPass'),sum('qN')),`${sum('qPass')}/${sum('qN')} ครั้ง`,'amber','ครั้งที่สอบผ่าน ÷ ครั้งที่ส่งคำตอบแล้วทั้งหมด × 100 (นับทุกครั้งที่สอบ ไม่ใช่รายคน)')}
  </div>`;

  const badge=r=>!r.n?['ยังไม่มีรอบอบรม','var(--bg-subtle)','var(--text-muted)']:r.next?['กำลังอบรม','#dbeafe','#1d4ed8']:['อบรมครบแล้ว','#dcfce7','#166534'];
  const tr=rows.map(r=>{
    const [bt,bb,bc]=badge(r);
    return`<tr style="cursor:pointer;" onclick="_ovOpen('${_esc(r.l.project_id||'')}')" title="เปิดแท็บอบรมของโครงการ">
      <td class="tc-title" data-label="โครงการ"><div style="font-weight:600;">${_esc(r.l.name)}</div>
        <div style="font-size:11px;color:var(--text-muted);">${_esc(r.l.code)}${r.l.hospital_name&&r.l.hospital_name!==r.l.name?' · '+_esc(r.l.hospital_name):''}</div></td>
      <td data-label="สถานะ"><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:${bb};color:${bc};white-space:nowrap;">${bt}</span></td>
      <td data-label="รอบอบรม">${r.done}/${r.n}</td>
      <td data-label="รอบถัดไป" style="white-space:nowrap;">${r.next?fmtDateShort(r.next.date):'—'}</td>
      <td data-label="ลงทะเบียน">${r.regs}</td>
      <td data-label="เข้าอบรม">${pct(r.att,r.regs)}</td>
      <td data-label="ประเมิน">${r.sv!=null?r.sv.toFixed(2):'—'}<span style="font-size:11px;color:var(--text-muted);"> (${r.svN})</span></td>
      <td data-label="สอบผ่าน">${r.qN?`${r.qPass}/${r.qN}`:'—'}</td>
    </tr>`;
  }).join('');
  const table=`<div class="card"><div class="card-header"><div class="card-title"><i class="ti ti-list-details"></i>รายโครงการ</div>
      <span style="font-size:12px;color:var(--text-muted);">กดแถวเพื่อเปิดการอบรมของโครงการ</span></div>
    <div class="table-wrap table-cards"><table>
      <thead><tr><th>โครงการ</th><th>สถานะ</th><th>รอบ (จัดแล้ว/ทั้งหมด)</th><th>รอบถัดไป</th><th>ลงทะเบียน</th><th>เข้าอบรม${calcTip("เข้าอบรม ÷ ลงทะเบียน × 100")}</th><th>ประเมิน (/5)${calcTip("ค่าเฉลี่ยคะแนนทุกข้อของแบบประเมินโครงการนี้ · (n) = จำนวนแบบประเมิน")}</th><th>สอบผ่าน${calcTip("ครั้งที่สอบผ่าน / ครั้งที่ส่งคำตอบทั้งหมด")}</th></tr></thead>
      <tbody>${tr}</tbody></table></div></div>`;

  const locByCode=Object.fromEntries(locations.map(l=>[l.code,l]));
  const up=`<div class="card"><div class="card-header"><div class="card-title"><i class="ti ti-calendar-event"></i>รอบอบรม 14 วันข้างหน้า</div></div>
    ${upcoming.length?`<div class="table-wrap table-cards"><table><thead><tr><th>วันที่</th><th>เวลา</th><th>โครงการ</th><th>หัวข้อ</th><th>ลงทะเบียน</th></tr></thead><tbody>
      ${upcoming.map(s=>{const l=locByCode[s.site]||{};const n=nRegs(s.id);
        return`<tr style="cursor:pointer;" onclick="_ovOpen('${_esc(l.project_id||'')}')">
          <td data-label="วันที่" style="white-space:nowrap;">${fmtDateShort(s.date)}</td>
          <td data-label="เวลา" style="white-space:nowrap;">${s.time_start||''}–${s.time_end||''}</td>
          <td data-label="โครงการ">${_esc(l.name||s.site)}</td>
          <td class="tc-title" data-label="หัวข้อ">${_esc((cats.find(c=>c.id===s.cat_id)||{}).name||'')} · ${_esc(s.name)}</td>
          <td data-label="ลงทะเบียน">${n}/${s.capacity||'-'}</td></tr>`;}).join('')}
    </tbody></table></div>`:'<div style="text-align:center;padding:16px;color:var(--text-muted);">ไม่มีรอบอบรมใน 14 วันข้างหน้า</div>'}</div>`;

  // Admin: โครงการที่กำลังทำแต่ยังไม่เปิดอบรม
  const linked=new Set(locations.map(l=>l.project_id).filter(Boolean));
  const notOpened=isSup?(ipR.data||[]).filter(p=>!linked.has(p.id)&&!['done','cancelled'].includes(p.status)):[];

  el.innerHTML=_ovTodo({sess,cats,rows,locByCode,notOpened,today,regOf})+kpi+table+up;
}
/* ── ต้องจัดการ: เรื่องที่ต้องลงมือ (บนสุดของภาพรวม) — กดรายการ → แท็บอบรมของโครงการ ── */
const OV_TODO={lowRegDays:3,lowRegPct:.5,lowSurvey:3.5,minSurveyN:3,lowPass:.7,minQuizN:5};
function _ovTodo({sess,cats,rows,locByCode,notOpened,today,regOf}){
  const items=[]; // {sev:'danger'|'warn', icon, title, sub, pid}
  const dayDiff=d=>Math.round((new Date(d+'T00:00:00')-new Date(today+'T00:00:00'))/864e5);
  const sessLabel=s=>[(cats.find(c=>c.id===s.cat_id)||{}).name,s.name].filter(Boolean).join(' · ');
  for(const s of sess){
    const l=locByCode[s.site]||{};
    const rg=regOf[s.id]||{n:0,att:0};
    const dd=dayDiff(s.date);
    if(dd>=0&&dd<=OV_TODO.lowRegDays&&s.capacity>0&&rg.n<s.capacity*OV_TODO.lowRegPct)
      items.push({sev:dd<=1?'danger':'warn',icon:'users-minus',pid:l.project_id,
        title:`คนลงทะเบียนน้อย — ${dd===0?'วันนี้':dd===1?'พรุ่งนี้':`อีก ${dd} วัน`} (${fmtDateShort(s.date)})`,
        sub:`${_esc(l.name||s.site)} · ${_esc(sessLabel(s))} · ลงทะเบียน ${rg.n}/${s.capacity} คน`});
    else if(dd<0&&rg.n&&!rg.att)
      items.push({sev:'warn',icon:'checklist',pid:l.project_id,
        title:`ยังไม่เช็คชื่อเข้าอบรม — รอบ ${fmtDateShort(s.date)}`,
        sub:`${_esc(l.name||s.site)} · ${_esc(sessLabel(s))} · มีผู้ลงทะเบียน ${rg.n} คน แต่ยังไม่มีใครถูกเช็คชื่อ`});
  }
  for(const r of rows){
    if(r.svN>=OV_TODO.minSurveyN&&r.sv<OV_TODO.lowSurvey)
      items.push({sev:'danger',icon:'mood-sad',pid:r.l.project_id,
        title:`คะแนนประเมินต่ำ — ${r.sv.toFixed(2)} จาก 5`,
        sub:`${_esc(r.l.name)} · จาก ${r.svN} แบบประเมิน · ควรดูความเห็นเรื่องวิทยากร/เนื้อหา`});
    if(r.qN>=OV_TODO.minQuizN&&r.qPass/r.qN<OV_TODO.lowPass)
      items.push({sev:'warn',icon:'school-off',pid:r.l.project_id,
        title:`สอบผ่านน้อย — ${Math.round(r.qPass/r.qN*100)}%`,
        sub:`${_esc(r.l.name)} · ผ่าน ${r.qPass}/${r.qN} ครั้ง · อาจต้องจัดอบรมซ้ำ`});
  }
  items.sort((a,b)=>(a.sev==='danger'?0:1)-(b.sev==='danger'?0:1));
  const list=items.map(it=>`<div class="ov-todo-item ${it.sev}" onclick="_ovOpen('${_esc(it.pid||'')}')" title="เปิดแท็บอบรมของโครงการ">
      <i class="ti ti-${it.icon}"></i><div class="ov-todo-body"><div class="ov-todo-title">${it.title}</div><div class="ov-todo-sub">${it.sub}</div></div></div>`).join('')
    // ซ่อนรายชื่อไว้ก่อน (มักมีหลายโครงการ) — กดหัวข้อเพื่อเปิดดู
    +(notOpened.length?`<details class="ov-todo-item info ov-todo-fold"><summary><i class="ti ti-alert-circle"></i>
      <span class="ov-todo-title">โครงการที่กำลังทำแต่ยังไม่เปิดอบรม (${notOpened.length})</span>
      <span class="ov-todo-more"><span class="o">แสดง</span><span class="c">ซ่อน</span><i class="ti ti-chevron-down"></i></span></summary>
      <div class="ov-todo-list">${notOpened.map(p=>`<button class="btn btn-ghost btn-sm" onclick="_ovOpen('${_esc(p.id)}')">${_esc(p.project_name||p.id)}</button>`).join('')}</div></details>`:'');
  const n=items.length+(notOpened.length?1:0);
  return `<div class="card"><div class="card-header"><div class="card-title"><i class="ti ti-bell-exclamation"></i>ต้องจัดการ${n?` (${n})`:''}</div>
      ${n?'<span style="font-size:12px;color:var(--text-muted);">กดรายการเพื่อเปิดการอบรมของโครงการ</span>':''}</div>
    ${n?`<div class="ov-todo">${list}</div>`:'<div class="ov-todo-ok"><i class="ti ti-circle-check"></i>ไม่มีเรื่องต้องจัดการตอนนี้</div>'}</div>`;
}
// เปิดแท็บ "🎓 อบรม" ของโครงการในติดตามสถานะโครงการ (Backoffice)
function _ovOpen(projectId){
  if(!projectId){showToast('โครงการนี้ยังไม่ผูกกับโครงการในติดตามสถานะโครงการ','warn');return;}
  if(EMBED&&window.parent.trnOpenProject)window.parent.trnOpenProject(projectId);
  else location.href=`${location.pathname}?project=${encodeURIComponent(projectId)}&admin=1`;
}
/* ══════════════════ ตั้งค่าโครงการ (แท็บย่อย projsettings) ══════════════════
   ค่าของโครงการปัจจุบันเท่านั้น: บังคับกรอกอีเมล · Token แจ้งเตือนเมื่อมีคนลงทะเบียน · ปิดอบรม
   ผู้ที่เข้าแท็บอบรมได้ (Admin / PM / ทีม) แก้ 2 อย่างแรกได้ · ปิดอบรม = Admin หรือสิทธิ์ "ลบ" ของอบรม */
const _canCloseTraining=()=>!currentAdminUser||currentAdminUser.role==='superadmin'||!!currentAdminUser.perm?.del;
function renderProjSettings(){
  const el=document.getElementById('projsettings-content');
  if(!el)return;
  const loc=locations.find(l=>l.code===currentSite);
  if(!loc){el.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-muted);">ยังไม่ได้เลือกโครงการ</div>';return;}
  const cur=siteNotifyTokens[loc.code]||'';
  const mode=cur===NOTIFY_OFF?'off':cur?'own':'global';
  const opt=(val,label)=>`<label class="ps-radio"><input type="radio" name="ps-notify-mode" value="${val}" ${mode===val?'checked':''} onchange="onNotifyModeChange()"><span>${label}</span></label>`;
  const row=(icon,title,desc,ctrl)=>`<div class="ps-row"><div class="ps-text"><div class="ps-title"><i class="ti ti-${icon}"></i>${title}</div><div class="ps-desc">${desc}</div></div><div class="ps-ctrl">${ctrl}</div></div>`;
  el.innerHTML=`
    <div class="card">
      <div class="card-header"><div class="card-title"><i class="ti ti-adjustments"></i>ตั้งค่าโครงการ</div>
        <span style="font-size:12px;color:var(--text-muted);">${_esc(loc.name)} · รหัส <code>${_esc(loc.code)}</code></span></div>
      ${row('mail','บังคับกรอกอีเมล','ผู้เข้าอบรมต้องกรอกอีเมลตอนลงทะเบียน (เฉพาะโครงการนี้)',
        `<label class="ps-switch"><input type="checkbox" ${loc.require_email?'checked':''} onchange="toggleRequireEmail(this.checked)"><span></span></label>`)}
      ${row('bell-ringing','แจ้งเตือนเมื่อมีคนลงทะเบียน','ส่งแจ้งเตือนผ่าน <a href="https://api-notify.bmscloud.in.th" target="_blank" rel="noopener" style="color:var(--primary);">BMS Notify</a> ทุกครั้งที่มีผู้ลงทะเบียนใหม่ · ปกติใช้ Token กลางที่ตั้งใน Backoffice › Admin Panel › 🔔 ตั้งค่าการแจ้งเตือน (ทุกโครงการเข้ากลุ่มเดียวกัน)<br>'
          +(globalNotifyToken?'<span style="color:var(--success,#16a34a);"><i class="ti ti-circle-check"></i> ตั้ง Token กลางไว้แล้ว</span>':'<span style="color:var(--danger);"><i class="ti ti-alert-triangle"></i> ยังไม่ได้ตั้ง Token กลาง — โครงการที่เลือก "ใช้ Token กลาง" จะไม่แจ้งเตือน</span>'),
        `${opt('global','ใช้ Token กลางของระบบ')}${opt('own','ใช้ Token เฉพาะโครงการนี้')}${opt('off','ไม่แจ้งเตือน')}
         <input class="form-control" id="ps-token" value="${mode==='own'?_esc(cur):''}" placeholder="วาง Token เฉพาะโครงการนี้..." style="font-family:monospace;font-size:13px;margin-top:6px;${mode==='own'?'':'display:none;'}">
         <div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end;">
           <button class="btn btn-ghost btn-sm" onclick="testNotifyToken()"><i class="ti ti-send"></i>ทดสอบ</button>
           <button class="btn btn-primary btn-sm" onclick="saveNotifyToken()"><i class="ti ti-device-floppy"></i>บันทึก</button>
         </div>`)}
    </div>
    ${_canCloseTraining()?`<div class="card ps-danger">
      ${row('alert-triangle','ปิดอบรมของโครงการนี้','ผู้เข้าอบรมจะเปิดลิงก์ลงทะเบียน/แบบประเมินไม่ได้ · ข้อมูลรอบอบรม/ผู้ลงทะเบียน/ผลประเมินไม่ถูกลบ',
        '<button class="btn btn-danger btn-sm" onclick="closeTraining()"><i class="ti ti-power"></i>ปิดอบรม</button>')}
    </div>`:''}`;
}
async function toggleRequireEmail(checked){
  const loc=locations.find(l=>l.code===currentSite);if(!loc)return;
  const {error}=await _sb.from('trn_sites').update({require_email:checked}).eq('id',loc.id);
  if(error){showToast('บันทึกไม่สำเร็จ','danger');renderProjSettings();return;}
  loc.require_email=checked;
  showToast(checked?'เปิดบังคับกรอกอีเมลแล้ว':'ปิดบังคับกรอกอีเมลแล้ว','success');
}
const _notifyMode=()=>document.querySelector('input[name="ps-notify-mode"]:checked')?.value||'global';
function onNotifyModeChange(){
  const inp=document.getElementById('ps-token');
  if(inp)inp.style.display=_notifyMode()==='own'?'':'none';
}
// ค่าทับทุกโครงการเก็บรวมใน trn_settings.site_notify_tokens — อ่านค่าล่าสุดก่อนบันทึก กันทับค่าของโครงการอื่นที่เพิ่งแก้
async function saveNotifyToken(){
  const mode=_notifyMode();
  const token=(document.getElementById('ps-token')?.value||'').trim();
  if(mode==='own'&&!token){showToast('กรุณาระบุ Token เฉพาะโครงการ','warn');return;}
  const {data,error:rErr}=await _sb.from('trn_settings').select('value').eq('key','site_notify_tokens').maybeSingle();
  if(rErr){showToast('บันทึกไม่สำเร็จ: '+rErr.message,'danger');return;}
  let map={};try{map=JSON.parse(data?.value||'{}');}catch(e){}
  if(mode==='own')map[currentSite]=token;
  else if(mode==='off')map[currentSite]=NOTIFY_OFF;
  else delete map[currentSite];
  const {error}=await _sb.from('trn_settings').upsert({key:'site_notify_tokens',value:JSON.stringify(map),updated_at:new Date().toISOString()});
  if(error){showToast('บันทึกไม่สำเร็จ: '+error.message,'danger');return;}
  siteNotifyTokens=map;
  showToast(mode==='own'?'บันทึกแล้ว — ใช้ Token เฉพาะโครงการนี้':mode==='off'?'บันทึกแล้ว — โครงการนี้จะไม่แจ้งเตือน':'บันทึกแล้ว — ใช้ Token กลางของระบบ','success');
  renderProjSettings();
}
async function closeTraining(){
  const loc=locations.find(l=>l.code===currentSite);if(!loc||!_canCloseTraining())return;
  if(!await showConfirm(`ปิดอบรมของ "${loc.name}"?`,'ข้อมูลรอบอบรม/ผู้ลงทะเบียน/ผลประเมินไม่ถูกลบ · เปิดอบรมใหม่ได้ที่แท็บอบรมของโครงการ',{okLabel:'ปิดอบรม',danger:true}))return;
  const {error}=await _sb.from('trn_sites').delete().eq('id',loc.id);
  if(error){showToast('ปิดอบรมไม่สำเร็จ','danger');return;}
  showToast(`ปิดอบรมของ "${loc.name}" แล้ว`,'success');
  setLoading(true);
  try{await loadAllData();}catch(e){console.error(e);}
  setLoading(false);
  _syncSiteUI();
  showPage(PROJECT_ID?'unopened':'admin');
}

/* ══════════════════ สิทธิ์ ══════════════════
   ตั้งที่หน้าสิทธิ์การใช้งานของ Backoffice ที่เดียว (แถว "อบรม / แบบทดสอบ" — bo-auth.service.js อ่านมาเป็น currentAdminUser.perm)
   · ทุก Role ที่ "ดู" ได้ = ทุกแท็บของโครงการ (รวมตั้งค่าโครงการ) · Admin สลับโครงการได้ทุกโครงการ
   · นำเข้าข้อมูล = "เพิ่ม" · เคลียร์ข้อมูลตามโครงการ / ปิดอบรม = "ลบ" */
const ACTION_PERM={'action:import':'add','action:clear_regs':'del','action:clear_survey':'del'};
function getMyAllowedTabs(){
  const all=ADMIN_TABS.map(t=>t.id);
  // เมนูอบรม (ภาพรวม) ไม่มีหน้าผู้ดูแล — ทุกอย่างจัดการในแท็บอบรมของโครงการ
  return OVERVIEW?[]:all;
}
function hasAdminAction(actionId){
  if(OVERVIEW)return false; // นำเข้า/เคลียร์ข้อมูลทำในแท็บอบรมของโครงการ
  if(!currentAdminUser||currentAdminUser.role==='superadmin')return true;
  return !!(currentAdminUser.perm&&currentAdminUser.perm[ACTION_PERM[actionId]]);
}

function _applyAdminTabVisibility(){
  const allowed=new Set(getMyAllowedTabs());
  let firstAllowed=null;
  let activeIsHidden=false;
  document.querySelectorAll('.admin-tab[data-tab]').forEach(btn=>{
    const tab=btn.dataset.tab;
    const show=allowed.has(tab);
    btn.style.display=show?'':'none';
    if(show&&!firstAllowed)firstAllowed=tab;
    if(btn.classList.contains('active')&&!show)activeIsHidden=true;
  });
  // apply action button visibility
  ADMIN_ACTIONS.forEach(a=>{
    const el=document.getElementById(a.btnId);
    if(el)el.style.display=hasAdminAction(a.id)?'':'none';
  });
  if(activeIsHidden&&firstAllowed)switchAdminTab(firstAllowed);
}

async function testNotifyToken(){
  const mode=_notifyMode();
  if(mode==='off'){showToast('เลือก "ไม่แจ้งเตือน" อยู่ — ไม่มีอะไรให้ทดสอบ','warn');return;}
  const token=mode==='own'?(document.getElementById('ps-token')?.value||'').trim():globalNotifyToken;
  if(!token){showToast(mode==='own'?'กรุณาระบุ Token ก่อน':'ยังไม่ได้ตั้ง Token กลางที่ Admin Panel ของ Backoffice','warn');return;}
  const siteCode=currentSite;
  const loc=locations.find(l=>l.code===siteCode);
  try{
    const res=await fetch('https://api-notify.bmscloud.in.th/api/v1/push-notify',{
      method:'POST',
      headers:{'Token':token,'Content-Type':'application/json'},
      body:JSON.stringify({content:`🔔 ทดสอบการแจ้งเตือน\n🏢 โครงการ: ${loc?.name||siteCode}`,receiver:null})
    });
    if(res.ok)showToast('ส่งทดสอบสำเร็จ — ตรวจสอบ Line ของคุณ','success');
    else showToast('ส่งไม่สำเร็จ (status '+res.status+')','danger');
  }catch(e){showToast('เชื่อมต่อไม่ได้: '+e.message,'danger');}
}

/* ══ LOGIN VERIFY ══ */
const _LV_STATUS=[
  {value:'has_login',label:'มี Login แล้ว',bg:'#dcfce7',c:'#166534',icon:'circle-check'},
  {value:'no_login', label:'ไม่มี Login',  bg:'#fef3c7',c:'#92400e',icon:'alert-triangle'},
  {value:'disabled', label:'ปิดการใช้งาน',bg:'#fee2e2',c:'#991b1b',icon:'ban'},
  {value:'pending',  label:'ยังไม่ระบุสถานะ',bg:'#f1f5f9',c:'#64748b',icon:'help-circle'},
];
function _lvKey(fname,lname,dept){return`${fname}|${lname}|${dept}`;}
function _lvGetVal(fname,lname,dept,field,def){
  const k=_lvKey(fname,lname,dept);
  if(_lvEdits[k]&&_lvEdits[k][field]!==undefined)return _lvEdits[k][field];
  const d=loginVerifyData.find(x=>x.fname===fname&&x.lname===lname&&x.dept===dept);
  return d?.[field]??def;
}
function _lvOnChange(key,field,value){
  if(!_lvEdits[key])_lvEdits[key]={};
  _lvEdits[key][field]=value;
  if(field==='login_status'){
    const sel=document.querySelector(`select[data-lv-key="${encodeURIComponent(key)}"]`);
    if(sel)_applyLvSelColor(sel);
    const sfVal=document.getElementById('lv-status-filter')?.value||'';
    if(sfVal&&value!==sfVal){
      const tr=document.querySelector(`tr[data-lv-row="${encodeURIComponent(key)}"]`);
      if(tr)tr.style.display='none';
    }
  }
}
function _applyLvSelColor(sel){
  const st=_LV_STATUS.find(s=>s.value===sel.value)||_LV_STATUS[3];
  sel.style.background=st.bg;sel.style.color=st.c;sel.style.fontWeight='600';sel.style.borderColor=st.c+'44';
}
function renderLoginVerify(){
  const tbody=document.getElementById('lv-tbody');if(!tbody)return;
  const q=(document.getElementById('lv-search')?.value||'').toLowerCase();
  const sf=document.getElementById('lv-status-filter')?.value||'';
  // Build unique persons map from registrations of current site only
  const seen=new Map();
  registrations.filter(r=>!!getSess(r.sessionId)).forEach(r=>{
    const k=_lvKey(r.fname,r.lname,r.dept);
    if(!seen.has(k))seen.set(k,{fname:r.fname,lname:r.lname,dept:r.dept,position:r.position||'',email:r.email||''});
    else if(!seen.get(k).email&&r.email)seen.get(k).email=r.email; // เติม email จากรอบอื่นที่มีข้อมูล ถ้ารอบแรกที่เจอไม่มี
  });
  const allPersons=Array.from(seen.values());
  // สรุปจำนวนคนตามสถานะ (นับจากทุกคน ไม่ผูกกับตัวกรองค้นหา) — คลิกที่ป้ายเพื่อกรองตามสถานะนั้นได้เลย
  const summaryEl=document.getElementById('lv-summary');
  if(summaryEl){
    const counts={};_LV_STATUS.forEach(s=>counts[s.value]=0);
    allPersons.forEach(p=>{const st=_lvGetVal(p.fname,p.lname,p.dept,'login_status','pending');counts[st]=(counts[st]||0)+1;});
    const pill=(label,icon,bg,c,val,active)=>`<span onclick="document.getElementById('lv-status-filter').value='${val}';renderLoginVerify();"
      style="cursor:pointer;display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:600;background:${bg};color:${c};${active?`box-shadow:0 0 0 2px ${c} inset;`:''}">
      <i class="ti ti-${icon}"></i>${label} ${val===''?allPersons.length:counts[val]||0}</span>`;
    summaryEl.innerHTML=pill('ทั้งหมด','users','var(--primary-light)','var(--primary)','',!sf)
      +_LV_STATUS.map(s=>pill(s.label,s.icon,s.bg,s.c,s.value,sf===s.value)).join('');
  }
  let persons=allPersons;
  if(q)persons=persons.filter(p=>`${p.fname}${p.lname}${p.dept}`.toLowerCase().includes(q));
  if(sf)persons=persons.filter(p=>_lvGetVal(p.fname,p.lname,p.dept,'login_status','pending')===sf);
  if(!persons.length){
    tbody.innerHTML='<tr><td colspan="5"><div class="empty"><i class="ti ti-users-minus"></i><p>ไม่พบรายชื่อ</p></div></td></tr>';
    return;
  }
  tbody.innerHTML=persons.map((p,i)=>{
    const k=_lvKey(p.fname,p.lname,p.dept);
    const ek=encodeURIComponent(k);
    const status=_lvGetVal(p.fname,p.lname,p.dept,'login_status','pending');
    const notes=_lvGetVal(p.fname,p.lname,p.dept,'notes','');
    const opts=_LV_STATUS.map(s=>`<option value="${s.value}"${status===s.value?' selected':''}>${s.label}</option>`).join('');
    return`<tr data-lv-row="${ek}">
      <td class="tc-hide" data-label="#" style="color:var(--text-muted);">${i+1}</td>
      <td class="tc-title" data-label="ชื่อ-นามสกุล">
        <div style="font-weight:600;">${p.fname} ${p.lname}</div>
        ${p.email?`<div style="font-size:11px;font-weight:400;color:var(--text-muted);"><i class="ti ti-mail" style="font-size:11px;"></i> ${p.email}</div>`:''}
      </td>
      <td data-label="ตำแหน่ง/หน่วยงาน">
        <div style="font-size:13px;">${p.position||'-'}</div>
        <div style="font-size:11px;color:var(--text-muted);">${p.dept}</div>
      </td>
      <td data-label="สถานะ Login">
        <select class="form-control" data-lv-key="${ek}" data-lv-field="status"
          onchange="_lvOnChange(decodeURIComponent(this.dataset.lvKey),'login_status',this.value);_applyLvSelColor(this)"
          style="height:34px;font-size:13px;">
          ${opts}
        </select>
      </td>
      <td data-label="หมายเหตุ">
        <input class="form-control" data-lv-key="${ek}" data-lv-field="notes"
          value="${(notes+'').replace(/"/g,'&quot;')}"
          placeholder="ระบุหมายเหตุ..."
          oninput="_lvOnChange(decodeURIComponent(this.dataset.lvKey),'notes',this.value)"
          style="font-size:13px;height:34px;">
      </td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('select[data-lv-field="status"]').forEach(_applyLvSelColor);
}
async function saveLoginVerifyAll(){
  // Build full unique-person map from current site's registrations only
  const seen=new Map();
  registrations.filter(r=>!!getSess(r.sessionId)).forEach(r=>{
    const k=_lvKey(r.fname,r.lname,r.dept);
    if(!seen.has(k))seen.set(k,{fname:r.fname,lname:r.lname,dept:r.dept,deptId:r.deptId,position:r.position||''});
  });
  // Collect current DOM values (may be filtered subset)
  const domMap={};
  document.querySelectorAll('select[data-lv-field="status"]').forEach(sel=>{
    const k=decodeURIComponent(sel.dataset.lvKey);
    const notesEl=document.querySelector(`input[data-lv-key="${sel.dataset.lvKey}"][data-lv-field="notes"]`);
    domMap[k]={login_status:sel.value,notes:notesEl?notesEl.value.trim():''};
    _lvEdits[k]=domMap[k];
  });
  // Build rows for all unique persons
  const rows=[];
  seen.forEach((p,k)=>{
    const status=domMap[k]?.login_status||_lvGetVal(p.fname,p.lname,p.dept,'login_status','pending');
    const notes=domMap[k]?.notes??_lvGetVal(p.fname,p.lname,p.dept,'notes','');
    rows.push({fname:p.fname,lname:p.lname,dept_id:p.deptId,position:p.position,login_status:status,notes:notes||'',site:currentSite});
  });
  if(!rows.length){showToast('ไม่มีข้อมูลให้บันทึก','warn');return;}
  const btn=document.getElementById('lv-save-btn');
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader-2" style="animation:spin .8s linear infinite"></i>กำลังบันทึก...';}
  try{
    const {error}=await _sb.from('trn_login_verify').upsert(rows,{onConflict:'fname,lname,dept_id,site'});
    if(error)throw error;
    const {data}=await _sb.from('trn_login_verify').select('*').eq('site',currentSite);
    loginVerifyData=(data||[]).map(_mDeptRow);
    _lvEdits={};
    showToast(`บันทึกสถานะ ${rows.length} รายการสำเร็จ`,'success');
    renderLoginVerify();
  }catch(e){showToast('บันทึกไม่สำเร็จ: '+e.message,'danger');}
  if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-device-floppy"></i>บันทึกสถานะ';}
}
async function loadLoginVerify(){
  const {data}=await _sb.from('trn_login_verify').select('*').eq('site',currentSite);
  loginVerifyData=(data||[]).map(_mDeptRow);
  _lvEdits={};
  renderLoginVerify();
  showToast('โหลดข้อมูลใหม่แล้ว','success');
}

/* ══ KEY ENTRY STATUS (ตรวจสอบคีย์ยอด) — รายแผนกของโครงการที่ล็อกอินอยู่ ══ */
async function loadKeyEntryStatus(){
  const {data,error}=await _sb.from('trn_key_entry_status').select('*').eq('site',currentSite);
  if(error){showToast('โหลดข้อมูลคีย์ยอดไม่สำเร็จ: '+error.message,'danger');return;}
  keyEntryData=(data||[]).map(_mDeptRow);
  renderKeyEntry();
}
function filterKeyEntry(){
  keSearchTxt=(document.getElementById('ke-search')?.value||'').toLowerCase();
  renderKeyEntry();
}
function renderKeyEntry(){
  const tbody=document.getElementById('ke-tbody');if(!tbody)return;
  let rows=departments.map(dept=>{
    const k=keyEntryData.find(x=>x.dept===dept);
    return{dept,status:k?.status||'not_keyed',keyed_at:k?.keyed_at||null,reason:k?.reason||''};
  });
  const total=rows.length;
  const keyed=rows.filter(r=>r.status==='keyed').length;
  const notKeyed=total-keyed;
  const pct=total?Math.round(keyed/total*100):0;
  const setTxt=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  setTxt('ke-stat-total',total);
  setTxt('ke-stat-keyed',keyed);
  setTxt('ke-stat-notkeyed',notKeyed);
  setTxt('ke-stat-pct',pct+'%');
  const bar=document.getElementById('ke-progress-bar');if(bar)bar.style.width=pct+'%';

  if(keSearchTxt)rows=rows.filter(r=>r.dept.toLowerCase().includes(keSearchTxt));
  if(!rows.length){
    tbody.innerHTML='<tr><td colspan="4"><div class="empty"><i class="ti ti-building-off"></i><p>ไม่พบแผนก กรุณาเพิ่มในเมนู "ข้อมูลพื้นฐาน"</p></div></td></tr>';
    return;
  }
  tbody.innerHTML=rows.map(r=>{
    const ek=encodeURIComponent(r.dept);
    const isKeyed=r.status==='keyed';
    const dt=r.keyed_at?new Date(r.keyed_at).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}):'-';
    return`<tr>
      <td class="tc-title" data-label="แผนก" style="font-weight:600;">${r.dept}</td>
      <td data-label="สถานะ">
        <select class="form-control ke-select" data-ke-dept="${ek}"
          onchange="_keOnStatusChange(decodeURIComponent(this.dataset.keDept),this.value)"
          style="font-weight:600;${isKeyed?'background:var(--success-light);color:#065f46;':'background:var(--warn-light);color:#9a3412;'}">
          <option value="not_keyed"${!isKeyed?' selected':''}>ยังไม่คีย์</option>
          <option value="keyed"${isKeyed?' selected':''}>คีย์ยอดแล้ว</option>
        </select>
      </td>
      <td data-label="วันที่/เวลาคีย์ยอด" style="font-size:13px;color:${isKeyed?'var(--text)':'var(--text-muted)'};">${dt}</td>
      <td data-label="สาเหตุที่ยังไม่คีย์">
        <input class="form-control ke-input" data-ke-dept="${ek}" value="${(r.reason+'').replace(/"/g,'&quot;')}"
          placeholder="${isKeyed?'-':'ระบุสาเหตุ...'}" ${isKeyed?'disabled':''}
          oninput="_keOnReasonInput(decodeURIComponent(this.dataset.keDept),this.value)">
      </td>
    </tr>`;
  }).join('');
}
async function _keUpsert(payload){
  const {data,error}=await _sb.from('trn_key_entry_status').upsert(payload,{onConflict:'dept_id,site'}).select().single();
  if(error){showToast('บันทึกไม่สำเร็จ: '+error.message,'danger');return null;}
  const row=_mDeptRow(data);
  const idx=keyEntryData.findIndex(k=>k.dept_id===row.dept_id&&k.site===row.site);
  if(idx>=0)keyEntryData[idx]=row;else keyEntryData.push(row);
  return row;
}
// dept = ชื่อแผนก (แถวในตาราง = รายการแผนกของโครงการ) → เก็บเป็นรหัสแผนก
async function _keOnStatusChange(dept,status){
  const existing=keyEntryData.find(k=>k.dept===dept);
  const payload={
    dept_id:_mId('dept',dept),
    site:currentSite,
    status,
    keyed_at: status==='keyed' ? new Date().toISOString() : null,
    reason: status==='keyed' ? '' : (existing?.reason||''),
    updated_at: new Date().toISOString(),
  };
  const saved=await _keUpsert(payload);
  renderKeyEntry();
  if(saved)showToast(status==='keyed'?'บันทึกสถานะคีย์ยอดแล้ว':'อัปเดตสถานะแล้ว','success');
}
function _keOnReasonInput(dept,value){
  clearTimeout(_keReasonTimers[dept]);
  _keReasonTimers[dept]=setTimeout(async()=>{
    const existing=keyEntryData.find(k=>k.dept===dept);
    await _keUpsert({
      dept_id:_mId('dept',dept),
      site:currentSite,
      status:existing?.status||'not_keyed',
      keyed_at:existing?.keyed_at||null,
      reason:value,
      updated_at:new Date().toISOString(),
    });
  },600);
}
async function saveKeyEntryImage(){
  if(!await _needLib('html2canvas'))return;
  const total=departments.length;
  const keyedDepts=departments.filter(d=>keyEntryData.find(k=>k.dept===d)?.status==='keyed');
  const notKeyedDepts=departments.filter(d=>keyEntryData.find(k=>k.dept===d)?.status!=='keyed');
  const keyed=keyedDepts.length;
  const notKeyed=notKeyedDepts.length;
  const pct=total?Math.round(keyed/total*100):0;
  const today=new Date().toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});
  const loc=locations.find(l=>l.code===currentSite);
  const siteLabel=loc?loc.name:currentSite;

  // สรุปรายวัน: จำนวนแผนกที่คีย์ยอดในแต่ละวัน (เรียงตามวันที่)
  const _localKey=dt=>`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  const dailyMap={};
  keyedDepts.forEach(d=>{
    const k=keyEntryData.find(x=>x.dept===d);
    if(!k?.keyed_at)return;
    const dt=new Date(k.keyed_at);
    const key=_localKey(dt);
    if(!dailyMap[key])dailyMap[key]={label:dt.toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'numeric'}),count:0};
    dailyMap[key].count++;
  });
  const dailyRows=Object.keys(dailyMap).sort().map(k=>dailyMap[k]);

  // แผนกที่ยังไม่คีย์ยอด แยกเป็น "ไม่มีสาเหตุ" กับ "มีสาเหตุ"
  const noReasonDepts=[];
  const hasReasonDepts=[];
  notKeyedDepts.forEach(d=>{
    const reason=(keyEntryData.find(x=>x.dept===d)?.reason||'').trim();
    if(reason)hasReasonDepts.push({dept:d,reason});
    else noReasonDepts.push(d);
  });

  const wrap=document.createElement('div');
  wrap.setAttribute('data-theme','light'); // ภาพที่ส่งออกพื้นสว่างเสมอ แม้หน้าจอเป็นโหมดมืด
  wrap.style.cssText='position:fixed;left:-9999px;top:0;width:720px;font-family:"Noto Sans Thai","Plus Jakarta Sans",sans-serif;';
  wrap.innerHTML=`
  <div style="background:linear-gradient(135deg,#0f2d5c 0%,#1a56a0 55%,#0e7490 100%);padding:36px 32px;color:#fff;">
    <div style="font-size:13px;letter-spacing:1px;opacity:.75;text-transform:uppercase;">BMS Training System — ${siteLabel}</div>
    <div style="font-size:24px;font-weight:700;margin-top:6px;">สรุปความคืบหน้าคีย์ยอดตั้งต้น</div>
    <div style="font-size:13px;opacity:.8;margin-top:4px;">ข้อมูล ณ วันที่ ${today}</div>
  </div>
  <div style="background:var(--card);padding:28px 32px;">
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:22px;">
      <div style="background:#EFF6FF;border-radius:14px;padding:18px;text-align:center;">
        <div style="font-size:32px;font-weight:700;color:#2563EB;">${total}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">แผนกทั้งหมด</div>
      </div>
      <div style="background:#ECFDF5;border-radius:14px;padding:18px;text-align:center;">
        <div style="font-size:32px;font-weight:700;color:#059669;">${keyed}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">คีย์ยอดแล้ว</div>
      </div>
      <div style="background:#FEF2F2;border-radius:14px;padding:18px;text-align:center;">
        <div style="font-size:32px;font-weight:700;color:#DC2626;">${notKeyed}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">ยังไม่คีย์</div>
      </div>
    </div>
    <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px;display:flex;justify-content:space-between;">
      <span>ความคืบหน้ารวม</span><span style="color:#059669;">${pct}%</span>
    </div>
    <div style="background:var(--surface3);border-radius:20px;height:18px;overflow:hidden;">
      <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#10B981,#059669);border-radius:20px;"></div>
    </div>

    <div style="margin-top:26px;">
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:10px;">📅 สรุปรายวัน (แผนกที่คีย์ยอดแล้ว)</div>
      ${dailyRows.length?`
      <div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;">
        ${dailyRows.map((r,i)=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;${i%2?'background:var(--bg-subtle);':''}${i<dailyRows.length-1?'border-bottom:1px solid var(--surface3);':''}">
          <span style="font-size:13px;color:var(--text-secondary);">${r.label}</span>
          <span style="font-size:13px;font-weight:700;color:#059669;">${r.count} แผนก</span>
        </div>`).join('')}
      </div>`:`<div style="font-size:13px;color:var(--text-muted);text-align:center;padding:14px;border:1px dashed var(--border);border-radius:12px;">ยังไม่มีแผนกคีย์ยอด</div>`}
    </div>

    <div style="margin-top:22px;">
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:10px;">⚠️ แผนกที่ยังไม่คีย์ยอด (${notKeyed} แผนก)</div>
      ${!notKeyedDepts.length?`<div style="font-size:13px;color:var(--text-muted);text-align:center;padding:14px;border:1px dashed var(--border);border-radius:12px;">คีย์ยอดครบทุกแผนกแล้ว 🎉</div>`:`
      <div style="font-size:12px;font-weight:700;color:#9A3412;margin:4px 0 8px;">🔸 ยังไม่มีสาเหตุ (${noReasonDepts.length} แผนก)</div>
      ${noReasonDepts.length?`
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${noReasonDepts.map(d=>`<span style="background:#FEF2F2;color:#991B1B;font-size:12px;font-weight:600;padding:6px 12px;border-radius:20px;border:1px solid #FEE2E2;">${d}</span>`).join('')}
      </div>`:`<div style="font-size:12px;color:var(--text-muted);padding:2px 0 4px;">- ไม่มี -</div>`}

      <div style="font-size:12px;font-weight:700;color:#9A3412;margin:18px 0 8px;">🔸 มีสาเหตุแล้ว (${hasReasonDepts.length} แผนก)</div>
      ${hasReasonDepts.length?`
      <div style="border:1px solid #FDE68A;border-radius:12px;overflow:hidden;">
        ${hasReasonDepts.map((x,i)=>`
        <div style="padding:10px 14px;${i%2?'background:#FFFBEB;':''}${i<hasReasonDepts.length-1?'border-bottom:1px solid #FEF3C7;':''}">
          <div style="font-size:13px;font-weight:700;color:var(--text);">${x.dept}</div>
          <div style="font-size:12px;color:#92400E;margin-top:2px;">💬 ${x.reason}</div>
        </div>`).join('')}
      </div>`:`<div style="font-size:12px;color:var(--text-muted);padding:2px 0;">- ไม่มี -</div>`}
      `}
    </div>
  </div>
  <div style="background:#0F172A;padding:12px 32px;text-align:center;color:rgba(255,255,255,.5);font-size:11px;">สร้างโดยระบบ BMS Training</div>`;

  document.body.appendChild(wrap);
  showToast('กำลังสร้างภาพ กรุณารอสักครู่...','info');
  try{
    await new Promise(r=>setTimeout(r,300));
    const canvas=await html2canvas(wrap,{scale:3,useCORS:true,backgroundColor:'#ffffff',width:720,logging:false});
    const link=document.createElement('a');
    link.download=`key_entry_summary_${new Date().toISOString().slice(0,10)}.png`;
    link.href=canvas.toDataURL('image/png');
    link.click();
    showToast('บันทึกภาพสำเร็จ','success');
  }catch(e){
    console.error(e);
    showToast('สร้างภาพไม่สำเร็จ','danger');
  }finally{
    document.body.removeChild(wrap);
  }
}

/* ══ ADMIN REGS ══ */
function onAdminCatChange(){
  const cid=parseInt(document.getElementById('admin-reg-filter-cat').value)||0;
  const filtSess=(cid?sessions.filter(s=>s.catId===cid):sessions).slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'','th',{numeric:true,sensitivity:'base'}));
  document.getElementById('admin-filter-sess').innerHTML='<option value="">ทุกรอบ</option>'+filtSess.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  renderAdminRegs();
}
function renderAdminRegs(){
  const q=(document.getElementById('admin-search').value||'').toLowerCase();
  const cid=parseInt(document.getElementById('admin-reg-filter-cat')?.value)||0;
  const sid=document.getElementById('admin-filter-sess').value;
  let regs=registrations.filter(r=>!!getSess(r.sessionId));
  if(q)regs=regs.filter(r=>(r.fname+r.lname+(r.position||'')).toLowerCase().includes(q));
  if(cid)regs=regs.filter(r=>{const s=getSess(r.sessionId);return s&&s.catId===cid;});
  if(sid)regs=regs.filter(r=>r.sessionId==sid);
  const sc=document.getElementById('stat-reg-count'),sa=document.getElementById('stat-att-count');
  if(sc)sc.textContent=regs.length;
  if(sa)sa.textContent=regs.filter(r=>r.attended).length;
  const tbody=document.getElementById('admin-reg-tbody');
  if(!regs.length){tbody.innerHTML='<tr><td colspan="11"><div class="empty"><i class="ti ti-users-minus"></i><p>ไม่พบรายการ</p></div></td></tr>';return;}
  const collator=new Intl.Collator('th',{numeric:true,sensitivity:'base'});
  // จัดกลุ่มตามลำดับหลักสูตร และเรียงผู้ลงทะเบียนตามชื่อรอบอบรมภายในแต่ละกลุ่ม
  const groups=categories.map(cat=>({cat,items:regs.filter(r=>{
    const s=getSess(r.sessionId);return s&&s.catId===cat.id;
  })}));
  const orphan=regs.filter(r=>{const s=getSess(r.sessionId);return s&&!getCat(s.catId);});
  if(orphan.length)groups.push({cat:null,items:orphan});
  let rowNo=0;
  tbody.innerHTML=groups.filter(g=>g.items.length).map(g=>{
    const items=g.items.slice().sort((a,b)=>{
      const sa=getSess(a.sessionId),sb=getSess(b.sessionId);
      return collator.compare(sa?.name||'',sb?.name||'')
        ||collator.compare(`${a.fname||''} ${a.lname||''}`,`${b.fname||''} ${b.lname||''}`);
    });
    const roundCount=new Set(items.map(r=>r.sessionId)).size;
    const header=`<tr class="sess-grp"><td colspan="11"><i class="ti ti-book"></i>${g.cat?g.cat.name:'ไม่ระบุหลักสูตร'}
      <span class="sess-grp-meta">${roundCount} รอบ · ${items.length} คน</span></td></tr>`;
    const rows=items.map(r=>{
      const s=getSess(r.sessionId);
      rowNo++;
      return`<tr>
      <td class="tc-hide" data-label="#" style="color:var(--text-muted);">${rowNo}</td>
      <td class="tc-full" data-label="คำนำหน้า" style="font-size:12px;">${r.prefix||'-'}</td>
      <td class="tc-title" data-label="ชื่อ-นามสกุล" style="font-weight:600;">${r.fname} ${r.lname}</td>
      <td class="tc-full" data-label="ตำแหน่ง"><span class="badge badge-blue">${r.position||'-'}</span></td>
      <td class="tc-full" data-label="แผนก" style="font-size:12px;">${r.dept}</td>
      <td data-label="รอบ" style="font-size:12px;">${s?s.name:'-'}</td>
      <td data-label="วันที่ลง" style="font-size:12px;color:var(--text-muted);">${fmtDateShort(r.regDate)}</td>
      <td data-label="สถานะ">${r.attended?`<span class="badge badge-success"><i class="ti ti-check"></i>${r.attendedTime}</span>`:'<span class="badge badge-gray">ยังไม่เช็ค</span>'}</td>
      <td data-label="QR"><button class="btn btn-ghost btn-sm" onclick="showQR(${r.id})"><i class="ti ti-qrcode"></i></button></td>
      <td data-label="แก้ไข"><button class="btn btn-ghost btn-sm" onclick="adminOpenEditReg(${r.id})" title="แก้ไข"><i class="ti ti-edit"></i></button></td>
      <td data-label="ลบ"><button class="btn btn-danger btn-sm" onclick="deleteReg(${r.id})"><i class="ti ti-trash"></i></button></td>
    </tr>`;
    }).join('');
    return header+rows;
  }).join('');
}
async function deleteReg(id){
  if(!await showConfirm('ลบรายการลงทะเบียนนี้?','',{okLabel:'ลบ'}))return;
  const {error}=await _sb.from('trn_registrations').delete().eq('id',id);
  if(error){showToast('ลบไม่สำเร็จ','danger');return;}
  registrations=registrations.filter(r=>r.id!==id);renderAdminRegs();showToast('ลบสำเร็จ','success');
}
function openClearRegsBySite(){
  const sel=document.getElementById('clear-site-sel');
  sel.innerHTML='<option value="">— เลือกโครงการ —</option>'+
    _workSites().map(l=>`<option value="${l.code}">${l.name} (${l.code})</option>`).join('');
  document.getElementById('clear-site-preview').style.display='none';
  document.getElementById('clear-site-ok-btn').disabled=true;
  document.getElementById('modal-clear-regs-site').classList.add('open');
}
// จำนวนผู้ลงทะเบียนของโครงการที่เลือก — ถามฐานข้อมูล (ในเครื่องมีเฉพาะผู้ลงทะเบียนของโครงการที่เปิดอยู่)
let _clearSiteCnt=0;
const _regCount=(code,attended)=>{
  let q=_sb.from('trn_registrations').select('id,trn_sessions!inner(site)',{count:'exact',head:true}).eq('trn_sessions.site',code);
  if(attended)q=q.eq('attended',true);
  return q;
};
async function updateClearSiteCount(){
  const code=document.getElementById('clear-site-sel').value;
  const preview=document.getElementById('clear-site-preview');
  const btn=document.getElementById('clear-site-ok-btn');
  btn.disabled=true;_clearSiteCnt=0;
  if(!code){preview.style.display='none';return;}
  preview.style.display='block';
  preview.innerHTML='<span style="color:var(--text-muted);">กำลังนับ...</span>';
  const [aR,tR]=await Promise.all([_regCount(code),_regCount(code,true)]);
  if(document.getElementById('clear-site-sel').value!==code)return; // เปลี่ยนโครงการระหว่างรอ
  if(aR.error||tR.error){preview.innerHTML='<span style="color:var(--danger);">นับจำนวนไม่สำเร็จ</span>';return;}
  const cnt=aR.count||0,attended=tR.count||0;
  _clearSiteCnt=cnt;
  const loc=locations.find(l=>l.code===code);
  preview.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:${cnt?'8px':'0'};">
      <i class="ti ti-building" style="color:var(--primary);font-size:15px;"></i>
      <span>โครงการ <strong>${loc?loc.name:code}</strong> — <strong style="color:${cnt?'var(--danger)':'var(--text-muted)'};">${cnt} รายการ</strong></span>
    </div>
    ${cnt?`<div style="display:flex;gap:12px;font-size:12px;color:var(--text-muted);padding-left:23px;">
      <span><i class="ti ti-users"></i> ทั้งหมด ${cnt} คน</span>
      <span><i class="ti ti-circle-check" style="color:var(--success);"></i> เช็คชื่อแล้ว ${attended} คน</span>
      <span><i class="ti ti-clock" style="color:var(--warn);"></i> ยังไม่เช็ค ${cnt-attended} คน</span>
    </div>`:'<div style="font-size:12px;color:var(--text-muted);padding-left:23px;">ไม่มีข้อมูลลงทะเบียนในโครงการนี้</div>'}`;
  btn.disabled=cnt===0;
}
async function confirmClearRegsBySite(){
  const code=document.getElementById('clear-site-sel').value;
  if(!code)return;
  const loc=locations.find(l=>l.code===code);
  const siteSessIds=new Set(allSessionsFull.filter(s=>s.site===code).map(s=>s.id));
  const cnt=_clearSiteCnt;
  if(!cnt)return;
  if(!await showConfirm(`ลบข้อมูลลงทะเบียน ${cnt} รายการ?`,`โครงการ: ${loc?loc.name:code}`,{okLabel:`ลบ ${cnt} รายการ`,danger:true}))return;
  const btn=document.getElementById('clear-site-ok-btn');
  btn.disabled=true;btn.innerHTML='<i class="ti ti-loader-2" style="animation:spin .8s linear infinite"></i>กำลังลบ...';
  const sessIds=[...siteSessIds];
  const {error}=await _sb.from('trn_registrations').delete().in('session_id',sessIds);
  btn.disabled=false;btn.innerHTML='<i class="ti ti-trash"></i>ยืนยันลบข้อมูล';
  if(error){showToast('ลบไม่สำเร็จ: '+error.message,'danger');return;}
  registrations=registrations.filter(r=>!siteSessIds.has(r.sessionId));
  closeModal('modal-clear-regs-site');
  renderAdmin();
  showToast(`ลบข้อมูลโครงการ "${loc?loc.name:code}" สำเร็จ ${cnt} รายการ`,'success');
}
function openClearSurveyBySite(){
  const sel=document.getElementById('clear-sv-site-sel');
  sel.innerHTML='<option value="">— เลือกโครงการ —</option>'+
    _workSites().map(l=>`<option value="${l.code}">${l.name} (${l.code})</option>`).join('');
  document.getElementById('clear-sv-site-preview').style.display='none';
  document.getElementById('clear-sv-site-ok-btn').disabled=true;
  document.getElementById('modal-clear-survey-site').classList.add('open');
}
async function updateClearSurveySiteCount(){
  const code=document.getElementById('clear-sv-site-sel').value;
  const preview=document.getElementById('clear-sv-site-preview');
  const btn=document.getElementById('clear-sv-site-ok-btn');
  if(!code){preview.style.display='none';btn.disabled=true;return;}
  const loc=locations.find(l=>l.code===code);
  const{count}=await _sb.from('trn_survey_responses').select('id',{count:'exact',head:true}).eq('site',code);
  const cnt=count||0;
  preview.style.display='block';
  preview.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:${cnt?'8px':'0'};">
      <i class="ti ti-building" style="color:#7c3aed;font-size:15px;"></i>
      <span>โครงการ <strong>${loc?loc.name:code}</strong> — <strong style="color:${cnt?'var(--danger)':'var(--text-muted)'};">${cnt} รายการ</strong></span>
    </div>
    ${cnt?`<div style="font-size:12px;color:var(--text-muted);padding-left:23px;">
      <i class="ti ti-clipboard-check"></i> แบบประเมินที่จะถูกลบ ${cnt} รายการ
    </div>`:'<div style="font-size:12px;color:var(--text-muted);padding-left:23px;">ไม่มีข้อมูลแบบประเมินในโครงการนี้</div>'}`;
  btn.disabled=cnt===0;
}
async function confirmClearSurveyBySite(){
  const code=document.getElementById('clear-sv-site-sel').value;
  if(!code)return;
  const loc=locations.find(l=>l.code===code);
  const{count}=await _sb.from('trn_survey_responses').select('id',{count:'exact',head:true}).eq('site',code);
  const cnt=count||0;
  if(!await showConfirm(`ลบข้อมูลแบบประเมิน ${cnt} รายการ?`,`โครงการ: ${loc?loc.name:code}`,{okLabel:`ลบ ${cnt} รายการ`,danger:true}))return;
  const btn=document.getElementById('clear-sv-site-ok-btn');
  btn.disabled=true;btn.innerHTML='<i class="ti ti-loader-2" style="animation:spin .8s linear infinite"></i>กำลังลบ...';
  const{error}=await _sb.from('trn_survey_responses').delete().eq('site',code);
  btn.disabled=false;btn.innerHTML='<i class="ti ti-trash"></i>ยืนยันลบข้อมูล';
  if(error){showToast('ลบไม่สำเร็จ: '+error.message,'danger');return;}
  closeModal('modal-clear-survey-site');
  // Refresh survey dashboard if on same site
  const svSiteEl=document.getElementById('svd-site');
  if(svSiteEl&&svSiteEl.value===code){_svData=[];renderSurveyCharts();}
  showToast(`ลบข้อมูลแบบประเมินโครงการ "${loc?loc.name:code}" สำเร็จ ${cnt} รายการ`,'success');
}
function adminAddReg(){
  ['ar-fname','ar-lname','ar-pos'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('ar-sess').innerHTML=sessions.map(ss=>{
    const cnt=getCount(ss.id),cat=getCat(ss.catId);
    const full=cnt>=ss.capacity;
    return`<option value="${ss.id}"${full?' disabled':''}>${cat?cat.name+' — ':''}${ss.name} (${fmtDateShort(ss.date)})${full?' [เต็ม]':' ว่าง '+(ss.capacity-cnt)+' ที่'}</option>`;
  }).join('');
  populateSelect('ar-prefix',prefixes,'คำนำหน้า...');
  populateSelect('ar-dept',departments,'เลือกแผนก...');
  _syncEmailField('ar-email-wrap','ar-email');
  document.getElementById('modal-admin-add-reg').classList.add('open');
}

async function adminSubmitReg(){
  const sessId=parseInt(document.getElementById('ar-sess').value);
  const prefix=document.getElementById('ar-prefix').value;
  const fname=document.getElementById('ar-fname').value.trim();
  const lname=document.getElementById('ar-lname').value.trim();
  const pos=document.getElementById('ar-pos').value.trim();
  const dept=document.getElementById('ar-dept').value;
  const reqEmail=siteRequiresEmail();
  const email=document.getElementById('ar-email')?.value.trim()||'';
  if(!sessId||!prefix||!fname||!lname||!pos||!dept){showToast('กรุณากรอกข้อมูลให้ครบ','danger');return;}
  if(reqEmail&&!_emailRe.test(email)){showToast('กรุณากรอกอีเมลให้ถูกต้อง','danger');return;}
  const s=getSess(sessId);
  if(getCount(sessId)>=s.capacity){showToast('ที่นั่งเต็มแล้ว','danger');return;}
  const dup=findDupReg(fname,lname,s.catId);
  if(dup){
    const dupSess=getSess(dup.sessionId);
    if(dup.sessionId===sessId){showToast(`${fname} ${lname} ลงทะเบียนรอบนี้ไว้แล้ว`,'danger');return;}
    if(!await showConfirm(`${fname} ${lname} ลงทะเบียน "${dupSess?dupSess.name:'รอบอื่น'}" ในหลักสูตรนี้อยู่แล้ว`,`ต้องการเพิ่มรายการซ้ำหรือไม่?`,{okLabel:'เพิ่มรายการ',danger:false}))return;
  }else{
    const near=findSimilarReg(fname,lname,s.catId);
    if(near){
      const nearSess=getSess(near.sessionId);
      if(!await showConfirm(`พบชื่อใกล้เคียง "${near.prefix}${near.fname} ${near.lname}" ลงทะเบียน "${nearSess?nearSess.name:'รอบอื่น'}" ไว้แล้ว`,'อาจเป็นคนเดียวกันที่สะกดชื่อต่างกัน — ต้องการเพิ่มรายการนี้หรือไม่?',{okLabel:'เพิ่มรายการ',danger:false}))return;
    }
  }
  const {data,error}=await _sb.from('trn_registrations').insert({
    session_id:sessId,prefix_id:_mId('prefix',prefix),fname,lname,position:pos,dept_id:_mId('dept',dept),email:reqEmail?email:null,
    reg_date:new Date().toISOString().split('T')[0],attended:false
  }).select().single();
  if(error){showToast('บันทึกไม่สำเร็จ','danger');return;}
  const nr=_mReg(data);
  registrations.push(nr);
  closeModal('modal-admin-add-reg');renderAdmin();
  showToast(`เพิ่ม ${prefix}${fname} ${lname} สำเร็จ`,'success');
  pushNotify(nr);
}
function adminOpenEditReg(regId){
  const reg=getReg(regId);if(!reg)return;
  window._editRegId=regId;window._editRegAdmin=true;
  document.getElementById('edit-fname').value=reg.fname;
  document.getElementById('edit-lname').value=reg.lname;
  document.getElementById('edit-pos').value=reg.position||'';
  document.getElementById('edit-sess').innerHTML=sessions.map(ss=>{
    const cnt=getCount(ss.id),isCur=ss.id===reg.sessionId,cat=getCat(ss.catId);
    const isFull=!isCur&&cnt>=ss.capacity;
    return`<option value="${ss.id}"${isCur?' selected':''}${isFull?' disabled':''}>${cat?cat.name+' — ':''}${ss.name} — ${fmtDateShort(ss.date)}${isCur?' (ปัจจุบัน)':isFull?' [เต็ม]':' (ว่าง '+(ss.capacity-cnt)+' ที่)'}</option>`;
  }).join('');
  document.getElementById('edit-deadline-txt').textContent='Admin — แก้ไขได้ไม่จำกัดเงื่อนไข';
  populateSelect('edit-prefix',prefixes,'คำนำหน้า...');
  populateSelect('edit-dept',departments,'เลือกแผนก...');
  _syncEmailField('edit-email-wrap','edit-email',reg.email||'');
  document.getElementById('modal-edit-reg').classList.add('open');
  cselSetVal('edit-prefix',reg.prefix||'','คำนำหน้า...');
  cselSetVal('edit-dept',reg.dept||'','เลือกแผนก...');
}

function goToAttendance(sessId){
  showPage('checkin');
  document.querySelectorAll('.checkin-subtab').forEach((t,i)=>t.classList.toggle('active',i===1));
  document.querySelectorAll('.checkin-sub').forEach((s,i)=>s.classList.toggle('active',i===1));
  setTimeout(()=>{
    initAttendancePage();
    const s=getSess(sessId);
    document.getElementById('att-cat-sel').value=s.catId;
    attFilterCat();
    setTimeout(()=>{document.getElementById('att-sess-sel').value=sessId;loadAttendance();},80);
  },80);
}

/* ══════════════════ EDIT REGISTRATION ══════════════════ */
function openEditReg(regId){
  const reg=getReg(regId);if(!reg)return;
  if(!canEditReg(reg)){showToast('ไม่สามารถแก้ไขได้ — เลยกำหนดแก้ไขล่วงหน้า 1 วัน','danger');return;}
  window._editRegId=regId;
  const s=getSess(reg.sessionId);
  document.getElementById('edit-fname').value=reg.fname;
  document.getElementById('edit-lname').value=reg.lname;
  document.getElementById('edit-pos').value=reg.position||'';
  const sameSess=sessions.filter(ss=>ss.catId===s.catId);
  const today=new Date();today.setHours(0,0,0,0);
  document.getElementById('edit-sess').innerHTML=sameSess.map(ss=>{
    const cnt=getCount(ss.id),isCur=ss.id===reg.sessionId;
    const isFull=!isCur&&cnt>=ss.capacity;
    const sd=new Date(ss.date);sd.setHours(0,0,0,0);
    const pastDeadline=!isCur&&today>=sd;
    const disabled=isFull||pastDeadline;
    return`<option value="${ss.id}"${isCur?' selected':''}${disabled?' disabled':''}>${ss.name} — ${fmtDateShort(ss.date)}${isCur?' (รอบปัจจุบัน)':isFull?' [เต็ม]':pastDeadline?' [เลยกำหนด]':' (ว่าง '+(ss.capacity-cnt)+' ที่)'}</option>`;
  }).join('');
  const deadline=new Date(s.date);deadline.setDate(deadline.getDate()-1);
  document.getElementById('edit-deadline-txt').textContent='แก้ไขได้ถึง: '+fmtDate(deadline.toISOString().split('T')[0]);
  populateSelect('edit-prefix',prefixes,'คำนำหน้า...');
  populateSelect('edit-dept',departments,'เลือกแผนก...');
  _syncEmailField('edit-email-wrap','edit-email',reg.email||'');
  document.getElementById('modal-edit-reg').classList.add('open');
  cselSetVal('edit-prefix',reg.prefix||'','คำนำหน้า...');
  cselSetVal('edit-dept',reg.dept||'','เลือกแผนก...');
}
async function submitEditReg(){
  const reg=getReg(window._editRegId);if(!reg)return;
  const isAdmin=window._editRegAdmin===true;
  if(!isAdmin&&!canEditReg(reg)){showToast('เลยกำหนดแก้ไขแล้ว','danger');closeModal('modal-edit-reg');return;}
  const prefix=document.getElementById('edit-prefix').value;
  const fname=document.getElementById('edit-fname').value.trim();
  const lname=document.getElementById('edit-lname').value.trim();
  const pos=document.getElementById('edit-pos').value.trim();
  const dept=document.getElementById('edit-dept').value;
  const newSessId=parseInt(document.getElementById('edit-sess').value);
  const reqEmail=siteRequiresEmail();
  const email=document.getElementById('edit-email')?.value.trim()||'';
  if(!prefix||!fname||!lname||!pos||!dept){showToast('กรุณากรอกข้อมูลให้ครบ','danger');return;}
  if(reqEmail&&!_emailRe.test(email)){showToast('กรุณากรอกอีเมลให้ถูกต้อง','danger');return;}
  if(newSessId!==reg.sessionId){
    const ns=getSess(newSessId);if(!ns){showToast('ไม่พบรอบที่เลือก','danger');return;}
    if(!isAdmin){
      const today=new Date();today.setHours(0,0,0,0);
      const nd=new Date(ns.date);nd.setHours(0,0,0,0);
      if(today>=nd){showToast('รอบที่เลือกเลยกำหนดแก้ไขแล้ว','danger');return;}
    }
    if(getCount(newSessId)>=ns.capacity){showToast('รอบที่เลือกเต็มแล้ว','danger');return;}
    const dup=findDupReg(fname,lname,ns.catId,reg.id);
    if(dup){
      const dupSess=getSess(dup.sessionId);
      showToast(`${fname} ${lname} ลงทะเบียน "${dupSess?dupSess.name:'รอบอื่น'}" ในหลักสูตรนี้ไว้แล้ว`,'danger');return;
    }
  }
  const {error}=await _sb.from('trn_registrations').update({
    session_id:newSessId,prefix_id:_mId('prefix',prefix),fname,lname,position:pos,dept_id:_mId('dept',dept),email:reqEmail?email:reg.email||null
  }).eq('id',reg.id);
  if(error){showToast('บันทึกไม่สำเร็จ','danger');return;}
  Object.assign(reg,{prefix,prefixId:_mId('prefix',prefix),fname,lname,position:pos,dept,deptId:_mId('dept',dept),sessionId:newSessId,email:reqEmail?email:reg.email});
  window._editRegAdmin=false;
  closeModal('modal-edit-reg');
  renderCategories();
  if(isAdmin)renderAdmin();else trackSearch();
  showToast('แก้ไขข้อมูลสำเร็จ','success');
}

/* ══ UTILS ══ */
function closeModal(id){document.getElementById(id).classList.remove('open');}
function showAlert(msg,subMsg='',icon='<i class="ti ti-alert-circle" style="color:var(--danger)"></i>'){
  return new Promise(resolve=>{
    document.getElementById('confirm-msg').textContent=msg;
    const sub=document.getElementById('confirm-sub');
    sub.textContent=subMsg;sub.style.display=subMsg?'block':'none';
    document.getElementById('confirm-icon').innerHTML=icon;
    const okBtn=document.getElementById('confirm-ok-btn');
    okBtn.className='btn btn-primary';
    okBtn.innerHTML='<i class="ti ti-check"></i>รับทราบ';
    const cancelBtn=document.getElementById('confirm-cancel-btn');
    cancelBtn.style.display='none';
    document.getElementById('modal-confirm').classList.add('open');
    okBtn.onclick=()=>{cancelBtn.style.display='';closeModal('modal-confirm');resolve();};
  });
}
function showConfirm(msg,subMsg='',{okLabel='ตกลง',danger=true}={}){
  return new Promise(resolve=>{
    document.getElementById('confirm-msg').textContent=msg;
    const sub=document.getElementById('confirm-sub');
    sub.textContent=subMsg;sub.style.display=subMsg?'block':'none';
    document.getElementById('confirm-icon').innerHTML=danger
      ?'<i class="ti ti-alert-triangle" style="color:var(--danger)"></i>'
      :'<i class="ti ti-help-circle" style="color:var(--primary)"></i>';
    const okBtn=document.getElementById('confirm-ok-btn');
    okBtn.className='btn '+(danger?'btn-danger':'btn-primary');
    okBtn.innerHTML=(danger?'<i class="ti ti-trash"></i>':'<i class="ti ti-check"></i>')+okLabel;
    document.getElementById('modal-confirm').classList.add('open');
    const done=(v)=>{closeModal('modal-confirm');resolve(v);};
    const ok=()=>done(true);
    const cancel=()=>done(false);
    okBtn.onclick=ok;
    document.getElementById('confirm-cancel-btn').onclick=cancel;
  });
}
function showToast(msg,type='success'){
  const t=document.getElementById('toast');
  t.querySelector('#toast-msg').textContent=msg;
  // ไอคอน = ลูกตัวแรก — icons.util.js แปลง <i class="ti ..."> เป็น <span class="emo-ic"> แล้ว จึงหาด้วย 'i' ไม่ได้ (เคยพังทุก toast หลังแปลง)
  const ic=type==='success'?'circle-check':type==='warn'?'alert-triangle':'alert-circle';
  t.firstElementChild.outerHTML=window.appIcon?appIcon(ic):`<i class="ti ti-${ic}"></i>`;
  t.className=`toast ${type} show`;
  setTimeout(()=>t.classList.remove('show'),3500);
}
document.querySelectorAll('.modal-overlay').forEach(o=>{
  o.addEventListener('click',function(e){
    if('ontouchstart' in window)return; // touch: use explicit close button only
    if(e.target===this)this.classList.remove('open');
  });
});

/* ══ PRINT FORM ══ */
function openPrintForm(){
  const sel=document.getElementById('pf-sess');
  sel.innerHTML='<option value="">-- เลือกรอบ --</option>'+sessions.map(s=>{
    const cat=getCat(s.catId);
    const cnt=getCount(s.id);
    return`<option value="${s.id}">${cat?cat.name+' — ':''}${s.name} (${fmtDateShort(s.date)}) [${cnt} คน]</option>`;
  }).join('');
  // Pre-select current filter if any
  const curFilt=document.getElementById('admin-filter-sess')?.value;
  if(curFilt)sel.value=curFilt;
  onPrintFormSessChange();
  // Auto-fill hospital fields from current branch
  const curLoc=locations.find(l=>l.code===currentSite);
  if(curLoc){
    document.getElementById('pf-hospital').value=curLoc.name;
    const sigOrg=document.getElementById('pf-signer-org');
    if(sigOrg) sigOrg.value=curLoc.name;
  }
  _loadPrintFormSignatories();
  document.getElementById('modal-print-form').classList.add('open');
}
const PF_SIG_FIELDS=['pf-bms-name','pf-bms-pos','pf-bms-org','pf-signer-name','pf-signer-pos'];
async function _loadPrintFormSignatories(){
  try{
    const keys=PF_SIG_FIELDS.map(id=>`${id}_${currentSite}`);
    const {data}=await _sb.from('trn_settings').select('key,value').in('key',keys);
    const map=Object.fromEntries((data||[]).map(r=>[r.key,r.value]));
    PF_SIG_FIELDS.forEach(id=>{
      const val=map[`${id}_${currentSite}`];
      if(val){const el=document.getElementById(id);if(el)el.value=val;}
    });
  }catch(e){console.error('_loadPrintFormSignatories',e);}
}
async function savePrintFormSignatories(){
  try{
    await Promise.all(PF_SIG_FIELDS.map(id=>
      _savePrintSetting(`${id}_${currentSite}`,(document.getElementById(id)?.value||'').trim())
    ));
    showToast('บันทึกค่าเริ่มต้นผู้ลงนามสำเร็จ (เฉพาะโครงการนี้)','success');
  }catch(e){showToast('บันทึกไม่สำเร็จ','danger');}
}
function onPrintFormSessChange(){
  const sid=parseInt(document.getElementById('pf-sess').value||0);
  if(!sid){
    document.getElementById('pf-system').value='';
    document.getElementById('pf-details').value='';
    return;
  }
  const s=getSess(sid);if(!s)return;
  const cat=getCat(s.catId);
  document.getElementById('pf-system').value=cat?`${cat.name} — ${s.name}`:s.name;
  if(cat&&cat.desc)document.getElementById('pf-details').value=cat.desc;
}
function executePrintForm(){
  const sid=parseInt(document.getElementById('pf-sess').value||0);
  if(!sid){showToast('กรุณาเลือกรอบอบรม','danger');return;}
  const s=getSess(sid);if(!s){showToast('ไม่พบรอบที่เลือก','danger');return;}
  const cat=getCat(s.catId);
  const hospital=(document.getElementById('pf-hospital').value||'').trim();
  if(!hospital){
    const el=document.getElementById('pf-hospital');
    el.focus();el.style.borderColor='var(--danger)';
    el.addEventListener('input',()=>el.style.borderColor='',{once:true});
    showToast('กรุณาระบุชื่อสถานพยาบาล / หน่วยงาน','danger');return;
  }
  const program=(document.getElementById('pf-program').value||'BMS-INVENTORY').trim();
  const system=(document.getElementById('pf-system').value||'').trim();
  const details=(document.getElementById('pf-details').value||'').trim();
  const bmsName=(document.getElementById('pf-bms-name').value||'').trim();
  const bmsPos=(document.getElementById('pf-bms-pos').value||'เจ้าหน้าที่ฝึกอบรม').trim();
  const bmsOrg=(document.getElementById('pf-bms-org').value||'บริษัท บางกอก เมดิคอล ซอฟต์แวร์ จำกัด').trim();
  const signerName=(document.getElementById('pf-signer-name').value||'').trim();
  const signerPos=(document.getElementById('pf-signer-pos').value||'').trim();
  const signerOrg=(document.getElementById('pf-signer-org')?.value||hospital).trim();
  const totalRows=Math.max(10,Math.min(100,parseInt(document.getElementById('pf-rows').value||25)));
  const regs=registrations.filter(r=>r.sessionId===sid);
  const dateStr=_isoToThaiDate(s.date);
  const timeStr=`${s.timeStart||''}–${s.timeEnd||''} น.`;
  const _logoBase=window.location.href.replace(/[^/]*(\?.*)?$/,'');
  const PAGE_SIZE=25;
  const numPages=Math.ceil(totalRows/PAGE_SIZE);

  const COLS=`<colgroup>
    <col style="width:11mm"><col><col><col><col style="width:36mm">
  </colgroup>`;
  const THEAD=`<thead><tr>
    <th style="width:11mm;">ลำดับ</th><th>ชื่อ – นามสกุล</th><th>ตำแหน่ง</th><th>แผนก</th><th style="width:36mm;">ลายมือชื่อ</th>
  </tr></thead>`;

  // build header HTML (reused on each page)
  const pageHeaderHtml=`
  <div class="page-header">
    <img style="height:18mm;width:auto;display:block;margin-bottom:2mm;" src="${_logoBase}../img/BMS-Header.jpg" onerror="this.style.display='none';">
    <div class="doc-title">ใบเซ็นต์ชื่อผู้เข้าร่วมอบรมการใช้งานโปรแกรม ${_esc(program)}</div>
    <table class="info-tbl">
      <tr>
        <td style="width:55%"><span class="lbl">สถานพยาบาล :</span> ${_esc(hospital)}</td>
        <td><span class="lbl">วันที่ :</span> ${dateStr} เวลา ${timeStr}</td>
      </tr>
      <tr>
        <td><span class="lbl">ระบบงาน :</span> ${_esc(system)}</td>
        <td><span class="lbl">วิทยากร :</span> ${_esc(s.trainer||'—')}</td>
      </tr>
      ${details?`<tr><td colspan="2"><span class="lbl">รายละเอียด :</span> ${_esc(details)}</td></tr>`:''}
    </table>
  </div>
`;

  // build footer HTML per page
  function pageFooterHtml(pn){
    return`<div class="page-footer">
    <div class="sig">
      <div class="sig-blk">
        <div class="sig-line"></div>
        <div class="sig-lbl">(${_esc(bmsName)||'…………………………………………'})</div>
        <div class="sig-lbl">ตำแหน่ง ${_esc(bmsPos)}</div>
        <div class="sig-lbl">${_esc(bmsOrg)}</div>
      </div>
      <div class="sig-blk">
        <div class="sig-line"></div>
        <div class="sig-lbl">(${_esc(signerName)||'…………………………………………'})</div>
        <div class="sig-lbl">ตำแหน่ง ${_esc(signerPos)||'…………………………………'}</div>
        <div class="sig-lbl">${_esc(signerOrg)||'…………………………………………'}</div>
      </div>
    </div>
    ${numPages > 1 ? `<div class="pg-num">หน้า ${pn} / ${numPages}</div>` : ''}
  </div>`;
  }

  // build pages HTML
  let pagesHtml='';
  for(let p=0;p<numPages;p++){
    const start=p*PAGE_SIZE;
    const end=Math.min(start+PAGE_SIZE,totalRows);
    let tbody='';
    for(let i=start;i<end;i++){
      const r=regs[i];
      tbody+=`<tr>
        <td style="text-align:center;width:11mm;">${i+1}</td>
        <td>${r?_esc(`${r.prefix||''}${r.fname||''} ${r.lname||''}`.trim()):''}</td>
        <td>${r?_esc(r.position||''):''}</td>
        <td>${r?_esc(r.dept||''):''}</td>
        <td style="width:36mm;"></td>
      </tr>`;
    }
    pagesHtml+=`<div class="page">
      ${pageHeaderHtml}
      <div class="page-content">
        <table class="doc-tbl">${COLS}${THEAD}<tbody>${tbody}</tbody></table>
      </div>
      ${pageFooterHtml(p+1)}
    </div>`;
  }

  const html=`<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8">
<title>ใบเซ็นต์ชื่อ — ${_esc(s.name)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'TH SarabunPSK';font-size:16px;color:#111;background:#555;}
.page{
  width:210mm; height:297mm; box-sizing:border-box;
  padding:15mm 15mm 12mm 15mm;
  margin:1cm auto; background:white; box-shadow:0 0 10px rgba(0,0,0,0.5);
  display:flex; flex-direction:column;
}
.page-header, .page-footer{flex-shrink:0;}
.page-content{flex-grow:1; display:flex; flex-direction:column; overflow:hidden;}
.doc-title{font-size:20px;font-weight:700;text-align:center;border:1px solid #000;border-bottom:none;padding:5px 8px;}
.info-tbl{width:100%;border-collapse:collapse;border:1px solid #000;}
.info-tbl td{padding:4px 8px;border:1px solid #000;font-size:16px;}
.info-tbl tr:last-child td{border-bottom:none;}
.info-tbl .lbl{font-weight:700;}
.doc-tbl{width:100%;border-collapse:collapse;}
.doc-tbl th{border:1px solid #000;padding:4px 6px;text-align:center;font-size:16px;background:#f0f0f0;font-weight:700;}
.doc-tbl td{border:1px solid #000;border-top:none;padding:0 5px;font-size:16px;}
.page-content .doc-tbl{height:100%; display:flex; flex-direction:column;}
.page-content .doc-tbl tbody{flex-grow:1; display:flex; flex-direction:column;}
.page-content .doc-tbl tr{display:table; width:100%; table-layout:fixed;}
.page-content .doc-tbl tbody tr{flex:1;}
.sig{display:flex;justify-content:space-between;padding:0 8mm;margin-top:20mm;break-inside:avoid;}
.sig-blk{text-align:center;width:44%;}
.sig-line{border-bottom:1px solid #333;width:51mm;margin:0 auto 3px;}
.sig-lbl{font-size:16px;line-height:1.3;}
.pg-num{text-align:center;font-size:11px;color:#555;margin-top:2mm;}
.no-print{margin-top:16px;text-align:center;}
.font-warn{display:none;align-items:center;gap:8px;background:#FEF2F2;border:1px solid #FCA5A5;color:#991B1B;font-size:13px;font-weight:600;padding:10px 14px;border-radius:8px;margin:0 auto 14px;max-width:210mm;font-family:Arial,sans-serif;}
.font-warn.show{display:flex;}
@media print{
  body{background:none;margin:0;}
  .print-container{padding:0;gap:0;}
  .page{margin:0;box-shadow:none;page-break-after:always;}
  .page:last-child{page-break-after:avoid;}
  .no-print,.font-warn{display:none!important;}
}
@page {
  size: 210mm 297mm;
  margin: 0;
}
</style></head><body>
<div class="font-warn no-print" id="font-warn">⚠️ ไม่พบฟอนต์ TH SarabunPSK บนเครื่องนี้ — เอกสารจะแสดง/พิมพ์ด้วยฟอนต์อื่นแทน ไม่ตรงตามมาตรฐานราชการ กรุณาติดตั้งฟอนต์ TH SarabunPSK ก่อนพิมพ์จริง</div>
<div class="print-container">${pagesHtml}</div>
<div class="no-print">
  <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;background:#1a56a0;color:#fff;border:none;border-radius:6px;">🖨 พิมพ์</button>
  <button onclick="window.close()" style="margin-left:10px;padding:8px 18px;font-size:14px;cursor:pointer;background:#f1f5f9;border:1px solid #ccc;border-radius:6px;">ปิด</button>
</div>
<script>
(function(){
  var canCheck = !!(document.fonts && document.fonts.check);
  var hasFont = true;
  (document.fonts?document.fonts.ready:Promise.resolve()).then(function(){
    try{ if(canCheck) hasFont = document.fonts.check("16pt 'TH SarabunPSK'"); }catch(e){}
    if(canCheck && !hasFont){
      document.getElementById('font-warn').classList.add('show');
    } else {
      setTimeout(window.print,300);
    }
  });
})();
<\/script>
</body></html>`;
  closeModal('modal-print-form');
  const w=window.open('','_blank','width=900,height=700,scrollbars=yes');
  if(!w){showToast('Popup ถูกบล็อก กรุณาอนุญาต popup แล้วลองใหม่','danger');return;}
  w.document.open();w.document.write(html);w.document.close();
}
function _esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

/* ══════════════════ PRINT DOCUMENTS ══════════════════ */
const _thaiMonths=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
let _printDocTitles=[];
let _printDocTitlesLoaded=false;
let _docTitleEditing=null;
let _docTitleTemp=[];

function _isoToThaiDate(iso){
  if(!iso) return '';
  const [y,m,d]=iso.split('-').map(Number);
  return `${d} ${_thaiMonths[m-1]} ${y+543}`;
}

/* ── สถานพยาบาลบนเอกสาร = รพ. ของโครงการ (trn_locations.hospital_id → hospitals) แสดงแค่ "ชื่อ จ.จังหวัด" ไม่มีรหัส ── */
const _printHosp={}; // hospital_id → {name,province}
async function _loadPrintHospitals(locs){
  const ids=[...new Set(locs.map(l=>l.hospital_id).filter(id=>id&&!_printHosp[id]))];
  if(!ids.length)return;
  const {data,error}=await _sb.from('hospitals').select('id,name,province').in('id',ids);
  if(error){console.warn('[print] โหลดข้อมูล รพ. ไม่สำเร็จ',error);return;}
  (data||[]).forEach(h=>{_printHosp[h.id]={name:h.name||'',province:h.province||''};});
}
function _printHospLabel(loc){
  if(!loc)return'';
  const h=_printHosp[loc.hospital_id];
  const name=((h&&h.name)||loc.hospital_name||loc.name||'').trim();
  const prov=((h&&h.province)||'').replace(/^(จังหวัด|จ.)s*/,'').trim();
  return prov&&!name.includes(prov)?`${name} จ.${prov}`:name;
}

async function initPrintSection(){
  // Populate hospital dropdown (รพ. ของโครงการ)
  const sites=_workSites();
  await _loadPrintHospitals(sites);
  const locSel=document.getElementById('print-loc-sel');
  const prev=locSel.value;
  locSel.innerHTML='<option value="">— เลือกสถานพยาบาล —</option>';
  sites.forEach(l=>{
    const o=document.createElement('option');
    o.value=l.id;
    o.textContent=_printHospLabel(l);
    locSel.appendChild(o);
  });
  // แท็บอบรมของโครงการ = มีโครงการเดียว → เลือกให้เลย
  if(prev&&sites.some(l=>String(l.id)===prev))locSel.value=prev;
  else if(sites.length===1){
    locSel.value=sites[0].id;
    const rinst=document.getElementById('print-rinst');
    if(rinst&&!rinst.value)rinst.value=_printHospLabel(sites[0]);
  }
  // Set today's date
  const today=new Date().toISOString().split('T')[0];
  const dateEl=document.getElementById('print-date');
  if(!dateEl.value) dateEl.value=today;
  // Load settings once
  if(!_printDocTitlesLoaded){ await _loadPrintSettings(); _printDocTitlesLoaded=true; }
  _renderPrintTitleDropdown();
  updatePrintPreview();
}

function _renderPrintTitleDropdown(){
  const sel=document.getElementById('print-title-sel');
  sel.innerHTML='<option value="">— เลือกหัวข้อ —</option>';
  _printDocTitles.forEach((t,i)=>{
    const o=document.createElement('option');
    o.value=i;
    o.textContent=t.length>56?t.slice(0,56)+'…':t;
    sel.appendChild(o);
  });
}

async function _loadPrintSettings(){
  const DEFAULT_TITLES=[
    'ใบลงชื่อ Stand by การใช้งานระบบงาน โปรแกรม BMS-INVENTORY',
    'ใบลงชื่อเข้าร่วมประชุมสรุป Flow การใช้งานโปรแกรม BMS-INVENTORY',
    'ใบลงชื่อเข้าร่วมประชุมสรุปปัญหาการใช้งานโปรแกรม BMS-INVENTORY',
    'ใบลงชื่อเข้าร่วมการจำลองคู่ขนาน SIT (System Integration Testing)',
    'ใบเซ็นชื่อคีย์ยอดตั้งต้นคลังย่อย โปรแกรม BMS-INVENTORY',
  ];
  try{
    const siteKeys=['doc_left_name','doc_left_pos','doc_right_name','doc_right_pos','doc_right_inst']
      .map(k=>`${k}_${currentSite}`);
    const keys=['doc_titles','doc_font_family','doc_font_size',...siteKeys];
    const {data}=await _sb.from('trn_settings').select('key,value').in('key',keys);
    const map=Object.fromEntries((data||[]).map(r=>[r.key,r.value]));
    if(map.doc_titles){try{_printDocTitles=JSON.parse(map.doc_titles);}catch{}}
    if(!_printDocTitles.length) _printDocTitles=[...DEFAULT_TITLES];
    const set=(id,val)=>{if(val){const el=document.getElementById(id);if(el)el.value=val;}};
    set('print-lname',map[`doc_left_name_${currentSite}`]);
    set('print-lpos', map[`doc_left_pos_${currentSite}`]);
    set('print-rname',map[`doc_right_name_${currentSite}`]);
    set('print-rpos', map[`doc_right_pos_${currentSite}`]);
    set('print-rinst',map[`doc_right_inst_${currentSite}`]);
    set('print-font-family', map.doc_font_family);
    set('print-font-size', map.doc_font_size);
  }catch(e){console.error('loadPrintSettings',e);}
}

async function _savePrintSetting(key,val){
  await _sb.from('trn_settings').upsert({key,value:val,updated_at:new Date().toISOString()});
}

function onPrintTitleSel(){
  const i=parseInt(document.getElementById('print-title-sel').value);
  if(!isNaN(i)&&_printDocTitles[i]){
    document.getElementById('print-title-txt').value=_printDocTitles[i];
    updatePrintPreview();
  }
}
function onPrintLocSel(){
  const locId=parseInt(document.getElementById('print-loc-sel').value)||null;
  const loc=locations.find(l=>l.id===locId);
  const rinstEl=document.getElementById('print-rinst');
  if(rinstEl) rinstEl.value=_printHospLabel(loc);
  // Refresh officer dropdown if checkbox is on
  if(document.getElementById('print-officer').checked) onPrintOfficerToggle();
  else updatePrintPreview();
}

async function onPrintOfficerToggle(){
  const checked=document.getElementById('print-officer').checked;
  const wrap=document.getElementById('print-officer-sel-wrap');
  wrap.style.display=checked?'block':'none';
  if(checked){
    const locId=parseInt(document.getElementById('print-loc-sel').value)||null;
    const loc=locations.find(l=>l.id===locId);
    if(loc?.code){
      const loadEl=document.getElementById('print-officer-loading');
      const selEl=document.getElementById('print-officer-sel');
      loadEl.style.display='block';
      selEl.style.display='none';
      const persons=await _loadOfficersForLocation(loc.code);
      loadEl.style.display='none';
      selEl.style.display='block';
      selEl.innerHTML=`<option value="">— ${persons.length?'เลือกเจ้าหน้าที่':'โครงการนี้ยังไม่มีทีมงาน'} —</option>`+
        persons.map(p=>`<option value="${_esc(p.name)}">${_esc(p.name)}${p.position?' — '+_esc(p.position):''}</option>`).join('');
    } else {
      document.getElementById('print-officer-sel').innerHTML='<option value="">— กรุณาเลือกโครงการก่อน —</option>';
    }
  }
  updatePrintPreview();
}

async function _loadOfficersForLocation(siteCode){
  // เจ้าหน้าที่ = ทีมของโครงการนี้เท่านั้น (PM + ทีมของโครงการต้นทาง — แหล่งเดียวกับวิทยากร)
  if(!_teamReady){
    const [ipR,pR]=await Promise.all([_qImpl(),_qProj()]);
    _implRows=ipR.data||[];_projRows=pR.data||[];_teamReady=!ipR.error&&!pR.error;
  }
  const ids=_siteTeamIds(siteCode);
  return trainerStaff.filter(t=>ids.includes(String(t.id))).map(t=>({name:t.name,position:t.position||''}));
}

function _getPrintConfig(){
  const locId=parseInt(document.getElementById('print-loc-sel').value)||null;
  const loc=locations.find(l=>l.id===locId);
  const showOfficer=document.getElementById('print-officer').checked;
  const officerSel=document.getElementById('print-officer-sel');
  return{
    title:(document.getElementById('print-title-txt').value||'').trim(),
    hospital:_printHospLabel(loc),
    date:_isoToThaiDate(document.getElementById('print-date').value),
    showOfficer,
    officerName:showOfficer?(officerSel?.value||''):'',
    rowCount:Math.max(5,Math.min(100,parseInt(document.getElementById('print-rows').value)||25)),
    leftName:(document.getElementById('print-lname').value||'').trim(),
    leftPos:(document.getElementById('print-lpos').value||'').trim(),
    rightName:(document.getElementById('print-rname').value||'').trim(),
    rightPos:(document.getElementById('print-rpos').value||'').trim(),
    rightInst:(document.getElementById('print-rinst').value||'').trim(),
    fontFamily: (document.getElementById('print-font-family')?.value || 'Sarabun').trim(),
    fontSize: (document.getElementById('print-font-size')?.value || '13px').trim(),
  };
}

/* ── สร้างเอกสาร ────────────────────────────────────────────────────── */
// margins: บน 17mm, ล่าง 15mm, ซ้าย/ขวา 15mm
function _buildDocHTML(cfg,absLogoSrc,forPrint){
  const logo=absLogoSrc||'../img/BMS-Header.jpg'; // หัวกระดาษบริษัท ใช้รูปเดียวกับเอกสาร Backoffice
  const PAGE=25;
  const numPages=Math.ceil(cfg.rowCount/PAGE) || 1;
  const officerLine=cfg.showOfficer
    ?`<br><span class="lbl">เจ้าหน้าที่ :</span> ${_esc(cfg.officerName||'')}`:'';

  const COLS=`<colgroup>
    <col style="width:11mm"><col><col style="width:36mm"><col style="width:36mm"><col style="width:40mm">
  </colgroup>`;
  const THEAD=`<thead><tr>
    <th style="width:11mm">ลำดับ</th><th>ชื่อ – สกุล</th><th style="width:36mm">ตำแหน่ง</th><th style="width:36mm">แผนก</th><th style="width:40mm">ลายมือชื่อ</th>
  </tr></thead>`;

  function buildRows(from,to,cls){
    let r='';
    for(let i=from;i<=to;i++){
      r+=`<tr class="${cls}"><td style="text-align:center;width:11mm;">${i}</td><td></td><td style="width:36mm;"></td><td style="width:36mm;"></td><td style="width:40mm;"></td></tr>`;
    }
    return r;
  }

  function sigFooter(pageNum,totalPages,prefixCls){
    const p=prefixCls||'';
    return`<div class="${p}pf">
  <div class="${p}sig">
    <div class="sig-blk">
      <div class="sig-line"></div>
      <div class="sig-lbl">(${_esc(cfg.leftName)||'ชื่อ-นามสกุล'})</div>
      <div class="sig-lbl">ตำแหน่ง ${_esc(cfg.leftPos)||'………………………………'}</div>
      <div class="sig-lbl">บริษัท บางกอก เมดิคอล ซอฟต์แวร์ จำกัด</div>
    </div>
    <div class="sig-blk">
      <div class="sig-line"></div>
      <div class="sig-lbl">(${_esc(cfg.rightName)||'ชื่อ-นามสกุล'})</div>
      <div class="sig-lbl">ตำแหน่ง ${_esc(cfg.rightPos)||'………………………………'}</div>
      ${cfg.rightInst?`<div class="sig-lbl">${_esc(cfg.rightInst)}</div>`:''}
    </div>
  </div>
  ${totalPages>1?`<div class="pg-num">หน้า ${pageNum} / ${totalPages}</div>`:''}
</div>`;
  }

  if(!forPrint){
    const WRAP='background:#fff;box-shadow:0 2px 16px rgba(0,0,0,.18);width:210mm;height:297mm;box-sizing:border-box;overflow:hidden;font-family:\'TH SarabunPSK\';color:#111;display:flex;flex-direction:column;padding:15mm 15mm 12mm 15mm;';
    function pvSheet(from,to,pn){
      return`<div class="page" style="${WRAP}">
  <div class="pv-ph">
    <img src="${logo}" id="pv-logo-${pn}" style="height:18mm;width:auto;display:block;margin-bottom:2mm;"
      onerror="this.style.display='none';var f=document.getElementById('pv-logofb-${pn}');if(f)f.style.display='flex';">
    <div id="pv-logofb-${pn}" style="display:none;align-items:center;gap:8px;margin-bottom:4px;">
      <svg width="44" height="44" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><path d="M40 74 C39 73 5 53 5 29 C5 15 16 5 28 5 C34 5 39 9 40 12 C41 9 46 5 52 5 C64 5 75 15 75 29 C75 53 41 73 40 74Z" fill="#c0392b"/><path d="M10 48 C20 40 31 38 40 42 C49 46 60 49 70 44" stroke="#1a5899" stroke-width="6" fill="none" stroke-linecap="round"/><text x="40" y="43" text-anchor="middle" fill="white" font-family="Arial Black,sans-serif" font-weight="900" font-size="17">BMS</text></svg>
      <span style="font-size:10px;line-height:1.5;color:#333;"><strong style="font-size:11px;">บริษัท บางกอก เมดิคอล ซอฟต์แวร์ จำกัด</strong><br>เลขที่ 2 ชั้น 2 ซ.สุขสวัสดิ์ 33 ราษฎร์บูรณะ กรุงเทพฯ</span>
    </div>
    <div class="pv-title">${_esc(cfg.title)||'(กรุณาเลือกหัวข้อเอกสาร)'}</div>
    <table class="pv-info">
      <tr>
        <td style="width:55%">สถานพยาบาล : ${_esc(cfg.hospital)||'—'}</td>
        <td>วันที่ : ${_esc(cfg.date)||'—'}${officerLine}</td>
      </tr>
    </table>
  </div>
  <table class="pv-tbl pv-phtbl">${COLS}${THEAD}</table>
  <table class="pv-tbl pv-dtbl">${COLS}<tbody>${buildRows(from,to,'pv-row')}</tbody></table>
  <div style="flex:1;"></div>
  ${sigFooter(pn,numPages,'pv-')}
</div>`;
    }
    let html='';
    for(let p=0;p<numPages;p++){
      html+=pvSheet(p*PAGE+1,Math.min((p+1)*PAGE,cfg.rowCount),p+1);
    }
    return html;
  }

  // --- FOR PRINT --- (New refactored code is kept)
  const officerLinePrint=cfg.showOfficer ? `<br><span class="lbl">เจ้าหน้าที่ :</span> ${_esc(cfg.officerName||'')}`:'';
  const pageHeaderHtml=`
  <div class="page-header">
    <img src="${logo}" style="height:18mm;width:auto;display:block;margin-bottom:2mm;" onerror="this.style.display='none'">
    <div class="doc-title">${_esc(cfg.title)||'(กรุณาเลือกหัวข้อเอกสาร)'}</div>
    <table class="info-tbl">
      <tr>
        <td style="width:55%;vertical-align:top;"><span class="lbl">สถานพยาบาล :</span> ${_esc(cfg.hospital)||'—'}</td>
        <td style="vertical-align:top;"><span class="lbl">วันที่ :</span> ${_esc(cfg.date)||'—'}${officerLinePrint}</td>
      </tr>
    </table>
  </div>
`;
  let pagesHtml='';
  for(let p=0;p<numPages;p++){
    pagesHtml+=`<div class="page">
      ${pageHeaderHtml}
      <div class="page-content">
        <table class="doc-tbl">${COLS}${THEAD}<tbody>${buildRows(p*PAGE+1,Math.min((p+1)*PAGE,cfg.rowCount),'')}</tbody></table>
      </div>
      ${sigFooter(p+1,numPages,'')}
    </div>`;
  }
  const style=`
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'TH SarabunPSK';font-size:16px;color:#111;background:#fff;}
.page{width:210mm; height:297mm; box-sizing:border-box;padding:15mm 15mm 12mm 15mm;background:white; display:flex; flex-direction:column;}
.page-header, .page-footer{flex-shrink:0;}
.page-content{flex-grow:1; display:flex; flex-direction:column; overflow:hidden;}
.doc-title{font-size:20px;font-weight:700;text-align:center;border:1px solid #000;border-bottom:none;padding:5px 8px;}
.info-tbl{width:100%;border-collapse:collapse;border:1px solid #000;}
.info-tbl td{padding:4px 8px;border:1px solid #000;font-size:16px;vertical-align:top;}
.info-tbl tr:last-child td{border-bottom:none;}
.info-tbl .lbl{font-weight:700;}
.doc-tbl{width:100%;border-collapse:collapse;}
.doc-tbl th{border:1px solid #000;padding:4px 6px;text-align:center;font-size:16px;background:#f0f0f0;font-weight:700;}
.doc-tbl td{border:1px solid #000;border-top:none;padding:0 5px;font-size:16px;}
.page-content .doc-tbl{height:100%; display:flex; flex-direction:column;}
.page-content .doc-tbl tbody{flex-grow:1; display:flex; flex-direction:column;}
.page-content .doc-tbl tr{display:table; width:100%; table-layout:fixed;}
.page-content .doc-tbl tbody tr{flex:1;}
.sig{display:flex;justify-content:space-between;padding:0 8mm;margin-top:20mm;break-inside:avoid;}
.sig-blk{text-align:center;width:44%;}
.sig-line{border-bottom:1px solid #333;width:51mm;margin:0 auto 3px;}
.sig-lbl{font-size:16px;line-height:1.3;}
.pg-num{text-align:center;font-size:11px;color:#555;margin-top:2mm;}
.no-print{margin-top:16px;text-align:center;}
.font-warn{display:none;align-items:center;gap:8px;background:#FEF2F2;border:1px solid #FCA5A5;color:#991B1B;font-size:13px;font-weight:600;padding:10px 14px;border-radius:8px;margin:0 auto 14px;max-width:210mm;font-family:Arial,sans-serif;}
.font-warn.show{display:flex;}
@media print{
  body{background:none;margin:0;}
  .page{margin:0;box-shadow:none;page-break-after:always;}
  .page:last-child{page-break-after:avoid;}
  .no-print,.font-warn{display:none!important;}
}
@page {size: 210mm 297mm;margin: 0;}
  `;
  return `<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8">
<title>${_esc(cfg.title)||'เอกสาร'}</title>
<style>${style}</style></head><body>
<div class="font-warn no-print" id="font-warn">⚠️ ไม่พบฟอนต์ TH SarabunPSK บนเครื่องนี้ — เอกสารจะแสดง/พิมพ์ด้วยฟอนต์อื่นแทน ไม่ตรงตามมาตรฐานราชการ กรุณาติดตั้งฟอนต์ TH SarabunPSK ก่อนพิมพ์จริง</div>
<div class="print-container">${pagesHtml}</div>
<div class="no-print">
  <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;background:#1a56a0;color:#fff;border:none;border-radius:6px;margin-right:8px;">🖨 พิมพ์</button>
  <button onclick="window.close()" style="padding:8px 18px;font-size:14px;cursor:pointer;background:#f1f5f9;border:1px solid #ccc;border-radius:6px;">ปิด</button>
</div>
<script>
(function(){
  var canCheck = !!(document.fonts && document.fonts.check);
  var hasFont = true;
  (document.fonts?document.fonts.ready:Promise.resolve()).then(function(){
    try{ if(canCheck) hasFont = document.fonts.check("16pt 'TH SarabunPSK'"); }catch(e){}
    if(canCheck && !hasFont){
      document.getElementById('font-warn').classList.add('show');
    } else {
      setTimeout(window.print,300);
    }
  });
})();
<\/script>
</body></html>`;
}

function _checkPrintFont(){
  const el=document.getElementById('print-font-warn');
  if(!el)return;
  let available=true;
  try{
    if(document.fonts&&document.fonts.check) available=document.fonts.check("16pt 'TH SarabunPSK'");
  }catch(e){}
  el.classList.toggle('show',!available);
}
function updatePrintPreview(){
  const el=document.getElementById('print-preview');
  if(!el) return;
  const cfg=_getPrintConfig();
  const baseUrl=window.location.href.replace(/[^/]*(\?.*)?$/,'');
  const absLogo=baseUrl+'../img/BMS-Header.jpg';
  el.innerHTML=_buildDocHTML(cfg,absLogo,false);
  requestAnimationFrame(()=>_doPreviewFit(el));
  _checkPrintFont();
}

function _scalePrintPreview(){
  const wrap=document.getElementById('print-preview-wrap');
  const el=document.getElementById('print-preview');
  if(!wrap||!el) return;
  const pages=el.querySelectorAll('.page');
  if(!pages.length) return;
  const paperW=Math.round(210*96/25.4);
  const paperH=Math.round(297*96/25.4);
  const pad=16;
  const availW=wrap.clientWidth-pad*2;
  const availH=wrap.clientHeight-pad*2;
  const scaleW=availW/paperW;
  const n=pages.length;
  const gap=12;
  // scale so ALL pages fit both width and height of panel
  const scaleByH=(availH-(n-1)*gap)/(n*paperH);
  const scale=Math.min(scaleW,scaleByH);
  wrap.style.justifyContent=scale===scaleByH ? 'center' : 'flex-start';
  pages.forEach(p=>{
    p.style.transform='';
    p.style.marginBottom='';
    p.style.zoom=scale;
  });
}

function _doPreviewFit(el){
  const CONTENT_H=Math.round(270*96/25.4); // 297mm page - 15mm(บน) - 12mm(ล่าง) = 270mm content area
  el.querySelectorAll(':scope>div').forEach(function(page){
    const ph=page.querySelector('.pv-ph');
    const phtbl=page.querySelector('.pv-phtbl');
    const pf=page.querySelector('.pv-pf');
    const rows=page.querySelectorAll('tr.pv-row');
    if(!rows.length)return;
    const phH=(ph?ph.offsetHeight:0)+(phtbl?phtbl.offsetHeight:0);
    const pfH=pf?pf.offsetHeight:0;
    const avail=CONTENT_H-phH-pfH;
    const rh=Math.max(16,Math.floor(avail/rows.length));
    rows.forEach(function(r){r.style.height=rh+'px';});
  });
  _scalePrintPreview();
}

function doPrint(){
  const cfg=_getPrintConfig();
  const baseUrl=window.location.href.replace(/[^/]*(\?.*)?$/,'');
  const absLogo=baseUrl+'../img/BMS-Header.jpg';
  const w=window.open('','_blank','width=900,height=750,scrollbars=yes');
  if(!w){showToast('Popup ถูกบล็อก กรุณาอนุญาต popup แล้วลองใหม่','danger');return;}
  w.document.open();
  w.document.write(_buildDocHTML(cfg,absLogo,true));
  w.document.close();
}

async function savePrintSignatories(){
  try{
    await Promise.all([
      _savePrintSetting(`doc_left_name_${currentSite}`,(document.getElementById('print-lname').value||'').trim()),
      _savePrintSetting(`doc_left_pos_${currentSite}`, (document.getElementById('print-lpos').value||'').trim()),
      _savePrintSetting(`doc_right_name_${currentSite}`,(document.getElementById('print-rname').value||'').trim()),
      _savePrintSetting(`doc_right_pos_${currentSite}`, (document.getElementById('print-rpos').value||'').trim()),
      _savePrintSetting(`doc_right_inst_${currentSite}`,(document.getElementById('print-rinst').value||'').trim()),
    ]);
    showToast('บันทึกผู้ลงนามสำเร็จ (เฉพาะโครงการนี้)','success');
  }catch(e){showToast('บันทึกไม่สำเร็จ','danger');}
}

/* ─── Title modal ─────────────────────────────────────────────────────────── */
function openDocTitleModal(){
  _docTitleTemp=[..._printDocTitles];
  _docTitleEditing=null;
  document.getElementById('doc-new-title').value='';
  renderDocTitleList();
  document.getElementById('modal-doc-titles').classList.add('open');
}

function renderDocTitleList(){
  const el=document.getElementById('doc-title-list');
  if(!_docTitleTemp.length){
    el.innerHTML='<div style="text-align:center;color:var(--text-muted);padding:24px;font-size:13px;">ยังไม่มีหัวข้อ</div>';
    return;
  }
  el.innerHTML=_docTitleTemp.map((t,i)=>{
    if(_docTitleEditing?.index===i){
      return`<div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px;">
        <textarea class="form-control" id="doc-edit-${i}" rows="2" style="font-size:13px;resize:none;margin-bottom:8px;">${_esc(t)}</textarea>
        <div style="display:flex;gap:6px;justify-content:flex-end;">
          <button class="btn btn-ghost btn-sm" onclick="_cancelDocTitleEdit()">ยกเลิก</button>
          <button class="btn btn-primary btn-sm" onclick="_saveDocTitleEdit(${i})">บันทึก</button>
        </div>
      </div>`;
    }
    return`<div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;align-items:flex-start;gap:8px;">
      <span style="flex:1;font-size:13px;line-height:1.6;color:var(--text);">${_esc(t)}</span>
      <button class="btn btn-ghost btn-sm" onclick="_startDocTitleEdit(${i})" style="padding:4px 8px;flex-shrink:0;"><i class="ti ti-pencil"></i></button>
      <button class="btn btn-ghost btn-sm" onclick="_deleteDocTitle(${i})" style="padding:4px 8px;flex-shrink:0;color:var(--danger);"><i class="ti ti-trash"></i></button>
    </div>`;
  }).join('');
}

function _startDocTitleEdit(i){
  _docTitleEditing={index:i};
  renderDocTitleList();
  setTimeout(()=>{const el=document.getElementById(`doc-edit-${i}`);if(el)el.focus();},50);
}
function _cancelDocTitleEdit(){_docTitleEditing=null;renderDocTitleList();}
function _saveDocTitleEdit(i){
  const el=document.getElementById(`doc-edit-${i}`);
  if(!el)return;
  const v=el.value.trim();
  if(!v)return;
  _docTitleTemp[i]=v;
  _docTitleEditing=null;
  renderDocTitleList();
}
function _deleteDocTitle(i){
  _docTitleTemp.splice(i,1);
  if(_docTitleEditing?.index===i)_docTitleEditing=null;
  renderDocTitleList();
}
function addDocTitle(){
  const el=document.getElementById('doc-new-title');
  const v=el.value.trim();
  if(!v)return;
  _docTitleTemp.push(v);
  el.value='';
  renderDocTitleList();
}
async function saveDocTitles(){
  try{
    await _savePrintSetting('doc_titles',JSON.stringify(_docTitleTemp));
    _printDocTitles=[..._docTitleTemp];
    _renderPrintTitleDropdown();
    closeModal('modal-doc-titles');
    showToast('บันทึกหัวข้อสำเร็จ','success');
  }catch(e){showToast('บันทึกไม่สำเร็จ','danger');}
}

// Rescale preview when window resizes
window.addEventListener('resize',function(){
  if(document.getElementById('page-print')?.classList.contains('active'))_scalePrintPreview();
});

// Print guard: only show preview content when user is on print-docs page
window.addEventListener('beforeprint',function(){
  if(document.getElementById('page-print')?.classList.contains('active'))document.body.classList.add('print-docs');
});
window.addEventListener('afterprint',function(){
  document.body.classList.remove('print-docs');
});

/* ══════════════════════════════════════════════
   PWA: manifest, service worker, install button, offline/update banners
══════════════════════════════════════════════ */
(function initPWA(){
  // 1) manifest แบบ dynamic — ผูก start_url เข้ากับโครงการปัจจุบัน (?site=) เพื่อให้ไอคอนที่ติดตั้งเปิดโครงการที่ถูกต้อง
  // หมายเหตุสำคัญ: manifest นี้ถูก serve ผ่าน blob: URL ซึ่ง "resolve" path แบบ relative ไม่ได้
  // (browser จะ ignore start_url/scope/icons.src ทั้งหมดว่า URL is invalid) จึงต้องแปลงทุก URL ให้เป็น absolute ก่อน
  const _baseHref=location.origin+location.pathname.replace(/[^/]*$/,'');
  const _manUrl=new URL('../manifest-training.json',location.href).href;
  // โหมดฝังใน Backoffice (iframe) ติดตั้งแอปจาก iframe ไม่ได้ — ไม่ต้องดึง manifest ซ้ำ
  if(!EMBED)fetch(_manUrl).then(r=>r.json()).then(m=>{
    m.start_url=`${_baseHref}index.html?site=${encodeURIComponent(currentSite)}`;
    m.scope=_baseHref;
    m.id=m.start_url;
    if(Array.isArray(m.icons))m.icons=m.icons.map(ic=>({...ic,src:new URL(ic.src,_manUrl).href}));
    const blob=new Blob([JSON.stringify(m)],{type:'application/json'});
    const link=document.getElementById('pwa-manifest-link');
    if(link)link.href=URL.createObjectURL(blob);
  }).catch(()=>{});

  // 2) Service Worker ตัวเดียวกับ Backoffice (/sw.js คุมทั้งเว็บ ดึงไฟล์ใหม่จากเซิร์ฟเวอร์ก่อนเสมอ)
  // ห้ามมี SW ของตัวเองซ้อน — เคยทำให้มือถือ/PWA ค้างไฟล์เวอร์ชันเก่า · มีเวอร์ชันใหม่: ว่าง → รีโหลดเอง,
  // กำลังกรอก/เปิดหน้าต่างอยู่ → แสดงแถบ "มีเวอร์ชันใหม่" ให้กดเอง (ไม่ทำข้อมูลที่กรอกหาย)
  if('serviceWorker' in navigator && window.isSecureContext){
    navigator.serviceWorker.register('/sw.js').then(reg=>{
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)reg.update().catch(()=>{});});
    }).catch(e=>console.error('SW register failed',e));
    const _busy=()=>!!document.querySelector('[id^="modal-"].open')||/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement||{}).tagName||'');
    let _reloadedForUpdate=false;
    // เปิดครั้งแรก SW เพิ่งติดตั้งแล้วเข้ามาคุมหน้า (ยังไม่เคยมีตัวคุม) = หน้านี้ใหม่อยู่แล้ว ไม่ต้องรีโหลด
    // (เดิมรีโหลดทิ้ง → ?admin=1 หายจาก URL หน้าผู้ดูแลกลายเป็นหน้าลงทะเบียน) — แบบเดียวกับ src/app.js
    const _hadController=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(_reloadedForUpdate||!_hadController)return;
      if(_busy()){document.getElementById('update-banner')?.classList.add('show');return;}
      _reloadedForUpdate=true;
      location.reload();
    });
  }

  // 3) แบนเนอร์ "มีเวอร์ชันใหม่" — กดอัปเดต = โหลดหน้าใหม่
  window.pwaApplyUpdate=function(){location.reload();};

  // 4) แบนเนอร์ออฟไลน์/ออนไลน์ + ซิงค์ข้อมูลอัตโนมัติเมื่อกลับมาออนไลน์
  function _updateOnlineStatus(){
    document.getElementById('offline-banner')?.classList.toggle('show',!navigator.onLine);
  }
  window.addEventListener('offline',_updateOnlineStatus);
  window.addEventListener('online',()=>{
    _updateOnlineStatus();
    showToast('กลับมาออนไลน์แล้ว กำลังซิงค์ข้อมูล...','info');
    _scheduleRtRefresh();
    if(!_rtChannel)initRealtime();
  });
  _updateOnlineStatus();
})();

// INIT
initApp();
// Enable native select overlay on non-Line touch devices only
// Line WebView does not open OS picker for invisible selects; uses inline dropdown instead
if('ontouchstart' in window && !/Line\//.test(navigator.userAgent)){
  document.querySelectorAll('.csel-native-select').forEach(s=>s.style.pointerEvents='auto');
}
