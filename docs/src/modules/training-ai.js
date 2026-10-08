/* ══════════════════════════════════════════════════════════════════════════
   training-ai.js — AI ในระบบอบรม (โหลดต่อจาก src/modules/training-app.js · ใช้ตัวแปร/ฟังก์ชันของหน้านั้นตรง ๆ)
     1) สรุปผลประเมิน        — หน้า ผลประเมิน   (trnAiSurvey)
     3) สรุปภาพรวมการอบรม    — หน้า Analytics   (trnAiAnalytics)
     6) ร่างข้อความเชิญอบรม  — หน้า รอบอบรม     (trnAiInvite)
   ตัวเรียก AI = src/services/ai.service.js (เซิร์ฟเวอร์ AI ของ BMS) · ตัวเลขทุกตัวโค้ดคำนวณเอง AI แค่เรียบเรียงเป็นข้อความ
   ผลลัพธ์อยู่ในช่องข้อความที่แก้ได้ — ผู้ดูแลตรวจ/แก้ก่อนกดคัดลอกไปใช้เสมอ
══════════════════════════════════════════════════════════════════════════ */
if(!window.esc)window.esc=_esc; // aiTextToHtml ใน ai.service.js ใช้ window.esc

const _AI_RULES='ตอบเป็นภาษาไทย กระชับ อ่านง่าย ใช้เฉพาะข้อมูลที่ให้มา ห้ามแต่งตัวเลขหรือข้อเท็จจริงเพิ่มเอง '
  +'ถ้าข้อมูลไม่พอให้บอกตรง ๆ · จัดรูปแบบด้วยหัวข้อบรรทัดเดียวขึ้นต้นด้วย "## " และรายการขึ้นต้นด้วย "- " เท่านั้น ไม่ใช้ตาราง';

// ข้อความจาก AI → ข้อความธรรมดาพร้อมคัดลอก (หัวข้อ ## → ■, ตัดตัวหนา **)
const _aiPlain=t=>String(t||'').replace(/\*\*(.+?)\*\*/g,'$1').replace(/^\s*#{1,4}\s+/gm,'■ ').replace(/^\s*[*•]\s+/gm,'- ').replace(/\n{3,}/g,'\n\n').trim();
// สรุป (ข้อ 1/3): แต่งด้วยไอคอนเองตามชื่อหัวข้อ (ไม่ปล่อยให้ AI เลือก — ได้หน้าตาเหมือนกันทุกครั้ง อ่านง่ายใน LINE)
// [คำในหัวข้อ, ไอคอนหัวข้อ, ไอคอนนำรายการในหัวข้อนั้น] — เรียงคำที่เจาะจงกว่าไว้ก่อน (ประเด็นจากข้อเสนอแนะ ก่อน ข้อเสนอแนะ)
const _AI_HEADS=[
  ['ภาพรวม','📊','▫️'],['รอบอบรม','📅','🗓️'],['สิ่งที่ต้องติดตาม','🚩','❗'],
  ['จุดแข็ง','💪','✅'],['จุดที่ควรปรับปรุง','🔧','🔸'],['ประเด็น','💬','🗨️'],
  ['ข้อเสนอสำหรับ','🎯','👉'],['ข้อเสนอแนะ','💡','👉'],
];
function _aiDecorate(raw,title,meta){
  let bullet='🔹',out=[];
  String(raw||'').replace(/\*\*(.+?)\*\*/g,'$1').split(/\r?\n/).forEach(ln=>{
    const h=ln.match(/^\s*#{1,4}\s+(.*)$/);
    if(h){
      const t=h[1].replace(/[:：]\s*$/,'').trim(),m=_AI_HEADS.find(x=>t.includes(x[0]));
      bullet=m?m[2]:'🔹';
      if(out.length&&out[out.length-1]!=='')out.push('');
      out.push(`${m?m[1]:'📌'} ${t}`);
      return;
    }
    const b=ln.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if(b){out.push(`${bullet} ${b[1].trim()}`);return;}
    if(ln.trim()||out[out.length-1]!=='')out.push(ln.trim());
  });
  return `${title}\n${meta}\n━━━━━━━━━━━━━━\n\n${out.join('\n').replace(/\n{3,}/g,'\n\n').trim()}`;
}
const _siteLabel=()=>{const l=locations.find(x=>x.code===currentSite);return l?l.name:currentSite;};
const _regUrl=()=>`${location.origin}${location.pathname}?site=${encodeURIComponent(currentSite)}`;
const _todayTH=()=>new Date().toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});
const _isoToday=()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const _sessIso=s=>{const[y,...r]=String(s.date||'').split('-');const yr=parseInt(y);return[yr>2500?yr-543:yr,...r].join('-');};

/* ══ AI ช่วยจัดทำหลักสูตร — แนะนำเท่านั้น ผู้ใช้เลือกและกดนำไปใช้เอง ══ */
let _aiCourseDraft=null;
window.trnAiCourseReset=function(){
  _aiCourseDraft=null;
  const ctx=document.getElementById('nc-ai-context'),out=document.getElementById('nc-ai-result'),btn=document.getElementById('nc-ai-btn');
  document.querySelectorAll('#modal-add-cat .ai-flag').forEach(el=>el.remove());
  if(ctx)ctx.value='';if(out){out.innerHTML='';out.hidden=true;}if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-sparkles"></i>AI ช่วยจัดทำ';}
};
window.trnAiCourseSuggest=async function(){
  const name=document.getElementById('nc-name')?.value.trim();
  if(!name){showToast('กรุณาใส่ชื่อหลักสูตรก่อนให้ AI ช่วยคิด','warn');document.getElementById('nc-name')?.focus();return;}
  const btn=document.getElementById('nc-ai-btn'),out=document.getElementById('nc-ai-result');
  const extra=document.getElementById('nc-ai-context')?.value.trim()||'ไม่มี';
  const quizzes=(_ovQuizzes||[]).filter(q=>q.is_active).map(q=>({id:q.id,title:q.title}));
  btn.disabled=true;btn.innerHTML='<i class="ti ti-loader-2 tqa-spin"></i>AI กำลังวิเคราะห์...';out.hidden=false;out.innerHTML='<div class="form-hint">กำลังจัดทำข้อมูลหลักสูตร อาจใช้เวลา 5–30 วินาที</div>';
  try{
    const data=await window.aiChatJson('คุณเป็นนักออกแบบหลักสูตรอบรมระบบซอฟต์แวร์โรงพยาบาล ตอบ JSON เท่านั้น ห้ามใส่ markdown',`ชื่อหลักสูตร: ${name}\nข้อมูลเพิ่มเติม: ${extra}\nแบบทดสอบที่มีให้เลือก: ${JSON.stringify(quizzes)}\nสร้าง JSON {"description":"คำอธิบายภาษาไทย 2-4 บรรทัด ระบุสิ่งที่จะเรียนรู้แบบกระชับ","cert_code":"รหัสอังกฤษตัวใหญ่ 2-6 ตัว","icon":"หนึ่งค่าจาก box,package,building-hospital,clipboard-check,school,book,device-desktop,settings,users,report","color":"หนึ่งค่าจาก blue,teal,amber,red,purple,green","quiz_id":0,"quiz_reason":"เหตุผลสั้นๆ"} เลือก quiz_id ได้เฉพาะ id ที่ให้มาและตรงเนื้อหาชัดเจน ไม่ตรงให้ใส่ 0`,{maxTokens:650,temperature:.25});
    const allowedIcons=['box','package','building-hospital','clipboard-check','school','book','device-desktop','settings','users','report'],allowedColors=['blue','teal','amber','red','purple','green'];
    const quiz=quizzes.find(q=>String(q.id)===String(data.quiz_id));
    _aiCourseDraft={description:String(data.description||'').trim(),cert_code:String(data.cert_code||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,10),icon:allowedIcons.includes(data.icon)?data.icon:'school',color:allowedColors.includes(data.color)?data.color:'purple',quiz_id:quiz?quiz.id:null,quiz_title:quiz?quiz.title:'— ไม่ผูกแบบทดสอบ —',quiz_reason:String(data.quiz_reason||'').trim()};
    const d=_aiCourseDraft;
    out.innerHTML=`<div class="nc-ai-suggestions">
      <label class="nc-ai-item"><input type="checkbox" data-ai-course="description" checked><div><b>คำอธิบายหลักสูตร</b><span>${_esc(d.description)}</span></div></label>
      <label class="nc-ai-item"><input type="checkbox" data-ai-course="cert_code" checked><div><b>รหัสหลักสูตร</b><span>${_esc(d.cert_code||'ไม่แนะนำ')}</span></div></label>
      <label class="nc-ai-item"><input type="checkbox" data-ai-course="appearance" checked><div><b>รูปลักษณ์</b><span>ไอคอน ${_esc(d.icon)} · สี ${_esc(d.color)}</span></div></label>
      <label class="nc-ai-item"><input type="checkbox" data-ai-course="quiz" checked><div><b>แบบทดสอบจากคลัง</b><span>${_esc(d.quiz_title)}${d.quiz_reason?' — '+_esc(d.quiz_reason):''}</span></div></label></div>
      <div class="nc-ai-apply"><span>AI ไม่บันทึกอัตโนมัติ คุณยังแก้ไขได้ก่อนบันทึก</span><button type="button" class="btn btn-primary btn-sm" onclick="trnAiCourseApply()"><i class="ti ti-check"></i>นำรายการที่เลือกไปใช้</button></div>`;
  }catch(e){out.innerHTML=`<div class="form-hint" style="color:var(--danger)">${_esc(e.message||'AI ทำงานไม่สำเร็จ')}</div>`;showToast(e.message||'AI ทำงานไม่สำเร็จ','danger');}
  finally{btn.disabled=false;btn.innerHTML='<i class="ti ti-refresh"></i>คิดให้ใหม่';}
};
window.trnAiCourseApply=function(){
  if(!_aiCourseDraft)return;
  const picked=k=>!!document.querySelector(`[data-ai-course="${k}"]:checked`),d=_aiCourseDraft;
  if(picked('description')&&d.description){const el=document.getElementById('nc-desc');el.value=d.description;window.aiFlagField?.(el,true);}
  if(picked('cert_code')&&d.cert_code){const el=document.getElementById('nc-cert-code');el.value=d.cert_code;window.aiFlagField?.(el,true);}
  if(picked('appearance')){selectIcon(d.icon);const el=document.getElementById('nc-color');el.value=d.color;window.aiFlagField?.(el,true);}
  if(picked('quiz')){const el=document.getElementById('nc-quiz');el.value=d.quiz_id?String(d.quiz_id):'';window.aiFlagField?.(el,true);}
  _ncPreview();
  showToast('นำคำแนะนำจาก AI ไปใส่ในฟอร์มแล้ว — กรุณาตรวจก่อนบันทึก','success');
};

/* ── popup กลางของ AI: หัว (ชื่อ + ปุ่ม ร่าง/สร้างใหม่ · คัดลอก · ปิด) → ตัวเลือก (ถ้ามี) → ช่องผลลัพธ์ที่แก้ได้
   ทั้งกล่องสูงไม่เกินจอ ช่องผลลัพธ์ยืดเต็มพื้นที่ที่เหลือ — ไม่ต้องเลื่อนแม้จอโน้ตบุ๊ก/อยู่ใน iframe ของ Backoffice ── */
let _aiCtx=null;
const _AI_GRAD='background:linear-gradient(135deg,#7c3aed,#db2777);color:#fff;border:none;';
function _aiModalEl(){
  let m=document.getElementById('modal-trn-ai');
  if(m)return m;
  m=document.createElement('div');
  m.className='modal-overlay';m.id='modal-trn-ai';
  m.onclick=e=>{if(e.target===m)closeModal('modal-trn-ai');};
  m.innerHTML=`<div class="modal" style="max-width:720px;--mpad:18px;display:flex;flex-direction:column;overflow:hidden;height:min(640px,calc(100dvh - 32px));">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
      <div class="modal-title" style="margin:0;flex:1;min-width:200px;"><i class="ti ti-sparkles"></i><span id="trn-ai-title"></span></div>
      <button class="btn btn-sm" id="trn-ai-regen" onclick="_aiRun()" style="${_AI_GRAD}gap:5px;"></button>
      <button class="btn btn-primary btn-sm" onclick="_aiCopy()" style="gap:5px;"><i class="ti ti-copy"></i>คัดลอก</button>
      <button class="btn btn-ghost btn-sm" onclick="closeModal('modal-trn-ai')" title="ปิด"><i class="ti ti-x"></i></button>
    </div>
    <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px;"><span id="trn-ai-sub"></span> · 🤖 ร่างโดย AI — ตรวจ/แก้ข้อความได้ก่อนคัดลอก</div>
    <div id="trn-ai-opts" style="flex-shrink:0;"></div>
    <textarea id="trn-ai-out" class="form-control" style="flex:1;min-height:120px;resize:none;line-height:1.6;font-size:13.5px;"></textarea>
  </div>`;
  document.body.appendChild(m);
  return m;
}
const _aiBtnLabel=(first)=>first?'<i class="ti ti-sparkles"></i>ร่างข้อความ':'<i class="ti ti-refresh"></i>ร่างใหม่';
// ตัวเลือกของแต่ละกล่อง (ใช้ร่วมกัน) — กล่องเตี้ย ๆ แถวละ 1 หัวข้อ
const _aiOptBox=rows=>`<div style="display:grid;gap:6px;margin-bottom:10px;padding:9px 12px;background:var(--surface2,#f8fafc);border:1px solid var(--border);border-radius:10px;">${rows.join('')}</div>`;
const _aiRadios=(label,name,items)=>`<div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px 14px;"><b style="font-size:12.5px;min-width:56px;">${label}</b>${items.map(([v,l],i)=>`<label style="display:inline-flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;"><input type="radio" name="${name}" value="${v}"${i===0?' checked':''}>${l}</label>`).join('')}</div>`;
// ctx: { title, sub, opts (html ตัวเลือก), run: async () => ข้อความ, decorate, autoRun }
function _aiOpen(ctx){
  _aiCtx=ctx;
  const m=_aiModalEl();
  document.getElementById('trn-ai-title').textContent=ctx.title;
  document.getElementById('trn-ai-sub').textContent=ctx.sub||'';
  document.getElementById('trn-ai-opts').innerHTML=ctx.opts||'';
  const out=document.getElementById('trn-ai-out');out.value='';out.placeholder=ctx.autoRun===false?'เลือกตัวเลือกด้านบน แล้วกด "✨ ร่างข้อความ" มุมขวาบน':'';
  document.getElementById('trn-ai-regen').innerHTML=_aiBtnLabel(true);
  m.classList.add('open');
  if(ctx.autoRun!==false)_aiRun();
}
async function _aiRun(){
  if(!_aiCtx)return;
  const out=document.getElementById('trn-ai-out'),btn=document.getElementById('trn-ai-regen');
  const ctx=_aiCtx;
  out.value='';out.placeholder='🤖 AI กำลังเขียน… (ประมาณ 5–30 วินาที)';out.disabled=true;btn.disabled=true;
  btn.innerHTML='<i class="ti ti-loader-2"></i>กำลังร่าง…';
  try{
    const raw=await ctx.run();
    const txt=ctx.decorate?ctx.decorate(raw):_aiPlain(raw);
    if(_aiCtx===ctx)out.value=txt;
  }catch(e){
    if(_aiCtx===ctx){out.value='';out.placeholder='';showToast(e.message||'AI ทำงานไม่สำเร็จ','danger');}
  }finally{
    out.disabled=false;btn.disabled=false;
    btn.innerHTML=_aiBtnLabel(!out.value);
  }
}
async function _aiCopy(){
  const t=document.getElementById('trn-ai-out').value.trim();
  if(!t){showToast('ยังไม่มีข้อความ','warn');return;}
  try{
    if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(t);
    else{const ta=document.createElement('textarea');ta.value=t;ta.style.cssText='position:fixed;left:-9999px;';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}
    showToast('คัดลอกแล้ว','success');
  }catch(e){showToast('คัดลอกไม่สำเร็จ','danger');}
}

/* ══ 1) สรุปผลประเมิน — ใช้ข้อมูลตามตัวกรองที่เลือกอยู่ (รอบ/ช่วงเวลา) เหมือนกราฟบนหน้า ══ */
function _surveyFacts(){
  const data=_svFiltered();
  if(!data.length)return null;
  const items=[];
  const secs=SVD_SECTIONS.map(sec=>{
    const avgs=sec.keys.map((k,i)=>{const v=_avgKey(data,k);items.push({sec:sec.title,q:sec.qs[i],v});return v;}).filter(v=>v>0);
    return{title:sec.title,avg:avgs.length?avgs.reduce((a,b)=>a+b,0)/avgs.length:0};
  });
  const rated=items.filter(x=>x.v>0).sort((a,b)=>b.v-a.v);
  const overall=rated.length?rated.reduce((a,b)=>a+b.v,0)/rated.length:0;
  const yn=data.filter(r=>r.q6_6!=null),wantMore=yn.filter(r=>r.q6_6).length;
  const comments=data.map(r=>(r.comments||'').trim()).filter(Boolean);
  const sessSel=document.getElementById('svd-sess'),perSel=document.getElementById('svd-period');
  return{
    n:data.length,overall,secs,
    top:rated.slice(0,4),low:rated.slice(-5).reverse(),
    wantMore:yn.length?Math.round(wantMore/yn.length*100):null,
    comments,
    scope:[sessSel&&sessSel.value?sessSel.options[sessSel.selectedIndex].text:'ทุกรอบ',perSel&&perSel.value!=='all'?perSel.options[perSel.selectedIndex].text:''].filter(Boolean).join(' · '),
  };
}
function trnAiSurvey(){
  const f=_surveyFacts();
  if(!f){showToast('ยังไม่มีผลประเมินตามตัวกรองที่เลือก','warn');return;}
  const site=(()=>{const el=document.getElementById('svd-site');const l=locations.find(x=>x.code===(el&&el.value||currentSite));return l?l.name:currentSite;})();
  _aiOpen({
    title:'สรุปผลประเมินด้วย AI',
    sub:`${site} · ${f.scope} · ${f.n} คนตอบ${f.comments.length?` · ข้อเสนอแนะ ${f.comments.length} รายการ`:''}`,
    decorate:raw=>_aiDecorate(raw,`⭐ สรุปผลประเมินความพึงพอใจการอบรม`,`🏥 ${site}\n📝 ${f.scope} · ผู้ตอบ ${f.n} คน · คะแนนเฉลี่ย ${f.overall.toFixed(2)}/5`),
    run:()=>{
      const fx=n=>n.toFixed(2);
      const cm=f.comments.slice(0,120).map((c,i)=>`${i+1}. ${c.slice(0,300).replace(/\s+/g,' ')}`).join('\n');
      const user=`ผลประเมินความพึงพอใจการอบรมระบบโปรแกรม — ${site} (${f.scope})
จำนวนผู้ตอบ: ${f.n} คน · คะแนนเฉลี่ยรวม ${fx(f.overall)} จาก 5
คะแนนเฉลี่ยรายด้าน: ${f.secs.map(s=>`${s.title} ${fx(s.avg)}`).join(' · ')}
ข้อที่คะแนนสูงสุด: ${f.top.map(x=>`${x.q} (${x.sec}) ${fx(x.v)}`).join(' · ')}
ข้อที่คะแนนต่ำสุด: ${f.low.map(x=>`${x.q} (${x.sec}) ${fx(x.v)}`).join(' · ')}
${f.wantMore!=null?`ต้องการอบรมเพิ่มเติม: ${f.wantMore}% ของผู้ตอบ\n`:''}ข้อเสนอแนะจากผู้เข้าอบรม (${f.comments.length} รายการ${f.comments.length>120?' — แสดง 120 รายการแรก':''}):
${cm||'(ไม่มี)'}

เขียนสรุปสำหรับแนบรายงานผลการอบรม ตามหัวข้อนี้:
## ภาพรวม (2–3 ประโยค อ้างคะแนนเฉลี่ยรวมและจำนวนผู้ตอบ)
## จุดแข็ง
## จุดที่ควรปรับปรุง (อ้างข้อที่คะแนนต่ำ)
## ประเด็นจากข้อเสนอแนะ (จัดกลุ่มเรื่องที่พูดถึงซ้ำ เช่น วิทยากร เนื้อหา เวลา สถานที่ ระบบ พร้อมจำนวนความเห็นโดยประมาณ — ถ้าไม่มีข้อเสนอแนะให้ข้ามหัวข้อนี้)
## ข้อเสนอสำหรับการอบรมครั้งถัดไป (3–5 ข้อ ทำได้จริง)`;
      return window.aiChat('คุณเป็นผู้ช่วยวิเคราะห์ผลประเมินการอบรมการใช้งานระบบโปรแกรมในโรงพยาบาล '+_AI_RULES,user,{maxTokens:1400,temperature:0.3});
    },
  });
}

/* ══ 3) สรุปภาพรวมการอบรมของโครงการ — ลงทะเบียน/เข้าอบรม/แผนก/รอบ + ตรวจสอบสิทธิ์ + คีย์ยอด ══ */
async function _analyticsFacts(){
  const regs=registrations.filter(r=>!!getSess(r.sessionId));
  const today=_isoToday();
  const total=regs.length,att=regs.filter(r=>r.attended).length;
  const byDept={};
  regs.forEach(r=>{const d=r.dept||'ไม่ระบุแผนก';(byDept[d]=byDept[d]||{n:0,a:0});byDept[d].n++;if(r.attended)byDept[d].a++;});
  const sess=sessions.slice().sort((a,b)=>_sessIso(a)<_sessIso(b)?-1:1).map(s=>{
    const rs=regs.filter(r=>r.sessionId===s.id);
    return{name:s.name,cat:getCat(s.catId)?.name||'',date:fmtDate(s.date),past:_sessIso(s)<today,today:_sessIso(s)===today,n:rs.length,cap:s.capacity,a:rs.filter(r=>r.attended).length};
  });
  // ตรวจสอบสิทธิ์ / คีย์ยอด — ใช้ข้อมูลที่โหลดไว้แล้ว ถ้ายังไม่เคยเปิดหน้านั้นค่อยโหลด (เฉพาะโครงการนี้)
  let lv=loginVerifyData,ke=keyEntryData;
  try{
    if(!lv.length){const{data}=await _sb.from('trn_login_verify').select('login_status').eq('site',currentSite);lv=data||[];}
    if(!ke.length){const{data}=await _sb.from('trn_key_entry_status').select('dept_id,status').eq('site',currentSite);ke=(data||[]).map(_mDeptRow);}
  }catch(e){}
  const lvCnt={};lv.forEach(x=>{lvCnt[x.login_status]=(lvCnt[x.login_status]||0)+1;});
  const keyed=new Set(ke.filter(x=>x.status==='keyed').map(x=>x.dept));
  return{
    site:_siteLabel(),total,att,pct:total?Math.round(att/total*100):0,byDept,sess,
    noReg:_analyticsNoRegStats.noRegDepts||[],deptTotal:departments.length,
    lvCnt,lvTotal:lv.length,
    notKeyed:departments.filter(d=>!keyed.has(d)),
  };
}
function trnAiAnalytics(){
  if(!sessions.length){showToast('โครงการนี้ยังไม่มีรอบอบรม','warn');return;}
  _aiOpen({
    title:'สรุปภาพรวมการอบรมด้วย AI',
    sub:`${_siteLabel()} · ข้อมูล ณ ${_todayTH()}`,
    decorate:raw=>_aiDecorate(raw,`🎓 สรุปภาพรวมการอบรม`,`🏥 ${_siteLabel()}\n🗓️ ข้อมูล ณ ${_todayTH()}`),
    run:async()=>{
      const f=await _analyticsFacts();
      const depts=Object.entries(f.byDept).map(([d,v])=>({d,...v,miss:v.n-v.a}));
      const pastMiss=depts.filter(x=>x.miss>0).sort((a,b)=>b.miss-a.miss).slice(0,8);
      const LV={has_login:'มีสิทธิ์แล้ว',no_login:'ยังไม่มีสิทธิ์',disabled:'ถูกปิดสิทธิ์',pending:'รอตรวจสอบ'};
      const user=`ข้อมูลการอบรมการใช้งานระบบ — โครงการ ${f.site} ณ วันที่ ${_todayTH()}
ลงทะเบียนทั้งหมด ${f.total} คน · เข้าอบรมแล้ว ${f.att} คน (${f.pct}%) · ยังไม่เข้าอบรม ${f.total-f.att} คน
รอบอบรม (${f.sess.length} รอบ):
${f.sess.map(s=>`- ${s.cat?s.cat+' / ':''}${s.name} · ${s.date}${s.today?' (วันนี้)':s.past?' (ผ่านมาแล้ว)':' (ยังไม่ถึง)'} · ลงทะเบียน ${s.n}/${s.cap} · เข้าอบรม ${s.a}`).join('\n')}
หน่วยงานที่มีผู้ลงทะเบียนแต่ยังไม่เข้าอบรมมากที่สุด: ${pastMiss.length?pastMiss.map(x=>`${x.d} ${x.miss} คน (จาก ${x.n})`).join(' · '):'ไม่มี'}
หน่วยงานที่ยังไม่มีผู้ลงทะเบียนเลย: ${f.deptTotal?`${f.noReg.length} จาก ${f.deptTotal} หน่วยงาน${f.noReg.length?' — '+f.noReg.slice(0,25).join(', ')+(f.noReg.length>25?' ฯลฯ':''):''}`:'(ยังไม่ได้กำหนดรายชื่อหน่วยงาน)'}
ตรวจสอบสิทธิ์เข้าใช้งานระบบ: ${f.lvTotal?Object.entries(f.lvCnt).map(([k,v])=>`${LV[k]||k} ${v} คน`).join(' · '):'ยังไม่มีข้อมูล'}
คีย์ยอดรายหน่วยงาน: ${f.deptTotal?`ยังไม่คีย์ ${f.notKeyed.length} จาก ${f.deptTotal} หน่วยงาน${f.notKeyed.length?' — '+f.notKeyed.slice(0,25).join(', ')+(f.notKeyed.length>25?' ฯลฯ':''):''}`:'ยังไม่มีข้อมูล'}
${(a=>a?`อัตราเข้าร่วมเฉพาะรอบที่จัดแล้ว: ${a.attPct??'-'}% · ขาดอบรม ${a.absent} คน · รออบรม (รอบที่ยังไม่ถึง) ${a.pending} คน · ใช้ที่นั่ง ${a.seatPct??'-'}% · Walk-in ${a.walkin} คน
ผลประเมินความพึงพอใจ: ${a.svN?`ผู้ตอบ ${a.svN} คน${a.svRespPct!=null?` (${a.svRespPct}% ของผู้เข้าอบรม)`:''} · เฉลี่ย ${a.svAvg.toFixed(2)}/5 · รายด้าน ${a.svSec.map(s=>`${s.title} ${s.avg.toFixed(2)}`).join(', ')}${a.wantMore!=null?` · ต้องการอบรมเพิ่ม ${a.wantMore}%`:''}`:'ยังไม่มีผู้ตอบ'}
ผลการทดสอบ: ${a.testers?`ผู้สอบ ${a.testers} คน · สอบผ่าน ${a.passN} คน (${a.passPct}%)`:'ยังไม่มีผู้สอบ'}`:'')(_anFacts)}

เขียนสรุปสถานะการอบรมสำหรับรายงานหัวหน้าโครงการและส่งในกลุ่ม LINE ตามหัวข้อนี้:
## ภาพรวม (2–3 ประโยค)
## รอบอบรม (รอบที่ผ่านมาเข้าอบรมดีหรือน้อย และรอบที่กำลังจะถึง)
## สิ่งที่ต้องติดตาม (เรียงตามความสำคัญ ระบุชื่อหน่วยงาน/จำนวนให้ชัด)
## ข้อเสนอแนะ (2–4 ข้อ)`;
      return window.aiChat('คุณเป็นผู้ช่วยผู้จัดการโครงการติดตั้งระบบโปรแกรมโรงพยาบาล สรุปสถานะการอบรมผู้ใช้งาน '+_AI_RULES,user,{maxTokens:1400,temperature:0.3});
    },
  });
}

/* ══ 6) ร่างข้อความเชิญอบรม — ต่อรอบอบรม · LINE กลุ่ม หรือ อีเมล · ทุกหน่วยงาน หรือเฉพาะที่ยังไม่ลงทะเบียน ══ */
// เปิดจากปุ่ม "ร่างข้อความเชิญ" หัวการ์ดรอบอบรม (เลือกรอบในกล่อง ค่าเริ่มต้น = รอบถัดไปที่ใกล้ที่สุด)
const _inviteNoReg=s=>{const reg=new Set(registrations.filter(r=>getSess(r.sessionId)?.catId===s.catId).map(r=>r.dept));return departments.filter(d=>!reg.has(d));};
const _inviteSub=s=>{const cat=getCat(s.catId);return`${cat?cat.name+' — ':''}${s.name} · ${fmtDate(s.date)} ${sessTxt(s)}`;};
function trnAiInviteSess(){ // เปลี่ยนรอบในกล่อง → อัปเดตหัวกล่อง + จำนวนหน่วยงานที่ยังไม่ลงทะเบียน
  const s=getSess(+document.getElementById('ai-sess').value);if(!s)return;
  document.getElementById('trn-ai-sub').textContent=_inviteSub(s);
  document.getElementById('ai-noreg-n').textContent=_inviteNoReg(s).length;
}
function trnAiInvite(sessId){
  if(!sessions.length){showToast('ยังไม่มีรอบอบรม — เพิ่มรอบก่อน','warn');return;}
  const today=_isoToday();
  const list=sessions.slice().sort((a,b)=>_sessIso(a)<_sessIso(b)?-1:1);
  const s0=getSess(sessId)||list.find(x=>_sessIso(x)>=today)||list[list.length-1];
  const sessOpts=list.map(x=>{const c=getCat(x.catId);return`<option value="${x.id}"${x.id===s0.id?' selected':''}>${_esc((c?c.name+' — ':'')+x.name)} · ${fmtDateShort(x.date)}${_sessIso(x)<today?' (ผ่านแล้ว)':''}</option>`;}).join('');
  _aiOpen({
    title:'ร่างข้อความเชิญอบรมด้วย AI',
    sub:_inviteSub(s0),
    autoRun:false,
    opts:_aiOptBox([
      `<div style="display:flex;align-items:center;gap:4px 14px;"><b style="font-size:12.5px;min-width:56px;">รอบอบรม</b><select id="ai-sess" class="form-control" style="padding:4px 10px;font-size:13px;" onchange="trnAiInviteSess()">${sessOpts}</select></div>`,
      _aiRadios('ส่งทาง','ai-ch',[['line','LINE กลุ่ม'],['email','อีเมล']]),
      _aiRadios('ถึง','ai-to',[['all','ทุกหน่วยงาน'],['noreg',`เฉพาะหน่วยงานที่ยังไม่ลงทะเบียนหลักสูตรนี้ (<span id="ai-noreg-n">${_inviteNoReg(s0).length}</span>)`]]),
      _aiRadios('น้ำเสียง','ai-tone',[['formal','สุภาพ ทางการ'],['friendly','เป็นกันเอง']]),
    ]),
    run:()=>{
      const s=getSess(+document.getElementById('ai-sess').value)||s0;
      const cat=getCat(s.catId),noReg=_inviteNoReg(s);
      const v=n=>document.querySelector(`input[name="${n}"]:checked`)?.value;
      const ch=v('ai-ch'),to=v('ai-to'),tone=v('ai-tone');
      const left=s.capacity-registrations.filter(r=>r.sessionId===s.id).length;
      const user=`ข้อมูลการอบรม:
- โรงพยาบาล/โครงการ: ${_siteLabel()}
- หลักสูตร: ${cat?cat.name:'-'}${cat&&cat.desc?` (${cat.desc})`:''}
- รอบ: ${s.name}
- วันที่: ${fmtDate(s.date)} เวลา ${sessTxt(s)}
- สถานที่: ${s.venue||'-'}
- วิทยากร: ${s.trainer||'-'}
- ที่นั่งว่าง: ${left>0?left+' ที่ (จาก '+s.capacity+')':'เต็มแล้ว'}
- ลิงก์ลงทะเบียน (ใส่ในข้อความตามนี้ทุกตัวอักษร): ${_regUrl()}
${to==='noreg'?`- ส่งถึงเฉพาะหน่วยงานที่ยังไม่ลงทะเบียนหลักสูตรนี้ (ระบุชื่อในข้อความ): ${noReg.join(', ')||'(ไม่มี — ทุกหน่วยงานลงแล้ว)'}`:'- ส่งถึงทุกหน่วยงาน'}

ร่างข้อความเชิญเข้าร่วมอบรม ${ch==='email'?'สำหรับส่งทางอีเมล — บรรทัดแรกเขียนเป็น "หัวเรื่อง: ..." แล้วเว้นบรรทัดก่อนเนื้อความ มีคำขึ้นต้นและลงท้ายแบบอีเมล':'สำหรับส่งในกลุ่ม LINE — สั้น อ่านง่ายบนมือถือ ใช้อีโมจิเล็กน้อยนำแต่ละบรรทัดข้อมูล ไม่ต้องมีหัวข้อ ## '} น้ำเสียง${tone==='friendly'?'เป็นกันเอง':'สุภาพแบบทางการ'} ชวนให้ลงทะเบียนก่อนที่นั่งเต็ม ห้ามแต่งข้อมูลที่ไม่มี`;
      return window.aiChat('คุณเป็นเจ้าหน้าที่ประสานงานการอบรมการใช้งานระบบโปรแกรมในโรงพยาบาล ตอบเป็นภาษาไทย ใช้เฉพาะข้อมูลที่ให้มา ตอบเฉพาะตัวข้อความที่จะส่ง ไม่ต้องอธิบายเพิ่ม',user,{maxTokens:900,temperature:0.5});
    },
  });
}

/* ══ ร่างข้อความติดตามหน่วยงานที่ยังไม่ลงทะเบียน — การ์ด "สถานะการลงทะเบียนตามหน่วยงาน" ในหน้า Analytics
   AI เขียนเฉพาะถ้อยคำ · รายชื่อหน่วยงาน รอบอบรม และลิงก์ โค้ดใส่เอง (ตำแหน่ง {{หน่วยงาน}} / {{รอบอบรม}} / {{ลิงก์}}) — ไม่ตกหล่น/ไม่เพี้ยน ══ */
function trnAiFollowNoReg(){
  const {noRegDepts,regCount,total,regPct}=_analyticsNoRegStats;
  if(!total){showToast('ยังไม่มีข้อมูลหน่วยงาน — เพิ่มใน ข้อมูลพื้นฐาน ก่อน','warn');return;}
  if(!noRegDepts.length){showToast('ครบทุกหน่วยงานแล้ว ไม่มีหน่วยงานต้องติดตาม','success');return;}
  _aiOpen({
    title:'ร่างข้อความติดตามหน่วยงานด้วย AI',
    sub:`${_siteLabel()} · ยังไม่ลงทะเบียน ${noRegDepts.length} จาก ${total} หน่วยงาน`,
    autoRun:false,
    opts:_aiOptBox([
      _aiRadios('น้ำเสียง','ai-ftone',[['polite','สุภาพ ขอความร่วมมือ'],['friendly','เป็นกันเอง'],['urgent','เร่งด่วน (ใกล้วันอบรม)']]),
      `<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;"><input type="checkbox" id="ai-fsess" checked>แนบรอบอบรมที่ยังเปิดรับ (วันที่ เวลา ที่นั่งว่าง)</label>`,
    ]),
    run:async()=>{
      const tone=document.querySelector('input[name="ai-ftone"]:checked')?.value;
      const today=_isoToday();
      const open=document.getElementById('ai-fsess')?.checked
        ?sessions.map(s=>({s,left:s.capacity-registrations.filter(r=>r.sessionId===s.id).length}))
          .filter(x=>_sessIso(x.s)>=today&&x.left>0)
          .sort((a,b)=>_sessIso(a.s)<_sessIso(b.s)?-1:1)
          .slice(0,6).map(({s,left})=>{
            return{
              course:getCat(s.catId)?.name||'',
              round:s.name,
              date:fmtDateShort(s.date),
              time:sessTxt(s),
              venue:s.venue||'',
              seats:`ว่าง ${left} ที่`,
            };
          }):[];
      const TONE={polite:'สุภาพ ขอความร่วมมือ',friendly:'เป็นกันเอง เชิญชวน',urgent:'เร่งด่วน ย้ำว่าใกล้ถึงวันอบรมและที่นั่งมีจำกัด แต่ยังสุภาพ'};
      const user=`ข้อมูล:
- โรงพยาบาล/โครงการ: ${_siteLabel()}
- ข้อมูล ณ วันที่: ${_todayTH()}
- ลงทะเบียนแล้ว ${regCount} จาก ${total} หน่วยงาน (${regPct}%) · ยังไม่ลงทะเบียน ${noRegDepts.length} หน่วยงาน
${open.length?`- มีรอบอบรมที่ยังเปิดรับ ${open.length} รอบ — ให้เขียนเฉพาะ {{รอบอบรม}} ไว้ 1 บรรทัด ห้ามพิมพ์รายละเอียด หัวข้อ หรือข้อความเกริ่นนำรอบอบรม เพราะระบบจะจัดรูปแบบให้`:'- ไม่ต้องกล่าวถึงรายละเอียดรอบอบรม'}

ร่างข้อความ LINE กลุ่ม ติดตามให้หน่วยงานที่ยังไม่ลงทะเบียนเข้าร่วมอบรมการใช้งานระบบ น้ำเสียง${TONE[tone]||TONE.polite}
สั้น อ่านง่ายบนมือถือ ใช้อีโมจินำบรรทัดเล็กน้อย ไม่ต้องมีหัวข้อ ##
ห้ามพิมพ์รายชื่อหน่วยงานเอง — ให้เขียน {{หน่วยงาน}} ไว้ 1 บรรทัดตรงตำแหน่งที่จะแสดงรายชื่อ
ห้ามพิมพ์ลิงก์เอง — ให้เขียน {{ลิงก์}} ไว้ตรงตำแหน่งลิงก์ลงทะเบียน
ตอบเฉพาะตัวข้อความที่จะส่ง`;
      let txt=_aiPlain(await window.aiChat('คุณเป็นเจ้าหน้าที่ประสานงานการอบรมการใช้งานระบบโปรแกรมในโรงพยาบาล ตอบเป็นภาษาไทย ใช้เฉพาะข้อมูลที่ให้มา',user,{maxTokens:800,temperature:0.5}));
      const list=noRegDepts.map(d=>`🔸 ${d}`).join('\n');
      txt=txt.includes('{{หน่วยงาน}}')?txt.replace(/\{\{หน่วยงาน\}\}/g,list):`${txt}\n\n${list}`;
      txt=txt.includes('{{ลิงก์}}')?txt.replace(/\{\{ลิงก์\}\}/g,_regUrl()):`${txt}\n\n🔗 ลงทะเบียน: ${_regUrl()}`;
      if(open.length){
        const sl=`📅 รอบอบรมที่ยังเปิดรับ (${open.length} รอบ)\n\n`+open.map((x,i)=>[
          `${i+1}. ${[x.course,x.round].filter(Boolean).join(' — ')}`,
          `   🗓️ ${x.date} | ⏰ ${x.time}`,
          ...(x.venue?[`   📍 ${x.venue}`]:[]),
          `   💺 ${x.seats}`,
        ].join('\n')).join('\n\n');
        txt=txt.includes('{{รอบอบรม}}')?txt.replace(/\{\{รอบอบรม\}\}/g,sl):`${txt}\n\n${sl}`;
      }else txt=txt.replace(/\{\{รอบอบรม\}\}\n?/g,'');
      return txt;
    },
  });
}
