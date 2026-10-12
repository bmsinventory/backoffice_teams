// ── เตือนก่อนประชุม (บนหน้าเว็บ) ──
// ตรวจทุก 30 วินาที: บันทึกงานที่ระบุเวลาเริ่ม + ฉันอยู่ในผู้ร่วมงาน (ไม่มีผู้ร่วมงาน = ผู้บันทึก)
// ถึงรอบเตือน (ภายใน 5 นาทีหลังเวลาที่ตั้ง) → กล่องเตือนกลางจอ + เสียงติ๊ง + อ่านออกเสียง (TTS)
// กติกาเดียวกับตัวส่ง Web Push (worklog_reminder_worker_claim ใน db-schema.sql) — ปิดหน้าเว็บอยู่ได้แจ้งเตือนของเครื่องแทน
// กดแจ้งเตือนของเครื่อง → sw.js ส่ง meeting-remind มา / เปิดลิงก์ #worklog=<id>&remind=<นาที> (router.js) → wlRemindOpen
// กันเตือนซ้ำด้วย localStorage (ทุกแท็บในเครื่องเดียวกัน) · ตั้งค่าเสียงต่อเครื่องที่เมนูกระดิ่ง
(function(){
'use strict';

var KEY = 'wlr:', VOICE_KEY = 'wlr_voice';
var WINDOW_MS = 5*60000, NEAR_MIN = 60, SNOOZE_MS = 5*60000;
var VOICE_MODES = [
  { id:'all',  label:'เสียงอ่าน: ทุกรอบ' },
  { id:'near', label:'เสียงอ่าน: เฉพาะก่อนเริ่ม ≤ 1 ชม.' },
  { id:'off',  label:'เสียงอ่าน: ปิด (มีแค่เสียงติ๊ง)' },
];

function _get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
function _set(k, v){ try { localStorage.setItem(k, v); } catch(e){} }
function _voice(){ var v = _get(VOICE_KEY); return VOICE_MODES.some(function(m){ return m.id===v; }) ? v : 'all'; }

// เวลาเริ่ม (เวลาไทย) → ms · ไม่ระบุ/รูปแบบผิด = null
function _startAt(wl){
  var d = wl.type==='period' ? wl.startDate : wl.date;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d||'') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(wl.startTime||'')) return null;
  var t = Date.parse(d+'T'+wl.startTime+':00+07:00');
  return isNaN(t) ? null : t;
}
function _offsets(wl){
  return Array.isArray(wl.reminders) ? wl.reminders.filter(function(n){ return n>=1 && n<=20160; })
    : (window.wlRemDefault ? window.wlRemDefault() : [1440, 60]);
}
function _mine(wl){
  var cu = window.cu;
  if(!cu) return false;
  var pts = wl.participants||[];
  if(!pts.length) return wl.uid===cu.id;
  var u = (window.USERS||[]).find(function(x){ return x.id===cu.id; });
  var sid = u && u.staffId;
  return !!sid && pts.some(function(p){ return p && p.sid===sid; });
}

function _check(){
  if(!window.cu || !Array.isArray(window.WORK_LOGS)) return;
  var now = Date.now();
  window.WORK_LOGS.forEach(function(wl){
    var s = _startAt(wl);
    if(!s || s<=now || s > now + 15*86400000 || !_mine(wl)) return;
    _offsets(wl).forEach(function(off){
      var fire = s - off*60000;
      if(now < fire || now >= fire + WINDOW_MS) return;
      var k = KEY+wl.id+':'+off+':'+s;
      if(_get(k)) return;
      _set(k, String(now));
      _show(wl, off, false);
    });
  });
}

// ล้างคีย์กันซ้ำที่เก่ากว่า 3 วัน
function _cleanup(){
  try {
    var cut = Date.now() - 3*86400000, del = [];
    for(var i=0; i<localStorage.length; i++){
      var k = localStorage.key(i);
      if(k && k.indexOf(KEY)===0 && +localStorage.getItem(k) < cut) del.push(k);
    }
    del.forEach(function(k){ localStorage.removeItem(k); });
  } catch(e){}
}

// ── ข้อความ ──
function _catShort(wl){
  var c = window.wlCatOf ? window.wlCatOf(wl.category) : { label:'' };
  return (c.label||'').split('/')[0].trim() || 'นัดหมาย';
}
function _leftMin(wl){ var s = _startAt(wl); return s ? Math.max(0, Math.round((s - Date.now())/60000)) : 0; }
function _dayKey(ms){ return new Date(ms + 7*3600000).toISOString().slice(0,10); } // วันที่ตามเวลาไทย
function _dayLabel(wl){
  var s = _startAt(wl), today = _dayKey(Date.now()), d = _dayKey(s);
  if(d===today) return 'วันนี้';
  if(d===_dayKey(Date.now()+86400000)) return 'พรุ่งนี้';
  return window.fd ? window.fd(d) : d;
}
function _names(wl){
  return (window.sortByStaffRank ? window.sortByStaffRank(wl.participants||[]) : (wl.participants||[])).map(function(p){
    var st = (window.STAFF||[]).find(function(x){ return x.id===p.sid; });
    return st ? (st.nickname||st.name.split(' ')[0]) : '';
  }).filter(Boolean);
}

// ประโยคสำหรับอ่านออกเสียง — ประกอบเอง ตัวเลข/เวลาเป็นคำ ไม่อ่านลิงก์ แบ่งท่อนตามประโยค
var VIA_SAY = { 'Zoom':'ซูม', 'Google Meet':'กูเกิลมีต', 'Teams':'ไมโครซอฟต์ทีมส์', 'ลิงก์ออนไลน์':'ลิงก์ออนไลน์' };
function _durWords(min){
  var N = window.TTS.num, d = Math.floor(min/1440), h = Math.floor(min%1440/60), m = min%60;
  return (d ? N(d)+'วัน' : '') + (h ? N(h)+'ชั่วโมง' : '') + (m ? N(m)+'นาที' : '');
}
function _timeWords(t){
  var N = window.TTS.num, p = t.split(':'), h = +p[0], m = +p[1];
  return N(h)+'นาฬิกา'+(m ? N(m)+'นาที' : 'ตรง');
}
function _speechParts(wl){
  var left = _leftMin(wl), cat = _catShort(wl), day = _dayLabel(wl), s = _startAt(wl);
  var dayWords = day==='วันนี้' || day==='พรุ่งนี้' ? day : window.TTS.date(_dayKey(s));
  var parts = [{ text:'แจ้งเตือน'+cat+'ค่ะ' }];
  parts.push({ text: left > 0 ? 'อีก'+_durWords(left)+' จะถึงเวลา'+cat+' เรื่อง '+(wl.title||'') : 'ถึงเวลา'+cat+' เรื่อง '+(wl.title||'')+' แล้ว' });
  parts.push({ text: dayWords+' เวลา '+_timeWords(wl.startTime)+(wl.endTime ? ' ถึง '+_timeWords(wl.endTime) : '') });
  if(wl.meetingUrl) parts.push({ text:'ประชุมออนไลน์ผ่าน'+(VIA_SAY[window.wlMeetVia(wl.meetingUrl)]||'ลิงก์ออนไลน์')+' กดปุ่มเข้าร่วมบนหน้าจอได้เลย' });
  else if(wl.locationType!=='local' && wl.destination) parts.push({ text:'สถานที่ '+wl.destination });
  parts.push({ text:'อย่าลืมเตรียมตัวนะคะ' });
  return parts;
}

// ── เสียง ──
var _actx = null;
function _chime(){
  try {
    var A = window.AudioContext || window.webkitAudioContext;
    if(!A) return;
    if(!_actx) _actx = new A();
    if(_actx.state==='suspended') _actx.resume();
    var t = _actx.currentTime + 0.05;
    [880, 660, 990].forEach(function(f, i){
      var o = _actx.createOscillator(), g = _actx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i*0.22);
      g.gain.exponentialRampToValueAtTime(0.35, t + i*0.22 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i*0.22 + 0.2);
      o.connect(g); g.connect(_actx.destination);
      o.start(t + i*0.22); o.stop(t + i*0.22 + 0.22);
    });
  } catch(e){}
}

// เสียงอ่านของเบราว์เซอร์ — ใช้เมื่อบริการเสียง AI ใช้ไม่ได้
function _speakNative(parts){
  try {
    if(!('speechSynthesis' in window)) return;
    var u = new SpeechSynthesisUtterance(parts.map(function(p){ return p.text; }).join(' '));
    u.lang = 'th-TH';
    var v = speechSynthesis.getVoices().find(function(x){ return /^th/i.test(x.lang); });
    if(v) u.voice = v;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch(e){}
}

function _speak(parts, card){
  var wait = card && card.querySelector('.wlr-wait');
  if(!window.TTS){ _speakNative(parts); return; }
  window.TTS.play(parts, {
    polite: true,
    onWait: function(){ if(wait) wait.style.display = ''; },
    onPart: function(){ if(wait) wait.style.display = 'none'; },
    onError: function(){ if(wait) wait.style.display = 'none'; _speakNative(parts); },
  });
}
function _stopSpeak(){
  try { window.TTS && window.TTS.stop(); } catch(e){}
  try { window.speechSynthesis && speechSynthesis.cancel(); } catch(e){}
}

// ── กล่องเตือน (ซ้อนได้หลายรายการ) ──
function _pop(){
  var p = document.getElementById('wlr-pop');
  if(p) return p;
  p = document.createElement('div');
  p.id = 'wlr-pop';
  p.className = 'wlr-pop';
  p.innerHTML = '<div class="wlr-stack" role="alertdialog" aria-live="assertive" aria-label="เตือนก่อนประชุม"></div>';
  document.body.appendChild(p);
  return p;
}

function _cardHtml(wl, off){
  var esc = window.esc, left = _leftMin(wl), via = window.wlMeetVia(wl.meetingUrl);
  var c = window.wlCatOf ? window.wlCatOf(wl.category) : { emoji:'📌' };
  var url = /^https?:\/\/\S+$/i.test(wl.meetingUrl||'') ? wl.meetingUrl : '';
  var names = _names(wl);
  return '<div class="wlr-head">'
      +'<span class="wlr-ic" aria-hidden="true">⏰</span>'
      +'<div class="wlr-hd-txt"><div class="wlr-lead">'+(left > 0 ? 'อีก '+esc(window.wlRemLabel(left)) : 'ถึงเวลาแล้ว')+' — '+esc(_catShort(wl))+'</div>'
        +'<div class="wlr-title">'+esc(c.emoji)+' '+esc(wl.title||'')+'</div></div>'
      +'<button type="button" class="wlr-x" data-act="close" aria-label="ปิด" title="ปิด">✕</button>'
    +'</div>'
    +'<div class="wlr-meta">🗓 '+esc(_dayLabel(wl))+' · '+esc(wl.startTime+(wl.endTime ? '–'+wl.endTime : '')+' น.')+'</div>'
    +(url ? '<div class="wlr-meta">🎥 ประชุมออนไลน์ผ่าน '+esc(via)+'</div>'
      : (wl.locationType!=='local' && wl.destination ? '<div class="wlr-meta">📍 '+esc(wl.destination)+'</div>' : ''))
    +(names.length ? '<div class="wlr-meta">👥 '+esc(names.join(' · '))+'</div>' : '')
    +'<div class="wlr-wait" style="display:none;">🔊 แตะที่ใดก็ได้บนหน้าจอ เพื่อฟังเสียงเตือน</div>'
    +'<div class="wlr-acts">'
      +(url ? '<a class="btn btn-pri btn-sm wlr-join" href="'+esc(url)+'" target="_blank" rel="noopener" data-act="join">🎥 เข้าร่วม '+esc(via)+'</a>' : '')
      +'<button type="button" class="btn btn-ghost btn-sm" data-act="replay">🔁 ฟังอีกครั้ง</button>'
      +(left > 5 ? '<button type="button" class="btn btn-ghost btn-sm" data-act="snooze">⏰ เตือนอีก 5 นาที</button>' : '')
      +'<button type="button" class="btn btn-ghost btn-sm" data-act="open">📝 ดูบันทึก</button>'
    +'</div>';
}

function _closeCard(card){
  card.remove();
  _stopSpeak();
  var p = document.getElementById('wlr-pop');
  if(p && !p.querySelector('.wlr-card')) p.remove();
}

// forceVoice = ผู้ใช้กดแจ้งเตือนเพื่อเปิดดู → อ่านออกเสียงเสมอ (ยกเว้นปิดเสียงอ่าน)
function _show(wl, off, forceVoice){
  if(!window.esc) return;
  var stack = _pop().querySelector('.wlr-stack');
  var id = wl.id+':'+off;
  var card = stack.querySelector('.wlr-card[data-k="'+CSS.escape(id)+'"]');
  if(!card){
    card = document.createElement('div');
    card.className = 'wlr-card';
    card.setAttribute('data-k', id);
    stack.insertBefore(card, stack.firstChild);
    card.addEventListener('click', function(ev){
      var b = ev.target.closest('[data-act]');
      if(!b) return;
      var act = b.getAttribute('data-act');
      var cur = (window.WORK_LOGS||[]).find(function(x){ return x.id===wl.id; }) || wl;
      if(act==='close' || act==='join') _closeCard(card);
      else if(act==='replay') _speak(_speechParts(cur), card);
      else if(act==='snooze'){
        _closeCard(card);
        setTimeout(function(){
          var w = (window.WORK_LOGS||[]).find(function(x){ return x.id===wl.id; });
          if(w && _startAt(w) > Date.now()) _show(w, off, false);
        }, SNOOZE_MS);
      } else if(act==='open'){
        _closeCard(card);
        window.goView && window.goView('worklog');
        setTimeout(function(){ window.openWorkLogModal && window.openWorkLogModal(wl.id); }, 300);
      }
    });
  }
  card.innerHTML = _cardHtml(wl, off);
  _chime();
  var mode = _voice();
  if(mode==='all' || (mode==='near' && (off <= NEAR_MIN || forceVoice))){
    setTimeout(function(){ if(card.isConnected) _speak(_speechParts(wl), card); }, 900); // ให้เสียงติ๊งจบก่อน
  }
  try { card.querySelector('.wlr-x').focus({ preventScroll:true }); } catch(e){}
}

// เปิดจากแจ้งเตือนของเครื่อง / ลิงก์ — รอข้อมูลบันทึกงานโหลดเสร็จก่อน (เปิดแอปใหม่)
window.wlRemindOpen = function(id, off){
  off = +off || 0;
  var tries = 0;
  (function wait(){
    var wl = (window.WORK_LOGS||[]).find(function(x){ return x.id===id; });
    if(wl && window.cu){
      var s = _startAt(wl);
      if(s) _set(KEY+wl.id+':'+off+':'+s, String(Date.now()));
      _show(wl, off, true);
      return;
    }
    if(++tries < 40) setTimeout(wait, 500);
  })();
};

// ── เมนูกระดิ่ง: ตั้งค่าเสียงต่อเครื่อง + ทดสอบเสียง ──
window.wlRemindMenuHtml = function(){
  if(!window.cu) return '';
  var m = VOICE_MODES.find(function(x){ return x.id===_voice(); });
  return '<div style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px;">'
    +'<div class="nm-sub">⏰ เตือนก่อนประชุม (เครื่องนี้)</div>'
    +'<button type="button" data-action="wlr-voice" title="กดเพื่อเปลี่ยน"><span class="nm-ic">'+(m.id==='off' ? '🔈' : '🔊')+'</span><span class="nm-lbl">'+m.label+'</span></button>'
    +'<button type="button" data-action="wlr-test"><span class="nm-ic">🎧</span><span class="nm-lbl">ทดสอบเสียงเตือน</span></button>'
    +'</div>';
};
window.wlRemindCycleVoice = function(){
  var i = VOICE_MODES.findIndex(function(x){ return x.id===_voice(); });
  _set(VOICE_KEY, VOICE_MODES[(i+1) % VOICE_MODES.length].id);
  window.refreshNotiMenu && window.refreshNotiMenu();
};
// ทดสอบ = กดจากผู้ใช้ → เบราว์เซอร์อนุญาตเล่นเสียงของหน้านี้ไว้ด้วย
window.wlRemindTest = function(){
  _chime();
  if(_voice()==='off') return;
  setTimeout(function(){
    _speak([{ text:'ทดสอบเสียงเตือนประชุมค่ะ' }, { text:'อีกหนึ่งชั่วโมง จะถึงเวลาประชุม เรื่อง ทดสอบระบบ' },
      { text:'วันนี้ เวลา '+_timeWords('13:30') }, { text:'ถ้าได้ยินเสียงนี้ แปลว่าเครื่องนี้พร้อมรับเสียงเตือนแล้ว' }], null);
  }, 900);
};

// กดแจ้งเตือนของเครื่องตอนหน้าเว็บเปิดอยู่ (sw.js)
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message', function(e){
    var d = e.data || {};
    if(d.type==='meeting-remind' && d.logId) window.wlRemindOpen(String(d.logId), d.offset);
  });
}
document.addEventListener('keydown', function(e){
  if(e.key!=='Escape') return;
  var c = document.querySelector('#wlr-pop .wlr-card');
  if(c) _closeCard(c);
});
document.addEventListener('visibilitychange', function(){ if(!document.hidden) _check(); });
setInterval(_check, 30000);
setTimeout(function(){ _cleanup(); _check(); }, 5000);

})();
