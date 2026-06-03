const { esc, fd, fc, fca, pd, gS, gT, gG, gSt, gC, avC, uid, getFY, getYearBE, getStaffOverlaps, overlapWarnText, getStaffLeaveConflicts, getColRef, getDocRef } = window;
const setDoc = (...a) => window.setDoc(...a);
// ── PROJECTS ──
window.projGrpTab='';
window.projGroupType=function(groupId){
  var g=gG(groupId);if(!g)return'onsite';
  var lbl=(g.label||'').toLowerCase();
  if(lbl.includes('revisit')||lbl.includes('เยี่ยม'))return'revisit';
  if(lbl.includes('onsite')||lbl.includes('แถม'))return'onsite';
  if(lbl.includes('office')||lbl.includes('ออฟฟิศ')||lbl.includes('online'))return'nonadv';
  return'other';
};
window.isOnsiteGroup=function(groupId){
  var g=gG(groupId);if(!g)return false;
  var lbl=(g.label||'').toLowerCase();
  return lbl.includes('onsite')||lbl.includes('แถม');
};
window.renderProjects=function(){
  var tabs=document.getElementById('proj-tabs');
  if(tabs){
    var allGroups=[{id:'',label:'ทั้งหมด',color:'#7c5cfc'}];
    var onsiteGs=window.PGROUPS.filter(function(g){return window.isOnsiteGroup(g.id);});
    if(onsiteGs.length>0)allGroups.push({id:'__onsite__',label:'ติดตั้งระบบ (Onsite)',color:onsiteGs[0].color});
    window.PGROUPS.filter(function(g){return !window.isOnsiteGroup(g.id);}).forEach(function(g){allGroups.push(g);});
    tabs.innerHTML=allGroups.map(function(g){
      var cnt=g.id===''?window.PROJECTS.length:g.id==='__onsite__'?window.PROJECTS.filter(function(p){return window.isOnsiteGroup(p.groupId);}).length:window.PROJECTS.filter(function(p){return p.groupId===g.id;}).length;
      var on=window.projGrpTab===g.id;
      return`<div class="af-tab${on?' on':''}" style="${on?'background:'+g.color+';color:#fff':''}" onclick="window.projGrpTab='${g.id}';window.renderProjects()">${esc(g.label)}<span class="af-cnt">${cnt}</span></div>`;
    }).join('');
  }
  var fyf=document.getElementById('proj-fy');
  if(fyf&&fyf.options.length<=1){var fys=[...new Set(window.PROJECTS.map(p=>getYearBE(p.start)).filter(Boolean))].sort((a,b)=>b-a);fys.forEach(function(fy){var o=document.createElement('option');o.value=fy;o.textContent='ปี พ.ศ. '+fy;fyf.appendChild(o);});var _cbe=(new Date().getFullYear()+543).toString();if(!fyf.value||fyf.value==='')fyf.value=_cbe;}
  var tf=document.getElementById('proj-type');
  if(tf&&tf.options.length<=1){window.PTYPES.forEach(function(t){var o=document.createElement('option');o.value=t.id;o.textContent=t.label;tf.appendChild(o);});}
  var sf=document.getElementById('proj-stg');
  if(sf&&sf.options.length<=1){window.STAGES.forEach(function(s){var o=document.createElement('option');o.value=s.id;o.textContent=s.label;sf.appendChild(o);});}
  var grp=window.projGrpTab||'';
  var isAll=!grp;
  var typeEl=document.getElementById('proj-type');var sortEl=document.getElementById('proj-sort');
  if(typeEl)typeEl.style.display='';
  if(sortEl)sortEl.style.display=isAll?'':'none';
  var q=(document.getElementById('proj-q')||{}).value||'';
  var ty=(document.getElementById('proj-type')||{}).value||'';
  var st=(document.getElementById('proj-stg')||{}).value||'';
  var fy=(document.getElementById('proj-fy')||{}).value||'';
  var rows=window.PROJECTS.filter(function(p){
    var grpMatch=!grp||(grp==='__onsite__'?window.isOnsiteGroup(p.groupId):p.groupId===grp);
    return grpMatch&&(!q||p.name.includes(q))&&(!ty||p.typeId===ty)&&(!st||p.stage===st)&&(!fy||getYearBE(p.start)==fy);
  });
  var sortVal=(document.getElementById('proj-sort')||{}).value||'start_asc';
  rows.sort(function(a,b){
    var av,bv;
    if(sortVal==='start_asc'||sortVal==='start_desc'){av=a.start?pd(a.start):new Date(0);bv=b.start?pd(b.start):new Date(0);return sortVal==='start_asc'?av-bv:bv-av;}
    if(sortVal==='end_asc'||sortVal==='end_desc'){av=a.end?pd(a.end):new Date(0);bv=b.end?pd(b.end):new Date(0);return sortVal==='end_asc'?av-bv:bv-av;}
    if(sortVal==='name_asc'||sortVal==='name_desc'){return sortVal==='name_asc'?a.name.localeCompare(b.name,'th'):b.name.localeCompare(a.name,'th');}
    if(sortVal==='progress_asc'||sortVal==='progress_desc'){return sortVal==='progress_desc'?b.progress-a.progress:a.progress-b.progress;}
    return 0;
  });
  var gType=grp==='__onsite__'?'onsite':(grp?window.projGroupType(grp):'all');
  var showRevisit=(!grp||gType==='onsite');
  var showParent=(gType==='revisit');
  var showAdv=(gType!=='nonadv');
  var thead=document.getElementById('proj-thead-row');
  if(thead){
    var cols='<th>โครงการ / ทีมงาน</th>';
    if(showParent)cols+='<th>โครงการหลัก</th><th>ครั้งที่</th>';
    cols+='<th>วันเริ่ม / สิ้นสุด</th>';
    if(showRevisit)cols+='<th>Revisit 1 / 2</th>';
    if(showAdv)cols+='<th>วันที่ ADV. / กำหนดเคลียร์</th><th>สถานะ ADV.</th>';
    cols+='<th>สถานะที่พัก</th>';
    cols+='<th style="width:80px"></th>';
    thead.innerHTML=cols;
  }
  var colSpan=4+(showParent?2:0)+(showRevisit?1:0)+(showAdv?2:0);
  var tb=document.getElementById('proj-rows');if(!tb)return;
  tb.innerHTML=rows.map(function(p){
    var sg=gS(p.stage);var pt=gT(p.typeId);var pg=gG(p.groupId);
    var pAdvs=window.ADVANCES.filter(function(a){return a.pid===p.id;});
    var adv=pAdvs.find(function(a){return a.status!=='cleared';})||pAdvs[pAdvs.length-1];
    var advRdate=adv&&adv.rdate?fd(adv.rdate):'<span style="color:var(--txt3)">-</span>';
    var advDdate=adv&&adv.ddate?fd(adv.ddate):'<span style="color:var(--txt3)">-</span>';
    var advStat=adv?window.AFLW.find(function(x){return x.id===adv.status;}):null;
    var advStatHtml=advStat?`<span class="tag" style="background:${advStat.color}18;color:${advStat.color};font-size:10px;">${advStat.label}</span>`:'<span style="color:var(--txt3)">—</span>';
    var mems=(p.members||p.team.map(function(id){return{sid:id};})).map(function(m){return gSt(m.sid);});
    var nicknames=mems.map(function(m){return m.nickname||m.name.split(' ')[0];}).filter(Boolean).join(', ')||'<span style="color:var(--txt3)">ไม่มีทีม</span>';
    var pgHtml=pg?`<span class="tag" style="background:${pg.color}18;color:${pg.color};font-size:9px;padding:2px 6px">${esc(pg.label)}</span>`:'';
    var parentCells='';
    if(showParent){
      var parentProj=p.parentProjectId?window.PROJECTS.find(function(x){return x.id===p.parentProjectId;}):null;
      var parentName=parentProj?esc(parentProj.name):'<span style="color:var(--txt3)">-</span>';
      parentCells=`<td style="font-size:11px;color:var(--txt2);">${parentName}</td><td style="font-size:11px;font-weight:600;color:var(--violet);text-align:center;">${p.revisitRound?'ครั้งที่ '+p.revisitRound:'<span style="color:var(--txt3)">-</span>'}</td>`;
    }
    var _ctInfo='';
    if(p.contractId){var _ctObj=(window.CONTRACTS||[]).find(function(c){return c.id===p.contractId;});if(_ctObj){_ctInfo='<div style="font-size:10px;color:var(--indigo);margin-top:3px;line-height:1.5;">📃 <span style="font-weight:700;">'+esc(_ctObj.id)+'</span> '+esc(_ctObj.name)+(_ctObj.startDate||_ctObj.endDate?' <span style="color:var(--txt3);">'+(_ctObj.startDate?fd(_ctObj.startDate):'?')+'–'+(_ctObj.endDate?fd(_ctObj.endDate):'?')+'</span>':'')+'</div>';}}
    var _revDone=false;
    if(showRevisit){var _revKids=(window.PROJECTS||[]).filter(function(rp){return rp.groupId==='GRP17733355541904'&&rp.parentProjectId===p.id;});_revDone=_revKids.some(function(rp){return rp.revisitRound==99;})||(_revKids.length===1);}
    var revisitCell=showRevisit?('<td style="font-size:11px;color:var(--txt2);line-height:1.6">'+(_revDone?'<span style="display:inline-block;font-size:9px;background:rgba(32,201,151,.1);color:var(--teal);padding:1px 7px;border-radius:10px;font-weight:700;border:1px solid rgba(32,201,151,.3);margin-bottom:3px;">✅ Revisit ครบแล้ว</span><br>':'')+'📅 '+(p.revisit1?fd(p.revisit1):'<span style="color:var(--txt3)">-</span>')+'<br>📅 '+(p.revisit2?fd(p.revisit2):'<span style="color:var(--txt3)">-</span>')+'</td>'):'';
    var advCells=showAdv?`<td style="font-size:11px;color:var(--txt2);line-height:1.6">📅 ${advRdate}<br>⏰ ${advDdate}</td><td>${advStatHtml}</td>`:'';
    var hasLinked=window.ADVANCES.some(function(adv){return adv.pid===p.id;})||window.LODGINGS.some(function(l){return l.pid===p.id;});
    var _exLd=['GRP17733355541905','GRP17733355541906'];
    var ldStatusCell='<td style="font-size:11px;color:var(--txt3);">—</td>';
    if(!_exLd.includes(p.groupId)){var _pLds=window.LODGINGS.filter(function(l){return l.pid===p.id;});if(!_pLds.length){ldStatusCell='<td style="font-size:11px;color:var(--txt3);">—</td>';}else{var _appD=_pLds.some(function(l){return l.approvedDaily==='yes';});var _appM=_pLds.some(function(l){return l.approvedMonthly==='yes';});if(_appD&&_appM){ldStatusCell='<td><div style="display:flex;flex-direction:column;gap:2px;"><span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;background:#4361ee18;color:var(--indigo);border:1px solid #4361ee30;white-space:nowrap;">✅ รายวัน</span><span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;background:var(--coral)18;color:var(--coral);border:1px solid var(--coral)30;white-space:nowrap;">✅ รายเดือน</span></div></td>';}else if(_appD){ldStatusCell='<td><span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;background:#4361ee18;color:var(--indigo);border:1px solid #4361ee30;white-space:nowrap;">✅ รายวัน</span></td>';}else if(_appM){ldStatusCell='<td><span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;background:var(--coral)18;color:var(--coral);border:1px solid var(--coral)30;white-space:nowrap;">✅ รายเดือน</span></td>';}else{ldStatusCell='<td><span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;background:var(--amber)18;color:var(--amber);border:1px solid var(--amber)30;white-space:nowrap;">⏳ รออนุมัติ</span></td>';}}}

    return`<tr class="fade" onclick="window.openProjModal('${p.id}')">
      <td><div style="font-weight:600;font-size:13px">${esc(p.name)}</div>${p.siteOwner?`<div style="font-size:10px;color:var(--txt3);margin-top:2px;">🏢 ${esc(p.siteOwner)}</div>`:''}<div style="display:flex;align-items:center;gap:6px;margin-top:4px;">${pgHtml}<span class="tag" style="background:${pt.color}18;color:${pt.color};font-size:9px;padding:2px 6px">${esc(pt.label)}</span><span class="tag" style="background:${sg.color}18;color:${sg.color};font-size:9px;padding:2px 6px">${sg.label}</span><span style="font-size:10px;font-weight:700;color:${sg.color}">${p.progress}%</span></div><div style="font-size:11px;color:var(--violet);margin-top:6px;font-weight:600;">👥 ${nicknames}</div>${p.note?`<div style="font-size:11px;color:var(--amber);margin-top:4px;">⚠ ${esc(p.note)}</div>`:''}${_ctInfo}</td>
      ${parentCells}
      <td style="font-size:11px;color:var(--txt2);line-height:1.6">📅 ${p.start?fd(p.start):'<span style="color:var(--txt3)">-</span>'}<br>⏰ ${p.end?fd(p.end):'<span style="color:var(--txt3)">-</span>'}</td>
      ${revisitCell}
      ${advCells}
      ${ldStatusCell}
      <td onclick="event.stopPropagation()"><div style="display:flex;gap:4px">${window.canEdit('projects')?`<button class="btn btn-ghost btn-sm" onclick="window.openProjModal('${p.id}')">✏️</button>`:''}${window.canDel('projects')&&!hasLinked?`<button class="btn btn-red btn-sm" onclick="window.askDel('project','${p.id}','${esc(p.name)}')">🗑</button>`:''}</div></td>
    </tr>`;
  }).join('');
  if(!rows.length)tb.innerHTML=`<tr><td colspan="${colSpan}" style="text-align:center;padding:48px;color:var(--txt3);">ไม่พบข้อมูล</td></tr>`;
}

window.showProjHolidaysPopup=function(pid){
  var p=window.PROJECTS.find(function(x){return x.id===pid;});if(!p)return;
  var ps=pd(p.start),pe=pd(p.end);pe.setHours(23,59,59);
  var hols=window.HOLIDAYS.filter(function(h){if(!h.date)return false;var hd=pd(h.date);return hd>=ps&&hd<=pe;}).sort(function(a,b){return(a.date||'').localeCompare(b.date||'');});
  var rows=hols.map(function(h){return'<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px;"><span style="color:var(--coral);font-weight:700;min-width:88px;">'+fd(h.date)+'</span><span style="color:var(--txt2);">'+esc(h.name)+'</span></div>';}).join('');
  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  ov.setAttribute('data-ovpop','1');
  ov.innerHTML='<div style="background:var(--surface);border-radius:14px;padding:24px 28px;max-width:420px;width:90%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,.35);border:1px solid var(--border);">'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;"><span style="font-size:22px;">🎌</span><div><div style="font-size:14px;font-weight:700;color:var(--coral);">วันหยุดในช่วงโครงการ</div><div style="font-size:11px;color:var(--txt3);">'+esc(p.name)+'</div></div></div>'
    +'<div style="font-size:11px;color:var(--txt3);margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border);">'+fd(p.start)+' — '+fd(p.end)+'</div>'
    +'<div style="overflow-y:auto;flex:1;margin-bottom:14px;">'+rows+'</div>'
    +'<button onclick="this.closest(\'[data-ovpop]\').remove()" style="width:100%;padding:9px;background:var(--violet);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">ปิด</button>'
    +'</div>';
  ov.addEventListener('click',function(e){if(e.target===ov)ov.remove();});
  document.body.appendChild(ov);
};
window.showAlert=function(msg,type){
  var cfg={
    error:{icon:'❌',title:'ข้อผิดพลาด',color:'var(--coral)'},
    warn: {icon:'⚠️',title:'คำเตือน',   color:'var(--amber)'},
    info: {icon:'ℹ️',title:'แจ้งเตือน',  color:'var(--violet)'},
    success:{icon:'✅',title:'สำเร็จ',   color:'var(--teal)'},
  }[type||'error']||{icon:'❌',title:'ข้อผิดพลาด',color:'var(--coral)'};
  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center;animation:fadeIn .15s ease;';
  ov.setAttribute('data-salert','1');
  ov.innerHTML='<div style="background:var(--surface);border-radius:16px;padding:28px 32px;max-width:360px;width:90%;box-shadow:0 12px 48px rgba(0,0,0,.3);border:1px solid var(--border);text-align:center;">'
    +'<div style="font-size:36px;margin-bottom:12px;">'+cfg.icon+'</div>'
    +'<div style="font-size:15px;font-weight:700;color:'+cfg.color+';margin-bottom:8px;">'+cfg.title+'</div>'
    +'<div style="font-size:13px;color:var(--txt2);line-height:1.7;margin-bottom:20px;">'+esc(msg)+'</div>'
    +'<button onclick="this.closest(\'[data-salert]\').remove()" style="padding:9px 32px;background:'+cfg.color+';color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">ตกลง</button>'
    +'</div>';
  ov.addEventListener('click',function(e){if(e.target===ov)ov.remove();});
  document.body.appendChild(ov);
  if(type==='success'){setTimeout(function(){if(ov.parentNode)ov.remove();},2000);}
};

window.showConfirm=function(msg,onOk,opts){
  var cfg=opts||{};
  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center;';
  ov.setAttribute('data-sconfirm','1');
  var icon=cfg.icon||'🗑';var title=cfg.title||'ยืนยันการดำเนินการ';var okColor=cfg.okColor||'var(--coral)';var okText=cfg.okText||'ตกลง';
  ov.innerHTML='<div style="background:var(--surface);border-radius:16px;padding:28px 32px;max-width:360px;width:90%;box-shadow:0 12px 48px rgba(0,0,0,.3);border:1px solid var(--border);text-align:center;">'
    +'<div style="font-size:36px;margin-bottom:12px;">'+icon+'</div>'
    +'<div style="font-size:15px;font-weight:700;color:var(--txt);margin-bottom:8px;">'+title+'</div>'
    +'<div style="font-size:13px;color:var(--txt2);line-height:1.7;margin-bottom:22px;">'+esc(msg)+'</div>'
    +'<div style="display:flex;gap:10px;justify-content:center;">'
    +'<button id="sc-cancel" style="flex:1;padding:9px;background:var(--surface2);color:var(--txt2);border:1px solid var(--border);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">ยกเลิก</button>'
    +'<button id="sc-ok" style="flex:1;padding:9px;background:'+okColor+';color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">'+okText+'</button>'
    +'</div></div>';
  ov.querySelector('#sc-cancel').onclick=function(){ov.remove();if(cfg.onCancel)cfg.onCancel();};
  ov.querySelector('#sc-ok').onclick=function(){ov.remove();if(onOk)onOk();};
  ov.addEventListener('click',function(e){if(e.target===ov){ov.remove();if(cfg.onCancel)cfg.onCancel();}});
  document.body.appendChild(ov);
};

window.confirmAsync=function(msg,opts){
  return new Promise(function(resolve){
    window.showConfirm(msg,function(){resolve(true);},Object.assign({},opts,{onCancel:function(){resolve(false);}}));
  });
};

window.showOverlapPopup=function(htmlMsg){
  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  ov.setAttribute('data-ovpop','1');
  ov.innerHTML='<div style="background:var(--surface);border-radius:14px;padding:24px 28px;max-width:380px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.35);border:1px solid var(--border);">'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;"><span style="font-size:22px;">⚠️</span><span style="font-size:14px;font-weight:700;color:var(--coral);">พบงานซ้อนทับ!</span></div>'
    +'<div style="font-size:12px;color:var(--txt2);line-height:1.7;margin-bottom:16px;">'+htmlMsg+'</div>'
    +'<button onclick="this.closest(\'[data-ovpop]\').remove()" style="width:100%;padding:9px;background:var(--violet);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">ตกลง รับทราบ</button>'
    +'</div>';
  ov.addEventListener('click',function(e){if(e.target===ov)ov.remove();});
  document.body.appendChild(ov);
};
window.checkMemOverlap=function(mid){
  var sidEl=document.getElementById('msid-'+mid);var msEl=document.getElementById('ms-'+mid);var meEl=document.getElementById('me-'+mid);var warnEl=document.getElementById('mwarn-'+mid);
  if(!sidEl||!msEl||!meEl||!warnEl)return;
  var overlaps=getStaffOverlaps(sidEl.value,msEl.value,meEl.value,window.editPid);
  var leaveC=getStaffLeaveConflicts(sidEl.value,msEl.value,meEl.value);
  var wlC=window.getStaffWlConflicts?getStaffWlConflicts(sidEl.value,msEl.value,meEl.value):[];
  var html='';
  if(overlaps.length>0)html+='<span style="color:var(--coral)">'+overlapWarnText(overlaps)+'</span>';
  if(leaveC.length>0){if(html)html+='<br>';html+='<span style="color:var(--amber)">'+leaveC.map(function(c){return c.emoji+' มีการลา'+c.label+' ('+fd(c.leave.startDate)+' – '+fd(c.leave.endDate)+')';}).join('<br>')+'</span>';}
  if(wlC.length>0){if(html)html+='<br>';html+='<span style="color:var(--amber)">'+wlC.map(function(c){return c.emoji+' มีบันทึกงาน: '+esc(c.wl.title)+' ('+fd(c.wl.type==='daily'?c.wl.date:c.wl.startDate)+(c.wl.type==='period'?' – '+fd(c.wl.endDate):'')+')';}).join('<br>')+'</span>';}
  if(html){warnEl.innerHTML=html;warnEl.style.display='block';}else warnEl.style.display='none';
}

window.updateAllMemDates=function(){
  var sdt=(document.getElementById('pf-start')||{}).value||'';
  var edt=(document.getElementById('pf-end')||{}).value||'';
  var ml=document.getElementById('mem-list');
  // ใช้ค่าที่เก็บไว้ใน data-proj-s/e แทน — อัพเดททันทีหลังแต่ละ sync
  var origS=ml?ml.getAttribute('data-proj-s')||'':'';
  var origE=ml?ml.getAttribute('data-proj-e')||'':'';
  document.querySelectorAll('#mem-list > .m-row[id^="mr-"]').forEach(function(div){
    var mid=div.id.slice(3);
    var ms=document.getElementById('ms-'+mid);
    var me=document.getElementById('me-'+mid);
    if(ms&&sdt&&(!ms.value||ms.value===origS))ms.value=sdt;
    if(me&&edt&&(!me.value||me.value===origE))me.value=edt;
    if(ms&&me)window.checkMemOverlap(mid);
  });
  // อัพเดท baseline เพื่อให้ sync ครั้งถัดไปทำงานได้ถูก (กรณีเปลี่ยนวันซ้ำหลายรอบ)
  if(ml&&sdt)ml.setAttribute('data-proj-s',sdt);
  if(ml&&edt)ml.setAttribute('data-proj-e',edt);
}

window.openProjModal=function(id){
  window.editPid=id;
  var p=id?window.PROJECTS.find(function(x){return x.id===id;}):null;
  document.getElementById('m-proj-title').textContent=p?'แก้ไขโครงการ':'เพิ่มโครงการใหม่';
  var mems=p?(p.members||p.team.map(function(tid){return{id:'M'+uid(),sid:tid,s:p.start,e:p.end};})):[];
  var grpOpts='<option value="">-- ไม่ระบุกลุ่ม --</option>'+window.PGROUPS.map(function(g){return`<option value="${g.id}"${p&&p.groupId===g.id?' selected':''}>${esc(g.label)}</option>`;}).join('');
  var stgOpts=window.STAGES.map(function(s){return`<option value="${s.id}"${p&&p.stage===s.id?' selected':''}>${s.label}</option>`;}).join('');
  var typOpts='<option value="">-- เลือกประเภท --</option>'+window.PTYPES.map(function(t){return`<option value="${t.id}"${p&&p.typeId===t.id?' selected':''}>${t.label}</option>`;}).join('');
  var staffSorted=window.STAFF.filter(function(s){return s.active!==false;}).slice().sort(function(a,b){var da=a.dept||'zzz',db=b.dept||'zzz';if(da!==db)return da.localeCompare(db,'th');return(a.role||'').localeCompare(b.role||'','th');});
  function _ownerPri(r){if(!r)return 99;if(r.includes('ผู้จัดการ'))return 1;if(r.includes('หัวหน้า'))return 2;return 3;}
  var ownerStaff=window.STAFF.filter(function(s){return s.active!==false&&s.role&&(s.role.includes('ผู้จัดการ')||s.role.includes('หัวหน้า'));}).slice().sort(function(a,b){var pa=_ownerPri(a.role),pb=_ownerPri(b.role);if(pa!==pb)return pa-pb;return(a.name||'').localeCompare(b.name||'','th');});
  var ownerOpts='<option value="">-- เลือกเจ้าของไซต์ --</option>'+ownerStaff.map(function(s){return`<option value="${esc(s.name)}"${p&&p.siteOwner===s.name?' selected':''}>${esc(s.name)}${s.nickname?' ('+esc(s.nickname)+')':''}`;}).join('');
  var _instPosIds=['POS17733356564931','POS17733356564934','POS17733356564935','POS17733356564937','POS17733356564936'];
  var _instPosLabels=window.POSITIONS.filter(function(pos){return _instPosIds.includes(pos.id);}).map(function(pos){return pos.label;});
  var installerOpts='<option value="">-- เลือกผู้ติดตั้ง --</option>'+window.STAFF.filter(function(s){return s.active!==false&&_instPosLabels.includes(s.role);}).slice().sort(function(a,b){return(a.name||'').localeCompare(b.name||'','th');}).map(function(s){return`<option value="${esc(s.name)}"${p&&p.installer===s.name?' selected':''}>${esc(s.name)}${s.nickname?' ('+esc(s.nickname)+')':''}`;}).join('');
  var currentSids=mems.map(function(m){return m.sid;});
  var pickerHtml=(function(){
    var depts=[...new Set(staffSorted.map(function(s){return s.dept||'ไม่ระบุทีม';}))];
    var availHtml='';
    depts.forEach(function(dept){
      var members=staffSorted.filter(function(s){return(s.dept||'ไม่ระบุทีม')===dept;});
      availHtml+='<div class="pku-dept-hdr" style="font-size:10px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.4px;padding:6px 6px 3px;">👥 '+esc(dept)+'</div>';
      members.forEach(function(s){
        var j=window.STAFF.indexOf(s);var isSel=currentSids.includes(s.id);
        availHtml+='<div class="pku-avail-item" data-sid="'+s.id+'" data-search="'+esc((s.name+(s.nickname?s.nickname:'')+(s.dept||'')).toLowerCase())+'" onclick="window.pkuSelect(\''+s.id+'\')" style="display:flex;align-items:center;gap:7px;padding:5px 8px;border-radius:8px;cursor:pointer;margin-bottom:2px;transition:background .12s;opacity:'+(isSel?'0.35':'1')+';pointer-events:'+(isSel?'none':'auto')+';" onmouseover="if(this.style.opacity!==\'0.35\')this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'\'">'
          +'<div style="width:28px;height:28px;border-radius:50%;background:'+avC(Math.max(j,0))+';color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'+s.name.charAt(0)+'</div>'
          +'<div style="flex:1;min-width:0;overflow:hidden;">'
          +'<div style="font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(s.name)+(s.nickname?' <span style="color:var(--txt3);font-weight:400;">('+esc(s.nickname)+')</span>':'')+'</div>'
          +(s.role?'<div style="font-size:9px;color:var(--txt3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(s.role)+'</div>':'')
          +'</div>'
          +'<span style="font-size:14px;color:var(--violet);font-weight:700;flex-shrink:0;">'+(isSel?'✓':'＋')+'</span>'
          +'</div>';
      });
    });
    return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
      +'<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;display:flex;flex-direction:column;">'
      +'<div style="padding:7px 12px;background:var(--surface2);border-bottom:1px solid var(--border);font-size:11px;font-weight:600;color:var(--txt3);">รายชื่อทั้งหมด</div>'
      +'<div style="padding:6px 8px;border-bottom:1px solid var(--border);"><input type="text" id="pku-search" placeholder="ค้นหาชื่อ..." oninput="window.pkuFilter(this.value)" style="width:100%;padding:5px 8px;font-size:11px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--txt);box-sizing:border-box;"></div>'
      +'<div id="pku-avail" style="flex:1;max-height:260px;overflow-y:auto;padding:4px 6px;">'+availHtml+'</div>'
      +'</div>'
      +'<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;display:flex;flex-direction:column;">'
      +'<div style="padding:7px 12px;background:var(--surface2);border-bottom:1px solid var(--border);font-size:11px;font-weight:600;color:var(--txt3);">ทีมงานที่เลือก <span id="pku-sel-cnt" style="font-weight:400;color:var(--violet);">'+(currentSids.length>0?'('+currentSids.length+')':'')+'</span></div>'
      +'<div id="mem-list" style="flex:1;max-height:310px;overflow-y:auto;padding:4px 6px;"></div>'
      +'</div>'
      +'</div>';
  })();
  var now2=new Date();now2.setHours(0,0,0,0);
  var pStage=p?gS(p.stage):null;
  var isExecStg=!!(pStage&&(pStage.id==='exec'||pStage.label==='ดำเนินการ'));
  var displayProg=p?p.progress:0;
  if(isExecStg&&p&&p.start&&p.end){var sD=pd(p.start);var eD=pd(p.end);var tMs=eD-sD;if(tMs>0)displayProg=Math.min(100,Math.max(0,Math.round((now2-sD)/tMs*100)));}
  var pVal=p?(isExecStg?displayProg:p.progress):0;
  var progTabHtml=p?('<div style="display:flex;align-items:center;gap:7px;margin-left:auto;padding-left:10px;border-left:1px solid var(--border);white-space:nowrap;"><span style="font-size:11px;color:var(--txt2);">ความคืบหน้า</span><span id="prog-lbl" style="font-size:13px;font-weight:700;color:var(--violet);">'+pVal+'%</span>'+(isExecStg?'<span style="font-size:10px;color:var(--txt3);" title="คำนวนอัตโนมัติ">⚡</span>':'')+(window.canEdit('projects')?'<input type="range" id="pf-prog" min="0" max="100" value="'+pVal+'" style="width:72px;accent-color:var(--violet);cursor:pointer;"'+(isExecStg?' disabled':' oninput="document.getElementById(\'prog-lbl\').textContent=this.value+\'%\'"')+'>':'')+'</div>'):'';
  var memberRows=mems.map(function(m){var st=gSt(m.sid);var j=window.STAFF.findIndex(function(s){return s.id===m.sid;});var overlaps=getStaffOverlaps(m.sid,m.s,m.e,window.editPid);var warnText=overlaps.length>0?overlapWarnText(overlaps):'';return`<div class="m-row" id="mr-${m.id}" data-sid="${m.sid}" style="padding:7px 8px;border-radius:8px;margin-bottom:4px;background:var(--surface2);"><div style="display:flex;align-items:center;gap:7px;"><div style="width:26px;height:26px;border-radius:50%;background:${avC(Math.max(j,0))};color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${st.name.charAt(0)}</div><span style="flex:1;font-size:11px;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${esc(st.name)}${st.nickname?` <span style="color:var(--txt3);font-weight:400;">(${esc(st.nickname)})</span>`:''}</span>${window.canEdit('projects')?`<button class="btn btn-red btn-sm" style="padding:2px 7px;font-size:11px;" onclick="window.pkuDeselect('${m.id}')">✕</button>`:''}</div>${window.canEdit('projects')?`<input type="hidden" id="msid-${m.id}" value="${m.sid}"><div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:5px;padding-left:33px;"><input type="date" class="f-input" style="padding:4px 6px;font-size:10px;" id="ms-${m.id}" value="${m.s}" onchange="window.checkMemOverlap('${m.id}')"><input type="date" class="f-input" style="padding:4px 6px;font-size:10px;" id="me-${m.id}" value="${m.e}" onchange="window.checkMemOverlap('${m.id}')"></div><div id="mwarn-${m.id}" style="font-size:10px;color:var(--coral);margin-top:3px;padding-left:33px;display:${warnText?'block':'none'}">${warnText}</div>`:''}</div>`;}).join('');
  var ce=window.canEdit('projects'),ceA=ce?'':'disabled';
  var hasDates=!!(p&&p.start&&p.end)||mems.length>0;
  var tabBar='<div id="pf-tabs" style="display:flex;gap:6px;align-items:center;padding:12px 24px;border-bottom:1px solid var(--border);margin:-24px -24px 20px;background:var(--surface);position:sticky;top:-24px;z-index:5;">'
    +'<button class="pf-tab-btn" data-tab="info" onclick="window.pfTab(\'info\')" style="background:var(--violet);color:#fff;border:1px solid var(--violet);border-radius:8px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">📋 ข้อมูลโครงการ</button>'
    +'<button id="pf-tab-team-btn" class="pf-tab-btn" data-tab="team" onclick="window.pfTab(\'team\')" style="background:var(--surface2);color:var(--txt2);border:1px solid var(--border);border-radius:8px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;display:'+(hasDates?'':'none')+';">👥 ทีมงาน'+(mems.length>0?' ('+mems.length+')':'')+'</button>'
    +'<button class="pf-tab-btn" data-tab="visits" onclick="window.pfTab(\'visits\')" style="background:var(--surface2);color:var(--txt2);border:1px solid var(--border);border-radius:8px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">📍 รอบเข้าไซต์หลายช่วง'+(p&&p.visits&&p.visits.length>0?' ('+p.visits.length+')':'')+'</button>'
    +progTabHtml
    +'</div>';
  var smartBtn=(!p&&ce)?'<div style="margin-bottom:16px;"><button type="button" onclick="window.openSmartSchedule()" style="width:100%;padding:11px 16px;background:linear-gradient(135deg,#7c5cfc,#4361ee);color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 14px rgba(124,92,252,.35);"><span style="font-size:18px;">🤖</span><span>จัดงานอัจฉริยะ</span><span style="font-size:11px;font-weight:400;opacity:.85;">— ค้นหาช่วงเวลาว่างและทีมงานอัตโนมัติ</span></button></div>':'';
  var infoPane='<div id="pf-pane-info">'
    +smartBtn
    +'<div class="f-group"><label class="f-label">ชื่อโครงการ *</label><input class="f-input" id="pf-name" value="'+esc(p?p.name:'')+'" placeholder="ชื่อโครงการ" '+ceA+'></div>'
    +'<input type="hidden" id="pf-stg" value="'+(p?p.stage:(window.STAGES.length?window.STAGES[0].id:''))+'">'
    +'<div class="f-grid">'
    +'<div class="f-group"><label class="f-label">กลุ่มโครงการ *</label><select class="f-input" id="pf-grp" onchange="window.updateProjFormByGroup(\'\')" '+ceA+'>'+grpOpts+'</select></div>'
    +'<div class="f-group"><label class="f-label">ประเภท *</label><select class="f-input" id="pf-type-modal" '+ceA+'>'+typOpts+'</select></div>'
    +'<div class="f-group"><label class="f-label">เจ้าของไซต์ *</label><select class="f-input" id="pf-owner" '+ceA+'>'+ownerOpts+'</select></div>'
    +'<div class="f-group"><label class="f-label">ชื่อผู้ติดตั้ง *</label><select class="f-input" id="pf-installer" '+ceA+'>'+installerOpts+'</select></div>'
    +'<div class="f-group"><label class="f-label">วันเริ่ม *</label><input type="date" class="f-input" id="pf-start" value="'+(p?p.start:'')+'" onchange="window.updateAllMemDates();window.updateTeamTabVisibility();" '+ceA+'></div>'
    +'<div class="f-group"><label class="f-label">วันสิ้นสุด *</label><input type="date" class="f-input" id="pf-end" value="'+(p?p.end:'')+'" onchange="window.updateAllMemDates();window.updateTeamTabVisibility();" '+ceA+'></div>'
    +'<div class="f-group" id="pf-revisit1-grp"><label class="f-label">Revisit 1</label><input type="date" class="f-input" id="pf-revisit1" value="'+(p?p.revisit1:'')+'" '+ceA+'></div>'
    +'<div class="f-group" id="pf-revisit2-grp"><label class="f-label">Revisit 2</label><input type="date" class="f-input" id="pf-revisit2" value="'+(p?p.revisit2:'')+'" '+ceA+'></div>'
    +'</div>'
    +'<div id="pf-contract-wrap" style="display:none;margin-top:4px;">'
    +'<div class="f-group"><label class="f-label">🔗 ผูกสัญญา</label>'
    +'<div style="position:relative;">'
    +'<input type="hidden" id="pf-contract-id" value="'+(p&&p.contractId?p.contractId:'')+'">'
    +'<input type="text" class="f-input" id="pf-contract-search" autocomplete="off" placeholder="🔍 พิมพ์รหัสสัญญา หรือชื่อโครงการ..." '+(ce?'':'disabled ')+' style="padding-right:28px;" oninput="window.pfContractFilter()" onfocus="window.pfContractFilter()">'
    +'<span id="pf-contract-clear" onclick="window.pfContractClear()" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--txt3);font-size:14px;display:none;">✕</span>'
    +'<div id="pf-contract-drop" style="display:none;position:absolute;left:0;right:0;top:100%;z-index:200;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.14);max-height:220px;overflow-y:auto;margin-top:3px;"></div>'
    +'</div></div>'
    +'</div>'
    +'<div id="pf-budget-area" class="f-grid" style="align-items:start;margin-top:4px;">'
    +'<div class="f-group" style="margin:0;">'
    +'<label class="f-label" style="margin-bottom:6px;display:block;">พื้นที่</label>'
    +'<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;height:40px;background:var(--surface2);border-radius:10px;border:1px solid var(--border);box-sizing:border-box;">'
    +'<input type="checkbox" id="pf-border" '+(p&&p.isBorder?'checked':'')+' '+ceA+' style="width:16px;height:16px;accent-color:var(--coral);cursor:pointer;">'
    +'<label for="pf-border" style="font-size:13px;font-weight:600;color:var(--txt);cursor:pointer;">📍 พื้นที่ชายแดน (ชายแดน 3 จังหวัด)</label>'
    +'</div></div>'
    +'<div class="f-group" style="margin:0;"><label class="f-label">งบประมาณ (฿) *</label><input type="number" class="f-input" id="pf-cost" value="'+(p&&p.cost!=null?Number(p.cost).toFixed(2):'0.00')+'" placeholder="0.00" step="0.01" min="0" '+ceA+'></div>'
    +'</div>'
    +'<div id="pf-revisit-parent-wrap"><div class="f-grid">'
    +'<div class="f-group"><label class="f-label">โครงการหลัก (Onsite/แถม)</label>'
    +'<div style="position:relative;">'
    +'<input type="hidden" id="pf-parent-proj" value="'+(p&&p.parentProjectId?p.parentProjectId:'')+'">'
    +'<input type="text" class="f-input" id="pf-parent-search" autocomplete="off" placeholder="🔍 พิมพ์ชื่อโครงการ..." '+(ce?'':'disabled ')+' oninput="window.ppSearchFilter()" style="padding-right:28px;">'
    +'<span id="pf-parent-clear" onclick="window.ppSearchClear()" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--txt3);font-size:14px;display:none;">✕</span>'
    +'<div id="pf-parent-drop" style="display:none;position:absolute;left:0;right:0;top:100%;z-index:200;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.14);max-height:220px;overflow-y:auto;margin-top:3px;"></div>'
    +'</div></div>'
    +'<div class="f-group"><label class="f-label">ครั้งที่</label><select class="f-input" id="pf-revisit-round" '+(ce?'':' disabled')+'><option value="1"'+(p&&p.revisitRound==1?' selected':'')+'>ครั้งที่ 1</option><option value="2"'+(p&&p.revisitRound==2?' selected':'')+'>ครั้งที่ 2</option><option value="99"'+(p&&p.revisitRound==99?' selected':'')+'>✅ Revisit ครบแล้ว</option></select></div>'
    +'</div></div>'
    +'<div class="f-group"><label class="f-label">หมายเหตุ</label><textarea class="f-input" id="pf-note" '+ceA+'>'+esc(p?p.note:'')+'</textarea></div>'
    +(p&&p.start&&p.end?(function(){var hcnt=window.getProjectHolidayCount(p);return hcnt>0?'<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(255,107,107,.07);border-radius:8px;border:1px solid rgba(255,107,107,.2);font-size:12px;"><span>🎌</span><span style="color:var(--coral);font-weight:600;">มีวันหยุด '+hcnt+' วัน</span><span style="color:var(--txt2);">ในช่วงโครงการนี้</span><a href="#" onclick="event.preventDefault();window.showProjHolidaysPopup(\''+p.id+'\');" style="margin-left:auto;font-size:11px;color:var(--violet);">ดูวันหยุด</a></div>':'';})():'')
    +'</div>';
  var teamPane=ce
    ?'<div id="pf-pane-team" style="display:none">'+pickerHtml+'</div>'
    :'<div id="pf-pane-team" style="display:none"><div id="mem-list">'+memberRows+'</div></div>';
  // Inject memberRows into right panel after DOM is built (done after innerHTML assignment below)
  var visitsPane='<div id="pf-pane-visits" style="display:none">'+window.buildVisitsSection(p)+'</div>';
  document.getElementById('m-proj-body').innerHTML=tabBar+infoPane+teamPane+visitsPane;
  // Inject member rows into right panel (mem-list inside pickerHtml)
  if(ce){var ml=document.getElementById('mem-list');if(ml){ml.innerHTML=memberRows;ml.setAttribute('data-proj-s',p?p.start||'':'');ml.setAttribute('data-proj-e',p?p.end||'':'');}}
  document.getElementById('m-proj-foot').style.display=window.canEdit('projects')?'':'none';
  window.openM('m-proj');
  window.updateProjFormByGroup(p?p.parentProjectId:'');
}

window.updateTeamTabVisibility=function(){
  var s=(document.getElementById('pf-start')||{}).value||'';
  var e=(document.getElementById('pf-end')||{}).value||'';
  var btn=document.getElementById('pf-tab-team-btn');if(!btn)return;
  var hasDates=!!(s&&e);
  btn.style.display=hasDates?'':'none';
  // If dates removed while on team tab, switch back to info
  if(!hasDates){var tp=document.getElementById('pf-pane-team');if(tp&&tp.style.display!=='none')window.pfTab('info');}
};
window.pkuSelect=function(sid){
  if(!window.canEdit('projects'))return;
  var s=gSt(sid);var j=window.STAFF.findIndex(function(x){return x.id===sid;});
  var mid='M'+uid();var sdt=(document.getElementById('pf-start')||{}).value||'';var edt=(document.getElementById('pf-end')||{}).value||'';
  var overlaps=getStaffOverlaps(sid,sdt,edt,window.editPid);var warnText=overlaps.length>0?overlapWarnText(overlaps):'';
  var leaveC=getStaffLeaveConflicts(sid,sdt,edt);
  var leaveWarnText=leaveC.length>0?leaveC.map(function(c){return c.emoji+' มีการลา'+c.label+' ('+fd(c.leave.startDate)+' – '+fd(c.leave.endDate)+')';}).join('<br>'):'';
  var combinedWarn=(warnText?'<span style="color:var(--coral)">'+warnText+'</span>':'')+(warnText&&leaveWarnText?'<br>':'')+(leaveWarnText?'<span style="color:var(--amber)">'+leaveWarnText+'</span>':'');
  // Add compact member row to right panel
  var list=document.getElementById('mem-list');if(!list)return;
  var div=document.createElement('div');div.className='m-row';div.id='mr-'+mid;div.setAttribute('data-sid',sid);
  div.style.cssText='padding:7px 8px;border-radius:8px;margin-bottom:4px;background:var(--surface2);';
  div.innerHTML='<div style="display:flex;align-items:center;gap:7px;">'
    +'<div style="width:26px;height:26px;border-radius:50%;background:'+avC(Math.max(j,0))+';color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'+s.name.charAt(0)+'</div>'
    +'<span style="flex:1;font-size:11px;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">'+esc(s.name)+(s.nickname?' <span style="color:var(--txt3);font-weight:400;">('+esc(s.nickname)+')</span>':'')+'</span>'
    +'<button class="btn btn-red btn-sm" style="padding:2px 7px;font-size:11px;" onclick="window.pkuDeselect(\''+mid+'\')">✕</button>'
    +'</div>'
    +'<input type="hidden" id="msid-'+mid+'" value="'+sid+'">'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:5px;padding-left:33px;">'
    +'<input type="date" class="f-input" style="padding:4px 6px;font-size:10px;" id="ms-'+mid+'" value="'+sdt+'" onchange="window.checkMemOverlap(\''+mid+'\')">'
    +'<input type="date" class="f-input" style="padding:4px 6px;font-size:10px;" id="me-'+mid+'" value="'+edt+'" onchange="window.checkMemOverlap(\''+mid+'\')">'
    +'</div>'
    +'<div id="mwarn-'+mid+'" style="font-size:10px;margin-top:3px;padding-left:33px;display:'+(combinedWarn?'block':'none')+'">'+combinedWarn+'</div>';
  list.appendChild(div);
  // Dim item in left panel
  var avItem=document.querySelector('#pku-avail .pku-avail-item[data-sid="'+sid+'"]');
  if(avItem){avItem.style.opacity='0.35';avItem.style.pointerEvents='none';var plus=avItem.querySelector('span:last-child');if(plus)plus.textContent='✓';}
  // Update selected count
  var cnt=document.getElementById('pku-sel-cnt');if(cnt){var n=document.querySelectorAll('#mem-list .m-row').length;cnt.textContent=n>0?'('+n+')':('')}
  if(overlaps.length>0)window.showOverlapPopup(warnText);
  if(leaveC.length>0)window.showOverlapPopup('<span style="color:var(--amber)">'+leaveWarnText+'</span>');
};
window.pkuDeselect=function(mid){
  if(!window.canEdit('projects'))return;
  var row=document.getElementById('mr-'+mid);if(!row)return;
  var sid=row.getAttribute('data-sid');
  row.remove();
  // Re-enable in left panel
  var avItem=document.querySelector('#pku-avail .pku-avail-item[data-sid="'+sid+'"]');
  if(avItem){avItem.style.opacity='';avItem.style.pointerEvents='';var plus=avItem.querySelector('span:last-child');if(plus)plus.textContent='＋';}
  // Update count
  var cnt=document.getElementById('pku-sel-cnt');if(cnt){var n=document.querySelectorAll('#mem-list .m-row').length;cnt.textContent=n>0?'('+n+')':'';}
};
window.pkuFilter=function(q){
  q=(q||'').toLowerCase();
  document.querySelectorAll('#pku-avail .pku-avail-item').forEach(function(el){
    var name=el.getAttribute('data-search')||'';
    el.style.display=(!q||name.includes(q))?'':'none';
  });
  document.querySelectorAll('#pku-avail .pku-dept-hdr').forEach(function(hdr){
    var sib=hdr.nextElementSibling;var hasVis=false;
    while(sib&&sib.classList.contains('pku-avail-item')){if(sib.style.display!=='none'){hasVis=true;break;}sib=sib.nextElementSibling;}
    hdr.style.display=hasVis?'':'none';
  });
};
var _PF_CONTRACT_GRPS = ['GRP17733355541901','GRP17733355541902','GRP17733355541903'];
var _PF_NO_BUDGET_GRPS = ['GRP17733355541905','GRP17733355541906'];

window.updateProjFormByGroup=function(initialParentId){
  var grpId=(document.getElementById('pf-grp')||{}).value||'';
  var gType=window.projGroupType(grpId);
  var showRev=(gType==='onsite'||!grpId);
  var r1g=document.getElementById('pf-revisit1-grp');var r2g=document.getElementById('pf-revisit2-grp');
  if(r1g)r1g.style.display=showRev?'':'none';
  if(r2g)r2g.style.display=showRev?'':'none';
  var pWrap=document.getElementById('pf-revisit-parent-wrap');
  if(pWrap)pWrap.style.display=(gType==='revisit')?'':'none';
  if(gType==='revisit'){
    var hidEl=document.getElementById('pf-parent-proj');
    var txtEl=document.getElementById('pf-parent-search');
    if(hidEl&&txtEl&&initialParentId){
      var selProj=window.PROJECTS.find(function(x){return x.id===initialParentId;});
      if(selProj){
        hidEl.value=selProj.id;
        txtEl.value=selProj.name;
        var clr=document.getElementById('pf-parent-clear');
        if(clr)clr.style.display='';
      }
    }
  }
  // ── Contract wrap ──
  var showContract = _PF_CONTRACT_GRPS.includes(grpId);
  var cWrap = document.getElementById('pf-contract-wrap');
  if(cWrap) cWrap.style.display = showContract ? '' : 'none';
  if(showContract){
    var cHid = document.getElementById('pf-contract-id');
    var cTxt = document.getElementById('pf-contract-search');
    var cClr = document.getElementById('pf-contract-clear');
    if(cHid&&cTxt&&cHid.value){
      var selCt = window.CONTRACTS.find(function(x){return x.id===cHid.value;});
      if(selCt){ cTxt.value=selCt.id+' — '+selCt.name; if(cClr)cClr.style.display=''; }
    }
  }
  // ── Budget / border area ──
  var showBudget = !_PF_NO_BUDGET_GRPS.includes(grpId);
  var bArea = document.getElementById('pf-budget-area');
  if(bArea) bArea.style.display = showBudget ? '' : 'none';
};

// ── PARENT PROJECT SMART SEARCH ──────────────────────────────────────────────
window._ppProjects=function(){
  return window.PROJECTS.filter(function(p){return window.isOnsiteGroup(p.groupId);});
};
window.ppSearchOpen=function(){
  var txt=document.getElementById('pf-parent-search');
  if(!txt||txt.disabled)return;
  window.ppSearchFilter();
  document.addEventListener('click',window._ppOutsideClose,{once:true});
};
window._ppOutsideClose=function(e){
  var wrap=document.getElementById('pf-revisit-parent-wrap');
  if(wrap&&wrap.contains(e.target))return;
  var drop=document.getElementById('pf-parent-drop');
  if(drop)drop.style.display='none';
};
window.ppSearchFilter=function(){
  var txt=document.getElementById('pf-parent-search');
  var drop=document.getElementById('pf-parent-drop');
  if(!txt||!drop)return;
  var q=(txt.value||'').trim().toLowerCase();
  var projs=window._ppProjects().filter(function(p){
    return !q||p.name.toLowerCase().includes(q)||(p.siteOwner||'').toLowerCase().includes(q);
  });
  if(!projs.length){
    drop.innerHTML='<div style="padding:10px 14px;font-size:12px;color:var(--txt3);">ไม่พบโครงการ</div>';
  } else {
    drop.innerHTML=projs.map(function(p){
      var grp=window.PGROUPS.find(function(g){return g.id===p.groupId;})||{};
      return '<div onclick="window.ppSearchSelect(\''+p.id+'\',\''+esc(p.name).replace(/'/g,'&#39;')+'\')" '+
        'style="padding:8px 14px;cursor:pointer;border-bottom:1px solid var(--border);font-size:12px;" '+
        'onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'\'">' +
        '<div style="font-weight:700;color:var(--txt);">'+esc(p.name)+'</div>'+
        '<div style="font-size:10px;color:var(--txt3);margin-top:2px;">'+esc(grp.label||'')+(p.siteOwner?' · '+esc(p.siteOwner):'')+(p.end?' · สิ้นสุด '+fd(p.end):'')+'</div>'+
      '</div>';
    }).join('');
  }
  drop.style.display='';
  var clr=document.getElementById('pf-parent-clear');
  if(clr)clr.style.display=txt.value?'':'none';
};
window.ppSearchSelect=function(id,name){
  var hid=document.getElementById('pf-parent-proj');
  var txt=document.getElementById('pf-parent-search');
  var drop=document.getElementById('pf-parent-drop');
  var clr=document.getElementById('pf-parent-clear');
  if(hid)hid.value=id;
  if(txt)txt.value=name;
  if(drop)drop.style.display='none';
  if(clr)clr.style.display='';
};
// ── CONTRACT SMART SEARCH (in project modal) ─────────────────────────────────
window._pfContractOutsideClose=function(e){
  var wrap=document.getElementById('pf-contract-wrap');
  if(wrap&&wrap.contains(e.target))return;
  var drop=document.getElementById('pf-contract-drop');
  if(drop)drop.style.display='none';
};
window.pfContractFilter=function(){
  var txt=document.getElementById('pf-contract-search');
  var drop=document.getElementById('pf-contract-drop');
  var clr=document.getElementById('pf-contract-clear');
  if(!txt||!drop)return;
  document.removeEventListener('click',window._pfContractOutsideClose);
  document.addEventListener('click',window._pfContractOutsideClose,{once:true});
  var q=(txt.value||'').trim().toLowerCase();
  if(clr)clr.style.display=txt.value?'':'none';
  var list=(window.CONTRACTS||[]).filter(function(c){
    return !q||c.id.toLowerCase().includes(q)||c.name.toLowerCase().includes(q)||c.customer.toLowerCase().includes(q);
  }).slice(0,10);
  if(!list.length){
    drop.innerHTML='<div style="padding:10px 14px;font-size:12px;color:var(--txt3);">ไม่พบสัญญา</div>';
  } else {
    drop.innerHTML=list.map(function(c){
      var ctSt=c.status==='active'?'มีผลบังคับ':c.status==='completed'?'สิ้นสุดแล้ว':'ยกเลิก';
      var ctColor=c.status==='active'?'var(--teal)':c.status==='completed'?'var(--indigo)':'var(--coral)';
      return '<div onclick="window.pfContractSelect(this.dataset.cid,this.dataset.cname)" data-cid="'+esc(c.id)+'" data-cname="'+esc(c.name)+'" '
        +'style="padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--border);font-size:12px;" '
        +'onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'\'">'
        +'<div style="display:flex;align-items:center;gap:6px;">'
        +'<span style="font-family:\'JetBrains Mono\',monospace;font-size:10px;color:var(--txt3);">'+esc(c.id)+'</span>'
        +'<span style="font-size:10px;background:'+ctColor+'18;color:'+ctColor+';padding:1px 7px;border-radius:20px;font-weight:600;">'+ctSt+'</span>'
        +'</div>'
        +'<div style="font-weight:700;color:var(--txt);margin-top:2px;">'+esc(c.name)+'</div>'
        +'<div style="font-size:10px;color:var(--txt3);margin-top:1px;">'+esc(c.customer)+(c.value?' · '+fca(c.value):'')+'</div>'
        +'</div>';
    }).join('');
  }
  drop.style.display='';
};
window.pfContractSelect=function(id,name){
  var hid=document.getElementById('pf-contract-id');
  var txt=document.getElementById('pf-contract-search');
  var drop=document.getElementById('pf-contract-drop');
  var clr=document.getElementById('pf-contract-clear');
  if(hid)hid.value=id;
  if(txt)txt.value=id+' — '+name;
  if(drop)drop.style.display='none';
  if(clr)clr.style.display='';
};
window.pfContractClear=function(){
  var hid=document.getElementById('pf-contract-id');
  var txt=document.getElementById('pf-contract-search');
  var clr=document.getElementById('pf-contract-clear');
  if(hid)hid.value='';
  if(txt){txt.value='';txt.focus();}
  if(clr)clr.style.display='none';
  var drop=document.getElementById('pf-contract-drop');
  if(drop)drop.style.display='none';
};

window.ppSearchClear=function(){
  var hid=document.getElementById('pf-parent-proj');
  var txt=document.getElementById('pf-parent-search');
  var clr=document.getElementById('pf-parent-clear');
  if(hid)hid.value='';
  if(txt){txt.value='';txt.focus();}
  if(clr)clr.style.display='none';
  window.ppSearchFilter();
};
window.pfTab=function(tab){
  ['info','team','visits'].forEach(function(t){var el=document.getElementById('pf-pane-'+t);if(el)el.style.display=t===tab?'':'none';});
  document.querySelectorAll('#pf-tabs .pf-tab-btn').forEach(function(el){var t=el.getAttribute('data-tab');var on=t===tab;el.style.background=on?'var(--violet)':'var(--surface2)';el.style.color=on?'#fff':'var(--txt2)';el.style.borderColor=on?'var(--violet)':'var(--border)';});
};
window.addMem=function(){
  if(!window.canEdit('projects'))return;
  var sel=document.getElementById('add-mem-sel');if(!sel||!sel.value)return;
  var sid=sel.value;var s=gSt(sid);var j=window.STAFF.findIndex(function(x){return x.id===sid;});
  var mid='M'+uid();var sdt=(document.getElementById('pf-start')||{}).value||'';var edt=(document.getElementById('pf-end')||{}).value||'';
  var overlaps=getStaffOverlaps(sid,sdt,edt,window.editPid);var warnText=overlaps.length>0?overlapWarnText(overlaps):'';
  var list=document.getElementById('mem-list');var div=document.createElement('div');div.className='m-row';div.id='mr-'+mid;
  div.innerHTML=`<div style="display:flex;align-items:center;gap:8px;width:100%"><div class="av" style="background:${avC(Math.max(j,0))}">${s.name.charAt(0)}</div><span style="flex:1;font-size:12px;font-weight:600">${esc(s.name)}</span><input type="hidden" id="msid-${mid}" value="${sid}"><input type="date" class="f-input" style="width:130px;padding:6px 8px;font-size:11px" id="ms-${mid}" value="${sdt}" onchange="window.checkMemOverlap('${mid}')"><span style="color:var(--txt3)">→</span><input type="date" class="f-input" style="width:130px;padding:6px 8px;font-size:11px" id="me-${mid}" value="${edt}" onchange="window.checkMemOverlap('${mid}')"><button class="btn btn-red btn-sm" onclick="window.rmMem('${mid}')">✕</button></div><div id="mwarn-${mid}" style="font-size:10px;color:var(--coral);width:100%;margin-top:4px;padding-left:36px;display:${warnText?'block':'none'}">${warnText}</div>`;
  list.appendChild(div);
}
window.rmMem=function(mid){
  if(!window.canEdit('projects'))return;
  var el=document.getElementById('mr-'+mid);if(!el)return;
  var sidEl=document.getElementById('msid-'+mid);
  if(sidEl){
    // Re-enable in pickup list left panel
    var avItem=document.querySelector('#pku-avail .pku-avail-item[data-sid="'+sidEl.value+'"]');
    if(avItem){avItem.style.opacity='';avItem.style.pointerEvents='';var plus=avItem.querySelector('span:last-child');if(plus)plus.textContent='＋';}
  }
  el.remove();
  var cnt=document.getElementById('pku-sel-cnt');if(cnt){var n=document.querySelectorAll('#mem-list .m-row').length;cnt.textContent=n>0?'('+n+')':'';}
};

// ── SMART SCHEDULE ──
window._ssSlots = [];
window.openSmartSchedule = function() {
  var depts = [...new Set(window.STAFF.filter(function(s){return s.active!==false;}).map(function(s){return s.dept||'ไม่ระบุทีม';}))].sort(function(a,b){return a.localeCompare(b,'th');});
  var deptChecks = depts.map(function(d){return'<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;padding:3px 0;"><input type="checkbox" class="ss-dept-chk" value="'+esc(d)+'" checked style="width:14px;height:14px;accent-color:var(--violet);">'+esc(d)+'</label>';}).join('');
  var ov=document.createElement('div');ov.id='ss-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10001;display:flex;align-items:center;justify-content:center;animation:fadeIn .15s ease;';
  ov.innerHTML='<div style="background:var(--surface);border-radius:18px;padding:28px;max-width:540px;width:95%;max-height:92vh;overflow-y:auto;box-shadow:0 16px 56px rgba(0,0,0,.4);border:1px solid var(--border);">'
    +'<div style="display:flex;align-items:center;gap:12px;margin-bottom:22px;">'
    +'<div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#7c5cfc,#4361ee);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">🤖</div>'
    +'<div><div style="font-size:17px;font-weight:700;color:var(--txt);">จัดงานอัจฉริยะ</div><div style="font-size:11px;color:var(--txt3);margin-top:2px;">ค้นหาช่วงเวลาที่พนักงานว่าง ไม่มีงานซ้อน</div></div>'
    +'<button onclick="document.getElementById(\'ss-overlay\').remove()" style="margin-left:auto;background:none;border:none;font-size:20px;cursor:pointer;color:var(--txt3);line-height:1;">✕</button>'
    +'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">'
    +'<div class="f-group"><label class="f-label">ระยะเวลาโครงการ (สัปดาห์) *</label><input type="number" id="ss-weeks" class="f-input" value="2" min="1" max="52"></div>'
    +'<div class="f-group"><label class="f-label">ค้นหาล่วงหน้าสูงสุด (สัปดาห์)</label><input type="number" id="ss-lookahead" class="f-input" value="16" min="4" max="52"></div>'
    +'</div>'
    +'<div class="f-group" style="margin-bottom:16px;">'
    +'<label class="f-label">แผนกที่ต้องการ</label>'
    +'<div style="display:flex;gap:8px;margin-bottom:8px;">'
    +'<button onclick="window.ssDeptAll(true)" style="font-size:11px;padding:3px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;cursor:pointer;color:var(--txt2);">เลือกทั้งหมด</button>'
    +'<button onclick="window.ssDeptAll(false)" style="font-size:11px;padding:3px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;cursor:pointer;color:var(--txt2);">ยกเลิกทั้งหมด</button>'
    +'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;max-height:140px;overflow-y:auto;padding:10px;background:var(--surface2);border-radius:10px;border:1px solid var(--border);">'+deptChecks+'</div>'
    +'</div>'
    +'<button onclick="window.runSmartSchedule()" style="width:100%;padding:12px;background:linear-gradient(135deg,#7c5cfc,#4361ee);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:16px;">🔍 ค้นหาช่วงเวลาที่ว่าง</button>'
    +'<div id="ss-results"></div>'
    +'</div>';
  ov.addEventListener('click',function(e){if(e.target===ov)ov.remove();});
  document.body.appendChild(ov);
};

window.ssDeptAll = function(check) {
  document.querySelectorAll('#ss-overlay .ss-dept-chk').forEach(function(el){el.checked=check;});
};

window.runSmartSchedule = function() {
  var weeks=parseInt((document.getElementById('ss-weeks')||{}).value)||2;
  var lookahead=parseInt((document.getElementById('ss-lookahead')||{}).value)||16;
  var selDepts=Array.from(document.querySelectorAll('#ss-overlay .ss-dept-chk:checked')).map(function(el){return el.value;});
  var resEl=document.getElementById('ss-results');
  if(!selDepts.length){resEl.innerHTML='<div style="color:var(--coral);font-size:12px;text-align:center;padding:16px;">กรุณาเลือกอย่างน้อย 1 แผนก</div>';return;}
  var targetStaff=window.STAFF.filter(function(s){return s.active!==false&&selDepts.includes(s.dept||'ไม่ระบุทีม');});
  if(!targetStaff.length){resEl.innerHTML='<div style="color:var(--amber);font-size:12px;text-align:center;padding:16px;">ไม่พบพนักงานในแผนกที่เลือก</div>';return;}
  resEl.innerHTML='<div style="text-align:center;padding:20px;color:var(--txt3);font-size:13px;">⏳ กำลังค้นหา...</div>';
  // Start from tomorrow
  var today=new Date();today.setHours(0,0,0,0);
  var startSearch=new Date(today);startSearch.setDate(startSearch.getDate()+1);
  // Snap to next Monday
  var dow=startSearch.getDay();if(dow!==1){var toMon=dow===0?1:(8-dow);startSearch.setDate(startSearch.getDate()+toMon);}
  var durationDays=weeks*7;
  var slots=[];
  for(var off=0;off<lookahead*7;off+=7){
    var sl=new Date(startSearch);sl.setDate(sl.getDate()+off);
    var se=new Date(sl);se.setDate(se.getDate()+durationDays-1);
    var sStr=sl.toISOString().slice(0,10);var eStr=se.toISOString().slice(0,10);
    var holCnt=(window.HOLIDAYS||[]).filter(function(h){if(!h.date)return false;var hd=pd(h.date);return hd>=sl&&hd<=se;}).length;
    var free=[],busy=[];
    targetStaff.forEach(function(s){
      var ov2=window.getStaffOverlaps(s.id,sStr,eStr,window.editPid||'');
      var lv=window.getStaffLeaveConflicts(s.id,sStr,eStr);
      if(ov2.length===0&&lv.length===0)free.push(s);
      else busy.push({staff:s,overlaps:ov2,leaves:lv});
    });
    slots.push({start:sStr,end:eStr,freeStaff:free,busyStaff:busy,holCnt:holCnt,score:free.length*10-holCnt*2});
  }
  slots.sort(function(a,b){return b.score-a.score;});
  window._ssSlots=slots;
  var top=slots.slice(0,5);
  if(!top.length||top[0].freeStaff.length===0){resEl.innerHTML='<div style="color:var(--amber);font-size:12px;text-align:center;padding:16px;">⚠ ไม่พบช่วงเวลาที่พนักงานว่างพร้อมกัน ลองเพิ่มสัปดาห์ค้นหาหรือลดจำนวนแผนก</div>';return;}
  var html='<div style="font-size:11px;font-weight:600;color:var(--txt3);margin-bottom:10px;">ผลลัพธ์ที่แนะนำ (เรียงตามความพร้อมของทีม)</div>';
  top.forEach(function(r,i){
    var freeNm=r.freeStaff.map(function(s){return s.nickname||s.name.split(' ')[0];}).join(', ');
    var borderCol=i===0?'var(--teal)':i===1?'var(--violet)':'var(--border)';
    html+='<div style="background:var(--surface2);border-radius:10px;padding:13px 14px;margin-bottom:8px;border:1px solid var(--border);border-left:4px solid '+borderCol+';">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px;">'
      +'<div>'
      +'<span style="font-size:13px;font-weight:700;color:var(--txt);">📅 '+fd(r.start)+' → '+fd(r.end)+'</span>'
      +(i===0?'<span style="display:inline-block;font-size:9px;background:var(--teal);color:#fff;padding:1px 7px;border-radius:10px;margin-left:7px;vertical-align:middle;font-weight:700;">✨ แนะนำ</span>':'')
      +'</div>'
      +'<button onclick="window.applySmartSlot('+i+')" style="padding:6px 16px;background:linear-gradient(135deg,#7c5cfc,#4361ee);color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0;">✓ เลือก</button>'
      +'</div>'
      +(r.freeStaff.length>0?'<div style="font-size:11px;color:var(--teal);margin-bottom:2px;">✅ ว่าง '+r.freeStaff.length+' คน'+(freeNm?' — <span style="color:var(--txt2);">'+esc(freeNm)+'</span>':'')+'</div>':'')
      +(r.busyStaff.length>0?'<div style="font-size:10px;color:var(--amber);">⏳ ติดงานอื่น '+r.busyStaff.length+' คน</div>':'')
      +(r.holCnt>0?'<div style="font-size:10px;color:var(--coral);">🎌 มีวันหยุดในช่วงนี้ '+r.holCnt+' วัน</div>':'')
      +'</div>';
  });
  resEl.innerHTML=html;
};

window.applySmartSlot = function(idx) {
  var r=window._ssSlots[idx];if(!r)return;
  var startEl=document.getElementById('pf-start');var endEl=document.getElementById('pf-end');
  if(startEl)startEl.value=r.start;
  if(endEl)endEl.value=r.end;
  // Trigger onchange to update mem dates + team tab visibility
  if(startEl)startEl.dispatchEvent(new Event('change'));
  if(endEl)endEl.dispatchEvent(new Event('change'));
  window.updateTeamTabVisibility();
  // Add free staff to team (silent, no duplicate)
  r.freeStaff.forEach(function(s){
    var existing=document.querySelector('#mem-list .m-row[data-sid="'+s.id+'"]');
    if(!existing)window.pkuSelect(s.id);
  });
  // Switch to team tab
  setTimeout(function(){window.pfTab('team');},50);
  var ov=document.getElementById('ss-overlay');if(ov)ov.remove();
  window.showAlert('กำหนดช่วง '+fd(r.start)+' → '+fd(r.end)+'\nทีมงาน '+r.freeStaff.length+' คนเรียบร้อย ✓','success');
};

window.saveProject=async function(){
  if(!window.canEdit('projects'))return;if(!window.auth.currentUser)return;
  var name=(document.getElementById('pf-name')||{}).value||'';if(!name.trim())return;
  var _vErr=[];
  var _saveGrpId=(document.getElementById('pf-grp')||{}).value||'';
  if(!_saveGrpId)_vErr.push('กลุ่มโครงการ');
  if(!(document.getElementById('pf-type-modal')||document.getElementById('pf-type')||{}).value)_vErr.push('ประเภท');
  if(!(document.getElementById('pf-owner')||{}).value)_vErr.push('เจ้าของไซต์');
  if(!(document.getElementById('pf-installer')||{}).value)_vErr.push('ชื่อผู้ติดตั้ง');
  if(!(document.getElementById('pf-start')||{}).value)_vErr.push('วันเริ่ม');
  if(!(document.getElementById('pf-end')||{}).value)_vErr.push('วันสิ้นสุด');
  var _noBudget=_PF_NO_BUDGET_GRPS.includes(_saveGrpId);
  if(!_noBudget){var _cv=(document.getElementById('pf-cost')||{}).value;if(_cv===''||_cv==null||isNaN(parseFloat(_cv))||parseFloat(_cv)<0)_vErr.push('งบประมาณ (฿)');}
  if(_vErr.length){window.showAlert('กรุณาระบุ: '+_vErr.join(', '),'error');return;}
  var pid=window.editPid||'P'+Date.now();
  var memDs=document.querySelectorAll('#mem-list > .m-row[id^="mr-"]');
  var members=Array.from(memDs).map(function(div){var mid=div.id.slice(3);var sidEl=document.getElementById('msid-'+mid);var sid=sidEl?sidEl.value:'';return{id:mid,sid:sid,s:(document.getElementById('ms-'+mid)||{}).value||'',e:(document.getElementById('me-'+mid)||{}).value||''};}).filter(function(m){return m.sid;});
  var savedVisits=window.collectVisits();
  var selStage=(document.getElementById('pf-stg')||{}).value||(window.STAGES.length?window.STAGES[0].id:'');
  var rawProg=parseInt((document.getElementById('pf-prog')||{}).value)||0;
  var finalProg=window.stageForces100(selStage)?100:rawProg;
  var dbProj={project_id:pid,project_name:name.trim(),group_id:_saveGrpId,site_owner:(document.getElementById('pf-owner')||{}).value||'',installer_name:(document.getElementById('pf-installer')||{}).value||'',type_id:(document.getElementById('pf-type-modal')||document.getElementById('pf-type')||{}).value||'',stage_id:selStage,budget:_noBudget?0:(parseFloat((document.getElementById('pf-cost')||{}).value)||0),start_date:document.getElementById('pf-start').value,end_date:document.getElementById('pf-end').value,revisit_1:(document.getElementById('pf-revisit1')||{}).value||'',revisit_2:(document.getElementById('pf-revisit2')||{}).value||'',parent_project_id:(document.getElementById('pf-parent-proj')||{}).value||'',revisit_round:Number((document.getElementById('pf-revisit-round')||{}).value)||0,progress_pct:finalProg,note:document.getElementById('pf-note').value,pm_staff_id:members.length>0?members[0].sid:'',status:'active',team:members.map(m=>m.sid),members:members,visits:savedVisits,is_border:!!(document.getElementById('pf-border')||{}).checked,contract_id:(document.getElementById('pf-contract-id')||{}).value||''};
  window.closeM('m-proj');
  try {
    await setDoc(getDocRef('PROJECTS',pid),dbProj);
    if(typeof window.tsSyncProject==='function') await window.tsSyncProject(pid, members);
    if(_saveGrpId==='GRP17733355541904'&&dbProj.parent_project_id&&dbProj.end_date){
      var _rvSibs=(window.PROJECTS||[]).filter(function(rp){return rp.groupId==='GRP17733355541904'&&rp.parentProjectId===dbProj.parent_project_id&&rp.id!==pid;});
      var _rvUpd=dbProj.revisit_round===99?{revisit_1:dbProj.end_date,revisit_2:dbProj.end_date}:(dbProj.revisit_round===2?{revisit_2:dbProj.end_date}:{revisit_1:dbProj.end_date});
      await window.updateDoc(getDocRef('PROJECTS',dbProj.parent_project_id),_rvUpd);
    }
  } catch(e){ window.showDbError(e); }
}

// ── VISITS (ฟังก์ชันเสริม: หลายรอบเข้าไซต์) ──
window._visitCounter = 0;
window.buildVisitsSection = function(p) {
  if(!window.canEdit('projects')) {
    // view-only: ถ้ามี visits แสดงสรุป
    if(!p||!p.visits||p.visits.length===0) return '';
    var html='<div class="f-group"><label class="f-label" style="color:var(--violet)">📍 รอบเข้าไซต์</label><div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">';
    p.visits.forEach(function(v,i){
      var stColor={'planned':'var(--amber)','ongoing':'var(--violet)','done':'var(--teal)'}[v.status]||'var(--txt3)';
      var stLabel={'planned':'วางแผน','ongoing':'กำลังดำเนินการ','done':'เสร็จแล้ว'}[v.status]||v.status;
      var team=window._vtMembers(v.team||[],v.start,v.end).map(function(m){var s=window.STAFF.find(function(x){return x.id===m.sid;});return s?s.nickname||s.name.split(' ')[0]:'';}).filter(Boolean).join(', ');
      html+=`<div style="background:var(--surface2);border-radius:10px;padding:12px 14px;border-left:3px solid ${stColor}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-size:12px;font-weight:600;color:var(--txt)">รอบที่ ${i+1}${v.purpose?' — '+esc(v.purpose):''}</span>
          <span style="font-size:10px;color:${stColor};background:${stColor}18;padding:2px 8px;border-radius:10px;">${stLabel}</span>
        </div>
        <div style="font-size:11px;color:var(--txt2);">📅 ${v.start?fd(v.start):'?'} → ${v.end?fd(v.end):'?'}${team?' &nbsp;👥 '+esc(team):''}</div>
        ${v.note?`<div style="font-size:11px;color:var(--txt3);margin-top:4px;">${esc(v.note)}</div>`:''}
      </div>`;
    });
    return html+'</div></div>';
  }
  // editable
  var sOpts=window.STAFF.filter(function(s){return s.active!==false;}).map(function(s){return`<option value="${s.id}">${esc(s.name)}${s.nickname?' ('+esc(s.nickname)+')':''}</option>`;}).join('');
  var existingVisits=(p&&p.visits&&p.visits.length>0)?p.visits:[];
  var visitsHtml='';
  existingVisits.forEach(function(v,i){
    visitsHtml+=window._buildVisitRow(v,i+1,sOpts);
  });
  return `<div class="f-group" id="visits-section">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <label class="f-label" style="color:var(--violet);margin:0">📍 รอบเข้าไซต์หลายช่วง</label>
      <button class="btn btn-ghost btn-sm" type="button" onclick="window.addVisitRow()" style="font-size:11px;">+ เพิ่มรอบเข้าไซต์</button>
    </div>
    <div id="visits-body">
      <div id="visits-list" style="display:flex;flex-direction:column;gap:10px;">${visitsHtml}</div>
    </div>
  </div>`;
};

window._buildVisitRow = function(v, no) {
  var vid = v?v.id:('V'+Date.now()+(window._visitCounter++));
  // normalize team to [{sid,s,e}]
  var preSel = window._vtMembers(v&&v.team||[], v&&v.start||'', v&&v.end||'');
  var preSelIds = preSel.map(function(m){ return m.sid; });
  // build available staff list
  var staffSorted=window.STAFF.filter(function(s){return s.active!==false;}).slice().sort(function(a,b){var da=a.dept||'zzz',db=b.dept||'zzz';if(da!==db)return da.localeCompare(db,'th');return(a.name||'').localeCompare(b.name||'','th');});
  var depts=[...new Set(staffSorted.map(function(s){return s.dept||'ไม่ระบุทีม';}))];
  var availHtml='';
  depts.forEach(function(dept){
    var members=staffSorted.filter(function(s){return(s.dept||'ไม่ระบุทีม')===dept;});
    availHtml+='<div style="font-size:9px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.4px;padding:5px 5px 2px;">'+esc(dept)+'</div>';
    members.forEach(function(s){
      var isSel=preSelIds.includes(s.id);
      availHtml+='<div class="vt-avail-item" data-vid="'+vid+'" data-sid="'+s.id+'" data-search="'+esc((s.name+(s.nickname||'')).toLowerCase())+'" onclick="window.vtPkuAdd(\''+vid+'\',\''+s.id+'\')" style="display:flex;align-items:center;gap:5px;padding:4px 6px;border-radius:6px;cursor:pointer;margin-bottom:1px;transition:background .1s;opacity:'+(isSel?'0.3':'1')+';pointer-events:'+(isSel?'none':'auto')+';" onmouseover="if(this.style.opacity!==\'0.3\')this.style.background=\'var(--surface)\'" onmouseout="this.style.background=\'\'">'
        +'<div style="width:22px;height:22px;border-radius:50%;background:'+avC(window.STAFF.indexOf(s))+';color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'+s.name.charAt(0)+'</div>'
        +'<div style="flex:1;min-width:0;font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(s.name)+(s.nickname?'<span style="color:var(--txt3);font-weight:400;"> ('+esc(s.nickname)+')</span>':'')+'</div>'
        +'<span style="font-size:12px;color:var(--violet);flex-shrink:0;">'+(isSel?'✓':'＋')+'</span>'
        +'</div>';
    });
  });
  // build pre-selected tags with individual date inputs
  var selHtml=preSel.map(function(mem){
    var sid=mem.sid;
    var s=window.STAFF.find(function(x){return x.id===sid;});
    if(!s)return '';
    var j=window.STAFF.indexOf(s);
    var ms=mem.s||(v&&v.start)||'';
    var me=mem.e||(v&&v.end)||'';
    return '<div class="v-team-tag" data-sid="'+sid+'" data-s="'+ms+'" data-e="'+me+'" style="display:flex;flex-direction:column;padding:5px 7px;border-radius:7px;background:var(--surface);border:1px solid var(--border);margin-bottom:4px;">'
      +'<div style="display:flex;align-items:center;gap:5px;">'
        +'<div style="width:20px;height:20px;border-radius:50%;background:'+avC(j<0?0:j)+';color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'+s.name.charAt(0)+'</div>'
        +'<span style="flex:1;font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(s.name)+(s.nickname?'<span style="color:var(--txt3);font-weight:400;"> ('+esc(s.nickname)+')</span>':'')+'</span>'
        +'<span style="cursor:pointer;color:var(--coral);font-size:11px;flex-shrink:0;" onclick="window.vtPkuRemove(\''+vid+'\',\''+sid+'\')">✕</span>'
      +'</div>'
      +'<div style="display:flex;gap:3px;margin-top:4px;align-items:center;">'
        +'<input type="date" class="v-mem-s f-input" value="'+ms+'" oninput="this.closest(\'.v-team-tag\').setAttribute(\'data-s\',this.value)" style="flex:1;padding:2px 4px;font-size:9px;height:22px;min-width:0;" title="วันเริ่มงาน">'
        +'<span style="color:var(--txt3);font-size:9px;flex-shrink:0;">→</span>'
        +'<input type="date" class="v-mem-e f-input" value="'+me+'" oninput="this.closest(\'.v-team-tag\').setAttribute(\'data-e\',this.value)" style="flex:1;padding:2px 4px;font-size:9px;height:22px;min-width:0;" title="วันสิ้นสุดงาน">'
      +'</div>'
    +'</div>';
  }).join('');
  var cntTxt=preSel.length>0?'('+preSel.length+')':'';
  return `<div class="visit-row" id="vr-${vid}" data-orig-s="${v&&v.start?v.start:''}" data-orig-e="${v&&v.end?v.end:''}" style="background:var(--surface2);border-radius:10px;padding:14px;border:1px solid var(--border);">
    <input type="hidden" class="v-id" value="${vid}">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <span style="font-size:12px;font-weight:600;color:var(--violet)">รอบที่ ${no}</span>
      <button class="btn btn-red btn-sm" type="button" onclick="this.closest('.visit-row').remove();window.reNumberVisits()">✕ ลบรอบ</button>
    </div>
    <div class="f-grid" style="gap:8px;">
      <div class="f-group"><label class="f-label" style="font-size:11px">วันเริ่มรอบ</label><input type="date" class="f-input v-start" value="${v&&v.start?v.start:''}" onchange="window.vtSyncMemDates('${vid}',this,'s')"></div>
      <div class="f-group"><label class="f-label" style="font-size:11px">วันสิ้นสุดรอบ</label><input type="date" class="f-input v-end" value="${v&&v.end?v.end:''}" onchange="window.vtSyncMemDates('${vid}',this,'e')"></div>
      <div class="f-group"><label class="f-label" style="font-size:11px">วัตถุประสงค์</label><input type="text" class="f-input v-purpose" value="${esc(v&&v.purpose?v.purpose:'')}" placeholder="เช่น สำรวจพื้นที่, ติดตั้ง..."></div>
      <div class="f-group"><label class="f-label" style="font-size:11px">สถานะ</label>
        <select class="f-input v-status">
          <option value="planned" ${!v||v.status==='planned'?'selected':''}>🕐 วางแผน</option>
          <option value="ongoing" ${v&&v.status==='ongoing'?'selected':''}>⚡ กำลังดำเนินการ</option>
          <option value="done" ${v&&v.status==='done'?'selected':''}>✅ เสร็จแล้ว</option>
        </select>
      </div>
      <div class="f-group" style="grid-column:span 2">
        <label class="f-label" style="font-size:11px">ทีมงานรอบนี้ <span style="font-weight:400;color:var(--txt3)">(ระบุวันเริ่ม-สิ้นสุดของแต่ละคนได้)</span></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px;">
          <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;display:flex;flex-direction:column;">
            <div style="padding:4px 8px;background:var(--surface);border-bottom:1px solid var(--border);font-size:10px;font-weight:600;color:var(--txt3);">รายชื่อทั้งหมด</div>
            <div style="padding:4px 6px;border-bottom:1px solid var(--border);"><input type="text" placeholder="ค้นหา..." oninput="window.vtPkuFilter('${vid}',this.value)" style="width:100%;padding:3px 6px;font-size:10px;border:1px solid var(--border);border-radius:5px;background:var(--surface2);color:var(--txt);box-sizing:border-box;"></div>
            <div id="vt-avail-${vid}" style="max-height:130px;overflow-y:auto;padding:3px 4px;">${availHtml}</div>
          </div>
          <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;display:flex;flex-direction:column;">
            <div style="padding:4px 8px;background:var(--surface);border-bottom:1px solid var(--border);font-size:10px;font-weight:600;color:var(--txt3);">ทีมงานที่เลือก <span id="vt-cnt-${vid}" style="color:var(--violet);font-weight:400;">${cntTxt}</span></div>
            <div id="vt-sel-${vid}" style="flex:1;max-height:220px;overflow-y:auto;padding:4px 5px;">${selHtml}</div>
          </div>
        </div>
      </div>
      <div class="f-group" style="grid-column:span 2"><label class="f-label" style="font-size:11px">หมายเหตุ</label><input type="text" class="f-input v-note" value="${esc(v&&v.note?v.note:'')}" placeholder="หมายเหตุ (ถ้ามี)"></div>
    </div>
  </div>`;
};

window.vtPkuFilter=function(vid,q){
  var avail=document.getElementById('vt-avail-'+vid);if(!avail)return;
  var lq=(q||'').toLowerCase();
  avail.querySelectorAll('.vt-avail-item').forEach(function(el){
    el.style.display=(!lq||el.getAttribute('data-search').includes(lq))?'':'none';
  });
};

window.vtPkuAdd=function(vid,sid){
  var selBox=document.getElementById('vt-sel-'+vid);if(!selBox)return;
  if(selBox.querySelector('.v-team-tag[data-sid="'+sid+'"]'))return;
  var s=window.STAFF.find(function(x){return x.id===sid;});if(!s)return;
  var j=window.STAFF.indexOf(s);
  // default dates from visit's current start/end
  var row=document.getElementById('vr-'+vid);
  var vs=row?((row.querySelector('.v-start')||{}).value||''):'';
  var ve=row?((row.querySelector('.v-end')||{}).value||''):'';
  var tag=document.createElement('div');tag.className='v-team-tag';
  tag.setAttribute('data-sid',sid);tag.setAttribute('data-s',vs);tag.setAttribute('data-e',ve);
  tag.style.cssText='display:flex;flex-direction:column;padding:5px 7px;border-radius:7px;background:var(--surface);border:1px solid var(--border);margin-bottom:4px;';
  tag.innerHTML='<div style="display:flex;align-items:center;gap:5px;">'
    +'<div style="width:20px;height:20px;border-radius:50%;background:'+avC(j<0?0:j)+';color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'+s.name.charAt(0)+'</div>'
    +'<span style="flex:1;font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(s.name)+(s.nickname?' <span style="color:var(--txt3);font-weight:400;">('+esc(s.nickname)+')</span>':'')+'</span>'
    +'<span style="cursor:pointer;color:var(--coral);font-size:11px;flex-shrink:0;" onclick="window.vtPkuRemove(\''+vid+'\',\''+sid+'\')">✕</span>'
  +'</div>'
  +'<div style="display:flex;gap:3px;margin-top:4px;align-items:center;">'
    +'<input type="date" class="v-mem-s f-input" value="'+vs+'" oninput="this.closest(\'.v-team-tag\').setAttribute(\'data-s\',this.value)" style="flex:1;padding:2px 4px;font-size:9px;height:22px;min-width:0;" title="วันเริ่มงาน">'
    +'<span style="color:var(--txt3);font-size:9px;flex-shrink:0;">→</span>'
    +'<input type="date" class="v-mem-e f-input" value="'+ve+'" oninput="this.closest(\'.v-team-tag\').setAttribute(\'data-e\',this.value)" style="flex:1;padding:2px 4px;font-size:9px;height:22px;min-width:0;" title="วันสิ้นสุดงาน">'
  +'</div>';
  selBox.appendChild(tag);
  var avItem=document.querySelector('#vt-avail-'+vid+' .vt-avail-item[data-sid="'+sid+'"]');
  if(avItem){avItem.style.opacity='0.3';avItem.style.pointerEvents='none';avItem.querySelector('span:last-child').textContent='✓';}
  var cnt=document.getElementById('vt-cnt-'+vid);if(cnt){var n=selBox.querySelectorAll('.v-team-tag').length;cnt.textContent=n>0?'('+n+')':'';}
};

window.vtPkuRemove=function(vid,sid){
  var selBox=document.getElementById('vt-sel-'+vid);if(!selBox)return;
  var tag=selBox.querySelector('.v-team-tag[data-sid="'+sid+'"]');if(tag)tag.remove();
  var avItem=document.querySelector('#vt-avail-'+vid+' .vt-avail-item[data-sid="'+sid+'"]');
  if(avItem){avItem.style.opacity='1';avItem.style.pointerEvents='auto';avItem.querySelector('span:last-child').textContent='＋';}
  var cnt=document.getElementById('vt-cnt-'+vid);if(cnt){var n=selBox.querySelectorAll('.v-team-tag').length;cnt.textContent=n>0?'('+n+')':'';}
};

window.toggleVisits = function(){
  var body=document.getElementById('visits-body');
  var btn=document.getElementById('btn-toggle-visits');
  if(!body||!btn)return;
  var open=body.style.display!=='none';
  body.style.display=open?'none':'block';
  btn.textContent=open?'+ เพิ่มรอบเข้าไซต์หลายช่วง':'▲ ซ่อน';
};

window.addVisitRow = function(){
  var list=document.getElementById('visits-list');if(!list)return;
  var no=list.querySelectorAll('.visit-row').length+1;
  list.insertAdjacentHTML('beforeend',window._buildVisitRow(null,no));
};

window.addVisitTeam = function(vid){
  var sel=document.getElementById('vadd-'+vid);if(!sel||!sel.value)return;
  var sid=sel.value;
  var tags=document.querySelector('#vr-'+vid+' .v-team-tags');if(!tags)return;
  if(tags.querySelector('[data-sid="'+sid+'"]'))return; // ห้ามซ้ำ
  var s=window.STAFF.find(function(x){return x.id===sid;});
  var tag=document.createElement('div');
  tag.className='visit-team-tag';
  tag.setAttribute('data-vid',vid);
  tag.setAttribute('data-sid',sid);
  tag.style.cssText='display:inline-flex;align-items:center;gap:4px;background:var(--violet)18;color:var(--violet);padding:2px 8px;border-radius:10px;font-size:11px;margin:2px;';
  tag.innerHTML=(s?esc(s.nickname||s.name.split(' ')[0]):'?')+'<span style="cursor:pointer;opacity:.6" onclick="this.parentElement.remove()">✕</span>';
  tags.appendChild(tag);
};

window.reNumberVisits = function(){
  document.querySelectorAll('#visits-list .visit-row').forEach(function(row,i){
    var hd=row.querySelector('.font-weight-600');if(hd)hd.textContent='รอบที่ '+(i+1);
  });
};

// เมื่อเปลี่ยนวันเริ่ม/สิ้นสุดของ visit → อัพเดท member tags ที่ยังใช้วันเดิม
window.vtSyncMemDates = function(vid, input, field) {
  var row = document.getElementById('vr-'+vid);
  if (!row) return;
  var newVal = input.value;
  var origKey = field === 's' ? 'data-orig-s' : 'data-orig-e';
  var tagAttr  = field === 's' ? 'data-s' : 'data-e';
  var memInput = field === 's' ? '.v-mem-s' : '.v-mem-e';
  var origVal  = row.getAttribute(origKey) || '';
  var selBox   = document.getElementById('vt-sel-'+vid);
  if (!selBox) return;
  selBox.querySelectorAll('.v-team-tag').forEach(function(tag) {
    var cur = tag.getAttribute(tagAttr) || '';
    if (!cur || cur === origVal) {
      tag.setAttribute(tagAttr, newVal);
      var inp = tag.querySelector(memInput);
      if (inp) inp.value = newVal;
    }
  });
  // อัพเดท orig ให้ตรงกับค่าใหม่
  row.setAttribute(origKey, newVal);
};

window.collectVisits = function(){
  var rows=document.querySelectorAll('#visits-list .visit-row');
  if(!rows||rows.length===0) return [];
  var result=[];
  rows.forEach(function(row,i){
    var vid=(row.querySelector('.v-id')||{}).value||('V'+Date.now()+i);
    var start=(row.querySelector('.v-start')||{}).value||'';
    var end=(row.querySelector('.v-end')||{}).value||'';
    if(!start&&!end) return; // ข้ามรอบที่ไม่มีวัน
    var team=[...row.querySelectorAll('.v-team-tag[data-sid]')].map(function(t){
      return {sid:t.getAttribute('data-sid'), s:t.getAttribute('data-s')||'', e:t.getAttribute('data-e')||''};
    }).filter(function(t){return t.sid;});
    result.push({
      id:vid, no:i+1,
      start:start, end:end,
      purpose:(row.querySelector('.v-purpose')||{}).value||'',
      status:(row.querySelector('.v-status')||{}).value||'planned',
      note:(row.querySelector('.v-note')||{}).value||'',
      team:team
    });
  });
  return result;
};

