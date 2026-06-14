/**
 * realtime.service.js — Supabase Realtime Listeners
 * รับข้อมูลแบบ Real-time จากทุก collection และ update global stores
 * ต้องโหลดหลัง supabase.service.js และ app.config.js
 */
(function () {

  // ── Data Transformer Helpers ──
  function _bv(d, k) { return d[k] === true || d[k] === 'TRUE'; }
  function _holNorm(raw) {
    if (!raw) return '';
    var m = raw.match(/^(\d{4})(-.+)$/);
    if (!m) return raw;
    var y = Number(m[1]);
    return (y >= 2500 ? (y - 543) : y) + m[2];
  }

  // ── Transform Functions: raw Supabase doc → app object ──
  var transform = {
    STAGES: function (d) {
      return { id:d.stage_id||d.id, label:d.label_th||d.label, color:d.color_hex||d.color, order:d.order||99, autoRule:d.auto_rule||'', autoOffset:Number(d.auto_offset||0), setProgress:Number(d.set_progress||-1) };
    },
    PTYPES: function (d) {
      return { id:d.type_id||d.id, label:d.label_th||d.label, color:d.color_hex||d.color };
    },
    PGROUPS: function (d) {
      return { id:d.group_id||d.id, label:d.label_th||d.label, color:d.color_hex||d.color };
    },
    POSITIONS: function (d) {
      return { id:d.position_id||d.id, label:d.label_th||d.label, dailyRate:Number(d.daily_rate)||0 };
    },
    STAFF: function (d) {
      return { id:d.staff_id||d.id, name:d.full_name||d.name||'', nickname:d.nickname||(d.full_name||d.name||'').split(' ')[0], dept:d.department||d.dept, role:d.position||d.role, email:d.email, phone:d.phone, active:d.is_active!==false&&d.is_active!=='FALSE', start_date:d.start_date, birth_date:d.birth_date, remark:d.remark, dailyRate:d.daily_rate!=null?Number(d.daily_rate):null };
    },
    USERS: function (d) {
      return { id:d.user_id||d.id, username:d.username, password:d.password, name:d.name||d.display_name||'', role:d.role, active:d.is_active!==false&&d.is_active!=='FALSE', staffId:d.staff_id||'' };
    },
    PROJECTS: function (d) {
      return { id:d.project_id||d.id, name:d.project_name||d.name||'', groupId:d.group_id||'', siteOwner:d.site_owner||'', installer:d.installer_name||'', typeId:d.type_id||'', stage:d.stage_id||d.stage||'init', cost:Number(d.budget||d.cost)||0, start:d.start_date||d.startDate||'', end:d.end_date||d.endDate||'', revisit1:d.revisit_1||d.revisit1||'', revisit2:d.revisit_2||d.revisit2||'', parentProjectId:d.parent_project_id||'', revisitRound:Number(d.revisit_round)||0, progress:Number(d.progress_pct||d.progress)||0, note:d.note||'', status:d.status||'active', pm:d.pm_staff_id||d.pm||'', team:d.team||[], members:d.members||[], isBorder:d.is_border===true||d.is_border==='TRUE', contractId:d.contract_id||'', noRevisit:d.no_revisit===true, visits:(d.visits||[]).map(function(v){return{id:v.id||('V'+Math.random().toString(36).slice(2,7)),no:v.no||1,start:v.start||v.start_date||'',end:v.end||v.end_date||'',purpose:v.purpose||'',team:v.team||[],status:v.status||'planned',note:v.note||''};}) };
    },
    ADVANCES: function (d) {
      return { id:d.advance_id||d.id, pid:d.project_id||d.pid, purpose:d.purpose||'', amount:Number(d.amount_requested||d.amount)||0, cleared:Number(d.amount_cleared||d.cleared)||0, rdate:d.request_date||d.rdate||'', ddate:d.due_date||d.ddate||'', status:d.status||'draft', note:d.note||'', advno:d.advance_no||d.advno||'', expenseItems:d.expense_items||[], laborItems:d.labor_items||[] };
    },
    LODGINGS: function (d) {
      return { id:d.lodging_id||d.id, pid:d.project_id||d.pid, name:d.lodging_name||d.name||'', mapUrl:d.map_url||'', phone:d.phone||'', checkIn:d.check_in||'', checkOut:d.check_out||'', dsQty:Number(d.ds_qty)||0, dsRate:Number(d.ds_rate)||0, ddQty:Number(d.dd_qty)||0, ddRate:Number(d.dd_rate)||0, dTotal:Number(d.d_total)||0, dWifi:_bv(d,'d_wifi'), dPillow:_bv(d,'d_pillow'), dBlanket:_bv(d,'d_blanket'), dApp:_bv(d,'d_appliance'), dPark:_bv(d,'d_parking'), dAc:_bv(d,'d_ac'), dFridge:_bv(d,'d_fridge'), dWasher:_bv(d,'d_washer'), dTv:_bv(d,'d_tv'), dShower:_bv(d,'d_shower'), dBreakfast:_bv(d,'d_breakfast'), dTowel:_bv(d,'d_towel'), dCustom:d.d_custom||'', dDeposit:Number(d.d_deposit)||0, dDepositNote:d.d_deposit_note||'', msQty:Number(d.ms_qty)||0, msRate:Number(d.ms_rate)||0, mdQty:Number(d.md_qty)||0, mdRate:Number(d.md_rate)||0, mTotal:Number(d.m_total)||0, mWifi:_bv(d,'m_wifi'), mPillow:_bv(d,'m_pillow'), mBlanket:_bv(d,'m_blanket'), mApp:_bv(d,'m_appliance'), mPark:_bv(d,'m_parking'), mAc:_bv(d,'m_ac'), mFridge:_bv(d,'m_fridge'), mWasher:_bv(d,'m_washer'), mTv:_bv(d,'m_tv'), mShower:_bv(d,'m_shower'), mBreakfast:_bv(d,'m_breakfast'), mBedsheet:_bv(d,'m_bedsheet'), mTowel:_bv(d,'m_towel'), mCustom:d.m_custom||'', mDeposit:Number(d.m_deposit)||0, mDepositNote:d.m_deposit_note||'', mWater:d.m_water||'', mElectric:d.m_electric||'', mExtras:d.m_extras||'', mInclUtil:_bv(d,'m_incl_util'), total:Number(d.grand_total||d.total)||0, note:d.note||'', approved:d.approved||'', approvedAt:d.approved_at||'', approvedBy:d.approved_by||'', approvedDaily:d.approved_daily||'', approvedMonthly:d.approved_monthly||'' };
    },
    HOLIDAYS: function (d) {
      return { id:d.holiday_id||d.id, name:d.name||'', date:_holNorm(d.date||''), type:d.type||'national' };
    },
    LEAVES: function (d) {
      return { id:d.leave_id||d.id, staffId:d.staff_id||'', leaveType:d.leave_type||'other', startDate:d.start_date||'', endDate:d.end_date||'', substituteId:d.substitute_id||'', note:d.note||'', status:d.status||'pending', approvedBy:d.approved_by||'' };
    },
    TIMESHEETS: function (d) {
      return { id:d.timesheet_id||d.id, pid:d.project_id||d.pid||'', staffId:d.staff_id||'', workDate:d.work_date||'', visitStart:d.visit_start||'', visitEnd:d.visit_end||'', hours:Number(d.hours)||0, category:d.category||'other', description:d.description||'', source:d.source||'' };
    },
    COSTS: function (d) {
      return { id:d.cost_id||d.id, pid:d.project_id||d.pid||'', staffId:d.staff_id||'', category:d.category||'other', amount:Number(d.amount)||0, costDate:d.cost_date||'', description:d.description||'', receiptNo:d.receipt_no||'', source:d.source||'', advanceId:d.advance_id||'' };
    },
    DEPARTMENTS: function (d) {
      return { id:d.dept_id||d.id, label:d.label_th||d.label||'' };
    },
    CONTRACTS: function (d) {
      return { id:d.contract_id||d.id, name:d.project_name||'', customer:d.customer_name||'', value:Number(d.total_contract_value||d.value)||0, signDate:d.contract_sign_date||'', startDate:d.contract_start_date||'', endDate:d.end_date||'', note:d.note||'', status:d.status||'active', transactions:d.transactions||[] };
    },
    WORK_LOGS: function (d) {
      return { id:d.id, uid:d.uid||'', staffId:d.staffId||d.staff_id||'', type:d.type||'daily', scope:d.scope||'personal', date:d.date||'', startDate:d.start_date||d.startDate||'', endDate:d.end_date||d.endDate||'', totalDays:Number(d.total_days||d.totalDays)||1, category:d.category||'other', locationType:d.location_type||d.locationType||'local', destination:d.destination||'', title:d.title||'', detail:d.detail||'', participants:d.participants||[], createdAt:d.created_at||d.createdAt||'' };
    },
    HSP_PRODUCTS: function (d) {
      return { id:d.product_id||d.id, name:d.name||'', color:d.color||'#7c3aed', note:d.note||'', group:d.group||'' };
    },
    HOSPITALS: function (d) {
      return { id:d.hospital_id||d.id, code:d.code||'', name:d.name||'', type:d.type||'other', beds:Number(d.beds)||0, province:d.province||'', district:d.district||'', tambon:d.tambon||'', address:d.address||'', tel:d.tel||'', website:d.website||'', affiliation:d.affiliation||'', note:d.note||'', contacts:Array.isArray(d.contacts)?d.contacts:[], products:Array.isArray(d.products)?d.products:[] };
    },
  };

  // ── Check if active view needs re-render ──
  function _von(id) { var el = document.getElementById(id); return el && el.classList.contains('on'); }

  // ── Optimistic Local Update Helpers ──
  // Call these right after setDoc/deleteDoc so the UI updates instantly
  // without waiting for the Supabase realtime snapshot to come back.
  window._applyLocalDoc = function (collection, id, rawData) {
    var arr = window[collection];
    if (!Array.isArray(arr)) return;
    var fn = transform[collection];
    var obj = fn ? fn(rawData) : Object.assign({}, rawData, { id: id });
    var idx = arr.findIndex(function (x) { return x.id === id; });
    if (idx >= 0) arr[idx] = obj; else arr.push(obj);
  };

  window._removeLocalDoc = function (collection, id) {
    if (!Array.isArray(window[collection])) return;
    window[collection] = window[collection].filter(function (x) { return x.id !== id; });
  };

  // ── Setup All Realtime Listeners ──
  window.RealtimeService = {
    setup: function () {
      var CORE_COLS = ['STAGES','PTYPES','PGROUPS','STAFF','USERS','PROJECTS','ADVANCES','LODGINGS','POSITIONS','HOLIDAYS','LEAVES','TIMESHEETS','COSTS','DEPARTMENTS'];
      var loadCount = 0;
      var _initialLoadDone = false;
      var _updateTimer = null;

      // Debounce timers for per-collection renders
      var _metaTimer = null;
      var _projTimer = null, _advTimer = null, _ldRenderTimer = null;
      var _holTimer = null, _lvTimer = null, _tsTimer = null, _costTimer = null;
      var _wlTimer = null, _cnTimer = null, _hspPTimer = null, _hspTimer = null;

      // Helper: skip realtime render if the snapshot is an echo of our own write
      function _ownWrite(col) { return window._ownWrite && window._ownWrite[col]; }

      // Debounced renderAll for metadata-only collections (STAGES, STAFF, etc.)
      function _deferRenderAll() {
        if (!window.cu || !window.isDbLoaded) return;
        clearTimeout(_metaTimer);
        _metaTimer = setTimeout(function () { window.renderAll && window.renderAll(); }, 300);
      }

      function _flashUpdate() {
        if (!_initialLoadDone) return;
        var stat = document.getElementById('tp-status');
        if (!stat) return;
        var now = new Date();
        var t = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2) + ':' + ('0' + now.getSeconds()).slice(-2);
        window._lastSyncTime = t;
        if (_updateTimer) clearTimeout(_updateTimer);
        stat.className = 'tp-badge ok';
        stat.innerHTML = '<span class="pulse ok"></span> กำลังอัปเดต...';
        _updateTimer = setTimeout(function () {
          stat.innerHTML = '<span class="pulse ok"></span> ' + t;
        }, 800);
      }

      function checkLoaded() {
        loadCount++;
        if (loadCount < CORE_COLS.length) return;
        window.isDbLoaded = true;

        if (!_initialLoadDone) {
          _initialLoadDone = true;
          window.hideLoader && window.hideLoader();
          window._mobileInit && window._mobileInit();
          if (window.cu) {
            window.setupUser && window.setupUser();
            window.renderAll && window.renderAll();
            window.startAutoStageLoop && window.startAutoStageLoop();
            if (window.checkDailyNotifications && window._settingsLoaded) window.checkDailyNotifications();
            else window._pendingDailyCheck = true;
            window._handleDeepLink && window._handleDeepLink();
          }
        } else if (window.cu) {
          _flashUpdate();
          // Per-collection onSnapshot handlers manage their own debounced renders
        }
      }

      // ── Core Collections ──
      window.onSnapshot(window.getColRef('STAGES'), function (s) {
        window.STAGES = s.docs.map(function (doc) { return transform.STAGES(doc.data()); }).sort(function (a,b) { return a.order - b.order; });
        checkLoaded();
        if (!_ownWrite('STAGES')) _deferRenderAll();
      }, window.showDbError);

      window.onSnapshot(window.getColRef('PTYPES'), function (s) {
        window.PTYPES = s.docs.map(function (doc) { return transform.PTYPES(doc.data()); });
        checkLoaded();
        if (!_ownWrite('PTYPES')) _deferRenderAll();
      }, window.showDbError);

      window.onSnapshot(window.getColRef('PGROUPS'), function (s) {
        window.PGROUPS = s.docs.map(function (doc) { return transform.PGROUPS(doc.data()); });
        checkLoaded();
        if (!_ownWrite('PGROUPS')) _deferRenderAll();
      }, window.showDbError);

      window.onSnapshot(window.getColRef('POSITIONS'), function (s) {
        window.POSITIONS = s.docs.map(function (doc) { return transform.POSITIONS(doc.data()); });
        checkLoaded();
        if (!_ownWrite('POSITIONS')) _deferRenderAll();
      }, window.showDbError);

      window.onSnapshot(window.getColRef('STAFF'), function (s) {
        window.STAFF = s.docs.map(function (doc) { return transform.STAFF(doc.data()); });
        checkLoaded();
        if (!_ownWrite('STAFF')) _deferRenderAll();
      }, window.showDbError);

      window.onSnapshot(window.getColRef('USERS'), function (s) {
        window.USERS = s.docs.map(function (doc) { return transform.USERS(doc.data()); });
        checkLoaded();
        if (window.cu && window.isDbLoaded) window.setupUser && window.setupUser();
        if (!_ownWrite('USERS')) _deferRenderAll();
      }, window.showDbError);

      window.onSnapshot(window.getColRef('PROJECTS'), function (s) {
        window.PROJECTS = s.docs.map(function (doc) { return transform.PROJECTS(doc.data()); });
        checkLoaded();
        if (_ownWrite('PROJECTS')) return;
        if (window.cu && window.isDbLoaded) {
          clearTimeout(_projTimer);
          _projTimer = setTimeout(function () {
            if (_von('view-overview'))      window.renderOverview && window.renderOverview();
            else if (_von('view-kanban'))   window.renderKanban && window.renderKanban();
            else if (_von('view-projects')) window.renderProjects && window.renderProjects();
            else if (_von('view-workload')) window.renderWorkload && window.renderWorkload();
            else if (_von('view-calendar')) window.renderCalendar && window.renderCalendar();
            else if (_von('view-availability')) window.renderAvailability && window.renderAvailability();
          }, 300);
        }
      }, window.showDbError);

      window.onSnapshot(window.getColRef('ADVANCES'), function (s) {
        window.ADVANCES = s.docs.map(function (doc) { return transform.ADVANCES(doc.data()); });
        checkLoaded();
        if (_ownWrite('ADVANCES')) return;
        if (window.cu && window.isDbLoaded) {
          clearTimeout(_advTimer);
          _advTimer = setTimeout(function () {
            if (_von('view-overview'))     window.renderOverview && window.renderOverview();
            else if (_von('view-advance')) window.renderAdvance && window.renderAdvance();
            window.updateBadge && window.updateBadge();
          }, 300);
        }
      }, window.showDbError);

      window.onSnapshot(window.getColRef('LODGINGS'), function (s) {
        window.LODGINGS = s.docs.map(function (doc) { return transform.LODGINGS(doc.data()); });
        checkLoaded();
        if (_ownWrite('LODGINGS')) return;
        if (window.cu && window.isDbLoaded && _von('view-lodging')) {
          clearTimeout(_ldRenderTimer);
          _ldRenderTimer = setTimeout(function () { window.renderLodging && window.renderLodging(); }, 300);
        }
      }, window.showDbError);

      window.onSnapshot(window.getColRef('HOLIDAYS'), function (s) {
        window.HOLIDAYS = s.docs.map(function (doc) { return transform.HOLIDAYS(doc.data()); }).sort(function (a,b) { return (a.date||'').localeCompare(b.date||''); });
        checkLoaded();
        if (_ownWrite('HOLIDAYS')) return;
        if (window.cu && window.isDbLoaded) {
          clearTimeout(_holTimer);
          _holTimer = setTimeout(function () {
            if (_von('view-holidays')) window.renderHolidays && window.renderHolidays();
            if (window.calTime === 'month') window.renderCalendar && window.renderCalendar();
          }, 300);
        }
      }, window.showDbError);

      window.onSnapshot(window.getColRef('LEAVES'), function (s) {
        window.LEAVES = s.docs.map(function (doc) { return transform.LEAVES(doc.data()); });
        checkLoaded();
        if (_ownWrite('LEAVES')) return;
        if (window.cu && window.isDbLoaded) {
          clearTimeout(_lvTimer);
          _lvTimer = setTimeout(function () {
            if (_von('view-leave'))    window.renderLeave && window.renderLeave();
            if (_von('view-calendar')) window.renderCalendar && window.renderCalendar();
          }, 300);
        }
      }, window.showDbError);

      window.onSnapshot(window.getColRef('TIMESHEETS'), function (s) {
        window.TIMESHEETS = s.docs.map(function (doc) { return transform.TIMESHEETS(doc.data()); });
        checkLoaded();
        if (_ownWrite('TIMESHEETS')) return;
        if (window.cu && window.isDbLoaded) {
          clearTimeout(_tsTimer);
          _tsTimer = setTimeout(function () {
            if (_von('view-timesheet')) window.renderTimesheet && window.renderTimesheet();
            if (_von('view-cost'))      window.renderCost && window.renderCost();
          }, 300);
        }
      }, window.showDbError);

      window.onSnapshot(window.getColRef('COSTS'), function (s) {
        window.COSTS = s.docs.map(function (doc) { return transform.COSTS(doc.data()); });
        checkLoaded();
        if (_ownWrite('COSTS')) return;
        if (window.cu && window.isDbLoaded) {
          clearTimeout(_costTimer);
          _costTimer = setTimeout(function () {
            if (_von('view-cost')) window.renderCost && window.renderCost();
          }, 300);
        }
      }, window.showDbError);

      window.onSnapshot(window.getColRef('DEPARTMENTS'), function (s) {
        window.DEPT_LIST = s.docs.map(function (doc) { return transform.DEPARTMENTS(doc.data()); }).sort(function (a,b) { return a.label.localeCompare(b.label, 'th'); });
        if (window.DEPT_LIST.length > 0) window.DEPARTMENTS = window.DEPT_LIST.map(function (d) { return d.label; });
        checkLoaded();
        if (!_ownWrite('DEPARTMENTS')) _deferRenderAll();
      }, window.showDbError);

      // ── Background Collections (non-blocking) ──
      window.onSnapshot(window.getColRef('WORK_LOGS'), function (s) {
        window.WORK_LOGS = s.docs.map(function (doc) { return transform.WORK_LOGS(doc.data()); }).sort(function (a,b) { var da=a.type==='daily'?a.date:a.startDate; var db=b.type==='daily'?b.date:b.startDate; return (db||'').localeCompare(da||''); });
        if (_ownWrite('WORK_LOGS')) return;
        if (window.cu) {
          clearTimeout(_wlTimer);
          _wlTimer = setTimeout(function () {
            if (_von('view-worklog'))      window.renderWorkLog && window.renderWorkLog();
            if (_von('view-calendar'))     window.renderCalendar && window.renderCalendar();
            if (_von('view-availability')) window.renderAvailability && window.renderAvailability();
          }, 300);
        }
      }, window.showDbError);

      window.onSnapshot(window.getColRef('CONTRACTS'), function (s) {
        window.CONTRACTS = s.docs.map(function (doc) { return transform.CONTRACTS(doc.data()); });
        if (_ownWrite('CONTRACTS')) return;
        if (window.cu && _von('view-contract')) {
          clearTimeout(_cnTimer);
          _cnTimer = setTimeout(function () { window.renderContract && window.renderContract(); }, 300);
        }
      }, window.showDbError);

      window.onSnapshot(window.getColRef('HSP_PRODUCTS'), function (s) {
        window.HSP_PRODUCTS = s.docs.map(function (doc) { return transform.HSP_PRODUCTS(doc.data()); }).sort(function (a,b) { return a.name.localeCompare(b.name, 'th'); });
        if (window.cu && window.admCur === 'hsp_products') window.admTab && window.admTab('hsp_products');
        if (_ownWrite('HSP_PRODUCTS')) return;
        if (window.cu && _von('view-hospital')) {
          clearTimeout(_hspPTimer);
          _hspPTimer = setTimeout(function () {
            window.renderHspProductMgmt && window.renderHspProductMgmt();
            if (window._hspViewMode === 'analysis') window.renderHspAnalysis && window.renderHspAnalysis();
          }, 300);
        }
      }, window.showDbError);

      window.onSnapshot(window.getColRef('HOSPITALS'), function (s) {
        window.HOSPITALS = s.docs.map(function (doc) { return transform.HOSPITALS(doc.data()); });
        if (_ownWrite('HOSPITALS')) return;
        if (window.cu && _von('view-hospital')) {
          clearTimeout(_hspTimer);
          _hspTimer = setTimeout(function () {
            var vm = window._hspViewMode || 'dashboard';
            if (vm === 'dashboard')       window.renderHspDashboard && window.renderHspDashboard();
            else if (vm === 'analysis')   { window._hspPopulateFilters && window._hspPopulateFilters(); window.renderHspAnalysis && window.renderHspAnalysis(); }
            else                          { window._hspPopulateFilters && window._hspPopulateFilters(); window.renderHospital && window.renderHospital(); }
          }, 300);
        }
      }, window.showDbError);

      // ── Settings Document ──
      window.onSnapshot(window.getDocRef('SETTINGS', 'app'), function (snap) {
        var d = snap.exists() ? snap.data() : {};
        window.NOTIFY_TOKEN          = d.notify_token || '';
        window.NOTIFY_ADVANCE_TOKEN  = d.notify_advance_token || '';
        window.NOTIFY_PROJECT_TOKEN  = d.notify_project_token || '';
        window._settingsLoaded = true;
        if (window.isDbLoaded && window._pendingDailyCheck && window.checkDailyNotifications) {
          window._pendingDailyCheck = false;
          window.checkDailyNotifications();
        }
        var rawTargets = d.year_targets || [];
        window.YEAR_TARGETS    = rawTargets.filter(function (t) { return t.year && !t._typeGroups; });
        var pbGroups = (rawTargets.find(function (t) { return !!t._typeGroups; }) || {})._typeGroups || [];
        if (pbGroups.length) {
          window.TARGET_TYPE_GROUPS = pbGroups;
          window.StorageService && window.StorageService.setTargetGroups(pbGroups);
        } else {
          window.TARGET_TYPE_GROUPS = (window.StorageService && window.StorageService.getTargetGroups()) || [];
        }
        if (d.tgt_grouped !== undefined && window.StorageService) window.StorageService.setTargetGrouped(d.tgt_grouped);
        window.SETTINGS = {
          allowance_weekday_normal: Number(d.allowance_weekday_normal) || 350,
          allowance_holiday_normal: Number(d.allowance_holiday_normal) || 650,
          allowance_weekday_border: Number(d.allowance_weekday_border) || 650,
          allowance_holiday_border: Number(d.allowance_holiday_border) || 1250,
        };
        if (window.cu && window.isDbLoaded) {
          if (_von('view-overview')) window.renderOverview && window.renderOverview();
          if (_von('view-targets'))  window.renderTargets && window.renderTargets();
        }
      });

      window.onSnapshot(window.getDocRef('SETTINGS', 'role_permissions'), function (snap) {
        window.ROLE_PERMISSIONS = snap.exists() ? snap.data() : {};
        if (window.cu) window.setupUser && window.setupUser();
      });
    },
  };

})();
