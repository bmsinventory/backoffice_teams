const { esc, fd, fc, fca, pd, gS, gT, gG, gSt, gC, avC, uid, getFY, getYearBE, getStaffOverlaps, overlapWarnText, getStaffLeaveConflicts, getColRef, getDocRef } = window;
const setDoc = (...a) => window.setDoc(...a);
const writeBatch = () => window.writeBatch();
// ── ADMIN ──
window.openAdminModal=function(){if(window.isAdmin()||window.canView('admin')){window.admTab('staff');window.openM('m-admin');}}
window.admTab=function(t){window.admCur=t;document.querySelectorAll('.adm-nav-item').forEach(function(el){el.classList.remove('on');});var el=document.getElementById('at-'+t);if(el)el.classList.add('on');renderAdm();}

function renderAdm(){
  var c=document.getElementById('adm-body');if(!c)return;var titleEl=document.getElementById('adm-head-title');
  if(window.admCur==='notify'){window.renderNotifySettings();return;}
  if(window.admCur==='roles'){renderAdmRoles(c,titleEl);return;}
  if(window.admCur==='staff'){
    var activeStaff=window.STAFF.filter(function(s){return s.active!==false;});
    var inactiveStaff=window.STAFF.filter(function(s){return s.active===false;});
    if(titleEl)titleEl.innerHTML=`👥 จัดการพนักงาน <span class="tag" style="background:var(--surface2);color:var(--txt3);margin-left:10px;font-size:11px;">ใช้งาน ${activeStaff.length} คน</span>`;
    function staffRow(s,i){
      var initials=s.name.split(' ').map(function(w){return w.charAt(0);}).join('').substring(0,2).toUpperCase();
      return`<div style="display:flex;align-items:center;gap:12px;padding:10px 16px;transition:background .15s;cursor:default;" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
        <div style="width:38px;height:38px;border-radius:10px;background:${avC(i)};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">${initials}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:var(--txt);line-height:1.3;">${esc(s.name)}${s.nickname?` <span style="font-size:11px;color:var(--txt3);font-weight:400;">(${esc(s.nickname)})</span>`:''}</div>
          <div style="font-size:11px;color:var(--violet);font-weight:500;margin-top:1px;">${esc(s.role||'—')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:20px;flex-shrink:0;">
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
      return`<div class="fade" style="margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;padding:0 2px;">
          <div style="width:4px;height:18px;border-radius:2px;background:${accentColor};flex-shrink:0;"></div>
          <div style="font-size:13px;font-weight:700;color:var(--txt);">${esc(label)}</div>
          ${badge}
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;${isInactive?'opacity:.65;':''}">`+
        list.map(function(s,i){return(i>0?divider:'')+staffRow(s,i);}).join('')+
      `</div></div>`;
    }
    var deptOrder=window.DEPT_LIST.map(function(d){return d.label;});
    var grouped={};
    deptOrder.forEach(function(d){grouped[d]=[];});
    grouped['ไม่ระบุแผนก']=[];
    activeStaff.forEach(function(s){
      if(deptOrder.includes(s.dept))grouped[s.dept].push(s);
      else grouped['ไม่ระบุแผนก'].push(s);
    });
    var sections='';
    var ci=0;
    deptOrder.forEach(function(dept){if(grouped[dept]&&grouped[dept].length)sections+=deptSection(dept,grouped[dept],ci++,false);});
    if(grouped['ไม่ระบุแผนก'].length)sections+=deptSection('ไม่ระบุแผนก',grouped['ไม่ระบุแผนก'],ci++,false);
    if(inactiveStaff.length)sections+=deptSection('พ้นสภาพ / ไม่ใช้งาน',inactiveStaff,ci,true);
    c.innerHTML=
      `<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:20px">${window.canAdd('admin')?`<button class="btn btn-ghost" onclick="window.openStaffImport()">📥 นำเข้าข้อมูล</button><button class="btn btn-pri" onclick="window.admStaffForm(null)">+ เพิ่มพนักงาน</button>`:''}</div>`+
      sections;
  }
  else if(window.admCur==='dept'){
    if(titleEl)titleEl.innerHTML=`🏢 ข้อมูลแผนก <span class="tag" style="background:var(--surface2);color:var(--txt3);margin-left:10px;font-size:11px;">${window.DEPT_LIST.length} แผนก</span>`;
    c.innerHTML=`<div style="display:flex;justify-content:flex-end;margin-bottom:20px">${window.canAdd('admin')?`<button class="btn btn-pri" onclick="window.admDeptForm(null)">+ เพิ่มแผนก</button>`:''}</div><div style="display:flex;flex-direction:column;gap:8px;max-width:640px;">`+
    window.DEPT_LIST.map(function(d,i){
      return`<div class="fade" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 18px;display:flex;align-items:center;gap:14px;transition:all .2s;" onmouseover="this.style.borderColor='var(--violet)';this.style.background='var(--surface2)'" onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--surface)'">
        <div style="width:28px;height:28px;border-radius:8px;background:var(--violet)18;color:var(--violet);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${i+1}</div>
        <div style="flex:1;font-size:14px;font-weight:500;color:var(--txt);">🏢 ${esc(d.label)}</div>
        ${(window.canEdit('admin')||window.canDel('admin'))?`<div style="display:flex;gap:6px;">${window.canEdit('admin')?`<button class="btn btn-ghost btn-sm" onclick="window.admDeptForm('${d.id}')">✏️</button>`:''}${window.canDel('admin')?`<button class="btn btn-red btn-sm" onclick="window.askDel('department','${d.id}','${esc(d.label)}')">🗑</button>`:''}</div>`:''}
      </div>`;
    }).join('')+`</div>`;
  }
  else if(window.admCur==='groups'){if(titleEl)titleEl.innerHTML=`📂 กลุ่มโครงการ`;c.innerHTML=`<div style="display:flex;justify-content:flex-end;margin-bottom:20px">${window.canAdd('admin')?`<button class="btn btn-pri" onclick="window.admGroupForm(null)">+ เพิ่มกลุ่มโครงการ</button>`:''}</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">`+window.PGROUPS.map(function(g){return`<div class="adm-card fade"><div style="width:40px;height:40px;border-radius:10px;background:${g.color};flex-shrink:0;box-shadow:0 4px 12px ${g.color}55;"></div><div class="adm-card-info"><div style="font-size:14px;font-weight:600;color:var(--txt)">${esc(g.label)}</div><div style="display:flex;align-items:center;gap:6px;margin-top:4px;"><div style="width:10px;height:10px;border-radius:50%;background:${g.color};"></div><span style="font-size:11px;font-weight:400;color:var(--txt3)">${g.color}</span></div></div><div class="adm-card-actions">${window.canEdit('admin')?`<button class="btn btn-ghost btn-sm" onclick="window.admGroupForm('${g.id}')">✏️</button>`:''}${window.canDel('admin')?`<button class="btn btn-red btn-sm" onclick="window.askDel('group','${g.id}','${esc(g.label)}')">🗑</button>`:''}</div></div>`;}).join('')+`</div>`;}
  else if(window.admCur==='types'){if(titleEl)titleEl.innerHTML=`🏷️ ประเภทงาน`;c.innerHTML=`<div style="display:flex;justify-content:flex-end;margin-bottom:20px">${window.canAdd('admin')?`<button class="btn btn-pri" onclick="window.admTypeForm(null)">+ เพิ่มประเภทงาน</button>`:''}</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">`+window.PTYPES.map(function(t){return`<div class="adm-card fade"><div style="width:40px;height:40px;border-radius:10px;background:${t.color};flex-shrink:0;box-shadow:0 4px 12px ${t.color}55;"></div><div class="adm-card-info"><div style="font-size:14px;font-weight:600;color:var(--txt)">${esc(t.label)}</div><div style="display:flex;align-items:center;gap:6px;margin-top:4px;"><div style="width:10px;height:10px;border-radius:50%;background:${t.color};"></div><span style="font-size:11px;font-weight:400;color:var(--txt3)">${t.color}</span></div></div><div class="adm-card-actions">${window.canEdit('admin')?`<button class="btn btn-ghost btn-sm" onclick="window.admTypeForm('${t.id}')">✏️</button>`:''}${window.canDel('admin')?`<button class="btn btn-red btn-sm" onclick="window.askDel('type','${t.id}','${esc(t.label)}')">🗑</button>`:''}</div></div>`;}).join('')+`</div>`;}
  else if(window.admCur==='positions'){if(titleEl)titleEl.innerHTML=`💼 ตำแหน่งงาน`;c.innerHTML=`<div style="display:flex;justify-content:flex-end;margin-bottom:20px">${window.canAdd('admin')?`<button class="btn btn-pri" onclick="window.admPositionForm(null)">+ เพิ่มตำแหน่ง</button>`:''}</div><div style="display:flex;flex-direction:column;gap:8px;max-width:640px;">`+window.POSITIONS.map(function(p,i){return`<div class="fade" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 18px;display:flex;align-items:center;gap:14px;transition:all .2s;" onmouseover="this.style.borderColor='var(--violet)';this.style.background='var(--surface2)'" onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--surface)'"><div style="width:28px;height:28px;border-radius:8px;background:var(--violet)18;color:var(--violet);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${i+1}</div><div style="flex:1;font-size:14px;font-weight:500;color:var(--txt);">${esc(p.label)}</div><div style="font-size:12px;color:var(--teal);font-weight:600;white-space:nowrap;">${p.dailyRate>0?fc(p.dailyRate)+'/วัน':'—'}</div>${(window.canEdit('admin')||window.canDel('admin'))?`<div style="display:flex;gap:6px;">${window.canEdit('admin')?`<button class="btn btn-ghost btn-sm" onclick="window.admPositionForm('${p.id}')">✏️</button>`:''}${window.canDel('admin')?`<button class="btn btn-red btn-sm" onclick="window.askDel('position','${p.id}','${esc(p.label)}')">🗑</button>`:''}</div>`:''}</div>`;}).join('')+`</div>`;}
  else if(window.admCur==='rates'){
    if(titleEl)titleEl.innerHTML=`💵 อัตราค่าใช้จ่าย`;
    var st=window.SETTINGS;
    c.innerHTML=`<div style="max-width:560px;display:flex;flex-direction:column;gap:20px;">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px;">
        <div style="font-size:13px;font-weight:700;color:var(--violet);margin-bottom:16px;">📋 อัตราค่าเบี้ยเลี้ยง (฿/วัน)</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
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
  else if(window.admCur==='stages'){if(titleEl)titleEl.innerHTML=`⚡ PM Stages`;c.innerHTML=`<div style="display:flex;justify-content:flex-end;margin-bottom:20px">${window.canAdd('admin')?`<button class="btn btn-pri" onclick="window.admStageForm(null)">+ เพิ่ม Stage</button>`:''}</div><div id="stg-list" style="display:flex;flex-direction:column;gap:10px;max-width:700px;margin:0 auto;">`+window.STAGES.map(function(s,i){return`<div class="adm-card fade" draggable="${window.canEdit('admin')}" ondragstart="window.stgDrag(event,'${s.id}')" ondragover="event.preventDefault()" ondrop="window.stgDrop(event,'${s.id}')" style="animation-delay:${i*30}ms;">${window.canEdit('admin')?`<div style="color:var(--border2);font-size:20px;cursor:grab;padding-right:10px;">⋮⋮</div>`:''}<div style="width:40px;height:40px;border-radius:10px;background:${s.color};flex-shrink:0;box-shadow:0 4px 12px ${s.color}55;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;">${s.order||i+1}</div><div class="adm-card-info"><div style="font-size:14px;font-weight:600;color:var(--txt)">${esc(s.label)}</div><div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;"><div style="width:10px;height:10px;border-radius:50%;background:${s.color};"></div><span style="font-size:11px;font-weight:400;color:var(--txt3)">ลำดับที่ ${s.order||i+1}</span>${s.autoRule?`<span style="font-size:10px;font-weight:600;background:var(--violet)15;color:var(--violet);padding:2px 8px;border-radius:10px;">⚡ ${s.autoRule==='before_start'?'ก่อนเริ่ม '+s.autoOffset+'ว':s.autoRule==='on_start'?'เมื่อเริ่มโครงการ':s.autoRule==='on_end'?'เมื่อสิ้นสุดโครงการ':'หลังสิ้นสุด '+s.autoOffset+'ว'}</span>`:''}${s.setProgress>=0?`<span style="font-size:10px;font-weight:600;background:var(--teal)15;color:var(--teal);padding:2px 8px;border-radius:10px;">📊 ${s.setProgress}%</span>`:''}</div></div><div class="adm-card-actions">${window.canEdit('admin')?`<button class="btn btn-ghost btn-sm" onclick="window.admStageForm('${s.id}')">✏️</button>`:''}${window.canDel('admin')?`<button class="btn btn-red btn-sm" onclick="window.askDel('stage','${s.id}','${esc(s.label)}')">🗑</button>`:''}</div></div>`;}).join('')+`</div>`;}
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
    c.innerHTML=`<div style="display:flex;justify-content:flex-end;max-width:640px;margin-bottom:20px;">${canA?`<button class="btn btn-pri" onclick="window.openHspProductEdit(null);window.openM('m-hsp-products')">+ เพิ่ม Product</button>`:''}</div>`+rows;
  }
  else if(window.admCur==='users'){if(titleEl)titleEl.innerHTML=`🔑 ผู้ใช้งานระบบ`;c.innerHTML=`<div style="display:flex;justify-content:flex-end;margin-bottom:20px">${window.canAdd('admin')?`<button class="btn btn-pri" onclick="window.admUserForm(null)">+ เพิ่มบัญชีผู้ใช้</button>`:''}</div><div class="dtable-inner" style="border:1px solid var(--border);"><table><thead><tr><th>Username</th><th>ชื่อ</th><th>Role</th><th style="width:90px"></th></tr></thead><tbody>`+window.USERS.map(function(u,i){var rc={admin:'rgba(255,107,107,.15)',pm:'rgba(255,166,43,.15)',viewer:'rgba(6,214,160,.15)'};var rt={admin:'var(--coral)',pm:'var(--amber)',viewer:'var(--teal)'};return`<tr class="fade"><td style="font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--violet)">${esc(u.username)}</td><td style="font-weight:600;">${esc(u.name)}</td><td><span class="tag" style="background:${rc[u.role]||'var(--surface2)'};color:${rt[u.role]||'var(--txt2)'}">${window.roleLabel(u.role)}</span></td><td><div style="display:flex;gap:6px">${window.canEdit('admin')?`<button class="btn btn-ghost btn-sm" onclick="window.admUserForm('${u.id}')">✏️</button>`:''} ${window.canDel('admin')?`<button class="btn btn-red btn-sm" onclick="window.askDel('user','${u.id}','${esc(u.username)}')">🗑</button>`:''}</div></td></tr>`;}).join('')+`</tbody></table></div>`;}
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
  window.openM('m-position');
}
window.saveAdmPosition=async function(){
  if(!window.canEdit('admin')||!window.auth.currentUser)return;
  var l=(document.getElementById('apf-lbl')||{}).value||'';if(!l.trim())return;
  var pid=window._editPositionId||'POS'+Date.now();
  var rate=parseFloat((document.getElementById('apf-rate')||{}).value)||0;
  var raw={position_id:pid,label_th:l.trim(),daily_rate:rate};
  window._applyLocalDoc('POSITIONS',pid,raw);
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
window.openStaffImport=function(){
  document.getElementById('import-file').value='';
  document.getElementById('import-msg').innerHTML='รองรับเฉพาะไฟล์ .csv เท่านั้น';
  document.getElementById('import-type').value='STAFF';
  window.updateImportPreview();
  window.openM('m-import');
}
window._editStaffId = null;
window.admStaffForm=function(id){
  var realId = (id && id !== 'null' && id !== '') ? id : null;
  window._editStaffId = realId;
  var s = realId ? window.STAFF.find(function(x){return x.id===realId;}) : null;
  var deptOpts=`<option value="">-- เลือกแผนก --</option>`+window.DEPT_LIST.map(function(d){return`<option value="${esc(d.label)}"${s&&s.dept===d.label?' selected':''}>🏢 ${esc(d.label)}</option>`;}).join('');
  var posOpts=`<option value="">-- เลือกตำแหน่ง --</option>`+window.POSITIONS.map(function(p){return`<option value="${esc(p.label)}"${s&&s.role===p.label?' selected':''}>💼 ${esc(p.label)}</option>`;}).join('');
  var iconEl=document.getElementById('m-staff-icon');
  var titleEl=document.getElementById('m-staff-title');
  if(iconEl) iconEl.textContent = s ? '✏️' : '👤';
  if(titleEl) titleEl.textContent = s ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงานใหม่';
  setIdBadge('m-staff-id-badge', realId);
  var si = s ? window.STAFF.indexOf(s) : 0;
  var avatarHtml = s
    ? `<div style="display:flex;justify-content:center;margin-bottom:20px">
        <div class="av" style="background:${avC(si)};width:64px;height:64px;font-size:24px;border-radius:16px;">${s.name.charAt(0)}</div>
       </div>`
    : `<div style="display:flex;justify-content:center;margin-bottom:20px">
        <div style="width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,var(--violet),var(--coral));display:flex;align-items:center;justify-content:center;font-size:28px;">👤</div>
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
  let dbStf={staff_id:sid,full_name:nm.trim(),nickname:document.getElementById('asf-nick').value.trim()||nm.split(' ')[0],department:document.getElementById('asf-dept').value,position:document.getElementById('asf-role').value,email:document.getElementById('asf-email').value,phone:document.getElementById('asf-phone').value,is_active:document.getElementById('asf-active').value==='TRUE',start_date:document.getElementById('asf-start').value,birth_date:'',remark:document.getElementById('asf-remark').value,daily_rate:isNaN(rateVal)?null:rateVal};
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
  document.getElementById('auf-p').value='';
  document.getElementById('auf-p').placeholder=u?'(ว่างไว้ = ไม่เปลี่ยนรหัสผ่าน)':'กำหนดรหัสผ่าน...';
  document.getElementById('auf-n').value=u?u.name:'';
  var sel=document.getElementById('auf-r');
  var role=u?u.role:'viewer';
  for(var i=0;i<sel.options.length;i++){sel.options[i].selected=(sel.options[i].value===role);}
  var stfSel=document.getElementById('auf-staff');
  if(stfSel){
    stfSel.innerHTML='<option value="">-- ไม่ผูก --</option>';
    window.STAFF.filter(function(s){return s.active!==false;}).sort(function(a,b){return(a.name||'').localeCompare(b.name||'','th');}).forEach(function(s){stfSel.insertAdjacentHTML('beforeend','<option value="'+s.id+'"'+(u&&u.staffId===s.id?' selected':'')+'>'+esc(s.name)+'</option>');});
  }
  window.openM('m-user');
}
window.saveAdmUser=async function(){
  if(!window.canEdit('admin')||!window.auth.currentUser)return;
  var un=(document.getElementById('auf-u')||{}).value||'';
  var nm=(document.getElementById('auf-n')||{}).value||'';
  if(!un.trim()||!nm.trim())return;
  var pw=document.getElementById('auf-p').value;
  var id=window._editUserId;
  var ex=id?window.USERS.find(function(x){return x.id===id;}):null;
  var uid2=id||'U'+Date.now();
  var dbUsr={user_id:uid2,username:un.trim(),name:nm.trim(),role:document.getElementById('auf-r').value,password:pw?pw:(ex?ex.password:''),is_active:true,staff_id:(document.getElementById('auf-staff')||{value:''}).value||''};
  window._applyLocalDoc('USERS',uid2,dbUsr);
  window.closeM('m-user');
  window.admTab('users');
  setDoc(getDocRef('USERS',uid2),dbUsr).catch(e=>window.showDbError(e));
}

// ── ROLE PERMISSIONS ──
function renderAdmRoles(c, titleEl) {
  if(titleEl) titleEl.innerHTML = '🔐 สิทธิ์การใช้งาน (Role Permissions)';
  var mods = window.PERM_MODULES || [];
  // roles ที่ configurable ได้ (ไม่รวม admin เพราะ full access เสมอ)
  var roles = (window.USERS || []).map(function(u){return u.role;}).filter(function(r){return r&&r!=='admin';});
  roles = [...new Set(roles)];
  if(!roles.length) roles = ['pm','viewer'];
  roles.sort();

  var rp = window.ROLE_PERMISSIONS || {};

  // helper: get perm value
  function getPerm(role, modId, action) {
    if(rp[role] && rp[role][modId] && rp[role][modId][action] !== undefined) return !!rp[role][modId][action];
    // fallback default — ตรงกับ _roleDefaultPerms ใน config.js
    var full={view:true,add:true,edit:true,del:true}, ro={view:true,add:false,edit:false,del:false},
        none={view:false,add:false,edit:false,del:false}, vadd={view:true,add:true,edit:false,del:false};
    var def = role==='pm'
      ? {overview:ro,kanban:full,projects:full,advance:full,lodging:full,workload:ro,calendar:full,leave:full,timesheet:ro,cost:ro,availability:ro,holiday:ro,admin:none}
      : role==='viewer'
      ? {overview:ro,kanban:ro,projects:none,advance:full,lodging:full,workload:ro,calendar:ro,leave:vadd,timesheet:ro,cost:ro,availability:ro,holiday:none,admin:none}
      : {overview:ro,kanban:ro,projects:ro,advance:ro,lodging:ro,workload:ro,calendar:ro,leave:ro,timesheet:ro,cost:ro,availability:ro,holiday:none,admin:none};
    return !!(def[modId]||{})[action];
  }
  // ── สิทธิ์ "อนุมัติที่พัก" แยกจาก edit — ถ้ายังไม่เคยตั้งค่านี้ไว้ชัดเจน (undefined) ยึดตามสิทธิ์ "แก้" เดิม
  // ไปก่อน (ดู logic เดียวกันใน permission.util.js window.can) กันปุ่มอนุมัติหายไปทันทีตอน deploy ครั้งแรก ──
  function getLodgingApprove(role) {
    if(rp[role] && rp[role].lodging && rp[role].lodging.approve !== undefined) return !!rp[role].lodging.approve;
    return getPerm(role, 'lodging', 'edit');
  }

  var actions = [{id:'view',label:'ดู',color:'var(--teal)'},{id:'add',label:'เพิ่ม',color:'var(--violet)'},{id:'edit',label:'แก้',color:'var(--amber)'},{id:'del',label:'ลบ',color:'var(--coral)'}];

  // Role header cells
  var roleHeadCells = roles.map(function(r){
    var rc={pm:'var(--violet)',viewer:'var(--teal)'};
    return `<th colspan="4" style="text-align:center;padding:10px 6px;background:${rc[r]||'var(--violet)'}18;color:${rc[r]||'var(--violet)'};font-size:13px;font-weight:700;border-bottom:2px solid ${rc[r]||'var(--violet)'}40;">${window.roleLabel(r)}</th>`;
  }).join('');

  // Action sub-header cells
  var actionHeadCells = roles.map(function(){
    return actions.map(function(a){
      return `<th style="text-align:center;font-size:10px;font-weight:600;color:${a.color};padding:5px 4px;white-space:nowrap;">${a.label}</th>`;
    }).join('');
  }).join('');

  // Module rows
  var rows = mods.map(function(mod){
    var cells = roles.map(function(role){
      return actions.map(function(a){
        var checked = getPerm(role,mod.id,a.id) ? 'checked' : '';
        // view ถูกเช็คอัตโนมัติถ้า add/edit/del ถูกเปิด
        var onchange = a.id!=='view' ? `onchange="window._permAutoView(this,'${role}','${mod.id}')"` : `onchange="window._permViewOff(this,'${role}','${mod.id}')"`;
        return `<td style="text-align:center;padding:6px 4px;">
          <input type="checkbox" class="perm-cb" ${checked}
            data-role="${role}" data-mod="${mod.id}" data-act="${a.id}"
            style="width:16px;height:16px;accent-color:${a.color};cursor:pointer;"
            id="pcb-${role}-${mod.id}-${a.id}" ${onchange}>
        </td>`;
      }).join('');
    }).join('');

    // Admin column (read-only, always on)
    var adminCells = `<td colspan="${actions.length}" style="text-align:center;font-size:11px;color:var(--txt3);padding:6px 8px;">
      ${actions.map(function(){return '<span style="color:var(--teal);font-size:14px;">✓</span>';}).join(' ')}
    </td>`;

    return `<tr style="border-bottom:1px solid var(--border);" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <td style="padding:10px 14px;font-size:13px;font-weight:500;white-space:nowrap;">${mod.icon} ${esc(mod.label)}</td>
      ${adminCells}
      ${cells}
    </tr>`;
  }).join('');

  c.innerHTML = `
    <div style="max-width:900px;">
      <div style="background:rgba(124,92,252,.07);border:1px solid rgba(124,92,252,.2);border-radius:10px;padding:12px 16px;margin-bottom:18px;font-size:12px;color:var(--txt2);">
        💡 <b>Admin</b> มีสิทธิ์เต็มทุก Module เสมอ — กำหนดสิทธิ์ได้สำหรับ Role อื่นๆ
      </div>
      <div style="overflow-x:auto;border:1px solid var(--border);border-radius:14px;">
        <table style="width:100%;border-collapse:collapse;min-width:560px;">
          <thead>
            <tr style="border-bottom:1px solid var(--border);">
              <th style="text-align:left;padding:10px 14px;font-size:12px;color:var(--txt3);">Module</th>
              <th colspan="${actions.length}" style="text-align:center;padding:10px 6px;background:rgba(255,107,107,.08);color:var(--coral);font-size:13px;font-weight:700;">Admin</th>
              ${roleHeadCells}
            </tr>
            <tr style="border-bottom:2px solid var(--border);background:var(--surface2);">
              <th></th>
              <th colspan="${actions.length}" style="text-align:center;font-size:10px;color:var(--txt3);padding:5px;">เต็ม</th>
              ${actionHeadCells}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="margin-top:20px;border:1px solid var(--border);border-radius:14px;padding:16px 18px;">
        <div style="font-size:13px;font-weight:700;margin-bottom:4px;">🔑 สิทธิ์กดอนุมัติที่พัก</div>
        <div style="font-size:11.5px;color:var(--txt3);margin-bottom:12px;">แยกจากสิทธิ์ "แก้" — กำหนดว่า Role ไหนกดปุ่ม ✅ อนุมัติ/ยกเลิกอนุมัติ ในหน้าที่พักได้บ้าง (Role ที่ยังไม่เคยตั้งค่านี้จะยึดตามสิทธิ์ "แก้" เดิมไปก่อน)</div>
        <div style="display:flex;gap:18px;flex-wrap:wrap;">
          ${roles.map(function(role){
            var rc={pm:'var(--violet)',viewer:'var(--teal)'};
            var checked = getLodgingApprove(role) ? 'checked' : '';
            return `<label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer;">
              <input type="checkbox" class="perm-cb" ${checked}
                data-role="${role}" data-mod="lodging" data-act="approve"
                id="pcb-${role}-lodging-approve" style="width:16px;height:16px;accent-color:${rc[role]||'var(--indigo)'};cursor:pointer;">
              <span style="color:${rc[role]||'var(--txt)'};font-weight:600;">${window.roleLabel(role)}</span>
            </label>`;
          }).join('')}
        </div>
      </div>
      <div style="margin-top:18px;display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn btn-ghost" onclick="window.resetRolePerms()">↩️ รีเซ็ตเป็นค่าเริ่มต้น</button>
        <button class="btn btn-pri" onclick="window.saveRolePerms()">💾 บันทึกสิทธิ์</button>
      </div>
    </div>`;
}

// auto-check view เมื่อเปิด add/edit/del
window._permAutoView = function(cb, role, modId) {
  if(cb.checked) {
    var viewCb = document.getElementById('pcb-'+role+'-'+modId+'-view');
    if(viewCb) viewCb.checked = true;
  }
};
// auto-uncheck add/edit/del เมื่อปิด view
window._permViewOff = function(cb, role, modId) {
  if(!cb.checked) {
    ['add','edit','del'].forEach(function(a){
      var el=document.getElementById('pcb-'+role+'-'+modId+'-'+a);
      if(el) el.checked=false;
    });
  }
};

window.saveRolePerms = async function() {
  if(!window.canEdit('admin')||!window.auth.currentUser) return;
  var mods = window.PERM_MODULES || [];
  var roles = [...new Set((window.USERS||[]).map(function(u){return u.role;}).filter(function(r){return r&&r!=='admin';}))];
  if(!roles.length) roles=['pm','viewer'];
  var data = {};
  roles.forEach(function(role){
    data[role]={};
    mods.forEach(function(mod){
      data[role][mod.id]={};
      ['view','add','edit','del'].forEach(function(a){
        var el=document.getElementById('pcb-'+role+'-'+mod.id+'-'+a);
        data[role][mod.id][a]=el?el.checked:false;
      });
    });
    var apEl=document.getElementById('pcb-'+role+'-lodging-approve');
    if(apEl) data[role].lodging.approve = apEl.checked;
  });
  try {
    await setDoc(getDocRef('SETTINGS','role_permissions'), data);
    window.showAlert('บันทึกสิทธิ์สำเร็จ','success');
  } catch(e) { window.showDbError(e); }
};

window.resetRolePerms = function() {
  if(!window.canEdit('admin')) return;
  window.showConfirm('รีเซ็ตสิทธิ์ทั้งหมดเป็นค่าเริ่มต้น?',function(){
    window.ROLE_PERMISSIONS = {};
    window.admTab('roles');
  },{icon:'⚠️',title:'ยืนยันการรีเซ็ต',okColor:'var(--amber)',okText:'รีเซ็ต'});
};

// ── CHANGE PASSWORD ──
window.openChangePassword=function(){
  ['cpw-old','cpw-new','cpw-confirm'].forEach(function(id){document.getElementById(id).value='';});
  var e=document.getElementById('cpw-err');if(e){e.style.display='none';e.textContent='';}
  window.openM('m-change-pw');
};
window.saveChangePassword=async function(){
  var errEl=document.getElementById('cpw-err');
  function showErr(msg){errEl.textContent=msg;errEl.style.display='block';}
  var oldPw=document.getElementById('cpw-old').value;
  var newPw=document.getElementById('cpw-new').value;
  var cfPw=document.getElementById('cpw-confirm').value;
  if(!oldPw||!newPw||!cfPw){showErr('⚠ กรุณากรอกข้อมูลให้ครบ');return;}
  if(oldPw!==window.cu.password){showErr('⚠ รหัสผ่านปัจจุบันไม่ถูกต้อง');return;}
  if(newPw===oldPw){showErr('⚠ รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม');return;}
  if(newPw!==cfPw){showErr('⚠ รหัสผ่านใหม่ไม่ตรงกัน');return;}
  if(newPw.length<4){showErr('⚠ รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร');return;}
  var ex=window.USERS.find(function(x){return x.id===window.cu.id;});
  if(!ex){showErr('⚠ ไม่พบข้อมูลผู้ใช้');return;}
  var dbUsr={user_id:ex.id,username:ex.username,name:ex.name,role:ex.role,is_active:true,password:newPw};
  if(ex.staffId)dbUsr.staff_id=ex.staffId;
  try{
    await setDoc(getDocRef('USERS',ex.id),dbUsr);
    window.cu.password=newPw;
    window.closeM('m-change-pw');
    window.showAlert('เปลี่ยนรหัสผ่านสำเร็จ','success');
  }catch(e2){showErr('⚠ บันทึกไม่สำเร็จ: '+e2.message);}
};

// ── LEAVE STAFF FILTER HELPERS ──
window.regRefreshStaff=function(sfEl,dept){
  var cur=sfEl.value;
  sfEl.innerHTML='<option value="">ทุกคน</option>';
  sfEl.dataset.loaded='1';
  window.STAFF.filter(function(s){return s.active!==false&&(!dept||(s.dept||'')===dept);})
    .sort(function(a,b){return(a.name||'').localeCompare(b.name||'','th');})
    .forEach(function(s){sfEl.insertAdjacentHTML('beforeend','<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>');});
  if([...sfEl.options].some(function(o){return o.value===cur;}))sfEl.value=cur;else sfEl.value='';
};

window.regDeptChange=function(){
  var dept=(document.getElementById('reg-dept')||{value:''}).value||'';
  var sfEl=document.getElementById('leave-filter-staff');
  if(sfEl)window.regRefreshStaff(sfEl,dept);
  window.renderLeave();
};


