/**
 * all-issues.js — เมนู "ปัญหาทุกโครงการ" (all_issues)
 * ภาพรวมปัญหาการใช้งานโปรแกรม (IMPL_ISSUES) ข้ามทุกโครงการ สำหรับมุมมอง PM
 * จำกัดสิทธิ์แบบตายตัวด้วย window.ce() (PM/Admin เท่านั้น) — ดูเหตุผลใน router.js/routes.config.js
 * (ไม่ได้ลงทะเบียนใน PERM_MODULES ตั้งใจ ไม่ต้องการให้ Admin ไปเปิดสิทธิ์ผ่าน Admin Panel ได้)
 *
 * ดีไซน์ตามตัวอย่างที่ผู้ใช้ส่งมา (อ้างอิงระบบภายนอก): ตัวกรองปี พ.ศ. → KPI 5 ใบ → การ์ดสรุปต่อ
 * "Product" (= ประเภทโครงการ window.PROJECTS.typeId/PTYPES ที่มีอยู่แล้ว ไม่ได้เพิ่ม field ใหม่ในฐานข้อมูล)
 * → กราฟแท่งแนวนอนแบบ stacked 2 กราฟ (สถานะต่อ Product / กลุ่มปัญหาต่อ Product Top 7)
 * → การ์ดวิเคราะห์ปัญหาตามประเภทโครงการ (อันดับกลุ่มปัญหา/แผนกที่พบมากสุดต่อประเภท)
 * → ตารางสรุปรายโครงการ (1 แถว = 1 โครงการ + ป้ายประเภท) (ใช้ IMPL_PROJECTS.name ตรง ๆ เป็นชื่อแถว — เคยลองอ่าน
 * window.PROJECTS.siteOwner/IMPL_PROJECTS.hospitalName มาแสดงเป็น "โรงพยาบาล" แต่ค่าที่ได้ไม่ถูกต้อง)
 * ทุกจุด (KPI/การ์ด/กราฟ/เมทริกซ์) คลิกดูรายละเอียดได้ — เปิด modal รายการปัญหา (#m-aio-detail ใน
 * index.html) ยกเว้นเซลล์เมทริกซ์ที่รู้โครงการแน่ชัดอยู่แล้ว จะพาไปแท็บ "ปัญหา" ของโครงการนั้นใน
 * Impl Tracker ตรง ๆ (แก้ไข/ปิดงานได้จริง ไม่ใช่แค่ดูอย่างเดียว)
 */
(function () {

  var PRODUCT_COLORS = ['#4361ee', '#ff6b6b', '#06d6a0', '#ffa62b', '#7c5cfc', '#4cc9f0', '#f72585'];
  var CAT_COLORS = ['#4361ee', '#ff6b6b', '#06d6a0', '#ffa62b', '#7c5cfc', '#4cc9f0', '#f72585'];
  var _selectedYear = String(new Date().getFullYear()); // ปี ค.ศ. (string) เริ่มต้นที่ปีปัจจุบัน — คงค่าไว้ข้ามการ render ซ้ำ (realtime/goView)
  var _trendMode = 'week'; // 'week' | 'month' — โหมดแนวโน้มปัญหา คงค่าไว้ข้ามการ render ซ้ำเช่นกัน
  var _anaDim = 'category'; // 'category' | 'department' — มิติของการ์ด "วิเคราะห์ปัญหาตามประเภทโครงการ"
  var TREND_PERIODS = 12;

  function aioIssueStatus(id) {
    return (window.IMPL_ISSUE_STATUS || []).find(function (s) { return s.id === id; }) || { label: id || '-', color: '#9ba3b8' };
  }
  // ── หาโครงการต้นทาง (window.PROJECTS) — ใช้ sourceProjectId ถ้ามี ไม่มีก็เดาจากชื่อที่ตรงกันพอดี
  // (โครงการเก่าก่อนมีคอลัมน์นี้) เหมือน imtResolveSourceProject ใน impl-tracker.js (คัดลอกมาเพราะ
  // impl-tracker.js เป็น ES module ฟังก์ชันภายในไม่หลุดออกมาเป็น window.* ให้เรียกได้) ──
  function aioResolveSourceProject(proj) {
    if (!proj) return null;
    var srcId = proj.sourceProjectId;
    if (!srcId) {
      var guess = (window.PROJECTS || []).find(function (x) { return x.name === proj.name; });
      if (guess) srcId = guess.id;
    }
    return srcId ? (window.PROJECTS || []).find(function (x) { return x.id === srcId; }) : null;
  }
  function aioProjectTypeId(pid) {
    var p = (window.IMPL_PROJECTS || []).find(function (x) { return x.id === pid; });
    var src = aioResolveSourceProject(p);
    return (src && src.typeId) || '';
  }
  function aioTypeLabel(typeId) {
    var t = (window.PTYPES || []).find(function (x) { return x.id === typeId; });
    return t ? t.label : 'ไม่ระบุประเภท';
  }
  function aioProductLabel(pkey) { return pkey === '__none__' ? 'ไม่ระบุประเภท' : aioTypeLabel(pkey); }
  // ── ชื่อโครงการ — ใช้ IMPL_PROJECTS.name ตรง ๆ (window.PROJECTS.siteOwner/hospitalName ที่เคยลองอ่าน
  // ไม่ได้เก็บชื่อ รพ. จริงตามที่คาดไว้ แสดงผลผิด จึงตัดออกใช้ชื่อโครงการแทนตรง ๆ) ──
  function aioProjectLabel(pid) {
    var p = (window.IMPL_PROJECTS || []).find(function (x) { return x.id === pid; });
    return p ? p.name : 'ไม่ทราบโครงการ';
  }
  // ── "ผู้แก้ไข" เก็บเป็นชื่อเล่นในฐานข้อมูล — แปลงเป็นชื่อ-นามสกุลจาก STAFF แบบเดียวกับ imtStaffNameByNick
  // ใน impl-tracker.js (หาไม่เจอ เช่นลาออก/พิมพ์เอง ก็แสดงค่าที่เก็บไว้ตรง ๆ) ──
  function aioStaffNameByNick(nick) {
    if (!nick) return '';
    var s = (window.STAFF || []).find(function (x) { return (x.nickname || x.name) === nick; });
    return s ? s.name : nick;
  }
  // ── escape ข้อความอิสระ (เช่นชื่อกลุ่มปัญหา) ก่อนฝังใน onclick="...('...')" กัน apostrophe ตัดสตริงกลางคัน ──
  function aioJsStr(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

  function aioStatCard(color, lbl, val, sub, meterPct, clickJs) {
    var styleStr = 'border-top:3px solid ' + color + ';' + (clickJs ? 'cursor:pointer;' : '');
    var clickAttr = clickJs ? ' onclick="' + clickJs + '"' : '';
    return '<div class="stat-c"' + clickAttr + ' style="' + styleStr + '">'
      + '<div class="stat-k">' + window.esc(lbl) + '</div>'
      + '<div class="stat-v" style="color:' + color + '">' + val + '</div>'
      + (sub ? '<div class="stat-s">' + window.esc(sub) + '</div>' : '')
      + (meterPct != null ? '<div class="pbar" style="margin-top:8px;"><div class="pbar-fill" style="width:' + meterPct + '%;background:' + color + '"></div></div>' : '')
      + '</div>';
  }

  // ── กราฟแท่งแนวนอนแบบ stacked (ไม่ใช้ไลบรารีภายนอก — div + flex ธรรมดา) ── //
  function aioNiceCeil(v) {
    if (v <= 0) return 4;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var norm = v / mag;
    var nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return nice * mag;
  }
  // rows: [{key, label, values:{key:n}}], keys: ลำดับ segment, meta: {key:{label,color}}
  // opts.rowClick(rowKey) / opts.segClick(rowKey, segKey) — คืน JS statement string ใส่ใน onclick ──
  function aioStackedHBar(rows, keys, meta, opts) {
    opts = opts || {};
    var maxTotal = rows.reduce(function (m, r) {
      var t = keys.reduce(function (s, k) { return s + (r.values[k] || 0); }, 0);
      return Math.max(m, t);
    }, 0);
    var niceMax = aioNiceCeil(maxTotal || 1);
    var gridN = 4, axisHtml = '';
    for (var g = 0; g <= gridN; g++) {
      var val = Math.round(niceMax * g / gridN);
      axisHtml += '<span style="flex:1;text-align:' + (g === 0 ? 'left' : g === gridN ? 'right' : 'center') + ';">' + val + '</span>';
    }
    var legendHtml = keys.map(function (k) {
      return '<span class="aio-legend-item"><i style="background:' + meta[k].color + '"></i>' + window.esc(meta[k].label) + '</span>';
    }).join('');
    var barsHtml = rows.map(function (r) {
      var total = keys.reduce(function (s, k) { return s + (r.values[k] || 0); }, 0);
      var widthPct = niceMax ? Math.min(100, total / niceMax * 100) : 0;
      var segsHtml = keys.map(function (k) {
        var v = r.values[k] || 0;
        if (!v) return '';
        var segPct = total ? (v / total * 100) : 0;
        var segStyle = 'width:' + segPct + '%;background:' + meta[k].color + ';' + (opts.segClick ? 'cursor:pointer;' : '');
        var segClickAttr = opts.segClick ? ' onclick="' + opts.segClick(r.key, k) + '"' : '';
        return '<div class="aio-hbar-seg"' + segClickAttr + ' style="' + segStyle + '" title="' + window.esc(meta[k].label) + ': ' + v + '"></div>';
      }).join('');
      var labelStyle = opts.rowClick ? 'cursor:pointer;' : '';
      var labelClickAttr = opts.rowClick ? ' onclick="' + opts.rowClick(r.key) + '"' : '';
      return '<div class="aio-hbar-row">'
        + '<div class="aio-hbar-label"' + labelClickAttr + ' style="' + labelStyle + '" title="' + window.esc(r.label) + '">' + window.esc(r.label) + '</div>'
        + '<div class="aio-hbar-track"><div class="aio-hbar-fill" style="width:' + widthPct + '%;">' + segsHtml + '</div></div>'
        + '<div class="aio-hbar-total">' + total + '</div>'
        + '</div>';
    }).join('');
    return '<div class="aio-legend" style="margin-bottom:14px;">' + legendHtml + '</div>'
      + '<div class="aio-hbar-chart">' + barsHtml + '</div>'
      + '<div class="aio-hbar-axis"><div class="aio-hbar-axis-spacer"></div><div class="aio-hbar-axis-nums">' + axisHtml + '</div><div class="aio-hbar-axis-spacer2"></div></div>';
  }

  // ── กราฟแนวโน้มปัญหา (เส้นโค้ง หลายชุดข้อมูล) — bucket ตามวันที่รับแจ้ง (createdAt) ย้อนหลัง
  // N สัปดาห์/เดือนจากวันนี้ (rolling window ไม่ผูกกับตัวกรองปี พ.ศ. ด้านบน เพราะเป็นคนละแนวคิด:
  // "ย้อนหลัง N งวดล่าสุด" vs "เฉพาะปีปฏิทินที่เลือก") แยกนับตามสถานะปัจจุบันของปัญหาที่รับแจ้งในงวดนั้น ──
  function aioFmtDM(d) { return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); }
  var AIO_TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  function aioFmtMY(d) { return AIO_TH_MONTHS[d.getMonth()] + ' ' + String((d.getFullYear() + 543) % 100).padStart(2, '0'); }

  function aioTrendBuckets(mode, n) {
    var buckets = [], today = new Date(); today.setHours(0, 0, 0, 0);
    if (mode === 'month') {
      var thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      for (var i = n - 1; i >= 0; i--) {
        var ms = new Date(thisMonthStart.getFullYear(), thisMonthStart.getMonth() - i, 1);
        var me = new Date(ms.getFullYear(), ms.getMonth() + 1, 1);
        buckets.push({ start: ms, end: me, label: aioFmtMY(ms) });
      }
    } else {
      var dow = today.getDay();
      var thisMonday = new Date(today); thisMonday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
      for (var j = n - 1; j >= 0; j--) {
        var ws = new Date(thisMonday); ws.setDate(thisMonday.getDate() - j * 7);
        var we = new Date(ws); we.setDate(ws.getDate() + 7);
        buckets.push({ start: ws, end: we, label: aioFmtDM(ws) });
      }
    }
    return buckets;
  }
  function aioComputeTrend() {
    var allIssues = window.IMPL_ISSUES || [];
    return aioTrendBuckets(_trendMode, TREND_PERIODS).map(function (b) {
      var inBucket = allIssues.filter(function (i) {
        var d = i.createdAt ? new Date(i.createdAt) : null;
        return d && d >= b.start && d < b.end;
      });
      return {
        start: b.start, end: b.end, label: b.label,
        open: inBucket.filter(function (i) { return i.status === 'open'; }).length,
        in_progress: inBucket.filter(function (i) { return i.status === 'in_progress'; }).length,
        closed: inBucket.filter(function (i) { return i.status === 'closed'; }).length,
        total: inBucket.length,
      };
    });
  }
  // ── เส้นโค้งเรียบผ่านทุกจุด (Catmull-Rom แปลงเป็น Cubic Bezier) แทน polyline เหลี่ยม ── //
  function aioSmoothPath(pts) {
    if (pts.length < 2) return '';
    if (pts.length === 2) return 'M' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1) + ' L' + pts[1].x.toFixed(1) + ',' + pts[1].y.toFixed(1);
    var d = 'M' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1) + ' ';
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i === 0 ? 0 : i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];
      var c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      var c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += 'C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1) + ' ';
    }
    return d;
  }
  function aioTrendChartSvg(data, seriesKeys, seriesMeta) {
    var W = 1040, H = 260, padL = 34, padR = 14, padT = 16, padB = 30;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var n = data.length;
    var maxVal = 0;
    data.forEach(function (d) { seriesKeys.forEach(function (k) { maxVal = Math.max(maxVal, d[k]); }); });
    var niceMax = aioNiceCeil(maxVal || 1);
    function xPos(i) { return n <= 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW; }
    function yPos(v) { return padT + innerH - (v / niceMax) * innerH; }

    var gridN = 6, gridHtml = '', labelHtml = '';
    for (var g = 0; g <= gridN; g++) {
      var val = Math.round(niceMax * g / gridN);
      var gy = yPos(val);
      gridHtml += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + gy.toFixed(1) + '" style="stroke:var(--border)" stroke-width="1"/>';
      labelHtml += '<text x="' + (padL - 8) + '" y="' + (gy + 3.5).toFixed(1) + '" text-anchor="end" font-size="10.5" style="fill:var(--txt3)">' + val + '</text>';
    }
    var xLabelHtml = data.map(function (d, i) {
      return '<text x="' + xPos(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" style="fill:var(--txt3)">' + window.esc(d.label) + '</text>';
    }).join('');

    var seriesHtml = seriesKeys.map(function (k) {
      var pts = data.map(function (d, i) { return { x: xPos(i), y: yPos(d[k]) }; });
      var path = aioSmoothPath(pts);
      var dash = k === 'total' ? ' stroke-dasharray="5,4"' : '';
      var dots = data.map(function (d, i) {
        var v = d[k];
        var clickAttr = ' onclick="window.aioDrillBucket(\'' + d.start.toISOString() + '\',\'' + d.end.toISOString() + '\',\'' + (k === 'total' ? '' : k) + '\')"';
        return '<circle cx="' + pts[i].x.toFixed(1) + '" cy="' + pts[i].y.toFixed(1) + '" r="4" style="fill:' + seriesMeta[k].color + ';stroke:var(--surface);cursor:pointer;" stroke-width="1.5"' + clickAttr + '><title>' + window.esc(seriesMeta[k].label) + ' · ' + window.esc(d.label) + ': ' + v + '</title></circle>';
      }).join('');
      return '<path d="' + path + '" fill="none" style="stroke:' + seriesMeta[k].color + '" stroke-width="2" stroke-linecap="round"' + dash + '/>' + dots;
    }).join('');

    return '<svg class="aio-trend-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img">' + gridHtml + labelHtml + seriesHtml + xLabelHtml + '</svg>';
  }
  window.aioSetTrendMode = function (mode) {
    _trendMode = mode;
    window.renderAllIssuesOverview();
  };
  window.aioDrillBucket = function (startISO, endISO, status) {
    var start = new Date(startISO), end = new Date(endISO);
    var list = (window.IMPL_ISSUES || []).filter(function (i) {
      var d = i.createdAt ? new Date(i.createdAt) : null;
      if (!d || d < start || d >= end) return false;
      if (status && i.status !== status) return false;
      return true;
    });
    var lastDay = new Date(end.getTime() - 86400000);
    var rangeLabel = window.fd(start.toISOString()) + ' – ' + window.fd(lastDay.toISOString());
    window.aioShowIssueDetail(list, (status ? aioIssueStatus(status).label + ' · ' : '') + rangeLabel);
  };

  window.aioGoProjectIssues = function (pid) {
    window.closeM && window.closeM('m-aio-detail');
    window.imtCurrentProjectId = pid;
    window.goView('impl_tracker');
    setTimeout(function () { if (window.imtGoTab) window.imtGoTab('issues'); }, 60);
  };

  // ── ตัวกรองปี พ.ศ. ── //
  window.aioSetYear = function (v) {
    _selectedYear = v || '';
    window.renderAllIssuesOverview();
  };
  function aioYearFilteredIssues() {
    return (window.IMPL_ISSUES || []).filter(function (i) {
      if (!_selectedYear) return true;
      return (i.createdAt || '').slice(0, 4) === _selectedYear;
    });
  }

  // ── Drill-down: เปิด modal รายการปัญหาตามเงื่อนไขที่คลิก ── //
  // ── คลิกชื่อโครงการในตาราง "สถานะรายโครงการ" — เปิด popup รายการปัญหาของโครงการนั้นในหน้านี้เลย
  // (ไม่พาไปหน้า Impl Tracker เพราะกลับมาหน้านี้ยาก) มีปุ่มเปิดใน Impl Tracker ให้ถ้าต้องแก้ไขจริง ──
  window.aioShowProjectIssues = function (pid) {
    var list = aioYearFilteredIssues().filter(function (i) { return i.projectId === pid; });
    window.aioShowIssueDetail(list, aioProjectLabel(pid), pid);
  };
  // ── คลิกแถวปัญหาใน popup — กาง/พับรายละเอียด (แผนก/ผู้แจ้ง/วิธีแก้/ผู้แก้) ในตัว ไม่เปลี่ยนหน้า ──
  window.aioToggleIssueRow = function (tr) {
    var nx = tr && tr.nextElementSibling;
    if (!nx || !nx.classList.contains('aio-detail-more')) return;
    var show = nx.style.display === 'none';
    nx.style.display = show ? '' : 'none';
    tr.classList.toggle('on', show);
  };
  window.aioShowIssueDetail = function (list, title, pid) {
    var titleEl = document.getElementById('m-aio-detail-title');
    if (titleEl) titleEl.textContent = title + ' (' + list.length + ' รายการ)';
    var body = document.getElementById('m-aio-detail-body');
    if (!body) return;

    // ── จัดกลุ่มตามโครงการ — เลิกซ้ำคอลัมน์ "โครงการ" ทุกแถว (เดิมค่าเดียวกันซ้ำทั้งตารางเมื่อกรองมา
    // จากจุดเดียว เช่น product+สถานะ) ใช้แถวหัวกลุ่มคั่นแทน เรียงกลุ่มที่มีปัญหาเยอะสุดก่อน ──
    var groups = {}, order = [];
    list.forEach(function (i) {
      var label = aioProjectLabel(i.projectId);
      if (!groups[label]) { groups[label] = []; order.push(label); }
      groups[label].push(i);
    });
    order.sort(function (a, b) { return groups[b].length - groups[a].length; });

    var rowsHtml = order.map(function (label) {
      var items = groups[label].slice().sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
      var headHtml = pid ? '' : '<tr class="aio-detail-grouphead"><td colspan="5">🗂️ ' + window.esc(label) + ' <span class="aio-detail-groupcount">(' + items.length + ' รายการ)</span></td></tr>';
      var kv = function (k, v) { return '<div><span>' + k + '</span>' + (v ? window.esc(v) : '<i>-</i>') + '</div>'; };
      var itemsHtml = items.map(function (i, idx) {
        var st = aioIssueStatus(i.status);
        return '<tr class="aio-detail-row" onclick="window.aioToggleIssueRow(this)">'
          + '<td style="text-align:center;">' + (idx + 1) + '</td>'
          + '<td style="min-width:200px;max-width:420px;white-space:normal;overflow-wrap:anywhere;">' + window.esc(i.problem || '') + '</td>'
          + '<td><span class="tag">' + window.esc(i.category || '-') + '</span></td>'
          + '<td><span class="tag" style="background:' + st.color + '18;color:' + st.color + '">' + window.esc(st.label) + '</span></td>'
          + '<td style="white-space:nowrap;">' + window.fd(i.createdAt) + '</td>'
          + '</tr>'
          + '<tr class="aio-detail-more" style="display:none;"><td></td><td colspan="4"><div class="aio-detail-kv">'
          +   kv('แผนก', i.department) + kv('ผู้แจ้ง', i.reportedBy) + kv('ผู้รับแจ้ง', i.receivedBy)
          +   kv('ผู้แก้ไข', aioStaffNameByNick(i.fixedBy)) + kv('วันที่แก้ไข', i.fixedDate ? window.fd(i.fixedDate) : '')
          +   '<div class="full"><span>วิธีแก้ไข</span>' + (i.solution ? window.esc(i.solution) : '<i>-</i>') + '</div>'
          + '</div></td></tr>';
      }).join('');
      return headHtml + itemsHtml;
    }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--txt3);padding:24px;">ไม่มีข้อมูล</td></tr>';

    var toolbar = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">'
      + '<span style="font-size:12px;color:var(--txt3);">คลิกแถวเพื่อดูรายละเอียด / วิธีแก้ไข</span>'
      + (pid ? '<button class="btn btn-ghost btn-sm" onclick="window.aioGoProjectIssues(\'' + pid + '\')">เปิดใน Impl Tracker ↗</button>' : '')
      + '</div>';
    body.innerHTML = toolbar + '<div class="dtable-inner"><table class="imt-issues-tbl"><thead><tr>'
      + '<th>ลำดับ</th><th>ปัญหา</th><th>กลุ่ม</th><th>สถานะ</th><th>วันที่</th>'
      + '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
    window.openM('m-aio-detail');
  };
  window.aioDrillStatus = function (status) {
    var list = aioYearFilteredIssues().filter(function (i) { return !status || i.status === status; });
    window.aioShowIssueDetail(list, status ? aioIssueStatus(status).label : 'ปัญหาทั้งหมด');
  };
  window.aioDrillProduct = function (pkey) {
    var list = aioYearFilteredIssues().filter(function (i) { return (aioProjectTypeId(i.projectId) || '__none__') === pkey; });
    window.aioShowIssueDetail(list, aioProductLabel(pkey));
  };
  window.aioDrillProductStatus = function (pkey, status) {
    var list = aioYearFilteredIssues().filter(function (i) { return (aioProjectTypeId(i.projectId) || '__none__') === pkey && i.status === status; });
    window.aioShowIssueDetail(list, aioProductLabel(pkey) + ' · ' + aioIssueStatus(status).label);
  };
  window.aioDrillProductCategory = function (pkey, category) {
    var list = aioYearFilteredIssues().filter(function (i) { return (aioProjectTypeId(i.projectId) || '__none__') === pkey && (i.category || 'ไม่ระบุ') === category; });
    window.aioShowIssueDetail(list, aioProductLabel(pkey) + ' · ' + category);
  };

  window.aioDrillProductDept = function (pkey, dept) {
    var list = aioYearFilteredIssues().filter(function (i) { return (aioProjectTypeId(i.projectId) || '__none__') === pkey && (i.department || 'ไม่ระบุ') === dept; });
    window.aioShowIssueDetail(list, aioProductLabel(pkey) + ' · ' + dept);
  };
  window.aioSetAnaDim = function (dim) {
    _anaDim = dim;
    window.renderAllIssuesOverview();
  };

  // ── 🤖 สรุปบทวิเคราะห์ด้วย AI — ส่ง "ตัวเลขสรุป + ตัวอย่างปัญหา" (ไม่ส่งข้อมูลดิบทั้งหมด) ให้ AI เขียน
  // บทสรุปสำหรับผู้บริหาร · เก็บผลไว้ต่อปีที่เลือก (render ซ้ำจาก realtime ไม่หาย) กดใหม่เพื่อสรุปใหม่ ──
  var _aiSummary = null; // { year, text, loading, error }
  function aioAiStatsText() {
    var issues = aioYearFilteredIssues();
    var st = function (arr) {
      var o = arr.filter(function (i) { return i.status !== 'closed'; }).length;
      return arr.length + ' ข้อ (ค้าง ' + o + ', แก้แล้ว ' + (arr.length ? Math.round((arr.length - o) / arr.length * 100) : 0) + '%)';
    };
    var byType = {};
    issues.forEach(function (i) { var k = aioProjectTypeId(i.projectId) || '__none__'; (byType[k] = byType[k] || []).push(i); });
    var lines = ['ปี: ' + (_selectedYear ? 'พ.ศ. ' + (Number(_selectedYear) + 543) : 'ทุกปี'), 'ภาพรวม: ' + st(issues)];
    Object.keys(byType).sort(function (a, b) { return byType[b].length - byType[a].length; }).forEach(function (k) {
      var arr = byType[k];
      var projN = {}; arr.forEach(function (i) { projN[i.projectId] = (projN[i.projectId] || 0) + 1; });
      lines.push('', '## ประเภท: ' + aioProductLabel(k) + ' — ' + Object.keys(projN).length + ' โครงการ, ' + st(arr));
      var top = function (field, n, title) {
        var c = {}; arr.forEach(function (i) { var v = i[field] || 'ไม่ระบุ'; (c[v] = c[v] || []).push(i); });
        var ks = Object.keys(c).sort(function (a, b) { return c[b].length - c[a].length; }).slice(0, n);
        lines.push(title + ': ' + ks.map(function (v) { return v + ' ' + st(c[v]); }).join(' · '));
        return { map: c, keys: ks };
      };
      var cats = top('category', 5, 'กลุ่มปัญหาที่พบมาก');
      top('department', 5, 'แผนกที่แจ้งมาก');
      lines.push('โครงการที่มีปัญหามากสุด: ' + Object.keys(projN).sort(function (a, b) { return projN[b] - projN[a]; }).slice(0, 3)
        .map(function (p) { return aioProjectLabel(p) + ' ' + projN[p] + ' ข้อ'; }).join(' · '));
      cats.keys.slice(0, 3).forEach(function (c) {
        lines.push('ตัวอย่างปัญหากลุ่ม "' + c + '": ' + cats.map[c].slice(0, 3).map(function (i) { return '"' + String(i.problem || '').slice(0, 90) + '"'; }).join(', '));
      });
    });
    return lines.join('\n');
  }
  window.aioRunAiSummary = async function () {
    if (_aiSummary && _aiSummary.loading) return;
    if (!aioYearFilteredIssues().length) { window.showAlert && window.showAlert('ยังไม่มีข้อมูลปัญหาในปีที่เลือก', 'warn'); return; }
    var year = _selectedYear;
    _aiSummary = { year: year, loading: true };
    window.renderAllIssuesOverview();
    try {
      var text = await window.aiChat(
        'คุณเป็นนักวิเคราะห์คุณภาพงานติดตั้งระบบซอฟต์แวร์โรงพยาบาล เขียนบทสรุปภาษาไทยสำหรับผู้บริหาร/PM จากสถิติปัญหาการใช้งานที่ให้ '
        + 'ใช้หัวข้อ "## ภาพรวม", "## ประเด็นสำคัญรายประเภทโครงการ", "## ข้อเสนอแนะ" · แต่ละหัวข้อเป็น bullet สั้น กระชับ อ้างตัวเลขจริง '
        + '· ข้อเสนอแนะ 3–5 ข้อ ต้องเจาะจง นำไปทำได้จริง (เช่น ปรับขั้นตอนติดตั้ง/อบรม/template) · ห้ามแต่งตัวเลขที่ไม่มีในข้อมูล',
        aioAiStatsText(), { maxTokens: 1200, temperature: 0.3 });
      _aiSummary = { year: year, text: text };
    } catch (e) {
      _aiSummary = { year: year, error: String(e.message || e) };
    }
    window.renderAllIssuesOverview();
  };
  window.aioCopyAiSummary = function () {
    if (!_aiSummary || !_aiSummary.text || !navigator.clipboard) return;
    navigator.clipboard.writeText(_aiSummary.text).then(function () { window.showAlert && window.showAlert('คัดลอกบทสรุปแล้ว', 'success'); });
  };
  function aioAiSummaryHtml() {
    if (!_aiSummary || _aiSummary.year !== _selectedYear) return '';
    var body = _aiSummary.loading ? '<div style="color:var(--txt3);font-size:12.5px;">⏳ AI กำลังวิเคราะห์ข้อมูล… (อาจใช้เวลาสักครู่)</div>'
      : _aiSummary.error ? '<div style="color:var(--coral);font-size:12.5px;">' + window.esc(_aiSummary.error) + '</div>'
      : '<div class="ai-text">' + window.aiTextToHtml(_aiSummary.text) + '</div>';
    return '<div style="padding:0 24px 24px;"><div class="ai-card">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">'
      +   '<div class="sec-label" style="margin:0;">🤖 บทสรุปจาก AI</div><div style="flex:1"></div>'
      +   (_aiSummary.text ? '<button class="btn btn-ghost btn-sm" onclick="window.aioCopyAiSummary()">📋 คัดลอก</button>' : '')
      +   '<button class="btn btn-ghost btn-sm" onclick="window.aioCloseAiSummary()">✕</button>'
      + '</div>' + body
      + (_aiSummary.text ? '<div style="font-size:10.5px;color:var(--txt3);margin-top:8px;">* สรุปโดย AI จากสถิติในหน้านี้ — ตรวจสอบก่อนนำไปใช้</div>' : '')
      + '</div></div>';
  }
  window.aioCloseAiSummary = function () { _aiSummary = null; window.renderAllIssuesOverview(); };

  // ── Render หลัก ── //
  window.renderAllIssuesOverview = function () {
    var mount = document.getElementById('view-all-issues');
    if (!mount) return;

    // ── กันเข้าถึงตรงในฟังก์ชัน render เอง — เผื่อกรณี URL hash ตรงเข้ามาโดยไม่ผ่าน goView ──
    if (!window.ce || !window.ce()) {
      mount.innerHTML = '<div class="aio-guard">🔒 หน้านี้จำกัดสิทธิ์เฉพาะ PM/Admin</div>';
      return;
    }

    var allIssues = aioYearFilteredIssues();
    var allProjects = window.IMPL_PROJECTS || [];
    var stOpen = aioIssueStatus('open'), stProg = aioIssueStatus('in_progress'), stClosed = aioIssueStatus('closed');

    // ── ตัวเลือกปี พ.ศ. — สร้างจากปีที่มีข้อมูลปัญหาจริง (ค.ศ. เก็บเป็น value ใน DB, label แปลงเป็น พ.ศ.) ──
    var yearSet = {};
    (window.IMPL_ISSUES || []).forEach(function (i) { var y = (i.createdAt || '').slice(0, 4); if (y) yearSet[y] = true; });
    yearSet[String(new Date().getFullYear())] = true; // เผื่อยังไม่มีปัญหาปีนี้เลย ให้ตัวเลือกปีปัจจุบันยังเลือกได้เสมอ (ค่า default)
    var years = Object.keys(yearSet).sort(function (a, b) { return b - a; });
    var yearOptionsHtml = '<option value="">ทุกปี</option>' + years.map(function (y) {
      return '<option value="' + y + '"' + (_selectedYear === y ? ' selected' : '') + '>พ.ศ. ' + (Number(y) + 543) + '</option>';
    }).join('');
    var yearBar = '<div class="toolbar">'
      + '<span style="font-size:12.5px;font-weight:700;color:var(--txt2);">ปี</span>'
      + '<select class="t-sel" id="aio-f-year" onchange="window.aioSetYear(this.value)">' + yearOptionsHtml + '</select>'
      + '<div style="flex:1"></div>'
      + '<button class="btn btn-pri btn-sm" onclick="window.aioRunAiSummary()"' + (_aiSummary && _aiSummary.loading ? ' disabled' : '') + '>🤖 สรุปด้วย AI</button>'
      + '</div>';

    // ── จัดกลุ่มปัญหาตาม Product (ประเภทโครงการ) ──
    var productMap = {};
    allIssues.forEach(function (i) {
      var tid = aioProjectTypeId(i.projectId);
      var key = tid || '__none__';
      if (!productMap[key]) productMap[key] = { key: key, label: tid ? aioTypeLabel(tid) : 'ไม่ระบุประเภท', issues: [] };
      productMap[key].issues.push(i);
    });
    var products = Object.keys(productMap).map(function (k) { return productMap[k]; })
      .sort(function (a, b) { return b.issues.length - a.issues.length; });
    products.forEach(function (p, idx) { p.color = PRODUCT_COLORS[idx % PRODUCT_COLORS.length]; });

    // ── KPI 5 ใบ ──
    var total = allIssues.length;
    var openN = allIssues.filter(function (i) { return i.status === 'open'; }).length;
    var progN = allIssues.filter(function (i) { return i.status === 'in_progress'; }).length;
    var closedN = allIssues.filter(function (i) { return i.status === 'closed'; }).length;
    var rate = total ? Math.round(closedN / total * 100) : 0;
    var projectCount = allProjects.length;

    var kpiRow = '<div class="stat-row aio-stat-row" id="aio-stat-row">'
      + aioStatCard('var(--violet)', 'ปัญหาทั้งหมด', total, 'จาก ' + projectCount + ' โครงการ', null, "window.aioDrillStatus('')")
      + aioStatCard(stOpen.color, 'รอดำเนินการ', openN, 'ต้องดำเนินการด่วน', null, "window.aioDrillStatus('open')")
      + aioStatCard(stProg.color, 'กำลังแก้ไข', progN, 'อยู่ระหว่างดำเนินการ', null, "window.aioDrillStatus('in_progress')")
      + aioStatCard(stClosed.color, 'เสร็จแล้ว', closedN, 'แก้ไขสำเร็จ', null, "window.aioDrillStatus('closed')")
      + aioStatCard('var(--indigo)', 'อัตราแก้ไข', rate + '%', '', rate)
      + '</div>';

    // ── การ์ดสรุปต่อ Product ──
    var productCardsHtml = products.length ? '<div class="aio-prod-grid">' + products.map(function (p) {
      var pOpen = p.issues.filter(function (i) { return i.status === 'open'; }).length;
      var pProg = p.issues.filter(function (i) { return i.status === 'in_progress'; }).length;
      var pClosed = p.issues.filter(function (i) { return i.status === 'closed'; }).length;
      var pTotal = p.issues.length;
      var pct = pTotal ? Math.round(pClosed / pTotal * 100) : 0;
      return '<div class="aio-prod-card" onclick="window.aioDrillProduct(\'' + p.key + '\')" style="border-top-color:' + p.color + ';cursor:pointer;">'
        + '<div class="aio-prod-name" style="color:' + p.color + ';">' + window.esc(p.label) + '</div>'
        + '<div class="aio-prod-total">' + pTotal + '</div>'
        + '<div class="aio-prod-total-sub">รายการทั้งหมด</div>'
        + '<div class="aio-prod-mini">'
        +   '<div class="aio-prod-mini-item" style="color:' + stOpen.color + ';"><b>' + pOpen + '</b><span>รอ</span></div>'
        +   '<div class="aio-prod-mini-item" style="color:' + stProg.color + ';"><b>' + pProg + '</b><span>แก้ไข</span></div>'
        +   '<div class="aio-prod-mini-item" style="color:' + stClosed.color + ';"><b>' + pClosed + '</b><span>เสร็จ</span></div>'
        + '</div>'
        + '<div class="pbar" style="margin-top:10px;"><div class="pbar-fill" style="width:' + pct + '%;background:' + stClosed.color + ';"></div></div>'
        + '<div class="aio-prod-pct">' + pct + '%</div>'
        + '</div>';
    }).join('') + '</div>' : '<div class="aio-empty">ยังไม่มีข้อมูลปัญหาบันทึกไว้ในระบบ</div>';

    // ── กราฟ 1: สถานะต่อ Product ──
    var statusRows = products.map(function (p) {
      return { key: p.key, label: p.label, values: {
        open: p.issues.filter(function (i) { return i.status === 'open'; }).length,
        in_progress: p.issues.filter(function (i) { return i.status === 'in_progress'; }).length,
        closed: p.issues.filter(function (i) { return i.status === 'closed'; }).length,
      } };
    });
    var statusChartHtml = products.length ? aioStackedHBar(statusRows, ['open', 'in_progress', 'closed'], {
      open: { label: stOpen.label, color: stOpen.color },
      in_progress: { label: stProg.label, color: stProg.color },
      closed: { label: stClosed.label, color: stClosed.color },
    }, {
      rowClick: function (pkey) { return "window.aioDrillProduct('" + pkey + "')"; },
      segClick: function (pkey, status) { return "window.aioDrillProductStatus('" + pkey + "','" + status + "')"; },
    }) : '<div class="aio-empty">-</div>';

    // ── กราฟ 2: กลุ่มปัญหาต่อ Product (Top 7 ภาพรวมทุก Product) ──
    var catCounts = {};
    allIssues.forEach(function (i) { var c = i.category || 'ไม่ระบุ'; catCounts[c] = (catCounts[c] || 0) + 1; });
    var top7Cats = Object.keys(catCounts).sort(function (a, b) { return catCounts[b] - catCounts[a]; }).slice(0, 7);
    var catMeta = {};
    top7Cats.forEach(function (c, idx) { catMeta[c] = { label: c, color: CAT_COLORS[idx % CAT_COLORS.length] }; });
    var catRows = products.map(function (p) {
      var values = {};
      top7Cats.forEach(function (c) {
        values[c] = p.issues.filter(function (i) { return (i.category || 'ไม่ระบุ') === c; }).length;
      });
      return { key: p.key, label: p.label, values: values };
    });
    var catChartHtml = top7Cats.length ? aioStackedHBar(catRows, top7Cats, catMeta, {
      rowClick: function (pkey) { return "window.aioDrillProduct('" + pkey + "')"; },
      segClick: function (pkey, cat) { return "window.aioDrillProductCategory('" + pkey + "','" + aioJsStr(cat) + "')"; },
    }) : '<div class="aio-empty">ยังไม่มีข้อมูลกลุ่มปัญหา</div>';

    // ── ตารางสรุปรายโครงการ — 1 โครงการ = 1 ประเภทอยู่แล้ว จึงไม่แยกคอลัมน์ตาม Product (เดิมเป็นเมทริกซ์
    // โครงการ × Product ที่มีช่องว่าง "—" เต็มตาราง อ่านยาก) แสดงประเภทเป็นป้ายสีในแถวแทน + แถบสถานะ +
    // กลุ่มปัญหาที่พบบ่อยสุดของโครงการนั้น — คลิกแถวไปแท็บ "ปัญหา" ของโครงการใน Impl Tracker ──
    var projRowMap = {};
    allIssues.forEach(function (i) {
      if (!projRowMap[i.projectId]) projRowMap[i.projectId] = { pid: i.projectId, label: aioProjectLabel(i.projectId), pkey: aioProjectTypeId(i.projectId) || '__none__', issues: [] };
      projRowMap[i.projectId].issues.push(i);
    });
    // ── จัดกลุ่มแถวตามประเภทโครงการ (ลำดับกลุ่มตาม products = ประเภทที่มีปัญหามากสุดก่อน) — หัวกลุ่มแสดง
    // ยอดรวมของประเภทในคอลัมน์เดียวกับแถวโครงการ (จำนวน/แถบสถานะ/% แก้ไข/พบบ่อยสุด) · ในกลุ่มเรียงโครงการ
    // ที่มีปัญหามากสุดก่อน ลำดับนับใหม่ในแต่ละกลุ่ม ──
    function aioSumRow(issues) {
      var n = issues.length;
      var o = issues.filter(function (i) { return i.status === 'open'; }).length;
      var pr = issues.filter(function (i) { return i.status === 'in_progress'; }).length;
      var c = issues.filter(function (i) { return i.status === 'closed'; }).length;
      var catN = {};
      issues.forEach(function (i) { var k = i.category || 'ไม่ระบุ'; catN[k] = (catN[k] || 0) + 1; });
      var topCat = Object.keys(catN).sort(function (x, y) { return catN[y] - catN[x]; })[0];
      var seg = function (v, color, lbl) { return v ? '<div style="width:' + (v / n * 100) + '%;background:' + color + ';" title="' + window.esc(lbl) + ': ' + v + '"></div>' : ''; };
      var pct = n ? Math.round(c / n * 100) : 0;
      return '<td style="text-align:center;font-weight:800;font-size:14px;">' + n + '</td>'
        + '<td style="min-width:180px;"><div class="aio-mini-stack">' + seg(o, stOpen.color, stOpen.label) + seg(pr, stProg.color, stProg.label) + seg(c, stClosed.color, stClosed.label) + '</div>'
        +   '<div class="aio-mini-stack-lbl"><span style="color:' + stOpen.color + ';">รอ ' + o + '</span> · <span style="color:' + stProg.color + ';">แก้ไข ' + pr + '</span> · <span style="color:' + stClosed.color + ';">เสร็จ ' + c + '</span></div></td>'
        + '<td style="text-align:center;font-weight:700;color:' + (pct === 100 ? stClosed.color : 'var(--txt)') + ';">' + pct + '%</td>'
        + '<td style="font-size:12px;">' + (topCat ? window.esc(topCat) + ' <span style="color:var(--txt3);">(' + catN[topCat] + ')</span>' : '-') + '</td>';
    }
    var allProjRows = Object.keys(projRowMap).map(function (k) { return projRowMap[k]; });
    var projTableBody = allProjRows.length ? products.map(function (p) {
      var rows = allProjRows.filter(function (r) { return r.pkey === p.key; })
        .sort(function (a, b) { return b.issues.length - a.issues.length || a.label.localeCompare(b.label, 'th'); });
      if (!rows.length) return '';
      // ── หัวกลุ่ม = แถบสีเต็มแถว + สรุปเป็นข้อความ (ไม่ใช้แถบกราฟ/คอลัมน์ซ้ำแบบแถวโครงการ ให้แยกออกชัด) ──
      var gN = p.issues.length;
      var gOpen = p.issues.filter(function (i) { return i.status !== 'closed'; }).length;
      var gPct = gN ? Math.round((gN - gOpen) / gN * 100) : 0;
      var gCat = {};
      p.issues.forEach(function (i) { var k = i.category || 'ไม่ระบุ'; gCat[k] = (gCat[k] || 0) + 1; });
      var gTop = Object.keys(gCat).sort(function (x, y) { return gCat[y] - gCat[x]; })[0];
      var headHtml = '<tr class="aio-proj-grouphead" onclick="window.aioDrillProduct(\'' + p.key + '\')" style="--gc:' + p.color + ';" title="คลิกดูปัญหาทั้งหมดของประเภทนี้">'
        + '<td colspan="6"><div class="aio-gh">'
        +   '<span class="aio-gh-name"><i></i>' + window.esc(p.label) + '</span>'
        +   '<span class="aio-gh-chip">' + rows.length + ' โครงการ</span>'
        +   '<span class="aio-gh-chip">' + gN + ' ปัญหา</span>'
        +   '<span class="aio-gh-chip" style="color:' + (gOpen ? stOpen.color : stClosed.color) + ';">' + (gOpen ? 'ค้าง ' + gOpen : '✓ แก้ครบ') + ' · ' + gPct + '%</span>'
        +   (gTop ? '<span class="aio-gh-chip">🔥 พบบ่อยสุด: ' + window.esc(gTop) + ' (' + gCat[gTop] + ')</span>' : '')
        + '</div></td>'
        + '</tr>';
      return headHtml + rows.map(function (row, idx) {
        return '<tr onclick="window.aioShowProjectIssues(\'' + row.pid + '\')" style="cursor:pointer;">'
          + '<td style="text-align:center;color:var(--txt3);">' + (idx + 1) + '</td>'
          + '<td class="aio-matrix-hname" style="white-space:normal;">' + window.esc(row.label) + '</td>'
          + aioSumRow(row.issues)
          + '</tr>';
      }).join('');
    }).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--txt3);padding:30px;">ยังไม่มีข้อมูลปัญหา</td></tr>';

    var matrixHtml = '<div class="dtable-inner" style="overflow-x:auto;">'
      + '<table class="aio-matrix-tbl"><thead><tr><th style="width:60px;">ลำดับ</th><th>โครงการ</th><th style="text-align:center;">ปัญหา</th><th>สถานะ</th><th style="text-align:center;">แก้ไขแล้ว</th><th>พบบ่อยสุด</th></tr></thead>'
      + '<tbody>' + projTableBody + '</tbody></table>'
      + '</div>';

    // ── วิเคราะห์ปัญหาตามประเภทโครงการ — 1 การ์ดต่อประเภท: อันดับกลุ่มปัญหา (หรือแผนกที่แจ้ง) จากมากไปน้อย
    // ไฮไลต์อันดับ 1 "พบมากที่สุด" ให้เห็นทันทีว่าประเภทนี้ต้องแก้เรื่องอะไรก่อน · แถบแต่ละแถวแยกสีส่วนที่
    // แก้เสร็จแล้ว (สีประเภท) / ยังค้าง (สีรอดำเนินการ) · คลิกแถวเปิดรายการปัญหา ──
    var dimLabel = _anaDim === 'department' ? 'แผนกที่แจ้ง' : 'กลุ่มปัญหา';
    var dimOf = function (i) { return (_anaDim === 'department' ? i.department : i.category) || 'ไม่ระบุ'; };
    var ANA_TOP = 8;
    var anaCardsHtml = products.map(function (p) {
      var cnt = {}, pend = {};
      p.issues.forEach(function (i) { var k = dimOf(i); cnt[k] = (cnt[k] || 0) + 1; if (i.status !== 'closed') pend[k] = (pend[k] || 0) + 1; });
      var keys = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a] || a.localeCompare(b, 'th'); });
      var shown = keys.slice(0, ANA_TOP), rest = keys.slice(ANA_TOP);
      var restN = rest.reduce(function (s, k) { return s + cnt[k]; }, 0);
      var max = cnt[keys[0]] || 1, tot = p.issues.length;
      var rowsHtml = shown.map(function (k, idx) {
        var v = cnt[k], pv = pend[k] || 0, done = v - pv;
        var click = _anaDim === 'department'
          ? "window.aioDrillProductDept('" + p.key + "','" + aioJsStr(k) + "')"
          : "window.aioDrillProductCategory('" + p.key + "','" + aioJsStr(k) + "')";
        return '<div class="aio-ana-row' + (idx === 0 ? ' top' : '') + '" onclick="' + window.esc(click) + '">'
          + '<div class="aio-ana-rank">' + (idx + 1) + '</div>'
          + '<div class="aio-ana-lbl" title="' + window.esc(k) + '">' + window.esc(k) + '</div>'
          + '<div class="aio-ana-track"><div style="width:' + (v / max * 100) + '%;display:flex;height:100%;">'
          +   '<div style="flex:' + done + ';background:' + p.color + ';" title="แก้เสร็จแล้ว ' + done + '"></div>'
          +   '<div style="flex:' + pv + ';background:' + stOpen.color + ';" title="ยังค้าง ' + pv + '"></div>'
          + '</div></div>'
          + '<div class="aio-ana-val"><b>' + v + '</b> <span>' + Math.round(v / tot * 100) + '%</span></div>'
          + '</div>';
      }).join('') + (restN ? '<div class="aio-ana-rest">+ อื่น ๆ อีก ' + rest.length + ' ' + dimLabel + ' (' + restN + ' ข้อ)</div>' : '');
      var topK = keys[0];
      return '<div class="aio-ana-card" style="border-top-color:' + p.color + ';">'
        + '<div class="aio-ana-head"><span style="color:' + p.color + ';">' + window.esc(p.label) + '</span><span class="aio-ana-cnt">' + tot + ' ข้อ</span></div>'
        + (topK ? '<div class="aio-ana-top">🔥 พบมากที่สุด: <b>' + window.esc(topK) + '</b> ' + cnt[topK] + ' ข้อ (' + Math.round(cnt[topK] / tot * 100) + '%)'
          + ((pend[topK] || 0) ? ' · ยังค้าง <b style="color:' + stOpen.color + ';">' + pend[topK] + '</b>' : '') + '</div>' : '')
        + rowsHtml
        + '</div>';
    }).join('');
    var dimBtn = function (dim, lbl) {
      var on = (_anaDim === 'department') === (dim === 'department');
      return '<button class="btn btn-sm" onclick="window.aioSetAnaDim(\'' + dim + '\')" style="' + (on ? 'background:var(--violet);color:#fff;' : 'background:var(--surface2);color:var(--txt2);') + '">' + lbl + '</button>';
    };
    var anaHtml = products.length ? '<div style="padding:0 24px 24px;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px;">'
      +   '<div class="sec-label">🔍 วิเคราะห์ปัญหาตามประเภทโครงการ — ' + dimLabel + 'ที่พบมากที่สุด</div>'
      +   '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">'
      +     '<span class="aio-legend-item"><i style="background:var(--txt3);"></i>แก้เสร็จแล้ว (สีประเภท)</span>'
      +     '<span class="aio-legend-item" style="margin-right:8px;"><i style="background:' + stOpen.color + ';"></i>ยังค้าง</span>'
      +     dimBtn('category', 'ตามกลุ่มปัญหา') + dimBtn('department', 'ตามแผนกที่แจ้ง')
      +   '</div>'
      + '</div>'
      + '<div class="aio-ana-grid">' + anaCardsHtml + '</div>'
      + '</div>' : '';

    // ── กราฟแนวโน้มปัญหา (รายสัปดาห์/รายเดือน ย้อนหลัง) ──
    var trendData = aioComputeTrend();
    var trendMeta = {
      open: { label: stOpen.label, color: stOpen.color },
      in_progress: { label: stProg.label, color: stProg.color },
      closed: { label: stClosed.label, color: stClosed.color },
      total: { label: 'รวม', color: '#7c5cfc' },
    };
    var periodLabel = _trendMode === 'month' ? 'เดือน' : 'สัปดาห์';
    var trendLegendHtml = ['open', 'in_progress', 'closed', 'total'].map(function (k) {
      return '<span class="aio-legend-item"><i style="background:' + trendMeta[k].color + '"></i>' + window.esc(trendMeta[k].label) + '</span>';
    }).join('');
    var trendHtml = '<div class="dtable-inner" style="padding:18px;margin:0 24px 24px;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px;">'
      +   '<div class="sec-label">📈 แนวโน้มปัญหา — ย้อนหลัง ' + TREND_PERIODS + ' ' + periodLabel + '</div>'
      +   '<div style="display:flex;gap:6px;">'
      +     '<button class="btn btn-sm" onclick="window.aioSetTrendMode(\'week\')" style="' + (_trendMode === 'week' ? 'background:var(--violet);color:#fff;' : 'background:var(--surface2);color:var(--txt2);') + '">รายสัปดาห์</button>'
      +     '<button class="btn btn-sm" onclick="window.aioSetTrendMode(\'month\')" style="' + (_trendMode === 'month' ? 'background:var(--violet);color:#fff;' : 'background:var(--surface2);color:var(--txt2);') + '">รายเดือน</button>'
      +   '</div>'
      + '</div>'
      + '<div class="aio-legend" style="margin-bottom:12px;">' + trendLegendHtml + '</div>'
      + aioTrendChartSvg(trendData, ['open', 'in_progress', 'closed', 'total'], trendMeta)
      + '</div>';

    mount.innerHTML = yearBar
      + kpiRow
      + aioAiSummaryHtml()
      + productCardsHtml
      + '<div class="aio-chart-grid-2">'
      +   '<div class="dtable-inner" style="padding:18px;"><div class="sec-label" style="margin-bottom:14px;">📊 สถานะต่อ Product</div>' + statusChartHtml + '</div>'
      +   '<div class="dtable-inner" style="padding:18px;"><div class="sec-label" style="margin-bottom:14px;">🏷️ กลุ่มปัญหาต่อ Product (Top 7)</div>' + catChartHtml + '</div>'
      + '</div>'
      + anaHtml
      + trendHtml
      + '<div style="padding:0 24px 24px;">'
      +   '<div class="sec-label" style="margin-bottom:12px;">📋 สถานะรายโครงการ</div>'
      +   matrixHtml
      + '</div>';
  };

})();
