window.SUPABASE_URL      = '${SUPABASE_URL}';
window.SUPABASE_ANON_KEY = '${SUPABASE_ANON_KEY}';

// ── คำขอข้อมูล (REST /rest/v1/) วิ่งผ่าน nginx ของหน้าเว็บนี้ที่ /db/rest/v1/ ซึ่งบีบอัด gzip ให้
// ครอบ fetch ก่อนโหลด supabase-js → ทุกหน้า/ทุก client ได้ผลเหมือนกัน · realtime / login / ไฟล์แนบ ยังต่อตรงตามเดิม ──
(function () {
  if (!window.fetch) return;
  var from = window.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/';
  var to = location.origin + '/db/rest/v1/';
  var orig = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input instanceof URL ? input.href : null;
    if (!url || url.indexOf(from) !== 0) return orig(input, init);
    return orig(to + url.slice(from.length), init);
  };
})();
