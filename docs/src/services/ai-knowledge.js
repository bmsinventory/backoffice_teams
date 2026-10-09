/**
 * ai-knowledge.js — ค้นคลังความรู้ให้ AI ทุกจุด (ไฟล์เดียว ใช้ทั้งหน้าเว็บและ push-worker)
 *
 * คลัง = ผลของ RPC ai_knowledge_corpus() (db-schema.sql): Ticket ทุกใบ + วิธีแก้/คำตอบทีม · ปัญหาทุกโครงการติดตั้ง
 *        · ข้อความตอบกลับของผู้ช่วยทีม · ปัญหาที่พบซ้ำ
 * ใช้โดย: AI ตอบอัตโนมัติ (push-worker), AI ช่วยวิเคราะห์/ร่างข้อความตอบ (Helpdesk), AI แนะนำปัญหา (Impl Tracker)
 *
 * ผลค้น 2 กลุ่ม: knowledge = เรื่องคล้ายที่มีวิธีแก้/คำตอบแล้ว · related = เคยพบอาการคล้ายกันแต่ยังไม่มีวิธีแก้
 * (คลังไม่มีคำตอบตรง → related มากขึ้น ให้ AI รู้ว่าอาการนี้เคยเกิดและสาเหตุที่เป็นไปได้)
 * นอกจากคลัง: hospitalText = ข้อมูลของ รพ. ผู้แจ้ง (RPC ai_hospital_context — ระบบที่ใช้ โครงการ เรื่องที่เคยแจ้ง ปัญหาค้าง)
 * worker โหลดไฟล์นี้ด้วย import (Dockerfile คัดลอกไปไว้ข้าง index.js) — ห้ามใช้ DOM นอกส่วน "หน้าเว็บ" ด้านล่าง
 */
(function (root) {
  'use strict';

  var MIN_SCORE = 0.10; // วัดจากข้อมูลจริง: อันดับ 20 (สุ่ม) ≈ 0.08 · อันดับ 1 ≈ 0.18

  var STATUS_TH = {
    new: 'ใหม่', triage: 'คัดกรอง', assigned: 'มอบหมายแล้ว', in_progress: 'กำลังดำเนินการ', pending_user: 'รอผู้แจ้ง',
    resolved: 'แก้แล้ว', closed: 'ปิดแล้ว', reopened: 'เปิดใหม่', open: 'ยังไม่แก้',
    analyzing: 'กำลังวิเคราะห์', planned: 'วางแผนแล้ว', monitoring: 'ติดตามผล', done: 'แก้ถาวรแล้ว',
  };

  // เซตตัวอักษร 2–3 ตัวติดกัน (ภาษาไทยไม่เว้นวรรค ตัดคำด้วยช่องว่างไม่ได้)
  function grams(s) {
    var t = String(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
    var out = new Set();
    for (var i = 0; i < t.length - 1; i++) { out.add(t.slice(i, i + 2)); if (i < t.length - 2) out.add(t.slice(i, i + 3)); }
    return out;
  }
  // cosine ถ่วงน้ำหนัก IDF — ชิ้นที่พบแทบทุกเรื่อง (แก้ไข สินค้า คลัง) มีน้ำหนักน้อย ชิ้นเฉพาะ (ใบจ่าย ปริ้น ยืนยัน) มีน้ำหนักมาก
  function wsim(A, B, idf, normA, normB) {
    if (!normA || !normB) return 0;
    var dot = 0, small = A.size <= B.size ? A : B, big = small === A ? B : A;
    small.forEach(function (g) { if (big.has(g)) { var w = idf.get(g) || 0; dot += w * w; } });
    return dot / (normA * normB);
  }
  function norm(G, idf, fallback) {
    var s = 0;
    G.forEach(function (g) { var w = idf.has(g) ? idf.get(g) : fallback; s += w * w; });
    return Math.sqrt(s);
  }
  // ดัชนีต่อคลัง (คำนวณครั้งเดียวต่อออบเจกต์คลัง — หน้าเว็บแคชคลังไว้ จึงใช้ซ้ำได้)
  var _index = typeof WeakMap === 'function' ? new WeakMap() : null;
  function indexOf(corpus) {
    var hit = _index && corpus && _index.get(corpus);
    if (hit) return hit;
    var list = entries(corpus), df = new Map();
    list.forEach(function (e) { e.grams = grams(e.problem); e.grams.forEach(function (g) { df.set(g, (df.get(g) || 0) + 1); }); });
    var N = list.length, idf = new Map();
    df.forEach(function (n, g) { idf.set(g, Math.log((N + 1) / (n + 0.5))); });
    var unseen = Math.log((N + 1) / 0.5); // ชิ้นที่ไม่มีในคลังเลย: นับในความยาวของคำค้นแต่ไม่มีทางตรงกับเรื่องไหน
    list.forEach(function (e) { e.norm = norm(e.grams, idf, unseen); });
    var ix = { list: list, idf: idf, unseen: unseen };
    if (_index && corpus && typeof corpus === 'object') _index.set(corpus, ix);
    return ix;
  }

  function str(v) { return String(v == null ? '' : v).trim(); }

  // แปลงคลังดิบเป็นรายการรูปแบบเดียวกัน { type, id, problem, fix, source, ref, system, status, category, projectId }
  function entries(corpus) {
    corpus = corpus || {};
    var out = [];
    (corpus.tickets || []).forEach(function (t) {
      var fix = str(t.fix), replies = str(t.replies), subj = str(t.subject), desc = str(t.description);
      // หัวข้อส่วนใหญ่ = ต้นรายละเอียดที่ตัดมา → ใช้รายละเอียดอย่างเดียว ไม่ให้ข้อความซ้ำถ่วงคะแนน
      var head = subj.replace(/(…|\.\.\.)$/, '').trim();
      out.push({ type: 'ticket', id: t.id, problem: head && desc.indexOf(head) === 0 ? desc : str(subj + ' ' + desc),
        fix: fix || replies, source: fix ? 'Ticket ที่ทีมบันทึกวิธีแก้' : replies ? 'คำตอบทีมงานใน Ticket' : 'Ticket ที่เคยแจ้ง',
        ref: t.ticket_no || '', system: t.source_system || '', status: t.status || '', category: t.category_id || '' });
    });
    (corpus.impl || []).forEach(function (x) {
      out.push({ type: 'impl', id: x.id, problem: str(x.problem) + (x.department ? ' (หน่วยงาน ' + x.department + ')' : ''),
        fix: str(x.solution), source: 'ปัญหาในโครงการติดตั้ง', ref: '', projectId: x.project_id || '',
        status: x.status || '', category: x.category || '' });
    });
    (corpus.assist || []).forEach(function (a) {
      out.push({ type: 'assist', id: a.id, problem: [a.title, a.keywords, a.category].map(str).join(' '),
        fix: str(a.content) + (str(a.note) ? '\nข้อควรระวัง: ' + str(a.note) : ''), source: 'คู่มือ/ข้อความตอบกลับของทีม', ref: str(a.title) });
    });
    (corpus.problems || []).forEach(function (p) {
      var fix = [['สาเหตุ', p.root_cause], ['แนวทาง', p.action_plan], ['ผล', p.result]]
        .filter(function (x) { return str(x[1]); }).map(function (x) { return x[0] + ': ' + str(x[1]); }).join('\n');
      out.push({ type: 'problem', id: p.id, problem: str(str(p.title) + ' ' + str(p.source_system)), fix: fix,
        source: 'ปัญหาที่พบซ้ำ', ref: str(p.title), system: p.source_system || '', status: p.status || '' });
    });
    return out.filter(function (e) { return e.problem; });
  }

  /**
   * ค้นเรื่องที่คล้าย query — query เป็นข้อความเดียว หรือหลายมุม [หัวข้อ, ข้อความล่าสุด, ทั้งหมด] (ใช้คะแนนมุมที่ตรงที่สุด
   * ข้อความยาวรวมทุกอย่างทำให้เรื่องที่ตรงกับประเด็นเดียวคะแนนจาง)
   * opt: { system, excludeTicketId, excludeIssueId, top (6), related (จำนวน related; ไม่ระบุ = 2 ถ้ามี knowledge, 4 ถ้าไม่มี),
   *        boost(entry) → คะแนนเพิ่ม }
   */
  function search(corpus, query, opt) {
    opt = opt || {};
    var ix = indexOf(corpus), sys = str(opt.system).toLowerCase();
    var qs = [].concat(query).map(grams).filter(function (q) { return q.size >= 12; })
      .map(function (q) { return { g: q, n: norm(q, ix.idf, ix.unseen) }; });
    if (!qs.length) return { knowledge: [], related: [] };
    var ranked = ix.list.filter(function (e) {
      return !(e.type === 'ticket' && opt.excludeTicketId && e.id === opt.excludeTicketId)
        && !(e.type === 'impl' && opt.excludeIssueId && e.id === opt.excludeIssueId);
    }).map(function (e) {
      var s = Math.max.apply(null, qs.map(function (q) { return wsim(q.g, e.grams, ix.idf, q.n, e.norm); }));
      return Object.assign({}, e, { score: s + (sys && str(e.system).toLowerCase() === sys ? 0.03 : 0) + (opt.boost ? opt.boost(e) || 0 : 0) });
    }).filter(function (e) { return e.score >= (opt.minScore != null ? opt.minScore : MIN_SCORE); }).sort(function (a, b) { return b.score - a.score; });
    var seen = new Set();
    var fresh = function (text) { var k = String(text).replace(/\s+/g, '').slice(0, 120); if (seen.has(k)) return false; seen.add(k); return true; };
    var knowledge = ranked.filter(function (e) { return e.fix && fresh(e.fix); }).slice(0, opt.top || 6);
    var nRel = opt.related != null ? opt.related : (knowledge.length ? 2 : 4);
    var related = ranked.filter(function (e) { return !e.fix && fresh(e.problem); }).slice(0, nRel);
    return { knowledge: knowledge, related: related };
  }

  /**
   * ข้อความคลังความรู้สำหรับใส่ใน prompt
   * opt: { redact(text), internal (true = ใส่เลข Ticket/ที่มาได้ — ใช้ภายในทีมเท่านั้น · ห้ามใช้กับคำตอบถึงลูกค้า) }
   */
  function promptText(result, opt) {
    opt = opt || {};
    var red = opt.redact || function (x) { return String(x || ''); };
    var tag = function (e) {
      return [e.source, opt.internal && e.ref ? e.ref : '', e.type === 'impl' && e.category ? 'กลุ่ม ' + e.category : '', e.status ? 'สถานะ ' + (STATUS_TH[e.status] || e.status) : '',
        'ใกล้เคียง ' + Math.round(e.score * 100) + '%'].filter(Boolean).join(' · ');
    };
    return {
      knowledge: (result.knowledge || []).map(function (e, i) {
        return (i + 1) + ') [' + tag(e) + '] ปัญหา: ' + red(e.problem).slice(0, 300) + '\nทีมแก้ไข/ตอบไว้ว่า: ' + red(e.fix).slice(0, 700);
      }).join('\n\n'),
      related: (result.related || []).map(function (e, i) {
        return (i + 1) + ') [' + tag(e) + '] ' + red(e.problem).slice(0, 400);
      }).join('\n'),
    };
  }

  // ทั้งสองหัวข้อพร้อมใส่ท้าย prompt
  function promptBlock(result, opt) {
    var t = promptText(result, opt);
    return 'คลังความรู้ที่มีวิธีแก้ (ค้นจากทุกแหล่งของทีม):\n' + (t.knowledge || '(ไม่พบเรื่องที่มีวิธีแก้ตรงกัน)')
      + '\n\nปัญหาที่เคยพบคล้ายกัน (ยังไม่บันทึกวิธีแก้):\n' + (t.related || '(ไม่มี)');
  }

  // ข้อมูลของโรงพยาบาลผู้แจ้ง (RPC ai_hospital_context) เป็นข้อความสำหรับ prompt
  // opt: { redact(text), internal (true = ใส่เลข Ticket/ชื่อโครงการได้ — ภายในทีมเท่านั้น) }
  function hospitalText(h, opt) {
    opt = opt || {};
    if (!h || typeof h !== 'object') return '';
    var red = opt.redact || function (x) { return String(x || ''); };
    var day = function (d) { return String(d || '').slice(0, 10); };
    var st = function (s) { return STATUS_TH[s] || s || '-'; };
    var lines = [];
    var info = [h.type ? 'ประเภท ' + h.type : '', h.beds ? h.beds + ' เตียง' : '', h.province ? 'จ.' + h.province : ''].filter(Boolean).join(' · ');
    if (info) lines.push('ข้อมูลทั่วไป: ' + info);
    if ((h.products || []).length) lines.push('ระบบ/ผลิตภัณฑ์ที่ใช้: ' + h.products.join(', '));
    (h.projects || []).forEach(function (p) {
      lines.push('โครงการติดตั้ง' + (opt.internal && p.project_name ? ' "' + p.project_name + '"' : '') + ': ขั้น ' + (p.stage || '-')
        + (p.progress_pct ? ' · คืบหน้า ' + p.progress_pct + '%' : '') + (p.start_date ? ' · เริ่ม ' + day(p.start_date) : '') + (p.end_date ? ' ถึง ' + day(p.end_date) : ''));
    });
    if ((h.tickets || []).length) {
      lines.push('เรื่องที่ รพ. นี้เคยแจ้งล่าสุด:');
      h.tickets.forEach(function (t) {
        lines.push('- ' + day(t.created_at) + (opt.internal && t.ticket_no ? ' ' + t.ticket_no : '') + ' [' + st(t.status) + '] ' + red(t.subject).slice(0, 160)
          + (t.last_reply ? '\n  ทีมตอบล่าสุด: ' + red(t.last_reply).replace(/\s+/g, ' ').slice(0, 300) : ''));
      });
    }
    if ((h.issues || []).length) {
      lines.push('ปัญหาในโครงการติดตั้งของ รพ. นี้:');
      h.issues.forEach(function (i) {
        lines.push('- [' + st(i.status) + '] ' + red(i.problem).replace(/\s+/g, ' ').slice(0, 200) + (i.solution ? ' → แก้โดย: ' + red(i.solution).replace(/\s+/g, ' ').slice(0, 200) : ''));
      });
    }
    return lines.join('\n');
  }

  root.aiKnowledge = {
    MIN_SCORE: MIN_SCORE, entries: entries, search: search, promptText: promptText, promptBlock: promptBlock, hospitalText: hospitalText,
  };

  // ── หน้าเว็บ: โหลดคลังผ่าน RPC แล้วแคช 1 นาที (บันทึกวิธีแก้ใน Helpdesk → aiKnowledgeInvalidate ทันที) ──
  if (typeof root.document === 'undefined') return;
  var _cache = null, _at = 0, _loading = null;
  root.aiKnowledgeInvalidate = function () { _cache = null; };
  root.aiKnowledgeLoad = function () {
    if (_cache && Date.now() - _at < 60000) return Promise.resolve(_cache);
    if (_loading) return _loading;
    var db = root.getDb && root.getDb();
    if (!db || !db.rpc) return Promise.resolve({});
    _loading = Promise.resolve(db.rpc('ai_knowledge_corpus')).then(function (r) {
      if (r.error) throw r.error;
      _cache = r.data || {}; _at = Date.now();
      return _cache;
    }).catch(function (e) {
      console.warn('[ai-knowledge] โหลดคลังความรู้ไม่สำเร็จ:', e);
      return _cache || {};
    }).finally(function () { _loading = null; });
    return _loading;
  };
  // ค้นจากคลังล่าสุด — โหลดไม่ได้ก็คืนผลว่าง (AI ยังทำงานต่อได้)
  root.aiKnowledgeSearch = async function (query, opt) {
    return search(await root.aiKnowledgeLoad(), query, opt);
  };
  // ข้อมูลของโรงพยาบาลผู้แจ้งเป็นข้อความพร้อมใส่ prompt (ภายในทีม) — ไม่มี/โหลดไม่ได้ = ''
  root.aiHospitalContextText = async function (hospitalId, excludeTicketId) {
    var db = root.getDb && root.getDb();
    if (!hospitalId || !db || !db.rpc) return '';
    try {
      var r = await db.rpc('ai_hospital_context', { p_hospital_id: hospitalId, p_exclude_ticket: excludeTicketId || '' });
      if (r.error) throw r.error;
      return hospitalText(r.data, { internal: true });
    } catch (e) {
      console.warn('[ai-knowledge] โหลดข้อมูลโรงพยาบาลไม่สำเร็จ:', e);
      return '';
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
