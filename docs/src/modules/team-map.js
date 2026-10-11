/**
 * team-map.js — 🗺 แผนที่ทีม (module 'team_map') — แผนที่ประเทศไทย 3 มิติ ว่าทีมลงพื้นที่จังหวัดไหน เดือนไหน เดินทางเส้นทางไหน
 *   จังหวัดที่มีงานยกสูง/สีเข้มตามคน·วัน · เส้นโค้ง = เส้นทางของแต่ละคน (สำนักงาน → รพ. ตามลำดับวัน → สำนักงาน)
 *   แถบวัน: เล่น/ลากดูว่าวันไหนใครอยู่ที่ไหน · คลิกชื่อคน = ดูเส้นทางคนเดียว + ลำดับจุด
 *
 * ข้อมูล: PROJECTS (hospitalId · members[{sid,s,e}] หรือ team + start/end · visits[{start,end,team}])
 *        → HOSPITALS (lat/lng ถ้ามี ไม่งั้นกลางจังหวัดจาก province) · STAFF
 * แผนที่จังหวัด: data/th-provinces.json · three.js โหลดจาก CDN ตอนเปิดหน้าครั้งแรก
 * สิทธิ์: ดู = เปิดหน้าแผนที่
 */
(function () {

  var esc = function (s) { return window.esc(s); };
  var OFFICE = { name: 'สำนักงาน BMS', province: 'กรุงเทพมหานคร', lat: 13.6723144, lng: 100.5086607 }; // จาก Google Maps ของบริษัท
  var REGION = { N: 'เหนือ', I: 'อีสาน', C: 'กลาง', E: 'ตะวันออก', S: 'ใต้' };
  var M_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  var M_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  var PALETTE = ['#5ec8f2','#f472b6','#7ddc6f','#a78bfa','#2dd4bf','#ff6b6b','#7aa2ff','#d9f99d','#fbbf24','#fb923c','#e879f9','#94e2ff'];
  var LIBS = [
    'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
    'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'
  ];

  var GEO = null;          // จังหวัด → { r: ภาค, g: [ring] }
  var CENT = {};           // จังหวัด → [lng, lat]
  var S = null;            // ฉาก three.js
  var st = { mi: 0, day: 1, playing: false, sel: null, routes: true, height: true, dept: '', hover: null };
  var MONTHS = [], D = null, _loading = null, _running = false;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var pad = function (n) { return String(n).padStart(2, '0'); };
  var hashColor = function (id) { var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return PALETTE[Math.abs(h) % PALETTE.length]; };

  // ── โหลด three.js + แผนที่จังหวัด (ครั้งเดียว) ──
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src;
      s.onload = res; s.onerror = function () { s.remove(); rej(new Error(src)); };
      document.head.appendChild(s);
    });
  }
  function ensureLoaded() {
    if (!_loading) {
      _loading = (async function () {
        if (!window.THREE) await loadScript(LIBS[0]);
        if (!window.THREE.OrbitControls) await loadScript(LIBS[1]);
        var r = await fetch('data/th-provinces.json');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        GEO = await r.json();
        Object.keys(GEO).forEach(function (p) {
          var big = GEO[p].g.reduce(function (a, b) { return Math.abs(ringArea(b)) > Math.abs(ringArea(a)) ? b : a; });
          CENT[p] = ringCentroid(big);
        });
        CENT['กรุงเทพมหานคร'] = [100.52, 13.76];
      })().catch(function (e) { _loading = null; throw e; });
    }
    return _loading;
  }
  function ringArea(r) { var a = 0; for (var i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; }
  function ringCentroid(r) {
    var a = 0, cx = 0, cy = 0;
    for (var i = 0; i < r.length - 1; i++) { var f = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; a += f; cx += (r[i][0] + r[i + 1][0]) * f; cy += (r[i][1] + r[i + 1][1]) * f; }
    a /= 2; return [cx / (6 * a), cy / (6 * a)];
  }
  function haversine(a, b) {
    var R = 6371, t = Math.PI / 180, dLa = (b[1] - a[1]) * t, dLo = (b[0] - a[0]) * t;
    var s = Math.pow(Math.sin(dLa / 2), 2) + Math.cos(a[1] * t) * Math.cos(b[1] * t) * Math.pow(Math.sin(dLo / 2), 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // ── ข้อมูล ──
  // ช่วงเวลาที่ดูได้ของปี y: ลำดับ 0–11 = ม.ค.–ธ.ค. · 12 = ทั้งปี  (dim = จำนวนวันในช่วง, วันที่ 1 = first)
  var YEAR_I = 12;
  function buildPeriods(y) {
    var now = new Date(), out = [];
    for (var m = 0; m < 12; m++) {
      var dim = new Date(y, m + 1, 0).getDate(), key = y + '-' + pad(m + 1);
      out.push({ key: key, y: y, m: m, dim: dim, first: key + '-01', last: key + '-' + pad(dim), now: y === now.getFullYear() && m === now.getMonth() });
    }
    out.push({ key: String(y), y: y, m: -1, year: true, dim: new Date(y, 1, 29).getMonth() === 1 ? 366 : 365, first: y + '-01-01', last: y + '-12-31' });
    return out;
  }
  function dayOf(M, s) { return Math.round((Date.parse(s.slice(0, 10)) - Date.parse(M.first)) / 864e5) + 1; }
  function dateOf(M, n) { var d = new Date(Date.parse(M.first) + (n - 1) * 864e5); return { d: d.getUTCDate(), m: d.getUTCMonth(), y: d.getUTCFullYear() }; }
  var _hspById = {};
  function hospitalOf(p) {
    var hid = p.hospitalId;
    if (!hid && p.parentProjectId) { var par = (window.PROJECTS || []).find(function (x) { return x.id === p.parentProjectId; }); hid = par && par.hospitalId; }
    return hid ? _hspById[hid] : null;
  }
  // ตำแหน่ง รพ. [lng, lat] · real = มีพิกัดจริง
  var _posCache = {};
  function hospPos(h) {
    if (_posCache[h.id]) return _posCache[h.id];
    var p;
    if (h.lat != null && h.lng != null) p = { ll: [h.lng, h.lat], real: true };
    else {
      var c = CENT[h.province], same = (window.HOSPITALS || []).filter(function (x) { return x.province === h.province && (x.lat == null); });
      var i = Math.max(0, same.indexOf(h)), n = Math.min(same.length, 8), ang = (i % 8) / Math.max(1, n) * Math.PI * 2;
      p = { ll: [c[0] + (n > 1 ? Math.cos(ang) * .12 : 0), c[1] + (n > 1 ? Math.sin(ang) * .12 : 0)], real: false };
    }
    return (_posCache[h.id] = p);
  }
  var placeLL = function (id) { return id === 'HQ' ? [OFFICE.lng, OFFICE.lat] : hospPos(_hspById[id]).ll; };
  var placeProv = function (id) { return id === 'HQ' ? OFFICE.province : _hspById[id].province; };
  var placeName = function (id) { return id === 'HQ' ? OFFICE.name : _hspById[id].name; };

  // โครงการ → ช่วงที่แต่ละคนอยู่ รพ. ในช่วงที่เลือก (เดือน/ทั้งปี) { sid: [{hid, sd, ed, title}] }
  function tripsFor(M) {
    var first = M.first, last = M.last, by = {}, seen = {}, skipped = 0;
    var staffOk = {};
    (window.STAFF || []).forEach(function (s) { if (!st.dept || deptName(s) === st.dept) staffOk[s.id] = s; });
    (window.PROJECTS || []).forEach(function (p) {
      var stints = (p.members && p.members.length ? p.members : (p.team || []).map(function (id) { return { sid: id }; }))
        .map(function (m) { return { sid: m.sid, s: m.s || p.start, e: m.e || p.end || m.s || p.start }; });
      (p.visits || []).forEach(function (v) {
        if (v.status === 'cancelled') return;
        window._vtMembers(v.team, v.start, v.end).forEach(function (m) { stints.push({ sid: m.sid, s: m.s, e: m.e || m.s }); });
      });
      stints = stints.filter(function (x) { return x.sid && x.s && x.e >= first && x.s <= last; });
      if (!stints.length) return;
      var h = hospitalOf(p);
      if (!h || !CENT[h.province]) { skipped++; return; }
      stints.forEach(function (x) {
        if (!staffOk[x.sid]) return;
        var sd = x.s < first ? 1 : dayOf(M, x.s), ed = x.e > last ? M.dim : dayOf(M, x.e);
        var k = x.sid + '|' + h.id + '|' + sd + '|' + ed;
        if (seen[k] || !(sd >= 1) || !(ed >= sd)) return; seen[k] = 1;
        (by[x.sid] = by[x.sid] || []).push({ hid: h.id, sd: sd, ed: ed, title: p.name });
      });
    });
    Object.keys(by).forEach(function (k) { by[k].sort(function (a, b) { return a.sd - b.sd || a.ed - b.ed; }); });
    return { by: by, skipped: skipped };
  }

  function computeMonth(M) {
    var T = tripsFor(M), trips = T.by;
    var pdProv = {}, pdReg = { N: 0, I: 0, C: 0, E: 0, S: 0 }, hosps = {}, provs = {}, per = {}, total = 0, real = 0;
    Object.keys(trips).forEach(function (sid) {
      var t = trips[sid];
      // ลำดับจุด: สำนักงาน → รพ. → (กลับสำนักงานถ้าว่าง > 3 วัน) → … → สำนักงาน
      var way = [{ id: 'HQ', sd: 0, ed: 0 }];
      t.forEach(function (x) {
        var prov = _hspById[x.hid].province, d = x.ed - x.sd + 1;
        pdProv[prov] = (pdProv[prov] || 0) + d; pdReg[GEO[prov].r] += d; provs[prov] = 1;
        if (!hosps[x.hid]) { hosps[x.hid] = 1; if (hospPos(_hspById[x.hid]).real) real++; }
        var prev = way[way.length - 1];
        if (prev.id !== 'HQ' && x.sd - prev.ed > 3) way.push({ id: 'HQ', sd: prev.ed + 1, ed: x.sd - 2 });
        prev = way[way.length - 1];
        if (prev.id === x.hid) prev.ed = Math.max(prev.ed, x.ed);
        else way.push({ id: x.hid, sd: x.sd, ed: x.ed, title: x.title });
      });
      way.push({ id: 'HQ', sd: way[way.length - 1].ed + 1, ed: M.dim + 1 });
      var km = 0, legs = [];
      for (var i = 1; i < way.length; i++) {
        var a = way[i - 1], b = way[i], d2 = haversine(placeLL(a.id), placeLL(b.id));
        var t0 = Math.max(a.ed + 1, b.sd - .75), t1 = b.id === 'HQ' ? t0 + .75 : b.sd;
        if (t1 <= t0) t0 = t1 - .35;
        km += d2; legs.push({ a: a.id, b: b.id, km: d2, t0: t0, t1: t1 });
      }
      total += km;
      var s = (window.STAFF || []).find(function (x) { return x.id === sid; }) || { id: sid, name: '?', nickname: '?' };
      per[sid] = { s: s, color: hashColor(sid), trips: t, way: way, legs: legs, km: km };
    });
    var vals = Object.keys(pdProv).map(function (k) { return pdProv[k]; });
    return {
      M: M, per: per, pdProv: pdProv, pdReg: pdReg, provs: Object.keys(provs), hosps: Object.keys(hosps), real: real,
      total: total, skipped: T.skipped, max: Math.max.apply(null, [1].concat(vals)),
      pd: vals.reduce(function (a, b) { return a + b; }, 0),
      order: Object.keys(per).sort(function (a, b) { return window.sortStaffByRank ? window.sortStaffByRank(per[a].s, per[b].s) : 0; })
    };
  }

  // ── ฉาก three.js ──
  var LON0 = 100.9, LAT0 = 13.0, CS = Math.cos(13 * Math.PI / 180);
  var proj = function (ll) { return [(ll[0] - LON0) * CS, ll[1] - LAT0]; };

  function initScene() {
    var THREE = window.THREE, el = document.getElementById('tm-stage');
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    document.getElementById('tm-canvas').appendChild(renderer.domElement);
    var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, .1, 200);
    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .08; controls.maxPolarAngle = Math.PI * .46;
    controls.minDistance = 5; controls.maxDistance = 40; controls.autoRotateSpeed = .6;
    scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x0a1220, .75));
    var sun = new THREE.DirectionalLight(0xffffff, .85); sun.position.set(-6, 14, 8); scene.add(sun);
    var grid = new THREE.GridHelper(40, 40, 0x1b2a42, 0x14213a); grid.position.y = -.02; scene.add(grid);

    var LAND = new THREE.Color('#26364d'), HEAT = new THREE.Color('#f5a524');
    var EDGE = new THREE.LineBasicMaterial({ color: 0x3b4f6e, transparent: true, opacity: .7 });
    var meshes = [], byProv = {};
    Object.keys(GEO).forEach(function (p) {
      var shapes = GEO[p].g.map(function (r) {
        var pts = r.slice(0, r.length - 1).map(function (ll) { var q = proj(ll); return new THREE.Vector2(q[0], q[1]); });
        return new THREE.Shape(pts);
      });
      var g = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
      var cap = new THREE.MeshStandardMaterial({ color: LAND.clone(), roughness: .75, metalness: .05 });
      var side = new THREE.MeshStandardMaterial({ color: LAND.clone().multiplyScalar(.6), roughness: .9 });
      var mesh = new THREE.Mesh(g, [cap, side]); mesh.scale.y = .1;
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), EDGE));
      mesh.userData = { prov: p, h: .1, th: .1, col: LAND.clone(), tcol: LAND.clone() };
      scene.add(mesh); meshes.push(mesh); byProv[p] = mesh;
    });
    var hq = buildOffice(THREE);
    scene.add(hq);
    var routes = new THREE.Group(), pins = new THREE.Group(); scene.add(routes, pins);
    S = { THREE: THREE, el: el, renderer: renderer, scene: scene, camera: camera, controls: controls, meshes: meshes, byProv: byProv,
          LAND: LAND, HEAT: HEAT, hq: hq, routes: routes, pins: pins, avatars: {}, labels: {}, ray: new THREE.Raycaster(), mouse: new THREE.Vector2(), clock: 0, last: 0 };
    new ResizeObserver(resize).observe(el);
    resize(); resetView();
    renderer.domElement.addEventListener('pointermove', onHover);
    renderer.domElement.addEventListener('pointerleave', function () { hideTip(); });
  }
  // สำนักงาน = ตึกเล็ก ๆ: ฐาน + อาคารหลัก + อาคารข้าง + แถบหน้าต่างไฟเปิด + เสาอากาศ
  function buildOffice(THREE) {
    var g = new THREE.Group();
    var wall = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: .55, metalness: .1 });
    var wall2 = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: .6, metalness: .1 });
    var lit = new THREE.MeshBasicMaterial({ color: 0xffd27a });
    var box = function (w, h, d, mat, x, y, z) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
    box(.42, .06, .42, wall2, 0, .03, 0);                       // ฐาน
    box(.22, .62, .22, wall, -.03, .06 + .31, 0);               // อาคารหลัก
    box(.15, .38, .18, wall2, .15, .06 + .19, .01);             // อาคารข้าง
    for (var i = 0; i < 6; i++) box(.226, .028, .226, lit, -.03, .14 + i * .085, 0);   // แถบหน้าต่าง อาคารหลัก
    for (var j = 0; j < 3; j++) box(.154, .026, .184, lit, .15, .14 + j * .085, .01);  // แถบหน้าต่าง อาคารข้าง
    box(.24, .03, .24, wall2, -.03, .695, 0);                   // หลังคา
    var mast = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .2, 6), wall); mast.position.set(-.03, .81, 0); g.add(mast);
    var tip = new THREE.Mesh(new THREE.SphereGeometry(.022, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff4d4d })); tip.position.set(-.03, .92, 0); g.add(tip);
    g.rotation.y = -Math.PI / 6;
    return g;
  }
  function resize() {
    if (!S) return;
    var w = S.el.clientWidth, h = S.el.clientHeight;
    if (!w || !h) return;
    S.renderer.setSize(w, h); S.camera.aspect = w / h; S.camera.updateProjectionMatrix();
  }
  function resetView() {
    var narrow = S.el.clientWidth < 600;
    S.camera.position.set(.6, narrow ? 20 : 15.5, narrow ? 17 : 13.5);
    S.controls.target.set(.6, 0, .3); S.controls.update();
  }
  function topAt(prov, target) { var m = S.byProv[prov]; return m ? (target ? m.userData.th : m.userData.h) : .1; }
  function vec(id, lift, target) {
    var q = proj(placeLL(id));
    return new S.THREE.Vector3(q[0], topAt(placeProv(id), target) + (lift || 0), -q[1]);
  }
  function clearGroup(g) {
    while (g.children.length) {
      var c = g.children.pop();
      c.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
    }
  }

  // ภาพที่แสดง: ไม่เลือกใคร = ทั้งทีม · เลือกชื่อ = เฉพาะพื้นที่/ตัวเลขของคนนั้น
  function focusAgg() {
    if (!st.sel || !D.per[st.sel]) return { pdProv: D.pdProv, pdReg: D.pdReg, hosps: D.hosps, provs: D.provs, max: D.max, total: D.total, real: D.real, people: D.order.length };
    var ps = D.per[st.sel], pdProv = {}, pdReg = { N: 0, I: 0, C: 0, E: 0, S: 0 }, hosps = {}, real = 0;
    ps.trips.forEach(function (x) {
      var prov = _hspById[x.hid].province, d = x.ed - x.sd + 1;
      pdProv[prov] = (pdProv[prov] || 0) + d; pdReg[GEO[prov].r] += d;
      if (!hosps[x.hid]) { hosps[x.hid] = 1; if (hospPos(_hspById[x.hid]).real) real++; }
    });
    var vals = Object.keys(pdProv).map(function (k) { return pdProv[k]; });
    return { pdProv: pdProv, pdReg: pdReg, hosps: Object.keys(hosps), provs: Object.keys(pdProv), max: Math.max.apply(null, [1].concat(vals)), total: ps.km, real: real, people: 1 };
  }

  function applyMonth() {
    var THREE = S.THREE, V = focusAgg();
    S.meshes.forEach(function (m) {
      var pd = V.pdProv[m.userData.prov] || 0, k = pd / V.max;
      m.userData.th = .1 + (st.height ? k * 1.5 : 0) + (pd ? .05 : 0);
      m.userData.tcol = S.LAND.clone().lerp(S.HEAT, pd ? (.25 + .75 * k) : 0);
    });
    // หมุด รพ.
    clearGroup(S.pins);
    V.hosps.forEach(function (hid) {
      var g = new THREE.Group(); g.userData = { hid: hid };
      var real = hospPos(_hspById[hid]).real;
      var stick = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .5, 6), new THREE.MeshBasicMaterial({ color: 0xe7edf6, transparent: true, opacity: .7 }));
      stick.position.y = .25;
      var head = new THREE.Mesh(new THREE.SphereGeometry(.075, 16, 12), new THREE.MeshBasicMaterial({ color: real ? 0xffffff : 0x8b9cb6 }));
      head.position.y = .52;
      g.add(stick, head); S.pins.add(g);
    });
    // เส้นทาง
    clearGroup(S.routes);
    var seed = 0;
    D.order.forEach(function (sid) {
      var ps = D.per[sid];
      ps.legs.forEach(function (l, i) {
        var a = vec(l.a, .04 + i * .004, true), b = vec(l.b, .04 + i * .004, true);
        var mid = a.clone().add(b).multiplyScalar(.5); mid.y += .35 + a.distanceTo(b) * .32;
        var curve = new THREE.QuadraticBezierCurve3(a, mid, b); l.curve = curve;
        var tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, .024, 6, false), new THREE.MeshBasicMaterial({ color: ps.color, transparent: true, opacity: .8, depthWrite: false }));
        tube.userData = { sid: sid };
        var flow = new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 8), new THREE.MeshBasicMaterial({ color: ps.color, transparent: true }));
        flow.userData = { sid: sid, curve: curve, off: (seed++ * .37) % 1, flow: true };
        S.routes.add(tube, flow);
      });
    });
    S.routes.visible = st.routes;
    // ตัวคน + ป้ายชื่อ
    var lab = document.getElementById('tm-labels');
    Object.keys(S.avatars).forEach(function (k) { var a = S.avatars[k]; S.scene.remove(a.mesh); a.mesh.geometry.dispose(); a.mesh.material.dispose(); a.el.remove(); });
    S.avatars = {};
    D.order.forEach(function (sid) {
      var ps = D.per[sid];
      var mesh = new THREE.Mesh(new THREE.SphereGeometry(.12, 18, 14), new THREE.MeshBasicMaterial({ color: ps.color }));
      S.scene.add(mesh);
      var el = document.createElement('div'); el.className = 'tm-lbl tm-av'; el.style.background = ps.color; el.textContent = ps.s.nickname || ps.s.name;
      lab.appendChild(el);
      S.avatars[sid] = { mesh: mesh, el: el };
    });
    Object.keys(S.labels).forEach(function (k) { S.labels[k].remove(); }); S.labels = {};
    V.provs.forEach(function (p) { var el = document.createElement('div'); el.className = 'tm-lbl'; el.textContent = p; lab.appendChild(el); S.labels[p] = el; });
    var hqEl = document.createElement('div'); hqEl.className = 'tm-lbl tm-hq'; hqEl.textContent = OFFICE.name; lab.appendChild(hqEl); S.labels.__hq = hqEl;
    applySel();
  }
  // เลือกคน → ซ่อนเส้นทาง/ป้ายชื่อของคนอื่นทั้งหมด (ไม่เหลือเงาจาง)
  function applySel() {
    if (!S) return;
    S.routes.children.forEach(function (o) {
      var on = !st.sel || o.userData.sid === st.sel;
      o.visible = on;
      o.material.opacity = o.userData.flow ? 1 : (st.sel ? .95 : .75);
    });
    Object.keys(S.avatars).forEach(function (k) { var on = !st.sel || k === st.sel; S.avatars[k].mesh.visible = on; S.avatars[k].el.style.visibility = on ? '' : 'hidden'; });
  }

  // ตำแหน่งคนในวันที่ t (ทศนิยม = ช่วงเวลาในวัน)
  function staffAt(sid, t) {
    var ps = D.per[sid], at = 'HQ';
    for (var i = 0; i < ps.legs.length; i++) {
      var l = ps.legs[i];
      if (t >= l.t0 && t < l.t1 && l.curve) return { pos: l.curve.getPoint((t - l.t0) / (l.t1 - l.t0)), moving: true, to: l.b };
      if (t >= l.t1) at = l.b;
    }
    return { pos: vec(at, .17), moving: false, at: at };
  }

  var _v = null;
  function place(el, v) {
    _v.copy(v).project(S.camera);
    if (_v.z > 1) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.left = ((_v.x + 1) / 2 * S.el.clientWidth) + 'px';
    el.style.top = ((1 - _v.y) / 2 * S.el.clientHeight) + 'px';
  }
  function frame(now) {
    var view = document.getElementById('view-team-map');
    if (!view || !view.classList.contains('on')) { _running = false; st.playing = false; syncPlay(); return; }
    var dt = Math.min(.05, ((now - (S.last || now)) / 1000)); S.last = now; S.clock += dt;
    S.meshes.forEach(function (m) {
      var u = m.userData; u.h += (u.th - u.h) * .12; m.scale.y = u.h; u.col.lerp(u.tcol, .12);
      m.material[0].color.copy(u.col); m.material[1].color.copy(u.col).multiplyScalar(.55);
    });
    S.pins.children.forEach(function (g) { g.position.copy(vec(g.userData.hid)); });
    S.hq.position.copy(vec('HQ'));
    if (st.playing) {
      st.day += dt * Math.max(2.2, D.M.dim / 16); if (st.day > D.M.dim + .99) st.day = 1; // ทั้งปีเล่นจบใน ~23 วินาที
      document.getElementById('tm-day').value = st.day; updateStatus();
    }
    S.routes.children.forEach(function (o) { if (o.userData.flow) o.position.copy(o.userData.curve.getPoint(reduce ? .5 : (S.clock * .35 + o.userData.off) % 1)); });
    Object.keys(S.avatars).forEach(function (sid) {
      var a = S.avatars[sid];
      if (st.sel && sid !== st.sel) { a.mesh.visible = false; a.el.style.display = 'none'; return; } // เลือกชื่อ = เห็นแค่คนนั้น
      var p = staffAt(sid, st.day);
      a.mesh.visible = true; a.mesh.position.copy(p.pos); place(a.el, a.mesh.position);
    });
    Object.keys(S.labels).forEach(function (k) {
      if (k === '__hq') { place(S.labels[k], vec('HQ', 1.05)); return; }
      var q = proj(CENT[k]); place(S.labels[k], new S.THREE.Vector3(q[0], topAt(k) + .05, -q[1]));
    });
    S.controls.update(); S.renderer.render(S.scene, S.camera);
    requestAnimationFrame(frame);
  }
  function startLoop() { if (_running) return; _running = true; S.last = 0; requestAnimationFrame(frame); }

  // ── tooltip จังหวัด ──
  function hideTip() {
    var tip = document.getElementById('tm-tip'); if (tip) tip.hidden = true;
    if (st.hover && S.byProv[st.hover]) S.byProv[st.hover].material[0].emissive.setHex(0);
    st.hover = null;
  }
  function onHover(e) {
    var r = S.renderer.domElement.getBoundingClientRect();
    S.mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    S.ray.setFromCamera(S.mouse, S.camera);
    var hit = S.ray.intersectObjects(S.meshes, false)[0], p = hit ? hit.object.userData.prov : null;
    if (st.hover && st.hover !== p) S.byProv[st.hover].material[0].emissive.setHex(0);
    if (!p) { hideTip(); return; }
    st.hover = p; S.byProv[p].material[0].emissive.setHex(0x1a2a44);
    var rows = [], V = focusAgg();
    D.order.forEach(function (sid) {
      if (st.sel && sid !== st.sel) return;
      var ps = D.per[sid];
      ps.trips.forEach(function (t) {
        if (_hspById[t.hid].province !== p) return;
        rows.push('<div class="tm-tip-row"><i style="background:' + ps.color + '"></i><span><b>' + esc(ps.s.nickname || ps.s.name) + '</b> · ' + esc(_hspById[t.hid].name) +
          '<br><span class="tm-mute">' + rangeTxt(t.sd, t.ed) + ' · ' + esc(t.title) + '</span></span></div>');
      });
    });
    var tip = document.getElementById('tm-tip');
    tip.innerHTML = '<div class="tm-tip-t">' + esc(p) + '</div><div class="tm-mute" style="margin-bottom:6px;">ภาค' + REGION[GEO[p].r] + ' · ' + (V.pdProv[p] || 0) + ' คน·วัน</div>' +
      (rows.join('') || '<span class="tm-mute">ไม่มีทีมลงพื้นที่ในช่วงนี้</span>');
    tip.hidden = false;
    var sr = S.el.getBoundingClientRect(), x = e.clientX - sr.left + 14, y = e.clientY - sr.top + 14;
    if (x + 300 > sr.width) x = e.clientX - sr.left - 304;
    if (y + tip.offsetHeight > sr.height - 70) y = Math.max(8, e.clientY - sr.top - tip.offsetHeight - 10);
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = y + 'px';
  }

  // ── แผงข้อมูล ──
  function rangeTxt(a, b) {
    var A = dateOf(D.M, a), B = dateOf(D.M, b);
    if (a === b) return A.d + ' ' + M_SHORT[A.m];
    return A.m === B.m ? A.d + '–' + B.d + ' ' + M_SHORT[A.m] : A.d + ' ' + M_SHORT[A.m] + ' – ' + B.d + ' ' + M_SHORT[B.m];
  }
  function fmt(n) { return Math.round(n).toLocaleString('th-TH'); }

  function renderPanel() {
    var M = D.M;
    var V = focusAgg();
    document.getElementById('tm-k-staff').textContent = V.people;
    document.getElementById('tm-k-hosp').textContent = V.hosps.length;
    document.getElementById('tm-k-prov').textContent = V.provs.length;
    document.getElementById('tm-k-km').textContent = fmt(V.total);
    document.getElementById('tm-leg-max').textContent = V.max + ' คน·วัน';
    var rmax = Math.max.apply(null, [1].concat(Object.keys(V.pdReg).map(function (k) { return V.pdReg[k]; })));
    document.getElementById('tm-regions').innerHTML = Object.keys(REGION).map(function (r) {
      return '<div class="tm-rbar"><span>' + REGION[r] + '</span><div class="tm-track"><div class="tm-fill" style="width:' + (V.pdReg[r] / rmax * 100) + '%"></div></div><span class="tm-v">' + V.pdReg[r] + '</span></div>';
    }).join('');
    fillDepts();
    var list = document.getElementById('tm-staff');
    // เฉพาะคนที่มีงานนอกสถานที่ในช่วงที่เลือก · จัดกลุ่มตามแผนก (เรียงตามรายการแผนก ไม่ระบุแผนกไว้ท้าย) แต่ละกลุ่มเรียงตามตำแหน่ง
    var groups = {};
    D.order.forEach(function (sid) { var k = deptName(D.per[sid].s); (groups[k] = groups[k] || []).push(sid); });
    var keys = deptNames().filter(function (k) { return groups[k]; });
    list.innerHTML = D.order.length ? keys.map(function (k) {
      return '<li class="tm-grp">' + esc(k) + ' <span>' + groups[k].length + ' คน</span></li>' +
        groups[k].map(staffRow).join('');
    }).join('') : '<li class="tm-empty">ไม่มีทีมออกพื้นที่ในช่วงนี้' + (st.dept ? ' (ในแผนกที่เลือก)' : '') + '</li>';
    function staffRow(sid) {
      var ps = D.per[sid];
      return '<li tabindex="0" data-sid="' + esc(sid) + '" class="' + (st.sel === sid ? 'on' : '') + (st.sel && st.sel !== sid ? ' off' : '') + '">' +
        '<span class="tm-dot" style="background:' + ps.color + '"></span>' +
        '<div><span class="tm-nm">' + esc(ps.s.nickname || ps.s.name) + '</span> <small class="tm-mute">' + esc(ps.s.role || '') + '</small><span class="tm-st" data-st="' + esc(sid) + '"></span></div>' +
        '<div class="tm-meta"><b>' + ps.trips.length + '</b> จุด<br>' + fmt(ps.km) + ' กม.</div></li>';
    }
    var notes = [];
    if (V.hosps.length) notes.push('หมุด รพ. ' + V.real + '/' + V.hosps.length + ' แห่งใช้พิกัดจริง — ที่เหลือวางกลางจังหวัด (หมุดสีเทา)');
    if (D.skipped) notes.push(D.skipped + ' โครงการในช่วงนี้ไม่มีโรงพยาบาล/จังหวัด จึงไม่แสดงบนแผนที่');
    document.getElementById('tm-note').innerHTML = notes.map(esc).join('<br>');
    document.getElementById('tm-day').max = M.dim + .99;
    document.querySelectorAll('#tm-months .tm-mbtn').forEach(function (b, i) { b.classList.toggle('on', i === st.mi); });
    renderItin(); updateStatus(true);
  }
  function renderItin() {
    var box = document.getElementById('tm-itin');
    if (!st.sel || !D.per[st.sel]) { box.hidden = true; return; }
    var ps = D.per[st.sel]; box.hidden = false; box.style.setProperty('--c', ps.color);
    document.getElementById('tm-itin-t').textContent = 'เส้นทางของ ' + (ps.s.nickname || ps.s.name);
    document.getElementById('tm-itin-km').textContent = fmt(ps.km) + ' กม.';
    document.getElementById('tm-itin-list').innerHTML = ps.way.map(function (w, i) {
      var leg = ps.legs[i - 1], hq = w.id === 'HQ';
      var when = hq ? (i === 0 ? 'ออกเดินทาง' : i === ps.way.length - 1 ? 'กลับสำนักงาน' : 'พักที่สำนักงาน') : rangeTxt(w.sd, w.ed);
      return '<li><span class="tm-pin' + (hq ? ' hq' : '') + '"></span><div><div class="tm-mute">' + when + '</div><div class="tm-h">' + esc(placeName(w.id)) + '</div>' +
        '<div class="tm-mute tm-sm">จ.' + esc(placeProv(w.id)) + (w.title ? ' · ' + esc(w.title) : '') + (leg ? ' · +' + fmt(leg.km) + ' กม.' : '') + '</div></div></li>';
    }).join('');
  }
  var _stKey = '';
  function updateStatus(force) {
    var key = D.M.key + ':' + Math.floor(st.day * 2) + ':' + (D ? D.order.length : 0);
    if (!force && key === _stKey) return; _stKey = key;
    var M = D.M, dd = dateOf(M, Math.min(M.dim, Math.floor(st.day)));
    document.getElementById('tm-daylbl').textContent = dd.d + ' ' + M_SHORT[dd.m] + ' ' + String((dd.y + 543) % 100);
    D.order.forEach(function (sid) {
      var el = document.querySelector('#tm-staff [data-st="' + sid + '"]'); if (!el) return;
      if (st.sel && sid !== st.sel) { el.textContent = ''; return; } // เลือกชื่อ = สถานะของคนอื่นไม่ขยับ
      var p = staffAt(sid, st.day);
      el.textContent = p.moving ? 'กำลังเดินทาง → จ.' + placeProv(p.to) : p.at === 'HQ' ? 'อยู่สำนักงาน' : 'อยู่ที่ ' + placeName(p.at) + ' · จ.' + placeProv(p.at);
    });
  }
  function syncPlay() {
    var b = document.getElementById('tm-play'); if (!b) return;
    b.innerHTML = st.playing ? '<i class="ti ti-player-pause-filled" aria-hidden="true"></i>' : '<i class="ti ti-player-play-filled" aria-hidden="true"></i>';
    b.setAttribute('aria-label', st.playing ? 'หยุดชั่วคราว' : 'เล่นรายวัน');
  }

  // เลื่อนทีละเดือน (ข้ามปีได้) · โหมดทั้งปี = เลื่อนทีละปี
  function step(delta) {
    var i = st.mi;
    if (i === YEAR_I) { setYear(st.year + delta); setMonth(YEAR_I); return; }
    i += delta;
    if (i < 0) { setYear(st.year - 1); i = 11; } else if (i > 11) { setYear(st.year + 1); i = 0; }
    setMonth(i);
  }
  function setYear(y) { st.year = y; MONTHS = buildPeriods(y); renderMonthStrip(); }
  function setMonth(i, keepDay) {
    st.mi = Math.max(0, Math.min(MONTHS.length - 1, i));
    if (!keepDay) st.day = 1;
    _hspById = {}; (window.HOSPITALS || []).forEach(function (h) { _hspById[h.id] = h; });
    _posCache = {};
    D = computeMonth(MONTHS[st.mi]);
    if (st.sel && !D.per[st.sel]) st.sel = null;
    if (st.day > D.M.dim + .99) st.day = 1;
    document.getElementById('tm-day').value = st.day;
    applyMonth(); renderPanel();
  }
  function renderMonthStrip() {
    var months = MONTHS.slice(0, 12), bars = months.map(function (M) { return computeMonth(M).pd; }), mx = Math.max.apply(null, [1].concat(bars));
    var total = bars.reduce(function (a, b) { return a + b; }, 0), be = st.year + 543;
    // ปุ่ม ‹ › สองข้างแถบ = เลื่อนทีละปี (คงเดือน/ทั้งปีที่เลือกไว้)
    var yarr = function (d) { return '<button type="button" class="tm-yarr" data-d="' + d + '" aria-label="ปี ' + (be + d) + '" title="ปี ' + (be + d) + '"><i class="ti ti-chevron-' + (d < 0 ? 'left' : 'right') + '"></i></button>'; };
    document.getElementById('tm-months').innerHTML = yarr(-1) + months.map(function (M, i) {
      return '<button type="button" class="tm-mbtn" data-i="' + i + '" title="' + M_FULL[M.m] + ' ' + be + ': ' + bars[i] + ' คน·วัน">' +
        '<span class="tm-now">' + (M.now ? 'เดือนนี้' : '') + '</span><span class="tm-bar" style="height:' + (6 + bars[i] / mx * 34) + 'px"></span>' +
        '<span class="tm-ml">' + M_SHORT[M.m] + ' ' + String(be % 100) + '</span></button>';
    }).join('') +
      '<button type="button" class="tm-mbtn tm-ybtn" data-i="' + YEAR_I + '" title="ทั้งปี ' + be + ': ' + total + ' คน·วัน">' +
        '<span class="tm-now"></span><i class="ti ti-calendar-stats" aria-hidden="true"></i><span class="tm-ml">ทั้งปี ' + be + '</span></button>' + yarr(1);
  }

  // ── โครงหน้า ──
  // แผนกของพนักงาน = ชื่อแผนก (s.dept) เหมือนหน้าภาระงาน/ทีมว่าง · ไม่มีแผนก = ไม่ระบุแผนก
  var NO_DEPT = 'ไม่ระบุแผนก';
  function deptName(s) { return (s && s.dept) || NO_DEPT; }
  // ลำดับแผนก: ตามข้อมูลหลัก › แผนก แล้วตามด้วยแผนกที่พบในพนักงานแต่ไม่อยู่ในรายการ · ไม่ระบุแผนกไว้ท้าย
  function deptNames() {
    var out = (window.DEPT_LIST || []).map(function (d) { return d.label; }).filter(Boolean);
    var noDept = false;
    (window.STAFF || []).forEach(function (s) { var n = deptName(s); if (n === NO_DEPT) noDept = true; else if (out.indexOf(n) < 0) out.push(n); });
    if (noDept) out.push(NO_DEPT); // มีพนักงานที่ยังไม่ได้กำหนดแผนกเท่านั้น
    return out;
  }
  function fillDepts() {
    var sel = document.getElementById('tm-dept');
    sel.innerHTML = '<option value="">ทุกแผนก</option>' + deptNames().map(function (n) {
      return '<option value="' + esc(n) + '"' + (n === st.dept ? ' selected' : '') + '>' + esc(n) + '</option>';
    }).join('');
  }
  function shell() {
    return '' +
      '<div class="tm-wrap">' +
        '<aside class="tm-panel">' +
          '<select class="t-sel" id="tm-dept" aria-label="กรองแผนก"></select>' +
          '<div class="tm-kpis">' +
            '<div><b id="tm-k-staff">0</b><span>คนออกพื้นที่</span></div><div><b id="tm-k-hosp">0</b><span>โรงพยาบาล</span></div>' +
            '<div><b id="tm-k-prov">0</b><span>จังหวัด</span></div><div><b id="tm-k-km">0</b><span>ระยะทางรวม (กม.)</span></div>' +
          '</div>' +
          '<div><div class="tm-h2">วันทำงานตามภาค <small>คน·วัน</small></div><div id="tm-regions"></div></div>' +
          '<div><div class="tm-h2">ทีมงาน <small>คลิกชื่อเพื่อดูเส้นทาง</small></div><ul class="tm-staff" id="tm-staff"></ul></div>' +
          '<div class="tm-itin" id="tm-itin" hidden><div class="tm-h2"><span id="tm-itin-t"></span> <small id="tm-itin-km"></small></div><ol id="tm-itin-list"></ol>' +
            '<button type="button" class="tm-allbtn" id="tm-itin-all"><i class="ti ti-users-group" aria-hidden="true"></i> ดูทั้งทีม</button></div>' +
          '<div class="tm-note"><span id="tm-note"></span><br>ระยะทางเป็นเส้นตรงระหว่างจุด เริ่มและจบที่' + esc(OFFICE.name) + '</div>' +
        '</aside>' +
        '<div class="tm-main">' +
          '<div class="tm-stage" id="tm-stage">' +
            '<div id="tm-canvas" class="tm-canvas"></div><div id="tm-labels" class="tm-labels"></div><div id="tm-tip" class="tm-tip" hidden></div>' +
            '<div class="tm-legend"><span>ความเข้มของจังหวัด = คน·วันในช่วงที่เลือก</span><div class="tm-ramp"></div><div class="tm-ends"><span>0</span><span id="tm-leg-max">–</span></div></div>' +
            '<div class="tm-tools">' +
              '<button class="tm-chip" id="tm-t-routes" aria-pressed="true">เส้นทาง</button>' +
              '<button class="tm-chip" id="tm-t-height" aria-pressed="true">ยกสูงตามงาน</button>' +
              '<button class="tm-chip" id="tm-t-spin" aria-pressed="false">หมุนอัตโนมัติ</button>' +
              '<button class="tm-chip" id="tm-t-reset">รีเซ็ตมุมมอง</button>' +
              '<button class="tm-chip" id="tm-t-full" aria-pressed="false"></button>' +
            '</div>' +
            '<div class="tm-dayplay"><button class="tm-play" id="tm-play"></button><div class="tm-daylbl" id="tm-daylbl"></div>' +
              '<input type="range" id="tm-day" min="1" max="31" step="0.01" value="1" aria-label="วันที่ในเดือน"><span class="tm-hint">ลากเพื่อดูว่าใครอยู่ที่ไหนในแต่ละวัน</span></div>' +
            '<div class="tm-loading" id="tm-loading">⏳ กำลังโหลดแผนที่...</div>' +
          '</div>' +
          '<nav class="tm-months" id="tm-months" aria-label="เลือกเดือน"></nav>' +
        '</div>' +
      '</div>';
  }
  function bind() {
    document.getElementById('tm-months').onclick = function (e) {
      var y = e.target.closest('.tm-yarr'); if (y) { setYear(st.year + (+y.dataset.d)); setMonth(st.mi); return; }
      var b = e.target.closest('.tm-mbtn'); if (b) setMonth(+b.dataset.i);
    };
    var dept = document.getElementById('tm-dept');
    dept.onchange =function () { st.dept = dept.value; st.sel = null; renderMonthStrip(); setMonth(st.mi, true); };
    document.getElementById('tm-itin-all').onclick = function () { st.sel = null; applyMonth(); renderPanel(); };
    var list = document.getElementById('tm-staff');
    list.onclick = function (e) {
      var li = e.target.closest('li[data-sid]'); if (!li) return;
      st.sel = st.sel === li.dataset.sid ? null : li.dataset.sid;
      applyMonth(); renderPanel();
    };
    list.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); var li = e.target.closest('li[data-sid]'); if (li) li.click(); } };
    var tog = function (id, key, after) {
      var b = document.getElementById(id);
      b.onclick = function () { st[key] = !st[key]; b.setAttribute('aria-pressed', st[key]); after(); };
    };
    tog('tm-t-routes', 'routes', function () { S.routes.visible = st.routes; });
    tog('tm-t-height', 'height', function () { setMonth(st.mi, true); });
    var spin = document.getElementById('tm-t-spin');
    spin.onclick = function () { S.controls.autoRotate = !S.controls.autoRotate; spin.setAttribute('aria-pressed', S.controls.autoRotate); };
    document.getElementById('tm-t-reset').onclick = resetView;
    // เต็มจอ: ใช้ Fullscreen API ของเบราว์เซอร์ · เครื่องที่ไม่รองรับ (เช่น iPhone) ขยายเต็มหน้าต่างแทน
    var wrap = document.querySelector('#view-team-map .tm-wrap'), fb = document.getElementById('tm-t-full');
    var isFull = function () { return document.fullscreenElement === wrap || wrap.classList.contains('tm-full'); };
    var syncFull = function () {
      var on = isFull();
      fb.setAttribute('aria-pressed', on);
      fb.innerHTML = on ? '<i class="ti ti-minimize" aria-hidden="true"></i> ออกจากเต็มจอ' : '<i class="ti ti-maximize" aria-hidden="true"></i> เต็มจอ';
      setTimeout(resize, 60);
    };
    fb.onclick = function () {
      if (isFull()) {
        wrap.classList.remove('tm-full');
        if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      } else if (wrap.requestFullscreen) {
        wrap.requestFullscreen().catch(function () { wrap.classList.add('tm-full'); syncFull(); });
      } else {
        wrap.classList.add('tm-full');
      }
      syncFull();
    };
    document.addEventListener('fullscreenchange', syncFull);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && wrap.classList.contains('tm-full')) { wrap.classList.remove('tm-full'); syncFull(); } });
    syncFull();
    document.getElementById('tm-play').onclick = function () { st.playing = !st.playing; syncPlay(); };
    document.getElementById('tm-day').oninput = function () { st.day = +this.value; st.playing = false; syncPlay(); updateStatus(); };
    document.getElementById('view-team-map').addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    });
  }

  window.renderTeamMap = async function () {
    var view = document.getElementById('view-team-map');
    if (!view) return;
    if (!view.querySelector('.tm-wrap')) {
      view.innerHTML = shell();
      st.year = new Date().getFullYear(); MONTHS = buildPeriods(st.year); st.mi = new Date().getMonth();
      syncPlay();
    }
    try { await ensureLoaded(); }
    catch (e) {
      var ld = document.getElementById('tm-loading');
      if (ld) ld.innerHTML = 'โหลดแผนที่ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วเปิดเมนูนี้ใหม่';
      return;
    }
    if (!S) { initScene(); _v = new S.THREE.Vector3(); bind(); }
    var ld2 = document.getElementById('tm-loading'); if (ld2) ld2.remove();
    fillDepts();
    renderMonthStrip();
    setMonth(st.mi, true);
    resize();
    startLoop();
  };

})();
