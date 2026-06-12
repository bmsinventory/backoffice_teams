const { esc, fd, fc, fca, pd, gS, gT, gG, gSt, gC, avC, uid, getFY, getYearBE, getStaffOverlaps, overlapWarnText, getStaffLeaveConflicts, getColRef, getDocRef } = window;
const setDoc    = (...a) => window.setDoc(...a);
const deleteDoc = (...a) => window.deleteDoc(...a);
// ── HOLIDAYS ──
var HOL_TYPE_LABEL={national:'🇹🇭 วันหยุดราชการ',company:'🏢 วันหยุดบริษัท',both:'🎌 วันหยุดราชการ/วันหยุดบริษัท',custom:'⭐ อื่นๆ'};
var HOL_TYPE_COLOR={national:'var(--coral)',company:'var(--violet)',both:'var(--teal)',custom:'var(--amber)'};

window.renderHolidays=function(){
  // แสดง/ซ่อนปุ่ม Add/Import ตามสิทธิ์
  var canAddHol = window.canAdd && window.canAdd('holiday');
  var holAddBtn = document.getElementById('hol-add-btn');
  var holImpBtn = document.getElementById('hol-import-btn');
  if (holAddBtn) holAddBtn.style.display = canAddHol ? '' : 'none';
  if (holImpBtn) holImpBtn.style.display = canAddHol ? '' : 'none';
  var yf=document.getElementById('hol-yr');
  if(yf){
    var prevVal=yf.value;
    yf.innerHTML='<option value="">ทุกปี</option>';
    var yrs=[...new Set(window.HOLIDAYS.map(function(h){return h.date?h.date.slice(0,4):null;}).filter(Boolean))].sort(function(a,b){return b-a;});
    yrs.forEach(function(y){var o=document.createElement('option');var ny=Number(y);o.value=y;o.textContent='ปี พ.ศ. '+(ny>=2500?ny:ny+543);yf.appendChild(o);});
    var cyCE=new Date().getFullYear().toString();
    var cyBE=(new Date().getFullYear()+543).toString();
    if(prevVal&&yrs.includes(prevVal))yf.value=prevVal;
    else if(yrs.includes(cyCE))yf.value=cyCE;
    else if(yrs.includes(cyBE))yf.value=cyBE;
    else if(yrs.length)yf.value=yrs[0];
  }
  var yr=(yf||{}).value||'';
  var list=window.HOLIDAYS.filter(function(h){return!yr||h.date.startsWith(yr);});
  // summary
  var sumEl=document.getElementById('hol-summary');
  if(sumEl){
    var byType={national:list.filter(function(h){return h.type==='national';}).length,company:list.filter(function(h){return h.type==='company';}).length,both:list.filter(function(h){return h.type==='both';}).length,custom:list.filter(function(h){return(h.type||'custom')==='custom';}).length};
    sumEl.innerHTML='<div style="display:flex;gap:10px;flex-wrap:wrap;">'+
      Object.entries(byType).map(function(e){if(!e[1])return'';return'<div style="display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:6px 14px;font-size:12px;">'+(HOL_TYPE_LABEL[e[0]]||e[0])+'<span style="font-weight:700;color:'+HOL_TYPE_COLOR[e[0]]+';">'+e[1]+' วัน</span></div>';}).join('')+
      '<div style="display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:6px 14px;font-size:12px;">ทั้งหมด <span style="font-weight:700;color:var(--violet);">'+list.length+' วัน</span></div>'+
      '</div>';
  }
  // group by month
  var byMonth={};
  list.forEach(function(h){var m=h.date?h.date.slice(0,7):'ไม่ระบุ';if(!byMonth[m])byMonth[m]=[];byMonth[m].push(h);});
  var listEl=document.getElementById('hol-list');if(!listEl)return;
  if(list.length===0){listEl.innerHTML='<div style="text-align:center;padding:48px;color:var(--txt3);font-size:14px;">ยังไม่มีวันหยุด — กด <b>+ เพิ่มวันหยุด</b> หรือ <b>นำเข้าวันหยุด</b></div>';return;}
  var html='';
  Object.keys(byMonth).sort().forEach(function(mk){
    var yy=Number(mk.slice(0,4));var mm=Number(mk.slice(5,7))-1;
    var beY=yy>=2500?yy:yy+543;
    var mLabel=window.THMON?window.THMON[mm]+' '+beY:(mk);
    html+='<div style="margin-bottom:20px;">';
    html+='<div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid var(--violet)30;">📅 '+esc(mLabel)+' <span style="font-size:11px;font-weight:400;color:var(--txt3);">('+byMonth[mk].length+' วัน)</span></div>';
    html+='<div style="display:flex;flex-direction:column;gap:6px;">';
    byMonth[mk].forEach(function(h){
      var dt=h.date?pd(h.date):null;
      var dayName=dt&&window.DNAMES?window.DNAMES[dt.getDay()]:'';
      var dateDisp=h.date?fd(h.date):'ไม่ระบุวัน';
      html+='<div style="display:flex;align-items:center;gap:12px;padding:10px 16px;background:var(--surface);border:1px solid var(--border);border-radius:10px;border-left:4px solid '+(HOL_TYPE_COLOR[h.type]||'var(--violet)')+';" onmouseover="this.style.boxShadow=\'var(--sh-sm)\'" onmouseout="this.style.boxShadow=\'none\'">'
        +'<div style="width:44px;text-align:center;flex-shrink:0;"><div style="font-size:18px;font-weight:800;color:'+(HOL_TYPE_COLOR[h.type]||'var(--violet)')+';">'+esc(h.date?h.date.slice(8,10):'—')+'</div><div style="font-size:9px;color:var(--txt3);">'+esc(dayName)+'</div></div>'
        +'<div style="flex:1;min-width:0;">'
        +'<div style="font-size:13px;font-weight:600;color:var(--txt);">'+esc(h.name)+'</div>'
        +'<div style="font-size:11px;color:var(--txt3);margin-top:2px;">'+dateDisp+' · <span style="color:'+(HOL_TYPE_COLOR[h.type]||'var(--violet)')+';">'+esc(HOL_TYPE_LABEL[h.type]||h.type)+'</span></div>'
        +'</div>'
        +(window.canEdit('holiday')?'<div style="display:flex;gap:6px;flex-shrink:0;">'
          +'<button class="btn btn-ghost btn-sm" onclick="window.openHolForm(\''+h.id+'\')">✏️</button>'
          +(window.canDel('holiday')?'<button class="btn btn-red btn-sm" onclick="window.deleteHoliday(\''+h.id+'\',\''+esc(h.name)+'\')">🗑</button>':'')
          +'</div>':'')
        +'</div>';
    });
    html+='</div></div>';
  });
  listEl.innerHTML=html;
};

// ── LEAVE ──
var LEAVE_TYPE_LABEL={sick:'🤒 ลาป่วย',vacation:'🏖 ลาพักร้อน',personal:'📋 ลากิจ',maternity:'🤱 ลาคลอด',ordain:'🙏 ลาบวช',other:'📝 อื่นๆ'};
var LEAVE_STATUS_LABEL={pending:'⏳ รออนุมัติ',approved:'✅ อนุมัติ',rejected:'❌ ไม่อนุมัติ'};
var LEAVE_STATUS_COLOR={pending:'var(--amber)',approved:'var(--teal)',rejected:'var(--coral)'};

window.renderLeave=function(){
  // Init year dropdown once
  var ySel=document.getElementById('reg-year');
  if(ySel&&!ySel.dataset.init){
    ySel.dataset.init='1';
    var now=new Date().getFullYear();
    for(var y=now+1;y>=now-3;y--){var o=document.createElement('option');o.value=y;o.textContent=y+543;if(y===now)o.selected=true;ySel.appendChild(o);}
  }
  // Init dept dropdown once
  var dSel=document.getElementById('reg-dept');
  if(dSel&&dSel.options.length<=1){
    var depts=[...new Set(window.STAFF.filter(s=>s.active!==false&&s.dept).map(s=>s.dept))].sort();
    depts.forEach(function(d){dSel.insertAdjacentHTML('beforeend','<option value="'+esc(d)+'">'+esc(d)+'</option>');});
  }
  // Init staff dropdown once (filtered by current dept)
  var sfEl=document.getElementById('leave-filter-staff');
  if(sfEl&&!sfEl.dataset.loaded){var initDept=(document.getElementById('reg-dept')||{value:''}).value||'';window.regRefreshStaff(sfEl,initDept);}
  var fYear=parseInt((document.getElementById('reg-year')||{value:''}).value)||0;
  var fMonth=parseInt((document.getElementById('reg-month')||{value:''}).value)||0;
  var fDept=(document.getElementById('reg-dept')||{value:''}).value||'';
  var fStaff=(document.getElementById('leave-filter-staff')||{}).value||'';
  var fType=(document.getElementById('leave-filter-type')||{}).value||'';
  var fStatus=(document.getElementById('leave-filter-status')||{}).value||'';
  // VIEWER: force own-staff filter + hide dept/staff filter controls (but keep add button)
  var _isViewer=window.cu&&window.cu.role==='viewer';
  var _deptPar=document.getElementById('reg-dept')?document.getElementById('reg-dept').parentElement:null;
  var _staffPar=document.getElementById('leave-filter-staff')?document.getElementById('leave-filter-staff').parentElement:null;
  if(_deptPar)_deptPar.style.display=_isViewer?'none':'';
  if(_staffPar)_staffPar.style.display=_isViewer?'none':'';
  if(_isViewer&&window.cu.staffId)fStaff=window.cu.staffId;
  var list=(window.LEAVES||[]).filter(function(lv){
    if(fStaff&&lv.staffId!==fStaff)return false;
    if(fType&&lv.leaveType!==fType)return false;
    if(fStatus&&lv.status!==fStatus)return false;
    if(fDept){var st=window.STAFF.find(s=>s.id===lv.staffId);if(!st||(st.dept||'')!==fDept)return false;}
    if(fYear){
      var s=new Date(lv.startDate),e=new Date(lv.endDate);
      if(isNaN(s)||isNaN(e))return false;
      if(fMonth>0){var mS=new Date(fYear,fMonth-1,1),mE=new Date(fYear,fMonth,0);if(e<mS||s>mE)return false;}
      else{if(s.getFullYear()!==fYear&&e.getFullYear()!==fYear)return false;}
    }
    return true;
  }).slice().sort(function(a,b){return(b.startDate||'').localeCompare(a.startDate||'');});
  var el=document.getElementById('leave-list');if(!el)return;
  var isPM=window.canEdit('leave'),isAdmin=window.isAdmin();
  var today=new Date();today.setHours(0,0,0,0);
  var next7=new Date(today);next7.setDate(next7.getDate()+7);

  // ── Stats ──
  function lvDays(lv){return Math.max(1,Math.ceil((pd(lv.endDate)-pd(lv.startDate))/(864e5))+1);}
  var cPending=list.filter(l=>l.status==='pending').length;
  var cApproved=list.filter(l=>l.status==='approved').length;
  var cRejected=list.filter(l=>l.status==='rejected').length;
  var cUpcoming=list.filter(function(l){
    var s=pd(l.startDate),e=pd(l.endDate);
    return l.status!=='rejected'&&s<=next7.getTime()&&e>=today.getTime();
  }).length;
  var totalDays=list.reduce(function(s,l){return s+lvDays(l);},0);

  var statsHtml='<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px;">';
  [
    {icon:'⏳',label:'รออนุมัติ',val:cPending,color:'var(--amber)',bg:'rgba(255,166,43,.1)',urgent:cPending>0},
    {icon:'✅',label:'อนุมัติแล้ว',val:cApproved,color:'var(--teal)',bg:'rgba(6,214,160,.1)'},
    {icon:'❌',label:'ไม่อนุมัติ',val:cRejected,color:'var(--coral)',bg:'rgba(255,107,107,.1)'},
    {icon:'📆',label:'กำลังลา/ใน 7 วัน',val:cUpcoming,color:'var(--sky)',bg:'rgba(76,201,240,.1)'},
    {icon:'📅',label:'วันลารวม',val:totalDays+' วัน',color:'var(--violet)',bg:'rgba(124,92,252,.1)'},
  ].forEach(function(s){
    statsHtml+='<div class="stat-c" style="padding:14px 16px;'+(s.urgent?'border-color:var(--amber);':'')+'">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
      +'<div style="width:32px;height:32px;border-radius:9px;background:'+s.bg+';display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">'+s.icon+'</div>'
      +'<div style="font-size:10px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;line-height:1.3;">'+s.label+'</div>'
      +'</div>'
      +'<div style="font-size:20px;font-weight:800;color:'+s.color+';">'+s.val+'</div>'
      +'</div>';
  });
  statsHtml+='</div>';

  if(list.length===0){
    el.innerHTML=statsHtml+'<div style="text-align:center;padding:48px 20px;color:var(--txt3);font-size:13px;">ไม่พบรายการลางาน ตามเงื่อนไขที่เลือก</div>';
    return;
  }

  // ── Cards by Dept ──
  var AVATAR_COLS=[
    ['#7c5cfc','#4cc9f0'],['#06d6a0','#4361ee'],['#ff6b6b','#f72585'],
    ['#ffa62b','#ff6b6b'],['#4361ee','#7c5cfc'],['#4cc9f0','#06d6a0'],
  ];
  var S_COLOR={pending:'var(--amber)',approved:'var(--teal)',rejected:'var(--coral)'};
  var S_BG={pending:'rgba(255,166,43,.12)',approved:'rgba(6,214,160,.12)',rejected:'rgba(255,107,107,.12)'};
  var S_LABEL={pending:'⏳ รออนุมัติ',approved:'✅ อนุมัติ',rejected:'❌ ไม่อนุมัติ'};
  var T_BG={sick:'rgba(255,107,107,.12)',vacation:'rgba(76,201,240,.12)',personal:'rgba(67,97,238,.12)',maternity:'rgba(247,37,133,.12)',ordain:'rgba(6,214,160,.12)',other:'rgba(124,92,252,.12)'};
  var T_TC={sick:'#e05555',vacation:'#2aa8cc',personal:'#3a55d0',maternity:'#c01c70',ordain:'#05b386',other:'#6645e0'};
  var DEPT_ICON_COLS=['#7c5cfc','#06d6a0','#ff6b6b','#ffa62b','#4361ee','#4cc9f0','#f72585','#05b386'];

  // Group by dept (sort by dept name, then by startDate desc within each group)
  var deptMap={};
  list.forEach(function(lv){
    var stf=window.STAFF.find(s=>s.id===lv.staffId)||{name:'?',dept:'',role:''};
    var d=stf.dept||'ไม่ระบุแผนก';
    if(!deptMap[d])deptMap[d]=[];
    deptMap[d].push({lv:lv,stf:stf});
  });
  var deptKeys=Object.keys(deptMap).sort(function(a,b){return a.localeCompare(b,'th');});

  function makeCard(lv,stf,globalIdx){
    var sub=lv.substituteId?(window.STAFF.find(s=>s.id===lv.substituteId)||{name:''}).name:'';
    var days=lvDays(lv);
    var sColor=S_COLOR[lv.status]||'var(--txt3)';
    var sBg=S_BG[lv.status]||'transparent';
    var sLabel=S_LABEL[lv.status]||lv.status;
    var typeLabel=LEAVE_TYPE_LABEL[lv.leaveType]||('📝 '+lv.leaveType);
    var tBg=T_BG[lv.leaveType]||'rgba(124,92,252,.12)';
    var tTc=T_TC[lv.leaveType]||'#6645e0';
    var ac=AVATAR_COLS[globalIdx%AVATAR_COLS.length];
    var initial=esc((stf.name||'?').charAt(0));
    var isActive=pd(lv.startDate)<=today.getTime()&&pd(lv.endDate)>=today.getTime()&&lv.status==='approved';
    var isUpcoming=pd(lv.startDate)>today.getTime()&&pd(lv.startDate)<=next7.getTime()&&lv.status!=='rejected';
    var sameDates=lv.startDate===lv.endDate;

    var acts='';
    if(lv.status==='approved'){
      if(isAdmin)acts='<button onclick="window.openLeaveForm(\''+lv.id+'\')" title="แก้ไข" style="'+btnStyle('var(--surface3)','var(--txt2)')+'">✏️</button>'
        +'<button onclick="window.deleteLeave(\''+lv.id+'\')" title="ลบ" style="'+btnStyle('rgba(255,107,107,.1)','var(--coral)')+'">🗑</button>';
      else acts='<span style="font-size:11px;color:var(--txt3);">🔒</span>';
    } else if(lv.status==='pending'){
      if(isPM)acts='<button onclick="window.approveLeave(\''+lv.id+'\')" title="อนุมัติ" style="'+btnStyle('rgba(6,214,160,.15)','#05b386')+';font-size:12px;font-weight:700;padding:5px 12px;">✅ อนุมัติ</button>';
      acts+='<button onclick="window.openLeaveForm(\''+lv.id+'\')" title="แก้ไข" style="'+btnStyle('var(--surface3)','var(--txt2)')+'">✏️</button>'
        +'<button onclick="window.deleteLeave(\''+lv.id+'\')" title="ลบ" style="'+btnStyle('rgba(255,107,107,.1)','var(--coral)')+'">🗑</button>';
    } else if(lv.status==='rejected'){
      if(isPM)acts='<button onclick="window.openLeaveForm(\''+lv.id+'\')" title="แก้ไข" style="'+btnStyle('var(--surface3)','var(--txt2)')+'">✏️</button>'
        +'<button onclick="window.deleteLeave(\''+lv.id+'\')" title="ลบ" style="'+btnStyle('rgba(255,107,107,.1)','var(--coral)')+'">🗑</button>';
    }

    var dotHtml=(isActive?'<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--teal);vertical-align:middle;margin-right:3px;" title="กำลังลาอยู่"></span>':'')
      +(isUpcoming&&!isActive?'<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--amber);vertical-align:middle;margin-right:3px;" title="กำลังจะลา"></span>':'');

    return '<div data-leave-id="'+lv.id+'" style="border:1px solid var(--border);border-left:4px solid '+sColor+';border-radius:10px;background:var(--surface);box-shadow:var(--sh-sm);display:flex;align-items:stretch;overflow:hidden;min-width:0;transition:outline .3s,box-shadow .3s;">'
      // Avatar strip
      +'<div style="width:52px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;padding:14px 0 12px;gap:6px;">'
        +'<div style="width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,'+ac[0]+','+ac[1]+');display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;">'+initial+'</div>'
      +'</div>'
      // Main content
      +'<div style="flex:1;min-width:0;padding:12px 12px 12px 0;display:flex;flex-direction:column;gap:7px;">'
        // Row 1: Name + dot + role
        +'<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'
          +dotHtml
          +'<span style="font-size:14px;font-weight:800;color:var(--txt);">'+esc(stf.name)+'</span>'
          +(stf.role?'<span style="font-size:11px;color:var(--txt3);">'+esc(stf.role)+'</span>':'')
        +'</div>'
        // Row 2: Type badge + date range
        +'<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">'
          +'<span style="padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:'+tBg+';color:'+tTc+';">'+esc(typeLabel)+'</span>'
          +'<span style="font-size:12px;color:var(--txt2);font-weight:600;">'+fd(lv.startDate)+(sameDates?'':' → '+fd(lv.endDate))+'</span>'
        +'</div>'
        // Row 3: Sub + note (optional)
        +((sub||lv.note)?'<div style="font-size:12px;color:var(--txt3);display:flex;flex-direction:column;gap:3px;">'
          +(sub?'<div>🔄 ผู้ทำงานแทน: <span style="color:var(--txt2);font-weight:600;">'+esc(sub)+'</span></div>':'')
          +(lv.note?'<div>📝 '+esc(lv.note)+'</div>':'')
        +'</div>':'')
      +'</div>'
      // Right panel: days + status + actions
      +'<div style="flex-shrink:0;min-width:120px;padding:10px 14px;border-left:1px solid var(--border);background:var(--surface2);display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;gap:4px;">'
        +'<div style="text-align:right;">'
          +'<div style="font-size:24px;font-weight:800;color:var(--violet);line-height:1.1;">'+days+'</div>'
          +'<div style="font-size:10px;color:var(--txt3);font-weight:600;letter-spacing:.3px;">วัน</div>'
        +'</div>'
        +'<div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;">'
          +'<span style="padding:3px 9px;border-radius:20px;font-size:11px;font-weight:700;background:'+sBg+';color:'+sColor+';border:1px solid '+sColor+';">'+sLabel+'</span>'
          +(lv.approvedBy?'<div style="font-size:10px;color:var(--txt3);text-align:right;">โดย <span style="color:var(--txt2);font-weight:600;">'+esc(lv.approvedBy)+'</span></div>':'')
          +(acts?'<div style="display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end;">'+acts+'</div>':'')
        +'</div>'
      +'</div>'
    +'</div>';
  }

  var globalIdx=0;
  var sectionsHtml='';
  deptKeys.forEach(function(dept,di){
    var items=deptMap[dept];
    var dTotal=items.reduce(function(s,x){return s+lvDays(x.lv);},0);
    var dPending=items.filter(x=>x.lv.status==='pending').length;
    var dApproved=items.filter(x=>x.lv.status==='approved').length;
    var dRejected=items.filter(x=>x.lv.status==='rejected').length;
    var dColor=DEPT_ICON_COLS[di%DEPT_ICON_COLS.length];

    sectionsHtml+='<div style="margin-bottom:22px;">'
      // Dept header
      +'<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;margin-bottom:10px;flex-wrap:wrap;">'
        +'<div style="width:34px;height:34px;border-radius:9px;background:'+dColor+';display:flex;align-items:center;justify-content:center;font-size:15px;color:#fff;font-weight:800;flex-shrink:0;">'+esc(dept.charAt(0))+'</div>'
        +'<div style="font-size:14px;font-weight:800;color:var(--txt);">'+esc(dept)+'</div>'
        +'<div style="font-size:12px;color:var(--txt3);">'+items.length+' รายการ · '+dTotal+' วัน</div>'
        +'<div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">'
          +(dPending>0?'<span style="padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(255,166,43,.15);color:var(--amber);">⏳ '+dPending+'</span>':'')
          +(dApproved>0?'<span style="padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(6,214,160,.12);color:var(--teal);">✅ '+dApproved+'</span>':'')
          +(dRejected>0?'<span style="padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(255,107,107,.12);color:var(--coral);">❌ '+dRejected+'</span>':'')
        +'</div>'
      +'</div>'
      // Cards grid for this dept
      +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:8px;">'
        +items.map(function(x){var h=makeCard(x.lv,x.stf,globalIdx);globalIdx++;return h;}).join('')
      +'</div>'
    +'</div>';
  });

  el.innerHTML=statsHtml+sectionsHtml
    +'<div style="padding:4px 2px 0;font-size:11px;color:var(--txt3);text-align:right;">แสดง '+list.length+' รายการ · รวม '+totalDays+' วัน'+(cPending>0?' · <span style="color:var(--amber);font-weight:700;">⏳ รออนุมัติ '+cPending+' รายการ</span>':'')+'</div>';
};

function btnStyle(bg,color){return'padding:4px 8px;border-radius:7px;border:none;cursor:pointer;font-size:13px;background:'+bg+';color:'+color+';font-family:inherit;transition:opacity .15s;';}


window.openLeaveForm=function(id){
  var lv=id?window.LEAVES.find(function(x){return x.id===id;}):null;
  if(lv){
    if(lv.status==='approved'&&!window.isAdmin()){window.showAlert('ไม่สามารถแก้ไขการลาที่อนุมัติแล้วได้','warn');return;}
    if(lv.status==='rejected'&&!window.canEdit('leave')){window.showAlert('คุณไม่มีสิทธิ์แก้ไขรายการที่ไม่อนุมัติ','warn');return;}
  }
  document.getElementById('leave-edit-id').value=lv?lv.id:'';
  var _isViewerForm=window.cu&&window.cu.role==='viewer';
  var _viewerStaffId=_isViewerForm?window.cu.staffId:'';
  var _autoStaff=lv?lv.staffId:(_viewerStaffId||'');
  var staffOpts='<option value="">-- เลือกพนักงาน --</option>'+window.STAFF.filter(s=>s.active).map(s=>`<option value="${s.id}"${s.id===_autoStaff?' selected':''}>${esc(s.name)}</option>`).join('');
  var staffEl=document.getElementById('leavef-staff');
  staffEl.innerHTML=staffOpts;
  if(_isViewerForm){staffEl.disabled=!!_viewerStaffId;staffEl.parentElement.style.opacity=_viewerStaffId?'.7':'1';}
  else{staffEl.disabled=false;staffEl.parentElement.style.opacity='';}

  var subOpts='<option value="">-- ไม่มี --</option>'+window.STAFF.filter(s=>s.active).map(s=>`<option value="${s.id}"${lv&&lv.substituteId===s.id?' selected':''}>${esc(s.name)}</option>`).join('');
  document.getElementById('leavef-sub').innerHTML=subOpts;
  var leaveType=lv?lv.leaveType:'sick';
  document.getElementById('leavef-type').value=leaveType;
  document.getElementById('leavef-type').onchange=function(){window._updateLeaveSubLabel(this.value);};
  // วันที่เริ่ม: แสดงวันปัจจุบันถ้าเป็นรายการใหม่
  var today=new Date();var todayStr=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  document.getElementById('leavef-start').value=lv?lv.startDate:todayStr;
  document.getElementById('leavef-end').value=lv?lv.endDate:'';
  // สถานะ: Viewer เห็นแค่รออนุมัติ
  var stSel=document.getElementById('leavef-status');
  var stGroup=document.getElementById('leavef-status-group');
  if(!window.canEdit('leave')){
    stSel.innerHTML='<option value="pending">⏳ รออนุมัติ</option>';
    stSel.value='pending';
    stGroup.style.display='none';
  } else {
    stSel.innerHTML='<option value="pending">⏳ รออนุมัติ</option><option value="rejected">❌ ไม่อนุมัติ</option>';
    stSel.value=(lv&&lv.status!=='approved')?lv.status:'pending';
    stGroup.style.display='';
  }
  document.getElementById('leavef-note').value=lv?lv.note:'';
  document.getElementById('m-leave-title').textContent=lv?'แก้ไขการลางาน':'เพิ่มการลางาน';
  window._updateLeaveSubLabel(leaveType);
  window.openM('m-leave');
};

window._updateLeaveSubLabel=function(leaveType){
  var lbl=document.getElementById('leavef-sub-label');
  if(!lbl)return;
  lbl.textContent=leaveType==='vacation'?'ผู้ทำงานแทน *':'ผู้ทำงานแทน';
};

window.approveLeave=function(id){
  if(!window.canEdit('leave')){window.showAlert('เฉพาะ DM/PM เท่านั้นที่อนุมัติได้','warn');return;}
  var lv=window.LEAVES.find(function(x){return x.id===id;});
  if(!lv){return;}
  var stName=(window.STAFF.find(s=>s.id===lv.staffId)||{name:'?'}).name;
  window.showConfirm('อนุมัติการลาของ '+stName+' ?',async function(){
    try{
      var rec={leave_id:lv.id,staff_id:lv.staffId,leave_type:lv.leaveType,start_date:lv.startDate,end_date:lv.endDate,substitute_id:lv.substituteId||'',note:lv.note||'',status:'approved',approved_by:window.cu?window.cu.name:''};
      await setDoc(getDocRef('LEAVES',lv.id),rec);
      window.sendLeaveNotify('approved',rec);
    }catch(e){window.showDbError(e);}
  },{icon:'✅',title:'ยืนยันอนุมัติ',okColor:'var(--teal)',okText:'อนุมัติ'});
};

window.saveLeave=async function(){
  var eidCheck=document.getElementById('leave-edit-id').value;
  if(eidCheck ? !window.canEdit('leave') : !window.canAdd('leave')){window.showAlert('คุณไม่มีสิทธิ์บันทึกการลางาน','warn');return;}
  var staffId=document.getElementById('leavef-staff').value;
  var start=document.getElementById('leavef-start').value;
  var end=document.getElementById('leavef-end').value;
  var leaveType=document.getElementById('leavef-type').value;
  var subId=document.getElementById('leavef-sub').value||'';
  var note=document.getElementById('leavef-note').value.trim();
  if(!staffId){window.showAlert('กรุณาเลือกพนักงาน','error');return;}
  if(!start){window.showAlert('กรุณาระบุวันที่เริ่ม','error');return;}
  if(!end){window.showAlert('กรุณาระบุวันที่สิ้นสุด','error');return;}
  if(end<start){window.showAlert('วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่ม','error');return;}
  if(leaveType==='vacation'&&!subId){window.showAlert('กรณีลาพักร้อนต้องระบุผู้ทำงานแทน','warn');return;}
  if(!note){window.showAlert('กรุณาระบุรายละเอียดการลา','error');return;}
  var eid=document.getElementById('leave-edit-id').value;
  var id=eid||('LV'+Date.now());
  var statusVal=document.getElementById('leavef-status').value||'pending';
  if(statusVal==='approved') statusVal='pending'; // อนุมัติได้เฉพาะผ่านปุ่มอนุมัติเท่านั้น
  var approvedBy=(statusVal==='rejected'&&window.cu)?window.cu.name:'';
  var rec={leave_id:id,staff_id:staffId,leave_type:leaveType,start_date:start,end_date:end,substitute_id:subId,note:note,status:statusVal,approved_by:approvedBy};
  try{
    await setDoc(getDocRef('LEAVES',id),rec);
    window._applyLocalDoc('LEAVES',id,rec);
    window.renderLeave&&window.renderLeave();
    window.renderCalendar&&window.renderCalendar();
    window.closeM('m-leave');
    var notifyType=eid?'edit':'new';
    if(statusVal==='rejected') notifyType='rejected';
    window.sendLeaveNotify(notifyType,rec);
  }catch(e){window.showDbError(e);}
};

window.deleteLeave=function(id){
  var lv=window.LEAVES.find(function(x){return x.id===id;});
  if(!lv) return;
  // approved: admin only
  if(lv.status==='approved'&&!window.isAdmin()){window.showAlert('ไม่สามารถลบการลาที่อนุมัติแล้วได้','warn');return;}
  // rejected/pending: must have canDel permission
  if(!window.canDel('leave')&&!window.isAdmin()){window.showAlert('คุณไม่มีสิทธิ์ลบรายการลางาน','warn');return;}
  window.showConfirm('ลบรายการลางานนี้?',function(){
    window._removeLocalDoc('LEAVES',id);
    window.renderLeave&&window.renderLeave();
    window.renderCalendar&&window.renderCalendar();
    deleteDoc(getDocRef('LEAVES',id)).catch(function(e){window.showDbError(e);});
  },{icon:'🗑',title:'ยืนยันการลบ',okColor:'var(--coral)',okText:'ลบ'});
};

window.openHolForm=function(id){
  var h=id?window.HOLIDAYS.find(function(x){return x.id===id;}):null;
  document.getElementById('hol-edit-id').value=h?h.id:'';
  document.getElementById('holf-name').value=h?h.name:'';
  document.getElementById('holf-date').value=h?h.date:'';
  document.getElementById('holf-type').value=h?h.type:'national';
  document.getElementById('m-hol-title').textContent=h?'แก้ไขวันหยุด':'เพิ่มวันหยุด';
  window.openM('m-holiday');
};

window.saveHoliday=async function(){
  var eidHol=document.getElementById('hol-edit-id').value;
  if(eidHol ? !window.canEdit('holiday') : !window.canAdd('holiday')){window.showAlert('คุณไม่มีสิทธิ์จัดการวันหยุด','warn');return;}
  var name=document.getElementById('holf-name').value.trim();
  var date=document.getElementById('holf-date').value;
  if(!name){window.showAlert('กรุณาระบุชื่อวันหยุด','error');return;}
  if(!date){window.showAlert('กรุณาระบุวันที่','error');return;}
  var eid=document.getElementById('hol-edit-id').value;
  var id=eid||('H'+Date.now());
  var rec={holiday_id:id,name:name,date:date,type:document.getElementById('holf-type').value||'national'};
  try{
    await setDoc(getDocRef('HOLIDAYS',id),rec);
    window._applyLocalDoc('HOLIDAYS',id,rec);
    window.renderHolidays&&window.renderHolidays();
    window.renderCalendar&&window.renderCalendar();
    window.closeM('m-holiday');
  }catch(e){window.showDbError(e);}
};

window.deleteHoliday=function(id,name){
  if(!window.canDel('holiday')){window.showAlert('คุณไม่มีสิทธิ์ลบวันหยุด','warn');return;}
  window.showConfirm('ลบวันหยุด "'+name+'" ?',function(){
    window._removeLocalDoc('HOLIDAYS',id);
    window.renderHolidays&&window.renderHolidays();
    window.renderCalendar&&window.renderCalendar();
    deleteDoc(getDocRef('HOLIDAYS',id)).catch(function(e){window.showDbError(e);});
  },{icon:'🗑',title:'ยืนยันการลบ',okColor:'var(--coral)',okText:'ลบ'});
};

window._holParsedRows=[];

window.openHolImport=function(){
  if(!window.canAdd('holiday')){window.showAlert('คุณไม่มีสิทธิ์นำเข้าวันหยุด','warn');return;}
  document.getElementById('hol-import-txt').value='';
  document.getElementById('hol-import-preview').innerHTML='';
  var fs=document.getElementById('hol-file-status');if(fs)fs.style.display='none';
  var fi=document.getElementById('hol-file-input');if(fi)fi.value='';
  var dz=document.getElementById('hol-drop-zone');if(dz){dz.style.borderColor='';dz.style.background='';}
  window._holParsedRows=[];
  window.openM('m-hol-import');
};

window._holParseRows=function(rows){
  // rows: array of arrays or objects from SheetJS
  var result=[];
  rows.forEach(function(r){
    var arr=Array.isArray(r)?r:Object.values(r);
    var name=String(arr[0]||'').trim();
    var date=String(arr[1]||'').trim();
    var type=String(arr[2]||'national').trim().toLowerCase();
    if(!name||!date)return;
    // normalise date: if Excel serial number
    if(!isNaN(Number(date))&&Number(date)>10000){
      try{var d=new Date(Math.round((Number(date)-25569)*86400*1000));date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}catch(e){}
    }
    // format check
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
    // normalize BE → CE
    var dy=Number(date.slice(0,4));if(dy>=2500)date=(dy-543)+date.slice(4);
    if(!['national','company','both','custom'].includes(type))type='national';
    result.push({name:name,date:date,type:type});
  });
  return result;
};

window._holShowStatus=function(rows,filename){
  var fs=document.getElementById('hol-file-status');if(!fs)return;
  if(!rows.length){
    fs.style.display='block';
    fs.innerHTML='<div style="padding:10px 14px;background:rgba(255,107,107,.08);border:1px solid rgba(255,107,107,.25);border-radius:8px;font-size:12px;color:var(--coral);">⚠ ไม่พบข้อมูลที่ถูกต้องในไฟล์ — ตรวจสอบรูปแบบอีกครั้ง</div>';
    return;
  }
  var byType={national:rows.filter(r=>r.type==='national').length,company:rows.filter(r=>r.type==='company').length,custom:rows.filter(r=>r.type==='custom').length};
  var preview=rows.slice(0,5).map(r=>'<tr><td style="padding:3px 8px;border-bottom:1px solid var(--border);">'+esc(r.name)+'</td><td style="padding:3px 8px;border-bottom:1px solid var(--border);font-family:monospace;">'+r.date+'</td><td style="padding:3px 8px;border-bottom:1px solid var(--border);color:'+(HOL_TYPE_COLOR[r.type]||'var(--txt)')+'">'+esc(HOL_TYPE_LABEL[r.type]||r.type)+'</td></tr>').join('');
  fs.style.display='block';
  fs.innerHTML='<div style="background:rgba(6,214,160,.07);border:1px solid rgba(6,214,160,.3);border-radius:10px;padding:10px 14px;">'
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><span style="font-size:14px;">✅</span><span style="font-size:12px;font-weight:600;color:var(--teal);">อ่านไฟล์สำเร็จ: <span style="color:var(--txt);">'+esc(filename||'')+'</span></span>'
    +'<span style="margin-left:auto;font-size:11px;font-weight:700;background:var(--teal);color:#fff;padding:2px 10px;border-radius:20px;">'+rows.length+' รายการ</span></div>'
    +'<div style="display:flex;gap:8px;font-size:10px;margin-bottom:8px;flex-wrap:wrap;">'
    +(byType.national?'<span style="background:rgba(255,107,107,.1);color:var(--coral);padding:2px 8px;border-radius:10px;font-weight:600;">🇹🇭 ราชการ '+byType.national+'</span>':'')
    +(byType.company?'<span style="background:rgba(124,92,252,.1);color:var(--violet);padding:2px 8px;border-radius:10px;font-weight:600;">🏢 บริษัท '+byType.company+'</span>':'')
    +(byType.custom?'<span style="background:rgba(255,166,43,.1);color:var(--amber);padding:2px 8px;border-radius:10px;font-weight:600;">⭐ อื่นๆ '+byType.custom+'</span>':'')
    +'</div>'
    +'<div style="font-size:11px;color:var(--txt3);margin-bottom:6px;">ตัวอย่าง'+(rows.length>5?' (5 รายการแรก)':'')+':</div>'
    +'<table style="width:100%;border-collapse:collapse;font-size:11px;"><thead><tr style="background:var(--surface2)"><th style="padding:3px 8px;text-align:left;font-weight:600;font-size:10px;color:var(--txt3);">ชื่อวันหยุด</th><th style="padding:3px 8px;text-align:left;font-weight:600;font-size:10px;color:var(--txt3);">วันที่</th><th style="padding:3px 8px;text-align:left;font-weight:600;font-size:10px;color:var(--txt3);">ประเภท</th></tr></thead><tbody>'+preview+'</tbody></table>'
    +(rows.length>5?'<div style="font-size:10px;color:var(--txt3);margin-top:4px;">... และอีก '+(rows.length-5)+' รายการ</div>':'')
    +'</div>';
};

window.holHandleFiles=function(files){
  if(!files||!files[0])return;
  var file=files[0];
  var fname=file.name.toLowerCase();
  // reset
  window._holParsedRows=[];
  var dz=document.getElementById('hol-drop-zone');
  if(dz){dz.style.borderColor='var(--violet)';dz.innerHTML='<div style="font-size:20px;margin-bottom:4px;">⏳</div><div style="font-size:12px;color:var(--txt2);">กำลังอ่านไฟล์...</div>';}
  var reader=new FileReader();
  if(fname.endsWith('.csv')){
    reader.onload=function(e){
      if(dz){dz.style.borderColor='var(--border)';dz.innerHTML='<div style="font-size:20px;margin-bottom:4px;">📂</div><div style="font-size:12px;font-weight:600;color:var(--txt);">คลิกหรือลากไฟล์มาวางที่นี่</div><div style="font-size:11px;color:var(--txt3);margin-top:4px;">รองรับ .xlsx, .xls, .csv</div><input type="file" id="hol-file-input" accept=".xlsx,.xls,.csv" style="display:none" onchange="window.holHandleFiles(this.files)">';}
      var text=e.target.result;
      var lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
      // skip header if first cell looks like header
      if(lines.length&&/ชื่อ|name|holiday/i.test(lines[0]))lines=lines.slice(1);
      var rows=lines.map(function(l){return l.split(',');});
      window._holParsedRows=window._holParseRows(rows);
      window._holShowStatus(window._holParsedRows,file.name);
    };
    reader.readAsText(file,'UTF-8');
  } else if(fname.endsWith('.xlsx')||fname.endsWith('.xls')){
    reader.onload=function(e){
      if(dz){dz.style.borderColor='var(--border)';dz.innerHTML='<div style="font-size:20px;margin-bottom:4px;">📂</div><div style="font-size:12px;font-weight:600;color:var(--txt);">คลิกหรือลากไฟล์มาวางที่นี่</div><div style="font-size:11px;color:var(--txt3);margin-top:4px;">รองรับ .xlsx, .xls, .csv</div><input type="file" id="hol-file-input" accept=".xlsx,.xls,.csv" style="display:none" onchange="window.holHandleFiles(this.files)">';}
      try{
        var wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
        var ws=wb.Sheets[wb.SheetNames[0]];
        var data=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        // skip header row(s)
        var startRow=0;
        if(data.length&&/ชื่อ|name|holiday/i.test(String(data[0][0]||'')))startRow=1;
        // skip note row (starts with *)
        while(startRow<data.length&&String(data[startRow][0]||'').startsWith('*'))startRow++;
        var rows=data.slice(startRow);
        window._holParsedRows=window._holParseRows(rows);
        window._holShowStatus(window._holParsedRows,file.name);
      }catch(err){
        var fs=document.getElementById('hol-file-status');
        if(fs){fs.style.display='block';fs.innerHTML='<div style="padding:10px 14px;background:rgba(255,107,107,.08);border:1px solid rgba(255,107,107,.25);border-radius:8px;font-size:12px;color:var(--coral);">⚠ อ่านไฟล์ไม่ได้: '+esc(String(err.message||err))+'</div>';}
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    var fs=document.getElementById('hol-file-status');
    if(fs){fs.style.display='block';fs.innerHTML='<div style="padding:10px 14px;background:rgba(255,107,107,.08);border:1px solid rgba(255,107,107,.25);border-radius:8px;font-size:12px;color:var(--coral);">⚠ ไม่รองรับไฟล์ประเภทนี้ — ใช้ .xlsx, .xls หรือ .csv</div>';}
    if(dz){dz.style.borderColor='var(--border)';}
  }
};

window.holPreviewTxt=function(){
  var raw=(document.getElementById('hol-import-txt')||{}).value||'';
  var lines=raw.split('\n').map(l=>l.trim()).filter(Boolean);
  var ok=lines.filter(function(l){var p=l.split(',');return p.length>=2&&p[1]&&/^\d{4}-\d{2}-\d{2}$/.test(p[1].trim());}).length;
  var bad=lines.length-ok;
  var el=document.getElementById('hol-import-preview');if(!el)return;
  if(!lines.length){el.innerHTML='';return;}
  el.innerHTML='<span style="color:var(--teal);font-weight:600;">✓ '+ok+' รายการถูกต้อง</span>'+(bad>0?' <span style="color:var(--coral);"> · '+bad+' รายการไม่ถูกรูปแบบ (จะถูกข้าม)</span>':'');
};

window.downloadHolTemplate=function(){
  var yr=new Date().getFullYear();
  var rows=[
    ['วันขึ้นปีใหม่', yr+'-01-01', 'national'],
    ['วันมาฆบูชา', yr+'-02-12', 'national'],
    ['วันจักรี', yr+'-04-06', 'national'],
    ['วันสงกรานต์', yr+'-04-13', 'national'],
    ['วันสงกรานต์', yr+'-04-14', 'national'],
    ['วันสงกรานต์', yr+'-04-15', 'national'],
    ['วันแรงงานแห่งชาติ', yr+'-05-01', 'national'],
    ['วันวิสาขบูชา', yr+'-05-11', 'national'],
    ['วันฉัตรมงคล', yr+'-05-04', 'national'],
    ['วันอาสาฬหบูชา', yr+'-07-10', 'national'],
    ['วันเข้าพรรษา', yr+'-07-11', 'national'],
    ['วันเฉลิมพระชนมพรรษา ร.10', yr+'-07-28', 'national'],
    ['วันแม่แห่งชาติ', yr+'-08-12', 'national'],
    ['วันหยุดชดเชย', yr+'-10-13', 'national'],
    ['วันปิยมหาราช', yr+'-10-23', 'national'],
    ['วันพ่อแห่งชาติ', yr+'-12-05', 'national'],
    ['วันรัฐธรรมนูญ', yr+'-12-10', 'national'],
    ['วันสิ้นปี', yr+'-12-31', 'national'],
    ['วันหยุดบริษัท (ตัวอย่าง)', yr+'-06-02', 'company'],
    ['วันหยุดพิเศษ (ตัวอย่าง)', yr+'-09-15', 'custom'],
  ];

  // Build XLSX using SpreadsheetML XML (opens in Excel natively)
  var xmlRows='';
  // Header row with styling
  xmlRows+='<Row ss:StyleID="s62">';
  ['ชื่อวันหยุด','วันที่ (YYYY-MM-DD)','ประเภท (national / company / custom)'].forEach(function(h){
    xmlRows+='<Cell ss:StyleID="s62"><Data ss:Type="String">'+h+'</Data></Cell>';
  });
  xmlRows+='</Row>';
  // Note row
  xmlRows+='<Row ss:StyleID="s63">';
  xmlRows+='<Cell ss:StyleID="s63"><Data ss:Type="String">* กรอกข้อมูลด้านล่าง แล้ว copy คอลัมน์ทั้ง 3 วางในช่องนำเข้า</Data></Cell>';
  xmlRows+='<Cell/><Cell/></Row>';
  // Data rows
  rows.forEach(function(r){
    xmlRows+='<Row>';
    r.forEach(function(cell){
      xmlRows+='<Cell><Data ss:Type="String">'+String(cell).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</Data></Cell>';
    });
    xmlRows+='</Row>';
  });

  var xml='<?xml version="1.0" encoding="UTF-8"?>'
    +'<?mso-application progid="Excel.Sheet"?>'
    +'<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"'
    +' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"'
    +' xmlns:x="urn:schemas-microsoft-com:office:excel">'
    +'<Styles>'
    +'<Style ss:ID="s62"><Font ss:Bold="1" ss:Color="#FFFFFF" ss:Size="11"/><Interior ss:Color="#7C5CFC" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#5a3fd4"/></Borders></Style>'
    +'<Style ss:ID="s63"><Font ss:Italic="1" ss:Color="#888888" ss:Size="9"/><Interior ss:Color="#F5F3FF" ss:Pattern="Solid"/></Style>'
    +'</Styles>'
    +'<Worksheet ss:Name="วันหยุด">'
    +'<Table ss:DefaultColumnWidth="160">'
    +'<Column ss:Width="200"/>'
    +'<Column ss:Width="160"/>'
    +'<Column ss:Width="220"/>'
    +xmlRows
    +'</Table>'
    +'<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">'
    +'<Selected/><FreezePanes/><SplitHorizontal>2</SplitHorizontal><TopRowBottomPane>2</TopRowBottomPane>'
    +'</WorksheetOptions>'
    +'</Worksheet>'
    +'</Workbook>';

  var blob=new Blob(['\uFEFF'+xml],{type:'application/vnd.ms-excel;charset=utf-8'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;a.download='Template_วันหยุด_'+yr+'.xls';
  document.body.appendChild(a);a.click();
  document.body.removeChild(a);URL.revokeObjectURL(url);
};

window.doHolImport=async function(){
  if(!window.canAdd('holiday')){window.showAlert('คุณไม่มีสิทธิ์นำเข้าวันหยุด','warn');return;}
  var records=[];
  // Priority 1: file upload parsed rows
  if(window._holParsedRows&&window._holParsedRows.length){
    records=window._holParsedRows.map(function(r){return{holiday_id:'H'+Date.now()+Math.random().toString(36).slice(2,5),name:r.name,date:r.date,type:r.type};});
  } else {
    // Priority 2: manual CSV textarea
    var raw=(document.getElementById('hol-import-txt')||{}).value||'';
    var lines=raw.split('\n').map(function(l){return l.trim();}).filter(Boolean);
    if(!lines.length){window.showAlert('ไม่มีข้อมูล — อัปโหลดไฟล์หรือวาง CSV ในช่องด้านล่าง','warn');return;}
    lines.forEach(function(line){
      var parts=line.split(',').map(function(p){return p.trim();});
      var name=parts[0];var date=parts[1];var type=parts[2]||'national';
      if(!name||!date||!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
      if(!['national','company','custom'].includes(type))type='national';
      records.push({holiday_id:'H'+Date.now()+Math.random().toString(36).slice(2,5),name:name,date:date,type:type});
    });
    if(!records.length){window.showAlert('ไม่พบข้อมูลที่ถูกต้อง — รูปแบบ: ชื่อวันหยุด,YYYY-MM-DD,national|company|custom','warn');return;}
  }
  var btn=document.getElementById('btn-hol-import');if(btn){btn.disabled=true;btn.textContent='⏳ กำลังบันทึก...';}
  var prev=document.getElementById('hol-import-preview');
  if(prev)prev.innerHTML='<div style="color:var(--teal);font-weight:600;">กำลังบันทึก '+records.length+' รายการ...</div>';
  try{
    for(var i=0;i<records.length;i++){await setDoc(getDocRef('HOLIDAYS',records[i].holiday_id),records[i]);}
    window._holParsedRows=[];
    window.closeM('m-hol-import');
    window.showToast&&window.showToast('นำเข้าวันหยุดสำเร็จ '+records.length+' รายการ','success');
  }catch(e){
    if(btn){btn.disabled=false;btn.textContent='📥 นำเข้า';}
    window.showDbError(e);
  }
};

// helper: count holidays in a project's date range
window.getProjectHolidayCount=function(p){
  if(!p||!p.start||!p.end)return 0;
  var ps=pd(p.start),pe=pd(p.end);pe.setHours(23,59,59);
  return window.HOLIDAYS.filter(function(h){if(!h.date)return false;var hd=pd(h.date);return hd>=ps&&hd<=pe;}).length;
};

