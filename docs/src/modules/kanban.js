const { esc, fd, fc, fca, pd, gS, gT, gG, gSt, gC, avC, uid, getFY, getYearBE, getStaffOverlaps, overlapWarnText, getStaffLeaveConflicts, getColRef, getDocRef } = window;
const setDoc = (...a) => window.setDoc(...a);
const KB_EXCLUDED_GROUPS = ['GRP17733355541905','GRP17733355541906'];
// ── KANBAN ──
// โครงการตามตัวกรองบนบอร์ด (ปี พ.ศ. / ประเภท / กลุ่ม) — ใช้ร่วมกับปุ่ม AI สรุปขออนุมัติ Adv.
function kbFilteredProjects(){
  var yr=(document.getElementById('kb-yr')||{}).value||'';
  var ty=window.msValues('kb-type');
  var grp=window.msValues('kb-grp');
  return window.PROJECTS.filter(function(p){return!KB_EXCLUDED_GROUPS.includes(p.groupId)&&(!yr||getYearBE(p.start)==yr)&&(!ty.length||ty.includes(p.typeId))&&(!grp.length||grp.includes(p.groupId));});
}
window.renderKanban = function(){
  var yf=document.getElementById('kb-yr');
  if(yf&&yf.options.length<=1){var yrs=[...new Set(window.PROJECTS.filter(function(p){return!KB_EXCLUDED_GROUPS.includes(p.groupId);}).map(p=>getYearBE(p.start)).filter(Boolean))].sort((a,b)=>b-a);yrs.forEach(function(y){var o=document.createElement('option');o.value=y;o.textContent='ปี พ.ศ. '+y;yf.appendChild(o);});var _cbe=(new Date().getFullYear()+543).toString();if(!yf.value||yf.value==='')yf.value=_cbe;}
  window.msFilter('kb-type',window.PTYPES,{placeholder:'ทุกประเภท',onChange:window.renderKanban});
  window.msFilter('kb-grp',window.PGROUPS.filter(function(g){return!KB_EXCLUDED_GROUPS.includes(g.id);}),{placeholder:'ทุกกลุ่มโครงการ',onChange:window.renderKanban});
  var fProjs=kbFilteredProjects();
  var now=new Date();now.setHours(0,0,0,0);
  var board=document.getElementById('kb-board');
  board.innerHTML=window.STAGES.map(function(sg){
    var items=fProjs.filter(function(p){return p.stage===sg.id;}).sort(function(a,b){var as=a.start?pd(a.start):new Date(0);var bs=b.start?pd(b.start):new Date(0);return as-bs;});
    var totalBudget=items.reduce(function(s,p){return s+p.cost;},0);
    var cards=items.map(function(p){
      var pt=gT(p.typeId);var pg=gG(p.groupId);
      var pAdvs=window.ADVANCES.filter(function(a){return a.pid===p.id;});
      var adv=pAdvs.find(function(a){return a.status!=='cleared';})||pAdvs[pAdvs.length-1];
      var advStat=adv?window.AFLW.find(function(x){return x.id===adv.status;}):null;
      var advBadge=advStat?`<span class="kb-card-type" style="background:${advStat.color}18;color:${advStat.color};margin:0" title="มี Advance — สถานะ: ${esc(advStat.label)}">💰 ${advStat.icon} ${esc(advStat.label)}</span>`:'';
      // ── ที่พักรออนุมัติ — เกณฑ์เดียวกับตาราง "สถานะที่พัก" ใน projects.js (ไม่นับกลุ่มโครงการที่ไม่ต้องติดตามที่พัก) ──
      var _exLd=['GRP17733355541905','GRP17733355541906'];
      var ldBadge='';
      if(!_exLd.includes(p.groupId)){
        var _pLds=window.LODGINGS.filter(function(l){return l.pid===p.id;});
        if(_pLds.length&&!_pLds.some(function(l){return l.approvedDaily==='yes'||l.approvedMonthly==='yes';})){
          ldBadge=`<span class="kb-card-type" style="background:#ffa62b18;color:var(--amber);margin:0" title="มีคำขอจัดหาที่พัก ยังไม่อนุมัติ">🏨 ที่พักรออนุมัติ</span>`;
        }
      }
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
            ${advBadge}
            ${ldBadge}
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
        ${window.canEdit('kanban')?`<select class="kb-stage-sel" onclick="event.stopPropagation()" onchange="window.kbMoveStage('${p.id}',this.value)" aria-label="ย้าย Stage">${window.STAGES.map(function(s){return'<option value="'+s.id+'"'+(s.id===p.stage?' selected':'')+'>'+(s.id===p.stage?'Stage: ':'ย้ายไป → ')+esc(s.label)+'</option>';}).join('')}</select>`:''}
      </div>`;
    }).join('');
    return`<div class="kb-col" id="kc-${sg.id}" ondragover="event.preventDefault();this.classList.add('kb-drop')" ondragleave="this.classList.remove('kb-drop')" ondrop="window.kbDrop(event,'${sg.id}')">
      <div class="kb-head" style="border-top:3px solid ${sg.color}">
        <div class="kb-dot" style="background:${sg.color}"></div>
        <div class="kb-htitle">${sg.label}</div>
        <div class="kb-cnt" style="background:${sg.color}18;color:${sg.color}">${items.length}</div>${window.calcTip('จำนวนโครงการในขั้นตอนนี้ (ตามตัวกรอง)\nแถบใต้หัวคอลัมน์ = ผลรวมมูลค่าโครงการในขั้นตอนนี้\nแถบความคืบหน้าบนการ์ด: ขั้นตอน "ดำเนินการ" คำนวณจาก (วันนี้ − วันเริ่ม) ÷ (วันสิ้นสุด − วันเริ่ม)')}
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
// ── ย้าย Stage จากเมนูบนการ์ด (มือถือ — จอสัมผัสลากการ์ดแบบ HTML5 drag ไม่ได้) ใช้ kbDrop เดิม
// ทุกอย่างเหมือนการลาก (บังคับ 100%, แจ้งเตือน Adv./ปิดโครงการ) ──
window.kbMoveStage=function(pid,sid){
  var p=window.PROJECTS.find(function(x){return x.id===pid;});
  if(!p||!sid||p.stage===sid)return;
  window.kbPid=pid;
  window.kbDrop({preventDefault:function(){}},sid);
};
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

// ── 🤖 AI สรุปขออนุมัติ Adv. — โครงการในคอลัมน์ "วางแผนงาน/จัดทำ Adv." (stage plan) ตามตัวกรองบนบอร์ด
// ที่ยังไม่มี Adv. หรือ Adv. ยังไม่อนุมัติ (draft/pending) · ตัวเลขทุกตัว (วัน/คน/ที่พัก) คำนวณในโค้ด
// ส่งให้ AI เป็นข้อเท็จจริง — AI มีหน้าที่เรียบเรียงเป็นข้อความ LINE เท่านั้น สั่งห้ามแก้/แต่งตัวเลข ──
var KB_ADV_NOT_APPROVED=['draft','pending'];
function kbIsHoliday(d){
  var ds=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  return d.getDay()===0||d.getDay()===6||window.HOLIDAYS.some(function(h){return h.date===ds;});
}
// นับวันทำงาน/วันหยุด ในช่วง s–e (รวมหัวท้าย) — เกณฑ์วันหยุดเดียวกับ advance.js (เสาร์-อาทิตย์ + HOLIDAYS)
function kbCountDays(s,e){
  if(!s||!e)return{w:0,h:0};
  var d=pd(s),end=pd(e),w=0,h=0;
  for(var i=0;d<=end&&i<400;i++){if(kbIsHoliday(d))h++;else w++;d.setDate(d.getDate()+1);}
  return{w:w,h:h};
}
// ชื่อโรงพยาบาล/สถานที่จากชื่อโครงการ — จับคู่กับรายชื่อ รพ. ในระบบก่อน (ชื่อยาวสุดที่อยู่ในชื่อโครงการ)
// ไม่เจอค่อยตัดจากคำนำหน้าสถานที่ (โรงพยาบาล/รพ./สถาบัน/…) จนจบชื่อ — siteOwner ไม่ได้เก็บชื่อ รพ. จริง
function kbPlaceName(p){
  var name=p.name||'';
  var hit=(window.HOSPITALS||[]).filter(function(h){return h.name&&name.indexOf(h.name)>-1;})
    .sort(function(a,b){return b.name.length-a.name.length;})[0];
  if(hit)return hit.name;
  var m=name.match(/(โรงพยาบาล|รพ\.|รพ\s|สถาบัน|สำนักงาน|ศูนย์|สสจ\.|สสอ\.|รพ\.สต\.).*$/);
  return m?m[0].trim():'';
}
function kbAdvFacts(p){
  var now=new Date();now.setHours(0,0,0,0);
  var pt=gT(p.typeId),pg=gG(p.groupId);
  var mems=(p.members&&p.members.length?p.members:(p.team||[]).map(function(id){return{sid:id};}));
  var memLines=mems.map(function(m){
    var s=window.STAFF.find(function(x){return x.id===m.sid;});
    var ms=m.s||p.start,me=m.e||p.end,c=kbCountDays(ms,me);
    return '  • '+(s?s.name+(s.nickname?' ('+s.nickname+')':''):'ไม่ทราบชื่อ')+(s&&s.role?' — '+s.role:'')
      +' | '+(ms?fd(ms):'-')+' – '+(me?fd(me):'-')+' ('+(c.w+c.h)+' วัน)';
  });
  var pc=kbCountDays(p.start,p.end);
  var daysToStart=p.start?Math.ceil((pd(p.start)-now)/86400000):null;
  var lds=window.LODGINGS.filter(function(l){return l.pid===p.id;});
  var ldApproved=lds.some(function(l){return l.approvedDaily==='yes'||l.approvedMonthly==='yes';});
  var ldTotal=lds.reduce(function(s,l){return s+(Number(l.total)||0);},0);
  var visits=(p.visits||[]).filter(function(v){return v.status!=='done'&&v.start;});
  return [
    'โครงการ: '+p.name,
    'ประเภท/กลุ่ม: '+(pt.label||'-')+(pg?' / '+pg.label:''),
    (kbPlaceName(p)?'สถานที่: '+kbPlaceName(p):''),
    'ผู้ติดตั้ง: '+(p.installer||'-'),
    'ช่วงดำเนินงาน: '+(p.start?fd(p.start):'-')+' – '+(p.end?fd(p.end):'-')+' (วันทำงาน '+pc.w+' วัน, วันหยุด '+pc.h+' วัน)'
      +(daysToStart!=null?(daysToStart>=0?' · อีก '+daysToStart+' วันเริ่มงาน':' · เริ่มงานไปแล้ว '+(-daysToStart)+' วัน'):''),
    (p.isBorder?'พื้นที่: ชายแดน':''),
    'ทีมงาน '+mems.length+' คน:'+(memLines.length?'\n'+memLines.join('\n'):' (ยังไม่ได้กำหนด)'),
    'ที่พัก: '+(lds.length?lds.length+' รายการ รวม '+fca(ldTotal)+' บาท · '+(ldApproved?'อนุมัติแล้ว':'ยังไม่อนุมัติ'):'ยังไม่มีคำขอที่พัก'),
    (visits.length?'รอบเข้าไซต์ที่วางแผน: '+visits.map(function(v){return 'ครั้งที่ '+v.no+' '+fd(v.start)+(v.end?' – '+fd(v.end):'')+(v.purpose?' ('+v.purpose+')':'');}).join(', '):''),
    (p.cost?'งบประมาณโครงการ: '+fca(p.cost)+' บาท':''),
    (p.note?'หมายเหตุ: '+String(p.note).slice(0,300):''),
  ].filter(Boolean).join('\n');
}
window.kbAiAdvSummary=async function(){
  var out=document.getElementById('m-kb-ai-body'),foot=document.getElementById('m-kb-ai-foot');
  if(!out||!foot)return;
  var close='<button class="btn btn-ghost" onclick="window.closeM(\'m-kb-ai\')">ปิด</button>';
  var inPlan=kbFilteredProjects().filter(function(p){return p.stage==='plan'&&p.status!=='cancelled';})
    .sort(function(a,b){return(a.start||'').localeCompare(b.start||'');});
  var need=inPlan.filter(function(p){
    var advs=window.ADVANCES.filter(function(a){return a.pid===p.id&&a.status!=='cleared';});
    return !advs.length||advs.every(function(a){return KB_ADV_NOT_APPROVED.indexOf(a.status)>-1;});
  });
  var done=inPlan.filter(function(p){return need.indexOf(p)===-1;});
  foot.innerHTML='';
  window.openM('m-kb-ai');
  if(!need.length){
    out.innerHTML='<div style="color:var(--txt2);">✅ ไม่มีไซต์ในคอลัมน์ "วางแผนงาน/จัดทำ Adv." ที่ต้องขออนุมัติ Adv. (ตามตัวกรองปัจจุบัน)'
      +(done.length?'<div style="color:var(--txt3);font-size:12px;margin-top:6px;">Adv. อนุมัติแล้ว: '+done.map(function(p){return esc(p.name);}).join(', ')+'</div>':'')+'</div>';
    foot.innerHTML=close;return;
  }
  out.innerHTML='<div style="color:var(--txt3);">⏳ AI กำลังสรุป '+need.length+' ไซต์...</div>';
  var system='คุณเป็นผู้ช่วยฝ่ายปฏิบัติการ บริษัทติดตั้งระบบซอฟต์แวร์โรงพยาบาล เขียนข้อความภาษาไทยส่ง LINE ถึงผู้อนุมัติ '
    +'เพื่อแจ้งขออนุมัติ Advance (เงินทดรองจ่าย) สำหรับไซต์ที่ถึงระยะวางแผนงาน สุภาพ กระชับ อ่านง่ายบนมือถือ\n'
    +'รูปแบบ: บรรทัดแรก "📋 แจ้งขออนุมัติ Advance (N ไซต์)" แล้วเรียงทีละไซต์ ขึ้นต้นแต่ละไซต์ด้วย "🏥 <ลำดับ>. <ชื่อโครงการ>" '
    +'ตามด้วยรายละเอียดทีละบรรทัดโดยใช้อีโมจินำ เช่น 📍 ชื่อโรงพยาบาล/สถานที่ (เฉพาะชื่อ) 📅 ช่วงวัน 🏨 ที่พัก '
    +'· ทีมงาน: บรรทัด "👥 ทีมงาน <จำนวน> คน" แล้วแยกบรรทัดละ 1 คน ขึ้นต้นด้วย "   • " ตามด้วย ชื่อ-นามสกุล (วันเริ่ม – วันสิ้นสุด) ห้ามรวมหลายคนไว้บรรทัดเดียว '
    +'ห้ามใส่เบี้ยเลี้ยงหรือสถานะ/ยอด Advance · คั่นแต่ละไซต์ด้วยบรรทัดว่าง ปิดท้ายด้วยประโยคขออนุมัติสั้น ๆ 1 บรรทัด\n'
    +'ห้ามใช้ Markdown (ห้าม **, ##, - นำหน้าบรรทัด) เพราะ LINE ไม่รองรับ · ใช้ตัวเลข วันที่ และชื่อ ตามข้อมูลที่ให้เท่านั้น ห้ามคำนวณใหม่หรือแต่งเพิ่ม '
    +'· ข้อมูลที่ไม่มีให้ข้ามไป ไม่ต้องเขียนว่า "ไม่มีข้อมูล"';
  var user='ไซต์ที่ต้องขออนุมัติ Adv. ('+need.length+' ไซต์):\n\n'+need.map(function(p,i){return '### ไซต์ที่ '+(i+1)+'\n'+kbAdvFacts(p);}).join('\n\n');
  try{
    var text=await window.aiChat(system,user,{maxTokens:600+need.length*350,temperature:0.2});
    text=text.replace(/\*\*/g,'').replace(/^#+\s*/gm,'').replace(/^-\s+/gm,'▪️ ');
    out.innerHTML='<div>'+esc(text).replace(/\n/g,'<br>')+'</div>'
      +(done.length?'<div style="color:var(--txt3);font-size:11.5px;margin-top:10px;border-top:1px dashed var(--border);padding-top:8px;">ไม่รวม (Adv. อนุมัติแล้ว): '+done.map(function(p){return esc(p.name);}).join(', ')+'</div>':'')
      +'<div style="color:var(--txt3);font-size:10.5px;margin-top:6px;">* สรุปจากข้อมูลในระบบ — ตรวจทานก่อนส่ง</div>';
    out.dataset.raw=text;
    foot.innerHTML=close+'<button class="btn btn-teal" onclick="window.kbCopyAiSummary()">📋 คัดลอกส่ง LINE</button>';
  }catch(e){
    out.innerHTML='<div style="color:var(--coral);">'+esc(String(e.message||e))+'</div>';
    foot.innerHTML=close+'<button class="btn btn-pri" onclick="window.kbAiAdvSummary()">🔁 ลองใหม่</button>';
  }
};
window.kbCopyAiSummary=function(){
  var out=document.getElementById('m-kb-ai-body');
  var text=out&&out.dataset?out.dataset.raw:'';
  if(!text||!navigator.clipboard)return;
  navigator.clipboard.writeText(text).then(function(){window.showAlert&&window.showAlert('คัดลอกแล้ว พร้อมวางส่ง LINE','success');});
};
