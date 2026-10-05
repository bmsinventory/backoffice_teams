/**
 * training-embed.util.js — หน้าระบบอบรมที่ถูกฝังใน Backoffice (iframe ?embed=1 จาก src/modules/training.js)
 * ใส่คลาส trn-embed ที่ <html> ก่อนวาดหน้า (โหลดใน <head> แบบไม่ defer — ไม่กะพริบ) → training.css ซ่อนแถบเมนู/ปุ่มติดตั้ง/ออกจากระบบของตัวเอง
 * ตรรกะส่วนอื่นของโหมดฝังอยู่ที่ EMBED ใน src/modules/training-app.js
 */
if (new URLSearchParams(location.search).get('embed') === '1' && window.parent !== window) document.documentElement.classList.add('trn-embed');
