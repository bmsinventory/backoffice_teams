/**
 * project-team.util.js — ทีมงานของโครงการ (ติดตามสถานะโครงการ) ที่เดียว ใช้ร่วมกัน:
 *   · ติดตามสถานะโครงการ (src/modules/impl-tracker.js — ตัวเลือกผู้รับผิดชอบ/ตัวกรอง)
 *   · ระบบอบรม (src/modules/training-app.js — PM/ทีมเห็นเฉพาะโครงการของตัวเอง)
 * implProj = { name, sourceProjectId } · projects = รายการโครงการต้นทาง { id, name, pm, team, members }
 * (รูปแบบเดียวกับ window.IMPL_PROJECTS / window.PROJECTS ของ Backoffice)
 */
(function () {
  // โครงการต้นทางของโครงการ impl — ใช้ sourceProjectId ถ้ามี ไม่มีก็เดาจากชื่อที่ตรงกันพอดี (โครงการเก่าก่อนมีคอลัมน์นี้)
  function source(implProj, projects) {
    if (!implProj) return null;
    projects = projects || [];
    var srcId = implProj.sourceProjectId;
    if (!srcId) {
      var guess = projects.find(function (x) { return x.name === implProj.name; });
      if (guess) srcId = guess.id;
    }
    return srcId ? projects.find(function (x) { return x.id === srcId; }) || null : null;
  }

  // รหัสพนักงานในทีม (members ถ้ามี ไม่มีใช้ team) ไม่ซ้ำ ตามลำดับเดิม
  function staffIds(implProj, projects) {
    var sp = source(implProj, projects);
    if (!sp) return [];
    var sids = (sp.members && sp.members.length ? sp.members : (sp.team || []).map(function (id) { return { sid: id }; }))
      .map(function (m) { return m.sid; });
    var seen = {};
    return sids.filter(function (sid) { return sid && !seen[sid] && (seen[sid] = true); });
  }

  // พนักงานคนนี้อยู่ในโครงการไหม (ทีม หรือ PM ของโครงการต้นทาง)
  function isMember(staffId, implProj, projects) {
    if (!staffId) return false;
    var sp = source(implProj, projects);
    return !!sp && (sp.pm === staffId || staffIds(implProj, projects).indexOf(staffId) >= 0);
  }

  window.ProjectTeam = { source: source, staffIds: staffIds, isMember: isMember };
})();
