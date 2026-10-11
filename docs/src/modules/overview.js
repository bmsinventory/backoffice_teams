const { esc, fd, fc, fca, pd, gS, gT, gG, gSt, gC, avC, uid, getFY, getYearBE, getStaffOverlaps, overlapWarnText, getStaffLeaveConflicts, getColRef, getDocRef } = window;
// ── สุขภาพโครงการ (ใช้ร่วมกับ overview-dash.js) — เทียบความคืบหน้ากับสัดส่วนเวลาที่ผ่านไปของโครงการ
// ไม่ใช้เกณฑ์ "เหลือ ≤15 วัน" ตายตัว เพราะงานไซต์สั้น ๆ (เช่น 5 วัน) จะถูกนับว่าเสี่ยงตั้งแต่วันแรก
// done = เสร็จ · late = เลยวันจบ · risk = ช้ากว่าแผน ≥25% หรือถึงวันสุดท้ายแล้วยังไม่ถึง 80% · ok = ปกติ ──
var PH_GAP=25,PH_DAY=86400000;
window.projectHealth=function(p,today){
  var prog=Number(p.progress)||0;
  if(prog>=100||p.stage==='close'||p.status==='completed')return{k:'done',expected:null,gap:0,reason:''};
  if(!p.end)return{k:'ok',expected:null,gap:0,reason:''};
  var t=today||new Date(new Date().toDateString()),e=pd(p.end),left=Math.round((e-t)/PH_DAY);
  if(left<0)return{k:'late',expected:100,gap:100-prog,reason:'เลยกำหนด '+(-left)+' วัน'};
  var s=p.start?pd(p.start):null;
  if(!s||t<s)return{k:'ok',expected:s?0:null,gap:0,reason:''};
  var total=Math.round((e-s)/PH_DAY)+1,elapsed=Math.round((t-s)/PH_DAY)+1;
  var expected=Math.min(100,Math.round(elapsed/total*100)),gap=Math.max(0,expected-prog);
  if(left===0&&prog<80)return{k:'risk',expected:expected,gap:gap,reason:'ครบกำหนดวันนี้ ทำได้ '+prog+'%'};
  if(gap>=PH_GAP)return{k:'risk',expected:expected,gap:gap,reason:'ช้ากว่าแผน '+gap+'%'};
  return{k:'ok',expected:expected,gap:gap,reason:''};
};
// ── OVERVIEW ──
window.renderOverview = function(){
  var yf=document.getElementById('ov-yr');
  if(yf&&yf.options.length<=1){var yrs=[...new Set(window.PROJECTS.map(p=>getYearBE(p.start)).filter(Boolean))].sort((a,b)=>b-a);yrs.forEach(function(y){var o=document.createElement('option');o.value=y;o.textContent='ปี พ.ศ. '+y;yf.appendChild(o);});var _cbe=(new Date().getFullYear()+543).toString();if(!yf.value||yf.value==='')yf.value=_cbe;}
  window.msFilter('ov-grp',window.PGROUPS,{placeholder:'ทุกกลุ่มโครงการ',onChange:window.renderOverview});
  window.msFilter('ov-type',window.PTYPES,{placeholder:'ทุกประเภทโครงการ',onChange:window.renderOverview});
  var yr=(yf||{}).value||'';var grp=window.msValues('ov-grp');var ovTyp=window.msValues('ov-type');
  var fProjs=window.PROJECTS.filter(function(p){return(!yr||getYearBE(p.start)==yr)&&(!grp.length||grp.includes(p.groupId))&&(!ovTyp.length||ovTyp.includes(p.typeId));});
  var fPids=new Set(fProjs.map(p=>p.id));
  var fAdvs=window.ADVANCES.filter(function(a){return fPids.has(a.pid);});
  var totalBudget=fProjs.reduce(function(s,p){return s+p.cost;},0);
  var aPnd=fAdvs.filter(function(a){return a.status!=='cleared';});
  var now=new Date();now.setHours(0,0,0,0);
  // ── health ──
  var health={onTrack:0,atRisk:0,delayed:0,completed:0};
  fProjs.forEach(p=>{
    if(p.progress===100||p.stage==='close'||p.status==='completed'){health.completed++;return;}
    var k=window.projectHealth(p,now).k;
    if(k==='late')health.delayed++;else if(k==='risk')health.atRisk++;else health.onTrack++;
  });
  var critCount=fProjs.filter(p=>{if(p.progress===100||p.stage==='close'||!p.end)return false;var d=Math.ceil((pd(p.end)-now)/(1000*60*60*24));return d<=30;}).length;
  var annualProjs=window.PROJECTS.filter(function(p){return(!yr||getYearBE(p.start)==yr)&&(!grp.length||grp.includes(p.groupId));});
  window.renderAnnualTarget(annualProjs, yr);
  // ── Advance alerts ──
  var advKey=new Map();aPnd.forEach(a=>{advKey.set(a,+pd(a.ddate));});
  var advAlerts=[...aPnd].sort((a,b)=>advKey.get(a)-advKey.get(b)).slice(0,8);
  var ovAdv=document.getElementById('ov-adv-alerts');
  if(ovAdv){ovAdv.innerHTML=advAlerts.map(function(a){var p=window.PROJECTS.find(x=>x.id===a.pid);var isOv=a.ddate&&pd(a.ddate)<now;var color=isOv?'var(--coral)':'var(--amber)';return`<div onclick="window.goView('advance')" style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px dashed var(--border);cursor:pointer;" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''"><div style="width:28px;height:28px;border-radius:8px;background:${color}15;color:${color};display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">${isOv?'⚠':'💳'}</div><div style="flex:1;min-width:0;"><div style="font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p?esc(p.name):'—'}</div><div style="font-size:10px;color:var(--txt3);">${fd(a.ddate)} · <span style="color:${color};font-weight:600;">${isOv?'เกินกำหนด':'รอเคลียร์'}</span></div></div><div style="font-size:12px;font-weight:800;">${fc(a.amount)}</div></div>`;}).join('')||'<div style="font-size:12px;color:var(--txt3);text-align:center;padding:20px;">ไม่มีรายการค้าง</div>';}
  // ── พยากรณ์ / KPI / กราฟ 3D / popup → overview-dash.js ──
  if(window.ovDash)window.ovDash.render({yr:yr,grp:grp,typ:ovTyp,now:now,fProjs:fProjs,fAdvs:fAdvs,health:health,critCount:critCount,totalBudget:totalBudget});
}
// ── ANNUAL TARGET TRACKER ──────────────────────────────────────────────────────
// ── HELPER: build display rows (กลุ่ม + ประเภทเดี่ยว) ─────────────────────────
function _buildAnnualTargetRows(fProjs, byType, useGroups) {
  var groups = (useGroups !== undefined) ? useGroups : (window.TARGET_TYPE_GROUPS || []);
  var groupedIds = new Set();
  groups.forEach(function(g) { (g.typeIds||[]).forEach(function(tid) { groupedIds.add(tid); }); });
  var allTypeIds = new Set(Object.keys(byType));
  fProjs.forEach(function(p) { if (p.typeId) allTypeIds.add(p.typeId); });
  var rows = [];
  // Group rows — แสดงเสมอถ้ามีการตั้งกลุ่มไว้ (แม้ยังไม่มีโครงการ/target ในปีนั้น)
  groups.forEach(function(g) {
    var gTypeIds = g.typeIds || [];
    if (!gTypeIds.length) return;
    var tgt = gTypeIds.reduce(function(s,tid){return s+Number(byType[tid]||0);},0);
    var projs = fProjs.filter(function(p){return gTypeIds.includes(p.typeId);});
    var total = projs.reduce(function(s,p){return s+(p.cost||0);},0);
    var closed = projs.filter(function(p){return p.stage==='close';}).reduce(function(s,p){return s+(p.cost||0);},0);
    var pctT = tgt>0?Math.min(100,Math.round(total/tgt*100)):0;
    var pctC = tgt>0?Math.min(100,Math.round(closed/tgt*100)):0;
    var dots = gTypeIds.map(function(tid){
      var t=(window.PTYPES||[]).find(function(x){return x.id===tid;});
      return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+(t?t.color:'#9ba3b8')+';margin-right:3px;vertical-align:middle;"></span>';
    }).join('');
    rows.push({id:g.id,isGroup:true,name:g.label,typeIds:gTypeIds,color:(((window.PTYPES||[]).find(function(x){return x.id===gTypeIds[0];})||{}).color)||'#7c5cfc',label:dots+'<b style="vertical-align:middle;">'+esc(g.label)+'</b>',
      tgt,total,closed,pctT,pctC,needFind:Math.max(0,tgt-total),needClose:Math.max(0,tgt-closed)});
  });
  // Ungrouped type rows — แสดงทุกประเภทที่ไม่อยู่ในกลุ่ม ถ้ามีการตั้งกลุ่มไว้ในระบบ (ไม่ว่ามุมมองปัจจุบันจะรวมกลุ่มหรือแยกประเภท) หรือมีข้อมูล
  var showAllTypes = (window.TARGET_TYPE_GROUPS || []).length > 0;
  (window.PTYPES||[]).filter(function(t){return !groupedIds.has(t.id)&&(showAllTypes||allTypeIds.has(t.id));}).forEach(function(t){
    var tgt = Number(byType[t.id]||0);
    var projs = fProjs.filter(function(p){return p.typeId===t.id;});
    var total = projs.reduce(function(s,p){return s+(p.cost||0);},0);
    var closed = projs.filter(function(p){return p.stage==='close';}).reduce(function(s,p){return s+(p.cost||0);},0);
    var pctT = tgt>0?Math.min(100,Math.round(total/tgt*100)):0;
    var pctC = tgt>0?Math.min(100,Math.round(closed/tgt*100)):0;
    var c=t.color||'#4361ee';
    rows.push({id:t.id,isGroup:false,name:t.label,typeIds:[t.id],color:c,label:'<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+c+';margin-right:6px;vertical-align:middle;"></span><span style="vertical-align:middle;">'+esc(t.label)+'</span>',
      tgt,total,closed,pctT,pctC,needFind:Math.max(0,tgt-total),needClose:Math.max(0,tgt-closed)});
  });
  return rows;
}

window.renderAnnualTarget = function(fProjs, yr) {
  var wrap = document.getElementById('annual-target-wrap');
  if (!wrap) return;

  var currentBEYear = (new Date().getFullYear() + 543).toString();
  var displayYr = yr || currentBEYear;
  var targets = window.YEAR_TARGETS || [];
  var entry = targets.find(function(t) { return String(t.year) === String(displayYr); });
  var byType = (entry && entry.byType) ? entry.byType : {};
  var hasGroups = (window.TARGET_TYPE_GROUPS||[]).length > 0;
  var grouped = hasGroups && (localStorage.getItem('tgt_grouped') !== '0');

  var rows = _buildAnnualTargetRows(fProjs, byType, grouped ? undefined : []);
  window._ovTgtRows = rows; // กราฟเป้าหมาย 3D ใน overview-dash.js

  // toggle handler
  window._setTgtGrouped = function(val) {
    localStorage.setItem('tgt_grouped', val ? '1' : '0');
    window.setDoc(getDocRef('SETTINGS','app'), {tgt_grouped: val ? 1 : 0}, {merge:true}).catch(function(){});
    window.renderOverview();
  };

  var toggleHtml = hasGroups
    ? '<div style="display:flex;border:1px solid var(--border);border-radius:8px;overflow:hidden;font-size:11px;flex-shrink:0;">' +
        '<button onclick="window._setTgtGrouped(true)" style="padding:4px 12px;border:none;cursor:pointer;font-family:inherit;font-weight:600;background:'+(grouped?'var(--violet)':'var(--surface2)')+';color:'+(grouped?'#fff':'var(--txt2)')+';">รวมกลุ่ม</button>' +
        '<button onclick="window._setTgtGrouped(false)" style="padding:4px 12px;border:none;cursor:pointer;font-family:inherit;font-weight:600;background:'+(!grouped?'var(--violet)':'var(--surface2)')+';color:'+(!grouped?'#fff':'var(--txt2)')+';">แยกประเภท</button>' +
      '</div>'
    : '';

  var actionBtns = '<div style="display:flex;gap:8px;align-items:center;">' +
    toggleHtml +
    (window.isAdmin() ? '<button onclick="window.openTypeGroupModal()" style="padding:5px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--txt2);font-size:11px;cursor:pointer;font-family:inherit;">⚙️ จัดกลุ่ม</button>' : '') +
    '</div>';

  if (!rows.length) {
    wrap.innerHTML = '<div class="ov-card" style="padding:16px 20px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:18px;">🎯</span>' +
          '<span style="font-size:14px;font-weight:800;color:var(--txt);">เป้าหมายประจำปี พ.ศ. ' + displayYr + '</span>' +
          '<span style="font-size:12px;color:var(--txt3);margin-left:4px;">— ยังไม่ได้ตั้งเป้าหมาย</span></div>' +
        actionBtns +
      '</div>' +
    '</div>';
    return;
  }

  function miniBar(pct, color) {
    return '<div style="width:100%;height:6px;background:var(--surface3);border-radius:3px;overflow:hidden;margin-top:3px;">' +
      '<div style="width:' + Math.min(100,pct) + '%;height:100%;background:' + color + ';border-radius:3px;"></div></div>';
  }
  function gapChip(val, label, pos) {
    var ok = val <= 0;
    return '<div style="font-size:9px;color:var(--txt3);">' + label + '</div>' +
      '<div style="font-size:12px;font-weight:800;color:' + (ok?'#06d6a0':(pos?'#4361ee':'#ff6b6b')) + ';">' +
      (ok ? '✓ ถึงเป้า' : fc(val)) + '</div>';
  }

  var sumTgt    = rows.reduce(function(s,r){return s+r.tgt;},0);
  var sumTotal  = rows.reduce(function(s,r){return s+r.total;},0);
  var sumClosed = rows.reduce(function(s,r){return s+r.closed;},0);
  var sumPctT   = sumTgt>0?Math.min(100,Math.round(sumTotal/sumTgt*100)):0;
  var sumPctC   = sumTgt>0?Math.min(100,Math.round(sumClosed/sumTgt*100)):0;

  var colH = 'font-size:10px;font-weight:700;color:var(--txt3);padding:6px 10px;border-bottom:2px solid var(--border);white-space:nowrap;';
  var cell = 'font-size:12px;padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:middle;';
  var cellR = cell + 'text-align:right;';

  function displayRow(r) {
    return '<tr' + (r.isGroup ? ' style="background:rgba(124,92,252,.04);"' : '') + '>' +
      '<td style="' + cell + 'font-weight:700;color:var(--txt);">' + r.label + '</td>' +
      '<td style="' + cellR + 'color:var(--violet);font-weight:700;">' + (r.tgt>0?fc(r.tgt):'<span style="color:var(--txt3);">—</span>') + '</td>' +
      '<td style="' + cell + '">' +
        '<div style="font-size:12px;font-weight:700;color:#4361ee;">' + fc(r.total) +
          (r.tgt>0?' <span style="font-size:10px;color:var(--txt3);">('+r.pctT+'%)</span>':'') + '</div>' +
        (r.tgt>0?miniBar(r.pctT,'#4361ee'):'') + '</td>' +
      '<td style="' + cell + '">' +
        '<div style="font-size:12px;font-weight:700;color:#06d6a0;">' + fc(r.closed) +
          (r.tgt>0?' <span style="font-size:10px;color:var(--txt3);">('+r.pctC+'%)</span>':'') + '</div>' +
        (r.tgt>0?miniBar(r.pctC,'#06d6a0'):'') + '</td>' +
      '<td style="' + cellR + '">' + (r.tgt>0?gapChip(r.needFind,'ต้องหาเพิ่ม',true):'<span style="color:var(--txt3);font-size:11px;">—</span>') + '</td>' +
      '<td style="' + cellR + '">' + (r.tgt>0?gapChip(r.needClose,'ต้องปิดเพิ่ม',false):'<span style="color:var(--txt3);font-size:11px;">—</span>') + '</td>' +
    '</tr>';
  }

  var sumRow = '<tr style="background:var(--surface2);font-weight:800;">' +
    '<td style="' + cell + 'font-weight:800;color:var(--txt);">รวมทุกประเภท</td>' +
    '<td style="' + cellR + 'color:var(--violet);font-weight:800;">' + (sumTgt>0?fc(sumTgt):'—') + '</td>' +
    '<td style="' + cell + '"><div style="font-size:12px;font-weight:800;color:#4361ee;">' + fc(sumTotal) +
      (sumTgt>0?' <span style="font-size:10px;color:var(--txt3);">('+sumPctT+'%)</span>':'') + '</div>' +
      (sumTgt>0?miniBar(sumPctT,'#4361ee'):'') + '</td>' +
    '<td style="' + cell + '"><div style="font-size:12px;font-weight:800;color:#06d6a0;">' + fc(sumClosed) +
      (sumTgt>0?' <span style="font-size:10px;color:var(--txt3);">('+sumPctC+'%)</span>':'') + '</div>' +
      (sumTgt>0?miniBar(sumPctC,'#06d6a0'):'') + '</td>' +
    '<td style="' + cellR + '">' + (sumTgt>0?gapChip(Math.max(0,sumTgt-sumTotal),'ต้องหาเพิ่ม',true):'—') + '</td>' +
    '<td style="' + cellR + '">' + (sumTgt>0?gapChip(Math.max(0,sumTgt-sumClosed),'ต้องปิดเพิ่ม',false):'—') + '</td>' +
  '</tr>';

  wrap.innerHTML =
    '<div class="ov-card" style="padding:16px 20px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="font-size:18px;">🎯</span>' +
          '<span style="font-size:14px;font-weight:800;color:var(--txt);">เป้าหมายประจำปี พ.ศ. ' + displayYr + '</span>' +
        '</div>' +
        actionBtns +
      '</div>' +
      '<div style="overflow-x:auto;">' +
        '<table style="width:100%;border-collapse:collapse;min-width:600px;">' +
          '<thead><tr>' +
            '<th style="' + colH + 'text-align:left;">ประเภท / กลุ่มโครงการ</th>' +
            '<th style="' + colH + 'text-align:right;">🎯 เป้าหมาย' + window.calcTip('เป้ามูลค่าที่ตั้งไว้ของปีนี้ ต่อประเภทโครงการ (แถวกลุ่ม = รวมเป้าของทุกประเภทในกลุ่ม)') + '</th>' +
            '<th style="' + colH + '">📁 ยอดโครงการทั้งหมด' + window.calcTip('ผลรวมมูลค่าของทุกโครงการในประเภทนั้นที่เริ่มในปีที่เลือก\n(%) = ยอดโครงการ ÷ เป้าหมาย × 100 (สูงสุด 100%)') + '</th>' +
            '<th style="' + colH + '">✅ ปิดโครงการแล้ว' + window.calcTip('ผลรวมมูลค่าเฉพาะโครงการที่อยู่ขั้นตอน "ปิดโครงการ"\n(%) = ยอดปิดแล้ว ÷ เป้าหมาย × 100 (สูงสุด 100%)') + '</th>' +
            '<th style="' + colH + 'text-align:right;">ต้องหาเพิ่ม' + window.calcTip('เป้าหมาย − ยอดโครงการทั้งหมด (ถ้าไม่เหลือ = ถึงเป้า)') + '</th>' +
            '<th style="' + colH + 'text-align:right;">ต้องปิดเพิ่ม' + window.calcTip('เป้าหมาย − ยอดที่ปิดโครงการแล้ว (ถ้าไม่เหลือ = ถึงเป้า)') + '</th>' +
          '</tr></thead>' +
          '<tbody>' + rows.map(displayRow).join('') + sumRow + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
};

// ── TYPE GROUP MODAL (dynamic overlay — ไม่ต้องพึ่ง HTML) ─────────────────────
window.openTypeGroupModal = function() {
  // ลบ overlay เก่าถ้ามี
  var old = document.getElementById('tg-overlay');
  if (old) old.remove();

  window._editingGroups = (window.TARGET_TYPE_GROUPS||[]).map(function(g){
    return {id:g.id,label:g.label,typeIds:(g.typeIds||[]).slice()};
  });

  // สร้าง overlay
  var ov = document.createElement('div');
  ov.id = 'tg-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
  ov.innerHTML =
    '<div style="background:var(--surface);border-radius:16px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px 0;">' +
        '<div style="font-size:15px;font-weight:800;color:var(--txt);">⚙️ จัดกลุ่มประเภทโครงการ</div>' +
        '<button onclick="document.getElementById(\'tg-overlay\').remove()" style="width:30px;height:30px;border:none;background:var(--surface2);border-radius:50%;cursor:pointer;font-size:16px;color:var(--txt2);">✕</button>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--txt3);padding:6px 20px 14px;line-height:1.6;">นำประเภทโครงการหลายประเภทมาแสดงรวมเป็นแถวเดียวในตารางเป้าหมาย</div>' +
      '<div style="padding:0 20px;" id="tg-groups-list"></div>' +
      '<div style="padding:10px 20px;">' +
        '<button onclick="window._grpAdd()" style="width:100%;padding:9px;border:1px dashed var(--border);border-radius:8px;background:transparent;color:var(--txt3);font-size:13px;cursor:pointer;">➕ เพิ่มกลุ่ม</button>' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px;padding:12px 20px 20px;border-top:1px solid var(--border);margin-top:8px;">' +
        '<button onclick="document.getElementById(\'tg-overlay\').remove()" style="padding:8px 18px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--txt2);font-size:13px;cursor:pointer;">ยกเลิก</button>' +
        '<button onclick="window.saveTypeGroups()" style="padding:8px 20px;border:none;border-radius:8px;background:var(--violet);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">💾 บันทึกการจัดกลุ่ม</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ov);

  function _refresh() {
    var types = window.PTYPES||[];
    var html = '';
    window._editingGroups.forEach(function(g,gi){
      var pills = types.map(function(t){
        var on = g.typeIds.includes(t.id);
        return '<label style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border:1px solid '+(on?'var(--violet)':'var(--border)')+';border-radius:20px;cursor:pointer;font-size:11px;font-weight:600;background:'+(on?'var(--violet)':'var(--surface2)')+';color:'+(on?'#fff':'var(--txt2)')+';user-select:none;margin:2px;">' +
          '<input type="checkbox" style="display:none;" '+(on?'checked':'')+' onchange="window._grpToggle('+gi+',\''+t.id+'\')">' +
          '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:'+(t.color||'#4361ee')+';">&nbsp;</span>' +
          esc(t.label)+'</label>';
      }).join('');
      html += '<div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;background:var(--surface2);">' +
        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">' +
          '<input type="text" value="'+esc(g.label)+'" placeholder="ชื่อกลุ่ม เช่น คลังสินค้า+ครุภัณฑ์" ' +
            'oninput="window._editingGroups['+gi+'].label=this.value" ' +
            'style="flex:1;padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--txt);font-size:13px;">' +
          '<button onclick="window._grpRemove('+gi+')" style="padding:6px 10px;border:1px solid var(--coral);border-radius:8px;background:rgba(255,107,107,.1);color:var(--coral);font-size:12px;cursor:pointer;flex-shrink:0;">🗑</button>' +
        '</div>' +
        '<div style="display:flex;flex-wrap:wrap;">'+pills+'</div>' +
      '</div>';
    });
    var el = document.getElementById('tg-groups-list');
    if (el) el.innerHTML = html || '<div style="text-align:center;padding:20px;color:var(--txt3);font-size:12px;">— ยังไม่มีกลุ่ม กด ➕ เพื่อเพิ่ม —</div>';
  }

  window._grpToggle = function(gi,tid){
    var g=window._editingGroups[gi]; var idx=g.typeIds.indexOf(tid);
    if(idx>=0)g.typeIds.splice(idx,1); else g.typeIds.push(tid);
    _refresh();
  };
  window._grpRemove = function(gi){ window._editingGroups.splice(gi,1); _refresh(); };
  window._grpAdd = function(){
    window._editingGroups.push({id:'grp_'+Date.now(),label:'',typeIds:[]});
    _refresh();
  };
  _refresh();
};

// รวม YEAR_TARGETS + TARGET_TYPE_GROUPS เป็น payload เดียวสำหรับ save
function _yearTargetsPayload(yearEntries, groups) {
  var entries = (yearEntries||window.YEAR_TARGETS||[]).filter(function(t){return t.year&&!t._typeGroups;});
  var grps = groups||window.TARGET_TYPE_GROUPS||[];
  if (grps.length > 0) entries = entries.concat([{_typeGroups: grps}]);
  return entries;
}

window.saveTypeGroups = function() {
  var groups = (window._editingGroups||[]).filter(function(g){return g.label&&g.typeIds.length>0;});
  window.TARGET_TYPE_GROUPS = groups;
  try{localStorage.setItem('_tgt_groups',JSON.stringify(groups));}catch(e){}
  window.setDoc(getDocRef('SETTINGS','app'),{year_targets:_yearTargetsPayload(null,groups)},{merge:true})
    .then(function(){
      var ov=document.getElementById('tg-overlay'); if(ov)ov.remove();
      window.showAlert('บันทึกการจัดกลุ่มเรียบร้อย ✓','success');
      window.renderOverview();
      window.renderTargets&&window.renderTargets();
    }).catch(function(e){window.showDbError(e);});
};

// ── TARGET NUMBER FORMAT HELPERS ──
window._tgtNumFocus = function(el) {
  el.value = el.value.replace(/,/g, '');
};
window._tgtNumBlur = function(el) {
  var n = parseFloat(el.value.replace(/,/g, ''));
  el.value = (!isNaN(n) && n > 0)
    ? new Intl.NumberFormat('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(n)
    : '';
};
function _tgtFmtVal(v) {
  var n = Number(v);
  return (!isNaN(n) && n > 0)
    ? new Intl.NumberFormat('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(n)
    : '';
}

// ── TARGETS PAGE ──────────────────────────────────────────────────────────────
window.renderTargets = function() {
  var body = document.getElementById('targets-body');
  if (!body) return;
  var canEdit = window.isAdmin() || window.canEdit('targets');

  // year selector
  var allYears = [...new Set([
    ...(window.PROJECTS || []).map(function(p) { return p.start ? (new Date(p.start).getFullYear() + 543) : null; }).filter(Boolean),
    new Date().getFullYear() + 543
  ])].sort(function(a, b) { return b - a; });

  var selYr = window._targetsPageYr || String(allYears[0] || (new Date().getFullYear() + 543));
  window._targetsPageYr = selYr;

  var yrOpts = allYears.map(function(y) {
    return '<option value="' + y + '"' + (String(y) === selYr ? ' selected' : '') + '>พ.ศ. ' + y + '</option>';
  }).join('');

  var targets = window.YEAR_TARGETS || [];
  var entry = targets.find(function(t) { return String(t.year) === selYr; });
  var byType = (entry && entry.byType) ? entry.byType : {};

  var groups = window.TARGET_TYPE_GROUPS || [];
  var groupedIds = new Set();
  groups.forEach(function(g){(g.typeIds||[]).forEach(function(tid){groupedIds.add(tid);});});

  function _tgtInput(id, val, readOnly) {
    return '<input type="text" inputmode="numeric" id="tpg-'+id+'" value="'+_tgtFmtVal(val)+'" placeholder="0.00" '+
      (readOnly ? 'disabled ' : 'onfocus="window._tgtNumFocus(this)" onblur="window._tgtNumBlur(this)" ')+
      'style="width:180px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:'+(readOnly?'var(--surface2)':'var(--surface)')+';color:var(--txt);font-size:13px;text-align:right;'+(readOnly?'opacity:.7;':'')+'">';
  }

  // Group rows — แสดง input ต่อประเภทภายในกลุ่ม
  var groupRows = groups.map(function(g){
    var dots = (g.typeIds||[]).map(function(tid){
      var t=(window.PTYPES||[]).find(function(x){return x.id===tid;}); return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+(t?t.color:'#9ba3b8')+';margin-right:3px;"></span>';
    }).join('');
    var typeInputRows = (g.typeIds||[]).map(function(tid){
      var t=(window.PTYPES||[]).find(function(x){return x.id===tid;});
      if(!t) return '';
      return '<div style="display:flex;align-items:center;gap:12px;padding:8px 0 8px 16px;border-bottom:1px solid var(--border);">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:'+(t.color||'#4361ee')+';flex-shrink:0;display:inline-block;"></span>' +
        '<span style="flex:1;font-size:12px;color:var(--txt2);">'+esc(t.label)+'</span>' +
        _tgtInput('inp-'+t.id, byType[t.id]?Number(byType[t.id]):'', !canEdit) +
        '<span style="font-size:12px;color:var(--txt3);width:30px;">บาท</span>' +
      '</div>';
    }).join('');
    return '<div style="border-bottom:1px solid var(--border);">' +
      '<div style="display:flex;align-items:center;gap:8px;padding:10px 0 6px;">' +
        '<span style="font-size:12px;font-weight:800;color:var(--violet);">'+dots+esc(g.label)+'</span>' +
        '<span style="font-size:10px;color:var(--txt3);">(รวมกลุ่ม)</span>' +
      '</div>' +
      typeInputRows +
    '</div>';
  }).join('');

  // Ungrouped type rows
  var ungroupedRows = (window.PTYPES||[]).filter(function(t){return !groupedIds.has(t.id);}).map(function(t){
    return '<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">' +
      '<span style="width:12px;height:12px;border-radius:50%;background:'+(t.color||'#4361ee')+';flex-shrink:0;display:inline-block;"></span>' +
      '<span style="flex:1;font-size:13px;font-weight:600;color:var(--txt);">'+esc(t.label)+'</span>' +
      _tgtInput('inp-'+t.id, byType[t.id]?Number(byType[t.id]):'', !canEdit) +
      '<span style="font-size:12px;color:var(--txt3);width:30px;">บาท</span>' +
    '</div>';
  }).join('');

  body.innerHTML =
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:22px 24px;">' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;">' +
        '<span style="font-size:15px;font-weight:800;color:var(--txt);">🎯 ตั้งเป้าหมายประจำปี</span>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-left:auto;">' +
          (window.isAdmin()?'<button onclick="window.openTypeGroupModal()" style="padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--txt2);font-size:12px;cursor:pointer;">⚙️ จัดกลุ่มประเภท</button>':'') +
          '<label style="font-size:12px;font-weight:600;color:var(--txt3);">ปี พ.ศ.:</label>' +
          '<select onchange="window._targetsPageYr=this.value;window.renderTargets()" ' +
            'style="padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--txt);font-size:13px;">' +
            yrOpts +
          '</select>' +
        '</div>' +
      '</div>' +
      (groups.length?'<div style="font-size:11px;font-weight:700;color:var(--txt3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">กลุ่มประเภท</div>':'') +
      '<div>' + groupRows + '</div>' +
      (ungroupedRows?'<div style="font-size:11px;font-weight:700;color:var(--txt3);margin:14px 0 6px;text-transform:uppercase;letter-spacing:.5px;">ประเภทอื่น ๆ</div>':'') +
      '<div>' + ungroupedRows + '</div>' +
      (canEdit ?
        '<div style="display:flex;justify-content:flex-end;margin-top:18px;">' +
          '<button onclick="window.saveTargetsPage()" style="padding:9px 24px;border:none;border-radius:8px;background:var(--violet);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">💾 บันทึกเป้าหมาย</button>' +
        '</div>'
      : '<div style="margin-top:12px;font-size:11px;color:var(--txt3);text-align:right;">— คุณมีสิทธิ์ดูเท่านั้น —</div>') +
    '</div>';
};

window.saveTargetsPage = function() {
  var yr = window._targetsPageYr;
  if (!yr) return;
  var byType = {};
  // ทุกประเภท (ทั้งในกลุ่มและไม่ในกลุ่ม) — save per-type
  (window.PTYPES||[]).forEach(function(t){
    var inp = document.getElementById('tpg-inp-'+t.id);
    if (inp) { var v=parseFloat(inp.value.replace(/,/g,'')); if(!isNaN(v)&&v>0) byType[t.id]=v; }
  });
  var targets = (window.YEAR_TARGETS||[]).filter(function(t){return String(t.year)!==String(yr);});
  if (Object.keys(byType).length>0) targets.push({year:Number(yr),byType:byType});
  window.YEAR_TARGETS = targets;
  window.setDoc(getDocRef('SETTINGS','app'),{year_targets:_yearTargetsPayload(targets)},{merge:true})
    .then(function(){
      window.showAlert('บันทึกเป้าหมายปี '+yr+' เรียบร้อย ✓','success');
      window.renderOverview();
    }).catch(function(e){window.showDbError(e);});
};

// ── 🤖 AI สรุปประจำวัน — รวมสิ่งที่ต้องทำวันนี้/สัปดาห์นี้จากทุกโมดูล (โครงการ/Adv./ที่พัก/Helpdesk/การลา/Impl Tracker)
// ข้อเท็จจริงทุกตัวคำนวณในโค้ด AI แค่จัดลำดับความสำคัญและเรียบเรียง · ผลวางใน #ov-ai-wrap (ไม่ถูก renderOverview ทับ) ──
var _ovAiText = '';
function _ovIso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function _ovNick(sid) { var s = (window.STAFF || []).find(function (x) { return x.id === sid; }); return s ? (s.nickname || s.name) : ''; }
function _ovAiFacts() {
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var tIso = _ovIso(today), d7 = new Date(today); d7.setDate(d7.getDate() + 7); var d7Iso = _ovIso(d7);
  var d30 = new Date(today); d30.setDate(d30.getDate() + 30); var d30Iso = _ovIso(d30);
  var days = function (iso) { return Math.round((pd(iso) - today) / 86400000); };
  var active = (window.PROJECTS || []).filter(function (p) { return p.status !== 'cancelled' && p.status !== 'completed'; });
  var advOf = function (pid) { return (window.ADVANCES || []).filter(function (a) { return a.pid === pid && a.status !== 'cleared'; }); };
  var advLbl = function (st) { return ((window.AFLW || []).find(function (x) { return x.id === st; }) || { label: st }).label; };
  var mems = function (p) { return window.sortByStaffRank(p.members && p.members.length ? p.members.map(function (m) { return m.sid; }) : (p.team || [])).map(_ovNick).filter(Boolean); };
  var L = ['วันนี้: ' + fd(tIso)], n = 0;
  var sec = function (title, rows) { if (!rows.length) return; n += rows.length; L.push('', '## ' + title + ' (' + rows.length + ')'); rows.slice(0, 12).forEach(function (r) { L.push('- ' + r); }); if (rows.length > 12) L.push('- และอีก ' + (rows.length - 12) + ' รายการ'); };

  sec('โครงการเริ่มใน 7 วัน', active.filter(function (p) { return p.start && p.start >= tIso && p.start <= d7Iso; })
    .sort(function (a, b) { return a.start.localeCompare(b.start); }).map(function (p) {
      var t = mems(p), adv = advOf(p.id);
      return p.name + ' — เริ่ม ' + fd(p.start) + ' (อีก ' + days(p.start) + ' วัน) · ทีม ' + (t.length ? t.join(', ') : 'ยังไม่มีคน')
        + ' · Adv. ' + (adv.length ? advLbl(adv[0].status) : 'ยังไม่ได้ทำ');
    }));
  sec('โครงการจบใน 7 วัน', active.filter(function (p) { return p.end && p.end >= tIso && p.end <= d7Iso; })
    .map(function (p) { return p.name + ' — จบ ' + fd(p.end) + ' · ความคืบหน้า ' + (p.progress || 0) + '%'; }));
  sec('ถึงระยะจัดทำ Adv. แต่ยังไม่อนุมัติ', active.filter(function (p) {
      if (p.stage !== 'plan') return false;
      var a = advOf(p.id); return !a.length || a.every(function (x) { return x.status === 'draft' || x.status === 'pending'; });
    }).map(function (p) { var a = advOf(p.id); return p.name + (p.start ? ' — เริ่ม ' + fd(p.start) + ' (อีก ' + days(p.start) + ' วัน)' : '') + ' · ' + (a.length ? advLbl(a[0].status) : 'ยังไม่ได้ทำ Adv.'); }));
  sec('Adv. รออนุมัติ', (window.ADVANCES || []).filter(function (a) { return a.status === 'pending'; }).map(function (a) {
    var p = (window.PROJECTS || []).find(function (x) { return x.id === a.pid; }) || {};
    return (p.name || '-') + (a.amount ? ' · ' + fca(a.amount) + ' บาท' : '') + (a.rdate ? ' · ขอเมื่อ ' + fd(a.rdate) : '');
  }));
  sec('Adv. เลยกำหนดเคลียร์', (window.ADVANCES || []).filter(function (a) { return (a.status === 'disbursed' || a.status === 'clearing') && a.ddate && a.ddate < tIso; })
    .map(function (a) { var p = (window.PROJECTS || []).find(function (x) { return x.id === a.pid; }) || {}; return (p.name || '-') + ' · ครบกำหนด ' + fd(a.ddate) + ' (เลยมา ' + (-days(a.ddate)) + ' วัน) · ' + advLbl(a.status); }));
  sec('ที่พักยังไม่อนุมัติ (โครงการเริ่มใน 30 วัน)', active.filter(function (p) {
      if (!p.start || p.start < tIso || p.start > d30Iso) return false;
      var l = (window.LODGINGS || []).filter(function (x) { return x.pid === p.id; });
      return l.length && !l.some(function (x) { return x.approvedDaily === 'yes' || x.approvedMonthly === 'yes'; });
    }).map(function (p) { return p.name + ' — เริ่ม ' + fd(p.start) + ' (อีก ' + days(p.start) + ' วัน)'; }));

  var openSt = {}; (window.HD_STATUS || []).forEach(function (s) { openSt[s.id] = s.open !== false; });
  var tickets = (window.HELPDESK_TICKETS || []).filter(function (t) { return openSt[t.status]; });
  var now = new Date();
  var hospName = function (id) { var h = (window.HOSPITALS || []).find(function (x) { return x.id === id; }); return h ? h.name : ''; };
  sec('Helpdesk ด่วน (P1/P2) ที่ยังเปิดอยู่', tickets.filter(function (t) { return t.priority === 'p1' || t.priority === 'p2'; }).map(function (t) {
    var age = t.createdAt ? Math.round((now - new Date(t.createdAt)) / 3600000) : 0;
    return t.ticketNo + ' ' + t.priority.toUpperCase() + ' · ' + (hospName(t.hospitalId) || '-') + ' · ' + String(t.subject || '').slice(0, 60)
      + ' · เปิดมา ' + (age >= 24 ? Math.floor(age / 24) + ' วัน' : age + ' ชม.') + (t.assigneeId ? ' · ผู้ดูแล ' + _ovNick(t.assigneeId) : ' · ยังไม่มอบหมาย');
  }));
  var breached = tickets.filter(function (t) { return t.resolutionDue && new Date(t.resolutionDue) < now; });
  if (tickets.length) { L.push('', 'Helpdesk เปิดอยู่ทั้งหมด ' + tickets.length + ' เรื่อง · เกิน SLA ' + breached.length + ' เรื่อง · ยังไม่มอบหมาย ' + tickets.filter(function (t) { return !t.assigneeId; }).length + ' เรื่อง'); n++; }

  var LV = { sick: 'ลาป่วย', vacation: 'ลาพักร้อน', personal: 'ลากิจ', maternity: 'ลาคลอด', ordain: 'ลาบวช', other: 'ลา' };
  sec('ลางาน 7 วันนี้', (window.LEAVES || []).filter(function (l) { return l.status === 'approved' && l.startDate <= d7Iso && l.endDate >= tIso; })
    .map(function (l) { return _ovNick(l.staffId) + ' ' + (LV[l.leaveType] || 'ลา') + ' ' + fd(l.startDate) + (l.endDate !== l.startDate ? ' – ' + fd(l.endDate) : ''); }));
  sec('ใบลารออนุมัติ', (window.LEAVES || []).filter(function (l) { return l.status === 'pending'; })
    .map(function (l) { return _ovNick(l.staffId) + ' ' + (LV[l.leaveType] || 'ลา') + ' ' + fd(l.startDate); }));

  if (window.imtIsOverdue) {
    var od = {};
    (window.IMPL_TASKS || []).forEach(function (t) { if (window.imtIsOverdue(t)) od[t.projectId] = (od[t.projectId] || 0) + 1; });
    sec('ติดตามสถานะโครงการ: มีงานเกินกำหนด', Object.keys(od).sort(function (a, b) { return od[b] - od[a]; }).map(function (pid) {
      var ip = (window.IMPL_PROJECTS || []).find(function (x) { return x.id === pid; }); return (ip ? ip.name : pid) + ' · เกินกำหนด ' + od[pid] + ' งาน';
    }));
  }
  return { text: L.join('\n'), count: n };
}
function _ovAiRender(html, show) {
  var w = document.getElementById('ov-ai-wrap'); if (!w) return;
  w.style.display = show ? '' : 'none';
  w.innerHTML = html;
}
window.ovAiDaily = async function () {
  var btn = document.getElementById('ov-ai-btn');
  var facts = _ovAiFacts();
  var head = function (extra) {
    return '<div class="ai-card-head"><div class="sec-label" style="margin:0;">🤖 AI สรุปประจำวัน — ' + fd(_ovIso(new Date())) + '</div><div style="flex:1"></div>'
      + (extra || '') + '<button class="btn btn-ghost btn-sm" onclick="window.ovAiClose()">✕</button></div>';
  };
  if (!facts.count) { _ovAiRender('<div class="ai-card">' + head() + '<div style="font-size:13px;">✅ วันนี้ไม่มีเรื่องค้างที่ต้องติดตาม</div></div>', true); return; }
  if (btn) { btn.disabled = true; btn.textContent = '⏳ กำลังสรุป...'; }
  _ovAiRender('<div class="ai-card">' + head() + '<div style="color:var(--txt3);font-size:12.5px;">⏳ AI กำลังรวบรวมสิ่งที่ต้องทำวันนี้... (อาจใช้เวลาสักครู่)</div></div>', true);
  try {
    var text = await window.aiChat(
      'คุณเป็นผู้ช่วยหัวหน้าทีมติดตั้งระบบซอฟต์แวร์โรงพยาบาล สรุปสิ่งที่ทีมต้องทำจากข้อมูลที่ให้ เป็นภาษาไทย กระชับ อ่านจบใน 1 นาที ใช้หัวข้อ: '
      + '"## ต้องทำวันนี้" (เรื่องเร่งด่วนที่สุด เช่น Ticket P1, Adv. เลยกำหนด, โครงการจะเริ่มเร็ว ๆ นี้แต่ยังไม่พร้อม), '
      + '"## ภายในสัปดาห์นี้", "## เฝ้าระวัง" · แต่ละ bullet บอกเรื่อง + สิ่งที่ควรทำ (เช่น อนุมัติ/ติดตาม/จัดคน) · '
      + 'ถ้าโครงการจะเริ่มแต่ยังไม่มีทีม/ไม่มี Adv./ที่พักไม่อนุมัติ ให้ชี้ให้ชัด · ใช้ชื่อ ตัวเลข วันที่ตามข้อมูลเท่านั้น ห้ามแต่งเพิ่ม · หัวข้อที่ไม่มีเรื่องให้ข้ามไป',
      facts.text, { maxTokens: 1500, temperature: 0.3 });
    _ovAiText = text;
    _ovAiRender('<div class="ai-card">'
      + head('<button class="btn btn-ghost btn-sm" onclick="window.ovAiDaily()">🔁 สรุปใหม่</button><button class="btn btn-ghost btn-sm" onclick="window.ovAiCopy()">📋 คัดลอก</button>')
      + '<div class="ai-text">' + window.aiTextToHtml(text) + '</div>'
      + '<div class="ai-card-note">* สรุปโดย AI จากข้อมูลในระบบ ณ ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น. — ตรวจสอบก่อนนำไปใช้</div>'
      + '</div>', true);
  } catch (e) {
    _ovAiRender('<div class="ai-card">' + head() + '<div style="color:var(--coral);font-size:12.5px;">' + esc(String(e.message || e)) + '</div></div>', true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🤖 AI สรุปประจำวัน'; }
  }
};
window.ovAiClose = function () { _ovAiText = ''; _ovAiRender('', false); };
window.ovAiCopy = function () {
  if (!_ovAiText || !navigator.clipboard) return;
  navigator.clipboard.writeText(_ovAiText.replace(/\*\*/g, '')).then(function () { window.showAlert && window.showAlert('คัดลอกแล้ว', 'success'); });
};
