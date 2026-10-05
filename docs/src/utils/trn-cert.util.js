/**
 * trn-cert.util.js — ใบประกาศแบบทดสอบหลังอบรม (window.TrnCert) ใช้ร่วมกัน 2 หน้า
 *   หน้าสอบ   /training/?page=quiz (src/modules/training-quiz-take.js) — สอบผ่าน → ส่งอีเมล · เปิดลิงก์ในอีเมล → ดู/ดาวน์โหลดใบประกาศ
 *   ผู้ดูแล   แท็บอบรม › แบบทดสอบ (src/modules/training-quiz.js) — ส่งอีเมลอีกครั้ง · ตัวอย่างใบประกาศ
 * ใบประกาศไม่เก็บเป็นไฟล์ — วาดจากแถว trn_quiz_certs ทุกครั้งที่เปิด (ยกเลิกแล้วลิงก์เดิมแสดงว่า "ถูกยกเลิก" ทันที)
 * อีเมลส่งผ่าน EmailJS (REST) — ตั้งค่าที่ แบบทดสอบ › ตั้งค่าใบประกาศ · ต้องโหลดหลัง qrcode-generator
 */
(function () {
  var KEYS = ['org_name', 'cert_title', 'cert_prefix', 'cert_color', 'cert_font', 'cert_signer_name', 'cert_signer_title',
    'cert_sign_url', 'cert_logo_url', 'cert_bg_url', 'cert_layout', 'emailjs_service_id', 'emailjs_template_id', 'emailjs_public_key',
    'cert_t_intro', 'cert_t_passed', 'cert_t_course', 'cert_t_detail', 'cert_t_date'];
  // ข้อความบนใบประกาศ (แก้ได้ที่ ตั้งค่าใบประกาศ · ใส่ {{ตัวแปร}} ได้ — ชุดเดียวกับเทมเพลตอีเมล) · ว่าง = ค่าเริ่มต้น
  var TEXT = {
    cert_t_intro:  'ขอมอบไว้เพื่อแสดงว่า',
    cert_t_passed: 'ได้ผ่านการทดสอบหลังการอบรม',
    cert_t_course: '{{course_name}}',
    cert_t_detail: 'โครงการ {{project_name}} · ด้วยคะแนน {{percent}}',
    cert_t_date:   'ให้ไว้ ณ วันที่ {{issued_date}}',
  };
  // แบบอักษรบนใบประกาศ — Sarabun = แบบหนังสือราชการ · Noto Serif Thai = มีหัว ดูเป็นทางการ (โหลดจาก Google Fonts เมื่อใช้)
  var FONTS = {
    '':      ['"Noto Sans Thai","Plus Jakarta Sans",sans-serif', ''],
    sarabun: ['"Sarabun",sans-serif', 'Sarabun:wght@400;500;600;700'],
    serif:   ['"Noto Serif Thai",serif', 'Noto+Serif+Thai:wght@400;500;600;700'],
  };
  function useFont(key) {
    var f = FONTS[key] || FONTS[''];
    if (f[1] && !document.getElementById('tc-font-' + key)) {
      var l = document.createElement('link');
      l.id = 'tc-font-' + key; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=' + f[1] + '&display=swap';
      document.head.appendChild(l);
    }
    return f[0];
  }
  var LIBS = {
    html2canvas: ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', function () { return window.html2canvas; }],
    jspdf:       ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', function () { return window.jspdf; }],
  };
  var W = 1123, H = 794; // A4 แนวนอนที่ 96dpi

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function load(name) {
    var L = LIBS[name];
    if (L[1]()) return Promise.resolve();
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = L[0]; s.onload = function () { ok(); }; s.onerror = function () { s.remove(); fail(new Error('โหลด ' + name + ' ไม่สำเร็จ')); };
      document.head.appendChild(s);
    });
  }
  // ผสมสีกับขาว (html2canvas ไม่รู้จัก color-mix) — a = สัดส่วนของสีหลัก 0–1
  function tint(hex, a) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    var n = m ? parseInt(m[1], 16) : 0x7c5cfc, f = function (v) { return Math.round(255 - (255 - v) * a); };
    return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
  }
  function thDate(d) { return new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }); }
  // ลิงก์ใบประกาศ (ในอีเมล + QR บนใบ) — หน้าสอบกับหน้าผู้ดูแลอยู่ที่ /training/ เดียวกัน
  function url(certId) { return location.origin + location.pathname.replace(/[^/]*$/, '') + '?page=quiz&cert=' + encodeURIComponent(certId); }
  function qrSvg(text) {
    var q = window.qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
  }

  window.TrnCert = {
    url: url,
    async settings(sb) {
      var r = await sb.from('trn_settings').select('key,value').in('key', KEYS);
      var m = {};
      (r.data || []).forEach(function (x) { m[x.key] = x.value; });
      return m;
    },
    mailReady(st) { return !!(st.emailjs_service_id && st.emailjs_template_id && st.emailjs_public_key); },
    TEXT: TEXT,

    // เติม course_name / score / total จากผลสอบครั้งนั้น (trn_quiz_certs ไม่ได้เก็บไว้) — เรียกก่อน html()/sendEmail()
    async enrich(sb, cert) {
      if (!cert || !cert.attempt_id || (cert.course_name && cert.score != null)) return cert;
      var a = (await sb.from('trn_quiz_attempts').select('score,total,trn_categories(name)').eq('id', cert.attempt_id).maybeSingle()).data;
      if (a) {
        if (!cert.course_name) cert.course_name = (a.trn_categories && a.trn_categories.name) || '';
        if (cert.score == null) { cert.score = a.score; cert.total = a.total; }
      }
      return cert;
    },
    // ค่าตัวแปร {{...}} — ใช้ทั้งข้อความบนใบประกาศและเทมเพลตอีเมล EmailJS
    vars(cert, st, project) {
      return {
        to_email: cert.email || '', to_name: cert.full_name || '', cert_id: cert.cert_id || '', cert_url: url(cert.cert_id),
        course_name: cert.course_name || cert.quiz_title || '', quiz_title: cert.quiz_title || '',
        score: cert.score != null ? cert.score + '/' + cert.total : '', percent: Math.round(+cert.percent || 0) + '%',
        project_name: project || '', org_name: st.org_name || '', issued_date: thDate(cert.issued_at || Date.now()),
      };
    },
    // แทน {{ตัวแปร}} ในข้อความ (escape แล้ว) · ไม่รู้จัก = คงไว้ตามเดิม (ผู้ดูแลเห็นในตัวอย่างว่าพิมพ์ผิด)
    fill(tpl, v) {
      return esc(tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, k) { return k in v ? esc(v[k]) : m; });
    },

    // ใบประกาศขนาดจริง 1123×794 (ย่อ/ขยายด้วย CSS transform ของตัวห่อ) — cert = แถว trn_quiz_certs · project = ชื่อโครงการ
    // ใบประกาศขนาดจริง 1123×794 (ย่อ/ขยายด้วย CSS transform ของตัวห่อ) — cert = แถว trn_quiz_certs · project = ชื่อโครงการ
    // ตำแหน่งที่ผู้ดูแลลากจัดวาง (cert_layout JSON) — qr/sign = [ซ้าย, บน] px บนใบ · body = เลื่อนข้อความกลางขึ้น/ลง px · ไม่มี = ตำแหน่งตั้งต้น
    layout: function (st) { try { return JSON.parse(st.cert_layout || '{}') || {}; } catch (e) { return {}; } },
    html(cert, st, project) {
      var c = st.cert_color || '#7c5cfc', bg = st.cert_bg_url, L = this.layout(st), v = this.vars(cert, st, project), self = this;
      // ไม่เคยตั้ง = ข้อความเริ่มต้น · ตั้งเป็นค่าว่าง = ไม่แสดงบรรทัดนั้น
      var t = function (k, cls) { var s = self.fill(st[k] != null ? st[k] : TEXT[k], v); return s.trim() ? '<div class="' + cls + '">' + s + '</div>' : ''; };
      var at = function (p) { return p ? ' style="left:' + (+p[0]) + 'px;top:' + (+p[1]) + 'px;right:auto;bottom:auto;"' : ''; };
      // มีพื้นหลัง (กรอบ/ลวดลายจากไฟล์) → ไม่วาดกรอบเอง · ตัวหนังสือจัดกลางพื้นที่ว่างตรงกลาง
      return '<div class="tc-cert' + (bg ? ' tc-has-bg' : '') + '" style="--tc:' + esc(c) + ';--tc-l:' + tint(c, .08) + ';--tc-m:' + tint(c, .35)
        + ';font-family:' + esc(useFont(st.cert_font)) + ';width:' + W + 'px;height:' + H + 'px;">'
        + (bg ? '<img class="tc-bg" src="' + esc(bg) + '" alt="">' : '')
        + '<div class="tc-frame"><div class="tc-inner"></div>'
        + '<div class="tc-body" data-drag="body"' + (L.body ? ' style="top:' + (+L.body) + 'px"' : '') + '>'
        + (st.cert_logo_url ? '<img class="tc-logo" src="' + esc(st.cert_logo_url) + '" alt="">' : '')
        + '<div class="tc-org">' + esc(st.org_name || '') + '</div>'
        + '<div class="tc-title">' + esc(st.cert_title || 'ประกาศนียบัตร') + '</div>'
        + t('cert_t_intro', 'tc-line')
        + '<div class="tc-name">' + esc(cert.full_name) + '</div>'
        + t('cert_t_passed', 'tc-line')
        + t('cert_t_course', 'tc-course')
        + t('cert_t_detail', 'tc-line')
        + t('cert_t_date', 'tc-date')
        + '</div></div>'
        + '<div class="tc-verify" data-drag="qr"' + at(L.qr) + '><div class="tc-qr">' + qrSvg(url(cert.cert_id)) + '</div>'
        + '<div><div class="tc-id">เลขที่ ' + esc(cert.cert_id) + '</div><div class="tc-small">สแกนเพื่อตรวจสอบใบประกาศ</div></div></div>'
        + (st.cert_signer_name ? '<div class="tc-sign" data-drag="sign"' + at(L.sign) + '><div class="tc-sign-line">'
          + (st.cert_sign_url ? '<img class="tc-sign-img" src="' + esc(st.cert_sign_url) + '" alt="">' : '') + '</div>'
          + '<div class="tc-sign-name">(' + esc(st.cert_signer_name) + ')</div>'
          + '<div class="tc-small">' + esc(st.cert_signer_title || '') + '</div></div>' : '')
        + '</div>';
    },
    css: '.tc-cert{position:relative;background:#fff;color:#1e293b;box-sizing:border-box;padding:26px;overflow:hidden}'
      + '.tc-cert *{box-sizing:border-box}'
      + '.tc-cert .tc-frame{position:relative;height:100%;border:3px solid var(--tc);border-radius:6px;padding:54px 70px 40px;text-align:center;background:linear-gradient(135deg,var(--tc-l) 0,#fff 35%,#fff 65%,var(--tc-l) 100%)}'
      + '.tc-cert .tc-inner{position:absolute;inset:8px;border:1px solid var(--tc-m);border-radius:3px;pointer-events:none}'
      + '.tc-cert .tc-body{position:relative}'
      + '.tc-cert .tc-org{font-size:20px;font-weight:600;color:#475569;letter-spacing:.5px}'
      + '.tc-cert .tc-title{font-size:54px;font-weight:700;color:var(--tc);margin:10px 0 18px;line-height:1.25}'
      + '.tc-cert .tc-line{font-size:19px;color:#475569;margin:6px 0}'
      + '.tc-cert .tc-name{font-size:40px;font-weight:700;color:#0f172a;margin:6px auto 10px;padding-bottom:8px;border-bottom:2px solid var(--tc-m);display:inline-block;min-width:55%}'
      + '.tc-cert .tc-course{font-size:26px;font-weight:700;color:var(--tc);margin:4px 0 6px}'
      + '.tc-cert .tc-date{font-size:16px;color:#64748b;margin-top:14px}'
      + '.tc-cert .tc-verify{position:absolute;left:96px;bottom:66px;display:flex;align-items:flex-end;gap:12px;text-align:left}'
      + '.tc-cert .tc-qr{width:84px;height:84px}.tc-cert .tc-qr svg{width:100%;height:100%;display:block}'
      + '.tc-cert .tc-id{font-size:14px;font-weight:700;color:#334155}.tc-cert .tc-small{font-size:12px;color:#64748b}'
      + '.tc-cert .tc-sign{position:absolute;right:96px;bottom:66px;text-align:center;min-width:260px}'
      + '.tc-cert .tc-sign-line{position:relative;border-bottom:1px solid #94a3b8;height:46px;margin-bottom:6px}'
      + '.tc-cert .tc-sign-name{font-size:16px;font-weight:600;color:#1e293b}'
      + '.tc-cert .tc-sign-img{position:absolute;left:50%;bottom:-8px;transform:translateX(-50%);max-width:230px;max-height:78px;object-fit:contain}'
      + '.tc-cert .tc-logo{display:block;height:72px;max-width:220px;object-fit:contain;margin:-24px auto 8px}'
      + '.tc-cert .tc-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}'
      + '.tc-cert.tc-has-bg{padding:0}'
      + '.tc-cert.tc-has-bg .tc-frame{border:none;border-radius:0;background:none;padding:76px 120px 40px}'
      + '.tc-cert.tc-has-bg .tc-inner{display:none}'
      + '.tc-cert.tc-has-bg .tc-verify{left:120px;bottom:70px}.tc-cert.tc-has-bg .tc-sign{right:120px;bottom:70px}',


    // ดาวน์โหลด PDF — el = .tc-cert ที่แสดงอยู่ (ย่อด้วย transform ได้)
    async pdf(el, fileName) {
      await Promise.all([load('html2canvas'), load('jspdf')]);
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      // วาดจากสำเนาขนาดจริงนอกจอ (ตัวที่แสดงบนหน้าถูกย่อด้วย transform)
      var box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:-20000px;top:0;';
      var copy = el.cloneNode(true); copy.style.transform = 'none';
      box.appendChild(copy); document.body.appendChild(box);
      var canvas;
      try { canvas = await window.html2canvas(copy, { scale: 2, backgroundColor: '#ffffff', useCORS: true }); }
      finally { box.remove(); }
      var doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210);
      doc.save(fileName);
    },

    // ส่งอีเมลใบประกาศ (EmailJS) แล้วบันทึกสถานะใน trn_quiz_certs → { ok, error }
    // ตัวแปรในเทมเพลต EmailJS = vars() — to_email to_name cert_id cert_url course_name quiz_title score percent project_name org_name issued_date
    async sendEmail(sb, cert, st, project) {
      var res = { ok: false, error: '' };
      if (!this.mailReady(st)) res.error = 'ยังไม่ได้ตั้งค่าการส่งอีเมล (EmailJS)';
      else {
        try {
          await this.enrich(sb, cert);
          var r = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              service_id: st.emailjs_service_id, template_id: st.emailjs_template_id, user_id: st.emailjs_public_key,
              template_params: this.vars(cert, st, project),
            }),
          });
          if (r.ok) res.ok = true;
          else res.error = ('EmailJS ' + r.status + ': ' + (await r.text())).slice(0, 300);
        } catch (e) { res.error = 'เชื่อมต่อบริการอีเมลไม่ได้'; }
      }
      await sb.from('trn_quiz_certs').update({
        email_status: res.ok ? 'sent' : 'failed', email_error: res.error, emailed_at: res.ok ? new Date().toISOString() : null,
      }).eq('cert_id', cert.cert_id);
      return res;
    },
  };
})();
