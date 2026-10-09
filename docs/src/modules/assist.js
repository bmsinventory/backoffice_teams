/**
 * assist.js — 💬 ผู้ช่วยทีม (module 'assist') — แชทถามข้อความ/โค้ดที่ทีมเก็บไว้ในคลัง (ตาราง assist_replies)
 *   คล้าย Auto-reply ของ LINE OA: พิมพ์คำสั่งลัด (/update-hosxp) หรือคำที่ตั้งไว้ → ตอบทันทีไม่ผ่าน AI
 *   พิมพ์เป็นภาษาคน → คัดรายการที่ใกล้เคียงด้วย aiTextSim แล้วให้ AI "เลือก" รายการที่ตรงที่สุด
 *
 * หลักการ: AI เลือกได้อย่างเดียว ห้ามเขียน/แก้เนื้อหาเอง — ข้อความ/โค้ดที่แสดงดึงจากคลังตรงตัวทุกตัวอักษร
 * (โค้ด SQL อัปเดตที่ AI แต่งผิดแม้ตัวเดียวแล้วทีมเอาไปรันที่ รพ. = เสียหายจริง)
 * สิทธิ์: ดู = ถามได้ · เพิ่ม/แก้/ลบ = จัดการคลังคำตอบ (Admin ตั้งต่อ Role ได้ใน Admin Panel)
 * ตัวเรียก AI กลาง: src/services/ai.service.js
 */
(function () {

  var esc = function (s) { return window.esc(s); };
  var REPLIES = [];        // รายการทั้งหมด (รวมที่ปิดใช้งาน) — จาก onSnapshot
  // read-only snapshot สำหรับ Ask AI — เนื้อหายังคงมาจากคลังคำตอบจริง ไม่ให้ AI แต่งเอง
  window.askAiAssistReplies = function () { return REPLIES.slice(); };
  var _msgs = [];          // ประวัติแชทของรอบนี้ (ไม่บันทึกลงฐานข้อมูล) — { me: bool, html }
  var _libQ = '';          // คำค้นในแผงคลังคำตอบ
  var _libOpen = false;    // มือถือ: เปิดแผงคลังคำตอบทับหน้าแชท
  var _busy = false;

  // ── Transform: raw DB row → app object ──
  function tReply(d) {
    return {
      id: d.id, title: d.title || '', command: d.command || '', keywords: d.keywords || '',
      category: d.category || '', content: d.content || '', note: d.note || '', active: d.active !== false,
      createdById: d.created_by || '', updatedById: d.updated_by || '', createdAt: d.created_at || '', updatedAt: d.updated_at || '',
    };
  }
  window.onSnapshot(window.getColRef('ASSIST_REPLIES'), function (s) {
    REPLIES = s.docs.map(function (doc) { return tReply(doc.data()); })
      .sort(function (a, b) { return (a.category || '~').localeCompare(b.category || '~', 'th') || a.title.localeCompare(b.title, 'th'); });
    var el = document.getElementById('view-assist');
    if (el && el.classList.contains('on')) renderLib();
  }, function (e) { window.showDbErrorSoft && window.showDbErrorSoft(e, 'ผู้ช่วยทีม'); });

  function live() { return REPLIES.filter(function (r) { return r.active; }); }
  function byId(id) { return REPLIES.find(function (r) { return r.id === id; }); }

  // ── จับคู่ข้อความแบบหลวม ๆ — ตัวพิมพ์เล็ก ตัดช่องว่าง/เครื่องหมายออก ──
  function norm(s) { return String(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ''); }
  function kwList(r) { return String(r.keywords || '').split(/[,\n]/).map(function (k) { return k.trim(); }).filter(Boolean); }
  function normCmd(s) { s = String(s || '').trim().toLowerCase(); return s.charAt(0) === '/' ? s : '/' + s; }

  // ชั้นที่ 1: ตรงตัว — คำสั่งลัด / หัวข้อ / คำที่ใช้เรียก (ไม่ต้องถาม AI)
  function exactMatch(q) {
    var list = live();
    if (q.charAt(0) === '/') {
      var c = normCmd(q.split(/\s/)[0]);
      return list.find(function (r) { return r.command && normCmd(r.command) === c; });
    }
    var n = norm(q);
    if (!n) return null;
    return list.find(function (r) {
      return norm(r.title) === n || (r.command && norm(r.command) === n)
        || kwList(r).some(function (k) { return norm(k) === n; });
    });
  }

  // คะแนนความใกล้เคียง (0–1+) — ใช้คัดรายการส่งให้ AI เลือก และเป็นตัวสำรองเมื่อ AI ไม่พร้อม
  function score(r, q) {
    var nq = norm(q), best = window.aiTextSim(q, r.title);
    kwList(r).forEach(function (k) {
      best = Math.max(best, window.aiTextSim(q, k));
      var nk = norm(k);
      if (nk.length >= 3 && nq.indexOf(nk) >= 0) best = Math.max(best, 0.6);
    });
    var nt = norm(r.title);
    if (nq.length >= 3 && nt.indexOf(nq) >= 0) best = Math.max(best, 0.6);
    best = Math.max(best, window.aiTextSim(q, r.content.slice(0, 300)) * 0.6);
    return best;
  }
  function ranked(q) {
    return live().map(function (r) { return { r: r, s: score(r, q) }; })
      .sort(function (a, b) { return b.s - a.s; });
  }

  // ── ชั้นที่ 2: ให้ AI เลือกจากรายการที่คัดมา (เห็นแค่หัวข้อ/คำเรียก/ตัวอย่างเนื้อหาสั้น ๆ) ──
  var SYS = 'คุณคือผู้ช่วยของทีมงาน มีหน้าที่ "เลือก" รายการจากคลังคำตอบที่ตอบคำถามของผู้ใช้ได้ตรงที่สุด\n'
    + '- ห้ามแต่งคำตอบ ข้อความ หรือโค้ดขึ้นเอง ให้เลือก id จากรายการที่ให้มาเท่านั้น\n'
    + '- เลือกได้สูงสุด 3 รายการ เรียงจากตรงที่สุด ถ้าไม่มีรายการไหนตอบคำถามได้จริง ให้ ids เป็น []\n'
    + '- reply = ข้อความสั้น 1 ประโยคภาษาไทยบอกว่าพบอะไร (หรือบอกว่าไม่พบ) ไม่ต้องใส่เนื้อหาของรายการ\n'
    + 'ตอบเป็น JSON อย่างเดียว: {"ids":["..."],"reply":"..."}';

  async function aiPick(q, cands) {
    var list = cands.map(function (c) {
      var r = c.r;
      return 'id=' + r.id + ' | หัวข้อ: ' + r.title
        + (r.category ? ' | หมวด: ' + r.category : '')
        + (r.keywords ? ' | คำที่ใช้เรียก: ' + r.keywords.replace(/\n/g, ', ') : '')
        + ' | เนื้อหาย่อ: ' + r.content.replace(/```[\s\S]*?```/g, '[โค้ด]').replace(/\s+/g, ' ').slice(0, 140);
    }).join('\n');
    var out = await window.aiChatJson(SYS, 'รายการในคลัง:\n' + list + '\n\nคำถามของผู้ใช้: ' + q, { maxTokens: 300, temperature: 0 });
    var ok = {}; cands.forEach(function (c) { ok[c.r.id] = true; });
    var ids = (Array.isArray(out.ids) ? out.ids : []).map(String).filter(function (id, i, a) { return ok[id] && a.indexOf(id) === i; }).slice(0, 3);
    return { ids: ids, reply: String(out.reply || '').trim() };
  }

  // ══ แสดงเนื้อหา — ข้อความธรรมดา + กล่องโค้ด (```...```) พร้อมปุ่มคัดลอก ══
  function contentHtml(txt) {
    var parts = String(txt || '').split(/```/);
    return parts.map(function (p, i) {
      if (i % 2 === 1) {
        var lang = (p.match(/^[a-zA-Z0-9_+-]*(?=\r?\n)/) || [''])[0];
        var code = p.slice(lang.length).replace(/^\r?\n/, '').replace(/\r?\n$/, '');
        return '<div class="as-code"><div class="as-code-h"><span>' + esc(lang || 'code') + '</span>'
          + '<button type="button" class="as-copy" onclick="window.asCopy(this)">📋 คัดลอก</button></div>'
          + '<pre><code>' + esc(code) + '</code></pre></div>';
      }
      var t = p.replace(/^\r?\n+|\r?\n+$/g, '');
      return t ? '<div class="as-text">' + esc(t) + '</div>' : '';
    }).join('');
  }
  function cardHtml(r) {
    var hasCode = r.content.indexOf('```') >= 0;
    var who = window.userNameById(r.updatedById || r.createdById); // เก็บเป็นรหัสผู้ใช้ (users.id)
    return '<div class="as-card">'
      + '<div class="as-card-h"><span class="as-card-t">' + esc(r.title) + '</span>'
      + (r.command ? '<span class="as-cmd">' + esc(normCmd(r.command)) + '</span>' : '')
      + (!hasCode ? '<button type="button" class="as-copy" data-id="' + esc(r.id) + '" onclick="window.asCopyAll(this)">📋 คัดลอก</button>' : '')
      + '</div>'
      + contentHtml(r.content)
      + (r.note ? '<div class="as-note">⚠️ ' + esc(r.note) + '</div>' : '')
      + '<div class="as-meta">' + (r.category ? esc(r.category) + ' · ' : '')
      + 'อัปเดตล่าสุด ' + esc(window.fd ? window.fd(String(r.updatedAt || r.createdAt).slice(0, 10)) : String(r.updatedAt).slice(0, 10))
      + (who ? ' โดย ' + esc(who) : '')
      + (window.canEdit('assist') ? ' · <a href="javascript:void(0)" onclick="window.asEdit(\'' + esc(r.id) + '\')">✏️ แก้ไข</a>' : '')
      + '</div></div>';
  }
  function chipsHtml(rs, label) {
    if (!rs.length) return '';
    return '<div class="as-rel">' + esc(label) + ' ' + rs.map(function (r) {
      return '<button type="button" class="as-chip" onclick="window.asShow(\'' + esc(r.id) + '\')">' + esc(r.title) + '</button>';
    }).join('') + '</div>';
  }

  window.asCopy = function (btn) {
    var code = btn.closest('.as-code').querySelector('code').textContent;
    copyText(code, btn);
  };
  window.asCopyAll = function (btn) {
    var r = byId(btn.getAttribute('data-id'));
    if (r) copyText(r.content, btn);
  };
  function copyText(txt, btn) {
    var done = function () { var o = btn.textContent; btn.textContent = '✅ คัดลอกแล้ว'; setTimeout(function () { btn.textContent = o; }, 1500); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done, fallback);
    else fallback();
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { window.showToast('คัดลอกไม่สำเร็จ', 'error'); }
      ta.remove();
    }
  }

  // ══ แชท ══
  function push(me, html) {
    _msgs.push({ me: me, html: html });
    renderChat();
  }
  function renderChat() {
    var box = document.getElementById('as-chat');
    if (!box) return;
    box.innerHTML = _msgs.length ? _msgs.map(function (m) {
      return '<div class="as-msg ' + (m.me ? 'me' : 'bot') + '">' + (m.me ? '' : '<div class="as-av">🤖</div>')
        + '<div class="as-bub">' + m.html + '</div></div>';
    }).join('') : welcomeHtml();
    box.scrollTop = box.scrollHeight;
  }
  function welcomeHtml() {
    var list = live();
    var cmds = list.filter(function (r) { return r.command; }).slice(0, 8);
    return '<div class="as-welcome"><div class="as-welcome-ic">💬</div>'
      + '<div class="as-welcome-t">ผู้ช่วยทีม</div>'
      + '<div class="as-welcome-s">พิมพ์ถามได้เลย เช่น "ขอโค้ดอัปเดต HOSxP" หรือพิมพ์ <b>/</b> เพื่อดูคำสั่งลัด<br>'
      + 'คำตอบดึงจากคลังที่ทีมเก็บไว้ตรงตัว — AI แค่ช่วยหาว่าตรงกับรายการไหน</div>'
      + (cmds.length ? '<div class="as-quick">' + cmds.map(function (r) {
          return '<button type="button" class="as-chip" onclick="window.asShow(\'' + esc(r.id) + '\', true)">' + esc(normCmd(r.command)) + '</button>';
        }).join('') + '</div>' : '')
      + (!list.length ? '<div class="as-welcome-s" style="margin-top:12px;">ยังไม่มีคำตอบในคลัง'
          + (window.canAdd('assist') ? ' — กด <b>+ เพิ่มคำตอบ</b> ด้านขวาเพื่อเริ่ม' : ' — แจ้งหัวหน้าทีมให้เพิ่ม') + '</div>' : '')
      + '</div>';
  }

  // แสดงรายการในแชท (กดจากคลัง/ชิป) — echo = แสดงคำสั่งเป็นข้อความฝั่งผู้ใช้ด้วย
  window.asShow = function (id, echo) {
    var r = byId(id);
    if (!r) return;
    if (echo) push(true, esc(r.command ? normCmd(r.command) : r.title));
    push(false, cardHtml(r));
    if (_libOpen) window.asToggleLib(false);
  };

  window.asSend = async function () {
    var inp = document.getElementById('as-q');
    var q = (inp.value || '').trim();
    if (!q || _busy) return;
    inp.value = ''; hideCmdPop();
    push(true, esc(q));

    var hit = exactMatch(q);
    if (hit) { push(false, cardHtml(hit)); return; }
    if (!live().length) { push(false, '<div class="as-text">ยังไม่มีคำตอบในคลัง</div>'); return; }

    var rk = ranked(q), cands = rk.slice(0, 20);
    _busy = true; setBusy(true);
    push(false, '<div class="as-typing"><i></i><i></i><i></i></div>');
    var res = null, aiErr = null;
    try { res = await aiPick(q, cands); } catch (e) { aiErr = e; }
    _msgs.pop();
    _busy = false; setBusy(false);

    if (res && res.ids.length) {
      var first = byId(res.ids[0]);
      push(false, (res.reply ? '<div class="as-text as-lead">' + esc(res.reply) + '</div>' : '') + cardHtml(first)
        + chipsHtml(res.ids.slice(1).map(byId), 'ใกล้เคียง:'));
      return;
    }
    // AI ไม่พร้อม → ใช้คะแนนความใกล้เคียงแทน (แจ้งให้รู้ว่าไม่ได้ผ่าน AI)
    if (aiErr && rk[0] && rk[0].s >= 0.35) {
      push(false, '<div class="as-text as-lead">AI ไม่พร้อมใช้งาน (' + esc(aiErr.message || aiErr) + ') — แสดงรายการที่ใกล้เคียงที่สุดแทน</div>'
        + cardHtml(rk[0].r) + chipsHtml(rk.slice(1, 4).filter(function (x) { return x.s >= 0.25; }).map(function (x) { return x.r; }), 'ใกล้เคียง:'));
      return;
    }
    var near = rk.slice(0, 3).filter(function (x) { return x.s >= 0.2; }).map(function (x) { return x.r; });
    push(false, '<div class="as-text">' + (aiErr ? 'AI ไม่พร้อมใช้งาน (' + esc(aiErr.message || aiErr) + ') และ' : '') + 'ยังไม่พบคำตอบเรื่องนี้ในคลัง</div>'
      + chipsHtml(near, 'หรือหมายถึง:')
      + (window.canAdd('assist') ? '<div class="as-rel"><button type="button" class="btn btn-pri btn-sm" data-q="' + esc(q) + '" onclick="window.asEdit(null, this.getAttribute(\'data-q\'))">+ เพิ่มคำตอบเรื่องนี้</button></div>' : ''));
  };
  function setBusy(on) { var b = document.getElementById('as-send'); if (b) b.disabled = on; }

  window.asClear = function () { _msgs = []; renderChat(); };

  // ── พิมพ์ "/" → รายการคำสั่งลัดให้เลือก ──
  window.asInput = function (inp) {
    var v = inp.value;
    var pop = document.getElementById('as-cmdpop');
    if (v.charAt(0) !== '/' || /\s/.test(v)) { hideCmdPop(); return; }
    var c = v.toLowerCase();
    var list = live().filter(function (r) { return r.command && normCmd(r.command).indexOf(c) === 0; }).slice(0, 8);
    if (!list.length) { hideCmdPop(); return; }
    pop.innerHTML = list.map(function (r) {
      return '<button type="button" class="as-pop-i" onmousedown="event.preventDefault();window.asShow(\'' + esc(r.id) + '\', true);document.getElementById(\'as-q\').value=\'\';window.asInput(document.getElementById(\'as-q\'));">'
        + '<b>' + esc(normCmd(r.command)) + '</b><span>' + esc(r.title) + '</span></button>';
    }).join('');
    pop.style.display = '';
  };
  function hideCmdPop() { var p = document.getElementById('as-cmdpop'); if (p) p.style.display = 'none'; }

  // ══ แผงคลังคำตอบ ══
  window.asLibSearch = function (v) { _libQ = v; renderLib(); };
  window.asToggleLib = function (on) {
    _libOpen = on == null ? !_libOpen : on;
    var w = document.querySelector('.as-wrap');
    if (w) w.classList.toggle('lib-open', _libOpen);
  };
  function renderLib() {
    var box = document.getElementById('as-lib-list');
    if (!box) return;
    var canEd = window.canEdit('assist'), canDl = window.canDel('assist');
    var n = norm(_libQ);
    var list = REPLIES.filter(function (r) {
      if (!r.active && !canEd) return false;
      return !n || norm([r.title, r.command, r.keywords, r.category].join(' ')).indexOf(n) >= 0;
    });
    var cnt = document.getElementById('as-lib-cnt');
    if (cnt) cnt.textContent = live().length;
    if (!list.length) { box.innerHTML = '<div class="as-lib-empty">' + (REPLIES.length ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีคำตอบในคลัง') + '</div>'; return; }
    var groups = {}, order = [];
    list.forEach(function (r) { var g = r.category || 'ไม่ระบุหมวด'; if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(r); });
    box.innerHTML = order.map(function (g, groupIndex) {
      return '<section class="as-lib-group as-lib-group-' + (groupIndex % 4) + '"><div class="as-lib-g">' + esc(g) + ' <span>' + groups[g].length + '</span></div>' + groups[g].map(function (r) {
        return '<div class="as-lib-i' + (r.active ? '' : ' off') + '" onclick="window.asShow(\'' + esc(r.id) + '\', true)">'
          + '<div class="as-lib-main"><div class="as-lib-t">' + esc(r.title) + (r.active ? '' : ' <small>(ปิดใช้งาน)</small>') + '</div>'
          + (r.command ? '<div class="as-lib-c">' + esc(normCmd(r.command)) + '</div>' : '') + '</div>'
          + (canEd ? '<button type="button" class="as-ib" title="แก้ไข" onclick="event.stopPropagation();window.asEdit(\'' + esc(r.id) + '\')">✏️</button>' : '')
          + (canDl ? '<button type="button" class="as-ib" title="ลบ" onclick="event.stopPropagation();window.asDel(\'' + esc(r.id) + '\')">🗑</button>' : '')
          + '</div>';
      }).join('') + '</section>';
    }).join('');
  }

  // ══ หน้าหลัก ══
  window.renderAssist = function () {
    var view = document.getElementById('view-assist');
    if (!view) return;
    if (!view.querySelector('.as-wrap')) {
      view.innerHTML = '<div class="as-wrap">'
        + '<section class="as-main">'
        + '<div class="as-head"><div class="as-head-t">💬 ผู้ช่วยทีม</div><div style="flex:1"></div>'
        + '<button type="button" class="btn btn-ghost btn-sm" onclick="window.asClear()">ล้างแชท</button>'
        + '<button type="button" class="btn btn-ghost btn-sm as-lib-btn" onclick="window.asToggleLib()">📚 คลังคำตอบ</button></div>'
        + '<div class="as-chat" id="as-chat"></div>'
        + '<form class="as-form" onsubmit="event.preventDefault();window.asSend();">'
        + '<div class="as-cmdpop" id="as-cmdpop" style="display:none"></div>'
        + '<input id="as-q" class="f-input" autocomplete="off" placeholder="พิมพ์คำถาม หรือ / เพื่อดูคำสั่งลัด" oninput="window.asInput(this)" onblur="setTimeout(function(){var p=document.getElementById(\'as-cmdpop\');if(p)p.style.display=\'none\';},150)">'
        + '<button id="as-send" class="btn btn-pri" type="submit">ส่ง ➤</button></form>'
        + '</section>'
        + '<aside class="as-lib">'
        + '<div class="as-lib-h"><b>📚 คลังคำตอบ</b> <span class="as-lib-n" id="as-lib-cnt">0</span><div style="flex:1"></div>'
        + (window.canAdd('assist') ? '<button type="button" class="btn btn-pri btn-sm" onclick="window.asEdit()">+ เพิ่มคำตอบ</button>' : '')
        + '<button type="button" class="m-x as-lib-x" onclick="window.asToggleLib(false)" aria-label="ปิด">✕</button></div>'
        + '<input class="f-input as-lib-q" placeholder="🔍 ค้นหาในคลัง..." oninput="window.asLibSearch(this.value)">'
        + '<div class="as-lib-list" id="as-lib-list"></div>'
        + '</aside></div>';
    }
    renderChat();
    renderLib();
    setTimeout(function () { var i = document.getElementById('as-q'); if (i && window.innerWidth > 768) i.focus(); }, 50);
  };

  // ══ เพิ่ม/แก้ไขคำตอบ ══
  function editModal() {
    var m = document.getElementById('m-assist-edit');
    if (m) return m;
    m = document.createElement('div');
    m.className = 'overlay'; m.id = 'm-assist-edit';
    m.innerHTML = '<div class="modal lg">'
      + '<div class="m-head"><div class="m-icon" style="background:rgba(124,92,252,.12)">💬</div>'
      + '<div class="m-title" id="as-ed-title">เพิ่มคำตอบ</div>'
      + '<button class="m-x" onclick="window.closeM(\'m-assist-edit\')">✕</button></div>'
      + '<div class="m-body">'
      + '<div class="as-ai-compose">'
      + '<div class="as-ai-compose-main"><span class="as-ai-compose-ic">✨</span><div><b>AI ช่วยคิดคำให้ครบ</b>'
      + '<span>ใส่เนื้อหาคร่าว ๆ แล้วให้ AI ช่วยตั้งหัวข้อ หมวด คำค้น และคำเตือน โดยไม่แก้โค้ดของคุณ</span></div></div>'
      + '<button type="button" class="btn btn-ghost btn-sm as-ai-compose-btn" id="as-ed-ai" onclick="window.asAiCompose()">✨ ช่วยคิดคำ</button>'
      + '<div class="as-ai-compose-status" id="as-ed-ai-status" aria-live="polite"></div></div>'
      + '<div class="f-group"><label class="f-label">หัวข้อ <span style="color:var(--coral)">*</span></label>'
      + '<input class="f-input" id="as-ed-t" placeholder="เช่น อัปเดต HOSxP เวอร์ชันล่าสุด"></div>'
      + '<div class="f-grid" style="grid-template-columns:1fr 1fr;">'
      + '<div class="f-group"><label class="f-label">คำสั่งลัด (ไม่บังคับ)</label><input class="f-input" id="as-ed-c" placeholder="/update-hosxp" style="font-family:var(--mono)"></div>'
      + '<div class="f-group"><label class="f-label">หมวด</label><input class="f-input" id="as-ed-g" list="as-ed-gl" placeholder="เช่น HOSxP, LIS, เครือข่าย"><datalist id="as-ed-gl"></datalist></div>'
      + '</div>'
      + '<div class="f-group"><label class="f-label">คำที่ใช้เรียก (คั่นด้วย ,)</label>'
      + '<input class="f-input" id="as-ed-k" placeholder="เช่น อัปเดต hosxp, เปลี่ยนเวอร์ชัน, update version"></div>'
      + '<div class="f-group"><label class="f-label" style="display:flex;align-items:center;gap:8px;">เนื้อหา <span style="color:var(--coral)">*</span>'
      + '<span style="flex:1"></span><button type="button" class="btn btn-ghost btn-sm" onclick="window.asInsertCode()">{ } แทรกกล่องโค้ด</button></label>'
      + '<textarea class="f-input as-ed-body" id="as-ed-b" rows="12" placeholder="ข้อความ หรือโค้ด — โค้ดให้ครอบด้วย ``` เพื่อแสดงเป็นกล่องโค้ดพร้อมปุ่มคัดลอก"></textarea>'
      + '<div class="as-ed-hint">ตัวอย่าง: บรรทัด <code>```sql</code> → วางโค้ด → ปิดด้วย <code>```</code> · ข้อความนอกกล่องโค้ดแสดงตามที่พิมพ์</div></div>'
      + '<div class="f-group"><label class="f-label">คำเตือนก่อนใช้ (ไม่บังคับ)</label>'
      + '<input class="f-input" id="as-ed-n" placeholder="เช่น สำรองฐานข้อมูลก่อนรันทุกครั้ง"></div>'
      + '<label class="f-cb" style="display:flex;align-items:center;gap:8px;font-size:12.5px;"><input type="checkbox" id="as-ed-a"> เปิดใช้งาน (ปิด = ซ่อนจากแชท แต่ยังเก็บไว้)</label>'
      + '</div>'
      + '<div class="m-foot" style="display:flex;gap:8px;justify-content:flex-end;">'
      + '<button class="btn btn-ghost" onclick="window.closeM(\'m-assist-edit\')">ยกเลิก</button>'
      + '<button class="btn btn-pri" id="as-ed-save" onclick="window.asSave()">บันทึก</button></div>'
      + '</div>';
    document.body.appendChild(m);
    return m;
  }
  var _editId = null;
  window.asEdit = function (id, title) {
    var r = id ? byId(id) : null;
    if (r ? !window.canEdit('assist') : !window.canAdd('assist')) { window.showAlert('คุณไม่มีสิทธิ์จัดการคลังคำตอบ', 'warn'); return; }
    editModal();
    _editId = r ? r.id : null;
    document.getElementById('as-ed-title').textContent = r ? 'แก้ไขคำตอบ' : 'เพิ่มคำตอบ';
    document.getElementById('as-ed-t').value = r ? r.title : (title || '');
    document.getElementById('as-ed-c').value = r ? r.command : '';
    document.getElementById('as-ed-g').value = r ? r.category : '';
    document.getElementById('as-ed-k').value = r ? r.keywords : (title || '');
    document.getElementById('as-ed-b').value = r ? r.content : '';
    document.getElementById('as-ed-n').value = r ? r.note : '';
    document.getElementById('as-ed-a').checked = r ? r.active : true;
    var aiBtn = document.getElementById('as-ed-ai'), aiStatus = document.getElementById('as-ed-ai-status');
    if (aiBtn) { aiBtn.disabled = false; aiBtn.textContent = '✨ ช่วยคิดคำ'; }
    if (aiStatus) { aiStatus.textContent = ''; aiStatus.className = 'as-ai-compose-status'; }
    document.querySelectorAll('#m-assist-edit .ai-flag').forEach(function (x) { x.remove(); });
    var cats = {}; REPLIES.forEach(function (x) { if (x.category) cats[x.category] = true; });
    document.getElementById('as-ed-gl').innerHTML = Object.keys(cats).map(function (c) { return '<option value="' + esc(c) + '">'; }).join('');
    window.openM('m-assist-edit');
    setTimeout(function () { document.getElementById(r || !title ? 'as-ed-t' : 'as-ed-b').focus(); }, 50);
  };
  window.asInsertCode = function () {
    var ta = document.getElementById('as-ed-b');
    var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    var pre = s > 0 && v.charAt(s - 1) !== '\n' ? '\n' : '';
    var ins = pre + '```sql\n' + v.slice(s, e) + '\n```\n';
    ta.value = v.slice(0, s) + ins + v.slice(e);
    ta.focus();
    var caret = s + pre.length + 7 + (e - s);
    ta.setSelectionRange(caret, caret);
  };

  // ── AI ช่วยเรียบเรียงข้อมูลกำกับจากเนื้อหาที่ผู้ใช้เตรียมไว้ ──
  // ไม่ให้โมเดลส่งโค้ดกลับมา: โค้ดต้นฉบับจึงไม่ถูกแก้แม้แต่ตัวอักษรเดียว
  function asLooksLikeCode(txt) {
    var t = String(txt || '').trim();
    if (!t) return false;
    if (/^```/.test(t)) return true;
    return /^(?:SELECT|UPDATE|INSERT|DELETE|ALTER|CREATE|DROP|WITH|EXEC|DECLARE|BEGIN|COMMIT|ROLLBACK|GRANT|REVOKE)\b/i.test(t)
      || /^(?:curl\s|npm\s|npx\s|docker\s|git\s|powershell\s|python\s|node\s)/i.test(t);
  }
  function asCodeLang(txt) {
    var t = String(txt || '').trim();
    if (/^(?:SELECT|UPDATE|INSERT|DELETE|ALTER|CREATE|DROP|WITH|EXEC|DECLARE|BEGIN|COMMIT|ROLLBACK|GRANT|REVOKE)\b/i.test(t)) return 'sql';
    if (/^(?:powershell\s|Get-|Set-|New-|Remove-|Invoke-)/i.test(t)) return 'powershell';
    if (/^(?:npm\s|npx\s|node\s)/i.test(t)) return 'bash';
    return '';
  }
  function asUniqueKeywords(value) {
    var src = Array.isArray(value) ? value : String(value || '').split(/[,\n]/);
    var seen = {};
    return src.map(function (x) { return String(x || '').trim(); }).filter(function (x) {
      var k = x.toLowerCase();
      if (!x || seen[k]) return false;
      seen[k] = true; return true;
    }).slice(0, 8).join(', ');
  }
  function asSetAiValue(id, value) {
    var el = document.getElementById(id);
    value = String(value == null ? '' : value).trim();
    if (!el || !value || el.value.trim() === value) return false;
    el.value = value;
    if (window.aiFlagField) window.aiFlagField(el, true);
    return true;
  }
  window.asAiCompose = async function () {
    var contentEl = document.getElementById('as-ed-b');
    var btn = document.getElementById('as-ed-ai');
    var status = document.getElementById('as-ed-ai-status');
    if (!contentEl || !btn || btn.disabled) return;
    var content = contentEl.value.replace(/\s+$/, '');
    if (!content.trim()) {
      window.showAlert('ใส่เนื้อหาหรือโค้ดคร่าว ๆ ก่อน แล้ว AI จะช่วยคิดคำให้ครบ', 'warn');
      contentEl.focus(); return;
    }
    var val = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var cats = [], cmds = [];
    REPLIES.forEach(function (r) {
      if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
      if (r.command && cmds.indexOf(normCmd(r.command)) < 0) cmds.push(normCmd(r.command));
    });
    var system = 'คุณเป็นบรรณาธิการคลังความรู้สำหรับทีมสนับสนุนซอฟต์แวร์โรงพยาบาล ช่วยตั้งคำกำกับจากเนื้อหาที่ผู้ใช้ให้มาโดยห้ามแต่งขั้นตอน ข้อเท็จจริง ชื่อตาราง ฟิลด์ หรือคำสั่งใหม่\n'
      + 'ตอบ JSON เท่านั้น: {"title":"","command":"","category":"","keywords":[""],"introduction":"","note":""}\n'
      + '- title: ภาษาไทยสั้น ชัดเจน บอกว่าสิ่งนี้ใช้ทำอะไร\n'
      + '- command: คำอังกฤษตัวเล็กขึ้นต้น / ใช้ขีดกลาง ไม่เกิน 32 ตัวอักษร\n'
      + '- category: เลือกหมวดเดิมเมื่อเหมาะสม ถ้าไม่เหมาะจึงเสนอหมวดใหม่สั้น ๆ\n'
      + '- keywords: คำค้น 5-8 แบบ ทั้งคำไทย คำอังกฤษ และรูปแบบที่คนมักพิมพ์ ห้ามใส่ข้อมูลอ่อนไหว\n'
      + '- introduction: 1-2 ประโยค อธิบายเฉพาะสิ่งที่เห็นชัดจากเนื้อหา ห้ามคัดลอกโค้ดกลับมา\n'
      + '- note: คำเตือนสั้น ๆ เฉพาะเมื่อจำเป็น เช่น คำสั่งแก้ไขหรือลบข้อมูล ถ้าไม่จำเป็นให้เป็นค่าว่าง\n'
      + 'สำคัญ: ห้ามส่งโค้ด SQL คำสั่ง หรือเนื้อหาต้นฉบับกลับมาในทุกฟิลด์';
    var user = 'ข้อมูลเดิม:\n' + JSON.stringify({
      title: val('as-ed-t'), command: val('as-ed-c'), category: val('as-ed-g'),
      keywords: val('as-ed-k'), note: val('as-ed-n'), content: content,
      existingCategories: cats.slice(0, 40), unavailableCommands: cmds.slice(0, 100),
    });
    btn.disabled = true; btn.textContent = '⏳ กำลังช่วยคิด...';
    if (status) { status.textContent = 'AI กำลังอ่านเนื้อหาและเตรียมคำแนะนำ…'; status.className = 'as-ai-compose-status working'; }
    try {
      var out = await window.aiChatJson(system, user, { maxTokens: 650, temperature: 0.2 });
      var changed = 0;
      changed += asSetAiValue('as-ed-t', out.title) ? 1 : 0;
      var command = String(out.command || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_\/-]/g, '');
      if (command) {
        command = normCmd(command).slice(0, 33);
        var duplicate = REPLIES.some(function (r) { return r.id !== _editId && r.command && normCmd(r.command) === command; });
        if (!duplicate) changed += asSetAiValue('as-ed-c', command) ? 1 : 0;
      }
      changed += asSetAiValue('as-ed-g', out.category) ? 1 : 0;
      changed += asSetAiValue('as-ed-k', asUniqueKeywords(out.keywords)) ? 1 : 0;
      changed += asSetAiValue('as-ed-n', out.note) ? 1 : 0;

      // เพิ่มเพียงคำอธิบาย/กรอบ code ภายนอก ตัวโค้ด content เดิมนำมาต่อโดยตรง ไม่ผ่านผลลัพธ์จาก AI
      var intro = String(out.introduction || '').trim().replace(/```[\s\S]*?```/g, '').trim();
      var trimmed = content.trim();
      var nextContent = content;
      if (intro && asLooksLikeCode(trimmed)) {
        if (/^```/.test(trimmed)) nextContent = intro + '\n\n' + content;
        else nextContent = intro + '\n\n```' + asCodeLang(trimmed) + '\n' + content + '\n```';
      }
      if (nextContent !== contentEl.value) {
        contentEl.value = nextContent;
        if (window.aiFlagField) window.aiFlagField(contentEl, true);
        changed++;
      }
      if (status) {
        status.textContent = changed ? 'เติมคำแนะนำแล้ว — ตรวจทานและแก้ไขได้ก่อนบันทึก' : 'ข้อมูลเดิมครบแล้ว AI ไม่มีคำที่ต้องปรับเพิ่ม';
        status.className = 'as-ai-compose-status done';
      }
    } catch (e) {
      if (status) { status.textContent = 'AI ยังช่วยคิดคำไม่สำเร็จ ลองใหม่อีกครั้ง'; status.className = 'as-ai-compose-status error'; }
      window.showAlert('AI ช่วยคิดคำไม่สำเร็จ: ' + (e.message || e), 'error');
    } finally {
      btn.disabled = false; btn.textContent = '✨ ช่วยคิดใหม่';
    }
  };
  window.asSave = async function () {
    var g = function (id) { return document.getElementById(id).value.trim(); };
    var title = g('as-ed-t'), content = document.getElementById('as-ed-b').value.replace(/\s+$/, '');
    var cmd = g('as-ed-c').replace(/\s+/g, '-');
    if (!title || !content.trim()) { window.showAlert('กรุณากรอกหัวข้อและเนื้อหา', 'warn'); return; }
    if (cmd) {
      cmd = normCmd(cmd);
      var dup = REPLIES.find(function (r) { return r.id !== _editId && r.command && normCmd(r.command) === cmd; });
      if (dup) { window.showAlert('คำสั่งลัด ' + cmd + ' ซ้ำกับ "' + dup.title + '"', 'warn'); return; }
    }
    var now = new Date().toISOString();
    var old = _editId ? byId(_editId) : null;
    var id = _editId || ('AS' + Date.now() + Math.floor(Math.random() * 1000));
    var data = {
      title: title, command: cmd, keywords: g('as-ed-k'), category: g('as-ed-g'), content: content,
      note: g('as-ed-n'), active: document.getElementById('as-ed-a').checked,
      created_by: old ? old.createdById : window.meId(), updated_by: window.meId(),
      created_at: old && old.createdAt ? old.createdAt : now, updated_at: now,
    };
    var btn = document.getElementById('as-ed-save');
    btn.disabled = true;
    try {
      await window.setDoc(window.getDocRef('ASSIST_REPLIES', id), data);
      var row = tReply(Object.assign({ id: id }, data)), i = REPLIES.findIndex(function (r) { return r.id === id; });
      if (i >= 0) REPLIES[i] = row; else REPLIES.push(row);
      window.closeM('m-assist-edit');
      window.showToast('บันทึกคำตอบแล้ว', 'success');
      renderLib();
      if (!_msgs.length) renderChat();
    } catch (e) {
      window.showAlert('บันทึกไม่สำเร็จ: ' + (e.message || e), 'error');
    } finally { btn.disabled = false; }
  };
  window.asDel = function (id) {
    var r = byId(id);
    if (!r || !window.canDel('assist')) return;
    window.showConfirm('ลบคำตอบ "' + r.title + '" ?', async function () {
      try {
        await window.deleteDoc(window.getDocRef('ASSIST_REPLIES', id));
        REPLIES = REPLIES.filter(function (x) { return x.id !== id; });
        renderLib();
        window.showToast('ลบแล้ว', 'success');
      } catch (e) { window.showAlert('ลบไม่สำเร็จ: ' + (e.message || e), 'error'); }
    }, { title: 'ลบคำตอบ', okText: 'ลบ' });
  };

})();
