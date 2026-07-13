const { esc, fd, fc, fca, pd, gS, gT, gG, gSt, gC, avC, uid, getFY, getYearBE, getStaffOverlaps, overlapWarnText, getStaffLeaveConflicts, getColRef, getDocRef } = window;
// ── CALENDAR ──
window.toggleCalFullscreen=function(){
  var v=document.getElementById('view-calendar');
  var btn=document.getElementById('cal-fs-btn');
  if(!v)return;
  var isFs=v.classList.contains('cal-fullscreen');
  if(!isFs){
    // Enter fullscreen
    v.classList.add('cal-fullscreen');
    if(btn){btn.textContent='✕ ย่อจอ';btn.classList.add('fs-active');}
  } else {
    // Exit fullscreen
    v.classList.remove('cal-fullscreen');
    if(btn){btn.textContent='⛶ เต็มจอ';btn.classList.remove('fs-active');}
  }
  setTimeout(function(){window.renderCalendar();},50);
}
// ESC key exits calendar fullscreen
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){
    var v=document.getElementById('view-calendar');
    if(v&&v.classList.contains('cal-fullscreen')){window.toggleCalFullscreen();}
  }
});
window.calNav=function(d){if(window.calTime==='month'){window.calM+=d;if(window.calM>11){window.calM=0;window.calY++;}if(window.calM<0){window.calM=11;window.calY--;}}else window.calY+=d;window.renderCalendar();}
window.updateCalFilterOpts=function(){
  var deptSel=document.getElementById('cal-dept-filter');
  var onlyWrap=document.getElementById('cal-only-active-wrap');
  var cf=document.getElementById('cal-filter');
  var isStaff=window.calView==='staff';
  var isProject=window.calView==='project';
  // Show/hide dept filter
  if(deptSel){
    if(isStaff){
      deptSel.style.display='';
      var prevDept=deptSel.value;
      deptSel.innerHTML='<option value="">ทุกแผนก</option>';
      var depts=[...new Set(window.STAFF.filter(s=>s.active&&s.dept).map(s=>s.dept))].sort((a,b)=>a.localeCompare(b,'th'));
      depts.forEach(function(d){deptSel.insertAdjacentHTML('beforeend','<option value="'+esc(d)+'"'+(d===prevDept?' selected':'')+'>'+esc(d)+'</option>');});
    } else if(isProject){
      deptSel.style.display='';
      var prevType=deptSel.value;
      deptSel.innerHTML='<option value="">ทุกประเภท</option>';
      window.PTYPES.forEach(function(t){deptSel.insertAdjacentHTML('beforeend','<option value="'+t.id+'"'+(t.id===prevType?' selected':'')+'>'+esc(t.label)+'</option>');});
    } else {
      deptSel.style.display='none';
      deptSel.value='';
    }
  }
  // Show/hide "only active" checkbox
  if(onlyWrap){onlyWrap.style.display=isStaff?'flex':'none';}
  // Refresh individual filter list
  var isPtype=window.calView==='ptype';
  var cfMs=document.getElementById('cal-filter-ptype');
  if(cf)cf.style.display=isPtype?'none':'';
  if(cfMs)cfMs.style.display=isPtype?'':'none';
  if(isPtype){
    if(cfMs)window.msFilter('cal-filter-ptype',window.PTYPES,{placeholder:'ทั้งหมด',onChange:window.renderCalendar});
    return;
  }
  if(!cf)return;
  var currentVal=cf.value;
  var fDept=(deptSel&&deptSel.value)||'';
  cf.innerHTML='<option value="">ทั้งหมด</option>';
  if(isStaff){
    window.STAFF.filter(s=>s.active&&(!fDept||(s.dept||'')===fDept)).forEach(s=>{cf.insertAdjacentHTML('beforeend','<option value="'+s.id+'">'+esc(s.name)+'</option>');});
  } else if(isProject){
    window.PROJECTS.forEach(p=>{cf.insertAdjacentHTML('beforeend','<option value="'+p.id+'">'+esc(p.name)+'</option>');});
  }
  cf.value=currentVal;
}

function getColIndices(startDt,endDt,tCols){let viewStart=tCols[0].s;let viewEnd=tCols[tCols.length-1].e;if(endDt<viewStart||startDt>viewEnd)return null;let sIdx=-1,eIdx=-1;for(let i=0;i<tCols.length;i++){if(sIdx===-1&&startDt<=tCols[i].e)sIdx=i;if(endDt>=tCols[i].s)eIdx=i;}if(sIdx===-1)sIdx=0;if(eIdx===-1)eIdx=tCols.length-1;return{sIdx,eIdx};}

window.renderCalendar=function(){
  var cf=document.getElementById('cal-filter');
  var isPtypeView=window.calView==='ptype';
  if(isPtypeView||(cf&&cf.options.length<=1))window.updateCalFilterOpts();
  var filt=isPtypeView?window.msValues('cal-filter-ptype'):((cf&&cf.value)||'');
  var tCols=[];var y=window.calY;
  if(window.calTime==='month'){var dim=new Date(y,window.calM+1,0).getDate();for(var d=1;d<=dim;d++){var dt=new Date(y,window.calM,d);var _ds=y+'-'+String(window.calM+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');var _hol=window.HOLIDAYS.find(function(h){return h.date===_ds;});tCols.push({label:d,sub:window.DNAMES[dt.getDay()],s:dt,e:new Date(y,window.calM,d,23,59,59),isWk:dt.getDay()===0||dt.getDay()===6,isHol:!!_hol,holName:_hol?_hol.name:''});}document.getElementById('cal-lbl').textContent=window.THMON[window.calM]+' '+(y+543);}
  else if(window.calTime==='year'){for(var m=0;m<12;m++){var dt=new Date(y,m,1);tCols.push({label:window.THMON[m].slice(0,3),sub:'',s:dt,e:new Date(y,m+1,0,23,59,59),isWk:false});}document.getElementById('cal-lbl').textContent='ปี '+(y+543);}
  else if(window.calTime==='fiscal'){for(var i=0;i<12;i++){var m=(i+9)%12;var cy=i<3?y-1:y;var dt=new Date(cy,m,1);tCols.push({label:window.THMON[m].slice(0,3),sub:String(cy+543).slice(-2),s:dt,e:new Date(cy,m+1,0,23,59,59),isWk:false});}document.getElementById('cal-lbl').textContent='ปีงบฯ '+(y+543);}
  var deptFilt=(document.getElementById('cal-dept-filter')||{value:''}).value||'';
  var baseRows=[];
  if(window.calView==='staff'){
    baseRows=window.STAFF.filter(function(s){
      if(!s.active)return false;
      if(filt&&s.id!==filt)return false;
      if(deptFilt&&(s.dept||'')!==deptFilt)return false;
      return true;
    }).map(s=>({id:s.id,name:s.name,sub:s.dept||'ไม่ระบุแผนก',type:'staff',obj:s}));
    // Sort by dept → earliest project start date
    var _eSt={};
    window.STAFF.forEach(function(s){
      var mn=null;
      (window.PROJECTS||[]).forEach(function(p){
        if(p.status==='cancelled')return;
        if(p.visits&&p.visits.length>0){p.visits.forEach(function(v){var vm=window._vtMember(v.team,s.id,v.start,v.end);if(vm&&vm.s&&(!mn||vm.s<mn))mn=vm.s;});}
        else{var ms=(p.members&&p.members.length>0?p.members:p.team.map(function(id){return{sid:id,s:p.start};})).filter(function(m){return m.sid===s.id&&m.s;});ms.forEach(function(m){if(!mn||m.s<mn)mn=m.s;});}
      });
      _eSt[s.id]=mn||'9999-99';
    });
    baseRows.sort(function(a,b){var da=a.obj.dept||'zzz',db=b.obj.dept||'zzz';if(da!==db)return da.localeCompare(db,'th');return(_eSt[a.id]||'9999-99').localeCompare(_eSt[b.id]||'9999-99');});
    // Filter to staff with events in range if "แสดงเฉพาะคนที่มีงาน" is checked
    var _onlyCb=document.getElementById('cal-only-active');
    if(_onlyCb&&_onlyCb.checked&&tCols.length>0){
      var _rS=tCols[0].s,_rE=tCols[tCols.length-1].e,_hasEvt=new Set();
      (window.PROJECTS||[]).forEach(function(p){
        if(p.status==='cancelled'||p.status==='completed')return;
        if(p.visits&&p.visits.length>0){p.visits.forEach(function(v){if(!v.team)return;window._vtMembers(v.team,v.start,v.end).forEach(function(m){if(!m.s||!m.e)return;var ms=pd(m.s),me=pd(m.e);me.setHours(23,59,59);if(me>=_rS&&ms<=_rE)_hasEvt.add(m.sid);});});}
        else{var _ms=p.members&&p.members.length>0?p.members:p.team.map(function(id){return{sid:id,s:p.start,e:p.end};});_ms.forEach(function(m){if(!m.s||!m.e)return;var ms=pd(m.s),me=pd(m.e);me.setHours(23,59,59);if(me>=_rS&&ms<=_rE)_hasEvt.add(m.sid);});}
      });
      (window.LEAVES||[]).forEach(function(lv){if(!lv.startDate||!lv.endDate||lv.status==='rejected')return;var ls=pd(lv.startDate),le=pd(lv.endDate);le.setHours(23,59,59);if(le>=_rS&&ls<=_rE)_hasEvt.add(lv.staffId);});
      (window.WORK_LOGS||[]).forEach(function(wl){var ws=wl.type==='daily'?wl.date:wl.startDate,we=wl.type==='daily'?wl.date:wl.endDate;if(!ws||!we)return;var wsd=pd(ws),wed=pd(we);wed.setHours(23,59,59);if(wed>=_rS&&wsd<=_rE){if(wl.scope==='personal'&&wl.staffId)_hasEvt.add(wl.staffId);(wl.participants||[]).forEach(function(p){if(p.sid)_hasEvt.add(p.sid);});}});
      baseRows=baseRows.filter(function(r){return _hasEvt.has(r.id);});
    }
  }
  else if(window.calView==='ptype')baseRows=window.PTYPES.filter(t=>(!filt.length||filt.includes(t.id))).map(t=>({id:t.id,name:t.label,sub:'ประเภท',type:'ptype',obj:t}));
  else if(window.calView==='project'){
    baseRows=window.PROJECTS.filter(function(p){
      if(filt&&p.id!==filt)return false;
      if(deptFilt&&p.typeId!==deptFilt)return false;
      return true;
    }).map(p=>({id:p.id,name:p.name,sub:gS(p.stage).label,type:'project',obj:p}));
  }
  const DAY_WIDTH=window.calTime==='month'?45:120;const BAR_HEIGHT=26;const BAR_GAP=6;const ROW_PAD=12;const LEFT_WIDTH=260;
  var activeRowsData=[];
  baseRows.forEach((r,ri)=>{
    let rawEvents=[];
    if(window.calView==='staff'){window.PROJECTS.forEach(p=>{if(p.status==='cancelled'||p.status==='completed')return;
      // ถ้ามี visits ใช้ visits แทน members ปกติ
      if(p.visits&&p.visits.length>0){
        p.visits.forEach((v,vi)=>{
          var vm=window._vtMember(v.team,r.id,v.start,v.end);
          if(!vm)return;
          let ms=pd(vm.s||v.start),me=pd(vm.e||v.end);me.setHours(23,59,59);
          let idxs=getColIndices(ms,me,tCols);
          if(idxs)rawEvents.push({sIdx:idxs.sIdx,eIdx:idxs.eIdx,text:`${p.name} (รอบ${v.no||vi+1})`,color:gC(window.PROJECTS.indexOf(p)),p:p});
        });
      } else {
        let mems=p.members&&p.members.length>0?p.members:p.team.map(id=>({sid:id,s:p.start,e:p.end}));let mbList=mems.filter(m=>m.sid===r.id);let validMems=mbList.filter(mb=>mb.s&&mb.e&&!isNaN(pd(mb.s).getTime())&&!isNaN(pd(mb.e).getTime()));if(validMems.length>0){let ms=new Date(Math.min(...validMems.map(mb=>pd(mb.s).getTime())));let me=new Date(Math.max(...validMems.map(mb=>{let d=pd(mb.e);d.setHours(23,59,59);return d.getTime();})));let idxs=getColIndices(ms,me,tCols);if(idxs)rawEvents.push({sIdx:idxs.sIdx,eIdx:idxs.eIdx,text:p.name,color:gC(window.PROJECTS.indexOf(p)),p:p});}
      }
    });
    var _LEAVE_EMOJI_CAL={sick:'🤒',vacation:'🏖',personal:'📋',maternity:'🤱',ordain:'🙏',other:'📝'};
    var _LEAVE_LABEL_CAL={sick:'ลาป่วย',vacation:'ลาพักร้อน',personal:'ลากิจ',maternity:'ลาคลอด',ordain:'ลาบวช',other:'อื่นๆ'};
    (window.LEAVES||[]).filter(lv=>lv.staffId===r.id&&lv.startDate&&lv.endDate&&lv.status!=='rejected').forEach(lv=>{
      let ls=pd(lv.startDate),le=pd(lv.endDate);le.setHours(23,59,59);
      let idxs=getColIndices(ls,le,tCols);
      if(idxs){let emoji=_LEAVE_EMOJI_CAL[lv.leaveType]||'📝';let label=_LEAVE_LABEL_CAL[lv.leaveType]||lv.leaveType;rawEvents.push({sIdx:idxs.sIdx,eIdx:idxs.eIdx,text:emoji+' '+label,color:'rgba(255,107,107,0.75)',isLeave:true,lv:lv,p:null});}
    });
    // Work Logs
    (window.WORK_LOGS||[]).forEach(function(wl){
      var wlStart,wlEnd;
      var pt=(wl.participants||[]).find(function(p){return p.sid===r.id;});
      if(pt){
        wlStart=pt.s||(wl.type==='daily'?wl.date:wl.startDate);
        wlEnd=pt.e||(wl.type==='daily'?wl.date:wl.endDate);
      } else if(wl.staffId===r.id){
        wlStart=wl.type==='daily'?wl.date:wl.startDate;
        wlEnd=wl.type==='daily'?wl.date:wl.endDate;
      }
      if(!wlStart||!wlEnd) return;
      var ls=pd(wlStart),le=pd(wlEnd);le.setHours(23,59,59);
      var idxs=getColIndices(ls,le,tCols);
      if(idxs){
        var catEmoji=((window.WL_CATS||[]).find(function(c){return c.id===wl.category;})||{emoji:'📝'}).emoji;
        rawEvents.push({sIdx:idxs.sIdx,eIdx:idxs.eIdx,text:catEmoji+' '+wl.title,color:'rgba(255,166,43,0.75)',isWorkLog:true,wl:wl,p:null});
      }
    });}
    else if(window.calView==='project'){let p=r.obj;if(p.status!=='cancelled'&&p.status!=='completed'){
      // ถ้ามี visits → แสดงแต่ละรอบแยกกัน
      if(p.visits&&p.visits.length>0){
        p.visits.forEach((v,vi)=>{
          if(!v.start||!v.end)return;
          let ms=pd(v.start),me=pd(v.end);me.setHours(23,59,59);
          let team=v.team&&v.team.length>0?window._vtMembers(v.team,v.start,v.end).map(m=>{let st=window.STAFF.find(s=>s.id===m.sid);return st?(st.nickname||st.name.split(' ')[0]):'';}).filter(Boolean):[];
          let label=(team.length>0?team.join(', '):'ยังไม่มีทีม')+` (รอบ${v.no||vi+1})`;
          let idxs=getColIndices(ms,me,tCols);
          let vColor={'planned':gS(p.stage).color,'ongoing':'#7c5cfc','done':'#06d6a0'}[v.status]||gS(p.stage).color;
          if(idxs)rawEvents.push({sIdx:idxs.sIdx,eIdx:idxs.eIdx,text:label,color:vColor,p:p});
        });
      } else {
        // แสดงจาก members หรือ start/end โครงการ
        let mems=p.members&&p.members.length>0?p.members:p.team.map(id=>({sid:id,s:p.start,e:p.end}));
        let validMems=mems.filter(mb=>mb.s&&mb.e&&!isNaN(pd(mb.s).getTime())&&!isNaN(pd(mb.e).getTime()));
        if(validMems.length>0){
          let ms=new Date(Math.min(...validMems.map(mb=>pd(mb.s).getTime())));
          let me=new Date(Math.max(...validMems.map(mb=>{let d=pd(mb.e);d.setHours(23,59,59);return d.getTime();})));
          let idxs=getColIndices(ms,me,tCols);
          let staffNames=[...new Set(validMems.map(mb=>{let st=window.STAFF.find(s=>s.id===mb.sid);return st?st.nickname:'';}).filter(n=>n))];
          if(idxs)rawEvents.push({sIdx:idxs.sIdx,eIdx:idxs.eIdx,text:staffNames.join(', ')||'ยังไม่มีทีมงาน',color:gS(p.stage).color,p:p});
        } else if(p.start&&p.end){
          let idxs=getColIndices(pd(p.start),new Date(pd(p.end).setHours(23,59,59)),tCols);
          if(idxs)rawEvents.push({sIdx:idxs.sIdx,eIdx:idxs.eIdx,text:'ยังไม่มีทีมงาน',color:gS(p.stage).color,p:p});
        }
      }
    }}
    else if(window.calView==='ptype'){window.PROJECTS.forEach(p=>{
      if(p.typeId!==r.id||p.status==='cancelled'||p.status==='completed')return;
      // ถ้ามี visits → สร้าง event ต่อรอบ
      if(p.visits&&p.visits.length>0){
        p.visits.forEach((v,vi)=>{
          if(!v.start||!v.end)return;
          let ms=pd(v.start),me=pd(v.end);me.setHours(23,59,59);
          let team=v.team&&v.team.length>0?window._vtMembers(v.team,v.start,v.end).map(m=>{let st=window.STAFF.find(s=>s.id===m.sid);return st?(st.nickname||st.name.split(' ')[0]):'';}).filter(Boolean):[];
          let label=`${team.join(', ')||'ไม่มีทีม'} (${p.name} รอบ${v.no||vi+1})`;
          let idxs=getColIndices(ms,me,tCols);
          if(idxs)rawEvents.push({sIdx:idxs.sIdx,eIdx:idxs.eIdx,text:label,color:gC(window.PROJECTS.indexOf(p)),p:p});
        });
      } else {
        let mems=p.members&&p.members.length>0?p.members:p.team.map(id=>({sid:id,s:p.start,e:p.end}));
        let validMems=mems.filter(mb=>mb.s&&mb.e&&!isNaN(pd(mb.s).getTime())&&!isNaN(pd(mb.e).getTime()));
        let ms=pd(p.start),me=pd(p.end);
        if(!isNaN(me.getTime()))me.setHours(23,59,59);
        if(validMems.length>0){ms=new Date(Math.min(...validMems.map(mb=>pd(mb.s).getTime())));me=new Date(Math.max(...validMems.map(mb=>{let d=pd(mb.e);d.setHours(23,59,59);return d.getTime();})));}
        if(!isNaN(ms.getTime())&&!isNaN(me.getTime())){
          let staffNames=[...new Set(validMems.map(mb=>{let st=window.STAFF.find(s=>s.id===mb.sid);return st?st.nickname:'';}).filter(n=>n))];
          let idxs=getColIndices(ms,me,tCols);
          if(idxs)rawEvents.push({sIdx:idxs.sIdx,eIdx:idxs.eIdx,text:`${staffNames.join(', ')||'ไม่มีทีม'} (${p.name})`,color:gC(window.PROJECTS.indexOf(p)),p:p});
        }
      }
    });}
    if(rawEvents.length>0){rawEvents.sort((a,b)=>a.sIdx-b.sIdx);let lanes=[];rawEvents.forEach(ev=>{let assignedLane=0;while(assignedLane<lanes.length&&lanes[assignedLane]>=ev.sIdx){assignedLane++;}ev.lane=assignedLane;lanes[assignedLane]=ev.eIdx;});let totalLanes=Math.max(1,lanes.length);let rowHeight=Math.max(76,(totalLanes*(BAR_HEIGHT+BAR_GAP))-BAR_GAP+(ROW_PAD*2));activeRowsData.push({rInfo:r,events:rawEvents,height:rowHeight,eventCount:rawEvents.length});}
    else if(window.calView==='staff'){var _onlyCbE=document.getElementById('cal-only-active');if(!_onlyCbE||!_onlyCbE.checked)activeRowsData.push({rInfo:r,events:[],height:52,eventCount:0});}
  });
  if(activeRowsData.length===0){document.getElementById('cal-grid').innerHTML='<div style="padding:48px;text-align:center;color:var(--txt3);font-size:14px;background:var(--surface);border-radius:var(--r2)">ไม่พบข้อมูลในช่วงเวลานี้</div>';return;}
  const totalGridWidth=tCols.length*DAY_WIDTH;
  let html=`<div class="tl-container"><div class="tl-row tl-head-row"><div class="tl-left" style="width:${LEFT_WIDTH}px">รายชื่อ / รายการ</div><div class="tl-right" style="width:${totalGridWidth}px">`;
  tCols.forEach(tc=>{html+=`<div class="tl-th ${tc.isWk?'wk':''} ${tc.isHol?'hol':''}" style="min-width:${DAY_WIDTH}px;width:${DAY_WIDTH}px" title="${tc.holName||''}"><div class="tl-th-num">${tc.label}</div><div class="tl-th-day">${tc.isHol?'🎌':tc.sub}</div></div>`;});
  html+=`</div></div>`;
  activeRowsData.forEach(rowData=>{
    let r=rowData.rInfo;let rh=rowData.height;
    let avatar='';if(r.type==='staff')avatar=`<div class="av" style="background:${avC(window.STAFF.findIndex(s=>s.id===r.id))}">${r.name.charAt(0)}</div>`;else if(r.type==='ptype')avatar=`<div class="av" style="background:${r.obj.color}">🏷</div>`;else avatar=`<div class="av" style="background:${gS(r.obj.stage).color}">📁</div>`;
    let projEvts=rowData.events.filter(ev=>!ev.isLeave&&!ev.isWorkLog).length;let leaveEvts=rowData.events.filter(ev=>ev.isLeave).length;let wlEvts=rowData.events.filter(ev=>ev.isWorkLog).length;
    let workloadText=r.type==='staff'?((projEvts>0?projEvts+' โครงการ':'')+(projEvts>0&&(leaveEvts>0||wlEvts>0)?' · ':'')+( leaveEvts>0?leaveEvts+' วันลา':'')+((leaveEvts>0&&wlEvts>0)?' · ':'')+( wlEvts>0?wlEvts+' บันทึกงาน':'')):(r.type==='project'?rowData.eventCount+' ทีมงาน':rowData.eventCount+' โครงการ');
    html+=`<div class="tl-row" style="height:${rh}px"><div class="tl-left" style="width:${LEFT_WIDTH}px;height:${rh}px">${avatar}<div style="min-width:0;flex:1;display:flex;flex-direction:column;justify-content:center;padding-top:2px;"><div style="font-size:12px;font-weight:600;word-break:break-word;line-height:1.4;">${esc(r.name)}</div><div style="font-size:10px;color:var(--txt3);margin-top:4px;"><div>${esc(r.sub)}</div><div style="color:var(--violet);font-weight:700;">${workloadText}</div></div></div></div><div class="tl-right" style="width:${totalGridWidth}px;height:${rh}px">`;
    tCols.forEach(tc=>{html+=`<div class="tl-bg-cell ${tc.isWk?'wk':''} ${tc.isHol?'hol':''}" style="min-width:${DAY_WIDTH}px;width:${DAY_WIDTH}px"></div>`;});
    rowData.events.forEach(ev=>{let leftPx=ev.sIdx*DAY_WIDTH+2;let widthPx=((ev.eIdx-ev.sIdx)+1)*DAY_WIDTH-4;let topPx=ROW_PAD+(ev.lane*(BAR_HEIGHT+BAR_GAP));if(ev.isLeave){let _lid=ev.lv?ev.lv.id:'';html+=`<div class="tl-bar" onclick="window.openLeaveDetail('${_lid}')" style="left:${leftPx}px;width:${widthPx}px;top:${topPx}px;background:rgba(255,107,107,0.15);height:${BAR_HEIGHT}px;border:2px dashed #ff6b6b;color:#c0392b;cursor:pointer;font-weight:600;" title="${esc(ev.text)}">${esc(ev.text)}</div>`;}else if(ev.isWorkLog){html+=`<div class="tl-bar" onclick="window.openWorkLogModal('${ev.wl.id}')" style="left:${leftPx}px;width:${widthPx}px;top:${topPx}px;background:rgba(255,166,43,0.15);height:${BAR_HEIGHT}px;border:2px dashed #ffa62b;color:#b87800;cursor:pointer;font-weight:600;" title="${esc(ev.text)}">${esc(ev.text)}</div>`;}else{html+=`<div class="tl-bar" onclick="window.openProjModal('${ev.p.id}')" style="left:${leftPx}px;width:${widthPx}px;top:${topPx}px;background:${ev.color};height:${BAR_HEIGHT}px" title="${esc(ev.text)}">${esc(ev.text)}</div>`;}});
    html+=`</div></div>`;
  });
  html+=`</div>`;document.getElementById('cal-grid').innerHTML=html;
}

// ── CALENDAR HELPERS ──
window.calDeptChange=function(){
  var deptSel=document.getElementById('cal-dept-filter');
  var cf=document.getElementById('cal-filter');
  var fDept=deptSel?deptSel.value:'';
  if(cf){
    cf.innerHTML='<option value="">ทั้งหมด</option>';
    if(window.calView==='staff'){
      window.STAFF.filter(function(s){return s.active&&(!fDept||(s.dept||'')===fDept);}).forEach(function(s){cf.insertAdjacentHTML('beforeend','<option value="'+s.id+'">'+esc(s.name)+'</option>');});
    } else if(window.calView==='project'){
      window.PROJECTS.forEach(function(p){cf.insertAdjacentHTML('beforeend','<option value="'+p.id+'">'+esc(p.name)+'</option>');});
    }
    cf.value='';
  }
  window.renderCalendar();
};

window.openLeaveDetail=function(lvId){
  var lv=(window.LEAVES||[]).find(function(x){return x.id===lvId;});
  if(!lv)return;
  var stf=window.STAFF.find(function(s){return s.id===lv.staffId;})||{name:'?',dept:'',role:''};
  var sub=lv.substituteId?(window.STAFF.find(function(s){return s.id===lv.substituteId;})||{name:''}).name:'';
  var _EM={sick:'🤒',vacation:'🏖',personal:'📋',maternity:'🤱',ordain:'🙏',other:'📝'};
  var _LB={sick:'ลาป่วย',vacation:'ลาพักร้อน',personal:'ลากิจ',maternity:'ลาคลอด',ordain:'ลาบวช',other:'อื่นๆ'};
  var _SC={pending:'var(--amber)',approved:'var(--teal)',rejected:'var(--coral)'};
  var _SB={pending:'rgba(255,166,43,.12)',approved:'rgba(6,214,160,.12)',rejected:'rgba(255,107,107,.12)'};
  var _SL={pending:'⏳ รออนุมัติ',approved:'✅ อนุมัติ',rejected:'❌ ไม่อนุมัติ'};
  var emoji=_EM[lv.leaveType]||'📝';
  var typeLabel=emoji+' '+(_LB[lv.leaveType]||lv.leaveType);
  var days=Math.max(1,Math.ceil((pd(lv.endDate)-pd(lv.startDate))/(864e5))+1);
  var sameDate=lv.startDate===lv.endDate;
  var iconEl=document.getElementById('m-lvdet-icon');if(iconEl){iconEl.textContent=emoji;iconEl.style.background='rgba(255,107,107,.12)';}
  document.getElementById('m-lvdet-body').innerHTML=
    '<div style="display:flex;flex-direction:column;gap:14px;">'
    +'<div style="display:flex;align-items:center;gap:12px;">'
      +'<div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#7c5cfc,#4cc9f0);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;flex-shrink:0;">'+esc(stf.name.charAt(0))+'</div>'
      +'<div><div style="font-size:15px;font-weight:800;color:var(--txt);">'+esc(stf.name)+'</div>'
      +(stf.role||stf.dept?'<div style="font-size:12px;color:var(--txt3);margin-top:2px;">'+esc(stf.role||'')+(stf.role&&stf.dept?' · ':'')+esc(stf.dept||'')+'</div>':'')
      +'</div></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
      +'<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px;">'
        +'<div style="font-size:10px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">ประเภทการลา</div>'
        +'<div style="font-size:14px;font-weight:700;color:var(--txt);">'+esc(typeLabel)+'</div>'
      +'</div>'
      +'<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px;">'
        +'<div style="font-size:10px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">จำนวนวัน</div>'
        +'<div style="font-size:22px;font-weight:800;color:var(--violet);line-height:1;">'+days+'<span style="font-size:13px;color:var(--txt3);font-weight:400;margin-left:4px;">วัน</span></div>'
      +'</div>'
    +'</div>'
    +'<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px;">'
      +'<div style="font-size:10px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">ช่วงวันลา</div>'
      +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
        +'<span style="font-size:13px;font-weight:700;color:var(--txt2);background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:5px 12px;">📅 '+fd(lv.startDate)+'</span>'
        +(sameDate?'':'<span style="color:var(--txt3);">→</span><span style="font-size:13px;font-weight:700;color:var(--txt2);background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:5px 12px;">'+fd(lv.endDate)+'</span>')
      +'</div>'
    +'</div>'
    +((sub||lv.note)
      ?'<div style="display:flex;flex-direction:column;gap:8px;">'
        +(sub?'<div style="font-size:13px;color:var(--txt2);">🔄 ผู้ทำงานแทน: <strong>'+esc(sub)+'</strong></div>':'')
        +(lv.note?'<div style="font-size:13px;color:var(--txt2);">📝 '+esc(lv.note)+'</div>':'')
      +'</div>':'')
    +'<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">'
      +'<span style="padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;background:'+(_SB[lv.status]||'var(--surface3)')+';color:'+(_SC[lv.status]||'var(--txt2)')+';border:1px solid '+(_SC[lv.status]||'var(--border)')+';">'+(_SL[lv.status]||lv.status)+'</span>'
      +(lv.approvedBy?'<span style="font-size:12px;color:var(--txt3);">โดย <strong style="color:var(--txt2);">'+esc(lv.approvedBy)+'</strong></span>':'')
    +'</div>'
    +'</div>';
  window.openM('m-leave-detail');
};

