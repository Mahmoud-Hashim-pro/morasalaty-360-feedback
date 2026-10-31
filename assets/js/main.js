// =========================================================
// Boot, login and routes
// =========================================================
(function () {
  'use strict';
  const M = window.M360;
  const P = window.M360Permissions;
  const esc = M.esc;

  function isAdmin() {
    return M.state.user && P.can(M.state.user, 'results.view');
  }

  function homeHash() {
    if (!M.state.user) return '#/login';
    return isAdmin() ? '#/admin/analytics' : '#/tasks';
  }

  function renderLogin(message) {
    M.app().innerHTML = `
      <div class="login-page">
        <form class="login-card" data-submit="login" novalidate>
          <div class="login-brand">
            <div class="login-logo">360</div>
            <h1>مراسلاتي 360°</h1>
            <p>نظام التقييم المتبادل الشامل للموظفين</p>
          </div>
          <div id="login-error" class="form-error ${message ? '' : 'hidden'}">${esc(message || '')}</div>
          <label class="field"><span>البريد الإلكتروني الوظيفي</span>
            <input class="input" type="email" id="login-email" autocomplete="username" placeholder="yourname@samaagroup.net" dir="ltr" required></label>
          <label class="field"><span>كلمة المرور</span>
            <input class="input" type="password" id="login-pass" autocomplete="current-password" dir="ltr" required></label>
          <button class="btn btn-primary btn-lg btn-block" type="submit" id="login-btn">تسجيل الدخول ←</button>
          <p class="login-note">🔒 تقييماتك سرية: لا يطّلع أي زميل على إجاباتك.<br>نسيت كلمة المرور؟ تواصل مع مدير النظام.</p>
        </form>
      </div>`;
    document.getElementById('login-email').focus();
  }

  M.on('submit', 'login', async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-pass').value;
    const err = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');
    if (!email || !password) {
      err.textContent = 'يرجى إدخال البريد الإلكتروني وكلمة المرور';
      err.classList.remove('hidden');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'جاري التحقق…';
    const r = await M.api('POST', '/auth/login', { email, password });
    btn.disabled = false;
    btn.textContent = 'تسجيل الدخول ←';
    if (!r.ok) {
      err.textContent = r.data.error || 'تعذر تسجيل الدخول';
      err.classList.remove('hidden');
      return;
    }
    M.setSession(r.data.token, r.data.user, r.data.cycle);
    M.go(location.pathname === '/analysis' && isAdmin() ? '#/admin/analytics' : homeHash());
  });

  function requireUser(fn) {
    return (...args) => {
      if (!M.state.user) return M.go('#/login');
      return fn(...args);
    };
  }

  M.route(/^#\/login$/, () => {
    if (M.state.user) return M.go(homeHash());
    renderLogin();
  });
  M.route(/^#\/?$/, () => M.go(homeHash()));
  M.route(/^#\/tasks(?:\/(\w+))?$/, requireUser((type) => {
    if (isAdmin()) return M.go('#/admin/analytics');
    M.renderTasks(type);
  }));
  M.route(/^#\/review\/(\w+)\/(\d+)$/, requireUser((type, id) => {
    if (isAdmin()) return M.go('#/admin/analytics');
    M.renderReview(type, id);
  }));
  M.route(/^#\/admin\/(\w+)(?:\/([\w-]+))?$/, requireUser((page, arg) => {
    if (!isAdmin()) return M.go('#/tasks');
    M.renderAdmin(page, arg);
  }));

  async function boot() {
    if (M.state.token) {
      const r = await M.api('GET', '/auth/me');
      if (r.ok) {
        M.state.user = r.data.user;
        M.state.cycle = r.data.cycle;
      } else {
        M.clearSession();
      }
    }
    if (!location.hash || location.hash === '#') {
      history.replaceState(null, '', location.pathname + (M.state.user ? homeHash() : '#/login'));
    }
    M.render();
  }

  boot();
})();
