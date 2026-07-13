const { esc, fd, fc, fca, pd, gS, gT, gG, gSt, gC, avC, uid, getFY, getYearBE, getStaffOverlaps, overlapWarnText, getStaffLeaveConflicts, getColRef, getDocRef } = window;
const setDoc = (...a) => window.setDoc(...a);
// ── LODGING ──
window.renderLodging=function(){
  var qf=document.getElementById('ld-q'),yf=document.getElementById('ld-yr'),sf=document.getElementById('ld-status');
  window.msFilter('ld-grp',window.PGROUPS,{placeholder:'ทุกกลุ่มโครงการ',onChange:window.renderLodging});
  window.msFilter('ld-type',window.PTYPES,{placeholder:'ทุกประเภท',onChange:window.renderLodging});
  if(yf&&yf.options.length<=1){[...new Set(window.PROJECTS.map(p=>getYearBE(p.start)).filter(Boolean))].sort((a,b)=>b-a).forEach(y=>{var o=document.createElement('option');o.value=y;o.textContent='ปี พ.ศ. '+y;yf.appendChild(o);});var _cbe=(new Date().getFullYear()+543).toString();if(!yf.value||yf.value==='')yf.value=_cbe;}
  var q=((qf||{}).value||'').toLowerCase(),grp=window.msValues('ld-grp'),typ=window.msValues('ld-type'),yr=(yf||{}).value||'',stFil=(sf||{}).value||'';
  var grouped={};window.LODGINGS.forEach(l=>{if(!grouped[l.pid])grouped[l.pid]=[];grouped[l.pid].push(l);});
  // ── เฉพาะโครงการที่มีที่พักเพิ่มแล้ว ──
  var fProjs=window.PROJECTS.filter(p=>{
    var lds=grouped[p.id]||[];
    if(lds.length===0)return false; // ← ไม่แสดงโครงการที่ยังไม่มีที่พัก
    if(grp.length&&!grp.includes(p.groupId))return false;
    if(typ.length&&!typ.includes(p.typeId))return false;
    if(yr&&getYearBE(p.start)!=yr)return false;
    if(q&&!p.name.toLowerCase().includes(q))return false;
    if(stFil==='approved_daily'&&!lds.some(l=>l.approvedDaily==='yes'))return false;
    if(stFil==='approved_monthly'&&!lds.some(l=>l.approvedMonthly==='yes'))return false;
    if(stFil==='pending'&&lds.some(l=>l.approvedDaily==='yes'||l.approvedMonthly==='yes'))return false;
    return true;
  });
  // ── Sort ──
  var sortV=(document.getElementById('ld-sort')||{}).value||'start_desc';
  fProjs.sort(function(a,b){
    if(sortV==='start_asc')return (a.start||'').localeCompare(b.start||'');
    if(sortV==='name_asc')return (a.name||'').localeCompare(b.name||'','th');
    return (b.start||'').localeCompare(a.start||'');
  });
  // ── Summary bar ──
  var allLds=window.LODGINGS.filter(l=>fProjs.some(p=>p.id===l.pid));
  var approvedDCount=fProjs.filter(p=>(grouped[p.id]||[]).some(l=>l.approvedDaily==='yes')).length;
  var approvedMCount=fProjs.filter(p=>(grouped[p.id]||[]).some(l=>l.approvedMonthly==='yes')).length;
  var pendingCount=fProjs.filter(p=>{var lds=grouped[p.id]||[];return!lds.some(l=>l.approvedDaily==='yes'||l.approvedMonthly==='yes');}).length;
  var budgetD=allLds.filter(l=>l.approvedDaily==='yes').reduce((s,l)=>s+(l.dTotal||0),0);
  var budgetM=allLds.filter(l=>l.approvedMonthly==='yes').reduce((s,l)=>s+(l.mTotal||0),0);
  var bar=document.getElementById('ld-summary-bar');
  if(bar)bar.innerHTML=[
    {icon:'🏨',label:'โครงการมีที่พัก',val:fProjs.length+' โครงการ',c:'var(--violet)'},
    {icon:'📅',label:'อนุมัติรายวัน',val:approvedDCount+' โครงการ · '+fc(budgetD),c:'var(--indigo)'},
    {icon:'📆',label:'อนุมัติรายเดือน',val:approvedMCount+' โครงการ · '+fc(budgetM),c:'var(--coral)'},
    {icon:'⏳',label:'รออนุมัติ',val:pendingCount+' โครงการ',c:'var(--amber)'},
  ].map(s=>`<div style="display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px 16px;flex:1;min-width:160px;">
    <div style="width:36px;height:36px;border-radius:10px;background:${s.c}18;display:flex;align-items:center;justify-content:center;font-size:18px;">${s.icon}</div>
    <div style="min-width:0;"><div style="font-size:10px;color:var(--txt3);font-weight:600;text-transform:uppercase;letter-spacing:.5px;">${s.label}</div>
    <div style="font-size:14px;font-weight:800;color:${s.c};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.val}</div></div>
  </div>`).join('');
  // ── Cards ──
  var cards=document.getElementById('lodging-cards');
  if(!cards)return;
  if(fProjs.length===0){
    cards.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--txt3);">
      <div style="font-size:48px;margin-bottom:12px;">🏨</div>
      <div style="font-size:14px;font-weight:600;">ยังไม่มีข้อมูลที่พัก</div>
      <div style="font-size:12px;margin-top:6px;">กด "+ เพิ่มที่พัก" เพื่อเริ่มต้น</div>
    </div>`;
    return;
  }
  cards.innerHTML=fProjs.map(p=>{
    var lds=grouped[p.id]||[];
    var pt=gT(p.typeId);var pg=gG(p.groupId);
    var appD=lds.find(l=>l.approvedDaily==='yes');
    var appM=lds.find(l=>l.approvedMonthly==='yes');
    var hasAny=appD||appM;
    // status badge
    var badges=[];
    if(appD)badges.push(`<span style="background:#4361ee18;color:var(--indigo);font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;border:1px solid #4361ee30;">✅ รายวัน</span>`);
    if(appM)badges.push(`<span style="background:var(--coral)18;color:var(--coral);font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;border:1px solid var(--coral)30;">✅ รายเดือน</span>`);
    if(!hasAny)badges.push(`<span style="background:var(--amber)18;color:var(--amber);font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;border:1px solid var(--amber)30;">⏳ รออนุมัติ</span>`);
    // budget summary row
    var budgetRow='';
    if(appD||appM){
      var parts=[];
      if(appD&&appD.dTotal>0)parts.push(`<span style="color:var(--indigo);font-weight:700;">📅 ${fc(appD.dTotal)}</span>`);
      if(appM&&appM.mTotal>0)parts.push(`<span style="color:var(--coral);font-weight:700;">📆 ${fc(appM.mTotal)}</span>`);
      if(parts.length)budgetRow=`<div style="display:flex;gap:12px;font-size:11px;">${parts.join('')}</div>`;
    }
    // options — approved first, others collapsible
    var _renderOpt=function(l,i){
      var isAppD=l.approvedDaily==='yes';var isAppM=l.approvedMonthly==='yes';var isAnyApp=isAppD||isAppM;
      var hasDRate=l.dsQty>0||l.ddQty>0||l.dTotal>0;
      var hasMRate=l.msQty>0||l.mdQty>0||l.mTotal>0;
      var amenityD=[],amenityM=[];
      if(l.dBreakfast)amenityD.push('🍳');if(l.dWifi)amenityD.push('📶');if(l.dAc)amenityD.push('❄️');if(l.dTv)amenityD.push('📺');if(l.dFridge)amenityD.push('🧊');if(l.dWasher)amenityD.push('🫧');if(l.dShower)amenityD.push('🚿');if(l.dPillow)amenityD.push('🛌');if(l.dBlanket)amenityD.push('🧣');if(l.dTowel)amenityD.push('🏖️');if(l.dApp)amenityD.push('🔌');if(l.dPark)amenityD.push('🅿️');
      if(l.mWifi)amenityM.push('📶');if(l.mAc)amenityM.push('❄️');if(l.mTv)amenityM.push('📺');if(l.mFridge)amenityM.push('🧊');if(l.mWasher)amenityM.push('🫧');if(l.mShower)amenityM.push('🚿');if(l.mPillow)amenityM.push('🛌');if(l.mBlanket)amenityM.push('🧣');if(l.mBedsheet)amenityM.push('🛏');if(l.mTowel)amenityM.push('🏖️');if(l.mApp)amenityM.push('🔌');if(l.mPark)amenityM.push('🅿️');
      var parsedMapUrl=l.mapUrl?(l.mapUrl.startsWith('http')?l.mapUrl:'https://maps.google.com/?q='+encodeURIComponent(l.mapUrl)):'';
      var appBadges='';
      if(isAppD)appBadges+=`<span style="font-size:9px;font-weight:700;background:#4361ee18;color:var(--indigo);padding:1px 6px;border-radius:8px;border:1px solid #4361ee30;">✅ อนุมัติรายวัน</span> `;
      if(isAppM)appBadges+=`<span style="font-size:9px;font-weight:700;background:var(--coral)18;color:var(--coral);padding:1px 6px;border-radius:8px;border:1px solid var(--coral)30;">✅ อนุมัติรายเดือน</span>`;
      var rateBoxes='';
      if(hasDRate)rateBoxes+=`<div style="flex:1;background:var(--indigo)06;border:1px solid var(--indigo)20;border-radius:8px;padding:8px 10px;">
        <div style="font-size:10px;font-weight:700;color:var(--indigo);margin-bottom:4px;">📅 รายวัน</div>
        ${l.dsQty?`<div style="font-size:10px;color:var(--txt2);">🛏 เดี่ยว ${l.dsQty} ห้อง × ${fc(l.dsRate)}/คืน</div>`:''}
        ${l.ddQty?`<div style="font-size:10px;color:var(--txt2);">🛏🛏 คู่ ${l.ddQty} ห้อง × ${fc(l.ddRate)}/คืน</div>`:''}
        ${amenityD.length?`<div style="font-size:10px;margin-top:3px;">${amenityD.join(' ')}</div>`:''}
        <div style="font-size:12px;font-weight:800;color:var(--indigo);text-align:right;margin-top:4px;">${fc(l.dTotal)}</div>
        ${l.dDeposit?`<div style="font-size:10px;color:var(--txt3);margin-top:3px;padding-top:3px;border-top:1px dashed var(--indigo)20;">🔐 มัดจำ ${fc(l.dDeposit)}${l.dDepositNote?' · '+esc(l.dDepositNote):''}</div>`:''}
        ${window.canEdit('lodging')&&hasDRate?`<div style="margin-top:6px;display:flex;gap:4px;">${!isAppD
          ?`<button onclick="event.stopPropagation();window.approveLdType('${p.id}','${l.id}','daily')" style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;border:1px solid var(--indigo);background:var(--indigo)15;color:var(--indigo);cursor:pointer;flex:1;">✅ อนุมัติรายวัน</button>`
          :`<button onclick="event.stopPropagation();window.unapproveLdType('${p.id}','${l.id}','daily')" style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;border:1px solid var(--coral);background:var(--coral)15;color:var(--coral);cursor:pointer;flex:1;">↩ ยกเลิก</button>`}
        </div>`:''}
      </div>`;
      if(hasMRate)rateBoxes+=`<div style="flex:1;background:var(--coral)06;border:1px solid var(--coral)20;border-radius:8px;padding:8px 10px;">
        <div style="font-size:10px;font-weight:700;color:var(--coral);margin-bottom:4px;">📆 รายเดือน</div>
        ${l.msQty?`<div style="font-size:10px;color:var(--txt2);">🛏 เดี่ยว ${l.msQty} ห้อง × ${fc(l.msRate)}/เดือน</div>`:''}
        ${l.mdQty?`<div style="font-size:10px;color:var(--txt2);">🛏🛏 คู่ ${l.mdQty} ห้อง × ${fc(l.mdRate)}/เดือน</div>`:''}
        ${amenityM.length?`<div style="font-size:10px;margin-top:3px;">${amenityM.join(' ')}</div>`:''}
        <div style="font-size:12px;font-weight:800;color:var(--coral);text-align:right;margin-top:4px;">${fc(l.mTotal)}</div>
        ${(l.mDeposit||l.mInclUtil||l.mWater||l.mElectric||l.mExtras)?`<div style="margin-top:5px;padding-top:5px;border-top:1px dashed var(--coral)25;">
          <div style="font-size:9px;font-weight:700;color:var(--coral);opacity:.7;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px;">📋 ค่าเพิ่มเติม (ไม่นับรวม)</div>
          ${l.mDeposit?`<div style="font-size:10px;color:var(--txt2);">🔐 มัดจำ <b>${fc(l.mDeposit)}</b>${l.mDepositNote?' · '+l.mDepositNote:''}</div>`:''}
          ${l.mInclUtil?'<div style="font-size:10px;color:var(--teal);font-weight:600;">💧⚡ รวมค่าน้ำ-ไฟแล้ว</div>':
            (l.mWater||l.mElectric)?`<div style="font-size:10px;color:var(--txt2);">${l.mWater?'💧 '+l.mWater:''}${l.mWater&&l.mElectric?' · ':''}${l.mElectric?'⚡ '+l.mElectric:''}</div>`:''}
          ${l.mExtras?`<div style="font-size:10px;color:var(--txt2);">📦 ${l.mExtras}</div>`:''}
        </div>`:''}
        ${window.canEdit('lodging')&&hasMRate?`<div style="margin-top:6px;display:flex;gap:4px;">${!isAppM
          ?`<button onclick="event.stopPropagation();window.approveLdType('${p.id}','${l.id}','monthly')" style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;border:1px solid var(--coral);background:var(--coral)15;color:var(--coral);cursor:pointer;flex:1;">✅ อนุมัติรายเดือน</button>`
          :`<button onclick="event.stopPropagation();window.unapproveLdType('${p.id}','${l.id}','monthly')" style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;border:1px solid var(--amber);background:var(--amber)15;color:var(--amber);cursor:pointer;flex:1;">↩ ยกเลิก</button>`}
        </div>`:''}
      </div>`;
      return`<div style="border:2px solid ${isAnyApp?'var(--teal)':'var(--border)'};border-radius:10px;padding:12px;background:${isAnyApp?'#06d6a005':'var(--surface2)'};margin-bottom:8px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;">
          <div>
            <div style="font-size:12px;font-weight:800;margin-bottom:3px;">🏠 ${esc(l.name||'ตัวเลือกที่ '+(i+1))}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:10px;color:var(--txt3);">
              ${l.phone?`<span>📞 <a href="tel:${esc(l.phone)}" style="color:var(--indigo);font-weight:600;">${esc(l.phone)}</a></span>`:''}
              ${parsedMapUrl?`<a href="${parsedMapUrl}" target="_blank" style="color:var(--sky);">📍 แผนที่</a>`:''}
              ${l.checkIn?`<span>📅 ${fd(l.checkIn)}→${fd(l.checkOut)}</span>`:''}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;">
            ${appBadges||'<span style="font-size:9px;color:var(--txt3);">ยังไม่อนุมัติ</span>'}
            ${window.canEdit('lodging')?`<div style="display:flex;gap:4px;margin-top:4px;">
              <button onclick="event.stopPropagation();window.showLdForm('${p.id}','${l.id}')" style="font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);cursor:pointer;">✏️</button>
              <button onclick="event.stopPropagation();window.askDel('lodging','${l.id}','${l.name||'ตัวเลือก '+(i+1)}')" style="font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid var(--coral)30;background:var(--coral)10;color:var(--coral);cursor:pointer;">🗑</button>
            </div>`:''}
          </div>
        </div>
        ${rateBoxes?`<div style="display:flex;gap:8px;">${rateBoxes}</div>`:''}
        ${l.note?`<div style="font-size:10px;color:var(--txt3);margin-top:6px;">📝 ${esc(l.note)}</div>`:''}
      </div>`;
    };
    var _appLds=lds.filter(l=>l.approvedDaily==='yes'||l.approvedMonthly==='yes');
    var _othLds=lds.filter(l=>l.approvedDaily!=='yes'&&l.approvedMonthly!=='yes');
    var optionList;
    if(hasAny&&_othLds.length>0){
      var _appHtml=_appLds.map((l,i)=>_renderOpt(l,i)).join('');
      var _othHtml=_othLds.map((l,i)=>_renderOpt(l,_appLds.length+i)).join('');
      var _tid='ldx'+p.id;
      optionList=_appHtml+`<div style="margin-top:6px;"><button onclick="var d=document.getElementById('${_tid}');var e=d.style.display!=='none';d.style.display=e?'none':'block';this.textContent=e?'▼ ดูตัวเลือกอื่น (${_othLds.length}) · ยังไม่อนุมัติ':'▲ ซ่อนตัวเลือกอื่น';" style="width:100%;padding:5px 10px;border:1px dashed var(--border);border-radius:8px;background:var(--surface2);cursor:pointer;color:var(--txt3);font-size:10px;font-weight:600;margin-bottom:6px;">▼ ดูตัวเลือกอื่น (${_othLds.length}) · ยังไม่อนุมัติ</button><div id="${_tid}" style="display:none;">${_othHtml}</div></div>`;
    } else if(hasAny){
      optionList=_appLds.map((l,i)=>_renderOpt(l,i)).join('');
    } else {
      optionList=lds.map((l,i)=>_renderOpt(l,i)).join('');
    }
    return`<div class="fade" style="background:var(--surface);border:1px solid ${hasAny?'var(--teal)':'var(--border)'};border-radius:16px;overflow:hidden;box-shadow:var(--sh-sm);display:flex;flex-direction:column;${hasAny?'border-width:2px':''}">
      <div style="padding:14px 16px;border-bottom:1px solid var(--border);background:linear-gradient(135deg,${pt.color}08,transparent);">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:800;line-height:1.3;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(p.name)}</div>
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:4px;">
              <span style="font-size:10px;font-weight:700;padding:1px 8px;border-radius:20px;background:${pt.color}18;color:${pt.color};">${esc(pt.label)}</span>
              ${pg?`<span style="font-size:10px;font-weight:700;padding:1px 8px;border-radius:20px;background:${pg.color}18;color:${pg.color};">${esc(pg.label)}</span>`:''}
            </div>
            <div style="font-size:10px;color:var(--txt3);">📅 ${fd(p.start)} → ${fd(p.end)} · ${lds.length} ตัวเลือก</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">${badges.join('')}${budgetRow}</div>
        </div>
      </div>
      <div style="padding:12px 14px;flex:1;">${optionList}</div>
      <div style="padding:8px 14px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:6px;">
        ${window.canEdit('lodging')?`<button class="btn btn-teal btn-sm" onclick="window.showLdForm('${p.id}',null)">+ เพิ่มตัวเลือก</button>`:''}
      </div>
    </div>`;
  }).join('');
}

// ── Approve by type (daily / monthly) — independent ──
window.approveLdType=async function(pid,ldId,type){
  if(!window.canEdit('lodging'))return;
  var field=type==='daily'?'approved_daily':'approved_monthly';
  var localField=type==='daily'?'approvedDaily':'approvedMonthly';
  // clear same type from other options
  var others=window.LODGINGS.filter(l=>l.pid===pid&&l.id!==ldId&&l[localField]==='yes');
  for(var o of others){o[localField]='';await setDoc(getDocRef('LODGINGS',o.id),{[field]:''},{merge:true}).catch(e=>window.showDbError(e));}
  var l=window.LODGINGS.find(x=>x.id===ldId);
  if(l){l[localField]='yes';}
  var upd={[field]:'yes'};
  await setDoc(getDocRef('LODGINGS',ldId),upd,{merge:true}).catch(e=>window.showDbError(e));
  window.renderLodging();
}
window.unapproveLdType=async function(pid,ldId,type){
  if(!window.canEdit('lodging'))return;
  var field=type==='daily'?'approved_daily':'approved_monthly';
  var localField=type==='daily'?'approvedDaily':'approvedMonthly';
  var l=window.LODGINGS.find(x=>x.id===ldId);
  if(l)l[localField]='';
  await setDoc(getDocRef('LODGINGS',ldId),{[field]:''},{merge:true}).catch(e=>window.showDbError(e));
  window.renderLodging();
}

// ── Searchable Grouped Combobox — Lodging Project Picker ──
window._initLdCombobox=(function(){
  var IH=38,HH=32,BUF=8;
  function hi(txt,q){
    if(!q)return esc(txt);
    var lt=txt.toLowerCase(),lq=q.toLowerCase(),out='',i=0;
    while(i<txt.length){var x=lt.indexOf(lq,i);if(x<0){out+=esc(txt.slice(i));break;}
      out+=esc(txt.slice(i,x))+'<mark style="background:#ffd60a66;border-radius:2px;padding:0 1px;">'+esc(txt.slice(x,x+lq.length))+'</mark>';i=x+lq.length;}
    return out;
  }
  return function(projects){
    var tmap={},tord=[];
    window.PTYPES.forEach(function(t){tmap[t.id]={id:t.id,label:t.label,color:t.color||'var(--txt3)',items:[]};tord.push(t.id);});
    projects.forEach(function(p){
      if(tmap[p.typeId])tmap[p.typeId].items.push(p);
      else{if(!tmap['__x__']){tmap['__x__']={id:'__x__',label:'Project อื่น ๆ',color:'var(--txt3)',items:[]};tord.push('__x__');}tmap['__x__'].items.push(p);}
    });
    tord=tord.filter(function(tid){return tmap[tid]&&tmap[tid].items.length>0;});
    var col=new Set(),q='',fi=-1,flat=[],dt=null;
    var inp=document.getElementById('ld-cmb-input'),lst=document.getElementById('ld-cmb-list');
    if(!inp||!lst)return;
    function bFlat(sq){
      var f=[],lq=sq.toLowerCase();
      if(sq){projects.forEach(function(p){if(p.name.toLowerCase().includes(lq))f.push({k:'i',id:p.id,name:p.name});});}
      else{tord.forEach(function(tid){var g=tmap[tid];if(!g||!g.items.length)return;f.push({k:'h',tid:tid,label:g.label,color:g.color,count:g.items.length});if(!col.has(tid))g.items.forEach(function(p){f.push({k:'i',id:p.id,name:p.name});});});}
      return f;
    }
    function render(){
      if(!flat.length){lst.innerHTML='<div style="padding:40px 20px;text-align:center;color:var(--txt3);font-size:13px;">ไม่พบโครงการ'+(q?'<br><span style="font-size:11px;opacity:.6;">'+esc(q)+'</span>':'')+'</div>';return;}
      var offs=[],tot=0;flat.forEach(function(it){offs.push(tot);tot+=(it.k==='h'?HH:IH);});
      var st=lst.scrollTop,vh=lst.clientHeight||380,si=0,ei=flat.length;
      for(var i=0;i<flat.length;i++){if(offs[i]+(flat[i].k==='h'?HH:IH)>st-BUF*IH){si=i;break;}}
      for(var j=si;j<flat.length;j++){if(offs[j]>st+vh+BUF*IH){ei=j;break;}}
      var topH=offs[si]||0,botH=tot-(ei<flat.length?offs[ei]:tot);
      var html='<div style="height:'+topH+'px"></div>';
      flat.slice(si,ei).forEach(function(it,r){
        var idx=si+r;
        if(it.k==='h'){
          var cc=col.has(it.tid);
          html+='<div class="ldc-h" data-tid="'+esc(it.tid)+'" style="height:'+HH+'px;display:flex;align-items:center;gap:8px;padding:0 12px;cursor:pointer;font-size:11px;font-weight:700;background:var(--surface2);border-bottom:1px solid var(--border);color:'+esc(it.color)+';user-select:none;position:sticky;top:0;z-index:2;">'
            +'<span style="width:8px;height:8px;border-radius:50%;background:'+esc(it.color)+';flex-shrink:0;display:inline-block;"></span>'
            +'<span>'+esc(it.label)+'</span>'
            +'<span style="font-size:10px;color:var(--txt3);margin-left:3px;">('+it.count+')</span>'
            +'<span style="margin-left:auto;font-size:10px;opacity:.5;">'+(cc?'▶':'▼')+'</span>'
            +'</div>';
        }else{
          var foc=idx===fi;
          html+='<div class="ldc-i" data-id="'+esc(it.id)+'" data-idx="'+idx+'" style="height:'+IH+'px;display:flex;align-items:center;padding:0 16px;cursor:pointer;font-size:13px;border-bottom:1px solid rgba(0,0,0,.05);background:'+(foc?'var(--indigo)15':'transparent')+';transition:background .1s;color:var(--txt1);">'+hi(it.name,q)+'</div>';
        }
      });
      html+='<div style="height:'+botH+'px"></div>';
      lst.innerHTML=html;
    }
    lst.addEventListener('click',function(e){
      var h=e.target.closest('.ldc-h'),it=e.target.closest('.ldc-i');
      if(h){var tid=h.dataset.tid;if(col.has(tid))col.delete(tid);else col.add(tid);flat=bFlat(q);fi=-1;render();}
      else if(it)window.openLodgingGroupModal(it.dataset.id);
    });
    lst.addEventListener('mousemove',function(e){var it=e.target.closest('.ldc-i');if(it){var ni=+it.dataset.idx;if(ni!==fi){fi=ni;render();}}});
    lst.addEventListener('scroll',render);
    inp.addEventListener('input',function(){clearTimeout(dt);dt=setTimeout(function(){q=inp.value.trim();fi=-1;flat=bFlat(q);lst.scrollTop=0;render();},200);});
    inp.addEventListener('keydown',function(e){
      var iis=flat.map(function(it,i){return it.k==='i'?i:-1;}).filter(function(i){return i>=0;});
      if(e.key==='Escape'){window.closeM('m-lodging');return;}
      if(e.key==='Tab'){e.preventDefault();window.closeM('m-lodging');return;}
      if(e.key==='ArrowDown'){e.preventDefault();var ci=iis.indexOf(fi);fi=ci<0?iis[0]:iis[ci+1]!==undefined?iis[ci+1]:iis[ci];render();scFi();}
      else if(e.key==='ArrowUp'){e.preventDefault();var ci2=iis.indexOf(fi);fi=ci2<=0?iis[0]:iis[ci2-1];render();scFi();}
      else if(e.key==='Enter'){e.preventDefault();var it=flat[fi];if(it&&it.k==='i')window.openLodgingGroupModal(it.id);}
    });
    function scFi(){if(fi<0)return;var top=0;for(var i=0;i<fi;i++)top+=flat[i]?(flat[i].k==='h'?HH:IH):0;if(top<lst.scrollTop)lst.scrollTop=top;else if(top+IH>lst.scrollTop+lst.clientHeight)lst.scrollTop=top+IH-lst.clientHeight;}
    flat=bFlat('');render();setTimeout(function(){inp.focus();},80);
  };
})();

window.openLodgingGroupModal=function(pid){
  window.currentLdPid=pid;
  if(!pid){
    document.getElementById('m-ld-title').textContent='เลือกโครงการ';
    var EXCL_LD_GRPS=['GRP17733355541905','GRP17733355541906'];var lodgedPids=new Set(window.LODGINGS.map(function(l){return l.pid;}));var _td=new Date();_td.setHours(0,0,0,0);var availLdProjs=window.PROJECTS.filter(function(proj){if(EXCL_LD_GRPS.includes(proj.groupId))return false;if(lodgedPids.has(proj.id))return false;if(!proj.start)return false;return new Date(proj.start)>=_td;});
    document.getElementById('m-ld-body').innerHTML=`<div id="ld-cmb-wrap"><div style="padding-bottom:10px;"><div style="position:relative;"><span style="position:absolute;left:11px;top:50%;transform:translateY(-50%);font-size:14px;pointer-events:none;color:var(--txt3);">🔍</span><input id="ld-cmb-input" type="text" placeholder="ค้นหาโครงการ..." autocomplete="off" spellcheck="false" style="width:100%;padding:9px 12px 9px 34px;border:1.5px solid var(--border);border-radius:10px;font-size:13px;background:var(--surface);color:var(--txt1);outline:none;box-sizing:border-box;transition:border-color .2s;" onfocus="this.style.borderColor='var(--indigo)'" onblur="this.style.borderColor='var(--border)'"></div></div><div id="ld-cmb-list" style="height:380px;overflow-y:auto;border:1px solid var(--border);border-radius:10px;"></div></div>`;
    document.getElementById('m-ld-foot').style.display='none';window.openM('m-lodging');window._initLdCombobox(availLdProjs);return;
  }
  var lds=window.LODGINGS.filter(l=>l.pid===pid);var p=window.PROJECTS.find(x=>x.id===pid);
  var pt=gT(p?p.typeId:'');
  document.getElementById('m-ld-title').textContent='🏨 '+(p?esc(p.name):'ที่พัก');
  var appD=lds.find(l=>l.approvedDaily==='yes');var appM=lds.find(l=>l.approvedMonthly==='yes');
  var addBtn=window.canEdit('lodging')?`<button class="btn btn-teal btn-sm" onclick="window.showLdForm('${pid}',null)">+ เพิ่มตัวเลือกใหม่</button>`:'';
  var html=`<div style="margin-bottom:14px;padding:12px 14px;background:${pt.color}08;border:1px solid ${pt.color}25;border-radius:12px;display:flex;align-items:center;gap:10px;">
    <span style="font-size:20px;">🏗️</span>
    <div style="flex:1;"><div style="font-size:13px;font-weight:800;">${p?esc(p.name):''}</div>
    <div style="font-size:10px;color:var(--txt3);">📅 ${fd(p?p.start:'')} → ${fd(p?p.end:'')} · ${lds.length} ตัวเลือก</div></div>
    ${addBtn}
  </div>
  ${(appD||appM)?`<div style="display:grid;grid-template-columns:${appD&&appM?'1fr 1fr':'1fr'};gap:8px;margin-bottom:14px;">
    ${appD?`<div style="padding:10px 12px;background:#4361ee10;border:1px solid #4361ee30;border-radius:10px;">
      <div style="font-size:10px;font-weight:700;color:var(--indigo);margin-bottom:2px;">✅ อนุมัติรายวัน</div>
      <div style="font-size:12px;font-weight:800;">${esc(appD.name||'ตัวเลือกที่เลือก')}</div>
      ${appD.phone?`<div style="font-size:10px;color:var(--txt3);">📞 ${esc(appD.phone)}</div>`:''}
      ${appD.dTotal?`<div style="font-size:13px;font-weight:800;color:var(--indigo);">${fc(appD.dTotal)}</div>`:''}
    </div>`:''}
    ${appM?`<div style="padding:10px 12px;background:var(--coral)10;border:1px solid var(--coral)30;border-radius:10px;">
      <div style="font-size:10px;font-weight:700;color:var(--coral);margin-bottom:2px;">✅ อนุมัติรายเดือน</div>
      <div style="font-size:12px;font-weight:800;">${esc(appM.name||'ตัวเลือกที่เลือก')}</div>
      ${appM.phone?`<div style="font-size:10px;color:var(--txt3);">📞 ${esc(appM.phone)}</div>`:''}
      ${appM.mTotal?`<div style="font-size:13px;font-weight:800;color:var(--coral);">${fc(appM.mTotal)}</div>`:''}
    </div>`:''}
  </div>`:''}
  <div style="display:flex;flex-direction:column;gap:10px;max-height:52vh;overflow-y:auto;padding-right:4px;">`;
  if(lds.length===0)html+=`<div class="kb-empty">ยังไม่มีข้อมูลที่พัก กด + เพื่อเพิ่ม</div>`;
  else lds.forEach((l,i)=>{
    var isAppD=l.approvedDaily==='yes';var isAppM=l.approvedMonthly==='yes';
    var hasDRate=l.dsQty>0||l.ddQty>0;var hasMRate=l.msQty>0||l.mdQty>0;
    var parsedMapUrl=l.mapUrl?(l.mapUrl.startsWith('http')?l.mapUrl:'https://maps.google.com/?q='+encodeURIComponent(l.mapUrl)):'';
    var actBtns=window.canEdit('lodging')?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px dashed var(--border);">
      ${hasDRate?(!isAppD
        ?`<button class="btn btn-sm" style="background:#4361ee15;color:var(--indigo);border:1px solid #4361ee30;font-weight:700;" onclick="window.approveLdType('${pid}','${l.id}','daily')">✅ อนุมัติรายวัน</button>`
        :`<button class="btn btn-sm" style="background:var(--coral)15;color:var(--coral);border:1px solid var(--coral)30;font-weight:700;" onclick="window.unapproveLdType('${pid}','${l.id}','daily')">↩ ยกเลิกรายวัน</button>`):''}
      ${hasMRate?(!isAppM
        ?`<button class="btn btn-sm" style="background:var(--coral)15;color:var(--coral);border:1px solid var(--coral)30;font-weight:700;" onclick="window.approveLdType('${pid}','${l.id}','monthly')">✅ อนุมัติรายเดือน</button>`
        :`<button class="btn btn-sm" style="background:var(--amber)15;color:var(--amber);border:1px solid var(--amber)30;font-weight:700;" onclick="window.unapproveLdType('${pid}','${l.id}','monthly')">↩ ยกเลิกรายเดือน</button>`):''}
      <button class="btn btn-ghost btn-sm" onclick="window.showLdForm('${pid}','${l.id}')">✏️</button>
      <button class="btn btn-red btn-sm" onclick="window.askDel('lodging','${l.id}','${l.name||'ตัวเลือก '+(i+1)}')">🗑</button>
    </div>`:'';
    html+=`<div style="border:2px solid ${isAppD||isAppM?'var(--teal)':'var(--border)'};border-radius:12px;padding:14px;background:${isAppD||isAppM?'#06d6a006':'var(--surface)'};">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">
        <div>
          <div style="font-size:13px;font-weight:800;">🏠 ${esc(l.name||'ตัวเลือกที่ '+(i+1))}</div>
          <div style="font-size:10px;color:var(--txt3);margin-top:2px;display:flex;gap:10px;flex-wrap:wrap;">
            ${l.phone?`<span>📞 <a href="tel:${esc(l.phone)}" style="color:var(--indigo);font-weight:600;">${esc(l.phone)}</a></span>`:''}
            ${parsedMapUrl?`<a href="${parsedMapUrl}" target="_blank" style="color:var(--sky);">📍 แผนที่</a>`:''}
            ${l.checkIn?`<span>📅 ${fd(l.checkIn)} → ${fd(l.checkOut)}</span>`:''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;align-items:flex-end;font-size:9px;">
          ${isAppD?'<span style="background:#4361ee15;color:var(--indigo);padding:2px 6px;border-radius:6px;font-weight:700;">✅ รายวัน</span>':''}
          ${isAppM?'<span style="background:var(--coral)15;color:var(--coral);padding:2px 6px;border-radius:6px;font-weight:700;">✅ รายเดือน</span>':''}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:${hasDRate&&hasMRate?'1fr 1fr':'1fr'};gap:8px;margin-bottom:4px;">
        ${hasDRate?`<div style="background:var(--indigo)06;border:1px solid var(--indigo)20;border-radius:8px;padding:8px;">
          <div style="font-size:10px;font-weight:700;color:var(--indigo);margin-bottom:4px;">📅 รายวัน</div>
          ${l.dsQty?`<div style="font-size:10px;">🛏 เดี่ยว ${l.dsQty}×${fc(l.dsRate)}/คืน</div>`:''}
          ${l.ddQty?`<div style="font-size:10px;">🛏🛏 คู่ ${l.ddQty}×${fc(l.ddRate)}/คืน</div>`:''}
          <div style="font-size:12px;font-weight:800;color:var(--indigo);text-align:right;margin-top:4px;">${fc(l.dTotal)}</div>
        </div>`:''}
        ${hasMRate?`<div style="background:var(--coral)06;border:1px solid var(--coral)20;border-radius:8px;padding:8px;">
          <div style="font-size:10px;font-weight:700;color:var(--coral);margin-bottom:4px;">📆 รายเดือน</div>
          ${l.msQty?`<div style="font-size:10px;">🛏 เดี่ยว ${l.msQty}×${fc(l.msRate)}/เดือน</div>`:''}
          ${l.mdQty?`<div style="font-size:10px;">🛏🛏 คู่ ${l.mdQty}×${fc(l.mdRate)}/เดือน</div>`:''}
          <div style="font-size:12px;font-weight:800;color:var(--coral);text-align:right;margin-top:4px;">${fc(l.mTotal)}</div>
        </div>`:''}
      </div>
      ${l.note?`<div style="font-size:10px;color:var(--txt3);">📝 ${esc(l.note)}</div>`:''}
      ${actBtns}
    </div>`;
  });
  html+='</div>';
  document.getElementById('m-ld-body').innerHTML=html;
  document.getElementById('m-ld-foot').style.display='none';
  window.openM('m-lodging');
}

window.showLdForm=function(pid,ldId){
  window.editLdId=ldId;
  var l=ldId?window.LODGINGS.find(x=>x.id===ldId):null;
  var p=window.PROJECTS.find(x=>x.id===pid);
  var dis=window.canEdit('lodging')?'':'disabled';
  document.getElementById('m-ld-title').textContent=(l?'✏️ แก้ไขที่พัก':'➕ เพิ่มตัวเลือกที่พักใหม่')+(p?' — '+esc(p.name):'');

  // ── shared amenity rows helper ──
  // ── amenities per side (daily vs monthly separate lists) ──
  var lbl=function(id,icon,text,val){return`<label style="display:flex;align-items:center;gap:3px;font-size:10px;cursor:pointer;white-space:nowrap;background:var(--surface2);padding:3px 7px;border-radius:20px;border:1px solid var(--border);"><input type="checkbox" id="${id}" ${val?'checked':''} ${dis} style="margin:0;">${icon} ${text}</label>`;};
  var amenityD=`<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px;">
    ${lbl('ld-d-breakfast','🍳','อาหารเช้า',l&&l.dBreakfast)}
    ${lbl('ld-d-wifi','📶','WiFi',l&&l.dWifi)}
    ${lbl('ld-d-pillow','🛌','หมอน',l&&l.dPillow)}
    ${lbl('ld-d-blanket','🧣','ผ้าห่ม',l&&l.dBlanket)}
    ${lbl('ld-d-park','🅿️','จอดรถ',l&&l.dPark)}
    ${lbl('ld-d-tv','📺','ทีวี',l&&l.dTv)}
    ${lbl('ld-d-ac','❄️','แอร์',l&&l.dAc)}
    ${lbl('ld-d-fridge','🧊','ตู้เย็น',l&&l.dFridge)}
    ${lbl('ld-d-washer','🫧','ซักผ้า',l&&l.dWasher)}
    ${lbl('ld-d-shower','🚿','น้ำอุ่น',l&&l.dShower)}
    ${lbl('ld-d-towel','🏖️','ผ้าเช็ดตัว',l&&l.dTowel)}
  </div>`;
  var amenityM=`<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px;">
    ${lbl('ld-m-wifi','📶','WiFi',l&&l.mWifi)}
    ${lbl('ld-m-park','🅿️','จอดรถ',l&&l.mPark)}
    ${lbl('ld-m-tv','📺','ทีวี',l&&l.mTv)}
    ${lbl('ld-m-ac','❄️','แอร์',l&&l.mAc)}
    ${lbl('ld-m-fridge','🧊','ตู้เย็น',l&&l.mFridge)}
    ${lbl('ld-m-washer','🫧','ซักผ้า',l&&l.mWasher)}
    ${lbl('ld-m-shower','🚿','น้ำอุ่น',l&&l.mShower)}
    ${lbl('ld-m-pillow','🛌','หมอน',l&&l.mPillow)}
    ${lbl('ld-m-blanket','🧣','ผ้าห่ม',l&&l.mBlanket)}
    ${lbl('ld-m-bedsheet','🛏','ผ้าปูที่นอน',l&&l.mBedsheet)}
    ${lbl('ld-m-towel','🏖️','ผ้าเช็ดตัว',l&&l.mTowel)}
  </div>`;
  var makeAmenities=function(side){return side==='d'?amenityD:amenityM;};

  var inclUtil=l&&l.mInclUtil?'checked':''; // ราคารวมน้ำไฟ checkbox

  var html=`<input type="hidden" id="ld-pid" value="${pid}">

  <!-- ข้อมูลพื้นฐาน -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
    <div class="f-group" style="margin-bottom:0"><label class="f-label">ชื่อที่พัก *</label>
      <input type="text" class="f-input" id="ld-name" value="${l?esc(l.name):''}" placeholder="ชื่อโรงแรม / หอพัก..." ${dis}></div>
    <div class="f-group" style="margin-bottom:0"><label class="f-label">📞 เบอร์ติดต่อ</label>
      <input type="tel" class="f-input" id="ld-phone" value="${l?esc(l.phone||''):''}" placeholder="0xx-xxx-xxxx" ${dis}></div>
  </div>
  <div class="f-group" style="margin-bottom:10px;"><label class="f-label">📍 ลิงก์แผนที่</label>
    <div style="display:flex;gap:8px;"><input type="text" class="f-input" id="ld-map" value="${l?esc(l.mapUrl||''):''}" placeholder="วาง Google Maps URL..." ${dis}>
    <button type="button" class="btn btn-sec" onclick="var u=document.getElementById('ld-map').value.trim();window.open(u?u.startsWith('http')?u:'https://maps.google.com/?q='+encodeURIComponent(u):'https://www.google.com/maps','_blank');">🗺️</button></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px;">
    <div class="f-group" style="margin-bottom:0"><label class="f-label">Check-in <span style="font-size:9px;color:var(--txt3);font-weight:400;">(วันเริ่ม - 1 วัน)</span></label>
      <input type="date" class="f-input" id="ld-in" value="${l?l.checkIn:(p&&p.start?(()=>{var d=new Date(p.start);d.setDate(d.getDate()-1);return d.toISOString().split('T')[0];})():'')}" onchange="window.calcLdPrice()" ${dis}></div>
    <div class="f-group" style="margin-bottom:0"><label class="f-label">Check-out <span style="font-size:9px;color:var(--txt3);font-weight:400;">(วันสิ้นสุดโครงการ)</span></label>
      <input type="date" class="f-input" id="ld-out" value="${l?l.checkOut:(p?p.end:'')}" onchange="window.calcLdPrice()" ${dis}></div>
  </div>
  <div id="ld-dur-text" style="font-size:11px;color:var(--amber);margin-bottom:14px;font-weight:600;min-height:16px;">ระบุวันที่เพื่อคำนวณระยะเวลา</div>

  <!-- ══ SIDE-BY-SIDE RATE COMPARISON ══ -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;align-items:start;">

    <!-- ── คอลัมน์ซ้าย: รายวัน ── -->
    <div style="border:2px solid var(--indigo)40;border-radius:14px;overflow:hidden;">
      <!-- header -->
      <div style="background:var(--indigo);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;">
        <span style="color:#fff;font-size:12px;font-weight:800;">📅 อัตราเช่ารายวัน</span>
        <span style="color:#fff99;font-size:10px;opacity:.8;">฿ / คืน</span>
      </div>
      <div style="padding:12px 14px;background:var(--indigo)04;">

        <!-- ห้องพัก -->
        <div style="font-size:10px;font-weight:700;color:var(--indigo);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">ห้องพัก</div>
        <div class="f-group" style="margin-bottom:8px;"><label class="f-label" style="font-size:10px;">🛏 เตียงเดี่ยว</label>
          <div style="display:flex;gap:6px;">
            <input type="number" id="ld-ds-q" class="f-input" placeholder="ห้อง" value="${l&&l.dsQty?l.dsQty:''}" oninput="window.calcLdPrice()" ${dis} style="width:72px;flex-shrink:0;">
            <input type="number" id="ld-ds-r" class="f-input" placeholder="฿/คืน" value="${l&&l.dsRate?l.dsRate:''}" oninput="window.calcLdPrice()" ${dis}>
          </div></div>
        <div class="f-group" style="margin-bottom:12px;"><label class="f-label" style="font-size:10px;">🛏🛏 เตียงคู่</label>
          <div style="display:flex;gap:6px;">
            <input type="number" id="ld-dd-q" class="f-input" placeholder="ห้อง" value="${l&&l.ddQty?l.ddQty:''}" oninput="window.calcLdPrice()" ${dis} style="width:72px;flex-shrink:0;">
            <input type="number" id="ld-dd-r" class="f-input" placeholder="฿/คืน" value="${l&&l.ddRate?l.ddRate:''}" oninput="window.calcLdPrice()" ${dis}>
          </div></div>

        <!-- สิ่งอำนวยความสะดวก -->
        <div style="font-size:10px;font-weight:700;color:var(--indigo);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">สิ่งอำนวยความสะดวก</div>
        ${makeAmenities('d')}

        <!-- + เพิ่มเอง -->
        <div id="ld-d-tags" style="display:flex;gap:5px;flex-wrap:wrap;min-height:20px;margin-bottom:5px;"></div>
        <div style="display:flex;gap:5px;">
          <input type="text" id="ld-d-tag-input" class="f-input" placeholder="➕ เพิ่มเติม..." style="flex:1;font-size:10px;" ${dis}
            onkeydown="if(event.key==='Enter'){event.preventDefault();window.addLdTag('d');}">
          <button type="button" class="btn btn-sec btn-sm" onclick="window.addLdTag('d')" ${dis}>+</button>
        </div>
        <input type="hidden" id="ld-d-custom" value="${l&&l.dCustom?l.dCustom:''}">

        <!-- ยอดรวม -->
        <div style="background:var(--indigo)15;border-radius:8px;padding:8px 10px;margin-top:10px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:10px;color:var(--indigo);font-weight:600;">รวม (ตลอดช่วง)</span>
          <span style="font-size:16px;font-weight:800;color:var(--indigo);"><span id="ld-d-sum">0</span> ฿</span>
        </div>
        <!-- ค่าใช้จ่ายเพิ่มเติมรายวัน (ไม่นับรวม) -->
        <div style="border-top:1px dashed var(--indigo)30;margin-top:10px;padding-top:10px;">
          <div style="font-size:10px;font-weight:700;color:var(--indigo);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">📋 ค่าใช้จ่ายเพิ่มเติม <span style="font-weight:400;font-style:italic;opacity:.7;">(ไม่นับรวม)</span></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div class="f-group" style="margin-bottom:0;"><label class="f-label" style="font-size:10px;">🔐 ค่ามัดจำ (฿)</label>
              <input type="number" id="ld-d-deposit" class="f-input" placeholder="0" value="${l&&l.dDeposit?l.dDeposit:''}" ${dis}></div>
            <div class="f-group" style="margin-bottom:0;"><label class="f-label" style="font-size:10px;">📝 รายละเอียดมัดจำ</label>
              <input type="text" id="ld-d-deposit-note" class="f-input" placeholder="เช่น คืนเมื่อ check-out..." value="${l&&l.dDepositNote?l.dDepositNote:''}" ${dis}></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── คอลัมน์ขวา: รายเดือน ── -->
    <div style="border:2px solid var(--coral)40;border-radius:14px;overflow:hidden;">
      <!-- header -->
      <div style="background:var(--coral);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;">
        <span style="color:#fff;font-size:12px;font-weight:800;">📆 อัตราเช่ารายเดือน</span>
        <span style="color:#fff;font-size:10px;opacity:.8;">฿ / เดือน</span>
      </div>
      <div style="padding:12px 14px;background:var(--coral)04;">

        <!-- ห้องพัก -->
        <div style="font-size:10px;font-weight:700;color:var(--coral);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">ห้องพัก</div>
        <div class="f-group" style="margin-bottom:8px;"><label class="f-label" style="font-size:10px;">🛏 เตียงเดี่ยว</label>
          <div style="display:flex;gap:6px;">
            <input type="number" id="ld-ms-q" class="f-input" placeholder="ห้อง" value="${l&&l.msQty?l.msQty:''}" oninput="window.calcLdPrice()" ${dis} style="width:72px;flex-shrink:0;">
            <input type="number" id="ld-ms-r" class="f-input" placeholder="฿/เดือน" value="${l&&l.msRate?l.msRate:''}" oninput="window.calcLdPrice()" ${dis}>
          </div></div>
        <div class="f-group" style="margin-bottom:12px;"><label class="f-label" style="font-size:10px;">🛏🛏 เตียงคู่</label>
          <div style="display:flex;gap:6px;">
            <input type="number" id="ld-md-q" class="f-input" placeholder="ห้อง" value="${l&&l.mdQty?l.mdQty:''}" oninput="window.calcLdPrice()" ${dis} style="width:72px;flex-shrink:0;">
            <input type="number" id="ld-md-r" class="f-input" placeholder="฿/เดือน" value="${l&&l.mdRate?l.mdRate:''}" oninput="window.calcLdPrice()" ${dis}>
          </div></div>

        <!-- สิ่งอำนวยความสะดวก -->
        <div style="font-size:10px;font-weight:700;color:var(--coral);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">สิ่งอำนวยความสะดวก</div>
        ${makeAmenities('m')}

        <!-- + เพิ่มเอง -->
        <div id="ld-m-tags" style="display:flex;gap:5px;flex-wrap:wrap;min-height:20px;margin-bottom:5px;"></div>
        <div style="display:flex;gap:5px;">
          <input type="text" id="ld-m-tag-input" class="f-input" placeholder="➕ เพิ่มเติม..." style="flex:1;font-size:10px;" ${dis}
            onkeydown="if(event.key==='Enter'){event.preventDefault();window.addLdTag('m');}">
          <button type="button" class="btn btn-sec btn-sm" onclick="window.addLdTag('m')" ${dis}>+</button>
        </div>
        <input type="hidden" id="ld-m-custom" value="${l&&l.mCustom?l.mCustom:''}">

        <!-- ค่ามัดจำ -->
        <div style="border-top:1px dashed var(--coral)30;margin-top:10px;padding-top:10px;">
          <div style="font-size:10px;font-weight:700;color:var(--coral);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">📋 ค่าใช้จ่ายเพิ่มเติม <span style="font-weight:400;font-style:italic;opacity:.7;">(ไม่นับรวม)</span></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
            <div class="f-group" style="margin-bottom:0;"><label class="f-label" style="font-size:10px;">🔐 ค่ามัดจำ (฿)</label>
              <input type="number" id="ld-m-deposit" class="f-input" placeholder="0" value="${l&&l.mDeposit?l.mDeposit:''}" ${dis}></div>
            <div class="f-group" style="margin-bottom:0;"><label class="f-label" style="font-size:10px;">📝 รายละเอียดมัดจำ</label>
              <input type="text" id="ld-m-deposit-note" class="f-input" placeholder="เช่น คืนเมื่อออก..." value="${l&&l.mDepositNote?l.mDepositNote:''}" ${dis}></div>
          </div>

          <!-- ค่าน้ำ/ค่าไฟ toggle -->
          <label style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;cursor:pointer;margin-bottom:8px;padding:6px 8px;background:var(--coral)10;border-radius:8px;border:1px solid var(--coral)25;">
            <input type="checkbox" id="ld-m-inclutil" ${inclUtil} ${dis}
              onchange="window.toggleLdUtil(this.checked)">
            💧⚡ ราคารวมค่าน้ำ-ค่าไฟแล้ว
          </label>
          <div id="ld-util-fields" style="display:${inclUtil?'none':'grid'};grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
            <div class="f-group" style="margin-bottom:0;"><label class="f-label" style="font-size:10px;">💧 ค่าน้ำ</label>
              <input type="text" id="ld-m-water" class="f-input" placeholder="เช่น 18 ฿/หน่วย" value="${l&&l.mWater?l.mWater:''}" ${dis}></div>
            <div class="f-group" style="margin-bottom:0;"><label class="f-label" style="font-size:10px;">⚡ ค่าไฟ</label>
              <input type="text" id="ld-m-electric" class="f-input" placeholder="เช่น 7 ฿/หน่วย" value="${l&&l.mElectric?l.mElectric:''}" ${dis}></div>
          </div>
          <div class="f-group" style="margin-bottom:0;"><label class="f-label" style="font-size:10px;">📦 ค่าใช้จ่ายอื่น ๆ</label>
            <input type="text" id="ld-m-extras" class="f-input" placeholder="เช่น internet, รักษาความปลอดภัย..." value="${l&&l.mExtras?l.mExtras:''}" ${dis}></div>
        </div>

        <!-- ยอดรวม -->
        <div style="background:var(--coral)15;border-radius:8px;padding:8px 10px;margin-top:10px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:10px;color:var(--coral);font-weight:600;">รวม (ตลอดช่วง)</span>
          <span style="font-size:16px;font-weight:800;color:var(--coral);"><span id="ld-m-sum">0</span> ฿</span>
        </div>
      </div>
    </div>
  </div><!-- end grid -->

  <!-- หมายเหตุ -->
  <div class="f-group" style="margin-bottom:0;"><label class="f-label">📝 หมายเหตุ</label>
    <textarea class="f-input" id="ld-note" style="min-height:48px;" placeholder="เงื่อนไขพิเศษ..." ${dis}>${l?esc(l.note||''):''}</textarea>
  </div>`;

  document.getElementById('m-ld-body').innerHTML=html;
  var saveBtn=window.canEdit('lodging')?`<button class="btn btn-pri" onclick="window.saveLodging()">💾 บันทึกที่พัก</button>`:'';
  document.getElementById('m-ld-foot').innerHTML=`<button class="btn btn-ghost" onclick="window.openLodgingGroupModal('${pid}')">‹ ย้อนกลับ</button>${saveBtn}`;
  document.getElementById('m-ld-foot').style.display='flex';
  window.openM('m-lodging');
  if(window.canEdit('lodging')){
    window.calcLdPrice();
    window.initLdTags('d',document.getElementById('ld-d-custom').value);
    window.initLdTags('m',document.getElementById('ld-m-custom').value);
  }
}

window.toggleLdUtil=function(checked){
  var fields=document.getElementById('ld-util-fields');
  if(fields)fields.style.display=checked?'none':'grid';
}



window.calcLdPrice=function(){
  var inV=document.getElementById('ld-in').value,outV=document.getElementById('ld-out').value;
  var dsQ=parseInt(document.getElementById('ld-ds-q').value)||0,dsR=parseFloat(document.getElementById('ld-ds-r').value)||0;
  var ddQ=parseInt(document.getElementById('ld-dd-q').value)||0,ddR=parseFloat(document.getElementById('ld-dd-r').value)||0;
  var msQ=parseInt(document.getElementById('ld-ms-q').value)||0,msR=parseFloat(document.getElementById('ld-ms-r').value)||0;
  var mdQ=parseInt(document.getElementById('ld-md-q').value)||0,mdR=parseFloat(document.getElementById('ld-md-r').value)||0;
  var dur=document.getElementById('ld-dur-text'),sumD=document.getElementById('ld-d-sum'),sumM=document.getElementById('ld-m-sum');
  if(!inV||!outV){if(dur)dur.textContent='ระบุวันที่เพื่อคำนวณระยะเวลา';if(sumD)sumD.textContent='0';if(sumM)sumM.textContent='0';return;}
  var inD=pd(inV),outD=pd(outV);
  if(outD>=inD){
    var days=Math.max(1,Math.ceil((outD-inD)/(1000*60*60*24)));var months=Math.ceil(days/30);
    if(dur)dur.innerHTML=`⏳ <strong style="color:var(--indigo)">${days} วัน</strong> · ปัดเป็น <strong style="color:var(--coral)">${months} เดือน</strong>`;
    if(sumD)sumD.textContent=((days*dsQ*dsR)+(days*ddQ*ddR)).toLocaleString();
    if(sumM)sumM.textContent=((months*msQ*msR)+(months*mdQ*mdR)).toLocaleString();
  } else {
    if(dur)dur.innerHTML='<span style="color:var(--coral)">⚠ Check-out ต้องมากกว่า Check-in</span>';
    if(sumD)sumD.textContent='0';if(sumM)sumM.textContent='0';
  }
}

window.addLdTag=function(side){
  var inp=document.getElementById('ld-'+side+'-tag-input');
  if(!inp)return;
  var val=inp.value.trim();if(!val)return;
  window.ldTagAdd(side,val);
  inp.value='';
};
window.ldTagAdd=function(side,val){
  var box=document.getElementById('ld-'+side+'-tags');
  if(!box)return;
  if([...box.querySelectorAll('.ld-tag-lbl')].some(function(t){return t.textContent===val;}))return;
  var tag=document.createElement('span');
  tag.setAttribute('data-side',side);
  tag.style.cssText='display:inline-flex;align-items:center;gap:4px;background:var(--violet)18;color:var(--violet);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;border:1px solid var(--violet)30;';
  var lbl=document.createElement('span');lbl.className='ld-tag-lbl';lbl.textContent=val;
  var del=document.createElement('span');del.textContent='✕';del.style.cssText='cursor:pointer;opacity:.6;font-size:13px;margin-left:2px;';
  del.addEventListener('click',function(e){e.stopPropagation();tag.remove();window.syncLdCustom(side);});
  tag.appendChild(lbl);tag.appendChild(del);
  box.appendChild(tag);
  window.syncLdCustom(side);
};
window.syncLdCustom=function(side){
  var box=document.getElementById('ld-'+side+'-tags');
  var hid=document.getElementById('ld-'+side+'-custom');
  if(!box||!hid)return;
  hid.value=[...box.querySelectorAll('.ld-tag-lbl')].map(t=>t.textContent).join(',');
};
window.initLdTags=function(side,csv){
  if(!csv)return;
  csv.split(',').forEach(function(v){var t=v.trim();if(t)window.ldTagAdd(side,t);});
};

window.saveLodging=async function(){
  if(!window.canEdit('lodging')||!window.auth.currentUser)return;
  var pid=document.getElementById('ld-pid').value;if(!pid)return;
  var id=window.editLdId||'LODG'+Date.now();
  var dTotal=parseFloat((document.getElementById('ld-d-sum').textContent||'0').replace(/,/g,''))||0;
  var mTotal=parseFloat((document.getElementById('ld-m-sum').textContent||'0').replace(/,/g,''))||0;
  var getChk=eid=>{var el=document.getElementById(eid);return el?el.checked?'TRUE':'FALSE':'FALSE';};
  var dbLd={lodging_id:id,project_id:pid,
    lodging_name:document.getElementById('ld-name').value.trim(),
    phone:document.getElementById('ld-phone').value.trim(),
    map_url:document.getElementById('ld-map').value.trim(),
    check_in:document.getElementById('ld-in').value,
    check_out:document.getElementById('ld-out').value,
    ds_qty:parseInt(document.getElementById('ld-ds-q').value)||0,ds_rate:parseFloat(document.getElementById('ld-ds-r').value)||0,
    dd_qty:parseInt(document.getElementById('ld-dd-q').value)||0,dd_rate:parseFloat(document.getElementById('ld-dd-r').value)||0,
    d_total:dTotal,d_wifi:getChk('ld-d-wifi'),d_pillow:getChk('ld-d-pillow'),d_blanket:getChk('ld-d-blanket'),d_appliance:getChk('ld-d-app'),d_parking:getChk('ld-d-park'),d_ac:getChk('ld-d-ac'),d_fridge:getChk('ld-d-fridge'),d_washer:getChk('ld-d-washer'),d_tv:getChk('ld-d-tv'),d_shower:getChk('ld-d-shower'),d_breakfast:getChk('ld-d-breakfast'),d_towel:getChk('ld-d-towel'),d_custom:(document.getElementById('ld-d-custom')||{}).value||'',d_deposit:parseFloat((document.getElementById('ld-d-deposit')||{}).value)||0,d_deposit_note:(document.getElementById('ld-d-deposit-note')||{}).value||'',
    ms_qty:parseInt(document.getElementById('ld-ms-q').value)||0,ms_rate:parseFloat(document.getElementById('ld-ms-r').value)||0,
    md_qty:parseInt(document.getElementById('ld-md-q').value)||0,md_rate:parseFloat(document.getElementById('ld-md-r').value)||0,
    m_total:mTotal,m_wifi:getChk('ld-m-wifi'),m_pillow:getChk('ld-m-pillow'),m_blanket:getChk('ld-m-blanket'),m_appliance:getChk('ld-m-app'),m_parking:getChk('ld-m-park'),m_ac:getChk('ld-m-ac'),m_fridge:getChk('ld-m-fridge'),m_washer:getChk('ld-m-washer'),m_tv:getChk('ld-m-tv'),m_shower:getChk('ld-m-shower'),m_breakfast:getChk('ld-m-breakfast'),m_bedsheet:getChk('ld-m-bedsheet'),m_towel:getChk('ld-m-towel'),m_custom:(document.getElementById('ld-m-custom')||{}).value||'',
    grand_total:dTotal+mTotal,note:document.getElementById('ld-note').value.trim(),
    m_deposit:parseFloat((document.getElementById('ld-m-deposit')||{}).value)||0,
    m_deposit_note:(document.getElementById('ld-m-deposit-note')||{}).value||'',
    m_water:(document.getElementById('ld-m-water')||{}).value||'',
    m_electric:(document.getElementById('ld-m-electric')||{}).value||'',
    m_extras:(document.getElementById('ld-m-extras')||{}).value||'',
    m_incl_util:(document.getElementById('ld-m-inclutil')&&document.getElementById('ld-m-inclutil').checked)?'TRUE':'FALSE'};
  window._applyLocalDoc('LODGINGS',id,dbLd);
  window.openLodgingGroupModal(pid);
  setDoc(getDocRef('LODGINGS',id),dbLd).catch(e=>window.showDbError(e));
}

