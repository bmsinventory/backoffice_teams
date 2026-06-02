// auth-sb.js — ใช้ Supabase แทน Firebase Auth
// window.getColRef, getDocRef, setDoc, updateDoc, deleteDoc, writeBatch, getDocs, onSnapshot
// ถูก expose โดย supabase-adapter.js ก่อนแล้ว

const { esc, fd, fc, fca, pd, gS, gT, gG, gSt, gC, avC, uid, getFY, getYearBE,
        getStaffOverlaps, overlapWarnText, getStaffLeaveConflicts,
        getColRef, getDocRef } = window;

// auth.currentUser reflects actual login state (backward-compat with module files)
window.auth = {};
Object.defineProperty(window.auth, 'currentUser', {
  get: function () { return window.cu || null; },
  configurable: true,
});

// ── Seed ข้อมูลเริ่มต้นถ้า Supabase ว่างเปล่า ──
async function seedDatabaseIfEmpty() {
  try {
    const deptsSnap = await window.getDocs(getColRef('DEPARTMENTS'));
    if (deptsSnap.empty) {
      const dBatch = window.writeBatch();
      ['ติดตั้งระบบคลังสินค้า','ติดตั้งระบบและดูแลหลังการขาย','ติดตั้งระบบบัญชี','แผนกวิเคราะห์ข้อมูล','แผนกฝึกอบรม'].forEach(function(name,i){
        var did='DEPT_'+(i+1);
        dBatch.set(getDocRef('DEPARTMENTS',did),{dept_id:did,label_th:name});
      });
      await dBatch.commit();
    }

    const usersSnap = await window.getDocs(getColRef('USERS'));
    if (usersSnap.empty) {
      const batch = window.writeBatch();
      [{id:'U1',username:'admin',password:'admin123',role:'admin',name:'Admin User'},
       {id:'U2',username:'pm1',password:'pm1234',role:'pm',name:'Project Manager 1'},
       {id:'U3',username:'viewer',password:'view1234',role:'viewer',name:'Viewer User'}]
        .forEach(u => batch.set(getDocRef('USERS',u.id),u));
      [{id:'pending',label:'รอดำเนินการ',color:'#9ba3b8',order:1},
       {id:'plan',label:'วางแผน',color:'#ffa62b',order:2},
       {id:'exec',label:'ดำเนินการ',color:'#4361ee',order:3},
       {id:'deliver',label:'ส่งมอบ',color:'#7c5cfc',order:4},
       {id:'close',label:'ปิดโครงการ',color:'#06d6a0',order:5}]
        .forEach(s => batch.set(getDocRef('STAGES',s.id),s));
      [{id:'gen',label:'General',color:'#4361ee'},{id:'urg',label:'Urgent',color:'#ff6b6b'}]
        .forEach(t => batch.set(getDocRef('PTYPES',t.id),t));
      await batch.commit();
    }
  } catch(err) {
    console.warn('seed error:', err.message);
  }
}

// ── Realtime listeners ──
function setupRealtimeListeners() {
  const colls = ['STAGES','PTYPES','PGROUPS','STAFF','USERS','PROJECTS','ADVANCES',
                 'LODGINGS','POSITIONS','HOLIDAYS','LEAVES','TIMESHEETS','COSTS','DEPARTMENTS'];
  let loadCount = 0;

  const checkLoaded = () => {
    loadCount++;
    if (loadCount === colls.length) {
      window.isDbLoaded = true;
      window.hideLoader();
      window._mobileInit && window._mobileInit();
      if (window.cu) {
        window.setupUser(); window.renderAll(); window.startAutoStageLoop();
        if(window.checkDailyNotifications && window._settingsLoaded) window.checkDailyNotifications();
        else window._pendingDailyCheck = true;
        window._handleDeepLink && window._handleDeepLink();
      }
    } else if (loadCount > colls.length) {
      // ไม่ render และไม่เรียก runAutoStage ที่นี่
      // runAutoStage รันบน timer (ทุก 60 นาที) จาก startAutoStageLoop อยู่แล้ว
    }
  };

  window.onSnapshot(getColRef('STAGES'), s => {
    window.STAGES = s.docs.map(doc=>{let d=doc.data();return{id:d.stage_id||d.id,label:d.label_th||d.label,color:d.color_hex||d.color,order:d.order||99,autoRule:d.auto_rule||'',autoOffset:Number(d.auto_offset||0),setProgress:Number(d.set_progress||-1)};}).sort((a,b)=>a.order-b.order);
    checkLoaded();
  }, e=>window.showDbError(e));

  window.onSnapshot(getColRef('PTYPES'), s => {
    window.PTYPES = s.docs.map(doc=>{let d=doc.data();return{id:d.type_id||d.id,label:d.label_th||d.label,color:d.color_hex||d.color};});
    checkLoaded();
  }, e=>window.showDbError(e));

  window.onSnapshot(getColRef('PGROUPS'), s => {
    window.PGROUPS = s.docs.map(doc=>{let d=doc.data();return{id:d.group_id||d.id,label:d.label_th||d.label,color:d.color_hex||d.color};});
    checkLoaded();
  }, e=>window.showDbError(e));

  window.onSnapshot(getColRef('STAFF'), s => {
    window.STAFF = s.docs.map(doc=>{
      let d=doc.data();
      return{id:d.staff_id||d.id,name:d.full_name||d.name||'',nickname:d.nickname||(d.full_name||d.name||'').split(' ')[0],dept:d.department||d.dept,role:d.position||d.role,email:d.email,phone:d.phone,active:d.is_active!==false&&d.is_active!=='FALSE',start_date:d.start_date,birth_date:d.birth_date,remark:d.remark,dailyRate:d.daily_rate!=null?Number(d.daily_rate):null};
    });
    checkLoaded();
  }, e=>window.showDbError(e));

  window.onSnapshot(getColRef('USERS'), s => {
    window.USERS = s.docs.map(doc=>{
      let d=doc.data();
      return{id:d.user_id||d.id,username:d.username,password:d.password,name:d.name||d.display_name||'',role:d.role,active:d.is_active!==false&&d.is_active!=='FALSE',staffId:d.staff_id||''};
    });
    checkLoaded();
  }, e=>window.showDbError(e));

  window.onSnapshot(getColRef('PROJECTS'), s => {
    window.PROJECTS = s.docs.map(doc=>{
      let d=doc.data();
      var rawStart=d.start_date||d.startDate||d.start||'';
      var rawEnd=d.end_date||d.endDate||d.end||'';
      var rawR1=d.revisit_1||d.revisit1||'';
      var rawR2=d.revisit_2||d.revisit2||'';
      return{id:d.project_id||d.id,name:d.project_name||d.name||'',groupId:d.group_id||'',siteOwner:d.site_owner||'',installer:d.installer_name||'',typeId:d.type_id||'',stage:d.stage_id||d.stage||'init',cost:Number(d.budget||d.cost)||0,start:rawStart,end:rawEnd,revisit1:rawR1,revisit2:rawR2,parentProjectId:d.parent_project_id||'',revisitRound:Number(d.revisit_round)||0,progress:Number(d.progress_pct||d.progress)||0,note:d.note||'',status:d.status||'active',pm:d.pm_staff_id||d.pm||'',team:d.team||[],members:d.members||[],isBorder:d.is_border===true||d.is_border==='TRUE',contractId:d.contract_id||'',visits:(d.visits||[]).map(function(v){return{id:v.id||('V'+Math.random().toString(36).slice(2,7)),no:v.no||1,start:v.start||v.start_date||'',end:v.end||v.end_date||'',purpose:v.purpose||'',team:v.team||[],status:v.status||'planned',note:v.note||''};})};
    });
    checkLoaded();
    if(window.cu && window.isDbLoaded){
      var _von=function(id){var el=document.getElementById(id);return el&&el.classList.contains('on');};
      if(_von('view-overview'))     window.renderOverview&&window.renderOverview();
      else if(_von('view-kanban'))  window.renderKanban&&window.renderKanban();
      else if(_von('view-projects'))window.renderProjects&&window.renderProjects();
      else if(_von('view-workload'))window.renderWorkload&&window.renderWorkload();
      else if(_von('view-calendar'))window.renderCalendar&&window.renderCalendar();
      else if(_von('view-availability'))window.renderAvailability&&window.renderAvailability();
    }
  }, e=>window.showDbError(e));

  window.onSnapshot(getColRef('ADVANCES'), s => {
    window.ADVANCES = s.docs.map(doc=>{
      let d=doc.data();
      return{id:d.advance_id||d.id,pid:d.project_id||d.pid,purpose:d.purpose||'',amount:Number(d.amount_requested||d.amount)||0,cleared:Number(d.amount_cleared||d.cleared)||0,rdate:d.request_date||d.rdate||'',ddate:d.due_date||d.ddate||'',status:d.status||'draft',note:d.note||'',advno:d.advance_no||d.advno||'',expenseItems:d.expense_items||[],laborItems:d.labor_items||[]};
    });
    checkLoaded();
  }, e=>window.showDbError(e));

  window.onSnapshot(getColRef('LODGINGS'), s => {
    window.LODGINGS = s.docs.map(doc=>{
      let d=doc.data();
      function bv(k){return d[k]===true||d[k]==='TRUE';}
      return{id:d.lodging_id||d.id,pid:d.project_id||d.pid,name:d.lodging_name||d.name||'',mapUrl:d.map_url||'',phone:d.phone||'',checkIn:d.check_in||'',checkOut:d.check_out||'',
        dsQty:Number(d.ds_qty)||0,dsRate:Number(d.ds_rate)||0,ddQty:Number(d.dd_qty)||0,ddRate:Number(d.dd_rate)||0,dTotal:Number(d.d_total)||0,
        dWifi:bv('d_wifi'),dPillow:bv('d_pillow'),dBlanket:bv('d_blanket'),dApp:bv('d_appliance'),dPark:bv('d_parking'),dAc:bv('d_ac'),dFridge:bv('d_fridge'),dWasher:bv('d_washer'),dTv:bv('d_tv'),dShower:bv('d_shower'),dBreakfast:bv('d_breakfast'),dTowel:bv('d_towel'),dCustom:d.d_custom||'',
        dDeposit:Number(d.d_deposit)||0,dDepositNote:d.d_deposit_note||'',
        msQty:Number(d.ms_qty)||0,msRate:Number(d.ms_rate)||0,mdQty:Number(d.md_qty)||0,mdRate:Number(d.md_rate)||0,mTotal:Number(d.m_total)||0,
        mWifi:bv('m_wifi'),mPillow:bv('m_pillow'),mBlanket:bv('m_blanket'),mApp:bv('m_appliance'),mPark:bv('m_parking'),mAc:bv('m_ac'),mFridge:bv('m_fridge'),mWasher:bv('m_washer'),mTv:bv('m_tv'),mShower:bv('m_shower'),mBreakfast:bv('m_breakfast'),mBedsheet:bv('m_bedsheet'),mTowel:bv('m_towel'),mCustom:d.m_custom||'',
        mDeposit:Number(d.m_deposit)||0,mDepositNote:d.m_deposit_note||'',mWater:d.m_water||'',mElectric:d.m_electric||'',mExtras:d.m_extras||'',mInclUtil:bv('m_incl_util'),
        total:Number(d.grand_total||d.total)||0,note:d.note||'',approved:d.approved||'',approvedAt:d.approved_at||'',approvedBy:d.approved_by||'',approvedDaily:d.approved_daily||'',approvedMonthly:d.approved_monthly||''};
    });
    checkLoaded();
  }, e=>window.showDbError(e));

  window.onSnapshot(getColRef('POSITIONS'), s => {
    window.POSITIONS = s.docs.map(doc=>{let d=doc.data();return{id:d.position_id||d.id,label:d.label_th||d.label,dailyRate:Number(d.daily_rate)||0};});
    checkLoaded();
  }, e=>window.showDbError(e));

  window.onSnapshot(getColRef('HOLIDAYS'), s => {
    function _holNorm(raw){if(!raw)return'';var m=raw.match(/^(\d{4})(-.+)$/);if(!m)return raw;var y=Number(m[1]);return(y>=2500?(y-543):y)+m[2];}
    window.HOLIDAYS = s.docs.map(doc=>{let d=doc.data();return{id:d.holiday_id||d.id,name:d.name||'',date:_holNorm(d.date||''),type:d.type||'national'};}).sort(function(a,b){return(a.date||'').localeCompare(b.date||'');});
    checkLoaded();
    if(window.cu&&window.isDbLoaded&&document.getElementById('view-holidays')&&document.getElementById('view-holidays').classList.contains('on'))window.renderHolidays&&window.renderHolidays();
    if(window.cu&&window.isDbLoaded&&window.calTime==='month')window.renderCalendar&&window.renderCalendar();
  }, e=>window.showDbError(e));

  window.onSnapshot(getColRef('LEAVES'), s => {
    window.LEAVES = s.docs.map(doc=>{let d=doc.data();return{id:d.leave_id||d.id,staffId:d.staff_id||'',leaveType:d.leave_type||'other',startDate:d.start_date||'',endDate:d.end_date||'',substituteId:d.substitute_id||'',note:d.note||'',status:d.status||'pending',approvedBy:d.approved_by||''};});
    checkLoaded();
    if(window.cu&&window.isDbLoaded&&document.getElementById('view-leave')&&document.getElementById('view-leave').classList.contains('on'))window.renderLeave&&window.renderLeave();
    if(window.cu&&window.isDbLoaded&&document.getElementById('view-calendar')&&document.getElementById('view-calendar').classList.contains('on'))window.renderCalendar&&window.renderCalendar();
  }, e=>window.showDbError(e));

  window.onSnapshot(getColRef('TIMESHEETS'), s => {
    window.TIMESHEETS = s.docs.map(doc=>{let d=doc.data();return{id:d.timesheet_id||d.id,pid:d.project_id||d.pid||'',staffId:d.staff_id||'',workDate:d.work_date||'',visitStart:d.visit_start||'',visitEnd:d.visit_end||'',hours:Number(d.hours)||0,category:d.category||'other',description:d.description||'',source:d.source||''};});
    checkLoaded();
    if(window.cu&&window.isDbLoaded&&document.getElementById('view-timesheet')&&document.getElementById('view-timesheet').classList.contains('on'))window.renderTimesheet&&window.renderTimesheet();
    if(window.cu&&window.isDbLoaded&&document.getElementById('view-cost')&&document.getElementById('view-cost').classList.contains('on'))window.renderCost&&window.renderCost();
  }, e=>window.showDbError(e));

  window.onSnapshot(getColRef('COSTS'), s => {
    window.COSTS = s.docs.map(doc=>{let d=doc.data();return{id:d.cost_id||d.id,pid:d.project_id||d.pid||'',staffId:d.staff_id||'',category:d.category||'other',amount:Number(d.amount)||0,costDate:d.cost_date||'',description:d.description||'',receiptNo:d.receipt_no||'',source:d.source||'',advanceId:d.advance_id||''};});
    checkLoaded();
    if(window.cu&&window.isDbLoaded&&document.getElementById('view-cost')&&document.getElementById('view-cost').classList.contains('on'))window.renderCost&&window.renderCost();
  }, e=>window.showDbError(e));

  window.onSnapshot(getColRef('DEPARTMENTS'), s => {
    window.DEPT_LIST = s.docs.map(doc=>{let d=doc.data();return{id:d.dept_id||d.id,label:d.label_th||d.label||''};}).sort((a,b)=>a.label.localeCompare(b.label,'th'));
    if(window.DEPT_LIST.length>0) window.DEPARTMENTS=window.DEPT_LIST.map(d=>d.label);
    checkLoaded();
  }, e=>window.showDbError(e));

  // WORK_LOGS — background
  window.onSnapshot(getColRef('WORK_LOGS'), s => {
    window.WORK_LOGS = s.docs.map(doc=>{
      let d=doc.data();
      return{id:d.id||doc.id,uid:d.uid||'',staffId:d.staffId||d.staff_id||'',type:d.type||'daily',scope:d.scope||'personal',date:d.date||'',startDate:d.start_date||d.startDate||'',endDate:d.end_date||d.endDate||'',totalDays:Number(d.total_days||d.totalDays)||1,category:d.category||'other',locationType:d.location_type||d.locationType||'local',destination:d.destination||'',title:d.title||'',detail:d.detail||'',participants:d.participants||[],createdAt:d.created_at||d.createdAt||''};
    }).sort(function(a,b){var da=a.type==='daily'?a.date:a.startDate;var db=b.type==='daily'?b.date:b.startDate;return(db||'').localeCompare(da||'');});
    var _von=function(id){var el=document.getElementById(id);return el&&el.classList.contains('on');};
    if(window.cu&&_von('view-worklog'))    window.renderWorkLog&&window.renderWorkLog();
    if(window.cu&&_von('view-calendar'))   window.renderCalendar&&window.renderCalendar();
    if(window.cu&&_von('view-availability')) window.renderAvailability&&window.renderAvailability();
  }, e=>window.showDbError(e));

  // CONTRACTS — background
  window.onSnapshot(getColRef('CONTRACTS'), s => {
    window.CONTRACTS = s.docs.map(doc=>{let d=doc.data();return{id:d.contract_id||doc.id,name:d.project_name||'',customer:d.customer_name||'',value:Number(d.total_contract_value||d.value)||0,signDate:d.contract_sign_date||'',startDate:d.contract_start_date||'',endDate:d.end_date||'',note:d.note||'',status:d.status||'active'};});
    if(window.cu&&document.getElementById('view-contract')&&document.getElementById('view-contract').classList.contains('on'))window.renderContract&&window.renderContract();
  }, e=>window.showDbError(e));

  // HSP_PRODUCTS — background
  window.onSnapshot(getColRef('HSP_PRODUCTS'), s => {
    window.HSP_PRODUCTS = s.docs.map(doc=>{let d=doc.data();return{id:d.product_id||doc.id,name:d.name||'',color:d.color||'#7c3aed',note:d.note||'',group:d.group||''};}).sort((a,b)=>a.name.localeCompare(b.name,'th'));
    if(window.cu&&document.getElementById('view-hospital')&&document.getElementById('view-hospital').classList.contains('on')){
      window.renderHspProductMgmt&&window.renderHspProductMgmt();
      if(window._hspViewMode==='analysis')window.renderHspAnalysis&&window.renderHspAnalysis();
    }
    if(window.cu&&window.admCur==='hsp_products')window.admTab&&window.admTab('hsp_products');
  }, e=>window.showDbError(e));

  // HOSPITALS — background
  window.onSnapshot(getColRef('HOSPITALS'), s => {
    window.HOSPITALS = s.docs.map(doc=>{let d=doc.data();return{id:d.hospital_id||doc.id,code:d.code||'',name:d.name||'',type:d.type||'other',beds:Number(d.beds)||0,province:d.province||'',district:d.district||'',tambon:d.tambon||'',address:d.address||'',tel:d.tel||'',website:d.website||'',affiliation:d.affiliation||'',note:d.note||'',contacts:Array.isArray(d.contacts)?d.contacts:[],products:Array.isArray(d.products)?d.products:[]};});
    if(window.cu&&document.getElementById('view-hospital')&&document.getElementById('view-hospital').classList.contains('on')){
      var _vm=window._hspViewMode||'dashboard';
      if(_vm==='dashboard')window.renderHspDashboard&&window.renderHspDashboard();
      else if(_vm==='analysis'){window._hspPopulateFilters&&window._hspPopulateFilters();window.renderHspAnalysis&&window.renderHspAnalysis();}
      else{window._hspPopulateFilters&&window._hspPopulateFilters();window.renderHospital&&window.renderHospital();}
    }
  }, e=>window.showDbError(e));

  // SETTINGS doc 'app'
  window.onSnapshot(getDocRef('SETTINGS','app'), function(snap){
    var d=snap.exists()?snap.data():{};
    window.NOTIFY_TOKEN=d.notify_token||'';
    window.NOTIFY_ADVANCE_TOKEN=d.notify_advance_token||'';
    window.NOTIFY_PROJECT_TOKEN=d.notify_project_token||'';
    window._settingsLoaded = true;
    if(window.isDbLoaded && window._pendingDailyCheck && window.checkDailyNotifications){
      window._pendingDailyCheck = false;
      window.checkDailyNotifications();
    }
    var _rawTargets=d.year_targets||[];
    window.YEAR_TARGETS=_rawTargets.filter(function(t){return t.year&&!t._typeGroups;});
    var _pbGroups=(_rawTargets.find(function(t){return!!t._typeGroups;})||{})._typeGroups||[];
    if(_pbGroups.length){
      window.TARGET_TYPE_GROUPS=_pbGroups;
      try{localStorage.setItem('_tgt_groups',JSON.stringify(_pbGroups));}catch(e){}
    } else {
      try{var _ls=localStorage.getItem('_tgt_groups');window.TARGET_TYPE_GROUPS=_ls?JSON.parse(_ls):[];}catch(e){window.TARGET_TYPE_GROUPS=[];}
    }
    if(d.tgt_grouped!==undefined){
      try{localStorage.setItem('tgt_grouped',d.tgt_grouped?'1':'0');}catch(e){}
    }
    if(window.cu&&window.isDbLoaded){
      var _von2=function(id){var el=document.getElementById(id);return el&&el.classList.contains('on');};
      if(_von2('view-overview')) window.renderOverview&&window.renderOverview();
      if(_von2('view-targets')) window.renderTargets&&window.renderTargets();
    }
    window.SETTINGS={
      allowance_weekday_normal:  Number(d.allowance_weekday_normal)  || 350,
      allowance_holiday_normal:  Number(d.allowance_holiday_normal)  || 650,
      allowance_weekday_border:  Number(d.allowance_weekday_border)  || 650,
      allowance_holiday_border:  Number(d.allowance_holiday_border)  || 1250,
    };
  });

  // SETTINGS doc 'role_permissions'
  window.onSnapshot(getDocRef('SETTINGS','role_permissions'), function(snap){
    window.ROLE_PERMISSIONS=snap.exists()?snap.data():{};
    if(window.cu) window.setupUser();
  });
}

// ── เริ่ม load ข้อมูลใน background ทันที (ไม่แสดง loader จนกว่าจะ login) ──
var _loadTimeout = null;

seedDatabaseIfEmpty().then(function() {
  setupRealtimeListeners();
}).catch(function(e) {
  console.warn('[auth-sb] init error:', e.message);
});

// ─────────────────────────────────────────────────────────
//  LOGIN / LOGOUT
// ─────────────────────────────────────────────────────────
var DEFAULT_USERS = [
  {id:'U1', username:'admin',  password:'admin123', role:'admin',  name:'Admin User',        active:true},
  {id:'U2', username:'pm1',    password:'pm1234',   role:'pm',     name:'Project Manager 1', active:true},
  {id:'U3', username:'viewer', password:'view1234', role:'viewer', name:'Viewer User',       active:true},
];

function _loginBtnReset(){
  var btn=document.getElementById('login-btn');
  var txt=document.getElementById('lbtn-txt');
  var spin=document.getElementById('lbtn-spin');
  if(btn)btn.disabled=false;
  if(txt)txt.style.display='';
  if(spin)spin.style.display='none';
}
function doLoginNow(u, p) {
  var errEl=document.getElementById('lerr');
  var errMsg=document.getElementById('lerr-msg');
  var infoEl=document.getElementById('linfo');
  var searchList=(window.USERS&&window.USERS.length>0)?window.USERS:DEFAULT_USERS;
  var usr=searchList.find(function(x){return x.username===u&&x.password===p&&x.active!==false;});
  if(!usr){
    if(errMsg)errMsg.textContent='ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง';
    errEl.style.display='flex';infoEl.style.display='none';
    _loginBtnReset();
    return;
  }
  // Remember me
  var remEl=document.getElementById('l-rem');
  if(remEl&&remEl.checked){localStorage.setItem('_bms_rem',usr.username);}
  else{localStorage.removeItem('_bms_rem');}
  window.cu=usr;
  document.getElementById('login').style.display='none';
  document.getElementById('wrap').style.display='flex';
  document.querySelectorAll('.view').forEach(function(v){v.classList.remove('on');});
  document.querySelectorAll('.nav-btn').forEach(function(n){n.classList.remove('on');});
  var defView=document.getElementById('view-overview');
  if(defView){defView.style.display='';defView.classList.add('on');}
  var defNav=document.querySelector('.nav-btn[onclick*="\'overview\'"]');
  if(defNav) defNav.classList.add('on');
  var titleEl=document.getElementById('tp-title');
  if(titleEl) titleEl.textContent='Overview';
  if(window.isDbLoaded){
    window.setupUser();window.renderAll();
    window._handleDeepLink&&window._handleDeepLink();
  } else {
    // ข้อมูลยังโหลดไม่เสร็จ — แสดง loader หลัง login
    window.showLoader('กำลังโหลดข้อมูล...');
    window.setupUser();
    var waitRender=setInterval(function(){
      if(window.isDbLoaded){
        clearInterval(waitRender);
        window.renderAll();
        window._handleDeepLink&&window._handleDeepLink();
      }
    },300);
    setTimeout(function(){clearInterval(waitRender);window.renderAll();window._handleDeepLink&&window._handleDeepLink();},15000);
  }
}

window.doLogin=function(){
  var u=document.getElementById('lu').value.trim();
  var p=document.getElementById('lp').value;
  var errEl=document.getElementById('lerr');
  var errMsg=document.getElementById('lerr-msg');
  if(!u||!p){
    if(errMsg)errMsg.textContent='กรุณากรอก Username และ Password';
    errEl.style.display='flex';return;
  }
  errEl.style.display='none';
  // Show loading state
  var btn=document.getElementById('login-btn');
  var txt=document.getElementById('lbtn-txt');
  var spin=document.getElementById('lbtn-spin');
  if(btn)btn.disabled=true;
  if(txt)txt.style.display='none';
  if(spin)spin.style.display='flex';
  setTimeout(function(){doLoginNow(u,p);},280);
};
window.toggleLoginPw=function(){
  var inp=document.getElementById('lp');
  var showIco=document.getElementById('eye-show');
  var hideIco=document.getElementById('eye-hide');
  if(!inp)return;
  var isHidden=inp.type==='password';
  inp.type=isHidden?'text':'password';
  if(showIco)showIco.style.display=isHidden?'none':'';
  if(hideIco)hideIco.style.display=isHidden?'':'none';
};
// Load saved username (remember me)
(function(){
  var rem=localStorage.getItem('_bms_rem');
  if(rem){
    var luEl=document.getElementById('lu');
    var remEl=document.getElementById('l-rem');
    if(luEl)luEl.value=rem;
    if(remEl)remEl.checked=true;
  }
})();
document.getElementById('login-btn').addEventListener('click',window.doLogin);
document.getElementById('lp').addEventListener('keydown',function(e){if(e.key==='Enter')window.doLogin();});
document.getElementById('lu').addEventListener('keydown',function(e){if(e.key==='Enter')document.getElementById('lp').focus();});

window.doLogout=function(){
  window.cu=null;
  document.getElementById('wrap').style.display='none';
  document.getElementById('login').style.display='flex';
  document.getElementById('lu').value='';
  document.getElementById('lp').value='';
  document.getElementById('lerr').style.display='none';
  document.getElementById('linfo').style.display='none';
  _loginBtnReset();
};

// ─────────────────────────────────────────────────────────
//  setupUser / goView / renderAll
// ─────────────────────────────────────────────────────────
window.setupUser=function(){
  var roleColors={admin:'linear-gradient(135deg,#ff6b6b,#ffa62b)',pm:'linear-gradient(135deg,#7c5cfc,#4cc9f0)',viewer:'linear-gradient(135deg,#06d6a0,#4cc9f0)'};
  var av=document.getElementById('u-av');
  av.textContent=window.cu.name.charAt(0).toUpperCase();
  av.style.background=roleColors[window.cu.role]||'linear-gradient(135deg,#7c5cfc,#ff6b6b)';
  document.getElementById('u-name').textContent=window.cu.name;
  document.getElementById('u-role').textContent=window.roleLabel(window.cu.role);
  document.querySelectorAll('.admin-only').forEach(function(el){el.style.display=(window.isAdmin()||window.canView('admin'))?'':'none';});
  document.querySelectorAll('.ce-only').forEach(function(el){el.style.display=window.ce()?'':'none';});
  document.querySelectorAll('.cl-only').forEach(function(el){el.style.display=window.cl()?'':'none';});
  document.querySelectorAll('.targets-only').forEach(function(el){el.style.display=(window.isAdmin()||window.canView('targets'))?'':'none';});
  var btnImport=document.getElementById('btn-import-top');
  if(btnImport) btnImport.style.display=window.isAdmin()?'':'none';
  var uTab=document.getElementById('at-users');
  if(uTab) uTab.style.display=(window.cu.role==='admin')?'':'none';
  var navModules=['overview','kanban','projects','advance','lodging','workload','calendar','leave','timesheet','cost','targets','hospital','contract'];
  navModules.forEach(function(m){
    var btn=document.querySelector('.nav-btn[onclick*="\''+m+'\'"]');
    if(!btn) return;
    var canSee=window.canView(m);
    btn.style.display=canSee?'':'none';
    if(!canSee) btn.classList.remove('on');
  });
  var activeView=document.querySelector('.view.on');
  if(activeView){
    var vid=activeView.id.replace('view-','');
    if(navModules.indexOf(vid)>=0&&!window.canView(vid)){
      var firstOk=navModules.find(function(m){return window.canView(m);});
      if(firstOk){
        var vLabels={overview:'Overview',kanban:'Delivery Board',projects:'โครงการทั้งหมด',advance:'Advance',lodging:'ระบบจัดหาที่พัก',workload:'สรุปภาระงาน',calendar:'ปฏิทินทีม',leave:'การลางาน',timesheet:'Timesheet',cost:'Cost Tracking',contract:'ข้อมูลสัญญา'};
        document.querySelectorAll('.nav-btn').forEach(function(n){n.classList.remove('on');});
        document.querySelectorAll('.view').forEach(function(v){v.classList.remove('on');});
        var nb=document.querySelector('.nav-btn[onclick*="\''+firstOk+'\'"]');
        if(nb){nb.style.display='';nb.classList.add('on');}
        var vEl=document.getElementById('view-'+firstOk);
        if(vEl){vEl.style.display='';vEl.classList.add('on');}
        var titleEl=document.getElementById('tp-title');
        if(titleEl) titleEl.textContent=vLabels[firstOk]||firstOk;
        var rFn=window['render'+firstOk.charAt(0).toUpperCase()+firstOk.slice(1)];
        if(rFn) rFn();
      }
    }
  }
};

window.goView=function(id,el){
  var _navMods=['overview','kanban','projects','advance','lodging','workload','calendar','leave','timesheet','cost','targets','hospital','contract'];
  if(_navMods.indexOf(id)>=0&&!window.canView(id)){window.showAlert('คุณไม่มีสิทธิ์เข้าถึง Module นี้','warn');return;}
  document.querySelectorAll('.nav-btn').forEach(function(n){n.classList.remove('on');});
  if(el) el.classList.add('on');
  document.querySelectorAll('.view').forEach(function(v){v.classList.remove('on');});
  var v=document.getElementById('view-'+id);
  if(v){v.style.display='';v.classList.add('on');}
  var labels={overview:'Overview',kanban:'Delivery Board',projects:'โครงการทั้งหมด',advance:'Advance',lodging:'ระบบจัดหาที่พัก',workload:'สรุปภาระงาน',availability:'ทีมว่าง',calendar:'ปฏิทินทีม',holidays:'วันหยุด',leave:'การลางาน',timesheet:'Timesheet',cost:'Cost Tracking',targets:'เป้าหมายทีม',hospital:'รายชื่อ รพ.',contract:'ข้อมูลสัญญา'};
  document.getElementById('tp-title').textContent=labels[id]||id;
  document.getElementById('tp-actions').innerHTML='';
  if(id==='overview') window.renderOverview();
  if(id==='kanban') window.renderKanban();
  if(id==='projects') window.renderProjects();
  if(id==='advance') window.renderAdvance();
  if(id==='lodging') window.renderLodging();
  if(id==='workload') window.renderWorkload();
  if(id==='availability'){
    window.avlPopulateDept&&window.avlPopulateDept();
    var avlS=document.getElementById('avl-start'),avlE=document.getElementById('avl-end');
    if(avlS&&!avlS.value){var t=new Date();avlS.value=t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');}
    if(avlE&&!avlE.value){var t2=new Date();t2.setDate(t2.getDate()+29);avlE.value=t2.getFullYear()+'-'+String(t2.getMonth()+1).padStart(2,'0')+'-'+String(t2.getDate()).padStart(2,'0');}
    window.renderAvailability&&window.renderAvailability();
  }
  if(id==='calendar') window.renderCalendar();
  if(id==='targets') window.renderTargets&&window.renderTargets();
  if(id==='holidays') window.renderHolidays();
  if(id==='leave') window.renderLeave();
  if(id==='timesheet') window.renderTimesheet();
  if(id==='cost') window.renderCost();
  if(id==='budget') window.renderBudget&&window.renderBudget();
  if(id==='hospital'){
    var _vm=window._hspViewMode||'dashboard';
    if(_vm==='dashboard')window.renderHspDashboard&&window.renderHspDashboard();
    else if(_vm==='analysis'){window._hspPopulateFilters&&window._hspPopulateFilters();window.renderHspAnalysis&&window.renderHspAnalysis();}
    else{window._hspPopulateFilters&&window._hspPopulateFilters();window.renderHospital&&window.renderHospital();}
  }
  if(id==='contract') window.renderContract&&window.renderContract();
};

window.toggleSB=function(){
  var sb=document.getElementById('sidebar');
  if(window.innerWidth<=768){window.toggleMobSidebar();}
  else{var btn=sb.querySelector('.sb-toggle');sb.classList.toggle('slim');if(btn)btn.textContent=sb.classList.contains('slim')?'▶':'◀';}
};
window.toggleMobSidebar=function(){
  var sb=document.getElementById('sidebar');var ov=document.getElementById('mob-sb-overlay');
  var isOpen=sb.classList.contains('mob-open');
  sb.classList.toggle('mob-open',!isOpen);if(ov)ov.classList.toggle('on',!isOpen);
};
window.closeMobSidebar=function(){
  var sb=document.getElementById('sidebar');var ov=document.getElementById('mob-sb-overlay');
  sb.classList.remove('mob-open');if(ov)ov.classList.remove('on');
};
(function(){
  var _base=window.goView;
  window.goView=function(id,el,noAlert){
    if(window.innerWidth<=768)window.closeMobSidebar();
    return _base(id,el,noAlert);
  };
})();

window.renderAll=function(){
  window.renderOverview&&window.renderOverview();
  window.renderProjects&&window.renderProjects();
  window.renderAdvance&&window.renderAdvance();
  window.renderKanban&&window.renderKanban();
  window.renderWorkload&&window.renderWorkload();
  window.renderCalendar&&window.renderCalendar();
  window.renderLeave&&window.renderLeave();
  window.renderTimesheet&&window.renderTimesheet();
  window.renderCost&&window.renderCost();
  window.renderTargets&&window.renderTargets();
  window.renderBudget&&window.renderBudget();
  var hv=document.getElementById('view-hospital');
  if(hv&&hv.classList.contains('on')){window._hspPopulateFilters&&window._hspPopulateFilters();window.renderHospital&&window.renderHospital();}
  window.renderContract&&window.renderContract();
};

// forceSync — re-fetch ทุก collection แล้ว render ใหม่ (ใช้กับปุ่ม Realtime ใน topbar)
window.forceSync = async function() {
  if (!window.cu || !window.isDbLoaded) return;
  var badge = document.getElementById('tp-status');
  if (badge) badge.innerHTML = '<span class="pulse warn"></span> Syncing...';
  var colls = ['STAGES','PTYPES','PGROUPS','STAFF','USERS','PROJECTS','ADVANCES',
               'LODGINGS','POSITIONS','HOLIDAYS','LEAVES','TIMESHEETS','COSTS',
               'DEPARTMENTS','CONTRACTS','WORK_LOGS','HSP_PRODUCTS','HOSPITALS'];
  try {
    await Promise.all(colls.map(function(col) {
      return window.getDocs(window.getColRef(col)).then(function(snap) {
        // trigger onSnapshot callbacks via manual re-fetch
        if (col === 'STAGES') window.STAGES = snap.docs.map(doc=>{let d=doc.data();return{id:d.stage_id||d.id,label:d.label_th||d.label,color:d.color_hex||d.color,order:d.order||99,autoRule:d.auto_rule||'',autoOffset:Number(d.auto_offset||0),setProgress:Number(d.set_progress||-1)};}).sort((a,b)=>a.order-b.order);
        if (col === 'PTYPES') window.PTYPES = snap.docs.map(doc=>{let d=doc.data();return{id:d.type_id||d.id,label:d.label_th||d.label,color:d.color_hex||d.color};});
        if (col === 'PGROUPS') window.PGROUPS = snap.docs.map(doc=>{let d=doc.data();return{id:d.group_id||d.id,label:d.label_th||d.label,color:d.color_hex||d.color};});
        if (col === 'STAFF') window.STAFF = snap.docs.map(doc=>{let d=doc.data();return{id:d.staff_id||d.id,name:d.full_name||d.name||'',nickname:d.nickname||(d.full_name||d.name||'').split(' ')[0],dept:d.department||d.dept,role:d.position||d.role,email:d.email,phone:d.phone,active:d.is_active!==false&&d.is_active!=='FALSE',start_date:d.start_date,birth_date:d.birth_date,remark:d.remark,dailyRate:d.daily_rate!=null?Number(d.daily_rate):null};});
        if (col === 'USERS') window.USERS = snap.docs.map(doc=>{let d=doc.data();return{id:d.user_id||d.id,username:d.username,password:d.password,name:d.name||d.display_name||'',role:d.role,active:d.is_active!==false&&d.is_active!=='FALSE',staffId:d.staff_id||''};});
        if (col === 'PROJECTS') window.PROJECTS = snap.docs.map(doc=>{let d=doc.data();var rawStart=d.start_date||d.start||'';var rawEnd=d.end_date||d.end||'';return{id:d.project_id||d.id,name:d.project_name||d.name||'',groupId:d.group_id||'',siteOwner:d.site_owner||'',typeId:d.type_id||'',stage:d.stage_id||d.stage||'init',cost:Number(d.budget||d.cost)||0,start:rawStart,end:rawEnd,revisit1:d.revisit_1||'',revisit2:d.revisit_2||'',progress:Number(d.progress_pct||d.progress)||0,note:d.note||'',status:d.status||'active',pm:d.pm_staff_id||d.pm||'',team:d.team||[],members:d.members||[],isBorder:d.is_border===true,contractId:d.contract_id||'',visits:(d.visits||[]).map(function(v){return{id:v.id||window.uid(),no:v.no||1,start:v.start||'',end:v.end||'',purpose:v.purpose||'',team:v.team||[],status:v.status||'planned',note:v.note||''};})};});
        if (col === 'ADVANCES') window.ADVANCES = snap.docs.map(doc=>{let d=doc.data();return{id:d.advance_id||d.id,pid:d.project_id||d.pid,purpose:d.purpose||'',amount:Number(d.amount_requested||d.amount)||0,cleared:Number(d.amount_cleared||d.cleared)||0,rdate:d.request_date||d.rdate||'',ddate:d.due_date||d.ddate||'',status:d.status||'draft',note:d.note||'',advno:d.advance_no||d.advno||'',expenseItems:d.expense_items||[],laborItems:d.labor_items||[]};});
        if (col === 'LODGINGS') window.LODGINGS = snap.docs.map(doc=>{let d=doc.data();function bv(k){return d[k]===true||d[k]==='TRUE';}return{id:d.lodging_id||d.id,pid:d.project_id||d.pid,name:d.lodging_name||d.name||'',mapUrl:d.map_url||'',phone:d.phone||'',checkIn:d.check_in||'',checkOut:d.check_out||'',dsQty:Number(d.ds_qty)||0,dsRate:Number(d.ds_rate)||0,ddQty:Number(d.dd_qty)||0,ddRate:Number(d.dd_rate)||0,dTotal:Number(d.d_total)||0,dWifi:bv('d_wifi'),dPillow:bv('d_pillow'),dBlanket:bv('d_blanket'),dApp:bv('d_appliance'),dPark:bv('d_parking'),dAc:bv('d_ac'),dFridge:bv('d_fridge'),dWasher:bv('d_washer'),dTv:bv('d_tv'),dShower:bv('d_shower'),dBreakfast:bv('d_breakfast'),dTowel:bv('d_towel'),dCustom:d.d_custom||'',dDeposit:Number(d.d_deposit)||0,dDepositNote:d.d_deposit_note||'',msQty:Number(d.ms_qty)||0,msRate:Number(d.ms_rate)||0,mdQty:Number(d.md_qty)||0,mdRate:Number(d.md_rate)||0,mTotal:Number(d.m_total)||0,mWifi:bv('m_wifi'),mPillow:bv('m_pillow'),mBlanket:bv('m_blanket'),mApp:bv('m_appliance'),mPark:bv('m_parking'),mAc:bv('m_ac'),mFridge:bv('m_fridge'),mWasher:bv('m_washer'),mTv:bv('m_tv'),mShower:bv('m_shower'),mBreakfast:bv('m_breakfast'),mBedsheet:bv('m_bedsheet'),mTowel:bv('m_towel'),mCustom:d.m_custom||'',mDeposit:Number(d.m_deposit)||0,mDepositNote:d.m_deposit_note||'',mWater:d.m_water||'',mElectric:d.m_electric||'',mExtras:d.m_extras||'',mInclUtil:bv('m_incl_util'),total:Number(d.grand_total||d.total)||0,note:d.note||'',approved:d.approved||'',approvedAt:d.approved_at||'',approvedBy:d.approved_by||'',approvedDaily:d.approved_daily||'',approvedMonthly:d.approved_monthly||''};});
        if (col === 'POSITIONS') window.POSITIONS = snap.docs.map(doc=>{let d=doc.data();return{id:d.position_id||d.id,label:d.label_th||d.label,dailyRate:Number(d.daily_rate)||0};});
        if (col === 'HOLIDAYS') { function _holNorm(raw){if(!raw)return'';var m=raw.match(/^(\d{4})(-.+)$/);if(!m)return raw;var y=Number(m[1]);return(y>=2500?(y-543):y)+m[2];} window.HOLIDAYS = snap.docs.map(doc=>{let d=doc.data();return{id:d.holiday_id||d.id,name:d.name||'',date:_holNorm(d.date||''),type:d.type||'national'};}).sort((a,b)=>(a.date||'').localeCompare(b.date||'')); }
        if (col === 'LEAVES') window.LEAVES = snap.docs.map(doc=>{let d=doc.data();return{id:d.leave_id||d.id,staffId:d.staff_id||'',leaveType:d.leave_type||'other',startDate:d.start_date||'',endDate:d.end_date||'',substituteId:d.substitute_id||'',note:d.note||'',status:d.status||'pending',approvedBy:d.approved_by||''};});
        if (col === 'TIMESHEETS') window.TIMESHEETS = snap.docs.map(doc=>{let d=doc.data();return{id:d.timesheet_id||d.id,pid:d.project_id||d.pid||'',staffId:d.staff_id||'',workDate:d.work_date||'',visitStart:d.visit_start||'',visitEnd:d.visit_end||'',hours:Number(d.hours)||0,category:d.category||'other',description:d.description||'',source:d.source||''};});
        if (col === 'COSTS') window.COSTS = snap.docs.map(doc=>{let d=doc.data();return{id:d.cost_id||d.id,pid:d.project_id||d.pid||'',staffId:d.staff_id||'',category:d.category||'other',amount:Number(d.amount)||0,costDate:d.cost_date||'',description:d.description||'',receiptNo:d.receipt_no||'',source:d.source||'',advanceId:d.advance_id||''};});
        if (col === 'DEPARTMENTS') { window.DEPT_LIST = snap.docs.map(doc=>{let d=doc.data();return{id:d.dept_id||d.id,label:d.label_th||d.label||''};}).sort((a,b)=>a.label.localeCompare(b.label,'th')); if(window.DEPT_LIST.length>0)window.DEPARTMENTS=window.DEPT_LIST.map(d=>d.label); }
        if (col === 'CONTRACTS') window.CONTRACTS = snap.docs.map(doc=>{let d=doc.data();return{id:d.contract_id||doc.id,name:d.project_name||'',customer:d.customer_name||'',value:Number(d.total_contract_value||d.value)||0,signDate:d.contract_sign_date||'',startDate:d.contract_start_date||'',endDate:d.end_date||'',note:d.note||'',status:d.status||'active'};});
        if (col === 'WORK_LOGS') window.WORK_LOGS = snap.docs.map(doc=>{let d=doc.data();return{id:d.id||doc.id,uid:d.uid||'',staffId:d.staffId||d.staff_id||'',type:d.type||'daily',scope:d.scope||'personal',date:d.date||'',startDate:d.start_date||'',endDate:d.end_date||'',totalDays:Number(d.total_days)||1,category:d.category||'other',locationType:d.location_type||'local',destination:d.destination||'',title:d.title||'',detail:d.detail||'',participants:d.participants||[],createdAt:d.created_at||''};}).sort((a,b)=>(b.type==='daily'?b.date:b.startDate||'').localeCompare(a.type==='daily'?a.date:a.startDate||''));
        if (col === 'HSP_PRODUCTS') window.HSP_PRODUCTS = snap.docs.map(doc=>{let d=doc.data();return{id:d.product_id||doc.id,name:d.name||'',color:d.color||'#7c3aed',note:d.note||'',group:d.group||''};}).sort((a,b)=>a.name.localeCompare(b.name,'th'));
        if (col === 'HOSPITALS') window.HOSPITALS = snap.docs.map(doc=>{let d=doc.data();return{id:d.hospital_id||doc.id,code:d.code||'',name:d.name||'',type:d.type||'other',beds:Number(d.beds)||0,province:d.province||'',district:d.district||'',tambon:d.tambon||'',address:d.address||'',tel:d.tel||'',website:d.website||'',affiliation:d.affiliation||'',note:d.note||'',contacts:Array.isArray(d.contacts)?d.contacts:[],products:Array.isArray(d.products)?d.products:[]};});
      });
    }));
    window.renderAll && window.renderAll();
    window.showAlert && window.showAlert('ซิงค์ข้อมูลเรียบร้อย ✓', 'success');
  } catch(e) {
    console.error('forceSync error:', e);
    window.showAlert && window.showAlert('ซิงค์ไม่สำเร็จ: ' + e.message, 'warn');
  } finally {
    if (badge) badge.innerHTML = '<span class="pulse ok"></span> Realtime';
  }
};

window._handleDeepLink=function(){
  if(window._deepLinkHandled)return;
  var hash=window.location.hash;
  if(!hash)return;
  var m=hash.match(/^#leave=(.+)$/);
  if(!m)return;
  window._deepLinkHandled=true;
  var lvId=decodeURIComponent(m[1]);
  var navBtn=document.querySelector('.nav-btn[onclick*="\'leave\'"]');
  window.goView('leave',navBtn);
  setTimeout(function(){
    var lv=(window.LEAVES||[]).find(function(x){return x.id===lvId;});
    if(lv)window.openLeaveForm&&window.openLeaveForm(lv.id);
    history.replaceState(null,'',window.location.pathname+window.location.search);
  },400);
};
