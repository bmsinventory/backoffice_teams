/**
 * all-issues.js — เมนู "ปัญหาทุกโครงการ" (all_issues)
 * ภาพรวมปัญหาการใช้งานโปรแกรม (IMPL_ISSUES) ข้ามทุกโครงการ สำหรับมุมมอง PM
 * จำกัดสิทธิ์แบบตายตัวด้วย window.ce() (PM/Admin เท่านั้น) — ดูเหตุผลใน router.js/routes.config.js
 * (ไม่ได้ลงทะเบียนใน PERM_MODULES ตั้งใจ ไม่ต้องการให้ Admin ไปเปิดสิทธิ์ผ่าน Admin Panel ได้)
 *
 * ดีไซน์ตามตัวอย่างที่ผู้ใช้ส่งมา (อ้างอิงระบบภายนอก): ตัวกรองปี พ.ศ. → KPI 5 ใบ → การ์ดสรุปต่อ
 * "Product" (= ประเภทโครงการ window.PROJECTS.typeId/PTYPES ที่มีอยู่แล้ว ไม่ได้เพิ่ม field ใหม่ในฐานข้อมูล)
 * → กราฟแท่งแนวนอนแบบ stacked 2 กราฟ (สถานะต่อ Product / กลุ่มปัญหาต่อ Product Top 7)
 * → ตารางเมทริกซ์ โครงการ × Product (ใช้ IMPL_PROJECTS.name ตรง ๆ เป็นชื่อแถว — เคยลองอ่าน
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
  window.aioShowIssueDetail = function (list, title) {
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
      var headHtml = '<tr class="aio-detail-grouphead"><td colspan="5">🗂️ ' + window.esc(label) + ' <span class="aio-detail-groupcount">(' + items.length + ' รายการ)</span></td></tr>';
      var itemsHtml = items.map(function (i, idx) {
        var st = aioIssueStatus(i.status);
        return '<tr onclick="window.aioGoProjectIssues(\'' + i.projectId + '\')">'
          + '<td style="text-align:center;">' + (idx + 1) + '</td>'
          + '<td style="min-width:200px;max-width:420px;white-space:normal;overflow-wrap:anywhere;">' + window.esc(i.problem || '') + '</td>'
          + '<td><span class="tag">' + window.esc(i.category || '-') + '</span></td>'
          + '<td><span class="tag" style="background:' + st.color + '18;color:' + st.color + '">' + window.esc(st.label) + '</span></td>'
          + '<td style="white-space:nowrap;">' + window.fd(i.createdAt) + '</td>'
          + '</tr>';
      }).join('');
      return headHtml + itemsHtml;
    }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--txt3);padding:24px;">ไม่มีข้อมูล</td></tr>';

    body.innerHTML = '<div class="dtable-inner"><table class="imt-issues-tbl"><thead><tr>'
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

    // ── ตารางเมทริกซ์ โครงการ × Product ──
    var projRowMap = {};
    allIssues.forEach(function (i) {
      var label = aioProjectLabel(i.projectId);
      var pkey = aioProjectTypeId(i.projectId) || '__none__';
      if (!projRowMap[label]) projRowMap[label] = { label: label, byProduct: {} };
      (projRowMap[label].byProduct[pkey] = projRowMap[label].byProduct[pkey] || []).push(i);
    });
    function projRowTotal(row) {
      return Object.keys(row.byProduct).reduce(function (s, k) { return s + row.byProduct[k].length; }, 0);
    }
    var projRows = Object.keys(projRowMap).map(function (label) { return projRowMap[label]; })
      .sort(function (a, b) { return projRowTotal(b) - projRowTotal(a); });

    var matrixHeadHtml = '<th>ลำดับ</th><th>โครงการ</th>' + products.map(function (p) {
      return '<th><span class="aio-matrix-dot" style="background:' + p.color + ';"></span>' + window.esc(p.label) + '</th>';
    }).join('');
    var matrixBodyHtml = projRows.length ? projRows.map(function (row, idx) {
      var cells = products.map(function (p) {
        var list = row.byProduct[p.key] || [];
        if (!list.length) return '<td class="aio-matrix-empty">—</td>';
        var o = list.filter(function (i) { return i.status === 'open'; }).length;
        var pr = list.filter(function (i) { return i.status === 'in_progress'; }).length;
        var c = list.filter(function (i) { return i.status === 'closed'; }).length;
        var ok = o === 0 && pr === 0;
        // ── เซลล์นี้รู้โครงการแน่ชัด (list ทุกตัวอยู่โครงการเดียวกัน) พาไปแท็บ "ปัญหา" ของโครงการนั้น
        // ใน Impl Tracker ตรง ๆ ดีกว่าเปิด modal อ่านอย่างเดียว เพราะแก้ไข/ปิดงานได้จริง ──
        return '<td><div class="aio-matrix-cell ' + (ok ? 'ok' : 'warn') + '" onclick="window.aioGoProjectIssues(\'' + list[0].projectId + '\')" style="cursor:pointer;">'
          + '<div class="aio-matrix-cell-top"><span class="led" style="background:' + (ok ? stClosed.color : stOpen.color) + ';"></span><b>' + list.length + '</b> ข้อ</div>'
          + '<div class="aio-matrix-cell-sub">รอ ' + o + ' แก้ไข ' + pr + ' เสร็จ ' + c + '</div>'
          + '</div></td>';
      }).join('');
      return '<tr><td style="text-align:center;color:var(--txt3);">' + (idx + 1) + '</td><td class="aio-matrix-hname">' + window.esc(row.label) + '</td>' + cells + '</tr>';
    }).join('') : '<tr><td colspan="' + (products.length + 2) + '" style="text-align:center;color:var(--txt3);padding:30px;">ยังไม่มีข้อมูลปัญหา</td></tr>';

    var matrixHtml = '<div class="dtable-inner" style="overflow-x:auto;">'
      + '<table class="aio-matrix-tbl"><thead><tr>' + matrixHeadHtml + '</tr></thead><tbody>' + matrixBodyHtml + '</tbody></table>'
      + '</div>';

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
      + productCardsHtml
      + '<div class="aio-chart-grid-2">'
      +   '<div class="dtable-inner" style="padding:18px;"><div class="sec-label" style="margin-bottom:14px;">📊 สถานะต่อ Product</div>' + statusChartHtml + '</div>'
      +   '<div class="dtable-inner" style="padding:18px;"><div class="sec-label" style="margin-bottom:14px;">🏷️ กลุ่มปัญหาต่อ Product (Top 7)</div>' + catChartHtml + '</div>'
      + '</div>'
      + trendHtml
      + '<div style="padding:0 24px 24px;">'
      +   '<div class="sec-label" style="margin-bottom:12px;">📋 สถานะรายโครงการ × Product</div>'
      +   matrixHtml
      + '</div>';
  };

})();
