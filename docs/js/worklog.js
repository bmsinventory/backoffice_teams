// ── WORK LOG ──
(function(){
'use strict';

var _wlEditId = null;
var _wlFilter = 'mine';

const WL_CATS = [
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
window.WL_CATS = WL_CATS;

const WL_LOCS = [
  {id:'local',     emoji:'🏢', label:'ในพื้นที่'},
  {id:'upcountry', emoji:'🚗', label:'ต่างจังหวัด'},
  {id:'overseas',  emoji:'🌏', label:'ต่างประเทศ'},
];

function _cat(id){ return WL_CATS.find(function(c){return c.id===id;})||{emoji:'📌',label:id||'อื่นๆ'}; }
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

function _ptTag(sid, name, s, e){
  return '<div class="wl-ptag" data-sid="'+sid+'" data-s="'+s+'" data-e="'+e+'" style="display:flex;align-items:center;gap:5px;padding:5px 7px;border-radius:7px;background:var(--bg);border:1px solid var(--border);margin-bottom:4px;">'
    +'<span style="font-size:11px;font-weight:600;color:var(--txt);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+window.esc(name)+'</span>'
    +'<input type="date" class="wl-mem-s f-input" value="'+s+'" oninput="this.closest(\'.wl-ptag\').setAttribute(\'data-s\',this.value)" style="flex:1;padding:2px 4px;font-size:9px;height:22px;min-width:0;" title="วันเริ่ม">'
    +'<span style="font-size:9px;color:var(--txt-muted);">→</span>'
    +'<input type="date" class="wl-mem-e f-input" value="'+e+'" oninput="this.closest(\'.wl-ptag\').setAttribute(\'data-e\',this.value)" style="flex:1;padding:2px 4px;font-size:9px;height:22px;min-width:0;" title="วันสิ้นสุด">'
    +'<button type="button" onclick="this.closest(\'.wl-ptag\').remove();window._wlUpdatePtCnt()" style="background:none;border:none;color:var(--txt-muted);cursor:pointer;font-size:13px;padding:0 2px;flex-shrink:0;line-height:1;">✕</button>'
  +'</div>';
}

function _dateSectionHtml(type, wl, today){
  if(type==='daily'){
    return '<label class="f-label">วันที่</label>'
      +'<input type="date" class="f-input" id="wlf-date" value="'+(wl&&wl.date?wl.date:today)+'">';
  }
  return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
    +'<div><label class="f-label">วันที่เริ่ม</label><input type="date" class="f-input" id="wlf-start" value="'+(wl&&wl.startDate?wl.startDate:today)+'" onchange="window._wlAutoEndDate()"></div>'
    +'<div><label class="f-label">วันที่สิ้นสุด</label><input type="date" class="f-input" id="wlf-end" value="'+(wl&&wl.endDate?wl.endDate:today)+'"></div>'
    +'</div>';
}

// ── RENDER LIST ──
window.renderWorkLog = function(){
  var body = document.getElementById('wl-list');
  if(!body) return;

  var allLogs = window.WORK_LOGS || [];
  var mySid   = _curStaffId();
  var myUid   = window.cu ? window.cu.id : '';

  var logs = allLogs.filter(function(wl){
    if(_wlFilter === 'mine'){
      var isCreator = wl.uid === myUid || wl.staffId === mySid;
      var isParticipant = (wl.participants||[]).some(function(p){ return p.sid === mySid; });
      return isCreator || isParticipant;
    }
    return true;
  });

  var q = ((document.getElementById('wl-q')||{}).value||'').toLowerCase();
  if(q) logs = logs.filter(function(wl){
    return (wl.title||'').toLowerCase().includes(q)
        || _cat(wl.category).label.toLowerCase().includes(q)
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
  var THMON   = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

  var html = '';
  months.forEach(function(ym){
    var parts = ym.split('-');
    var mon   = THMON[parseInt(parts[1])-1] + ' ' + (parseInt(parts[0])+543);
    html += '<div style="font-size:10px;font-weight:700;color:var(--txt-muted);letter-spacing:.5px;padding:14px 0 6px;">'+mon+'</div>';

    groups[ym].forEach(function(wl){
      var cat  = _cat(wl.category);
      var loc  = _loc(wl.locationType);
      var isCreator = wl.uid === myUid;

      var ptNames = (wl.participants||[]).map(function(p){
        var st = (window.STAFF||[]).find(function(s){ return s.id===p.sid; });
        return st ? (st.nickname||st.name.split(' ')[0]) : '';
      }).filter(Boolean);

      var creator = (window.STAFF||[]).find(function(s){ return s.id===wl.staffId; });
      var creatorName = creator ? (creator.nickname||creator.name.split(' ')[0]) : '';

      var locBadge = wl.locationType!=='local'
        ? '<span style="font-size:9px;padding:2px 8px;border-radius:10px;background:var(--violet)18;color:var(--violet);white-space:nowrap;flex-shrink:0;">'+loc.emoji+' '+(wl.destination||loc.label)+'</span>'
        : '<span style="font-size:9px;padding:2px 8px;border-radius:10px;background:var(--border);color:var(--txt-muted);white-space:nowrap;flex-shrink:0;">'+loc.label+'</span>';

      html += '<div onclick="window.openWorkLogModal(\''+wl.id+'\')" '
        +'style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:8px;cursor:pointer;transition:background .12s;" '
        +'onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'var(--surface)\'">'
        +'<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:6px;">'
          +'<span style="font-size:22px;line-height:1;flex-shrink:0;">'+cat.emoji+'</span>'
          +'<div style="flex:1;min-width:0;">'
            +'<div style="font-size:13px;font-weight:700;color:var(--txt);line-height:1.3;">'+window.esc(wl.title)+'</div>'
            +'<div style="font-size:10px;color:var(--txt-muted);margin-top:2px;">'+cat.label+' · '+_wlDateLabel(wl)+'</div>'
          +'</div>'
          +locBadge
        +'</div>'
        +(ptNames.length
          ? '<div style="font-size:10px;color:var(--txt-muted);">👥 '+window.esc(ptNames.join(' · '))+'</div>'
          : (creatorName ? '<div style="font-size:10px;color:var(--txt-muted);">👤 '+window.esc(creatorName)+'</div>' : ''))
        +(wl.detail ? '<div style="font-size:10px;color:var(--txt-muted);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+window.esc(wl.detail)+'</div>' : '')
      +'</div>';
    });
  });

  body.innerHTML = html;
};

// ── FILTER TABS ──
window._wlSetFilter = function(f, el){
  _wlFilter = f;
  document.querySelectorAll('.wl-ftab').forEach(function(b){
    b.style.color = 'var(--txt-muted)';
    b.style.borderBottom = '2px solid transparent';
  });
  if(el){ el.style.color='var(--violet)'; el.style.borderBottom='2px solid var(--violet)'; }
  window.renderWorkLog();
};

// ── MODAL OPEN ──
window.openWorkLogModal = function(id){
  var wl = id ? (window.WORK_LOGS||[]).find(function(w){ return w.id===id; }) : null;
  _wlEditId = id||null;

  document.getElementById('m-worklog-title').textContent = wl ? 'แก้ไขบันทึกงาน' : 'เพิ่มบันทึกงาน';

  var today   = new Date().toISOString().slice(0,10);
  var type    = wl ? wl.type    : 'daily';
  var locType = wl ? (wl.locationType||'local') : 'local';
  var parts   = wl ? (wl.participants||[]) : [];

  var catOpts = WL_CATS.map(function(c){
    var sel = (wl&&wl.category===c.id)||(!wl&&c.id==='meeting') ? ' selected' : '';
    return '<option value="'+c.id+'"'+sel+'>'+c.emoji+' '+c.label+'</option>';
  }).join('');

  var ptHtml = parts.map(function(p){
    var st = (window.STAFF||[]).find(function(s){ return s.id===p.sid; });
    return _ptTag(p.sid, st?(st.nickname||st.name):p.sid, p.s||'', p.e||'');
  }).join('');

  // Flat staff list (no dept grouping)
  var activeStaff = (window.STAFF||[]).filter(function(s){ return s.active!==false; })
    .sort(function(a,b){ return (a.nickname||a.name).localeCompare(b.nickname||b.name,'th'); });

  var staffListHtml = activeStaff.map(function(s){
    var nm = s.nickname||s.name;
    return '<div class="wl-staff-item" data-sid="'+s.id+'" data-nm="'+window.esc(nm.toLowerCase())+'" '
      +'onclick="window._wlAddPt(\''+s.id+'\')" '
      +'style="padding:6px 10px;cursor:pointer;border-radius:6px;font-size:12px;color:var(--txt);transition:background .1s;display:flex;align-items:center;gap:6px;" '
      +'onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\'">'
      +'<span style="width:22px;height:22px;border-radius:50%;background:'+window.avC((window.STAFF||[]).findIndex(function(x){return x.id===s.id;}))+';color:#fff;font-size:9px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">'+nm.charAt(0)+'</span>'
      +window.esc(nm)
      +(s.dept?'<span style="font-size:9px;color:var(--txt-muted);margin-left:2px;flex-shrink:0;">·'+window.esc(s.dept)+'</span>':'')
    +'</div>';
  }).join('');

  var html = '<div style="padding:20px;">'
    // Type toggle
    +'<div style="margin-bottom:16px;">'
      +'<label class="f-label">ประเภทงาน</label>'
      +'<div style="display:flex;gap:8px;margin-top:6px;">'
        +'<button type="button" id="wlt-daily" onclick="window._wlTypeToggle(\'daily\')" class="btn '+(type==='daily'?'btn-pri':'btn-ghost')+'" style="font-size:12px;padding:5px 16px;">📅 รายวัน</button>'
        +'<button type="button" id="wlt-period" onclick="window._wlTypeToggle(\'period\')" class="btn '+(type==='period'?'btn-pri':'btn-ghost')+'" style="font-size:12px;padding:5px 16px;">📆 ช่วงเวลา</button>'
      +'</div>'
    +'</div>'
    // Date section
    +'<div id="wl-date-section" style="margin-bottom:16px;">'+_dateSectionHtml(type, wl, today)+'</div>'
    // Category
    +'<div style="margin-bottom:16px;">'
      +'<label class="f-label">หมวดงาน *</label>'
      +'<select class="f-input" id="wlf-cat">'+catOpts+'</select>'
    +'</div>'
    // Location
    +'<div style="margin-bottom:16px;">'
      +'<label class="f-label">สถานที่</label>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">'
        +WL_LOCS.map(function(l){
          return '<button type="button" class="wl-loc-btn btn '+(locType===l.id?'btn-pri':'btn-ghost')+'" data-lid="'+l.id+'" onclick="window._wlLocToggle(\''+l.id+'\')" style="font-size:12px;padding:5px 14px;">'+l.emoji+' '+l.label+'</button>';
        }).join('')
      +'</div>'
    +'</div>'
    // Destination
    +'<div id="wl-dest-wrap" style="margin-bottom:16px;'+(locType==='local'?'display:none;':'')+'">'
      +'<label class="f-label">ปลายทาง</label>'
      +'<input type="text" class="f-input" id="wlf-dest" placeholder="เช่น เชียงใหม่, โตเกียว ญี่ปุ่น" value="'+window.esc(wl?wl.destination||'':'')+'">'
    +'</div>'
    // Title
    +'<div style="margin-bottom:16px;">'
      +'<label class="f-label">ชื่องาน / หัวข้อ *</label>'
      +'<input type="text" class="f-input" id="wlf-title" placeholder="ระบุชื่องาน..." value="'+window.esc(wl?wl.title||'':'')+'">'
    +'</div>'
    // Detail
    +'<div style="margin-bottom:16px;">'
      +'<label class="f-label">รายละเอียด</label>'
      +'<textarea class="f-input" id="wlf-detail" rows="2" placeholder="รายละเอียดเพิ่มเติม...">'+window.esc(wl?wl.detail||'':'')+'</textarea>'
    +'</div>'
    // Participants
    +'<div id="wl-pt-section">'
      +'<label class="f-label" style="margin-bottom:8px;">ผู้เข้าร่วม '
        +'<span id="wl-pt-cnt" style="color:var(--violet);font-weight:400;">'+(parts.length?'('+parts.length+')':'')+'</span>'
      +'</label>'
      +'<div style="display:flex;gap:12px;">'
        // Selected list
        +'<div style="flex:1;min-width:0;">'
          +'<div id="wl-pt-selected" style="border:1px solid var(--border);border-radius:8px;min-height:64px;padding:6px;">'
            +(ptHtml||'<div style="color:var(--txt-muted);font-size:11px;padding:10px;text-align:center;">กดเลือกจากรายชื่อด้านขวา</div>')
          +'</div>'
        +'</div>'
        // Staff flat picker
        +'<div style="width:200px;flex-shrink:0;">'
          +'<input type="text" class="f-input" placeholder="🔍 ค้นหา..." style="font-size:11px;padding:4px 8px;height:28px;margin-bottom:6px;" oninput="window._wlStaffFilter(this.value)">'
          +'<div id="wl-staff-list" style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:4px;">'
            +staffListHtml
          +'</div>'
        +'</div>'
      +'</div>'
    +'</div>'
  +'</div>';

  document.getElementById('m-worklog-body').innerHTML = html;
  var delBtn = document.getElementById('m-worklog-del');
  var myUid2 = window.cu ? window.cu.id : '';
  var isCreator = wl && (wl.uid === myUid2);
  // Delete button: visible only for creator or users with canDel permission
  if(delBtn) delBtn.style.display = (wl && (isCreator || window.canDel('worklog'))) ? '' : 'none';
  window.openM('m-worklog');
};

// ── TOGGLE HELPERS ──
window._wlTypeToggle = function(t){
  var today = new Date().toISOString().slice(0,10);
  document.getElementById('wl-date-section').innerHTML = _dateSectionHtml(t, null, today);
  ['daily','period'].forEach(function(x){
    var b = document.getElementById('wlt-'+x);
    if(b){ b.className='btn '+(t===x?'btn-pri':'btn-ghost'); b.style.fontSize='12px'; b.style.padding='5px 16px'; }
  });
};

window._wlLocToggle = function(lid){
  document.querySelectorAll('.wl-loc-btn').forEach(function(b){
    b.className = 'wl-loc-btn btn '+(b.getAttribute('data-lid')===lid?'btn-pri':'btn-ghost');
    b.style.fontSize='12px'; b.style.padding='5px 14px';
  });
  var dw = document.getElementById('wl-dest-wrap');
  if(dw) dw.style.display = lid==='local' ? 'none' : '';
};

window._wlAutoEndDate = function(){
  var s = document.getElementById('wlf-start');
  var e = document.getElementById('wlf-end');
  if(s && e && (!e.value || e.value < s.value)) e.value = s.value;
  // Sync participant tags that have no date yet
  document.querySelectorAll('#wl-pt-selected .wl-ptag').forEach(function(tag){
    var ms = tag.querySelector('.wl-mem-s');
    var me = tag.querySelector('.wl-mem-e');
    if(ms && !ms.value && s) { ms.value = s.value; tag.setAttribute('data-s', s.value); }
    if(me && !me.value && e) { me.value = e.value; tag.setAttribute('data-e', e.value); }
  });
};

// ── PARTICIPANT PICKER ──
window._wlAddPt = function(sid){
  var sel = document.getElementById('wl-pt-selected');
  if(!sel) return;
  if(sel.querySelector('.wl-ptag[data-sid="'+sid+'"]')) return;

  var st   = (window.STAFF||[]).find(function(s){ return s.id===sid; });
  var name = st ? (st.nickname||st.name) : sid;

  // Inherit dates from current date fields
  var s = '', e = '';
  var ds = document.getElementById('wlf-start') || document.getElementById('wlf-date');
  var de = document.getElementById('wlf-end')   || document.getElementById('wlf-date');
  if(ds) s = ds.value||'';
  if(de) e = de.value||'';

  var placeholder = sel.querySelector('div:not(.wl-ptag)');
  if(placeholder) placeholder.remove();
  var div = document.createElement('div');
  div.innerHTML = _ptTag(sid, name, s, e);
  sel.appendChild(div.firstElementChild);
  window._wlUpdatePtCnt();
};

window._wlUpdatePtCnt = function(){
  var n  = (document.querySelectorAll('#wl-pt-selected .wl-ptag')||[]).length;
  var el = document.getElementById('wl-pt-cnt');
  if(el) el.textContent = n ? '('+n+')' : '';
};

window._wlStaffFilter = function(q){
  var ql = (q||'').toLowerCase();
  document.querySelectorAll('.wl-staff-item').forEach(function(item){
    item.style.display = (!ql || item.getAttribute('data-nm').includes(ql)) ? '' : 'none';
  });
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

  var type  = document.querySelector('.btn-pri[id^="wlt-"]');
  var locBtn= document.querySelector('.wl-loc-btn.btn-pri');

  var typeVal  = type  ? type.id.replace('wlt-','') : 'daily';
  var locVal   = locBtn ? locBtn.getAttribute('data-lid') : 'local';

  var dateVal  = (document.getElementById('wlf-date')||{}).value||'';
  var startVal = (document.getElementById('wlf-start')||{}).value||'';
  var endVal   = (document.getElementById('wlf-end')||{}).value||'';
  var totalDays= 1;
  if(typeVal==='period' && startVal && endVal){
    totalDays = Math.max(1, Math.round((new Date(endVal)-new Date(startVal))/86400000)+1);
  }

  var participants = [];
  document.querySelectorAll('#wl-pt-selected .wl-ptag').forEach(function(tag){
    var sid = tag.getAttribute('data-sid');
    if(sid) participants.push({sid:sid, s:tag.getAttribute('data-s')||'', e:tag.getAttribute('data-e')||''});
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
  };
  if(!_wlEditId) data.created_at = new Date().toISOString();

  try {
    var docId = _wlEditId||window.uid();
    var ref = window.getDocRef('WORK_LOGS', docId);
    await window.setDoc(ref, data, {merge:true});
    window._applyLocalDoc('WORK_LOGS', docId, Object.assign({id:docId}, data));
    window.renderWorkLog&&window.renderWorkLog();
    window.closeM('m-worklog');
    window.showAlert&&window.showAlert('บันทึกเรียบร้อย','success');
  } catch(err){
    window.showAlert&&window.showAlert('เกิดข้อผิดพลาด: '+err.message,'error');
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
