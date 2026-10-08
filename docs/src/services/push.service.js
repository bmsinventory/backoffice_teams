/**
 * Browser Web Push registration.
 * Public VAPID key มาจาก RPC get_web_push_public_key (ตัวส่งใน frontend container ประกาศไว้)
 * — private key อยู่ในตัวส่งเท่านั้น
 */
(function () {
  var PUBLIC_KEY = '';

  function supported() {
    return !!(window.isSecureContext && 'serviceWorker' in navigator &&
      'PushManager' in window && 'Notification' in window);
  }

  async function publicKey() {
    if (PUBLIC_KEY) return PUBLIC_KEY;
    var db = window.getDb && window.getDb();
    if (!db || !db.rpc) return '';
    var result = await db.rpc('get_web_push_public_key');
    PUBLIC_KEY = String((!result.error && result.data) || '').trim();
    return PUBLIC_KEY;
  }

  function keyBytes(base64) {
    var pad = '='.repeat((4 - base64.length % 4) % 4);
    var raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, function (c) { return c.charCodeAt(0); });
  }

  async function subscriptionId(endpoint) {
    var bytes = new TextEncoder().encode(endpoint);
    var hash = await crypto.subtle.digest('SHA-256', bytes);
    return 'WPS_' + Array.from(new Uint8Array(hash)).map(function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  async function saveSubscription(sub) {
    var json = sub.toJSON(), keys = json.keys || {};
    var id = await subscriptionId(sub.endpoint);
    var db = window.getDb && window.getDb();
    if (!db || !db.rpc) throw new Error('ไม่พบการเชื่อมต่อฐานข้อมูล');
    var result = await db.rpc('register_web_push_subscription', {
      p_id: id,
      p_endpoint: sub.endpoint,
      p_p256dh: keys.p256dh || '',
      p_auth: keys.auth || '',
      p_user_id: (window.cu && window.cu.id) || '',
      p_user_name: (window.cu && (window.cu.name || window.cu.username)) || '',
      p_user_agent: navigator.userAgent.slice(0, 500),
    });
    if (result.error) throw result.error;
    return id;
  }

  function refreshMenu() {
    if (document.getElementById('noti-menu') && window.refreshNotiMenu) window.refreshNotiMenu();
  }

  window.webPushMenuHtml = function () {
    if (!window.cu || (window.canView && !window.canView('helpdesk'))) return '';
    var on = supported() && Notification.permission === 'granted';
    var blocked = 'Notification' in window && Notification.permission === 'denied';
    var label = on ? 'ปิดแจ้งเตือนเมื่อปิด WebApp' : blocked ? 'เบราว์เซอร์บล็อกการแจ้งเตือน' : 'เปิดแจ้งเตือนเมื่อปิด WebApp';
    var icon = on ? '🔕' : blocked ? '🚫' : '📳';
    return '<div style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px;">'
      + '<button type="button" data-action="web-push"' + (blocked || !supported() ? ' disabled' : '') + '>'
      + '<span class="nm-ic">' + icon + '</span><span class="nm-lbl">' + label + '</span></button></div>';
  };

  window.enableWebPush = async function () {
    if (!supported()) {
      window.showAlert && window.showAlert('เบราว์เซอร์/อุปกรณ์นี้ไม่รองรับการแจ้งเตือน (iPhone ต้องเพิ่มแอปลงหน้าจอโฮมก่อน)', 'warn');
      return false;
    }
    try {
      var key = await publicKey();
      if (!key) {
        window.showAlert && window.showAlert('ระบบแจ้งเตือนยังไม่พร้อม กรุณาลองใหม่ภายหลัง', 'warn');
        return false;
      }
      var permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        window.showAlert && window.showAlert('ยังไม่ได้รับอนุญาตให้แสดงการแจ้งเตือน กรุณาอนุญาตในการตั้งค่าเบราว์เซอร์', 'warn');
        refreshMenu(); return false;
      }
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      // สมัครไว้ด้วย key เก่า (เปลี่ยน worker.secret) → สมัครใหม่
      if (sub && sub.options && sub.options.applicationServerKey &&
          btoa(String.fromCharCode.apply(null, new Uint8Array(sub.options.applicationServerKey))) !==
          btoa(String.fromCharCode.apply(null, keyBytes(key)))) {
        await sub.unsubscribe(); sub = null;
      }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
      await saveSubscription(sub);
      window.showAlert && window.showAlert('เปิดแจ้งเตือนแล้ว แม้ปิดหน้า WebApp ก็ยังได้รับข้อความ', 'success');
      refreshMenu(); return true;
    } catch (e) {
      console.warn('[push] subscribe:', e);
      window.showAlert && window.showAlert('เปิดการแจ้งเตือนไม่สำเร็จ: ' + (e.message || e), 'error');
      return false;
    }
  };

  window.disableWebPush = async function (silent) {
    if (!('serviceWorker' in navigator)) return;
    try {
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (sub) {
        var id = await subscriptionId(sub.endpoint);
        var db = window.getDb && window.getDb();
        if (db && db.rpc) {
          var result = await db.rpc('unregister_web_push_subscription', { p_id: id, p_endpoint: sub.endpoint });
          if (result.error) throw result.error;
        }
        await sub.unsubscribe();
      }
      if (!silent && window.showAlert) window.showAlert('ปิดการแจ้งเตือนนอก WebApp แล้ว', 'success');
    } catch (e) {
      console.warn('[push] unsubscribe:', e);
      if (!silent && window.showAlert) window.showAlert('ปิดการแจ้งเตือนไม่สำเร็จ: ' + (e.message || e), 'error');
    }
    refreshMenu();
  };

  window.toggleWebPush = async function () {
    if (!supported()) return window.enableWebPush();
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    return sub ? window.disableWebPush(false) : window.enableWebPush();
  };

  // Re-save an existing subscription after login so it stays attached to the current user.
  // This never opens the browser permission prompt by itself.
  window.syncWebPush = async function () {
    if (!supported() || Notification.permission !== 'granted' || !window.cu) return;
    if (window.canView && !window.canView('helpdesk')) {
      await window.disableWebPush(true);
      return;
    }
    try {
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (sub) await saveSubscription(sub);
    } catch (e) { console.warn('[push] sync:', e); }
  };
})();
