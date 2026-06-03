const { esc, fd, fc, fca, pd, gS, gT, gG, gSt, gC, avC, uid, getFY, getYearBE, getStaffOverlaps, overlapWarnText, getStaffLeaveConflicts, getColRef, getDocRef } = window;
const deleteDoc  = (...a) => window.deleteDoc(...a);
const writeBatch = ()    => window.writeBatch();
const getDocs    = (...a) => window.getDocs(...a);
// ── DELETE ──
window.askDel=function(type,id,label){window.delTarget={type:type,id:id};document.getElementById('del-label').textContent=label;window.openM('m-del');}
window.execDelete=async function(){
  if(!window.delTarget)return;if(!window.auth.currentUser)return;
  var t=window.delTarget.type,id=window.delTarget.id;
  var _delModMap={project:'projects',advance:'advance',lodging:'lodging',timesheet:'timesheet',cost:'cost',leave:'leave',contract:'contract'};
  if(['staff','type','position','group','user','stage','department'].includes(t)){if(!window.isAdmin())return;}
  else if(_delModMap[t]){if(!window.canDel(_delModMap[t]))return;}
  else{if(!window.isAdmin())return;}
  var sheetMap={project:'PROJECTS',advance:'ADVANCES',staff:'STAFF',type:'PTYPES',user:'USERS',position:'POSITIONS',group:'PGROUPS',lodging:'LODGINGS',stage:'STAGES',timesheet:'TIMESHEETS',cost:'COSTS',department:'DEPARTMENTS',contract:'CONTRACTS'};
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
  else if(t==='cost')window.COSTS=window.COSTS.filter(x=>x.id!==id);
  else if(t==='contract')window.CONTRACTS=window.CONTRACTS.filter(x=>x.id!==id);
  window.closeM('m-del');window.delTarget=null;window.renderAll();
  if(t==='staff')window.admTab('staff');else if(['type','user','position','group','stage'].includes(t))window.admTab(t+'s');
  if(t==='department')window.admTab('dept');
  if(t==='lodging'&&window.currentLdPid)window.openLodgingGroupModal(window.currentLdPid);
  deleteDoc(getDocRef(sheetMap[t],id)).catch(e=>window.showDbError(e));
}

// ── IMPORT ──
window.updateImportPreview=function(){
  const type=document.getElementById('import-type').value;
  const fileInput=document.getElementById('import-file');
  const fileLabel=document.getElementById('import-file-label');
  const msgEl=document.getElementById('import-msg');
  const formatBox=document.getElementById('import-format-preview');
  const templateBtn=document.getElementById('import-template-btn');
  const titleEl=document.getElementById('import-modal-title');
  if(type==='CONTRACTS'){
    if(fileInput)fileInput.accept='.csv';
    if(fileLabel)fileLabel.textContent='2. เลือกไฟล์ CSV';
    if(msgEl)msgEl.innerHTML='1 แถว = 1 สัญญา · <b>วันที่รองรับ:</b> YYYY-MM-DD · DD/MM/YYYY · DD/MM/พ.ศ. · contract_id ถ้าไม่ระบุจะ generate อัตโนมัติ · status: active / completed / cancelled';
    if(formatBox)formatBox.textContent='contract_id, project_name, customer_name, total_contract_value, contract_sign_date, contract_start_date, end_date, status, note';
    if(templateBtn)templateBtn.textContent='📥 โหลดไฟล์ Template (.csv)';
    if(titleEl)titleEl.textContent='นำเข้าข้อมูลสัญญา (CSV)';
    return;
  }
  if(type==='HOSPITALS'){
    if(fileInput)fileInput.accept='.xlsx,.xls,.csv';
    if(fileLabel)fileLabel.textContent='2. เลือกไฟล์ Excel (.xlsx / .xls / .csv)';
    if(msgEl)msgEl.innerHTML='รองรับ .xlsx / .xls / .csv · ใส่แค่รหัส รพ. ก็พอ หากเชื่อมต่อ MOPH API';
    if(formatBox)formatBox.textContent='hospital_code, hospital_name, province, district, tambon, type, tel, beds, affiliation (ดูคำอธิบายในไฟล์ Template)';
    if(templateBtn)templateBtn.textContent='📄 โหลดไฟล์ Template (.xlsx)';
    if(titleEl)titleEl.textContent='นำเข้าข้อมูล (Excel)';
    return;
  }
  if(type==='HOSPITAL_CONTACTS'){
    if(fileInput)fileInput.accept='.xlsx,.xls,.csv';
    if(fileLabel)fileLabel.textContent='2. เลือกไฟล์ Excel (.xlsx / .xls / .csv)';
    if(msgEl)msgEl.innerHTML='1 แถว = 1 ผู้ติดต่อ · ระบุรหัส รพ. ทุกแถว · รพ. เดียวกันใส่หลายแถวได้';
    if(formatBox)formatBox.textContent='hospital_code, contact_name, phone, position, email, note';
    if(templateBtn)templateBtn.textContent='📄 โหลดไฟล์ Template (.xlsx)';
    if(titleEl)titleEl.textContent='นำเข้าผู้ติดต่อ รพ. (Excel)';
    return;
  }
  if(fileInput)fileInput.accept='.csv';
  if(fileLabel)fileLabel.textContent='2. เลือกไฟล์ CSV';
  if(msgEl)msgEl.innerHTML='รองรับเฉพาะไฟล์ .csv เท่านั้น';
  if(templateBtn)templateBtn.textContent='📥 โหลดไฟล์ Template (.csv)';
  if(titleEl)titleEl.textContent='นำเข้าข้อมูล (CSV)';
  const schema=window.IMPORT_SCHEMAS[type];
  if(schema&&formatBox)formatBox.textContent=schema.headers.join(', ');
}
window.openImportModal=function(){
  document.getElementById('import-file').value='';
  var activeView=document.querySelector('.view.on');
  var viewId=activeView?activeView.id.replace('view-',''):'';
  var typeMap={hospital:'HOSPITALS',staff:'STAFF',advance:'ADVANCES',contract:'CONTRACTS'};
  document.getElementById('import-type').value=typeMap[viewId]||'PROJECTS';
  window.updateImportPreview();
  window.openM('m-import');
}
window.downloadTemplate=function(){
  const type=document.getElementById('import-type').value;
  if(type==='HOSPITALS'){window.downloadHospitalTemplate();return;}
  if(type==='HOSPITAL_CONTACTS'){window.downloadHospitalContactsTemplate();return;}
  if(type==='HOSPITAL_PRODUCTS'){window.downloadHospitalProductsTemplate();return;}
  const schema=window.IMPORT_SCHEMAS[type];if(!schema)return;const csvContent="data:text/csv;charset=utf-8,\uFEFF"+schema.headers.join(",")+"\n"+schema.example.join(",");const link=document.createElement("a");link.setAttribute("href",encodeURI(csvContent));link.setAttribute("download",`Template_${type}.csv`);document.body.appendChild(link);link.click();document.body.removeChild(link);
}
window.execImport=async function(){
  const fileInput=document.getElementById('import-file');const selType=document.getElementById('import-type').value;const schema=window.IMPORT_SCHEMAS[selType];const isClearFirst=document.getElementById('import-clear-first').checked;
  if(!fileInput.files.length){document.getElementById('import-msg').innerHTML='<span style="color:var(--coral)">⚠ กรุณาเลือกไฟล์ก่อน</span>';return;}
  if(selType==='CONTRACTS'){
    if(!window.auth.currentUser){document.getElementById('import-msg').innerHTML='<span style="color:var(--coral)">⚠ กรุณาเชื่อมต่อก่อน</span>';return;}
    const file=fileInput.files[0];const reader=new FileReader();
    reader.onload=async function(e){
      let text=e.target.result;if(text.charCodeAt(0)===0xFEFF)text=text.substring(1);
      function parseCSV2(str){var arr=[];var quote=false;for(var row=0,col=0,c=0;c<str.length;c++){var cc=str[c],nc=str[c+1];arr[row]=arr[row]||[];arr[row][col]=arr[row][col]||'';if(cc=='"'&&quote&&nc=='"'){arr[row][col]+=cc;++c;continue;}if(cc=='"'){quote=!quote;continue;}if(cc==','&&!quote){++col;continue;}if(cc=='\r'&&nc=='\n'&&!quote){++row;col=0;++c;continue;}if(cc=='\n'&&!quote){++row;col=0;continue;}if(cc=='\r'&&!quote){++row;col=0;continue;}arr[row][col]+=cc;}return arr.filter(r=>r.join('').trim()!=='');}
      // normalize date to YYYY-MM-DD; accepts YYYY-MM-DD / DD/MM/YYYY / Buddhist year
      function _normDate(v){if(!v)return'';v=v.trim();if(!v)return'';if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;var m=v.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);if(m){var y=parseInt(m[3]);if(y>=2500)y-=543;return y+'-'+String(parseInt(m[2])).padStart(2,'0')+'-'+String(parseInt(m[1])).padStart(2,'0');}var d=new Date(v);if(!isNaN(d))return d.toISOString().slice(0,10);return'';}
      const CT_DATE_FIELDS=['contract_sign_date','contract_start_date','end_date'];
      const lines=parseCSV2(text);if(lines.length<=1){document.getElementById('import-msg').innerHTML='<span style="color:var(--coral)">⚠ ไม่พบข้อมูลในไฟล์</span>';return;}
      const headers=lines[0].map(h=>h.trim());
      document.getElementById('import-msg').innerHTML='<span style="color:var(--teal)">⏳ กำลังประมวลผล...</span>';
      const ctSchema=window.IMPORT_SCHEMAS['CONTRACTS'];
      try{
        let batch=writeBatch();let opCount=0;
        const commitBatchIfNeeded=async()=>{if(opCount>=400){await batch.commit();batch=writeBatch();opCount=0;}};
        if(isClearFirst){const existingDocs=await getDocs(getColRef('CONTRACTS'));for(let docSnap of existingDocs.docs){batch.delete(docSnap.ref);opCount++;await commitBatchIfNeeded();}}
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
        if(opCount>0)await batch.commit();
        window.closeM('m-import');window.showAlert(`นำเข้าสัญญาสำเร็จ ${lines.length-1} รายการ`,'success');
      }catch(err){document.getElementById('import-msg').innerHTML='<span style="color:var(--coral)">❌ เกิดข้อผิดพลาด: '+err.message+'</span>';}
    };reader.readAsText(file);return;
  }
  if(selType==='HOSPITALS'){window.closeM('m-import');await window.importHospitalsFromFile(fileInput.files[0]);return;}
  if(selType==='HOSPITAL_CONTACTS'){window.closeM('m-import');await window.importHospitalContactsFromFile(fileInput.files[0]);return;}
  if(selType==='HOSPITAL_PRODUCTS'){window.closeM('m-import');await window.importHospitalProductsFromFile(fileInput.files[0]);return;}
  if(!window.auth.currentUser){document.getElementById('import-msg').innerHTML='<span style="color:var(--coral)">⚠ กรุณาเชื่อมต่อก่อน</span>';return;}
  const file=fileInput.files[0];const reader=new FileReader();
  reader.onload=async function(e){
    let text=e.target.result;if(text.charCodeAt(0)===0xFEFF)text=text.substring(1);
    function parseCSV(str){var arr=[];var quote=false;for(var row=0,col=0,c=0;c<str.length;c++){var cc=str[c],nc=str[c+1];arr[row]=arr[row]||[];arr[row][col]=arr[row][col]||'';if(cc=='"'&&quote&&nc=='"'){arr[row][col]+=cc;++c;continue;}if(cc=='"'){quote=!quote;continue;}if(cc==','&&!quote){++col;continue;}if(cc=='\r'&&nc=='\n'&&!quote){++row;col=0;++c;continue;}if(cc=='\n'&&!quote){++row;col=0;continue;}if(cc=='\r'&&!quote){++row;col=0;continue;}arr[row][col]+=cc;}return arr.filter(r=>r.join('').trim()!=='');}
    const lines=parseCSV(text);if(lines.length<=1){document.getElementById('import-msg').innerHTML='<span style="color:var(--coral)">⚠ ไม่พบข้อมูลในไฟล์</span>';return;}
    const headers=lines[0].map(h=>h.trim());document.getElementById('import-msg').innerHTML='<span style="color:var(--teal)">⏳ กำลังประมวลผล...</span>';
    try{
      let batch=writeBatch();let opCount=0;
      const commitBatchIfNeeded=async()=>{if(opCount>=400){await batch.commit();batch=writeBatch();opCount=0;}};
      if(isClearFirst){const existingDocs=await getDocs(getColRef(selType));for(let docSnap of existingDocs.docs){batch.delete(docSnap.ref);opCount++;await commitBatchIfNeeded();}}
      for(let i=1;i<lines.length;i++){const values=lines[i].map(v=>v.trim());let rowObj={};const newId=schema.prefix+Date.now()+i;rowObj[schema.idField]=newId;if(selType==='PROJECTS'){rowObj.status='active';rowObj.team=[];rowObj.members=[];}headers.forEach((h,index)=>{if(values[index]!==undefined&&schema.headers.includes(h)){let val=values[index];if(['budget','progress_pct','amount_requested','amount_cleared'].includes(h))val=Number(val)||0;if(['is_active'].includes(h))val=(val.toUpperCase()==='TRUE');rowObj[h]=val;}});batch.set(getDocRef(selType,newId),rowObj);opCount++;await commitBatchIfNeeded();}
      if(opCount>0)await batch.commit();
      window.closeM('m-import');window.showAlert(`นำเข้าข้อมูล ${selType} สำเร็จ ${lines.length-1} รายการ`,'success');
      var admEl=document.getElementById('m-admin');if(admEl&&admEl.classList.contains('on')&&window.admCur)setTimeout(function(){window.admTab(window.admCur);},600);
    }catch(err){document.getElementById('import-msg').innerHTML='<span style="color:var(--coral)">❌ เกิดข้อผิดพลาด: '+err.message+'</span>';}
  };reader.readAsText(file);
}

// ── MODALS ──
window.openM=function(id){document.getElementById(id).classList.add('on');}
window.closeM=function(id){document.getElementById(id).classList.remove('on');}
document.addEventListener('keydown',function(e){if(e.key==='Escape')document.querySelectorAll('.overlay.on').forEach(function(m){if(m.id!=='sys-loader')m.classList.remove('on');});});
