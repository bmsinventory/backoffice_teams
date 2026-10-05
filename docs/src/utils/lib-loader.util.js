/**
 * lib-loader.util.js — โหลดไลบรารีหนักเฉพาะตอนจะใช้ (เดิมโหลดทุกครั้งที่เปิดระบบ ~1.1 MB ทั้งที่ไม่ค่อยได้ใช้)
 *   if (!(await window.LibLoader.need('xlsx'))) return;   → true เมื่อพร้อม · false = โหลดไม่สำเร็จ (แจ้งเตือนแล้ว)
 * URL ตรงกับ _LIBS ใน src/modules/training-app.js → หน้าอบรม (iframe) ใช้แคชร่วมกัน
 */
(function () {
  var LIBS = {
    xlsx:        { src: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',        ok: function () { return window.XLSX; } },
    html2canvas: { src: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', ok: function () { return window.html2canvas; } },
  };
  var loading = {};

  function load(name) {
    var L = LIBS[name];
    if (L.ok()) return Promise.resolve();
    return loading[name] || (loading[name] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = L.src;
      s.onload = function () { L.ok() ? resolve() : reject(new Error(name)); };
      s.onerror = function () { delete loading[name]; s.remove(); reject(new Error(name)); };
      document.head.appendChild(s);
    }));
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
  };
})();
