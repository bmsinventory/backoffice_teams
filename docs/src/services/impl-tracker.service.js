/**
 * impl-tracker.service.js — Implementation Tracker: Data Layer & Business Logic
 * ต้องโหลดหลัง supabase.service.js + impl-tracker.config.js
 * ลงทะเบียน onSnapshot ของตัวเอง (ไม่แก้ realtime.service.js เดิม) แบบ background
 * (ไม่ block loader หลัก เหมือน WORK_LOGS/CONTRACTS/HOSPITALS)
 */
(function () {

  // ── Transform: raw Supabase row → app object ──
  var transform = {
    IMPL_TEMPLATES: function (d) {
      return { id:d.id, name:d.template_name||'', description:d.description||'', structure:d.structure||{} };
    },
    IMPL_PROJECTS: function (d) {
      return { id:d.id, name:d.project_name||'', hospitalName:d.hospital_name||'', start:d.start_date||'', end:d.end_date||'', pm:d.project_manager||'', status:d.status||'not_started', progress:Number(d.progress_percent)||0, templateId:d.template_id||'', sourceProjectId:d.source_project_id||'', createdAt:d.created_at||'', updatedAt:d.updated_at||'' };
    },
    IMPL_PHASES: function (d) {
      return { id:d.id, projectId:d.project_id, name:d.phase_name||'', description:d.description||'', order:Number(d.sort_order)||99, status:d.status||'not_started', progress:Number(d.progress_percent)||0 };
    },
    IMPL_TASKS: function (d) {
      return { id:d.id, phaseId:d.phase_id, projectId:d.project_id, name:d.task_name||'', description:d.description||'', owner:d.owner||'', start:d.start_date||'', due:d.due_date||'', priority:d.priority||'medium', status:d.status||'not_started', progress:Number(d.progress_percent)||0, order:Number(d.sort_order)||99, createdAt:d.created_at||'', updatedAt:d.updated_at||'' };
    },
    IMPL_CHECKLIST_ITEMS: function (d) {
      return { id:d.id, taskId:d.task_id, name:d.checklist_name||'', done:d.is_done===true, doneDate:d.done_date||'', doneBy:d.done_by||'', remark:d.remark||'', order:Number(d.sort_order)||99 };
    },
    IMPL_ISSUES: function (d) {
      return { id:d.id, projectId:d.project_id, taskId:d.task_id||'', title:d.issue_title||'', detail:d.issue_detail||'', severity:d.severity||'medium', owner:d.owner||'', status:d.status||'open', solution:d.solution||'', createdAt:d.created_at||'', closedAt:d.closed_at||'' };
    },
    IMPL_RISKS: function (d) {
      return { id:d.id, projectId:d.project_id, title:d.risk_title||'', detail:d.risk_detail||'', impact:d.impact_level||'medium', probability:d.probability||'medium', mitigation:d.mitigation_plan||'', owner:d.owner||'', status:d.status||'open' };
    },
    IMPL_COMMENTS: function (d) {
      return { id:d.id, taskId:d.task_id, author:d.author||'', text:d.comment_text||'', createdAt:d.created_at||'' };
    },
    IMPL_ATTACHMENTS: function (d) {
      return { id:d.id, taskId:d.task_id, fileName:d.file_name||'', fileUrl:d.file_url||'', fileSize:Number(d.file_size)||0, uploadedBy:d.uploaded_by||'', uploadedAt:d.uploaded_at||'' };
    },
    IMPL_ACTIVITY_LOG: function (d) {
      return { id:d.id, projectId:d.project_id, entityType:d.entity_type||'', entityId:d.entity_id||'', action:d.action||'', detail:d.detail||'', actor:d.actor||'', createdAt:d.created_at||'' };
    },
  };

  // ── Collections นี้จะถูก subscribe แบบ background ทั้งหมด ──
  var IMPL_COLLECTIONS = [
    'IMPL_TEMPLATES', 'IMPL_PROJECTS', 'IMPL_PHASES', 'IMPL_TASKS', 'IMPL_CHECKLIST_ITEMS',
    'IMPL_ISSUES', 'IMPL_RISKS', 'IMPL_COMMENTS', 'IMPL_ATTACHMENTS', 'IMPL_ACTIVITY_LOG',
  ];

  // ── ID Generator (ตาม convention เดิม: prefix + Date.now()) ──
  window.imtUid = function (prefix) { return prefix + Date.now() + Math.floor(Math.random()*1000); };

  // ── Optimistic Local Update (แยกจาก window._applyLocalDoc เดิมใน realtime.service.js
  // เพราะ transform ของที่นั่นเป็น closure ส่วนตัว ไม่รู้จัก collection ใหม่ของเรา —
  // ถ้าใช้ตัวเดิมข้อมูล optimistic จะเป็น raw snake_case ที่ render code อ่านไม่ตรง) ──
  window.imtApplyLocal = function (jsName, id, rawData) {
    var arr = window[jsName];
    if (!Array.isArray(arr)) return;
    var fn = transform[jsName];
    var obj = fn ? fn(Object.assign({ id:id }, rawData)) : Object.assign({}, rawData, { id:id });
    var idx = arr.findIndex(function (x) { return x.id === id; });
    if (idx >= 0) arr[idx] = obj; else arr.push(obj);
  };

  window.imtRemoveLocal = function (jsName, id) {
    if (!Array.isArray(window[jsName])) return;
    window[jsName] = window[jsName].filter(function (x) { return x.id !== id; });
  };

  // ── Progress Calculators (bottom-up: Checklist → Task → Phase → Project) ──
  window.calcTaskProgress = function (task) {
    if (!task) return 0;
    var items = window.IMPL_CHECKLIST_ITEMS.filter(function (c) { return c.taskId === task.id; });
    // ── Task ที่ไม่มี Checklist เลย ไม่มีฟอร์มไหนให้ผู้ใช้กรอก % progress เอง (field นี้ไม่เคยถูกอัปเดตหลัง
    // สร้าง) เลยอ้างอิงจากสถานะแทน — "เสร็จแล้ว" ต้องได้แถบความคืบหน้าเต็ม 100% เสมอ ไม่งั้นหลอดจะค้างที่ 0%
    // ทั้งที่ป้ายสถานะขึ้นสีเขียวแล้ว (เห็นความไม่ตรงกันชัดเจนในการ์ด Task) ──
    if (!items.length) {
      if (task.status === 'done') return 100;
      return Number(task.progress) || 0;
    }
    var doneCount = items.filter(function (c) { return c.done; }).length;
    return Math.round((doneCount / items.length) * 100);
  };

  window.calcPhaseProgress = function (phase) {
    if (!phase) return 0;
    var tasks = window.IMPL_TASKS.filter(function (t) { return t.phaseId === phase.id; });
    if (!tasks.length) return 0;
    var sum = tasks.reduce(function (s, t) { return s + window.calcTaskProgress(t); }, 0);
    return Math.round(sum / tasks.length);
  };

  window.calcProjectProgress = function (project) {
    if (!project) return 0;
    var phases = window.IMPL_PHASES.filter(function (p) { return p.projectId === project.id; });
    if (!phases.length) return 0;
    var sum = phases.reduce(function (s, p) { return s + window.calcPhaseProgress(p); }, 0);
    return Math.round(sum / phases.length);
  };

  // ── Overdue Helper (แสดงผลอย่างเดียว ไม่ auto-overwrite status ที่ user ตั้ง) ──
  window.imtIsOverdue = function (task) {
    if (!task || !task.due) return false;
    if (task.status === 'done' || task.status === 'cancelled') return false;
    return window.pd(task.due) < new Date(new Date().toDateString());
  };

  window.imtIsDueSoon = function (task, days) {
    if (!task || !task.due) return false;
    if (task.status === 'done' || task.status === 'cancelled') return false;
    var due = window.pd(task.due), today = new Date(new Date().toDateString());
    var diffDays = Math.round((due - today) / 86400000);
    return diffDays >= 0 && diffDays <= (days || 3);
  };

  // ── Activity Log Writer (optimistic + persist) ──
  window.imtLogActivity = function (projectId, entityType, entityId, action, detail) {
    var id = window.imtUid('IACT');
    var actor = (window.cu && (window.cu.name || window.cu.username)) || '';
    var row = { project_id:projectId, entity_type:entityType, entity_id:entityId, action:action, detail:detail||'', actor:actor };
    window.imtApplyLocal('IMPL_ACTIVITY_LOG', id, Object.assign({ created_at:new Date().toISOString() }, row));
    window.setDoc(window.getDocRef('IMPL_ACTIVITY_LOG', id), row).catch(function (e) { console.error('[impl-tracker] activity log error', e); });
  };

  // ── ประเมิน "น้ำหนักวัน" ของ Task จากชื่องาน (heuristic, ไม่ต้องเรียก AI ภายนอก/ไม่ต้องใช้ API key) ──
  // งานที่ต้องลงมือหน้างานหนัก ๆ (ติดตั้ง/เดินสาย/ตั้งค่า/ทดสอบ/อบรม) ได้น้ำหนักมากกว่า งานเอกสาร/อนุมัติ/ส่งมอบ
  var IMT_TASK_WEIGHT_RULES = [
    { re:/ติดตั้ง|เดินสาย|ตั้งค่า|configur|install|ย้ายข้อมูล|migrat|เชื่อมต่อระบบ|integrat/i, w:3 },
    { re:/ทดสอบ|test|อบรม|training|สำรวจหน้างาน|survey/i, w:2 },
    { re:/ตรวจสอบ|inspect|ประชุม|meeting|เตรียม|prepare|วางแผน|plan/i, w:1.5 },
    { re:/เซ็น|sign|อนุมัติ|approve|แจ้ง|notify|ส่งมอบ|handover|เอกสาร|document/i, w:0.5 },
  ];
  window.imtEstimateTaskWeight = function (name) {
    name = name || '';
    for (var i = 0; i < IMT_TASK_WEIGHT_RULES.length; i++) { if (IMT_TASK_WEIGHT_RULES[i].re.test(name)) return IMT_TASK_WEIGHT_RULES[i].w; }
    return 1;
  };

  // ── กระจายวันเริ่ม/วันแล้วเสร็จของแต่ละ Task ให้อัตโนมัติ โดยหาร (วันสิ้นสุด - วันเริ่ม) ของโครงการ
  // ตามสัดส่วน "น้ำหนักวัน" ของแต่ละ Task (ไม่ใช่แบ่งเท่า ๆ กันทุกงาน — งานที่หนักกว่าได้เวลามากกว่า)
  // เรียงตามลำดับ Phase/Task ใน Template (งานแรกเริ่มก่อน, งานสุดท้ายแล้วเสร็จตรงกับวันสิ้นสุดโครงการพอดี)
  // ถ้าโครงการไม่มีวันเริ่ม/สิ้นสุด จะไม่ใส่วันที่ให้ ──
  function imtDistributeDates(startStr, endStr, weights) {
    var count = weights.length;
    if (!startStr || !endStr || !count) return [];
    var start = window.pd(startStr), end = window.pd(endStr);
    var totalDays = Math.max(0, Math.round((end - start) / 86400000));
    var totalWeight = weights.reduce(function (s, w) { return s + (w > 0 ? w : 1); }, 0) || count;
    var toStr = function (d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
    var addDays = function (n) { var d = new Date(start); d.setDate(d.getDate() + n); return d; };
    var out = [], cum = 0;
    for (var i = 0; i < count; i++) {
      var w = weights[i] > 0 ? weights[i] : 1;
      var s = Math.round((cum / totalWeight) * totalDays);
      cum += w;
      var e = i === count - 1 ? totalDays : Math.max(s, Math.round((cum / totalWeight) * totalDays) - 1);
      out.push({ start: toStr(addDays(s)), due: toStr(addDays(e)) });
    }
    return out;
  }

  // Task ใน Template เก็บได้ 2 แบบ: string ล้วน (Template เก่า) หรือ {name, days, checklist} (รองรับระบุจำนวนวัน
  // และรายการ Checklist ของตัวเองได้) ──
  function imtTaskName(tk) { return typeof tk === 'string' ? tk : (tk && tk.name) || ''; }
  function imtTaskWeight(tk) {
    if (tk && typeof tk === 'object' && tk.days) return Number(tk.days);
    return window.imtEstimateTaskWeight(imtTaskName(tk));
  }
  // Checklist ที่ผู้ใช้กำหนดไว้ล่วงหน้าใน Template task — ถ้าไม่มี ใช้ชื่อ Task เองเป็นรายการ Checklist เดียว (เดิม)
  function imtTaskChecklist(tk) {
    if (tk && typeof tk === 'object' && Array.isArray(tk.checklist) && tk.checklist.length) return tk.checklist;
    return [imtTaskName(tk)];
  }

  // ── Apply Template: clone Phase/Task/Checklist structure ให้โครงการใหม่ (+ คำนวณวันที่ Task อัตโนมัติ)
  // ต้อง imtApplyLocal ทุกแถวที่สร้างด้วย (เหมือนฟังก์ชัน mutation อื่นทุกตัวในระบบ) ไม่ใช่ยิง batch.set()
  // ไปที่ Supabase อย่างเดียว — ไม่งั้น window.IMPL_PHASES/TASKS/CHECKLIST_ITEMS ในหน้าเว็บจะยังไม่รู้จักแถวใหม่
  // จนกว่า realtime subscription จะ fetch กลับมา (มีดีเลย์ + อาจถูก _ownWrite บังสกัดการ re-render ไว้ 2 วิ
  // ระหว่างเขียนหลายสิบแถวติดกัน) ทำให้ต้องกด F5 ถึงจะเห็น Phase/Task ที่เพิ่งสร้างจาก Template ──
  window.imtApplyTemplate = async function (templateId, projectId, projectStart, projectEnd) {
    var tpl = window.IMPL_TEMPLATES.find(function (t) { return t.id === templateId; });
    if (!tpl || !tpl.structure || !tpl.structure.phases) return;
    var flatTasks = [];
    tpl.structure.phases.forEach(function (ph) { (ph.tasks || []).forEach(function (tk) { flatTasks.push(tk); }); });
    var taskDates = imtDistributeDates(projectStart, projectEnd, flatTasks.map(imtTaskWeight));
    var taskIdx = 0;
    var batch = window.writeBatch();
    var opCount = 0;
    async function commitIfNeeded() {
      if (opCount >= 400) { await batch.commit(); batch = window.writeBatch(); opCount = 0; }
    }
    for (var pi = 0; pi < tpl.structure.phases.length; pi++) {
      var ph = tpl.structure.phases[pi];
      var phaseId = window.imtUid('IPH');
      var phaseRow = {
        project_id: projectId, phase_name: ph.phase_name, description: '',
        sort_order: ph.sort_order || (pi + 1), status: 'not_started', progress_percent: 0,
      };
      window.imtApplyLocal('IMPL_PHASES', phaseId, phaseRow);
      batch.set(window.getDocRef('IMPL_PHASES', phaseId), phaseRow);
      opCount++; await commitIfNeeded();
      var tasks = ph.tasks || [];
      for (var ti = 0; ti < tasks.length; ti++) {
        var taskId = window.imtUid('ITK');
        var d = taskDates[taskIdx++] || {};
        var taskName = imtTaskName(tasks[ti]);
        var taskRow = {
          phase_id: phaseId, project_id: projectId, task_name: taskName, description: '',
          owner: '', priority: 'medium', status: 'not_started', progress_percent: 0,
          sort_order: ti + 1, start_date: d.start || null, due_date: d.due || null,
        };
        window.imtApplyLocal('IMPL_TASKS', taskId, taskRow);
        batch.set(window.getDocRef('IMPL_TASKS', taskId), taskRow);
        opCount++; await commitIfNeeded();
        var checklist = imtTaskChecklist(tasks[ti]);
        for (var ci = 0; ci < checklist.length; ci++) {
          var checklistId = window.imtUid('ICK');
          var ckRow = { task_id: taskId, checklist_name: checklist[ci], is_done: false, sort_order: ci + 1 };
          window.imtApplyLocal('IMPL_CHECKLIST_ITEMS', checklistId, ckRow);
          batch.set(window.getDocRef('IMPL_CHECKLIST_ITEMS', checklistId), ckRow);
          opCount++; await commitIfNeeded();
        }
      }
    }
    if (opCount > 0) await batch.commit();
  };

  // ── Attachment Upload (Supabase Storage bucket: impl-attachments) ──
  window.imtUploadAttachment = async function (taskId, file) {
    var sb = window.getDb();
    var path = taskId + '/' + Date.now() + '_' + file.name;
    var up = await sb.storage.from('impl-attachments').upload(path, file);
    if (up.error) throw up.error;
    var pub = sb.storage.from('impl-attachments').getPublicUrl(path);
    var id = window.imtUid('IATT');
    var uploadedBy = (window.cu && (window.cu.name || window.cu.username)) || '';
    var row = { task_id:taskId, file_name:file.name, file_url:pub.data.publicUrl, file_size:file.size, uploaded_by:uploadedBy };
    await window.setDoc(window.getDocRef('IMPL_ATTACHMENTS', id), row);
    window.imtApplyLocal('IMPL_ATTACHMENTS', id, Object.assign({ uploaded_at:new Date().toISOString() }, row));
    return id;
  };

  window.imtDeleteAttachment = async function (attId) {
    var att = window.IMPL_ATTACHMENTS.find(function (a) { return a.id === attId; });
    if (att && att.fileUrl) {
      var sb = window.getDb();
      var marker = '/impl-attachments/';
      var idx = att.fileUrl.indexOf(marker);
      if (idx >= 0) {
        var path = att.fileUrl.slice(idx + marker.length);
        await sb.storage.from('impl-attachments').remove([path]).catch(function () {});
      }
    }
    window.imtRemoveLocal('IMPL_ATTACHMENTS', attId);
    await window.deleteDoc(window.getDocRef('IMPL_ATTACHMENTS', attId));
  };

  // ── Re-render Router: บอก impl-tracker.js ให้ re-render ตาม tab ที่กำลังเปิดอยู่ ──
  function _rerender() {
    if (!window.cu || !window._von('view-impl-tracker')) return;
    window.renderImplTracker && window.renderImplTracker();
  }

  // ── Setup Realtime (background collections — ไม่ block checkLoaded หลัก) ──
  window.ImplTrackerService = {
    setup: function () {
      var debounced = {};
      function deferRerender(key) {
        clearTimeout(debounced[key]);
        debounced[key] = setTimeout(_rerender, 300);
      }
      IMPL_COLLECTIONS.forEach(function (jsName) {
        window.onSnapshot(window.getColRef(jsName), function (s) {
          window[jsName] = s.docs.map(function (doc) { return transform[jsName](doc.data()); });
          if (window._ownWrite && window._ownWrite[jsName]) return;
          deferRerender(jsName);
        }, function (e) { console.warn('[impl-tracker.service] onSnapshot error [' + jsName + ']:', e.message || e); });
      });
    },
  };

})();
