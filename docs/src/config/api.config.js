/**
 * api.config.js — Backend DB Connection Configuration
 * ตั้งค่า window.SUPABASE_URL / window.SUPABASE_ANON_KEY (ชื่อ ENV/global เดิม) ก่อนโหลดไฟล์นี้
 * env-config.js สร้างค่าให้อัตโนมัติจาก ENV var ตอน container start (docker-entrypoint.sh)
 *
 * วิธีใช้งาน (ใน index.html ก่อน script นี้):
 *   window.SUPABASE_URL      = 'https://xxxx.example';
 *   window.SUPABASE_ANON_KEY = 'eyJ...';
 *
 * หรือจะ hardcode ที่นี่ได้ถ้าไม่ต้องการ multi-environment
 */
(function () {
  window.API_CONFIG = {
    dbUrl: window.SUPABASE_URL      || 'https://YOUR-PROJECT.example',
    dbKey: window.SUPABASE_ANON_KEY || 'YOUR-ANON-KEY',

    realtimeEventsPerSecond: 10,
    paginationSize: 1000,
    realtimeDebounceMs: 350,
  };
})();
