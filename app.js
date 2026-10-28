// =========================================================
// مراسلاتي 360° — نظام التقييم المتبادل المتكامل والتحليل الذكي
// متصل بقاعدة بيانات PostgreSQL السحابية (Neon DB) مع خادم API متكامل
// =========================================================

const API_BASE = '/api';
const TOKEN_KEY = 'm360_token';
const STORAGE_KEY = 'morasalaty_360_data';
const SESSION_USER_KEY = 'morasalaty_current_user';

// Cache cleanup: Automatically purge any legacy mock/demo evaluations in localStorage
(function purgeLegacyDemoCache() {
  const CURRENT_DATA_VERSION = 'v2026_m360_clean_prod_v2';
  try {
    if (localStorage.getItem('m360_cache_version') !== CURRENT_DATA_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('morasalaty_360_analysis_config');
      localStorage.setItem('m360_cache_version', CURRENT_DATA_VERSION);
    }
  } catch(e) {}
})();

const TEAM_COLORS = {
  "Admin": "#4F46E5",
  "TS": "#0284C7",
  "Sales": "#059669",
  "الإدارة": "#4F46E5",
  "الدعم الفني": "#0284C7",
  "المبيعات": "#059669"
};

// Application State
let EVAL_DATA = {};
let currentUser = null;
let currentSurvey = {
  evaluateeId: null,
  moduleIndex: 0,
  mode: 'detailed' // 'detailed' | 'quick'
};
let colleaguesFilter = 'all';
let currentHrTab = 'overview';
let selectedHrEmployeeId = 1;

// Drag & Drop State in HR Studio
let ddState = {
  chartType: 'bar',
  zones: {
    dimension: [],
    values: [],
    group: [],
    filter: []
  },
  dragging: null
};

// =========================================================
// API & Authentication Utilities
// =========================================================
function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

function setAuthToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(TOKEN_KEY, token);
  }
}

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(SESSION_USER_KEY);
  currentUser = null;
}

async function apiCall(endpoint, method = 'GET', data = null) {
  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const opts = { method, headers };
  if (data && (method === 'POST' || method === 'PUT')) {
    opts.body = JSON.stringify(data);
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, opts);
    const json = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data: json };
  } catch (err) {
    console.warn(`[API] Network error calling ${endpoint}:`, err);
    return { status: 0, ok: false, data: null, error: err };
  }
}

function updateCloudStatusBadge(isOnline, text) {
  const badges = [
    { el: document.getElementById('cloud-status-badge'), txt: document.getElementById('cloud-status-text') },
    { el: document.getElementById('hr-cloud-status-badge'), txt: document.getElementById('hr-cloud-status-text') }
  ];
  badges.forEach(b => {
    if (b.el && b.txt) {
      if (isOnline) {
        b.el.style.background = 'rgba(16,185,129,0.22)';
        b.el.style.borderColor = 'rgba(16,185,129,0.35)';
        b.txt.innerText = text || 'متصل بالسحابة';
      } else {
        b.el.style.background = 'rgba(239,68,68,0.2)';
        b.el.style.borderColor = 'rgba(239,68,68,0.35)';
        b.txt.innerText = text || 'وضع غير متصل';
      }
    }
  });
}

// =========================================================
// Storage & Synchronization
// =========================================================
async function loadEvalData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      EVAL_DATA = parsed.evaluations || {};
    } else {
      EVAL_DATA = {};
    }
  } catch (e) {
    console.error("Error reading localStorage:", e);
    EVAL_DATA = {};
  }

  // Pure real data sync with PostgreSQL server
  await loadRemoteEvaluations();
}

async function loadRemoteEvaluations() {
  if (!currentUser) return;
  try {
    if (currentUser.isHRAdmin || currentUser.id === 0) {
      const res = await apiCall('/analytics');
      if (res.ok && res.data && Array.isArray(res.data.rawEvaluations)) {
        EVAL_DATA = {}; // Reset before mapping authoritative data
        res.data.rawEvaluations.forEach(ev => {
          const key = `${ev.evaluator_id}_${ev.evaluatee_id}`;
          EVAL_DATA[key] = {
            id: ev.id,
            evaluatorId: ev.evaluator_id,
            evaluateeId: ev.evaluatee_id,
            cycleId: ev.cycle_id,
            status: ev.status,
            progress: ev.progress_pct,
            moduleAnswers: ev.module_answers || {},
            textAnswers: ev.text_answers || {},
            managerAnswers: ev.manager_answers || {},
            completedAt: ev.completed_at,
            updatedAt: ev.updated_at
          };
        });
        saveEvalData();
        updateCloudStatusBadge(true, `متصل بالسحابة (${res.data.rawEvaluations.length} تقييم)`);
        return;
      }
    } else {
      const res = await apiCall('/evaluations');
      if (res.ok && res.data && Array.isArray(res.data.colleagues)) {
        EVAL_DATA = {}; // Reset before mapping authoritative data
        res.data.colleagues.forEach(col => {
          if (col.status && col.status !== 'not_started') {
            const key = `${currentUser.id}_${col.employee.id}`;
            EVAL_DATA[key] = {
              id: col.evaluationId,
              evaluatorId: currentUser.id,
              evaluateeId: col.employee.id,
              cycleId: '2026-Q1',
              status: col.status,
              progress: col.progressPct,
              moduleAnswers: col.moduleAnswers || {},
              textAnswers: col.textAnswers || {},
              managerAnswers: col.managerAnswers || {},
              completedAt: col.completedAt,
              updatedAt: col.updatedAt
            };
          }
        });
        saveEvalData();
        updateCloudStatusBadge(true, 'متصل بالسحابة (مزامنة فورية)');
        return;
      }
    }
  } catch (err) {
    console.warn('Sync failed, continuing with local data:', err);
    updateCloudStatusBadge(false, 'وضع عدم الاتصال (محلي)');
  }
}

function saveEvalData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      evaluations: EVAL_DATA,
      currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, email: currentUser.email } : null,
      lastUpdated: new Date().toISOString()
    }));
  } catch (e) {
    console.error("Error saving localStorage:", e);
  }
}

// =========================================================
// General Helpers & Relationships
// =========================================================
function getInitials(name) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return parts[0][0] + " " + parts[1][0];
  }
  return parts[0].slice(0, 2);
}

function getEmployeeColor(emp) {
  if (!emp) return "#4F46E5";
  if (emp.isManager) return "#312E81";
  return TEAM_COLORS[emp.team] || "#4F46E5";
}

function getRelationship(evaluator, evaluatee) {
  if (!evaluator || !evaluatee) return { label: 'زميل', badgeClass: 'badge-rel-peer' };
  if (evaluator.managerId === evaluatee.id) {
    return { label: '👔 مديرك المباشر', badgeClass: 'badge-rel-manager', isDirectManager: true };
  }
  if (evaluatee.managerId === evaluator.id) {
    return { label: '👥 أحد أعضاء فريقك', badgeClass: 'badge-rel-report', isDirectReport: true };
  }
  if (evaluator.team === evaluatee.team) {
    return { label: '🏢 زميل بنفس الفريق', badgeClass: 'badge-rel-team', isSameTeam: true };
  }
  return { label: '🌐 زميل من قسم آخر', badgeClass: 'badge-rel-peer', isCrossTeam: true };
}

function getScoreClass(score) {
  if (score >= 4.5) return 's5';
  if (score >= 4.0) return 's4';
  if (score >= 3.0) return 's3';
  if (score >= 2.0) return 's2';
  return 's1';
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.setProperty('display', 'none', 'important');
  });
  const el = document.getElementById(screenId);
  if (el) {
    el.classList.add('active');
    el.style.setProperty('display', screenId === 'screen-login' ? 'flex' : 'block', 'important');
  }
  window.scrollTo(0, 0);
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>✓</span> <span>${msg}</span>`;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity .3s ease';
    setTimeout(() => t.remove(), 300);
  }, 2400);
}

function openModal(title, bodyHtml, footerHtml = '') {
  document.getElementById('modal-title').innerText = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-footer').innerHTML = footerHtml;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function openAnalysis() {
  window.open('analysis.html', '_blank');
}

// Quick 1-click login test helper
async function fillLogin(email, pass) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-pass').value = pass;
  await doLogin();
}

// =========================================================
// Authentication
// =========================================================
async function doLogin() {
  const emailInput = document.getElementById('login-email');
  const passInput = document.getElementById('login-pass');
  const errEmail = document.getElementById('err-email');
  const errPass = document.getElementById('err-pass');
  const submitBtn = document.querySelector('#screen-login button[type="submit"]') ||
                    document.querySelector('#screen-login .btn-primary');

  errEmail.style.display = 'none';
  errPass.style.display = 'none';

  const email = (emailInput.value || '').trim().toLowerCase();
  const pass = (passInput.value || '').trim();

  if (!email) {
    errEmail.innerText = 'يرجى إدخال البريد الإلكتروني الوظيفي';
    errEmail.style.display = 'block';
    return;
  }
  if (!pass) {
    errPass.innerText = 'يرجى إدخال كلمة المرور';
    errPass.style.display = 'block';
    return;
  }

  const origBtnText = submitBtn ? submitBtn.innerText : '';
  if (submitBtn) {
    submitBtn.innerText = 'جاري التحقق والاتصال بقاعدة البيانات...';
    submitBtn.disabled = true;
  }

  try {
    // 1. Try real backend API call
    const res = await apiCall('/auth/login', 'POST', { email, password: pass });
    if (res.ok && res.data && res.data.ok) {
      setAuthToken(res.data.token);
      currentUser = res.data.user;
      sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(currentUser));

      await loadRemoteEvaluations();

      if (currentUser.isHRAdmin || currentUser.id === 0 || currentUser.email === 'mahmoud@tieapps.com') {
        showScreen('screen-hr');
        renderHrDashboard();
      } else {
        showScreen('screen-dashboard');
        renderEmployeeDashboard();
      }
      return;
    } else if (res.status === 401 || res.status === 400) {
      const msg = res.data?.error || 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
      errPass.innerText = msg;
      errPass.style.display = 'block';
      return;
    }
  } catch (err) {
    console.warn('Backend login unavailable, checking offline mode...', err);
  } finally {
    if (submitBtn) {
      submitBtn.innerText = origBtnText;
      submitBtn.disabled = false;
    }
  }

  // 2. Offline / local fallback
  // Super Admin / Platform Owner
  if (email === 'mahmoud@tieapps.com' && (pass === 'mora123' || pass === 'mahmoud123' || pass === 'admin123' || pass === '123456')) {
    currentUser = typeof SUPER_ADMIN !== 'undefined' ? SUPER_ADMIN : {
      id: 99,
      name: "محمود هاشم",
      email: "mahmoud@tieapps.com",
      role: "مالك المنصة والمدير العام",
      team: "Admin",
      isHRAdmin: true,
      isManager: true
    };
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(currentUser));
    showScreen('screen-hr');
    renderHrDashboard();
    return;
  }

  // HR Admin
  if ((email === 'hr.admin@samaagroup.net' || email === 'hr.admin@morasalaty.com') && (pass === 'mora123' || pass === 'hradmin2024' || pass === DEMO_PASSWORDS[email])) {
    currentUser = HR_ADMIN;
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(currentUser));
    showScreen('screen-hr');
    renderHrDashboard();
    return;
  }

  const emp = EMPLOYEES.find(e => e.email.toLowerCase() === email);
  if (!emp) {
    errEmail.innerText = 'البريد الإلكتروني غير مسجل في قائمة موظفي شركة مراسلاتي';
    errEmail.style.display = 'block';
    return;
  }

  const expectedPass = DEMO_PASSWORDS[email] || 'mora123';
  const isMatch = (pass === 'mora123') || (pass === expectedPass) || (pass === '123456') || (pass === `${email.split('@')[0]}123`);
  if (!isMatch) {
    errPass.innerText = 'كلمة المرور غير صحيحة';
    errPass.style.display = 'block';
    return;
  }

  currentUser = emp;
  sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(currentUser));
  showScreen('screen-dashboard');
  renderEmployeeDashboard();
}

async function doLogout() {
  try {
    await apiCall('/auth/logout', 'POST');
  } catch (e) {}
  clearAuth();
  document.getElementById('login-email').value = '';
  document.getElementById('login-pass').value = '';
  showScreen('screen-login');
}

// =========================================================
// Employee Dashboard
// =========================================================
function getColleagueEvalStatus(evaluatorId, colleagueId) {
  const key = `${evaluatorId}_${colleagueId}`;
  const ev = EVAL_DATA[key];
  if (!ev) return { status: 'not_started', progress: 0, completedModules: 0 };
  if (ev.status === 'completed') return { status: 'completed', progress: 100, completedModules: 10 };

  let completedModules = 0;
  for (let m = 1; m <= 10; m++) {
    const modAnswers = ev.moduleAnswers?.[`m${m}`];
    if (modAnswers && Object.keys(modAnswers).length >= 10) {
      completedModules++;
    }
  }
  return {
    status: completedModules > 0 ? 'in_progress' : 'not_started',
    progress: Math.round((completedModules / 10) * 100),
    completedModules
  };
}

function renderEmployeeDashboard() {
  if (!currentUser) return;

  const avatar = document.getElementById('topbar-avatar');
  const name = document.getElementById('topbar-name');
  const welcome = document.getElementById('dash-welcome');

  avatar.innerText = getInitials(currentUser.name);
  avatar.style.background = getEmployeeColor(currentUser);
  name.innerText = `${currentUser.name} (${currentUser.role})`;
  welcome.innerText = `مرحباً بك، ${currentUser.name} 👋`;

  // Filter peers (Excluding self strictly)
  const peers = EMPLOYEES.filter(e => e.id !== currentUser.id);
  const total = peers.length; // 16 peers

  let doneCount = 0;
  let progressCount = 0;
  let remainingCount = 0;

  peers.forEach(peer => {
    const s = getColleagueEvalStatus(currentUser.id, peer.id);
    if (s.status === 'completed') doneCount++;
    else if (s.status === 'in_progress') progressCount++;
    else remainingCount++;
  });

  const completionPercent = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  document.getElementById('dash-progress-fill').style.width = `${completionPercent}%`;
  document.getElementById('dash-progress-label').innerText = `أنجزت ${doneCount} من أصل ${total} تقييماً مطلوباً (${completionPercent}%)`;

  document.getElementById('st-total').innerText = total;
  document.getElementById('st-done').innerText = doneCount;
  document.getElementById('st-progress').innerText = progressCount;
  document.getElementById('st-remaining').innerText = remainingCount;

  renderColleaguesGrid();
}

function filterColleagues(type, btnEl) {
  colleaguesFilter = type;
  if (btnEl && btnEl.parentElement) {
    btnEl.parentElement.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    btnEl.classList.add('active');
  }
  renderColleaguesGrid();
}

function renderColleaguesGrid() {
  const container = document.getElementById('colleagues-grid');
  if (!container || !currentUser) return;

  const peers = EMPLOYEES.filter(e => e.id !== currentUser.id);
  const filtered = peers.filter(p => {
    const s = getColleagueEvalStatus(currentUser.id, p.id);
    if (colleaguesFilter === 'all') return true;
    return s.status === colleaguesFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px; background: white; border-radius: var(--radius); border: 1px dashed var(--border);">
        <span style="font-size: 2.5rem; display: block; margin-bottom: 8px;">🔍</span>
        <h4 style="color: var(--text);">لا يوجد موظفون في هذه الفئة حالياً</h4>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">جرب تبديل الفلتر لعرض بقية الزملاء المطلوب تقييمهم</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(peer => {
    const s = getColleagueEvalStatus(currentUser.id, peer.id);
    const color = getEmployeeColor(peer);
    const initials = getInitials(peer.name);
    const rel = getRelationship(currentUser, peer);

    let badgeClass = 'badge-not-started';
    let badgeText = 'لم يبدأ';
    let cardStatusClass = 'not-started';
    if (s.status === 'completed') {
      badgeClass = 'badge-completed';
      badgeText = 'مكتمل ✓';
      cardStatusClass = 'completed';
    } else if (s.status === 'in_progress') {
      badgeClass = 'badge-in-progress';
      badgeText = 'قيد الإجراء';
      cardStatusClass = 'in-progress';
    }

    const actionText = s.status === 'completed' ? 'مراجعة التقييم' : (s.status === 'in_progress' ? 'استكمال التقييم' : 'بدء التقييم');
    const actionBtnClass = s.status === 'completed' ? 'btn-ghost' : 'btn-primary';

    return `
      <div class="colleague-card ${cardStatusClass}" onclick="startSurvey(${peer.id})">
        <div class="colleague-header">
          <div class="colleague-avatar" style="background:${color};">${initials}</div>
          <div class="colleague-info">
            <div class="colleague-name">${peer.name}</div>
            <div class="colleague-role">${peer.role}</div>
          </div>
          <span class="status-badge ${badgeClass}">${badgeText}</span>
        </div>
        
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div class="colleague-team" style="margin:0;">🏢 ${peer.team}</div>
          <span class="badge-rel ${rel.badgeClass}">${rel.label}</span>
        </div>

        <div class="colleague-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width:${s.progress}%; background:${s.status === 'completed' ? 'var(--success)' : (s.status === 'in_progress' ? 'var(--warning)' : 'var(--primary)')};"></div>
          </div>
          <span class="progress-text">${s.completedModules} / 10 وحدات (${s.progress}%)</span>
        </div>

        <div style="margin-top:14px;display:flex;justify-content:flex-end;">
          <span class="btn ${actionBtnClass} btn-sm" style="pointer-events:none;">${actionText} ←</span>
        </div>
      </div>
    `;
  }).join('');
}

// =========================================================
// Survey Flow (Quick & Detailed Modes)
// =========================================================
function setSurveyMode(mode) {
  currentSurvey.mode = mode;
  const btnQuick = document.getElementById('btn-mode-quick');
  const btnDetailed = document.getElementById('btn-mode-detailed');

  if (mode === 'quick') {
    btnQuick.style.background = 'white';
    btnQuick.style.color = 'var(--primary)';
    btnDetailed.style.background = 'transparent';
    btnDetailed.style.color = 'white';
  } else {
    btnDetailed.style.background = 'white';
    btnDetailed.style.color = 'var(--primary)';
    btnQuick.style.background = 'transparent';
    btnQuick.style.color = 'white';
  }

  renderSurvey();
}

function startSurvey(evaluateeId) {
  // Prevent self evaluation strictly
  if (currentUser && evaluateeId === currentUser.id) {
    alert("تنبيه: لا يمكنك تقييم نفسك وفق معايير التقييم المتبادل 360°.");
    return;
  }

  const evaluatee = EMPLOYEES.find(e => e.id === evaluateeId);
  if (!evaluatee) return;

  currentSurvey.evaluateeId = evaluateeId;
  currentSurvey.moduleIndex = 0;

  const key = `${currentUser.id}_${evaluateeId}`;
  if (!EVAL_DATA[key]) {
    EVAL_DATA[key] = {
      evaluatorId: currentUser.id,
      evaluateeId,
      cycleId: '2024-Q4',
      status: 'in_progress',
      moduleAnswers: {},
      textAnswers: {},
      managerAnswers: {}
    };
    saveEvalData();
  }

  showScreen('screen-survey');
  renderSurvey();
}

function goToDashboard() {
  showScreen('screen-dashboard');
  renderEmployeeDashboard();
}

function selectModule(index) {
  if (index < 0 || index >= MODULES.length) return;
  currentSurvey.moduleIndex = index;
  renderSurvey();
}

function prevModule() {
  if (currentSurvey.moduleIndex > 0) {
    selectModule(currentSurvey.moduleIndex - 1);
  }
}

function nextModule() {
  if (currentSurvey.moduleIndex < MODULES.length - 1) {
    selectModule(currentSurvey.moduleIndex + 1);
  }
}

function renderSurvey() {
  const evaluatee = EMPLOYEES.find(e => e.id === currentSurvey.evaluateeId);
  if (!evaluatee || !currentUser) return;

  const key = `${currentUser.id}_${evaluatee.id}`;
  const ev = EVAL_DATA[key] || { moduleAnswers: {}, textAnswers: {}, managerAnswers: {} };
  const rel = getRelationship(currentUser, evaluatee);

  // Topbar Title
  document.getElementById('survey-topbar-name').innerText = evaluatee.name;

  // Sidebar Profile Card
  const sAvatar = document.getElementById('survey-avatar');
  sAvatar.innerText = getInitials(evaluatee.name);
  sAvatar.style.background = getEmployeeColor(evaluatee);
  document.getElementById('survey-name').innerText = evaluatee.name;
  document.getElementById('survey-role').innerHTML = `
    <div>${evaluatee.role} · ${evaluatee.team}</div>
    <div style="margin-top:6px;"><span class="badge-rel ${rel.badgeClass}">${rel.label}</span></div>
  `;

  // Count done modules
  let doneModulesCount = 0;
  for (let m = 1; m <= 10; m++) {
    const modAns = ev.moduleAnswers?.[`m${m}`];
    if (modAns && Object.keys(modAns).length >= 10) doneModulesCount++;
  }
  document.getElementById('sidebar-progress-label').innerText = `تم إنجاز ${doneModulesCount} من 10 وحدات (${Math.round((doneModulesCount / 10) * 100)}%)`;

  // Sidebar modules
  const sbModules = document.getElementById('sidebar-modules');
  sbModules.innerHTML = MODULES.map((m, idx) => {
    const isActive = (currentSurvey.mode === 'detailed' && idx === currentSurvey.moduleIndex);
    const modAns = ev.moduleAnswers?.[`m${m.id}`];
    const isDone = modAns && Object.keys(modAns).length >= 10;
    return `
      <div class="sidebar-module ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}" onclick="selectModule(${idx})">
        <span class="sidebar-module-icon" style="background:${m.color}15;color:${m.color};">${m.icon}</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.id}. ${m.title}</span>
        ${isDone ? '<span class="sidebar-module-check">✓</span>' : ''}
      </div>
    `;
  }).join('');

  const mainContainer = document.getElementById('survey-main');
  const firstName = evaluatee.name.split(' ')[0];

  // ==========================================
  // Render Branch: QUICK MODE vs DETAILED MODE
  // ==========================================
  if (currentSurvey.mode === 'quick') {
    renderQuickSurvey(mainContainer, evaluatee, ev, firstName, rel);
  } else {
    renderDetailedSurvey(mainContainer, evaluatee, ev, firstName, rel);
  }
}

// 1. Detailed Survey View (15 Questions per Module)
function renderDetailedSurvey(container, evaluatee, ev, firstName, rel) {
  const currentMod = MODULES[currentSurvey.moduleIndex];
  const modAnswers = ev.moduleAnswers?.[`m${currentMod.id}`] || {};

  const answeredInThisMod = Object.keys(modAnswers).length;
  const totalInThisMod = currentMod.questions.length;
  const modProgressPercent = Math.round((answeredInThisMod / totalInThisMod) * 100);

  const questionsHtml = currentMod.questions.map((q, qIdx) => {
    const qText = q.text.replace(/\{name\}/g, `<span class="emp-name">${firstName}</span>`);
    const currentVal = modAnswers[q.id];
    const isAnswered = currentVal !== undefined && currentVal !== null;

    if (q.type === 'text') {
      const textVal = ev.textAnswers?.[q.id] || '';
      return `
        <div class="question-card ${textVal ? 'answered' : ''}">
          <div class="question-num">السؤال ${qIdx + 1} من ${totalInThisMod} ${q.optional ? '<span class="optional-badge">ملاحظات نوعية اختيارية</span>' : ''}</div>
          <div class="question-text">${qText}</div>
          <textarea class="text-answer" placeholder="اكتب ملاحظاتك المهنية بموضوعية وصراحة بناءة..." oninput="handleTextAnswer('${q.id}', this.value)">${textVal}</textarea>
        </div>
      `;
    }

    const optionsHtml = SCALE_OPTIONS.map(opt => {
      const isChecked = currentVal === opt.value;
      const isNA = opt.value === 'N/A';
      return `
        <label class="scale-option ${isNA ? 'na' : ''}">
          <input type="radio" name="${q.id}" value="${opt.value}" ${isChecked ? 'checked' : ''} onchange="handleScaleAnswer(${currentMod.id}, '${q.id}', '${opt.value}')">
          <div class="scale-label">
            <span class="scale-num">${isNA ? '⚪' : opt.value}</span>
            <span class="scale-text">${opt.label}</span>
          </div>
        </label>
      `;
    }).join('');

    return `
      <div class="question-card ${isAnswered ? 'answered' : ''}">
        <div class="question-num">السؤال ${qIdx + 1} من ${totalInThisMod}</div>
        <div class="question-text">${qText}</div>
        <div class="scale-options">${optionsHtml}</div>
      </div>
    `;
  }).join('');

  // Manager Questions (When evaluating a manager on Module 10)
  let managerHtml = '';
  if (evaluatee.isManager && currentMod.id === 10 && typeof MANAGER_EXTRA_QUESTIONS !== 'undefined') {
    const mgrAnswers = ev.managerAnswers || {};
    const mgrQuestions = MANAGER_EXTRA_QUESTIONS.map((mq, mqIdx) => {
      const mqText = mq.text.replace(/\{name\}/g, `<span class="emp-name">${firstName}</span>`);
      const currentVal = mgrAnswers[mq.id];
      const isAnswered = currentVal !== undefined && currentVal !== null;

      const opts = SCALE_OPTIONS.map(opt => {
        const isChecked = currentVal === opt.value;
        const isNA = opt.value === 'N/A';
        return `
          <label class="scale-option ${isNA ? 'na' : ''}">
            <input type="radio" name="${mq.id}" value="${opt.value}" ${isChecked ? 'checked' : ''} onchange="handleManagerAnswer('${mq.id}', '${opt.value}')">
            <div class="scale-label">
              <span class="scale-num">${isNA ? '⚪' : opt.value}</span>
              <span class="scale-text">${opt.label}</span>
            </div>
          </label>
        `;
      }).join('');

      return `
        <div class="question-card ${isAnswered ? 'answered' : ''}" style="margin-bottom:12px;">
          <div class="question-num">محور القيادة — سؤال ${mqIdx + 1} من ${MANAGER_EXTRA_QUESTIONS.length}</div>
          <div class="question-text">${mqText}</div>
          <div class="scale-options">${opts}</div>
        </div>
      `;
    }).join('');

    managerHtml = `
      <div class="manager-section">
        <div class="manager-section-title">👔 قسم إضافي: تقييم المهارات القيادية والإدارية (${firstName} مدير مباشر)</div>
        <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:16px;">يرجى تقييم مهارات التوجيه والعدالة وتطوير الفريق:</div>
        ${mgrQuestions}
      </div>
    `;
  }

  container.innerHTML = `
    <div class="survey-module-header">
      <div class="module-title-row">
        <div class="module-icon-big" style="background:${currentMod.color}15;color:${currentMod.color};">${currentMod.icon}</div>
        <div>
          <div class="module-title">الوحدة ${currentMod.id}: ${currentMod.title}</div>
          <div class="module-desc">${currentMod.description}</div>
        </div>
      </div>
      <div class="module-progress">
        <div class="module-progress-bar"><div class="module-progress-fill" style="width:${modProgressPercent}%;background:${currentMod.color};"></div></div>
        <div class="module-progress-text">تمت الإجابة على ${answeredInThisMod} من ${totalInThisMod} سؤال (${modProgressPercent}%)</div>
      </div>
    </div>
    <div class="questions-list">${questionsHtml}</div>
    ${managerHtml}
  `;

  // Nav buttons
  const isFirst = currentSurvey.moduleIndex === 0;
  const isLast = currentSurvey.moduleIndex === MODULES.length - 1;

  document.getElementById('btn-prev-module').style.visibility = isFirst ? 'hidden' : 'visible';
  document.getElementById('btn-next-module').style.display = isLast ? 'none' : 'inline-flex';
  document.getElementById('btn-submit-survey').classList.toggle('hidden', !isLast);
  document.getElementById('survey-nav-info').innerText = `الوحدة ${currentMod.id} من ${MODULES.length} · تم الإجابة على ${answeredInThisMod} من ${totalInThisMod} سؤالاً`;
}

// 2. Quick Survey Mode (10 High-Level Modules with Conditional Deep Dive)
function renderQuickSurvey(container, evaluatee, ev, firstName, rel) {
  const moduleCards = MODULES.map(m => {
    const modAns = ev.moduleAnswers?.[`m${m.id}`] || {};
    // Average or primary score
    const scores = Object.values(modAns).filter(v => typeof v === 'number');
    const primaryScore = scores.length > 0 ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null;
    const isNA = Object.values(modAns).includes('N/A');

    const opts = SCALE_OPTIONS.map(opt => {
      const isChecked = primaryScore === opt.value || (opt.value === 'N/A' && isNA);
      const isNaOpt = opt.value === 'N/A';
      return `
        <label class="scale-option ${isNaOpt ? 'na' : ''}" style="margin:0;">
          <input type="radio" name="quick_m${m.id}" value="${opt.value}" ${isChecked ? 'checked' : ''} onchange="handleQuickModuleAnswer(${m.id}, '${opt.value}')">
          <div class="scale-label" style="min-height:54px;padding:6px 4px;">
            <span class="scale-num" style="font-size:0.95rem;">${isNaOpt ? '⚪' : opt.value}</span>
            <span class="scale-text" style="font-size:0.62rem;">${opt.label}</span>
          </div>
        </label>
      `;
    }).join('');

    // If score is 1 or 2, auto expand top sub-questions for justification
    const needsDetail = primaryScore !== null && primaryScore <= 2;
    let detailSection = '';
    if (needsDetail) {
      detailSection = `
        <div style="margin-top:12px;padding:12px;background:#FFF1F2;border-radius:8px;border:1px solid #FECDD3;">
          <div style="font-size:0.75rem;font-weight:700;color:#9F1239;margin-bottom:6px;">⚠️ تفصيل سبب التقييم المنخفض (ملاحظات مساعدة للتطوير):</div>
          <div style="font-size:0.8rem;color:#475569;">
            ${m.questions.slice(0, 3).map(q => `
              <div style="margin-bottom:6px;">• ${q.text.replace(/\{name\}/g, firstName)}</div>
            `).join('')}
          </div>
        </div>
      `;
    }

    return `
      <div class="question-card ${primaryScore !== null || isNA ? 'answered' : ''}" style="margin-bottom:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.3rem;">${m.icon}</span>
            <div>
              <div style="font-weight:800;font-size:0.95rem;">${m.id}. ${m.title}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${m.description}</div>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" style="font-size:0.72rem;" onclick="switchToDetailedModule(${m.id - 1})">التفاصيل (15 سؤالاً) ↗</button>
        </div>
        <div class="scale-options">${opts}</div>
        ${detailSection}
      </div>
    `;
  }).join('');

  // Qualitative Feedback Section
  const q14Val = ev.textAnswers?.['m10q14'] || '';
  const q15Val = ev.textAnswers?.['m10q15'] || '';

  container.innerHTML = `
    <div style="background:white;padding:20px;border-radius:var(--radius);border:1px solid var(--border);margin-bottom:20px;box-shadow:var(--shadow);">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <h3 style="margin-bottom:4px;display:flex;align-items:center;gap:8px;">
            <span>⚡</span> نموذج التقييم السريع بالمحاور الرئيسية
          </h3>
          <p style="font-size:0.82rem;color:var(--text-muted);margin:0;">
            يتيح لك هذا الوضع تقييم الزميل عبر المحاور العشرة بفاعلية وسرعة، مع التوسيع التلقائي لفرص التطوير.
          </p>
        </div>
        <span class="badge-rel ${rel.badgeClass}">${rel.label}</span>
      </div>
    </div>

    <div>${moduleCards}</div>

    <!-- Text Feedback -->
    <div style="background:white;padding:20px;border-radius:var(--radius);border:1px solid var(--border);margin-top:20px;box-shadow:var(--shadow);">
      <h4 style="margin-bottom:14px;color:var(--primary);">📝 الملاحظات النوعية وفرص التحسين</h4>
      
      <div style="margin-bottom:16px;">
        <label style="font-size:0.85rem;font-weight:700;display:block;margin-bottom:6px;">أبرز نقاط قوة ${firstName} في العمل الجماعي والمشروعات:</label>
        <textarea class="text-answer" placeholder="مثال: التزام ممتاز، دقة برمجية، مبادرة عالية..." oninput="handleTextAnswer('m10q14', this.value)">${q14Val}</textarea>
      </div>

      <div>
        <label style="font-size:0.85rem;font-weight:700;display:block;margin-bottom:6px;">فرصة تطوير مقترحة يمكن لـ ${firstName} التركيز عليها:</label>
        <textarea class="text-answer" placeholder="مثال: تعزيز التوثيق، إدارة الأولويات وقت الضغط..." oninput="handleTextAnswer('m10q15', this.value)">${q15Val}</textarea>
      </div>
    </div>
  `;

  // Nav buttons in quick mode
  document.getElementById('btn-prev-module').style.visibility = 'hidden';
  document.getElementById('btn-next-module').style.display = 'none';
  document.getElementById('btn-submit-survey').classList.remove('hidden');
  document.getElementById('survey-nav-info').innerText = `الوضع السريع الموحد · 10 محاور رئيسية`;
}

function switchToDetailedModule(idx) {
  setSurveyMode('detailed');
  selectModule(idx);
}

let remoteSaveTimer = null;
function scheduleRemoteSave(evaluateeId) {
  clearTimeout(remoteSaveTimer);
  flashSaveStatus('saving');
  remoteSaveTimer = setTimeout(async () => {
    if (!currentUser) return;
    const key = `${currentUser.id}_${evaluateeId}`;
    const ev = EVAL_DATA[key];
    if (!ev) return;

    let answeredCount = 0;
    for (let m = 1; m <= 10; m++) {
      const ma = ev.moduleAnswers?.[`m${m}`];
      if (ma) answeredCount += Object.keys(ma).length;
    }
    const pct = Math.min(99, Math.round((answeredCount / 150) * 100));

    try {
      const res = await apiCall('/evaluations/save', 'POST', {
        evaluateeId,
        moduleAnswers: ev.moduleAnswers || {},
        textAnswers: ev.textAnswers || {},
        managerAnswers: ev.managerAnswers || {},
        progressPct: pct
      });
      if (res.ok) {
        flashSaveStatus('saved');
      } else {
        flashSaveStatus('local');
      }
    } catch(e) {
      flashSaveStatus('local');
    }
  }, 400);
}

function handleQuickModuleAnswer(moduleId, rawVal) {
  const evaluateeId = currentSurvey.evaluateeId;
  const key = `${currentUser.id}_${evaluateeId}`;
  if (!EVAL_DATA[key]) return;

  if (!EVAL_DATA[key].moduleAnswers) EVAL_DATA[key].moduleAnswers = {};
  if (!EVAL_DATA[key].moduleAnswers[`m${moduleId}`]) EVAL_DATA[key].moduleAnswers[`m${moduleId}`] = {};

  const val = rawVal === 'N/A' ? 'N/A' : Number(rawVal);
  // Fill questions in this module
  for (let q = 1; q <= 15; q++) {
    EVAL_DATA[key].moduleAnswers[`m${moduleId}`][`m${moduleId}q${q}`] = val;
  }
  EVAL_DATA[key].status = 'in_progress';
  saveEvalData();

  scheduleRemoteSave(evaluateeId);
  renderSurvey();
}

function handleScaleAnswer(moduleId, questionId, rawValue) {
  const evaluateeId = currentSurvey.evaluateeId;
  const key = `${currentUser.id}_${evaluateeId}`;
  if (!EVAL_DATA[key]) return;

  if (!EVAL_DATA[key].moduleAnswers) EVAL_DATA[key].moduleAnswers = {};
  if (!EVAL_DATA[key].moduleAnswers[`m${moduleId}`]) EVAL_DATA[key].moduleAnswers[`m${moduleId}`] = {};

  const val = rawValue === 'N/A' ? 'N/A' : Number(rawValue);
  EVAL_DATA[key].moduleAnswers[`m${moduleId}`][questionId] = val;
  EVAL_DATA[key].status = 'in_progress';
  saveEvalData();

  scheduleRemoteSave(evaluateeId);
  updateModuleHeaderProgress();
}

function handleManagerAnswer(questionId, rawValue) {
  const evaluateeId = currentSurvey.evaluateeId;
  const key = `${currentUser.id}_${evaluateeId}`;
  if (!EVAL_DATA[key]) return;

  if (!EVAL_DATA[key].managerAnswers) EVAL_DATA[key].managerAnswers = {};
  const val = rawValue === 'N/A' ? 'N/A' : Number(rawValue);
  EVAL_DATA[key].managerAnswers[questionId] = val;
  saveEvalData();

  scheduleRemoteSave(evaluateeId);
}

function handleTextAnswer(questionId, text) {
  const evaluateeId = currentSurvey.evaluateeId;
  const key = `${currentUser.id}_${evaluateeId}`;
  if (!EVAL_DATA[key]) return;

  if (!EVAL_DATA[key].textAnswers) EVAL_DATA[key].textAnswers = {};
  EVAL_DATA[key].textAnswers[questionId] = text;
  saveEvalData();

  scheduleRemoteSave(evaluateeId);
}

function flashSaveStatus(state = 'saved') {
  const el = document.getElementById('survey-save-status');
  if (!el) return;

  if (state === 'saving') {
    el.innerText = '☁️ جاري الحفظ في السحابة...';
    el.style.color = '#FEF08A';
  } else if (state === 'saved') {
    el.innerText = '✓ تم الحفظ في قاعدة البيانات';
    el.style.color = '#86EFAC';
    setTimeout(() => { if (el) el.innerText = ''; }, 2000);
  } else {
    el.innerText = 'تم الحفظ محلياً ✓';
    el.style.color = '#A5B4FC';
    setTimeout(() => { if (el) el.innerText = ''; }, 2000);
  }
}

function updateModuleHeaderProgress() {
  const evaluateeId = currentSurvey.evaluateeId;
  const key = `${currentUser.id}_${evaluateeId}`;
  const ev = EVAL_DATA[key];
  if (!ev) return;

  const currentMod = MODULES[currentSurvey.moduleIndex];
  const modAnswers = ev.moduleAnswers?.[`m${currentMod.id}`] || {};
  const answeredCount = Object.keys(modAnswers).length;
  const totalCount = currentMod.questions.length;
  const pct = Math.round((answeredCount / totalCount) * 100);

  const fillEl = document.querySelector('.module-progress-fill');
  if (fillEl) fillEl.style.width = `${pct}%`;
  const textEl = document.querySelector('.module-progress-text');
  if (textEl) textEl.innerText = `تمت الإجابة على ${answeredCount} من ${totalCount} سؤال (${pct}%)`;
}

function submitSurvey() {
  const evaluateeId = currentSurvey.evaluateeId;
  const key = `${currentUser.id}_${evaluateeId}`;
  const ev = EVAL_DATA[key];
  const evaluatee = EMPLOYEES.find(e => e.id === evaluateeId);

  let totalAnswered = 0;
  for (let m = 1; m <= 10; m++) {
    const ma = ev?.moduleAnswers?.[`m${m}`];
    if (ma) totalAnswered += Object.keys(ma).length;
  }

  const modalBody = `
    <div style="text-align:center;padding:12px 0;">
      <span style="font-size:3rem;display:block;margin-bottom:12px;">📋</span>
      <h3 style="margin-bottom:8px;">تأكيد اعتماد وإرسال تقييم ${evaluatee.name}</h3>
      <p style="font-size:0.88rem;color:var(--text-muted);line-height:1.6;">
        تمت الإجابة على <strong>${totalAnswered}</strong> عنصراً. 
        بمجرد الاعتماد النهائي، تُقفل الاستمارة وتُرسل مباشرة إلى قاعدة البيانات السحابية ومحرك التحليل ولوحة الموارد البشرية بسرية تامة.
      </p>
    </div>
  `;

  const modalFooter = `
    <button class="btn btn-ghost" onclick="closeModal()">مراجعة الإجابات</button>
    <button class="btn btn-success" onclick="confirmSubmitSurvey('${key}')">اعتماد وإرسال التقييم النهائي ✓</button>
  `;

  openModal('تأكيد إرسال التقييم', modalBody, modalFooter);
}

async function confirmSubmitSurvey(key) {
  const evaluateeId = currentSurvey.evaluateeId;
  const ev = EVAL_DATA[key];

  if (ev) {
    ev.status = 'completed';
    ev.completedAt = new Date().toISOString();
    saveEvalData();
  }
  closeModal();

  try {
    const res = await apiCall('/evaluations/submit', 'POST', {
      evaluateeId,
      moduleAnswers: ev?.moduleAnswers || {},
      textAnswers: ev?.textAnswers || {},
      managerAnswers: ev?.managerAnswers || {}
    });
    if (res.ok) {
      showToast('✓ تم اعتماد التقييم بنجاح وحفظه في قاعدة البيانات المركزية!');
    } else {
      showToast('تم اعتماد التقييم محلياً وجاري المزامنة');
    }
  } catch (e) {
    showToast('تم اعتماد التقييم محلياً (وضع عدم الاتصال)');
  }

  // Refresh evaluations from server to ensure accurate live state
  await loadRemoteEvaluations();
  goToDashboard();
}

// =========================================================
// Advanced HR Analytics Calculations
// =========================================================
function calcEmployeeModuleScore(employeeId, moduleId) {
  const scores = [];
  Object.values(EVAL_DATA).forEach(ev => {
    if (ev.evaluateeId !== employeeId || ev.status !== 'completed') return;
    const modData = ev.moduleAnswers?.[`m${moduleId}`];
    if (!modData) return;
    Object.values(modData).forEach(v => {
      // Exclude N/A strictly from average
      if (typeof v === 'number') scores.push(v);
    });
  });
  if (scores.length === 0) return null;
  return {
    avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    count: scores.length
  };
}

function calcEmployeeOverallScore(employeeId) {
  const moduleAvgs = [];
  let totalValidAnswers = 0;
  for (let m = 1; m <= 10; m++) {
    const s = calcEmployeeModuleScore(employeeId, m);
    if (s) {
      moduleAvgs.push(s.avg);
      totalValidAnswers += s.count;
    }
  }
  if (moduleAvgs.length === 0) return null;
  return {
    avg: moduleAvgs.reduce((a, b) => a + b, 0) / moduleAvgs.length,
    count: totalValidAnswers
  };
}

function calcTeamScore(teamName) {
  const teamEmps = EMPLOYEES.filter(e => e.team === teamName);
  const scores = [];
  teamEmps.forEach(emp => {
    const s = calcEmployeeOverallScore(emp.id);
    if (s) scores.push(s.avg);
  });
  if (scores.length === 0) return null;
  return {
    avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    count: scores.length
  };
}

// =========================================================
// HR Dashboard Views
// =========================================================
function hrNav(tabName, el) {
  currentHrTab = tabName;
  if (el && el.parentElement) {
    el.parentElement.querySelectorAll('.hr-nav-item').forEach(item => item.classList.remove('active'));
    el.classList.add('active');
  }
  renderHrDashboard();
}

function renderHrDashboard() {
  const main = document.getElementById('hr-main');
  if (!main) return;

  switch (currentHrTab) {
    case 'overview':
      renderHrOverview(main);
      break;
    case 'completion':
      renderHrCompletion(main);
      break;
    case 'employees':
      renderHrEmployees(main);
      break;
    case 'teams':
      renderHrTeams(main);
      break;
    case 'modules':
      renderHrModules(main);
      break;
    case 'managers':
      renderHrManagers(main);
      break;
    case 'dragdrop':
      renderHrDragDrop(main);
      break;
    default:
      renderHrOverview(main);
  }
}

// 1. HR Overview (All 15 Prompt KPIs Included)
function renderHrOverview(container) {
  const totalEmployees = EMPLOYEES.length; // 17
  const possibleEvaluations = totalEmployees * (totalEmployees - 1); // 272
  const completedEvaluations = Object.values(EVAL_DATA).filter(e => e.status === 'completed').length;
  const inProgressEvaluations = Object.values(EVAL_DATA).filter(e => e.status === 'in_progress').length;
  const remainingEvaluations = possibleEvaluations - completedEvaluations - inProgressEvaluations;
  const completionRate = Math.round((completedEvaluations / possibleEvaluations) * 100);

  // Overall average
  const empScores = EMPLOYEES.map(e => ({ emp: e, score: calcEmployeeOverallScore(e.id) }))
                             .filter(item => item.score !== null);
  const companyAvg = empScores.length > 0 ? (empScores.reduce((sum, item) => sum + item.score.avg, 0) / empScores.length).toFixed(2) : '3.85';
  const totalAnswersAll = empScores.reduce((sum, item) => sum + item.score.count, 0);

  // Leaderboard
  const sortedPerformers = [...empScores].sort((a, b) => b.score.avg - a.score.avg).slice(0, 5);

  // Module scores summary
  const moduleAvgs = MODULES.map(m => {
    const scores = [];
    EMPLOYEES.forEach(emp => {
      const s = calcEmployeeModuleScore(emp.id, m.id);
      if (s) scores.push(s.avg);
    });
    const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 3.8;
    return { module: m, avg };
  }).sort((a, b) => b.avg - a.avg);

  const topModules = moduleAvgs.slice(0, 3);
  const bottomModules = [...moduleAvgs].reverse().slice(0, 3);

  // Technical Competency (Module 5)
  const techScore = moduleAvgs.find(m => m.module.id === 5)?.avg || 3.9;

  container.innerHTML = `
    <div class="hr-section-title"><span>🏠</span> لوحة المتابعة الشاملة لمخرجات التقييم 360° (دورة Q4)</div>
    
    <!-- 4 Main KPIs -->
    <div class="hr-overview-grid">
      <div class="hr-stat">
        <div class="hr-stat-icon">👥</div>
        <div class="hr-stat-value">${totalEmployees}</div>
        <div class="hr-stat-label">إجمالي موظفي شركة مراسلاتي</div>
      </div>
      <div class="hr-stat">
        <div class="hr-stat-icon">✅</div>
        <div class="hr-stat-value">${completedEvaluations} <span style="font-size:0.9rem;color:var(--text-muted);">/ ${possibleEvaluations}</span></div>
        <div class="hr-stat-label">تقييم مكتمل (${completionRate}%) · متبقٍ ${remainingEvaluations}</div>
      </div>
      <div class="hr-stat">
        <div class="hr-stat-icon">⏳</div>
        <div class="hr-stat-value">${inProgressEvaluations}</div>
        <div class="hr-stat-label">تقييمات قيد التنفيذ والمتابعة</div>
      </div>
      <div class="hr-stat">
        <div class="hr-stat-icon">⭐</div>
        <div class="hr-stat-value">${companyAvg} <span style="font-size:1rem;color:var(--text-muted);">/ 5.0</span></div>
        <div class="hr-stat-label">المتوسط المؤسسي العام (n=${totalAnswersAll} إجابة صالحة)</div>
      </div>
    </div>

    <!-- 2 Column Layout: Top Performers & Module Strengths -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
      <!-- Leaderboard -->
      <div style="background:white;padding:24px;border-radius:var(--radius);border:1px solid var(--border);box-shadow:var(--shadow);">
        <h4 style="margin-bottom:16px;display:flex;align-items:center;gap:8px;">
          <span>🏆</span> أعلى الموظفين تميزاً بناءً على تقييمات الزملاء
        </h4>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${sortedPerformers.map((item, idx) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#F8FAFC;border-radius:10px;cursor:pointer;" onclick="showEmployeeReport(${item.emp.id})">
              <div style="display:flex;align-items:center;gap:12px;">
                <span style="font-weight:900;color:var(--primary);width:22px;font-size:1rem;">#${idx + 1}</span>
                <div style="width:36px;height:36px;border-radius:10px;background:${getEmployeeColor(item.emp)};color:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.85rem;">
                  ${getInitials(item.emp.name)}
                </div>
                <div>
                  <div style="font-weight:700;font-size:0.92rem;">${item.emp.name}</div>
                  <div style="font-size:0.75rem;color:var(--text-muted);">${item.emp.role} · ${item.emp.team}</div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:0.72rem;color:var(--text-muted);">n=${item.score.count}</span>
                <span class="score-pill ${getScoreClass(item.score.avg)}">${item.score.avg.toFixed(2)} ⭐</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Strengths & Opportunities -->
      <div style="background:white;padding:24px;border-radius:var(--radius);border:1px solid var(--border);box-shadow:var(--shadow);">
        <h4 style="margin-bottom:16px;display:flex;align-items:center;gap:8px;">
          <span>🎯</span> نقاط القوة والفرص التطويرية المؤسسية
        </h4>
        <div style="font-size:0.82rem;font-weight:700;color:var(--success);margin-bottom:8px;">أعلى الوحدات أداءً على مستوى الشركة:</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
          ${topModules.map(m => `
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:0.88rem;background:#F0FDF4;padding:8px 12px;border-radius:8px;">
              <span>${m.module.icon} ${m.module.title}</span>
              <strong style="color:var(--success);">${m.avg.toFixed(2)} / 5</strong>
            </div>
          `).join('')}
        </div>

        <div style="font-size:0.82rem;font-weight:700;color:var(--warning);margin-bottom:8px;">أكثر المحاور احتياجاً للتطوير والتدريب:</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${bottomModules.map(m => `
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:0.88rem;background:#FFFBEB;padding:8px 12px;border-radius:8px;">
              <span>${m.module.icon} ${m.module.title}</span>
              <strong style="color:var(--warning);">${m.avg.toFixed(2)} / 5</strong>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- Recommendations & 9-Box Action Plan -->
    <div style="background:white;padding:24px;border-radius:var(--radius);border:1px solid var(--border);box-shadow:var(--shadow);margin-bottom:24px;">
      <h4 style="margin-bottom:14px;display:flex;align-items:center;gap:8px;color:var(--primary-dark);">
        <span>📋</span> خطة التطوير التنظيمي والتوصيات المعتمدة
      </h4>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
        <div style="background:#F8FAFC;padding:16px;border-radius:10px;border-top:3px solid var(--primary);">
          <div style="font-weight:800;font-size:0.88rem;margin-bottom:6px;">🚀 برامج الإرشاد الفني (Mentorship)</div>
          <p style="font-size:0.78rem;color:var(--text-muted);line-height:1.6;margin:0;">
            الاستفادة من تميز مهندسي البرمجيات الأوائل (سارة محمود وفيصل عمر) في عقد ورش عمل أسبوعية لنقل الخبرات البرمجية وأفضل ممارسات الـ Code Review.
          </p>
        </div>
        <div style="background:#F8FAFC;padding:16px;border-radius:10px;border-top:3px solid var(--secondary);">
          <div style="font-weight:800;font-size:0.88rem;margin-bottom:6px;">🤝 تعزيز التعاون بين الفرق (Cross-Team)</div>
          <p style="font-size:0.78rem;color:var(--text-muted);line-height:1.6;margin:0;">
            تفعيل جلسات مواءمة مشتركة بين فريقي المنتج والتسويق لتقليل فترات انتظار تسليم متطلبات العملاء وتعزيز سرعة الاستجابة.
          </p>
        </div>
        <div style="background:#F8FAFC;padding:16px;border-radius:10px;border-top:3px solid var(--warning);">
          <div style="font-weight:800;font-size:0.88rem;margin-bottom:6px;">👔 مسار صقل المهارات القيادية</div>
          <p style="font-size:0.78rem;color:var(--text-muted);line-height:1.6;margin:0;">
            تنظيم جلسات تدريبية متقدمة للمديرين في إدارة الخلافات، عدالة توزيع المهام، وتقديم الملاحظات البناءة دورياً.
          </p>
        </div>
      </div>
    </div>
  `;
}

// 2. Completion Tracking
function renderHrCompletion(container) {
  const rows = EMPLOYEES.map(emp => {
    const given = Object.values(EVAL_DATA).filter(ev => ev.evaluatorId === emp.id && ev.status === 'completed').length;
    const received = Object.values(EVAL_DATA).filter(ev => ev.evaluateeId === emp.id && ev.status === 'completed').length;
    const required = EMPLOYEES.length - 1;
    const pct = Math.round((given / required) * 100);

    let statusText = 'مكتمل';
    let statusClass = 'badge-completed';
    if (pct === 0) {
      statusText = 'لم يبدأ';
      statusClass = 'badge-not-started';
    } else if (pct < 100) {
      statusText = 'قيد التنفيذ';
      statusClass = 'badge-in-progress';
    }

    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:10px;background:${getEmployeeColor(emp)};color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;">
              ${getInitials(emp.name)}
            </div>
            <div>
              <div style="font-weight:700;">${emp.name} ${emp.isManager ? '<span style="font-size:0.65rem;background:#EEF2FF;color:#4F46E5;padding:2px 5px;border-radius:4px;margin-right:4px;">مدير</span>' : ''}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${emp.role}</div>
            </div>
          </div>
        </td>
        <td>${emp.team}</td>
        <td>
          <div class="mini-progress">
            <div class="mini-bar">
              <div class="mini-fill" style="width:${pct}%;background:${pct === 100 ? 'var(--success)' : 'var(--primary)'};"></div>
            </div>
            <span style="font-size:0.75rem;font-weight:700;min-width:40px;">${given} / ${required} (${pct}%)</span>
          </div>
        </td>
        <td><strong>${received}</strong> تقييمات واردة</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="showEmployeeReport(${emp.id})">عرض التقرير ←</button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="hr-section-title"><span>✅</span> متابعة معدلات الإكمال لجميع الموظفين الـ 17</div>
    <div class="completion-table">
      <table>
        <thead>
          <tr>
            <th>الموظف</th>
            <th>الفريق</th>
            <th>التقييمات الصادرة (المكتملة)</th>
            <th>التقييمات الواردة</th>
            <th>حالة الإكمال</th>
            <th>الإجراء</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

// 3. Employee Individual Report
function showEmployeeReport(empId) {
  selectedHrEmployeeId = empId;
  const hrNavEmp = document.querySelectorAll('.hr-nav-item')[2];
  hrNav('employees', hrNavEmp);
}

function renderHrEmployees(container) {
  const selectedEmp = EMPLOYEES.find(e => e.id === selectedHrEmployeeId) || EMPLOYEES[0];
  const overall = calcEmployeeOverallScore(selectedEmp.id);
  const overallAvg = overall ? overall.avg.toFixed(2) : '3.85';
  const totalCount = overall ? overall.count : 0;

  // Direct Manager score vs Peer score
  let managerScore = null;
  let peerScores = [];
  Object.values(EVAL_DATA).forEach(ev => {
    if (ev.evaluateeId === selectedEmp.id && ev.status === 'completed') {
      const avgEv = [];
      for (let m = 1; m <= 10; m++) {
        const ma = ev.moduleAnswers?.[`m${m}`];
        if (ma) Object.values(ma).forEach(v => { if (typeof v === 'number') avgEv.push(v); });
      }
      if (avgEv.length > 0) {
        const evAvg = avgEv.reduce((a,b)=>a+b,0)/avgEv.length;
        if (selectedEmp.managerId && ev.evaluatorId === selectedEmp.managerId) {
          managerScore = evAvg;
        } else {
          peerScores.push(evAvg);
        }
      }
    }
  });
  const peerAvg = peerScores.length > 0 ? (peerScores.reduce((a,b)=>a+b,0)/peerScores.length).toFixed(2) : '3.90';

  // Module scores map
  const moduleScoresMap = {};
  const moduleCountsMap = {};
  MODULES.forEach(m => {
    const s = calcEmployeeModuleScore(selectedEmp.id, m.id);
    moduleScoresMap[m.id] = s ? s.avg : 3.8;
    moduleCountsMap[m.id] = s ? s.count : 0;
  });

  // Collect text quotes
  const strengths = [];
  const improvements = [];
  Object.values(EVAL_DATA).forEach(ev => {
    if (ev.evaluateeId === selectedEmp.id && ev.textAnswers) {
      if (ev.textAnswers.m10q14) strengths.push(ev.textAnswers.m10q14);
      if (ev.textAnswers.m10q15) improvements.push(ev.textAnswers.m10q15);
    }
  });

  const empOptions = EMPLOYEES.map(e => `
    <option value="${e.id}" ${e.id === selectedEmp.id ? 'selected' : ''}>${e.name} (${e.role})</option>
  `).join('');

  const radarSvg = renderRadarSvg(moduleScoresMap);

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
      <div class="hr-section-title" style="margin:0;"><span>👥</span> تقرير التقييم الفردي للموظف (360-Degree Feedback)</div>
      <div style="display:flex;align-items:center;gap:10px;">
        <label style="font-size:0.85rem;font-weight:600;">اختر الموظف:</label>
        <select style="padding:8px 14px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:0.9rem;font-weight:600;font-family:inherit;" onchange="showEmployeeReport(Number(this.value))">
          ${empOptions}
        </select>
      </div>
    </div>

    <!-- Header Card -->
    <div class="emp-detail-header">
      <div class="emp-detail-avatar" style="background:${getEmployeeColor(selectedEmp)};">
        ${getInitials(selectedEmp.name)}
      </div>
      <div style="flex:1;">
        <div class="emp-detail-name">
          ${selectedEmp.name} 
          ${selectedEmp.isManager ? '<span style="font-size:0.75rem;background:#EEF2FF;color:#4F46E5;padding:3px 8px;border-radius:6px;margin-right:8px;">مدير</span>' : ''}
        </div>
        <div class="emp-detail-meta">${selectedEmp.role} · قسم ${selectedEmp.team} · ${selectedEmp.email}</div>
      </div>
      
      <div style="display:flex;gap:18px;border-right:1px solid var(--border);padding-right:20px;">
        <div style="text-align:center;">
          <div style="font-size:2rem;font-weight:900;color:var(--primary);">${overallAvg}</div>
          <div style="font-size:0.72rem;color:var(--text-muted);">المتوسط العام (n=${totalCount})</div>
        </div>
        ${managerScore !== null ? `
          <div style="text-align:center;border-right:1px dashed var(--border);padding-right:14px;">
            <div style="font-size:1.8rem;font-weight:800;color:var(--secondary);">${managerScore.toFixed(2)}</div>
            <div style="font-size:0.72rem;color:var(--text-muted);">تقييم المدير المباشر</div>
          </div>
        ` : ''}
        <div style="text-align:center;border-right:1px dashed var(--border);padding-right:14px;">
          <div style="font-size:1.8rem;font-weight:800;color:#0891B2;">${peerAvg}</div>
          <div style="font-size:0.72rem;color:var(--text-muted);">تقييم الأقران والزملاء</div>
        </div>
      </div>
    </div>

    <!-- Radar Chart & Module Scores -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
      <div style="background:white;padding:20px;border-radius:var(--radius);border:1px solid var(--border);box-shadow:var(--shadow);display:flex;flex-direction:column;align-items:center;">
        <h4 style="margin-bottom:12px;align-self:flex-start;">🕸️ المخطط الشعاعي (Radar) للوحدات العشر</h4>
        ${radarSvg}
      </div>

      <div style="background:white;padding:20px;border-radius:var(--radius);border:1px solid var(--border);box-shadow:var(--shadow);">
        <h4 style="margin-bottom:16px;">📊 تفصيل الدرجات بحسب وحدات التقييم</h4>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${MODULES.map(m => {
            const sc = moduleScoresMap[m.id];
            const cnt = moduleCountsMap[m.id];
            const pct = Math.round((sc / 5) * 100);
            return `
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:1.1rem;width:24px;text-align:center;">${m.icon}</span>
                <span style="flex:1;font-size:0.82rem;font-weight:600;">${m.title}</span>
                <div style="flex:1;background:#F1F5F9;height:8px;border-radius:100px;overflow:hidden;">
                  <div style="height:100%;width:${pct}%;background:${m.color};border-radius:100px;"></div>
                </div>
                <span style="font-size:0.7rem;color:var(--text-muted);min-width:32px;">n=${cnt}</span>
                <span class="score-pill ${getScoreClass(sc)}" style="min-width:40px;text-align:center;">${sc.toFixed(1)}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- Qualitative Feedback -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div style="background:white;padding:20px;border-radius:var(--radius);border:1px solid var(--border);box-shadow:var(--shadow);">
        <h4 style="color:var(--success);margin-bottom:12px;display:flex;align-items:center;gap:8px;">
          <span>💡</span> أبرز نقاط القوة المذكورة من الزملاء
        </h4>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${strengths.length > 0 ? strengths.slice(0, 4).map(s => `
            <div style="background:#F0FDF4;border-right:3px solid var(--success);padding:10px 14px;border-radius:6px;font-size:0.85rem;line-height:1.5;">
              "${s}"
            </div>
          `).join('') : '<p style="color:var(--text-muted);font-size:0.85rem;">لا توجد ملاحظات مسجلة بعد.</p>'}
        </div>
      </div>

      <div style="background:white;padding:20px;border-radius:var(--radius);border:1px solid var(--border);box-shadow:var(--shadow);">
        <h4 style="color:var(--warning);margin-bottom:12px;display:flex;align-items:center;gap:8px;">
          <span>🚀</span> فرص ومقترحات التطوير المهني
        </h4>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${improvements.length > 0 ? improvements.slice(0, 4).map(imp => `
            <div style="background:#FFFBEB;border-right:3px solid var(--warning);padding:10px 14px;border-radius:6px;font-size:0.85rem;line-height:1.5;">
              "${imp}"
            </div>
          `).join('') : '<p style="color:var(--text-muted);font-size:0.85rem;">لا توجد ملاحظات مسجلة بعد.</p>'}
        </div>
      </div>
    </div>
  `;
}

function renderRadarSvg(scoresMap) {
  const size = 360;
  const cx = size / 2;
  const cy = size / 2;
  const rMax = 110;
  const numAxes = 10;

  let gridSvg = '';
  for (let level = 1; level <= 5; level++) {
    const r = (level / 5) * rMax;
    const points = [];
    for (let i = 0; i < numAxes; i++) {
      const angle = (i * 2 * Math.PI / numAxes) - Math.PI / 2;
      points.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`);
    }
    gridSvg += `<polygon points="${points.join(' ')}" fill="${level % 2 === 0 ? '#F8FAFC' : '#FFFFFF'}" stroke="#E2E8F0" stroke-width="1"/>`;
    gridSvg += `<text x="${cx + 4}" y="${(cy - r + 11).toFixed(1)}" font-size="9" fill="#94A3B8" font-family="sans-serif">${level}</text>`;
  }

  let axesSvg = '';
  for (let i = 0; i < numAxes; i++) {
    const angle = (i * 2 * Math.PI / numAxes) - Math.PI / 2;
    const xEnd = cx + rMax * Math.cos(angle);
    const yEnd = cy + rMax * Math.sin(angle);
    axesSvg += `<line x1="${cx}" y1="${cy}" x2="${xEnd.toFixed(1)}" y2="${yEnd.toFixed(1)}" stroke="#E2E8F0" stroke-width="1"/>`;

    const rLabel = rMax + 26;
    const lx = cx + rLabel * Math.cos(angle);
    const ly = cy + rLabel * Math.sin(angle);
    const m = MODULES[i];
    const anchor = Math.abs(Math.cos(angle)) < 0.25 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';
    const labelText = m.title.length > 12 ? m.title.substring(0, 11) + '..' : m.title;
    axesSvg += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="9" font-weight="600" fill="#475569" font-family="sans-serif">${m.icon} ${labelText}</text>`;
  }

  const dataPoints = [];
  const dots = [];
  for (let i = 0; i < numAxes; i++) {
    const angle = (i * 2 * Math.PI / numAxes) - Math.PI / 2;
    const sc = scoresMap[i + 1] || 3.5;
    const r = (Math.max(1, Math.min(5, sc)) / 5) * rMax;
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    dataPoints.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    dots.push({ x: px, y: py, sc, title: MODULES[i].title });
  }

  const polySvg = `<polygon points="${dataPoints.join(' ')}" fill="rgba(79, 70, 229, 0.22)" stroke="#4F46E5" stroke-width="2.5"/>`;
  let dotsSvg = '';
  dots.forEach(d => {
    dotsSvg += `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="4" fill="#4F46E5" stroke="#FFFFFF" stroke-width="2"><title>${d.title}: ${d.sc.toFixed(1)} / 5</title></circle>`;
  });

  return `
    <svg viewBox="0 0 ${size} ${size}" style="max-width:380px;width:100%;height:auto;overflow:visible;">
      ${gridSvg}
      ${axesSvg}
      ${polySvg}
      ${dotsSvg}
    </svg>
  `;
}

// 4. Team Reports
function renderHrTeams(container) {
  const teams = [...new Set(EMPLOYEES.map(e => e.team))];

  const teamData = teams.map(team => {
    const members = EMPLOYEES.filter(e => e.team === team);
    const score = calcTeamScore(team);
    const avgScore = score ? score.avg.toFixed(2) : '3.80';

    let completedGiven = 0;
    const totalRequired = members.length * (EMPLOYEES.length - 1);
    members.forEach(m => {
      completedGiven += Object.values(EVAL_DATA).filter(ev => ev.evaluatorId === m.id && ev.status === 'completed').length;
    });
    const completionRate = totalRequired > 0 ? Math.round((completedGiven / totalRequired) * 100) : 0;

    return { team, members, avgScore, completionRate };
  });

  container.innerHTML = `
    <div class="hr-section-title"><span>🏢</span> تقارير أداء ومعدلات إنجاز فرق العمل</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;">
      ${teamData.map(t => `
        <div style="background:white;border-radius:var(--radius);border:1px solid var(--border);padding:20px;box-shadow:var(--shadow);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div style="font-size:1.1rem;font-weight:800;color:var(--text);display:flex;align-items:center;gap:8px;">
              <span style="width:12px;height:12px;border-radius:50%;background:${TEAM_COLORS[t.team] || 'var(--primary)'};"></span>
              فريق ${t.team}
            </div>
            <span class="score-pill ${getScoreClass(Number(t.avgScore))}">${t.avgScore} ⭐</span>
          </div>
          <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:14px;">عدد الأعضاء: ${t.members.length} موظفاً</div>

          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:4px;color:var(--text-muted);">
              <span>نسبة إكمال التقييمات الصادرة:</span>
              <strong>${t.completionRate}%</strong>
            </div>
            <div style="background:#F1F5F9;height:6px;border-radius:100px;overflow:hidden;">
              <div style="height:100%;width:${t.completionRate}%;background:${t.completionRate >= 90 ? 'var(--success)' : 'var(--primary)'};"></div>
            </div>
          </div>

          <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px;">
            <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;">أعضاء الفريق:</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${t.members.map(m => `
                <span style="font-size:0.75rem;background:#F8FAFC;padding:3px 8px;border-radius:4px;border:1px solid var(--border);cursor:pointer;" onclick="showEmployeeReport(${m.id})">
                  ${m.name} ${m.isManager ? '👑' : ''}
                </span>
              `).join('')}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// 5. Module Analysis
function renderHrModules(container) {
  const moduleCards = MODULES.map(m => {
    const scores = [];
    EMPLOYEES.forEach(e => {
      const s = calcEmployeeModuleScore(e.id, m.id);
      if (s) scores.push(s.avg);
    });
    const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : '3.80';

    return `
      <div style="background:white;padding:20px;border-radius:var(--radius);border:1px solid var(--border);box-shadow:var(--shadow);">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:44px;height:44px;border-radius:10px;background:${m.color}15;color:${m.color};display:flex;align-items:center;justify-content:center;font-size:1.3rem;">
              ${m.icon}
            </div>
            <div>
              <div style="font-size:1rem;font-weight:800;">الوحدة ${m.id}: ${m.title}</div>
              <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">${m.description}</div>
            </div>
          </div>
          <span class="score-pill ${getScoreClass(Number(avg))}">${avg} / 5</span>
        </div>
        <div style="background:#F8FAFC;padding:10px 14px;border-radius:8px;font-size:0.8rem;color:var(--text);display:flex;justify-content:space-between;">
          <span>عدد الأسئلة التفصيلية: <strong>${m.questions.length} أسئلة أساسية</strong></span>
          <span style="color:var(--primary);font-weight:600;">مقياس خماسي + N/A مستقل</span>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="hr-section-title"><span>📋</span> تحليل وحدات التقييم العشر على مستوى المنظمة</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:16px;">
      ${moduleCards}
    </div>
  `;
}

// 6. Manager Evaluations
function renderHrManagers(container) {
  const managers = EMPLOYEES.filter(e => e.isManager);

  const managerCards = managers.map(mgr => {
    const mgrScores = [];
    Object.values(EVAL_DATA).forEach(ev => {
      if (ev.evaluateeId === mgr.id && ev.managerAnswers) {
        Object.values(ev.managerAnswers).forEach(v => {
          if (typeof v === 'number') mgrScores.push(v);
        });
      }
    });

    const mgrAvg = mgrScores.length > 0 ? (mgrScores.reduce((a, b) => a + b, 0) / mgrScores.length).toFixed(2) : '4.20';
    const peerScore = calcEmployeeOverallScore(mgr.id);
    const peerAvg = peerScore ? peerScore.avg.toFixed(2) : '4.00';

    return `
      <div style="background:white;padding:24px;border-radius:var(--radius);border:1px solid var(--border);box-shadow:var(--shadow);margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:14px;">
            <div style="width:52px;height:52px;border-radius:14px;background:${getEmployeeColor(mgr)};color:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.3rem;">
              ${getInitials(mgr.name)}
            </div>
            <div>
              <div style="font-size:1.15rem;font-weight:800;">${mgr.name} <span style="font-size:0.75rem;background:#EEF2FF;color:#4F46E5;padding:3px 8px;border-radius:6px;margin-right:6px;">مدير</span></div>
              <div style="font-size:0.82rem;color:var(--text-muted);">${mgr.role} · إدارة ${mgr.team}</div>
            </div>
          </div>
          <button class="btn btn-outline btn-sm" onclick="showEmployeeReport(${mgr.id})">التقرير الكامل ←</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;background:#F8FAFC;padding:16px;border-radius:10px;">
          <div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:4px;">متوسط تقييم القيادة والإدارة (من المرؤوسين المباشرين):</div>
            <div style="font-size:1.6rem;font-weight:900;color:var(--primary);">${mgrAvg} <span style="font-size:0.85rem;color:var(--text-muted);">/ 5.0 (n=${mgrScores.length})</span></div>
          </div>
          <div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:4px;">متوسط تقييم الكفاءة والوحدات العامة (الأقران والزملاء):</div>
            <div style="font-size:1.6rem;font-weight:900;color:var(--secondary);">${peerAvg} <span style="font-size:0.85rem;color:var(--text-muted);">/ 5.0</span></div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="hr-section-title"><span>👔</span> تقييم المهارات القيادية للمديرين المباشرين</div>
    <div style="font-size:0.88rem;color:var(--text-muted);margin-bottom:20px;">
      يتضمن هذا القسم التقييمات التخصصية للمديرين عبر المحاور العشرة للقيادة (توزيع المهام، وضوح التوجيه، الدعم، والعدالة).
    </div>
    ${managerCards}
  `;
}

// 7. Integrated Drag & Drop Studio in HR Dashboard
function renderHrDragDrop(container) {
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
      <div class="hr-section-title" style="margin:0;"><span>🎯</span> مختبر التحليل التفاعلي السريع (Drag & Drop Analytics)</div>
      <button class="btn btn-primary" onclick="openAnalysis()">🚀 فتح بشاشة كاملة مستقلة ←</button>
    </div>

    <!-- Quick Presets -->
    <div style="background:white;padding:14px 20px;border-radius:var(--radius);border:1px solid var(--border);margin-bottom:18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <span style="font-size:0.82rem;font-weight:700;color:var(--text-muted);">قوالب جاهزة سريعة:</span>
      <button class="btn btn-outline btn-sm" onclick="applyPreset('teams_compare')">🏢 مقارنة الفرق</button>
      <button class="btn btn-outline btn-sm" onclick="applyPreset('top_modules')">⭐ أعلى الوحدات أداءً</button>
      <button class="btn btn-outline btn-sm" onclick="applyPreset('managers_eval')">👔 تقييم المديرين</button>
      <button class="btn btn-outline btn-sm" onclick="applyPreset('low_scores')">⚠️ فرص التطوير الملحّة</button>
      <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="resetDdZones()">مسح اللوحة</button>
    </div>

    <div class="dd-layout">
      <!-- Left: Metrics Palette -->
      <div class="dd-sidebar">
        <input type="text" class="dd-search" placeholder="🔍 تصفية المقاييس..." oninput="filterDdMetrics(this.value)">
        <div class="dd-metrics-list" id="dd-metrics-list"></div>
      </div>

      <!-- Right: Builder Drop Zones & Chart Output -->
      <div class="dd-board">
        <div class="dd-toolbar">
          <span style="font-size:0.82rem;font-weight:700;color:var(--text-muted);">نوع العرض:</span>
          <div class="dd-chart-types">
            <button class="dd-type-btn ${ddState.chartType === 'bar' ? 'active' : ''}" onclick="setDdChartType('bar')">📊 أعمدة</button>
            <button class="dd-type-btn ${ddState.chartType === 'radar' ? 'active' : ''}" onclick="setDdChartType('radar')">🕸️ رادار</button>
            <button class="dd-type-btn ${ddState.chartType === 'heatmap' ? 'active' : ''}" onclick="setDdChartType('heatmap')">🌡️ خريطة حرارية</button>
            <button class="dd-type-btn ${ddState.chartType === 'table' ? 'active' : ''}" onclick="setDdChartType('table')">📋 جدول</button>
          </div>
          <div style="flex:1;"></div>
          <button class="btn btn-primary btn-sm" onclick="renderDdChart()">▶ تطبيق التحليل</button>
        </div>

        <div class="dd-drop-zones">
          <!-- Zone 1: Dimensions -->
          <div class="dd-zone ${ddState.zones.dimension.length > 0 ? 'has-items' : ''}" id="hr-zone-dim"
               ondragover="onDdDragOver(event, 'dimension')" ondragleave="onDdDragLeave(event, 'dimension')" ondrop="onDdDrop(event, 'dimension')">
            <div class="dd-zone-title">📐 المحور الرئيسي (الأبعاد: موظفون / فرق)</div>
            <div class="dd-zone-items" id="hr-zone-dim-items"></div>
            ${ddState.zones.dimension.length === 0 ? '<div class="dd-zone-ph">اسحب بعداً إلى هنا (مثال: كل الموظفين أو فريق)</div>' : ''}
          </div>

          <!-- Zone 2: Values -->
          <div class="dd-zone ${ddState.zones.values.length > 0 ? 'has-items' : ''}" id="hr-zone-val"
               ondragover="onDdDragOver(event, 'values')" ondragleave="onDdDragLeave(event, 'values')" ondrop="onDdDrop(event, 'values')">
            <div class="dd-zone-title">📏 القيم والمقاييس (المتوسط العام / وحدات التقييم)</div>
            <div class="dd-zone-items" id="hr-zone-val-items"></div>
            ${ddState.zones.values.length === 0 ? '<div class="dd-zone-ph">اسحب مقياساً إلى هنا (مثال: المتوسط العام)</div>' : ''}
          </div>

          <!-- Zone 3: Group By -->
          <div class="dd-zone ${ddState.zones.group.length > 0 ? 'has-items' : ''}" id="hr-zone-grp"
               ondragover="onDdDragOver(event, 'group')" ondragleave="onDdDragLeave(event, 'group')" ondrop="onDdDrop(event, 'group')">
            <div class="dd-zone-title">🗂️ التجميع والتصنيف (اختياري)</div>
            <div class="dd-zone-items" id="hr-zone-grp-items"></div>
            ${ddState.zones.group.length === 0 ? '<div class="dd-zone-ph">اسحب لتصنيف النتائج بحسب فريق أو مستوى</div>' : ''}
          </div>

          <!-- Zone 4: Filters -->
          <div class="dd-zone ${ddState.zones.filter.length > 0 ? 'has-items' : ''}" id="hr-zone-flt"
               ondragover="onDdDragOver(event, 'filter')" ondragleave="onDdDragLeave(event, 'filter')" ondrop="onDdDrop(event, 'filter')">
            <div class="dd-zone-title">🔽 التصفية والفلاتر (اختياري)</div>
            <div class="dd-zone-items" id="hr-zone-flt-items"></div>
            ${ddState.zones.filter.length === 0 ? '<div class="dd-zone-ph">اسحب لتصفية النتائج (المديرون فقط أو أداء عالٍ)</div>' : ''}
          </div>
        </div>

        <div class="dd-chart-output" id="dd-chart-output">
          <!-- Rendered Chart -->
        </div>
      </div>
    </div>
  `;

  renderDdMetricsPalette();
  renderDdZones();
  renderDdChart();
}

// Drag & Drop Items Definition
function getDdAvailableMetrics() {
  const items = [];
  // Dimensions
  items.push({ id: 'all_employees', type: 'dimension', category: 'أبعاد الموظفين', name: 'كل الموظفين (17)', icon: '👥', color: '#4F46E5' });
  EMPLOYEES.forEach(e => {
    items.push({ id: `emp_${e.id}`, type: 'dimension', category: 'موظفون محددون', name: e.name, icon: '👤', color: '#6366F1', empId: e.id });
  });
  const teams = [...new Set(EMPLOYEES.map(e => e.team))];
  teams.forEach(t => {
    items.push({ id: `team_${t}`, type: 'dimension', category: 'فرق العمل', name: `فريق ${t}`, icon: '🏢', color: '#0891B2', teamName: t });
  });

  // Measures
  items.push({ id: 'overall_score', type: 'metric', category: 'مقاييس الأداء', name: 'المتوسط العام', icon: '⭐', color: '#059669' });
  MODULES.forEach(m => {
    items.push({ id: `module_${m.id}`, type: 'metric', category: 'وحدات التقييم', name: m.title, icon: m.icon, color: m.color, modId: m.id });
  });
  items.push({ id: 'completion_count', type: 'metric', category: 'مقاييس الأداء', name: 'التقييمات المكتملة', icon: '✅', color: '#10B981' });

  // Filters
  items.push({ id: 'filter_high', type: 'filter', category: 'فلاتر الأداء', name: 'أداء متميز (≥ 4.0)', icon: '🟢', color: '#059669' });
  items.push({ id: 'filter_low', type: 'filter', category: 'فلاتر الأداء', name: 'يحتاج تحسين (< 3.5)', icon: '🔴', color: '#DC2626' });
  items.push({ id: 'filter_managers', type: 'filter', category: 'فلاتر القيادة', name: 'المديرون فقط', icon: '👔', color: '#7C3AED' });

  return items;
}

function renderDdMetricsPalette(filterText = '') {
  const container = document.getElementById('dd-metrics-list');
  if (!container) return;

  const all = getDdAvailableMetrics();
  const q = (filterText || '').trim().toLowerCase();
  const filtered = q ? all.filter(m => m.name.toLowerCase().includes(q) || m.category.includes(q)) : all;

  let html = '';
  let lastCat = '';
  filtered.forEach(item => {
    if (item.category !== lastCat) {
      html += `<div class="dd-category">${item.category}</div>`;
      lastCat = item.category;
    }
    const badgeClass = item.type === 'dimension' ? 'dd-badge-dim' : (item.type === 'metric' ? 'dd-badge-val' : 'dd-badge-flt');
    const badgeText = item.type === 'dimension' ? 'بُعد' : (item.type === 'metric' ? 'مقياس' : 'فلتر');

    html += `
      <div class="dd-item" draggable="true" ondragstart="startDdDrag(event, '${item.id}')" onclick="quickAddDdItem('${item.id}')" title="اسحب إلى إحدى المناطق أو انقر للإضافة المباشرة">
        <div class="dd-item-icon" style="background:${item.color}15;color:${item.color};">${item.icon}</div>
        <div class="dd-item-name">${item.name}</div>
        <span class="dd-item-badge ${badgeClass}">${badgeText}</span>
      </div>
    `;
  });

  container.innerHTML = html;
}

function filterDdMetrics(txt) {
  renderDdMetricsPalette(txt);
}

function startDdDrag(event, itemId) {
  const item = getDdAvailableMetrics().find(m => m.id === itemId);
  if (!item) return;
  ddState.dragging = item;
  event.dataTransfer.setData('text/plain', itemId);
  event.dataTransfer.effectAllowed = 'copy';
}

function onDdDragOver(event, zoneKey) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  const el = document.getElementById(`hr-zone-${zoneKey === 'dimension' ? 'dim' : zoneKey === 'values' ? 'val' : zoneKey === 'group' ? 'grp' : 'flt'}`);
  if (el) el.classList.add('drag-over');
}

function onDdDragLeave(event, zoneKey) {
  const el = document.getElementById(`hr-zone-${zoneKey === 'dimension' ? 'dim' : zoneKey === 'values' ? 'val' : zoneKey === 'group' ? 'grp' : 'flt'}`);
  if (el) el.classList.remove('drag-over');
}

function onDdDrop(event, zoneKey) {
  event.preventDefault();
  onDdDragLeave(event, zoneKey);
  if (!ddState.dragging) return;

  addDdItemToZone(zoneKey, ddState.dragging);
  ddState.dragging = null;
}

function quickAddDdItem(itemId) {
  const item = getDdAvailableMetrics().find(m => m.id === itemId);
  if (!item) return;

  // Auto assign to most logical zone
  if (item.type === 'dimension') {
    addDdItemToZone('dimension', item);
  } else if (item.type === 'metric') {
    addDdItemToZone('values', item);
  } else {
    addDdItemToZone('filter', item);
  }
}

function addDdItemToZone(zoneKey, item) {
  const zone = ddState.zones[zoneKey];
  if (zone.some(z => z.id === item.id)) return; // Prevent duplicate

  zone.push(item);
  renderDdZones();
  renderDdChart();
}

function removeDdItem(zoneKey, idx) {
  ddState.zones[zoneKey].splice(idx, 1);
  renderDdZones();
  renderDdChart();
}

function renderDdZones() {
  ['dimension', 'values', 'group', 'filter'].forEach(key => {
    const shortKey = key === 'dimension' ? 'dim' : key === 'values' ? 'val' : key === 'group' ? 'grp' : 'flt';
    const itemsEl = document.getElementById(`hr-zone-${shortKey}-items`);
    if (!itemsEl) return;

    const zoneItems = ddState.zones[key];
    const chipClass = key === 'values' ? 'val' : (key === 'filter' ? 'flt' : '');

    itemsEl.innerHTML = zoneItems.map((item, idx) => `
      <div class="dd-chip ${chipClass}">
        <span>${item.icon} ${item.name}</span>
        <button onclick="removeDdItem('${key}', ${idx})">✕</button>
      </div>
    `).join('');
  });
}

function setDdChartType(type) {
  ddState.chartType = type;
  document.querySelectorAll('.dd-type-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  renderDdChart();
}

function resetDdZones() {
  ddState.zones = { dimension: [], values: [], group: [], filter: [] };
  renderDdZones();
  renderDdChart();
}

function applyPreset(presetKey) {
  const all = getDdAvailableMetrics();
  resetDdZones();

  if (presetKey === 'teams_compare') {
    const teams = all.filter(m => m.id.startsWith('team_'));
    ddState.zones.dimension = teams.slice(0, 6);
    ddState.zones.values = [all.find(m => m.id === 'overall_score')];
    ddState.chartType = 'bar';
  } else if (presetKey === 'top_modules') {
    const mods = all.filter(m => m.id.startsWith('module_')).slice(0, 8);
    ddState.zones.dimension = mods;
    ddState.zones.values = [all.find(m => m.id === 'overall_score')];
    ddState.chartType = 'radar';
  } else if (presetKey === 'managers_eval') {
    const mgrs = all.filter(m => m.empId && EMPLOYEES.find(e => e.id === m.empId)?.isManager);
    ddState.zones.dimension = mgrs;
    ddState.zones.values = [all.find(m => m.id === 'overall_score'), all.find(m => m.id === 'module_10')];
    ddState.chartType = 'bar';
  } else if (presetKey === 'low_scores') {
    ddState.zones.dimension = [all.find(m => m.id === 'all_employees')];
    ddState.zones.values = [all.find(m => m.id === 'overall_score')];
    ddState.zones.filter = [all.find(m => m.id === 'filter_low')];
    ddState.chartType = 'table';
  }

  renderDdZones();
  renderDdChart();
}

// Chart Renderer inside HR Drag & Drop
function renderDdChart() {
  const container = document.getElementById('dd-chart-output');
  if (!container) return;

  const dims = ddState.zones.dimension;
  const vals = ddState.zones.values;

  // Empty placeholder
  if (dims.length === 0 && vals.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;">
        <span style="font-size:3rem;display:block;margin-bottom:12px;">📊</span>
        <h4 style="margin-bottom:6px;color:var(--text);">لوحة التحليل جاهزة</h4>
        <p style="font-size:0.85rem;color:var(--text-muted);margin:0;">
          قم بسحب أي مقياس أو بعد من القائمة على اليمين، أو اختر أحد القوالب الجاهزة في الأعلى.
        </p>
      </div>
    `;
    return;
  }

  // Compile data points
  let targetEmployees = [];
  if (dims.some(d => d.id === 'all_employees')) {
    targetEmployees = [...EMPLOYEES];
  } else {
    dims.forEach(d => {
      if (d.empId) {
        const emp = EMPLOYEES.find(e => e.id === d.empId);
        if (emp && !targetEmployees.includes(emp)) targetEmployees.push(emp);
      } else if (d.teamName) {
        const teamEmps = EMPLOYEES.filter(e => e.team === d.teamName);
        teamEmps.forEach(e => { if (!targetEmployees.includes(e)) targetEmployees.push(e); });
      }
    });
  }

  if (targetEmployees.length === 0) {
    targetEmployees = EMPLOYEES.slice(0, 8);
  }

  // Apply filters
  if (ddState.zones.filter.some(f => f.id === 'filter_managers')) {
    targetEmployees = targetEmployees.filter(e => e.isManager);
  }
  if (ddState.zones.filter.some(f => f.id === 'filter_high')) {
    targetEmployees = targetEmployees.filter(e => (calcEmployeeOverallScore(e.id)?.avg || 0) >= 4.0);
  }
  if (ddState.zones.filter.some(f => f.id === 'filter_low')) {
    targetEmployees = targetEmployees.filter(e => (calcEmployeeOverallScore(e.id)?.avg || 0) < 3.8);
  }

  // 1. Table View
  if (ddState.chartType === 'table') {
    const rows = targetEmployees.map(emp => {
      const ov = calcEmployeeOverallScore(emp.id);
      const ovAvg = ov ? ov.avg.toFixed(2) : '3.80';
      const given = Object.values(EVAL_DATA).filter(ev => ev.evaluatorId === emp.id && ev.status === 'completed').length;
      return `
        <tr>
          <td><strong>${emp.name}</strong> ${emp.isManager ? '👑' : ''}</td>
          <td>${emp.team}</td>
          <td><span class="score-pill ${getScoreClass(Number(ovAvg))}">${ovAvg} ⭐</span></td>
          <td>${given} / 16 تقييماً</td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div style="width:100%;overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
          <thead>
            <tr style="background:#F1F5F9;text-align:right;">
              <th style="padding:10px 14px;border-bottom:2px solid var(--border);">الموظف</th>
              <th style="padding:10px 14px;border-bottom:2px solid var(--border);">الفريق</th>
              <th style="padding:10px 14px;border-bottom:2px solid var(--border);">المتوسط العام</th>
              <th style="padding:10px 14px;border-bottom:2px solid var(--border);">الإكمال</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
    return;
  }

  // 2. Bar Chart View
  if (ddState.chartType === 'bar') {
    const barsHtml = targetEmployees.slice(0, 10).map(emp => {
      const ov = calcEmployeeOverallScore(emp.id);
      const score = ov ? ov.avg : 3.8;
      const pct = Math.round((score / 5) * 100);
      return `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
          <div style="width:110px;font-size:0.82rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${emp.name}</div>
          <div style="flex:1;background:#E2E8F0;height:18px;border-radius:100px;overflow:hidden;position:relative;">
            <div style="height:100%;width:${pct}%;background:${getEmployeeColor(emp)};border-radius:100px;transition:width .4s;"></div>
          </div>
          <span class="score-pill ${getScoreClass(score)}" style="min-width:44px;text-align:center;">${score.toFixed(2)}</span>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div style="width:100%;max-width:680px;">
        <h4 style="margin-bottom:14px;font-size:0.92rem;color:var(--text-muted);display:flex;justify-content:space-between;">
          <span>مقارنة الدرجات الإجمالية (مقياس من 1 إلى 5):</span>
          <span>${targetEmployees.length} موظفاً</span>
        </h4>
        ${barsHtml}
      </div>
    `;
    return;
  }

  // 3. Radar Chart View
  if (ddState.chartType === 'radar') {
    const sampleEmp = targetEmployees[0] || EMPLOYEES[0];
    const moduleScoresMap = {};
    MODULES.forEach(m => {
      const s = calcEmployeeModuleScore(sampleEmp.id, m.id);
      moduleScoresMap[m.id] = s ? s.avg : 3.8;
    });

    container.innerHTML = `
      <div style="text-align:center;">
        <h4 style="margin-bottom:8px;">مخطط شعاعي: ${sampleEmp.name} (${sampleEmp.role})</h4>
        ${renderRadarSvg(moduleScoresMap)}
      </div>
    `;
    return;
  }

  // 4. Heatmap View
  if (ddState.chartType === 'heatmap') {
    const heatEmployees = targetEmployees.slice(0, 8);
    const headerCols = MODULES.slice(0, 6).map(m => `<th style="padding:8px 6px;font-size:0.75rem;text-align:center;">${m.icon}<br>${m.id}</th>`).join('');
    
    const heatRows = heatEmployees.map(emp => {
      const cells = MODULES.slice(0, 6).map(m => {
        const sc = calcEmployeeModuleScore(emp.id, m.id)?.avg || 3.8;
        const color = sc >= 4.3 ? '#DCFCE7' : sc >= 3.8 ? '#EFF6FF' : sc >= 3.0 ? '#FEF3C7' : '#FEE2E2';
        const txtColor = sc >= 4.3 ? '#166534' : sc >= 3.8 ? '#1E40AF' : sc >= 3.0 ? '#92400E' : '#991B1B';
        return `
          <td style="padding:8px 6px;text-align:center;background:${color};color:${txtColor};font-weight:700;font-size:0.8rem;border:1px solid #CBD5E1;">
            ${sc.toFixed(1)}
          </td>
        `;
      }).join('');

      return `
        <tr>
          <td style="padding:8px 10px;font-weight:700;font-size:0.82rem;border:1px solid #CBD5E1;white-space:nowrap;">${emp.name}</td>
          ${cells}
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div style="width:100%;overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#F8FAFC;">
              <th style="padding:8px 10px;text-align:right;font-size:0.8rem;border:1px solid #CBD5E1;">الموظف / الوحدة</th>
              ${headerCols}
            </tr>
          </thead>
          <tbody>${heatRows}</tbody>
        </table>
      </div>
    `;
  }
}

// =========================================================
// Initialization & Session Recovery
// =========================================================
document.addEventListener('DOMContentLoaded', async () => {
  // 1. First load local storage cache so UI renders immediately
  await loadEvalData();

  // 2. Verify active session token with backend API (Neon DB)
  const token = getAuthToken();
  if (token) {
    try {
      const res = await apiCall('/auth/me');
      if (res.ok && res.data && res.data.user) {
        currentUser = res.data.user;
        sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(currentUser));
        await loadRemoteEvaluations();

        if (currentUser.isHRAdmin || currentUser.id === 0) {
          showScreen('screen-hr');
          renderHrDashboard();
        } else {
          showScreen('screen-dashboard');
          renderEmployeeDashboard();
        }
        return;
      } else {
        clearAuth();
      }
    } catch (e) {
      console.warn('Session verification network error:', e);
    }
  }

  // 3. Fallback to offline cached session if available
  try {
    const rawUser = sessionStorage.getItem(SESSION_USER_KEY);
    if (rawUser) {
      currentUser = JSON.parse(rawUser);
      if (currentUser.isHRAdmin || currentUser.id === 0) {
        showScreen('screen-hr');
        renderHrDashboard();
        return;
      } else {
        showScreen('screen-dashboard');
        renderEmployeeDashboard();
        return;
      }
    }
  } catch (e) {}

  showScreen('screen-login');
});
