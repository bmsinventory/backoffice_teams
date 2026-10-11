/**
 * tts.service.js — AI อ่านออกเสียงภาษาไทย (VoxCPM TTS)
 * เรียกผ่าน backend เท่านั้น: /api/tts (nginx ใน frontend container → https://vox-cpm.bmscloud.in.th/v1/audio/speech)
 *
 * window.TTS.play(parts, opts) — อ่านข้อความทีละท่อน ตามลำดับ
 *   parts : [{ text, data? }]  data = อะไรก็ได้ที่ส่งกลับใน onPart (เช่น element ที่ต้องไฮไลต์)
 *   opts  : { voice, gap (วินาทีเว้นระหว่างท่อน), polite (ต่อ "ค่ะ" ท้ายท่อนที่ไม่มีคำลงท้าย — กันคำสุดท้ายขาด),
 *             onPart(part, i), onEnd(), onError(err),
 *             onWait() — เบราว์เซอร์ยังไม่ให้เล่นเสียง รอผู้ใช้แตะหน้าเว็บก่อน }
 * window.TTS.stop() — หยุดอ่าน + ยกเลิกคำขอที่ค้าง
 * window.TTS.preload(parts) — ขอเสียงเตรียมไว้ก่อน (ไม่เล่น)
 * window.TTS.num(n) / TTS.date(iso) — แปลงตัวเลข/วันที่เป็นคำอ่านภาษาไทย (ใช้ตอนประกอบประโยคให้พูดเป็นธรรมชาติ)
 * window.TTS.expand(text) — แปลงวันที่ย่อ/ยอดเงินมีจุลภาค/ตัวย่อ (รพ. ชม. %) เป็นคำอ่าน (play ทำให้อยู่แล้ว ใช้เมื่อต้องแปลงก่อนเอง)
 *
 * เสียงแต่ละท่อนจากบริการมีช่วงเงียบหัว ~0.3–0.5 วิ ท้าย ~0.2 วิ — เล่นต่อกันตรง ๆ จะเว้นนานผิดธรรมชาติ
 * จึงถอดรหัสด้วย Web Audio → ตัดช่วงเงียบหัว/ท้าย → ต่อคิวเล่นแบบไร้รอยต่อ เว้นระหว่างท่อนเท่ากับ gap
 * ขอเสียงท่อนถัดไปล่วงหน้าระหว่างเล่น · เสียงที่สร้างแล้วจำไว้ เปิดอ่านซ้ำได้ทันที
 */
(function () {

  var ENDPOINT = '/api/tts';
  var VOICE = 'female';
  var PREFETCH = 3;       // จำนวนท่อนที่ขอล่วงหน้า
  var GAP = 0.35;         // วินาทีเว้นระหว่างท่อน (ไม่รวมหางเสียงที่เผื่อไว้ท้ายท่อน)
  var SILENCE = 0.015;    // ระดับเสียงที่ถือว่าเงียบ — ช่วงหัว (0–1)
  var TAIL_SILENCE = 0.004; // ช่วงท้ายใช้เกณฑ์ต่ำกว่า — ท้ายคำ/ตัวสะกด/"ค่ะ" ค่อย ๆ เบาลง เกณฑ์เดียวกับหัวจะโดนตัดขาด
  var PAD = 0.04;         // เผื่อหัวหลังตัดเงียบ ไม่ให้พยางค์แรกขาด
  var TAIL_PAD = 0.15;    // เผื่อท้ายหลังตัดเงียบ ให้หางเสียงจบเอง
  var FADE = 0.008;       // ค่อย ๆ เพิ่ม/ลดเสียงหัวท้ายท่อน กันเสียงแป๊ะตรงรอยตัด
  var CUT_RMS = 0.04;     // ระดับเสียง 20ms สุดท้ายที่ถือว่า "ขาดกลางคำ" (จบเองค่อย ๆ เบาลง < 0.01 · ขาด 0.1–0.5)
  var CUT_TAIL = 0.03;    // วินาที — มีช่วงเงียบท้ายไฟล์ยาวกว่านี้ = โมเดลหยุดเอง ไม่ถือว่าขาด
  var CUT_RETRY = 2;      // ท้ายขาด → ขอเสียงใหม่สูงสุดกี่ครั้ง
  var POLITE_END = /(ค่ะ|คะ|ครับ|นะ|จ้ะ|จ้า|ด้วย)$/; // opts.polite: ลงท้ายด้วยคำเหล่านี้แล้ว ไม่ต้องต่อ "ค่ะ"

  var _ctx = null;
  var _cache = {};        // voice|text → Promise<AudioBuffer>
  var _run = null;        // รอบที่กำลังอ่าน { aborts, sources, timers, stopped }

  // ── ปรับข้อความให้อ่านเป็นธรรมชาติ: ตัดวงเล็บ/สัญลักษณ์ · เลขยาว (รหัส เช่น ISO 27001) อ่านทีละตัว · เลขเวอร์ชัน 1.008 → หนึ่ง จุด ศูนย์ศูนย์แปด ──
  var DIGIT = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  function _digits(s) { return s.split('').map(function (d) { return DIGIT[+d]; }).join(''); }

  // ── ตัวเลข → คำอ่านภาษาไทย (12 → สิบสอง, 21 → ยี่สิบเอ็ด, 15000 → หนึ่งหมื่นห้าพัน, 7.5 → เจ็ดจุดห้า) ──
  // ใช้กับจำนวน/ยอดเงิน/วันที่ที่ต้องการให้อ่านเป็นคำ — ส่งเลขดิบที่ยาว 4 หลักขึ้นไป _clean จะอ่านทีละตัว (แบบรหัส)
  var PLACE = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
  function _under1m(x) {
    var s = String(x), out = '';
    for (var i = 0; i < s.length; i++) {
      var d = +s[i], pos = s.length - i - 1;
      if (!d) continue;
      if (pos === 1) out += d === 1 ? 'สิบ' : d === 2 ? 'ยี่สิบ' : DIGIT[d] + 'สิบ';
      else if (pos === 0 && d === 1 && s.length > 1) out += 'เอ็ด';
      else out += DIGIT[d] + PLACE[pos];
    }
    return out;
  }
  function num(n) {
    n = Number(n);
    if (!isFinite(n)) return '';
    var neg = n < 0 ? 'ลบ' : '';
    n = Math.abs(n);
    var int = Math.floor(n), dec = String(Math.round((n - int) * 100) / 100).split('.')[1];
    var words = '';
    if (!int) words = 'ศูนย์';
    else {
      var m = Math.floor(int / 1e6), r = int % 1e6;
      words = (m ? num(m) + 'ล้าน' : '') + (r ? _under1m(r) : '');
    }
    return neg + words + (dec ? 'จุด' + _digits(dec) : '');
  }
  // ตัวย่อที่อ่านออกเสียงผิด → คำเต็ม · เดือนย่อ "10 ต.ค. 69" → "วันที่ สิบ ตุลาคม สองพันห้าร้อยหกสิบเก้า"
  var ABBR_MONTH = { 'ม.ค.': 'มกราคม', 'ก.พ.': 'กุมภาพันธ์', 'มี.ค.': 'มีนาคม', 'เม.ย.': 'เมษายน', 'พ.ค.': 'พฤษภาคม', 'มิ.ย.': 'มิถุนายน',
    'ก.ค.': 'กรกฎาคม', 'ส.ค.': 'สิงหาคม', 'ก.ย.': 'กันยายน', 'ต.ค.': 'ตุลาคม', 'พ.ย.': 'พฤศจิกายน', 'ธ.ค.': 'ธันวาคม' };
  var MON_KEYS = Object.keys(ABBR_MONTH);
  var DATE_SRC = '(\\d{1,2})\\s*(' + MON_KEYS.map(function (k) { return k.replace(/\./g, '\\.'); }).join('|') + ')\\s*(\\d{4}|\\d{2}(?!\\d))?';
  var MONTH_RE = new RegExp('(?:วันที่\\s*)?' + DATE_SRC, 'g');
  // ช่วงวันที่ "5 ต.ค. 2569 – 6 ต.ค. 2569" → "วันที่ ห้า และ หก ตุลาคม …" (ติดกัน = และ · ห่างกัน = ถึง · ต่างเดือน/ปี อ่านเต็มแค่ส่วนที่ต่าง)
  var RANGE_RE = new RegExp('(?:วันที่\\s*)?' + DATE_SRC + '\\s*(?:–|—|-|ถึง)\\s*(?:วันที่\\s*)?' + DATE_SRC, 'g');
  function _yr(y) { return y ? (+y < 100 ? 2500 + +y : +y) : 0; }
  function _range(m, d1, m1, y1, d2, m2, y2) {
    y1 = _yr(y1); y2 = _yr(y2);
    if (!y1) y1 = y2;
    var Y = function (y) { return y ? ' ' + num(y) : ''; };
    if (y1 !== y2) return 'วันที่ ' + num(+d1) + ' ' + ABBR_MONTH[m1] + Y(y1) + ' ถึง ' + num(+d2) + ' ' + ABBR_MONTH[m2] + Y(y2) + ' ';
    if (m1 !== m2) return 'วันที่ ' + num(+d1) + ' ' + ABBR_MONTH[m1] + ' ถึง ' + num(+d2) + ' ' + ABBR_MONTH[m2] + Y(y2) + ' ';
    if (+d1 === +d2) return 'วันที่ ' + num(+d1) + ' ' + ABBR_MONTH[m1] + Y(y2) + ' ';
    return 'วันที่ ' + num(+d1) + (+d2 === +d1 + 1 ? ' และ ' : ' ถึง ') + num(+d2) + ' ' + ABBR_MONTH[m1] + Y(y2) + ' ';
  }
  // ISO / 13/10/2569 → "13 ต.ค. 2569" ก่อน แล้วอ่านทุกแบบด้วยกฎเดียวกัน (รวมถึงช่วงวันที่)
  function _short(d, mo, y) { return +d + ' ' + MON_KEYS[+mo - 1] + ' ' + (+y < 2400 ? +y + 543 : +y); }
  var ABBR = [[/ร\.\s?(\d+)/g, 'รัชกาลที่ $1'], [/รพ\.?สต\./g, 'โรงพยาบาลส่งเสริมสุขภาพตำบล'], [/รพ\./g, 'โรงพยาบาล'], [/ชม\./g, 'ชั่วโมง'], [/ฯลฯ/g, 'และอื่น ๆ'],
    [/(\d)\s*%/g, '$1 เปอร์เซ็นต์'], [/(\d)\s*[–-]\s*(\d)/g, '$1 ถึง $2']];
  function _expand(text) {
    var s = String(text || '')
      .replace(/\p{Extended_Pictographic}|️/gu, ' ') // อีโมจิ
      // วันที่ทุกแบบ — กลืนคำ "วันที่" ที่นำหน้าอยู่แล้ว ไม่ให้อ่านซ้ำ "วันที่ วันที่ …"
      .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, function (m, y, mo, d) { return _short(d, mo, y); })
      .replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, function (m, d, mo, y) { return _short(d, mo, y); }) // 13/10/2569 (พ.ศ. หรือ ค.ศ.)
      .replace(RANGE_RE, _range)
      .replace(MONTH_RE, function (m, d, mon, y) {
        var yr = _yr(y);
        return 'วันที่ ' + num(+d) + ' ' + ABBR_MONTH[mon] + (yr ? ' ' + num(yr) : '') + ' ';
      })
      .replace(/\d{1,3}(?:,\d{3})+(?:\.\d+)?/g, function (m) { return num(+m.replace(/,/g, '')); }); // ยอดเงิน 12,500 → หนึ่งหมื่นสองพันห้าร้อย
    ABBR.forEach(function (a) { s = s.replace(a[0], a[1]); });
    return s;
  }

  function _clean(text) {
    return _expand(text)
      .replace(/\b[vV](?=\d)/g, '')
      .replace(/(\d+)\.(\d+)(?:\.(\d+))?/g, function (m, a, b, c) { return _digits(a) + ' จุด ' + _digits(b) + (c ? ' จุด ' + _digits(c) : ''); })
      .replace(/\d{4,}/g, _digits)
      .replace(/[()[\]{}"“”'‘’«»*#_|•·›→—–:;,]/g, ' ') // เครื่องหมายวรรคตอนทำให้เสียงหยุดกลางประโยค ~0.3 วิ
      .replace(/\s*[\/+&]\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function _audioCtx() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    return _ctx;
  }

  // ตัดช่วงเงียบหัว/ท้ายของเสียง (ท้ายตัดน้อยกว่าหัว ไม่ให้ท้ายคำขาด) + เฟดหัวท้ายสั้น ๆ
  function _trim(buf) {
    var sr = buf.sampleRate, ch = buf.getChannelData(0), n = ch.length, s = 0, e = n - 1;
    while (s < n && Math.abs(ch[s]) < SILENCE) s++;
    while (e > s && Math.abs(ch[e]) < TAIL_SILENCE) e--;
    s = Math.max(0, s - Math.round(PAD * sr)); e = Math.min(n - 1, e + Math.round(TAIL_PAD * sr));
    var len = Math.max(1, e - s + 1), fade = Math.min(Math.round(FADE * sr), Math.floor(len / 2));
    var out = _ctx.createBuffer(buf.numberOfChannels, len, sr);
    for (var c = 0; c < buf.numberOfChannels; c++) {
      var d = buf.getChannelData(c).slice(s, s + len);
      for (var k = 0; k < fade; k++) { var g = k / fade; d[k] *= g; d[len - 1 - k] *= g; }
      out.copyToChannel(d, c);
    }
    return out;
  }

  // บริการสร้างเสียงทีละก้อน 0.16 วิ แล้วบางครั้งหยุดเร็วไปหนึ่งก้อน (สุ่ม) → พยางค์สุดท้ายขาดกลางเสียง เช่น "ชำนาญการพิเศษ"
  // จบเอง = มีช่วงเงียบต่อท้าย (≥ 100ms) · ขาด = ไฟล์จบทั้งที่ยังมีเสียงดังอยู่ (ตัวสะกดแม่กดจบห้วนได้ แต่ยังมีช่วงเงียบตามหลัง)
  // ขอเป็น wav — mp3 เติมเงียบท้ายไฟล์เอง แยกสองแบบนี้ไม่ออก
  function _cutOff(buf) {
    var sr = buf.sampleRate, ch = buf.getChannelData(0), n = ch.length, e = n - 1, w = Math.round(0.02 * sr), sum = 0;
    while (e > 0 && Math.abs(ch[e]) < TAIL_SILENCE) e--;
    if (n - 1 - e > CUT_TAIL * sr) return false;
    for (var i = Math.max(0, e - w); i <= e; i++) sum += ch[i] * ch[i];
    return Math.sqrt(sum / (w + 1)) > CUT_RMS;
  }

  function _fetchAudio(text, voice, run) {
    var key = voice + '|' + text;
    if (_cache[key]) return _cache[key];
    var ctl = new AbortController();
    run.aborts.push(ctl);
    function attempt(left) {
      return fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: text, voice: voice, response_format: 'wav' }),
        signal: ctl.signal,
      }).then(function (res) {
        var ct = res.headers.get('content-type') || '';
        if (res.status === 429) throw new Error('มีคำขออ่านออกเสียงถี่เกินไป รอสักครู่แล้วลองใหม่');
        if (!res.ok || ct.indexOf('audio') < 0) throw new Error('เชื่อมต่อบริการอ่านออกเสียงไม่ได้ ลองใหม่อีกครั้ง');
        return res.arrayBuffer();
      }).then(function (ab) {
        return new Promise(function (ok, fail) { _ctx.decodeAudioData(ab, ok, fail); });
      }).then(function (buf) {
        // ท้ายขาด → ขอใหม่ (ขอซ้ำไม่ได้/โดนจำกัดความถี่ = ใช้เสียงเดิม)
        return left > 0 && _cutOff(buf) ? attempt(left - 1).catch(function (err) {
          if (err && err.name === 'AbortError') throw err;
          return buf;
        }) : buf;
      });
    }
    var p = attempt(CUT_RETRY).then(_trim);
    _cache[key] = p;
    p.catch(function () { delete _cache[key]; });
    return p;
  }

  function stop() {
    if (!_run) return;
    _run.stopped = true;
    _run.aborts.forEach(function (c) { c.abort(); });
    _run.timers.forEach(clearTimeout);
    _run.sources.forEach(function (s) { try { s.onended = null; s.stop(); } catch (e) {} });
    _run = null;
  }

  function play(parts, opts) {
    stop();
    opts = opts || {};
    var voice = opts.voice || VOICE;
    var gap = opts.gap != null ? opts.gap : GAP;
    var ctx = _audioCtx();
    var run = _run = { aborts: [], sources: [], timers: [], stopped: false };
    var list = parts.map(function (p) { return { text: _clean(p.text), data: p.data, src: p }; })
      .filter(function (p) { return p.text; });
    // polite: ท่อนที่ไม่มีคำลงท้าย → ต่อ "ค่ะ" · บริการชอบหยุดก่อนพยางค์สุดท้ายจบ (เช่น "ชำนาญการพิเศษ" ขาด)
    // ถ้าคำสุดท้ายเป็น "ค่ะ" ส่วนที่โดนตัดจะเป็นแค่หางเสียงของ "ค่ะ" — ทดสอบแล้วไม่ขาดเลย และความยาวเสียงคงที่
    // ท่อนที่ไม่ต้องการ (เช่น ชื่อคน) ส่ง { noPolite: true } มา
    if (opts.polite) list.forEach(function (p) { if (!p.src.noPolite && !POLITE_END.test(p.text)) p.text += 'ค่ะ'; });
    var at = 0; // เวลา (ctx) ที่ท่อนถัดไปจะเริ่ม

    function next(i) {
      if (run.stopped || i >= list.length) return;
      for (var k = i; k <= Math.min(i + PREFETCH, list.length - 1); k++) _fetchAudio(list[k].text, voice, run);
      _fetchAudio(list[i].text, voice, run).then(function (buf) {
        if (run.stopped) return;
        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        at = Math.max(at, ctx.currentTime + 0.05);
        src.start(at);
        run.sources.push(src);
        run.timers.push(setTimeout(function () {
          if (!run.stopped) opts.onPart && opts.onPart(list[i].src, i);
        }, Math.max(0, (at - ctx.currentTime) * 1000)));
        at += buf.duration + gap;
        if (i === list.length - 1) src.onended = function () {
          if (run.stopped) return;
          _run = null;
          opts.onEnd && opts.onEnd();
        };
        next(i + 1);
      }).catch(function (err) {
        if (run.stopped || (err && err.name === 'AbortError')) return;
        stop();
        opts.onError && opts.onError(err);
      });
    }
    if (!list.length) return opts.onEnd && opts.onEnd();
    // เบราว์เซอร์ไม่ให้เล่นเสียงเองจนกว่าผู้ใช้จะแตะหน้าเว็บ (เช่น เปิดแอปมาโดยยังไม่ได้คลิกอะไร)
    // → ขอเสียงรอไว้ก่อน แล้วเริ่มอ่านทันทีที่ผู้ใช้แตะ/กดปุ่มใดก็ได้ (opts.onWait ให้หน้าจอบอกผู้ใช้)
    var started = false;
    function start() { if (!started && !run.stopped) { started = true; next(0); } }
    ctx.resume().then(start);
    if (ctx.state === 'running') return start();
    for (var k = 0; k <= Math.min(PREFETCH, list.length - 1); k++) _fetchAudio(list[k].text, voice, run);
    run.timers.push(setTimeout(function () {
      if (started || run.stopped) return;
      opts.onWait && opts.onWait();
      function unlock() {
        document.removeEventListener('pointerdown', unlock, true);
        document.removeEventListener('keydown', unlock, true);
        if (!run.stopped) ctx.resume().then(start);
      }
      document.addEventListener('pointerdown', unlock, true);
      document.addEventListener('keydown', unlock, true);
    }, 300));
  }

  // ขอเสียงเตรียมไว้ล่วงหน้า (เช่น ขั้นถัดไปของทัวร์) — กด play ทีหลังจะเล่นได้ทันที
  function preload(parts) {
    _audioCtx();
    var bg = { aborts: [] };
    (parts || []).forEach(function (p) {
      var t = _clean(p.text);
      if (t) _fetchAudio(t, VOICE, bg).catch(function () {});
    });
  }

  // วันที่ ISO → "10 ตุลาคม" แบบคำอ่าน (ปีเดียวกับปัจจุบันไม่ต้องอ่านปี)
  var MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  function date(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    var y = +m[1];
    return 'วันที่ ' + num(+m[3]) + ' ' + MONTH[+m[2] - 1] + (y !== new Date().getFullYear() ? ' ' + num(y + 543) : '');
  }

  window.TTS = { play: play, stop: stop, preload: preload, num: num, date: date, expand: _expand };

})();
