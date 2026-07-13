const { esc, fd, fc, fca, pd, gS, gT, gG, gSt, gC, avC, uid, getFY, getYearBE, getStaffOverlaps, overlapWarnText, getStaffLeaveConflicts, getColRef, getDocRef } = window;
// ── OVERVIEW ──
window.renderOverview = function(){
  var yf=document.getElementById('ov-yr');
  if(yf&&yf.options.length<=1){var yrs=[...new Set(window.PROJECTS.map(p=>getYearBE(p.start)).filter(Boolean))].sort((a,b)=>b-a);yrs.forEach(function(y){var o=document.createElement('option');o.value=y;o.textContent='ปี พ.ศ. '+y;yf.appendChild(o);});var _cbe=(new Date().getFullYear()+543).toString();if(!yf.value||yf.value==='')yf.value=_cbe;}
  window.msFilter('ov-grp',window.PGROUPS,{placeholder:'ทุกกลุ่มโครงการ',onChange:window.renderOverview});
  window.msFilter('ov-type',window.PTYPES,{placeholder:'ทุกประเภทโครงการ',onChange:window.renderOverview});
  var yr=(yf||{}).value||'';var grp=window.msValues('ov-grp');var ovTyp=window.msValues('ov-type');
  var fProjs=window.PROJECTS.filter(function(p){return(!yr||getYearBE(p.start)==yr)&&(!grp.length||grp.includes(p.groupId))&&(!ovTyp.length||ovTyp.includes(p.typeId));});
  var fPids=fProjs.map(p=>p.id);
  var fAdvs=window.ADVANCES.filter(function(a){return fPids.includes(a.pid);});
  var totalBudget=fProjs.reduce(function(s,p){return s+p.cost;},0);
  var aPnd=fAdvs.filter(function(a){return a.status!=='cleared';});
  var aOv=fAdvs.filter(function(a){return a.ddate&&pd(a.ddate)<new Date()&&a.status!=='cleared';});
  var totalAdvancePending=aPnd.reduce(function(s,a){return s+a.amount;},0);
  var now=new Date();now.setHours(0,0,0,0);
  // ── health ──
  var health={onTrack:0,atRisk:0,delayed:0,completed:0};
  var activeStaff=new Set();
  fProjs.forEach(p=>{
    if(p.progress===100||p.stage==='close'||p.status==='completed'){health.completed++;return;}
    if(!p.end){health.onTrack++;return;}
    var diffDays=Math.ceil((pd(p.end)-now)/(1000*60*60*24));
    if(diffDays<0)health.delayed++;else if(diffDays<=15&&p.progress<80)health.atRisk++;else health.onTrack++;
    (p.members&&p.members.length>0?p.members:p.team.map(id=>({sid:id}))).forEach(m=>{if(m.sid)activeStaff.add(m.sid);});
  });
  var totalStaff=window.STAFF.filter(s=>s.active).length;
  var totalActive=fProjs.length-health.completed;var issueCount=health.delayed+health.atRisk;
  var resourceEff=totalStaff>0?Math.round((activeStaff.size/totalStaff)*100):0;
  var critCount=fProjs.filter(p=>{if(p.progress===100||p.stage==='close'||!p.end)return false;var d=Math.ceil((pd(p.end)-now)/(1000*60*60*24));return d<=30;}).length;
  // ── KPI cards ──
  var stats=[
    {k:'Budget Health',v:fc(totalBudget),s:'Total Budget '+(yr||'ทุกปี'),sub:totalBudget>0?'<span style="color:#06d6a0;font-size:11px;font-weight:700;">↑ On Target</span>':'',icon:'💵',g1:'#06d6a0',g2:'#4cc9f0'},
    {k:'Project Velocity',v:`${totalActive} / ${fProjs.length}`,s:'Active Projects Now',sub:`<span style="color:#4361ee;font-size:11px;font-weight:700;">↑ ${health.completed} Completed</span>`,icon:'⚡',g1:'#4361ee',g2:'#7209b7'},
    {k:'Resource Efficiency',v:`${resourceEff}%`,s:`${activeStaff.size} of ${totalStaff} Members Active`,sub:`<span style="font-size:11px;font-weight:700;color:${resourceEff===100?'#06d6a0':'#ffa62b'};">${resourceEff===100?'Full Utilization':'Partial Utilization'}</span>`,icon:'👥',g1:'#7209b7',g2:'#f72585'},
    {k:'Critical Alerts',v:critCount,s:`Projects Ending < 30 Days`,sub:`<span style="color:${issueCount>0?'var(--coral)':'#06d6a0'};font-size:11px;font-weight:700;">${issueCount>0?'⚠ Action Required':'✓ All on track'}</span>`,icon:'🚨',g1:critCount>0?'#ff6b6b':'#06d6a0',g2:critCount>0?'#ffa62b':'#4cc9f0'},
  ];
  document.getElementById('stat-row').innerHTML=stats.map(function(s,i){
    return `<div class="stat-c fade" style="animation-delay:${i*60}ms;display:flex;flex-direction:column;gap:2px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px;">
        <div class="stat-k">${s.k}</div>
        <div class="stat-icon" style="background:linear-gradient(135deg,${s.g1}18,${s.g2}18);width:36px;height:36px;flex-shrink:0;">${s.icon}</div>
      </div>
      <div class="stat-v" style="background:linear-gradient(135deg,${s.g1},${s.g2});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-size:26px;">${s.v}</div>
      <div class="stat-s">${s.s}</div>
      <div style="margin-top:4px;">${s.sub}</div>
    </div>`;
  }).join('');
  var annualProjs=window.PROJECTS.filter(function(p){return(!yr||getYearBE(p.start)==yr)&&(!grp||p.groupId===grp);});
  window.renderAnnualTarget(annualProjs, yr);
  Chart.defaults.font.family='Plus Jakarta Sans';Chart.defaults.color='#9ba3b8';
  // ── Monthly Workload Trend ──
  if(window.cWLTrend)window.cWLTrend.destroy();
  var ctxWL=document.getElementById('chart-workload-trend');
  if(ctxWL){
    var months=[];for(var mi=0;mi<12;mi++)months.push(new Date(yr?Number(yr)-543:now.getFullYear(),mi,1));
    var typeColors=window.PTYPES.map(t=>t.color);
    var typeDatasets=window.PTYPES.map(function(t,ti){
      return{label:t.label,data:months.map(function(mDate){
        return fProjs.filter(function(p){
          if(p.typeId!==t.id)return false;
          var ps=p.start?pd(p.start):null,pe=p.end?pd(p.end):null;
          if(!ps||!pe)return false;
          var mEnd=new Date(mDate.getFullYear(),mDate.getMonth()+1,0,23,59,59);
          return ps<=mEnd&&pe>=mDate;
        }).length;
      }),backgroundColor:t.color+'cc',stack:'s'};
    });
    window.cWLTrend=new Chart(ctxWL,{type:'bar',data:{labels:window.THMON.map(m=>m.slice(0,3)),datasets:typeDatasets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:10},boxWidth:10,usePointStyle:true}}},scales:{x:{grid:{display:false},stacked:true,ticks:{font:{size:10}}},y:{stacked:true,grid:{color:'rgba(0,0,0,.06)'},ticks:{font:{size:10},stepSize:1}}}}});
  }
  // ── Resource Status ring ──
  if(window.cResource)window.cResource.destroy();
  var ctxRes=document.getElementById('chart-resource');
  var wlNow=new Date();
  var ovLoad=[],actStaff=[],availStaff=[];
  window.STAFF.filter(s=>s.active).forEach(s=>{
    var cnt=fProjs.filter(p=>{
      if(p.status==='cancelled'||p.status==='completed')return false;
      var mems=p.members&&p.members.length>0?p.members:p.team.map(id=>({sid:id,s:p.start,e:p.end}));
      return mems.some(m=>m.sid===s.id);
    }).length;
    if(cnt===0)availStaff.push(s);else if(cnt>3)ovLoad.push(s);else actStaff.push(s);
  });
  if(ctxRes){window.cResource=new Chart(ctxRes,{type:'doughnut',data:{labels:['Overload (>3)','Active (1-3)',`Available (${availStaff.length})`],datasets:[{data:[ovLoad.length,actStaff.length,availStaff.length],backgroundColor:['#ff6b6b','#4361ee','#06d6a0'],borderWidth:3,borderColor:'var(--surface)'}]},options:{responsive:true,maintainAspectRatio:false,cutout:'70%',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+c.label+': '+c.parsed+' คน'}}}}});}
  var leg=document.getElementById('ov-resource-legend');
  if(leg){leg.innerHTML=`<span style="color:#ff6b6b;font-weight:700;">● Overload (>${3}) ${ovLoad.length}</span><span style="color:#4361ee;font-weight:700;">● Active (1-3) ${actStaff.length}</span><span style="color:#06d6a0;font-weight:700;">● Available ${availStaff.length}</span>`;}
  // chart center label total
  // ── Budget bar ──
  if(window.cBudgetBar)window.cBudgetBar.destroy();
  var tps=window.PTYPES.filter(function(t){return fProjs.some(function(p){return p.typeId===t.id;});});
  var ctxBB=document.getElementById('chart-budget-bar');
  if(ctxBB){window.cBudgetBar=new Chart(ctxBB,{type:'bar',data:{labels:tps.map(t=>t.label),datasets:[{data:tps.map(function(t){return fProjs.filter(p=>p.typeId===t.id).reduce((s,p)=>s+p.cost,0);}),backgroundColor:tps.map(t=>t.color+'cc'),borderColor:tps.map(t=>t.color),borderWidth:1.5,borderRadius:6,barThickness:22}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fc(c.parsed)}}},scales:{x:{grid:{color:'rgba(0,0,0,.06)'},ticks:{font:{size:10},callback:v=>v>=1000000?'฿'+(v/1000000).toFixed(1)+'M':v>=1000?'฿'+(v/1000).toFixed(0)+'K':'฿'+v}},y:{grid:{display:false},ticks:{font:{size:11,weight:'600'}}}}}});}
  // ── Health donut ──
  if(window.cHealth)window.cHealth.destroy();
  var ctxH=document.getElementById('chart-health');
  if(ctxH){window.cHealth=new Chart(ctxH,{type:'doughnut',data:{labels:['ปกติ','เสี่ยง','ล่าช้า','เสร็จ'],datasets:[{data:[health.onTrack,health.atRisk,health.delayed,health.completed],backgroundColor:['#06d6a0','#ffa62b','#ff6b6b','#9ba3b8'],borderWidth:2,borderColor:'var(--surface)'}]},options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{position:'right',labels:{font:{size:10,weight:'600'},boxWidth:10,usePointStyle:true}}}}});}
  // ── Stage bar ──
  if(window.cStage)window.cStage.destroy();
  var ctxSt=document.getElementById('chart-stage');
  if(ctxSt){window.cStage=new Chart(ctxSt,{type:'bar',data:{labels:window.STAGES.map(s=>s.label),datasets:[{data:window.STAGES.map(s=>fProjs.filter(p=>p.stage===s.id).length),backgroundColor:window.STAGES.map(s=>s.color+'44'),borderColor:window.STAGES.map(s=>s.color),borderWidth:2,borderRadius:6,barThickness:18}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:10},maxRotation:40,minRotation:30}},y:{grid:{color:'rgba(0,0,0,.06)'},ticks:{font:{size:10},stepSize:1}}}}});}
  // ── Critical timeline ──
  var critProjs=fProjs.filter(function(p){if(p.progress===100||p.stage==='close'||p.status==='completed'||!p.end)return false;return Math.ceil((pd(p.end)-now)/(1000*60*60*24))<=30;}).sort((a,b)=>pd(a.end)-pd(b.end));
  var cntEl=document.getElementById('ov-crit-count');if(cntEl)cntEl.textContent=critProjs.length+' โครงการ';
  var ovCrit=document.getElementById('ov-critical');
  if(ovCrit){ovCrit.innerHTML=critProjs.map(function(p){
    var diffDays=Math.ceil((pd(p.end)-now)/(1000*60*60*24));
    var color=diffDays<0?'var(--coral)':'var(--amber)';
    var dayText=diffDays<0?`ล่าช้า ${Math.abs(diffDays)} วัน`:diffDays===0?'วันนี้':`${diffDays} วัน`;
    var pt=gT(p.typeId);
    var mems=(p.members&&p.members.length>0?p.members:p.team.map(id=>({sid:id}))).map(m=>{var s=window.STAFF.find(x=>x.id===m.sid);return s?s.nickname||s.name.split(' ')[0]:'';}).filter(Boolean);
    return`<div onclick="window.openProjModal('${p.id}')" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--border);cursor:pointer;transition:.15s" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(p.name)}</div>
        <div style="font-size:10px;color:var(--txt3);margin-top:3px;display:flex;gap:8px;flex-wrap:wrap;">
          <span style="background:${pt.color}18;color:${pt.color};padding:1px 6px;border-radius:8px;font-weight:600;">${esc(pt.label)}</span>
          ${mems.length>0?`<span>👥 ${mems.slice(0,3).join(', ')}${mems.length>3?'+'+(mems.length-3):''}</span>`:''}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:11px;font-weight:800;color:${color};background:${color}15;padding:2px 8px;border-radius:6px;">${dayText}</div>
        <div style="font-size:10px;color:var(--txt3);margin-top:3px;">End: ${fd(p.end)}</div>
      </div>
    </div>`;
  }).join('')||'<div style="font-size:12px;color:var(--txt3);text-align:center;padding:30px;">🎉 ไม่มีโครงการใกล้สิ้นสุด</div>';}
  // ── Advance alerts ──
  var advAlerts=[...aPnd].sort((a,b)=>pd(a.ddate)-pd(b.ddate)).slice(0,8);
  var ovAdv=document.getElementById('ov-adv-alerts');
  if(ovAdv){ovAdv.innerHTML=advAlerts.map(function(a){var p=window.PROJECTS.find(x=>x.id===a.pid);var isOv=a.ddate&&pd(a.ddate)<now;var color=isOv?'var(--coral)':'var(--amber)';return`<div onclick="window.goView('advance')" style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px dashed var(--border);cursor:pointer;" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''"><div style="width:28px;height:28px;border-radius:8px;background:${color}15;color:${color};display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">${isOv?'⚠':'💳'}</div><div style="flex:1;min-width:0;"><div style="font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p?esc(p.name):'—'}</div><div style="font-size:10px;color:var(--txt3);">${fd(a.ddate)} · <span style="color:${color};font-weight:600;">${isOv?'เกินกำหนด':'รอเคลียร์'}</span></div></div><div style="font-size:12px;font-weight:800;">${fc(a.amount)}</div></div>`;}).join('')||'<div style="font-size:12px;color:var(--txt3);text-align:center;padding:20px;">ไม่มีรายการค้าง</div>';}
  // ── render project table ──
  window.renderOvTable();
}
window.renderOvTable = function() {
  // Populate stage filter
  var sf=document.getElementById('ov-tbl-stg');
  if(sf&&sf.options.length<=1){window.STAGES.forEach(function(s){var o=document.createElement('option');o.value=s.id;o.textContent=s.label;sf.appendChild(o);});}
  // Populate year filter (default current BE year)
  var yf=document.getElementById('ov-tbl-yr');
  if(yf&&yf.options.length<=1){var yrs=[...new Set(window.PROJECTS.map(function(p){return getYearBE(p.start);}).filter(Boolean))].sort(function(a,b){return b-a;});yrs.forEach(function(y){var o=document.createElement('option');o.value=y;o.textContent='ปี พ.ศ. '+y;yf.appendChild(o);});var curBE=(new Date().getFullYear()+543).toString();if(yrs.map(String).includes(curBE))yf.value=curBE;}
  // Populate type filter
  window.msFilter('ov-tbl-type',window.PTYPES,{placeholder:'ทุกประเภท',onChange:window.renderOvTable});
  var yr=(document.getElementById('ov-tbl-yr')||{}).value||(document.getElementById('ov-yr')||{}).value||'';
  var grp=window.msValues('ov-grp');
  var typeF=window.msValues('ov-tbl-type');
  var q=((document.getElementById('ov-tbl-q')||{}).value||'').toLowerCase();
  var stg=(document.getElementById('ov-tbl-stg')||{}).value||'';
  var sort=(document.getElementById('ov-tbl-sort')||{}).value||'end_asc';
  var rows=window.PROJECTS.filter(function(p){
    return (!yr||getYearBE(p.start)==yr)&&(!grp.length||grp.includes(p.groupId))&&(!typeF.length||typeF.includes(p.typeId))&&(!stg||p.stage===stg)&&(!q||p.name.toLowerCase().includes(q));
  });
  rows.sort(function(a,b){
    if(sort==='end_asc'){var ad=a.end?pd(a.end):new Date(9e12);var bd=b.end?pd(b.end):new Date(9e12);return ad-bd;}
    if(sort==='start_desc'){return (b.start?pd(b.start):new Date(0))-(a.start?pd(a.start):new Date(0));}
    if(sort==='progress_asc')return a.progress-b.progress;
    if(sort==='name_asc')return a.name.localeCompare(b.name,'th');
    return 0;
  });
  var now=new Date();now.setHours(0,0,0,0);
  window._ovTableRows = rows;
  var tb=document.getElementById('ov-tbl-rows');if(!tb)return;
  tb.innerHTML=rows.map(function(p,_ri){
    var sg=gS(p.stage);var pt=gT(p.typeId);var pg=gG(p.groupId);
    var endDate=p.end?pd(p.end):null;
    var diffDays=endDate?Math.ceil((endDate-now)/(1000*60*60*24)):null;
    var urgColor=diffDays===null?'':diffDays<0?'var(--coral)':diffDays<=15?'var(--amber)':'';
    var mems=(p.members&&p.members.length>0?p.members:p.team.map(function(id){return{sid:id};}));
    var nicknames=mems.map(function(m){var s=window.STAFF.find(function(x){return x.id===m.sid;});return s?s.nickname||s.name.split(' ')[0]:'';}).filter(Boolean);
    var teamStr=nicknames.length>0?nicknames.join(', '):'<span style="color:var(--txt3)">—</span>';
    var pbarW=Math.max(4,p.progress);
    return `<tr class="fade" onclick="window.openProjModal('${p.id}')" style="cursor:pointer;">
      <td><div style="font-weight:600;font-size:12px;">${esc(p.name)}</div>${p.siteOwner?`<div style="font-size:10px;color:var(--txt3);">🏢 ${esc(p.siteOwner)}</div>`:''}</td>
      <td><div style="display:flex;flex-direction:column;gap:3px;">
        <span class="tag" style="background:${pt.color}18;color:${pt.color};font-size:9px;">${esc(pt.label)}</span>
        ${pg?`<span class="tag" style="background:${pg.color}18;color:${pg.color};font-size:9px;">${esc(pg.label)}</span>`:''}
      </div></td>
      <td><span class="tag" style="background:${sg.color}18;color:${sg.color};font-size:10px;">${sg.label}</span></td>
      <td style="font-size:11px;color:var(--txt2);white-space:nowrap;">${p.start?fd(p.start):'<span style="color:var(--txt3)">—</span>'}</td>
      <td style="font-size:11px;white-space:nowrap;${urgColor?'color:'+urgColor+';font-weight:700':''}">${p.end?fd(p.end):'<span style="color:var(--txt3)">—</span>'}${diffDays!==null&&diffDays>=0&&diffDays<=15?'<br><span style="font-size:10px;">เหลือ '+diffDays+' วัน</span>':''}</td>
      <td style="font-size:11px;color:var(--violet);">${teamStr}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;"><div style="width:${pbarW}%;height:100%;background:${sg.color};border-radius:3px;transition:width .3s;"></div></div>
          <span style="font-size:11px;font-weight:700;color:${sg.color};min-width:30px;">${p.progress}%</span>
        </div>
      </td>
      <td style="text-align:right;font-size:12px;font-weight:700;">${p.cost?fc(p.cost):'<span style="color:var(--txt3)">—</span>'}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--txt3);">ไม่พบข้อมูล</td></tr>';
};

window.exportOvExcel = function() {
  if(!window.XLSX){ window.showAlert('XLSX library ยังโหลดไม่เสร็จ กรุณารอสักครู่','warn'); return; }
  var rows = window._ovTableRows || [];
  if(!rows.length){ window.showAlert('ไม่มีข้อมูลโครงการตามตัวกรองที่เลือก','info'); return; }

  var now = new Date(); now.setHours(0,0,0,0);

  // Build header
  var headers = [
    'ลำดับ','ชื่อโครงการ','กลุ่มโครงการ','ประเภทโครงการ',
    'เจ้าของไซต์','ชื่อผู้ติดตั้ง',
    'Stage','วันเริ่มต้น','วันสิ้นสุด','Revisit 1','Revisit 2','คงเหลือ (วัน)',
    'พื้นที่ชายแดน','งบประมาณ (฿)','ความคืบหน้า (%)','ทีมงาน','สถานะ','หมายเหตุ'
  ];

  var data = rows.map(function(p, i) {
    var sg = gS(p.stage);
    var pt = gT(p.typeId);
    var pg = gG(p.groupId);
    var pmStaff = window.STAFF.find(function(s){ return s.id === p.pm; });
    var mems = (p.members && p.members.length > 0 ? p.members : p.team.map(function(id){ return {sid:id}; }));
    var teamNames = mems.map(function(m){
      var s = window.STAFF.find(function(x){ return x.id === m.sid; });
      return s ? s.name : '';
    }).filter(Boolean).join(', ');
    var endDate = p.end ? pd(p.end) : null;
    var diffDays = endDate ? Math.ceil((endDate - now) / (1000*60*60*24)) : null;
    var statusText = p.status === 'cancelled' ? 'ยกเลิก'
      : p.progress === 100 || p.stage === 'close' ? 'เสร็จสิ้น'
      : diffDays === null ? 'ไม่ระบุ'
      : diffDays < 0 ? 'ล่าช้า ' + Math.abs(diffDays) + ' วัน'
      : diffDays <= 15 ? 'เสี่ยง (' + diffDays + ' วัน)'
      : 'ปกติ';

    return [
      i + 1,
      p.name || '',
      pg ? pg.label : '',
      pt ? pt.label : '',
      p.siteOwner || '',
      p.installer || '',
      sg ? sg.label : '',
      p.start || '',
      p.end || '',
      p.revisit1 || '',
      p.revisit2 || '',
      diffDays !== null ? diffDays : '',
      p.isBorder ? 'ใช่' : 'ไม่ใช่',
      p.cost || 0,
      p.progress || 0,
      teamNames,
      statusText,
      p.note || '',
    ];
  });

  var wsData = [headers].concat(data);
  var ws = window.XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws['!cols'] = [
    {wch:6},{wch:35},{wch:18},{wch:18},
    {wch:20},{wch:20},
    {wch:14},{wch:14},{wch:14},{wch:14},{wch:14},{wch:12},
    {wch:14},{wch:16},{wch:14},{wch:35},{wch:16},{wch:30}
  ];

  var wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'Projects');

  // File name: projects_YYYY-MM-DD.xlsx
  var today = new Date();
  var fname = 'projects_' + today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0') + '.xlsx';
  window.XLSX.writeFile(wb, fname);
  window.showAlert('Export ' + rows.length + ' โครงการเรียบร้อย ✓', 'success');
};

// ── ANNUAL TARGET TRACKER ──────────────────────────────────────────────────────
// ── HELPER: build display rows (กลุ่ม + ประเภทเดี่ยว) ─────────────────────────
function _buildAnnualTargetRows(fProjs, byType, useGroups) {
  var groups = (useGroups !== undefined) ? useGroups : (window.TARGET_TYPE_GROUPS || []);
  var groupedIds = new Set();
  groups.forEach(function(g) { (g.typeIds||[]).forEach(function(tid) { groupedIds.add(tid); }); });
  var allTypeIds = new Set(Object.keys(byType));
  fProjs.forEach(function(p) { if (p.typeId) allTypeIds.add(p.typeId); });
  var rows = [];
  // Group rows — แสดงเสมอถ้ามีการตั้งกลุ่มไว้ (แม้ยังไม่มีโครงการ/target ในปีนั้น)
  groups.forEach(function(g) {
    var gTypeIds = g.typeIds || [];
    if (!gTypeIds.length) return;
    var tgt = gTypeIds.reduce(function(s,tid){return s+Number(byType[tid]||0);},0);
    var projs = fProjs.filter(function(p){return gTypeIds.includes(p.typeId);});
    var total = projs.reduce(function(s,p){return s+(p.cost||0);},0);
    var closed = projs.filter(function(p){return p.stage==='close';}).reduce(function(s,p){return s+(p.cost||0);},0);
    var pctT = tgt>0?Math.min(100,Math.round(total/tgt*100)):0;
    var pctC = tgt>0?Math.min(100,Math.round(closed/tgt*100)):0;
    var dots = gTypeIds.map(function(tid){
      var t=(window.PTYPES||[]).find(function(x){return x.id===tid;});
      return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+(t?t.color:'#9ba3b8')+';margin-right:3px;vertical-align:middle;"></span>';
    }).join('');
    rows.push({id:g.id,isGroup:true,label:dots+'<b style="vertical-align:middle;">'+esc(g.label)+'</b>',
      tgt,total,closed,pctT,pctC,needFind:Math.max(0,tgt-total),needClose:Math.max(0,tgt-closed)});
  });
  // Ungrouped type rows — แสดงทุกประเภทที่ไม่อยู่ในกลุ่ม ถ้ามีกลุ่มอยู่ หรือมีข้อมูล
  var showAllTypes = groups.length > 0;
  (window.PTYPES||[]).filter(function(t){return !groupedIds.has(t.id)&&(showAllTypes||allTypeIds.has(t.id));}).forEach(function(t){
    var tgt = Number(byType[t.id]||0);
    var projs = fProjs.filter(function(p){return p.typeId===t.id;});
    var total = projs.reduce(function(s,p){return s+(p.cost||0);},0);
    var closed = projs.filter(function(p){return p.stage==='close';}).reduce(function(s,p){return s+(p.cost||0);},0);
    var pctT = tgt>0?Math.min(100,Math.round(total/tgt*100)):0;
    var pctC = tgt>0?Math.min(100,Math.round(closed/tgt*100)):0;
    var c=t.color||'#4361ee';
    rows.push({id:t.id,isGroup:false,label:'<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+c+';margin-right:6px;vertical-align:middle;"></span><span style="vertical-align:middle;">'+esc(t.label)+'</span>',
      tgt,total,closed,pctT,pctC,needFind:Math.max(0,tgt-total),needClose:Math.max(0,tgt-closed)});
  });
  return rows;
}

window.renderAnnualTarget = function(fProjs, yr) {
  var wrap = document.getElementById('annual-target-wrap');
  if (!wrap) return;

  var currentBEYear = (new Date().getFullYear() + 543).toString();
  var displayYr = yr || currentBEYear;
  var targets = window.YEAR_TARGETS || [];
  var entry = targets.find(function(t) { return String(t.year) === String(displayYr); });
  var byType = (entry && entry.byType) ? entry.byType : {};
  var canEditTgt = window.isAdmin() || window.canEdit('targets');
  var hasGroups = (window.TARGET_TYPE_GROUPS||[]).length > 0;
  var grouped = hasGroups && (localStorage.getItem('tgt_grouped') !== '0');

  var rows = _buildAnnualTargetRows(fProjs, byType, grouped ? undefined : []);

  // toggle handler
  window._setTgtGrouped = function(val) {
    localStorage.setItem('tgt_grouped', val ? '1' : '0');
    window.setDoc(getDocRef('SETTINGS','app'), {tgt_grouped: val ? 1 : 0}, {merge:true}).catch(function(){});
    window.renderOverview();
  };

  var toggleHtml = hasGroups
    ? '<div style="display:flex;border:1px solid var(--border);border-radius:8px;overflow:hidden;font-size:11px;flex-shrink:0;">' +
        '<button onclick="window._setTgtGrouped(true)" style="padding:4px 12px;border:none;cursor:pointer;font-family:inherit;font-weight:600;background:'+(grouped?'var(--violet)':'var(--surface2)')+';color:'+(grouped?'#fff':'var(--txt2)')+';">รวมกลุ่ม</button>' +
        '<button onclick="window._setTgtGrouped(false)" style="padding:4px 12px;border:none;cursor:pointer;font-family:inherit;font-weight:600;background:'+(!grouped?'var(--violet)':'var(--surface2)')+';color:'+(!grouped?'#fff':'var(--txt2)')+';">แยกประเภท</button>' +
      '</div>'
    : '';

  var actionBtns = '<div style="display:flex;gap:8px;align-items:center;">' +
    toggleHtml +
    (window.isAdmin() ? '<button onclick="window.openTypeGroupModal()" style="padding:5px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--txt2);font-size:11px;cursor:pointer;font-family:inherit;">⚙️ จัดกลุ่ม</button>' : '') +
    '</div>';

  if (!rows.length) {
    wrap.innerHTML = '<div class="ov-card" style="padding:16px 20px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:18px;">🎯</span>' +
          '<span style="font-size:14px;font-weight:800;color:var(--txt);">เป้าหมายประจำปี พ.ศ. ' + displayYr + '</span>' +
          '<span style="font-size:12px;color:var(--txt3);margin-left:4px;">— ยังไม่ได้ตั้งเป้าหมาย</span></div>' +
        actionBtns +
      '</div>' +
    '</div>';
    return;
  }

  function miniBar(pct, color) {
    return '<div style="width:100%;height:6px;background:var(--surface3);border-radius:3px;overflow:hidden;margin-top:3px;">' +
      '<div style="width:' + Math.min(100,pct) + '%;height:100%;background:' + color + ';border-radius:3px;"></div></div>';
  }
  function gapChip(val, label, pos) {
    var ok = val <= 0;
    return '<div style="font-size:9px;color:var(--txt3);">' + label + '</div>' +
      '<div style="font-size:12px;font-weight:800;color:' + (ok?'#06d6a0':(pos?'#4361ee':'#ff6b6b')) + ';">' +
      (ok ? '✓ ถึงเป้า' : fc(val)) + '</div>';
  }

  var sumTgt    = rows.reduce(function(s,r){return s+r.tgt;},0);
  var sumTotal  = rows.reduce(function(s,r){return s+r.total;},0);
  var sumClosed = rows.reduce(function(s,r){return s+r.closed;},0);
  var sumPctT   = sumTgt>0?Math.min(100,Math.round(sumTotal/sumTgt*100)):0;
  var sumPctC   = sumTgt>0?Math.min(100,Math.round(sumClosed/sumTgt*100)):0;

  var colH = 'font-size:10px;font-weight:700;color:var(--txt3);padding:6px 10px;border-bottom:2px solid var(--border);white-space:nowrap;';
  var cell = 'font-size:12px;padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:middle;';
  var cellR = cell + 'text-align:right;';

  function displayRow(r) {
    return '<tr' + (r.isGroup ? ' style="background:rgba(124,92,252,.04);"' : '') + '>' +
      '<td style="' + cell + 'font-weight:700;color:var(--txt);">' + r.label + '</td>' +
      '<td style="' + cellR + 'color:var(--violet);font-weight:700;">' + (r.tgt>0?fc(r.tgt):'<span style="color:var(--txt3);">—</span>') + '</td>' +
      '<td style="' + cell + '">' +
        '<div style="font-size:12px;font-weight:700;color:#4361ee;">' + fc(r.total) +
          (r.tgt>0?' <span style="font-size:10px;color:var(--txt3);">('+r.pctT+'%)</span>':'') + '</div>' +
        (r.tgt>0?miniBar(r.pctT,'#4361ee'):'') + '</td>' +
      '<td style="' + cell + '">' +
        '<div style="font-size:12px;font-weight:700;color:#06d6a0;">' + fc(r.closed) +
          (r.tgt>0?' <span style="font-size:10px;color:var(--txt3);">('+r.pctC+'%)</span>':'') + '</div>' +
        (r.tgt>0?miniBar(r.pctC,'#06d6a0'):'') + '</td>' +
      '<td style="' + cellR + '">' + (r.tgt>0?gapChip(r.needFind,'ต้องหาเพิ่ม',true):'<span style="color:var(--txt3);font-size:11px;">—</span>') + '</td>' +
      '<td style="' + cellR + '">' + (r.tgt>0?gapChip(r.needClose,'ต้องปิดเพิ่ม',false):'<span style="color:var(--txt3);font-size:11px;">—</span>') + '</td>' +
    '</tr>';
  }

  var sumRow = '<tr style="background:var(--surface2);font-weight:800;">' +
    '<td style="' + cell + 'font-weight:800;color:var(--txt);">รวมทุกประเภท</td>' +
    '<td style="' + cellR + 'color:var(--violet);font-weight:800;">' + (sumTgt>0?fc(sumTgt):'—') + '</td>' +
    '<td style="' + cell + '"><div style="font-size:12px;font-weight:800;color:#4361ee;">' + fc(sumTotal) +
      (sumTgt>0?' <span style="font-size:10px;color:var(--txt3);">('+sumPctT+'%)</span>':'') + '</div>' +
      (sumTgt>0?miniBar(sumPctT,'#4361ee'):'') + '</td>' +
    '<td style="' + cell + '"><div style="font-size:12px;font-weight:800;color:#06d6a0;">' + fc(sumClosed) +
      (sumTgt>0?' <span style="font-size:10px;color:var(--txt3);">('+sumPctC+'%)</span>':'') + '</div>' +
      (sumTgt>0?miniBar(sumPctC,'#06d6a0'):'') + '</td>' +
    '<td style="' + cellR + '">' + (sumTgt>0?gapChip(Math.max(0,sumTgt-sumTotal),'ต้องหาเพิ่ม',true):'—') + '</td>' +
    '<td style="' + cellR + '">' + (sumTgt>0?gapChip(Math.max(0,sumTgt-sumClosed),'ต้องปิดเพิ่ม',false):'—') + '</td>' +
  '</tr>';

  wrap.innerHTML =
    '<div class="ov-card" style="padding:16px 20px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="font-size:18px;">🎯</span>' +
          '<span style="font-size:14px;font-weight:800;color:var(--txt);">เป้าหมายประจำปี พ.ศ. ' + displayYr + '</span>' +
        '</div>' +
        actionBtns +
      '</div>' +
      '<div style="overflow-x:auto;">' +
        '<table style="width:100%;border-collapse:collapse;min-width:600px;">' +
          '<thead><tr>' +
            '<th style="' + colH + 'text-align:left;">ประเภท / กลุ่มโครงการ</th>' +
            '<th style="' + colH + 'text-align:right;">🎯 เป้าหมาย</th>' +
            '<th style="' + colH + '">📁 ยอดโครงการทั้งหมด</th>' +
            '<th style="' + colH + '">✅ ปิดโครงการแล้ว</th>' +
            '<th style="' + colH + 'text-align:right;">ต้องหาเพิ่ม</th>' +
            '<th style="' + colH + 'text-align:right;">ต้องปิดเพิ่ม</th>' +
          '</tr></thead>' +
          '<tbody>' + rows.map(displayRow).join('') + sumRow + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
};

// ── TYPE GROUP MODAL (dynamic overlay — ไม่ต้องพึ่ง HTML) ─────────────────────
window.openTypeGroupModal = function() {
  // ลบ overlay เก่าถ้ามี
  var old = document.getElementById('tg-overlay');
  if (old) old.remove();

  window._editingGroups = (window.TARGET_TYPE_GROUPS||[]).map(function(g){
    return {id:g.id,label:g.label,typeIds:(g.typeIds||[]).slice()};
  });

  // สร้าง overlay
  var ov = document.createElement('div');
  ov.id = 'tg-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
  ov.innerHTML =
    '<div style="background:var(--surface);border-radius:16px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px 0;">' +
        '<div style="font-size:15px;font-weight:800;color:var(--txt);">⚙️ จัดกลุ่มประเภทโครงการ</div>' +
        '<button onclick="document.getElementById(\'tg-overlay\').remove()" style="width:30px;height:30px;border:none;background:var(--surface2);border-radius:50%;cursor:pointer;font-size:16px;color:var(--txt2);">✕</button>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--txt3);padding:6px 20px 14px;line-height:1.6;">นำประเภทโครงการหลายประเภทมาแสดงรวมเป็นแถวเดียวในตารางเป้าหมาย</div>' +
      '<div style="padding:0 20px;" id="tg-groups-list"></div>' +
      '<div style="padding:10px 20px;">' +
        '<button onclick="window._grpAdd()" style="width:100%;padding:9px;border:1px dashed var(--border);border-radius:8px;background:transparent;color:var(--txt3);font-size:13px;cursor:pointer;">➕ เพิ่มกลุ่ม</button>' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px;padding:12px 20px 20px;border-top:1px solid var(--border);margin-top:8px;">' +
        '<button onclick="document.getElementById(\'tg-overlay\').remove()" style="padding:8px 18px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--txt2);font-size:13px;cursor:pointer;">ยกเลิก</button>' +
        '<button onclick="window.saveTypeGroups()" style="padding:8px 20px;border:none;border-radius:8px;background:var(--violet);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">💾 บันทึกการจัดกลุ่ม</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ov);

  function _refresh() {
    var types = window.PTYPES||[];
    var html = '';
    window._editingGroups.forEach(function(g,gi){
      var pills = types.map(function(t){
        var on = g.typeIds.includes(t.id);
        return '<label style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border:1px solid '+(on?'var(--violet)':'var(--border)')+';border-radius:20px;cursor:pointer;font-size:11px;font-weight:600;background:'+(on?'var(--violet)':'var(--surface2)')+';color:'+(on?'#fff':'var(--txt2)')+';user-select:none;margin:2px;">' +
          '<input type="checkbox" style="display:none;" '+(on?'checked':'')+' onchange="window._grpToggle('+gi+',\''+t.id+'\')">' +
          '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:'+(t.color||'#4361ee')+';">&nbsp;</span>' +
          esc(t.label)+'</label>';
      }).join('');
      html += '<div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;background:var(--surface2);">' +
        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">' +
          '<input type="text" value="'+esc(g.label)+'" placeholder="ชื่อกลุ่ม เช่น คลังสินค้า+ครุภัณฑ์" ' +
            'oninput="window._editingGroups['+gi+'].label=this.value" ' +
            'style="flex:1;padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--txt);font-size:13px;">' +
          '<button onclick="window._grpRemove('+gi+')" style="padding:6px 10px;border:1px solid var(--coral);border-radius:8px;background:rgba(255,107,107,.1);color:var(--coral);font-size:12px;cursor:pointer;flex-shrink:0;">🗑</button>' +
        '</div>' +
        '<div style="display:flex;flex-wrap:wrap;">'+pills+'</div>' +
      '</div>';
    });
    var el = document.getElementById('tg-groups-list');
    if (el) el.innerHTML = html || '<div style="text-align:center;padding:20px;color:var(--txt3);font-size:12px;">— ยังไม่มีกลุ่ม กด ➕ เพื่อเพิ่ม —</div>';
  }

  window._grpToggle = function(gi,tid){
    var g=window._editingGroups[gi]; var idx=g.typeIds.indexOf(tid);
    if(idx>=0)g.typeIds.splice(idx,1); else g.typeIds.push(tid);
    _refresh();
  };
  window._grpRemove = function(gi){ window._editingGroups.splice(gi,1); _refresh(); };
  window._grpAdd = function(){
    window._editingGroups.push({id:'grp_'+Date.now(),label:'',typeIds:[]});
    _refresh();
  };
  _refresh();
};

// รวม YEAR_TARGETS + TARGET_TYPE_GROUPS เป็น payload เดียวสำหรับ save
function _yearTargetsPayload(yearEntries, groups) {
  var entries = (yearEntries||window.YEAR_TARGETS||[]).filter(function(t){return t.year&&!t._typeGroups;});
  var grps = groups||window.TARGET_TYPE_GROUPS||[];
  if (grps.length > 0) entries = entries.concat([{_typeGroups: grps}]);
  return entries;
}

window.saveTypeGroups = function() {
  var groups = (window._editingGroups||[]).filter(function(g){return g.label&&g.typeIds.length>0;});
  window.TARGET_TYPE_GROUPS = groups;
  try{localStorage.setItem('_tgt_groups',JSON.stringify(groups));}catch(e){}
  window.setDoc(getDocRef('SETTINGS','app'),{year_targets:_yearTargetsPayload(null,groups)},{merge:true})
    .then(function(){
      var ov=document.getElementById('tg-overlay'); if(ov)ov.remove();
      window.showAlert('บันทึกการจัดกลุ่มเรียบร้อย ✓','success');
      window.renderOverview();
      window.renderTargets&&window.renderTargets();
    }).catch(function(e){window.showDbError(e);});
};

// ── TARGET NUMBER FORMAT HELPERS ──
window._tgtNumFocus = function(el) {
  el.value = el.value.replace(/,/g, '');
};
window._tgtNumBlur = function(el) {
  var n = parseFloat(el.value.replace(/,/g, ''));
  el.value = (!isNaN(n) && n > 0)
    ? new Intl.NumberFormat('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(n)
    : '';
};
function _tgtFmtVal(v) {
  var n = Number(v);
  return (!isNaN(n) && n > 0)
    ? new Intl.NumberFormat('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(n)
    : '';
}

// ── TARGET MODAL ──
window.openTargetModal = function(yr) {
  var targets = window.YEAR_TARGETS || [];
  var entry = targets.find(function(t) { return String(t.year) === String(yr); });
  var byType = (entry && entry.byType) ? entry.byType : {};

  // ปีที่มีอยู่ในโครงการ (สำหรับ dropdown)
  var allYears = [...new Set((window.PROJECTS || []).map(function(p) {
    return p.start ? (new Date(p.start).getFullYear() + 543) : null;
  }).filter(Boolean))].sort(function(a, b) { return b - a; });
  var currentBE = new Date().getFullYear() + 543;
  if (!allYears.includes(currentBE)) allYears.unshift(currentBE);
  if (!allYears.includes(Number(yr))) allYears.unshift(Number(yr));

  var yrOpts = allYears.map(function(y) {
    return '<option value="' + y + '"' + (String(y) === String(yr) ? ' selected' : '') + '>พ.ศ. ' + y + '</option>';
  }).join('');

  var typeRows = (window.PTYPES || []).map(function(t) {
    var cur = byType[t.id] ? Number(byType[t.id]) : '';
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">' +
      '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + (t.color || '#4361ee') + ';flex-shrink:0;"></span>' +
      '<span style="flex:1;font-size:13px;font-weight:600;color:var(--txt);">' + esc(t.label) + '</span>' +
      '<input type="text" inputmode="numeric" id="tgt-inp-' + t.id + '" value="' + _tgtFmtVal(cur) + '" placeholder="0.00" ' +
        'onfocus="window._tgtNumFocus(this)" onblur="window._tgtNumBlur(this)" ' +
        'style="width:160px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--txt);font-size:13px;text-align:right;">' +
      '<span style="font-size:12px;color:var(--txt3);">บาท</span>' +
    '</div>';
  }).join('');

  var html = '<div style="padding:20px;">' +
    '<div style="font-size:16px;font-weight:800;color:var(--txt);margin-bottom:16px;">🎯 ตั้งเป้าหมายประจำปี</div>' +
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">' +
      '<label style="font-size:13px;font-weight:600;color:var(--txt2);">ปี พ.ศ.:</label>' +
      '<select id="tgt-yr-sel" onchange="window._reloadTargetModal(this.value)" style="padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--txt);font-size:13px;">' +
        yrOpts + '</select>' +
    '</div>' +
    '<div style="display:flex;flex-direction:column;gap:0;">' + typeRows + '</div>' +
    '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;">' +
      '<button onclick="window.closeM(\'m-target\')" style="padding:8px 18px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--txt2);font-size:13px;cursor:pointer;">ยกเลิก</button>' +
      '<button onclick="window.saveAnnualTargets()" style="padding:8px 20px;border:none;border-radius:8px;background:var(--violet);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">💾 บันทึก</button>' +
    '</div>' +
  '</div>';

  document.getElementById('m-target-body').innerHTML = html;
  window._targetModalYr = String(yr);
  document.getElementById('m-target').classList.add('on');
};

window._reloadTargetModal = function(newYr) {
  window.openTargetModal(newYr);
};

window.saveAnnualTargets = function() {
  var yr = window._targetModalYr;
  var byType = {};
  (window.PTYPES || []).forEach(function(t) {
    var inp = document.getElementById('tgt-inp-' + t.id);
    if (inp) {
      var val = parseFloat(inp.value.replace(/,/g, ''));
      if (!isNaN(val) && val > 0) byType[t.id] = val;
    }
  });
  var targets = (window.YEAR_TARGETS || []).filter(function(t) { return String(t.year) !== String(yr); });
  if (Object.keys(byType).length > 0) targets.push({ year: Number(yr), byType: byType });
  window.YEAR_TARGETS = targets;
  window.setDoc(getDocRef('SETTINGS', 'app'), { year_targets: _yearTargetsPayload(targets) }, { merge: true })
    .then(function() {
      window.closeM('m-target');
      window.showAlert('บันทึกเป้าหมายปี ' + yr + ' เรียบร้อย ✓', 'success');
      window.renderOverview();
      window.renderTargets && window.renderTargets();
    })
    .catch(function(e) { window.showDbError(e); });
};

// ── TARGETS PAGE ──────────────────────────────────────────────────────────────
window.renderTargets = function() {
  var body = document.getElementById('targets-body');
  if (!body) return;
  var canEdit = window.isAdmin() || window.canEdit('targets');

  // year selector
  var allYears = [...new Set([
    ...(window.PROJECTS || []).map(function(p) { return p.start ? (new Date(p.start).getFullYear() + 543) : null; }).filter(Boolean),
    new Date().getFullYear() + 543
  ])].sort(function(a, b) { return b - a; });

  var selYr = window._targetsPageYr || String(allYears[0] || (new Date().getFullYear() + 543));
  window._targetsPageYr = selYr;

  var yrOpts = allYears.map(function(y) {
    return '<option value="' + y + '"' + (String(y) === selYr ? ' selected' : '') + '>พ.ศ. ' + y + '</option>';
  }).join('');

  var targets = window.YEAR_TARGETS || [];
  var entry = targets.find(function(t) { return String(t.year) === selYr; });
  var byType = (entry && entry.byType) ? entry.byType : {};

  var groups = window.TARGET_TYPE_GROUPS || [];
  var groupedIds = new Set();
  groups.forEach(function(g){(g.typeIds||[]).forEach(function(tid){groupedIds.add(tid);});});

  function _tgtInput(id, val, readOnly) {
    return '<input type="text" inputmode="numeric" id="tpg-'+id+'" value="'+_tgtFmtVal(val)+'" placeholder="0.00" '+
      (readOnly ? 'disabled ' : 'onfocus="window._tgtNumFocus(this)" onblur="window._tgtNumBlur(this)" ')+
      'style="width:180px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:'+(readOnly?'var(--surface2)':'var(--surface)')+';color:var(--txt);font-size:13px;text-align:right;'+(readOnly?'opacity:.7;':'')+'">';
  }

  // Group rows — แสดง input ต่อประเภทภายในกลุ่ม
  var groupRows = groups.map(function(g){
    var dots = (g.typeIds||[]).map(function(tid){
      var t=(window.PTYPES||[]).find(function(x){return x.id===tid;}); return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+(t?t.color:'#9ba3b8')+';margin-right:3px;"></span>';
    }).join('');
    var typeInputRows = (g.typeIds||[]).map(function(tid){
      var t=(window.PTYPES||[]).find(function(x){return x.id===tid;});
      if(!t) return '';
      return '<div style="display:flex;align-items:center;gap:12px;padding:8px 0 8px 16px;border-bottom:1px solid var(--border);">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:'+(t.color||'#4361ee')+';flex-shrink:0;display:inline-block;"></span>' +
        '<span style="flex:1;font-size:12px;color:var(--txt2);">'+esc(t.label)+'</span>' +
        _tgtInput('inp-'+t.id, byType[t.id]?Number(byType[t.id]):'', !canEdit) +
        '<span style="font-size:12px;color:var(--txt3);width:30px;">บาท</span>' +
      '</div>';
    }).join('');
    return '<div style="border-bottom:1px solid var(--border);">' +
      '<div style="display:flex;align-items:center;gap:8px;padding:10px 0 6px;">' +
        '<span style="font-size:12px;font-weight:800;color:var(--violet);">'+dots+esc(g.label)+'</span>' +
        '<span style="font-size:10px;color:var(--txt3);">(รวมกลุ่ม)</span>' +
      '</div>' +
      typeInputRows +
    '</div>';
  }).join('');

  // Ungrouped type rows
  var ungroupedRows = (window.PTYPES||[]).filter(function(t){return !groupedIds.has(t.id);}).map(function(t){
    return '<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">' +
      '<span style="width:12px;height:12px;border-radius:50%;background:'+(t.color||'#4361ee')+';flex-shrink:0;display:inline-block;"></span>' +
      '<span style="flex:1;font-size:13px;font-weight:600;color:var(--txt);">'+esc(t.label)+'</span>' +
      _tgtInput('inp-'+t.id, byType[t.id]?Number(byType[t.id]):'', !canEdit) +
      '<span style="font-size:12px;color:var(--txt3);width:30px;">บาท</span>' +
    '</div>';
  }).join('');

  body.innerHTML =
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:22px 24px;">' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;">' +
        '<span style="font-size:15px;font-weight:800;color:var(--txt);">🎯 ตั้งเป้าหมายประจำปี</span>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-left:auto;">' +
          (window.isAdmin()?'<button onclick="window.openTypeGroupModal()" style="padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--txt2);font-size:12px;cursor:pointer;">⚙️ จัดกลุ่มประเภท</button>':'') +
          '<label style="font-size:12px;font-weight:600;color:var(--txt3);">ปี พ.ศ.:</label>' +
          '<select onchange="window._targetsPageYr=this.value;window.renderTargets()" ' +
            'style="padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--txt);font-size:13px;">' +
            yrOpts +
          '</select>' +
        '</div>' +
      '</div>' +
      (groups.length?'<div style="font-size:11px;font-weight:700;color:var(--txt3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">กลุ่มประเภท</div>':'') +
      '<div>' + groupRows + '</div>' +
      (ungroupedRows?'<div style="font-size:11px;font-weight:700;color:var(--txt3);margin:14px 0 6px;text-transform:uppercase;letter-spacing:.5px;">ประเภทอื่น ๆ</div>':'') +
      '<div>' + ungroupedRows + '</div>' +
      (canEdit ?
        '<div style="display:flex;justify-content:flex-end;margin-top:18px;">' +
          '<button onclick="window.saveTargetsPage()" style="padding:9px 24px;border:none;border-radius:8px;background:var(--violet);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">💾 บันทึกเป้าหมาย</button>' +
        '</div>'
      : '<div style="margin-top:12px;font-size:11px;color:var(--txt3);text-align:right;">— คุณมีสิทธิ์ดูเท่านั้น —</div>') +
    '</div>';
};

window.saveTargetsPage = function() {
  var yr = window._targetsPageYr;
  if (!yr) return;
  var byType = {};
  // ทุกประเภท (ทั้งในกลุ่มและไม่ในกลุ่ม) — save per-type
  (window.PTYPES||[]).forEach(function(t){
    var inp = document.getElementById('tpg-inp-'+t.id);
    if (inp) { var v=parseFloat(inp.value.replace(/,/g,'')); if(!isNaN(v)&&v>0) byType[t.id]=v; }
  });
  var targets = (window.YEAR_TARGETS||[]).filter(function(t){return String(t.year)!==String(yr);});
  if (Object.keys(byType).length>0) targets.push({year:Number(yr),byType:byType});
  window.YEAR_TARGETS = targets;
  window.setDoc(getDocRef('SETTINGS','app'),{year_targets:_yearTargetsPayload(targets)},{merge:true})
    .then(function(){
      window.showAlert('บันทึกเป้าหมายปี '+yr+' เรียบร้อย ✓','success');
      window.renderOverview();
    }).catch(function(e){window.showDbError(e);});
};

