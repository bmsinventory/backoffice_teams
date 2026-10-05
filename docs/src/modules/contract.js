const { esc, fd, fca, pd, uid, getYearBE, getColRef, getDocRef } = window;
const setDoc    = (...a) => window.setDoc(...a);
const deleteDoc = (...a) => window.deleteDoc(...a);

var _ctPendingTxns = [];

var CT_STATUS = [
  {id:'active',    label:'มีผลบังคับ', color:'#06d6a0'},
  {id:'completed', label:'สิ้นสุดแล้ว', color:'#4361ee'},
  {id:'cancelled', label:'ยกเลิก',      color:'#ff6b6b'},
];

function ctSt(id){ return CT_STATUS.find(function(s){return s.id===id;})||CT_STATUS[0]; }

function generateContractCode(){
  var year   = new Date().getFullYear();
  var prefix = year + '-';
  var nums   = (window.CONTRACTS||[])
    .filter(function(c){ return c.id && c.id.startsWith(prefix); })
    .map(function(c){ var n = parseInt(c.id.slice(prefix.length)); return isNaN(n) ? 0 : n; });
  var max = nums.length > 0 ? Math.max.apply(null, nums) : 0;
  return year + '-' + String(max + 1).padStart(4, '0');
}

function _ctMonthsBetween(startStr, endStr){
  var s = new Date(startStr), e = new Date(endStr);
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
}

window._ctCalcEndDate = function(){
  var startVal = (document.getElementById('ctf-start')||{}).value;
  var dur      = parseInt((document.getElementById('ctf-duration')||{}).value);
  var unit     = (document.getElementById('ctf-duration-unit')||{}).value || 'month';
  var endEl    = document.getElementById('ctf-end');
  if(!endEl || !startVal || isNaN(dur) || dur < 1) return;
  var d = new Date(startVal);
  if(unit === 'year') d.setFullYear(d.getFullYear() + dur);
  else d.setMonth(d.getMonth() + dur);
  endEl.value = d.toISOString().slice(0,10);
};

// ── linked-project financial breakdown per contract ───────────────────────────
function _ctFinance(c){
  var linked = (window.PROJECTS||[]).filter(function(p){ return p.contractId === c.id; });
  var closed = 0, open = 0;
  if(linked.length > 0){
    linked.forEach(function(p){
      var isDone      = p.stage === 'close' || p.status === 'completed';
      var isCancelled = p.status === 'cancelled';
      if(isDone)           closed += (p.cost||0);
      else if(!isCancelled) open  += (p.cost||0);
    });
  } else {
    closed = c.status === 'completed' ? c.value : 0;
    open   = c.status === 'active'    ? c.value : 0;
  }
  (c.transactions||[]).forEach(function(t){ closed += (t.amount||0); });
  var base = c.value > 0 ? c.value : (closed + open);
  var pct  = base > 0 ? Math.min(100, Math.round(closed / base * 100)) : (c.status==='completed'?100:0);
  return { linked: linked.length, closed: closed, open: open, pct: pct };
}

// ── render transaction list inside contract modal ────────────────────────────
function _ctRenderTxns(c){
  var list    = document.getElementById('ct-txn-list');
  var totalEl = document.getElementById('ct-txn-total');
  if(!list) return;

  var autoRows = (window.PROJECTS||[]).filter(function(p){
    return p.contractId === c.id && (p.stage === 'close' || p.status === 'completed');
  });
  var autoTotal   = autoRows.reduce(function(s,p){ return s+(p.cost||0); }, 0);
  var manualTotal = _ctPendingTxns.reduce(function(s,t){ return s+(t.amount||0); }, 0);
  if(totalEl) totalEl.textContent = fca(autoTotal + manualTotal);

  var today  = new Date().toISOString().slice(0,10);
  var safeId = c.id.replace(/\\/g,'\\\\').replace(/'/g,"\\'");

  var autoHtml = autoRows.map(function(p){
    var dateStr = p.end ? fd(p.end) : (p.start ? fd(p.start) : '—');
    return '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--indigo)08;border:1px solid var(--indigo)25;border-radius:8px;">'
      +'<span style="font-size:15px;flex-shrink:0;">📁</span>'
      +'<div style="flex:1;min-width:0;overflow:hidden;">'
        +'<div style="font-size:12px;font-weight:600;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(p.name||p.id)+'</div>'
        +'<div style="font-size:10px;color:var(--indigo);opacity:.8;">stage: close · อัตโนมัติ</div>'
      +'</div>'
      +'<div style="font-size:11px;color:var(--txt2);white-space:nowrap;flex-shrink:0;">'+dateStr+'</div>'
      +'<div style="font-size:13px;font-weight:700;color:var(--indigo);white-space:nowrap;flex-shrink:0;">'+fca(p.cost||0)+'</div>'
      +'<span style="font-size:9px;background:var(--indigo)15;color:var(--indigo);padding:2px 7px;border-radius:8px;border:1px solid var(--indigo)25;white-space:nowrap;flex-shrink:0;">🔒 Auto</span>'
    +'</div>';
  }).join('');

  var manualHtml = _ctPendingTxns.map(function(t,i){
    return '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--surface);border:1px solid var(--border);border-radius:8px;">'
      +'<span style="font-size:15px;flex-shrink:0;">📝</span>'
      +'<div style="flex:1;min-width:0;overflow:hidden;">'
        +'<div style="font-size:12px;font-weight:600;color:var(--txt);">'+esc(t.name||'รายการชำระ')+'</div>'
      +'</div>'
      +'<div style="font-size:11px;color:var(--txt2);white-space:nowrap;flex-shrink:0;">'+(t.date?fd(t.date):'—')+'</div>'
      +'<div style="font-size:13px;font-weight:700;color:var(--teal);white-space:nowrap;flex-shrink:0;">'+fca(t.amount||0)+'</div>'
      +'<button class="btn btn-ghost btn-sm ce-only" style="color:var(--coral);flex-shrink:0;" onclick="window._ctDelManualTxn('+i+',\''+safeId+'\')">🗑</button>'
    +'</div>';
  }).join('');

  var addRowHtml = '<div id="ct-txn-new-row" style="display:none;padding:10px 12px;background:var(--bg);border:1px dashed var(--border);border-radius:8px;">'
    +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
      +'<span style="font-size:15px;">📝</span>'
      +'<input type="text" id="ct-txn-new-name" placeholder="คำอธิบาย (ไม่บังคับ)" class="f-input" style="flex:1;min-width:100px;height:32px;font-size:12px;padding:4px 8px;">'
      +'<input type="date" id="ct-txn-new-date" value="'+today+'" class="f-input" style="width:145px;height:32px;font-size:12px;padding:4px 6px;flex-shrink:0;">'
      +'<input type="number" id="ct-txn-new-amount" placeholder="มูลค่า (฿)" min="0" class="f-input" style="width:110px;height:32px;font-size:12px;padding:4px 8px;flex-shrink:0;">'
      +'<button class="btn btn-pri btn-sm" style="height:32px;flex-shrink:0;" onclick="window._ctConfirmTxn(\''+safeId+'\')">✓ เพิ่ม</button>'
      +'<button class="btn btn-ghost btn-sm" style="height:32px;flex-shrink:0;" onclick="window._ctCancelTxn()">✕</button>'
    +'</div>'
  +'</div>';

  var hasData = autoRows.length > 0 || _ctPendingTxns.length > 0;
  list.innerHTML = (hasData ? autoHtml + manualHtml : '<div style="text-align:center;padding:12px;color:var(--txt3);font-size:12px;">ยังไม่มี Transaction</div>') + addRowHtml;
}

window._ctAddTxn = function(){
  var row = document.getElementById('ct-txn-new-row');
  if(row){
    row.style.display = '';
    var el = document.getElementById('ct-txn-new-name');
    if(el) el.focus();
  }
};

window._ctCancelTxn = function(){
  var row = document.getElementById('ct-txn-new-row');
  if(row) row.style.display = 'none';
};

window._ctConfirmTxn = function(contractId){
  var nameEl   = document.getElementById('ct-txn-new-name');
  var dateEl   = document.getElementById('ct-txn-new-date');
  var amountEl = document.getElementById('ct-txn-new-amount');
  var amount   = Number((amountEl||{}).value)||0;
  if(!amount){ window.showAlert('กรุณาระบุมูลค่า','warn'); return; }
  _ctPendingTxns.push({
    name:   ((nameEl||{}).value||'').trim() || 'รายการชำระ',
    date:   (dateEl||{}).value || new Date().toISOString().slice(0,10),
    amount: amount
  });
  var c = (window.CONTRACTS||[]).find(function(x){ return x.id === contractId; });
  if(c) _ctRenderTxns(c);
  if(nameEl)   nameEl.value   = '';
  if(amountEl) amountEl.value = '';
  if(dateEl)   dateEl.value   = new Date().toISOString().slice(0,10);
  var row = document.getElementById('ct-txn-new-row');
  if(row) row.style.display = 'none';
};

window._ctDelManualTxn = function(idx, contractId){
  _ctPendingTxns.splice(idx, 1);
  var c = (window.CONTRACTS||[]).find(function(x){ return x.id === contractId; });
  if(c) _ctRenderTxns(c);
};

window._ctSwitchTab = function(tab){
  var pInfo = document.getElementById('ct-pane-info');
  var pTxn  = document.getElementById('ct-pane-txn');
  var bInfo = document.getElementById('ct-tab-info');
  var bTxn  = document.getElementById('ct-tab-txn');
  if(pInfo) pInfo.style.display = tab === 'info' ? '' : 'none';
  if(pTxn)  pTxn.style.display  = tab === 'txn'  ? '' : 'none';
  [bInfo, bTxn].forEach(function(b){ if(!b) return;
    var active = (b.id === 'ct-tab-'+tab);
    b.style.color        = active ? 'var(--violet)' : 'var(--txt3)';
    b.style.borderBottom = active ? '2px solid var(--violet)' : '2px solid transparent';
    b.style.fontWeight   = active ? '700' : '600';
  });
};

// ── sort comparator ───────────────────────────────────────────────────────────
function _ctSort(sortV){
  return function(a,b){
    switch(sortV){
      case 'id_asc':    return (a.id||'').localeCompare(b.id||'');
      case 'id_desc':   return (b.id||'').localeCompare(a.id||'');
      case 'sign_asc':  return (a.signDate||'').localeCompare(b.signDate||'');
      case 'start_desc':return (b.startDate||'').localeCompare(a.startDate||'');
      case 'start_asc': return (a.startDate||'').localeCompare(b.startDate||'');
      case 'end_asc':   return (a.endDate||'9999').localeCompare(b.endDate||'9999');
      case 'end_desc':  return (b.endDate||'').localeCompare(a.endDate||'');
      case 'value_desc':return b.value - a.value;
      case 'value_asc': return a.value - b.value;
      default:          return (b.signDate||b.startDate||'').localeCompare(a.signDate||a.startDate||'');
    }
  };
}

// ── RENDER LIST ───────────────────────────────────────────────────────────────
window.renderContract = function(){
  var now = new Date();

  // ── populate year filter (once) ──
  var yf = document.getElementById('ct-yr');
  if(yf && yf.options.length <= 1){
    var yrs = [...new Set(window.CONTRACTS.map(function(c){ return c.startDate ? getYearBE(c.startDate) : null; }).filter(Boolean))].sort(function(a,b){return b-a;});
    yrs.forEach(function(y){ var o=document.createElement('option'); o.value=y; o.textContent='ปี พ.ศ. '+y; yf.appendChild(o); });
    if(!yf.value) yf.value = (new Date().getFullYear()+543).toString();
  }

  // ── populate customer filter (dynamic) ──
  var cf = document.getElementById('ct-customer');
  if(cf){
    var allCustomers = [...new Set(window.CONTRACTS.map(function(c){ return c.customer||''; }).filter(Boolean))].sort(function(a,b){ return a.localeCompare(b,'th'); });
    var prevCusts = Array.from(cf.options).slice(1).map(function(o){ return o.value; });
    if(allCustomers.join('|') !== prevCusts.join('|')){
      var savedCust = cf.value;
      while(cf.options.length > 1) cf.remove(1);
      allCustomers.forEach(function(cu){ var o=document.createElement('option'); o.value=cu; o.textContent=cu; cf.appendChild(o); });
      if(savedCust && allCustomers.includes(savedCust)) cf.value = savedCust;
    }
  }

  // ── read filters ──
  var q        = (document.getElementById('ct-q')||{}).value||'';
  var yr       = (document.getElementById('ct-yr')||{}).value||'';
  var status   = (document.getElementById('ct-status')||{}).value||'';
  var custFilt = (document.getElementById('ct-customer')||{}).value||'';
  var sortV    = (document.getElementById('ct-sort')||{}).value||'id_asc';

  // ── filter ──
  var rows = window.CONTRACTS.filter(function(c){
    if(status && c.status !== status) return false;
    if(yr && getYearBE(c.startDate) != yr) return false;
    if(custFilt && c.customer !== custFilt) return false;
    if(q){
      var lq = q.toLowerCase();
      return c.id.toLowerCase().includes(lq) || c.name.toLowerCase().includes(lq) || c.customer.toLowerCase().includes(lq);
    }
    return true;
  });

  // ── summary bar (before grouping) ──
  var totalVal     = rows.reduce(function(s,c){return s+c.value;},0);
  var completedVal = 0, activeVal = 0, expiringN = 0;
  rows.forEach(function(c){
    var f = _ctFinance(c);
    completedVal += f.closed;
    activeVal    += f.open;
    if(c.status==='active' && c.endDate){
      var diff=(pd(c.endDate)-now)/(864e5);
      if(diff>=0 && diff<=30) expiringN++;
    }
  });
  var bar = document.getElementById('ct-summary-bar');
  if(bar) bar.innerHTML = [
    {icon:'📄', label:'สัญญาทั้งหมด',          val:rows.length+' ฉบับ',     c:'var(--indigo)'},
    {icon:'💰', label:'มูลค่ารวม',              val:fca(totalVal),            c:'var(--violet)'},
    {icon:'✅', label:'ปิดโครงการแล้ว',        val:fca(completedVal),        c:'var(--indigo)'},
    {icon:'💸', label:'ยังต้องเรียกเก็บ',      val:fca(activeVal),           c:'var(--teal)'},
    {icon:'⏰', label:'ใกล้หมดอายุ (30 วัน)', val:expiringN+' ฉบับ',       c:expiringN>0?'var(--coral)':'var(--txt3)'},
  ].map(function(s){
    return '<div class="ct-kpi" style="--c:'+s.c+'">'
      +'<div class="ct-kpi-ic">'+s.icon+'</div>'
      +'<div style="min-width:0;"><div class="ct-kpi-lb">'+s.label+'</div>'
      +'<div class="ct-kpi-v">'+s.val+'</div></div>'
      +'</div>';
  }).join('');

  // ── container ──
  var container = document.getElementById('ct-rows');
  if(!container) return;

  if(rows.length === 0){
    container.innerHTML = '<div style="text-align:center;padding:64px 24px;color:var(--txt3);">'
      +'<div style="font-size:44px;margin-bottom:12px;">📄</div>'
      +'<div style="font-size:14px;font-weight:600;">ไม่พบข้อมูลสัญญา</div>'
      +'</div>';
    return;
  }

  // ── group by customer ──
  var custMap = {};
  rows.forEach(function(c){
    var k = c.customer || '(ไม่ระบุลูกค้า)';
    if(!custMap[k]) custMap[k] = [];
    custMap[k].push(c);
  });
  var sortedCustomers = Object.keys(custMap).sort(function(a,b){ return a.localeCompare(b,'th'); });

  // sort within each group
  sortedCustomers.forEach(function(cust){
    custMap[cust].sort(_ctSort(sortV));
  });

  // ── build HTML ──
  var html = sortedCustomers.map(function(cust){
    var group = custMap[cust];

    // group totals
    var gTotal = group.reduce(function(s,c){ return s+c.value; }, 0);
    var gClosed = 0, gOpen = 0;
    group.forEach(function(c){ var f=_ctFinance(c); gClosed+=f.closed; gOpen+=f.open; });

    // group header
    var groupHtml = '<div class="ct-group">'
      +'<div class="ct-group-bar"></div>'
      +'<div class="ct-group-name">🏢 '+esc(cust)+'</div>'
      +'<span class="ct-group-count">'+group.length+' สัญญา</span>'
      +'<div class="ct-group-line"></div>'
      +'<div class="ct-group-sum">'
        +'<span>รวม <b style="color:var(--violet);">'+fca(gTotal)+'</b></span>'
        +(gClosed>0?'<span>เก็บแล้ว <b style="color:var(--indigo);">'+fca(gClosed)+'</b></span>':'')
        +(gOpen>0?'<span>ค้างเก็บ <b style="color:var(--teal);">'+fca(gOpen)+'</b></span>':'')
      +'</div>'
    +'</div>';

    // cards
    var canEdit = window.canEdit ? window.canEdit('contract') : false;
    var canDel2 = window.canDel  ? window.canDel('contract')  : false;
    var cardsHtml = group.map(function(c){
      var st      = ctSt(c.status);
      var fin     = _ctFinance(c);
      var endD    = c.endDate ? pd(c.endDate) : null;
      var diff    = endD ? Math.ceil((endD - now)/864e5) : null;
      var expWarn = c.status==='active' && diff!==null && diff>=0 && diff<=30;
      var expired = c.status==='active' && diff!==null && diff<0;

      var durStr = '';
      if(c.startDate && c.endDate){
        var mos = _ctMonthsBetween(c.startDate, c.endDate);
        if(mos>0 && mos%12===0) durStr = (mos/12)+' ปี';
        else if(mos>0) durStr = mos+' เดือน';
      }

      var safeId   = c.id.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      var safeName = esc(c.name||c.id).replace(/'/g,'&#39;');
      var pctColor = fin.pct===100 ? 'var(--teal)' : fin.pct>=60 ? 'var(--indigo)' : fin.pct>0 ? 'var(--amber)' : 'var(--txt3)';

      return '<div class="ct-card fade" style="--c:'+st.color+'" onclick="window.openContractModal(\''+safeId+'\')">'

        // ── ซ้าย: รหัส + สถานะ + ชื่อ + วันที่ ──
        +'<div class="ct-main">'
        +'<div class="ct-head">'
          +'<span class="ct-id">'+esc(c.id)+'</span>'
          +'<span class="ct-chip">'+st.label+'</span>'
          +(fin.linked>0?'<span class="ct-chip" style="--c:var(--violet)">📁 '+fin.linked+' โครงการ</span>':'')
          +(expWarn?'<span class="ct-chip" style="--c:var(--coral)">⏰ อีก '+diff+' วัน</span>':'')
          +(expired?'<span class="ct-chip" style="--c:var(--coral)">⛔ หมดอายุแล้ว</span>':'')
        +'</div>'

        // ── ชื่อสัญญา + หมายเหตุ ──
        +'<div class="ct-title">'+esc(c.name)+'</div>'
        +(c.note?'<div class="ct-note">📝 '+esc(c.note)+'</div>':'')

        // ── วันที่ ──
        +'<div class="ct-dates">'
          +'<span>ลงนาม<b>'+(c.signDate?fd(c.signDate):'—')+'</b></span>'
          +'<span'+(expWarn||expired?' class="warn"':'')+'>ระยะเวลา<b>'+(c.startDate?fd(c.startDate):'—')+' – '+(c.endDate?fd(c.endDate):'—')+'</b>'+(durStr?' ('+durStr+')':'')+'</span>'
        +'</div>'
        +'</div>'

        // ── ขวา: การเงิน ──
        +'<div class="ct-fin">'
          +'<div class="ct-val-row">'
            +'<div class="ct-val-lb">มูลค่าสัญญา</div>'
            +'<div class="ct-val">'+fca(c.value)+'</div>'
          +'</div>'
          +'<div style="--pc:'+pctColor+'">'
            +'<div class="ct-prog-top"><span>เรียกเก็บแล้ว'+(fin.linked>0?' (จาก '+fin.linked+' โครงการ)':'')+'</span><b>'+fin.pct+'%</b></div>'
            +'<div class="ct-prog"><div style="width:'+fin.pct+'%"></div></div>'
            +'<div class="ct-prog-leg">'
              +'<span>✅ ปิดแล้ว <b style="color:'+(fin.closed>0?'var(--indigo)':'var(--txt3)')+'">'+fca(fin.closed)+'</b></span>'
              +'<span>💸 ค้างเก็บ <b style="color:'+(fin.open>0?'var(--teal)':'var(--txt3)')+'">'+fca(fin.open)+'</b></span>'
            +'</div>'
          +'</div>'
        +'</div>'

        +'<div class="ct-actions">'
          +(canEdit?'<button class="ct-icon-btn" title="แก้ไข" onclick="event.stopPropagation();window.openContractModal(\''+safeId+'\')">✏️</button>':'')
          +(canDel2?'<button class="ct-icon-btn del" title="ลบ" onclick="event.stopPropagation();window.askDel(\'contract\',\''+safeId+'\',\''+safeName+'\')">🗑</button>':'')
        +'</div>'

      +'</div>';
    }).join('');

    return groupHtml + cardsHtml;
  }).join('');

  container.innerHTML = html;
};

// ── OPEN MODAL ───────────────────────────────────────────────────────────────
window.openContractModal = function(id){
  var c = id ? window.CONTRACTS.find(function(x){return x.id===id;}) : null;
  var isNew = !c;
  document.getElementById('m-contract-title').textContent = isNew ? 'เพิ่มสัญญา' : 'แก้ไขสัญญา';
  var badge = document.getElementById('m-contract-id-badge');
  badge.style.display = isNew ? 'none' : '';
  badge.textContent   = isNew ? '' : c.id;

  document.getElementById('ctf-id').value       = isNew ? '' : c.id;
  document.getElementById('ctf-code').value     = isNew ? generateContractCode() : c.id;
  document.getElementById('ctf-name').value     = isNew ? '' : (c.name||'');
  document.getElementById('ctf-customer').value = isNew ? '' : (c.customer||'');
  document.getElementById('ctf-value').value    = isNew ? '' : (c.value||'');
  document.getElementById('ctf-status').value   = isNew ? 'active' : (c.status||'active');
  document.getElementById('ctf-note').value     = isNew ? '' : (c.note||'');

  var today = new Date().toISOString().slice(0,10);
  document.getElementById('ctf-sign').value  = isNew ? today : (c.signDate||'');
  document.getElementById('ctf-start').value = isNew ? today : (c.startDate||'');
  document.getElementById('ctf-end').value   = isNew ? '' : (c.endDate||'');

  var durEl  = document.getElementById('ctf-duration');
  var unitEl = document.getElementById('ctf-duration-unit');
  if(durEl)  durEl.value  = '';
  if(unitEl) unitEl.value = 'month';
  if(!isNew && c.startDate && c.endDate){
    var mos = _ctMonthsBetween(c.startDate, c.endDate);
    if(mos > 0 && mos % 12 === 0){
      if(durEl)  durEl.value  = mos / 12;
      if(unitEl) unitEl.value = 'year';
    } else if(mos > 0){
      if(durEl)  durEl.value  = mos;
      if(unitEl) unitEl.value = 'month';
    }
  }

  var foot = document.getElementById('m-contract-foot');
  if(foot){
    var canEditCt = isNew ? (window.canAdd ? window.canAdd('contract') : false) : (window.canEdit ? window.canEdit('contract') : false);
    var canDelCt  = !isNew && (window.canDel ? window.canDel('contract') : false);
    foot.innerHTML = (canDelCt
      ? '<button class="btn btn-ghost" style="color:var(--coral);margin-right:auto" onclick="window.askDel(\'contract\',\''+c.id+'\',\''+esc((c.name||c.id)).replace(/'/g,'\\\'')+'\')" >🗑 ลบ</button>'
      : '<span></span>')
      +'<button class="btn btn-ghost" onclick="window.closeM(\'m-contract\')">ยกเลิก</button>'
      +(canEditCt ? '<button class="btn btn-pri" onclick="window.saveContract()">💾 บันทึก</button>' : '');
  }

  // tabs + transactions (edit mode only)
  var tabBar = document.getElementById('ct-modal-tabs');
  if(tabBar) tabBar.style.display = isNew ? 'none' : 'flex';
  window._ctSwitchTab('info');
  _ctPendingTxns = isNew ? [] : (c.transactions||[]).map(function(t){ return Object.assign({},t); });
  if(!isNew) _ctRenderTxns(c);

  window.openM('m-contract');
};

// ── SAVE ─────────────────────────────────────────────────────────────────────
window.saveContract = async function(){
  if(!window.auth||!window.auth.currentUser){ window.showAlert('กรุณาเข้าสู่ระบบ','warn'); return; }
  var editIdCt = document.getElementById('ctf-id').value.trim();
  if (editIdCt ? !window.canEdit('contract') : !window.canAdd('contract')) { window.showAlert('คุณไม่มีสิทธิ์บันทึกสัญญา','warn'); return; }
  var editId   = document.getElementById('ctf-id').value.trim();
  var codeVal  = document.getElementById('ctf-code').value.trim();
  var nameVal  = document.getElementById('ctf-name').value.trim();
  var custVal  = document.getElementById('ctf-customer').value.trim();
  var valNum   = Number(document.getElementById('ctf-value').value)||0;
  var signVal  = document.getElementById('ctf-sign').value;
  var startVal = document.getElementById('ctf-start').value;
  var endVal   = document.getElementById('ctf-end').value;
  var noteVal  = document.getElementById('ctf-note').value.trim();
  var statVal  = document.getElementById('ctf-status').value;

  if(!codeVal){ window.showAlert('กรุณาระบุรหัสสัญญา','warn'); return; }
  if(!nameVal){ window.showAlert('กรุณาระบุชื่อโครงการ','warn'); return; }
  if(!custVal){ window.showAlert('กรุณาระบุชื่อลูกค้า / คู่สัญญา','warn'); return; }

  var docId = editId || codeVal;
  if(!editId && window.CONTRACTS.find(function(x){return x.id===docId;})){
    window.showAlert('รหัสสัญญา "'+docId+'" มีอยู่แล้ว กรุณาลองใหม่อีกครั้ง','warn'); return;
  }

  var payload = {
    contract_id:          docId,
    project_name:         nameVal,
    customer_name:        custVal,
    total_contract_value: valNum,
    contract_sign_date:   signVal,
    contract_start_date:  startVal,
    end_date:             endVal,
    note:                 noteVal,
    status:               statVal,
    transactions:         _ctPendingTxns,
  };

  try {
    await setDoc(getDocRef('CONTRACTS', docId), payload);
    window._applyLocalDoc('CONTRACTS', docId, payload);
    window.renderContract&&window.renderContract();
    window.closeM('m-contract');
    window.showAlert((editId ? 'แก้ไข' : 'เพิ่ม')+'สัญญาเรียบร้อยแล้ว','success');
  } catch(e){
    window.showDbError(e);
  }
};

// ── SMART SEARCH: ค้นหาลูกค้าจาก HOSPITALS ──────────────────────────────────
window._ctCustomerSearch = function(q){
  var dd = document.getElementById('ctf-customer-dd');
  if(!dd) return;
  if(!q || q.length < 1){ dd.style.display='none'; return; }
  var lq = q.toLowerCase();
  var matches = (window.HOSPITALS||[]).filter(function(h){
    return h.name.toLowerCase().includes(lq)
      || (h.code && h.code.toLowerCase().includes(lq))
      || (h.province && h.province.includes(q))
      || (h.district && h.district.includes(q));
  }).slice(0,10);
  if(matches.length === 0){ dd.style.display='none'; return; }
  dd.innerHTML = matches.map(function(h){
    var sub = [h.code, h.province, h.district].filter(Boolean).join(' · ');
    return '<div style="padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .1s;"'
      +' onmousedown="window._ctSelectCustomer(\''+h.name.replace(/'/g,'\\\'')+'\')"'
      +' onmouseenter="this.style.background=\'var(--surface2)\'" onmouseleave="this.style.background=\'\'">'
      +'<div style="font-size:13px;font-weight:600;color:var(--txt);">'+esc(h.name)+'</div>'
      +(sub?'<div style="font-size:11px;color:var(--txt3);margin-top:1px;">'+esc(sub)+'</div>':'')
      +'</div>';
  }).join('');
  dd.style.display='block';
};

window._ctSelectCustomer = function(name){
  var inp = document.getElementById('ctf-customer');
  var dd  = document.getElementById('ctf-customer-dd');
  if(inp) inp.value = name;
  if(dd)  dd.style.display = 'none';
};

