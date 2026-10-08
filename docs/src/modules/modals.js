const { esc, fd, fc, fca, pd, gS, gT, gG, gSt, gC, avC, uid, getFY, getYearBE, getStaffOverlaps, overlapWarnText, getStaffLeaveConflicts, getColRef, getDocRef } = window;
const deleteDoc  = (...a) => window.deleteDoc(...a);
const writeBatch = ()    => window.writeBatch();
const getDocs    = (...a) => window.getDocs(...a);
// ── DELETE ──
window.askDel=function(type,id,label){window.delTarget={type:type,id:id};document.getElementById('del-label').textContent=label;window.openM('m-del');}
window.execDelete=async function(){
  if(!window.delTarget)return;if(!window.auth.currentUser)return;
  var t=window.delTarget.type,id=window.delTarget.id;
  var _delModMap={project:'projects',advance:'advance',lodging:'lodging',timesheet:'timesheet',leave:'leave',contract:'contract',imt_project:'impl_tracker',imt_phase:'impl_tracker',imt_task:'impl_tracker',imt_issue:'impl_tracker',imt_template:'impl_tracker',form_group:'impl_tracker',form_item:'impl_tracker',form_template:'impl_tracker',hdcat:'helpdesk'};
  if(['staff','type','position','group','user','stage','department'].includes(t)){if(!window.canDel('admin'))return;}
  else if(_delModMap[t]){if(!window.canDel(_delModMap[t]))return;}
  else{if(!window.isAdmin())return;}
  var sheetMap={project:'PROJECTS',advance:'ADVANCES',staff:'STAFF',type:'PTYPES',user:'USERS',position:'POSITIONS',group:'PGROUPS',lodging:'LODGINGS',stage:'STAGES',timesheet:'TIMESHEETS',department:'DEPARTMENTS',contract:'CONTRACTS',imt_project:'IMPL_PROJECTS',imt_phase:'IMPL_PHASES',imt_task:'IMPL_TASKS',imt_issue:'IMPL_ISSUES',imt_template:'IMPL_TEMPLATES',form_group:'FORM_GROUPS',form_item:'FORM_ITEMS',form_template:'FORM_TEMPLATES',hdcat:'HELPDESK_CATEGORIES'};
  function _ftkCascadeGroup(groupId){
    window.FORM_ITEMS.filter(x=>x.groupId===groupId).forEach(i=>deleteDoc(getDocRef('FORM_ITEMS',i.id)));
    window.FORM_ITEMS=window.FORM_ITEMS.filter(x=>x.groupId!==groupId);
  }
  // ── เรียกตอนลบโครงการ (imt_project) ด้วย เพื่อล้างแบบฟอร์ม/คลังที่ผูกกับโครงการนั้นไปพร้อมกัน ──
  function _ftkCascadeProject(projectId){
    window.FORM_GROUPS.filter(x=>x.projectId===projectId).forEach(g=>{_ftkCascadeGroup(g.id);deleteDoc(getDocRef('FORM_GROUPS',g.id));});
    window.FORM_GROUPS=window.FORM_GROUPS.filter(x=>x.projectId!==projectId);
  }
  function _imtCascadeTask(taskId){
    window.IMPL_CHECKLIST_ITEMS.filter(x=>x.taskId===taskId).forEach(c=>deleteDoc(getDocRef('IMPL_CHECKLIST_ITEMS',c.id)));
    window.IMPL_COMMENTS.filter(x=>x.taskId===taskId).forEach(c=>deleteDoc(getDocRef('IMPL_COMMENTS',c.id)));
    window.IMPL_ATTACHMENTS.filter(x=>x.taskId===taskId).forEach(a=>deleteDoc(getDocRef('IMPL_ATTACHMENTS',a.id)));
    window.IMPL_CHECKLIST_ITEMS=window.IMPL_CHECKLIST_ITEMS.filter(x=>x.taskId!==taskId);
    window.IMPL_COMMENTS=window.IMPL_COMMENTS.filter(x=>x.taskId!==taskId);
    window.IMPL_ATTACHMENTS=window.IMPL_ATTACHMENTS.filter(x=>x.taskId!==taskId);
  }
  function _imtCascadePhase(phaseId){
    window.IMPL_TASKS.filter(x=>x.phaseId===phaseId).forEach(t=>{_imtCascadeTask(t.id);deleteDoc(getDocRef('IMPL_TASKS',t.id));});
    window.IMPL_TASKS=window.IMPL_TASKS.filter(x=>x.phaseId!==phaseId);
  }
  if(t==='project'){window.PROJECTS=window.PROJECTS.filter(x=>x.id!==id);window.ADVANCES.filter(x=>x.pid===id).forEach(a=>deleteDoc(getDocRef('ADVANCES',a.id)));window.LODGINGS.filter(x=>x.pid===id).forEach(l=>deleteDoc(getDocRef('LODGINGS',l.id)));}
  else if(t==='advance')window.ADVANCES=window.ADVANCES.filter(x=>x.id!==id);
  else if(t==='lodging')window.LODGINGS=window.LODGINGS.filter(x=>x.id!==id);
  else if(t==='staff')window.STAFF=window.STAFF.filter(x=>x.id!==id);
  else if(t==='type')window.PTYPES=window.PTYPES.filter(x=>x.id!==id);
  else if(t==='user')window.USERS=window.USERS.filter(x=>x.id!==id);
  else if(t==='position')window.POSITIONS=window.POSITIONS.filter(x=>x.id!==id);
  else if(t==='group')window.PGROUPS=window.PGROUPS.filter(x=>x.id!==id);
  else if(t==='stage')window.STAGES=window.STAGES.filter(x=>x.id!==id);
  else if(t==='department'){window.DEPT_LIST=window.DEPT_LIST.filter(x=>x.id!==id);window.DEPARTMENTS=window.DEPT_LIST.map(d=>d.label);}
  else if(t==='timesheet')window.TIMESHEETS=window.TIMESHEETS.filter(x=>x.id!==id);
  else if(t==='contract')window.CONTRACTS=window.CONTRACTS.filter(x=>x.id!==id);
  else if(t==='imt_project'){
    window.IMPL_PHASES.filter(x=>x.projectId===id).forEach(p=>{_imtCascadePhase(p.id);deleteDoc(getDocRef('IMPL_PHASES',p.id));});
    window.IMPL_ISSUES.filter(x=>x.projectId===id).forEach(i=>deleteDoc(getDocRef('IMPL_ISSUES',i.id)));
    window.IMPL_ACTIVITY_LOG.filter(x=>x.projectId===id).forEach(a=>deleteDoc(getDocRef('IMPL_ACTIVITY_LOG',a.id)));
    _ftkCascadeProject(id);
    window.IMPL_PHASES=window.IMPL_PHASES.filter(x=>x.projectId!==id);
    window.IMPL_ISSUES=window.IMPL_ISSUES.filter(x=>x.projectId!==id);
    window.IMPL_ACTIVITY_LOG=window.IMPL_ACTIVITY_LOG.filter(x=>x.projectId!==id);
    window.IMPL_PROJECTS=window.IMPL_PROJECTS.filter(x=>x.id!==id);
    if(window.imtCurrentProjectId===id){window.imtCurrentProjectId='';window.imtTab='dashboard';}
  }
  else if(t==='imt_phase'){_imtCascadePhase(id);window.IMPL_PHASES=window.IMPL_PHASES.filter(x=>x.id!==id);}
  else if(t==='imt_task'){_imtCascadeTask(id);window.IMPL_TASKS=window.IMPL_TASKS.filter(x=>x.id!==id);}
  else if(t==='imt_issue')window.IMPL_ISSUES=window.IMPL_ISSUES.filter(x=>x.id!==id);
  else if(t==='imt_template')window.IMPL_TEMPLATES=window.IMPL_TEMPLATES.filter(x=>x.id!==id);
  else if(t==='form_group'){_ftkCascadeGroup(id);window.FORM_GROUPS=window.FORM_GROUPS.filter(x=>x.id!==id);}
  else if(t==='form_item')window.FORM_ITEMS=window.FORM_ITEMS.filter(x=>x.id!==id);
  else if(t==='form_template')window.FORM_TEMPLATES=window.FORM_TEMPLATES.filter(x=>x.id!==id);
  else if(t==='hdcat')window.HELPDESK_CATEGORIES=window.HELPDESK_CATEGORIES.filter(x=>x.id!==id);
  window.closeM('m-del');window.delTarget=null;window.renderAll();
  if(t==='staff')window.admTab('staff');else if(['type','user','position','group','stage'].includes(t))window.admTab(t+'s');
  if(t==='department')window.admTab('dept');
  if(t==='hdcat')window.admTab('hd_options');
  if(t==='lodging'&&window.currentLdPid)window.openLodgingGroupModal(window.currentLdPid);
  deleteDoc(getDocRef(sheetMap[t],id)).catch(e=>window.showDbError(e));
  if(t==='imt_project'){
    // ── ลบโครงการเดียวยิง deleteDoc หลายสิบครั้งพร้อมกันข้ามหลายตาราง (Phase/Task/Checklist/ฯลฯ)
    // realtime sync ของแต่ละตารางอาจตามไม่ทันทันที ทำให้เปิดโครงการอื่นดูตอนนั้นพอดีเห็นข้อมูลว่างชั่วคราว
    // (ข้อมูลจริงไม่ได้หายไปไหนในฐานข้อมูล) — เรียก re-render ซ้ำอีกครั้งหลังรอ sync นิ่งแล้ว กันผู้ใช้ต้องกด F5 เอง ──
    setTimeout(function(){window.renderAll();},1500);
  }
  if(t==='form_template'){
    // ── ลบรายชื่อ Template ระหว่างเปิด modal m-ftk-template ค้างอยู่พอดี (เช่น admin ลบทิ้งกลางคัน) —
    // renderAll() ไม่แตะ DOM ในนี้เพราะ modal ไม่ได้อยู่ใต้ view ไหน ต้อง refresh เองแยกต่างหาก ──
    var tm=document.getElementById('m-ftk-template');
    if(tm&&tm.classList.contains('on'))window.renderFtkTemplateModal&&window.renderFtkTemplateModal();
  }
}

// ── IMPORT ──
// เติมช่องเลือกโครงการปลายทางของ IMPL_ISSUES — ค่าเริ่มต้นซ่อนโครงการที่ "สิ้นสุดแล้วจริง" (เทียบวันที่
// end กับวันนี้ตรง ๆ ไม่ใช่แค่เทียบปี พ.ศ. — โครงการที่จบไปแล้วตั้งแต่ต้นปีเดียวกันก็ต้องถูกซ่อนด้วย)
// กันลิสต์ยาวเกินไปเมื่อสะสมโครงการเก่ามาหลายปี — ติ๊ก "แสดงโครงการในปีที่สิ้นสุดแล้วด้วย" เพื่อดึง
// โครงการที่จบไปแล้วกลับมาแสดงด้วย ตอนต้องนำเข้าข้อมูลของโครงการเก่าจริง ๆ ──
window.imtRefreshProjectImportOptions=function(){
  // ── ช่องเลือกเป็น combobox ค้นหา + จัดกลุ่มตามประเภทงาน (แบบเดียวกับ "เพิ่มโครงการใหม่") —
  // hidden input id="import-imt-project" เก็บ id โครงการ Impl Tracker ที่เลือก ──
  const host=document.getElementById('import-imt-project-host');
  if(host&&!document.getElementById('import-imt-project'))host.innerHTML=window.projectComboHtml('import-imt-cmb','import-imt-project');
  const projSel=document.getElementById('import-imt-project');
  if(!projSel)return;
  const showEnded=(document.getElementById('import-imt-show-past-years')||{}).checked;
  const today=new Date();today.setHours(0,0,0,0);
  const prevSelected=projSel.value;
  let list=(window.IMPL_PROJECTS||[]).slice();
  if(!showEnded){
    list=list.filter(p=>!p.end||pd(p.end)>=today);
  }
  list.sort((a,b)=>a.name.localeCompare(b.name,'th'));
  // IMPL_PROJECTS ไม่มี typeId — ยืมจากโครงการต้นทาง (sourceProjectId) เพื่อจัดกลุ่มตามประเภทงาน
  const items=list.map(p=>{const sp=p.source;return{id:p.id,name:p.name,typeId:sp?sp.typeId:''};});
  const cur=prevSelected&&items.some(p=>p.id===prevSelected)?prevSelected:'';
  window.initProjectCombobox(window.projectComboIds('import-imt-cmb','import-imt-project'),items,cur,null,{fixed:true});
};
window.updateImportPreview=function(){
  const type=document.getElementById('import-type').value;
  const fileInput=document.getElementById('import-file');
  const fileLabel=document.getElementById('import-file-label');
  const msgEl=document.getElementById('import-msg');
  const formatBox=document.getElementById('import-format-preview');
  const templateBtn=document.getElementById('import-template-btn');
  const titleEl=document.getElementById('import-modal-title');
  const imtProjectWrap=document.getElementById('import-imt-project-wrap');
  const clearFirstLabel=document.getElementById('import-clear-first-label');
  const clearFirstCb=document.getElementById('import-clear-first');
  window._importAlert(null);
  // ── ช่องเลือกโครงการปลายทาง (เฉพาะ IMPL_ISSUES) — ซ่อน/รีเซ็ตทุกครั้งที่สลับประเภทออกไปเป็นอย่างอื่น
  // กันค่าที่เลือกไว้ค้างข้ามประเภท ── */
  if(type!=='IMPL_ISSUES'){
    if(imtProjectWrap)imtProjectWrap.style.display='none';
    if(clearFirstLabel)clearFirstLabel.textContent='⚠ ลบข้อมูลเดิมก่อนนำเข้า';
  }
  if(type==='CONTRACTS'){
    if(fileInput)fileInput.accept='.csv';
    if(fileLabel)fileLabel.textContent='เลือกไฟล์ CSV ที่กรอกข้อมูลแล้ว';
    if(msgEl)msgEl.innerHTML='1 แถว = 1 สัญญา · <b>วันที่รองรับ:</b> YYYY-MM-DD · DD/MM/YYYY · DD/MM/พ.ศ. · contract_id ถ้าไม่ระบุจะ generate อัตโนมัติ · status: active / completed / cancelled';
    if(formatBox)formatBox.textContent='contract_id, project_name, customer_name, total_contract_value, contract_sign_date, contract_start_date, end_date, status, note';
    if(templateBtn)templateBtn.textContent='⬇ ดาวน์โหลดไฟล์ตัวอย่าง (.csv)';
    if(titleEl)titleEl.textContent='นำเข้าข้อมูลสัญญา (CSV)';
    return;
  }
  if(type==='HOSPITALS'){
    if(fileInput)fileInput.accept='.xlsx,.xls,.csv';
    if(fileLabel)fileLabel.textContent='เลือกไฟล์ Excel ที่กรอกข้อมูลแล้ว (.xlsx / .xls / .csv)';
    if(msgEl)msgEl.innerHTML='รองรับ .xlsx / .xls / .csv · ใส่แค่รหัส รพ. ก็พอ หากเชื่อมต่อ MOPH API';
    if(formatBox)formatBox.textContent='hospital_code, hospital_name, province, district, tambon, type, tel, beds, affiliation (ดูคำอธิบายในไฟล์ตัวอย่าง)';
    if(templateBtn)templateBtn.textContent='⬇ ดาวน์โหลดไฟล์ตัวอย่าง (.xlsx)';
    if(titleEl)titleEl.textContent='นำเข้าข้อมูล (Excel)';
    return;
  }
  if(type==='HELPDESK'){
    if(fileInput)fileInput.accept='.xlsx,.xls,.csv';
    if(fileLabel)fileLabel.textContent='เลือกไฟล์ Excel ที่กรอกข้อมูลแล้ว (.xlsx / .xls / .csv)';
    if(msgEl)msgEl.innerHTML='1 แถว = 1 Ticket เก่า · จับคู่ รพ./หมวด/เจ้าหน้าที่อัตโนมัติ · จะมีหน้าพรีวิวก่อนยืนยัน · <b>ไม่รองรับ</b> "ลบข้อมูลเดิมก่อน"';
    if(formatBox)formatBox.textContent='hospital, reporter_name, phone, line_group, source_system, category, subject, description, priority, status, assignee, resolution, resolved_by, created_at, resolved_at (ดูคำอธิบายในไฟล์ตัวอย่าง)';
    if(templateBtn)templateBtn.textContent='⬇ ดาวน์โหลดไฟล์ตัวอย่าง (.xlsx)';
    if(titleEl)titleEl.textContent='นำเข้าปัญหาเก่า HelpDesk (Excel)';
    return;
  }
  if(type==='IMPL_ISSUES'){
    if(fileInput)fileInput.accept='.xlsx,.xls,.csv';
    if(fileLabel)fileLabel.textContent='เลือกไฟล์ Excel ที่กรอกข้อมูลแล้ว (.xlsx / .xls / .csv)';
    if(msgEl)msgEl.innerHTML='1 แถว = 1 ปัญหาเก่า · 1 ไฟล์ = 1 โครงการ — เลือกโครงการปลายทางด้านบนก่อนกด "นำเข้า"';
    if(formatBox)formatBox.textContent='created_at, department, reported_by, problem, category, severity, status, solution, received_by, fixed_by, fixed_date (ดูคำอธิบายในไฟล์ตัวอย่าง)';
    if(templateBtn)templateBtn.textContent='⬇ ดาวน์โหลดไฟล์ตัวอย่าง (.xlsx)';
    if(titleEl)titleEl.textContent='นำเข้าปัญหาการใช้งานเก่า (Impl Tracker, Excel)';
    if(imtProjectWrap){
      imtProjectWrap.style.display='';
      const pastYearsCb=document.getElementById('import-imt-show-past-years');
      if(pastYearsCb)pastYearsCb.checked=false;
      window.imtRefreshProjectImportOptions();
    }
    if(clearFirstLabel)clearFirstLabel.textContent='⚠ ลบปัญหาเดิมของโครงการนี้ทั้งหมดก่อนนำเข้า (กรณีนำเข้าซ้ำ — ลบเฉพาะปัญหาของโครงการที่เลือกไว้ด้านบนเท่านั้น ไม่กระทบโครงการอื่น)';
    if(clearFirstCb)clearFirstCb.checked=false;
    return;
  }
  if(type==='HOSPITAL_CONTACTS'){
    if(fileInput)fileInput.accept='.xlsx,.xls,.csv';
    if(fileLabel)fileLabel.textContent='เลือกไฟล์ Excel ที่กรอกข้อมูลแล้ว (.xlsx / .xls / .csv)';
    if(msgEl)msgEl.innerHTML='1 แถว = 1 ผู้ติดต่อ · ระบุรหัส รพ. ทุกแถว · รพ. เดียวกันใส่หลายแถวได้';
    if(formatBox)formatBox.textContent='hospital_code, contact_name, phone, position, email, note';
    if(templateBtn)templateBtn.textContent='⬇ ดาวน์โหลดไฟล์ตัวอย่าง (.xlsx)';
    if(titleEl)titleEl.textContent='นำเข้าผู้ติดต่อ รพ. (Excel)';
    return;
  }
  if(fileInput)fileInput.accept='.csv';
  if(fileLabel)fileLabel.textContent='เลือกไฟล์ CSV ที่กรอกข้อมูลแล้ว';
  if(msgEl)msgEl.innerHTML='รองรับเฉพาะไฟล์ .csv เท่านั้น';
  if(templateBtn)templateBtn.textContent='⬇ ดาวน์โหลดไฟล์ตัวอย่าง (.csv)';
  if(titleEl)titleEl.textContent='นำเข้าข้อมูล (CSV)';
  const schema=window.IMPORT_SCHEMAS[type];
  if(schema&&formatBox)formatBox.textContent=schema.headers.join(', ');
}
window.openImportModal=function(){
  document.getElementById('import-file').value='';window._importFileChanged();
  window._importProgress(null);
  var activeView=document.querySelector('.view.on');
  var viewId=activeView?activeView.id.replace('view-',''):'';
  var typeMap={hospital:'HOSPITALS',staff:'STAFF',advance:'ADVANCES',contract:'CONTRACTS',helpdesk:'HELPDESK'};
  document.getElementById('import-type').value=typeMap[viewId]||'PROJECTS';
  window.updateImportPreview();
  window.openM('m-import');
}
window.downloadTemplate=function(){
  const type=document.getElementById('import-type').value;
  if(type==='HOSPITALS'){window.downloadHospitalTemplate();return;}
  if(type==='HOSPITAL_CONTACTS'){window.downloadHospitalContactsTemplate();return;}
  if(type==='HOSPITAL_PRODUCTS'){window.downloadHospitalProductsTemplate();return;}
  if(type==='HELPDESK'){window.hdDownloadImportTemplate&&window.hdDownloadImportTemplate();return;}
  if(type==='IMPL_ISSUES'){window.imtDownloadIssueImportTemplate&&window.imtDownloadIssueImportTemplate();return;}
  const schema=window.IMPORT_SCHEMAS[type];if(!schema)return;const csvContent="data:text/csv;charset=utf-8,\uFEFF"+schema.headers.join(",")+"\n"+schema.example.join(",");const link=document.createElement("a");link.setAttribute("href",encodeURI(csvContent));link.setAttribute("download",`Template_${type}.csv`);document.body.appendChild(link);link.click();document.body.removeChild(link);
}
// ── หลอดความคืบหน้าตอนนำเข้า (บังทั้งกล่อง) — total = จำนวนรายการที่ต้องเขียน (รวมรายการที่ลบก่อนนำเข้า)
// total = 0 → ยังไม่รู้จำนวน (กำลังอ่านไฟล์) แสดงหลอดวิ่งแทน % ──
window._importProgress=function(done,total,label){
  const wrap=document.getElementById('import-progress');if(!wrap)return;
  const btn=document.getElementById('import-exec-btn');
  if(done===null){wrap.style.display='none';if(btn)btn.disabled=false;return;}
  wrap.style.display='';if(btn)btn.disabled=true;
  const busy=!(total>0);wrap.classList.toggle('busy',busy);
  const pct=busy?0:Math.min(100,Math.round(done/total*100));
  document.getElementById('import-progress-bar').style.width=pct+'%';
  document.getElementById('import-progress-pct').textContent=busy?'⏳':pct+'%';
  document.getElementById('import-progress-text').textContent=(label||'กำลังนำเข้า')+(busy?'...':' '+done.toLocaleString()+' / '+total.toLocaleString()+' รายการ');
};
// ── กล่องแจ้งผล/ข้อผิดพลาดในหน้านำเข้า — kind: error | warn | ok · items = รายการย่อย (เช่น แถวที่ผิด) ·
// kind=null → ซ่อน ──
window._importAlert=function(kind,title,items,foot){
  const el=document.getElementById('import-alert');if(!el)return;
  if(!kind){el.style.display='none';el.innerHTML='';return;}
  const e=window.esc||(s=>String(s));
  const ico={error:'❌',warn:'⚠',ok:'✅'}[kind]||'';
  const list=(items||[]).filter(Boolean);
  el.className='imp-alert '+kind;
  el.innerHTML='<div class="imp-alert-title">'+ico+' '+e(title)+'</div>'
    +(list.length?'<ul>'+list.slice(0,50).map(x=>'<li>'+e(x)+'</li>').join('')+(list.length>50?'<li>… และอีก '+(list.length-50)+' รายการ</li>':'')+'</ul>':'')
    +(foot?'<div class="imp-alert-foot">'+e(foot)+'</div>':'');
  el.style.display='';
  el.scrollIntoView({block:'nearest',behavior:'smooth'});
};
// ── เลือกไฟล์แล้ว → โชว์ชื่อไฟล์ + กระพริบปุ่ม "นำเข้าข้อมูล" ให้รู้ว่าขั้นถัดไปคือกดปุ่มนั้น ──
window._importFileChanged=function(){
  const f=(document.getElementById('import-file').files||[])[0];
  const drop=document.getElementById('import-drop'),txt=document.getElementById('import-drop-txt'),btn=document.getElementById('import-exec-btn');
  const e=window.esc||(s=>String(s));
  window._importAlert(null);
  if(drop)drop.classList.toggle('has-file',!!f);
  if(btn)btn.classList.toggle('ready',!!f);
  if(txt)txt.innerHTML=f?'<b>✓ '+e(f.name)+'</b><br><span style="font-size:12px;color:var(--txt3)">พร้อมแล้ว — กดปุ่ม "🚀 นำเข้าข้อมูล" ด้านล่างเพื่อเริ่ม · คลิกที่นี่เพื่อเปลี่ยนไฟล์</span>'
    :'<b>คลิกเพื่อเลือกไฟล์</b> หรือลากไฟล์มาวางที่นี่';
};
(function(){
  const drop=document.getElementById('import-drop');if(!drop)return;
  drop.addEventListener('dragover',ev=>{ev.preventDefault();drop.classList.add('drag');});
  drop.addEventListener('dragleave',()=>drop.classList.remove('drag'));
  drop.addEventListener('drop',ev=>{ev.preventDefault();drop.classList.remove('drag');
    if(ev.dataTransfer&&ev.dataTransfer.files.length){document.getElementById('import-file').files=ev.dataTransfer.files;window._importFileChanged();}});
})();
// ── ช่องที่เก็บเป็นรหัส แต่ในไฟล์ CSV พิมพ์เป็นชื่อ → แปลงเป็นรหัสตอนนำเข้า (รับรหัสตรง ๆ ได้ด้วย) · หาไม่เจอ → '' ──
const _refByLabel=list=>v=>{const x=(list()||[]).find(o=>o.id===v||o.label===v);return x?x.id:'';};
const _IMPORT_REF={
  STAFF:{department:_refByLabel(()=>window.DEPT_LIST),position:_refByLabel(()=>window.POSITIONS)},
  PROJECTS:{site_owner:v=>{const s=window.staffByRef(v)||window.staffByName(v);return s?s.id:'';}},
};
window.execImport=async function(){
  const fileInput=document.getElementById('import-file');const selType=document.getElementById('import-type').value;const schema=window.IMPORT_SCHEMAS[selType];const isClearFirst=document.getElementById('import-clear-first').checked;
  if(!fileInput.files.length){window._importAlert('error','กรุณาเลือกไฟล์ก่อน');return;}
  if(selType==='CONTRACTS'){
    if(!window.auth.currentUser){window._importAlert('error','กรุณาเชื่อมต่อก่อน');return;}
    const file=fileInput.files[0];const reader=new FileReader();
    reader.onload=async function(e){
      let text=e.target.result;if(text.charCodeAt(0)===0xFEFF)text=text.substring(1);
      function parseCSV2(str){var arr=[];var quote=false;for(var row=0,col=0,c=0;c<str.length;c++){var cc=str[c],nc=str[c+1];arr[row]=arr[row]||[];arr[row][col]=arr[row][col]||'';if(cc=='"'&&quote&&nc=='"'){arr[row][col]+=cc;++c;continue;}if(cc=='"'){quote=!quote;continue;}if(cc==','&&!quote){++col;continue;}if(cc=='\r'&&nc=='\n'&&!quote){++row;col=0;++c;continue;}if(cc=='\n'&&!quote){++row;col=0;continue;}if(cc=='\r'&&!quote){++row;col=0;continue;}arr[row][col]+=cc;}return arr.filter(r=>r.join('').trim()!=='');}
      // normalize date to YYYY-MM-DD; accepts YYYY-MM-DD / DD/MM/YYYY / Buddhist year
      function _normDate(v){if(!v)return'';v=v.trim();if(!v)return'';if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;var m=v.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);if(m){var y=parseInt(m[3]);if(y>=2500)y-=543;return y+'-'+String(parseInt(m[2])).padStart(2,'0')+'-'+String(parseInt(m[1])).padStart(2,'0');}var d=new Date(v);if(!isNaN(d))return d.toISOString().slice(0,10);return'';}
      const CT_DATE_FIELDS=['contract_sign_date','contract_start_date','end_date'];
      const lines=parseCSV2(text);if(lines.length<=1){window._importAlert('error','ไม่พบข้อมูลในไฟล์');return;}
      const headers=lines[0].map(h=>h.trim());
      const ctSchema=window.IMPORT_SCHEMAS['CONTRACTS'];
      let done=0,total=lines.length-1,label='กำลังนำเข้า';const tick=()=>{done++;window._importProgress(done,total,label);};window._importProgress(0,total,label);
      try{
        let batch=writeBatch();let opCount=0;
        const commitBatchIfNeeded=async()=>{if(opCount>=400){await batch.commit(tick);batch=writeBatch();opCount=0;}};
        if(isClearFirst){const existingDocs=await getDocs(getColRef('CONTRACTS'));total+=existingDocs.docs.length;label='กำลังลบ/นำเข้า';window._importProgress(done,total,label);for(let docSnap of existingDocs.docs){batch.delete(docSnap.ref);opCount++;await commitBatchIfNeeded();}}
        var curYear=new Date().getFullYear();var yrPrefix=curYear+'-';
        var autoNum=(window.CONTRACTS||[]).reduce(function(m,c){if(c.id&&c.id.startsWith(yrPrefix)){var n=parseInt(c.id.slice(yrPrefix.length));return isNaN(n)?m:Math.max(m,n);}return m;},0);
        for(let i=1;i<lines.length;i++){
          const values=lines[i].map(v=>v.trim());let rowObj={};
          headers.forEach((h,idx)=>{
            if(values[idx]!==undefined&&ctSchema.headers.includes(h)){
              let val=values[idx];
              if(h==='total_contract_value')val=Number(val)||0;
              else if(CT_DATE_FIELDS.includes(h))val=_normDate(val);
              rowObj[h]=val;
            }
          });
          let docId=rowObj['contract_id'];
          if(!docId){autoNum++;docId=curYear+'-'+String(autoNum).padStart(4,'0');rowObj['contract_id']=docId;}
          batch.set(getDocRef('CONTRACTS',docId),rowObj);opCount++;await commitBatchIfNeeded();
        }
        if(opCount>0)await batch.commit(tick);
        window._importProgress(null);window.closeM('m-import');window.showAlert(`นำเข้าสัญญาสำเร็จ ${lines.length-1} รายการ`,'success');
      }catch(err){window._importProgress(null);window._importAlert('error','นำเข้าไม่สำเร็จ — เกิดข้อผิดพลาด',[err.message||String(err)],'เขียนไปแล้ว '+done+' / '+total+' รายการ ก่อนเกิดข้อผิดพลาด');}
    };reader.readAsText(file);return;
  }
  if(selType==='HELPDESK'){window.closeM('m-import');window.hdImportFromFile&&window.hdImportFromFile(fileInput.files[0]);return;}
  if(selType==='IMPL_ISSUES'){
    const pid=(document.getElementById('import-imt-project')||{}).value||'';
    if(!pid){window._importAlert('error','กรุณาเลือกโครงการปลายทางก่อน');return;}
    // ล็อกปุ่มตลอดการทำงาน (รวมช่วงอ่านไฟล์ก่อนหลอดความคืบหน้าจะขึ้น) กันกดซ้ำแล้วนำเข้าซ้ำ
    const execBtn=document.getElementById('import-exec-btn');if(execBtn)execBtn.disabled=true;
    try{window.imtRunIssueImportInline&&await window.imtRunIssueImportInline(fileInput.files[0],pid,isClearFirst);}
    catch(err){console.error(err);window._importAlert('error','นำเข้าไม่สำเร็จ — เกิดข้อผิดพลาด',[err.message||String(err)]);}
    finally{window._importProgress(null);}
    return;
  }
  if(selType==='HOSPITALS'){window.closeM('m-import');await window.importHospitalsFromFile(fileInput.files[0]);return;}
  if(selType==='HOSPITAL_CONTACTS'){window.closeM('m-import');await window.importHospitalContactsFromFile(fileInput.files[0]);return;}
  if(selType==='HOSPITAL_PRODUCTS'){window.closeM('m-import');await window.importHospitalProductsFromFile(fileInput.files[0]);return;}
  if(!window.auth.currentUser){window._importAlert('error','กรุณาเชื่อมต่อก่อน');return;}
  const file=fileInput.files[0];const reader=new FileReader();
  reader.onload=async function(e){
    let text=e.target.result;if(text.charCodeAt(0)===0xFEFF)text=text.substring(1);
    function parseCSV(str){var arr=[];var quote=false;for(var row=0,col=0,c=0;c<str.length;c++){var cc=str[c],nc=str[c+1];arr[row]=arr[row]||[];arr[row][col]=arr[row][col]||'';if(cc=='"'&&quote&&nc=='"'){arr[row][col]+=cc;++c;continue;}if(cc=='"'){quote=!quote;continue;}if(cc==','&&!quote){++col;continue;}if(cc=='\r'&&nc=='\n'&&!quote){++row;col=0;++c;continue;}if(cc=='\n'&&!quote){++row;col=0;continue;}if(cc=='\r'&&!quote){++row;col=0;continue;}arr[row][col]+=cc;}return arr.filter(r=>r.join('').trim()!=='');}
    const lines=parseCSV(text);if(lines.length<=1){window._importAlert('error','ไม่พบข้อมูลในไฟล์');return;}
    const headers=lines[0].map(h=>h.trim());
    let done=0,total=lines.length-1,label='กำลังนำเข้า';const tick=()=>{done++;window._importProgress(done,total,label);};window._importProgress(0,total,label);
    const unmatched=[];
    try{
      let batch=writeBatch();let opCount=0;
      const commitBatchIfNeeded=async()=>{if(opCount>=400){await batch.commit(tick);batch=writeBatch();opCount=0;}};
      if(isClearFirst){const existingDocs=await getDocs(getColRef(selType));total+=existingDocs.docs.length;label='กำลังลบ/นำเข้า';window._importProgress(done,total,label);for(let docSnap of existingDocs.docs){batch.delete(docSnap.ref);opCount++;await commitBatchIfNeeded();}}
      for(let i=1;i<lines.length;i++){const values=lines[i].map(v=>v.trim());let rowObj={};const newId=schema.prefix+Date.now()+i;rowObj[schema.idField]=newId;if(selType==='PROJECTS'){rowObj.status='active';rowObj.team=[];rowObj.members=[];}headers.forEach((h,index)=>{if(values[index]!==undefined&&schema.headers.includes(h)){let val=values[index];if(['budget','progress_pct','amount_requested','amount_cleared'].includes(h))val=Number(val)||0;if(['is_active'].includes(h))val=(val.toUpperCase()==='TRUE');const conv=_IMPORT_REF[selType]&&_IMPORT_REF[selType][h];if(conv&&val){const ref=conv(val);if(!ref)unmatched.push(h+'="'+val+'"');val=ref;}rowObj[h]=val;}});batch.set(getDocRef(selType,newId),rowObj);opCount++;await commitBatchIfNeeded();}
      if(opCount>0)await batch.commit(tick);
      window._importProgress(null);window.closeM('m-import');window.showAlert(`นำเข้าข้อมูล ${selType} สำเร็จ ${lines.length-1} รายการ`+(unmatched.length?` · ไม่พบในระบบ (เว้นว่างไว้) ${unmatched.length} ช่อง: ${[...new Set(unmatched)].slice(0,5).join(', ')}`:''),unmatched.length?'warn':'success');
      var admEl=document.getElementById('view-admin');if(admEl&&admEl.classList.contains('on')&&window.admCur)setTimeout(function(){window.admTab(window.admCur);},600);
    }catch(err){window._importProgress(null);window._importAlert('error','นำเข้าไม่สำเร็จ — เกิดข้อผิดพลาด',[err.message||String(err)],'เขียนไปแล้ว '+done+' / '+total+' รายการ ก่อนเกิดข้อผิดพลาด');}
  };reader.readAsText(file);
}

// ── MODALS ──
window.openM=function(id){var m=document.getElementById(id);if(m)m.classList.add('on');}
window.closeM=function(id){var m=document.getElementById(id);if(m)m.classList.remove('on');}
document.addEventListener('keydown',function(e){if(e.key==='Escape')document.querySelectorAll('.overlay.on').forEach(function(m){if(m.id!=='sys-loader')m.classList.remove('on');});});
