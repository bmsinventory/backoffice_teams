const { esc, fd, fc, fca, pd, gS, gT, gG, gSt, gC, avC, uid, getFY, getYearBE, getStaffOverlaps, overlapWarnText, getStaffLeaveConflicts, getColRef, getDocRef } = window;
const setDoc = (...a) => window.setDoc(...a);
const writeBatch = () => window.writeBatch();
// ── ADMIN ──
// หน้า Admin Panel (#view-admin) — เมนูซ้ายจัดกลุ่มแบบเดียวกับแท็บอบรม (.trn-side* ใน layout.css) · มือถือพับเป็นปุ่ม ☰
// adminOnly = เฉพาะ role admin (ผู้มีสิทธิ์ดู Admin Panel อื่น ๆ ไม่เห็น)
var ADM_NAV=[
  {g:'บุคลากร',items:[
    {id:'staff',icon:'👥',label:'พนักงาน'},
    {id:'dept',icon:'🏢',label:'แผนก'},
    {id:'positions',icon:'💼',label:'ตำแหน่ง'},
  ]},
  {g:'โครงการ',items:[
    {id:'groups',icon:'📂',label:'กลุ่มโครงการ'},
    {id:'types',icon:'🏷️',label:'ประเภทงาน'},
    {id:'stages',icon:'⚡',label:'PM Stages'},
    {id:'rates',icon:'💵',label:'อัตราค่าใช้จ่าย'},
  ]},
  {g:'Helpdesk',items:[
    {id:'hsp_products',icon:'📦',label:'Product'},
    {id:'hd_options',icon:'🎧',label:'ตัวเลือกแจ้งปัญหา'},
    {id:'hd_ai_auto',icon:'🤖',label:'AI ตอบกลับอัตโนมัติ',adminOnly:true},
  ]},
  {g:'ระบบ',items:[
    {id:'notify',icon:'🔔',label:'การแจ้งเตือน'},
    {id:'users',icon:'🔑',label:'ผู้ใช้งานระบบ',adminOnly:true},
    {id:'roles',icon:'🔐',label:'สิทธิ์การใช้งาน',adminOnly:true},
  ]},
];
function admNavItems(){
  var isAdm=window.isAdmin();
  return ADM_NAV.map(function(g){return{g:g.g,items:g.items.filter(function(it){return isAdm||!it.adminOnly;})};}).filter(function(g){return g.items.length;});
}
function renderAdmSide(){
  var el=document.getElementById('adm-side');if(!el)return;
  var cur=null,open=el.classList.contains('open');
  var list=admNavItems().map(function(g){
    return'<div class="trn-side-g">'+esc(g.g)+'</div>'+g.items.map(function(it){
      var on=window.admCur===it.id;if(on)cur=it;
      return'<div class="trn-side-item'+(on?' on':'')+'" onclick="window.admTab(\''+it.id+'\')"><span class="trn-side-ic">'+it.icon+'</span>'+esc(it.label)+'</div>';
    }).join('');
  }).join('');
  el.innerHTML='<button class="trn-side-toggle" onclick="this.parentNode.classList.toggle(\'open\');this.querySelector(\'.trn-side-caret\').textContent=this.parentNode.classList.contains(\'open\')?\'▲\':\'▼\'">☰ <span>'+(cur?cur.icon+' '+esc(cur.label):'Admin Panel')+'</span><span class="trn-side-caret">'+(open?'▲':'▼')+'</span></button>'
    +'<div class="trn-side-list">'+list+'</div>';
}
window.renderAdminPage=function(){
  // แท็บเฉพาะ admin ค้างอยู่แต่ผู้ใช้ไม่ใช่ admin → กลับไปแท็บแรก
  var ok=admNavItems().some(function(g){return g.items.some(function(it){return it.id===window.admCur;});});
  window.admTab(ok?window.admCur:'staff');
};
window.admTab=function(t){
  var b=document.getElementById('adm-body');if(b&&t!==window.admCur)b.scrollTop=0; // เปลี่ยนแท็บ → เริ่มบนสุด (render ซ้ำแท็บเดิมคงตำแหน่งไว้)
  window.admCur=t;
  var side=document.getElementById('adm-side');if(side)side.classList.remove('open'); // มือถือ: เลือกแล้วพับเมนู
  renderAdmSide();renderAdm();
};
// ปุ่มของแท็บ (เพิ่ม/นำเข้า) อยู่แถวเดียวกับหัวข้อ
function admActions(html){var a=document.getElementById('adm-head-actions');if(a)a.innerHTML=html||'';}

function renderAdm(){
  var c=document.getElementById('adm-body');if(!c)return;var titleEl=document.getElementById('adm-head-title');
  admActions('');
  if(window.admCur==='notify'){window.renderNotifySettings();return;}
  if(window.admCur==='roles'){renderAdmRoles(c,titleEl);return;}
  if(window.admCur==='hd_options'){window.renderHdOptionsAdmin();return;}
  if(window.admCur==='hd_ai_auto'){window.renderHdAiAutoAdmin();return;}
  if(window.admCur==='staff'){
    var activeStaff=window.STAFF.filter(function(s){return s.active!==false;}).sort(window.sortStaffByDeptRank);
    var inactiveStaff=window.STAFF.filter(function(s){return s.active===false;}).sort(window.sortStaffByDeptRank);
    if(titleEl)titleEl.innerHTML=`👥 จัดการพนักงาน <span class="tag" style="background:var(--surface2);color:var(--txt3);margin-left:10px;font-size:11px;">ใช้งาน ${activeStaff.length} คน</span>`;
    function staffRow(s,i){
      var initials=s.name.split(' ').map(function(w){return w.charAt(0);}).join('').substring(0,2).toUpperCase();
      return`<div class="adm-staff-row" style="display:flex;align-items:center;gap:12px;padding:10px 16px;transition:background .15s;cursor:default;" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
        <div style="width:38px;height:38px;border-radius:10px;background:${avC(i)};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">${initials}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:var(--txt);line-height:1.3;">${esc(s.name)}${s.nickname?` <span style="font-size:11px;color:var(--txt3);font-weight:400;">(${esc(s.nickname)})</span>`:''}</div>
          <div style="font-size:11px;color:var(--violet);font-weight:500;margin-top:1px;">${esc(s.role||'—')}</div>
        </div>
        <div class="adm-staff-contact" style="display:flex;align-items:center;gap:20px;flex-shrink:0;">
          ${s.phone?`<span style="font-size:12px;color:var(--txt3);">📞 ${esc(s.phone)}</span>`:'<span style="font-size:12px;color:var(--border2);">—</span>'}
          ${s.email?`<span style="font-size:12px;color:var(--txt3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">✉️ ${esc(s.email)}</span>`:''}
        </div>
        ${(window.canEdit('admin')||window.canDel('admin'))?`<div style="display:flex;gap:6px;flex-shrink:0;">
          ${window.canEdit('admin')?`<button class="btn btn-ghost btn-sm" onclick="window.admStaffForm('${s.id}')">✏️</button>`:''}
          ${window.canDel('admin')?`<button class="btn btn-red btn-sm" onclick="window.askDel('staff','${s.id}','${esc(s.name)}')">🗑</button>`:''}
        </div>`:''}
      </div>`;
    }
    function deptSection(label,list,ci,isInactive){
      if(!list.length)return'';
      var accentColor=isInactive?'var(--coral)':avC(ci);
      var badge=isInactive?`<span style="font-size:11px;background:rgba(255,107,107,.12);color:var(--coral);padding:1px 8px;border-radius:20px;">${list.length} คน</span>`:`<span style="font-size:11px;background:var(--surface2);color:var(--txt3);padding:1px 8px;border-radius:20px;">${list.length} คน</span>`;
      var divider=`<div style="height:1px;background:var(--border);margin:0 16px;"></div>`;
      // พ้นสภาพ: ซ่อนรายชื่อไว้ก่อน กดหัวข้อเพื่อแสดง/ซ่อน (จำสถานะไว้จนรีเฟรช)
      var hidden=isInactive&&!window._admShowInactive;
      return`<div class="fade" style="margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;padding:0 2px;${isInactive?'cursor:pointer;user-select:none;':''}"${isInactive?` onclick="window._admShowInactive=!window._admShowInactive;window.admTab('staff')" title="${hidden?'กดเพื่อแสดงรายชื่อ':'กดเพื่อซ่อนรายชื่อ'}"`:''}>
          <div style="width:4px;height:18px;border-radius:2px;background:${accentColor};flex-shrink:0;"></div>
          <div style="font-size:13px;font-weight:700;color:var(--txt);">${esc(label)}</div>
          ${badge}
          ${isInactive?`<span style="font-size:11.5px;font-weight:600;color:var(--txt3);">${hidden?'▸ แสดงรายชื่อ':'▾ ซ่อน'}</span>`:''}
        </div>
        ${hidden?'':`<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;${isInactive?'opacity:.65;':''}">`+
        list.map(function(s,i){return(i>0?divider:'')+staffRow(s,i);}).join('')+
      `</div>`}</div>`;
    }
    var deptOrder=window.DEPT_LIST.map(function(d){return d.label;});
    var grouped={};
    deptOrder.forEach(function(d){grouped[d]=[];});
    grouped['ไม่ระบุแผนก']=[];
    activeStaff.forEach(function(s){
      if(deptOrder.includes(s.dept))grouped[s.dept].push(s);
      else grouped['ไม่ระบุแผนก'].push(s);
    });
    // ตัวกรองแผนก ('' = ทุกแผนก) — จำค่าไว้จนรีเฟรช · แผนกที่ถูกลบไปแล้วกลับเป็นทุกแผนก
    var fDept=window._admDeptFilter||'';
    if(fDept&&fDept!=='ไม่ระบุแผนก'&&!deptOrder.includes(fDept))fDept=window._admDeptFilter='';
    var inDept=function(s){return!fDept||(fDept==='ไม่ระบุแผนก'?!deptOrder.includes(s.dept):s.dept===fDept);};
    var sections='';
    var ci=0;
    deptOrder.forEach(function(dept){if(grouped[dept]&&grouped[dept].length){if(!fDept||fDept===dept)sections+=deptSection(dept,grouped[dept],ci,false);ci++;}});
    if(grouped['ไม่ระบุแผนก'].length&&(!fDept||fDept==='ไม่ระบุแผนก'))sections+=deptSection('ไม่ระบุแผนก',grouped['ไม่ระบุแผนก'],ci,false);
    var inactShown=inactiveStaff.filter(inDept);
    if(inactShown.length)sections+=deptSection('พ้นสภาพ / ไม่ใช้งาน',inactShown,ci,true);
    if(!sections)sections=`<div style="padding:40px 16px;text-align:center;color:var(--txt3);font-size:13px;">ไม่มีพนักงานในแผนกนี้</div>`;
    var deptOpts=deptOrder.concat(grouped['ไม่ระบุแผนก'].length||fDept==='ไม่ระบุแผนก'?['ไม่ระบุแผนก']:[]);
    var deptSel=`<select class="t-sel" title="กรองตามแผนก" onchange="window._admDeptFilter=this.value;window.admTab('staff')"><option value="">🏢 ทุกแผนก</option>`+
      deptOpts.map(function(d){return`<option value="${esc(d)}"${d===fDept?' selected':''}>${esc(d)}</option>`;}).join('')+`</select>`;
    admActions(deptSel+(window.canAdd('admin')?`<button class="btn btn-pri" onclick="window.admStaffForm(null)">+ เพิ่มพนักงาน</button>`:''));
    c.innerHTML=sections;
  }
  else if(window.admCur==='dept'){
    if(titleEl)titleEl.innerHTML=`🏢 ข้อมูลแผนก <span class="tag" style="background:var(--surface2);color:var(--txt3);margin-left:10px;font-size:11px;">${window.DEPT_LIST.length} แผนก</span>`;
    admActions(window.canAdd('admin')?`<button class="btn btn-pri" onclick="window.admDeptForm(null)">+ เพิ่มแผนก</button>`:'');
    c.innerHTML=`<div style="display:flex;flex-direction:column;gap:8px;max-width:640px;">`+
    window.DEPT_LIST.map(function(d,i){
      return`<div class="fade" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 18px;display:flex;align-items:center;gap:14px;transition:all .2s;" onmouseover="this.style.borderColor='var(--violet)';this.style.background='var(--surface2)'" onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--surface)'">
        <div style="width:28px;height:28px;border-radius:8px;background:var(--violet)18;color:var(--violet);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${i+1}</div>
        <div style="flex:1;font-size:14px;font-weight:500;color:var(--txt);">🏢 ${esc(d.label)}</div>
        ${(window.canEdit('admin')||window.canDel('admin'))?`<div style="display:flex;gap:6px;">${window.canEdit('admin')?`<button class="btn btn-ghost btn-sm" onclick="window.admDeptForm('${d.id}')">✏️</button>`:''}${window.canDel('admin')?`<button class="btn btn-red btn-sm" onclick="window.askDel('department','${d.id}','${esc(d.label)}')">🗑</button>`:''}</div>`:''}
      </div>`;
    }).join('')+`</div>`;
  }
  else if(window.admCur==='groups'){if(titleEl)titleEl.innerHTML=`📂 กลุ่มโครงการ`;admActions(window.canAdd('admin')?`<button class="btn btn-pri" onclick="window.admGroupForm(null)">+ เพิ่มกลุ่มโครงการ</button>`:'');c.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">`+window.PGROUPS.map(function(g){return`<div class="adm-card fade"><div style="width:40px;height:40px;border-radius:10px;background:${g.color};flex-shrink:0;box-shadow:0 4px 12px ${g.color}55;"></div><div class="adm-card-info"><div style="font-size:14px;font-weight:600;color:var(--txt)">${esc(g.label)}</div><div style="display:flex;align-items:center;gap:6px;margin-top:4px;"><div style="width:10px;height:10px;border-radius:50%;background:${g.color};"></div><span style="font-size:11px;font-weight:400;color:var(--txt3)">${g.color}</span></div></div><div class="adm-card-actions">${window.canEdit('admin')?`<button class="btn btn-ghost btn-sm" onclick="window.admGroupForm('${g.id}')">✏️</button>`:''}${window.canDel('admin')?`<button class="btn btn-red btn-sm" onclick="window.askDel('group','${g.id}','${esc(g.label)}')">🗑</button>`:''}</div></div>`;}).join('')+`</div>`;}
  else if(window.admCur==='types'){if(titleEl)titleEl.innerHTML=`🏷️ ประเภทงาน`;admActions(window.canAdd('admin')?`<button class="btn btn-pri" onclick="window.admTypeForm(null)">+ เพิ่มประเภทงาน</button>`:'');c.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">`+window.PTYPES.map(function(t){return`<div class="adm-card fade"><div style="width:40px;height:40px;border-radius:10px;background:${t.color};flex-shrink:0;box-shadow:0 4px 12px ${t.color}55;"></div><div class="adm-card-info"><div style="font-size:14px;font-weight:600;color:var(--txt)">${esc(t.label)}</div><div style="display:flex;align-items:center;gap:6px;margin-top:4px;"><div style="width:10px;height:10px;border-radius:50%;background:${t.color};"></div><span style="font-size:11px;font-weight:400;color:var(--txt3)">${t.color}</span></div></div><div class="adm-card-actions">${window.canEdit('admin')?`<button class="btn btn-ghost btn-sm" onclick="window.admTypeForm('${t.id}')">✏️</button>`:''}${window.canDel('admin')?`<button class="btn btn-red btn-sm" onclick="window.askDel('type','${t.id}','${esc(t.label)}')">🗑</button>`:''}</div></div>`;}).join('')+`</div>`;}
  else if(window.admCur==='positions'){if(titleEl)titleEl.innerHTML=`💼 ตำแหน่งงาน`;admActions(window.canAdd('admin')?`<button class="btn btn-pri" onclick="window.admPositionForm(null)">+ เพิ่มตำแหน่ง</button>`:'');c.innerHTML=`<div style="display:flex;flex-direction:column;gap:8px;max-width:640px;">`+window.POSITIONS.map(function(p,i){return`<div class="fade" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 18px;display:flex;align-items:center;gap:14px;transition:all .2s;" onmouseover="this.style.borderColor='var(--violet)';this.style.background='var(--surface2)'" onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--surface)'"><div style="width:28px;height:28px;border-radius:8px;background:var(--violet)18;color:var(--violet);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;" title="ระดับตำแหน่ง (1 = สูงสุด)">${p.rank<99?p.rank:'—'}</div><div style="flex:1;font-size:14px;font-weight:500;color:var(--txt);">${esc(p.label)}</div><div style="font-size:12px;color:var(--teal);font-weight:600;white-space:nowrap;">${p.dailyRate>0?fc(p.dailyRate)+'/วัน':'—'}</div>${(window.canEdit('admin')||window.canDel('admin'))?`<div style="display:flex;gap:6px;">${window.canEdit('admin')?`<button class="btn btn-ghost btn-sm" onclick="window.admPositionForm('${p.id}')">✏️</button>`:''}${window.canDel('admin')?`<button class="btn btn-red btn-sm" onclick="window.askDel('position','${p.id}','${esc(p.label)}')">🗑</button>`:''}</div>`:''}</div>`;}).join('')+`</div>`;}
  else if(window.admCur==='rates'){
    if(titleEl)titleEl.innerHTML=`💵 อัตราค่าใช้จ่าย`;
    var st=window.SETTINGS;
    c.innerHTML=`<div style="max-width:560px;display:flex;flex-direction:column;gap:20px;">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px;">
        <div style="font-size:13px;font-weight:700;color:var(--violet);margin-bottom:16px;">📋 อัตราค่าเบี้ยเลี้ยง (฿/วัน)</div>
        <div class="m-stack" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="f-group"><label class="f-label">วันทำงาน — พื้นที่ปกติ</label><input type="number" class="f-input" id="rt-wn" value="${st.allowance_weekday_normal}" ${window.canEdit('admin')?'':'disabled'}></div>
          <div class="f-group"><label class="f-label">วันหยุด — พื้นที่ปกติ</label><input type="number" class="f-input" id="rt-hn" value="${st.allowance_holiday_normal}" ${window.canEdit('admin')?'':'disabled'}></div>
          <div class="f-group"><label class="f-label">วันทำงาน — พื้นที่ชายแดน</label><input type="number" class="f-input" id="rt-wb" value="${st.allowance_weekday_border}" ${window.canEdit('admin')?'':'disabled'}></div>
          <div class="f-group"><label class="f-label">วันหยุด — พื้นที่ชายแดน</label><input type="number" class="f-input" id="rt-hb" value="${st.allowance_holiday_border}" ${window.canEdit('admin')?'':'disabled'}></div>
        </div>
        ${window.canEdit('admin')?`<button class="btn btn-pri" style="margin-top:12px;" onclick="window.saveAllowanceRates()">💾 บันทึกอัตราเบี้ยเลี้ยง</button>`:''}
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px;">
        <div style="font-size:13px;font-weight:700;color:var(--violet);margin-bottom:4px;">💼 อัตราค่าแรงต่อตำแหน่ง</div>
        <div style="font-size:11px;color:var(--txt3);margin-bottom:14px;">แก้ไขได้ที่ Tab "ตำแหน่งงาน"</div>
        ${window.POSITIONS.map(function(p){return`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;"><span style="flex:1;color:var(--txt);font-weight:500;">${esc(p.label)}</span><span style="color:${p.dailyRate>0?'var(--teal)':'var(--txt3)'};font-weight:700;">${p.dailyRate>0?fc(p.dailyRate)+'/วัน':'ยังไม่กำหนด'}</span></div>`;}).join('')}
      </div>
    </div>`;
  }
  else if(window.admCur==='stages'){if(titleEl)titleEl.innerHTML=`⚡ PM Stages`;admActions(window.canAdd('admin')?`<button class="btn btn-pri" onclick="window.admStageForm(null)">+ เพิ่ม Stage</button>`:'');c.innerHTML=`<div id="stg-list" style="display:flex;flex-direction:column;gap:10px;max-width:700px;margin:0 auto;">`+window.STAGES.map(function(s,i){return`<div class="adm-card fade" draggable="${window.canEdit('admin')}" ondragstart="window.stgDrag(event,'${s.id}')" ondragover="event.preventDefault()" ondrop="window.stgDrop(event,'${s.id}')" style="animation-delay:${i*30}ms;">${window.canEdit('admin')?`<div style="color:var(--border2);font-size:20px;cursor:grab;padding-right:10px;">⋮⋮</div>`:''}<div style="width:40px;height:40px;border-radius:10px;background:${s.color};flex-shrink:0;box-shadow:0 4px 12px ${s.color}55;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;">${s.order||i+1}</div><div class="adm-card-info"><div style="font-size:14px;font-weight:600;color:var(--txt)">${esc(s.label)}</div><div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;"><div style="width:10px;height:10px;border-radius:50%;background:${s.color};"></div><span style="font-size:11px;font-weight:400;color:var(--txt3)">ลำดับที่ ${s.order||i+1}</span>${s.autoRule?`<span style="font-size:10px;font-weight:600;background:var(--violet)15;color:var(--violet);padding:2px 8px;border-radius:10px;">⚡ ${s.autoRule==='before_start'?'ก่อนเริ่ม '+s.autoOffset+'ว':s.autoRule==='on_start'?'เมื่อเริ่มโครงการ':s.autoRule==='on_end'?'เมื่อสิ้นสุดโครงการ':'หลังสิ้นสุด '+s.autoOffset+'ว'}</span>`:''}${s.setProgress>=0?`<span style="font-size:10px;font-weight:600;background:var(--teal)15;color:var(--teal);padding:2px 8px;border-radius:10px;">📊 ${s.setProgress}%</span>`:''}</div></div><div class="adm-card-actions">${window.canEdit('admin')?`<button class="btn btn-ghost btn-sm" onclick="window.admStageForm('${s.id}')">✏️</button>`:''}${window.canDel('admin')?`<button class="btn btn-red btn-sm" onclick="window.askDel('stage','${s.id}','${esc(s.label)}')">🗑</button>`:''}</div></div>`;}).join('')+`</div>`;}
  else if(window.admCur==='hsp_products'){
    var prods=window.HSP_PRODUCTS||[];
    if(titleEl)titleEl.innerHTML=`📦 Product <span class="tag" style="background:var(--surface2);color:var(--txt3);margin-left:10px;font-size:11px;">${prods.length} รายการ</span>`;
    var HSP_GRP=[{id:'his_front',label:'HIS Front Office',color:'#2563eb'},{id:'his_back',label:'HIS Back Office',color:'#7c3aed'},{id:'interconnect',label:'Interconnection',color:'#0891b2'},{id:'application',label:'Application',color:'#059669'},{id:'smart',label:'Smart Hospital',color:'#d97706'}];
    var canE=window.canEdit&&window.canEdit('admin');
    var canA=window.canAdd&&window.canAdd('admin');
    var canD=window.canDel&&window.canDel('admin');
    var rows='';
    HSP_GRP.forEach(function(g){
      var gp=prods.filter(function(p){return p.group===g.id;});
      if(!gp.length)return;
      rows+=`<div style="margin-bottom:16px;max-width:640px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${g.color};padding:4px 0 8px;border-bottom:2px solid ${g.color}33;margin-bottom:8px;">${esc(g.label)}</div>
        <div style="display:flex;flex-direction:column;gap:6px;">`+
        gp.map(function(p){
          return`<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:11px 16px;display:flex;align-items:center;gap:12px;" onmouseover="this.style.borderColor='${p.color}'" onmouseout="this.style.borderColor='var(--border)'">
            <span style="width:12px;height:12px;border-radius:50%;background:${p.color};flex-shrink:0;display:inline-block;"></span>
            <span style="flex:1;font-size:13px;font-weight:600;color:var(--txt);">${esc(p.name)}</span>
            ${p.note?`<span style="font-size:11px;color:var(--txt-muted);">${esc(p.note)}</span>`:''}
            <div style="display:flex;gap:6px;flex-shrink:0;">
              ${canE?`<button class="btn btn-ghost btn-sm" onclick="window.openHspProductEdit('${p.id}');window.openM('m-hsp-products')">✏️</button>`:''}
              ${canD?`<button class="btn btn-red btn-sm" onclick="window.deleteHspProduct('${p.id}')">🗑</button>`:''}
            </div>
          </div>`;
        }).join('')+
        `</div></div>`;
    });
    var noGrp=prods.filter(function(p){return!HSP_GRP.some(function(g){return g.id===p.group;});});
    if(noGrp.length){
      rows+=`<div style="margin-bottom:16px;max-width:640px;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--txt-muted);padding:4px 0 8px;border-bottom:2px solid var(--border);margin-bottom:8px;">ยังไม่ได้กำหนดกลุ่ม</div><div style="display:flex;flex-direction:column;gap:6px;">`+
        noGrp.map(function(p){
          return`<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:11px 16px;display:flex;align-items:center;gap:12px;">
            <span style="width:12px;height:12px;border-radius:50%;background:${p.color};flex-shrink:0;display:inline-block;"></span>
            <span style="flex:1;font-size:13px;font-weight:600;color:var(--txt);">${esc(p.name)}</span>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              ${canE?`<button class="btn btn-ghost btn-sm" onclick="window.openHspProductEdit('${p.id}');window.openM('m-hsp-products')">✏️</button>`:''}
              ${canD?`<button class="btn btn-red btn-sm" onclick="window.deleteHspProduct('${p.id}')">🗑</button>`:''}
            </div>
          </div>`;
        }).join('')+`</div></div>`;
    }
    if(!rows)rows=`<div style="text-align:center;color:var(--txt-muted);padding:64px 24px;font-size:14px;border:1px dashed var(--border);border-radius:12px;max-width:640px;">ยังไม่มี Product · กด + เพิ่ม Product</div>`;
    admActions(canA?`<button class="btn btn-pri" onclick="window.openHspProductEdit(null);window.openM('m-hsp-products')">+ เพิ่ม Product</button>`:'');
    c.innerHTML=rows;
  }
  else if(window.admCur==='users'){if(titleEl)titleEl.innerHTML=`🔑 ผู้ใช้งานระบบ`;admActions(window.canAdd('admin')?`<button class="btn btn-pri" onclick="window.admUserForm(null)">+ เพิ่มบัญชีผู้ใช้</button>`:'');c.innerHTML=`<div class="dtable-inner" style="border:1px solid var(--border);"><table><thead><tr><th>Username</th><th>ชื่อ</th><th>ผูกกับพนักงาน</th><th style="width:90px"></th></tr></thead><tbody>`+usersByRole().map(function(g){return`<tr class="usr-grp" style="--rc:${esc(g.color)}"><td colspan="4"><span class="rl-dot"></span>${esc(g.name)}<span class="rl-cnt">${g.users.length} คน</span></td></tr>`+g.users.map(function(u){return`<tr class="fade"><td style="font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--violet)">${esc(u.username)}${u.resetRequestedAt?`<div><span class="tag" style="background:rgba(255,166,43,.15);color:var(--amber);font-family:inherit;margin-top:4px" title="กด ✏️ แล้วกรอกรหัสผ่านใหม่ คำขอจะหายเอง">🔑 ขอรีเซ็ตรหัสผ่าน</span></div>`:''}</td><td style="font-weight:600;">${esc(u.name)}</td><td>${staffLinkTag(u)}</td><td><div style="display:flex;gap:6px">${window.canEdit('admin')?`<button class="btn btn-ghost btn-sm" onclick="window.admUserForm('${u.id}')">✏️</button>`:''} ${window.canDel('admin')?`<button class="btn btn-red btn-sm" onclick="window.askDel('user','${u.id}','${esc(u.username)}')">🗑</button>`:''}</div></td></tr>`;}).join('');}).join('')+`</tbody></table></div>`;}
  if(window.initMobileTable)window.initMobileTable(c); // มือถือ: ตารางใน Admin Panel (เช่น Users) → การ์ด
}

// ── helper: show/hide ID badge in modal header ──
function setIdBadge(badgeId, id){
  var el = document.getElementById(badgeId);
  if(!el) return;
  if(id){ el.textContent = 'ID: '+id; el.style.display='inline-block'; }
  else { el.style.display='none'; el.textContent=''; }
}

// ── helper: live color preview ──
function bindColorPreview(inputId, previewId, labelId){
  var inp=document.getElementById(inputId);
  var prev=document.getElementById(previewId);
  var lbl=document.getElementById(labelId);
  if(!inp||!prev)return;
  function update(){
    var c=inp.value;
    prev.style.background=c+'20';
    prev.style.color=c;
    prev.style.border='2px solid '+c+'40';
    prev.textContent=lbl?document.getElementById(lbl).value||'ตัวอย่าง':'ตัวอย่าง';
  }
  inp.addEventListener('input',update);
  if(lbl){var li=document.getElementById(lbl);if(li)li.addEventListener('input',update);}
  update();
}

window._editGroupId=null;
window.admGroupForm=function(id){
  var realId=(id&&id!=='null'&&id!=='')?id:null;
  window._editGroupId=realId;
  var g=realId?window.PGROUPS.find(function(x){return x.id===realId;}):null;
  document.getElementById('m-group-title').textContent=g?'แก้ไขกลุ่มโครงการ':'เพิ่มกลุ่มโครงการ';
  setIdBadge('m-group-id-badge', realId);
  document.getElementById('agf-lbl').value=g?g.label:'';
  document.getElementById('agf-col').value=g?g.color:'#4361ee';
  window.openM('m-group');
  setTimeout(function(){bindColorPreview('agf-col','agf-preview','agf-lbl');},50);
}
window.saveAdmGroup=async function(){
  if(!window.canEdit('admin')||!window.auth.currentUser)return;
  var l=(document.getElementById('agf-lbl')||{}).value||'';if(!l.trim())return;
  var gid=window._editGroupId||'GRP'+Date.now();
  var raw={group_id:gid,label_th:l.trim(),color_hex:document.getElementById('agf-col').value};
  window._applyLocalDoc('PGROUPS',gid,raw);
  window.closeM('m-group');
  window.admTab('groups');
  setDoc(getDocRef('PGROUPS',gid),raw).catch(e=>window.showDbError(e));
}

window._editTypeId=null;
window.admTypeForm=function(id){
  var realId=(id&&id!=='null'&&id!=='')?id:null;
  window._editTypeId=realId;
  var t=realId?window.PTYPES.find(function(x){return x.id===realId;}):null;
  document.getElementById('m-type-title').textContent=t?'แก้ไขประเภทงาน':'เพิ่มประเภทงาน';
  setIdBadge('m-type-id-badge', realId);
  document.getElementById('atf-lbl').value=t?t.label:'';
  document.getElementById('atf-col').value=t?t.color:'#7c5cfc';
  window.openM('m-type');
  setTimeout(function(){bindColorPreview('atf-col','atf-preview','atf-lbl');},50);
}
window.saveAdmType=async function(){
  if(!window.canEdit('admin')||!window.auth.currentUser)return;
  var l=(document.getElementById('atf-lbl')||{}).value||'';if(!l.trim())return;
  var tid=window._editTypeId||'T'+Date.now();
  var raw={type_id:tid,label_th:l.trim(),color_hex:document.getElementById('atf-col').value};
  window._applyLocalDoc('PTYPES',tid,raw);
  window.closeM('m-type');
  window.admTab('types');
  setDoc(getDocRef('PTYPES',tid),raw).catch(e=>window.showDbError(e));
}

window._editPositionId=null;
window.admPositionForm=function(id){
  var realId=(id&&id!=='null'&&id!=='')?id:null;
  window._editPositionId=realId;
  var p=realId?window.POSITIONS.find(function(x){return x.id===realId;}):null;
  document.getElementById('m-position-title').textContent=p?'แก้ไขตำแหน่งงาน':'เพิ่มตำแหน่งงาน';
  setIdBadge('m-position-id-badge', realId);
  document.getElementById('apf-lbl').value=p?p.label:'';
  document.getElementById('apf-rate').value=p&&p.dailyRate?p.dailyRate:'';
  document.getElementById('apf-rank').value=p&&p.rank<99?p.rank:'';
  window.openM('m-position');
}
window.saveAdmPosition=async function(){
  if(!window.canEdit('admin')||!window.auth.currentUser)return;
  var l=(document.getElementById('apf-lbl')||{}).value||'';if(!l.trim())return;
  var pid=window._editPositionId||'POS'+Date.now();
  var rate=parseFloat((document.getElementById('apf-rate')||{}).value)||0;
  var rank=parseInt((document.getElementById('apf-rank')||{}).value,10)||99;
  var raw={position_id:pid,label_th:l.trim(),daily_rate:rate,rank:rank};
  window._applyLocalDoc('POSITIONS',pid,raw);
  window.POSITIONS.sort(window.sortPositionsByRank);
  window.closeM('m-position');
  window.admTab('positions');
  setDoc(getDocRef('POSITIONS',pid),raw).catch(e=>window.showDbError(e));
}

window._editDeptId=null;
window.admDeptForm=function(id){
  var realId=(id&&id!=='null'&&id!=='')?id:null;
  window._editDeptId=realId;
  var d=realId?window.DEPT_LIST.find(function(x){return x.id===realId;}):null;
  document.getElementById('m-dept-icon').textContent=d?'✏️':'🏢';
  document.getElementById('m-dept-title').textContent=d?'แก้ไขแผนก':'เพิ่มแผนก';
  setIdBadge('m-dept-id-badge', realId);
  document.getElementById('adf-lbl').value=d?d.label:'';
  window.openM('m-department');
}
window.saveAdmDept=async function(){
  if(!window.canEdit('admin')||!window.auth.currentUser)return;
  var l=(document.getElementById('adf-lbl')||{}).value||'';if(!l.trim())return;
  var did=window._editDeptId||'DEPT'+Date.now();
  var dObj={id:did,label:l.trim()};
  var dIdx=window.DEPT_LIST.findIndex(function(x){return x.id===did;});
  if(dIdx>=0)window.DEPT_LIST[dIdx]=dObj;else window.DEPT_LIST.push(dObj);
  window.DEPARTMENTS=window.DEPT_LIST.map(function(d){return d.label;});
  window.closeM('m-department');
  window.admTab('dept');
  setDoc(getDocRef('DEPARTMENTS',did),{dept_id:did,label_th:l.trim()}).catch(e=>window.showDbError(e));
}

window.saveAllowanceRates=async function(){
  if(!window.canEdit('admin')||!window.auth.currentUser)return;
  var data={
    allowance_weekday_normal: parseFloat(document.getElementById('rt-wn').value)||350,
    allowance_holiday_normal: parseFloat(document.getElementById('rt-hn').value)||650,
    allowance_weekday_border: parseFloat(document.getElementById('rt-wb').value)||650,
    allowance_holiday_border: parseFloat(document.getElementById('rt-hb').value)||1250,
  };
  try{
    await setDoc(getDocRef('SETTINGS','app'),data,{merge:true});
    window.showAlert('บันทึกอัตราเบี้ยเลี้ยงสำเร็จ','success');
  }catch(e){window.showDbError(e);}
};

window._editStageId=null;
window.admStageForm=function(id){
  var realId=(id&&id!=='null'&&id!=='')?id:null;
  window._editStageId=realId;
  var s=realId?window.STAGES.find(function(x){return x.id===realId;}):null;
  document.getElementById('m-stage-title').textContent=s?'แก้ไข PM Stage':'เพิ่ม PM Stage';
  setIdBadge('m-stage-id-badge', realId);
  document.getElementById('asgf-lbl').value=s?s.label:'';
  document.getElementById('asgf-col').value=s?s.color:'#9ba3b8';
  window.openM('m-stage');
  setTimeout(function(){bindColorPreview('asgf-col','asgf-preview','asgf-lbl');},50);
}
window.saveAdmStage=async function(){
  if(!window.canEdit('admin')||!window.auth.currentUser)return;
  var l=(document.getElementById('asgf-lbl')||{}).value||'';if(!l.trim())return;
  var sid=window._editStageId||'STG'+Date.now();
  var maxOrder=window.STAGES.length>0?Math.max(...window.STAGES.map(s=>s.order||0)):0;
  var order=window._editStageId?(window.STAGES.find(x=>x.id===window._editStageId)||{}).order||maxOrder:maxOrder+1;
  var rule=(document.getElementById('asgf-rule')||{}).value||'';
  var offset=parseInt((document.getElementById('asgf-offset')||{}).value)||0;
  var prog=parseInt((document.getElementById('asgf-prog')||{}).value);if(isNaN(prog))prog=-1;
  var raw={stage_id:sid,label_th:l.trim(),color_hex:document.getElementById('asgf-col').value,order:order,auto_rule:rule,auto_offset:offset,set_progress:prog};
  window._applyLocalDoc('STAGES',sid,raw);
  window.STAGES.sort(function(a,b){return a.order-b.order;});
  window.closeM('m-stage');
  window.admTab('stages');
  setDoc(getDocRef('STAGES',sid),raw,{merge:true}).catch(e=>window.showDbError(e));
}
window.stgDragId=null;window.stgDrag=function(e,id){window.stgDragId=id;}
window.stgDrop=async function(e,targetId){e.preventDefault();if(!window.stgDragId||window.stgDragId===targetId||!window.canEdit('admin'))return;let arr=[...window.STAGES];let fromIdx=arr.findIndex(x=>x.id===window.stgDragId);let toIdx=arr.findIndex(x=>x.id===targetId);if(fromIdx<0||toIdx<0)return;let[moved]=arr.splice(fromIdx,1);arr.splice(toIdx,0,moved);arr.forEach((s,i)=>s.order=i+1);window.STAGES=arr;window.admTab('stages');try{const batch=writeBatch();arr.forEach(s=>{batch.update(getDocRef('STAGES',s.id),{order:s.order});});await batch.commit();}catch(err){window.showDbError(err);}window.stgDragId=null;}
window._editStaffId = null;
window.admStaffForm=function(id){
  var realId = (id && id !== 'null' && id !== '') ? id : null;
  window._editStaffId = realId;
  var s = realId ? window.STAFF.find(function(x){return x.id===realId;}) : null;
  var deptOpts=`<option value="">-- เลือกแผนก --</option>`+window.DEPT_LIST.map(function(d){return`<option value="${esc(d.id)}"${s&&s.deptId===d.id?' selected':''}>🏢 ${esc(d.label)}</option>`;}).join('');
  var posOpts=`<option value="">-- เลือกตำแหน่ง --</option>`+window.POSITIONS.map(function(p){return`<option value="${esc(p.id)}"${s&&s.positionId===p.id?' selected':''}>💼 ${esc(p.label)}</option>`;}).join('');
  var iconEl=document.getElementById('m-staff-icon');
  var titleEl=document.getElementById('m-staff-title');
  if(iconEl) iconEl.textContent = s ? '✏️' : '👤';
  if(titleEl) titleEl.textContent = s ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงานใหม่';
  setIdBadge('m-staff-id-badge', realId);
  var si = s ? window.STAFF.indexOf(s) : 0;
  var avatarHtml = s
    ? `<div style="display:flex;justify-content:center;margin-bottom:12px">
        <div class="av" style="background:${avC(si)};width:48px;height:48px;font-size:19px;border-radius:13px;">${s.name.charAt(0)}</div>
       </div>`
    : `<div style="display:flex;justify-content:center;margin-bottom:12px">
        <div style="width:48px;height:48px;border-radius:13px;background:linear-gradient(135deg,var(--violet),var(--coral));display:flex;align-items:center;justify-content:center;font-size:22px;">👤</div>
       </div>`;
  document.getElementById('m-staff-body').innerHTML = avatarHtml + `
    <div class="f-grid">
      <div class="f-group"><label class="f-label">ชื่อ-นามสกุล *</label><input class="f-input" id="asf-name" value="${esc(s?s.name:'')}" placeholder="ชื่อ-นามสกุล"></div>
      <div class="f-group"><label class="f-label">ชื่อเล่น</label><input class="f-input" id="asf-nick" value="${esc(s?s.nickname:'')}" placeholder="ชื่อเล่น"></div>
      <div class="f-group"><label class="f-label">แผนก</label><select class="f-input" id="asf-dept">${deptOpts}</select></div>
      <div class="f-group"><label class="f-label">ตำแหน่ง</label><select class="f-input" id="asf-role">${posOpts}</select></div>
      <div class="f-group"><label class="f-label">Email</label><input class="f-input" id="asf-email" value="${esc(s?s.email:'')}" placeholder="email@company.com"></div>
      <div class="f-group"><label class="f-label">เบอร์โทร</label><input class="f-input" id="asf-phone" value="${esc(s?s.phone:'')}" placeholder="08X-XXX-XXXX"></div>
      <div class="f-group"><label class="f-label">วันเริ่มงาน</label><input type="date" class="f-input" id="asf-start" value="${s&&s.start_date?s.start_date:''}"></div>
      <div class="f-group"><label class="f-label">สถานะ</label><select class="f-input" id="asf-active">
        <option value="TRUE" ${!s||s.active!==false?'selected':''}>✅ Active</option>
        <option value="FALSE" ${s&&s.active===false?'selected':''}>❌ Inactive</option>
      </select></div>
      <div class="f-group"><label class="f-label">อัตราค่าแรง (฿/วัน)</label><input type="number" class="f-input" id="asf-rate" value="${s&&s.dailyRate!=null?s.dailyRate:''}" placeholder="ว่าง = ใช้จากตำแหน่ง"></div>
      <div class="f-group" style="grid-column:span 2"><label class="f-label">หมายเหตุ</label><input class="f-input" id="asf-remark" value="${esc(s&&s.remark?s.remark:'')}" placeholder="หมายเหตุ (ถ้ามี)"></div>
    </div>`;
  window.openM('m-staff');
}
window.saveAdmStaff=async function(){
  if(!window.canEdit('admin')||!window.auth.currentUser)return;
  var nm=(document.getElementById('asf-name')||{}).value||'';if(!nm.trim())return;
  var id=window._editStaffId;
  var sid=id||'S'+Date.now();
  var rateVal=parseFloat((document.getElementById('asf-rate')||{}).value);
  // ฟอร์มไม่มีช่องวันเกิด (ตั้งได้จากนำเข้า Excel) — แก้ไขพนักงานต้องคงค่าเดิมไว้ ไม่เขียนทับเป็นค่าว่าง
  let dbStf={staff_id:sid,full_name:nm.trim(),nickname:document.getElementById('asf-nick').value.trim()||nm.split(' ')[0],department:document.getElementById('asf-dept').value,position:document.getElementById('asf-role').value,email:document.getElementById('asf-email').value,phone:document.getElementById('asf-phone').value,is_active:document.getElementById('asf-active').value==='TRUE',start_date:document.getElementById('asf-start').value,birth_date:(id&&(window.STAFF.find(function(x){return x.id===id;})||{}).birth_date)||'',remark:document.getElementById('asf-remark').value,daily_rate:isNaN(rateVal)?null:rateVal};
  window._applyLocalDoc('STAFF',sid,dbStf);
  window.closeM('m-staff');
  window.admTab('staff');
  setDoc(getDocRef('STAFF',sid),dbStf).catch(e=>window.showDbError(e));
}
window._editUserId=null;
window.admUserForm=function(id){
  var realId=(id&&id!=='null'&&id!=='')?id:null;
  window._editUserId=realId;
  var u=realId?window.USERS.find(function(x){return x.id===realId;}):null;
  document.getElementById('m-user-icon').textContent=u?'✏️':'🔑';
  document.getElementById('m-user-title').textContent=u?'แก้ไขบัญชีผู้ใช้':'เพิ่มบัญชีผู้ใช้';
  setIdBadge('m-user-id-badge', realId);
  document.getElementById('auf-u').value=u?u.username:'';
  // รหัสตั้งต้น 123456 (PwPolicy.DEFAULT) — ผู้ใช้เข้าระบบครั้งแรกถูกบังคับตั้งรหัสใหม่เอง (auth.service.js)
  // บัญชีใหม่ / มีคำขอรีเซ็ต ("ลืมรหัสผ่าน?") → ใส่ให้เลย · แก้ไขทั่วไป → ว่าง (ไม่เปลี่ยน) กดปุ่มรีเซ็ตได้
  document.getElementById('auf-p').value=(!u||u.resetRequestedAt)?window.PwPolicy.DEFAULT:'';
  document.getElementById('auf-p').placeholder=u?'(ว่างไว้ = ไม่เปลี่ยนรหัสผ่าน)':'กำหนดรหัสผ่าน...';
  document.getElementById('auf-n').value=u?u.name:'';
  // กลุ่มสิทธิ์ — ติ๊กได้หลายกลุ่ม · บัญชีใหม่เริ่มที่ "เจ้าหน้าที่ปฏิบัติงาน" (ถ้ามีกลุ่มนี้)
  var cur=u?u.roles:(window.ROLES.some(function(r){return r.id==='staff';})?['staff']:[]);
  document.getElementById('auf-roles').innerHTML=window.ROLES.map(function(r){
    return'<label class="auf-role" style="--rc:'+esc(r.color)+'"><input type="checkbox" value="'+esc(r.id)+'"'+(cur.indexOf(r.id)>-1?' checked':'')+' onchange="window._aufRolesPreview()"><span>'+esc(r.name)+'</span></label>';
  }).join('');
  window._aufRolesPreview();
  var stfSel=document.getElementById('auf-staff');
  if(stfSel){
    stfSel.innerHTML='<option value="">-- ไม่ผูก --</option>'+window.staffOptionsGrouped(window.STAFF.filter(function(s){return s.active!==false;}),u&&u.staffId);
    // ผูกไว้แล้ว = ถือว่าเลือกเองแล้ว ไม่ให้ตัวจับคู่อัตโนมัติเปลี่ยน
    _aufStaffManual=!!(u&&u.staffId);
    stfSel.onchange=function(){_aufStaffManual=true;window._aufStaffSuggest();};
  }
  window._aufStaffSuggest();
  window.openM('m-user');
}

// ── จับคู่ "ผูกกับพนักงาน" อัตโนมัติ จากชื่อที่แสดง + Username ──
// เทียบกับ ชื่อ-นามสกุล / ชื่อเล่น / Email ของพนักงาน (ประมวลผลในเบราว์เซอร์ ไม่เรียก API ภายนอก)
// มั่นใจ (คะแนนสูงและทิ้งห่างอันดับสอง) → เลือกให้เลย · ไม่ชัด → แสดงตัวเลือกให้กดเลือกเอง
var _aufStaffManual=false;
var AUF_TITLE_RE=/^(?:นางสาว|นาย|นาง|น\.ส\.|ดร\.|คุณ(?=\s)|(?:mrs|mr|ms|miss|dr)(?:\.|\s))\s*/i;
function aufNorm(s){return String(s||'').toLowerCase().trim().replace(AUF_TITLE_RE,'').replace(/[\s._\-]+/g,'');}
function aufTokens(s){return String(s||'').toLowerCase().split(/[\s._\-@]+/).map(function(t){return t.replace(AUF_TITLE_RE,'');}).filter(function(t){return t.length>=2;});}
function aufSim(a,b){ // ความคล้ายของสตริง 0–1 (Levenshtein)
  if(!a||!b)return 0;if(a===b)return 1;
  var m=a.length,n=b.length,prev=[],cur,i,j;
  for(j=0;j<=n;j++)prev[j]=j;
  for(i=1;i<=m;i++){cur=[i];for(j=1;j<=n;j++)cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=cur;}
  return 1-prev[n]/Math.max(m,n);
}
function aufScoreStaff(s,name,user){
  var nm=aufNorm(name),un=aufNorm(user),full=aufNorm(s.name),nick=aufNorm(s.nickname);
  var first=aufNorm(String(s.name||'').replace(AUF_TITLE_RE,'').split(/\s+/)[0]);
  var mail=aufNorm(String(s.email||'').split('@')[0]);
  var best=[0,''];
  function hit(sc,why){if(sc>best[0])best=[sc,why];}
  if(nm&&full){
    if(nm===full)hit(100,'ชื่อ-นามสกุลตรงกัน');
    else if(nm.length>=4&&(full.indexOf(nm)>-1||nm.indexOf(full)>-1))hit(88,'ชื่อตรงบางส่วน');
    else{var r=aufSim(nm,full);if(r>=0.8)hit(Math.round(r*85),'ชื่อใกล้เคียง');}
  }
  if(un&&mail&&un===mail)hit(95,'Username ตรงกับ Email');
  if(un&&full&&un===full)hit(95,'Username ตรงกับชื่อ');
  var toks=aufTokens(name).concat(aufTokens(user)).map(aufNorm);
  toks.forEach(function(t){
    if(first&&t===first)hit(72,'ชื่อต้นตรงกัน');
    if(nick&&t===nick)hit(65,'ชื่อเล่นตรงกัน');
    if(mail&&t.length>=3&&t===mail)hit(90,'ตรงกับ Email');
  });
  return{s:s,score:best[0],why:best[1]};
}
window._aufStaffSuggest=function(){
  var sel=document.getElementById('auf-staff'),box=document.getElementById('auf-staff-ai');
  if(!sel||!box)return;
  var name=(document.getElementById('auf-n')||{}).value||'',user=(document.getElementById('auf-u')||{}).value||'';
  // พนักงานที่ผูกกับบัญชีอื่นอยู่แล้ว ไม่นำมาแนะนำ
  var taken={};(window.USERS||[]).forEach(function(x){if(x.staffId&&x.id!==window._editUserId)taken[x.staffId]=1;});
  var list=(name.trim()||user.trim())?window.STAFF.filter(function(s){return s.active!==false&&!taken[s.id];})
    .map(function(s){return aufScoreStaff(s,name,user);}).filter(function(r){return r.score>=60;})
    .sort(function(a,b){return b.score-a.score;}).slice(0,3):[];
  if(_aufStaffManual){
    box.innerHTML=(!sel.value&&list.length)?aufChipsHtml(list,'🤖 พนักงานที่น่าจะใช่:'):'';
    return;
  }
  var top=list[0],sure=top&&top.score>=70&&(!list[1]||top.score-list[1].score>=10);
  sel.value=sure?top.s.id:'';
  box.innerHTML=sure?'🤖 จับคู่อัตโนมัติ: <b>'+esc(top.s.name)+'</b> <span style="opacity:.75">('+esc(top.why)+')</span>'
    :(list.length?aufChipsHtml(list,'🤖 พบหลายคนที่ใกล้เคียง — กดเลือก:'):'');
};
function aufChipsHtml(list,label){
  return label+' '+list.map(function(r){
    return'<button type="button" class="auf-ai-chip" onclick="window._aufPickStaff(\''+esc(r.s.id)+'\')" title="'+esc(r.why)+'">'+esc(r.s.name)+(r.s.nickname?' ('+esc(r.s.nickname)+')':'')+'</button>';
  }).join(' ');
}
window._aufPickStaff=function(id){
  var sel=document.getElementById('auf-staff');if(!sel)return;
  sel.value=id;_aufStaffManual=true;
  var s=window.STAFF.find(function(x){return x.id===id;});
  document.getElementById('auf-staff-ai').innerHTML=s?'✅ ผูกกับ <b>'+esc(s.name)+'</b>':'';
};
window.saveAdmUser=async function(){
  if(!window.canEdit('admin')||!window.auth.currentUser)return;
  var un=(document.getElementById('auf-u')||{}).value||'';
  var nm=(document.getElementById('auf-n')||{}).value||'';
  if(!un.trim()||!nm.trim())return;
  var pw=document.getElementById('auf-p').value;
  var id=window._editUserId;
  var ex=id?window.USERS.find(function(x){return x.id===id;}):null;
  var uid2=id||'U'+Date.now();
  var roles=aufCheckedRoles();
  // ต้องเหลือผู้ใช้กลุ่ม Admin (is_super) ที่ใช้งานอยู่อย่างน้อย 1 คน — กันไม่มีใครเข้าหน้าจัดการสิทธิ์ได้อีก
  var isSup=function(ids){return window.ROLES.some(function(r){return r.super&&ids.indexOf(r.id)>-1;});};
  if(ex&&isSup(ex.roles)&&!isSup(roles)&&!window.USERS.some(function(x){return x.id!==uid2&&x.active!==false&&isSup(x.roles);})){
    window.showAlert('ต้องมีผู้ใช้กลุ่ม Admin อย่างน้อย 1 คน','warn');return;
  }
  // password: ฐานข้อมูลแปลงเป็น bcrypt แล้วล้างช่องทิ้งเอง (trigger ใน db-schema.sql SECURITY) · ว่าง = ไม่เปลี่ยนรหัส
  var dbUsr={user_id:uid2,username:un.trim(),name:nm.trim(),roles:roles,password:pw||'',is_active:true,staff_id:(document.getElementById('auf-staff')||{value:''}).value||''};
  // ตั้งรหัสผ่านใหม่ให้คนที่ขอรีเซ็ตไว้ ("ลืมรหัสผ่าน?" หน้า Login) → ล้างคำขอ (ใส่เฉพาะตอนมีคำขอ — คอลัมน์ต้องมีอยู่แล้ว)
  if(pw&&ex&&ex.resetRequestedAt)dbUsr.pw_reset_requested_at=null;
  window._applyLocalDoc('USERS',uid2,dbUsr);
  window.closeM('m-user');
  window.admTab('users');
  setDoc(getDocRef('USERS',uid2),dbUsr).then(function(){
    // ตั้งรหัสใหม่ = session เดิมของบัญชีนั้นถูกปิด — บัญชีตัวเอง → ขอ session ใหม่ด้วยรหัสใหม่ ใช้งานต่อได้เลย
    if(pw&&window.cu&&uid2===window.cu.id)window.BmsSession.login(window.getDb(),un.trim(),pw,window.BmsSession.persisted()).catch(function(){});
  }).catch(e=>window.showDbError(e));
}

// ── กลุ่มสิทธิ์ (ตาราง roles) ──
// ผู้ใช้มีได้หลายกลุ่ม (users.roles) → สิทธิ์รวมกัน (permission.util.js) · กลุ่ม is_super = สิทธิ์เต็ม (แก้ไม่ได้จากหน้านี้)
function rlIcon(n){return window.appIcon?window.appIcon(n):'';}
// ตารางผู้ใช้งานระบบ: จัดกลุ่มตามกลุ่มสิทธิ์ (เรียงตาม sort_order) · ผู้ใช้หลายกลุ่มแสดงซ้ำในทุกกลุ่มที่สังกัด
function usersByRole(){
  var groups=window.ROLES.map(function(r){return{name:r.name,color:r.color,users:[]};}),none={name:'ไม่มีกลุ่มสิทธิ์',color:'var(--txt3)',users:[]};
  window.USERS.forEach(function(u){
    var rs=window.rolesOf(u);
    if(!rs.length)none.users.push(u);
    rs.forEach(function(r){groups[window.ROLES.indexOf(r)].users.push(u);});
  });
  return groups.concat([none]).filter(function(g){
    g.users=window.sortUsersByRank(g.users);
    return g.users.length;
  });
}
// พนักงานที่ผูกกับบัญชี (ตารางผู้ใช้งานระบบ)
function staffLinkTag(u){
  var s=u.staffId&&window.STAFF.find(function(x){return x.id===u.staffId;});
  if(!s)return'<span class="tag" style="background:rgba(245,158,11,.12);color:#b45309">ยังไม่ผูก</span>';
  return'<span style="font-weight:600">'+esc(s.name)+'</span>'+(s.dept?'<div style="font-size:11px;color:var(--txt3)">'+esc(s.dept)+'</div>':'');
}
function aufCheckedRoles(){
  return Array.prototype.map.call(document.querySelectorAll('#auf-roles input:checked'),function(el){return el.value;});
}
// ฟอร์มผู้ใช้: สรุปเมนูที่จะเห็นจากกลุ่มที่ติ๊ก (สิทธิ์รวม)
window._aufRolesPreview=function(){
  var el=document.getElementById('auf-roles-sum');if(!el)return;
  var ids=aufCheckedRoles();
  el.classList.remove('warn');
  if(!ids.length){el.classList.add('warn');el.innerHTML='⚠️ ไม่ได้เลือกกลุ่ม — เข้าระบบได้แต่ไม่เห็นเมนูใดเลย';return;}
  var eff=window.permsForRoles(window.ROLES.filter(function(r){return ids.indexOf(r.id)>-1;}));
  if(eff.superUser){el.innerHTML='🛡️ สิทธิ์เต็มทุกเมนู';return;}
  var mods=window.PERM_MODULES.filter(function(m){return eff.perms[m.id]&&eff.perms[m.id].view;});
  el.innerHTML='<div class="auf-sum-h">เมนูที่เห็น <b>'+mods.length+'</b> เมนู</div><div class="auf-sum-list">'+(mods.map(function(m){return'<span>'+esc(m.label)+'</span>';}).join('')||'—')+'</div>';
};

var RL_ACTS=[{id:'view',label:'ดู'},{id:'add',label:'เพิ่ม'},{id:'edit',label:'แก้'},{id:'del',label:'ลบ'},{id:'approve',label:'อนุมัติ'}];
var RL_SCOPES=[{id:'own',label:'ของตัวเอง'},{id:'dept',label:'ทั้งแผนก'},{id:'all',label:'ทั้งหมด'}];
// draft = สำเนากลุ่มที่กำลังแก้ (id null = กลุ่มใหม่ยังไม่บันทึก) · dirty = มีการแก้ที่ยังไม่บันทึก
var _rl={draft:null,dirty:false};

function rlMembers(id){return window.sortUsersByRank(window.USERS.filter(function(u){return u.roles.indexOf(id)>-1;}));}
function rlClone(r){return{id:r.id,name:r.name,color:r.color,order:r.order,super:r.super,home:r.home,perms:JSON.parse(JSON.stringify(r.perms||{}))};}
function rlSort(a,b){return a.order-b.order||a.name.localeCompare(b.name,'th');}
function rlNextOrder(){return window.ROLES.reduce(function(m,r){return Math.max(m,r.order<99?r.order:0);},0)+1;}
function rlGroups(){
  var gs=[];
  window.PERM_MODULES.forEach(function(m){var g=gs.find(function(x){return x.g===m.g;});if(!g)gs.push(g={g:m.g,mods:[]});g.mods.push(m);});
  return gs;
}
function rlModActs(m){return RL_ACTS.filter(function(a){return a.id!=='approve'||m.approve;}).map(function(a){return a.id;});}

function renderAdmRoles(c,titleEl){
  if(titleEl)titleEl.innerHTML=rlIcon('shield-lock')+' กลุ่มสิทธิ์การใช้งาน';
  admActions('<button class="btn btn-pri" onclick="window.rlNew()">+ เพิ่มกลุ่มสิทธิ์</button>');
  var d=_rl.draft,live=d&&d.id&&window.ROLES.find(function(r){return r.id===d.id;});
  // ยังไม่เลือก / กลุ่มที่เลือกถูกลบไปแล้ว → กลุ่มแรก · ไม่ได้แก้ค้างไว้ → ใช้ข้อมูลล่าสุดจากฐานข้อมูล
  if(!d||(d.id&&!live)){var first=window.ROLES[0];_rl.draft=first?rlClone(first):null;_rl.dirty=false;}
  else if(live&&!_rl.dirty)_rl.draft=rlClone(live);
  c.innerHTML='<div class="rl-wrap"><div class="rl-list" id="rl-list"></div><div class="rl-edit" id="rl-edit"></div></div>';
  rlRenderList();rlRenderEdit();
}
function rlRenderList(){
  var el=document.getElementById('rl-list');if(!el)return;
  var d=_rl.draft;
  el.innerHTML=window.ROLES.map(function(r){
    var on=d&&d.id===r.id,name=on?d.name:r.name,color=on?d.color:r.color;
    return'<div class="rl-item'+(on?' on':'')+'" style="--rc:'+esc(color)+'" onclick="window.rlSelect(\''+esc(r.id)+'\')">'
      +'<span class="rl-dot"></span><span class="rl-name">'+esc(name||'—')+'</span>'
      +(r.super?'<span class="rl-badge">เต็ม</span>':'')
      +'<span class="rl-cnt">'+rlMembers(r.id).length+' คน</span></div>';
  }).join('')
  +(d&&!d.id?'<div class="rl-item on" style="--rc:'+esc(d.color)+'"><span class="rl-dot"></span><span class="rl-name">'+esc(d.name||'กลุ่มใหม่')+'</span><span class="rl-badge">ใหม่</span></div>':'');
}
function rlRenderEdit(){
  var el=document.getElementById('rl-edit');if(!el)return;
  var d=_rl.draft;
  if(!d){el.innerHTML='<div class="rl-empty">ยังไม่มีกลุ่มสิทธิ์ · กด + เพิ่มกลุ่มสิทธิ์</div>';return;}
  var homeOpts='<option value="">— เมนูแรกที่เห็น —</option>'+window.PERM_MODULES.filter(function(m){return window.ROUTE_MAP[m.id];}).map(function(m){
    return'<option value="'+m.id+'"'+(d.home===m.id?' selected':'')+'>'+esc(m.label)+'</option>';
  }).join('');
  var mem=d.id?rlMembers(d.id):[];
  el.innerHTML='<div class="rl-head">'
      +'<input type="color" class="rl-color" value="'+esc(d.color)+'" oninput="window.rlSet(\'color\',this.value)" title="สีของกลุ่ม">'
      +'<input class="f-input rl-name-in" value="'+esc(d.name)+'" placeholder="ชื่อกลุ่มสิทธิ์" oninput="window.rlSet(\'name\',this.value)">'
    +'</div>'
    +'<div class="rl-meta">'
      +'<label><span>หน้าแรกหลัง Login</span><select class="f-input" onchange="window.rlSet(\'home\',this.value)">'+homeOpts+'</select></label>'
      +'<label title="ผู้ใช้หลายกลุ่ม: กลุ่มลำดับน้อยกว่ากำหนดหน้าแรกและสีอวาตาร์"><span>ลำดับ</span><input type="number" class="f-input" min="1" value="'+(d.order<99?d.order:'')+'" oninput="window.rlSet(\'order\',Number(this.value)||99)"></label>'
    +'</div>'
    +(d.super?'<div class="rl-super">🛡️ กลุ่มนี้มีสิทธิ์เต็มทุกเมนู ไม่ต้องกำหนดรายเมนู — ให้เฉพาะผู้ดูแลระบบ</div>':rlTable(d))
    +'<div class="rl-sec">ผู้ใช้ในกลุ่มนี้ ('+mem.length+')</div>'
    +'<div class="rl-members">'+(mem.map(function(u){return'<span class="rl-mem">'+esc(window.userNameById(u.id)||u.username)+'</span>';}).join('')||'<span class="rl-none">'+(d.id?'ยังไม่มี':'บันทึกกลุ่มก่อน')+' — กำหนดกลุ่มให้ผู้ใช้ได้ที่ ผู้ใช้งานระบบ</span>')+'</div>'
    +'<div class="rl-foot" id="rl-foot"></div>';
  rlRenderFoot();
}
function rlRenderFoot(){
  var el=document.getElementById('rl-foot');if(!el)return;
  var d=_rl.draft;
  el.innerHTML=(d.id&&!d.super?'<button class="btn btn-red" onclick="window.rlDelete()">🗑 ลบกลุ่ม</button>':'')
    +(d.id&&!d.super?'<button class="btn btn-ghost" onclick="window.rlCopy()">⧉ คัดลอกเป็นกลุ่มใหม่</button>':'')
    +'<span style="flex:1"></span>'
    +(_rl.dirty?'<button class="btn btn-ghost" onclick="window.rlRevert()">ยกเลิกการแก้ไข</button>':'')
    +'<button class="btn btn-pri" onclick="window.rlSave()"'+(_rl.dirty?'':' disabled')+'>💾 บันทึก</button>';
}
function rlTable(d){
  var head='<tr><th class="rl-mod adm-perm-mod">เมนู</th>'+RL_ACTS.map(function(a){
    return'<th class="rl-act" onclick="window.rlCol(\''+a.id+'\')" title="กดเพื่อเปิด/ปิดทั้งคอลัมน์">'+a.label+'</th>';
  }).join('')+'<th>ขอบเขตข้อมูล</th></tr>';
  var rows=rlGroups().map(function(g,i){
    return'<tr class="rl-grp"><td colspan="'+(RL_ACTS.length+2)+'" onclick="window.rlGroup('+i+')" title="กดเพื่อเปิด/ปิดทั้งหมวด">'+esc(g.g)+'</td></tr>'
      +g.mods.map(function(m){return rlRow(d,m);}).join('');
  }).join('');
  return'<div class="rl-tbl-wrap"><table class="rl-tbl adm-perm-tbl"><thead>'+head+'</thead><tbody>'+rows+'</tbody></table></div>'
    +'<div class="rl-hint">ติ๊ก เพิ่ม/แก้/ลบ/อนุมัติ จะเปิด "ดู" ให้เอง · เอา "ดู" ออก = ปิดทั้งแถว · กดหัวคอลัมน์ ชื่อหมวด หรือชื่อเมนู เพื่อเปิด/ปิดทั้งชุด'
    +'<br>ขอบเขตข้อมูล: <b>ของตัวเอง</b> = เห็นเฉพาะรายการของพนักงานที่ผูกกับบัญชี · <b>ทั้งแผนก</b> = เฉพาะแผนกของพนักงานที่ผูกไว้</div>';
}
function rlRow(d,m){
  var p=d.perms[m.id]||{};
  var cells=RL_ACTS.map(function(a){
    if(a.id==='approve'&&!m.approve)return'<td class="rl-na">—</td>';
    return'<td><input type="checkbox" class="perm-cb"'+(p[a.id]?' checked':'')+' onchange="window.rlToggle(\''+m.id+'\',\''+a.id+'\',this.checked)"></td>';
  }).join('');
  var scope=m.scope?'<select class="f-input rl-scope" onchange="window.rlScope(\''+m.id+'\',this.value)"'+(p.view?'':' disabled')+'>'
    +RL_SCOPES.map(function(s){return'<option value="'+s.id+'"'+((p.scope||'all')===s.id?' selected':'')+'>'+s.label+'</option>';}).join('')+'</select>':'';
  return'<tr data-row="'+m.id+'"><td class="rl-mod adm-perm-mod" onclick="window.rlRowAll(\''+m.id+'\')" title="กดเพื่อเปิด/ปิดทั้งแถว">'+rlIcon(m.icon)+' '+esc(m.label)+'</td>'+cells+'<td>'+scope+'</td></tr>';
}
function rlDirty(){_rl.dirty=true;rlRenderFoot();}
// เปิด/ปิดสิทธิ์หนึ่งช่อง: เปิดอะไรก็ตาม = เปิด "ดู" ด้วย · ปิด "ดู" = ปิดทั้งแถว · ไม่เหลือสิทธิ์ = ลบ key ออก
function rlApply(m,act,on){
  var perms=_rl.draft.perms,p=perms[m.id]||(perms[m.id]={});
  if(act==='view'&&!on)rlModActs(m).forEach(function(a){p[a]=false;});
  else{p[act]=on;if(on)p.view=true;}
  if(m.scope&&p.view&&!p.scope)p.scope='all';
  if(!rlModActs(m).some(function(a){return p[a];}))delete perms[m.id];
}
function rlMod(id){return window.PERM_MODULES.find(function(m){return m.id===id;});}
function rlFullRow(m){var p=_rl.draft.perms[m.id]||{};return rlModActs(m).every(function(a){return p[a];});}
function rlRefreshRow(m){var tr=document.querySelector('#rl-edit tr[data-row="'+m.id+'"]');if(tr)tr.outerHTML=rlRow(_rl.draft,m);}
window.rlToggle=function(modId,act,on){var m=rlMod(modId);rlApply(m,act,on);rlRefreshRow(m);rlDirty();};
window.rlScope=function(modId,v){var p=_rl.draft.perms[modId];if(p)p.scope=v;rlDirty();};
window.rlRowAll=function(modId){
  var m=rlMod(modId),on=!rlFullRow(m);
  if(on)rlModActs(m).forEach(function(a){rlApply(m,a,true);});else rlApply(m,'view',false);
  rlRefreshRow(m);rlDirty();
};
window.rlCol=function(act){
  var mods=window.PERM_MODULES.filter(function(m){return rlModActs(m).indexOf(act)>-1;});
  var on=mods.some(function(m){return!(_rl.draft.perms[m.id]||{})[act];});
  mods.forEach(function(m){rlApply(m,act,on);});
  _rl.dirty=true;rlRenderEdit();
};
window.rlGroup=function(i){
  var mods=rlGroups()[i].mods,on=!mods.every(rlFullRow);
  mods.forEach(function(m){if(on)rlModActs(m).forEach(function(a){rlApply(m,a,true);});else rlApply(m,'view',false);});
  _rl.dirty=true;rlRenderEdit();
};
window.rlSet=function(k,v){
  _rl.draft[k]=v;
  if(k==='name'||k==='color')rlRenderList();
  rlDirty();
};
// มีการแก้ที่ยังไม่บันทึก → ถามก่อนทิ้ง
function rlLeave(fn){
  if(!_rl.dirty){fn();return;}
  window.showConfirm('กลุ่มที่กำลังแก้ยังไม่ได้บันทึก — ทิ้งการแก้ไข?',fn,{icon:'⚠️',title:'ยังไม่ได้บันทึก',okColor:'var(--amber)',okText:'ทิ้งการแก้ไข'});
}
window.rlSelect=function(id){
  if(_rl.draft&&_rl.draft.id===id)return;
  rlLeave(function(){var r=window.ROLES.find(function(x){return x.id===id;});_rl.draft=r?rlClone(r):null;_rl.dirty=false;window.admTab('roles');});
};
window.rlNew=function(){
  rlLeave(function(){_rl.draft={id:null,name:'กลุ่มใหม่',color:'#7c5cfc',order:rlNextOrder(),super:false,home:'',perms:{}};_rl.dirty=true;window.admTab('roles');});
};
window.rlCopy=function(){
  var src=_rl.draft;
  rlLeave(function(){var d=rlClone(src);d.id=null;d.name=src.name+' (สำเนา)';d.super=false;d.order=rlNextOrder();_rl.draft=d;_rl.dirty=true;window.admTab('roles');});
};
window.rlRevert=function(){
  var d=_rl.draft,r=d&&d.id&&window.ROLES.find(function(x){return x.id===d.id;});
  _rl.draft=r?rlClone(r):null;_rl.dirty=false;window.admTab('roles');
};
window.rlSave=async function(){
  if(!window.isAdmin()||!window.auth.currentUser)return;
  var d=_rl.draft;if(!d)return;
  var name=(d.name||'').trim();
  if(!name){window.showAlert('กรุณาตั้งชื่อกลุ่มสิทธิ์','warn');return;}
  if(window.ROLES.some(function(r){return r.id!==d.id&&r.name.trim()===name;})){window.showAlert('มีกลุ่มชื่อนี้แล้ว','warn');return;}
  var id=d.id||('R'+Date.now());
  var row={name:name,color:d.color,sort_order:d.order||99,is_super:!!d.super,home_view:d.home||'',perms:d.super?{}:d.perms};
  try{await setDoc(getDocRef('ROLES',id),row);}catch(e){window.showDbError(e);return;}
  // อัปเดตในเครื่องทันที — แทนที่ทั้ง array (permission.util.js คำนวณสิทธิ์ใหม่เมื่อ reference เปลี่ยน)
  var obj={id:id,name:name,color:row.color,order:row.sort_order,super:row.is_super,home:row.home_view,perms:row.perms};
  window.ROLES=window.ROLES.filter(function(r){return r.id!==id;}).concat([obj]).sort(rlSort);
  _rl.draft=rlClone(obj);_rl.dirty=false;
  window.showAlert('บันทึกกลุ่มสิทธิ์แล้ว','success');
  window.setupUser&&window.setupUser();
  window.admTab('roles');
};
window.rlDelete=function(){
  var d=_rl.draft;if(!d||!d.id||d.super||!window.isAdmin())return;
  var n=rlMembers(d.id).length;
  if(n){window.showAlert('ยังมีผู้ใช้ '+n+' คนในกลุ่มนี้ — นำออกจากกลุ่มก่อน (ผู้ใช้งานระบบ)','warn');return;}
  window.showConfirm('ลบกลุ่มสิทธิ์ "'+d.name+'"?',async function(){
    try{await window.deleteDoc(getDocRef('ROLES',d.id));}catch(e){window.showDbError(e);return;}
    window.ROLES=window.ROLES.filter(function(r){return r.id!==d.id;});
    _rl.draft=null;_rl.dirty=false;
    window.admTab('roles');
  },{icon:'🗑',title:'ยืนยันการลบ',okColor:'var(--coral)',okText:'ลบ'});
};

// ── CHANGE PASSWORD ──
// ช่องรหัสใช้ type=text + -webkit-text-security (กัน browser เด้งบันทึกรหัส) · ปุ่มตา = สลับ class .show
window.cpwToggle=function(btn){
  var inp=btn.parentNode.querySelector('.cpw-input');
  var on=inp.classList.toggle('show');
  btn.innerHTML='<i class="ti ti-eye'+(on?'-off':'')+'"></i>';
  inp.focus();
};
// ความแข็งแรง 0–4 + เช็กลิสต์เงื่อนไข + รหัสตรงกัน — อัปเดตทุกครั้งที่พิมพ์
function cpwRefresh(){
  var o=document.getElementById('cpw-old').value,n=document.getElementById('cpw-new').value,c=document.getElementById('cpw-confirm').value;
  var kinds=[/[a-zA-Zก-๙]/,/\d/,/[^a-zA-Zก-๙\d]/].filter(function(r){return r.test(n);}).length;
  var lv=!n?0:n.length<4?1:Math.min(4,1+(kinds>=2?1:0)+(kinds>=3?1:0)+(n.length>=8?1:0));
  var m=document.getElementById('cpw-meter');m.dataset.lv=lv;
  document.getElementById('cpw-meter-txt').textContent=['ความแข็งแรง','อ่อนมาก','พอใช้','ดี','แข็งแรงมาก'][lv];
  var ok={len:n.length>=4,diff:!!n&&n!==o,safe:!window.PwPolicy.weak(n,window.cu&&window.cu.username),mix:kinds>=3};
  document.querySelectorAll('#cpw-rules li').forEach(function(li){li.classList.toggle('ok',ok[li.dataset.r]);});
  var mt=document.getElementById('cpw-match');
  mt.className='cpw-match'+(c?(c===n?' ok':' bad'):'');
  mt.innerHTML=!c?'':c===n?'<i class="ti ti-check"></i> รหัสผ่านตรงกัน':'<i class="ti ti-x"></i> รหัสผ่านไม่ตรงกัน';
  var e=document.getElementById('cpw-err');if(e.style.display!=='none'){e.style.display='none';}
}
window.openChangePassword=function(){
  ['cpw-old','cpw-new','cpw-confirm'].forEach(function(id){
    var el=document.getElementById(id);el.value='';el.classList.remove('show');
    el.parentNode.querySelector('.cpw-eye').innerHTML='<i class="ti ti-eye"></i>';
    if(!el.dataset.bound){el.dataset.bound='1';el.addEventListener('input',cpwRefresh);
      el.addEventListener('keydown',function(ev){if(ev.key==='Enter')window.saveChangePassword();});}
  });
  var e=document.getElementById('cpw-err');if(e){e.style.display='none';e.textContent='';}
  cpwRefresh();
  window.openM('m-change-pw');
  setTimeout(function(){document.getElementById('cpw-old').focus();},80);
};
window.saveChangePassword=async function(){
  var errEl=document.getElementById('cpw-err');
  var btn=document.getElementById('cpw-save');
  if(btn.disabled)return;
  function showErr(msg){
    errEl.innerHTML='<i class="ti ti-alert-triangle"></i><span></span>';
    errEl.lastChild.textContent=msg.replace(/^⚠\s*/,'');
    errEl.style.display='flex';btn.disabled=false;
  }
  var oldPw=document.getElementById('cpw-old').value;
  var newPw=document.getElementById('cpw-new').value;
  var cfPw=document.getElementById('cpw-confirm').value;
  if(!oldPw||!newPw||!cfPw){showErr('⚠ กรุณากรอกข้อมูลให้ครบ');return;}
  if(newPw===oldPw){showErr('⚠ รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม');return;}
  if(newPw!==cfPw){showErr('⚠ รหัสผ่านใหม่ไม่ตรงกัน');return;}
  if(newPw.length<4){showErr('⚠ รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร');return;}
  // รหัสเดาง่ายห้ามใช้ (src/utils/pw-policy.util.js) — เข้าระบบครั้งหน้าจะถูกบังคับเปลี่ยนอยู่ดี
  if(window.PwPolicy.weak(newPw,window.cu&&window.cu.username)){showErr('⚠ รหัสผ่านนี้เดาง่ายเกินไป (เช่น เลขเรียง 1234, ตัวซ้ำ 0000, ชื่อผู้ใช้) กรุณาตั้งรหัสอื่น');return;}
  btn.disabled=true;
  // ฐานข้อมูลตรวจรหัสเดิม + ตั้งรหัสใหม่ (bo_change_password) · เครื่องอื่นที่ Login ค้างไว้ต้อง Login ใหม่ เครื่องนี้ใช้ต่อได้
  try{
    var res=await window.getDb().rpc('bo_change_password',{p_token:window.BmsSession.token(),p_old:oldPw,p_new:newPw});
    if(res.error)throw res.error;
    var d=res.data||{};
    if(!d.ok){showErr(d.error==='old'?'⚠ รหัสผ่านปัจจุบันไม่ถูกต้อง':d.error==='short'?'⚠ รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร':'⚠ หมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่');return;}
    btn.disabled=false;
    window.closeM('m-change-pw');
    window.showAlert('เปลี่ยนรหัสผ่านสำเร็จ','success');
    // ติ๊ก "จดจำ" ไว้ → ให้ตัวจัดการรหัสผ่านของเบราว์เซอร์อัปเดตเป็นรหัสใหม่ (Chrome จะเลิกเตือนรหัสรั่ว · ผู้ใช้กดยืนยันเอง)
    if(window.BmsSession.persisted()&&window.PasswordCredential&&navigator.credentials&&window.cu){
      try{navigator.credentials.store(new window.PasswordCredential({id:window.cu.username,password:newPw,name:window.cu.name||window.cu.username})).catch(function(){});}catch(e3){}
    }
  }catch(e2){showErr('⚠ บันทึกไม่สำเร็จ: '+e2.message);}
};

// ── LEAVE STAFF FILTER HELPERS ──
window.regRefreshStaff=function(sfEl,dept){
  var cur=sfEl.value;
  sfEl.innerHTML='<option value="">ทุกคน</option>';
  sfEl.dataset.loaded='1';
  sfEl.insertAdjacentHTML('beforeend',window.staffOptionsGrouped(window.STAFF.filter(function(s){return s.active!==false&&(!dept||(s.dept||'')===dept);})));
  if([...sfEl.options].some(function(o){return o.value===cur;}))sfEl.value=cur;else sfEl.value='';
};

window.regDeptChange=function(){
  var dept=(document.getElementById('reg-dept')||{value:''}).value||'';
  var sfEl=document.getElementById('leave-filter-staff');
  if(sfEl)window.regRefreshStaff(sfEl,dept);
  window.renderLeave();
};
