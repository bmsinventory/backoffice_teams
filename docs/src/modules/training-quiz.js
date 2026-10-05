/* ══════════════════════════════════════════════════════════════════════════
   training-quiz.js — แบบทดสอบ (โหลดต่อจาก src/modules/training-app.js · ใช้ตัวแปร/ฟังก์ชันของหน้านั้นตรง ๆ)
     เมนู "ระบบอบรม" (?view=overview — แท็บ คลังแบบทดสอบ / ใบประกาศ & อีเมล · วาดลง #ov-content)
       คลังแบบทดสอบกลาง = ใช้ร่วมทุกโครงการ · คลังข้อสอบ (เพิ่มเอง / AI ร่าง / นำเข้า Excel) · แก้ได้เฉพาะสิทธิ์ "แก้ไข"
       ใบประกาศ + บัญชีส่งอีเมล (EmailJS) — ใช้ร่วมทุกโครงการ
     แท็บอบรมของโครงการ › ผลสอบ & ใบประกาศ — ผลรายคน · ใบประกาศ (ส่งอีเมลอีกครั้ง / ยกเลิก) · ส่งออก Excel — เฉพาะโครงการนี้
     หลักสูตรอบรม (ของกลาง) ผูกแบบทดสอบ (trn_categories.quiz_id) · เปิด/ปิดสอบรายโครงการ = trn_site_categories.quiz_open (training-app.js)
   คลังกลาง/เฉลย อ่าน-เขียนผ่าน trn_quiz_admin (ตรวจ session Backoffice ในฐานข้อมูล — db-training.sql) หน้าสอบอ่านเฉลยไม่ได้
   ข้อที่มีคนสอบแล้วแก้คำถาม/ตัวเลือก/เฉลยไม่ได้ (ผลสอบเก่าจะไม่ตรง) — แก้ = ปิดข้อเดิม + เพิ่มเป็นข้อใหม่ · ลบ = ปิดข้อ
   ผู้สอบใช้ /training/?page=quiz (src/modules/training-quiz-take.js) · ใบประกาศ/อีเมล = src/utils/trn-cert.util.js
══════════════════════════════════════════════════════════════════════════ */
let _tqaTab='quizzes',_tqaQuizzes=[],_tqaUse=[],_tqaQ=null,_tqaQs=[],_tqaRes=[],_tqaCerts=[],_tqaSt=null,_tqaSite=null,_tqaDraft=[];
const _TQA_CH=['ก','ข','ค','ง','จ','ฉ'];
const _tqaLink=catId=>`${location.origin}${location.pathname.replace(/[^/]*$/,'')}?page=quiz&site=${encodeURIComponent(currentSite)}&cat=${catId}`;
const _tqaName=q=>q?.title||'';
const _tqaEl=()=>document.getElementById(OVERVIEW?'ov-content':'tqa-body');
// แก้คลังกลาง (กระทบทุกโครงการ) = Admin หรือสิทธิ์ "แก้ไข" ของอบรม — ฐานข้อมูลตรวจซ้ำใน trn_quiz_admin
const _tqaCanEdit=()=>!currentAdminUser||currentAdminUser.role==='superadmin'||!!currentAdminUser.perm?.edit;
// โครงการที่ใช้ชุดนี้ (โครงการที่เปิดหลักสูตรอบรมที่ผูกชุดนี้ไว้)
const _tqaSites=id=>new Set(_tqaUse.filter(c=>c.quiz_id===id).map(c=>c.site));

// งานที่ต้องใช้เฉลย / แก้คลังกลาง — ส่ง session ของ Backoffice ไปให้ฐานข้อมูลตรวจ
async function _tqaAdmin(action,data){
  const s=window.BmsSession.get()||{};
  const {data:r,error}=await _sb.rpc('trn_quiz_admin',{p_uid:String(s.uid||''),p_sig:s.sig||'',p_action:action,p_data:data});
  if(error)throw new Error(error.message);
  return r;
}
function _tqaModal(id,html,max=560){
  let m=document.getElementById(id);
  if(!m){m=document.createElement('div');m.className='modal-overlay';m.id=id;m.onclick=e=>{if(e.target===m)closeModal(id);};document.body.appendChild(m);}
  m.innerHTML=`<div class="modal" style="max-width:${max}px;">${html}</div>`;
  m.classList.add('open');
  return m;
}

/* ── เปิดแท็บ / เปลี่ยนโครงการ (switchAdminTab · _syncSiteUI ใน training-app.js) — แท็บของโครงการ = ผลสอบ & ใบประกาศ ── */
function _initQuizAdmin(){
  if(_tqaSite!==currentSite){_tqaSite=currentSite;_tqaQ=null;}
  _tqaTab='results';
  _tqaRender();
}
window._tqaSiteChanged=()=>{if(document.getElementById('asec-quiz')?.classList.contains('active'))_initQuizAdmin();};
function _tqaRender(){
  _tqaEl().innerHTML='<div class="tqa-empty">กำลังโหลด...</div>';
  if(_tqaTab==='results')return _tqaResults();
  if(_tqaTab==='settings')return _tqaSettings();
  return _tqaQ?_tqaQuestions():_tqaList();
}

/* ══════════════════ คลังแบบทดสอบกลาง ══════════════════ */
async function _tqaLoadQuizzes(){
  const [qR,uR,cR]=await Promise.all([
    _sb.from('trn_quizzes').select('*').order('title'),
    _allRows(()=>_sb.from('trn_site_categories').select('site,cat_id,trn_categories!inner(quiz_id)').order('cat_id')),
    OVERVIEW?_sb.from('trn_categories').select('*').order('id'):_NONE, // เมนูระบบอบรม: หลักสูตรกลางทั้งหมด (แสดงว่าชุดไหนผูกกับหลักสูตรใด)
  ]);
  _tqaQuizzes=qR.data||[];
  if(cR.data)allCategories=categories=cR.data.map(r=>_mCat(r,null));
  _tqaUse=(uR.data||[]).map(x=>({site:x.site,quiz_id:x.trn_categories?.quiz_id})).filter(x=>x.quiz_id);
  _tqaSyncCats();
}
// หลักสูตรที่เปิดสอบอยู่ (_quizCatIds ของ training-app.js) — ใช้ใน Analytics / หลักสูตรอบรม (หน้าลงทะเบียนไม่แสดงปุ่มสอบ)
function _tqaSyncCats(){
  categories.forEach(c=>{const q=_tqaQuizzes.find(x=>x.id===c.quizId);if(q&&q.is_active&&c.quizOpen)_quizCatIds.add(c.id);else _quizCatIds.delete(c.id);});
}
// แถบสรุป (ทั้งหมด/ใช้งาน/ปิดใช้งาน/ข้อสอบไม่พอ — กดชิปเพื่อกรอง) + ค้นหา · การ์ดหน้าตาเดียวกับแท็บหลักสูตรอบรม (ov-cat-*)
let _tqaQCount={},_tqaListQ='',_tqaListF='all';
const _tqaShort=q=>(_tqaQCount[q.id]||0)<q.questions_count;
async function _tqaList(){
  await _tqaLoadQuizzes();
  const qR=_tqaQuizzes.length?await _allRows(()=>_sb.from('trn_quiz_questions').select('id,quiz_id').eq('is_active',true).order('id')):{data:[]};
  _tqaQCount={};
  (qR.data||[]).forEach(x=>{_tqaQCount[x.quiz_id]=(_tqaQCount[x.quiz_id]||0)+1;});
  _tqaListRender();
}
function _tqaListRender(){
  const edit=_tqaCanEdit(),all=_tqaQuizzes;
  const n={all:all.length,on:all.filter(q=>q.is_active).length,off:all.filter(q=>!q.is_active).length,short:all.filter(_tqaShort).length};
  const chip=(f,ic,label,cls)=>`<button type="button" class="ov-cat-chip${cls?' '+cls:''}${_tqaListF===f?' active':''}" onclick="_tqaListF='${f}';_tqaListRender()"><i class="ti ti-${ic}"></i>${label} <b>${n[f]}</b></button>`;
  _tqaEl().innerHTML=`<div class="card"><div class="card-header">
      <div><div class="card-title"><i class="ti ti-books"></i>คลังแบบทดสอบกลาง</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">ใช้ร่วมทุกโครงการ — แก้ข้อสอบแล้วมีผลกับทุกโครงการที่ใช้ชุดนั้น${edit?'':' · คุณดูได้อย่างเดียว (แก้ไขต้องมีสิทธิ์ "แก้ไข" ของเมนูอบรม)'}</div></div>
      ${edit?'<button class="btn btn-primary btn-sm" onclick="_tqaEdit(0)"><i class="ti ti-plus"></i>สร้างแบบทดสอบ</button>':''}</div>
    ${all.length?`<div class="ov-cat-bar">
        <div class="ov-cat-chips">${chip('all','list','ทั้งหมด')}${chip('on','circle-check','ใช้งาน','ok')}${chip('off','circle-off','ปิดใช้งาน')}${n.short?chip('short','alert-triangle','ข้อสอบไม่พอ','warn'):''}</div>
        <div class="ov-cat-search"><i class="ti ti-search"></i><input class="form-control" placeholder="ค้นหาแบบทดสอบ..." value="${_esc(_tqaListQ)}" oninput="_tqaListQ=this.value;_tqaListGrid()"></div>
      </div><div id="tqa-list-grid"></div>`
      :'<div class="tqa-empty">ยังไม่มีแบบทดสอบในคลัง</div>'}</div>`;
  if(all.length)_tqaListGrid();
}
// วาดเฉพาะกริด — พิมพ์ค้นหาแล้วช่องค้นหาไม่หลุดโฟกัส
function _tqaListGrid(){
  const el=document.getElementById('tqa-list-grid');
  if(!el)return;
  const edit=_tqaCanEdit(),kw=_tqaListQ.trim().toLowerCase();
  const pass={all:()=>true,on:q=>q.is_active,off:q=>!q.is_active,short:_tqaShort}[_tqaListF]||(()=>true);
  const list=[..._tqaQuizzes.filter(q=>q.is_active),..._tqaQuizzes.filter(q=>!q.is_active)]
    .filter(q=>pass(q)&&(!kw||q.title.toLowerCase().includes(kw)));
  if(!list.length){el.innerHTML='<div class="tqa-empty">ไม่พบแบบทดสอบที่ตรงกับเงื่อนไข</div>';return;}
  el.innerHTML='<div class="ov-cat-grid">'+list.map(q=>{
    const cnt=_tqaQCount[q.id]||0,short=_tqaShort(q),used=_tqaSites(q.id).size;
    const cats=categories.filter(c=>c.quizId===q.id);
    return`<div class="ov-cat-card${q.is_active?'':' off'}" style="--cat-c:${q.is_active?'var(--primary)':'var(--text-muted)'};">
      <div class="ov-cat-head">
        <span class="tqa-cat-ic" style="background:var(--primary-light);color:var(--primary);"><i class="ti ti-clipboard-list"></i></span>
        <div class="ov-cat-name">${_esc(q.title)}${q.is_active?'':' <span class="badge badge-gray">ปิดใช้งาน</span>'}</div>
        ${edit?`<div class="ov-cat-act">
          <button class="btn btn-ghost btn-sm" onclick="_tqaEdit(${q.id})" title="ตั้งค่า"><i class="ti ti-settings"></i></button>
          <button class="btn btn-ghost btn-sm" onclick="_tqaCopy(${q.id})" title="คัดลอก — สร้างชุดใหม่จากชุดนี้ แล้วแก้ต่อ"><i class="ti ti-copy"></i></button>
          <button class="btn btn-ghost btn-sm" onclick="_tqaDelete(${q.id})" title="ลบแบบทดสอบ"><i class="ti ti-trash" style="color:var(--danger)"></i></button></div>`:''}
      </div>
      <div class="ov-cat-stats three">
        <div${short?' class="warn"':''}><i class="ti ti-database"></i><b>${cnt}</b> ข้อในคลัง</div>
        <div><i class="ti ti-arrows-shuffle"></i><b>${q.questions_count}</b> สุ่ม/ครั้ง</div>
        <div><i class="ti ti-target"></i><b>${q.pass_percent}%</b> ผ่าน</div>
      </div>
      <div class="tqa-chips">
        <span><i class="ti ti-clock"></i>${q.time_limit_min?q.time_limit_min+' นาที':'ไม่จับเวลา'}</span>
        <span><i class="ti ti-repeat"></i>${q.max_attempts?'สอบได้ '+q.max_attempts+' ครั้ง':'ไม่จำกัดครั้ง'}</span>
        <span><i class="ti ti-building-hospital"></i>ใช้ใน ${used} โครงการ</span>
      </div>
      ${short?`<div class="tqa-warn" style="margin:0;"><i class="ti ti-alert-triangle"></i>ข้อสอบในคลังน้อยกว่าจำนวนที่สุ่ม — ผู้สอบจะได้เพียง ${cnt} ข้อ</div>`:''}
      <div class="ov-cat-quizbox${cats.length?'':' none'}">
        <label><i class="ti ti-${cats.length?'category':'alert-triangle'}"></i>${cats.length?'ผูกกับหลักสูตรอบรม':'ยังไม่ผูกกับหลักสูตรใด'}</label>
        ${cats.length?`<div class="ov-cat-quiz-name">${cats.map(c=>_esc(c.name)).join(', ')}</div>`:''}
      </div>
      <button class="btn btn-primary btn-sm" onclick="_tqaOpen(${q.id})"><i class="ti ti-list-details"></i>จัดการข้อสอบ (${cnt} ข้อ)</button>
    </div>`;
  }).join('')+'</div>';
}
function _tqaEdit(id){
  const q=id?_tqaQuizzes.find(x=>x.id===id):{title:'',questions_count:10,pass_percent:80,time_limit_min:0,max_attempts:0,is_active:true};
  const used=id?_tqaSites(id).size:0;
  _tqaModal('modal-tqa-quiz',`<div class="modal-title"><i class="ti ti-${id?'settings':'plus'}"></i>${id?'ตั้งค่าแบบทดสอบ':'สร้างแบบทดสอบ'}</div>
    ${used>1?`<div class="tqa-warn"><i class="ti ti-alert-triangle"></i>ชุดนี้ใช้อยู่ ${used} โครงการ — การตั้งค่าจะมีผลกับทุกโครงการ</div>`:''}
    <div class="form-group"><label class="form-label">ชื่อแบบทดสอบ <span style="font-weight:400;color:var(--text-muted)">(แสดงบนใบประกาศ)</span></label><input class="form-control" id="tqa-f-title" value="${_esc(q.title)}" placeholder="เช่น การใช้งานระบบคลังสินค้า"></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">จำนวนข้อที่สุ่ม</label><input class="form-control" type="number" min="1" id="tqa-f-n" value="${q.questions_count}"></div>
      <div class="form-group"><label class="form-label">เกณฑ์ผ่าน (%)</label><input class="form-control" type="number" min="1" max="100" id="tqa-f-pass" value="${q.pass_percent}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">เวลาสอบ (นาที · 0 = ไม่จับเวลา)</label><input class="form-control" type="number" min="0" id="tqa-f-time" value="${q.time_limit_min}"></div>
      <div class="form-group"><label class="form-label">สอบได้กี่ครั้ง (0 = ไม่จำกัด)</label><input class="form-control" type="number" min="0" id="tqa-f-max" value="${q.max_attempts}"></div>
    </div>
    ${id?`<label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;"><input type="checkbox" id="tqa-f-on" ${q.is_active?'checked':''}>เปิดใช้งาน
      <span style="font-size:12px;color:var(--text-muted)">(ปิด = เลิกใช้ชุดนี้ ทุกโครงการสอบไม่ได้ · ผลสอบเดิมยังอยู่)</span></label>`:''}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px;">
      <button class="btn btn-ghost" onclick="closeModal('modal-tqa-quiz')">ยกเลิก</button>
      <button class="btn btn-primary" onclick="_tqaSaveQuiz(${id})"><i class="ti ti-device-floppy"></i>${id?'บันทึก':'สร้าง'}</button></div>`);
}
async function _tqaSaveQuiz(id){
  const v=k=>document.getElementById('tqa-f-'+k).value;
  const row={title:v('title').trim(),questions_count:Math.max(1,+v('n')||1),pass_percent:Math.min(100,Math.max(1,+v('pass')||80)),
    time_limit_min:Math.max(0,+v('time')||0),max_attempts:Math.max(0,+v('max')||0)};
  if(!row.title)return showToast('กรุณาใส่ชื่อแบบทดสอบ','warn');
  if(id){row.id=id;row.is_active=document.getElementById('tqa-f-on').checked;}
  let q;
  try{q=await _tqaAdmin('save_quiz',row);}catch(e){return showToast(e.message,'danger');}
  closeModal('modal-tqa-quiz');showToast(id?'บันทึกแล้ว':'สร้างแบบทดสอบแล้ว — เพิ่มข้อสอบได้เลย');
  const i=_tqaQuizzes.findIndex(x=>x.id===q.id);
  if(i<0)_tqaQuizzes.push(q);else _tqaQuizzes[i]=q;
  if(_tqaQ&&_tqaQ.id===q.id)_tqaQ=q;
  _tqaSyncCats();renderAdminCats();
  if(!id)return _tqaOpen(q.id);
  _tqaRender();
}
async function _tqaCopy(id){
  const src=_tqaQuizzes.find(x=>x.id===id);
  if(!await showConfirm(`คัดลอก "${src.title}" เป็นชุดใหม่?`,'ได้ชุดใหม่พร้อมข้อสอบที่ใช้งานอยู่ แก้ได้อิสระไม่กระทบชุดเดิม (เช่น ปรับเฉพาะ รพ. ที่ขั้นตอนต่างออกไป)',{okLabel:'คัดลอก',danger:false}))return;
  try{const q=await _tqaAdmin('copy_quiz',{id});_tqaQuizzes.push(q);showToast('คัดลอกแล้ว — แก้ชื่อได้ที่ "ตั้งค่า"');_tqaOpen(q.id);}
  catch(e){showToast(e.message,'danger');}
}
async function _tqaDelete(id){
  const q=_tqaQuizzes.find(x=>x.id===id),used=_tqaSites(id).size;
  if(!await showConfirm(`ลบแบบทดสอบ "${_tqaName(q)}"?`,(used?`ชุดนี้ใช้อยู่ ${used} โครงการ — หลักสูตรอบรมที่เลือกชุดนี้จะไม่มีแบบทดสอบ · `:'')+'ลบได้เฉพาะชุดที่ยังไม่มีผู้สอบ (มีแล้วให้ปิดใช้งานที่ "ตั้งค่า" แทน)',{okLabel:'ลบ'}))return;
  try{await _tqaAdmin('delete_quiz',{id});}catch(e){return showToast(e.message,'danger');}
  categories.forEach(c=>{if(c.quizId===id)c.quizId=null;});
  showToast('ลบแล้ว');_tqaRender();renderAdminCats();
}
async function _tqaCopyLink(catId){
  const t=_tqaLink(catId);
  try{await navigator.clipboard.writeText(t);showToast('คัดลอกลิงก์แล้ว');}catch(e){prompt('คัดลอกลิงก์',t);}
}

/* ══════════════════ คลังข้อสอบ ══════════════════ */
async function _tqaOpen(id){_tqaQ=_tqaQuizzes.find(x=>x.id===id);_tqaRender();}
async function _tqaQuestions(){
  const el=_tqaEl();
  try{[_tqaQs]=await Promise.all([_tqaAdmin('questions',{quiz_id:_tqaQ.id}),_tqaSt?null:TrnCert.settings(_sb).then(s=>{_tqaSt=s;})]);}
  catch(e){el.innerHTML=`<div class="tqa-empty">${_esc(e.message)}</div>`;return;}
  const q=_tqaQ,act=_tqaQs.filter(x=>x.is_active).length,n=q.questions_count,used=_tqaSites(q.id).size,edit=_tqaCanEdit();
  // ความพร้อมก่อนส่งลิงก์ให้ผู้เข้าอบรม
  const ready=[
    [act>=n,`ข้อสอบในคลัง ${act}/${n} ข้อ`,act>=n?'ครบตามจำนวนที่สุ่ม':`ต้องเพิ่มอีก ${n-act} ข้อ`],
    [q.is_active&&used>0,'ใช้ในโครงการ',!q.is_active?'ชุดนี้ปิดใช้งานอยู่ — เปิดได้ที่ "ตั้งค่า"':used?`${used} โครงการ`:'ยังไม่มีหลักสูตรอบรมเลือกชุดนี้'],
    [TrnCert.mailReady(_tqaSt),'ส่งใบประกาศทางอีเมล',TrnCert.mailReady(_tqaSt)?'ตั้งค่าแล้ว':'ยังไม่ได้ตั้งค่า — ไปที่ "ตั้งค่าใบประกาศ & อีเมล"'],
  ];
  el.innerHTML=`<div class="tqa-crumb"><a href="#" onclick="_tqaBack();return false;"><i class="ti ti-arrow-left"></i>แบบทดสอบทั้งหมด</a></div>
    <div class="card tqa-head">
      <div class="tqa-head-top">
        <div class="tqa-head-icon"><i class="ti ti-certificate"></i></div>
        <div class="tqa-head-main">
          <div class="tqa-head-title">${_esc(_tqaName(q))}${q.is_active?'':'<span class="badge badge-gray">ปิดใช้งาน</span>'}</div>
          <div class="tqa-chips"><span><i class="ti ti-arrows-shuffle"></i>สุ่ม ${n} ข้อ/ครั้ง</span><span><i class="ti ti-target"></i>ผ่าน ${q.pass_percent}%</span>
            <span><i class="ti ti-clock"></i>${q.time_limit_min?q.time_limit_min+' นาที':'ไม่จับเวลา'}</span><span><i class="ti ti-repeat"></i>${q.max_attempts?'สอบได้ '+q.max_attempts+' ครั้ง':'สอบได้ไม่จำกัด'}</span></div>
        </div>
        ${edit?`<div class="tqa-head-act">
          <button class="btn btn-ghost btn-sm" onclick="_tqaEdit(${q.id})"><i class="ti ti-settings"></i>ตั้งค่า</button>
          <button class="btn btn-ghost btn-sm" onclick="_tqaCopy(${q.id})"><i class="ti ti-copy"></i>คัดลอกเป็นชุดใหม่</button>
        </div>`:''}
      </div>
      ${used>1?`<div class="tqa-warn" style="margin:10px 0 0;"><i class="ti ti-info-circle"></i>ชุดนี้ใช้ร่วม ${used} โครงการ — แก้ข้อสอบแล้วมีผลกับทุกโครงการ · ข้อที่มีผู้สอบแล้วแก้เนื้อหาไม่ได้ (ระบบจะปิดข้อเดิมแล้วเพิ่มเป็นข้อใหม่)</div>`:''}
      <div class="tqa-ready">${ready.map(([ok,t,s],i)=>`<div class="tqa-ready-item ${ok?'ok':''}"${!ok&&i===2?` onclick="ovTab('cert')" style="cursor:pointer"`:''}>
        <i class="ti ti-${ok?'circle-check-filled':'circle-dashed'}"></i><div><b>${t}</b><span>${s}</span></div></div>`).join('')}</div>
    </div>
    <input type="file" id="tqa-xlsx" accept=".xlsx,.xls,.csv" style="display:none" onchange="_tqaImport(this)">
    ${_tqaQs.length?`<div class="tqa-toolbar">
        <div class="tqa-toolbar-title">คลังข้อสอบ <span>${_tqaQs.length} ข้อ · ใช้งาน ${act}</span></div>
        ${_tqaQs.length>5?`<input class="form-control tqa-search" id="tqa-q-find" placeholder="ค้นหาข้อสอบ" oninput="_tqaQList()">`:''}
        <div class="tqa-toolbar-act">
          ${edit?`<button class="btn btn-primary btn-sm" onclick="_tqaEditQ()"><i class="ti ti-plus"></i>เพิ่มข้อ</button>
          <button class="btn btn-sm tqa-ai" onclick="_tqaAiOpen()"><i class="ti ti-sparkles"></i>AI ร่างข้อสอบ</button>
          <span class="tqa-sep"></span>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('tqa-xlsx').click()" title="นำเข้าข้อสอบจาก Excel"><i class="ti ti-file-import"></i>นำเข้า</button>`:''}
          <button class="btn btn-ghost btn-sm" onclick="_tqaExportQs()" title="ส่งออกข้อสอบเป็น Excel"><i class="ti ti-file-export"></i>ส่งออก</button>
        </div></div><div id="tqa-q-list"></div>`
    :!edit?'<div class="tqa-empty">แบบทดสอบชุดนี้ยังไม่มีข้อสอบ</div>'
    :`<div class="tqa-start">
        <div class="tqa-start-title">เริ่มสร้างคลังข้อสอบ</div>
        <div class="tqa-start-sub">ควรมีอย่างน้อย ${n} ข้อ (จำนวนที่สุ่มต่อครั้ง) — ยิ่งมากกว่า ผู้สอบแต่ละคนยิ่งได้ชุดไม่ซ้ำกัน</div>
        <div class="tqa-start-grid">
          <button class="tqa-start-card" onclick="_tqaEditQ()"><i class="ti ti-pencil-plus"></i><b>เพิ่มทีละข้อ</b><span>พิมพ์คำถาม ตัวเลือก และเลือกข้อที่ถูกเอง</span></button>
          <button class="tqa-start-card ai" onclick="_tqaAiOpen()"><i class="ti ti-sparkles"></i><b>ให้ AI ร่างข้อสอบ</b><span>วางเนื้อหาจากคู่มือหรือสไลด์ AI ร่างให้ ตรวจแล้วเลือกข้อที่ใช้</span></button>
          <button class="tqa-start-card" onclick="document.getElementById('tqa-xlsx').click()"><i class="ti ti-file-import"></i><b>นำเข้าจาก Excel</b><span>มีข้อสอบในไฟล์อยู่แล้ว</span>
            <a href="#" onclick="event.stopPropagation();_tqaExportQs();return false;"><i class="ti ti-download"></i>ดาวน์โหลดแม่แบบ</a></button>
        </div></div>`}`;
  if(_tqaQs.length)_tqaQList();
}
function _tqaBack(){_tqaQ=null;_tqaRender();}
// รายการข้อสอบ (ค้นหาในหน้า ไม่โหลดใหม่) — เลขข้อคงตามลำดับในคลัง
function _tqaQList(){
  const f=_normTxt(document.getElementById('tqa-q-find')?.value);
  const rows=_tqaQs.map((q,i)=>({q,i})).filter(({q})=>!f||_normTxt(q.question+' '+q.choices.join(' ')).includes(f)),edit=_tqaCanEdit();
  document.getElementById('tqa-q-list').innerHTML=rows.length?rows.map(({q,i})=>`<div class="card tqa-q${q.is_active?'':' off'}">
      <div class="tqa-q-head"><span class="tqa-q-no">${i+1}</span><div class="tqa-q-text">${_esc(q.question)}${q.is_active?'':' <span class="badge badge-gray">ไม่ใช้</span>'}${q.used?' <span class="badge badge-blue" title="แก้คำถาม/ตัวเลือก/เฉลยแล้วจะเป็นข้อใหม่ (ผลสอบเก่ายังตรง)">มีผู้สอบแล้ว</span>':''}</div>
        ${edit?`<div class="tqa-q-act">
          <label class="tqa-switch" title="${q.is_active?'ใช้ในการสุ่ม — กดเพื่อปิด':'ไม่ใช้ในการสุ่ม — กดเพื่อเปิด'}"><input type="checkbox" ${q.is_active?'checked':''} onchange="_tqaToggleQ(${q.id},this.checked)"><span></span></label>
          <button class="btn btn-ghost btn-sm" onclick="_tqaEditQ(${q.id})" title="แก้ไข"><i class="ti ti-pencil"></i></button>
          <button class="btn btn-ghost btn-sm" onclick="_tqaDelQ(${q.id})" title="${q.used?'ปิดข้อนี้ (มีผู้สอบแล้ว ลบไม่ได้)':'ลบ'}"><i class="ti ti-trash" style="color:var(--danger)"></i></button>
        </div>`:''}</div>
      <div class="tqa-q-ch">${q.choices.map((c,j)=>`<div class="${j===q.answer?'ok':''}"><b>${_TQA_CH[j]||j+1}</b>${_esc(c)}${j===q.answer?'<i class="ti ti-check"></i>':''}</div>`).join('')}</div>
      ${q.explanation?`<div class="tqa-q-ex"><i class="ti ti-info-circle"></i>${_esc(q.explanation)}</div>`:''}
    </div>`).join(''):'<div class="tqa-empty">ไม่พบข้อสอบที่ค้นหา</div>';
}
async function _tqaSaveQs(rows,del=[]){
  try{await _tqaAdmin('save_questions',{quiz_id:_tqaQ.id,rows,delete_ids:del});return true;}
  catch(e){showToast(e.message,'danger');return false;}
}
async function _tqaToggleQ(id,on){
  const q=_tqaQs.find(x=>x.id===id);
  if(await _tqaSaveQs([{...q,is_active:on}]))await _tqaQuestions();
}
async function _tqaDelQ(id){
  const q=_tqaQs.find(x=>x.id===id);
  if(q.used){
    if(!await showConfirm('ปิดข้อสอบข้อนี้?','ข้อนี้มีผู้สอบแล้ว ลบไม่ได้ (ผลสอบเก่าต้องใช้) — ระบบจะปิดไม่ให้สุ่มแทน',{okLabel:'ปิดข้อนี้'}))return;
  }else if(!await showConfirm('ลบข้อสอบข้อนี้?','',{okLabel:'ลบ'}))return;
  if(await _tqaSaveQs([],[id])){showToast(q.used?'ปิดข้อนี้แล้ว':'ลบแล้ว');await _tqaQuestions();}
}
function _tqaEditQ(id){
  const q=id?_tqaQs.find(x=>x.id===id):{question:'',choices:['','','',''],answer:0,explanation:'',is_active:true};
  _tqaModal('modal-tqa-q',`<div class="modal-title"><i class="ti ti-${id?'pencil':'plus'}"></i>${id?'แก้ไขข้อสอบ':'เพิ่มข้อสอบ'}</div>
    ${q.used?'<div class="tqa-warn"><i class="ti ti-info-circle"></i>ข้อนี้มีผู้สอบแล้ว — ถ้าแก้คำถาม/ตัวเลือก/เฉลย ระบบจะปิดข้อเดิมแล้วบันทึกเป็นข้อใหม่ (ผลสอบเก่ายังตรงกับข้อที่สอบจริง)</div>':''}
    <div class="form-group"><label class="form-label">คำถาม</label><textarea class="form-control" id="tqa-q-text" rows="3">${_esc(q.question)}</textarea></div>
    <label class="form-label">ตัวเลือก <span style="font-weight:400;color:var(--text-muted)">(เลือกวงกลมหน้าข้อที่ถูก)</span></label>
    <div id="tqa-q-ch"></div>
    <button class="btn btn-ghost btn-sm" id="tqa-q-add" onclick="_tqaAddCh()" style="margin:4px 0 12px;"><i class="ti ti-plus"></i>เพิ่มตัวเลือก</button>
    <div class="form-group"><label class="form-label">คำอธิบายเฉลย <span style="font-weight:400;color:var(--text-muted)">(ผู้ดูแลเห็นเท่านั้น)</span></label><textarea class="form-control" id="tqa-q-ex" rows="2">${_esc(q.explanation)}</textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button class="btn btn-ghost" onclick="closeModal('modal-tqa-q')">ยกเลิก</button>
      <button class="btn btn-primary" onclick="_tqaSaveQ(${id||0})"><i class="ti ti-device-floppy"></i>บันทึก</button></div>`,620);
  _tqaChRender(q.choices,q.answer);
}
function _tqaChRead(){
  return{choices:[...document.querySelectorAll('#tqa-q-ch input[type=text]')].map(i=>i.value),
    answer:Math.max(0,[...document.querySelectorAll('#tqa-q-ch input[type=radio]')].findIndex(r=>r.checked))};
}
function _tqaChRender(choices,answer){
  document.getElementById('tqa-q-ch').innerHTML=choices.map((c,j)=>`<div class="tqa-ch-row">
    <input type="radio" name="tqa-ans" ${j===answer?'checked':''}><b>${_TQA_CH[j]}</b>
    <input type="text" class="form-control" value="${_esc(c)}" placeholder="ตัวเลือก ${_TQA_CH[j]}">
    ${choices.length>2?`<button class="btn btn-ghost btn-sm" onclick="_tqaDelCh(${j})"><i class="ti ti-x"></i></button>`:''}</div>`).join('');
  document.getElementById('tqa-q-add').style.display=choices.length>=6?'none':'';
}
function _tqaAddCh(){const s=_tqaChRead();s.choices.push('');_tqaChRender(s.choices,s.answer);}
function _tqaDelCh(j){const s=_tqaChRead();s.choices.splice(j,1);_tqaChRender(s.choices,s.answer===j?0:s.answer>j?s.answer-1:s.answer);}
async function _tqaSaveQ(id){
  const s=_tqaChRead(),question=document.getElementById('tqa-q-text').value.trim();
  const keep=s.choices.map((c,j)=>({c:c.trim(),j})).filter(x=>x.c);
  if(!question)return showToast('กรุณาใส่คำถาม','warn');
  if(keep.length<2)return showToast('ต้องมีอย่างน้อย 2 ตัวเลือก','warn');
  const ans=keep.findIndex(x=>x.j===s.answer);
  if(ans<0)return showToast('ตัวเลือกที่เลือกเป็นข้อถูกยังว่างอยู่','warn');
  const old=id?_tqaQs.find(x=>x.id===id):null,choices=keep.map(x=>x.c),explanation=document.getElementById('tqa-q-ex').value.trim();
  const row={...(old||{sort_order:(_tqaQs.at(-1)?.sort_order||0)+1,is_active:true}),question,choices,answer:ans,explanation};
  // ข้อที่มีผู้สอบแล้ว + เนื้อหาเปลี่ยน → ปิดข้อเดิม แล้วเพิ่มเป็นข้อใหม่ (ฐานข้อมูลไม่ยอมให้แก้ทับ)
  const changed=old&&(old.question!==question||old.answer!==ans||JSON.stringify(old.choices)!==JSON.stringify(choices));
  const rows=old?.used&&changed?[{...old,is_active:false},{question,choices,answer:ans,explanation,sort_order:old.sort_order,is_active:old.is_active}]:[row];
  if(!await _tqaSaveQs(rows))return;
  closeModal('modal-tqa-q');showToast('บันทึกแล้ว');await _tqaQuestions();
}

/* ── AI ร่างข้อสอบ (src/services/ai.service.js) — ตรวจ/เลือกก่อนเพิ่มเข้าคลังเสมอ ── */
function _tqaAiOpen(){
  _tqaDraft=[];
  _tqaModal('modal-tqa-ai',`<div class="modal-title"><i class="ti ti-sparkles"></i>AI ร่างข้อสอบ</div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">จำนวนข้อ</label><select class="form-control" id="tqa-ai-n">${[5,10,15,20].map(n=>`<option ${n===10?'selected':''}>${n}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">หัวข้อ</label><input class="form-control" value="${_esc(_tqaName(_tqaQ))}" id="tqa-ai-topic"></div>
    </div>
    <div class="form-group"><label class="form-label" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">เนื้อหาอ้างอิง <span style="font-weight:400;color:var(--text-muted)">(แนบไฟล์หรือวางเนื้อหาจากคู่มือ/สไลด์ — ว่าง = ออกจากชื่อหัวข้อ)</span>
        <button type="button" class="btn btn-sm" id="tqa-ai-filebtn" onclick="document.getElementById('tqa-ai-file').click()" style="margin-left:auto;"><i class="ti ti-paperclip"></i>แนบไฟล์ PDF / Word / PowerPoint</button></label>
      <input type="file" id="tqa-ai-file" accept=".pdf,.docx,.pptx" multiple hidden onchange="_tqaAiFiles(this)">
      <textarea class="form-control" id="tqa-ai-src" rows="5" placeholder="วางเนื้อหาที่ต้องการให้ออกข้อสอบ หรือกด แนบไฟล์" oninput="_tqaAiSrcInfo()"></textarea>
      <div id="tqa-ai-srcinfo" style="font-size:12px;color:var(--text-muted);margin-top:4px;"></div></div>
    <button class="btn btn-primary" id="tqa-ai-go" onclick="_tqaAiRun()" style="width:100%;justify-content:center;"><i class="ti ti-sparkles"></i>ร่างข้อสอบ</button>
    <div id="tqa-ai-out" style="margin-top:14px;"></div>`,760);
}
/* แนบไฟล์ → ดึงข้อความในเบราว์เซอร์ (ไม่อัปโหลดไฟล์ไปไหน) แล้วต่อท้ายช่องเนื้อหาอ้างอิง ให้ตรวจ/ตัดส่วนที่ไม่ใช้ได้ก่อนร่าง
   รองรับ .pdf (ต้องเป็นข้อความ ไม่ใช่ภาพสแกน) / .docx / .pptx — ไฟล์ .doc/.ppt รุ่นเก่าให้ Save As เป็นรุ่นใหม่ก่อน */
const _TQA_AI_MAX=12000; // ตัวอักษรของเนื้อหาที่ส่งให้ AI (เกินจากนี้ตัดทิ้ง)
function _tqaAiSrcInfo(){
  const len=document.getElementById('tqa-ai-src').value.trim().length,el=document.getElementById('tqa-ai-srcinfo');
  if(el)el.innerHTML=!len?'':len>_TQA_AI_MAX
    ?`<span style="color:var(--warning,#d97706)">เนื้อหา ${len.toLocaleString()} ตัวอักษร — AI จะใช้แค่ ${_TQA_AI_MAX.toLocaleString()} ตัวอักษรแรก (ลบส่วนที่ไม่ต้องการออกได้)</span>`
    :`เนื้อหา ${len.toLocaleString()} ตัวอักษร`;
}
async function _tqaFileText(f){
  const ext=(f.name.split('.').pop()||'').toLowerCase(),buf=await f.arrayBuffer();
  if(ext==='pdf'){
    if(!await _needLib('pdfjs'))return null;
    pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf=await pdfjsLib.getDocument({data:buf}).promise,pages=[];
    for(let i=1;i<=pdf.numPages;i++){
      const tc=await (await pdf.getPage(i)).getTextContent();
      pages.push(tc.items.map(t=>t.str+(t.hasEOL?'\n':'')).join('').trim());
    }
    return pages.filter(Boolean).join('\n\n');
  }
  if(ext==='docx'){
    if(!await _needLib('mammoth'))return null;
    return (await mammoth.extractRawText({arrayBuffer:buf})).value;
  }
  if(ext==='pptx'){
    if(!await _needLib('jszip'))return null;
    const zip=await JSZip.loadAsync(buf),A='http://schemas.openxmlformats.org/drawingml/2006/main';
    const slides=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>a.match(/\d+/)[0]-b.match(/\d+/)[0]);
    const out=[];
    for(const [i,n] of slides.entries()){
      const doc=new DOMParser().parseFromString(await zip.file(n).async('string'),'application/xml');
      const lines=[...doc.getElementsByTagNameNS(A,'p')].map(p=>[...p.getElementsByTagNameNS(A,'t')].map(t=>t.textContent).join('').trim()).filter(Boolean);
      if(lines.length)out.push(`[สไลด์ ${i+1}]\n${lines.join('\n')}`);
    }
    return out.join('\n\n');
  }
  throw new Error(`${f.name}: รองรับเฉพาะ .pdf .docx .pptx (ไฟล์ .doc/.ppt รุ่นเก่า ให้ Save As เป็นรุ่นใหม่ก่อน)`);
}
async function _tqaAiFiles(inp){
  const files=[...inp.files];inp.value='';
  if(!files.length)return;
  const btn=document.getElementById('tqa-ai-filebtn'),ta=document.getElementById('tqa-ai-src');
  btn.disabled=true;btn.innerHTML='<i class="ti ti-loader-2 tqa-spin"></i>กำลังอ่านไฟล์...';
  for(const f of files){
    try{
      const txt=(await _tqaFileText(f))?.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
      if(txt==null)continue; // โหลดไลบรารีไม่สำเร็จ (แจ้งเตือนแล้ว)
      if(!txt){showToast(`${f.name}: ไม่พบข้อความในไฟล์ (อาจเป็นภาพสแกน)`,'warn');continue;}
      ta.value=(ta.value.trim()?ta.value.trim()+'\n\n':'')+`=== ${f.name} ===\n${txt}`;
      showToast(`อ่าน ${f.name} แล้ว`);
    }catch(e){showToast(e.message?.includes(f.name)?e.message:`${f.name}: อ่านไฟล์ไม่สำเร็จ`,'danger');}
  }
  btn.disabled=false;btn.innerHTML='<i class="ti ti-paperclip"></i>แนบไฟล์ PDF / Word / PowerPoint';
  _tqaAiSrcInfo();
}
async function _tqaAiRun(){
  const n=+document.getElementById('tqa-ai-n').value,topic=document.getElementById('tqa-ai-topic').value.trim(),src=document.getElementById('tqa-ai-src').value.trim();
  const btn=document.getElementById('tqa-ai-go');btn.disabled=true;btn.innerHTML='<i class="ti ti-loader-2 tqa-spin"></i>AI กำลังร่าง...';
  const existing=_tqaQs.map(q=>q.question);
  const user=`หัวข้อการอบรม: ${topic}
${src?`เนื้อหาอ้างอิง (ออกข้อสอบจากเนื้อหานี้เท่านั้น):\n"""\n${src.slice(0,_TQA_AI_MAX)}\n"""`:'ไม่มีเนื้อหาอ้างอิง — ออกข้อสอบเกี่ยวกับการใช้งานระบบตามหัวข้อ เน้นการใช้งานจริงของผู้ใช้ในโรงพยาบาล'}
${existing.length?`ข้อสอบที่มีอยู่แล้ว (ห้ามออกซ้ำหรือถามเรื่องเดียวกัน):\n${existing.slice(0,60).map(q=>'- '+q).join('\n')}`:''}

ออกข้อสอบปรนัย ${n} ข้อ แต่ละข้อมี 4 ตัวเลือก ถูกเพียงข้อเดียว ตัวเลือกผิดต้องดูสมเหตุสมผล ไม่ใช้ "ถูกทุกข้อ"/"ผิดทุกข้อ"
ตอบเป็น JSON อย่างเดียว: {"questions":[{"question":"คำถาม","choices":["ตัวเลือก1","ตัวเลือก2","ตัวเลือก3","ตัวเลือก4"],"answer":0,"explanation":"เหตุผลสั้น ๆ"}]}
(answer = ลำดับของตัวเลือกที่ถูก เริ่มที่ 0)`;
  try{
    const txt=await window.aiChat('คุณเป็นผู้ออกข้อสอบวัดความรู้หลังการอบรมการใช้งานระบบโปรแกรมในโรงพยาบาล เขียนภาษาไทยที่ชัดเจน ถูกต้องตามเนื้อหา',user,
      {maxTokens:Math.min(4000,350*n+300),temperature:0.4});
    _tqaDraft=(window.aiParseJson(txt).questions||[]).map(q=>{
      const ch=(q.choices||[]).map(c=>String(c||'').trim()).filter(Boolean),a=+q.answer;
      if(!String(q.question||'').trim()||ch.length<2||!(a>=0&&a<ch.length))return null;
      // สลับตำแหน่งข้อถูก (โมเดลชอบวางไว้ข้อแรก)
      const items=ch.map((c,i)=>({c,ok:i===a}));
      for(let i=items.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}
      const dup=existing.some(e=>window.aiTextSim(e,q.question)>0.8);
      return{question:String(q.question).trim(),choices:items.map(x=>x.c),answer:items.findIndex(x=>x.ok),explanation:String(q.explanation||'').trim(),dup,pick:!dup};
    }).filter(Boolean);
  }catch(e){showToast(e.message||'AI ร่างไม่สำเร็จ','danger');}
  btn.disabled=false;btn.innerHTML='<i class="ti ti-sparkles"></i>ร่างใหม่';
  _tqaAiShow();
}
function _tqaAiShow(){
  const el=document.getElementById('tqa-ai-out');
  if(!_tqaDraft.length){el.innerHTML='';return;}
  el.innerHTML=`<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">ตรวจความถูกต้องก่อนเพิ่ม — ติ๊กเฉพาะข้อที่ใช้ได้ (แก้ไขรายละเอียดได้หลังเพิ่มเข้าคลัง)</div>
    ${_tqaDraft.map((q,i)=>`<label class="tqa-draft${q.dup?' dup':''}"><input type="checkbox" ${q.pick?'checked':''} onchange="_tqaDraft[${i}].pick=this.checked">
      <div><b>${i+1}. ${_esc(q.question)}</b>${q.dup?' <span class="badge badge-warn">คล้ายข้อที่มีอยู่</span>':''}
      <div class="tqa-q-ch">${q.choices.map((c,j)=>`<div class="${j===q.answer?'ok':''}"><b>${_TQA_CH[j]}</b>${_esc(c)}</div>`).join('')}</div></div></label>`).join('')}
    <button class="btn btn-success" onclick="_tqaAiAdd()" style="width:100%;justify-content:center;margin-top:8px;"><i class="ti ti-plus"></i>เพิ่มข้อที่เลือกเข้าคลัง</button>`;
}
async function _tqaAiAdd(){
  const base=(_tqaQs.at(-1)?.sort_order||0)+1;
  const rows=_tqaDraft.filter(q=>q.pick).map((q,i)=>({question:q.question,choices:q.choices,answer:q.answer,explanation:q.explanation,sort_order:base+i}));
  if(!rows.length)return showToast('ยังไม่ได้เลือกข้อ','warn');
  if(!await _tqaSaveQs(rows))return;
  closeModal('modal-tqa-ai');showToast(`เพิ่ม ${rows.length} ข้อแล้ว`);await _tqaQuestions();
}

/* ── Excel: คำถาม | ตัวเลือก 1–6 | ข้อที่ถูก (1–6) | คำอธิบาย ── */
const _TQA_XL=['คำถาม','ตัวเลือก 1','ตัวเลือก 2','ตัวเลือก 3','ตัวเลือก 4','ตัวเลือก 5','ตัวเลือก 6','ข้อที่ถูก (1-6)','คำอธิบาย'];
async function _tqaExportQs(){
  if(!await _needLib('xlsx'))return;
  const rows=_tqaQs.map(q=>[q.question,...[0,1,2,3,4,5].map(j=>q.choices[j]||''),q.answer+1,q.explanation]);
  const ws=XLSX.utils.aoa_to_sheet([_TQA_XL,...rows]);ws['!cols']=[{wch:50},...Array(6).fill({wch:22}),{wch:14},{wch:40}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'ข้อสอบ');
  XLSX.writeFile(wb,`ข้อสอบ_${_tqaName(_tqaQ)}.xlsx`.replace(/[\\/:*?"<>|]/g,'_'));
}
async function _tqaImport(inp){
  const f=inp.files[0];inp.value='';
  if(!f||!await _needLib('xlsx'))return;
  const wb=XLSX.read(await f.arrayBuffer());
  const aoa=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''}).slice(1);
  const bad=[],base=(_tqaQs.at(-1)?.sort_order||0)+1;
  const rows=aoa.map((r,i)=>{
    const question=String(r[0]||'').trim(),raw=[1,2,3,4,5,6].map(k=>String(r[k]??'').trim());
    if(!question&&!raw.some(Boolean))return null;
    const ans=+r[7]-1,keep=raw.map((c,j)=>({c,j})).filter(x=>x.c),a=keep.findIndex(x=>x.j===ans);
    if(!question||keep.length<2||a<0){bad.push(i+2);return null;}
    return{question,choices:keep.map(x=>x.c),answer:a,explanation:String(r[8]||'').trim(),sort_order:base+i};
  }).filter(Boolean);
  if(!rows.length)return showToast(bad.length?`ข้อมูลไม่ครบทุกแถว (แถว ${bad.slice(0,8).join(', ')})`:'ไม่พบข้อสอบในไฟล์','warn');
  if(!await showConfirm(`นำเข้า ${rows.length} ข้อ เข้าคลังข้อสอบ?`,bad.length?`ข้าม ${bad.length} แถวที่ไม่ครบ (แถว ${bad.slice(0,10).join(', ')}${bad.length>10?' …':''})`:'',{okLabel:'นำเข้า',danger:false}))return;
  if(await _tqaSaveQs(rows)){showToast(`นำเข้า ${rows.length} ข้อแล้ว`);await _tqaQuestions();}
}

/* ══════════════════ ผลสอบ + ใบประกาศ ══════════════════ */
async function _tqaResults(){
  await _tqaLoadQuizzes();
  const [aR,cR]=await Promise.all([
    _allRows(()=>_sb.from('trn_quiz_attempts').select('id,quiz_id,reg_id,full_name,dept,position,email,score,total,percent,status,completed_at').eq('site',currentSite).neq('status','started').order('completed_at',{ascending:false})),
    _sb.from('trn_quiz_certs').select('*').eq('site',currentSite),
  ]);
  _tqaRes=aR.data||[];_tqaCerts=cR.data||[];
  _tqaEl().innerHTML=`<div class="tqa-bar">
      <div class="tqa-filters">
        <select class="form-control" id="tqa-r-quiz" onchange="_tqaResTable()"><option value="">ทุกแบบทดสอบ</option>${_tqaQuizzes.filter(q=>_tqaRes.some(a=>a.quiz_id===q.id)).map(q=>`<option value="${q.id}">${_esc(_tqaName(q))}</option>`).join('')}</select>
        <select class="form-control" id="tqa-r-st" onchange="_tqaResTable()"><option value="">ทุกผล</option><option value="PASS">ผ่าน</option><option value="FAIL">ไม่ผ่าน</option><option value="mail">ส่งอีเมลไม่สำเร็จ</option></select>
        <input class="form-control" id="tqa-r-q" placeholder="ค้นหาชื่อ / หน่วยงาน / อีเมล" oninput="_tqaResTable()">
      </div>
      <div class="tqa-bar-actions"><button class="btn btn-success btn-sm" onclick="_tqaExportRes()"><i class="ti ti-file-spreadsheet"></i>Export Excel</button></div>
    </div><div id="tqa-r-sum" class="tqa-sum"></div><div id="tqa-r-table" class="an-table-wrap" style="max-height:none;"></div>`;
  _tqaResTable();
}
function _tqaResRows(){
  const qz=+document.getElementById('tqa-r-quiz').value,st=document.getElementById('tqa-r-st').value,q=_normTxt(document.getElementById('tqa-r-q').value);
  return _tqaRes.map(a=>({...a,cert:_tqaCerts.find(c=>c.attempt_id===a.id)}))
    .filter(a=>(!qz||a.quiz_id===qz)&&(!st||(st==='mail'?a.cert&&a.cert.email_status!=='sent':a.status===st))
      &&(!q||_normTxt(`${a.full_name} ${a.dept} ${a.email}`).includes(q)));
}
function _tqaResTable(){
  const rows=_tqaResRows(),ppl=new Set(rows.map(a=>a.quiz_id+'|'+a.email)),pass=new Set(rows.filter(a=>a.status==='PASS').map(a=>a.quiz_id+'|'+a.email));
  const fail=rows.filter(a=>a.cert&&a.cert.email_status!=='sent').length;
  document.getElementById('tqa-r-sum').innerHTML=`<span>สอบ <b>${rows.length}</b> ครั้ง</span><span>ผู้สอบ <b>${ppl.size}</b> คน</span><span>ผ่าน <b>${pass.size}</b> คน (${ppl.size?Math.round(pass.size/ppl.size*100):0}%)</span>${fail?`<span class="bad">ส่งอีเมลไม่สำเร็จ <b>${fail}</b></span>`:''}`;
  const el=document.getElementById('tqa-r-table');
  if(!rows.length){el.innerHTML='<div class="tqa-empty">ยังไม่มีผลสอบ</div>';return;}
  const mail=c=>c.email_status==='sent'?`<span class="badge badge-success" title="${c.emailed_at?new Date(c.emailed_at).toLocaleString('th-TH'):''}"><i class="ti ti-mail-check"></i>ส่งแล้ว</span>`
    :c.email_status==='failed'?`<span class="badge badge-danger" title="${_esc(c.email_error)}"><i class="ti ti-mail-off"></i>ส่งไม่สำเร็จ</span>`:'<span class="badge badge-gray">รอส่ง</span>';
  el.innerHTML=`<table class="adetail-table"><thead><tr><th>วันที่</th><th>ผู้สอบ</th><th>แบบทดสอบ</th><th class="num">คะแนน</th><th>ผล</th><th>ใบประกาศ</th><th></th></tr></thead><tbody>`+rows.map(a=>{
    const qz=_tqaQuizzes.find(q=>q.id===a.quiz_id),c=a.cert;
    return`<tr><td style="white-space:nowrap;font-size:12px;">${a.completed_at?new Date(a.completed_at).toLocaleString('th-TH',{dateStyle:'short',timeStyle:'short'}):'-'}</td>
      <td><div style="font-weight:600;">${_esc(a.full_name)}${a.reg_id?'':' <span class="badge badge-gray" title="ไม่อยู่ในรายชื่อผู้ลงทะเบียน">นอกรายชื่อ</span>'}</div>
        <div style="font-size:11px;color:var(--text-muted);">${_esc([a.dept,a.email].filter(Boolean).join(' · '))}</div></td>
      <td style="font-size:12px;">${_esc(qz?_tqaName(qz):'-')}</td>
      <td class="num"><b>${Math.round(a.percent)}%</b><div style="font-size:11px;color:var(--text-muted);">${a.score}/${a.total}</div></td>
      <td>${a.status==='PASS'?'<span class="badge badge-success">ผ่าน</span>':'<span class="badge badge-danger">ไม่ผ่าน</span>'}</td>
      <td>${c?`<a href="?page=quiz&cert=${encodeURIComponent(c.cert_id)}" target="_blank" style="font-size:12px;font-weight:600;color:var(--primary);">${_esc(c.cert_id)}</a>
        <div style="margin-top:3px;">${c.is_revoked?'<span class="badge badge-danger">ยกเลิกแล้ว</span>':mail(c)}</div>`:'<span style="color:var(--text-muted)">—</span>'}</td>
      <td style="white-space:nowrap;text-align:right;">
        ${c&&!c.is_revoked?`<button class="btn btn-ghost btn-sm" title="ส่งอีเมลอีกครั้ง" onclick="_tqaResend('${_esc(c.cert_id)}')"><i class="ti ti-mail-forward"></i></button>`:''}
        ${c?`<button class="btn btn-ghost btn-sm" title="${c.is_revoked?'คืนสถานะใบประกาศ':'ยกเลิกใบประกาศ'}" onclick="_tqaRevoke('${_esc(c.cert_id)}',${!c.is_revoked})"><i class="ti ti-${c.is_revoked?'rotate-clockwise':'certificate-off'}"></i></button>`:''}
        <button class="btn btn-ghost btn-sm" title="ลบผลสอบ" onclick="_tqaDelAttempt('${a.id}')"><i class="ti ti-trash" style="color:var(--danger)"></i></button></td></tr>`;
  }).join('')+'</tbody></table>';
}
function _tqaResend(certId){
  const c=_tqaCerts.find(x=>x.cert_id===certId);
  _tqaModal('modal-tqa-mail',`<div class="modal-title"><i class="ti ti-mail-forward"></i>ส่งใบประกาศทางอีเมลอีกครั้ง</div>
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">${_esc(c.full_name)} · ${_esc(c.cert_id)}</div>
    <div class="form-group"><label class="form-label">อีเมล</label><input class="form-control" id="tqa-m-email" type="email" value="${_esc(c.email)}"></div>
    ${c.email_error?`<div class="tqa-warn"><i class="ti ti-alert-triangle"></i>ครั้งก่อน: ${_esc(c.email_error)}</div>`:''}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
      <button class="btn btn-ghost" onclick="closeModal('modal-tqa-mail')">ยกเลิก</button>
      <button class="btn btn-primary" id="tqa-m-go" onclick="_tqaResendGo('${_esc(certId)}')"><i class="ti ti-send"></i>ส่ง</button></div>`,460);
}
async function _tqaResendGo(certId){
  const c=_tqaCerts.find(x=>x.cert_id===certId),email=document.getElementById('tqa-m-email').value.trim().toLowerCase();
  if(!_emailRe.test(email))return showToast('อีเมลไม่ถูกต้อง','warn');
  const b=document.getElementById('tqa-m-go');b.disabled=true;b.innerHTML='<i class="ti ti-loader-2 tqa-spin"></i>กำลังส่ง...';
  try{
    if(email!==c.email){await _tqaAdmin('cert',{cert_id:certId,email});c.email=email;}
    const st=_tqaSt||(_tqaSt=await TrnCert.settings(_sb));
    const r=await TrnCert.sendEmail(_sb,c,st,locations.find(l=>l.code===c.site)?.name||'');
    showToast(r.ok?'ส่งอีเมลแล้ว':'ส่งไม่สำเร็จ: '+r.error,r.ok?'success':'danger');
    if(r.ok)closeModal('modal-tqa-mail');
  }catch(e){showToast(e.message,'danger');}
  b.disabled=false;b.innerHTML='<i class="ti ti-send"></i>ส่ง';
  _tqaResults();
}
async function _tqaRevoke(certId,revoke){
  if(revoke&&!await showConfirm('ยกเลิกใบประกาศนี้?','ลิงก์/QR ของใบประกาศจะแสดงว่า "ถูกยกเลิก" — คืนสถานะได้ภายหลัง',{okLabel:'ยกเลิกใบประกาศ'}))return;
  try{await _tqaAdmin('cert',{cert_id:certId,is_revoked:revoke});showToast(revoke?'ยกเลิกใบประกาศแล้ว':'คืนสถานะแล้ว');_tqaResults();}
  catch(e){showToast(e.message,'danger');}
}
async function _tqaDelAttempt(id){
  const a=_tqaRes.find(x=>x.id===id);
  if(!await showConfirm(`ลบผลสอบของ ${a.full_name}?`,'นับเป็นสิทธิ์สอบคืนให้ 1 ครั้ง · ถ้าผ่านแล้ว ใบประกาศของครั้งนี้จะถูกลบด้วย',{okLabel:'ลบ'}))return;
  try{await _tqaAdmin('delete_attempt',{id});showToast('ลบแล้ว');_tqaResults();}
  catch(e){showToast(e.message,'danger');}
}
async function _tqaExportRes(){
  if(!await _needLib('xlsx'))return;
  const rows=_tqaResRows().map((a,i)=>{const qz=_tqaQuizzes.find(q=>q.id===a.quiz_id);return{
    'ลำดับ':i+1,'วันที่สอบ':a.completed_at?new Date(a.completed_at).toLocaleString('th-TH'):'','ชื่อ-นามสกุล':a.full_name,'หน่วยงาน':a.dept,'ตำแหน่ง':a.position,
    'อีเมล':a.email,'ผู้ลงทะเบียน':a.reg_id?'ใช่':'นอกรายชื่อ','แบบทดสอบ':qz?_tqaName(qz):'','คะแนน':`${a.score}/${a.total}`,'ร้อยละ':+a.percent,
    'ผล':a.status==='PASS'?'ผ่าน':'ไม่ผ่าน','เลขที่ใบประกาศ':a.cert?.cert_id||'','สถานะอีเมล':a.cert?(a.cert.is_revoked?'ยกเลิกแล้ว':{sent:'ส่งแล้ว',failed:'ส่งไม่สำเร็จ',pending:'รอส่ง'}[a.cert.email_status]):''};});
  const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'ผลสอบ');
  XLSX.writeFile(wb,`ผลสอบ_${currentSite}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

/* ══════════════════ ตั้งค่าใบประกาศ + อีเมล (ใช้ร่วมทุกโครงการ) ══════════════════ */
const _TQA_MAIL=['emailjs_service_id','emailjs_template_id','emailjs_public_key'];
const _TQA_SET=[
  ['org_name','ชื่อหน่วยงานผู้ออกใบประกาศ',''],['cert_title','หัวข้อใบประกาศ','ประกาศนียบัตร'],
  ['cert_prefix','รหัสหน่วยงาน (ต้นเลขที่ใบประกาศ)','BMS'],['cert_color','สีหลัก',''],
  ['cert_font','แบบอักษร',''],
  ['cert_signer_name','ชื่อผู้ลงนาม','(ว่าง = ไม่มีช่องลงนาม)'],['cert_signer_title','ตำแหน่งผู้ลงนาม',''],
];
// รูปบนใบประกาศ — อัปโหลดเข้า storage trn-banners แล้วเก็บ URL ใน trn_settings (บันทึกพร้อมการตั้งค่าอื่น)
const _TQA_IMG=[
  ['cert_sign_url','ลายเซ็นผู้ลงนาม','sign','ถ่ายรูปลายเซ็นบนกระดาษขาว'],
  ['cert_logo_url','โลโก้หน่วยงาน (กลางบนสุด)','logo','PNG พื้นใส'],
  ['cert_bg_url','พื้นหลังใบประกาศ','bg','A4 แนวนอน · (3508×2480 px)'],
];
// ข้อความบนใบประกาศ (เรียงตามตำแหน่งบนใบ · ชื่อผู้รับอยู่ระหว่างบรรทัดแรกกับบรรทัดที่สอง) — ค่าเริ่มต้นอยู่ที่ TrnCert.TEXT
const _TQA_TXT=[
  ['cert_t_intro','① ก่อนชื่อผู้รับ'],['cert_t_passed','② หลังชื่อผู้รับ'],
  ['cert_t_course','③ ชื่อหลักสูตร (ตัวใหญ่)','wide'],['cert_t_detail','④ รายละเอียด','wide'],['cert_t_date','⑤ วันที่','wide'],
];
function _tqaTxtReset(){
  _TQA_TXT.forEach(([k])=>{document.getElementById('tqa-s-'+k).value=TrnCert.TEXT[k];});
  _tqaPreview();
}
// แทรกตัวแปรที่กดลงในช่องข้อความบนใบประกาศที่โฟกัสล่าสุด · ไม่มี = คัดลอก
let _tqaTxtFocus=null;
// ตัวแปรที่ใช้ได้ทั้งข้อความบนใบประกาศและเทมเพลต EmailJS (ต้องตรงกับ TrnCert.vars)
const _TQA_VARS=[
  ['to_email','อีเมลผู้รับ (ช่อง To Email)','somchai@example.com'],
  ['to_name','ชื่อ-นามสกุลผู้สอบ','นางสาวตัวอย่าง ใจดี'],
  ['course_name','ชื่อหลักสูตร','ระบบคลังสินค้า'],
  ['quiz_title','ชื่อแบบทดสอบ','การใช้งานระบบคลังสินค้า'],
  ['score','คะแนน (ถูก/ทั้งหมด)','23/25'],
  ['percent','คะแนนร้อยละ','92%'],
  ['cert_id','เลขที่ใบประกาศ','BMS-INV-2569-000123'],
  ['cert_url','ลิงก์ดูใบประกาศ',''],
  ['project_name','ชื่อโครงการ',''],
  ['org_name','หน่วยงานผู้ออก',''],
  ['issued_date','วันที่ออก (พ.ศ.)',''],
];
function _tqaCopyVar(el){
  const v=el.textContent,inp=_tqaTxtFocus&&document.body.contains(_tqaTxtFocus)?_tqaTxtFocus:null;
  if(inp){
    const a=inp.selectionStart??inp.value.length,b=inp.selectionEnd??a;
    inp.value=inp.value.slice(0,a)+v+inp.value.slice(b);
    inp.focus();inp.setSelectionRange(a+v.length,a+v.length);
    return _tqaPreview();
  }
  navigator.clipboard?.writeText(v).then(()=>showToast('คัดลอก '+v+' แล้ว'),()=>{});
}
const _TQA_FONTS=[['','ทันสมัย (Noto Sans Thai)'],['sarabun','ราชการ (Sarabun)'],['serif','ทางการ มีหัว (Noto Serif Thai)']];
async function _tqaSettings(){
  _tqaSt=await TrnCert.settings(_sb);
  const st=_tqaSt,f=([k,l,ph])=>`<div class="form-group"><label class="form-label">${l}</label>${k==='cert_color'
    ?`<input class="form-control" type="color" id="tqa-s-${k}" value="${_esc(st[k]||'#7c5cfc')}" oninput="_tqaPreview()" style="height:38px;padding:4px;cursor:pointer;">`
    :k==='cert_font'
    ?`<select class="form-control" id="tqa-s-${k}" onchange="_tqaPreview()">${_TQA_FONTS.map(([v,t])=>`<option value="${v}"${(st[k]||'')===v?' selected':''}>${t}</option>`).join('')}</select>`
    :`<input class="form-control" id="tqa-s-${k}" value="${_esc(st[k]||'')}" placeholder="${_esc(ph)}" oninput="_tqaPreview()">`}</div>`;
  const img=([k,l,kind,hint])=>`<div class="form-group"><label class="form-label">${l}</label>
    <div class="tqa-img"><div class="tqa-img-thumb ${kind}" id="tqa-t-${k}">${_tqaThumb(st[k])}</div>
      <div class="tqa-img-act"><input type="hidden" id="tqa-s-${k}" value="${_esc(st[k]||'')}">
        <input type="file" accept="image/*" id="tqa-f-${k}" hidden onchange="_tqaImg('${k}','${kind}',this)">
        <div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn btn-ghost btn-sm" id="tqa-b-${k}" onclick="document.getElementById('tqa-f-${k}').click()"><i class="ti ti-upload"></i>อัปโหลด</button>
          <button class="btn btn-ghost btn-sm" onclick="_tqaImgClear('${k}')"><i class="ti ti-trash"></i>ลบ</button></div>
        <div class="tqa-img-hint">${hint}</div></div></div></div>`;
  const F=k=>f(_TQA_SET.find(x=>x[0]===k)),I=k=>img(_TQA_IMG.find(x=>x[0]===k));
  const sec=(ic,t)=>`<div class="tqa-sec"><i class="ti ti-${ic}"></i>${t}</div>`;
  _tqaEl().innerHTML=`<div class="tqa-set">
    <div class="tqa-set-form">
      <div class="card"><div class="card-title" style="margin-bottom:6px;"><i class="ti ti-certificate"></i>ใบประกาศ</div>
        ${sec('typography','ข้อความบนใบประกาศ')}
        ${F('org_name')}
        <div class="tqa-row">${F('cert_title')}${F('cert_prefix')}</div>
        <div class="tqa-row">${F('cert_color')}${F('cert_font')}</div>
        <div class="tqa-sec"><i class="ti ti-text-caption"></i>ข้อความในใบประกาศ
          <button class="btn btn-ghost btn-sm tqa-sec-act" onclick="_tqaTxtReset()"><i class="ti ti-restore"></i>ค่าเริ่มต้น</button></div>
        <div class="tqa-txt-grid">${_TQA_TXT.map(([k,l,n])=>`<div class="tqa-txt${n==='wide'?' wide':''}">
          <label class="form-label" for="tqa-s-${k}">${l}</label>
          <input class="form-control" id="tqa-s-${k}" value="${_esc(st[k]!=null?st[k]:TrnCert.TEXT[k])}" placeholder="(ไม่แสดงบรรทัดนี้)" oninput="_tqaPreview()" onfocus="_tqaTxtFocus=this"></div>`).join('')}</div>        ${sec('signature','ผู้ลงนาม')}
        <div class="tqa-row">${F('cert_signer_name')}${F('cert_signer_title')}</div>
        ${sec('photo','ลายเซ็น · โลโก้ · พื้นหลัง')}
        <div class="tqa-row three tqa-imgs">${I('cert_sign_url')}${I('cert_logo_url')}${I('cert_bg_url')}</div>
      </div>
      <div class="card"><div class="card-title" style="margin-bottom:14px;"><i class="ti ti-mail"></i>ส่งใบประกาศทางอีเมล (EmailJS)
          <span class="badge ${TrnCert.mailReady(st)?'badge-success':'badge-warn'}" style="margin-left:auto;font-weight:500;">${TrnCert.mailReady(st)?'ตั้งค่าแล้ว':'ยังไม่ได้ตั้งค่า'}</span></div>
        <div class="tqa-row three">${[['emailjs_service_id','Service ID','service_xxxxxxx'],['emailjs_template_id','Template ID','template_xxxxxxx'],['emailjs_public_key','Public Key','']].map(([k,l,ph])=>
          `<div class="form-group"><label class="form-label">${l}</label><input class="form-control" id="tqa-s-${k}" value="${_esc(st[k]||'')}" placeholder="${ph}"></div>`).join('')}</div>
        <div class="form-group"><label class="form-label">ทดสอบส่งไปที่</label>
          <div style="display:flex;gap:8px;"><input class="form-control" id="tqa-s-test" type="email" placeholder="อีเมลของคุณ"><button class="btn btn-ghost" id="tqa-s-testbtn" onclick="_tqaTestMail()"><i class="ti ti-send"></i>ทดสอบ</button></div></div>
        <details class="tqa-help"><summary><i class="ti ti-help-circle"></i>วิธีตั้งค่าที่ emailjs.com</summary>
          <ol><li>Email Services → เชื่อมบัญชีอีเมลผู้ส่ง → ได้ <b>Service ID</b></li>
            <li>Email Templates → สร้างเทมเพลต ตั้งช่อง <b>To Email</b> = <code>{{to_email}}</code> → ได้ <b>Template ID</b></li>
            <li>Account → General → <b>Public Key</b></li></ol>
          ตัวแปรที่ใช้ในเทมเพลตได้ ดูที่กล่อง "ตัวแปรในเทมเพลตอีเมล"
        </details>
      </div>
    </div>
    <div class="tqa-set-side"><div class="card">
      <div class="card-title" style="margin-bottom:12px;"><i class="ti ti-eye"></i>ตัวอย่างใบประกาศ<span style="margin-left:auto;font-size:11.5px;font-weight:400;color:var(--text-muted);">อัปเดตทันทีที่แก้</span></div>
      <div class="tqa-preview" id="tqa-preview"></div>
      <input type="hidden" id="tqa-s-cert_layout" value="${_esc(st.cert_layout||'')}">
      <div class="tqa-layout-bar"><span><i class="ti ti-hand-move"></i>ลากกล่อง <b>QR</b> · <b>ลายเซ็น</b> · <b>ข้อความกลาง</b> (ขึ้น-ลง) เพื่อจัดวางให้พ้นลายพื้นหลัง</span>
        <button class="btn btn-ghost btn-sm" onclick="_tqaLayoutReset()"><i class="ti ti-restore"></i>ตำแหน่งเริ่มต้น</button></div>
      <button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:14px;" onclick="_tqaSaveSettings()"><i class="ti ti-device-floppy"></i>บันทึกการตั้งค่า</button>
    </div>
    <div class="card"><div class="card-title" style="margin-bottom:6px;"><i class="ti ti-braces"></i>ตัวแปร (ใบประกาศ + อีเมล)</div>
      <div class="tqa-vars-hint">ใช้ในข้อความบนใบประกาศ และหัวเรื่อง/เนื้อหาเทมเพลตที่ emailjs.com · กดตัวแปร = แทรกลงช่องข้อความใบประกาศที่เลือกอยู่ (ไม่ได้เลือก = คัดลอก)</div>
      <div class="tqa-vars">${_TQA_VARS.map(([v,d,ex])=>`<div class="tqa-var" onmousedown="event.preventDefault()" onclick="_tqaCopyVar(this.firstElementChild)" title="${_esc(ex?'เช่น '+ex:'คัดลอก')}">
        <code>{{${v}}}</code><span>${d}</span></div>`).join('')}</div>
    </div></div></div>`;
  if(!document.getElementById('tc-style')){const s=document.createElement('style');s.id='tc-style';s.textContent=TrnCert.css;document.head.appendChild(s);}
  if(!window._tqaRsz){window._tqaRsz=1;window.addEventListener('resize',()=>_tqaPreview());
    // โฟกัสช่องอื่น (เช่น ตั้งค่าอีเมล) → กดตัวแปรกลับไปเป็นคัดลอก
    document.addEventListener('focusin',e=>{if(!e.target.closest?.('.tqa-txt'))_tqaTxtFocus=null;});}
  _tqaTxtFocus=null;
  _tqaPreview();
}
function _tqaFormSt(){
  const st={..._tqaSt};
  document.querySelectorAll('[id^="tqa-s-"]').forEach(el=>{const k=el.id.slice(6);if(k!=='test'&&k!=='testbtn')st[k]=el.value.trim();});
  return st;
}
const _tqaSample=()=>({cert_id:(_tqaFormSt().cert_prefix||'BMS').toUpperCase()+'-INV-'+(new Date().getFullYear()+543)+'-000123',full_name:'นางสาวตัวอย่าง ใจดี',email:'',
  quiz_title:'การใช้งานระบบคลังสินค้า',course_name:'ระบบคลังสินค้า',score:23,total:25,percent:92,issued_at:new Date().toISOString(),site:currentSite});
function _tqaPreview(){
  const el=document.getElementById('tqa-preview');if(!el)return;
  el.innerHTML=TrnCert.html(_tqaSample(),_tqaFormSt(),locations.find(l=>l.code===currentSite)?.name||'');
  const k=el.clientWidth/1123,c=el.firstElementChild;
  c.style.transform=`scale(${k})`;c.style.transformOrigin='0 0';el.style.height=(794*k)+'px';
  c.querySelectorAll('[data-drag]').forEach(b=>b.onpointerdown=e=>_tqaDrag(e,b,c,k));
}
// ลากจัดวางบนตัวอย่าง (ย่อ k เท่า) → เก็บพิกัดขนาดจริงลง cert_layout · บันทึกพร้อมการตั้งค่า
function _tqaDrag(e,b,cert,k){
  e.preventDefault();
  const key=b.dataset.drag,L=TrnCert.layout(_tqaFormSt()),r0=cert.getBoundingClientRect(),r=b.getBoundingClientRect();
  const x0=(r.left-r0.left)/k,y0=(r.top-r0.top)/k,bw=r.width/k,bh=r.height/k,top0=+L.body||0;
  b.setPointerCapture(e.pointerId);b.classList.add('dragging');
  const clamp=(v,lo,hi)=>Math.round(Math.max(lo,Math.min(hi,v)));
  b.onpointermove=m=>{
    const dx=(m.clientX-e.clientX)/k,dy=(m.clientY-e.clientY)/k;
    if(key==='body'){L.body=clamp(top0+dy,top0-y0,top0+794-bh-y0);b.style.top=L.body+'px';return;}
    L[key]=[clamp(x0+dx,0,1123-bw),clamp(y0+dy,0,794-bh)];
    Object.assign(b.style,{left:L[key][0]+'px',top:L[key][1]+'px',right:'auto',bottom:'auto'});
  };
  b.onpointerup=b.onpointercancel=()=>{
    b.onpointermove=b.onpointerup=b.onpointercancel=null;b.classList.remove('dragging');
    document.getElementById('tqa-s-cert_layout').value=JSON.stringify(L);
  };
}
function _tqaLayoutReset(){document.getElementById('tqa-s-cert_layout').value='';_tqaPreview();}
const _tqaThumb=u=>u?`<img src="${_esc(u)}" alt="">`:'<i class="ti ti-photo"></i>';
function _tqaImgSet(k,u){
  document.getElementById('tqa-s-'+k).value=u;
  document.getElementById('tqa-t-'+k).innerHTML=_tqaThumb(u);
  _tqaPreview();
}
function _tqaImgClear(k){_tqaImgSet(k,'');showToast('ลบรูปแล้ว — กด "บันทึกการตั้งค่า" เพื่อใช้งาน','info');}
async function _tqaImg(k,kind,input){
  const file=input.files[0];input.value='';
  if(!file)return;
  const b=document.getElementById('tqa-b-'+k);b.disabled=true;
  try{
    const im=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(new Error('อ่านไฟล์รูปไม่ได้'));i.src=URL.createObjectURL(file);});
    if(kind==='bg'&&im.width<im.height)showToast('รูปพื้นหลังเป็นแนวตั้ง — ใบประกาศเป็น A4 แนวนอน รูปจะถูกครอปตรงกลาง','warn');
    const [canvas,type]=_tqaPrepImg(im,kind);
    const blob=await new Promise(ok=>canvas.toBlob(ok,type,.9));
    // ชื่อไฟล์ไม่มีนามสกุล (เหมือนรูปแบนเนอร์) — ชนิดไฟล์ใช้ contentType
    const {data,error}=await _sb.storage.from('trn-banners').upload(`cert_${kind}_${Date.now()}`,blob,{contentType:type});
    if(error)throw error;
    _tqaImgSet(k,_sb.storage.from('trn-banners').getPublicUrl(data.path).data.publicUrl);
    showToast('อัปโหลดแล้ว — กด "บันทึกการตั้งค่า" เพื่อใช้งาน');
  }catch(e){showToast('อัปโหลดไม่สำเร็จ: '+(e.message||e),'danger');}
  b.disabled=false;
}
// เตรียมรูปก่อนอัปโหลด: พื้นหลัง = ครอปเต็ม A4 แนวนอน 2 เท่าของใบ (คมตอนทำ PDF) · ลายเซ็น = ลบพื้นขาว + ตัดขอบว่าง
function _tqaPrepImg(im,kind){
  const c=document.createElement('canvas'),x=c.getContext('2d');
  if(kind==='bg'){
    c.width=2246;c.height=1588;
    const k=Math.max(c.width/im.width,c.height/im.height),w=im.width*k,h=im.height*k;
    x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(im,(c.width-w)/2,(c.height-h)/2,w,h);
    return [c,'image/jpeg'];
  }
  const k=Math.min(1,(kind==='sign'?1000:600)/Math.max(im.width,im.height));
  c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);x.drawImage(im,0,0,c.width,c.height);
  if(kind!=='sign')return [c,'image/png'];
  const d=x.getImageData(0,0,c.width,c.height),p=d.data;
  let x0=c.width,y0=c.height,x1=-1,y1=-1;
  for(let i=0;i<p.length;i+=4){
    const L=.299*p[i]+.587*p[i+1]+.114*p[i+2];
    // สว่างกว่า 200 = กระดาษ (ใส) · 140–200 = ขอบเส้นหมึก (จางลงตามความสว่าง)
    p[i+3]=Math.min(p[i+3],L>=200?0:L>140?Math.round((200-L)/60*255):255);
    if(p[i+3]>40){const px=(i/4)%c.width,py=(i/4)/c.width|0;if(px<x0)x0=px;if(px>x1)x1=px;if(py<y0)y0=py;if(py>y1)y1=py;}
  }
  if(x1<0)throw new Error('ไม่พบเส้นลายเซ็นในรูป — ลองถ่ายให้เส้นเข้มและพื้นขาวกว่านี้');
  x.putImageData(d,0,0);
  const pad=6,o=document.createElement('canvas');
  x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(c.width-1,x1+pad);y1=Math.min(c.height-1,y1+pad);
  o.width=x1-x0+1;o.height=y1-y0+1;o.getContext('2d').drawImage(c,x0,y0,o.width,o.height,0,0,o.width,o.height);
  return [o,'image/png'];
}
async function _tqaSaveSettings(){
  const st=_tqaFormSt(),now=new Date().toISOString();
  const rows=[..._TQA_SET.map(x=>x[0]),..._TQA_TXT.map(x=>x[0]),..._TQA_IMG.map(x=>x[0]),'cert_layout',..._TQA_MAIL].map(k=>({key:k,value:st[k]||'',updated_at:now}));
  const {error}=await _sb.from('trn_settings').upsert(rows);
  if(error)return showToast('บันทึกไม่สำเร็จ: '+error.message,'danger');
  _tqaSt=st;showToast('บันทึกการตั้งค่าแล้ว');
}
async function _tqaTestMail(){
  const to=document.getElementById('tqa-s-test').value.trim();
  if(!_emailRe.test(to))return showToast('กรอกอีเมลที่จะทดสอบ','warn');
  const b=document.getElementById('tqa-s-testbtn');b.disabled=true;
  // ส่งตัวอย่าง — เลขที่ไม่มีอยู่จริง จึงไม่กระทบสถานะใบประกาศจริง
  const r=await TrnCert.sendEmail(_sb,{..._tqaSample(),email:to,cert_id:'TEST-'+Date.now()},_tqaFormSt(),locations.find(l=>l.code===currentSite)?.name||'');
  b.disabled=false;
  showToast(r.ok?'ส่งอีเมลทดสอบแล้ว — ตรวจกล่องจดหมาย':'ส่งไม่สำเร็จ: '+r.error,r.ok?'success':'danger');
}
