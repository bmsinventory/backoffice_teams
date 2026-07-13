const { esc, fd, fc, fca, pd, gS, gT, gG, gSt, gC, avC, uid, getFY, getYearBE, getStaffOverlaps, overlapWarnText, getStaffLeaveConflicts, getColRef, getDocRef } = window;
const setDoc = (...a) => window.setDoc(...a);
// ── KANBAN ──
window.renderKanban = function(){
  var yf=document.getElementById('kb-yr');
  if(yf&&yf.options.length<=1){var yrs=[...new Set(window.PROJECTS.map(p=>getYearBE(p.start)).filter(Boolean))].sort((a,b)=>b-a);yrs.forEach(function(y){var o=document.createElement('option');o.value=y;o.textContent='ปี พ.ศ. '+y;yf.appendChild(o);});var _cbe=(new Date().getFullYear()+543).toString();if(!yf.value||yf.value==='')yf.value=_cbe;}
  window.msFilter('kb-type',window.PTYPES,{placeholder:'ทุกประเภท',onChange:window.renderKanban});
  window.msFilter('kb-grp',window.PGROUPS,{placeholder:'ทุกกลุ่มโครงการ',onChange:window.renderKanban});
  var yr=(yf||{}).value||'';
  var ty=window.msValues('kb-type');
  var grp=window.msValues('kb-grp');
  var fProjs=window.PROJECTS.filter(function(p){return(!yr||getYearBE(p.start)==yr)&&(!ty.length||ty.includes(p.typeId))&&(!grp.length||grp.includes(p.groupId));});
  var now=new Date();now.setHours(0,0,0,0);
  var board=document.getElementById('kb-board');
  board.innerHTML=window.STAGES.map(function(sg){
    var items=fProjs.filter(function(p){return p.stage===sg.id;}).sort(function(a,b){var as=a.start?pd(a.start):new Date(0);var bs=b.start?pd(b.start):new Date(0);return as-bs;});
    var totalBudget=items.reduce(function(s,p){return s+p.cost;},0);
    var cards=items.map(function(p){
      var pt=gT(p.typeId);var pg=gG(p.groupId);
      var displayProg=p.progress;
      if((sg.id==='exec'||sg.label==='ดำเนินการ')&&p.start&&p.end){var sDate=pd(p.start);var eDate=pd(p.end);var totalMs=eDate-sDate;if(totalMs>0)displayProg=Math.min(100,Math.max(0,Math.round((now-sDate)/totalMs*100)));}
      var mems=(p.members&&p.members.length>0?p.members:p.team.map(function(id){return{sid:id};}));
      var nicknames=mems.slice(0,3).map(function(m){var s=window.STAFF.find(function(x){return x.id===m.sid;});return s?s.nickname||s.name.split(' ')[0]:'';}).filter(Boolean);
      var extraMems=mems.length>3?`<span style="font-size:9px;color:var(--txt3);font-weight:600;">+${mems.length-3}</span>`:'';
      var avatarHtml=nicknames.map(function(n,i){return`<div style="width:20px;height:20px;border-radius:50%;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${avC(i)};color:#fff;border:1.5px solid var(--surface);">${n.charAt(0)}</div>`;}).join('');
      var endDate=p.end?pd(p.end):null;
      var diffDays=endDate?Math.ceil((endDate-now)/(1000*60*60*24)):null;
      var urgColor=diffDays===null?'var(--txt3)':diffDays<0?'var(--coral)':diffDays<=7?'var(--coral)':diffDays<=15?'var(--amber)':'var(--txt3)';
      var endStr=p.end?fd(p.end):'—';
      var urgBadge=diffDays!==null&&diffDays<=15?`<span style="font-size:9px;font-weight:700;color:${urgColor};background:${urgColor}18;padding:1px 5px;border-radius:6px;">${diffDays<0?'ล่าช้า '+Math.abs(diffDays)+'ว':'เหลือ '+diffDays+'ว'}</span>`:'';
      return`<div class="kb-card" draggable="${window.canEdit('kanban')}" ondragstart="window.kbDrag(event,'${p.id}')" onclick="window.openProjModal('${p.id}')">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;margin-bottom:7px;">
          <div style="display:flex;flex-wrap:wrap;gap:3px;">
            <span class="kb-card-type" style="background:${pt.color}18;color:${pt.color};margin:0">${esc(pt.label)}</span>
            ${pg?`<span class="kb-card-type" style="background:${pg.color}18;color:${pg.color};margin:0">${esc(pg.label)}</span>`:''}
          </div>
        </div>
        <div class="kb-card-name">${esc(p.name)}${p.siteOwner?`<div style="font-size:10px;color:var(--txt3);font-weight:400;margin-top:2px;">🏢 ${esc(p.siteOwner)}</div>`:''}</div>
        <div class="pbar" style="margin-bottom:10px"><div class="pbar-fill" style="width:${Math.max(4,displayProg)}%;background:${sg.color}"></div></div>
        <div class="kb-card-foot">
          <div style="display:flex;align-items:center;gap:-4px;">${avatarHtml}${extraMems}</div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:1px;">
            <span style="color:${sg.color};font-weight:800;font-size:11px;">${displayProg}%</span>
            <span style="color:${urgColor};font-size:9px;">${endStr}</span>
          </div>
        </div>
        ${p.cost?`<div style="margin-top:8px;padding-top:6px;border-top:1px dashed var(--border);font-size:10px;color:var(--txt3);text-align:right;">${fc(p.cost)}</div>`:''}
      </div>`;
    }).join('');
    return`<div class="kb-col" id="kc-${sg.id}" ondragover="event.preventDefault();this.classList.add('kb-drop')" ondragleave="this.classList.remove('kb-drop')" ondrop="window.kbDrop(event,'${sg.id}')">
      <div class="kb-head" style="border-top:3px solid ${sg.color}">
        <div class="kb-dot" style="background:${sg.color}"></div>
        <div class="kb-htitle">${sg.label}</div>
        <div class="kb-cnt" style="background:${sg.color}18;color:${sg.color}">${items.length}</div>
      </div>
      ${totalBudget>0?`<div style="padding:6px 14px;font-size:10px;font-weight:700;color:${sg.color};background:${sg.color}08;border-bottom:1px solid ${sg.color}22;">${fc(totalBudget)}</div>`:''}
      <div class="kb-body">
        ${cards}
        ${items.length===0?`<div class="kb-empty">${window.canEdit('kanban')?'ลากมาวาง':'ว่าง'}</div>`:''}
      </div></div>`;
  }).join('');
}
// ── AUTO-STAGE ENGINE ──
window.toggleRuleOffset=function(){
  var rule=(document.getElementById('asgf-rule')||{}).value||'';
  var wrap=document.getElementById('asgf-offset-wrap');
  if(wrap)wrap.style.display=(rule==='before_start'||rule==='after_end')?'block':'none';
}

window.runAutoStage=async function(silent){
  if(!window.STAGES||!window.PROJECTS)return;
  var now=new Date();now.setHours(0,0,0,0);
  // Sort stages by order so higher-priority (later) rules win when multiple match
  var ruledStages=window.STAGES.filter(s=>s.autoRule).sort((a,b)=>a.order-b.order);
  if(ruledStages.length===0)return;
  var updates=[];
  window.PROJECTS.forEach(function(p){
    if(!p.start&&!p.end)return;
    if(p.status==='cancelled')return;
    // Skip if current stage has NO auto-rule and its order >= best matching stage order
    // This lets manually-advanced stages (e.g. 'close') stay put
    var curStageObj=window.STAGES.find(function(s){return s.id===p.stage;});
    var curHasRule=curStageObj&&curStageObj.autoRule;
    // Pre-check: find what the best auto stage would be (without committing)
    // If current stage has no rule and is at same or higher order than any matching rule — skip
    if(curStageObj&&!curHasRule){
      // Find highest-order matching rule for this project
      var wouldMatch=null;
      ruledStages.forEach(function(s){
        var m=false,offsetMs=(s.autoOffset||0)*86400000;
        var startD2=p.start?pd(p.start):null,endD2=p.end?pd(p.end):null;
        if(s.autoRule==='before_start'&&startD2){var t=new Date(startD2.getTime()-offsetMs);if(now>=t&&now<startD2)m=true;}
        else if(s.autoRule==='on_start'&&startD2){if(now>=startD2&&(!endD2||now<endD2))m=true;}
        else if(s.autoRule==='on_end'&&endD2){if(now>=endD2)m=true;}
        else if(s.autoRule==='after_end'&&endD2){var t=new Date(endD2.getTime()+offsetMs);if(now>=t)m=true;}
        if(m)wouldMatch=s;
      });
      if(wouldMatch&&(curStageObj.order||0)>=(wouldMatch.order||0))return;
      if(!wouldMatch)return; // no rule matches at all, nothing to do
    }
    var startD=p.start?pd(p.start):null;
    var endD=p.end?pd(p.end):null;
    var bestStage=null,bestProg=-1;
    ruledStages.forEach(function(s){
      var match=false;
      var offsetMs=(s.autoOffset||0)*86400000;
      if(s.autoRule==='before_start'&&startD){
        var trigger=new Date(startD.getTime()-offsetMs);
        if(now>=trigger&&now<startD)match=true;
      } else if(s.autoRule==='on_start'&&startD){
        if(now>=startD&&(!endD||now<endD))match=true;
      } else if(s.autoRule==='on_end'&&endD){
        if(now>=endD)match=true;
      } else if(s.autoRule==='after_end'&&endD){
        var trigger=new Date(endD.getTime()+offsetMs);
        if(now>=trigger)match=true;
      }
      if(match){bestStage=s;bestProg=s.setProgress;}
    });
    if(!bestStage)return;
    var changed=false;var newProg=p.progress;
    if(p.stage!==bestStage.id)changed=true;
    if(bestProg>=0&&p.progress!==bestProg){newProg=bestProg;changed=true;}
    if(changed)updates.push({p,newStage:bestStage.id,newProg});
  });
  if(updates.length===0)return;
  for(var u of updates){
    var prevAutoStage=u.p.stage;
    u.p.stage=u.newStage;u.p.progress=u.newProg;
    var finalAutoP=window.stageForces100(u.newStage)?100:u.newProg;
    if(window.stageForces100(u.newStage))u.p.progress=100;
    var dbUp={stage_id:u.newStage};
    if(finalAutoP>=0)dbUp.progress_pct=finalAutoP;
    await setDoc(getDocRef('PROJECTS',u.p.id),dbUp,{merge:true}).catch(e=>window.showDbError(e));
    // แจ้งเตือน Advance เมื่อ auto-stage เลื่อนโครงการเข้า 'plan'
    if(u.newStage==='plan'&&prevAutoStage!=='plan'&&window.sendAdvanceNotify){
      if(!window.notiSent||!window.notiSent('adv_plan',u.p.id)){
        window.sendAdvanceNotify(u.p,false);
        if(window.notiMark)window.notiMark('adv_plan',u.p.id);
      }
    }
    // แจ้งเตือนปิดโครงการ/จ่ายเงินแล้ว เมื่อ auto-stage เลื่อนเข้า 'close'
    if(u.newStage==='close'&&prevAutoStage!=='close'&&window.sendProjectNotify){
      if(!window.notiSent||!window.notiSent('proj_close',u.p.id)){
        window.sendProjectNotify(u.p,'close');
        if(window.notiMark)window.notiMark('proj_close',u.p.id);
      }
    }
  }
  if(!silent)window.showToast(`⚡ อัปเดต Stage อัตโนมัติ ${updates.length} โครงการ`,'info');
  window.renderKanban();window.renderOverview();window.renderProjects();
  return updates.length;
}

// Run on load + every 60 min
window._autoStageTimer=null;
window.startAutoStageLoop=function(){
  window.runAutoStage(true);
  clearInterval(window._autoStageTimer);
  window._autoStageTimer=setInterval(function(){window.runAutoStage(true);},5*60*1000);
}

window.kbDrag=function(e,pid){window.kbPid=pid;}
// ── STAGE PROGRESS RULE: stages that always force 100% ──
window.onStageChange=function(sid){
  if(window.stageForces100(sid)){
    var pr=document.getElementById('pf-prog');var lb=document.getElementById('prog-lbl');
    if(pr){pr.value=100;pr.disabled=true;pr.style.opacity='.5';}
    if(lb)lb.textContent='100%';
  } else {
    var pr=document.getElementById('pf-prog');if(pr){pr.disabled=false;pr.style.opacity='';}
  }
}
window.stageForces100=function(stageId){
  // Any stage with setProgress=100 in config, OR deliver/close by convention
  var s=window.STAGES.find(function(x){return x.id===stageId;});
  if(s&&s.setProgress===100)return true;
  // fallback: default stage IDs
  return stageId==='deliver'||stageId==='close';
}

window.kbDrop=async function(e,sid){
  e.preventDefault();
  document.querySelectorAll('.kb-col').forEach(function(c){c.classList.remove('kb-drop');});
  if(!window.kbPid||!window.canEdit('kanban'))return;
  if(!window.auth.currentUser)return;
  var p=window.PROJECTS.find(function(x){return x.id===window.kbPid;});
  if(p){
    var prevStage=p.stage;
    p.stage=sid;
    var force100=window.stageForces100(sid);
    if(force100)p.progress=100;
    window.renderKanban();window.renderOverview();
    var upd={stage_id:sid};if(force100)upd.progress_pct=100;
    setDoc(getDocRef('PROJECTS',p.id),upd,{merge:true}).catch(err=>window.showDbError(err));
    // แจ้งเตือน Advance เมื่อโครงการเข้า stage 'plan'
    if(sid==='plan'&&prevStage!=='plan'&&window.sendAdvanceNotify){
      if(!window.notiSent||!window.notiSent('adv_plan',p.id)){
        window.sendAdvanceNotify(p,false);
        if(window.notiMark)window.notiMark('adv_plan',p.id);
      }
    }
    // แจ้งเตือนปิดโครงการ/จ่ายเงินแล้ว เมื่อเข้า stage 'close'
    if(sid==='close'&&prevStage!=='close'&&window.sendProjectNotify){
      if(!window.notiSent||!window.notiSent('proj_close',p.id)){
        window.sendProjectNotify(p,'close');
        if(window.notiMark)window.notiMark('proj_close',p.id);
      }
    }
  }
  window.kbPid=null;
}

