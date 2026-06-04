/**
 * api.config.js — Supabase Connection Configuration
 * ตั้งค่า SUPABASE_URL และ SUPABASE_ANON_KEY ก่อนโหลดไฟล์นี้
 *
 * วิธีใช้งาน (ใน index.html ก่อน script นี้):
 *   window.SUPABASE_URL      = 'https://xxxx.supabase.co';
 *   window.SUPABASE_ANON_KEY = 'eyJ...';
 *
 * หรือจะ hardcode ที่นี่ได้ถ้าไม่ต้องการ multi-environment
 */
(function () {
  window.API_CONFIG = {
    supabaseUrl:     window.SUPABASE_URL      || 'https://YOUR-PROJECT.supabase.co',
    supabaseAnonKey: window.SUPABASE_ANON_KEY || 'YOUR-ANON-KEY',

    realtimeEventsPerSecond: 10,
    paginationSize: 1000,
    realtimeDebounceMs: 350,
  };
})();
