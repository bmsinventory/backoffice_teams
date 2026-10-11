const { esc, fd, fc, fca, pd, gS, gT, gG, gSt, gC, avC, uid, getFY, getYearBE, getStaffOverlaps, overlapWarnText, getStaffLeaveConflicts, getColRef, getDocRef } = window;
const setDoc = (...a) => window.setDoc(...a);

// ── Token BMS Notify อยู่ที่ฐานข้อมูลเท่านั้น (ตาราง notify_tokens — หน้าเว็บอ่านไม่ได้) ─────────────
// ส่ง: หน้าเว็บส่งแค่ช่อง + ข้อความไป /api/notify → push-worker ใน container อ่าน Token เองแล้วส่งต่อ
// ตั้ง/ลบ: bo_notify_token_set · ดูสถานะ: bo_notify_status (เห็นแค่ 4 ตัวท้าย) — ดู NOTIFY TOKENS ใน db-schema.sql
// ช่อง: leave · advance · project · helpdesk · training · server
var _notifyStatus = {};

// → { ok, status, body, skipped } · skipped = ช่องนี้ยังไม่ได้ตั้ง Token (ไม่ได้ส่ง)
async function _doNotifyFetch(channel, content) {
  var res = await fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bo-session': (window.BmsSession && window.BmsSession.token()) || '' },
    body: JSON.stringify({ channel: channel, content: content })
  });
  var body = '';
  try { body = await res.text(); } catch(e) {}
  return { ok: res.ok && res.status !== 204, status: res.status, body: body, skipped: res.status === 204 };
}

async function _loadNotifyStatus() {
  var r = await window.getDb().rpc('bo_notify_status', { p_token: window.BmsSession.token() });
  if (r.error) throw r.error;
  _notifyStatus = r.data || {};
}

// ── NOTIFY SETTINGS UI ───────────────────────────────────────────────────────
var _NOTIFY_CARDS = [
  { key:'leave', icon:'🔔', name:'การลางาน', short:'บันทึก / แก้ไข / อนุมัติการลา',
    desc:'Token สำหรับส่งแจ้งเตือนเมื่อมีการลางาน อนุมัติ หรือไม่อนุมัติ',
    test:function(){ return '🔔 **ทดสอบระบบแจ้งเตือน**\nการแจ้งเตือนทำงานปกติ ✅'; },
    events:[['📋','บันทึกการลางานใหม่'],['✏️','แก้ไขการลางาน'],['✅','อนุมัติการลา'],['❌','ไม่อนุมัติการลา']] },
  { key:'advance', icon:'📋', name:' Advance', short:'สร้าง/อัปเดต Advance, เตือนล่วงหน้า 14 วัน',
    desc:'Token สำหรับแจ้งเตือนการสร้าง/อัปเดต Advance, เมื่อโครงการเข้า Stage plan, เตือนล่วงหน้า 14 วัน และอัปเดตสถานะอัตโนมัติ',
    test:function(){ return '📋 **ทดสอบ: ถึงกำหนดจัดทำ Advance**\n' + _projNotifyBlock({ name:'[ทดสอบ] โครงการตัวอย่าง', siteOwner:'ทดสอบไซต์', installer:'ทดสอบผู้ติดตั้ง', start:window.todayStr(), end:'' }); },
    events:[
      ['✅','จัดทำ Advance แล้ว (บันทึกใหม่)'],
      ['🔄','อัปเดตสถานะ Advance (บันทึกแก้ไข) — สถานะ เคลียร์แล้ว จะแสดงสรุปใช้ไป/คงเหลือ'],
      ['📋','ถึงกำหนดจัดทำ Advance (โครงการเข้า Stage: plan)'],
      ['⚠️','เตือนซ้ำ: ก่อนเริ่มโครงการ 14 วัน ยังไม่มี Advance'],
      ['⚡','อัปเดตอัตโนมัติ → เบิกแล้ว (เมื่อถึงวันเริ่มโครงการ)'],
      ['⚡','อัปเดตอัตโนมัติ → รอเคลียร์ (เมื่อถึงวันสิ้นสุด +3 วัน)']
    ] },
  { key:'project', icon:'🚀', name:'เริ่ม/ปิดโครงการ', short:'วันเริ่ม วันสิ้นสุด และ Stage close',
    desc:'Token สำหรับแจ้งเตือนวันเริ่มต้น วันสิ้นสุด และเมื่อโครงการเข้า Stage close',
    test:function(){ return '🚀 **ทดสอบ: เริ่มดำเนินการโครงการแล้ว**\n' + _projNotifyBlock({ name:'[ทดสอบ] โครงการตัวอย่าง', siteOwner:'ทดสอบไซต์', installer:'ทดสอบผู้ติดตั้ง', start:window.todayStr(), end:window.todayStr() }); },
    events:[
      ['🚀','เริ่มดำเนินการโครงการแล้ว (วันเริ่มต้น)'],
      ['🏁','ปิดโครงการแล้ว (วันสิ้นสุด)'],
      ['💰','ปิดโครงการ/จ่ายเงินแล้ว + มูลค่าโครงการ (Stage: close)']
    ] },
  { key:'helpdesk', icon:'📞', name:' Helpdesk ด่วน', short:'ตั๋วด่วนที่สุด / ลูกค้าโทรด่วน',
    desc:'Token สำหรับแจ้งเตือนตอนมีตั๋วระดับ "ทำงานไม่ได้เลย" เข้าใหม่ และตอนลูกค้ากดเข้าห้องคุยสด (Jitsi) สำเร็จจริง',
    test:function(){ return '🔴 **ทดสอบ: ตั๋วด่วนที่สุด — ทำงานไม่ได้เลย**\n🎫 เลขที่: [ทดสอบ]\n🏢 โรงพยาบาล: ทดสอบ'; },
    events:[['🔴','ตั๋วด่วนที่สุดเข้าใหม่ (ทำงานไม่ได้เลย)'],['📞','ลูกค้ากดเข้าห้องคุยสดสำเร็จ']] },
  { key:'training', icon:'📝', name:'ลงทะเบียนอบรม', short:'มีผู้ลงทะเบียนอบรมใหม่',
    desc:'Token กลางสำหรับแจ้งเตือนเมื่อมีผู้ลงทะเบียนอบรมใหม่ ใช้กับทุกโครงการ — โครงการที่ต้องการแยกกลุ่มหรือปิดแจ้งเตือน ตั้งทับได้ที่ ระบบอบรม › ⚙️ ตั้งค่าโครงการ',
    test:function(){ return '📢 ทดสอบ: มีผู้ลงทะเบียนใหม่\n🏢 โครงการ: [ทดสอบ] โครงการตัวอย่าง\n👤 ชื่อ-สกุล: [ทดสอบ]'; },
    events:[['📢','มีผู้ลงทะเบียนอบรมใหม่ (ระบุโครงการ ชื่อ หน่วยงาน หัวข้อ และเวลาอบรม)']] },
  { key:'server', icon:'🖥', name:'คำขอใช้งานทีม Server', short:'คำขอใหม่ และเมื่อสถานะเปลี่ยน',
    desc:'Token สำหรับแจ้ง DM/PM เมื่อมีคำขอใช้งานทีม Server ใหม่จากฟอร์มภายนอก และเมื่อสถานะคำขอเปลี่ยน',
    test:function(){ return '🖥 **ทดสอบ: คำขอใช้งานทีม Server ใหม่ — รออนุมัติ**\n🧾 เลขที่: **[ทดสอบ]**\n👤 ผู้ขอ: ทดสอบ (ติดตั้งระบบ)\n🏥 โรงพยาบาลทดสอบ\n📅 12 ต.ค. 69 – 14 ต.ค. 69 (2 คน)\n🛠 ติดตั้ง Server Master\n🧑‍💻 IT รพ. : ทดสอบ · 0812345678\n[🔗 เปิดลิงค์เพื่ออนุมัติ](https://backoffice-teams.bmscloud.in.th/#server_request=test)'; },
    events:[['🖥','คำขอใหม่ — รออนุมัติ'],['✅','อนุมัติ / ❌ ไม่อนุมัติ'],['👥','จัดคนแล้ว (พร้อมรายชื่อและช่วงวัน)'],['🚫','ผู้ขอยกเลิกคำขอ']] }
];

// แบบรายการซ้าย (สถานะทุกช่องทาง) + รายละเอียดขวา (Token / ทดสอบ / เหตุการณ์) — ช่องที่ตั้งแล้วซ่อนช่องกรอกไว้หลังปุ่ม "เปลี่ยน Token"
var _ntfSel = 'leave', _ntfEdit = false, _ntfDelAsk = false;

function _ntfSuffix(key) { return (_notifyStatus[key] || '').replace('…', ''); }

function _ntfListItem(c) {
  var on = !!_notifyStatus[c.key], sel = c.key === _ntfSel;
  return '<button type="button" class="ntf-item'+(sel?' is-sel':'')+'" aria-pressed="'+sel+'" onclick="window.pickNotifyChannel(\''+c.key+'\')">'
    +'<span class="ntf-item-ic">'+c.icon+'</span>'
    +'<span class="ntf-item-txt"><span class="ntf-item-name">'+c.name.trim()+'</span><span class="ntf-item-short">'+c.short+'</span></span>'
    +'<span class="ntf-pill '+(on?'is-on':'is-off')+'" title="'+(on?'พร้อมใช้':'ยังไม่ตั้ง Token')+'">'+(on?'พร้อมใช้':'ยังไม่ตั้ง')+'</span>'
    +'</button>';
}

function _ntfDetail(c) {
  var suf = _ntfSuffix(c.key), empty = !suf, form = empty || _ntfEdit, id = 'ntf-' + c.key;
  var h = '<div class="ntf-d-head"><span class="ntf-d-ic">'+c.icon+'</span><div style="min-width:0;">'
    +'<div class="ntf-d-title">แจ้งเตือน'+c.name+'</div><div class="ntf-d-desc">'+c.desc+'</div></div></div>';
  if (!form) {
    h += '<div class="ntf-ok"><span class="ntf-ok-ic">✓</span>'
      +'<div class="ntf-ok-txt"><b>เชื่อมต่อแล้ว</b><span>Token ลงท้าย <code>'+esc(suf)+'</code> · เก็บที่เซิร์ฟเวอร์เท่านั้น</span></div>'
      +'<div class="ntf-actions"><button type="button" class="ntf-btn primary" onclick="window.testNotifyKey(\''+c.key+'\')">🧪 ทดสอบส่ง</button>'
      +'<button type="button" class="ntf-btn" onclick="window.editNotifyKey(true)">เปลี่ยน Token</button></div></div>';
  } else {
    h += '<div class="ntf-form">'
      +(empty ? '<div class="ntf-warn">⚠️ ยังไม่ได้ตั้ง Token — ช่องทางนี้จะยังไม่ส่งแจ้งเตือน</div>' : '')
      +'<label class="f-label" for="'+id+'-input">'+(empty?'API Token':'Token ใหม่ (แทนที่ของเดิม)')+'</label>'
      +'<div class="ntf-actions"><input class="f-input ntf-input" id="'+id+'-input" type="password" autocomplete="off" placeholder="วาง Token ที่นี่" onkeydown="if(event.key===\'Enter\')window.saveNotifyKey(\''+c.key+'\')">'
      +'<button type="button" class="ntf-btn primary" onclick="window.saveNotifyKey(\''+c.key+'\')">💾 บันทึก</button>'
      +(empty ? '' : '<button type="button" class="ntf-btn" onclick="window.editNotifyKey(false)">ยกเลิก</button>')
      +'</div><div class="ntf-hint">Token เก็บที่เซิร์ฟเวอร์เท่านั้น หลังบันทึกจะแสดงแค่ 4 ตัวท้าย</div></div>';
  }
  h += '<div id="'+id+'-msg" class="ntf-msg" role="status"></div>';
  h += '<div><div class="ntf-sec">จะแจ้งเตือนเมื่อ</div><ul class="ntf-events">'
    + c.events.map(function(e){ return '<li><span>'+e[0]+'</span>'+e[1]+'</li>'; }).join('') + '</ul></div>';
  if (!form) {
    h += '<div class="ntf-danger"><span>ลบ Token แล้วช่องทางนี้จะหยุดส่งแจ้งเตือนทันที</span>'
      +(_ntfDelAsk
        ? '<div class="ntf-actions"><b style="color:var(--coral);font-size:13px;">ยืนยันลบ?</b>'
          +'<button type="button" class="ntf-btn danger-fill" onclick="window.clearNotifyKey(\''+c.key+'\')">ลบเลย</button>'
          +'<button type="button" class="ntf-btn" onclick="window.askClearNotifyKey(false)">ไม่ลบ</button></div>'
        : '<button type="button" class="ntf-btn danger" onclick="window.askClearNotifyKey(true)">🗑 ลบ Token</button>')
      +'</div>';
  }
  return h;
}

function _ntfRender() {
  var c = document.getElementById('adm-body'); if (!c) return;
  var cur = _NOTIFY_CARDS.find(function(x){ return x.key === _ntfSel; }) || _NOTIFY_CARDS[0];
  var ready = _NOTIFY_CARDS.filter(function(x){ return _notifyStatus[x.key]; }).length, total = _NOTIFY_CARDS.length;
  c.innerHTML = '<div class="ntf-wrap">'
    +'<div class="ntf-top"><div class="ntf-top-sub">เลือกช่องทางทางซ้าย แล้วตั้ง Token / ทดสอบส่งได้ทางขวา</div>'
    +'<div class="ntf-sum"><div><b>'+ready+' จาก '+total+'</b> ช่องทางพร้อมใช้งาน</div>'
    +'<div class="ntf-bar"><div style="width:'+Math.round(ready/total*100)+'%"></div></div></div></div>'
    +'<div class="ntf-body"><nav class="ntf-list" aria-label="ช่องทางแจ้งเตือน">'+_NOTIFY_CARDS.map(_ntfListItem).join('')+'</nav>'
    +'<section class="ntf-detail">'+_ntfDetail(cur)+'</section></div></div>';
  if (_ntfEdit) { var inp = document.getElementById('ntf-'+cur.key+'-input'); if (inp) inp.focus(); }
}

window.pickNotifyChannel = function(key){ _ntfSel = key; _ntfEdit = false; _ntfDelAsk = false; _ntfRender(); };
window.editNotifyKey = function(on){ _ntfEdit = !!on; _ntfDelAsk = false; _ntfRender(); };
window.askClearNotifyKey = function(on){ _ntfDelAsk = !!on; _ntfRender(); };

window.renderNotifySettings=async function(){
  var c=document.getElementById('adm-body');if(!c)return;
  var titleEl=document.getElementById('adm-head-title');
  if(titleEl)titleEl.innerHTML='🔔 ตั้งค่าการแจ้งเตือน';
  c.innerHTML='<div style="padding:24px;color:var(--txt3);font-size:13px;">⏳ กำลังโหลด...</div>';
  try{ await _loadNotifyStatus(); }
  catch(e){ c.innerHTML='<div style="padding:24px;color:var(--coral);font-size:13px;">❌ โหลดสถานะการแจ้งเตือนไม่ได้: '+esc(e.message||String(e))+'</div>'; return; }
  if(window.admCur!=='notify')return; // ระหว่างโหลดเปลี่ยนแท็บไปแล้ว
  _ntfEdit = false; _ntfDelAsk = false;
  _ntfRender();
};

function _ntfMsg(key, color, text, autoClear) {
  var el = document.getElementById('ntf-' + key + '-msg');
  if (!el) return;
  el.style.color = color;
  el.textContent = text;
  el.classList.toggle('is-show', !!text);
  if (autoClear) setTimeout(function(){ el.textContent = ''; el.classList.remove('is-show'); }, 3000);
}

async function _setNotifyKey(key, value) {
  var r = await window.getDb().rpc('bo_notify_token_set', { p_token: window.BmsSession.token(), p_key: key, p_value: value });
  if (r.error) throw r.error;
  await _loadNotifyStatus();
  _ntfEdit = false; _ntfDelAsk = false;
  _ntfRender();
}

// ── SAVE / DELETE TOKENS ─────────────────────────────────────────────────────
window.saveNotifyKey=async function(key){
  var val=((document.getElementById('ntf-'+key+'-input')||{}).value||'').trim();
  if(!val){_ntfMsg(key,'var(--coral)','❌ กรุณาใส่ Token');return;}
  try{
    await _setNotifyKey(key,val);
    _ntfMsg(key,'var(--teal)','✅ บันทึกแล้ว — กด 🧪 ทดสอบส่ง เพื่อตรวจได้เลย',true);
  }catch(e){window.showDbError(e);}
};

window.clearNotifyKey=async function(key){
  try{
    await _setNotifyKey(key,'');
    _ntfMsg(key,'var(--teal)','✅ ลบแล้ว',true);
  }catch(e){window.showDbError(e);}
};

// ── TEST WITH UI FEEDBACK (ใช้ Token ที่บันทึกไว้) ──────────────────────────────
window.testNotifyKey=async function(key){
  var c=_NOTIFY_CARDS.find(function(x){return x.key===key;});
  if(!c)return;
  if(!_notifyStatus[key]){_ntfMsg(key,'var(--coral)','❌ ยังไม่ได้บันทึก Token');return;}
  _ntfMsg(key,'var(--txt3)','⏳ กำลังส่ง...');
  try{
    var r=await _doNotifyFetch(key,c.test());
    if(r.skipped)_ntfMsg(key,'var(--coral)','❌ ยังไม่ได้บันทึก Token');
    else if(r.ok)_ntfMsg(key,'var(--teal)','✅ ส่งสำเร็จ! (HTTP '+r.status+')',true);
    else _ntfMsg(key,'var(--coral)','❌ HTTP '+r.status+' — '+(r.body||'server ไม่ตอบกลับ'));
  }catch(e){
    _ntfMsg(key,'var(--coral)','❌ ส่งไม่ได้: '+(e.message||String(e)));
  }
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
    +'\n📋 สถานะ: **'+(sf.icon?sf.icon+' ':'')+sf.label+'**'
    +(adv.advno?'\n🔖 เลขที่: '+adv.advno:'')
    +(adv.amount?'\n💰 จำนวน: '+fc(adv.amount)+' บาท':'')
    +clearedBlock;
  try{
    var r=await _doNotifyFetch('advance',content);
    if(!r.ok&&!r.skipped)console.warn('Advance saved notify HTTP '+r.status+':',r.body);
  }catch(e){console.warn('Advance saved notify error:',e);}
};

// ── SEND ADVANCE NOTIFY (stage plan / 14-day reminder) ────────────────────────
var _NO_ADV_NOTIFY_GRPS=['GRP17733355541905','GRP17733355541906'];
window.sendAdvanceNotify=async function(p,isReminder){
  if(p&&_NO_ADV_NOTIFY_GRPS.includes(p.groupId))return;
  var header=isReminder
    ?'⚠️ **เตือนซ้ำ: ยังไม่มีการจัดทำ Advance**\nเหลืออีก 14 วัน ก่อนเริ่มโครงการ'
    :'📋 **ถึงกำหนดที่ต้องจัดทำ Advance แล้ว**';
  var content=header+'\n'+_projNotifyBlock(p);
  try{
    var r=await _doNotifyFetch('advance',content);
    if(!r.ok&&!r.skipped)console.warn('Advance notify HTTP '+r.status+':',r.body);
  }catch(e){console.warn('Advance notify error:',e);}
};

// ── SEND PROJECT START/END NOTIFY ────────────────────────────────────────────
window.sendProjectNotify=async function(p,eventType){
  var header=eventType==='start'?'🚀 **เริ่มดำเนินการโครงการแล้ว**'
            :eventType==='close'?'💰 **ปิดโครงการ/จ่ายเงินแล้ว**'
            :'🏁 **ปิดโครงการแล้ว**';
  var costLine=(eventType==='close'&&p.cost)?'\n💵 มูลค่าโครงการ: '+fc(p.cost)+' บาท':'';
  var content=header+'\n'+_projNotifyBlock(p)+costLine;
  try{
    var r=await _doNotifyFetch('project',content);
    if(!r.ok&&!r.skipped)console.warn('Project notify HTTP '+r.status+':',r.body);
  }catch(e){console.warn('Project notify error:',e);}
};

// ── DAILY CHECK (dedup via localStorage) ─────────────────────────────────────
var _todayStr = window.todayStr;
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

// ── HELPDESK URGENT NOTIFY (ตั๋วด่วนที่สุด / ลูกค้าเข้าห้องคุยสดแล้ว) ─────────────
// ช่อง helpdesk (Token ตั้งที่ Admin Panel → 🔔 ตั้งค่าการแจ้งเตือน) เหมือน sendLeaveNotify/sendAdvanceNotify/
// sendProjectNotify — เรียกจากแอปหลัก (helpdesk.js)
window.sendHdUrgentNotify = async function (content) {
  try {
    var r = await _doNotifyFetch('helpdesk',content);
    if(!r.ok&&!r.skipped) console.warn('Helpdesk urgent notify HTTP ' + r.status + ':', r.body);
  } catch (e) { console.warn('Helpdesk urgent notify error:', e); }
};

// ── LEAVE NOTIFY (existing) ───────────────────────────────────────────────────
window.sendLeaveNotify=async function(eventType,lv){
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
    var approvedBy=window.userNameById(lv.approvedById||lv.approved_by||''); // เก็บเป็นรหัสผู้ใช้
    var lvId=lv.leave_id||lv.id||'';
    var _appBase=(window.location.hostname==='localhost'||window.location.hostname==='127.0.0.1')
      ?(window.location.origin+window.location.pathname)
      :'https://backoffice-teams.bmscloud.in.th/';
    // ── ลิงก์แนบ &approve=1 เฉพาะตอนสถานะยังรออนุมัติ — กดลิงก์แล้วเด้งไปที่รายการพร้อมเปิดกล่องยืนยันอนุมัติทันที ──
    var lvLink=lvId?(_appBase+'#leave='+lvId+(statusKey==='pending'?'&approve=1':'')):'';
    var baseInfo='👤 ชื่อ: **'+st.name+'**'
      +(st.role?'\n💼 ตำแหน่ง: '+st.role:'')
      +(st.dept?'\n🏢 แผนก: '+st.dept:'')
      +'\n'+typeLabel
      +'\n📅 '+dateRange
      +(subName?'\n🔄 ผู้ทำงานแทน: '+subName:'')
      +(noteText?'\n📝 รายละเอียด: '+noteText:'')
      +'\n📌 สถานะ: '+statusLabel;
    if(eventType==='new'){
      content='📋 **แจ้งการลางานใหม่**\n'+baseInfo+(lvLink?'\n🔗 '+lvLink:'');
    } else if(eventType==='edit'){
      content='✏️ **แก้ไขการลางาน**\n'+baseInfo+(lvLink?'\n🔗 '+lvLink:'')+(approvedBy?'\n👨‍💼 ผู้อนุมัติ: '+approvedBy:'');
    } else if(eventType==='approved'){
      content='✅ **อนุมัติการลา**\n'+baseInfo+(approvedBy?'\n👨‍💼 ผู้อนุมัติ: '+approvedBy:'');
    } else if(eventType==='rejected'){
      content='❌ **ไม่อนุมัติการลา**\n'+baseInfo+(lvLink?'\n🔗 '+lvLink:'')+(approvedBy?'\n👨‍💼 ผู้อนุมัติ: '+approvedBy:'');
    }
  }
  if(!content)return;
  try{
    var r=await _doNotifyFetch('leave',content);
    if(!r.ok&&!r.skipped)console.warn('Leave notify HTTP '+r.status+':',r.body);
  }catch(e){console.warn('Leave notify error:',e);}
};
