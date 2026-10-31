// =========================================================
// Participant screens: my evaluation menus + the survey
// =========================================================
(function () {
  'use strict';
  const M = window.M360;
  const Q = window.M360Questions;
  const esc = M.esc;

  // -------------------------------------------------------
  // Home: menus + pending people
  // -------------------------------------------------------
  let tasksCache = null;
  let searchTerm = '';

  M.renderTasks = async function (type) {
    await flushSurvey();
    M.shell('<div class="empty"><div class="big">⏳</div>جاري التحميل…</div>');
    const r = await M.api('GET', '/my/tasks');
    if (!r.ok) {
      M.page().innerHTML = `<div class="card empty"><div class="big">⚠️</div><h3>تعذر تحميل التقييمات</h3><p>${esc(r.data.error || '')}</p></div>`;
      return;
    }
    tasksCache = r.data;
    M.state.cycle = r.data.cycle;
    const menus = r.data.menus;
    let active = menus.find((m) => m.type === type);
    if (!active) active = menus.find((m) => m.type !== 'self' && m.pending.length) || menus.find((m) => m.pending.length) || menus[0];
    if (!type || type !== active.type) history.replaceState(null, '', '#/tasks/' + active.type);
    searchTerm = '';
    M.shell(renderHome(menus, active));
  };

  function renderHome(menus, active) {
    const u = M.state.user;
    const total = menus.reduce((a, m) => a + m.total, 0);
    const done = menus.reduce((a, m) => a + m.submitted, 0);
    const pct = M.pct(done, total);
    const tabs = menus.map((m) => {
      const set = Q.getSet(m.type);
      const p = M.pct(m.submitted, m.total);
      const complete = m.total > 0 && m.submitted === m.total;
      return `
        <button class="menu-tab ${m.type === active.type ? 'active' : ''}" data-action="open-menu" data-type="${m.type}" aria-pressed="${m.type === active.type}">
          <span class="ico">${set.icon}</span>
          <span class="meta">
            <b>${esc(set.menuLabel)}</b>
            <small>${complete ? '✓ اكتمل' : `أنجزت ${m.submitted} من ${m.total}`}</small>
            <span class="progress ${complete ? 'good' : ''}"><i style="width:${p}%"></i></span>
          </span>
        </button>`;
    }).join('');

    return `
      <section class="card hero">
        <div>
          <h2>مرحباً، ${esc(u.name)} 👋</h2>
          <div class="muted">${esc(u.departmentLabel)} · ${esc(u.roleLabel)}</div>
          <div class="progress ${pct === 100 ? 'good' : ''}" aria-label="نسبة الإنجاز"><i style="width:${pct}%"></i></div>
          <div class="muted" style="font-size:.82rem;margin-top:6px">أنجزت ${done} من ${total} تقييماً مطلوباً في هذه الدورة</div>
        </div>
        <div class="hero-stat"><b class="num">${pct}%</b><span class="muted">نسبة الإنجاز</span></div>
      </section>
      <nav class="menu-tabs" aria-label="قوائم التقييم">${tabs}</nav>
      <section id="menu-content">${renderMenuContent(active)}</section>`;
  }

  function renderMenuContent(menu) {
    const set = Q.getSet(menu.type);
    if (menu.type === 'self') return renderSelfMenu(menu, set);
    const hidden = menu.submitted
      ? `أرسلت ${menu.submitted} ${menu.submitted === 1 ? 'تقييماً' : 'تقييمات'} — التقييمات المرسلة تختفي من القائمة ولا يمكن لأحد الاطلاع عليها.`
      : 'بعد إرسال تقييم أي شخص يختفي من قائمتك، ولا يمكن لأحد الاطلاع على إجاباتك.';
    if (!menu.pending.length) {
      return `
        <div class="card empty">
          <div class="big">🎉</div>
          <h3>${menu.total ? 'أنهيت كل تقييمات هذه القائمة' : 'لا يوجد أشخاص في هذه القائمة'}</h3>
          <p>${menu.total ? `تم إرسال ${menu.submitted} من ${menu.total}. شكراً لك!` : 'تواصل مع مدير النظام إذا كنت تتوقع وجود أشخاص هنا.'}</p>
        </div>`;
    }
    const search = menu.pending.length > 6
      ? `<div class="toolbar"><input class="input" type="search" placeholder="🔍 ابحث بالاسم…" data-input="search-people" aria-label="بحث"></div>`
      : '';
    return `
      <div class="row-between" style="margin-bottom:10px">
        <div><div class="section-title">${set.icon} ${esc(set.menuLabel)}</div><div class="section-sub">${esc(set.intro)}</div></div>
        <span class="chip">${menu.pending.length} متبقٍ</span>
      </div>
      <div class="privacy-note"><span>🔒</span><span>${esc(hidden)}</span></div>
      ${search}
      <div class="people-grid" id="people-grid">${renderPeople(menu)}</div>`;
  }

  function renderPeople(menu) {
    const term = searchTerm.trim();
    const list = menu.pending.filter((p) => !term || p.name.includes(term));
    if (!list.length) return '<div class="empty">لا توجد نتائج</div>';
    return list.map((p) => {
      const started = p.status === 'in_progress';
      return `
        <article class="card person">
          <div class="person-head">
            ${M.avatar(p)}
            <div><b>${esc(p.name)}</b><small>${esc(p.departmentLabel)}</small></div>
          </div>
          <div class="row-between">
            ${started ? `<span class="badge badge-warn">✎ جارٍ · ${p.progress}%</span>` : '<span class="badge badge-muted">○ لم يبدأ</span>'}
          </div>
          <div class="progress"><i style="width:${p.progress}%"></i></div>
          <a class="btn ${started ? 'btn-outline' : 'btn-primary'} btn-block" href="#/review/${menu.type}/${p.id}">${started ? 'أكمل التقييم' : 'ابدأ التقييم'} ←</a>
        </article>`;
    }).join('');
  }

  function renderSelfMenu(menu, set) {
    const me = M.state.user;
    if (!menu.pending.length) {
      return `
        <div class="card empty">
          <div class="big">🌟</div>
          <h3>تم إرسال تقييمك الذاتي</h3>
          <p>شكراً لك. التقييم الذاتي مغلق ولا يمكن تعديله في هذه الدورة.</p>
        </div>`;
    }
    const p = menu.pending[0];
    return `
      <div class="card self-card">
        ${M.avatar(me, 'avatar-lg')}
        <div class="grow">
          <div class="section-title">${set.icon} ${esc(set.menuLabel)}</div>
          <p class="section-sub">${esc(set.intro)}</p>
          <p class="section-sub">${set.questions.length} أسئلة تقييم + سؤال مفتوح عن مبادرتك هذا الشهر.</p>
          ${p.status === 'in_progress' ? `<div class="progress" style="margin-top:10px;max-width:320px"><i style="width:${p.progress}%"></i></div>` : ''}
        </div>
        <a class="btn btn-primary btn-lg" href="#/review/self/${me.id}">${p.status === 'in_progress' ? 'أكمل تقييمك الذاتي' : 'ابدأ التقييم الذاتي'} ←</a>
      </div>`;
  }

  M.on('click', 'open-menu', (el) => {
    const type = el.dataset.type;
    if (!tasksCache) return;
    const menu = tasksCache.menus.find((m) => m.type === type);
    if (!menu) return;
    history.replaceState(null, '', '#/tasks/' + type);
    searchTerm = '';
    document.querySelectorAll('.menu-tab').forEach((t) => {
      const on = t.dataset.type === type;
      t.classList.toggle('active', on);
      t.setAttribute('aria-pressed', String(on));
    });
    document.getElementById('menu-content').innerHTML = renderMenuContent(menu);
  });

  M.on('input', 'search-people', (el) => {
    searchTerm = el.value;
    const type = (location.hash.split('/')[2] || '');
    const menu = tasksCache && tasksCache.menus.find((m) => m.type === type);
    if (menu) document.getElementById('people-grid').innerHTML = renderPeople(menu);
  });

  // -------------------------------------------------------
  // Survey
  // -------------------------------------------------------
  let S = null; // current survey state

  // Save pending changes before leaving the survey screen.
  async function flushSurvey() {
    if (S && S.pending) {
      clearTimeout(S.timer);
      await saveDraft();
    }
    if (S) clearTimeout(S.timer);
    S = null;
  }
  M.flushSurvey = flushSurvey;

  M.renderReview = async function (type, targetId) {
    await flushSurvey();
    M.shell('<div class="empty"><div class="big">⏳</div>جاري تحميل الاستبيان…</div>');
    const r = await M.api('GET', `/my/review?type=${encodeURIComponent(type)}&target=${encodeURIComponent(targetId)}`);
    if (!r.ok) {
      M.toast(r.data.error || 'تعذر فتح التقييم', 'error');
      return M.go('#/tasks/' + type);
    }
    const set = Q.getSet(type);
    S = {
      type,
      set,
      target: r.data.target,
      answers: Object.assign({}, r.data.draft.answers),
      texts: Object.assign({}, r.data.draft.texts),
      extra: Object.assign({}, r.data.draft.extra),
      timer: null,
      saving: false,
      pending: false,
      lastError: null,
      showMissing: false
    };
    M.page().innerHTML = renderSurvey();
    updateProgress();
    setSaveState(r.data.updatedAt ? 'saved' : 'idle');
  };

  function firstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || '';
  }

  function questionHtml(q) {
    const safe = esc(q.text);
    return safe.split('{name}').join(`<mark>${esc(firstName(S.target.name))}</mark>`);
  }

  function isAnswered(q) {
    const v = S.answers[q.id];
    return v !== undefined && v !== null && v !== '';
  }

  function renderSurvey() {
    const { set, target, type } = S;
    const isSelf = type === 'self';
    const title = isSelf ? set.menuLabel : `${set.label} · ${target.name}`;
    const qCards = set.questions.map((q, i) => renderQuestion(q, i)).join('');
    const textCards = set.texts.map((t) => `
      <section class="card q-card" id="t-${t.id}">
        <div class="q-kicker">✍️ ${t.required ? 'سؤال مفتوح <span class="req">(مطلوب)</span>' : 'ملاحظات (اختياري)'}</div>
        <label class="q-text" for="txt-${t.id}" style="display:block;margin-top:6px">${esc(Q.personalize(t.label, firstName(target.name)))}</label>
        <textarea class="textarea" id="txt-${t.id}" data-input="survey-text" data-key="${t.id}" maxlength="${Q.MAX_TEXT}" placeholder="${esc(t.placeholder || '')}">${esc(S.texts[t.id] || '')}</textarea>
      </section>`).join('');
    const surveyCard = set.survey ? `
      <section class="card q-card" id="survey-extra">
        <div class="q-kicker">✨ سؤال استطلاعي (اختياري)</div>
        <div class="q-text" style="margin-top:6px">${esc(set.survey.question)}</div>
        <div class="choice" role="group">
          ${set.survey.options.map((o) => `<button type="button" data-action="survey-choice" data-v="${o.value}" aria-pressed="${S.extra[set.survey.id] === o.value}">${esc(o.label)}</button>`).join('')}
        </div>
        <div id="nt-feedback" class="${S.extra[set.survey.id] === 'yes' ? '' : 'hidden'}" style="margin-top:12px">
          <label class="field"><span>${esc(set.survey.feedback.label)}</span>
            <input class="input" data-input="survey-feedback" maxlength="500" value="${esc(S.extra[set.survey.feedback.id] || '')}"></label>
        </div>
      </section>` : '';

    const nav = set.questions.map((q, i) => `
      <li><button data-action="jump" data-target="q-${q.id}" id="nav-${q.id}" class="${isAnswered(q) ? 'done' : ''}">
        <span class="dot">✓</span><span>${i + 1}. ${esc(q.shortTitle)}</span></button></li>`).join('');

    return `
      <div class="survey">
        <div>
          <div class="card survey-head">
            <a class="btn btn-ghost btn-sm" href="#/tasks/${type}">→ رجوع للقائمة</a>
            <h2>${set.icon} ${esc(title)}</h2>
            <span class="save-state" id="save-state" aria-live="polite"></span>
            <div class="survey-progress">
              <div class="row-between" style="font-size:.8rem;margin-bottom:4px"><span class="muted" id="progress-text"></span></div>
              <div class="progress"><i id="progress-bar" style="width:0%"></i></div>
            </div>
          </div>
          <p class="privacy-note" style="margin-top:16px"><span>🔒</span><span>${esc(set.intro)}</span></p>
          ${qCards}
          ${textCards}
          ${surveyCard}
          <div class="card survey-foot">
            <div id="submit-hint" class="muted"></div>
            <button class="btn btn-success btn-lg" id="submit-btn" data-action="submit-review">اعتماد وإرسال التقييم ✓</button>
          </div>
        </div>
        <aside class="card survey-side" aria-label="ملخص التقييم">
          <div class="survey-person">
            ${M.avatar(target, 'avatar-lg')}
            <h3>${esc(target.name)}</h3>
            <div class="muted" style="font-size:.84rem">${esc(target.departmentLabel)}</div>
          </div>
          <div class="ring" id="ring" style="--p:0"><span id="ring-text">0/${set.questions.length}</span></div>
          <ul class="crit-nav">${nav}</ul>
          <div class="side-note muted" style="font-size:.78rem;text-align:center">🔒 تقييم سري — لا يظهر لأي زميل</div>
        </aside>
      </div>`;
  }

  function renderQuestion(q, i) {
    const total = S.set.questions.length;
    const v = S.answers[q.id];
    const scale = Q.SCALE.map((o) => `
      <button type="button" data-action="rate" data-q="${q.id}" data-v="${o.value}" aria-pressed="${v === o.value}" aria-label="${o.value} — ${esc(o.label)}">
        <b>${o.value}</b><small>${esc(o.label)}</small>
      </button>`).join('');
    return `
      <section class="card q-card ${isAnswered(q) ? 'answered' : ''}" id="q-${q.id}">
        <div class="q-top">
          <span class="q-kicker">${q.icon} السؤال ${i + 1} من ${total} · ${esc(q.shortTitle)}</span>
          <span class="badge ${isAnswered(q) ? 'badge-good' : 'badge-muted'}" id="qb-${q.id}">${isAnswered(q) ? '✓ تمت الإجابة' : 'بانتظار الإجابة'}</span>
        </div>
        ${q.hints && q.hints.length ? `<div class="q-hints">${q.hints.map((h) => `<span>${esc(h)}</span>`).join('')}</div>` : ''}
        <div class="q-text">${questionHtml(q)}</div>
        <div class="scale" role="group" aria-label="التقييم من 1 إلى 5">${scale}</div>
        ${q.allowNA ? `<button type="button" class="na-btn" data-action="rate" data-q="${q.id}" data-v="N/A" aria-pressed="${v === 'N/A'}">لا ينطبق / لا أملك معلومات كافية</button>` : ''}
      </section>`;
  }

  function refreshQuestion(qid) {
    const q = S.set.questions.find((x) => x.id === qid);
    const card = document.getElementById('q-' + qid);
    if (!q || !card) return;
    const v = S.answers[qid];
    card.querySelectorAll('[data-action="rate"]').forEach((b) => {
      const bv = b.dataset.v === 'N/A' ? 'N/A' : Number(b.dataset.v);
      b.setAttribute('aria-pressed', String(bv === v));
    });
    const ok = isAnswered(q);
    card.classList.toggle('answered', ok);
    if (ok) card.classList.remove('missing');
    const badge = document.getElementById('qb-' + qid);
    badge.className = 'badge ' + (ok ? 'badge-good' : 'badge-muted');
    badge.textContent = ok ? '✓ تمت الإجابة' : 'بانتظار الإجابة';
    const nav = document.getElementById('nav-' + qid);
    if (nav) nav.classList.toggle('done', ok);
  }

  function missingItems() {
    const v = Q.validatePayload(S.type, { answers: S.answers, texts: S.texts, extra: S.extra }, { forSubmit: true });
    const missingQ = S.set.questions.filter((q) => !isAnswered(q));
    const missingT = S.set.texts.filter((t) => t.required && !(S.texts[t.id] || '').trim());
    return { ok: v.ok, missingQ, missingT };
  }

  function updateProgress() {
    const total = S.set.questions.length;
    const done = S.set.questions.filter(isAnswered).length;
    const p = M.pct(done, total);
    document.getElementById('progress-bar').style.width = p + '%';
    document.getElementById('progress-text').textContent = `أجبت عن ${done} من ${total} أسئلة`;
    const ring = document.getElementById('ring');
    ring.style.setProperty('--p', p);
    document.getElementById('ring-text').textContent = `${done}/${total}`;
    const m = missingItems();
    const hint = document.getElementById('submit-hint');
    const remaining = m.missingQ.length + m.missingT.length;
    hint.textContent = remaining ? `متبقٍ ${remaining} ${remaining === 1 ? 'إجابة' : 'إجابات'} قبل الإرسال` : 'كل الإجابات مكتملة — يمكنك الإرسال الآن';
  }

  function setSaveState(state, text) {
    const el = document.getElementById('save-state');
    if (!el) return;
    el.className = 'save-state ' + (state === 'saved' ? 'saved' : state === 'error' ? 'error' : '');
    el.textContent = text || ({ idle: 'مسودة جديدة', saving: '⏳ جاري الحفظ…', saved: '✓ تم حفظ المسودة', error: '⚠ لم يتم الحفظ' })[state];
  }

  function scheduleSave() {
    if (!S) return;
    S.pending = true;
    setSaveState('saving', '… تغييرات غير محفوظة');
    clearTimeout(S.timer);
    S.timer = setTimeout(saveDraft, 700);
  }

  async function saveDraft() {
    if (!S || S.saving) { if (S) S.timer = setTimeout(saveDraft, 400); return; }
    const snapshot = S;
    snapshot.saving = true;
    snapshot.pending = false;
    setSaveState('saving');
    const r = await M.api('PUT', '/my/review', {
      type: snapshot.type, targetId: snapshot.target.id,
      answers: snapshot.answers, texts: snapshot.texts, extra: snapshot.extra
    });
    snapshot.saving = false;
    if (S !== snapshot) return;
    if (r.ok) {
      if (!S.pending) setSaveState('saved', '✓ تم حفظ المسودة ' + new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
    } else if (r.status === 409) {
      M.toast(r.data.error, 'error');
      M.go('#/tasks/' + S.type);
    } else {
      setSaveState('error', '⚠ لم يتم الحفظ — ' + (r.data.error || 'تحقق من الاتصال'));
      S.pending = true;
    }
  }

  window.addEventListener('beforeunload', (e) => {
    if (S && (S.pending || S.saving)) { e.preventDefault(); e.returnValue = ''; }
  });

  M.on('click', 'rate', (el) => {
    if (!S) return;
    const qid = el.dataset.q;
    const v = el.dataset.v === 'N/A' ? 'N/A' : Number(el.dataset.v);
    S.answers[qid] = S.answers[qid] === v ? null : v;
    if (S.answers[qid] === null) delete S.answers[qid];
    refreshQuestion(qid);
    updateProgress();
    scheduleSave();
  });

  M.on('input', 'survey-text', (el) => {
    if (!S) return;
    S.texts[el.dataset.key] = el.value;
    if (el.value.trim()) el.closest('.q-card').classList.remove('missing');
    updateProgress();
    scheduleSave();
  });

  M.on('click', 'survey-choice', (el) => {
    if (!S || !S.set.survey) return;
    const id = S.set.survey.id;
    S.extra[id] = S.extra[id] === el.dataset.v ? undefined : el.dataset.v;
    if (!S.extra[id]) delete S.extra[id];
    el.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === S.extra[id])));
    document.getElementById('nt-feedback').classList.toggle('hidden', S.extra[id] !== 'yes');
    scheduleSave();
  });

  M.on('input', 'survey-feedback', (el) => {
    if (!S || !S.set.survey) return;
    S.extra[S.set.survey.feedback.id] = el.value;
    scheduleSave();
  });

  M.on('click', 'jump', (el) => {
    const t = document.getElementById(el.dataset.target);
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  M.on('click', 'submit-review', async () => {
    if (!S) return;
    const m = missingItems();
    if (!m.ok) {
      m.missingQ.forEach((q) => document.getElementById('q-' + q.id).classList.add('missing'));
      m.missingT.forEach((t) => document.getElementById('t-' + t.id).classList.add('missing'));
      const first = m.missingQ[0] ? 'q-' + m.missingQ[0].id : 't-' + m.missingT[0].id;
      document.getElementById(first).scrollIntoView({ behavior: 'smooth', block: 'center' });
      M.toast('يرجى استكمال الأسئلة المحددة باللون الأحمر قبل الإرسال', 'error');
      return;
    }
    const who = S.type === 'self' ? 'تقييمك الذاتي' : `تقييم ${S.target.name}`;
    const ok = await M.confirm('تأكيد الإرسال', `
      <p style="font-weight:700;margin-bottom:8px">هل تريد اعتماد وإرسال ${esc(who)}؟</p>
      <p class="muted">بعد الإرسال يُغلق التقييم نهائياً، ${S.type === 'self' ? 'ولا يمكن تعديله.' : 'ويختفي الشخص من قائمتك، ولا يمكن لأحد — بما في ذلك أنت — الاطلاع على إجاباتك.'}</p>`,
    'اعتماد وإرسال ✓', 'btn-success');
    if (!ok) return;
    clearTimeout(S.timer);
    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    const r = await M.api('POST', '/my/review/submit', {
      type: S.type, targetId: S.target.id, answers: S.answers, texts: S.texts, extra: S.extra
    });
    btn.disabled = false;
    if (!r.ok) {
      M.toast(r.data.error || 'تعذر الإرسال، حاول مرة أخرى', 'error');
      if (r.status === 409) M.go('#/tasks/' + S.type);
      return;
    }
    const type = S.type;
    S = null;
    M.toast('تم إرسال التقييم بنجاح 🎉', 'good');
    M.go('#/tasks/' + type);
  });
})();
