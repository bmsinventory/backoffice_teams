/* แบบประเมินหลังอบรม — /training/?page=survey&site=รหัส รพ. (หน้าตาอยู่ใน <template id="trn-page-survey"> ของ training/index.html) */
/* ═══════════════════════════════════════════════
   CONFIG
═══════════════════════════════════════════════ */
// ฐานข้อมูลเดียวกับ Backoffice (ตาราง trn_*) — ค่าจาก ../env-config.js
const _sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const currentSite = new URLSearchParams(location.search).get('site') || ''; // รหัส รพ. ของโครงการ (ลิงก์จากหน้าจัดการโครงการใส่ให้เสมอ)

/* ═══════════════════════════════════════════════
   QUESTION DEFINITIONS
═══════════════════════════════════════════════ */
const SECTIONS = [
  {
    num: 1, title: 'พฤติกรรมบริการ', icon: 'ti-heart-handshake', color: '#2563eb',
    qs: [
      'วิทยากรและทีมงานมีความพร้อมในการให้บริการ',
      'วิทยากรและทีมงานให้บริการด้วยความสุภาพและเป็นกันเอง',
      'วิทยากรและทีมงานมีมนุษยสัมพันธ์ที่ดี',
      'การประสานงานและการอำนวยความสะดวกเป็นไปอย่างเหมาะสม',
      'วิทยากรและทีมงานตอบสนองต่อปัญหาและข้อซักถามได้รวดเร็ว',
      'ทีมงานมีความเอาใจใส่ต่อผู้เข้าอบรมอย่างเหมาะสม',
    ]
  },
  {
    num: 2, title: 'การเตรียมความพร้อมในการอบรม', icon: 'ti-clipboard-check', color: '#0891b2',
    qs: [
      'มีการจัดเตรียมเอกสารประกอบการอบรมอย่างครบถ้วน',
      'คู่มือและเอกสารประกอบการสอนเข้าใจง่าย',
      'การจัดลำดับเนื้อหาและ Flow การสอนมีความชัดเจน',
      'สื่อประกอบการสอน เช่น PowerPoint มีความเหมาะสมและเข้าใจง่าย',
      'ระบบ/อุปกรณ์/โปรแกรมที่ใช้ในการอบรมมีความพร้อมใช้งาน',
      'ตัวอย่างและ Workshop สอดคล้องกับการใช้งานจริง',
      'ระยะเวลาในการอบรมมีความเหมาะสมกับเนื้อหา',
    ]
  },
  {
    num: 3, title: 'ทักษะและเทคนิคการสอน', icon: 'ti-presentation', color: '#7c3aed',
    qs: [
      'วิทยากรมีความรู้และความเข้าใจในระบบเป็นอย่างดี',
      'การอธิบายเนื้อหามีความชัดเจน เข้าใจง่าย',
      'การลำดับเนื้อหาการบรรยายมีความต่อเนื่องเหมาะสม',
      'วิทยากรสามารถยกตัวอย่างประกอบได้เหมาะสม',
      'เปิดโอกาสให้ผู้เรียนซักถามและมีส่วนร่วม',
      'วิทยากรตอบคำถามได้ตรงประเด็นและเข้าใจง่าย',
      'วิทยากรสามารถวิเคราะห์และเสนอแนวทางแก้ไขปัญหาได้ชัดเจน',
      'มีการสรุปประเด็นสำคัญก่อนจบการอบรม',
      'มีแบบฝึกหัดหรือ Workshop ให้ทดลองปฏิบัติจริง',
      'มีทีมงานช่วยสนับสนุนระหว่างการอบรมอย่างเพียงพอ',
    ]
  },
  {
    num: 4, title: 'การมีส่วนร่วมของผู้เรียน', icon: 'ti-users', color: '#059669',
    qs: [
      'ผู้เรียนมีความพร้อมในการเข้ารับการอบรม',
      'ผู้เรียนให้ความร่วมมือในการอบรมเป็นอย่างดี',
      'ผู้เรียนมีส่วนร่วมในการซักถามและแลกเปลี่ยนความคิดเห็น',
      'ผู้เรียนมีความตั้งใจและสนใจในเนื้อหาการอบรม',
      'บรรยากาศในการอบรมเอื้อต่อการเรียนรู้',
    ]
  },
  {
    num: 5, title: 'ผลลัพธ์หลังการอบรม', icon: 'ti-award', color: '#d97706',
    qs: [
      'ผู้เรียนมีความเข้าใจในการใช้งานระบบมากขึ้น',
      'ผู้เรียนสามารถใช้งานระบบได้ถูกต้องมากขึ้น',
      'เนื้อหาการอบรมสามารถนำไปประยุกต์ใช้ในการปฏิบัติงานจริงได้',
      'การอบรมช่วยลดปัญหาในการใช้งานระบบ',
      'ผู้เรียนมีความมั่นใจในการใช้งานระบบหลังการอบรม',
      'การอบรมตอบโจทย์การปฏิบัติงานของหน่วยงาน',
      'ผู้เรียนมีความพร้อมในการใช้งานระบบจริง (Go-Live)',
    ]
  },
  {
    num: 6, title: 'ความพึงพอใจโดยรวม', icon: 'ti-star', color: '#e11d48',
    qs: [
      'ความพึงพอใจโดยรวมต่อการอบรม',
      'ความเหมาะสมของเนื้อหาในการอบรม',
      'ความเหมาะสมของระยะเวลาในการอบรม',
      'ความพึงพอใจต่อวิทยากรและทีมงาน',
      'ความพึงพอใจต่อระบบและ Workshop ที่ใช้ในการอบรม',
    ]
  },
];
const TOTAL_RATING_QS = SECTIONS.reduce((s, sec) => s + sec.qs.length, 0); // 40
const TOTAL_QS = TOTAL_RATING_QS + 1; // +1 for 6.6 yes/no = 41

/* ═══════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════ */
let todaySessions = [];
let categories    = [];
let locations     = [];
let selectedSessId = null;
let ynValue        = null;
let answers        = {};

/* ═══════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */
const _parseDate = d => {
  if (!d) return new Date(NaN);
  const [y, ...rest] = String(d).split('-');
  const yr = parseInt(y);
  return new Date([yr > 2500 ? yr - 543 : yr, ...rest].join('-'));
};

function isToday(dateStr) {
  const d = _parseDate(dateStr);
  const t = new Date();
  return d.getFullYear() === t.getFullYear()
      && d.getMonth()    === t.getMonth()
      && d.getDate()     === t.getDate();
}

const fmtDate = d => {
  if (!d) return '—';
  return _parseDate(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
};

let _toastTimer = null;
function showToast(msg, type = 'info') {
  const el = document.getElementById('sv-toast');
  const icon = type === 'danger' ? 'alert-circle' : 'info-circle';
  el.innerHTML = `<i class="ti ti-${icon}"></i>${msg}`;
  el.className = `sv-toast ${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3800);
}

function showScreen(id) {
  document.querySelectorAll('.sv-screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById('sticky-bar').classList.toggle('show', id === 'sc-form');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ═══════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════ */
async function init() {
  document.getElementById('date-badge').textContent = new Date().toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  });

  try {
    const [cR, sR, lR, stR] = await Promise.all([
      _sb.from('trn_categories').select('id,name').order('id'), // หลักสูตรอบรมเป็นของกลาง
      _sb.from('trn_sessions').select('id,cat_id,name,date,time_start,time_end,venue,trainer').eq('site', currentSite).order('date,time_start'),
      _sb.from('trn_locations').select('*').order('id'),
      _sb.from('staff').select('*'), // วิทยากร = พนักงาน (รอบอบรมเก็บรหัสพนักงาน)
    ]);
    if (cR.error || sR.error) throw new Error('db-error');

    categories    = (cR.data || []);
    locations     = (lR.data || []);
    const staffName = Object.fromEntries((stR.data || []).map(d => [String(d.staff_id || d.id), d.full_name || d.name || '']));
    const allSess = (sR.data || []).map(r => ({
      id: r.id, catId: r.cat_id, name: r.name, date: r.date,
      timeStart: r.time_start, timeEnd: r.time_end,
      venue: r.venue || '', trainer: staffName[r.trainer] || r.trainer || ''
    }));
    todaySessions = allSess.filter(s => isToday(s.date));

    const loc = locations.find(l => l.code === currentSite);
    document.getElementById('site-badge').textContent = loc ? loc.name : currentSite;

    populateCatSelect();
    showScreen('sc-select');
  } catch (e) {
    document.getElementById('site-badge').textContent = currentSite;
    populateCatSelect();
    showScreen('sc-select');
    showToast('โหลดข้อมูลไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ', 'danger');
  }
}

/* ═══════════════════════════════════════════════
   SESSION SELECTION
═══════════════════════════════════════════════ */
function populateCatSelect() {
  const catSel = document.getElementById('sel-cat');

  if (todaySessions.length === 0) {
    document.getElementById('no-sess-msg').style.display = 'block';
    document.getElementById('sess-form').style.display   = 'none';
    return;
  }

  const catIds   = [...new Set(todaySessions.map(s => s.catId))];
  const todayCats = categories.filter(c => catIds.includes(c.id));

  catSel.innerHTML = '<option value="">— กรุณาเลือกหลักสูตรอบรม —</option>';
  todayCats.forEach(c => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.name;
    catSel.appendChild(o);
  });

  if (todayCats.length === 1) {
    catSel.value = todayCats[0].id;
    onCatChange();
  }
}

function onCatChange() {
  const catId   = parseInt(document.getElementById('sel-cat').value);
  const sessSel = document.getElementById('sel-sess');
  const btnStart = document.getElementById('btn-start');
  document.getElementById('sess-info').classList.remove('show');
  selectedSessId = null;
  btnStart.disabled = true;

  if (!catId) {
    sessSel.innerHTML = '<option value="">— เลือกหลักสูตรก่อน —</option>';
    sessSel.disabled = true;
    return;
  }

  const catSess = todaySessions.filter(s => s.catId === catId);
  sessSel.innerHTML = '<option value="">— กรุณาเลือกรอบ —</option>';
  catSess.forEach(s => {
    const o = document.createElement('option');
    o.value = s.id;
    const trPart = s.trainer ? ` | ${s.trainer}` : '';
    o.textContent = `${s.timeStart}–${s.timeEnd} น.${trPart} : ${s.name}`;
    sessSel.appendChild(o);
  });
  sessSel.disabled = false;

  if (catSess.length === 1) {
    sessSel.value = catSess[0].id;
    onSessChange();
  }
}

function onSessChange() {
  const sessId  = parseInt(document.getElementById('sel-sess').value);
  const info    = document.getElementById('sess-info');
  const btnStart = document.getElementById('btn-start');

  if (!sessId) {
    info.classList.remove('show');
    selectedSessId = null;
    btnStart.disabled = true;
    return;
  }

  selectedSessId = sessId;
  const s = todaySessions.find(x => x.id === sessId);
  if (s) {
    document.getElementById('info-trainer').textContent = s.trainer || '—';
    document.getElementById('info-date').textContent    = fmtDate(s.date);
    document.getElementById('info-time').textContent    = `${s.timeStart} – ${s.timeEnd} น.`;
    document.getElementById('info-venue').textContent   = s.venue || '—';
    info.classList.add('show');
  }
  btnStart.disabled = false;
}

/* ═══════════════════════════════════════════════
   BUILD QUESTIONNAIRE
═══════════════════════════════════════════════ */
const RATE_LABELS = {5:'มากที่สุด', 4:'มาก', 3:'ปานกลาง', 2:'น้อย', 1:'น้อยที่สุด'};

function buildForm() {
  answers = {}; ynValue = null;
  document.getElementById('yn-yes').className = 'sv-yn-btn';
  document.getElementById('yn-no').className  = 'sv-yn-btn';
  document.getElementById('sv-comments').value = '';

  const wrap = document.getElementById('questions-wrap');
  wrap.innerHTML = '';

  SECTIONS.forEach(sec => {
    // Section header strip
    const hd = document.createElement('div');
    hd.className = 'sv-section-hd';
    hd.style.background = sec.color;
    hd.innerHTML = `
      <div class="sv-section-hd-num">${sec.num}</div>
      <div style="flex:1;">
        <div class="sv-section-hd-title"><i class="ti ${sec.icon}"></i>&ensp;${sec.title}</div>
        <div class="sv-section-hd-count">${sec.qs.length} หัวข้อ</div>
      </div>`;

    // Card for questions (joins header strip — no top border-radius)
    const card = document.createElement('div');
    card.className = 'sv-card sv-section-card';
    card.style.borderRadius = '0 0 var(--radius) var(--radius)';
    card.style.borderTopColor = 'transparent';

    sec.qs.forEach((qText, idx) => {
      const qKey = `q${sec.num}_${idx + 1}`;
      answers[qKey] = 5; // pre-select 5 for every question

      const row = document.createElement('div');
      row.className = 'sv-q-row';
      row.id = `row-${qKey}`;
      row.innerHTML = `
        <div class="sv-q-top">
          <div class="sv-q-num">${sec.num}.${idx + 1}</div>
          <div class="sv-q-text">${qText}</div>
        </div>
        <div class="sv-rating-group" id="rating-${qKey}">
          ${[5,4,3,2,1].map(v =>
            `<button class="sv-rate-btn sv-rate-${v}${v === 5 ? ' selected' : ''}"
              onclick="setRating('${qKey}',${v},this)">
              <span class="sv-rate-num">${v}</span>
              <span class="sv-rate-label">${RATE_LABELS[v]}</span>
            </button>`
          ).join('')}
        </div>`;
      card.appendChild(row);
    });

    wrap.appendChild(hd);
    wrap.appendChild(card);
  });

  // Initialize progress — all 40 rating questions pre-selected at 5
  updateProgress();
}

function setRating(key, value, btn) {
  answers[key] = value;
  document.querySelectorAll(`#rating-${key} .sv-rate-btn`).forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById(`row-${key}`).classList.remove('error');
  updateProgress();
}

function setYN(val) {
  ynValue = val;
  document.getElementById('yn-yes').className = `sv-yn-btn${val === true  ? ' yes-sel' : ''}`;
  document.getElementById('yn-no').className  = `sv-yn-btn${val === false ? ' no-sel'  : ''}`;
  updateProgress();
}

function updateProgress() {
  const answered = Object.keys(answers).length + (ynValue !== null ? 1 : 0);
  const pct = Math.round((answered / TOTAL_QS) * 100);
  document.getElementById('prog-bar').style.width = pct + '%';
  document.getElementById('prog-label').textContent = `ตอบแล้ว ${answered} / ${TOTAL_QS} ข้อ`;
}

/* ═══════════════════════════════════════════════
   START SURVEY
═══════════════════════════════════════════════ */
function startSurvey() {
  if (!selectedSessId) return;
  const sess = todaySessions.find(s => s.id === selectedSessId);
  const cat  = categories.find(c => c.id === sess?.catId);

  document.getElementById('form-sess-name').textContent =
    (cat ? `${cat.name} — ` : '') + (sess?.name || '—');
  document.getElementById('form-sess-sub').textContent =
    [sess?.trainer ? `วิทยากร: ${sess.trainer}` : '', `${sess?.timeStart}–${sess?.timeEnd} น.`, sess?.venue].filter(Boolean).join('  |  ');

  buildForm();
  showScreen('sc-form');
}

/* ═══════════════════════════════════════════════
   SUBMIT
═══════════════════════════════════════════════ */
async function submitSurvey() {
  // Validate all rating questions
  const missing = [];
  SECTIONS.forEach(sec => {
    sec.qs.forEach((_, idx) => {
      const key = `q${sec.num}_${idx + 1}`;
      if (!answers[key]) missing.push(key);
    });
  });

  if (missing.length > 0) {
    missing.forEach(key => {
      const row = document.getElementById(`row-${key}`);
      if (row) { row.classList.add('error'); setTimeout(() => row.classList.remove('error'), 1500); }
    });
    document.getElementById(`row-${missing[0]}`).scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast(`กรุณาตอบให้ครบทุกข้อ (ยังขาดอีก ${missing.length} ข้อ)`, 'danger');
    return;
  }

  if (ynValue === null) {
    document.getElementById('yn-row').scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('กรุณาตอบข้อ 6.6 ด้วย', 'danger');
    return;
  }

  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin .8s linear infinite;"></i>กำลังบันทึก...';

  const payload = {
    site: currentSite,
    session_id: selectedSessId,
    ...answers,
    q6_6: ynValue,
    comments: document.getElementById('sv-comments').value.trim() || null,
  };

  try {
    const { error } = await _sb.from('trn_survey_responses').insert(payload);
    if (error) throw error;
    showSuccessScreen();
  } catch (e) {
    console.error(e);
    showToast('บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'danger');
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-send"></i>ส่งแบบประเมิน';
  }
}

/* ═══════════════════════════════════════════════
   SUCCESS SCREEN
═══════════════════════════════════════════════ */
function showSuccessScreen() {
  const vals = Object.values(answers);
  const overall = vals.reduce((a, b) => a + b, 0) / vals.length;

  const starCount = Math.round(overall);
  const stars = '★'.repeat(starCount) + '☆'.repeat(5 - starCount);

  const overallColor = overall >= 4.5 ? '#22c55e' : overall >= 3.5 ? '#84cc16' : overall >= 2.5 ? '#eab308' : '#ef4444';

  document.getElementById('score-overall').innerHTML = `
    <div style="font-size:13px;opacity:.8;margin-bottom:8px;">คะแนนเฉลี่ยรวมทุกด้าน</div>
    <div class="sv-score-overall-num" style="color:${overallColor};">${overall.toFixed(2)}</div>
    <div class="sv-score-stars" style="color:${overallColor};">${stars}</div>
    <div class="sv-score-overall-label">เต็ม 5.00</div>`;

  const secScores = SECTIONS.map(sec => {
    const secVals = sec.qs.map((_, i) => answers[`q${sec.num}_${i + 1}`] || 0);
    const avg = secVals.reduce((a, b) => a + b, 0) / secVals.length;
    return { title: sec.title, avg, color: sec.color };
  });

  document.getElementById('score-grid').innerHTML = secScores.map(s => `
    <div class="sv-score-item">
      <div class="sv-score-num" style="color:${s.color};">${s.avg.toFixed(2)}</div>
      <div class="sv-score-lbl">${s.title.length > 14 ? s.title.slice(0, 13) + '…' : s.title}</div>
    </div>`).join('');

  showScreen('sc-success');
}

/* ═══════════════════════════════════════════════
   RESET
═══════════════════════════════════════════════ */
function resetSurvey() {
  selectedSessId = null; ynValue = null; answers = {};
  document.getElementById('sel-cat').value  = '';
  document.getElementById('sel-sess').value = '';
  document.getElementById('sel-sess').disabled = true;
  document.getElementById('sess-info').classList.remove('show');
  document.getElementById('btn-start').disabled = true;
  document.getElementById('btn-submit').disabled = false;
  document.getElementById('btn-submit').innerHTML = '<i class="ti ti-send"></i>ส่งแบบประเมิน';
  showScreen('sc-select');
}

/* ═══════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════ */
init();
