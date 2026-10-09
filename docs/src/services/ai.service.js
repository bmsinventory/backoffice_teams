/**
 * ai.service.js — ตัวเรียก AI กลางของทั้งระบบ (vLLM OpenAI-compatible)
 * ดูวิธีใช้ API: https://vllm-gemma.bmscloud.in.th/docs
 * เซิร์ฟเวอร์ไม่ใช้คีย์ + เปิด CORS ไว้ → เบราว์เซอร์เรียกตรงได้เลย ไม่ต้องผ่าน proxy
 *
 * ใช้โดย: Helpdesk (วิเคราะห์หมวด/Priority, ร่างข้อความตอบ), Impl Tracker (แนะนำกลุ่มปัญหา/วิธีแก้),
 * ปัญหาทุกโครงการ (สรุปบทวิเคราะห์)
 */
(function () {

  window.AI_BASE = 'https://vllm-gemma.bmscloud.in.th';

  // เช็ค content-type ก่อน parse กันข้อความ error ดิบ "Unexpected token '<'" หลุดถึงผู้ใช้
  // ถ้าปลายทางตอบกลับมาเป็นหน้า HTML (เช่นหน้า error ของ reverse proxy)
  async function aiJsonOrThrow(res) {
    var ct = res.headers.get('content-type') || '';
    if (ct.indexOf('json') < 0) throw new Error('ระบบ AI ตอบกลับผิดรูปแบบ — ลองใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบ');
    return res.json();
  }

  // ── ชื่อโมเดล — ถามจาก /v1/models ครั้งแรกแล้วจำไว้ (เปลี่ยนโมเดลฝั่งเซิร์ฟเวอร์ได้โดยไม่ต้องแก้โค้ด) ──
  var _model = null;
  window.aiModel = async function () {
    if (_model) return _model;
    var res;
    try { res = await fetch(window.AI_BASE + '/v1/models', { headers: { 'Accept': 'application/json' } }); }
    catch (e) { throw new Error('เชื่อมต่อระบบ AI ไม่ได้ — ตรวจสอบอินเทอร์เน็ต หรือเซิร์ฟเวอร์ AI อาจปิดอยู่'); }
    if (!res.ok) throw new Error('เรียก AI ไม่สำเร็จ (HTTP ' + res.status + ')');
    var d = await aiJsonOrThrow(res);
    _model = (d.data && d.data[0] && d.data[0].id) || 'gemma4';
    return _model;
  };

  // ── ส่งข้อความหา AI คืนข้อความคำตอบ (string) ──
  // opts: { maxTokens, temperature }
  window.aiChat = async function (system, user, opts) {
    opts = opts || {};
    var model = await window.aiModel();
    var res;
    try {
      res = await fetch(window.AI_BASE + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          temperature: opts.temperature != null ? opts.temperature : 0.2,
          max_tokens: opts.maxTokens || 600,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
      });
    } catch (e) { throw new Error('เชื่อมต่อระบบ AI ไม่ได้ — ตรวจสอบอินเทอร์เน็ต หรือเซิร์ฟเวอร์ AI อาจปิดอยู่'); }
    if (!res.ok) throw new Error('AI ประมวลผลไม่สำเร็จ (HTTP ' + res.status + ')');
    var data = await aiJsonOrThrow(res);
    var content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error('AI ไม่ได้ตอบกลับมา — ลองใหม่อีกครั้ง');
    // โมเดลบางครั้งเขียนลูกศรเป็น LaTeX ($\rightarrow$) ซึ่งหน้าเว็บ/LINE แสดงเป็นข้อความดิบ — แปลงเป็นอักขระปกติ
    return String(content).trim()
      .replace(/\$\s*\\(?:rightarrow|to|Rightarrow|longrightarrow)\s*\$/g, '→')
      .replace(/\$\s*\\(?:leftarrow|Leftarrow)\s*\$/g, '←');
  };

  // ซ่อมเฉพาะข้อผิดพลาดที่โมเดลทำบ่อยใน JSON string:
  //   1) backslash ที่ไม่ได้เป็น JSON escape เช่น \path หรือ LaTeX
  //   2) อักขระควบคุม/ขึ้นบรรทัดใหม่ที่ไม่ได้ escape
  // ลอง parse คำตอบเดิมก่อนเสมอ เพื่อไม่เปลี่ยน JSON ที่ถูกต้องอยู่แล้ว
  function repairAiJsonStrings(src) {
    var out = '', inString = false;
    for (var i = 0; i < src.length; i++) {
      var ch = src.charAt(i);
      if (!inString) {
        out += ch;
        if (ch === '"') inString = true;
        continue;
      }
      if (ch === '"') {
        out += ch;
        inString = false;
        continue;
      }
      if (ch === '\\') {
        var next = src.charAt(i + 1);
        if (/["\\/bfnrt]/.test(next)) {
          out += ch + next;
          i++;
        } else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(src.slice(i + 2, i + 6))) {
          out += src.slice(i, i + 6);
          i += 5;
        } else {
          // รักษา backslash ที่ AI ตั้งใจให้เป็นข้อความ โดย escape ให้ถูกตาม JSON
          out += '\\\\';
        }
        continue;
      }
      if (ch.charCodeAt(0) <= 0x1f) {
        var escapes = { '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f', '\r': '\\r' };
        out += escapes[ch] || ('\\u' + ('000' + ch.charCodeAt(0).toString(16)).slice(-4));
        continue;
      }
      out += ch;
    }
    return out;
  }

  // ── ดึง JSON ออกจากคำตอบ (โมเดลมักห่อด้วย ```json ... ``` แม้สั่งว่าไม่ต้อง) ──
  window.aiParseJson = function (txt) {
    var m = String(txt || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
    var body = m ? m[1] : String(txt || '');
    var s = body.indexOf('{'), e = body.lastIndexOf('}');
    if (s < 0 || e < 0) throw new Error('AI ตอบไม่เป็น JSON — ลองใหม่อีกครั้ง');
    var json = body.slice(s, e + 1);
    try {
      return JSON.parse(json);
    } catch (firstError) {
      try {
        return JSON.parse(repairAiJsonStrings(json));
      } catch (repairError) {
        throw new Error('AI ตอบข้อมูลไม่สมบูรณ์ — กรุณากดให้ AI แยกปัญหาอีกครั้ง');
      }
    }
  };
  window.aiChatJson = async function (system, user, opts) {
    return window.aiParseJson(await window.aiChat(system, user, opts));
  };

  // ── ความคล้ายของข้อความ (0–1) แบบ character bigram — ใช้กับภาษาไทยที่ไม่มีเว้นวรรคระหว่างคำได้
  // (การตัดคำด้วยช่องว่างจับภาษาไทยไม่ค่อยได้) ใช้หาปัญหาเก่าที่คล้ายกันไปเป็นตัวอย่างให้ AI ──
  function bigrams(s) {
    var t = String(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
    var out = {};
    for (var i = 0; i < t.length - 1; i++) out[t.substr(i, 2)] = true;
    return out;
  }
  window.aiTextSim = function (a, b) {
    var A = bigrams(a), B = bigrams(b), inter = 0, na = 0, nb = 0, k;
    for (k in A) { na++; if (B[k]) inter++; }
    for (k in B) nb++;
    return (na + nb) ? (2 * inter) / (na + nb) : 0;
  };

  // ── การ์ดคำแนะนำจาก AI แบบย่อ — 1 บรรทัดสรุป (+ ปุ่มสำคัญ) กด "ดูเพิ่มเติม" เพื่อกางรายละเอียด ──
  // o: { title, summary (html), actions (html ปุ่ม — คลิกแล้วไม่ทำให้การ์ดกาง/พับ), body (html), open (กางไว้ตั้งแต่แรก) }
  window.aiSuggestHtml = function (o) {
    return '<details class="ai-sug"' + (o.open ? ' open' : '') + '><summary>'
      + '<span class="ai-sug-t">🤖 ' + (o.title || 'AI') + '</span>'
      + '<span class="ai-sug-s">' + (o.summary || '') + '</span>'
      + (o.actions ? '<span class="ai-sug-a" onclick="event.preventDefault();event.stopPropagation();">' + o.actions + '</span>' : '')
      + '<span class="ai-sug-more"></span>'
      + '</summary><div class="ai-sug-body">' + (o.body || '') + '</div></details>';
  };

  // ── ป้ายสีแดง "เติมโดย AI" ใต้ช่องฟอร์มที่ AI เติมค่าให้อัตโนมัติ — หายไปเองเมื่อผู้ใช้แก้ค่าช่องนั้นเอง
  // (เปลี่ยนค่าด้วยโค้ดไม่ทำให้หาย เพราะเช็ค isTrusted) · on=false = ลบป้ายทิ้ง ──
  window.aiFlagField = function (el, on) {
    if (!el || !el.parentNode) return;
    var f = el.parentNode.querySelector('.ai-flag');
    if (!on) { if (f) f.remove(); return; }
    if (f) return;
    f = document.createElement('div');
    f.className = 'ai-flag';
    f.textContent = '🤖 เติมโดย AI';
    el.parentNode.appendChild(f);
    var evName = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evName, function onUserEdit(e) {
      if (!e.isTrusted) return;
      window.aiFlagField(el, false); el.removeEventListener(evName, onUserEdit);
    });
  };

  // ── แปลงข้อความจาก AI เป็น HTML แบบง่าย (escape ก่อนเสมอ) — รองรับหัวข้อ #, bullet -/*/1., **ตัวหนา** ──
  window.aiTextToHtml = function (txt) {
    var lines = window.esc(String(txt || '')).split(/\r?\n/);
    var html = '', inList = false;
    lines.forEach(function (ln) {
      var l = ln.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      var bullet = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (bullet) { if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + bullet[1] + '</li>'; return; }
      if (inList) { html += '</ul>'; inList = false; }
      var head = l.match(/^\s*#{1,4}\s+(.*)$/);
      if (head) html += '<div class="ai-h">' + head[1] + '</div>';
      else if (l.trim()) html += '<p>' + l + '</p>';
    });
    if (inList) html += '</ul>';
    return html;
  };

})();
