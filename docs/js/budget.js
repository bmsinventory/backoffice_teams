// ── BUDGET SUMMARY ──
(function(){
var _chart=null;
var _budCurTab='budget';

// ── Tab switching ──
window._budSwitchTab=function(tab){
  _budCurTab=tab;
  var pb=document.getElementById('bud-pane-budget');
  var po=document.getElementById('bud-pane-owner');
  if(pb)pb.style.display=tab==='budget'?'':'none';
  if(po)po.style.display=tab==='owner'?'':'none';
  document.querySelectorAll('.bud-tab-btn').forEach(function(b){
    var active=b.dataset.tab===tab;
    b.style.borderBottomColor=active?'#4361ee':'transparent';
    b.style.color=active?'#4361ee':'var(--txt3)';
  });
  window.renderBudget();
};

window.renderBudget=function(){
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
function _renderBudgetTab(){
  var yf=document.getElementById('bud-yr');
  if(yf&&yf.options.length<=1){
    var yrs=[...new Set((window.PROJECTS||[]).map(function(p){return window.getYearBE(p.start);}).filter(Boolean))].sort(function(a,b){return b-a;});
    yrs.forEach(function(y){var o=document.createElement('option');o.value=y;o.textContent='ปี พ.ศ. '+y;yf.appendChild(o);});
    var _cbe=(new Date().getFullYear()+543).toString();
    if(!yf.value||yf.value==='')yf.value=_cbe;
  }
  var gf=document.getElementById('bud-grp');
  if(gf&&gf.options.length<=1){
    (window.PGROUPS||[]).forEach(function(g){var o=document.createElement('option');o.value=g.id;o.textContent=g.label;gf.appendChild(o);});
  }

  var yr=(document.getElementById('bud-yr')||{}).value||'';
  var grp=(document.getElementById('bud-grp')||{}).value||'';
  var q=((document.getElementById('bud-q')||{}).value||'').toLowerCase();
  var sort=(document.getElementById('bud-sort')||{}).value||'pct_desc';
  var statusFilter=(document.getElementById('bud-status')||{}).value||'';

  var rows=(window.PROJECTS||[]).filter(function(p){
    if(yr&&window.getYearBE(p.start)!=yr)return false;
    if(grp&&p.groupId!==grp)return false;
    if(q&&!p.name.toLowerCase().includes(q))return false;
    if(statusFilter==='over'&&true){/* filter below */}
    return true;
  }).map(function(p){
    var advAmt=(window.ADVANCES||[]).filter(function(a){return a.pid===p.id;}).reduce(function(s,a){return s+(a.amount||0);},0);
    var costAmt=(window.COSTS||[]).filter(function(c){return c.pid===p.id;}).reduce(function(s,c){return s+(c.amount||0);},0);
    var used=advAmt+costAmt;
    var budget=p.cost||0;
    var remain=budget-used;
    var pct=budget>0?Math.round(used/budget*100):0;
    return{p:p,budget:budget,advAmt:advAmt,costAmt:costAmt,used:used,remain:remain,pct:pct};
  }).filter(function(r){
    if(statusFilter==='over')return r.remain<0;
    if(statusFilter==='warn')return r.pct>=80&&r.remain>=0;
    if(statusFilter==='ok')return r.pct<80;
    return true;
  });

  rows.sort(function(a,b){
    if(sort==='pct_desc')return b.pct-a.pct;
    if(sort==='pct_asc')return a.pct-b.pct;
    if(sort==='budget_desc')return b.budget-a.budget;
    if(sort==='remain_asc')return a.remain-b.remain;
    if(sort==='name_asc')return a.p.name.localeCompare(b.p.name,'th');
    return 0;
  });

  var totalBudget=rows.reduce(function(s,r){return s+r.budget;},0);
  var totalAdv=rows.reduce(function(s,r){return s+r.advAmt;},0);
  var totalCost=rows.reduce(function(s,r){return s+r.costAmt;},0);
  var totalUsed=rows.reduce(function(s,r){return s+r.used;},0);
  var totalRemain=rows.reduce(function(s,r){return s+r.remain;},0);
  var overCount=rows.filter(function(r){return r.remain<0;}).length;
  var pctUsed=totalBudget>0?Math.round(totalUsed/totalBudget*100):0;

  var cards=document.getElementById('bud-kpi');
  if(cards){
    cards.innerHTML=[
      {k:'งบประมาณรวม',v:window.fc(totalBudget),s:rows.length+' โครงการ',icon:'💵',g1:'#4361ee',g2:'#4cc9f0'},
      {k:'เบิกล่วงหน้ารวม',v:window.fc(totalAdv),s:'Advance รวมทุกโครงการ',icon:'💳',g1:'#7209b7',g2:'#f72585'},
      {k:'ค่าใช้จ่ายสุทธิ',v:window.fc(totalCost),s:'Cost Tracking รวม',icon:'💰',g1:'#f4a261',g2:'#e76f51'},
      {k:'คงเหลือ',v:window.fc(totalRemain),s:pctUsed+'% ใช้แล้ว'+(overCount>0?' · ⚠ '+overCount+' เกินงบ':''),icon:'📊',g1:totalRemain>=0?'#06d6a0':'#ff6b6b',g2:totalRemain>=0?'#4cc9f0':'#ffa62b'},
    ].map(function(s){
      return'<div class="stat-c" style="display:flex;flex-direction:column;gap:2px;">'
        +'<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px;">'
        +'<div class="stat-k">'+s.k+'</div>'
        +'<div class="stat-icon" style="background:linear-gradient(135deg,'+s.g1+'18,'+s.g2+'18);width:36px;height:36px;flex-shrink:0;">'+s.icon+'</div>'
        +'</div>'
        +'<div class="stat-v" style="background:linear-gradient(135deg,'+s.g1+','+s.g2+');-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-size:22px;">'+s.v+'</div>'
        +'<div class="stat-s">'+s.s+'</div>'
        +'</div>';
    }).join('');
  }

  var ctx=document.getElementById('bud-chart');
  if(ctx){
    if(_chart){_chart.destroy();_chart=null;}
    var cr=rows.slice(0,15);
    var wrap=ctx.parentElement;
    if(!wrap)return;
    wrap.style.height='auto';
    wrap.style.position='static';
    var legend='<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px;font-size:11px;color:var(--txt-muted);">'
      +'<span style="display:flex;align-items:center;gap:5px;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#06d6a0;"></span>ใช้งบ &lt;50%</span>'
      +'<span style="display:flex;align-items:center;gap:5px;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#4361ee;"></span>50–79%</span>'
      +'<span style="display:flex;align-items:center;gap:5px;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#ffa62b;"></span>80–99%</span>'
      +'<span style="display:flex;align-items:center;gap:5px;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#ff6b6b;"></span>เกินงบ</span>'
      +'</div>';
    var items=cr.map(function(r,i){
      var pct=r.pct;
      var barW=Math.min(pct,100);
      var barColor=pct>=100?'#ff6b6b':pct>=80?'#ffa62b':pct>=50?'#4361ee':'#06d6a0';
      var remainColor=r.remain<0?'#ff6b6b':'var(--txt-muted)';
      var pg=window.gG?window.gG(r.p.groupId):null;
      return '<div onclick="window.openProjModal(\''+r.p.id+'\')" style="padding:10px 14px;cursor:pointer;transition:background .12s;'+(i<cr.length-1?'border-bottom:1px solid var(--border);':'')+'" onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\'">'
        +'<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:5px;">'
          +'<div>'
            +'<div style="font-size:12px;font-weight:600;color:var(--txt);line-height:1.45;">'+window.esc(r.p.name)+'</div>'
            +(pg?'<span style="font-size:9px;background:'+pg.color+'18;color:'+pg.color+';padding:1px 6px;border-radius:4px;margin-top:2px;display:inline-block;">'+window.esc(pg.label)+'</span>':'')
          +'</div>'
          +'<span style="font-size:13px;font-weight:800;color:'+barColor+';flex-shrink:0;min-width:40px;text-align:right;">'+pct+'%</span>'
        +'</div>'
        +'<div style="height:8px;background:'+barColor+'1a;border-radius:4px;overflow:hidden;margin-bottom:5px;">'
          +'<div style="width:'+barW+'%;height:100%;background:'+barColor+';border-radius:4px;"></div>'
        +'</div>'
        +'<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--txt-muted);">'
          +'<span>งบ <b style="color:var(--txt);">'+window.fc(r.budget)+'</b></span>'
          +'<span>ใช้ <b style="color:'+barColor+';">'+window.fc(r.used)+'</b> · คงเหลือ <b style="color:'+remainColor+';">'+window.fc(r.remain)+'</b></span>'
        +'</div>'
      +'</div>';
    }).join('');
    wrap.innerHTML=legend
      +'<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--surface);">'+items+'</div>'
      +'<canvas id="bud-chart" style="display:none;"></canvas>';
  }

  var tb=document.getElementById('bud-rows');
  if(!tb)return;
  if(!rows.length){tb.innerHTML='<tr><td colspan="8" style="text-align:center;padding:48px;color:var(--txt3);">ไม่พบข้อมูล</td></tr>';return;}
  tb.innerHTML=rows.map(function(r){
    var bar=r.budget>0?Math.min(r.pct,100):0;
    var barColor=r.pct>=100?'#ff6b6b':r.pct>=80?'#ffa62b':r.pct>=50?'#4361ee':'#06d6a0';
    var remainStyle=r.remain<0?'color:var(--coral);font-weight:700':'';
    var sg=window.gS(r.p.stage);
    var pg=window.gG(r.p.groupId);
    return'<tr onclick="window.openProjModal(\''+r.p.id+'\')" style="cursor:pointer;">'
      +'<td><div style="font-weight:600;font-size:13px;">'+window.esc(r.p.name)+'</div>'
      +(pg?'<span class="tag" style="background:'+pg.color+'18;color:'+pg.color+';font-size:9px;padding:1px 5px;margin-top:2px;display:inline-block;">'+window.esc(pg.label)+'</span>':'')
      +(sg?'<span class="tag" style="background:'+sg.color+'18;color:'+sg.color+';font-size:9px;padding:1px 5px;margin-top:2px;display:inline-block;margin-left:2px;">'+sg.label+'</span>':'')
      +'</td>'
      +'<td style="text-align:right;font-weight:700;">'+window.fc(r.budget)+'</td>'
      +'<td style="text-align:right;color:#7209b7;">'+window.fc(r.advAmt)+'</td>'
      +'<td style="text-align:right;color:#e76f51;">'+window.fc(r.costAmt)+'</td>'
      +'<td style="text-align:right;font-weight:600;">'+window.fc(r.used)+'</td>'
      +'<td style="text-align:right;'+remainStyle+'">'+window.fc(r.remain)+'</td>'
      +'<td style="min-width:130px;">'
        +'<div style="display:flex;align-items:center;gap:6px;">'
          +'<div style="flex:1;height:7px;background:var(--surface2);border-radius:4px;overflow:hidden;">'
            +'<div style="width:'+bar+'%;height:100%;background:'+barColor+';border-radius:4px;"></div>'
          +'</div>'
          +'<span style="font-size:11px;font-weight:700;color:'+barColor+';min-width:30px;text-align:right;">'+r.pct+'%</span>'
        +'</div>'
      +'</td>'
      +'<td style="font-size:11px;color:var(--txt2);">'+(r.p.start?window.fd(r.p.start):'')+'</td>'
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

  var yr=(document.getElementById('bud-yr')||{}).value||'';
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
      {k:'เจ้าของไซต์',v:owners.length+' ราย',icon:'🏢',g1:'#4361ee',g2:'#4cc9f0'},
      {k:'มูลค่ารวมทั้งหมด',v:window.fc(totalBudget),icon:'💵',g1:'#06d6a0',g2:'#4cc9f0'},
      {k:'โครงการทั้งหมด',v:totalProjects+' โครงการ',icon:'📁',g1:'#7c5cfc',g2:'#f72585'},
    ].map(function(s){
      return'<div class="stat-c" style="display:flex;flex-direction:column;gap:2px;">'
        +'<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px;">'
        +'<div class="stat-k">'+s.k+'</div>'
        +'<div class="stat-icon" style="background:linear-gradient(135deg,'+s.g1+'18,'+s.g2+'18);width:36px;height:36px;flex-shrink:0;">'+s.icon+'</div>'
        +'</div>'
        +'<div class="stat-v" style="background:linear-gradient(135deg,'+s.g1+','+s.g2+');-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-size:22px;">'+s.v+'</div>'
        +'</div>';
    }).join('');
  }

  var body=document.getElementById('so-body');
  if(!body)return;
  if(!owners.length){
    body.innerHTML='<div style="text-align:center;padding:60px;color:var(--txt3);">ไม่พบข้อมูล</div>';
    return;
  }

  body.innerHTML=owners.map(function(o){
    // Type breakdown badges
    var badges=Object.entries(o.byType).map(function(entry){
      var tid=entry[0],d=entry[1];
      var t=window.gT(tid);
      return'<span style="display:inline-flex;align-items:center;gap:3px;background:'+t.color+'18;color:'+t.color+';border-radius:4px;padding:2px 8px;font-size:10px;font-weight:600;">'
        +window.esc(t.label)+'<span style="opacity:.65;">×'+d.count+'</span></span>';
    }).join('');

    // Sub-rows for each project
    var subRows=o.projects.map(function(p){
      var t=window.gT(p.typeId);
      var s=window.gS(p.stage);
      return'<tr onclick="window.openProjModal(\''+p.id+'\')" style="cursor:pointer;" onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'\'">'
        +'<td style="padding-left:36px;font-size:12px;">'+window.esc(p.name)+'</td>'
        +'<td><span style="background:'+t.color+'18;color:'+t.color+';border-radius:4px;padding:1px 7px;font-size:10px;font-weight:600;">'+window.esc(t.label)+'</span></td>'
        +'<td><span style="background:'+s.color+'18;color:'+s.color+';border-radius:4px;padding:1px 7px;font-size:10px;font-weight:600;">'+s.label+'</span></td>'
        +'<td style="text-align:right;font-weight:700;font-size:12px;">'+window.fc(p.cost||0)+'</td>'
        +'</tr>';
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
        +'<table class="t-table" style="width:100%;">'
          +'<thead><tr><th>ชื่อโครงการ</th><th>ประเภท</th><th>Stage</th><th style="text-align:right">มูลค่า (฿)</th></tr></thead>'
          +'<tbody>'+subRows+'</tbody>'
        +'</table>'
      +'</div>'
    +'</div>';
  }).join('');
}

})();
