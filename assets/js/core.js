// =========================================================
// Core: API client, escaping, events, modal, toast, router, topbar
// =========================================================
(function () {
  'use strict';
  const M = (window.M360 = window.M360 || {});
  const TOKEN_KEY = 'm360_token';

  M.state = { token: sessionStorage.getItem(TOKEN_KEY), user: null, cycle: null };

  // ---- Escaping: every piece of data goes through esc() before innerHTML
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  M.esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

  M.fmt = (n, d) => (n === null || n === undefined || isNaN(n) ? '—' : Number(n).toFixed(d === undefined ? 2 : d));
  M.pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  M.initials = (name) => {
    const parts = String(name || '').replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0] || '')[0] || '') + ((parts[1] || '')[0] || '');
  };
  const AVATAR_COLORS = ['#4f46e5', '#0e7490', '#7c3aed', '#0f766e', '#b45309', '#be185d', '#1d4ed8', '#4d7c0f'];
  M.avatarColor = (id) => AVATAR_COLORS[Math.abs(Number(id) || 0) % AVATAR_COLORS.length];
  M.avatar = (u, cls) => `<span class="avatar ${cls || ''}" style="background:${M.avatarColor(u.id)}" aria-hidden="true">${M.esc(M.initials(u.name))}</span>`;
  M.roleBadge = (role) => `<span class="badge role-${M.esc(role)}">${M.esc((M360Permissions.ROLES[role] || {}).label || role)}</span>`;

  // ---- API
  M.api = async function (method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (M.state.token) headers.Authorization = 'Bearer ' + M.state.token;
    let res;
    try {
      res = await fetch('/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) {
      return { ok: false, status: 0, data: { error: 'تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.' } };
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = {}; }
    if (res.status === 401 && path !== '/auth/login' && M.state.token) {
      M.clearSession();
      M.toast('انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى', 'error');
      M.go('#/login');
    }
    return { ok: res.ok, status: res.status, data: data || {} };
  };

  M.setSession = (token, user, cycle) => {
    M.state.token = token;
    M.state.user = user;
    M.state.cycle = cycle;
    sessionStorage.setItem(TOKEN_KEY, token);
  };
  M.clearSession = () => {
    M.state.token = null;
    M.state.user = null;
    sessionStorage.removeItem(TOKEN_KEY);
  };
  M.logout = async () => {
    await M.api('POST', '/auth/logout');
    M.clearSession();
    M.go('#/login');
  };

  // ---- Event delegation (no inline handlers: CSP blocks them)
  const handlers = { click: {}, input: {}, change: {}, submit: {} };
  M.on = (type, name, fn) => { handlers[type][name] = fn; };
  ['click', 'input', 'change', 'submit'].forEach((type) => {
    document.addEventListener(type, (ev) => {
      const attr = type === 'click' ? 'action' : type;
      const el = ev.target.closest(`[data-${attr}]`);
      if (!el) return;
      const fn = handlers[type][el.dataset[attr]];
      if (!fn) return;
      if (type === 'submit' || (type === 'click' && el.tagName === 'A')) ev.preventDefault();
      fn(el, ev);
    });
  });

  // ---- Toast
  M.toast = (msg, kind) => {
    const box = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), kind === 'error' ? 6000 : 3200);
  };

  // ---- Modal
  let modalActions = {};
  M.modal = function ({ title, html, wide, actions }) {
    M.closeModal();
    modalActions = {};
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.id = 'modal-back';
    const btns = (actions || []).map((a, i) => {
      modalActions[i] = a.onClick;
      return `<button class="btn ${a.cls || 'btn-ghost'}" data-action="modal-act" data-idx="${i}">${M.esc(a.label)}</button>`;
    }).join('');
    back.innerHTML = `
      <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-head"><h3 id="modal-title">${M.esc(title)}</h3><button class="icon-btn" data-action="modal-close" aria-label="إغلاق">✕</button></div>
        <div class="modal-body">${html}</div>
        ${btns ? `<div class="modal-foot">${btns}</div>` : ''}
      </div>`;
    document.body.appendChild(back);
    const first = back.querySelector('input, select, textarea, .modal-foot .btn');
    if (first) first.focus();
    return back;
  };
  M.closeModal = () => {
    const el = document.getElementById('modal-back');
    if (el) el.remove();
  };
  M.on('click', 'modal-close', () => M.closeModal());
  M.on('click', 'modal-act', async (el) => {
    const fn = modalActions[el.dataset.idx];
    if (!fn) return M.closeModal();
    el.disabled = true;
    try {
      const keep = await fn(el);
      if (keep !== true) M.closeModal();
    } finally {
      el.disabled = false;
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') M.closeModal(); });
  document.addEventListener('mousedown', (e) => { if (e.target.id === 'modal-back') M.closeModal(); });

  M.confirm = (title, html, okLabel, okCls) => new Promise((resolve) => {
    M.modal({
      title,
      html,
      actions: [
        { label: okLabel || 'تأكيد', cls: okCls || 'btn-primary', onClick: () => resolve(true) },
        { label: 'إلغاء', cls: 'btn-ghost', onClick: () => resolve(false) }
      ]
    });
  });

  // ---- Router
  const routes = [];
  M.route = (re, fn) => routes.push({ re, fn });
  M.go = (hash) => {
    if (location.hash === hash) M.render();
    else location.hash = hash;
  };
  M.render = () => {
    M.hideTooltip && M.hideTooltip();
    const hash = location.hash || '#/';
    for (const r of routes) {
      const m = hash.match(r.re);
      if (m) return r.fn(...m.slice(1).map((x) => (x === undefined ? x : decodeURIComponent(x))));
    }
    M.go('#/');
  };
  window.addEventListener('hashchange', () => M.render());

  // ---- Shell
  M.app = () => document.getElementById('app');
  M.shell = (contentHtml) => {
    const u = M.state.user;
    const cycle = M.state.cycle;
    M.app().innerHTML = `
      <header class="topbar">
        <div class="topbar-inner">
          <a class="brand" href="#/"><span class="brand-mark">360</span><span class="txt">مراسلاتي 360°</span></a>
          ${cycle ? `<span class="chip chip-primary" title="دورة التقييم الحالية">🗓️ ${M.esc(cycle.name)}</span>` : ''}
          <span class="topbar-spacer"></span>
          <div class="user-menu">
            <button class="user-btn" data-action="user-menu" aria-haspopup="true" aria-expanded="false">
              ${M.avatar(u)}
              <span class="who"><b>${M.esc(u.name)}</b><small>${M.esc(u.roleLabel)}${u.department && u.accessRole !== 'admin' ? ' · ' + M.esc(u.departmentLabel) : ''}</small></span>
            </button>
            <div class="dropdown hidden" id="user-dropdown" role="menu">
              <button data-action="change-password" role="menuitem">🔑 تغيير كلمة المرور</button>
              <button data-action="logout" role="menuitem">↩ تسجيل الخروج</button>
            </div>
          </div>
        </div>
      </header>
      <main class="page" id="page">${contentHtml || ''}</main>`;
  };
  M.page = () => document.getElementById('page');

  M.on('click', 'user-menu', (el) => {
    const dd = document.getElementById('user-dropdown');
    const open = dd.classList.toggle('hidden') === false;
    el.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    const dd = document.getElementById('user-dropdown');
    if (dd && !e.target.closest('.user-menu')) dd.classList.add('hidden');
  });
  M.on('click', 'logout', () => M.logout());
  M.on('click', 'change-password', () => {
    M.modal({
      title: 'تغيير كلمة المرور',
      html: `
        <div id="cp-error" class="form-error hidden"></div>
        <label class="field"><span>كلمة المرور الحالية</span><input class="input" type="password" id="cp-current" autocomplete="current-password"></label>
        <label class="field"><span>كلمة المرور الجديدة (8 أحرف على الأقل)</span><input class="input" type="password" id="cp-new" autocomplete="new-password"></label>
        <label class="field"><span>تأكيد كلمة المرور الجديدة</span><input class="input" type="password" id="cp-new2" autocomplete="new-password"></label>`,
      actions: [
        {
          label: 'حفظ', cls: 'btn-primary', onClick: async () => {
            const err = document.getElementById('cp-error');
            const a = document.getElementById('cp-new').value;
            if (a !== document.getElementById('cp-new2').value) {
              err.textContent = 'كلمتا المرور غير متطابقتين';
              err.classList.remove('hidden');
              return true;
            }
            const r = await M.api('POST', '/auth/change-password', { currentPassword: document.getElementById('cp-current').value, newPassword: a });
            if (!r.ok) {
              err.textContent = r.data.error || 'تعذر تغيير كلمة المرور';
              err.classList.remove('hidden');
              return true;
            }
            M.toast('تم تغيير كلمة المرور بنجاح', 'good');
            return false;
          }
        },
        { label: 'إلغاء', cls: 'btn-ghost' }
      ]
    });
  });

  // ---- Tooltip (charts)
  let tip = null;
  M.showTooltip = (html, x, y) => {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'tooltip';
      document.body.appendChild(tip);
    }
    tip.innerHTML = html;
    tip.style.display = 'block';
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2)) + 'px';
    tip.style.top = Math.max(8, y - h - 12) + 'px';
  };
  M.hideTooltip = () => { if (tip) tip.style.display = 'none'; };
  document.addEventListener('mousemove', (e) => {
    const el = e.target.closest('[data-tip]');
    if (!el) return M.hideTooltip();
    M.showTooltip(el.getAttribute('data-tip'), e.clientX, e.clientY);
  });
  document.addEventListener('scroll', () => M.hideTooltip(), true);

  // ---- CSV export (UTF-8 with BOM so Excel shows Arabic correctly)
  M.downloadCsv = (filename, rows) => {
    const csv = rows.map((r) => r.map((c) => {
      const s = c === null || c === undefined ? '' : String(c);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
})();
