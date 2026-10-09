/**
 * tour.js — ทัวร์แนะนำการใช้งาน (เปิดเองครั้งแรกที่ผู้ใช้เข้าระบบ · กดข้ามได้ทุกขั้น)
 * หน้าต้อนรับ → ไฮไลต์ทีละเมนูใน sidebar + ปุ่มบน topbar → หน้าจบพร้อมพลุกระดาษ
 * แสดงเฉพาะเมนูที่ผู้ใช้มีสิทธิ์เห็น · จำว่าดูแล้ว/ข้ามแล้วต่อผู้ใช้ใน localStorage
 * เปิดดูอีกครั้งได้จากเมนูบัญชีผู้ใช้ › แนะนำการใช้งาน
 */
(function () {

  // คำอธิบายแต่ละเมนู (key = ชื่อ view ใน goView)
  var MENU_TIPS = {
    overview:       'สรุปภาพรวมทั้งหมด — จำนวนโครงการ สถานะ ค่าใช้จ่าย และงานที่ต้องติดตาม',
    kanban:         'บอร์ดติดตามการส่งมอบโครงการตามขั้นตอน ลากการ์ดเพื่อเปลี่ยนสถานะได้',
    projects:       'รายการโครงการทั้งหมด เพิ่ม/แก้ไขโครงการ ทีมงาน และกำหนดการ',
    advance:        'เบิกเงินทดรองจ่าย (Advance) และเอกสารประกอบการเบิก พร้อมแจ้งรายการที่เกินกำหนดเคลียร์',
    lodging:        'บันทึกและจัดหาที่พักสำหรับทีมที่ออกปฏิบัติงานหน้างาน',
    impl_tracker:   'ติดตามสถานะการติดตั้งระบบของแต่ละโครงการทีละขั้นตอน',
    all_issues:     'รวมปัญหาการใช้งานจากทุกโครงการไว้ในหน้าเดียว',
    training:       'ระบบอบรม — จัดหลักสูตร แบบทดสอบ และแบบประเมิน',
    timesheet:      'ลงเวลาทำงานรายวันต่อโครงการ ใช้คำนวณต้นทุนค่าแรง',
    budget:         'งบประมาณและรายการค่าใช้จ่ายของแต่ละโครงการ',
    workload:       'ดูภาระงานของสมาชิกในทีม และใครว่างในช่วงเวลาไหน',
    calendar:       'ปฏิทินรวมงาน การลา และวันหยุดของทีม',
    server_request: 'ส่งคำขอใช้งานถึงทีม Server และติดตามสถานะคำขอ',
    leave:          'ยื่นใบลาและติดตามผลการอนุมัติ',
    worklog:        'บันทึกงานที่ทำในแต่ละวัน',
    targets:        'ตั้งและติดตามเป้าหมายของทีม',
    helpdesk:       'ศูนย์ช่วยเหลือ — รับเรื่อง Ticket จากลูกค้า ตอบกลับ และติดตาม SLA',
    assist:         'ผู้ช่วยทีม — พื้นที่สนทนาและช่วยเหลือกันภายในทีม',
    hospital:       'ข้อมูลโรงพยาบาลลูกค้าทั้งหมด',
    contract:       'ข้อมูลสัญญาของแต่ละโครงการ',
    admin:          'ตั้งค่าระบบ ผู้ใช้งาน สิทธิ์ และข้อมูลหลัก',
    holiday:        'เพิ่ม/แก้ไขวันหยุดประจำปี',
  };

  var TOPBAR_TIPS = [
    { sel: '#btn-ask-ai',  icon: 'ti-sparkles',    title: 'ถาม AI', text: 'ค้นหาข้อมูลในระบบด้วยภาษาพูดได้เลย หรือกด Ctrl+K' },
    { sel: '#noti-bell',   icon: 'ti-bell',        title: 'การแจ้งเตือน', text: 'รวมเรื่องที่ต้องดำเนินการ เช่น Advance เกินกำหนด Ticket ใหม่ และเปิดรับแจ้งเตือนบนเครื่องได้ที่นี่' },
    { sel: '#dm-toggle',   icon: 'ti-moon',        title: 'โหมดมืด / สว่าง', text: 'สลับธีมหน้าจอตามที่ถนัด' },
    { sel: '.user-row',    icon: 'ti-user-circle', title: 'บัญชีผู้ใช้', text: 'เปลี่ยนรหัสผ่าน ออกจากระบบ หรือเปิดทัวร์แนะนำนี้อีกครั้ง', sidebar: true },
  ];

  var _steps = [], _idx = 0, _els = null, _started = '';  // _started = key ผู้ใช้ที่สั่งเปิดแล้วในรอบนี้

  function _key() {
    var cu = window.cu || {};
    return '_bms_tour_done_' + (cu.id || cu.username || '');
  }
  function _isDone() { try { return !!localStorage.getItem(_key()); } catch (e) { return true; } }
  function _markDone() { try { localStorage.setItem(_key(), '1'); } catch (e) {} }
  function _isMobile() { return window.innerWidth <= 768; }
  function _visible(el) { return !!(el && el.offsetParent !== null && el.style.display !== 'none'); }
  function _calm() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function _iconOf(el) {
    var i = el && el.querySelector('i.emo-ic, i.ti');  // ไอคอนเมนูถูก icons.util.js แปลงเป็นอีโมจิ (i.emo-ic)
    return i ? '<i class="' + i.className.replace(/\bni\b/, '').trim() + '">' + i.textContent + '</i>' : '';
  }

  function _buildSteps() {
    var steps = [{ kind: 'hero' }], sections = [], sec = '';
    document.querySelectorAll('#sidebar .sb-nav > *').forEach(function (el) {
      if (el.classList.contains('sb-sec')) { sec = el.textContent.trim(); return; }
      if (!el.classList.contains('nav-btn') || el.style.display === 'none') return;
      var m = (el.getAttribute('onclick') || '').match(/goView\('([^']+)'/);
      if (!m || !MENU_TIPS[m[1]]) return;
      var lbl = el.querySelector('.nl');
      steps.push({ el: el, sidebar: true, section: sec, icon: _iconOf(el), title: lbl ? lbl.textContent : m[1], text: MENU_TIPS[m[1]] });
      var last = sections[sections.length - 1];
      if (last && last.name === sec) last.n++;
      else sections.push({ name: sec, n: 1, icon: _iconOf(el) });
    });
    TOPBAR_TIPS.forEach(function (t) {
      var el = document.querySelector(t.sel);
      if (el && el.style.display !== 'none') steps.push({ el: el, sidebar: !!t.sidebar, section: 'เครื่องมือ', icon: window.appIcon ? window.appIcon(t.icon.replace('ti-', '')) : '', title: t.title, text: t.text });
    });
    steps[0].sections = sections;
    steps.push({ kind: 'finale' });
    return steps;
  }

  function _ensureEls() {
    if (_els) return _els;
    var block = document.createElement('div'); block.id = 'tour-block';
    var spot  = document.createElement('div'); spot.id = 'tour-spot';
    var card  = document.createElement('div'); card.id = 'tour-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-live', 'polite');
    document.body.appendChild(block);
    document.body.appendChild(spot);
    document.body.appendChild(card);
    card.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-t]');
      if (!b) return;
      var a = b.getAttribute('data-t');
      if (a === 'skip' || a === 'done') _end();
      else if (a === 'next') _go(_idx + 1);
      else if (a === 'prev') _go(_idx - 1);
    });
    requestAnimationFrame(function () { block.classList.add('on'); });
    _els = { block: block, spot: spot, card: card };
    return _els;
  }

  function _go(i) {
    if (i < 0 || i >= _steps.length) return;
    _idx = i;
    var s = _steps[i];
    // มือถือ: sidebar เป็นลิ้นชัก — เปิดเฉพาะขั้นที่ชี้เมนูใน sidebar
    var wait = 0;
    if (_isMobile()) {
      var sb = document.getElementById('sidebar');
      var open = sb && sb.classList.contains('mob-open');
      if (s.sidebar && !open) { window.toggleMobSidebar && window.toggleMobSidebar(); wait = 320; }
      else if (!s.sidebar && open) { window.closeMobSidebar && window.closeMobSidebar(); wait = 320; }
    }
    if (s.el) s.el.scrollIntoView({ block: 'nearest' });
    setTimeout(function () { if (_idx === i && _els) _render(s, true); }, wait);
  }

  function _heroHtml(s) {
    // ชื่อสั้น ๆ: ตัดคำนำหน้า (นาย/นาง/นางสาว/ดร. ฯลฯ) แล้วเอาคำแรก
    var cu = window.cu || {}, name = (cu.name || cu.username || '').trim()
      .replace(/^(นางสาว|นาย|นาง|น\.ส\.|ดร\.|Mr\.?|Mrs\.?|Ms\.?)\s*/i, '').split(/\s+/)[0];
    var total = _steps.length - 2;
    return '<div class="tc-hero">'
      + '<div class="tc-blob b1"></div><div class="tc-blob b2"></div><div class="tc-blob b3"></div>'
      + '<span class="tc-spark s1">✦</span><span class="tc-spark s2">✧</span><span class="tc-spark s3">✦</span>'
      + '</div>'
      + '<div class="tc-logo"><img src="img/BMS_T.png" alt=""></div>'
      + '<div class="tc-body">'
      + '<div class="tc-hello">สวัสดี' + (name ? ' คุณ' + window.esc(name) : '') + ' <span class="tc-wave">👋</span></div>'
      + '<div class="tc-big">ยินดีต้อนรับสู่ <span class="tc-grad">Backoffice Teams</span></div>'
      + '<div class="tc-text">งานของทีมทั้งโครงการ ต้นทุน การลา และงานบริการลูกค้า อยู่ครบในที่เดียว<br>'
      + 'ก่อนเริ่มใช้งาน เราพาไปรู้จักแต่ละเมนูแบบสั้น ๆ กันก่อนนะ</div>'
      + '<div class="tc-chips">' + s.sections.map(function (x, k) {
          return '<span class="tc-chip" style="animation-delay:' + (0.35 + k * 0.08) + 's">' + x.icon
            + window.esc(x.name) + '<b>' + x.n + '</b></span>';
        }).join('') + '</div>'
      + '<div class="tc-meta">แนะนำ ' + total + ' เมนูที่คุณใช้ได้ · ใช้เวลาประมาณ 1 นาที</div>'
      + '<div class="tc-foot">'
      + '<button type="button" class="tc-skip" data-t="skip">ข้ามไปก่อน</button>'
      + '<button type="button" class="tc-cta" data-t="next">พาดูเมนูเลย <i class="ti ti-arrow-right"></i></button>'
      + '</div></div>';
  }

  function _finaleHtml() {
    return '<div class="tc-body tc-fin">'
      + '<div class="tc-rocket">🚀</div>'
      + '<div class="tc-big">ครบทุกเมนูแล้ว พร้อมเริ่มงาน!</div>'
      + '<div class="tc-text">อีก 3 อย่างที่ช่วยให้ทำงานไวขึ้น</div>'
      + '<div class="tc-tips">'
      + '<div><span class="tc-kbd">Ctrl</span>+<span class="tc-kbd">K</span> ถาม AI ค้นข้อมูลได้จากทุกหน้า</div>'
      + '<div><i class="ti ti-bell"></i> กดกระดิ่งมุมขวาบน เปิดรับแจ้งเตือนบนเครื่อง</div>'
      + '<div><i class="ti ti-user-circle"></i> อยากดูคำแนะนำนี้อีก กดชื่อคุณมุมซ้ายล่าง › แนะนำการใช้งาน</div>'
      + '</div>'
      + '<div class="tc-foot">'
      + '<button type="button" class="tc-skip" data-t="prev">ย้อนกลับ</button>'
      + '<button type="button" class="tc-cta" data-t="done">เริ่มใช้งาน <i class="ti ti-check"></i></button>'
      + '</div></div>';
  }

  function _stepHtml(s) {
    var n = _steps.length - 2, pct = Math.round(_idx / n * 100);
    return '<div class="tc-prog"><span style="width:' + pct + '%"></span></div>'
      + '<div class="tc-body">'
      + '<div class="tc-head"><div class="tc-ic">' + s.icon + '</div>'
      + '<div><div class="tc-sec">' + window.esc(s.section || '') + '<span>' + _idx + ' / ' + n + '</span></div>'
      + '<div class="tc-title">' + window.esc(s.title) + '</div></div></div>'
      + '<div class="tc-text">' + window.esc(s.text) + '</div>'
      + '<div class="tc-foot">'
      + '<button type="button" class="tc-skip" data-t="skip">ข้าม</button>'
      + '<div class="tc-nav">'
      + '<button type="button" class="tc-back" data-t="prev" aria-label="ย้อนกลับ"><i class="ti ti-arrow-left"></i></button>'
      + '<button type="button" class="tc-cta sm" data-t="next">ถัดไป <i class="ti ti-arrow-right"></i></button>'
      + '</div></div></div>';
  }

  function _render(s, animate) {
    var e = _ensureEls();
    var kind = s.kind || 'step';
    e.card.innerHTML = kind === 'hero' ? _heroHtml(s) : kind === 'finale' ? _finaleHtml() : _stepHtml(s);

    var target = kind === 'step' && _visible(s.el) ? s.el : null;
    e.block.classList.toggle('blur', !target);  // หน้าต้อนรับ/หน้าจบ → เบลอพื้นหลัง · ขั้นชี้เมนูต้องเห็นเมนูชัด
    if (!target) {
      e.spot.className = 'center';
      e.spot.removeAttribute('style');
      e.card.className = 'center ' + kind;
      e.card.removeAttribute('style');
    } else {
      var r = target.getBoundingClientRect(), pad = 5;
      e.spot.className = '';
      e.spot.style.cssText = 'top:' + (r.top - pad) + 'px;left:' + (r.left - pad) + 'px;width:' + (r.width + pad * 2) + 'px;height:' + (r.height + pad * 2) + 'px;';
      e.card.className = 'step';
      e.card.style.cssText = '';
      var cw = e.card.offsetWidth, ch = e.card.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, gap = 16;
      var left, top, side;
      if (r.right + gap + cw <= vw - 8) {            // ขวาของเป้าหมาย (เมนูใน sidebar)
        left = r.right + gap; top = r.top + r.height / 2 - ch / 2; side = 'left';
      } else if (r.bottom + gap + ch <= vh - 8) {    // ใต้เป้าหมาย (ปุ่มบน topbar)
        left = r.left + r.width / 2 - cw / 2; top = r.bottom + gap; side = 'top';
      } else {                                        // เหนือเป้าหมาย
        left = r.left + r.width / 2 - cw / 2; top = r.top - gap - ch; side = 'bottom';
      }
      left = Math.max(8, Math.min(left, vw - cw - 8));
      top  = Math.max(8, Math.min(top, vh - ch - 8));
      e.card.style.left = left + 'px';
      e.card.style.top  = top + 'px';
      // ลูกศรชี้ไปที่เมนู
      e.card.setAttribute('data-arrow', side);
      if (side === 'left') e.card.style.setProperty('--ax', Math.max(18, Math.min(ch - 18, r.top + r.height / 2 - top)) + 'px');
      else e.card.style.setProperty('--ax', Math.max(18, Math.min(cw - 18, r.left + r.width / 2 - left)) + 'px');
    }
    if (animate) { void e.card.offsetWidth; e.card.classList.add('in'); }  // reflow ก่อน → แอนิเมชันเล่นใหม่ทุกขั้น
    if (kind === 'finale' && animate) _confetti();
    var focus = e.card.querySelector('[data-t="next"],[data-t="done"]');
    if (focus) focus.focus({ preventScroll: true });
  }

  // ── พลุกระดาษตอนจบทัวร์ (canvas เบา ๆ ลบตัวเองเมื่อจบ) ──
  function _confetti() {
    if (_calm()) return;
    var c = document.createElement('canvas'), ctx = c.getContext('2d');
    var W = c.width = window.innerWidth, H = c.height = window.innerHeight;
    c.id = 'tour-confetti';
    document.body.appendChild(c);
    var colors = ['#7c5cfc', '#4361ee', '#f72585', '#06d6a0', '#ffa62b', '#4cc9f0'];
    var ps = [];
    for (var k = 0; k < 160; k++) {
      var fromLeft = k % 2 === 0, a = (fromLeft ? -60 : -120) * Math.PI / 180 + (Math.random() - .5) * .7, v = 9 + Math.random() * 9;
      ps.push({ x: fromLeft ? W * .15 : W * .85, y: H * .75, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, r: Math.random() * 6, vr: (Math.random() - .5) * .4,
        c: colors[k % colors.length] });
    }
    var t0 = performance.now();
    (function frame(t) {
      var life = (t - t0) / 2600;
      ctx.clearRect(0, 0, W, H);
      ps.forEach(function (p) {
        p.vy += 0.28; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - life); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      if (life < 1 && c.isConnected) requestAnimationFrame(frame); else c.remove();
    })(t0);
  }

  function _onKey(ev) {
    if (!_els) return;
    if (ev.key === 'Escape') _end();
    else if (ev.key === 'ArrowRight') _go(_idx + 1);
    else if (ev.key === 'ArrowLeft') _go(_idx - 1);
  }
  function _onResize() { if (_els && _steps[_idx]) _render(_steps[_idx], false); }

  function _end() {
    _markDone();
    if (_els) {
      var els = _els; _els = null;
      els.block.classList.remove('on');
      els.card.classList.add('out');
      els.spot.classList.add('out');
      setTimeout(function () { els.block.remove(); els.spot.remove(); els.card.remove(); }, 220);
    }
    document.removeEventListener('keydown', _onKey, true);
    window.removeEventListener('resize', _onResize);
    if (_isMobile()) window.closeMobSidebar && window.closeMobSidebar();
  }

  window.startTour = function () {
    if (_els) return;
    _steps = _buildSteps();
    _ensureEls();
    document.addEventListener('keydown', _onKey, true);
    window.addEventListener('resize', _onResize);
    _go(0);
  };

  // เรียกหลังเข้าแอป + โหลดข้อมูลเสร็จ — เปิดทัวร์เองเฉพาะผู้ใช้ที่ยังไม่เคยดู/ข้าม
  window.maybeStartTour = function () {
    if (!window.cu || _started === _key() || _isDone()) return;
    _started = _key();
    setTimeout(function () {
      if (!window.cu || document.getElementById('wrap').style.display === 'none') { _started = ''; return; }
      if (document.querySelector('.overlay.on:not(#sys-loader)')) { _started = ''; setTimeout(window.maybeStartTour, 2000); return; }
      window.startTour();
    }, 900);
  };

})();
