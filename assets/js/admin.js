// =========================================================
// Admin: shell, users & permissions, cycles
// =========================================================
(function () {
  'use strict';
  const M = window.M360;
  const P = window.M360Permissions;
  const Q = window.M360Questions;
  const esc = M.esc;

  const NAV = [
    { key: 'analytics', icon: '📊', label: 'لوحة التحليل' },
    { key: 'reports', icon: '📑', label: 'التقارير' },
    { key: 'participation', icon: '✅', label: 'متابعة المشاركة' },
    { sep: true },
    { key: 'users', icon: '👥', label: 'المستخدمون والصلاحيات' },
    { key: 'cycles', icon: '🗓️', label: 'دورات التقييم' }
  ];

  M.renderAdmin = function (page, arg) {
    if (M.flushSurvey) M.flushSurvey();
    if (!NAV.some((n) => n.key === page)) return M.go('#/admin/analytics');
    const nav = NAV.map((n) => n.sep ? '<div class="nav-sep"></div>' :
      `<a href="#/admin/${n.key}" class="${n.key === page ? 'active' : ''}" ${n.key === page ? 'aria-current="page"' : ''}><span>${n.icon}</span>${esc(n.label)}</a>`).join('');
    M.shell(`<div class="admin"><nav class="card admin-nav" aria-label="قائمة الإدارة">${nav}</nav><section id="admin-content"><div class="empty">⏳ جاري التحميل…</div></section></div>`);
    if (page === 'users') return renderUsers();
    if (page === 'cycles') return renderCycles();
    return M.Analytics.render(page, arg);
  };
  M.adminContent = () => document.getElementById('admin-content');

  // -------------------------------------------------------
  // Users & permissions
  // -------------------------------------------------------
  const U = { users: [], departments: [], issues: [], search: '', dept: '', role: '' };

  async function renderUsers() {
    const r = await M.api('GET', '/admin/users');
    if (!r.ok) {
      M.adminContent().innerHTML = `<div class="card empty">⚠️ ${esc(r.data.error || 'تعذر التحميل')}</div>`;
      return;
    }
    U.users = r.data.users;
    U.departments = r.data.departments;
    U.issues = r.data.issues;
    drawUsers();
  }

  function deptSummary() {
    const map = {};
    U.users.filter((u) => u.isActive && P.isParticipant(u)).forEach((u) => {
      const d = u.department || '—';
      map[d] = map[d] || { managers: [], hr: [], count: 0 };
      map[d].count++;
      if (u.accessRole === 'manager') map[d].managers.push(u.name);
      if (u.accessRole === 'hr') map[d].hr.push(u.name);
    });
    return Object.keys(map).sort().map((d) => `
      <div class="card card-pad">
        <div class="row-between"><b>${esc(Q.departmentLabel(d))}</b><span class="chip">${map[d].count} موظف</span></div>
        <div class="muted" style="font-size:.84rem;margin-top:6px">👔 المدير: ${map[d].managers.length ? esc(map[d].managers.join('، ')) : '<span style="color:var(--crit-text)">لا يوجد</span>'}</div>
        ${map[d].hr.length ? `<div class="muted" style="font-size:.84rem">📋 الموارد البشرية: ${esc(map[d].hr.join('، '))}</div>` : ''}
      </div>`).join('');
  }

  function permissionMatrix() {
    const caps = Object.keys(P.CAPABILITIES);
    const head = `<tr><th>الدور</th>${caps.map((c) => `<th>${esc(P.CAPABILITIES[c])}</th>`).join('')}</tr>`;
    const rows = P.ROLE_ORDER.map((r) => `<tr><td>${M.roleBadge(r)}<div class="muted" style="font-size:.76rem;margin-top:4px;max-width:260px">${esc(P.ROLES[r].description)}</div></td>${caps.map((c) =>
      P.ROLES[r].capabilities.includes(c) ? '<td title="مسموح">✅</td>' : '<td class="muted" title="غير مسموح">—</td>').join('')}</tr>`).join('');
    return `
      <div class="card panel">
        <div class="panel-head"><div><h3>🛡️ مصفوفة الصلاحيات</h3><p>هذه القواعد مطبّقة في الخادم على كل طلب (lib/permissions.js) — الواجهة لا تستطيع تجاوزها.</p></div></div>
        <div class="table-wrap"><table class="tbl matrix">${head}${rows}</table></div>
        <ul class="insights" style="margin-top:12px">
          <li><span class="i">👥</span><span>كل الموظفين والمديرين والموارد البشرية يقيّمون كل زملائهم (ما عدا أنفسهم).</span></li>
          <li><span class="i">👔</span><span>المدير يقيّم موظفي إدارته فقط، ولا يقيّم مديراً آخر.</span></li>
          <li><span class="i">📋</span><span>الموارد البشرية تقيّم الجميع تقييماً إدارياً.</span></li>
          <li><span class="i">🔒</span><span>بعد الإرسال يُغلق التقييم ويختفي الشخص من قائمة المقيِّم. لا أحد يرى إجابات أحد، والنتائج تظهر لمدير النظام فقط ومجمّعة بدون ذكر من قيّم في تقييم الزملاء.</span></li>
        </ul>
      </div>`;
  }

  function filteredUsers() {
    const term = U.search.trim().toLowerCase();
    return U.users.filter((u) =>
      (!U.dept || u.department === U.dept) &&
      (!U.role || u.accessRole === U.role) &&
      (!term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)));
  }

  function userRows() {
    const list = filteredUsers();
    if (!list.length) return '<tr><td colspan="5" class="empty">لا يوجد مستخدمون مطابقون</td></tr>';
    return list.map((u) => `
      <tr class="${u.isActive ? '' : 'inactive'}">
        <td><div class="person-cell">${M.avatar(u)}<div><b>${esc(u.name)}</b><small dir="ltr">${esc(u.email)}</small></div></div></td>
        <td>${esc(Q.departmentLabel(u.department))}</td>
        <td>${M.roleBadge(u.accessRole)}</td>
        <td>${u.isActive ? '<span class="badge badge-good">✓ نشط</span>' : '<span class="badge badge-muted">⏸ معطل</span>'}</td>
        <td><div class="row" style="gap:6px">
          <button class="btn btn-outline btn-sm" data-action="user-edit" data-id="${u.id}">✎ تعديل</button>
          <button class="btn btn-ghost btn-sm" data-action="user-reset" data-id="${u.id}">🔑 كلمة مرور جديدة</button>
        </div></td>
      </tr>`).join('');
  }

  function drawUsers() {
    const counts = P.ROLE_ORDER.map((r) => `<span class="chip">${esc(P.ROLES[r].label)}: ${U.users.filter((u) => u.isActive && u.accessRole === r).length}</span>`).join('');
    M.adminContent().innerHTML = `
      <div class="page-head row-between">
        <div><h2>👥 المستخدمون والصلاحيات</h2><div class="row" style="gap:6px;margin-top:6px">${counts}</div></div>
        <div class="row">
          <button class="btn btn-primary" data-action="user-new">＋ إضافة مستخدم</button>
          <button class="btn btn-danger" data-action="user-reset-all">🔑 كلمات مرور جديدة للجميع</button>
        </div>
      </div>
      ${U.issues.map((i) => `<div class="issue ${i.level}">${i.level === 'warning' ? '⚠️' : 'ℹ️'} <span>${esc(i.message)}</span></div>`).join('')}
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin:14px 0">${deptSummary()}</div>
      <div class="card panel">
        <div class="toolbar">
          <input class="input" type="search" placeholder="🔍 بحث بالاسم أو البريد…" value="${esc(U.search)}" data-input="users-search">
          <select class="select" style="width:auto" data-change="users-dept"><option value="">كل الإدارات</option>
            ${U.departments.map((d) => `<option value="${esc(d.code)}" ${U.dept === d.code ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select>
          <select class="select" style="width:auto" data-change="users-role"><option value="">كل الأدوار</option>
            ${P.ROLE_ORDER.map((r) => `<option value="${r}" ${U.role === r ? 'selected' : ''}>${esc(P.ROLES[r].label)}</option>`).join('')}</select>
        </div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>المستخدم</th><th>الإدارة</th><th>الدور</th><th>الحالة</th><th>إجراءات</th></tr></thead>
          <tbody id="users-body">${userRows()}</tbody></table></div>
      </div>
      ${permissionMatrix()}`;
  }

  M.on('input', 'users-search', (el) => { U.search = el.value; document.getElementById('users-body').innerHTML = userRows(); });
  M.on('change', 'users-dept', (el) => { U.dept = el.value; document.getElementById('users-body').innerHTML = userRows(); });
  M.on('change', 'users-role', (el) => { U.role = el.value; document.getElementById('users-body').innerHTML = userRows(); });

  function userForm(u) {
    const known = Array.from(new Set(['TS', 'Sales', 'Admin', ...U.departments.map((d) => d.code)]));
    const dept = u ? u.department : '';
    const isKnown = !dept || known.includes(dept);
    return `
      <div id="uf-error" class="form-error hidden"></div>
      <label class="field"><span>الاسم</span><input class="input" id="uf-name" value="${esc(u ? u.name : '')}" maxlength="150"></label>
      <label class="field"><span>البريد الإلكتروني (للدخول)</span><input class="input" id="uf-email" dir="ltr" value="${esc(u ? u.email : '')}" maxlength="255"></label>
      <label class="field"><span>الدور والصلاحيات</span>
        <select class="select" id="uf-role">${P.ROLE_ORDER.map((r) => `<option value="${r}" ${(u ? u.accessRole : 'employee') === r ? 'selected' : ''}>${esc(P.ROLES[r].label)} — ${esc(P.ROLES[r].description)}</option>`).join('')}</select></label>
      <label class="field"><span>الإدارة</span>
        <select class="select" id="uf-dept" data-change="uf-dept">
          <option value="">— بدون إدارة (لمدير النظام فقط) —</option>
          ${known.map((d) => `<option value="${esc(d)}" ${dept === d ? 'selected' : ''}>${esc(Q.departmentLabel(d))}${Q.departmentLabel(d) !== d ? ` (${esc(d)})` : ''}</option>`).join('')}
          <option value="__new" ${isKnown ? '' : 'selected'}>＋ إدارة جديدة…</option>
        </select></label>
      <label class="field ${isKnown ? 'hidden' : ''}" id="uf-dept-new-wrap"><span>اسم الإدارة الجديدة</span><input class="input" id="uf-dept-new" value="${esc(isKnown ? '' : dept)}" maxlength="50"></label>
      <label class="field"><span>المسمى الوظيفي (اختياري — لا يظهر للموظفين)</span><input class="input" id="uf-title" value="${esc(u ? u.jobTitle : '')}" maxlength="100"></label>
      <label class="check"><input type="checkbox" id="uf-active" ${!u || u.isActive ? 'checked' : ''}> حساب نشط (يستطيع الدخول ويشارك في التقييم)</label>`;
  }
  M.on('change', 'uf-dept', (el) => document.getElementById('uf-dept-new-wrap').classList.toggle('hidden', el.value !== '__new'));

  function readUserForm() {
    const deptSel = document.getElementById('uf-dept').value;
    return {
      name: document.getElementById('uf-name').value,
      email: document.getElementById('uf-email').value,
      accessRole: document.getElementById('uf-role').value,
      department: deptSel === '__new' ? document.getElementById('uf-dept-new').value : deptSel,
      jobTitle: document.getElementById('uf-title').value,
      isActive: document.getElementById('uf-active').checked
    };
  }

  function showPassword(title, user, password) {
    M.modal({
      title,
      html: `
        <p>أرسل بيانات الدخول التالية إلى <b>${esc(user.name)}</b> بطريقة آمنة. لن تظهر كلمة المرور مرة أخرى.</p>
        <div class="card card-pad pw-list" style="margin-top:12px">${esc(user.email)}<br><b>${esc(password)}</b></div>
        <p class="muted" style="font-size:.8rem;margin-top:10px">يمكن للمستخدم تغييرها بعد الدخول من قائمة اسمه ← تغيير كلمة المرور.</p>`,
      actions: [
        { label: '📋 نسخ', cls: 'btn-primary', onClick: async () => { await copyText(`${user.email}\n${password}`); return true; } },
        { label: 'تم', cls: 'btn-ghost' }
      ]
    });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      M.toast('تم النسخ', 'good');
    } catch (e) {
      M.toast('تعذر النسخ تلقائياً — انسخ النص يدوياً', 'error');
    }
  }

  function openUserModal(u) {
    M.modal({
      title: u ? `تعديل: ${u.name}` : 'إضافة مستخدم جديد',
      html: userForm(u),
      actions: [
        {
          label: u ? 'حفظ التعديلات' : 'إضافة وإنشاء كلمة مرور', cls: 'btn-primary', onClick: async () => {
            const body = readUserForm();
            const r = u ? await M.api('PUT', `/admin/users/${u.id}`, body) : await M.api('POST', '/admin/users', body);
            if (!r.ok) {
              const err = document.getElementById('uf-error');
              err.textContent = r.data.error || 'تعذر الحفظ';
              err.classList.remove('hidden');
              return true;
            }
            M.toast(u ? 'تم حفظ التعديلات' : 'تمت إضافة المستخدم', 'good');
            await renderUsers();
            if (!u) showPassword('تم إنشاء الحساب', r.data.user, r.data.password);
            else if (u.accessRole !== body.accessRole || u.department !== body.department) M.toast('تم تسجيل خروج المستخدم ليحصل على صلاحياته الجديدة');
            return false;
          }
        },
        { label: 'إلغاء', cls: 'btn-ghost' }
      ]
    });
  }

  M.on('click', 'user-new', () => openUserModal(null));
  M.on('click', 'user-edit', (el) => openUserModal(U.users.find((u) => u.id === Number(el.dataset.id))));
  M.on('click', 'user-reset', async (el) => {
    const u = U.users.find((x) => x.id === Number(el.dataset.id));
    const ok = await M.confirm('كلمة مرور جديدة', `<p>سيتم إنشاء كلمة مرور جديدة لـ <b>${esc(u.name)}</b> وتسجيل خروجه من كل الأجهزة. كلمة المرور القديمة لن تعمل بعد ذلك.</p>`, 'إنشاء كلمة مرور جديدة');
    if (!ok) return;
    const r = await M.api('POST', `/admin/users/${u.id}/reset-password`, {});
    if (!r.ok) return M.toast(r.data.error || 'تعذر التنفيذ', 'error');
    showPassword('كلمة المرور الجديدة', r.data.user, r.data.password);
  });

  M.on('click', 'user-reset-all', async () => {
    const ok = await M.confirm('كلمات مرور جديدة للجميع',
      `<p>سيتم إنشاء كلمة مرور جديدة لكل الحسابات النشطة (ما عدا حسابك) وتسجيل خروجهم.</p>
       <p class="muted" style="margin-top:8px">استخدم هذا مرة واحدة بعد التحديث، لأن كلمات المرور القديمة كانت منشورة ولم تعد تعمل.</p>`,
      'إنشاء كلمات المرور', 'btn-danger');
    if (!ok) return;
    const r = await M.api('POST', '/admin/users/reset-passwords', {});
    if (!r.ok) return M.toast(r.data.error || 'تعذر التنفيذ', 'error');
    const rows = r.data.results;
    M.modal({
      title: `كلمات المرور الجديدة (${rows.length})`,
      wide: true,
      html: `
        <p class="muted" style="margin-bottom:10px">احفظ هذه القائمة الآن ووزّعها بشكل آمن — لن تظهر مرة أخرى.</p>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>الاسم</th><th>البريد</th><th>كلمة المرور</th></tr></thead><tbody>
          ${rows.map((x) => `<tr><td>${esc(x.name)}</td><td dir="ltr">${esc(x.email)}</td><td class="pw-list"><b>${esc(x.password)}</b></td></tr>`).join('')}
        </tbody></table></div>`,
      actions: [
        { label: '⬇ تنزيل CSV', cls: 'btn-primary', onClick: () => { M.downloadCsv('m360-passwords.csv', [['الاسم', 'البريد', 'الإدارة', 'الدور', 'كلمة المرور'], ...rows.map((x) => [x.name, x.email, Q.departmentLabel(x.department), P.ROLES[x.accessRole].label, x.password])]); return true; } },
        { label: '📋 نسخ الكل', cls: 'btn-outline', onClick: async () => { await copyText(rows.map((x) => `${x.name}\t${x.email}\t${x.password}`).join('\n')); return true; } },
        { label: 'إغلاق', cls: 'btn-ghost' }
      ]
    });
  });

  // -------------------------------------------------------
  // Cycles
  // -------------------------------------------------------
  async function renderCycles() {
    const r = await M.api('GET', '/admin/cycles');
    if (!r.ok) {
      M.adminContent().innerHTML = `<div class="card empty">⚠️ ${esc(r.data.error || '')}</div>`;
      return;
    }
    const rows = r.data.cycles.map((c) => `
      <tr>
        <td><b>${esc(c.name)}</b><div class="muted" style="font-size:.78rem" dir="ltr">${esc(c.id)}</div></td>
        <td>${new Date(c.createdAt).toLocaleDateString('ar-EG')}</td>
        <td>${c.isActive ? '<span class="badge badge-good">● الدورة الحالية</span>' : '<span class="badge badge-muted">منتهية</span>'}</td>
        <td><div class="row" style="gap:6px">
          <a class="btn btn-outline btn-sm" href="#/admin/analytics/${encodeURIComponent(c.id)}">📊 النتائج</a>
          ${c.isActive ? '' : `<button class="btn btn-ghost btn-sm" data-action="cycle-activate" data-id="${esc(c.id)}">تفعيل</button>`}
        </div></td>
      </tr>`).join('');
    M.adminContent().innerHTML = `
      <div class="page-head"><h2>🗓️ دورات التقييم</h2><p class="muted">اجعل التقييم دورياً (شهرياً أو ربع سنوي). كل دورة جديدة تبدأ التقييمات من الصفر، وتبقى نتائج الدورات السابقة متاحة للمقارنة.</p></div>
      <div class="card panel">
        <div class="panel-head"><div><h3>بدء دورة جديدة</h3><p>ستصبح الدورة الجديدة هي الحالية فوراً لكل الموظفين.</p></div></div>
        <form class="row" data-submit="cycle-create">
          <input class="input" id="cycle-name" placeholder="مثال: تقييم نوفمبر 2026" maxlength="150" style="max-width:360px">
          <button class="btn btn-primary" type="submit">＋ بدء الدورة</button>
        </form>
      </div>
      <div class="card panel"><div class="table-wrap"><table class="tbl"><thead><tr><th>الدورة</th><th>تاريخ الإنشاء</th><th>الحالة</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  M.on('submit', 'cycle-create', async () => {
    const name = document.getElementById('cycle-name').value.trim();
    if (!name) return M.toast('اكتب اسم الدورة', 'error');
    const ok = await M.confirm('بدء دورة جديدة', `<p>سيتم بدء «${esc(name)}» وجعلها الدورة الحالية. يبدأ كل الموظفين تقييماتهم من جديد.</p>`, 'بدء الدورة');
    if (!ok) return;
    const r = await M.api('POST', '/admin/cycles', { name });
    if (!r.ok) return M.toast(r.data.error || 'تعذر الإنشاء', 'error');
    const active = r.data.cycles.find((c) => c.isActive);
    if (active) M.state.cycle = { id: active.id, name: active.name };
    M.Analytics.reset();
    M.toast('تم بدء الدورة الجديدة', 'good');
    M.renderAdmin('cycles');
  });

  M.on('click', 'cycle-activate', async (el) => {
    const ok = await M.confirm('تفعيل الدورة', '<p>ستصبح هذه الدورة هي الحالية، وسيكمل الموظفون تقييماتها.</p>', 'تفعيل');
    if (!ok) return;
    const r = await M.api('POST', `/admin/cycles/${encodeURIComponent(el.dataset.id)}/activate`, {});
    if (!r.ok) return M.toast(r.data.error || 'تعذر التفعيل', 'error');
    const active = r.data.cycles.find((c) => c.isActive);
    if (active) M.state.cycle = { id: active.id, name: active.name };
    M.Analytics.reset();
    M.renderAdmin('cycles');
  });
})();
