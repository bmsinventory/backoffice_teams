/**
 * team-showcase.js — 🧸 แนะนำทีม (module 'team_showcase') — หน้าแนะนำสมาชิกทีมเป็นตัวการ์ตูน 3D หมุนสลับ
 *   แท็บ "แนะนำทีม": เลือกทีม → คนตรงกลางตัวใหญ่ ซ้าย/ขวา/หลังเบลอ กด ← → หมุน สีพื้นหลังเปลี่ยนตามคน
 *   แท็บ "คลังรูปทีม": อัปโหลด/เปลี่ยน/ลบรูปตัวการ์ตูนของพนักงาน (1 คน 1 รูป ใช้ซ้ำได้ทุกทีม) + Prompt สร้างรูปด้วย AI
 *   ปุ่ม "🔗 แชร์ลิงก์": ลิงก์สาธารณะ team.html?t=<share_token> ไม่ต้อง login — ไว้ใส่สไลด์นำเสนอ
 *
 * ข้อมูล: team_showcases (ทีม + สมาชิก [{ staff_id, color, title, desc, speech }] + voice { intro, member, outro } + share_token)
 *        · staff_figures (id = staff.id → image_url)
 * ไฟล์รูป: Storage bucket team-figures · ตาราง/บัคเก็ต: db-schema.sql
 * สิทธิ์: ดู = ดูหน้าแนะนำทีม · เพิ่ม = สร้างทีม · แก้ = แก้ทีม/สี/สมาชิก + จัดการคลังรูป · ลบ = ลบทีม
 */
(function () {

  var esc = function (s) { return window.esc(s); };
  var BUCKET = 'team-figures';
  var FIG_MAX = 5 * 1024 * 1024;
  var FIG_TYPES = ['image/png', 'image/webp', 'image/jpeg'];
  // เวทีตัวการ์ตูน (สี/ตำแหน่งซ้าย-ขวา-หลัง/เงาคนไม่มีรูป) ใช้ร่วมกับหน้าแชร์ team.html — src/utils/team-stage.util.js
  var PALETTE = window.TeamStage.PALETTE;
  var DUR = window.TeamStage.DUR;
  var placeholderSvg = window.TeamStage.placeholderSvg;

  var TEAMS = [];          // ทีมทั้งหมด — จาก onSnapshot
  var FIGS = {};           // staff.id → { url, path }
  var _teamId = '';        // ทีมที่เลือกดู
  var _active = 0;         // ลำดับคนที่อยู่ตรงกลาง
  var _anim = false;
  var AUTO_MS = 5000;      // เล่นอัตโนมัติ: เลื่อนไปคนถัดไปทุก 5 วินาที
  var _auto = false, _autoTimer = null;
  var _tab = 'show';       // 'show' | 'library'
  var _lib = { q: '', dept: '', missing: false };
  var _ed = null;          // ทีมที่กำลังแก้ใน modal { id, name, ghost, members:[] }

  // ── Transform: raw DB row → app object ──
  function tTeam(d) {
    return {
      id: d.id, name: d.name || '', ghost: d.ghost_text || 'OUR TEAM', order: Number(d.sort_order) || 99,
      members: (Array.isArray(d.members) ? d.members : []).map(function (m) {
        return { staffId: m.staff_id || '', color: m.color || '', title: m.title || '', desc: m.desc || '', speech: m.speech || '' };
      }),
      voice: { intro: (d.voice && d.voice.intro) || '', member: (d.voice && d.voice.member) || '', outro: (d.voice && d.voice.outro) || '',
        polite: !(d.voice && d.voice.polite === false) },
      shareToken: d.share_token || '',
      createdById: d.created_by || '', createdAt: d.created_at || '',
    };
  }

  function vOn() { var el = document.getElementById('view-team-showcase'); return el && el.classList.contains('on'); }

  window.onSnapshot(window.getColRef('TEAM_SHOWCASES'), function (s) {
    TEAMS = s.docs.map(function (doc) { return tTeam(doc.data()); })
      .sort(function (a, b) { return a.order - b.order || a.name.localeCompare(b.name, 'th'); });
    if (vOn() && !document.querySelector('#m-ts-team.on')) window.renderTeamShowcase();
  }, function (e) { window.showDbErrorSoft && window.showDbErrorSoft(e, 'แนะนำทีม'); });

  window.onSnapshot(window.getColRef('STAFF_FIGURES'), function (s) {
    FIGS = {};
    s.docs.forEach(function (doc) { var d = doc.data(); if (d.image_url) FIGS[d.id] = { url: d.image_url, path: d.file_path || '' }; });
    window.STAFF_FIGS = FIGS;   // อวาตาร์ผู้ใช้ใน sidebar (src/app.js setUserAvatar)
    if (window.setUserAvatar) window.setUserAvatar();
    if (vOn()) window.renderTeamShowcase();
    if (_ed) renderEdMembers();
  }, function (e) { window.showDbErrorSoft && window.showDbErrorSoft(e, 'คลังรูปทีม'); });

  function curTeam() {
    return TEAMS.find(function (t) { return t.id === _teamId; }) || TEAMS[0] || null;
  }
  // ── เรียงตามระดับตำแหน่ง (positions.rank: 1 = สูงสุดก่อน) ตำแหน่งเท่ากัน → ตามชื่อ — staffOf(x) คืนพนักงานของแต่ละรายการ ──
  function byRank(staffOf) {
    return function (a, b) {
      var sa = staffOf(a) || { name: '' }, sb = staffOf(b) || { name: '' };
      return window.positionRank(sa.positionId) - window.positionRank(sb.positionId) || sa.name.localeCompare(sb.name, 'th');
    };
  }
  var memberStaff = function (m) { return window.staffByRef(m.staffId); };
  // สมาชิกที่ยังมีตัวตนอยู่ (พนักงานถูกลบ/ปิดใช้งาน = ไม่แสดง) เรียงตามตำแหน่ง
  function liveMembers(t) {
    return (t ? t.members : []).map(function (m, i) {
      var s = window.staffByRef(m.staffId);
      if (!s || !s.active) return null;
      return {
        staff: s, color: m.color || PALETTE[i % PALETTE.length],
        title: m.title || s.role || '', desc: m.desc || '', speech: m.speech || '', fig: FIGS[s.id] || null,
      };
    }).filter(Boolean).sort(byRank(function (x) { return x.staff; }));
  }
  function nick(s) { return s.nickname || s.name; }

  function figHtml(m) {
    return m.fig
      ? '<img src="' + esc(m.fig.url) + '" alt="' + esc(m.staff.name) + '" draggable="false" loading="lazy">'
      : placeholderSvg(nick(m.staff));
  }

  // ══ RENDER ══
  window.renderTeamShowcase = function () {
    var view = document.getElementById('view-team-showcase');
    if (!view) return;
    var canManage = window.canEdit('team_showcase');
    if (_tab === 'library' && !canManage) _tab = 'show';
    var t = curTeam();
    if (t) _teamId = t.id;

    var chips = TEAMS.map(function (x) {
      return '<button type="button" class="ts-chip' + (t && x.id === t.id ? ' on' : '') + '" onclick="window.tsPick(\'' + esc(x.id) + '\')">'
        + esc(x.name || 'ไม่มีชื่อทีม') + ' <span>' + liveMembers(x).length + '</span></button>';
    }).join('');

    view.innerHTML = '<div class="ts-wrap">'
      + '<div class="ts-bar">'
      + (canManage ? '<div class="ts-seg" role="tablist">'
        + '<button type="button" role="tab" class="' + (_tab === 'show' ? 'on' : '') + '" onclick="window.tsTab(\'show\')">🧸 แนะนำทีม</button>'
        + '<button type="button" role="tab" class="' + (_tab === 'library' ? 'on' : '') + '" onclick="window.tsTab(\'library\')">🖼️ คลังรูปทีม</button></div>' : '')
      + (_tab === 'show' ? '<div class="ts-chips">' + chips + '</div>' : '<div style="flex:1"></div>')
      + '<div class="ts-acts">'
      + (_tab === 'show' && t && canManage ? '<button type="button" class="btn btn-ghost btn-sm" onclick="window.tsEditTeam(\'' + esc(t.id) + '\')">✏️ แก้ไขทีม</button>' : '')
      + (_tab === 'show' && window.canAdd('team_showcase') ? '<button type="button" class="btn btn-pri btn-sm" onclick="window.tsEditTeam()">+ ทีมใหม่</button>' : '')
      + (_tab === 'show' && t && (t.shareToken || canManage) ? '<button type="button" class="btn btn-ghost btn-sm" onclick="window.tsShare()" title="ลิงก์เปิดดูทีมนี้ได้โดยไม่ต้อง login — ใส่สไลด์นำเสนอได้">🔗 แชร์ลิงก์</button>' : '')
      + (_tab === 'show' && t ? '<button type="button" class="btn btn-ghost btn-sm" onclick="window.tsFullscreen()" title="แสดงเต็มจอ">⛶ เต็มจอ</button>' : '')
      + (_tab === 'library' ? '<button type="button" class="btn btn-ghost btn-sm" onclick="window.tsPrompt()">✨ Prompt สร้างตัวการ์ตูน</button>' : '')
      + '</div></div>'
      + '<div class="ts-body" id="ts-body"></div></div>';

    if (_tab === 'library') renderLibrary();
    else renderStage(t);
  };

  window.tsTab = function (tab) { _tab = tab; if (tab !== 'show') voiceOff(); window.renderTeamShowcase(); };
  // เปลี่ยนทีม = เริ่มคนที่ 1 ของทีมนั้น (โหมดเสียงแนะนำอยู่ → แนะนำต่อตั้งแต่คนแรก)
  window.tsPick = function (id) { _teamId = id; _active = 0; window.renderTeamShowcase(); if (voiceOn()) speakMember(true); };

  // ══ แท็บแนะนำทีม (Hero carousel) ══
  function renderStage(t) {
    var body = document.getElementById('ts-body');
    if (!t) {
      body.innerHTML = '<div class="ts-empty"><div class="ts-empty-ic">🧸</div><b>ยังไม่มีทีม</b>'
        + '<p>' + (window.canAdd('team_showcase') ? 'กด <b>+ ทีมใหม่</b> เลือกสมาชิก ตั้งสีประจำตัว แล้วอัปโหลดรูปตัวการ์ตูนที่แท็บคลังรูปทีม' : 'ผู้ดูแลยังไม่ได้จัดทีมให้แสดงในหน้านี้') + '</p></div>';
      return;
    }
    var list = liveMembers(t);
    if (!list.length) {
      body.innerHTML = '<div class="ts-empty"><div class="ts-empty-ic">👥</div><b>ทีม "' + esc(t.name) + '" ยังไม่มีสมาชิก</b>'
        + '<p>กด <b>✏️ แก้ไขทีม</b> เพื่อเพิ่มสมาชิก</p></div>';
      return;
    }
    if (_active >= list.length) _active = 0;
    body.innerHTML = '<div class="ts-hero" id="ts-hero">'
      + '<div class="ts-grain"></div>'
      + '<div class="ts-ghost" style="--len:' + Math.max(4, (t.ghost || 'OUR TEAM').length) + '">' + esc(t.ghost || 'OUR TEAM') + '</div>'
      + '<div class="ts-brand">' + esc(t.name) + '</div>'
      + '<div class="ts-stage">' + list.map(function (m, i) {
        return '<div class="ts-fig" data-i="' + i + '" onclick="window.tsGoto(' + i + ')">' + figHtml(m) + '</div>';
      }).join('') + '</div>'
      + '<div class="ts-copy">'
      + '<p class="ts-role" id="ts-role"></p><p class="ts-name" id="ts-name"></p><p class="ts-desc" id="ts-desc"></p>'
      + '<div class="ts-nav">'
      + (list.length > 1 ? '<button type="button" aria-label="คนก่อนหน้า" onclick="window.tsNav(\'prev\')"><i class="ti ti-arrow-left"></i></button>'
        + '<button type="button" aria-label="คนถัดไป" onclick="window.tsNav(\'next\')"><i class="ti ti-arrow-right"></i></button>'
        + '<button type="button" class="ts-play" id="ts-play" onclick="window.tsAuto()"></button>' : '')
      + (window.TTS ? '<button type="button" class="ts-play ts-voice" id="ts-voice" onclick="window.tsVoice()"></button>' : '')
      + (list.length > 1 ? '<span class="ts-count" id="ts-count"></span>' : '')
      + '</div>'
      + '</div>'
      + '<div class="ts-total">' + String(list.length).padStart(2, '0') + '<small>MEMBERS</small></div>'
      + '</div>';
    applyRoles(list);
  }

  function applyRoles(list) {
    var hero = document.getElementById('ts-hero');
    if (!hero) return;
    var mob = hero.clientWidth < 640, n = list.length, m = list[_active];
    hero.classList.toggle('mob', mob);
    hero.querySelectorAll('.ts-fig').forEach(function (f) {
      var i = Number(f.getAttribute('data-i')), role = window.TeamStage.roleOf(i, n, _active);
      Object.assign(f.style, window.TeamStage.styleFor(role, mob));
      f.style.pointerEvents = role === 'center' || role === 'hidden' ? 'none' : '';
      f.setAttribute('data-role', role);
    });
    hero.style.backgroundColor = m.color;
    var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    set('ts-role', m.title || nick(m.staff));
    set('ts-name', m.staff.name + (m.staff.dept ? ' · ' + m.staff.dept : ''));
    set('ts-desc', m.desc);
    set('ts-count', (_active + 1) + ' / ' + n);
    paintPlay();
    paintVoice();
  }

  function step(to) {
    var list = liveMembers(curTeam());
    if (_anim || list.length < 2) { autoTick(); return; }
    _anim = true;
    _active = (to + list.length) % list.length;
    applyRoles(list);
    setTimeout(function () { _anim = false; }, DUR);
    if (voiceOn()) speakMember(); // โหมดเสียงแนะนำ = แนะนำตัวคนใหม่ แล้วเลื่อนต่อเองเมื่อพูดจบ
    autoTick(); // กดเลื่อนเอง = เริ่มนับเวลาใหม่ ภาพไม่เด้งต่อทันทีหลังกด
  }
  window.tsNav = function (dir) { step(dir === 'next' ? _active + 1 : _active - 1); };
  window.tsGoto = function (i) { if (i !== _active) step(i); };

  // ── เล่นอัตโนมัติ — ข้ามรอบ (แต่ยังนับต่อ) ตอนไม่ได้ดูหน้านี้ / สลับแท็บเบราว์เซอร์ / เปิดหน้าต่างแก้ไขอยู่ ──
  // ระหว่างโหมดเสียงแนะนำ เสียงเป็นตัวกำหนดจังหวะเลื่อนแทน (พูดจบ → คนถัดไป)
  function autoTick() {
    clearTimeout(_autoTimer);
    if (!_auto || voiceOn()) return;
    _autoTimer = setTimeout(function () {
      if (vOn() && _tab === 'show' && !document.hidden && !document.querySelector('.overlay.on')) step(_active + 1);
      else autoTick();
    }, AUTO_MS);
  }

  // ── 🔊 เสียงแนะนำตัว (src/services/tts.service.js) ──
  // กดเปิด → กลับไปเริ่มคนที่ 1 เสมอ → AI พูดคำทักทายของทีม + แนะนำคนที่ 1 ตามแม่แบบ (หรือบทพูดเฉพาะคน)
  // → พูดจบเลื่อนไปคนถัดไปเอง → คนสุดท้ายพูดต่อด้วยคำปิดท้าย แล้วปิดเสียงอัตโนมัติ
  // → กดเลื่อนเอง = แนะนำคนนั้นแทน · เปลี่ยนทีม = ทักทายทีมใหม่ แล้วเริ่มคนที่ 1
  var VOICE_PAUSE = 1200;  // เว้นหลังพูดจบก่อนเลื่อนไปคนถัดไป (มิลลิวินาที)
  var _voiceOn = false, _voiceTimer = null;
  function voiceOn() { return _voiceOn && !!window.TTS; }
  function paintVoice() {
    var b = document.getElementById('ts-voice');
    if (!b) return;
    b.textContent = _voiceOn ? '🔊' : '🔇';
    b.title = _voiceOn ? 'หยุดเสียงแนะนำตัว' : 'ให้ AI แนะนำตัวสมาชิกทีละคน ตั้งแต่คนแรกถึงคนสุดท้าย';
    b.setAttribute('aria-label', b.title);
    b.classList.toggle('on', _voiceOn);
  }
  // คำพูด (แม่แบบ/ช่องข้อมูล/ประกอบท่อน) ใช้ร่วมกับหน้าแชร์ team.html — src/utils/team-stage.util.js
  var VOICE_MEMBER = window.TeamStage.VOICE_MEMBER;
  var NAME_END = window.TeamStage.NAME_END;
  var VOICE_KEYS = window.TeamStage.VOICE_KEYS;
  var speechOf = window.TeamStage.speechOf;
  function voiceOff() {
    if (!_voiceOn) return;
    _voiceOn = false;
    clearTimeout(_voiceTimer);
    window.TTS.stop();
    paintVoice();
    autoTick(); // เปิดเล่นอัตโนมัติไว้ → กลับไปเลื่อนตามเวลาปกติ
  }
  function speakMember(withIntro) {
    clearTimeout(_voiceTimer);
    var t = curTeam(), list = liveMembers(t), i = _active;
    if (!list[i]) return voiceOff();
    window.TTS.play(speechOf(t, list, i, withIntro), {
      polite: t.voice.polite,
      onEnd: function () {
        if (!voiceOn()) return;
        if (i >= list.length - 1) return voiceOff(); // คนสุดท้ายแล้ว
        (function next(wait) {
          _voiceTimer = setTimeout(function () {
            if (!voiceOn() || !vOn()) return;
            if (_anim) return next(DUR); // ภาพยังเลื่อนไม่เสร็จ (step จะไม่ทำงาน) → รอแล้วลองใหม่
            step(i + 1);
          }, wait);
        })(VOICE_PAUSE);
      },
      onError: function (err) { voiceOff(); window.showToast(err.message, 'error'); },
    });
  }
  window.tsVoice = function () {
    if (_voiceOn) return voiceOff();
    _voiceOn = true;
    paintVoice();
    clearTimeout(_autoTimer);
    if (_active !== 0) { _active = 0; applyRoles(liveMembers(curTeam())); } // เริ่มคนที่ 1 เสมอ
    speakMember(true);
  };
  // ออกจากหน้านี้ → หยุดเสียงแนะนำ
  document.addEventListener('DOMContentLoaded', function () {
    var v = document.getElementById('view-team-showcase');
    if (v) new MutationObserver(function () { if (!v.classList.contains('on')) voiceOff(); })
      .observe(v, { attributes: true, attributeFilter: ['class'] });
  });
  function paintPlay() {
    var b = document.getElementById('ts-play');
    if (!b) return;
    b.innerHTML = '<i class="ti ti-player-' + (_auto ? 'pause' : 'play') + '"></i>';
    b.setAttribute('aria-label', _auto ? 'หยุดเล่นอัตโนมัติ' : 'เล่นอัตโนมัติ');
    b.title = _auto ? 'หยุดเล่นอัตโนมัติ' : 'เล่นอัตโนมัติ (เลื่อนทุก ' + AUTO_MS / 1000 + ' วินาที)';
    b.classList.toggle('on', _auto);
  }
  window.tsAuto = function (on) {
    _auto = on === undefined ? !_auto : !!on;
    paintPlay();
    autoTick();
  };

  // เต็มจอ = เปิดค้างบนจอทีวี → เริ่มเล่นอัตโนมัติให้เลย
  window.tsFullscreen = function () {
    var hero = document.getElementById('ts-hero');
    if (!hero || !hero.requestFullscreen) return;
    hero.requestFullscreen().then(function () { window.tsAuto(true); }).catch(function () {});
  };
  // ── 🔗 แชร์ลิงก์ (team.html?t=<token>) — เปิดดูทีมนี้ได้โดยไม่ต้อง login ไว้ใส่สไลด์นำเสนอ ──
  // token สุ่ม 40 ตัว สร้างครั้งแรกที่กด (ต้องมีสิทธิ์แก้) แล้วใช้ตลอด · "สร้างลิงก์ใหม่" = ลิงก์เดิมใช้ไม่ได้ทันที
  // ตัวเลือก: auto=0 ไม่เล่นอัตโนมัติ · ui=0 ซ่อนปุ่มควบคุม (ฝังในสไลด์ให้ภาพสะอาด) · voice=1 เปิดเสียงแนะนำตัวทันที
  function shareToken40() {
    var ch = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', a = new Uint32Array(40), s = '';
    crypto.getRandomValues(a);
    for (var i = 0; i < 40; i++) s += ch.charAt(a[i] % ch.length);
    return s;
  }
  async function saveShareToken(t, token) {
    await window.updateDoc(window.getDocRef('TEAM_SHOWCASES', t.id), { share_token: token, updated_by: window.meId(), updated_at: new Date().toISOString() });
    t.shareToken = token;
  }
  function shareUrl(t) {
    var u = new URL('team.html', location.href);
    u.searchParams.set('t', t.shareToken);
    if (!document.getElementById('ts-sh-auto').checked) u.searchParams.set('auto', '0');
    if (document.getElementById('ts-sh-ui').checked) u.searchParams.set('ui', '0');
    if (document.getElementById('ts-sh-voice').checked) u.searchParams.set('voice', '1');
    return u.href;
  }
  // แถวตัวเลือก = ไอคอน + ชื่อ + คำอธิบายสั้น + สวิตช์ (ทั้งแถวกดได้)
  function shareOpt(id, icon, title, sub, on) {
    return '<label class="ts-sh-opt"><i class="ti ti-' + icon + '"></i>'
      + '<span class="ts-sh-txt"><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></span>'
      + '<input type="checkbox" class="ts-sh-sw" id="' + id + '"' + (on ? ' checked' : '') + ' onchange="window.tsSharePaint()"></label>';
  }
  function paintShare() {
    var t = curTeam();
    if (!t) return;
    document.getElementById('ts-sh-team').textContent = t.name;
    document.getElementById('ts-sh-url').value = shareUrl(t);
    document.getElementById('ts-sh-new').style.display = window.canEdit('team_showcase') ? '' : 'none';
  }
  window.tsShare = async function () {
    var t = curTeam();
    if (!t) return;
    if (!t.shareToken) {
      if (!window.canEdit('team_showcase')) return;
      try { await saveShareToken(t, shareToken40()); }
      catch (e) { window.showAlert('สร้างลิงก์ไม่สำเร็จ: ' + (e.message || e), 'error'); return; }
    }
    var m = document.getElementById('m-ts-share');
    if (!m) {
      m = document.createElement('div');
      m.className = 'overlay'; m.id = 'm-ts-share';
      m.innerHTML = '<div class="modal sm">'
        + '<div class="m-head"><div class="m-icon" style="background:rgba(244,132,95,.15)">🔗</div>'
        + '<div class="m-title">แชร์ลิงก์แนะนำทีม<div class="ts-sh-team" id="ts-sh-team"></div></div>'
        + '<button class="m-x" onclick="window.closeM(\'m-ts-share\')">✕</button></div>'
        + '<div class="m-body">'
        + '<div class="ts-sh-lbl">เมื่อเปิดลิงก์</div>'
        + '<div class="ts-sh-opts">'
        + shareOpt('ts-sh-auto', 'player-play', 'เล่นอัตโนมัติ', 'เลื่อนไปคนถัดไปทุก ' + AUTO_MS / 1000 + ' วินาที', true)
        + shareOpt('ts-sh-voice', 'volume', 'เสียงแนะนำตัว', 'AI พูดแนะนำทีละคน · เริ่มเมื่อแตะจอครั้งแรก', false)
        + shareOpt('ts-sh-ui', 'eye-off', 'ซ่อนปุ่มควบคุม', 'ภาพสะอาด เหมาะฝังในสไลด์', false)
        + '</div>'
        + '<div class="ts-sh-lbl">ลิงก์</div>'
        + '<input class="f-input ts-sh-url" id="ts-sh-url" readonly onclick="this.select()" aria-label="ลิงก์แชร์">'
        + '<div class="ts-sh-acts">'
        + '<button type="button" class="btn btn-pri" onclick="window.tsShareCopy(this)">📋 คัดลอกลิงก์</button>'
        + '<button type="button" class="btn btn-ghost" onclick="window.open(document.getElementById(\'ts-sh-url\').value,\'_blank\')">↗ เปิดดู</button></div>'
        + '<div class="ts-sh-note"><i class="ti ti-world"></i>ใครมีลิงก์ดูได้ทันทีโดยไม่ต้อง login (แก้ไม่ได้) · แก้ทีมแล้วลิงก์เห็นของใหม่เอง</div>'
        + '</div>'
        + '<div class="m-foot" style="display:flex;align-items:center;gap:8px;">'
        + '<button type="button" class="ts-sh-new" id="ts-sh-new" onclick="window.tsShareReset()" title="ลิงก์เดิมที่แชร์ไว้จะเปิดไม่ได้อีก">🔄 สร้างลิงก์ใหม่ (ยกเลิกลิงก์เดิม)</button>'
        + '<span style="flex:1"></span>'
        + '<button class="btn btn-ghost btn-sm" onclick="window.closeM(\'m-ts-share\')">ปิด</button></div>'
        + '</div>';
      document.body.appendChild(m);
    }
    paintShare();
    window.openM('m-ts-share');
    window.renderTeamShowcase(); // คนดูอย่างเดียวเห็นปุ่มแชร์ได้หลังทีมมีลิงก์แล้ว
  };
  window.tsSharePaint = paintShare;
  window.tsShareCopy = function (btn) {
    var inp = document.getElementById('ts-sh-url');
    var done = function () { var o = btn.textContent; btn.textContent = '✓ คัดลอกแล้ว'; setTimeout(function () { btn.textContent = o; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(inp.value).then(done, function () { inp.select(); document.execCommand('copy'); done(); });
    } else { inp.select(); document.execCommand('copy'); done(); }
  };
  window.tsShareReset = function () {
    var t = curTeam();
    if (!t || !window.canEdit('team_showcase')) return;
    window.showConfirm('สร้างลิงก์ใหม่ของทีม "' + t.name + '" ? ลิงก์เดิมที่แชร์/ใส่สไลด์ไว้จะเปิดไม่ได้อีก', async function () {
      try { await saveShareToken(t, shareToken40()); paintShare(); window.showToast('สร้างลิงก์ใหม่แล้ว', 'success'); }
      catch (e) { window.showAlert('สร้างลิงก์ไม่สำเร็จ: ' + (e.message || e), 'error'); }
    }, { title: 'สร้างลิงก์ใหม่', okText: 'สร้างใหม่' });
  };

  document.addEventListener('fullscreenchange', function () {
    if (vOn() && _tab === 'show') setTimeout(function () { applyRoles(liveMembers(curTeam())); }, 60);
  });
  window.addEventListener('resize', function () {
    if (vOn() && _tab === 'show') applyRoles(liveMembers(curTeam()));
  });
  document.addEventListener('keydown', function (e) {
    if (!vOn() || _tab !== 'show' || document.querySelector('.overlay.on')) return;
    var tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if (e.key === 'ArrowRight') window.tsNav('next');
    if (e.key === 'ArrowLeft') window.tsNav('prev');
  });

  // ══ แท็บคลังรูปทีม ══
  function renderLibrary() {
    var body = document.getElementById('ts-body');
    var all = (window.STAFF || []).filter(function (s) { return s.active; })
      .sort(function (a, b) { return window.positionRank(a.positionId) - window.positionRank(b.positionId) || a.name.localeCompare(b.name, 'th'); });
    var withFig = all.filter(function (s) { return FIGS[s.id]; }).length;
    var q = _lib.q.trim().toLowerCase();
    var list = all.filter(function (s) {
      if (_lib.dept && s.deptId !== _lib.dept) return false;
      if (_lib.missing && FIGS[s.id]) return false;
      return !q || (s.name + ' ' + (s.nickname || '') + ' ' + s.role).toLowerCase().indexOf(q) > -1;
    });
    var depts = (window.DEPT_LIST || []).map(function (d) {
      return '<option value="' + esc(d.id) + '"' + (d.id === _lib.dept ? ' selected' : '') + '>' + esc(d.label) + '</option>';
    }).join('');

    body.innerHTML = '<div class="ts-lib">'
      + '<div class="ts-lib-info">'
      + '<div class="ts-lib-stat"><b>' + withFig + '</b> / ' + all.length + ' คนมีรูปแล้ว'
      + '<div class="ts-lib-pbar"><span style="width:' + (all.length ? Math.round(withFig * 100 / all.length) : 0) + '%"></span></div></div>'
      + '<div class="ts-lib-spec">📐 รูปที่ใช้ได้ดี: <b>PNG พื้นหลังโปร่งใส</b> แนวตั้ง 3:5 (เช่น 1200×2000) ตัวการ์ตูนเต็มตัว เท้าชิดขอบล่าง · ไม่เกิน 5MB'
      + ' · ยังไม่มีรูป? กด <a href="javascript:void(0)" onclick="window.tsPrompt()">✨ Prompt สร้างตัวการ์ตูน</a></div></div>'
      + '<div class="ts-lib-filter">'
      + '<input class="f-input" id="ts-lib-q" placeholder="🔍 ค้นหาชื่อ / ชื่อเล่น / ตำแหน่ง" value="' + esc(_lib.q) + '" oninput="window.tsLibFilter(\'q\',this.value)">'
      + '<select class="f-input" id="ts-lib-dept" onchange="window.tsLibFilter(\'dept\',this.value)"><option value="">ทุกแผนก</option>' + depts + '</select>'
      + '<label class="ts-lib-cb"><input type="checkbox" id="ts-lib-missing"' + (_lib.missing ? ' checked' : '') + ' onchange="window.tsLibFilter(\'missing\',this.checked)"> เฉพาะคนที่ยังไม่มีรูป</label>'
      + '</div>'
      + '<div class="ts-lib-grid">' + (list.length ? list.map(libCard).join('') : '<div class="ts-lib-none">ไม่พบพนักงานตามเงื่อนไข</div>') + '</div>'
      + '</div>';
  }
  function libCard(s) {
    var f = FIGS[s.id];
    return '<div class="ts-card">'
      + '<div class="ts-card-img' + (f ? '' : ' none') + '">'
      + (f ? '<img src="' + esc(f.url) + '" alt="' + esc(s.name) + '" loading="lazy">' : placeholderSvg(nick(s))) + '</div>'
      + '<div class="ts-card-n">' + esc(nick(s)) + '</div>'
      + '<div class="ts-card-s">' + esc([s.role, s.dept].filter(Boolean).join(' · ') || s.name) + '</div>'
      + '<div class="ts-card-a">'
      + '<button type="button" class="btn btn-ghost btn-sm" onclick="window.tsPickFig(\'' + esc(s.id) + '\')">' + (f ? '🔄 เปลี่ยนรูป' : '⬆️ อัปโหลด') + '</button>'
      + (f ? '<button type="button" class="btn btn-ghost btn-sm ts-del" onclick="window.tsDelFig(\'' + esc(s.id) + '\')" aria-label="ลบรูป">🗑️</button>' : '')
      + '</div></div>';
  }
  window.tsLibFilter = function (k, v) {
    _lib[k] = v;
    var focusQ = k === 'q';
    renderLibrary();
    if (focusQ) { var i = document.getElementById('ts-lib-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  };

  // ── อัปโหลด / เปลี่ยน / ลบรูปตัวการ์ตูน (1 คน 1 รูป) ──
  window.tsPickFig = function (staffId) {
    if (!window.canEdit('team_showcase')) return;
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.png,.webp,.jpg,.jpeg';
    inp.onchange = function () { if (inp.files[0]) uploadFig(staffId, inp.files[0]); };
    inp.click();
  };
  async function uploadFig(staffId, file) {
    if (FIG_TYPES.indexOf(file.type) < 0) { window.showAlert('รองรับเฉพาะไฟล์ PNG, WebP หรือ JPG', 'warn'); return; }
    if (file.size > FIG_MAX) { window.showAlert('ไฟล์ใหญ่เกิน 5MB — ลดขนาดรูปก่อน (เช่น 1200×2000 px)', 'warn'); return; }
    var db = window.getDb && window.getDb();
    if (!db) return;
    window.showLoader && window.showLoader('กำลังอัปโหลดรูป...');
    try {
      var old = FIGS[staffId];
      var path = window.storageKey(staffId, file.name);
      var up = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      var url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      await window.setDoc(window.getDocRef('STAFF_FIGURES', staffId), {
        image_url: url, file_path: path, updated_by: window.meId(), updated_at: new Date().toISOString(),
      });
      FIGS[staffId] = { url: url, path: path };
      if (old && old.path) db.storage.from(BUCKET).remove([old.path]).catch(function () {});
      window.showToast(file.type === 'image/jpeg' ? 'บันทึกรูปแล้ว (JPG ไม่มีพื้นใส แนะนำ PNG)' : 'บันทึกรูปแล้ว', 'success');
      if (vOn()) window.renderTeamShowcase();
      if (_ed) renderEdMembers();
    } catch (e) {
      window.showAlert('อัปโหลดไม่สำเร็จ: ' + (e.message || e), 'error');
    } finally { window.hideLoader && window.hideLoader(); }
  }
  window.tsDelFig = function (staffId) {
    var f = FIGS[staffId], s = window.staffByRef(staffId);
    if (!f || !window.canEdit('team_showcase')) return;
    window.showConfirm('ลบรูปตัวการ์ตูนของ "' + (s ? s.name : staffId) + '" ? (ทุกทีมที่มีคนนี้จะแสดงเป็นเงาแทน)', async function () {
      try {
        await window.deleteDoc(window.getDocRef('STAFF_FIGURES', staffId));
        var db = window.getDb();
        if (f.path) db.storage.from(BUCKET).remove([f.path]).catch(function () {});
        delete FIGS[staffId];
        window.renderTeamShowcase();
        window.showToast('ลบรูปแล้ว', 'success');
      } catch (e) { window.showAlert('ลบไม่สำเร็จ: ' + (e.message || e), 'error'); }
    }, { title: 'ลบรูป', okText: 'ลบ' });
  };

  // ══ Prompt สร้างตัวการ์ตูนจากรูปถ่าย ══
  // แต่ละแนวต่างกันแค่ "ลุค/วัสดุ" — สัดส่วน กรอบภาพ พื้นหลัง และขนาด 3:5 ล็อกไว้เหมือนกันทุกแนว ให้วางรวมทีมได้กลมกลืน
  var PR_STYLES = [
    { id: 'vinyl', icon: '🧸', name: 'ฟิกเกอร์ไวนิล', en: 'cute Pixar / Pop Mart chibi vinyl figurine',
      look: 'smooth matte vinyl toy, soft studio lighting from the front-left, gentle shading, bright friendly colors' },
    { id: 'clay', icon: '🏺', name: 'ดินน้ำมัน', en: 'claymation plasticine figurine',
      look: 'handmade plasticine clay with subtle fingerprint texture, slightly imperfect sculpted edges, warm soft lighting, stop-motion movie look' },
    { id: 'anime', icon: '🌸', name: 'อนิเมะ 3D', en: '3D anime-style chibi figurine',
      look: 'cel-shaded Japanese anime rendering, clean outlines, big expressive eyes, vivid pastel colors, glossy hair highlights' },
    { id: 'plush', icon: '🧶', name: 'ตุ๊กตาผ้า', en: 'soft plush doll',
      look: 'fuzzy felt and cotton fabric, visible stitching seams, embroidered facial details, cozy soft lighting' },
    { id: 'game', icon: '🎮', name: 'ตัวละครเกม', en: 'stylized video game hero character',
      look: 'polished game-engine render, slightly exaggerated hand-painted textures, rim light, vibrant fantasy-game color palette' },
    { id: 'hero', icon: '🦸', name: 'ซูเปอร์ฮีโร่', en: 'chibi superhero figurine',
      look: 'heroic comic-book vibe, a short cape added over the outfit, confident smile, bold saturated colors, glossy collectible finish' },
    { id: 'wood', icon: '🌳', name: 'ไม้แกะสลัก', en: 'hand-carved wooden toy figurine',
      look: 'carved and painted wood with visible grain, soft rounded shapes, matte paint, warm natural lighting' },
    { id: 'flat', icon: '🎨', name: 'สติกเกอร์ 2D', en: 'flat 2D vector sticker character',
      look: 'clean flat vector illustration, bold smooth outlines, simple cel shading, limited cheerful color palette, no sticker border' },
  ];
  var _prStyle = 'vinyl', _prAi = [];
  function prFind(id) { return PR_STYLES.concat(_prAi).filter(function (x) { return x.id === id; })[0] || PR_STYLES[0]; }
  function prMain(st) {
    return 'Turn the person in the attached photo into a ' + st.en + '.\n'
      + '- Style: ' + st.look + '.\n'
      + '- Proportions: big head, small body (head about 1/3 of total height), standing straight, facing the camera, friendly smile.\n'
      + '- Keep the person recognizable: face shape, hairstyle, hair color, skin tone, glasses (if any).\n'
      + '- Outfit: [OUTFIT, e.g. navy blue company polo shirt and black trousers, sneakers].\n'
      + '- Prop: [PROP FOR THE ROLE, e.g. a laptop / a call-center headset / a document folder / a toolbox].\n'
      + '- Framing: full body from head to shoes, centered, the figure fills about 90% of the image height, feet touching the bottom edge.\n'
      + '- Background: fully transparent PNG (alpha). If transparency is not possible, use a plain pure white background.\n'
      + '- No floor, no shadow on the ground, no pedestal, no text, no logo, no frame.\n'
      + '- Portrait orientation, 3:5 aspect ratio (e.g. 1200x2000 px).';
  }
  function prNext(st) {
    return 'Create the next team member as a ' + st.en + ' using exactly the same style, proportions, lighting, camera angle, scale and framing as the previous figure. '
      + 'Use the person in the newly attached photo. Outfit: [OUTFIT]. Prop: [PROP]. Transparent background, 3:5 portrait, feet touching the bottom edge.';
  }
  function prRender() {
    var box = document.getElementById('ts-pr-styles');
    if (!box) return;
    box.innerHTML = PR_STYLES.concat(_prAi).map(function (x) {
      return '<button type="button" class="ts-pr-chip' + (x.id === _prStyle ? ' on' : '') + '" title="' + esc(x.look) + '"'
        + ' onclick="window.tsPrStyle(\'' + x.id + '\')">' + esc(x.icon + ' ' + x.name) + '</button>';
    }).join('');
    var st = prFind(_prStyle);
    document.getElementById('ts-pr-1').value = prMain(st);
    document.getElementById('ts-pr-2').value = prNext(st);
  }
  window.tsPrStyle = function (id) { _prStyle = id; prRender(); };
  window.tsPrAiGen = async function (btn) {
    var idea = (document.getElementById('ts-pr-idea').value || '').trim();
    var sys = 'You design art styles for team-member character figures. Reply with JSON only: '
      + '{"name_th":"ชื่อแนวภาษาไทยสั้นๆ ไม่เกิน 3 คำ","icon":"one emoji","en":"short English noun phrase for the character type, e.g. retro tin toy figurine","look":"one English sentence about material, rendering, colors, lighting and mood"}. '
      + 'Rules: describe ONLY the visual style. Do NOT mention pose, proportions, framing, size, aspect ratio, background, floor, text or camera — those are fixed elsewhere. '
      + 'It must stay a single full-body character suitable for a friendly office team showcase. No brand or franchise names.';
    var used = PR_STYLES.concat(_prAi).map(function (x) { return x.en; }).join('; ');
    var user = (idea ? 'แนวที่ผู้ใช้อยากได้: ' + idea : 'คิดแนวใหม่ที่สนุกและแปลกใหม่ให้หน่อย') + '\nห้ามซ้ำกับแนวเหล่านี้: ' + used;
    var o = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳ AI กำลังคิด...';
    try {
      var r = await window.aiChatJson(sys, user, { maxTokens: 300, temperature: 0.9 });
      var clean = function (v, n) { return String(v || '').replace(/\s+/g, ' ').trim().replace(/\.+$/, '').slice(0, n); };
      var st = { id: 'ai' + Date.now(), icon: clean(r.icon, 4) || '✨', name: clean(r.name_th, 30) || 'แนวจาก AI',
        en: clean(r.en, 120), look: clean(r.look, 400) };
      if (!st.en || !st.look) throw new Error('AI ตอบไม่ครบ — ลองใหม่อีกครั้ง');
      _prAi.push(st); _prStyle = st.id;
      prRender();
    } catch (e) {
      window.showAlert('ให้ AI คิดแนวไม่สำเร็จ: ' + (e.message || e), 'error');
    } finally { btn.disabled = false; btn.textContent = o; }
  };

  window.tsPrompt = function () {
    var m = document.getElementById('m-ts-prompt');
    if (!m) {
      m = document.createElement('div');
      m.className = 'overlay'; m.id = 'm-ts-prompt';
      m.innerHTML = '<div class="modal lg">'
        + '<div class="m-head"><div class="m-icon" style="background:rgba(244,132,95,.15)">✨</div>'
        + '<div class="m-title">Prompt สร้างตัวการ์ตูนจากรูปถ่าย</div>'
        + '<button class="m-x" onclick="window.closeM(\'m-ts-prompt\')">✕</button></div>'
        + '<div class="m-body ts-pr">'
        + '<ol class="ts-pr-steps">'
        + '<li>ถ่ายรูปพนักงาน <b>หน้าตรง เห็นครึ่งตัวขึ้นไป แสงสว่าง</b> (ขออนุญาตเจ้าตัวก่อนส่งรูปเข้า AI ภายนอก)</li>'
        + '<li>เลือกแนวด้านล่าง → เปิด ChatGPT / Gemini / Copilot ที่สร้างรูปได้ → แนบรูป → วาง Prompt แก้ส่วนใน <code>[ ]</code> ให้ตรงตำแหน่งงาน</li>'
        + '<li>คนถัดไป <b>ใช้แชทเดิม</b> แล้วใช้ Prompt "คนถัดไป" เพื่อให้สไตล์และขนาดเหมือนกันทั้งทีม (ทั้งทีมควรใช้แนวเดียวกัน)</li>'
        + '<li>ถ้าได้พื้นขาว ให้ลบพื้นหลังที่ remove.bg หรือ Canva → บันทึกเป็น PNG → อัปโหลดในแท็บคลังรูปทีม</li>'
        + '</ol>'
        + '<div class="ts-pr-h"><b>เลือกแนว</b><span class="ts-pr-note">ทุกแนวล็อกขนาด 3:5 เต็มตัว พื้นใส เหมือนกัน</span></div>'
        + '<div class="ts-pr-styles" id="ts-pr-styles"></div>'
        + '<div class="ts-pr-ai"><input class="f-input" id="ts-pr-idea" maxlength="120" placeholder="อยากได้แนวไหน เช่น หุ่นยนต์ย้อนยุค, นักบินอวกาศ, ญี่ปุ่นโบราณ (ว่าง = ให้ AI สุ่ม)"'
        + ' onkeydown="if(event.key===\'Enter\')document.getElementById(\'ts-pr-aibtn\').click()">'
        + '<button type="button" class="btn btn-primary btn-sm" id="ts-pr-aibtn" onclick="window.tsPrAiGen(this)">✨ ให้ AI คิดแนวใหม่</button></div>'
        + '<div class="ts-pr-h"><b>Prompt คนแรก</b><button type="button" class="btn btn-ghost btn-sm" onclick="window.tsCopyPrompt(\'ts-pr-1\',this)">📋 คัดลอก</button></div>'
        + '<textarea class="f-input ts-pr-box" id="ts-pr-1" rows="11" readonly></textarea>'
        + '<div class="ts-pr-h"><b>Prompt คนถัดไป (ให้สไตล์เหมือนกันทั้งทีม)</b><button type="button" class="btn btn-ghost btn-sm" onclick="window.tsCopyPrompt(\'ts-pr-2\',this)">📋 คัดลอก</button></div>'
        + '<textarea class="f-input ts-pr-box" id="ts-pr-2" rows="4" readonly></textarea>'
        + '<div class="ts-pr-tip">💡 ตัวอย่างอุปกรณ์ตามตำแหน่ง: Implementer = กล่องเครื่องมือ/แล็ปท็อป · Helpdesk = หูฟังคอลเซ็นเตอร์ · Developer = แล็ปท็อป+แว่น · Trainer = หนังสือ/รีโมตพรีเซนต์ · หัวหน้าทีม = แท็บเล็ต/แฟ้ม</div>'
        + '</div>'
        + '<div class="m-foot" style="display:flex;justify-content:flex-end;"><button class="btn btn-ghost" onclick="window.closeM(\'m-ts-prompt\')">ปิด</button></div>'
        + '</div>';
      document.body.appendChild(m);
    }
    prRender();
    window.openM('m-ts-prompt');
  };

  window.tsCopyPrompt = function (id, btn) {
    var ta = document.getElementById(id);
    var done = function () { var o = btn.textContent; btn.textContent = '✓ คัดลอกแล้ว'; setTimeout(function () { btn.textContent = o; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(done, function () { ta.select(); document.execCommand('copy'); done(); });
    } else { ta.select(); document.execCommand('copy'); done(); }
  };

  // ══ เพิ่ม/แก้ไขทีม ══
  function teamModal() {
    var m = document.getElementById('m-ts-team');
    if (m) return m;
    m = document.createElement('div');
    m.className = 'overlay'; m.id = 'm-ts-team';
    m.innerHTML = '<div class="modal xl">'
      + '<div class="m-head"><div class="m-icon" style="background:rgba(244,132,95,.15)">🧸</div>'
      + '<div class="m-title" id="ts-ed-title">ทีมใหม่</div>'
      + '<button class="m-x" onclick="window.closeM(\'m-ts-team\')">✕</button></div>'
      + '<div class="m-body">'
      + '<div class="f-grid" style="grid-template-columns:1fr 1fr;">'
      + '<div class="f-group"><label class="f-label">ชื่อทีม <span style="color:var(--coral)">*</span></label>'
      + '<input class="f-input" id="ts-ed-name" placeholder="เช่น ทีม Implement"></div>'
      + '<div class="f-group"><label class="f-label">ตัวอักษรใหญ่ด้านหลัง (อังกฤษ)</label>'
      + '<input class="f-input" id="ts-ed-ghost" maxlength="14" placeholder="OUR TEAM" style="text-transform:uppercase"></div>'
      + '</div>'
      + '<details class="ts-ed-voice" id="ts-ed-voice"><summary>🔊 คำพูด AI แนะนำตัว <span class="ts-ed-hint">ทักทาย · แม่แบบแนะนำแต่ละคน · ปิดท้าย</span></summary>'
      + '<div class="ts-ed-vhelp">ช่องข้อมูลที่ใช้ได้: '
      + VOICE_KEYS.map(function (k) { return '<code>{' + k + '}</code>'; }).join(' ')
      + '<br>ขึ้นบรรทัดใหม่ = เว้นจังหวะ · <code>[ ]</code> ครอบ = ถ้าข้อมูลข้างในว่างจะข้ามทั้งวงเล็บ · คำทักทาย/ปิดท้ายใช้ได้แค่ <code>{ทีม}</code> <code>{จำนวน}</code></div>'
      + '<label class="ts-lib-cb ts-ed-polite"><input type="checkbox" id="ts-ed-vpolite" onchange="if(this.checked)window.tsEdPoliteApply()"> ลงท้ายทุกบรรทัดด้วย “ค่ะ”'
      + ' <span class="ts-ed-hint">(กันคำสุดท้ายขาด เช่น ชำนาญการพิเศษ — ติ๊กแล้วเติมในช่องด้านล่างให้ · แนะนำให้เปิดไว้)</span></label>'
      + '<div class="f-group"><label class="f-label">คำทักทาย (พูดก่อนคนแรก · ว่าง = ไม่พูด)</label>'
      + '<textarea class="f-input" id="ts-ed-vintro" rows="2" placeholder="เช่น สวัสดีค่ะ ขอแนะนำสมาชิก{ทีม} ทั้งหมด {จำนวน} คนค่ะ"></textarea></div>'
      + '<div class="f-group"><label class="f-label">แม่แบบแนะนำแต่ละคน <a href="javascript:void(0)" class="ts-ed-reset" onclick="window.tsEdVoiceReset()">คืนค่าเริ่มต้น</a></label>'
      + '<textarea class="f-input" id="ts-ed-vmember" rows="3"></textarea></div>'
      + '<div class="f-group"><label class="f-label">คำปิดท้าย (พูดหลังคนสุดท้าย · ว่าง = ไม่พูด)</label>'
      + '<textarea class="f-input" id="ts-ed-voutro" rows="2" placeholder="เช่น ขอบคุณค่ะ"></textarea></div>'
      + '<button type="button" class="btn btn-ghost btn-sm" id="ts-ed-vtest" onclick="window.tsEdVoiceTest()">▶ ลองฟัง (ทักทาย + คนแรก)</button>'
      + '</details>'
      // สมาชิก: รายชื่อด้านซ้าย (กดเลือก) · รายละเอียดคนที่เลือกด้านขวา
      + '<div class="ts-ed-split">'
      + '<div class="ts-ed-side">'
      + '<div class="ts-ed-side-h"><b>สมาชิก</b> <span class="ts-ed-n" id="ts-ed-n"></span> <span class="ts-ed-hint">· เรียงตามตำแหน่งอัตโนมัติ</span></div>'
      + '<select class="f-input ts-ed-addsel" id="ts-ed-add" aria-label="เพิ่มสมาชิก" onchange="window.tsEdAddPick(this)"></select>'
      + '<div class="ts-ed-list" id="ts-ed-list"></div>'
      + '</div>'
      + '<div class="ts-ed-pane" id="ts-ed-pane"></div>'
      + '</div>'
      + '</div>'
      + '<div class="m-foot" style="display:flex;gap:8px;">'
      + '<button class="btn btn-ghost ts-del" id="ts-ed-del" onclick="window.tsDelTeam()">🗑️ ลบทีม</button>'
      + '<span style="flex:1"></span>'
      + '<button class="btn btn-ghost" onclick="window.closeM(\'m-ts-team\')">ยกเลิก</button>'
      + '<button class="btn btn-pri" id="ts-ed-save" onclick="window.tsSaveTeam()">บันทึก</button></div>'
      + '</div>';
    document.body.appendChild(m);
    return m;
  }

  window.tsEditTeam = function (id) {
    var t = id ? TEAMS.find(function (x) { return x.id === id; }) : null;
    if (t ? !window.canEdit('team_showcase') : !window.canAdd('team_showcase')) return;
    teamModal();
    _ed = {
      id: t ? t.id : '', old: t,
      members: t ? t.members.filter(function (m) { return window.staffByRef(m.staffId); }).map(function (m) { return Object.assign({}, m); }) : [],
      sel: '',   // staffId ของคนที่กำลังแก้ในแผงขวา
    };
    document.getElementById('ts-ed-title').textContent = t ? 'แก้ไขทีม' : 'ทีมใหม่';
    document.getElementById('ts-ed-name').value = t ? t.name : '';
    document.getElementById('ts-ed-ghost').value = t ? t.ghost : 'OUR TEAM';
    var v = (t && t.voice) || {};
    document.getElementById('ts-ed-vintro').value = v.intro || '';
    document.getElementById('ts-ed-vmember').value = v.member || VOICE_MEMBER;
    document.getElementById('ts-ed-voutro').value = v.outro || '';
    document.getElementById('ts-ed-vpolite').checked = v.polite !== false;
    if (v.polite !== false) edPoliteApply(); // แม่แบบที่ทีมพิมพ์เองไว้ก่อนมีตัวเลือกนี้ → เติม "ค่ะ" ให้เห็นในช่อง (บันทึกแล้วเก็บตามนี้)
    document.getElementById('ts-ed-voice').open = !!(v.intro || v.member || v.outro || v.polite === false);
    document.getElementById('ts-ed-vtest').style.display = window.TTS ? '' : 'none';
    document.getElementById('ts-ed-del').style.display = t && window.canDel('team_showcase') ? '' : 'none';
    renderEdMembers();
    window.openM('m-ts-team');
    setTimeout(function () { document.getElementById('ts-ed-name').focus(); }, 50);
  };

  function nextColor() {
    var used = _ed.members.map(function (m) { return (m.color || '').toUpperCase(); });
    return PALETTE.find(function (c) { return used.indexOf(c) < 0; }) || PALETTE[_ed.members.length % PALETTE.length];
  }
  function edCur() { return _ed ? _ed.members.find(function (m) { return m.staffId === _ed.sel; }) : null; }
  function edThumb(m, s) { var f = FIGS[m.staffId]; return f ? '<img src="' + esc(f.url) + '" alt="">' : placeholderSvg(nick(s)); }
  function renderEdMembers() {
    if (!_ed) return;
    _ed.members.sort(byRank(memberStaff));   // ลำดับในรายการ = ลำดับที่แสดงในหน้าแนะนำทีม
    if (!edCur()) _ed.sel = _ed.members.length ? _ed.members[0].staffId : '';
    renderEdAdd();
    renderEdList();
    renderEdPane();
  }
  // ช่องเพิ่มสมาชิกช่องเดียว: "ทั้งแผนก" + รายคนจัดกลุ่มตามแผนก (พิมพ์ค้นหาได้ผ่าน select-ui) · คนที่อยู่ในทีมแล้วไม่แสดง
  function renderEdAdd() {
    var inTeam = {};
    _ed.members.forEach(function (m) { inTeam[m.staffId] = true; });
    var free = (window.STAFF || []).filter(function (s) { return s.active && !inTeam[s.id]; })
      .sort(window.sortStaffByRank);
    var depts = (window.DEPT_LIST || []).map(function (d) {
      return { d: d, n: free.filter(function (s) { return s.deptId === d.id; }).length };
    }).filter(function (x) { return x.n; });
    var groups = {};
    free.forEach(function (s) { var k = s.dept || 'ไม่ระบุแผนก'; (groups[k] = groups[k] || []).push(s); });
    document.getElementById('ts-ed-add').innerHTML = '<option value="">+ เพิ่มคน หรือทั้งแผนก…</option>'
      + (depts.length ? '<optgroup label="เพิ่มทั้งแผนก">' + depts.map(function (x) {
        return '<option value="d:' + esc(x.d.id) + '">ทั้งแผนก ' + esc(x.d.label) + ' (' + x.n + ' คน)</option>';
      }).join('') + '</optgroup>' : '')
      + Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, 'th'); }).map(function (g) {
        return '<optgroup label="' + esc(g) + '">' + groups[g].map(function (s) {
          return '<option value="s:' + esc(s.id) + '">' + esc(s.name + (s.nickname && s.nickname !== s.name ? ' (' + s.nickname + ')' : '')) + '</option>';
        }).join('') + '</optgroup>';
      }).join('');
  }
  // รายชื่อด้านซ้าย: ป้าย รูป/คำแนะนำ/บทพูด สีเขียว = กรอกแล้ว
  function renderEdList() {
    var n = _ed.members.length;
    document.getElementById('ts-ed-n').textContent = n + ' คน';
    var tag = function (on, t) { return '<span class="ts-ed-tag' + (on ? ' on' : '') + '">' + t + '</span>'; };
    document.getElementById('ts-ed-list').innerHTML = n ? _ed.members.map(function (m) {
      var s = window.staffByRef(m.staffId) || { name: m.staffId, role: '' };
      return '<button type="button" class="ts-ed-item' + (m.staffId === _ed.sel ? ' on' : '') + '" onclick="window.tsEdPick(\'' + esc(m.staffId) + '\')">'
        + '<span class="ts-ed-thumb" style="background:' + esc(m.color) + '">' + edThumb(m, s) + '</span>'
        + '<span class="ts-ed-item-t"><b>' + esc(s.name) + '</b><span>' + esc(m.title.trim() || s.role || '') + '</span>'
        + '<span class="ts-ed-tags">' + tag(FIGS[m.staffId], 'รูป') + tag(m.desc.trim(), 'คำแนะนำ') + tag((m.speech || '').trim(), 'บทพูด') + '</span></span>'
        + '</button>';
    }).join('') : '<div class="ts-ed-none">ยังไม่มีสมาชิก<br>เลือกพนักงานหรือแผนกจากช่องด้านบน</div>';
  }
  // แผงขวา: รายละเอียดคนที่เลือก
  function renderEdPane() {
    var pane = document.getElementById('ts-ed-pane'), m = edCur();
    if (!m) { pane.innerHTML = '<div class="ts-ed-none ts-ed-pane-none">เพิ่มคนหรือทั้งแผนกจากช่องด้านซ้าย<br>แล้วกดที่ชื่อเพื่อตั้งหัวข้อ คำแนะนำ สี และบทพูด</div>'; return; }
    var s = window.staffByRef(m.staffId) || { name: m.staffId, role: '' };
    var i = _ed.members.indexOf(m), n = _ed.members.length, id = esc(m.staffId), f = FIGS[m.staffId];
    var set = function (k) { return ' oninput="window.tsEdSet(\'' + id + '\',\'' + k + '\',this.value)"'; };
    var cur = (m.color || '').toUpperCase(), inPal = PALETTE.some(function (c) { return c.toUpperCase() === cur; });
    pane.innerHTML = '<div class="ts-ed-head">'
      + '<div class="ts-ed-big" id="ts-ed-big" style="background:' + esc(m.color) + '">' + edThumb(m, s)
      + (window.canEdit('team_showcase') ? '<button type="button" class="ts-ed-up" onclick="window.tsPickFig(\'' + id + '\')">' + (f ? 'เปลี่ยนรูป' : 'ใส่รูป') + '</button>' : '') + '</div>'
      + '<div class="ts-ed-meta"><span class="ts-ed-hint">คนที่ ' + (i + 1) + ' จาก ' + n + '</span>'
      + '<b>' + esc(s.name) + '</b><span>' + esc([s.role, s.dept].filter(Boolean).join(' · ')) + '</span>'
      + (n > 1 ? '<div class="ts-ed-nav"><button type="button" class="btn btn-ghost btn-sm" onclick="window.tsEdStep(-1)">← คนก่อน</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" onclick="window.tsEdStep(1)">คนถัดไป →</button></div>' : '')
      + '</div></div>'
      + '<div class="f-group"><label class="f-label" for="ts-ed-mtitle">หัวข้อใหญ่ <span class="ts-ed-hint">— ว่างไว้ = ใช้ตำแหน่ง “' + esc(s.role || '-') + '”</span></label>'
      + '<input class="f-input" id="ts-ed-mtitle" placeholder="' + esc(s.role || 'ตำแหน่ง') + '" value="' + esc(m.title) + '"' + set('title') + '></div>'
      + '<div class="f-group"><label class="f-label" for="ts-ed-mdesc">คำแนะนำสั้น ๆ</label>'
      + '<input class="f-input" id="ts-ed-mdesc" placeholder="เช่น ดูแลการติดตั้งระบบที่ รพ." value="' + esc(m.desc) + '"' + set('desc') + '></div>'
      + '<div class="f-group"><div class="f-label">สีพื้นหลัง <span class="ts-ed-hint">— ตอนคนนี้อยู่ตรงกลางจอ</span></div><div class="ts-ed-sw">'
      + PALETTE.map(function (c) {
        return '<button type="button" class="ts-ed-swb' + (c.toUpperCase() === cur ? ' on' : '') + '" data-c="' + c.toUpperCase() + '" style="background:' + c + '" aria-label="สี ' + c + '" onclick="window.tsEdColor(\'' + c + '\')"></button>';
      }).join('')
      + '<label class="ts-ed-swc' + (inPal ? '' : ' on') + '"><input type="color" value="' + esc(m.color) + '" oninput="window.tsEdColor(this.value)"> สีอื่น…</label>'
      + '</div></div>'
      + '<div class="f-group"><label class="f-label" for="ts-ed-mspeech">🔊 บทพูด AI เฉพาะคนนี้ <span class="ts-ed-hint">— ว่างไว้ = ใช้แม่แบบทีม</span></label>'
      + '<textarea class="f-input ts-ed-speech" id="ts-ed-mspeech" rows="4" placeholder="ว่างไว้ = ใช้แม่แบบแนะนำแต่ละคนของทีม"' + set('speech') + '>' + esc(m.speech || '') + '</textarea>'
      + '<div class="ts-ed-sprow">' + (window.TTS ? '<button type="button" class="btn btn-ghost btn-sm" onclick="window.tsEdVoiceTest(\'' + id + '\')">▶ ลองฟังคนนี้</button>' : '')
      + '<span class="ts-ed-hint">ใช้ ' + VOICE_KEYS.map(function (k) { return '{' + esc(k) + '}'; }).join(' ') + ' ได้</span></div></div>'
      + '<div class="ts-ed-rm"><button type="button" class="ts-ed-rmb" onclick="window.tsEdRemove(\'' + id + '\')">เอา ' + esc(nick(s)) + ' ออกจากทีม</button></div>';
  }

  window.tsEdSet = function (id, k, v) {
    var m = _ed && _ed.members.find(function (x) { return x.staffId === id; });
    if (!m) return;
    m[k] = v;
    renderEdList(); // อัปเดตหัวข้อ/ป้ายในรายชื่อ — แผงขวาไม่วาดใหม่ (ช่องที่กำลังพิมพ์ไม่หลุดโฟกัส)
  };
  window.tsEdPick = function (id) {
    _ed.sel = id;
    renderEdList();
    renderEdPane();
    document.getElementById('ts-ed-pane').scrollTop = 0;
  };
  window.tsEdStep = function (d) {
    var n = _ed.members.length, i = _ed.members.indexOf(edCur());
    if (n) window.tsEdPick(_ed.members[(i + d + n) % n].staffId);
  };
  window.tsEdColor = function (c) {
    var m = edCur();
    if (!m) return;
    m.color = c;
    document.getElementById('ts-ed-big').style.background = c;
    var u = c.toUpperCase(), hit = false;
    document.querySelectorAll('#ts-ed-pane .ts-ed-swb').forEach(function (b) { var on = b.dataset.c === u; b.classList.toggle('on', on); if (on) hit = true; });
    var other = document.querySelector('#ts-ed-pane .ts-ed-swc');
    other.classList.toggle('on', !hit);
    if (hit) other.querySelector('input').value = c.toLowerCase();
    renderEdList();
  };
  window.tsEdAddPick = function (sel) {
    var v = sel.value;
    sel.value = '';
    if (!v) return;
    if (v.indexOf('d:') === 0) {
      var dept = v.slice(2), have = {};
      _ed.members.forEach(function (m) { have[m.staffId] = true; });
      var add = (window.STAFF || []).filter(function (s) { return s.active && s.deptId === dept && !have[s.id]; });
      add.forEach(function (s) { _ed.members.push({ staffId: s.id, color: nextColor(), title: '', desc: '', speech: '' }); });
      window.showToast(add.length ? 'เพิ่ม ' + add.length + ' คน' : 'ทุกคนในแผนกนี้อยู่ในทีมแล้ว', add.length ? 'success' : 'info');
    } else {
      _ed.members.push({ staffId: v.slice(2), color: nextColor(), title: '', desc: '', speech: '' });
      _ed.sel = v.slice(2);
    }
    renderEdMembers();
  };
  window.tsEdRemove = function (id) {
    var i = _ed.members.findIndex(function (m) { return m.staffId === id; });
    if (i < 0) return;
    _ed.members.splice(i, 1);
    var next = _ed.members[i] || _ed.members[i - 1];
    _ed.sel = next ? next.staffId : '';
    renderEdMembers();
  };

  // ── คำพูด AI ในหน้าต่างแก้ไข · แม่แบบเท่าค่าเริ่มต้น = เก็บว่าง (ปรับค่าเริ่มต้นในโค้ดภายหลัง ทีมนั้นได้ตามไปด้วย) ──
  function edVoice() {
    var val = function (id) { return document.getElementById(id).value.trim(); };
    var member = val('ts-ed-vmember');
    return { intro: val('ts-ed-vintro'), member: member === VOICE_MEMBER ? '' : member, outro: val('ts-ed-voutro'),
      polite: document.getElementById('ts-ed-vpolite').checked };
  }
  // เติม "ค่ะ" ท้ายทุกบรรทัดที่ยังไม่มีคำลงท้าย ในช่องทักทาย/แม่แบบ/ปิดท้าย — ให้เห็นในแม่แบบตรงกับที่ AI จะพูด
  // (บรรทัดที่ข้อมูลว่างทั้งหมด เช่น "[{หัวข้อ}]ค่ะ" ของคนที่ไม่มีหัวข้อ ยังข้ามทั้งบรรทัดเหมือนเดิม)
  //  บรรทัดที่จบด้วยชื่อ = ไม่ต่อ "ค่ะ" (มี "ค่ะ" ที่เคยเติมไว้ท้ายชื่อ → เอาออก)
  function politeTpl(text) {
    return String(text || '').split(/\r?\n/).map(function (line) {
      var l = line.replace(/\s+$/, '');
      if (NAME_END.test(l)) return l.replace(NAME_END, '$1');
      return l && !POLITE_TPL_END.test(l) ? l + 'ค่ะ' : l;
    }).join('\n');
  }
  var POLITE_TPL_END = /(ค่ะ|คะ|ครับ|นะ|จ้ะ|จ้า)$/;
  function edPoliteApply() {
    ['ts-ed-vintro', 'ts-ed-vmember', 'ts-ed-voutro'].forEach(function (id) {
      var el = document.getElementById(id);
      el.value = politeTpl(el.value);
    });
  }
  window.tsEdPoliteApply = edPoliteApply;
  window.tsEdVoiceReset = function () { document.getElementById('ts-ed-vmember').value = VOICE_MEMBER; };
  // ลองฟังจากค่าที่กำลังแก้ (ยังไม่ต้องบันทึก): ไม่ระบุคน = คำทักทาย + คนแรก · ระบุ staffId = เฉพาะคนนั้น
  window.tsEdVoiceTest = function (staffId) {
    if (!_ed || !window.TTS) return;
    var list = _ed.members.map(function (m) {
      var s = window.staffByRef(m.staffId);
      return s && s.active ? { id: m.staffId, staff: s, title: m.title.trim() || s.role || '', desc: m.desc.trim(), speech: (m.speech || '').trim() } : null;
    }).filter(Boolean);
    if (!list.length) { window.showToast('เพิ่มสมาชิกก่อนจึงจะลองฟังได้', 'info'); return; }
    var i = staffId ? list.findIndex(function (x) { return x.id === staffId; }) : 0;
    if (i < 0) { window.showToast('พนักงานคนนี้ไม่ได้ใช้งานแล้ว จะไม่ถูกแนะนำ', 'info'); return; }
    voiceOff();
    var t = { name: document.getElementById('ts-ed-name').value.trim(), voice: edVoice() };
    window.TTS.play(speechOf(t, list, i, !staffId), { polite: t.voice.polite, onError: function (err) { window.showToast(err.message, 'error'); } });
  };

  window.tsSaveTeam = async function () {
    var name = document.getElementById('ts-ed-name').value.trim();
    var ghost = document.getElementById('ts-ed-ghost').value.trim().toUpperCase() || 'OUR TEAM';
    if (!name) { window.showAlert('กรุณากรอกชื่อทีม', 'warn'); return; }
    var now = new Date().toISOString(), old = _ed.old;
    var id = _ed.id || ('TS' + Date.now() + Math.floor(Math.random() * 1000));
    var data = {
      name: name, ghost_text: ghost,
      members: _ed.members.map(function (m) { return { staff_id: m.staffId, color: m.color, title: m.title.trim(), desc: m.desc.trim(), speech: (m.speech || '').trim() }; }),
      voice: edVoice(),
      sort_order: old ? old.order : 99,
      created_by: old ? old.createdById : window.meId(), updated_by: window.meId(),
      created_at: old && old.createdAt ? old.createdAt : now, updated_at: now,
    };
    var btn = document.getElementById('ts-ed-save');
    btn.disabled = true;
    try {
      await window.setDoc(window.getDocRef('TEAM_SHOWCASES', id), data);
      var row = tTeam(Object.assign({ id: id, share_token: old ? old.shareToken : '' }, data)), i = TEAMS.findIndex(function (t) { return t.id === id; });
      if (i >= 0) TEAMS[i] = row; else TEAMS.push(row);
      _teamId = id; _active = 0; _ed = null;
      window.closeM('m-ts-team');
      window.showToast('บันทึกทีมแล้ว', 'success');
      window.renderTeamShowcase();
    } catch (e) {
      window.showAlert('บันทึกไม่สำเร็จ: ' + (e.message || e), 'error');
    } finally { btn.disabled = false; }
  };
  window.tsDelTeam = function () {
    var t = _ed && _ed.old;
    if (!t || !window.canDel('team_showcase')) return;
    window.showConfirm('ลบทีม "' + t.name + '" ? (รูปตัวการ์ตูนในคลังยังอยู่)', async function () {
      try {
        await window.deleteDoc(window.getDocRef('TEAM_SHOWCASES', t.id));
        TEAMS = TEAMS.filter(function (x) { return x.id !== t.id; });
        _teamId = ''; _active = 0; _ed = null;
        window.closeM('m-ts-team');
        window.renderTeamShowcase();
        window.showToast('ลบทีมแล้ว', 'success');
      } catch (e) { window.showAlert('ลบไม่สำเร็จ: ' + (e.message || e), 'error'); }
    }, { title: 'ลบทีม', okText: 'ลบ' });
  };

})();
