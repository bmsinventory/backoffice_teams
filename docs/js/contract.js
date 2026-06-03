const { esc, fd, fca, pd, uid, getYearBE, getColRef, getDocRef } = window;
const setDoc    = (...a) => window.setDoc(...a);
const deleteDoc = (...a) => window.deleteDoc(...a);

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
// "done" = progress 100% (stage forces 100) OR explicit status='completed'
// Note: saveProject always saves status:'active' — completion is tracked via progress_pct
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
  var tot = closed + open;
  var pct = tot > 0 ? Math.min(100, Math.round(closed / tot * 100)) : (c.status==='completed'?100:0);
  return { linked: linked.length, closed: closed, open: open, pct: pct };
}

// ── card section helpers ──────────────────────────────────────────────────────
function _ctDBox(label, value, color, bold){
  return '<div style="padding:10px 14px;text-align:center;min-width:88px;flex:1;">'
    +'<div style="font-size:9px;color:var(--txt3);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;white-space:nowrap;">'+label+'</div>'
    +'<div style="font-size:12px;font-weight:'+(bold?'700':'500')+';color:'+color+';white-space:nowrap;">'+value+'</div>'
    +'</div>';
}

function _ctFBox(label, value, subLabel, color, hl){
  return '<div style="flex:1;min-width:130px;background:'+(hl?color+'0d':'var(--bg)')+';border:1px solid '+(hl?color+'35':'var(--border)')+';border-radius:10px;padding:10px 14px;">'
    +'<div style="font-size:9px;color:var(--txt3);font-weight:600;text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px;white-space:nowrap;">'+label+'</div>'
    +'<div style="font-size:16px;font-weight:800;color:'+color+';line-height:1;">'+value+'</div>'
    +(subLabel?'<div style="font-size:10px;color:'+color+';opacity:.7;margin-top:3px;">'+subLabel+'</div>':'')
    +'</div>';
}

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
  var sortV    = (document.getElementById('ct-sort')||{}).value||'sign_desc';

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
    return '<div style="display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px 16px;flex:1;min-width:150px;">'
      +'<div style="width:36px;height:36px;border-radius:10px;background:'+s.c+'18;display:flex;align-items:center;justify-content:center;font-size:18px;">'+s.icon+'</div>'
      +'<div><div style="font-size:10px;color:var(--txt3);font-weight:600;text-transform:uppercase;letter-spacing:.5px;">'+s.label+'</div>'
      +'<div style="font-size:15px;font-weight:800;color:'+s.c+';">'+s.val+'</div></div>'
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
    var groupHtml = '<div style="display:flex;align-items:center;gap:10px;margin:22px 0 10px;padding:0 2px;">'
      +'<div style="width:4px;height:22px;background:var(--violet);border-radius:2px;flex-shrink:0;"></div>'
      +'<div style="font-size:13px;font-weight:700;color:var(--txt);">🏢 '+esc(cust)+'</div>'
      +'<span style="font-size:11px;color:var(--txt3);background:var(--surface2);padding:2px 8px;border-radius:10px;border:1px solid var(--border);">'+group.length+' สัญญา</span>'
      +'<div style="flex:1;height:1px;background:var(--border);"></div>'
      +'<div style="display:flex;gap:12px;">'
        +'<span style="font-size:11px;color:var(--txt3);">รวม <b style="color:var(--violet);">'+fca(gTotal)+'</b></span>'
        +(gClosed>0?'<span style="font-size:11px;color:var(--indigo);">✅ '+fca(gClosed)+'</span>':'')
        +(gOpen>0?'<span style="font-size:11px;color:var(--teal);">💸 '+fca(gOpen)+'</span>':'')
      +'</div>'
    +'</div>';

    // cards
    var cardsHtml = group.map(function(c){
      var st        = ctSt(c.status);
      var fin       = _ctFinance(c);
      var endD      = c.endDate ? pd(c.endDate) : null;
      var diff      = endD ? Math.ceil((endD - now)/864e5) : null;
      var expWarn   = c.status==='active' && diff!==null && diff>=0 && diff<=30;
      var expired   = c.status==='active' && diff!==null && diff<0;
      var canEdit   = window.ce ? window.ce() : false;
      var endColor  = (expWarn||expired) ? 'var(--coral)' : 'var(--txt2)';
      var endVal    = c.endDate ? fd(c.endDate)+(expWarn?' ⚠️':expired?' ⛔':'') : '—';

      var durStr = '';
      if(c.startDate && c.endDate){
        var mos = _ctMonthsBetween(c.startDate, c.endDate);
        if(mos>0 && mos%12===0) durStr = (mos/12)+' ปี';
        else if(mos>0) durStr = mos+' เดือน';
      }

      var safeId   = c.id.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      var safeName = esc(c.name||c.id).replace(/'/g,'&#39;');

      // progress bar color
      var pctColor = fin.pct===100 ? 'var(--teal)' : fin.pct>=60 ? 'var(--indigo)' : fin.pct>0 ? 'var(--amber)' : 'var(--border)';

      return '<div class="fade" style="background:var(--surface);border:1px solid var(--border);border-left:4px solid '+st.color+';border-radius:14px;padding:0;margin-bottom:12px;transition:box-shadow .15s,border-color .15s;overflow:hidden;cursor:pointer;" '
        +'onclick="window.openContractModal(\''+safeId+'\')" '
        +'onmouseenter="this.style.boxShadow=\'0 4px 20px rgba(0,0,0,.1)\';this.style.borderColor=\''+st.color+'\';" '
        +'onmouseleave="this.style.boxShadow=\'\';this.style.borderColor=\'var(--border)\';">'

        // ── section: header ──
        +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:14px 18px 10px;">'
          +'<span style="font-family:\'JetBrains Mono\',monospace;font-size:11px;background:'+st.color+'12;color:'+st.color+';border:1px solid '+st.color+'30;padding:2px 10px;border-radius:6px;font-weight:700;letter-spacing:.5px;">'+esc(c.id)+'</span>'
          +'<span style="background:'+st.color+'18;color:'+st.color+';font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;border:1px solid '+st.color+'30;white-space:nowrap;">'+st.label+'</span>'
          +(fin.linked>0?'<span style="background:var(--violet)12;color:var(--violet);font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;border:1px solid var(--violet)25;white-space:nowrap;">📁 '+fin.linked+' โครงการ</span>':'')
          +(expWarn?'<span style="background:var(--coral)12;color:var(--coral);font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;border:1px solid var(--coral)30;white-space:nowrap;">⏰ อีก '+diff+' วัน</span>':'')
          +(expired?'<span style="background:var(--coral)12;color:var(--coral);font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;border:1px solid var(--coral)30;white-space:nowrap;">⛔ หมดอายุแล้ว</span>':'')
          +'<div style="flex:1;"></div>'
          +(canEdit
              ?'<button class="btn btn-ghost btn-sm" style="font-size:11px;" onclick="event.stopPropagation();window.openContractModal(\''+safeId+'\')">✏️ แก้ไข</button>'
               +'<button class="btn btn-ghost btn-sm" style="color:var(--coral);font-size:11px;" onclick="event.stopPropagation();window.askDel(\'contract\',\''+safeId+'\',\''+safeName+'\')">🗑</button>'
              :'')
        +'</div>'

        // ── section: body ──
        +'<div style="display:flex;gap:12px;flex-wrap:wrap;padding:0 18px 12px;align-items:flex-start;">'

          // info
          +'<div style="flex:1;min-width:160px;">'
            +'<div style="font-size:14px;font-weight:700;color:var(--txt);line-height:1.4;margin-bottom:4px;">'+esc(c.name)+'</div>'
            +(c.note?'<div style="font-size:11px;color:var(--txt3);line-height:1.5;margin-top:4px;padding:5px 8px;background:var(--bg);border-radius:7px;border:1px solid var(--border);">📝 '+esc(c.note)+'</div>':'')
          +'</div>'

          // date strip
          +'<div style="display:flex;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--bg);flex-shrink:0;">'
            +_ctDBox('📋 ลงนาม', c.signDate?fd(c.signDate):'—', 'var(--txt2)', false)
            +'<div style="width:1px;background:var(--border);flex-shrink:0;"></div>'
            +_ctDBox('📅 เริ่มต้น', c.startDate?fd(c.startDate):'—', 'var(--txt2)', false)
            +'<div style="width:1px;background:var(--border);flex-shrink:0;"></div>'
            +_ctDBox('⏰ สิ้นสุด'+(durStr?' · '+durStr:''), endVal, endColor, expWarn||expired)
          +'</div>'

        +'</div>'

        // ── section: progress bar ──
        +'<div style="padding:0 18px 4px;">'
          +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">'
            +'<span style="font-size:10px;color:var(--txt3);">ความคืบหน้าการเรียกเก็บ'+(fin.linked>0?' (จาก '+fin.linked+' โครงการ)':'')+'</span>'
            +'<span style="font-size:11px;font-weight:700;color:'+pctColor+';">'+fin.pct+'%</span>'
          +'</div>'
          +'<div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden;">'
            +'<div style="height:100%;width:'+fin.pct+'%;background:'+pctColor+';border-radius:3px;transition:width .5s;"></div>'
          +'</div>'
        +'</div>'

        // ── section: financial boxes ──
        +'<div style="display:flex;gap:8px;flex-wrap:wrap;padding:12px 18px 16px;">'
          +_ctFBox('💰 มูลค่าสัญญารวม', fca(c.value), null, 'var(--violet)', true)
          +_ctFBox('✅ ปิดโครงการแล้ว', fca(fin.closed), fin.linked>0?fin.linked+' โครงการ':null, fin.closed>0?'var(--indigo)':'var(--txt3)', fin.closed>0)
          +_ctFBox('💸 ยังต้องเรียกเก็บ', fca(fin.open), fin.linked>0?'ที่ยังดำเนินการ':null, fin.open>0?'var(--teal)':'var(--txt3)', fin.open>0)
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
    var canEdit = window.ce ? window.ce() : false;
    foot.innerHTML = (canEdit && !isNew
      ? '<button class="btn btn-ghost" style="color:var(--coral);margin-right:auto" onclick="window.askDel(\'contract\',\''+c.id+'\',\''+esc((c.name||c.id)).replace(/'/g,'\\\'')+'\')" >🗑 ลบ</button>'
      : '<span></span>')
      +'<button class="btn btn-ghost" onclick="window.closeM(\'m-contract\')">ยกเลิก</button>'
      +(canEdit ? '<button class="btn btn-pri" onclick="window.saveContract()">💾 บันทึก</button>' : '');
  }
  window.openM('m-contract');
};

// ── SAVE ─────────────────────────────────────────────────────────────────────
window.saveContract = async function(){
  if(!window.auth||!window.auth.currentUser){ window.showAlert('กรุณาเข้าสู่ระบบ','warn'); return; }
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
  };

  try {
    await setDoc(getDocRef('CONTRACTS', docId), payload);
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

// ── DELETE ────────────────────────────────────────────────────────────────────
window.deleteContract = async function(id){
  if(!window.auth||!window.auth.currentUser) return;
  window.CONTRACTS = window.CONTRACTS.filter(function(x){return x.id!==id;});
  window.renderContract();
  try {
    await deleteDoc(getDocRef('CONTRACTS', id));
  } catch(e){
    window.showDbError(e);
  }
};
