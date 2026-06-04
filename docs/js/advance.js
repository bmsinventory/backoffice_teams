const { esc, fd, fc, fca, pd, gS, gT, gG, gSt, gC, avC, uid, getFY, getYearBE, getStaffOverlaps, overlapWarnText, getStaffLeaveConflicts, getColRef, getDocRef } = window;
const setDoc    = (...a) => window.setDoc(...a);
const deleteDoc = (...a) => window.deleteDoc(...a);
const getDocs   = (...a) => window.getDocs(...a);
const writeBatch = ()   => window.writeBatch();
// ── ADVANCE ──
window.renderAdvance=function(){
  var gf=document.getElementById('adv-grp');if(gf&&gf.options.length<=1){window.PGROUPS.forEach(function(g){var o=document.createElement('option');o.value=g.id;o.textContent=g.label;gf.appendChild(o);});}
  var tf=document.getElementById('adv-type');if(tf&&tf.options.length<=1){window.PTYPES.forEach(function(t){var o=document.createElement('option');o.value=t.id;o.textContent=t.label;tf.appendChild(o);});}
  var yf=document.getElementById('adv-yr');if(yf&&yf.options.length<=1){var yrs=[...new Set(window.PROJECTS.map(p=>getYearBE(p.start)).filter(Boolean))].sort((a,b)=>b-a);yrs.forEach(function(y){var o=document.createElement('option');o.value=y;o.textContent='ปี พ.ศ. '+y;yf.appendChild(o);});var _cbe=(new Date().getFullYear()+543).toString();if(!yf.value||yf.value==='')yf.value=_cbe;}
  // Status tabs
  var tabs=document.getElementById('af-tabs');
  if(tabs){var all=[{id:'',label:'ทั้งหมด',color:'#7c5cfc'}].concat(window.AFLW);
    tabs.innerHTML=all.map(function(s){var cnt=s.id?window.ADVANCES.filter(function(a){return a.status===s.id;}).length:window.ADVANCES.length;var on=window.advFilter===s.id;
      return`<div class="af-tab${on?' on':''}" style="${on?'background:'+s.color+';color:#fff':''}" onclick="window.advFilter='${s.id}';window.renderAdvance()">${s.label}<span class="af-cnt">${cnt}</span></div>`;
    }).join('');}
  var q=(document.getElementById('adv-q')||{}).value||'';
  var grp=(document.getElementById('adv-grp')||{}).value||'';
  var ty=(document.getElementById('adv-type')||{}).value||'';
  var yr=(document.getElementById('adv-yr')||{}).value||'';
  var now=new Date();
  var rows=window.ADVANCES.filter(function(a){
    if(window.advFilter&&a.status!==window.advFilter)return false;
    var p=window.PROJECTS.find(function(x){return x.id===a.pid;});
    if(grp&&(!p||p.groupId!==grp))return false;
    if(ty&&(!p||p.typeId!==ty))return false;
    if(yr&&(!p||getYearBE(p.start)!=yr))return false;
    return!q||a.purpose.includes(q)||(p&&p.name.includes(q));
  });
  // ── Summary bar ──
  var totalAmt=rows.reduce((s,a)=>s+(a.amount||0),0);
  var totalClr=rows.reduce((s,a)=>s+(a.cleared||0),0);
  var overdueCount=rows.filter(a=>a.ddate&&pd(a.ddate)<now&&a.status!=='cleared').length;
  var draftCount=rows.filter(a=>a.status==='draft').length;
  var bar=document.getElementById('adv-summary-bar');
  if(bar)bar.innerHTML=[
    {icon:'💳',label:'รายการทั้งหมด',val:rows.length+' รายการ',c:'var(--violet)'},
    {icon:'💰',label:'ยอดเบิกรวม',val:fca(totalAmt),c:'var(--indigo)'},
    {icon:'✅',label:'จ่ายจริงรวม',val:fca(totalClr),c:'var(--teal)'},
    {icon:'⚠️',label:'เลยกำหนด',val:overdueCount+' รายการ',c:'var(--coral)'},
  ].map(s=>`<div style="display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px 16px;flex:1;min-width:150px;">
    <div style="width:36px;height:36px;border-radius:10px;background:${s.c}18;display:flex;align-items:center;justify-content:center;font-size:18px;">${s.icon}</div>
    <div><div style="font-size:10px;color:var(--txt3);font-weight:600;text-transform:uppercase;letter-spacing:.5px;">${s.label}</div>
    <div style="font-size:15px;font-weight:800;color:${s.c};">${s.val}</div></div>
  </div>`).join('');
  // ── Cards ──
  var cards=document.getElementById('adv-cards');
  if(!cards)return;
  if(rows.length===0){
    cards.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--txt3);">
      <div style="font-size:48px;margin-bottom:12px;">💳</div>
      <div style="font-size:14px;font-weight:600;">ไม่พบรายการเบิกจ่าย</div>
    </div>`;return;
  }
  cards.innerHTML=rows.map(function(a){
    var p=window.PROJECTS.find(function(x){return x.id===a.pid;});
    var pt=gT(p?p.typeId:'');var pg=gG(p?p.groupId:'');
    var sf=window.AFLW.find(function(x){return x.id===a.status;})||window.AFLW[0];
    var ov=a.ddate&&pd(a.ddate)<now&&a.status!=='cleared';
    var diff=a.amount-(a.cleared||0);
    var diffColor=diff>0?'var(--amber)':diff<0?'var(--coral)':'var(--teal)';
    var diffLabel=diff===0?fca(0):diff>0?fca(diff):'-'+fca(Math.abs(diff));
    // Progress bar for cleared amount
    var pct=a.amount>0?Math.min(100,Math.round((a.cleared||0)/a.amount*100)):0;
    var progColor=pct>=100?'var(--teal)':pct>50?'var(--indigo)':'var(--amber)';
    return`<div class="fade" style="background:var(--surface);border:2px solid ${ov?'var(--coral)':a.status==='cleared'?'var(--teal)':'var(--border)'};border-radius:16px;overflow:hidden;box-shadow:var(--sh-sm);display:flex;flex-direction:column;cursor:pointer;" onclick="window.openAdvModal('${a.id}')">
      <!-- Card Header -->
      <div style="padding:14px 16px;background:linear-gradient(135deg,${pt.color}10,transparent);border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:800;line-height:1.3;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p?esc(p.name):(a.pid?esc(a.pid):'—')}</div>
            <div style="display:flex;gap:5px;flex-wrap:wrap;">
              ${pt.label?`<span style="font-size:10px;font-weight:700;padding:1px 8px;border-radius:20px;background:${pt.color}18;color:${pt.color};">${esc(pt.label)}</span>`:''}
              ${pg?`<span style="font-size:10px;font-weight:700;padding:1px 8px;border-radius:20px;background:${pg.color}18;color:${pg.color};">${esc(pg.label)}</span>`:''}
            </div>
          </div>
          <span style="background:${sf.color}18;color:${sf.color};font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;border:1px solid ${sf.color}30;white-space:nowrap;">${ov?'⚠️ ':''}<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${sf.color};margin-right:4px;vertical-align:middle;"></span>${sf.label}</span>
        </div>
        <div style="font-size:12px;color:var(--txt2);font-weight:600;">${esc(a.purpose)}</div>
        ${a.advno?`<div style="font-size:10px;color:var(--txt3);margin-top:2px;">📋 ${esc(a.advno)}</div>`:''}
      </div>
      <!-- Amounts section -->
      <div style="padding:12px 16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;border-bottom:1px solid var(--border);">
        <div style="text-align:center;">
          <div style="font-size:10px;color:var(--txt3);margin-bottom:2px;">ยอดเบิก</div>
          <div style="font-size:14px;font-weight:800;color:var(--indigo);">${fca(a.amount)}</div>
        </div>
        <div style="text-align:center;border-left:1px solid var(--border);border-right:1px solid var(--border);">
          <div style="font-size:10px;color:var(--txt3);margin-bottom:2px;">จ่ายจริง</div>
          <div style="font-size:14px;font-weight:800;color:var(--teal);">${a.cleared?fca(a.cleared):'—'}</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:10px;color:var(--txt3);margin-bottom:2px;">ส่วนต่าง</div>
          <div style="font-size:13px;font-weight:800;color:${diff<0?'var(--coral)':(a.status==='cleared'?diffColor:'var(--txt2)')};">${a.status==='cleared'?diffLabel:(diff!==0?diffLabel:'—')}</div>
        </div>
      </div>
      <!-- Progress bar removed -->
      <!-- Dates & actions -->
      <div style="padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div style="font-size:11px;color:var(--txt3);">
          ${a.rdate?`<span>📋 ขอ ${fd(a.rdate)}</span> `:''}
          ${a.ddate?`<span style="${ov?'color:var(--coral);font-weight:700':''}">⏰ ครบ ${fd(a.ddate)}${ov?' ⚠️':''}</span>`:''}
        </div>
        <div style="display:flex;gap:4px;" onclick="event.stopPropagation()">
          ${window.canEdit('advance')?`<button class="btn btn-ghost btn-sm" onclick="window.openAdvModal('${a.id}')">✏️</button>`:''}
          ${window.canDel('advance')&&a.status==='draft'?`<button class="btn btn-red btn-sm" onclick="window.askDel('advance','${a.id}','${esc(a.purpose)}')">🗑</button>`:''}
        </div>
      </div>
    </div>`;
  }).join('');
}



window.openAdvModal=function(id){
  window.editAid=id;var a=id?window.ADVANCES.find(function(x){return x.id===id;}):null;
  document.getElementById('m-adv-title').textContent=a?'แก้ไข Advance':'New Advance';
  var status=a?a.status:'draft';var ai=window.AFLW.findIndex(function(s){return s.id===status;});var isClr=status==='clearing'||status==='cleared';
  var today=new Date();today.setHours(0,0,0,0);
  var EXCL_GRPS=['GRP17733355541905','GRP17733355541906'];
  var clearedPids=new Set(window.ADVANCES.filter(adv=>adv.status==='cleared').map(adv=>adv.pid));
  var availProjects=window.PROJECTS.filter(function(p){
    if(EXCL_GRPS.includes(p.groupId))return false;
    if(!p.end||pd(p.end)<today)return false;
    if(p.groupId!=='GRP17733355541902'&&clearedPids.has(p.id))return false;
    return true;
  });
  var curPid=a?a.pid:'';
  var curP2=curPid?window.PROJECTS.find(x=>x.id===curPid):null;
  if(curPid&&curP2&&!availProjects.find(x=>x.id===curPid))availProjects.unshift(curP2);
  var pOpts=availProjects.map(p=>`<option value="${esc(p.id)}"${curPid===p.id?' selected':''}>${esc(p.name)}</option>`).join('');
  var stepHtml=`<div class="adv-stepper">`+window.AFLW.map(function(s,i){var done=i<ai,active=i===ai;return`<div class="adv-s${done?' done':''}${active?' active':''}"><div class="adv-dot">${done?'✓':i+1}</div><div class="adv-lbl" style="color:${active?s.color:done?s.color:'var(--txt3)'}">${s.label}</div></div>`;}).join('')+`</div>`;
  if(a&&window.canEdit('advance')){var diff2=a.amount-(a.cleared||0);if(isClr&&diff2!==0){stepHtml+=`<div style="display:flex;justify-content:space-between;padding:10px 14px;background:${diff2>0?'rgba(255,107,107,.08)':'rgba(255,166,43,.08)'};border:1px solid ${diff2>0?'rgba(255,107,107,.2)':'rgba(255,166,43,.2)'};border-radius:10px;margin-bottom:14px;font-size:13px"><span style="font-weight:600">ส่วนต่าง</span><span style="font-weight:700;color:${diff2>0?'var(--coral)':'var(--amber)'}">${fca(Math.abs(diff2))}</span></div>`;}
  var btnPrev=window.APRV[status]?`<button class="btn btn-ghost btn-sm" onclick="window.advStep('prev')">‹ ย้อนกลับ</button>`:'';var btnNext=window.ANXT[status]?`<button class="btn btn-pri btn-sm" onclick="window.advStep('next')">ขั้นถัดไป ›</button>`:'';stepHtml+=`<div style="display:flex;gap:8px;margin-bottom:18px">${btnPrev}${btnNext}</div>`;}
  var isFullCleared = isClr;
  var clearedSect = isFullCleared && window.canEdit('advance') ? window.advBuildClearedSection(a, curPid) : '';
  document.getElementById('m-adv-body').innerHTML=stepHtml+`<input type="hidden" id="af-status" value="${status}"><div class="f-group"><label class="f-label">โครงการ</label><select class="f-input" id="af-pid" onchange="window.advOnProjectChange()" ${window.canEdit('advance')?'':'disabled'}><option value="">-- เลือกโครงการ --</option>${pOpts}</select></div><div class="f-grid"><div class="f-group"><label class="f-label">เลขที่ Advance</label><input class="f-input" id="af-advno" value="${esc(a?a.advno:'')}" placeholder="เช่น ADV-001" ${window.canEdit('advance')?'':'disabled'}></div><div class="f-group"><label class="f-label">วัตถุประสงค์ *</label><select class="f-input" id="af-purpose" ${window.canEdit('advance')?'':'disabled'}><option value="">-- เลือกวัตถุประสงค์ --</option><option value="เพื่อใช้ในการติดตั้งระบบ"${a&&a.purpose==='เพื่อใช้ในการติดตั้งระบบ'?' selected':''}>เพื่อใช้ในการติดตั้งระบบ</option><option value="เพื่อใช้ในการเข้า Revisit"${a&&a.purpose==='เพื่อใช้ในการเข้า Revisit'?' selected':''}>เพื่อใช้ในการเข้า Revisit</option><option value="เพื่อใช้ในการดูแลหลังการขาย (MA)"${a&&a.purpose==='เพื่อใช้ในการดูแลหลังการขาย (MA)'?' selected':''}>เพื่อใช้ในการดูแลหลังการขาย (MA)</option></select></div></div><div class="f-grid"><div class="f-group"><label class="f-label">จำนวนเบิก (฿)</label><input type="text" inputmode="decimal" class="f-input" id="af-amount" value="${a?Number(a.amount).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):''}" onblur="window.advFmtAmt(this)" onfocus="window.advUnfmtAmt(this)" style="text-align:right;" ${window.canEdit('advance')?'':'disabled'}></div>${isClr?`<div class="f-group"><label class="f-label">จ่ายจริง (฿) <span style="font-size:10px;color:var(--txt3)">(auto จากรายการค่าใช้จ่าย ไม่รวมค่าแรง)</span></label><input type="text" class="f-input" id="af-cleared" value="${a?Number(a.cleared).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):''}" readonly style="background:var(--surface2);cursor:not-allowed;text-align:right;"></div>`:''}<div class="f-group"><label class="f-label">วันที่ขอ</label><input type="date" class="f-input" id="af-rdate" value="${a?a.rdate:''}" ${window.canEdit('advance')?'':'disabled'}></div><div class="f-group"><label class="f-label">กำหนดเคลียร์</label><input type="date" class="f-input" id="af-ddate" value="${a?a.ddate:''}" ${window.canEdit('advance')?'':'disabled'}></div></div><div class="f-group"><label class="f-label">หมายเหตุ</label><textarea class="f-input" id="af-note" ${window.canEdit('advance')?'':'disabled'}>${esc(a?a.note:'')}</textarea></div>${clearedSect}`;
  document.getElementById('m-adv-foot').style.display=window.canEdit('advance')?'':'none';window.openM('m-adv');
  // init expense + labor rows after DOM ready
  if(isFullCleared && window.canEdit('advance')) {
    _expRows = []; _laborRows = [];
    var existExp = a ? a.expenseItems : [];
    var existLab = a ? a.laborItems  : [];
    if(existExp && existExp.length) { existExp.forEach(function(it){window.advAddExpRow(it);}); }
    else { window.advAddExpRow(null); }
    var isBorder = !!(document.getElementById('adv-labor-border')||{}).checked;
    // fallback: ใช้วัน rdate/ddate ของ advance ถ้า member ไม่มีวันกำหนด
    var advStart = (document.getElementById('af-rdate')||{}).value||'';
    var advEnd   = (document.getElementById('af-ddate')||{}).value||'';
    window.advInitLaborTable(curPid, advStart, advEnd, isBorder, existLab.length ? existLab : null);
    window.advCalcTotal();
  }
}

window.advStep=async function(dir){
  if(!window.canEdit('advance'))return;if(!window.auth.currentUser)return;
  var sEl=document.getElementById('af-status');if(!sEl)return;
  var cur=sEl.value;var nxt=dir==='next'?window.ANXT[cur]:window.APRV[cur];if(!nxt)return;
  if(window.editAid){let a=window.ADVANCES.find(x=>x.id===window.editAid);if(a){a.status=nxt;window.renderAdvance();window.renderOverview();window.updateBadge();window.openAdvModal(window.editAid);setDoc(getDocRef('ADVANCES',a.id),{status:nxt},{merge:true}).catch(e=>window.showDbError(e));}}
}

window.saveAdvance=async function(){
  if(!window.canEdit('advance'))return;if(!window.auth.currentUser)return;
  var pur=(document.getElementById('af-purpose')||{}).value||'';if(!pur.trim())return;
  var isNew=!window.editAid;
  var aid=window.editAid||'A'+Date.now();
  var finalPid=document.getElementById('af-pid').value.trim();
  var status=document.getElementById('af-status').value;
  var hasItemsSection = status==='clearing' || status==='cleared';
  var expItems  = hasItemsSection ? window.advGetExpItems()  : [];
  var labItems  = hasItemsSection ? window.advGetLaborItems(): [];
  var cleared   = parseFloat(((document.getElementById('af-cleared')||{}).value||'').replace(/,/g,''))||0;
  let dbAdv={advance_id:aid,project_id:finalPid,purpose:pur.trim(),amount_requested:parseFloat((document.getElementById('af-amount').value||'').replace(/,/g,''))||0,amount_cleared:cleared,request_date:document.getElementById('af-rdate').value,due_date:document.getElementById('af-ddate').value,status:status,note:document.getElementById('af-note').value,advance_no:(document.getElementById('af-advno')||{}).value||'',expense_items:expItems,labor_items:labItems};
  window.closeM('m-adv');
  try {
    await setDoc(getDocRef('ADVANCES',aid),dbAdv);
    window._applyLocalDoc('ADVANCES',aid,dbAdv);
    window.renderAdvance&&window.renderAdvance();
    window.renderOverview&&window.renderOverview();
    window.updateBadge&&window.updateBadge();
    if(status==='cleared') await window.advSyncCosts(aid, finalPid, pur.trim(), dbAdv);
    // แจ้งเตือน Advance บันทึก/อัปเดต
    if(window.sendAdvanceSavedNotify){
      var advObj={pid:finalPid,status:status,advno:dbAdv.advance_no,amount:dbAdv.amount_requested,cleared:dbAdv.amount_cleared};
      window.sendAdvanceSavedNotify(advObj,isNew);
    }
  } catch(e){ window.showDbError(e); }
}

window.advSyncCosts = async function(aid, pid, purpose, dbAdv) {
  var batch    = writeBatch();
  var costDate = dbAdv.due_date || dbAdv.request_date || new Date().toISOString().slice(0,10);
  var advno    = dbAdv.advance_no || aid;

  // ลบ COSTS เก่าที่มาจาก advance นี้ (batch delete)
  window.COSTS.filter(function(c){return c.advanceId===aid;})
    .forEach(function(c){ batch.delete(getDocRef('COSTS', c.id)); });

  // expense items → COSTS
  (dbAdv.expense_items||[]).forEach(function(it,i){
    if(!it.amount||it.amount<=0) return;
    batch.set(getDocRef('COSTS','CST-'+aid+'-E'+i), {
      cost_id:    'CST-'+aid+'-E'+i,
      project_id: pid,
      staff_id:   '',
      category:   it.category,
      amount:     it.amount,
      cost_date:  costDate,
      description:it.description+' [เบิก: '+purpose+']',
      receipt_no: advno,
      source:     'advance',
      advance_id: aid
    });
  });

  // labor items → COSTS (ค่าแรง + เบี้ยเลี้ยง แยก row)
  (dbAdv.labor_items||[]).filter(function(it){return it.included&&it.staffId;}).forEach(function(it,i){
    if(it.laborCost>0) batch.set(getDocRef('COSTS','CST-'+aid+'-L'+i+'a'), {
      cost_id:    'CST-'+aid+'-L'+i+'a',
      project_id: pid,
      staff_id:   it.staffId,
      category:   'labor',
      amount:     it.laborCost,
      cost_date:  costDate,
      description:'ค่าแรง '+(it.workDays+it.holidayDays)+' วัน'+(it.leaveDays>0?' (หักลา '+it.leaveDays+' วัน)':'')+' [เบิก: '+purpose+']',
      receipt_no: advno,
      source:     'advance',
      advance_id: aid
    });
    if(it.allowanceCost>0) batch.set(getDocRef('COSTS','CST-'+aid+'-L'+i+'b'), {
      cost_id:    'CST-'+aid+'-L'+i+'b',
      project_id: pid,
      staff_id:   it.staffId,
      category:   'allowance',
      amount:     it.allowanceCost,
      cost_date:  costDate,
      description:'เบี้ยเลี้ยง '+(it.workDays+it.holidayDays)+' วัน'+(it.isBorder?' (ชายแดน)':'')+(it.leaveDays>0?' (หักลา '+it.leaveDays+' วัน)':'')+' [เบิก: '+purpose+']',
      receipt_no: advno,
      source:     'advance',
      advance_id: aid
    });
  });

  await batch.commit();
  // Optimistic local sync: remove old advance-sourced costs, push new ones
  window.COSTS = (window.COSTS||[]).filter(function(c){return c.advanceId!==aid;});
  var costDate = dbAdv.due_date||dbAdv.request_date||new Date().toISOString().slice(0,10);
  var advno = dbAdv.advance_no||aid;
  (dbAdv.expense_items||[]).forEach(function(it,i){
    if(!it.amount||it.amount<=0)return;
    window._applyLocalDoc('COSTS','CST-'+aid+'-E'+i,{cost_id:'CST-'+aid+'-E'+i,project_id:pid,staff_id:'',category:it.category,amount:it.amount,cost_date:costDate,description:it.description+' [เบิก: '+purpose+']',receipt_no:advno,source:'advance',advance_id:aid});
  });
  (dbAdv.labor_items||[]).filter(function(it){return it.included&&it.staffId;}).forEach(function(it,i){
    if(it.laborCost>0) window._applyLocalDoc('COSTS','CST-'+aid+'-L'+i+'a',{cost_id:'CST-'+aid+'-L'+i+'a',project_id:pid,staff_id:it.staffId,category:'labor',amount:it.laborCost,cost_date:costDate,description:'ค่าแรง [เบิก: '+purpose+']',receipt_no:advno,source:'advance',advance_id:aid});
    if(it.allowanceCost>0) window._applyLocalDoc('COSTS','CST-'+aid+'-L'+i+'b',{cost_id:'CST-'+aid+'-L'+i+'b',project_id:pid,staff_id:it.staffId,category:'allowance',amount:it.allowanceCost,cost_date:costDate,description:'เบี้ยเลี้ยง [เบิก: '+purpose+']',receipt_no:advno,source:'advance',advance_id:aid});
  });
  window.renderCost&&window.renderCost();
}

// ── EXPENSE ITEMS (หมวดค่าใช้จ่าย) ────────────────────────────────────────────
var _EXP_CATS = [
  {k:'phone',l:'📱 ค่าโทรศัพท์'},{k:'travel',l:'🚗 ค่าเดินทาง'},{k:'postal',l:'📮 ค่าไปรษณีย์'},
  {k:'taxi',l:'🚕 ค่าแท็กซี่'},{k:'fuel',l:'⛽ ค่าน้ำมัน'},{k:'toll',l:'🛣️ ค่าทางด่วน'},
  {k:'food',l:'🍱 ค่าอาหาร'},{k:'lodging',l:'🏨 ค่าที่พัก'},{k:'stationery',l:'🖨️ เครื่องเขียนแบบพิมพ์'},{k:'other',l:'📝 อื่นๆ'}
];
var _expRows = [];

window.advAddExpRow = function(item) {
  var rowId = 'exp-' + Date.now() + Math.random().toString(36).slice(2,5);
  _expRows.push(rowId);
  var catOpts = `<option value="">-- ระบุหมวด --</option>`+_EXP_CATS.map(function(c){return`<option value="${c.k}"${item&&item.category===c.k?' selected':''}>${c.l}</option>`;}).join('');
  var row = document.createElement('div');
  row.id = rowId;
  row.style.cssText = 'display:grid;grid-template-columns:1.4fr 1.8fr 1fr auto;gap:6px;align-items:center;margin-bottom:6px;';
  var amtVal = (item&&item.amount) ? Number(item.amount).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '';
  row.innerHTML = `<select class="f-input" id="${rowId}-cat" style="font-size:12px;padding:6px 8px;">${catOpts}</select>
    <input class="f-input" id="${rowId}-desc" placeholder="รายละเอียด" value="${esc(item?item.description:'')}" style="font-size:12px;padding:6px 8px;">
    <input type="text" inputmode="decimal" class="f-input" id="${rowId}-amt" placeholder="0.00" value="${amtVal}" oninput="window.advCalcTotal()" onblur="window.advFmtAmt(this)" onfocus="window.advUnfmtAmt(this)" style="font-size:12px;padding:6px 8px;text-align:right;">
    <button class="btn btn-red btn-sm" onclick="window.advDelExpRow('${rowId}')" style="padding:4px 8px;">✕</button>`;
  document.getElementById('adv-exp-body').appendChild(row);
  window.advCalcTotal();
};

window.advDelExpRow = function(rowId) {
  var el = document.getElementById(rowId);
  if(el) el.remove();
  _expRows = _expRows.filter(function(r){return r!==rowId;});
  window.advCalcTotal();
};

window.advFmtAmt = function(el) {
  var n = parseFloat((el.value||'').replace(/,/g,''));
  el.value = isNaN(n) ? '' : n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  window.advCalcTotal();
};
window.advUnfmtAmt = function(el) {
  var n = parseFloat((el.value||'').replace(/,/g,''));
  el.value = isNaN(n) ? '' : n.toFixed(2);
};

window.advGetExpItems = function() {
  return _expRows.filter(function(r){return document.getElementById(r);}).map(function(r){
    return {
      category: document.getElementById(r+'-cat').value,
      description: document.getElementById(r+'-desc').value.trim(),
      amount: parseFloat((document.getElementById(r+'-amt').value||'').replace(/,/g,''))||0
    };
  }).filter(function(x){return x.amount>0;});
};

// ── LABOR ITEMS (ค่าแรง + เบี้ยเลี้ยง) ────────────────────────────────────────
var _laborRows = [];

window.advInitLaborTable = function(pid, workStart, workEnd, isBorder, existingItems) {
  _laborRows = [];
  var tbody = document.getElementById('adv-labor-body');
  if(!tbody) return;
  tbody.innerHTML = '';
  var proj = window.PROJECTS.find(function(p){return p.id===pid;});
  var mems = proj ? (proj.members&&proj.members.length ? proj.members : (proj.team||[]).map(function(sid){return{sid:sid};})) : [];
  var visits = proj && Array.isArray(proj.visits)
    ? proj.visits.filter(function(v){ return v.start && v.end && v.team && v.team.length; })
    : [];

  if(existingItems && existingItems.length > 0) {
    existingItems.forEach(function(it){
      var enriched = it;
      if(!it.workStart || !it.workEnd) {
        var ms = '', me = '', visitLabel = '';
        // หาวันจาก visit ที่มีคนนี้อยู่ก่อน
        if(visits.length) {
          var v = visits.find(function(v){ return window._vtMember(v.team, it.staffId, v.start, v.end); });
          if(v){ var vm=window._vtMember(v.team,it.staffId,v.start,v.end); ms=vm.s; me=vm.e; visitLabel=v.no?'ช่วงที่ '+v.no:''; }
        }
        if(!ms || !me) {
          var mem = mems.find(function(m){ return m.sid === it.staffId; });
          ms = (mem && mem.s) || workStart || '';
          me = (mem && mem.e) || workEnd   || '';
        }
        if(ms && me) {
          var info = window.countLaborDaysInfo ? window.countLaborDaysInfo(it.staffId, ms, me) : {workDays:0, holidayDays:0, leaveDays:0};
          // holidayDays: ใช้ค่าที่บันทึกไว้ก่อน ถ้ายังไม่เคยบันทึกให้เริ่มที่ 0 (user กรอกเอง)
          var savedHd = it.holidayDays != null ? it.holidayDays : 0;
          enriched = Object.assign({}, it, { workStart:ms, workEnd:me, workDays:info.workDays, holidayDays:savedHd, leaveDays:info.leaveDays, visitLabel:visitLabel });
        }
      }
      window.advAddLaborRow(enriched, 0, isBorder);
    });
  } else if(visits.length > 0) {
    // มี visits → 1 แถวต่อคนต่อช่วง
    visits.forEach(function(v){
      var visitLabel = v.no ? 'ช่วงที่ '+v.no : '';
      window._vtMembers(v.team, v.start, v.end).forEach(function(mem){
        if(!mem.sid) return;
        var info = window.countLaborDaysInfo(mem.sid, mem.s, mem.e);
        // holidayDays เริ่มที่ 0 — user กรอกเองว่าทำงานวันหยุดกี่วัน
        window.advAddLaborRow({staffId:mem.sid, workStart:mem.s, workEnd:mem.e, workDays:info.workDays, holidayDays:0, leaveDays:info.leaveDays, dailyRate:null, included:true, visitLabel:visitLabel}, info.workDays, isBorder);
      });
    });
  } else {
    // ปกติ: ใช้ members
    mems.forEach(function(m){
      var ms = m.s || workStart || '';
      var me = m.e || workEnd   || '';
      var info = (ms && me) ? window.countLaborDaysInfo(m.sid, ms, me) : {workDays:0, holidayDays:0, leaveDays:0};
      // holidayDays เริ่มที่ 0 — user กรอกเองว่าทำงานวันหยุดกี่วัน
      window.advAddLaborRow({staffId:m.sid, workStart:ms, workEnd:me, workDays:info.workDays, holidayDays:0, leaveDays:info.leaveDays, dailyRate:null, included:true}, info.workDays, isBorder);
    });
  }
  window.advCalcTotal();
};

window.advAddLaborRow = function(item, defaultWorkDays, isBorder) {
  var rowId = 'lab-' + Date.now() + Math.random().toString(36).slice(2,5);
  _laborRows.push(rowId);
  var staffOpts = window.STAFF.filter(function(s){return s.active!==false;}).map(function(s){
    return`<option value="${s.id}"${item&&item.staffId===s.id?' selected':''}>${esc(s.name)}${s.nickname?' ('+esc(s.nickname)+')':''}</option>`;
  }).join('');
  var sid       = item ? item.staffId : '';
  var rate      = item&&item.dailyRate!=null ? item.dailyRate : (sid ? window.getStaffDailyRate(sid) : 0);
  var wStart    = item&&item.workStart ? item.workStart : '';
  var wEnd      = item&&item.workEnd   ? item.workEnd   : '';
  var wDays     = item&&item.workDays!=null ? item.workDays : (defaultWorkDays||0);
  var hDays     = item&&item.holidayDays!=null ? item.holidayDays : 0;
  var leaveDays = item&&item.leaveDays!=null ? item.leaveDays : 0;
  var included  = item&&item.included===false ? false : true;
  var leaveNote   = leaveDays > 0 ? `&nbsp;<span style="color:var(--amber);font-weight:700;">(หักลา&nbsp;${leaveDays}&nbsp;วัน)</span>` : '';
  var visitLbl    = (item&&item.visitLabel) ? `<span style="color:var(--violet);font-weight:700;">[${esc(item.visitLabel)}]&nbsp;</span>` : '';
  var dateLabel   = (wStart&&wEnd) ? `<div style="font-size:9px;color:var(--txt3);margin-top:2px;padding:0 2px;">${visitLbl}${fd(wStart)}&nbsp;–&nbsp;${fd(wEnd)}&nbsp;·&nbsp;<b>${wDays}&nbsp;วัน</b>${leaveNote}</div>` : '';
  var tbody = document.getElementById('adv-labor-body');
  var row = document.createElement('tr');
  row.id = rowId;
  row.innerHTML = `
    <td style="padding:5px 4px;text-align:center;">
      <input type="checkbox" id="${rowId}-inc" ${included?'checked':''} onchange="window.advCalcTotal()" style="width:15px;height:15px;accent-color:var(--violet);cursor:pointer;">
    </td>
    <td style="padding:4px;">
      <select class="f-input" id="${rowId}-sid" onchange="window.advLaborStaffChange('${rowId}')" style="font-size:11px;padding:5px 6px;">
        <option value="">-- เลือก --</option>${staffOpts}
      </select>
      <input type="hidden" id="${rowId}-ld" value="${leaveDays}">
      ${dateLabel}
    </td>
    <td style="padding:4px;">
      <input type="text" inputmode="decimal" class="f-input" id="${rowId}-rate" value="${rate?Number(rate).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):''}" placeholder="฿/วัน" oninput="window.advCalcLaborRow('${rowId}')" onblur="window.advFmtAmt(this)" onfocus="window.advUnfmtAmt(this)" style="font-size:11px;padding:5px 6px;text-align:right;width:90px;">
    </td>
    <td style="padding:4px;text-align:center;">
      <input type="number" class="f-input" id="${rowId}-wd" value="${wDays}" min="0" oninput="window.advCalcLaborRow('${rowId}')" style="font-size:11px;padding:5px 4px;text-align:center;width:55px;">
    </td>
    <td style="padding:4px;text-align:center;">
      <input type="number" class="f-input" id="${rowId}-hd" value="${hDays}" min="0" oninput="window.advCalcLaborRow('${rowId}')" style="font-size:11px;padding:5px 4px;text-align:center;width:50px;" title="วันหยุดที่ทำงาน">
    </td>
    <td id="${rowId}-labor" style="padding:4px;text-align:right;font-weight:700;color:var(--violet);white-space:nowrap;">—</td>
    <td id="${rowId}-allw"  style="padding:4px;text-align:right;font-weight:700;color:var(--teal);white-space:nowrap;">—</td>
    <td id="${rowId}-total" style="padding:4px;text-align:right;font-weight:800;color:var(--txt);white-space:nowrap;">—</td>
    <td style="padding:4px;text-align:center;">
      <button class="btn btn-red btn-sm" onclick="window.advDelLaborRow('${rowId}')" style="padding:3px 6px;font-size:11px;">✕</button>
    </td>`;
  tbody.appendChild(row);
  window.advCalcLaborRow(rowId);
};

window.advLaborStaffChange = function(rowId) {
  var sid = document.getElementById(rowId+'-sid').value;
  var rate = sid ? window.getStaffDailyRate(sid) : 0;
  var rateEl = document.getElementById(rowId+'-rate');
  if(rateEl && rate > 0) rateEl.value = Number(rate).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  window.advCalcLaborRow(rowId);
};


window.advCalcLaborRow = function(rowId) {
  var isBorder = !!(document.getElementById('adv-labor-border')||{}).checked;
  var rate  = parseFloat(((document.getElementById(rowId+'-rate')||{}).value||'').replace(/,/g,''))||0;
  var wDays = parseInt((document.getElementById(rowId+'-wd')||{}).value)||0;
  var hDays = parseInt((document.getElementById(rowId+'-hd')||{}).value)||0;
  var labor = (wDays + hDays) * rate;
  var allwW = wDays * window.getAllowanceRate(isBorder, false);
  var allwH = hDays * window.getAllowanceRate(isBorder, true);
  var allw  = allwW + allwH;
  var total = labor + allw;
  var inc = !!(document.getElementById(rowId+'-inc')||{}).checked;
  var dim = inc ? '' : ';opacity:.4';
  var lEl = document.getElementById(rowId+'-labor');
  var aEl = document.getElementById(rowId+'-allw');
  var tEl = document.getElementById(rowId+'-total');
  if(lEl) lEl.innerHTML = `<span style="font-size:11px${dim}">${fca(labor)}</span>`;
  if(aEl) aEl.innerHTML = `<span style="font-size:11px${dim}">${fca(allw)}</span>`;
  if(tEl) tEl.innerHTML = `<span style="font-size:12px;font-weight:800${dim}">${fca(total)}</span>`;
  window.advCalcTotal();
};

window.advDelLaborRow = function(rowId) {
  var el = document.getElementById(rowId);
  if(el) el.remove();
  _laborRows = _laborRows.filter(function(r){return r!==rowId;});
  window.advCalcTotal();
};

window.advGetLaborItems = function() {
  var isBorder = !!(document.getElementById('adv-labor-border')||{}).checked;
  return _laborRows.filter(function(r){return document.getElementById(r);}).map(function(r){
    var rate  = parseFloat((document.getElementById(r+'-rate').value||'').replace(/,/g,''))||0;
    var wDays = parseInt(document.getElementById(r+'-wd').value)||0;
    var hDays = parseInt(document.getElementById(r+'-hd').value)||0;
    return {
      staffId:      document.getElementById(r+'-sid').value,
      dailyRate:    rate,
      workDays:     wDays,
      holidayDays:  hDays,
      included:     !!(document.getElementById(r+'-inc')||{}).checked,
      isBorder:     isBorder,
      leaveDays:    parseInt((document.getElementById(r+'-ld')||{}).value)||0,
      laborCost:    (wDays+hDays)*rate,
      allowanceCost:wDays*window.getAllowanceRate(isBorder,false) + hDays*window.getAllowanceRate(isBorder,true)
    };
  });
};

window.advCalcTotal = function() {
  var expTotal = (_expRows||[]).reduce(function(s,r){
    var el=document.getElementById(r+'-amt');return s+(el?parseFloat((el.value||'').replace(/,/g,''))||0:0);
  },0);
  var laborTotal = 0, allwTotal = 0;
  _laborRows.forEach(function(r){
    if(!document.getElementById(r)) return;
    var inc = !!(document.getElementById(r+'-inc')||{}).checked;
    if(!inc) return;
    var rate  = parseFloat(((document.getElementById(r+'-rate')||{}).value||'').replace(/,/g,''))||0;
    var wDays = parseInt((document.getElementById(r+'-wd')||{}).value)||0;
    var hDays = parseInt((document.getElementById(r+'-hd')||{}).value)||0;
    var isBorder = !!(document.getElementById('adv-labor-border')||{}).checked;
    laborTotal += (wDays+hDays)*rate;
    allwTotal  += wDays*window.getAllowanceRate(isBorder,false) + hDays*window.getAllowanceRate(isBorder,true);
  });
  var grandTotal = expTotal + laborTotal + allwTotal;
  var clEl = document.getElementById('af-cleared');
  if(clEl) clEl.value = expTotal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  var sumEl = document.getElementById('adv-cost-summary');
  if(sumEl) sumEl.innerHTML = [
    {l:'ค่าใช้จ่ายทั่วไป',v:expTotal,c:'var(--indigo)'},
    {l:'ค่าแรง',v:laborTotal,c:'var(--violet)'},
    {l:'เบี้ยเลี้ยง',v:allwTotal,c:'var(--teal)'},
    {l:'รวมทั้งสิ้น',v:grandTotal,c:'var(--txt)',bold:true}
  ].map(function(s){
    return`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;">
      <span style="color:var(--txt2);font-weight:${s.bold?'700':'500'}">${s.l}</span>
      <span style="font-weight:${s.bold?'800':'700'};color:${s.c};">${fca(s.v)}</span></div>`;
  }).join('');
};

// ── BUILD CLEARED SECTION HTML ────────────────────────────────────────────────
window.advBuildClearedSection = function(a, pid) {
  var proj = pid ? window.PROJECTS.find(function(p){return p.id===pid;}) : null;
  var isBorder = !!(proj&&proj.isBorder);
  var workStart = a ? a.rdate : '';
  var workEnd   = a ? a.ddate : '';
  var catOpts = _EXP_CATS.map(function(c){return`<option value="${c.k}">${c.l}</option>`;}).join('');
  var st = window.SETTINGS;
  var rateNote = isBorder
    ? `📍 ชายแดน: วันทำงาน ${fca(st.allowance_weekday_border)}/วัน | วันหยุด ${fca(st.allowance_holiday_border)}/วัน`
    : `พื้นที่ปกติ: วันทำงาน ${fca(st.allowance_weekday_normal)}/วัน | วันหยุด ${fca(st.allowance_holiday_normal)}/วัน`;
  return `
  <!-- EXPENSE ITEMS -->
  <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;">
    <div style="font-size:13px;font-weight:700;color:var(--indigo);margin-bottom:10px;">🧾 รายการค่าใช้จ่าย</div>
    <div style="display:grid;grid-template-columns:1.4fr 1.8fr 1fr auto;gap:6px;margin-bottom:6px;">
      <span style="font-size:10px;color:var(--txt3);font-weight:600;">หมวด</span>
      <span style="font-size:10px;color:var(--txt3);font-weight:600;">รายละเอียด</span>
      <span style="font-size:10px;color:var(--txt3);font-weight:600;text-align:right;">จำนวนเงิน</span>
      <span></span>
    </div>
    <div id="adv-exp-body"></div>
    <button class="btn btn-ghost btn-sm" onclick="window.advAddExpRow(null)" style="margin-top:6px;font-size:11px;">+ เพิ่มรายการ</button>
  </div>

  <!-- LABOR ITEMS -->
  <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
      <span style="font-size:13px;font-weight:700;color:var(--violet);">👷 ค่าแรง + เบี้ยเลี้ยง</span>
      <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--txt2);cursor:pointer;margin-left:auto;">
        <input type="checkbox" id="adv-labor-border" ${isBorder?'checked':''} onchange="window.advLaborBorderChange()" style="accent-color:var(--coral);">
        📍 พื้นที่ชายแดน
      </label>
    </div>
    <div style="font-size:10px;color:var(--txt3);margin-bottom:8px;padding:5px 8px;background:var(--surface);border-radius:6px;" id="adv-border-note">${rateNote}</div>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="border-bottom:2px solid var(--border);background:var(--surface);">
            <th style="padding:5px 4px;text-align:center;width:28px;">✓</th>
            <th style="padding:5px 6px;text-align:left;min-width:150px;">พนักงาน</th>
            <th style="padding:5px 4px;text-align:right;white-space:nowrap;min-width:80px;">฿/วัน</th>
            <th style="padding:5px 4px;text-align:center;white-space:nowrap;min-width:56px;">วันทำงาน</th>
            <th style="padding:5px 4px;text-align:center;white-space:nowrap;min-width:56px;" title="กรอกเองว่าทำงานวันหยุดกี่วัน">วันหยุด <span style="font-size:9px;font-weight:400;color:var(--txt3);">(กรอกเอง)</span></th>
            <th style="padding:5px 4px;text-align:right;white-space:nowrap;">ค่าแรง</th>
            <th style="padding:5px 4px;text-align:right;white-space:nowrap;">เบี้ยเลี้ยง</th>
            <th style="padding:5px 4px;text-align:right;white-space:nowrap;">รวม</th>
            <th style="width:28px;"></th>
          </tr>
        </thead>
        <tbody id="adv-labor-body"></tbody>
      </table>
    </div>
    <button class="btn btn-ghost btn-sm" onclick="window.advAddLaborRow({workDays:0,holidayDays:0,included:true},0,!!(document.getElementById('adv-labor-border')||{}).checked)" style="margin-top:8px;font-size:11px;">+ เพิ่มพนักงาน</button>
  </div>

  <!-- SUMMARY -->
  <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px;">
    <div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:10px;">💰 สรุปค่าใช้จ่าย</div>
    <div id="adv-cost-summary"></div>
  </div>`;
};


window.advLaborBorderChange = function() {
  var isBorder = !!(document.getElementById('adv-labor-border')||{}).checked;
  var noteEl = document.getElementById('adv-border-note');
  var st = window.SETTINGS;
  if(noteEl) noteEl.textContent = isBorder
    ? `📍 ชายแดน: วันทำงาน ${fca(st.allowance_weekday_border)}/วัน | วันหยุด ${fca(st.allowance_holiday_border)}/วัน`
    : `พื้นที่ปกติ: วันทำงาน ${fca(st.allowance_weekday_normal)}/วัน | วันหยุด ${fca(st.allowance_holiday_normal)}/วัน`;
  _laborRows.forEach(function(r){window.advCalcLaborRow(r);});
  window.advCalcTotal();
};

window.advCalcDueDate=function(endDateStr){
  if(!endDateStr)return'';
  var d=pd(endDateStr);d.setDate(d.getDate()+7);
  for(var i=0;i<20;i++){
    var dow=d.getDay();
    var ds=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    var isHol=window.HOLIDAYS.some(function(h){return h.date===ds;});
    if(dow!==0&&dow!==6&&!isHol)break;
    d.setDate(d.getDate()+1);
  }
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
};

window.advOnProjectChange=function(){
  var pid=(document.getElementById('af-pid')||{}).value||'';
  var ddEl=document.getElementById('af-ddate');if(!ddEl)return;
  if(!pid){return;}
  var proj=window.PROJECTS.find(function(p){return p.id===pid;});
  if(!proj||!proj.end)return;
  ddEl.value=window.advCalcDueDate(proj.end);
};

