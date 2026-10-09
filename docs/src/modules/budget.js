// ── BUDGET SUMMARY ──
(function(){
var _charts={};
var _budCurTab='budget';

// ── แท็บย่อยเมนู งบประมาณ & ค่าใช้จ่าย: ภาพรวมงบ | รายการค่าใช้จ่าย | เจ้าของไซต์ ──
// view-budget / view-cost ใช้แถบเดียวกัน — รายการค่าใช้จ่ายยังเป็น module/สิทธิ์ของตัวเอง (cost)
// ภาพรวมงบ + เจ้าของไซต์ เป็นแท็บภายใน view-budget (สิทธิ์ budget)
window.budRenderSubnav=function(){
  var cur=document.body.getAttribute('data-view')==='cost'?'cost':_budCurTab;
  var tabs=[
    {id:'budget',perm:'budget',label:'📊 ภาพรวมงบ'},
    {id:'cost',perm:'cost',label:'💰 รายการค่าใช้จ่าย'},
    {id:'owner',perm:'budget',label:'🏢 เจ้าของไซต์'},
  ].filter(function(t){return !window.canView||window.canView(t.perm);});
  var html=tabs.map(function(t){return'<div class="adv-subtab'+(t.id===cur?' on':'')+'" onclick="window._budSwitchTab(\''+t.id+'\')">'+t.label+'</div>';}).join('');
  document.querySelectorAll('[data-bud-subnav]').forEach(function(el){el.innerHTML=html;});
};

window._budSwitchTab=function(tab){
  if(tab==='cost'){window.goView('cost',true);return;}
  _budCurTab=tab;
  if(document.body.getAttribute('data-view')!=='budget')window.goView('budget',true);
  else window.renderBudget();
};

window.renderBudget=function(){
  window.budRenderSubnav();
  var pb=document.getElementById('bud-pane-budget');
  var po=document.getElementById('bud-pane-owner');
  var tb=document.getElementById('bud-toolbar');
  if(pb)pb.style.display=_budCurTab==='budget'?'':'none';
  if(po)po.style.display=_budCurTab==='owner'?'':'none';
  if(tb)tb.style.display=_budCurTab==='budget'?'':'none';
  if(_budCurTab==='owner'){_renderOwner();return;}
  _renderBudgetTab();
};

window.renderSiteOwner=function(){_renderOwner();};

// ── Expand / collapse owner row ──
window._soToggle=function(headerEl){
  var card=headerEl.parentElement;
  var sub=card.querySelector('.so-sub');
  var chev=headerEl.querySelector('.so-chev');
  if(!sub)return;
  var open=sub.style.display!=='none';
  sub.style.display=open?'none':'';
  if(chev)chev.style.transform=open?'':'rotate(90deg)';
};

// ── Budget Tab ──────────────────────────────────────────────
// การ์ดสรุปขนาดกะทัดรัด — หน้าตาเดียวกับแถบสรุปของแท็บรายการค่าใช้จ่าย (cost-summary-bar)
function _statCard(s){
  return'<div class="stat-card" style="flex:0 0 auto;min-width:180px;">'
    +'<div class="stat-icon" style="background:'+s.color+'1f;color:'+s.color+'">'+s.icon+'</div>'
    +'<div><div class="stat-val" style="color:'+s.color+'">'+s.v+'</div>'
    +'<div class="stat-lbl">'+s.k+(s.s?' · '+s.s:'')+window.calcTip(s.tip)+'</div></div>'
    +'</div>';
}

// เติมตัวเลือกปี พ.ศ. จากวันเริ่มโครงการ (ครั้งเดียว) — ค่าเริ่มต้น = ปีปัจจุบัน
function _fillYearSel(id){
  var yf=document.getElementById(id);
  if(!yf||yf.options.length>1)return;
  var yrs=[...new Set((window.PROJECTS||[]).map(function(p){return window.getYearBE(p.start);}).filter(Boolean))].sort(function(a,b){return b-a;});
  yrs.forEach(function(y){var o=document.createElement('option');o.value=y;o.textContent='ปี พ.ศ. '+y;yf.appendChild(o);});
  if(!yf.value)yf.value=(new Date().getFullYear()+543).toString();
}

// ── สถานะงบ (status palette — ใช้สีคู่กับไอคอน + ชื่อเสมอ ไม่ใช้สีอย่างเดียว) ──
window.BUD_HEALTH={
  over:    {label:'เกินงบ',        icon:'🔴',color:'#ff6b6b'},
  warn:    {label:'ใกล้เกิน (≥80%)',icon:'🟡',color:'#ffa62b'},
  ok:      {label:'ปกติ',          icon:'🟢',color:'#06d6a0'},
  nobudget:{label:'ไม่ได้ตั้งงบ',    icon:'⚪',color:'#9ba3b8'},
};
// ใช้งบนำหน้าความคืบหน้างานเกินเท่านี้ (จุดเปอร์เซ็นต์) = สัญญาณเตือนล่วงหน้าว่าจะเกินงบเมื่องานเสร็จ
var _BURN_GAP=20;
var _COMMIT_ST={approved:1,disbursed:1,clearing:1};

// ── คำนวณงบรายโครงการ (ใช้ร่วมกับ exportBudget) ──
// ใช้จริง   = COSTS ทั้งหมดของโครงการ (Advance ที่เคลียร์แล้วถูกแตกเป็น COSTS อยู่แล้ว — advSyncCosts)
//            ถ้า Advance เคลียร์แล้วแต่ไม่มี COSTS ผูกอยู่เลย ใช้ยอดเคลียร์ของ Advance นั้นแทน
// ผูกพัน    = Advance ที่อนุมัติ/เบิกแล้ว/รอเคลียร์ (เงินออกไปแล้วหรือกำลังจะออก แต่ยังไม่มีรายการจริง)
// รออนุมัติ = Advance สถานะ pending — แสดงเป็นสัญญาณล่วงหน้า ไม่นับเป็นการใช้งบ
// ไม่รวมโครงการที่ยกเลิก
window.budCalcRows=function(f){
  f=f||{};
  var q=(f.q||'').toLowerCase();
  var costBy={},advCosted={};
  (window.COSTS||[]).forEach(function(c){
    costBy[c.pid]=(costBy[c.pid]||0)+(c.amount||0);
    if(c.advanceId)advCosted[c.advanceId]=1;
  });
  var commitBy={},pendBy={};
  (window.ADVANCES||[]).forEach(function(a){
    if(_COMMIT_ST[a.status])commitBy[a.pid]=(commitBy[a.pid]||0)+(a.amount||0);
    else if(a.status==='pending')pendBy[a.pid]=(pendBy[a.pid]||0)+(a.amount||0);
    else if(a.status==='cleared'&&!advCosted[a.id])costBy[a.pid]=(costBy[a.pid]||0)+(a.cleared||a.amount||0);
  });
  var rows=(window.PROJECTS||[]).filter(function(p){
    if(p.status==='cancelled')return false;
    if(f.yr&&window.getYearBE(p.start)!=f.yr)return false;
    if(f.grp&&p.groupId!==f.grp)return false;
    if(f.type&&f.type.length&&!f.type.includes(p.typeId))return false;
    if(q&&!p.name.toLowerCase().includes(q))return false;
    return true;
  }).map(function(p){
    var budget=p.cost||0,actual=costBy[p.id]||0,committed=commitBy[p.id]||0;
    var used=actual+committed,remain=budget-used;
    var pct=budget>0?Math.round(used/budget*100):0;
    var progress=Math.max(0,Math.min(100,Math.round(p.progress||0)));
    var health=budget<=0?(used>0?'nobudget':'ok'):remain<0?'over':pct>=80?'warn':'ok';
    // จบแล้ว = ความคืบหน้า 100% หรือสถานะเสร็จสิ้น — งบที่เหลือของโครงการที่จบแล้วคือ "ประหยัดได้" ไม่ใช่งบที่ยังใช้ได้
    var done=progress>=100||p.status==='completed';
    var burnAhead=!done&&budget>0&&health!=='over'&&pct>=30&&pct-progress>=_BURN_GAP;
    return{done:done,p:p,budget:budget,actual:actual,committed:committed,pending:pendBy[p.id]||0,used:used,remain:remain,pct:pct,progress:progress,health:health,burnAhead:burnAhead};
  });
  if(f.status==='burn')rows=rows.filter(function(r){return r.burnAhead;});
  else if(f.status)rows=rows.filter(function(r){return r.health===f.status;});
  var s=f.sort;
  var thCmp=s==='name_asc'?new Intl.Collator('th').compare:null; // = localeCompare(...,'th') แต่สร้างครั้งเดียว
  if(s)rows.sort(function(a,b){
    if(s==='pct_desc')return b.pct-a.pct;
    if(s==='pct_asc')return a.pct-b.pct;
    if(s==='budget_desc')return b.budget-a.budget;
    if(s==='remain_asc')return a.remain-b.remain;
    if(s==='gap_desc')return (b.pct-b.progress)-(a.pct-a.progress);
    if(s==='name_asc')return thCmp(a.p.name,b.p.name);
    return 0;
  });
  return rows;
};

function _budFilters(){
  var v=function(id){return(document.getElementById(id)||{}).value||'';};
  return{yr:v('bud-yr'),grp:v('bud-grp'),type:window.msValues?window.msValues('bud-type'):[],q:v('bud-q'),status:v('bud-status'),sort:v('bud-sort')||'pct_desc'};
}
window._budFilters=_budFilters;

// กดชิปสถานะ / ดูทั้งหมด → กรองตารางรายโครงการ แล้วเลื่อนลงไปที่ตาราง
window._budSetStatus=function(st){
  var el=document.getElementById('bud-status');
  if(el)el.value=st;
  _renderBudgetTab();
  var t=document.getElementById('bud-table-card');
  if(t)t.scrollIntoView({behavior:'smooth',block:'start'});
};

// ฿ แบบย่อสำหรับแกนกราฟ
function _fk(n){
  var a=Math.abs(n);
  return'฿'+(a>=1e6?(n/1e6).toFixed(a>=1e7?0:1)+'M':a>=1e3?Math.round(n/1e3)+'K':Math.round(n));
}
function _pctBar(pct,color){
  return'<div style="display:flex;align-items:center;gap:6px;">'
    +'<div style="flex:1;height:6px;background:var(--surface2);border-radius:4px;overflow:hidden;">'
      +'<div style="width:'+Math.min(pct,100)+'%;height:100%;background:'+color+';border-radius:4px;"></div>'
    +'</div>'
    +'<span style="font-size:11px;font-weight:700;color:var(--txt2);min-width:34px;text-align:right;">'+pct+'%</span>'
  +'</div>';
}
function _hTag(h){
  var H=window.BUD_HEALTH[h];
  return'<span style="display:inline-flex;align-items:center;gap:3px;background:'+H.color+'1f;color:var(--txt2);border-radius:4px;padding:1px 7px;font-size:10px;font-weight:600;white-space:nowrap;">'+H.icon+' '+H.label+'</span>';
}
function _card(title,body,extra){
  return'<div class="ov-card"'+(extra||'')+'><div class="ov-card-title">'+title+'</div>'+body+'</div>';
}
// แบ่งงบโครงการเป็น ใช้จริง | ผูกพัน | คงเหลือ (รวมกัน = งบ) + เกินงบ ส่วนที่เกิน
function _split(r){
  var act=Math.min(r.actual,r.budget),com=Math.max(0,Math.min(r.committed,r.budget-act));
  return{act:act,com:com,rem:r.budget-act-com,over:Math.max(0,r.used-r.budget)};
}
var _TH_MON=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function _renderBudgetTab(){
  _fillYearSel('bud-yr');
  window.msFilter('bud-type',window.PTYPES,{placeholder:'ทุกประเภท',onChange:window.renderBudget});
  var gf=document.getElementById('bud-grp');
  if(gf&&gf.options.length<=1){
    (window.PGROUPS||[]).forEach(function(g){var o=document.createElement('option');o.value=g.id;o.textContent=g.label;gf.appendChild(o);});
  }
  var f=_budFilters();
  // ส่วนสรุปทั้งหมดใช้โครงการตาม ปี/กลุ่ม/ค้นหา — ตัวกรองสถานะงบ + การเรียง มีผลเฉพาะตารางรายโครงการ
  var all=window.budCalcRows({yr:f.yr,grp:f.grp,type:f.type,q:f.q});
  var H=window.BUD_HEALTH;

  var T={budget:0,actual:0,committed:0,pending:0,used:0};
  all.forEach(function(r){T.budget+=r.budget;T.actual+=r.actual;T.committed+=r.committed;T.pending+=r.pending;T.used+=r.used;});
  var remain=T.budget-T.used;
  var pctUsed=T.budget>0?Math.round(T.used/T.budget*100):0;
  var cnt={over:0,warn:0,ok:0,nobudget:0,burn:0};
  all.forEach(function(r){cnt[r.health]++;if(r.burnAhead)cnt.burn++;});
  var allPids=new Set(all.map(function(r){return r.p.id;}));
  var pendN=(window.ADVANCES||[]).filter(function(a){return a.status==='pending'&&allPids.has(a.pid);}).length;

  // ── 1. KPI ──
  var kpi=document.getElementById('bud-kpi');
  if(kpi)kpi.innerHTML=[
    {k:'งบประมาณรวม',tip:'ผลรวม "มูลค่าโครงการ" ของโครงการตามตัวกรอง ปี (วันเริ่ม) / กลุ่ม / ประเภท / ค้นหา\nไม่รวมโครงการที่ยกเลิก',v:window.fc(T.budget),s:all.length+' โครงการ',icon:'💵',color:'#4361ee'},
    {k:'ใช้จริง',tip:"ผลรวมรายการค่าใช้จ่าย (หน้า \"รายการค่าใช้จ่าย\") ของโครงการ\nAdvance ที่เคลียร์แล้วแต่ยังไม่ถูกแตกเป็นรายการค่าใช้จ่าย จะใช้ยอดเคลียร์ของ Advance แทน\n% ของงบ = ใช้จริง ÷ งบประมาณรวม × 100",v:window.fc(T.actual),s:(T.budget>0?Math.round(T.actual/T.budget*100):0)+'% ของงบ',icon:'💰',color:'#e76f51'},
    {k:'ผูกพัน (Advance ยังไม่เคลียร์)',tip:"Advance ที่สถานะ อนุมัติแล้ว / เบิกแล้ว / รอเคลียร์ (เงินออกไปแล้วหรือกำลังจะออก แต่ยังไม่มีรายการค่าใช้จ่ายจริง)\nไม่นับ Advance ที่รออนุมัติ",v:window.fc(T.committed),icon:'💳',color:'#7209b7'},
    {k:'คงเหลือใช้ได้',tip:'งบประมาณรวม − ใช้จริง − ผูกพัน\n% ใช้แล้ว = (ใช้จริง + ผูกพัน) ÷ งบประมาณรวม × 100',v:window.fc(remain),s:pctUsed+'% ใช้แล้ว',icon:'📊',color:remain>=0?'#06d6a0':'#ff6b6b'},
    {k:'ต้องจับตา',tip:'จำนวนโครงการที่ เกินงบ + ใกล้เกิน (≥80%) + ไม่ได้ตั้งงบแต่มีค่าใช้จ่าย + ใช้เงินนำหน้างาน\nใช้เงินนำหน้างาน = ยังไม่จบ, ใช้งบ ≥ 30% และ % ใช้งบ − % คืบหน้า ≥ 20 จุด',v:(cnt.over+cnt.warn+cnt.burn+cnt.nobudget)+' โครงการ',s:cnt.over+' เกินงบ',icon:'⚠️',color:cnt.over?'#ff6b6b':'#ffa62b'},
  ].map(_statCard).join('');

  // ── 2. สถานะงบ & ช่วงโครงการ ──
  // แบ่งงบแต่ละโครงการเป็น ใช้จริง | ผูกพัน | คงเหลือ | เกินงบ แล้วรวมตามช่วง (กำลังดำเนินการ / จบแล้ว)
  // คงเหลือของโครงการที่จบแล้ว = "ประหยัดได้" · คงเหลือของโครงการที่กำลังทำ = งบที่ยังใช้ได้
  var PH=[
    {id:'active',label:'🚧 กำลังดำเนินการ',remLabel:'คงเหลือใช้ได้',n:0,budget:0,act:0,com:0,rem:0,over:0,overN:0,prog:0},
    {id:'done',label:'✅ จบแล้ว',remLabel:'ประหยัดได้',n:0,budget:0,act:0,com:0,rem:0,over:0,overN:0,prog:0},
  ];
  all.forEach(function(r){
    if(r.budget<=0)return;
    var ph=PH[r.done?1:0],s=_split(r);
    ['act','com','rem','over'].forEach(function(k){ph[k]+=s[k];});
    ph.n++;ph.budget+=r.budget;ph.prog+=r.progress*r.budget;if(s.over>0)ph.overN++;
  });
  var fact=function(ph){
    var pct=ph.budget>0?Math.round((ph.act+ph.com+ph.over)/ph.budget*100):0;
    return'<div style="font-size:11.5px;color:var(--txt2);padding:3px 0;line-height:1.6;">'
      +'<b style="color:var(--txt);">'+ph.label+'</b> <span style="color:var(--txt3);">'+ph.n+' โครงการ · งบ '+window.fc(ph.budget)+'</span><br>'
      +'ใช้งบ <b>'+pct+'%</b>'+(ph.id==='active'?' · งานเดินไปเฉลี่ย <b>'+(ph.budget>0?Math.round(ph.prog/ph.budget):0)+'%</b>':'')
      +' · '+ph.remLabel+' <b style="color:'+(ph.id==='done'?'#06d6a0':'var(--txt)')+';">'+window.fc(ph.rem)+'</b>'
      +(ph.overN?' · <span style="color:#ff6b6b;">🔴 เกินงบ '+ph.overN+' โครงการ ('+window.fc(ph.over)+')</span>':'')
    +'</div>';
  };
  var statusHtml=
    '<div style="position:relative;height:130px;"><canvas id="bud-c-phase"></canvas></div>'
    +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:4px 16px;margin:8px 0 14px;">'+PH.map(fact).join('')+'</div>'
    +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;">'
      +['over','warn','ok','nobudget'].map(function(k){
        return'<div onclick="window._budSetStatus(\''+k+'\')" title="กรองตารางรายโครงการ" style="cursor:pointer;border:1px solid var(--border);border-left:3px solid '+H[k].color+';border-radius:8px;padding:7px 10px;" onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'\'">'
          +'<div style="font-size:17px;font-weight:800;color:var(--txt);">'+cnt[k]+'</div>'
          +'<div style="font-size:11px;color:var(--txt3);">'+H[k].icon+' '+H[k].label+'</div></div>';
      }).join('')
    +'</div>'
    +(T.pending>0?'<div style="margin-top:12px;font-size:11px;color:var(--txt2);background:var(--surface2);border-radius:8px;padding:8px 10px;">⏳ มีคำขอเบิกรออนุมัติ <b>'+pendN+'</b> รายการ รวม <b>'+window.fc(T.pending)+'</b> — ถ้าอนุมัติทั้งหมด คงเหลือจะเหลือ <b style="color:'+(remain-T.pending<0?'#ff6b6b':'var(--txt)')+';">'+window.fc(remain-T.pending)+'</b></div>':'');


  // ── 5. หมวดค่าใช้จ่าย (ขนาด = แท่งสีเดียว เรียงมาก→น้อย, เกิน 7 หมวดรวมเป็น "อื่น ๆ") ──
  var pidSet={};all.forEach(function(r){pidSet[r.p.id]=1;});
  var costs=(window.COSTS||[]).filter(function(c){return pidSet[c.pid];});
  var catSum={};
  costs.forEach(function(c){catSum[c.category]=(catSum[c.category]||0)+(c.amount||0);});
  var cats=Object.keys(catSum).map(function(k){return{k:k,v:catSum[k]};}).filter(function(c){return c.v>0;}).sort(function(a,b){return b.v-a.v;});
  if(cats.length>8){var rest=cats.slice(7).reduce(function(s,c){return s+c.v;},0);cats=cats.slice(0,7).concat([{k:'_rest',v:rest}]);}
  var catTotal=cats.reduce(function(s,c){return s+c.v;},0)||1;
  var catMax=cats.length?cats[0].v:1;
  var CC=window.COST_CAT||{};
  var catHtml=cats.length?cats.map(function(c){
    var info=c.k==='_rest'?{label:'หมวดอื่น ๆ',icon:'➕'}:(CC[c.k]||CC.other||{label:c.k,icon:'📝'});
    return'<div title="'+window.esc(info.label)+' '+window.fc(c.v)+'" style="display:grid;grid-template-columns:minmax(110px,150px) 1fr auto;align-items:center;gap:10px;padding:5px 0;">'
      +'<div style="font-size:12px;color:var(--txt2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+info.icon+' '+window.esc(info.label)+'</div>'
      +'<div style="height:10px;background:var(--surface2);border-radius:4px;overflow:hidden;"><div style="width:'+(c.v/catMax*100)+'%;height:100%;background:#4361ee;border-radius:0 4px 4px 0;"></div></div>'
      +'<div style="font-size:12px;font-weight:700;color:var(--txt);text-align:right;min-width:120px;">'+window.fc(c.v)+' <span style="color:var(--txt3);font-weight:500;">'+Math.round(c.v/catTotal*100)+'%</span></div>'
    +'</div>';
  }).join(''):'<div style="padding:30px;text-align:center;color:var(--txt3);font-size:12px;">ยังไม่มีค่าใช้จ่าย</div>';

  // ── 6. ต้องจับตา (เหตุผลกำกับทุกแถว) ──
  var rank=function(r){return r.health==='over'?0:r.health==='nobudget'?1:r.burnAhead?2:r.health==='warn'?3:9;};
  var watch=all.filter(function(r){return rank(r)<9;}).sort(function(a,b){return rank(a)-rank(b)||a.remain-b.remain;});
  var watchHtml=watch.length?'<div style="overflow-x:auto;"><table class="t-table" style="min-width:720px;"><thead><tr>'
      +'<th>โครงการ</th><th>เหตุผล</th><th style="text-align:right">งบ (฿)</th><th style="text-align:right">ใช้+ผูกพัน (฿)</th><th style="text-align:right">คงเหลือ (฿)</th><th style="width:150px">% ใช้งบ</th><th style="width:70px;text-align:right">คืบหน้า</th>'
    +'</tr></thead><tbody>'
    +watch.slice(0,10).map(function(r){
      var why=r.health==='over'?'เกินงบ '+window.fc(-r.remain)
        :r.health==='nobudget'?'มีค่าใช้จ่ายแต่ไม่ได้ตั้งงบ'
        :r.burnAhead?'ใช้งบ '+r.pct+'% แต่งานคืบหน้า '+r.progress+'%'
        :'ใช้งบไปแล้ว '+r.pct+'%';
      return'<tr onclick="window.openProjModal(\''+r.p.id+'\')" style="cursor:pointer;">'
        +'<td style="font-weight:600;font-size:12px;">'+window.esc(r.p.name)+'</td>'
        +'<td>'+(r.burnAhead?'<span style="display:inline-flex;gap:3px;background:#ffa62b1f;color:var(--txt2);border-radius:4px;padding:1px 7px;font-size:10px;font-weight:600;white-space:nowrap;">🔥 ใช้เงินนำหน้างาน</span>':_hTag(r.health))
          +'<div style="font-size:11px;color:var(--txt3);margin-top:3px;">'+why+'</div></td>'
        +'<td style="text-align:right;">'+window.fc(r.budget)+'</td>'
        +'<td style="text-align:right;font-weight:600;">'+window.fc(r.used)+'</td>'
        +'<td style="text-align:right;'+(r.remain<0?'color:#ff6b6b;font-weight:700;':'')+'">'+window.fc(r.remain)+'</td>'
        +'<td>'+(r.budget>0?_pctBar(r.pct,H[r.health].color):'<span style="font-size:11px;color:var(--txt3);">—</span>')+'</td>'
        +'<td style="text-align:right;font-size:12px;">'+r.progress+'%</td>'
      +'</tr>';
    }).join('')+'</tbody></table></div>'
    +(watch.length>10?'<div style="padding:10px 4px 0;font-size:12px;color:var(--txt3);">และอีก '+(watch.length-10)+' โครงการ — ใช้ตัวกรอง "สถานะงบ" ด้านบนเพื่อดูทั้งหมด</div>':'')
    :'<div style="padding:30px;text-align:center;color:var(--txt3);font-size:12px;">✅ ไม่มีโครงการที่ต้องจับตา</div>';

  // ── 7. แยกตามกลุ่มโครงการ ──
  var gMap={};
  all.forEach(function(r){
    var g=gMap[r.p.groupId]||(gMap[r.p.groupId]={id:r.p.groupId,n:0,budget:0,actual:0,committed:0,over:0});
    g.n++;g.budget+=r.budget;g.actual+=r.actual;g.committed+=r.committed;if(r.health==='over')g.over++;
  });
  var groups=Object.values(gMap).sort(function(a,b){return b.budget-a.budget;});
  var groupHtml='<div style="overflow-x:auto;"><table class="t-table" style="min-width:720px;"><thead><tr>'
      +'<th>กลุ่ม</th><th style="text-align:right">โครงการ</th><th style="text-align:right">งบ (฿)</th><th style="text-align:right">ใช้จริง (฿)</th><th style="text-align:right">ผูกพัน (฿)</th><th style="text-align:right">คงเหลือ (฿)</th><th style="width:160px">% ใช้งบ</th>'
    +'</tr></thead><tbody>'
    +groups.map(function(g){
      var pg=window.gG(g.id);
      var used=g.actual+g.committed,rem=g.budget-used,pct=g.budget>0?Math.round(used/g.budget*100):0;
      var h=g.budget<=0?(used>0?'nobudget':'ok'):rem<0?'over':pct>=80?'warn':'ok';
      return'<tr onclick="var s=document.getElementById(\'bud-grp\');if(s){s.value=\''+g.id+'\';window.renderBudget();}" style="cursor:pointer;" title="กรองเฉพาะกลุ่มนี้">'
        +'<td><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:'+(pg&&pg.color||'#9ba3b8')+';margin-right:6px;"></span><b style="font-size:12px;">'+window.esc(pg&&pg.label||'(ไม่ระบุกลุ่ม)')+'</b>'
          +(g.over?' <span style="font-size:10px;color:var(--txt3);">· 🔴 '+g.over+' เกินงบ</span>':'')+'</td>'
        +'<td style="text-align:right;">'+g.n+'</td>'
        +'<td style="text-align:right;font-weight:600;">'+window.fc(g.budget)+'</td>'
        +'<td style="text-align:right;">'+window.fc(g.actual)+'</td>'
        +'<td style="text-align:right;">'+window.fc(g.committed)+'</td>'
        +'<td style="text-align:right;'+(rem<0?'color:#ff6b6b;font-weight:700;':'')+'">'+window.fc(rem)+'</td>'
        +'<td>'+(g.budget>0?_pctBar(pct,H[h].color):'')+'</td>'
      +'</tr>';
    }).join('')+'</tbody></table></div>';

  // ── 3. แยกตามประเภทโครงการ (ทุกโครงการตามตัวกรอง) — แท่งซ้อนเป็นบาท เห็นทั้งขนาดงบและสัดส่วนที่ใช้ ──
  var tMap={};
  all.forEach(function(r){
    if(r.budget<=0)return;
    var s=_split(r);
    var t=tMap[r.p.typeId]||(tMap[r.p.typeId]={id:r.p.typeId,n:0,budget:0,act:0,com:0,rem:0,over:0,overN:0});
    ['act','com','rem','over'].forEach(function(k){t[k]+=s[k];});
    t.n++;t.budget+=r.budget;if(s.over>0)t.overN++;
  });
  var TY=Object.values(tMap).sort(function(a,b){return b.budget-a.budget;}).map(function(t){t.label=window.gT(t.id).label||'ไม่ระบุประเภท';return t;});
  var typeHtml=TY.length
    ?'<div style="font-size:11px;color:var(--txt3);margin:-4px 0 4px;">งบของแต่ละประเภท แบ่งเป็นส่วนที่ใช้ไปแล้ว / ผูกพัน / คงเหลือ · ชี้แท่งเพื่อดู % และจำนวนโครงการ</div>'
      +'<div style="position:relative;height:'+Math.max(220,TY.length*34+70)+'px;"><canvas id="bud-c-type"></canvas></div>'
    :'<div style="padding:40px;text-align:center;color:var(--txt3);font-size:12px;">ไม่มีโครงการที่ตั้งงบไว้</div>';


  var body=document.getElementById('bud-body');
  if(!body)return;
  var G2='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(440px,100%),1fr));gap:16px;margin-bottom:16px;';
  body.innerHTML=
    '<div style="'+G2+'">'
      +_card('🩺 สถานะงบ & ช่วงโครงการ'+window.calcTip('แบ่งโครงการที่ตั้งงบไว้เป็น กำลังดำเนินการ / จบแล้ว (คืบหน้า 100% หรือสถานะเสร็จสิ้น)\nใช้งบ % = (ใช้จริง + ผูกพัน + ส่วนเกินงบ) ÷ งบ × 100\nงานเดินไปเฉลี่ย = ความคืบหน้าเฉลี่ยถ่วงน้ำหนักด้วยงบของแต่ละโครงการ\nคงเหลือของโครงการที่จบแล้ว = ประหยัดได้\n\n'+"เกินงบ = ใช้จริง+ผูกพัน มากกว่างบ\nใกล้เกิน = ใช้งบ ≥ 80%\nไม่ได้ตั้งงบ = งบเป็น 0 แต่มีค่าใช้จ่าย\nปกติ = นอกเหนือจากนี้"),statusHtml)
      +_card('🏷️ แยกตามประเภทโครงการ'+window.calcTip('รวมงบของโครงการที่ตั้งงบไว้ แยกตามประเภท แล้วแบ่งเป็น ใช้จริง / ผูกพัน / คงเหลือ / เกินงบ'),typeHtml)
    +'</div>'
    +'<div style="'+G2+'">'
      +_card('📅 ค่าใช้จ่ายจริงรายเดือน'+window.calcTip('ผลรวมรายการค่าใช้จ่ายของโครงการตามตัวกรอง แยกตามเดือนของวันที่จ่าย'),'<div style="position:relative;height:240px;"><canvas id="bud-c-trend"></canvas></div>')
      +_card('🧾 ค่าใช้จ่ายตามหมวด'+window.calcTip('ผลรวมรายการค่าใช้จ่ายแยกตามหมวด เรียงมาก→น้อย (เกิน 8 หมวด รวมที่เหลือเป็น "หมวดอื่น ๆ")\n% = ยอดหมวด ÷ ยอดรวมทุกหมวด × 100'),catHtml)
    +'</div>'
    +'<div style="margin-bottom:16px;">'+_card('⚠️ โครงการที่ต้องจับตา'+window.calcTip('เรียงตามความรุนแรง: เกินงบ → ไม่ได้ตั้งงบแต่มีค่าใช้จ่าย → ใช้เงินนำหน้างาน → ใกล้เกิน (≥80%)\nใช้เงินนำหน้างาน = ยังไม่จบ, ใช้งบ ≥ 30% และ % ใช้งบ − % คืบหน้า ≥ 20 จุด\nแสดง 10 โครงการแรก')+' <span style="font-weight:500;color:var(--txt3);">('+watch.length+')</span>',watchHtml)+'</div>'
    +'<div style="margin-bottom:16px;">'+_card('🗂️ แยกตามกลุ่มโครงการ'+window.calcTip('รวมงบ / ใช้จริง / ผูกพัน ของโครงการในแต่ละกลุ่ม\nคงเหลือ = งบ − ใช้จริง − ผูกพัน · % ใช้งบ = (ใช้จริง + ผูกพัน) ÷ งบ × 100'),groupHtml)+'</div>';

  _renderBudCharts(costs,PH,TY);
  _renderBudTable(window.budCalcRows(f));
}

// ── กราฟ (Chart.js) ──
function _renderBudCharts(costs,PH,TY){
  Object.keys(_charts).forEach(function(k){try{_charts[k].destroy();}catch(e){}});
  _charts={};
  if(!window.Chart)return;
  var css=getComputedStyle(document.body);
  var grid=(css.getPropertyValue('--border')||'#e2e5ec').trim();
  var ink3=(css.getPropertyValue('--txt3')||'#9ba3b8').trim();
  var tick={color:ink3,font:{size:10.5}};

  var surf=(css.getPropertyValue('--surface')||'#fff').trim();
  var ink=(css.getPropertyValue('--txt')||'#1a1d2e').trim();
  var SEG=[{k:'act',label:'ใช้จริง',color:'#e76f51'},{k:'com',label:'ผูกพัน',color:'#7209b7'},{k:'rem',label:'คงเหลือ',color:'rgba(6,214,160,.55)'},{k:'over',label:'เกินงบ',color:'#ff6b6b'}];
  // แท่งซ้อนแนวนอน หน่วยบาท — rows: [{label,budget,n,overN,act,com,rem,over,remLabel?}]
  var stacked=function(el,rows){
    return new Chart(el,{type:'bar',
      data:{labels:rows.map(function(r){return r.label;}),
        datasets:SEG.map(function(s){return{label:s.label,data:rows.map(function(r){return r[s.k]||null;}),backgroundColor:s.color,
          borderColor:surf,borderWidth:function(c){return c.raw>0?{right:2}:0;},borderSkipped:false,barThickness:18,stack:'b'};})},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,interaction:{mode:'index',axis:'y',intersect:false},
        plugins:{legend:{position:'top',align:'start',labels:{color:ink3,font:{size:11},boxWidth:10,usePointStyle:true}},
          tooltip:{callbacks:{
            title:function(it){var r=rows[it[0].dataIndex];return r.label+' · '+r.n+' โครงการ';},
            label:function(c){
              if(!c.parsed.x)return null;
              var r=rows[c.dataIndex],lb=c.datasetIndex===2&&r.remLabel?r.remLabel:c.dataset.label;
              return lb+' '+window.fc(c.parsed.x)+' ('+Math.round(c.parsed.x/r.budget*100)+'%)';
            },
            footer:function(it){var r=rows[it[0].dataIndex];return'งบ '+window.fc(r.budget)+(r.overN?' · 🔴 เกินงบ '+r.overN+' โครงการ':'');}}}},
        scales:{x:{stacked:true,beginAtZero:true,grid:{color:grid},ticks:Object.assign({callback:function(v){return _fk(v);}},tick)},
          y:{stacked:true,grid:{display:false},ticks:{color:ink,font:{size:11}}}}}});
  };
  var cp=document.getElementById('bud-c-phase');
  if(cp)_charts.phase=stacked(cp,PH);
  var cty=document.getElementById('bud-c-type');
  if(cty)_charts.type=stacked(cty,TY);


  // ค่าใช้จ่ายจริงรายเดือน (ตาม cost_date) — ชุดเดียว สีเดียว ไม่ต้องมี legend
  var ct=document.getElementById('bud-c-trend');
  if(ct){
    var mSum={};
    costs.forEach(function(c){var m=(c.costDate||'').slice(0,7);if(/^\d{4}-\d{2}$/.test(m))mSum[m]=(mSum[m]||0)+(c.amount||0);});
    var keys=Object.keys(mSum).sort();
    if(keys.length){
      // เติมเดือนที่ไม่มีค่าใช้จ่ายให้ครบช่วง (สูงสุด 24 เดือนล่าสุด)
      var full=[],y=+keys[0].slice(0,4),m=+keys[0].slice(5,7),last=keys[keys.length-1];
      while(true){var k=y+'-'+(m<10?'0':'')+m;full.push(k);if(k>=last)break;m++;if(m>12){m=1;y++;}}
      keys=full.slice(-24);
    }
    _charts.trend=new Chart(ct,{type:'bar',
      data:{labels:keys.map(function(k){return _TH_MON[+k.slice(5,7)-1]+' '+String(+k.slice(0,4)+543).slice(2);}),
        datasets:[{label:'ค่าใช้จ่ายจริง',data:keys.map(function(k){return mSum[k]||0;}),backgroundColor:'#4361ee',borderRadius:4,maxBarThickness:28}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return'ค่าใช้จ่าย '+window.fc(c.parsed.y);}}}},
        scales:{x:{grid:{display:false},ticks:tick},y:{beginAtZero:true,grid:{color:grid},ticks:Object.assign({callback:function(v){return _fk(v);}},tick)}}}});
  }
}

// ── ตารางรายโครงการ (ตัวกรองสถานะงบ + การเรียง มีผลที่ตารางนี้) ──
function _renderBudTable(rows){
  var H=window.BUD_HEALTH;
  var cntEl=document.getElementById('bud-table-cnt');
  if(cntEl)cntEl.textContent='('+rows.length+')';
  var tb=document.getElementById('bud-rows');
  if(!tb)return;
  if(!rows.length){tb.innerHTML='<tr><td colspan="8" style="text-align:center;padding:48px;color:var(--txt3);">ไม่พบข้อมูล</td></tr>';return;}
  tb.innerHTML=rows.map(function(r){
    var sg=window.gS(r.p.stage);
    var pg=window.gG(r.p.groupId);
    return'<tr onclick="window.openProjModal(\''+r.p.id+'\')" style="cursor:pointer;">'
      +'<td><div style="font-weight:600;font-size:13px;">'+window.esc(r.p.name)+'</div>'
      +(pg?'<span class="tag" style="background:'+pg.color+'18;color:'+pg.color+';font-size:9px;padding:1px 5px;margin-top:2px;display:inline-block;">'+window.esc(pg.label)+'</span>':'')
      +(sg?'<span class="tag" style="background:'+sg.color+'18;color:'+sg.color+';font-size:9px;padding:1px 5px;margin-top:2px;display:inline-block;margin-left:2px;">'+sg.label+'</span>':'')
      +'</td>'
      +'<td style="text-align:right;font-weight:700;">'+window.fc(r.budget)+'</td>'
      +'<td style="text-align:right;">'+window.fc(r.actual)+'</td>'
      +'<td style="text-align:right;">'+window.fc(r.committed)+'</td>'
      +'<td style="text-align:right;'+(r.remain<0?'color:#ff6b6b;font-weight:700;':'')+'">'+window.fc(r.remain)+'</td>'
      +'<td style="min-width:140px;">'+(r.budget>0?_pctBar(r.pct,H[r.health].color):'<span style="font-size:11px;color:var(--txt3);">—</span>')+'</td>'
      +'<td style="text-align:right;font-size:12px;">'+r.progress+'%</td>'
      +'<td>'+_hTag(r.health)+(r.burnAhead?'<div style="font-size:10px;color:var(--txt3);margin-top:2px;">🔥 ใช้เงินนำหน้างาน</div>':'')+'</td>'
      +'</tr>';
  }).join('');
}

// ── Site Owner Tab ──────────────────────────────────────────
function _renderOwner(){
  // Populate type dropdown once
  window.msFilter('so-type',window.PTYPES,{placeholder:'ทุกประเภท',onChange:window.renderSiteOwner});
  // Populate stage dropdown once
  var soStageEl=document.getElementById('so-stage');
  if(soStageEl&&soStageEl.options.length<=1){
    (window.STAGES||[]).slice().sort(function(a,b){return (a.order||99)-(b.order||99);}).forEach(function(s){
      var o=document.createElement('option');o.value=s.id;o.textContent=s.label;soStageEl.appendChild(o);
    });
  }

  _fillYearSel('so-yr');

  var yr=(document.getElementById('so-yr')||{}).value||'';
  var q=((document.getElementById('so-q')||{}).value||'').toLowerCase();
  var typeF=window.msValues('so-type');
  var stageF=(document.getElementById('so-stage')||{}).value||'';
  var sort=(document.getElementById('so-sort')||{}).value||'value_desc';

  // Build owner map from PROJECTS
  var ownerMap={};
  (window.PROJECTS||[]).forEach(function(p){
    if(yr&&window.getYearBE(p.start)!=yr)return;
    if(typeF.length&&!typeF.includes(p.typeId))return;
    if(stageF&&p.stage!==stageF)return;
    var owner=p.siteOwner||'(ไม่ระบุ)';
    if(!ownerMap[owner])ownerMap[owner]={name:owner,projects:[],budget:0,byType:{}};
    ownerMap[owner].projects.push(p);
    ownerMap[owner].budget+=(p.cost||0);
    var tid=p.typeId||'';
    if(!ownerMap[owner].byType[tid])ownerMap[owner].byType[tid]={count:0,budget:0};
    ownerMap[owner].byType[tid].count++;
    ownerMap[owner].byType[tid].budget+=(p.cost||0);
  });

  var owners=Object.values(ownerMap).filter(function(o){
    return !q||o.name.toLowerCase().includes(q);
  });

  owners.sort(function(a,b){
    if(sort==='value_desc')return b.budget-a.budget;
    if(sort==='value_asc')return a.budget-b.budget;
    if(sort==='count_desc')return b.projects.length-a.projects.length;
    if(sort==='name_asc')return a.name.localeCompare(b.name,'th');
    return b.budget-a.budget;
  });

  // KPI summary cards
  var totalBudget=owners.reduce(function(s,o){return s+o.budget;},0);
  var totalProjects=owners.reduce(function(s,o){return s+o.projects.length;},0);
  var kpi=document.getElementById('so-kpi');
  if(kpi){
    kpi.innerHTML=[
      {k:'เจ้าของไซต์',tip:'จำนวนเจ้าของไซต์ (ไม่ซ้ำ) จากโครงการที่ผ่านตัวกรอง ปี / ประเภท / Stage / ค้นหา',v:owners.length+' ราย',icon:'🏢',color:'#4361ee'},
      {k:'มูลค่ารวมทั้งหมด',tip:'ผลรวมมูลค่าโครงการของเจ้าของไซต์ทุกรายที่แสดง',v:window.fc(totalBudget),icon:'💵',color:'#06d6a0'},
      {k:'โครงการทั้งหมด',tip:'จำนวนโครงการรวมของเจ้าของไซต์ทุกรายที่แสดง',v:totalProjects+' โครงการ',icon:'📁',color:'#7c5cfc'},
    ].map(_statCard).join('');
  }

  var body=document.getElementById('so-body');
  if(!body)return;
  if(!owners.length){
    body.innerHTML='<div style="text-align:center;padding:60px;color:var(--txt3);">ไม่พบข้อมูล</div>';
    return;
  }

  body.innerHTML=owners.map(function(o){
    // ประเภทโครงการของเจ้าของไซต์นี้ — เรียงตามมูลค่า (มาก→น้อย) ใช้ทั้งป้ายสรุปและหัวกลุ่มในตาราง
    var types=Object.keys(o.byType).sort(function(a,b){return o.byType[b].budget-o.byType[a].budget||o.byType[b].count-o.byType[a].count;});

    // Type breakdown badges
    var badges=types.map(function(tid){
      var d=o.byType[tid];
      var t=window.gT(tid);if(!t.label)t={label:'ไม่ระบุประเภท',color:t.color};
      return'<span style="display:inline-flex;align-items:center;gap:3px;background:'+t.color+'18;color:'+t.color+';border-radius:4px;padding:2px 8px;font-size:10px;font-weight:600;">'
        +window.esc(t.label)+'<span style="opacity:.65;">×'+d.count+'</span></span>';
    }).join('');

    // Sub-rows: จัดกลุ่มตามประเภทโครงการ — หัวกลุ่ม (ประเภท · จำนวน · มูลค่ารวม) แล้วตามด้วยโครงการในกลุ่ม (มูลค่า มาก→น้อย)
    var subRows=types.map(function(tid){
      var d=o.byType[tid];
      var t=window.gT(tid);if(!t.label)t={label:'ไม่ระบุประเภท',color:t.color};
      var head='<tr style="background:'+t.color+'0d;">'
        +'<td colspan="2" style="padding:8px 16px 8px 24px;border-left:3px solid '+t.color+';">'
          +'<span style="background:'+t.color+'18;color:'+t.color+';border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700;">'+window.esc(t.label)+'</span>'
          +'<span style="margin-left:8px;font-size:11px;color:var(--txt3);">'+d.count+' โครงการ</span>'
        +'</td>'
        +'<td style="text-align:right;font-weight:800;font-size:12px;color:'+t.color+';">'+window.fc(d.budget)+'</td>'
        +'</tr>';
      var rows=o.projects.filter(function(p){return (p.typeId||'')===tid;})
        .sort(function(a,b){return (b.cost||0)-(a.cost||0);})
        .map(function(p){
          var s=window.gS(p.stage);
          return'<tr onclick="window.openProjModal(\''+p.id+'\')" style="cursor:pointer;" onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'\'">'
            +'<td style="padding-left:44px;font-size:12px;">'+window.esc(p.name)+'</td>'
            +'<td><span style="background:'+s.color+'18;color:'+s.color+';border-radius:4px;padding:1px 7px;font-size:10px;font-weight:600;">'+s.label+'</span></td>'
            +'<td style="text-align:right;font-weight:700;font-size:12px;">'+window.fc(p.cost||0)+'</td>'
            +'</tr>';
        }).join('');
      return head+rows;
    }).join('');

    return'<div class="ov-card" style="padding:0;overflow:hidden;margin-bottom:10px;">'
      +'<div onclick="window._soToggle(this)" style="display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;transition:background .12s;" onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\'">'
        +'<span class="so-chev" style="font-size:11px;color:var(--txt3);transition:transform .2s;flex-shrink:0;">▶</span>'
        +'<div style="flex:1;min-width:0;">'
          +'<div style="font-weight:700;font-size:14px;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+window.esc(o.name)+'</div>'
          +'<div style="margin-top:5px;display:flex;flex-wrap:wrap;gap:4px;">'+badges+'</div>'
        +'</div>'
        +'<div style="text-align:right;flex-shrink:0;padding-left:12px;">'
          +'<div style="font-size:11px;color:var(--txt3);">'+o.projects.length+' โครงการ</div>'
          +'<div style="font-size:16px;font-weight:800;color:#4361ee;">'+window.fc(o.budget)+'</div>'
        +'</div>'
      +'</div>'
      +'<div class="so-sub" style="display:none;border-top:1px solid var(--border);">'
        +'<table class="m-scroll-tbl t-table" style="width:100%;">'
          +'<thead><tr><th>ประเภท / ชื่อโครงการ</th><th>Stage</th><th style="text-align:right">มูลค่า (฿)</th></tr></thead>'
          +'<tbody>'+subRows+'</tbody>'
        +'</table>'
      +'</div>'
    +'</div>';
  }).join('');
}

})();
