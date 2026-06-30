// ── EXCEL EXPORT ──
(function(){
  var _v=function(id){var el=document.getElementById(id);return el?el.value||'':'';}
  var _pname=function(pid){var p=(window.PROJECTS||[]).find(function(x){return x.id===pid;});return p?p.name:pid||'';}
  var _sname=function(sid){var s=(window.STAFF||[]).find(function(x){return x.id===sid;});return s?s.name:sid||'';}
  var _today=function(){return new Date().toISOString().slice(0,10);}

  function doExport(headers,rows,filename){
    if(!window.XLSX){alert('ยังโหลด XLSX library ไม่เสร็จ');return;}
    var wb=XLSX.utils.book_new();
    var data=[headers].concat(rows);
    var ws=XLSX.utils.aoa_to_sheet(data);
    // style header row bold + bg
    var range=XLSX.utils.decode_range(ws['!ref']);
    for(var c=range.s.c;c<=range.e.c;c++){
      var addr=XLSX.utils.encode_cell({r:0,c:c});
      if(!ws[addr])continue;
      ws[addr].s={font:{bold:true},fill:{fgColor:{rgb:'4361EE'}},alignment:{horizontal:'center'}};
    }
    // auto column widths
    ws['!cols']=headers.map(function(h,i){
      var max=h.length*1.5;
      rows.forEach(function(r){var v=String(r[i]===null||r[i]===undefined?'':r[i]);if(v.length>max)max=v.length;});
      return{wch:Math.min(Math.max(max+2,8),60)};
    });
    XLSX.utils.book_append_sheet(wb,ws,'ข้อมูล');
    XLSX.writeFile(wb,filename+'_'+_today()+'.xlsx');
  }

  // ── โครงการ ──────────────────────────────────────────────────────────────
  window.exportProjects=function(){
    var q=_v('proj-q').toLowerCase(),fy=_v('proj-fy'),typ=_v('proj-type'),stg=_v('proj-stg');
    var stMap={active:'กำลังดำเนินการ',completed:'เสร็จสิ้น',cancelled:'ยกเลิก',on_hold:'พักชั่วคราว'};
    var rows=(window.PROJECTS||[]).filter(function(p){
      if(q&&!p.name.toLowerCase().includes(q))return false;
      if(fy&&window.getYearBE(p.start)!=fy)return false;
      if(typ&&p.typeId!==typ)return false;
      if(stg&&p.stage!==stg)return false;
      return true;
    }).map(function(p){
      var pt=window.gT(p.typeId),pg=window.gG(p.groupId),st=window.gS(p.stage);
      var pm=(window.STAFF||[]).find(function(s){return s.id===p.pm;});
      var advAmt=(window.ADVANCES||[]).filter(function(a){return a.pid===p.id;}).reduce(function(s,a){return s+a.amount;},0);
      var costAmt=(window.COSTS||[]).filter(function(c){return c.pid===p.id;}).reduce(function(s,c){return s+c.amount;},0);
      return[p.id,p.name,pt?pt.label:'',pg?pg.label:'',st?st.label:'',p.cost,advAmt,costAmt,p.cost-(advAmt+costAmt),p.start,p.end,p.progress+'%',pm?pm.name:p.pm,stMap[p.status]||p.status,p.note];
    });
    doExport(['รหัสโครงการ','ชื่อโครงการ','ประเภท','กลุ่ม','Stage','งบประมาณ (฿)','เบิกล่วงหน้า (฿)','ค่าใช้จ่าย (฿)','คงเหลือ (฿)','วันเริ่ม','วันสิ้นสุด','ความคืบหน้า','PM','สถานะ','หมายเหตุ'],rows,'โครงการ');
  };

  // ── เบิกล่วงหน้า ──────────────────────────────────────────────────────────
  window.exportAdvances=function(){
    var q=_v('adv-q').toLowerCase(),grp=_v('adv-grp'),typ=_v('adv-type'),yr=_v('adv-yr');
    var stTab=window.advFilter||'';
    var stMap={draft:'ร่าง',submitted:'ยื่นขออนุมัติ',approved:'อนุมัติแล้ว',clearing:'กำลัง Clear',cleared:'Clear แล้ว',rejected:'ปฏิเสธ'};
    var rows=(window.ADVANCES||[]).filter(function(a){
      var p=(window.PROJECTS||[]).find(function(x){return x.id===a.pid;});
      if(q&&!(a.purpose||'').toLowerCase().includes(q)&&!(p&&p.name.toLowerCase().includes(q)))return false;
      if(grp&&(!p||p.groupId!==grp))return false;
      if(typ&&(!p||p.typeId!==typ))return false;
      if(yr&&window.getYearBE(a.rdate)!=yr)return false;
      if(stTab&&a.status!==stTab)return false;
      return true;
    }).map(function(a){
      var remaining=a.amount-a.cleared;
      return[a.advno,_pname(a.pid),a.purpose,a.amount,a.cleared,remaining,a.rdate,a.ddate,stMap[a.status]||a.status,a.note];
    });
    doExport(['เลขที่','โครงการ','วัตถุประสงค์','ยอดเบิก (฿)','ยอด Clear (฿)','คงเหลือ (฿)','วันที่ขอ','กำหนด Clear','สถานะ','หมายเหตุ'],rows,'เบิกล่วงหน้า');
  };

  // ── Timesheet ──────────────────────────────────────────────────────────────
  window.exportTimesheet=function(){
    var q=_v('ts-q').toLowerCase(),yr=_v('ts-yr'),mon=_v('ts-mon'),typ=_v('ts-type'),proj=_v('ts-proj'),staff=_v('ts-staff');
    var catMap={fieldwork:'งานภาคสนาม',office:'งานสำนักงาน',training:'อบรม',meeting:'ประชุม',other:'อื่นๆ'};
    var rows=(window.TIMESHEETS||[]).filter(function(t){
      var p=(window.PROJECTS||[]).find(function(x){return x.id===t.pid;});
      var s=(window.STAFF||[]).find(function(x){return x.id===t.staffId;});
      if(q&&!(p&&p.name.toLowerCase().includes(q))&&!(s&&s.name.toLowerCase().includes(q)))return false;
      if(yr&&t.workDate&&window.getYearBE(t.workDate)!=yr)return false;
      if(mon&&t.workDate){var m=new Date(t.workDate).getMonth()+1;if(m!=Number(mon))return false;}
      if(typ&&t.category!==typ)return false;
      if(proj&&t.pid!==proj)return false;
      if(staff&&t.staffId!==staff)return false;
      return true;
    }).sort(function(a,b){return(a.workDate||'').localeCompare(b.workDate||'');})
    .map(function(t){
      return[t.workDate,_pname(t.pid),_sname(t.staffId),t.hours,catMap[t.category]||t.category,t.description];
    });
    var total=rows.reduce(function(s,r){return s+Number(r[3]||0);},0);
    rows.push(['','','รวม',total,'','']);
    doExport(['วันที่','โครงการ','พนักงาน','ชั่วโมง','ประเภทงาน','รายละเอียด'],rows,'Timesheet');
  };

  // ── ค่าใช้จ่าย ──────────────────────────────────────────────────────────────
  window.exportCosts=function(){
    var q=_v('cost-q').toLowerCase(),yr=_v('cost-yr'),mon=_v('cost-mon'),proj=_v('cost-proj'),cat=_v('cost-cat');
    var catMap={phone:'ค่าโทรศัพท์',travel:'ค่าเดินทาง',postal:'ค่าไปรษณีย์',taxi:'ค่าแท็กซี่',fuel:'ค่าน้ำมัน',toll:'ค่าทางด่วน',food:'ค่าอาหาร',lodging:'ค่าที่พัก',stationery:'เครื่องเขียนแบบพิมพ์',labor:'ค่าแรง',allowance:'ค่าเบี้ยเลี้ยง',other:'อื่นๆ'};
    var rows=(window.COSTS||[]).filter(function(c){
      var p=(window.PROJECTS||[]).find(function(x){return x.id===c.pid;});
      if(q&&!(c.description||'').toLowerCase().includes(q)&&!(p&&p.name.toLowerCase().includes(q)))return false;
      if(yr&&c.costDate&&window.getYearBE(c.costDate)!=yr)return false;
      if(mon&&c.costDate){var m=new Date(c.costDate).getMonth()+1;if(m!=Number(mon))return false;}
      if(proj&&c.pid!==proj)return false;
      if(cat&&c.category!==cat)return false;
      return true;
    }).sort(function(a,b){return(a.costDate||'').localeCompare(b.costDate||'');})
    .map(function(c){
      return[c.costDate,_pname(c.pid),_sname(c.staffId),catMap[c.category]||c.category,c.amount,c.description,c.receiptNo];
    });
    var total=rows.reduce(function(s,r){return s+Number(r[4]||0);},0);
    rows.push(['','','','รวม',total,'','']);
    doExport(['วันที่','โครงการ','พนักงาน','หมวด','จำนวน (฿)','รายละเอียด','เลขที่ใบเสร็จ'],rows,'ค่าใช้จ่าย');
  };

  // ── ที่พัก ──────────────────────────────────────────────────────────────────
  window.exportLodging=function(){
    var q=_v('ld-q').toLowerCase(),grp=_v('ld-grp'),typ=_v('ld-type'),yr=_v('ld-yr'),stFil=_v('ld-status');
    var grouped={};
    (window.LODGINGS||[]).forEach(function(l){if(!grouped[l.pid])grouped[l.pid]=[];grouped[l.pid].push(l);});
    var rows=[];
    (window.PROJECTS||[]).forEach(function(p){
      var lds=grouped[p.id]||[];
      if(!lds.length)return;
      if(grp&&p.groupId!==grp)return;
      if(typ&&p.typeId!==typ)return;
      if(yr&&window.getYearBE(p.start)!=yr)return;
      if(q&&!p.name.toLowerCase().includes(q))return;
      if(stFil==='approved_daily'&&!lds.some(function(l){return l.approvedDaily==='yes';}))return;
      if(stFil==='approved_monthly'&&!lds.some(function(l){return l.approvedMonthly==='yes';}))return;
      if(stFil==='pending'&&lds.some(function(l){return l.approvedDaily==='yes'||l.approvedMonthly==='yes';}))return;
      lds.forEach(function(l){
        rows.push([
          p.name,l.name,l.phone,l.checkIn,l.checkOut,
          l.dsQty?(l.dsQty+' ห้อง × ฿'+l.dsRate+'/คืน'):'',
          l.ddQty?(l.ddQty+' ห้อง × ฿'+l.ddRate+'/คืน'):'',
          l.dTotal||0,
          l.msQty?(l.msQty+' ห้อง × ฿'+l.msRate+'/เดือน'):'',
          l.mdQty?(l.mdQty+' ห้อง × ฿'+l.mdRate+'/เดือน'):'',
          l.mTotal||0,
          l.approvedDaily==='yes'?'✓':'',
          l.approvedMonthly==='yes'?'✓':'',
          l.note
        ]);
      });
    });
    doExport(['โครงการ','ชื่อที่พัก','เบอร์โทร','Check-in','Check-out','เตียงเดี่ยว (รายวัน)','เตียงคู่ (รายวัน)','รวมรายวัน (฿)','เตียงเดี่ยว (รายเดือน)','เตียงคู่ (รายเดือน)','รวมรายเดือน (฿)','อนุมัติรายวัน','อนุมัติรายเดือน','หมายเหตุ'],rows,'ที่พัก');
  };

  // ── ลาหยุด ──────────────────────────────────────────────────────────────────
  window.exportLeaves=function(){
    var yr=_v('reg-year'),mon=_v('reg-month'),stf=_v('leave-filter-staff'),typ=_v('leave-filter-type'),sts=_v('leave-filter-status');
    var typeMap={sick:'ลาป่วย',personal:'ลากิจ',vacation:'ลาพักร้อน',maternity:'ลาคลอด',ordination:'ลาบวช',other:'อื่นๆ'};
    var stsMap={pending:'รออนุมัติ',approved:'อนุมัติ',rejected:'ปฏิเสธ'};
    var rows=(window.LEAVES||[]).filter(function(l){
      if(stf&&l.staffId!==stf)return false;
      if(typ&&l.leaveType!==typ)return false;
      if(sts&&l.status!==sts)return false;
      if(yr&&window.getYearBE(l.startDate)!=yr)return false;
      if(mon&&l.startDate){var m=new Date(l.startDate).getMonth()+1;if(m!=Number(mon))return false;}
      return true;
    }).sort(function(a,b){return(a.startDate||'').localeCompare(b.startDate||'');})
    .map(function(l){
      var sub=(window.STAFF||[]).find(function(s){return s.id===l.substituteId;});
      var days=l.startDate&&l.endDate?Math.round((new Date(l.endDate)-new Date(l.startDate))/(864e5))+1:0;
      return[_sname(l.staffId),typeMap[l.leaveType]||l.leaveType,l.startDate,l.endDate,days,stsMap[l.status]||l.status,sub?sub.name:'',l.note];
    });
    doExport(['พนักงาน','ประเภทการลา','วันเริ่ม','วันสิ้นสุด','จำนวนวัน','สถานะ','ผู้รักษาการ','หมายเหตุ'],rows,'การลา');
  };

  // ── สัญญา ──────────────────────────────────────────────────────────────────
  window.exportContracts=function(){
    var stsMap={active:'มีผล',expired:'หมดอายุ',cancelled:'ยกเลิก'};
    var rows=(window.CONTRACTS||[]).map(function(c){
      return[c.id,c.name,c.customer,c.value,c.signDate,c.startDate,c.endDate,stsMap[c.status]||c.status,c.note];
    });
    doExport(['รหัสสัญญา','ชื่อโครงการ','ลูกค้า','มูลค่าสัญญา (฿)','วันที่ทำสัญญา','วันเริ่ม','วันสิ้นสุด','สถานะ','หมายเหตุ'],rows,'สัญญา');
  };

  // ── สรุปงบประมาณ ──────────────────────────────────────────────────────────
  window.exportBudget=function(){
    var yr=_v('bud-yr'),grp=_v('bud-grp'),q=_v('bud-q').toLowerCase(),statusFilter=_v('bud-status');
    var rows=(window.PROJECTS||[]).filter(function(p){
      if(yr&&window.getYearBE(p.start)!=yr)return false;
      if(grp&&p.groupId!==grp)return false;
      if(q&&!p.name.toLowerCase().includes(q))return false;
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
    var stMap={active:'กำลังดำเนินการ',completed:'เสร็จสิ้น',cancelled:'ยกเลิก',on_hold:'พักชั่วคราว'};
    var data=rows.map(function(r){
      var pg=window.gG(r.p.groupId);var sg=window.gS(r.p.stage);
      var overStatus=r.remain<0?'เกินงบ':r.pct>=80?'ใกล้เกิน':'ปกติ';
      return[r.p.id,r.p.name,pg?pg.label:'',sg?sg.label:'',r.budget,r.advAmt,r.costAmt,r.used,r.remain,r.pct+'%',overStatus,stMap[r.p.status]||r.p.status,r.p.start,r.p.end];
    });
    doExport(['รหัส','ชื่อโครงการ','กลุ่ม','Stage','งบประมาณ (฿)','เบิกล่วงหน้า (฿)','ค่าใช้จ่าย (฿)','ใช้แล้วรวม (฿)','คงเหลือ (฿)','% ใช้','สถานะงบ','สถานะโครงการ','วันเริ่ม','วันสิ้นสุด'],data,'สรุปงบประมาณ');
  };

  // ── โรงพยาบาล ──────────────────────────────────────────────────────────────
  window.exportHospitals=function(){
    var q=(_v('hsp-q')||'').toLowerCase(),prov=_v('hsp-prov'),dist=_v('hsp-dist'),typ=_v('hsp-type');
    var rows=(window.HOSPITALS||[]).filter(function(h){
      if(q&&!h.name.toLowerCase().includes(q)&&!(h.code||'').toLowerCase().includes(q))return false;
      if(prov&&h.province!==prov)return false;
      if(dist&&h.district!==dist)return false;
      if(typ&&h.type!==typ)return false;
      return true;
    }).map(function(h){
      var prods=(h.products||[]).map(function(pid){var pr=(window.HSP_PRODUCTS||[]).find(function(x){return x.id===pid;});return pr?pr.name:'';}).filter(Boolean).join(', ');
      var contacts=(h.contacts||[]).map(function(c){return(c.name||'')+(c.nickname?' ('+c.nickname+')':'')+(c.phone?' '+c.phone:'');}).join(' | ');
      return[h.code,h.name,h.type,h.beds,h.province,h.district,h.tambon,h.tel,contacts,prods,h.note];
    });
    doExport(['รหัส','ชื่อโรงพยาบาล','ระดับ','จำนวนเตียง','จังหวัด','อำเภอ','ตำบล','โทรศัพท์','ผู้ติดต่อ','ผลิตภัณฑ์ที่ใช้','หมายเหตุ'],rows,'โรงพยาบาล');
  };
})();
