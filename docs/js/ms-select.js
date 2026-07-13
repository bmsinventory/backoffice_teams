// ── MULTI-SELECT FILTER DROPDOWN (ms-filter) ──
// เปลี่ยน <select> ตัวกรองแบบเลือกได้ค่าเดียว ให้เป็น dropdown แบบ checkbox เลือกได้หลายค่า
// ใช้แทนที่ <div class="ms-filter" id="..."></div> ว่างๆ ใน index.html
(function(){
  function closeAllPanels(except){
    document.querySelectorAll('.ms-panel.open').forEach(function(p){
      if(p!==except) p.classList.remove('open');
    });
  }
  document.addEventListener('click', function(e){
    if(!e.target.closest('.ms-filter')) closeAllPanels();
  });
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape') closeAllPanels();
  });

  // รองรับทั้ง {value,label} และ {id,label} (เช่น window.PTYPES/PGROUPS ที่ใช้ .id)
  function itemVal(it){ return it.value!=null?it.value:it.id; }

  function labelFor(el){
    var sel=el._msSelected||[], items=el._msItems||[];
    if(sel.length===0) return el._msPlaceholder;
    if(sel.length===1){
      var it=items.find(function(x){return String(itemVal(x))===sel[0];});
      return it?it.label:el._msPlaceholder;
    }
    return sel.length+' รายการที่เลือก';
  }

  function renderRows(items,selected){
    if(!items.length) return '<div class="ms-empty">ไม่มีตัวเลือก</div>';
    return items.map(function(it){
      var v=String(itemVal(it));
      var checked=selected.indexOf(v)>=0;
      var dot=it.color?'<span class="ms-dot" style="background:'+it.color+'"></span>':'';
      return '<label class="ms-item"><input type="checkbox" value="'+v.replace(/"/g,'&quot;')+'"'+(checked?' checked':'')+'>'+dot+'<span>'+window.esc(it.label)+'</span></label>';
    }).join('');
  }

  /**
   * el/id: container element (or its id) — จะถูกแปลงเป็น dropdown ครั้งแรกที่เรียก
   * items: [{value,label,color?}]
   * opts: {placeholder, onChange(values)}
   */
  window.msFilter=function(elOrId,items,opts){
    var el=typeof elOrId==='string'?document.getElementById(elOrId):elOrId;
    if(!el) return null;
    items=items||[];
    opts=opts||{};
    var placeholder=opts.placeholder||'ทั้งหมด';
    el._msPlaceholder=placeholder;
    el._msItems=items;
    if(opts.onChange) el._msOnChange=opts.onChange;

    var itemValues={};items.forEach(function(it){itemValues[String(itemVal(it))]=true;});
    var prevSelected=el._msSelected||[];
    el._msSelected=prevSelected.filter(function(v){return itemValues[v];});

    if(!el._msBuilt){
      el.classList.add('ms-filter');
      el.innerHTML=
        '<button type="button" class="t-sel ms-btn"></button>'+
        '<div class="ms-panel">'+
          '<div class="ms-panel-actions"><button type="button" class="ms-clear">ล้างตัวเลือก</button></div>'+
          '<div class="ms-list"></div>'+
        '</div>';
      var btn=el.querySelector('.ms-btn');
      var panel=el.querySelector('.ms-panel');
      var list=el.querySelector('.ms-list');
      var clearBtn=el.querySelector('.ms-clear');

      btn.addEventListener('click',function(ev){
        ev.stopPropagation();
        var willOpen=!panel.classList.contains('open');
        closeAllPanels();
        if(willOpen) panel.classList.add('open');
      });
      list.addEventListener('change',function(ev){
        var cb=ev.target;
        if(!cb||cb.tagName!=='INPUT') return;
        var v=cb.value,idx=el._msSelected.indexOf(v);
        if(cb.checked&&idx<0) el._msSelected.push(v);
        if(!cb.checked&&idx>=0) el._msSelected.splice(idx,1);
        btn.textContent=labelFor(el);
        btn.classList.toggle('active',el._msSelected.length>0);
        if(el._msOnChange) el._msOnChange(el._msSelected.slice());
      });
      clearBtn.addEventListener('click',function(ev){
        ev.stopPropagation();
        if(el._msSelected.length===0) return;
        el._msSelected=[];
        list.querySelectorAll('input[type=checkbox]').forEach(function(cb){cb.checked=false;});
        btn.textContent=labelFor(el);
        btn.classList.remove('active');
        if(el._msOnChange) el._msOnChange([]);
      });
      el._msBuilt=true;
    }

    var btn=el.querySelector('.ms-btn'),list=el.querySelector('.ms-list');
    btn.textContent=labelFor(el);
    btn.classList.toggle('active',el._msSelected.length>0);
    list.innerHTML=renderRows(items,el._msSelected);

    return{getValues:function(){return el._msSelected.slice();}};
  };

  // อ่านค่าที่เลือกไว้ของ ms-filter (คืนค่า array เสมอ)
  window.msValues=function(elOrId){
    var el=typeof elOrId==='string'?document.getElementById(elOrId):elOrId;
    return(el&&el._msSelected)?el._msSelected.slice():[];
  };
})();
