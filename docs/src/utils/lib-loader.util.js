/**
 * lib-loader.util.js — โหลดไลบรารีหนักเฉพาะตอนจะใช้ (เดิมโหลดทุกครั้งที่เปิดระบบ ~1.1 MB ทั้งที่ไม่ค่อยได้ใช้)
 *   if (!(await window.LibLoader.need('xlsx'))) return;   → true เมื่อพร้อม · false = โหลดไม่สำเร็จ (แจ้งเตือนแล้ว)
 * URL ตรงกับ _LIBS ใน src/modules/training-app.js → หน้าอบรม (iframe) ใช้แคชร่วมกัน
 */
(function () {
  var LIBS = {
    xlsx:        { src: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',        ok: function () { return window.XLSX; } },
    html2canvas: { src: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', ok: function () { return window.html2canvas; } },
    // กราฟหน้า Overview · echartsgl (กราฟ 3D WebGL) ต้องโหลดหลัง echarts และไม่มีตัวแปร global ให้เช็ก → ใช้ธง done
    echarts:     { src: 'https://cdnjs.cloudflare.com/ajax/libs/echarts/5.4.3/echarts.min.js',         ok: function () { return window.echarts; } },
    echartsgl:   { src: 'https://cdn.jsdelivr.net/npm/echarts-gl@2.0.9/dist/echarts-gl.min.js', dep: 'echarts', ok: function () { return LIBS.echartsgl.done; } },
  };
  var loading = {};

  function load(name) {
    var L = LIBS[name];
    if (L.ok()) return Promise.resolve();
    if (loading[name]) return loading[name];
    return (loading[name] = (L.dep ? load(L.dep) : Promise.resolve()).then(function () {
      return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = L.src;
        s.onload = function () { L.done = true; L.ok() ? resolve() : reject(new Error(name)); };
        s.onerror = function () { delete loading[name]; s.remove(); reject(new Error(name)); };
        document.head.appendChild(s);
      });
    }, function (e) { delete loading[name]; throw e; }));
  }

  window.LibLoader = {
    need: function () {
      var names = Array.prototype.slice.call(arguments);
      return Promise.all(names.map(load)).then(function () { return true; }, function () {
        var msg = 'โหลดส่วนประกอบไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
        if (window.showAlert) window.showAlert(msg, 'error'); else alert(msg);
        return false;
      });
    },
    // เหมือน need แต่ไม่แจ้งเตือนเมื่อโหลดไม่สำเร็จ (ใช้กับส่วนเสริมที่มีทางสำรอง เช่น กราฟ 3D → 2D)
    want: function () {
      var names = Array.prototype.slice.call(arguments);
      return Promise.all(names.map(load)).then(function () { return true; }, function () { return false; });
    },
  };
})();
