window.SUPABASE_URL      = '${SUPABASE_URL}';
window.SUPABASE_ANON_KEY = '${SUPABASE_ANON_KEY}';

// ── คำขอข้อมูล (REST /rest/v1/) วิ่งผ่าน nginx ของหน้าเว็บนี้ที่ /db/rest/v1/ ซึ่งบีบอัด gzip ให้
// (Proxy ข้างหน้าส่ง JSON เต็มขนาด — เปิดระบบครั้งหนึ่ง ~1.3 MB) · ครอบ fetch ก่อนโหลด supabase-js → ทุกหน้า/ทุก client ได้ผลเหมือนกัน
// realtime / login / ไฟล์แนบ ยังต่อตรงตามเดิม · ปิดได้ด้วย ENV API_PROXY=0 (docker-entrypoint.sh)
// ทางสำรอง: proxy ต่อ Supabase ไม่ได้ (502/504 หรือเชื่อมต่อไม่ได้) → ส่งคำขอนั้นตรงอีกครั้ง และต่อตรงตลอดจนปิดหน้า ──
(function (on) {
  if (on !== '1' || !window.fetch) return;
  var from = window.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/';
  var to = location.origin + '/db/rest/v1/';
  var orig = window.fetch.bind(window), off = false;
  function fallback(input, init) {
    if (!off) { off = true; console.warn('[env-config] /db proxy ใช้งานไม่ได้ — ต่อ Supabase ตรง'); }
    return orig(input, init);
  }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input instanceof URL ? input.href : null;
    if (off || !url || url.indexOf(from) !== 0) return orig(input, init);
    return orig(to + url.slice(from.length), init).then(function (res) {
      return res.status === 502 || res.status === 504 ? fallback(input, init) : res;
    }, function (e) {
      if (e && e.name === 'AbortError') throw e;
      return fallback(input, init);
    });
  };
})('${API_PROXY}');
