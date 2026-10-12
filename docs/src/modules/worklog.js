// ── WORK LOG ──
(function(){
'use strict';

var _wlEditId = null;
var _wlSaving = false;

// หมวดงานเริ่มต้น — ผู้มีสิทธิ์แก้ไขบันทึกงานตั้งค่าเพิ่ม/แก้/ซ่อนได้ (เก็บที่ settings.worklog_categories)
const WL_CATS_DEFAULT = [
  {id:'meeting',   emoji:'🗣️', label:'ประชุม'},
  {id:'doc',       emoji:'📄', label:'เอกสาร/รายงาน'},
  {id:'support',   emoji:'🛠️', label:'สนับสนุน'},
  {id:'training',  emoji:'📚', label:'อบรม/เรียนรู้'},
  {id:'conf',      emoji:'🎤', label:'สัมมนา/ประชุมใหญ่'},
  {id:'visit_oc',  emoji:'🌏', label:'ดูงานต่างประเทศ'},
  {id:'visit_up',  emoji:'🚗', label:'ลงพื้นที่ต่างจังหวัด'},
  {id:'internal',  emoji:'🏢', label:'งานภายใน'},
  {id:'other',     emoji:'📌', label:'อื่นๆ'},
];
// รายการเดียวกันตลอด (แก้ในที่) — calendar.js อ่าน window.WL_CATS · หมวดที่ซ่อน (hidden) ยังใช้แสดงบันทึกเก่า
const WL_CATS = [];
window.WL_CATS = WL_CATS;

window.wlApplyCats = function(list){
  var src = Array.isArray(list) && list.length ? list : WL_CATS_DEFAULT;
  WL_CATS.length = 0;
  src.forEach(function(c){
    if(c && c.id && c.label) WL_CATS.push({id:String(c.id), emoji:c.emoji||'📌', label:String(c.label), hidden:!!c.hidden});
  });
  var ed = document.getElementById('wlf-cat-edit');
  if(document.getElementById('wlf-cats') && !(ed && ed.style.display!=='none')) _renderCatChips();
};
window.wlApplyCats(window.WL_CATS_CFG);

const WL_LOCS = [
  {id:'local',     emoji:'🏢', label:'ในพื้นที่'},
  {id:'upcountry', emoji:'🚗', label:'ต่างจังหวัด'},
  {id:'overseas',  emoji:'🌏', label:'ต่างประเทศ'},
];

// ── เวลา / ลิงก์ประชุม / เตือนก่อนเริ่ม ──
// reminders = นาทีก่อนเวลาเริ่ม · null = ค่าเริ่มต้น (settings.worklog_reminders) · [] = ไม่เตือน
// เตือนจริง: หน้าเว็บ (worklog-remind.js) + Web Push จากตัวส่ง (worklog_reminder_worker_claim ใน db-schema.sql) — กติกาเดียวกัน
var WL_REM_QUICK = [1440, 180, 60, 30];
var WL_REM_MAX = 20160, WL_REM_LIMIT = 5; // สูงสุด 14 วันล่วงหน้า · ไม่เกิน 5 รอบต่องาน
var WL_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function _remClean(list){
  var seen = {};
  return (Array.isArray(list) ? list : []).map(Number)
    .filter(function(n){ if(!(n>=1 && n<=WL_REM_MAX) || Math.floor(n)!==n || seen[n]) return false; seen[n] = 1; return true; })
    .sort(function(a,b){ return b-a; });
}
window.wlRemDefault = function(){ return _remClean(Array.isArray(window.WL_REMIND_CFG) ? window.WL_REMIND_CFG : [1440, 60]); };
// 90 → "1 ชม. 30 นาที" · 1440 → "1 วัน"
window.wlRemLabel = function(min){
  var d = Math.floor(min/1440), h = Math.floor(min%1440/60), m = min%60, out = [];
  if(d) out.push(d+' วัน');
  if(h) out.push(h+' ชม.');
  if(m) out.push(m+' นาที');
  return out.join(' ') || '0 นาที';
};
// ชื่อบริการประชุมจากลิงก์ (ใช้บนปุ่ม/เสียงอ่าน)
window.wlMeetVia = function(url){
  if(!url) return '';
  if(/zoom\./i.test(url)) return 'Zoom';
  if(/meet\.google\./i.test(url)) return 'Google Meet';
  if(/teams\.(microsoft|live)\./i.test(url)) return 'Teams';
  return 'ลิงก์ออนไลน์';
};
function _safeUrl(u){ return /^https?:\/\/\S+$/i.test(u||'') ? u : ''; }
function _wlTimeLabel(wl){
  return wl.startTime ? ' · '+wl.startTime+(wl.endTime ? '–'+wl.endTime : '')+' น.' : '';
}

function _cat(id){ return WL_CATS.find(function(c){return c.id===id;})||{emoji:'📌',label:id||'อื่นๆ'}; }
window.wlCatOf = _cat;
function _loc(id){ return WL_LOCS.find(function(l){return l.id===id;})||{emoji:'📌',label:id||''}; }

function _wlDateLabel(wl){
  var fd = window.fd;
  if(wl.type==='daily') return fd ? fd(wl.date) : wl.date;
  if(!wl.startDate) return '';
  var days = _wlTotalDays(wl);
  return (fd?fd(wl.startDate):wl.startDate) + ' – ' + (fd?fd(wl.endDate):wl.endDate) + ' (' + days + ' วัน)';
}

function _wlTotalDays(wl){
  if(wl.type==='daily') return 1;
  if(wl.startDate && wl.endDate){
    var s = new Date(wl.startDate), e = new Date(wl.endDate);
    return Math.max(1, Math.round((e - s) / 86400000) + 1);
  }
  return wl.totalDays || 1;
}

function _curStaffId(){
  var cu = window.cu;
  if(!cu) return '';
  var u = (window.USERS||[]).find(function(u){ return u.id === cu.id; });
  return u ? u.staffId||'' : '';
}

function _ptAv(sid, nm){
  var i = (window.STAFF||[]).findIndex(function(x){ return x.id===sid; });
  return '<span class="wlf-av" style="background:'+window.avC(Math.max(0,i))+'">'+window.esc((nm||'?').charAt(0))+'</span>';
}

// แถวผู้เข้าร่วมที่เลือก — ช่องวันที่รายคนแสดงเฉพาะงานหลายวัน · custom = แก้วันเองแล้ว (ไม่ตามวันของงาน)
function _ptRow(sid, s, e, custom){
  var st = (window.STAFF||[]).find(function(x){ return x.id===sid; });
  var nm = st ? st.name : sid;
  return '<div class="wl-prow'+(custom?' custom':'')+'" data-sid="'+sid+'">'
    +'<div class="wl-prow-hd">'
      +_ptAv(sid, st ? (st.nickname||st.name) : sid)
      +'<span class="wl-prow-nm">'+window.esc(nm)+(st&&st.nickname?' <span>('+window.esc(st.nickname)+')</span>':'')+'</span>'
      +'<button type="button" class="wl-prow-x" onclick="window._wlRemovePt(this)" aria-label="เอาออก" title="เอาออก">✕</button>'
    +'</div>'
    +'<div class="wl-prow-dates">'
      +window.beDateField('', s, {inputCls:'wl-mem-s', onchange:'window._wlPtDateSet(this)'})
      +window.beDateField('', e, {inputCls:'wl-mem-e', onchange:'window._wlPtDateSet(this)'})
    +'</div>'
  +'</div>';
}

// จำค่า "บันทึกแล้วเพิ่มงานถัดไปต่อ" ไว้ในเครื่อง
function _keepGet(){ try { return localStorage.getItem('wl_keep_open')==='1'; } catch(e){ return false; } }
window._wlKeepToggle = function(on){ try { localStorage.setItem('wl_keep_open', on?'1':'0'); } catch(e){} };

// งานล่าสุดของฉัน (ชื่อไม่ซ้ำ) — แตะครั้งเดียวเติมชื่อ/หมวด/สถานที่
var _wlRecents = [];
function _recentsHtml(){
  var myUid = window.cu ? window.cu.id : '';
  var seen = {};
  _wlRecents = (window.WORK_LOGS||[]).filter(function(w){ return w.uid===myUid && w.title; })
    .sort(function(a,b){
      var ka = a.createdAt||a.date||a.startDate||'', kb = b.createdAt||b.date||b.startDate||'';
      return ka<kb ? 1 : ka>kb ? -1 : 0;
    })
    .filter(function(w){ var k = w.title.trim(); if(seen[k]) return false; seen[k]=1; return true; })
    .slice(0,5);
  if(!_wlRecents.length) return '';
  return '<div class="wlf-recents"><span>ล่าสุด:</span>'
    +_wlRecents.map(function(w,i){
      var c = _cat(w.category);
      return '<button type="button" class="wlf-recent" onclick="window._wlUseRecent('+i+')" title="'+window.esc(w.title)+' · '+window.esc(c.label)+'">'+window.esc(c.emoji)+' '+window.esc(w.title)+'</button>';
    }).join('')
    +'</div>';
}

// ── RENDER LIST ──
window.renderWorkLog = function(){
  var body = document.getElementById('wl-list');
  if(!body) return;

  var allLogs = window.WORK_LOGS || [];
  var myUid   = window.cu ? window.cu.id : '';

  var logs = allLogs.slice();

  var q = ((document.getElementById('wl-q')||{}).value||'').toLowerCase();
  if(q) logs = logs.filter(function(wl){
    return (wl.title||'').toLowerCase().includes(q)        || _cat(wl.category).label.toLowerCase().includes(q)
        || (wl.destination||'').toLowerCase().includes(q);
  });

  if(!logs.length){
    body.innerHTML = '<div style="text-align:center;padding:64px 24px;color:var(--txt-muted);">ยังไม่มีบันทึกงาน</div>';
    return;
  }

  // Group by month
  var groups = {};
  logs.forEach(function(wl){
    var d = wl.type==='daily' ? wl.date : wl.startDate;
    if(!d) return;
    var key = d.slice(0,7);
    if(!groups[key]) groups[key] = [];
    groups[key].push(wl);
  });

  var months  = Object.keys(groups).sort().reverse();
  // ดัชนีพนักงานตาม id (ตัวแรกที่เจอ = ผลเดียวกับ .find) — แทนการสแกน STAFF ต่อผู้เข้าร่วมทุกคน
  var staffById = new Map();
  (window.STAFF||[]).forEach(function(s){ if(!staffById.has(s.id)) staffById.set(s.id, s); });

  var html = '';
  months.forEach(function(ym){
    var parts = ym.split('-');
    var mon   = window.THMON_SHORT[parseInt(parts[1])-1] + ' ' + (parseInt(parts[0])+543);
    html += '<div style="font-size:10px;font-weight:700;color:var(--txt-muted);letter-spacing:.5px;padding:14px 0 6px;">'+mon+'</div>';

    groups[ym].forEach(function(wl){
      var cat  = _cat(wl.category);
      var loc  = _loc(wl.locationType);
      var isCreator = wl.uid === myUid;

      var ptNames = window.sortByStaffRank(wl.participants||[]).map(function(p){
        var st = staffById.get(p.sid);
        return st ? (st.nickname||st.name.split(' ')[0]) : '';
      }).filter(Boolean);

      var creator = staffById.get(wl.staffId);
      var creatorName = creator ? (creator.nickname||creator.name.split(' ')[0]) : '';

      var locBadge = wl.locationType!=='local'
        ? '<span style="font-size:9px;padding:2px 8px;border-radius:10px;background:var(--violet)18;color:var(--violet);white-space:nowrap;flex-shrink:0;">'+loc.emoji+' '+(wl.destination||loc.label)+'</span>'
        : '<span style="font-size:9px;padding:2px 8px;border-radius:10px;background:var(--border);color:var(--txt-muted);white-space:nowrap;flex-shrink:0;">'+loc.label+'</span>';

      html += '<div onclick="window.openWorkLogModal(\''+wl.id+'\')" '
        +'style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:8px;cursor:pointer;transition:background .12s;" '
        +'onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'var(--surface)\'">'
        +'<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:6px;">'
          +'<span style="font-size:22px;line-height:1;flex-shrink:0;">'+window.esc(cat.emoji)+'</span>'
          +'<div style="flex:1;min-width:0;">'
            +'<div style="font-size:13px;font-weight:700;color:var(--txt);line-height:1.3;">'+window.esc(wl.title)+'</div>'
            +'<div style="font-size:10px;color:var(--txt-muted);margin-top:2px;">'+window.esc(cat.label)+' · '+_wlDateLabel(wl)+window.esc(_wlTimeLabel(wl))+'</div>'
          +'</div>'
          +locBadge
        +'</div>'
        +(_safeUrl(wl.meetingUrl)
          ? '<a class="wl-join" href="'+window.esc(wl.meetingUrl)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="'+window.esc(wl.meetingUrl)+'">🎥 เข้าร่วม '+window.esc(window.wlMeetVia(wl.meetingUrl))+'</a>'
          : '')
        +(ptNames.length
          ? '<div style="font-size:10px;color:var(--txt-muted);">👥 '+window.esc(ptNames.join(' · '))+'</div>'
          : (creatorName ? '<div style="font-size:10px;color:var(--txt-muted);">👤 '+window.esc(creatorName)+'</div>' : ''))
        +(wl.detail ? '<div style="font-size:10px;color:var(--txt-muted);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+window.esc(wl.detail)+'</div>' : '')
      +'</div>';
    });
  });

  body.innerHTML = html;
};

// ── MODAL OPEN ──
window.openWorkLogModal = function(id){
  var wl = id ? (window.WORK_LOGS||[]).find(function(w){ return w.id===id; }) : null;
  _wlEditId = id||null;

  document.getElementById('m-worklog-title').textContent = wl ? 'แก้ไขบันทึกงาน' : 'เพิ่มบันทึกงาน';

  var today   = window.todayStr();
  var multi   = wl ? wl.type==='period' : false;
  var dFrom   = wl ? ((multi ? wl.startDate : wl.date) || today) : today;
  var dTo     = wl && multi ? (wl.endDate || dFrom) : dFrom;
  var catId   = wl ? (wl.category||'other') : 'meeting';
  var locType = wl ? (wl.locationType||'local') : 'local';
  var parts   = wl ? window.sortByStaffRank(wl.participants||[]) : [];

  var ptHtml = parts.map(function(p){
    var s = p.s||dFrom, e = p.e||(multi?dTo:s);
    return _ptRow(p.sid, s, e, multi && !(s===dFrom && e===dTo));
  }).join('');
  var picked = parts.map(function(p){ return p.sid; });

  // รายชื่อทั้งหมด แบ่งกลุ่มตามแผนก → ระดับตำแหน่ง
  var staffListHtml = '', curDept = null;
  (window.STAFF||[]).filter(function(s){ return s.active!==false; }).sort(window.sortStaffByDeptRank).forEach(function(s){
    var dept = s.dept||'ไม่ระบุแผนก';
    if(dept!==curDept){ staffListHtml += '<div class="wl-pk-dept">👥 '+window.esc(dept)+'</div>'; curDept = dept; }
    staffListHtml += '<div class="wl-pk-item'+(picked.indexOf(s.id)>=0?' on':'')+'" data-sid="'+s.id+'" data-q="'+window.esc((s.name+' '+(s.nickname||'')+' '+(s.dept||'')).toLowerCase())+'" onclick="window._wlTogglePt(this.getAttribute(\'data-sid\'))">'
      +_ptAv(s.id, s.nickname||s.name)
      +'<div class="wl-pk-txt"><div class="wl-pk-nm">'+window.esc(s.name)+(s.nickname?' <span>('+window.esc(s.nickname)+')</span>':'')+'</div>'
        +(s.role?'<div class="wl-pk-role">'+window.esc(s.role)+'</div>':'')
      +'</div>'
      +'<span class="wl-pk-mark" aria-hidden="true"></span>'
    +'</div>';
  });

  // หัวขั้นตอน (เลขวงกลม + คำถามสั้น ๆ) — ไล่ตอบทีละข้อจากบนลงล่าง
  function step(n, q, opt){ return '<div class="wlf-step-hd"><span class="wlf-step">'+n+'</span>'+q+(opt?' <span class="wlf-opt">(ไม่บังคับ)</span>':'')+'</div>'; }

  var html = '<div class="wlf'+(multi?' multi':'')+'">'
    // ซ้าย: รายละเอียดงาน แบ่งเป็นขั้น ① งานอะไร ② เมื่อไร ③ ที่ไหน ④ รายละเอียด
    +'<div class="wlf-main">'
    // ① งานอะไร — ชื่องาน + งานล่าสุด + หมวดงาน
    +'<section class="wlf-sec">'
      +step(1, 'ทำงานอะไร')
      +'<div>'
        +'<div class="wlf-lbl-row"><label class="f-label" for="wlf-title">ชื่องาน / หัวข้อ <b class="wlf-req">*</b></label>'
          +'<button type="button" class="wlf-link wlf-ai" id="wlf-ai-fill" onclick="window._wlAiFill()" title="พิมพ์เป็นประโยค เช่น “13-15 ต.ค. ลงพื้นที่ติดตั้ง รพ.ขอนแก่น กับเอี้ยม เต้ย” แล้วกด Enter หรือกดปุ่มนี้ · Ctrl+Enter = บันทึกทันทีไม่ผ่าน AI">✨ AI กรอกให้</button>'
        +'</div>'
        +'<input type="text" class="f-input wlf-title" id="wlf-title" autocomplete="off" placeholder="'+(wl ? 'ชื่องาน · Enter = บันทึก' : 'เช่น ประชุม รพ.ขอนแก่น พรุ่งนี้ 10 โมง → Enter ให้ AI กรอกให้')+'" value="'+window.esc(wl?wl.title||'':'')+'" oninput="window._wlTitleInput()" onkeydown="window._wlTitleKey(event)">'
        +'<div id="wlf-ai-note" class="wlf-ai-note" style="display:none;"></div>'
        +(wl ? '' : '<div id="wlf-recents-wrap">'+_recentsHtml()+'</div>')
      +'</div>'
      +'<div>'
        // หมวดงาน — แถวเดียว: หัวข้อ | ตัวเลือก (dropdown) | ⚙ ตั้งค่า
        +'<div class="wlf-cat-row"><label class="f-label" for="wlf-cat-sel">หมวดงาน <b class="wlf-req">*</b></label>'
          +'<div class="wlf-cats" id="wlf-cats"></div>'
          +(_canCfgCats() ? '<button type="button" class="wlf-link" id="wlf-cat-cfg" onclick="window._wlCatEdit(true)" title="ตั้งค่าหมวด" aria-label="ตั้งค่าหมวด">⚙ ตั้งค่า</button>' : '')
        +'</div>'
        +'<input type="hidden" id="wlf-cat" value="'+window.esc(catId)+'">'
        +'<div id="wlf-cat-edit" class="wlf-ce" style="display:none;"></div>'
      +'</div>'
    +'</section>'
    // ② เมื่อไร — วันที่ | เวลา → เตือนก่อนเริ่ม (แสดงเมื่อใส่เวลาเริ่ม)
    +'<section class="wlf-sec">'
      +step(2, 'เมื่อไร')
      +'<div class="wlf-row2">'
        +'<div>'
          +'<div class="wlf-lbl-row"><label class="f-label" for="wlf-date">วันที่</label>'
            +'<label class="wlf-check"><input type="checkbox" id="wlf-multi"'+(multi?' checked':'')+' onchange="window._wlMultiToggle(this.checked)">หลายวัน</label>'
          +'</div>'
          +'<div class="wlf-dates">'
            +'<input type="date" class="f-input" id="wlf-date" value="'+dFrom+'" onchange="window._wlAutoEndDate()" aria-label="วันที่เริ่ม">'
            +'<span id="wlf-end-wrap"'+(multi?'':' style="display:none;"')+'><span>ถึง</span>'
              +'<input type="date" class="f-input" id="wlf-end" value="'+dTo+'" onchange="window._wlAutoEndDate()" aria-label="วันที่สิ้นสุด">'
            +'</span>'
          +'</div>'
        +'</div>'
        +'<div>'
          +'<div class="wlf-lbl-row"><label class="f-label" for="wlf-t1">เวลา <span class="wlf-opt">(ไม่บังคับ)</span></label></div>'
          +'<div class="wlf-dates">'
            +'<input type="time" class="f-input" id="wlf-t1" value="'+window.esc(wl?wl.startTime||'':'')+'" oninput="window._wlTimeChange()" aria-label="เวลาเริ่ม">'
            +'<span class="wlf-to">ถึง</span>'
            +'<input type="time" class="f-input" id="wlf-t2" value="'+window.esc(wl?wl.endTime||'':'')+'" aria-label="เวลาเลิก">'
          +'</div>'
        +'</div>'
      +'</div>'
      +'<div id="wlf-rem" class="wlf-rem"></div>'
    +'</section>'
    // ③ ที่ไหน — สถานที่ + ปลายทาง + ลิงก์ประชุมออนไลน์
    +'<section class="wlf-sec">'
      +step(3, 'ที่ไหน')
      +'<div class="wlf-seg" role="radiogroup" aria-label="สถานที่">'
        +WL_LOCS.map(function(l){
          var on = locType===l.id;
          return '<button type="button" role="radio" aria-checked="'+on+'" class="wl-loc-btn'+(on?' on':'')+'" data-lid="'+l.id+'" onclick="window._wlLocToggle(\''+l.id+'\')">'+l.emoji+' '+l.label+'</button>';
        }).join('')
      +'</div>'
      +'<div id="wl-dest-wrap"'+(locType==='local'?' style="display:none;"':'')+'>'
        +'<input type="text" class="f-input" id="wlf-dest" placeholder="ปลายทาง เช่น เชียงใหม่, โตเกียว ญี่ปุ่น" value="'+window.esc(wl?wl.destination||'':'')+'" aria-label="ปลายทาง">'
      +'</div>'
      +'<div>'
        +'<label class="f-label" for="wlf-url">🎥 ประชุมออนไลน์ <span class="wlf-opt">(ไม่บังคับ)</span></label>'
        +'<input type="url" class="f-input wlf-url" id="wlf-url" autocomplete="off" placeholder="วางลิงก์ Zoom / Google Meet / Teams" value="'+window.esc(wl?wl.meetingUrl||'':'')+'">'
      +'</div>'
    +'</section>'
    // ④ รายละเอียด
    +'<section class="wlf-sec">'
      +'<div class="wlf-lbl-row">'+step(4, 'รายละเอียดเพิ่มเติม', true)
        +'<button type="button" class="wlf-link wlf-ai" id="wlf-ai-detail" onclick="window._wlAiDetail()" title="จดสั้น ๆ เป็นข้อ ๆ แล้วให้ AI เรียบเรียงเป็นข้อความทางการ">✨ เรียบเรียง</button>'
      +'</div>'
      +'<textarea class="f-input" id="wlf-detail" rows="2" placeholder="จดสั้น ๆ ได้ แล้วกด ✨ เรียบเรียง" aria-label="รายละเอียด" oninput="if(event.isTrusted)window._wlDetailEdited()">'+window.esc(wl?wl.detail||'':'')+'</textarea>'
    +'</section>'
    +'</div>'
    // ขวา: ⑤ ผู้เข้าร่วม — บน: ที่เลือกแล้ว · ล่าง: ค้นหา + รายชื่อทั้งหมด
    +'<div id="wl-pt-section" class="wlf-side'+(multi?' multi':'')+'">'
      +step(5, 'ใครร่วมงานบ้าง')
      +'<div class="wlf-lbl-row"><label class="f-label" for="wl-pt-q">ผู้เข้าร่วม <span id="wl-pt-cnt">'+(parts.length?'('+parts.length+')':'')+'</span></label><span class="wlf-pt-hint">ไม่เลือก = บันทึกของตนเอง</span></div>'
      +'<div id="wl-pt-selected" class="wl-pk-sel">'+ptHtml+'</div>'
      +'<div class="wl-pk-col">'
        +'<div class="wl-pk-search"><input type="text" id="wl-pt-q" autocomplete="off" placeholder="🔍 ค้นหาชื่อ / ชื่อเล่น / แผนก..." oninput="window._wlStaffFilter(this.value)" onkeydown="window._wlPtKey(event)"></div>'
        +'<div id="wl-pt-sug" class="wlf-recents wl-pt-sug"></div>'
        +'<div id="wl-staff-list" class="wl-pk-body">'+staffListHtml+'<div class="wl-pk-empty" style="display:none;">ไม่พบรายชื่อ</div></div>'
      +'</div>'
    +'</div>'
  +'</div>';

  document.getElementById('m-worklog-body').innerHTML = html;
  _renderCatChips();
  _wlRem = wl && Array.isArray(wl.reminders) ? _remClean(wl.reminders) : null;
  _wlRemCfg = null;
  _renderRem();
  _wlAiSeq++;
  _wlCatTouched = !!wl; // แก้บันทึกเดิม = ไม่เดาหมวดทับ
  _wlAiOrig = null; _wlDetailOrig = null; _wlAiDone = null;
  _wlRenderPtSug();
  var delBtn = document.getElementById('m-worklog-del');
  var myUid2 = window.cu ? window.cu.id : '';
  var isCreator = wl && (wl.uid === myUid2);
  // Delete button: visible only for creator or users with canDel permission
  if(delBtn) delBtn.style.display = (wl && (isCreator || window.canDel('worklog'))) ? '' : 'none';
  // "บันทึกแล้วเพิ่มงานถัดไปต่อ" มีเฉพาะตอนเพิ่มใหม่
  var keepWrap = document.getElementById('m-worklog-keep');
  if(keepWrap) keepWrap.style.display = wl ? 'none' : '';
  var keepCb = document.getElementById('wlf-keep');
  if(keepCb) keepCb.checked = _keepGet();
  window.openM('m-worklog');
  setTimeout(function(){ var t = document.getElementById('wlf-title'); if(t) t.focus(); }, 60);
};

// ── TOGGLE HELPERS ──
window._wlMultiToggle = function(on){
  var w = document.getElementById('wlf-end-wrap');
  var f = document.getElementById('wlf-date'), e = document.getElementById('wlf-end');
  if(w) w.style.display = on ? '' : 'none';
  if(on && f && e && (!e.value || e.value < f.value)) e.value = f.value;
  var sec = document.getElementById('wl-pt-section');
  if(sec) sec.classList.toggle('multi', on);
  var form = document.querySelector('#m-worklog-body .wlf');
  if(form) form.classList.toggle('multi', on);
  _wlPtSyncDates();
};

// ── หมวดงาน: ปุ่มเลือก + ตั้งค่า ──
function _canCfgCats(){ return !!((window.canEdit && window.canEdit('worklog')) || (window.isAdmin && window.isAdmin())); }

function _renderCatChips(){
  var box = document.getElementById('wlf-cats');
  if(!box) return;
  var h = document.getElementById('wlf-cat');
  var cur = h ? h.value : '';
  // หมวดที่ซ่อนแล้วยังแสดงถ้าเป็นหมวดของบันทึกที่กำลังแก้
  var list = WL_CATS.filter(function(c){ return !c.hidden || c.id===cur; });
  if(h && !list.some(function(c){ return c.id===cur; }) && list.length){ cur = list[0].id; h.value = cur; }
  box.innerHTML = '<select class="f-input" id="wlf-cat-sel" onchange="window._wlCatPick(this.value)">'
    +list.map(function(c){
      return '<option value="'+window.esc(c.id)+'"'+(c.id===cur?' selected':'')+'>'+window.esc(c.emoji+' '+c.label)+'</option>';
    }).join('')
  +'</select>'
  +'<span class="wlf-cat-sug" id="wlf-cat-sug" style="display:none;">แนะนำ</span>';
}

function _catEditRow(c){
  return '<div class="wlf-ce-row" data-id="'+window.esc(c?c.id:'')+'">'
    +'<input type="text" class="f-input wlf-ce-emo" maxlength="4" value="'+window.esc(c?c.emoji:'📌')+'" aria-label="ไอคอน">'
    +'<input type="text" class="f-input wlf-ce-lbl" value="'+window.esc(c?c.label:'')+'" placeholder="ชื่อหมวด" aria-label="ชื่อหมวด">'
    +'<button type="button" class="wlf-ce-ico" title="เลื่อนขึ้น" aria-label="เลื่อนขึ้น" onclick="var r=this.parentNode;if(r.previousElementSibling)r.parentNode.insertBefore(r,r.previousElementSibling);">↑</button>'
    +'<button type="button" class="wlf-ce-ico" title="ซ่อนหมวดนี้" aria-label="ลบหมวด" onclick="this.parentNode.remove()">✕</button>'
  +'</div>';
}

window._wlCatEdit = function(on){
  var ed = document.getElementById('wlf-cat-edit'), box = document.getElementById('wlf-cats');
  var cfg = document.getElementById('wlf-cat-cfg');
  if(!ed || !box) return;
  if(on){
    ed.innerHTML = '<div id="wlf-ce-rows">'+WL_CATS.filter(function(c){ return !c.hidden; }).map(_catEditRow).join('')+'</div>'
      +'<div class="wlf-ce-foot">'
        +'<button type="button" class="wlf-link" onclick="var w=document.getElementById(\'wlf-ce-rows\');w.insertAdjacentHTML(\'beforeend\',window._wlCatRowHtml());w.lastElementChild.querySelector(\'.wlf-ce-lbl\').focus();">+ เพิ่มหมวด</button>'
        +'<span class="wlf-ce-note">ลบหมวด = ซ่อนจากตัวเลือก บันทึกเดิมยังแสดงชื่อหมวดเดิม</span>'
        +'<button type="button" class="btn btn-ghost btn-sm" onclick="window._wlCatEdit(false)">ยกเลิก</button>'
        +'<button type="button" class="btn btn-pri btn-sm" onclick="window._wlCatSave()">บันทึกหมวด</button>'
      +'</div>';
  } else {
    ed.innerHTML = '';
    _renderCatChips();
  }
  ed.style.display = on ? '' : 'none';
  box.style.display = on ? 'none' : '';
  if(cfg) cfg.style.display = on ? 'none' : '';
};
window._wlCatRowHtml = function(){ return _catEditRow(null); };

window._wlCatSave = async function(){
  if(!_canCfgCats()){ window.showAlert&&window.showAlert('คุณไม่มีสิทธิ์ตั้งค่าหมวดงาน','warn'); return; }
  var list = [], seen = {}, dup = '';
  document.querySelectorAll('#wlf-ce-rows .wlf-ce-row').forEach(function(r){
    var label = r.querySelector('.wlf-ce-lbl').value.trim();
    if(!label) return; // ชื่อว่าง = ไม่เอา (หมวดเดิมจะถูกซ่อน)
    if(seen[label]) dup = label;
    seen[label] = 1;
    list.push({ id: r.getAttribute('data-id') || ('c_'+window.uid()), emoji: r.querySelector('.wlf-ce-emo').value.trim()||'📌', label: label });
  });
  if(dup){ window.showAlert&&window.showAlert('ชื่อหมวดซ้ำ: '+dup,'error'); return; }
  if(!list.length){ window.showAlert&&window.showAlert('ต้องมีอย่างน้อย 1 หมวด','error'); return; }
  // หมวดที่เอาออก → เก็บไว้แบบซ่อน (บันทึกเก่ายังอ้างรหัสนี้อยู่)
  WL_CATS.forEach(function(c){
    if(!list.some(function(x){ return x.id===c.id; })) list.push({ id:c.id, emoji:c.emoji, label:c.label, hidden:true });
  });
  try {
    await window.setDoc(window.getDocRef('SETTINGS','app'), { worklog_categories: list }, { merge:true });
    window.wlApplyCats(list);
    window._wlCatEdit(false);
    window.renderWorkLog && window.renderWorkLog();
    window.showAlert&&window.showAlert('บันทึกหมวดงานแล้ว','success');
  } catch(err){
    window.showAlert&&window.showAlert('เกิดข้อผิดพลาด: '+err.message,'error');
  }
};

// auto = ระบบ/AI เลือกให้ (ป้าย "แนะนำ") · ผู้ใช้กดเอง = หยุดเดาหมวดให้
window._wlCatPick = function(cid, auto){
  if(!auto) _wlCatTouched = true;
  var h = document.getElementById('wlf-cat');
  if(h) h.value = cid;
  var sel = document.getElementById('wlf-cat-sel');
  if(sel) sel.value = cid;
  var sug = document.getElementById('wlf-cat-sug');
  if(sug) sug.style.display = auto ? '' : 'none';
};

window._wlLocToggle = function(lid){
  document.querySelectorAll('.wl-loc-btn').forEach(function(b){
    var on = b.getAttribute('data-lid')===lid;
    b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
  });
  var dw = document.getElementById('wl-dest-wrap');
  if(dw) dw.style.display = lid==='local' ? 'none' : '';
};

// ── เตือนก่อนเริ่ม: ป้ายรอบเตือน (✕ ลบ) + ปุ่มลัด + ตั้งเอง (ตัวเลข + วัน/ชม./นาที) ──
// _wlRemCfg != null = กำลังแก้ "ค่าเริ่มต้นของทั้งระบบ" (ผู้มีสิทธิ์แก้ไขบันทึกงาน) แทนค่าของงานนี้
var _wlRem = null, _wlRemCfg = null;

function _remCur(){ return _wlRemCfg ? _wlRemCfg : (_wlRem===null ? window.wlRemDefault() : _wlRem); }
function _remSet(list){
  list = _remClean(list);
  if(_wlRemCfg) _wlRemCfg = list; else _wlRem = list;
  _renderRem();
}

function _renderRem(){
  var box = document.getElementById('wlf-rem');
  if(!box) return;
  var t1 = (document.getElementById('wlf-t1')||{}).value||'';
  if(!t1 && !_wlRemCfg){
    box.innerHTML = '<div class="wlf-rem-hint">🔔 ใส่เวลาเริ่ม เพื่อให้ระบบเตือนผู้ร่วมงานก่อนถึงเวลา (มีเสียงอ่านเตือน)</div>';
    return;
  }
  var cfg = !!_wlRemCfg, cur = _remCur(), off = !cfg && _wlRem!==null && !_wlRem.length;
  var h = '<div class="wlf-lbl-row"><label class="f-label">'+(cfg ? '⚙ ค่าเริ่มต้นการเตือน (ทั้งระบบ)' : '🔔 เตือนก่อนเริ่ม')+'</label>'
    +(!cfg && _canCfgCats() ? '<button type="button" class="wlf-link" onclick="window._wlRemCfgEdit(true)">⚙ ค่าเริ่มต้น</button>' : '')
    +'</div>';
  h += '<div class="wlf-rem-row">';
  if(off) h += '<span class="wlf-rem-off">🔕 ไม่เตือน</span>';
  else {
    h += cur.map(function(m){
      return '<span class="wlf-chip on wlf-rem-chip">'+window.esc(window.wlRemLabel(m))
        +'<button type="button" onclick="window._wlRemDel('+m+')" aria-label="ลบรอบเตือน '+window.esc(window.wlRemLabel(m))+'" title="ลบ">✕</button></span>';
    }).join('');
    if(cur.length < WL_REM_LIMIT){
      h += WL_REM_QUICK.filter(function(m){ return cur.indexOf(m)<0; }).map(function(m){
        return '<button type="button" class="wlf-recent" onclick="window._wlRemAdd('+m+')">+ '+window.esc(window.wlRemLabel(m))+'</button>';
      }).join('');
    }
  }
  h += '</div>';
  if(!off && cur.length < WL_REM_LIMIT){
    h += '<div class="wlf-rem-own">'
      +'<span>ตั้งเอง:</span>'
      +'<input type="number" class="f-input" id="wlf-rem-n" min="1" max="999" inputmode="numeric" placeholder="2" aria-label="จำนวน" onkeydown="if(event.key===\'Enter\'){event.preventDefault();window._wlRemAddOwn();}">'
      +'<select class="f-input" id="wlf-rem-u" aria-label="หน่วย"><option value="1440">วัน</option><option value="60" selected>ชม.</option><option value="1">นาที</option></select>'
      +'<button type="button" class="wlf-link" onclick="window._wlRemAddOwn()">+ เพิ่ม</button>'
    +'</div>';
  }
  if(cfg){
    h += '<div class="wlf-ce-foot"><span class="wlf-ce-note">ใช้กับงานที่ไม่ได้ตั้งเตือนเอง · งานที่ตั้งเองแล้วไม่เปลี่ยน</span>'
      +'<button type="button" class="btn btn-ghost btn-sm" onclick="window._wlRemCfgEdit(false)">ยกเลิก</button>'
      +'<button type="button" class="btn btn-pri btn-sm" onclick="window._wlRemCfgSave()">บันทึกค่าเริ่มต้น</button></div>';
  } else {
    h += '<div class="wlf-rem-note">'
      +'<label class="wlf-check"><input type="checkbox"'+(off?' checked':'')+' onchange="window._wlRemOff(this.checked)">ไม่ต้องเตือน</label>'
      +'<span>'+(_wlRem===null ? 'ใช้ค่าเริ่มต้นของระบบ' : 'ตั้งเฉพาะงานนี้ · <button type="button" class="wlf-link" onclick="window._wlRemReset()">↩ ใช้ค่าเริ่มต้น</button>')
      +' · เตือนผู้ร่วมงานทุกคน (ไม่เลือก = ตัวคุณเอง) พร้อมเสียงอ่าน · ปิดหน้าเว็บอยู่ ต้องเปิด 📳 แจ้งเตือนที่กระดิ่งก่อน</span>'
    +'</div>';
  }
  box.innerHTML = h;
  box.classList.toggle('cfg', cfg);
}

window._wlTimeChange = function(){
  var t1 = document.getElementById('wlf-t1'), t2 = document.getElementById('wlf-t2');
  // เลื่อนเวลาเริ่มเลยเวลาเลิก → ล้างเวลาเลิก
  if(t1 && t2 && t1.value && t2.value && t2.value <= t1.value) t2.value = '';
  _renderRem();
};
window._wlRemAdd = function(m){ var c = _remCur().slice(); c.push(m); _remSet(c); };
window._wlRemDel = function(m){ _remSet(_remCur().filter(function(x){ return x!==m; })); };
window._wlRemAddOwn = function(){
  var n = parseInt((document.getElementById('wlf-rem-n')||{}).value, 10);
  var u = parseInt((document.getElementById('wlf-rem-u')||{}).value, 10) || 60;
  if(!(n>=1)){ window.showAlert&&window.showAlert('ใส่จำนวนก่อน เช่น 2 ชม.','warn'); return; }
  if(n*u > WL_REM_MAX){ window.showAlert&&window.showAlert('ตั้งเตือนล่วงหน้าได้ไม่เกิน 14 วัน','warn'); return; }
  window._wlRemAdd(n*u);
};
window._wlRemOff = function(on){ _wlRem = on ? [] : null; _renderRem(); };
window._wlRemReset = function(){ _wlRem = null; _renderRem(); };
window._wlRemCfgEdit = function(on){ _wlRemCfg = on ? window.wlRemDefault() : null; _renderRem(); };
window._wlRemCfgSave = async function(){
  if(!_canCfgCats()){ window.showAlert&&window.showAlert('คุณไม่มีสิทธิ์ตั้งค่าเริ่มต้นการเตือน','warn'); return; }
  var list = _remClean(_wlRemCfg);
  try {
    await window.setDoc(window.getDocRef('SETTINGS','app'), { worklog_reminders: list }, { merge:true });
    window.WL_REMIND_CFG = list;
    _wlRemCfg = null; _renderRem();
    window.showAlert&&window.showAlert(list.length ? 'บันทึกค่าเริ่มต้นแล้ว: เตือนก่อน '+list.map(window.wlRemLabel).join(', ') : 'บันทึกแล้ว: ค่าเริ่มต้น = ไม่เตือน','success');
  } catch(err){
    window.showAlert&&window.showAlert('เกิดข้อผิดพลาด: '+err.message,'error');
  }
};

window._wlUseRecent = function(i){
  var w = _wlRecents[i];
  if(!w) return;
  var t = document.getElementById('wlf-title');
  if(t){ t.value = w.title; t.focus(); }
  _wlAiDone = w.title.trim(); // ครบแล้ว Enter = บันทึกเลย
  window._wlCatPick(w.category||'other');
  window._wlLocToggle(w.locationType||'local');
  var dest = document.getElementById('wlf-dest');
  if(dest) dest.value = w.destination||'';
};

window._wlAutoEndDate = function(){
  var s = document.getElementById('wlf-date');
  var e = document.getElementById('wlf-end');
  if(s && e && (!e.value || e.value < s.value)) e.value = s.value;
  _wlPtSyncDates();
};

// ── PARTICIPANT PICKER — ล่าง: รายชื่อทั้งหมด (แตะเพื่อเพิ่ม/เอาออก) · บน: ผู้เข้าร่วมที่เลือก ──
function _wlRange(){
  var s = (document.getElementById('wlf-date')||{}).value||'';
  var multi = !!(document.getElementById('wlf-multi')||{}).checked;
  return { s:s, e: multi ? ((document.getElementById('wlf-end')||{}).value||s) : s };
}

// แถวที่ยังไม่ได้แก้วันเอง → ตามวันของงาน
function _wlPtSyncDates(){
  var r = _wlRange();
  document.querySelectorAll('#wl-pt-selected .wl-prow:not(.custom)').forEach(function(row){
    var a = row.querySelector('.wl-mem-s'), b = row.querySelector('.wl-mem-e');
    a.value = r.s; b.value = r.e; window.beDateSync(a); window.beDateSync(b);
  });
}

function _wlPtMark(sid, on){
  var it = document.querySelector('#wl-staff-list .wl-pk-item[data-sid="'+sid+'"]');
  if(it) it.classList.toggle('on', on);
}

window._wlTogglePt = function(sid){
  var sel = document.getElementById('wl-pt-selected');
  if(!sel) return;
  var row = sel.querySelector('.wl-prow[data-sid="'+sid+'"]');
  if(row) row.remove();
  else {
    var r = _wlRange();
    var tmp = document.createElement('div'); tmp.innerHTML = _ptRow(sid, r.s, r.e, false);
    var nr = tmp.firstElementChild;
    window.insertByStaffRank(sel, nr); // แทรกตามลำดับตำแหน่ง
    nr.scrollIntoView({block:'nearest'});
  }
  _wlPtMark(sid, !row);
  window._wlUpdatePtCnt();
};

window._wlRemovePt = function(btn){
  var row = btn.closest('.wl-prow');
  _wlPtMark(row.getAttribute('data-sid'), false);
  row.remove();
  window._wlUpdatePtCnt();
};

window._wlPtDateSet = function(inp){
  var row = inp.closest('.wl-prow');
  var a = row.querySelector('.wl-mem-s'), b = row.querySelector('.wl-mem-e');
  if(a.value && b.value && b.value < a.value){ b.value = a.value; window.beDateSync(b); }
  row.classList.add('custom');
};

// Enter = เพิ่มคนแรกที่ค้นเจอ · Esc = ล้างคำค้น
window._wlPtKey = function(ev){
  if(ev.isComposing) return;
  if(ev.key==='Escape' && ev.target.value){ ev.stopPropagation(); ev.target.value = ''; window._wlStaffFilter(''); return; }
  if(ev.key!=='Enter') return;
  ev.preventDefault();
  if(!ev.target.value.trim()) return;
  var first = Array.prototype.find.call(document.querySelectorAll('#wl-staff-list .wl-pk-item:not(.on)'), function(it){ return it.style.display!=='none'; });
  if(!first) return;
  window._wlTogglePt(first.getAttribute('data-sid'));
  ev.target.value = ''; window._wlStaffFilter('');
};

window._wlUpdatePtCnt = function(){
  var n  = document.querySelectorAll('#wl-pt-selected .wl-prow').length;
  var el = document.getElementById('wl-pt-cnt');
  if(el) el.textContent = n ? '('+n+')' : '';
  _wlRenderPtSug();
};

window._wlStaffFilter = function(q){
  var ql = (q||'').trim().toLowerCase();
  var hdr = null, hdrHas = false, any = false;
  Array.prototype.forEach.call((document.getElementById('wl-staff-list')||{children:[]}).children, function(el){
    if(el.classList.contains('wl-pk-dept')){
      if(hdr) hdr.style.display = hdrHas ? '' : 'none';
      hdr = el; hdrHas = false;
    } else if(el.classList.contains('wl-pk-item')){
      var show = !ql || el.getAttribute('data-q').includes(ql);
      el.style.display = show ? '' : 'none';
      if(show){ hdrHas = true; any = true; }
    }
  });
  if(hdr) hdr.style.display = hdrHas ? '' : 'none';
  var emp = document.querySelector('#wl-staff-list .wl-pk-empty');
  if(emp) emp.style.display = any ? 'none' : '';
};

// ── ตัวช่วยกรอก ──
// ไม่เรียก AI: เดาหมวดจากชื่องาน · แนะนำผู้เข้าร่วมจากประวัติ
// เรียก AI: แยกประโยคเป็นช่องต่าง ๆ (✨ AI กรอกให้) · เรียบเรียงรายละเอียด (✨ เรียบเรียง)
var _wlAiSeq = 0;          // เปิดหน้าต่างใหม่ = ทิ้งคำตอบ AI ที่ค้างอยู่
var _wlCatTouched = false; // ผู้ใช้เลือกหมวดเองแล้ว → ไม่เดาทับ
var _wlTitleTimer = null;
var _wlAiOrig = null;      // ข้อความในช่องชื่องานก่อน AI แยก (ปุ่มคืนข้อความเดิม)
var _wlAiDone = null;      // ชื่องานที่ AI กรอกแล้ว/ไม่ต้องผ่าน AI → กด Enter = บันทึก
var _wlDetailOrig = null;  // รายละเอียดก่อน AI เรียบเรียง (ปุ่มย้อนกลับ)
var WL_THDAY = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

function _wlVisCats(){ return WL_CATS.filter(function(c){ return !c.hidden; }); }
function _wlPicked(){
  var m = {};
  document.querySelectorAll('#wl-pt-selected .wl-prow').forEach(function(r){ m[r.getAttribute('data-sid')] = 1; });
  return m;
}

// เพิ่มใหม่: Enter ครั้งแรก = ให้ AI กรอกจากประโยค · Enter อีกครั้ง (ข้อความไม่เปลี่ยน) = บันทึก
// Ctrl/⌘+Enter = บันทึกทันทีไม่ผ่าน AI · แก้บันทึกเดิม: Enter = บันทึก
window._wlTitleKey = function(ev){
  if(ev.key!=='Enter' || ev.isComposing) return;
  ev.preventDefault();
  var v = ev.target.value.trim();
  if(ev.ctrlKey || ev.metaKey || _wlEditId || !v || v===_wlAiDone) window.saveWorkLog();
  else window._wlAiFill();
};

window._wlTitleInput = function(){
  clearTimeout(_wlTitleTimer);
  _wlTitleTimer = setTimeout(function(){ _wlGuessCat(); _wlRenderPtSug(); }, 250);
};

// เดาหมวด: งานเก่าที่ชื่อคล้ายที่สุด (ของตัวเองได้คะแนนเพิ่ม) → ไม่มี ค่อยดูว่าชื่อหมวดอยู่ในชื่องานไหม
function _wlGuessCat(){
  if(_wlCatTouched) return;
  var t = ((document.getElementById('wlf-title')||{}).value||'').trim();
  if(t.length < 3) return;
  var vis = _wlVisCats(), ok = {};
  vis.forEach(function(c){ ok[c.id] = 1; });
  var myUid = window.cu ? window.cu.id : '', cid = '', best = 0;
  (window.WORK_LOGS||[]).forEach(function(w){
    if(!w.title || !ok[w.category]) return;
    var s = window.aiTextSim(t, w.title) + (w.uid===myUid ? 0.05 : 0);
    if(s > best){ best = s; cid = w.category; }
  });
  if(best < 0.55) cid = '';
  if(!cid){
    var tl = t.toLowerCase();
    vis.some(function(c){
      return c.label.split('/').some(function(p){
        p = p.trim().toLowerCase();
        if(p.length >= 3 && tl.indexOf(p) >= 0){ cid = c.id; return true; }
        return false;
      });
    });
  }
  if(cid) window._wlCatPick(cid, true);
}

// แนะนำผู้เข้าร่วม: คนที่อยู่ในงานชื่อ/ปลายทางคล้ายกัน + คนที่ไปงานกับฉันบ่อยใน 180 วันล่าสุด
function _wlPtSuggest(){
  var mySid = _curStaffId(), myUid = window.cu ? window.cu.id : '';
  var t = ((document.getElementById('wlf-title')||{}).value||'').trim();
  var picked = _wlPicked(), score = {};
  var cut = new Date(); cut.setDate(cut.getDate()-180); cut = window.ymd(cut);
  (window.WORK_LOGS||[]).forEach(function(w){
    var pts = (w.participants||[]).map(function(p){ return p.sid; });
    if(!pts.length) return;
    var wgt = 0;
    if(t.length >= 3){
      var sim = window.aiTextSim(t, (w.title||'')+' '+(w.destination||''));
      if(sim >= 0.35) wgt += sim*3;
    }
    var d = w.date || w.startDate || '';
    if(d >= cut && (w.uid===myUid || pts.indexOf(mySid) >= 0)) wgt += 0.3;
    if(!wgt) return;
    pts.forEach(function(sid){ if(sid!==mySid && !picked[sid]) score[sid] = (score[sid]||0) + wgt; });
  });
  var byId = {};
  (window.STAFF||[]).forEach(function(s){ if(s.active!==false && !byId[s.id]) byId[s.id] = s; });
  return Object.keys(score).filter(function(sid){ return byId[sid]; })
    .sort(function(a,b){ return score[b]-score[a]; })
    .slice(0,6).map(function(sid){ return byId[sid]; });
}

function _wlRenderPtSug(){
  var box = document.getElementById('wl-pt-sug');
  if(!box) return;
  var list = _wlPtSuggest();
  box.style.display = list.length ? '' : 'none';
  box.innerHTML = list.length ? '<span>แนะนำ:</span>'+list.map(function(s){
    return '<button type="button" class="wlf-recent" data-sid="'+window.esc(s.id)+'" onclick="window._wlTogglePt(this.getAttribute(\'data-sid\'))" title="'+window.esc(s.name)+'">+ '+window.esc(s.nickname||s.name.split(' ')[0])+'</button>';
  }).join('') : '';
}

// จับคู่ชื่อที่ AI อ่านได้กับพนักงาน — ตรงชื่อเล่น/ชื่อจริงก่อน แล้วค่อยขึ้นต้นด้วย · เจอหลายคนเท่ากัน = ไม่เดา
// ไม่สนวรรณยุกต์/การันต์ (ฟลุ๊ค = ฟลุ้ค)
function _wlNormName(s){
  return String(s||'').toLowerCase().replace(/^(นางสาว|น\.ส\.|นาย|นาง|คุณ|พี่|น้อง)\s*/,'').replace(/[\s่-์]+/g,'');
}
function _wlMatchStaff(name){
  var n = _wlNormName(name);
  if(!n) return null;
  var act = (window.STAFF||[]).filter(function(s){ return s.active!==false; });
  var tests = [
    function(s){ return _wlNormName(s.nickname)===n; },
    function(s){ return _wlNormName(s.name.split(' ')[0])===n || _wlNormName(s.name)===n; },
    function(s){ return (s.nickname && _wlNormName(s.nickname).indexOf(n)===0) || _wlNormName(s.name).indexOf(n)===0; },
  ];
  for(var i=0; i<tests.length; i++){
    var hit = act.filter(tests[i]);
    if(hit.length===1) return hit[0];
    if(hit.length>1) return null;
  }
  return null;
}

function _wlAiNote(html, warn){
  var el = document.getElementById('wlf-ai-note');
  if(!el) return;
  el.innerHTML = html;
  el.style.display = html ? '' : 'none';
  el.classList.toggle('warn', !!warn);
}

function _wlFixDate(v){
  var m = String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return '';
  var y = +m[1]; if(y > 2400) y -= 543; // ปี พ.ศ.
  var d = y+'-'+m[2]+'-'+m[3];
  return isNaN(new Date(d)) ? '' : d;
}

// "9:00" / "13.30" → "09:00" / "13:30" · อ่านไม่ได้ = ''
function _wlFixTime(v){
  var m = String(v||'').trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if(!m) return '';
  var t = ('0'+m[1]).slice(-2)+':'+m[2];
  return WL_TIME_RE.test(t) ? t : '';
}

// ✨ AI กรอกให้ — พิมพ์ประโยคเดียวในช่องชื่องาน แล้วแยกเป็นชื่องาน วันที่ หมวด สถานที่ ผู้เข้าร่วม รายละเอียด
window._wlAiFill = async function(){
  var t = document.getElementById('wlf-title'), btn = document.getElementById('wlf-ai-fill');
  if(!t || !btn || btn.disabled) return;
  var text = t.value.trim();
  if(!text){
    window.showAlert&&window.showAlert('พิมพ์งานเป็นประโยคในช่องชื่องานก่อน เช่น “13-15 ต.ค. ลงพื้นที่ติดตั้ง รพ.ขอนแก่น กับเอี้ยม เต้ย”','warn');
    t.focus(); return;
  }
  var seq = _wlAiSeq;
  // ลิงก์ประชุมแยกออกก่อน (ลิงก์ยาว ส่งให้ AI แล้วมักคัดลอกผิด)
  var urlHit = text.match(/https?:\/\/[^\s]+/i);
  var aiText = urlHit ? text.replace(urlHit[0], ' ').replace(/\s+/g, ' ').trim() : text;
  var today = window.todayStr(), base = window.pd(today), cal = [];
  for(var i=-7; i<=21; i++){
    var d = new Date(base); d.setDate(d.getDate()+i);
    cal.push(window.ymd(d)+' วัน'+WL_THDAY[d.getDay()]+(i===0?' (วันนี้)':''));
  }
  var cats = _wlVisCats().map(function(c){ return '- '+c.id+': '+c.label; }).join('\n');
  var sys = 'คุณแปลงข้อความบันทึกงานภาษาไทยเป็น JSON ตอบเป็น JSON อย่างเดียว ไม่มีคำอธิบาย\n'
    +'รูปแบบ: {"title":"","category":"","location":"local","destination":"","start":"YYYY-MM-DD","end":"YYYY-MM-DD","time_start":"","time_end":"","detail":"","people":[]}\n'
    +'กติกา:\n'
    +'- title: ชื่องานสั้น กระชับ ไม่ใส่วันที่และชื่อคน\n'
    +'- category: id จากรายการหมวดเท่านั้น เลือกที่ตรงที่สุด\n'
    +'- location: local = ในพื้นที่/ที่ออฟฟิศ/ออนไลน์ · upcountry = ต่างจังหวัด · overseas = ต่างประเทศ\n'
    +'- destination: จังหวัด/สถานที่/ประเทศปลายทาง ถ้าไม่ได้ระบุ = ""\n'
    +'- start, end: ปี ค.ศ. ดูวันจากปฏิทินที่ให้ (พรุ่งนี้, จันทร์หน้า, 13-15 ต.ค.) · ไม่ระบุวัน = วันนี้ · งานวันเดียว end = start\n'
    +'- time_start, time_end: เวลาแบบ 24 ชม. "HH:MM" เช่น บ่ายโมงครึ่ง = "13:30", 9 โมง = "09:00", ทุ่มนึง = "19:00" · ไม่ระบุเวลา = ""\n'
    +'- people: ชื่อหรือชื่อเล่นของคนที่ร่วมงานตามที่เขียนไว้ ไม่รวมผู้เขียน (ผม/ฉัน/หนู) · ไม่มี = []\n'
    +'- detail: ข้อมูลอื่นที่ไม่อยู่ในช่องข้างบน ไม่มี = ""\n'
    +'ห้ามแต่งข้อมูลที่ไม่มีในข้อความ';
  var usr = 'ปฏิทิน:\n'+cal.join('\n')+'\n\nหมวดงาน:\n'+cats+'\n\nข้อความ: '+aiText;

  btn.disabled = true; btn.textContent = '⏳ AI กำลังอ่าน...';
  try {
    var r = await window.aiChatJson(sys, usr, { maxTokens:400, temperature:0, isStale:function(){ return seq!==_wlAiSeq; } });
    if(seq!==_wlAiSeq) return;
    var got = [];
    _wlAiOrig = text;
    if(r.title && String(r.title).trim()) t.value = String(r.title).trim();

    var s = _wlFixDate(r.start) || today, e = _wlFixDate(r.end) || s;
    if(e < s) e = s;
    var multi = e > s;
    document.getElementById('wlf-date').value = s;
    var endEl = document.getElementById('wlf-end');
    if(endEl) endEl.value = e;
    var mc = document.getElementById('wlf-multi');
    if(mc) mc.checked = multi;
    window._wlMultiToggle(multi);
    got.push(multi ? 'วันที่ '+window.fd(s)+' – '+window.fd(e) : 'วันที่ '+window.fd(s));

    var ts = _wlFixTime(r.time_start), te = _wlFixTime(r.time_end);
    if(ts){
      document.getElementById('wlf-t1').value = ts;
      document.getElementById('wlf-t2').value = te && te > ts ? te : '';
      window._wlTimeChange();
      got.push('เวลา '+ts+(te && te > ts ? '–'+te : '')+' น.');
    }
    var urlEl = document.getElementById('wlf-url');
    if(urlHit && urlEl){ urlEl.value = urlHit[0].replace(/[)\].,]+$/, ''); got.push('ลิงก์ประชุม'); }

    if(_wlVisCats().some(function(c){ return c.id===r.category; })){
      window._wlCatPick(r.category, true);
      _wlCatTouched = true;
      got.push('หมวด');
    }
    var loc = WL_LOCS.some(function(l){ return l.id===r.location; }) ? r.location : 'local';
    window._wlLocToggle(loc);
    var dest = document.getElementById('wlf-dest');
    if(dest && loc!=='local' && r.destination) dest.value = String(r.destination).trim();
    got.push('สถานที่');

    var det = document.getElementById('wlf-detail');
    if(det && !det.value.trim() && r.detail && String(r.detail).trim()){ det.value = String(r.detail).trim(); got.push('รายละเอียด'); }

    var mySid = _curStaffId(), added = 0, miss = [], picked = _wlPicked();
    (Array.isArray(r.people) ? r.people : []).forEach(function(nm){
      var st = _wlMatchStaff(nm);
      if(!st){ if(String(nm||'').trim()) miss.push(String(nm).trim()); return; }
      if(st.id===mySid || picked[st.id]) return;
      window._wlTogglePt(st.id); picked[st.id] = 1; added++;
    });
    if(added) got.push('ผู้เข้าร่วม '+added+' คน');

    _wlAiNote('🤖 AI เติมให้แล้ว: '+window.esc(got.join(' · '))+' — ตรวจแล้วกด Enter อีกครั้งเพื่อบันทึก'
      +(miss.length ? '<br>⚠ ไม่พบชื่อ: '+window.esc(miss.join(', '))+' — เลือกจากรายชื่อทางขวาเอง' : '')
      +' <button type="button" class="wlf-link" onclick="window._wlAiUndo()">↩ คืนข้อความเดิม</button>', miss.length > 0);
    _wlAiDone = t.value.trim();
    t.focus();
  } catch(err){
    if(err && err.cancelled) return;
    if(seq!==_wlAiSeq) return;
    _wlAiDone = text; // AI ใช้ไม่ได้ → Enter ถัดไปบันทึกตามที่พิมพ์ ไม่ติดวนเรียก AI
    window.showAlert&&window.showAlert(err.message+' — กด Enter อีกครั้งเพื่อบันทึกตามที่พิมพ์','error');
  } finally {
    if(seq===_wlAiSeq){ btn.disabled = false; btn.textContent = '✨ AI กรอกให้'; }
  }
};

window._wlAiUndo = function(){
  var t = document.getElementById('wlf-title');
  if(t && _wlAiOrig!=null){ t.value = _wlAiOrig; t.focus(); }
  _wlAiDone = _wlAiOrig; // เลือกใช้ข้อความเดิม → Enter = บันทึก ไม่ส่ง AI ซ้ำ
  _wlAiOrig = null;
  _wlAiNote('');
};

// ✨ เรียบเรียง — จดสั้น ๆ แล้วให้ AI เขียนเป็นข้อความทางการ · กดอีกครั้ง (↩ ย้อนกลับ) = คืนข้อความเดิม
window._wlAiDetail = async function(){
  var d = document.getElementById('wlf-detail'), btn = document.getElementById('wlf-ai-detail');
  if(!d || !btn || btn.disabled) return;
  if(_wlDetailOrig!=null){ d.value = _wlDetailOrig; window._wlDetailEdited(); d.focus(); return; }
  var text = d.value.trim();
  if(!text){ window.showAlert&&window.showAlert('จดรายละเอียดคร่าว ๆ ก่อน แล้วกด ✨ เรียบเรียง','warn'); d.focus(); return; }
  var seq = _wlAiSeq;
  var title = ((document.getElementById('wlf-title')||{}).value||'').trim();
  var cat = _cat((document.getElementById('wlf-cat')||{}).value).label;
  var sys = 'เรียบเรียงบันทึกรายละเอียดงานให้เป็นภาษาไทยทางการ กระชับ อ่านง่าย\n'
    +'- หลายเรื่อง ให้เขียนเป็นข้อ บรรทัดละข้อ ขึ้นต้นด้วย "- "\n'
    +'- คงข้อเท็จจริง ตัวเลข ชื่อคน ชื่อหน่วยงาน ชื่อระบบตามเดิม ห้ามเพิ่มข้อมูลที่ไม่มี\n'
    +'- ตอบเฉพาะเนื้อหาส่วนบันทึกที่เรียบเรียงแล้ว ไม่ต้องใส่ชื่องาน/หมวด ไม่มีคำนำ ไม่ใช้ markdown';
  btn.disabled = true; btn.textContent = '⏳ กำลังเรียบเรียง...';
  try {
    var out = await window.aiChat(sys, 'ชื่องาน: '+(title||'-')+'\nหมวด: '+cat+'\nบันทึก:\n'+text,
      { maxTokens:600, temperature:0.2, isStale:function(){ return seq!==_wlAiSeq; } });
    if(seq!==_wlAiSeq) return;
    out = out.replace(/```[a-z]*\n?|```/gi,'').replace(/\*\*(.+?)\*\*/g,'$1')
      .replace(/^\s*(ชื่องาน|หมวด|บันทึก)\s*:.*$/gm,'').trim(); // บางครั้งทวนหัวข้อที่ส่งไปกลับมาด้วย
    if(!out) throw new Error('AI ไม่ได้ตอบกลับมา — ลองใหม่อีกครั้ง');
    _wlDetailOrig = d.value;
    d.value = out;
    d.rows = Math.min(8, Math.max(2, out.split('\n').length + 1));
  } catch(err){
    if(err && err.cancelled) return;
    if(seq===_wlAiSeq) window.showAlert&&window.showAlert(err.message,'error');
  } finally {
    if(seq===_wlAiSeq){ btn.disabled = false; btn.textContent = _wlDetailOrig!=null ? '↩ ย้อนกลับ' : '✨ เรียบเรียง'; }
  }
};

// ผู้ใช้แก้รายละเอียดเอง → ปุ่มกลับเป็น ✨ เรียบเรียง
window._wlDetailEdited = function(){
  if(_wlDetailOrig==null) return;
  _wlDetailOrig = null;
  var btn = document.getElementById('wlf-ai-detail');
  if(btn && !btn.disabled) btn.textContent = '✨ เรียบเรียง';
};

// ── SAVE ──
window.saveWorkLog = async function(){
  // Editing: must be creator OR have canEdit; Adding new: any logged-in user
  if (_wlEditId) {
    var existing = (window.WORK_LOGS||[]).find(function(w){ return w.id===_wlEditId; });
    var myUid3 = window.cu ? window.cu.id : '';
    if (existing && existing.uid !== myUid3 && !window.canEdit('worklog')) {
      window.showAlert&&window.showAlert('คุณไม่มีสิทธิ์แก้ไขบันทึกงานของผู้อื่น','warn'); return;
    }
  } else if (!window.cu) { return; }

  var titleEl = document.getElementById('wlf-title');
  var title   = titleEl ? titleEl.value.trim() : '';
  if(!title){ window.showAlert&&window.showAlert('กรุณาระบุชื่องาน','error'); return; }

  var locBtn= document.querySelector('.wl-loc-btn.on');

  var typeVal  = (document.getElementById('wlf-multi')||{}).checked ? 'period' : 'daily';
  var locVal   = locBtn ? locBtn.getAttribute('data-lid') : 'local';

  var dateVal  = (document.getElementById('wlf-date')||{}).value||'';
  var startVal = dateVal;
  var endVal   = (document.getElementById('wlf-end')||{}).value||'';
  if(!dateVal){ window.showAlert&&window.showAlert('กรุณาระบุวันที่','error'); return; }
  if(typeVal==='period' && (!endVal || endVal < startVal)) endVal = startVal;
  var totalDays= 1;
  if(typeVal==='period' && startVal && endVal){
    totalDays = Math.max(1, Math.round((new Date(endVal)-new Date(startVal))/86400000)+1);
  }

  var t1 = (document.getElementById('wlf-t1')||{}).value||'';
  var t2 = (document.getElementById('wlf-t2')||{}).value||'';
  if(t1 && !WL_TIME_RE.test(t1)){ window.showAlert&&window.showAlert('เวลาเริ่มไม่ถูกต้อง','error'); return; }
  if(!t1) t2 = '';
  if(t2 && (!WL_TIME_RE.test(t2) || t2 <= t1)){ window.showAlert&&window.showAlert('เวลาเลิกต้องหลังเวลาเริ่ม','error'); return; }
  var urlVal = ((document.getElementById('wlf-url')||{}).value||'').trim();
  if(urlVal && !/^https?:\/\//i.test(urlVal) && /^[\w-]+(\.[\w-]+)+/.test(urlVal)) urlVal = 'https://'+urlVal;
  if(urlVal && !_safeUrl(urlVal)){ window.showAlert&&window.showAlert('ลิงก์ประชุมไม่ถูกต้อง — วางลิงก์ที่ขึ้นต้นด้วย https://','error'); return; }
  if(_wlRemCfg){ window.showAlert&&window.showAlert('บันทึกหรือยกเลิกการแก้ค่าเริ่มต้นการเตือนก่อน','warn'); return; }

  var participants = [];
  document.querySelectorAll('#wl-pt-selected .wl-prow').forEach(function(r){
    var sid = r.getAttribute('data-sid');
    if(!sid) return;
    // งานวันเดียว = ใช้วันของงาน · งานหลายวัน = ช่วงวันรายคน (ว่าง = ช่วงของงาน)
    var ps = startVal, pe = typeVal==='period' ? endVal : startVal;
    if(typeVal==='period'){
      ps = r.querySelector('.wl-mem-s').value || startVal;
      pe = r.querySelector('.wl-mem-e').value || endVal;
      if(pe < ps) pe = ps;
    }
    participants.push({sid:sid, s:ps, e:pe});
  });

  var myStaffId = _curStaffId();
  var myUid     = window.cu ? window.cu.id : '';

  var data = {
    uid:           myUid,
    staff_id:      myStaffId,
    type:          typeVal,
    scope:         participants.length > 0 ? 'group' : 'personal',
    date:          typeVal==='daily' ? dateVal : '',
    start_date:    typeVal==='period' ? startVal : '',
    end_date:      typeVal==='period' ? endVal   : '',
    total_days:    totalDays,
    category:      (document.getElementById('wlf-cat')||{}).value||'other',
    location_type: locVal,
    destination:   (document.getElementById('wlf-dest')||{}).value||'',
    title:         title,
    detail:        (document.getElementById('wlf-detail')||{}).value||'',
    participants:  participants,
    start_time:    t1,
    end_time:      t2,
    meeting_url:   urlVal,
    reminders:     _wlRem,
  };
  if(!_wlEditId) data.created_at = new Date().toISOString();

  if(_wlSaving) return;
  _wlSaving = true;
  try {
    var docId = _wlEditId||window.uid();
    var ref = window.getDocRef('WORK_LOGS', docId);
    await window.setDoc(ref, data, {merge:true});
    window._applyLocalDoc('WORK_LOGS', docId, Object.assign({id:docId}, data));
    window.renderWorkLog&&window.renderWorkLog();
    var keep = !_wlEditId && (document.getElementById('wlf-keep')||{}).checked;
    if(keep){
      // เพิ่มงานถัดไปต่อ: ล้างชื่อ/รายละเอียด คงวันที่ หมวด สถานที่ ผู้เข้าร่วมไว้
      titleEl.value = '';
      var det = document.getElementById('wlf-detail'); if(det) det.value = '';
      var ue = document.getElementById('wlf-url'); if(ue) ue.value = '';
      window._wlDetailEdited(); _wlAiOrig = null; _wlAiDone = null; _wlAiNote('');
      var rw = document.getElementById('wlf-recents-wrap'); if(rw) rw.innerHTML = _recentsHtml();
      titleEl.focus();
      window.showAlert&&window.showAlert('บันทึก “'+title+'” แล้ว — พิมพ์งานถัดไปได้เลย','success');
    } else {
      window.closeM('m-worklog');
      window.showAlert&&window.showAlert('บันทึกเรียบร้อย','success');
    }
  } catch(err){
    window.showAlert&&window.showAlert('เกิดข้อผิดพลาด: '+err.message,'error');
  } finally {
    _wlSaving = false;
  }
};

// ── DELETE ──
window.deleteWorkLog = async function(){
  if(!_wlEditId) return;
  var existing2 = (window.WORK_LOGS||[]).find(function(w){ return w.id===_wlEditId; });
  var myUid4 = window.cu ? window.cu.id : '';
  if (existing2 && existing2.uid !== myUid4 && !window.canDel('worklog')) {
    window.showAlert&&window.showAlert('คุณไม่มีสิทธิ์ลบบันทึกงานของผู้อื่น','warn'); return;
  }
  if(!await window.confirmAsync('ต้องการลบบันทึกงานนี้?',{icon:'🗑️',title:'ลบบันทึกงาน'})) return;
  try {
    window._removeLocalDoc('WORK_LOGS', _wlEditId);
    window.renderWorkLog&&window.renderWorkLog();
    await window.deleteDoc(window.getDocRef('WORK_LOGS', _wlEditId));
    window.closeM('m-worklog');
    window.showAlert&&window.showAlert('ลบเรียบร้อย','success');
  } catch(err){
    window.showAlert&&window.showAlert('เกิดข้อผิดพลาด: '+err.message,'error');
  }
};

})();
