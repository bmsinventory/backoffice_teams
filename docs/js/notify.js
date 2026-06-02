const { esc, fd, fc, fca, pd, gS, gT, gG, gSt, gC, avC, uid, getFY, getYearBE, getStaffOverlaps, overlapWarnText, getStaffLeaveConflicts, getColRef, getDocRef } = window;
const setDoc = (...a) => window.setDoc(...a);

// ── HELPERS ──────────────────────────────────────────────────────────────────
function _tokenCard(opts) {
  // opts: { id, title, desc, tokenVar, saveFunc, testFunc, events }
  return '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:16px;">'
    +'<div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:4px;">'+opts.title+'</div>'
    +'<div style="font-size:12px;color:var(--txt3);margin-bottom:14px;line-height:1.6;">'+opts.desc+'</div>'
    +'<div class="f-group" style="margin-bottom:12px;">'
    +'<label class="f-label">API Token</label>'
    +'<div style="display:flex;gap:8px;">'
    +'<input class="f-input" id="'+opts.id+'-input" type="password" placeholder="ใส่ Token ที่นี่..." value="'+esc(opts.tokenVar||'')+'" style="flex:1;font-family:monospace;font-size:12px;">'
    +'<button onclick="document.getElementById(\''+opts.id+'-input\').type=document.getElementById(\''+opts.id+'-input\').type===\'password\'?\'text\':\'password\'" style="padding:8px 12px;background:var(--surface3);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;" title="แสดง/ซ่อน Token">👁</button>'
    +'</div>'
    +'</div>'
    +'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
    +'<button onclick="window.'+opts.saveFunc+'()" style="padding:8px 20px;background:var(--violet);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">💾 บันทึก Token</button>'
    +'<button onclick="window.'+opts.testFunc+'()" style="padding:8px 20px;background:var(--surface2);color:var(--txt2);border:1px solid var(--border);border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">🧪 ทดสอบส่ง</button>'
    +'<span id="'+opts.id+'-msg" style="font-size:12px;color:var(--teal);"></span>'
    +'</div>'
    +(opts.events ? '<div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px;"><div style="font-size:11px;font-weight:700;color:var(--txt3);margin-bottom:6px;">เหตุการณ์ที่แจ้งเตือน</div><div style="display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--txt2);">'+opts.events.map(function(e){return'<div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;text-align:center;">'+e[0]+'</span>'+e[1]+'</div>';}).join('')+'</div></div>' : '')
    +'</div>';
}

// ── NOTIFY SETTINGS UI ───────────────────────────────────────────────────────
window.renderNotifySettings=function(){
  var c=document.getElementById('adm-body');if(!c)return;
  var titleEl=document.getElementById('adm-head-title');
  if(titleEl)titleEl.innerHTML='🔔 ตั้งค่าการแจ้งเตือน';
  c.innerHTML='<div style="max-width:580px;padding:8px 4px;">'
    +_tokenCard({
      id:'notify-token',
      title:'🔔 แจ้งเตือนการลางาน',
      desc:'Token สำหรับส่งแจ้งเตือนเมื่อมีการลางาน อนุมัติ หรือไม่อนุมัติ',
      tokenVar:window.NOTIFY_TOKEN||'',
      saveFunc:'saveNotifyToken',
      testFunc:'testNotify',
      events:[['📋','บันทึกการลางานใหม่'],['✏️','แก้ไขการลางาน'],['✅','อนุมัติการลา'],['❌','ไม่อนุมัติการลา']]
    })
    +_tokenCard({
      id:'notify-advance-token',
      title:'📋 แจ้งเตือน Advance',
      desc:'Token สำหรับแจ้งเตือนการสร้าง/อัปเดต Advance, เมื่อโครงการเข้า Stage plan, เตือนล่วงหน้า 14 วัน และอัปเดตสถานะอัตโนมัติ',
      tokenVar:window.NOTIFY_ADVANCE_TOKEN||'',
      saveFunc:'saveNotifyAdvanceToken',
      testFunc:'testNotifyAdvance',
      events:[
        ['✅','จัดทำ Advance แล้ว (บันทึกใหม่)'],
        ['🔄','อัปเดตสถานะ Advance (บันทึกแก้ไข) — สถานะ เคลียร์แล้ว จะแสดงสรุปใช้ไป/คงเหลือ'],
        ['📋','ถึงกำหนดจัดทำ Advance (โครงการเข้า Stage: plan)'],
        ['⚠️','เตือนซ้ำ: ก่อนเริ่มโครงการ 14 วัน ยังไม่มี Advance'],
        ['⚡','อัปเดตอัตโนมัติ → เบิกแล้ว (เมื่อถึงวันเริ่มโครงการ)'],
        ['⚡','อัปเดตอัตโนมัติ → รอเคลียร์ (เมื่อถึงวันสิ้นสุด +3 วัน)']
      ]
    })
    +_tokenCard({
      id:'notify-project-token',
      title:'🚀 แจ้งเตือนเริ่ม/ปิดโครงการ',
      desc:'Token สำหรับแจ้งเตือนวันเริ่มต้น วันสิ้นสุด และเมื่อโครงการเข้า Stage close',
      tokenVar:window.NOTIFY_PROJECT_TOKEN||'',
      saveFunc:'saveNotifyProjectToken',
      testFunc:'testNotifyProject',
      events:[
        ['🚀','เริ่มดำเนินการโครงการแล้ว (วันเริ่มต้น)'],
        ['🏁','ปิดโครงการแล้ว (วันสิ้นสุด)'],
        ['💰','ปิดโครงการ/จ่ายเงินแล้ว + มูลค่าโครงการ (Stage: close)']
      ]
    })
    +'</div>';
};

// ── SAVE PROXY URL ───────────────────────────────────────────────────────────
window.saveNotifyProxyUrl=async function(){
  var val=((document.getElementById('notify-proxy-input')||{}).value||'').trim();
  var msg=document.getElementById('notify-proxy-msg');
  try{
    await setDoc(getDocRef('SETTINGS','app'),{notify_proxy_url:val},{merge:true});
    window.NOTIFY_PROXY_URL=val;
    if(msg){msg.textContent='✅ บันทึกแล้ว';setTimeout(function(){msg.textContent='';},2500);}
  }catch(e){window.showDbError(e);}
};

// ── SAVE TOKENS ──────────────────────────────────────────────────────────────
window.saveNotifyToken=async function(){
  var val=(document.getElementById('notify-token-input')||{}).value||'';
  var msg=document.getElementById('notify-token-msg');
  try{
    await setDoc(getDocRef('SETTINGS','app'),{notify_token:val},{merge:true});
    window.NOTIFY_TOKEN=val;
    if(msg){msg.textContent='✅ บันทึกแล้ว';setTimeout(function(){msg.textContent='';},2500);}
  }catch(e){window.showDbError(e);}
};

window.saveNotifyAdvanceToken=async function(){
  var val=(document.getElementById('notify-advance-token-input')||{}).value||'';
  var msg=document.getElementById('notify-advance-token-msg');
  try{
    await setDoc(getDocRef('SETTINGS','app'),{notify_advance_token:val},{merge:true});
    window.NOTIFY_ADVANCE_TOKEN=val;
    if(msg){msg.textContent='✅ บันทึกแล้ว';setTimeout(function(){msg.textContent='';},2500);}
  }catch(e){window.showDbError(e);}
};

window.saveNotifyProjectToken=async function(){
  var val=(document.getElementById('notify-project-token-input')||{}).value||'';
  var msg=document.getElementById('notify-project-token-msg');
  try{
    await setDoc(getDocRef('SETTINGS','app'),{notify_project_token:val},{merge:true});
    window.NOTIFY_PROJECT_TOKEN=val;
    if(msg){msg.textContent='✅ บันทึกแล้ว';setTimeout(function(){msg.textContent='';},2500);}
  }catch(e){window.showDbError(e);}
};

// ── CORE FETCH (ตรวจ HTTP status + คืน error message) ────────────────────────
async function _doNotifyFetch(token, content) {
  var url = (window.NOTIFY_PROXY_URL || '').trim() || 'https://api-notify.bmscloud.in.th/api/v1/push-notify';
  var res = await fetch(url, {
    method: 'POST',
    headers: { 'Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: content, receiver: null })
  });
  var body = '';
  try { body = await res.text(); } catch(e) {}
  return { ok: res.ok, status: res.status, body: body };
}

// ── TEST WITH UI FEEDBACK ─────────────────────────────────────────────────────
async function _testWithFeedback(token, content, msgId) {
  var msgEl = document.getElementById(msgId);
  function _msg(color, text, autoClear) {
    if (!msgEl) return;
    msgEl.style.color = color;
    msgEl.textContent = text;
    if (autoClear) setTimeout(function(){ msgEl.textContent = ''; }, 3000);
  }
  if (!token) { _msg('var(--coral)', '❌ ยังไม่ได้บันทึก Token'); return; }
  _msg('var(--txt3)', '⏳ กำลังส่ง...', false);
  try {
    var r = await _doNotifyFetch(token, content);
    if (r.ok) {
      _msg('var(--teal)', '✅ ส่งสำเร็จ! (HTTP ' + r.status + ')', true);
    } else {
      _msg('var(--coral)', '❌ HTTP ' + r.status + ' — ' + (r.body || 'server ไม่ตอบกลับ'));
    }
  } catch(e) {
    _msg('var(--coral)', '❌ ส่งไม่ได้: ' + (e.message || String(e)));
  }
}

// ── TEST BUTTONS ─────────────────────────────────────────────────────────────
window.testNotify = async function() {
  await _testWithFeedback(
    window.NOTIFY_TOKEN || '',
    '🔔 **ทดสอบระบบแจ้งเตือน**\nการแจ้งเตือนทำงานปกติ ✅',
    'notify-token-msg'
  );
};
window.testNotifyAdvance = async function() {
  var fake = { name:'[ทดสอบ] โครงการตัวอย่าง', siteOwner:'ทดสอบไซต์', installer:'ทดสอบผู้ติดตั้ง', start:new Date().toISOString().slice(0,10), end:'' };
  await _testWithFeedback(
    window.NOTIFY_ADVANCE_TOKEN || '',
    '📋 **ทดสอบ: ถึงกำหนดจัดทำ Advance**\n' + _projNotifyBlock(fake),
    'notify-advance-token-msg'
  );
};
window.testNotifyProject = async function() {
  var fake = { name:'[ทดสอบ] โครงการตัวอย่าง', siteOwner:'ทดสอบไซต์', installer:'ทดสอบผู้ติดตั้ง', start:new Date().toISOString().slice(0,10), end:new Date().toISOString().slice(0,10) };
  await _testWithFeedback(
    window.NOTIFY_PROJECT_TOKEN || '',
    '🚀 **ทดสอบ: เริ่มดำเนินการโครงการแล้ว**\n' + _projNotifyBlock(fake),
    'notify-project-token-msg'
  );
};

// ── PROJECT INFO BLOCK ────────────────────────────────────────────────────────
function _projNotifyBlock(p){
  return '📌 ชื่อโครงการ: **'+(p.name||'')+'**'
    +'\n🏢 เจ้าของไซต์: '+(p.siteOwner||'—')
    +'\n👷 ชื่อผู้ติดตั้ง: '+(p.installer||'—')
    +'\n📅 '+(p.start?fd(p.start):'—')+(p.end?' – '+fd(p.end):'');
}

// ── SEND ADVANCE SAVED / STATUS NOTIFY ───────────────────────────────────────
window.sendAdvanceSavedNotify=async function(adv,isNew){
  var token=window.NOTIFY_ADVANCE_TOKEN||'';if(!token)return;
  var p=((window.PROJECTS||[]).find(function(x){return x.id===adv.pid;})||{});
  var sf=(window.AFLW||[]).find(function(x){return x.id===adv.status;})||{label:adv.status||'—'};
  var header=isNew?'✅ **จัดทำ Advance แล้ว**':'🔄 **อัปเดตสถานะ Advance**';
  var used=Number(adv.cleared)||0;
  var remaining=(Number(adv.amount)||0)-used;
  var clearedBlock=adv.status==='cleared'
    ?'\n💸 ใช้ไป: '+fc(used)+' บาท'
     +'\n🏦 คงเหลือ: '+fc(remaining)+' บาท'
    :'';
  var content=header+'\n'+_projNotifyBlock(p)
    +'\n📋 สถานะ: **'+sf.label+'**'
    +(adv.advno?'\n🔖 เลขที่: '+adv.advno:'')
    +(adv.amount?'\n💰 จำนวน: '+fc(adv.amount)+' บาท':'')
    +clearedBlock;
  try{
    var r=await _doNotifyFetch(token,content);
    if(!r.ok)console.warn('Advance saved notify HTTP '+r.status+':',r.body);
  }catch(e){console.warn('Advance saved notify error:',e);}
};

// ── SEND ADVANCE NOTIFY (stage plan / 14-day reminder) ────────────────────────
window.sendAdvanceNotify=async function(p,isReminder){
  var token=window.NOTIFY_ADVANCE_TOKEN||'';if(!token)return;
  var header=isReminder
    ?'⚠️ **เตือนซ้ำ: ยังไม่มีการจัดทำ Advance**\nเหลืออีก 14 วัน ก่อนเริ่มโครงการ'
    :'📋 **ถึงกำหนดที่ต้องจัดทำ Advance แล้ว**';
  var content=header+'\n'+_projNotifyBlock(p);
  try{
    var r=await _doNotifyFetch(token,content);
    if(!r.ok)console.warn('Advance notify HTTP '+r.status+':',r.body);
  }catch(e){console.warn('Advance notify error:',e);}
};

// ── SEND PROJECT START/END NOTIFY ────────────────────────────────────────────
window.sendProjectNotify=async function(p,eventType){
  var token=window.NOTIFY_PROJECT_TOKEN||'';if(!token)return;
  var header=eventType==='start'?'🚀 **เริ่มดำเนินการโครงการแล้ว**'
            :eventType==='close'?'💰 **ปิดโครงการ/จ่ายเงินแล้ว**'
            :'🏁 **ปิดโครงการแล้ว**';
  var costLine=(eventType==='close'&&p.cost)?'\n💵 มูลค่าโครงการ: '+fc(p.cost)+' บาท':'';
  var content=header+'\n'+_projNotifyBlock(p)+costLine;
  try{
    var r=await _doNotifyFetch(token,content);
    if(!r.ok)console.warn('Project notify HTTP '+r.status+':',r.body);
  }catch(e){console.warn('Project notify error:',e);}
};

// ── DAILY CHECK (dedup via localStorage) ─────────────────────────────────────
function _todayStr(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function _notiKey(type,pid){return'noti_sent_'+type+'_'+pid+'_'+_todayStr();}
function _notiSent(type,pid){return!!localStorage.getItem(_notiKey(type,pid));}
function _notiMark(type,pid){try{localStorage.setItem(_notiKey(type,pid),'1');}catch(e){}}
window.notiSent=_notiSent;
window.notiMark=_notiMark;

window.checkDailyNotifications=async function(){
  var today=_todayStr();
  var todayD=new Date();todayD.setHours(0,0,0,0);
  var in14=new Date(todayD.getTime()+14*86400000);
  var in14Str=in14.getFullYear()+'-'+String(in14.getMonth()+1).padStart(2,'0')+'-'+String(in14.getDate()).padStart(2,'0');

  for(var p of(window.PROJECTS||[])){
    if(p.status==='cancelled')continue;

    // ── Advance 14-day reminder ──────────────────────────────────────────────
    if(p.stage==='plan'&&p.start===in14Str){
      var hasAdv=(window.ADVANCES||[]).some(function(a){return a.pid===p.id;});
      if(!hasAdv&&!_notiSent('adv14',p.id)){
        await window.sendAdvanceNotify(p,true);
        _notiMark('adv14',p.id);
      }
    }

    // ── Auto-update Advance status ────────────────────────────────────────────
    var projAdvs=(window.ADVANCES||[]).filter(function(a){return a.pid===p.id&&a.status!=='cleared';});
    for(var adv of projAdvs){
      var newStatus=null;

      // Rule 2: end+3 days reached → set 'clearing' (priority ก่อน)
      if(p.end){
        var endD=pd(p.end);endD.setHours(0,0,0,0);
        var endPlus3=new Date(endD.getTime()+3*86400000);
        if(todayD>=endPlus3&&adv.status!=='clearing'){
          newStatus='clearing';
        }
      }

      // Rule 1: start reached → set 'disbursed' (ถ้ายังไม่ถึง clearing)
      if(!newStatus&&p.start){
        var startD=pd(p.start);startD.setHours(0,0,0,0);
        if(todayD>=startD&&!['disbursed','clearing','cleared'].includes(adv.status)){
          newStatus='disbursed';
        }
      }

      if(newStatus){
        adv.status=newStatus;
        try{
          await setDoc(getDocRef('ADVANCES',adv.id),{status:newStatus},{merge:true});
          await window.sendAdvanceSavedNotify(adv,false);
        }catch(e){console.warn('Auto advance status error:',e);}
      }
    }

    // ── Project start notification ────────────────────────────────────────────
    if(p.start===today&&!_notiSent('proj_start',p.id)){
      await window.sendProjectNotify(p,'start');
      _notiMark('proj_start',p.id);
    }

    // ── Project end notification ──────────────────────────────────────────────
    if(p.end===today&&!_notiSent('proj_end',p.id)){
      await window.sendProjectNotify(p,'end');
      _notiMark('proj_end',p.id);
    }
  }
};

// ── LEAVE NOTIFY (existing) ───────────────────────────────────────────────────
window.sendLeaveNotify=async function(eventType,lv){
  var token=window.NOTIFY_TOKEN||'';
  if(!token)return;
  var LEAVE_LABEL={sick:'ลาป่วย',vacation:'ลาพักร้อน',personal:'ลากิจ',maternity:'ลาคลอด',ordain:'ลาบวช',other:'อื่นๆ'};
  var LEAVE_EMOJI={sick:'🤒',vacation:'🏖',personal:'📋',maternity:'🤱',ordain:'🙏',other:'📝'};
  var STATUS_LABEL={pending:'⏳ รออนุมัติ',approved:'✅ อนุมัติแล้ว',rejected:'❌ ไม่อนุมัติ'};
  var content='';
  if(eventType==='test'){
    content='🔔 **ทดสอบระบบแจ้งเตือน**\nการแจ้งเตือนทำงานปกติ ✅';
  } else if(lv){
    var sid=lv.staffId||lv.staff_id||'';
    var st=window.STAFF.find(s=>s.id===sid)||{name:'?',role:'',dept:''};
    var subId=lv.substituteId||lv.substitute_id||'';
    var subName=subId?(window.STAFF.find(s=>s.id===subId)||{name:''}).name:'';
    var typeKey=lv.leaveType||lv.leave_type||'other';
    var typeLabel=(LEAVE_EMOJI[typeKey]||'📝')+' '+(LEAVE_LABEL[typeKey]||typeKey);
    var dateRange=fd(lv.startDate||lv.start_date)+' – '+fd(lv.endDate||lv.end_date);
    var noteText=lv.note||'';
    var statusKey=lv.status||'pending';
    var statusLabel=STATUS_LABEL[statusKey]||statusKey;
    var approvedBy=lv.approvedBy||lv.approved_by||'';
    var lvId=lv.leave_id||lv.id||'';
    var _appBase=(window.location.hostname==='localhost'||window.location.hostname==='127.0.0.1')
      ?(window.location.origin+window.location.pathname)
      :'https://bms-toey.github.io/backoffice_teams/';
    var lvLink=lvId?(_appBase+'#leave='+lvId):'';
    var baseInfo='👤 ชื่อ: **'+st.name+'**'
      +(st.role?'\n💼 ตำแหน่ง: '+st.role:'')
      +(st.dept?'\n🏢 แผนก: '+st.dept:'')
      +'\n'+typeLabel
      +'\n📅 '+dateRange
      +(subName?'\n🔄 ผู้ทำงานแทน: '+subName:'')
      +(noteText?'\n📝 รายละเอียด: '+noteText:'')
      +'\n📌 สถานะ: '+statusLabel
      +(lvLink?'\n🔗 '+lvLink:'');
    if(eventType==='new'){
      content='📋 **แจ้งการลางานใหม่**\n'+baseInfo;
    } else if(eventType==='edit'){
      content='✏️ **แก้ไขการลางาน**\n'+baseInfo+(approvedBy?'\n👨‍💼 ผู้อนุมัติ: '+approvedBy:'');
    } else if(eventType==='approved'){
      content='✅ **อนุมัติการลา**\n'+baseInfo+(approvedBy?'\n👨‍💼 ผู้อนุมัติ: '+approvedBy:'');
    } else if(eventType==='rejected'){
      content='❌ **ไม่อนุมัติการลา**\n'+baseInfo+(approvedBy?'\n👨‍💼 ผู้อนุมัติ: '+approvedBy:'');
    }
  }
  if(!content)return;
  try{
    var r=await _doNotifyFetch(token,content);
    if(!r.ok)console.warn('Leave notify HTTP '+r.status+':',r.body);
  }catch(e){console.warn('Leave notify error:',e);}
};
