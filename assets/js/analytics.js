// =========================================================
// Admin analytics: smart default analysis, per-section data
// selectors, fixed reports and participation tracking.
// All numbers come from /api/admin/analytics (aggregated, anonymous).
// =========================================================
(function () {
  'use strict';
  const M = window.M360;
  const Q = window.M360Questions;
  const C = window.M360Charts;
  const esc = M.esc;
  const fmt = M.fmt;

  const SOURCES = ['peer', 'manager', 'hr', 'self'];
  const WEIGHT_KEY = 'm360_weights';
  const DEFAULT_WEIGHTS = { peer: 40, manager: 35, hr: 25 };

  const A = {
    data: null,
    cycleId: null,
    dept: '',
    weights: loadWeights(),
    ui: {
      rankMetric: 'final', rankOrder: 'desc', rankLimit: 'all',
      compareGroup: 'department', critSource: 'peer', heatSource: 'peer', distSource: 'peer', distEmp: '',
      views: {}
    },
    report: 'total',
    detailEmp: '',
    onlyIncomplete: false
  };

  function loadWeights() {
    try {
      const w = JSON.parse(localStorage.getItem(WEIGHT_KEY));
      if (w && ['peer', 'manager', 'hr'].every((k) => typeof w[k] === 'number' && w[k] >= 0)) return w;
    } catch (e) { /* ignore */ }
    return Object.assign({}, DEFAULT_WEIGHTS);
  }

  // -------------------------------------------------------
  // Model
  // -------------------------------------------------------
  function mean(list) {
    const v = list.filter((x) => x !== null && x !== undefined && !isNaN(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }

  function build() {
    const d = A.data;
    const w = A.weights;
    const all = d.employees.map((e) => {
      const s = e.scores;
      let num = 0;
      let den = 0;
      ['peer', 'manager', 'hr'].forEach((k) => {
        if (s[k].avg !== null && w[k] > 0) { num += s[k].avg * w[k]; den += w[k]; }
      });
      const final = den ? num / den : null;
      const missing = ['peer', 'manager', 'hr'].filter((k) => e.expected[k] > 0 && s[k].avg === null);
      const gap = s.self.avg !== null && final !== null ? s.self.avg - final : null;
      return { ...e, final, gap, missing };
    });
    const ranked = all.filter((e) => e.final !== null).sort((a, b) => b.final - a.final);
    ranked.forEach((e, i) => {
      e.rank = i + 1;
      e.percentile = ranked.length > 1 ? Math.round(((ranked.length - 1 - i) / (ranked.length - 1)) * 100) : 100;
    });
    const byDept = {};
    ranked.forEach((e) => { (byDept[e.department] = byDept[e.department] || []).push(e); });
    Object.values(byDept).forEach((list) => list.forEach((e, i) => { e.deptRank = i + 1; e.deptSize = list.length; }));
    const companyAvg = mean(ranked.map((e) => e.final));
    const employees = all.filter((e) => !A.dept || e.department === A.dept);
    return { all, employees, companyAvg };
  }

  // Every selectable metric ("the available data")
  function metricOptions() {
    const opts = [
      { key: 'final', label: 'الدرجة النهائية (موزونة)' },
      { key: 'peer', label: 'متوسط تقييم الزملاء' },
      { key: 'manager', label: 'متوسط تقييم المدير' },
      { key: 'hr', label: 'متوسط التقييم الإداري (HR)' },
      { key: 'self', label: 'التقييم الذاتي' }
    ];
    SOURCES.forEach((s) => {
      A.data.criteria[s].forEach((c) => opts.push({ key: `${s}:${c.id}`, label: `${C.SERIES[s].label} · ${c.shortTitle}`, group: C.SERIES[s].label }));
    });
    return opts;
  }

  function metricValue(e, key) {
    if (key === 'final') return e.final;
    if (SOURCES.includes(key)) return e.scores[key].avg;
    const [src, id] = key.split(':');
    const c = e.scores[src] && e.scores[src].byCriterion[id];
    return c ? c.avg : null;
  }

  function metricLabel(key) {
    const o = metricOptions().find((x) => x.key === key);
    return o ? o.label : key;
  }

  function metricColor(key) {
    const src = key.split(':')[0];
    return (C.SERIES[src] || C.SERIES.final).color;
  }

  function band(score) {
    const b = Q.scoreBand(score);
    const cls = { excellent: 'badge-good', exceeds: 'badge-good', meets: 'badge-muted', improve: 'badge-warn', weak: 'badge-crit', none: 'badge-muted' }[b.key];
    return `<span class="badge ${cls}">${esc(b.label)}</span>`;
  }

  // -------------------------------------------------------
  // Shared UI pieces
  // -------------------------------------------------------
  function select(name, value, options, label) {
    return `<label class="sr-only" for="sel-${name}">${esc(label || name)}</label>
      <select class="select" id="sel-${name}" data-change="an-ui" data-key="${name}">${options.map((o) => {
        if (o.group !== undefined && o.groupStart) return `<optgroup label="${esc(o.group)}">`;
        return `<option value="${esc(o.key)}" ${String(value) === String(o.key) ? 'selected' : ''}>${esc(o.label)}</option>`;
      }).join('')}</select>`;
  }

  function metricSelect(name, value, label) {
    const opts = metricOptions();
    let html = `<label class="sr-only" for="sel-${name}">${esc(label)}</label><select class="select" id="sel-${name}" data-change="an-ui" data-key="${name}">`;
    let group = null;
    opts.forEach((o) => {
      if (o.group && o.group !== group) {
        if (group) html += '</optgroup>';
        group = o.group;
        html += `<optgroup label="معايير ${esc(group)}">`;
      }
      html += `<option value="${esc(o.key)}" ${value === o.key ? 'selected' : ''}>${esc(o.label)}</option>`;
    });
    if (group) html += '</optgroup>';
    return html + '</select>';
  }

  const SOURCE_OPTS = SOURCES.map((s) => ({ key: s, label: C.SERIES[s].label }));

  function panel(id, title, desc, controls, chartHtml, tableHtml, csv) {
    const view = A.ui.views[id] || 'chart';
    if (csv) panelCsv[id] = csv;
    return `
      <section class="card panel" id="panel-${id}">
        <div class="panel-head">
          <div><h3>${title}</h3>${desc ? `<p>${desc}</p>` : ''}</div>
          <div class="panel-controls">
            ${controls || ''}
            ${tableHtml ? `<div class="seg" role="group" aria-label="طريقة العرض">
              <button data-action="an-view" data-id="${id}" data-v="chart" aria-pressed="${view === 'chart'}">مخطط</button>
              <button data-action="an-view" data-id="${id}" data-v="table" aria-pressed="${view === 'table'}">جدول</button></div>` : ''}
            ${csv ? `<button class="btn btn-ghost btn-sm" data-action="an-csv" data-id="${id}" title="تصدير CSV">⬇ CSV</button>` : ''}
          </div>
        </div>
        ${view === 'table' && tableHtml ? tableHtml : chartHtml}
      </section>`;
  }
  const panelCsv = {};

  function filtersBar(extra) {
    const d = A.data;
    return `
      <div class="card filters">
        <label>🗓️ الدورة
          <select class="select" data-change="an-cycle">${d.cycles.map((c) => `<option value="${esc(c.id)}" ${c.id === d.cycle.id ? 'selected' : ''}>${esc(c.name)}${c.isActive ? ' (الحالية)' : ''}</option>`).join('')}</select></label>
        <label>🏢 الإدارة
          <select class="select" data-change="an-dept"><option value="">كل الإدارات</option>
            ${d.departments.map((x) => `<option value="${esc(x.code)}" ${A.dept === x.code ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
        ${extra || ''}
      </div>`;
  }

  function weightsEditor() {
    const w = A.weights;
    return `<div class="weights" title="أوزان الدرجة النهائية">⚖️ الأوزان:
      ${['peer', 'manager', 'hr'].map((k) => `<label><span class="legend" style="display:inline-flex;margin:0"><span><i style="background:${C.SERIES[k].color}"></i>${esc(C.SERIES[k].label)}</span></span>
        <input type="number" min="0" max="100" step="5" value="${w[k]}" data-change="an-weight" data-key="${k}" aria-label="وزن ${esc(C.SERIES[k].label)}">%</label>`).join('')}
      <button class="btn btn-ghost btn-sm" data-action="an-weights-reset">افتراضي</button></div>`;
  }

  // -------------------------------------------------------
  // Data loading & routing
  // -------------------------------------------------------
  async function load(cycleId) {
    const q = cycleId ? `?cycle=${encodeURIComponent(cycleId)}` : '';
    const r = await M.api('GET', '/admin/analytics' + q);
    if (!r.ok) {
      M.adminContent().innerHTML = `<div class="card empty">⚠️ ${esc(r.data.error || 'تعذر تحميل النتائج')}</div>`;
      return false;
    }
    A.data = r.data;
    A.cycleId = r.data.cycle.id;
    loadedAt = Date.now();
    if (A.dept && !r.data.departments.some((d) => d.code === A.dept)) A.dept = '';
    return true;
  }

  let currentPage = 'analytics';
  let loadedAt = 0;
  let pinnedCycle = null; // a cycle explicitly chosen by the admin; otherwise the active one
  async function render(page, arg) {
    currentPage = page;
    if (page === 'analytics' && arg) pinnedCycle = arg;
    const stale = Date.now() - loadedAt > 30000;
    if (!A.data || stale || (pinnedCycle && pinnedCycle !== A.cycleId)) {
      if (!(await load(pinnedCycle))) return;
    }
    if (page === 'reports' && arg) A.report = arg;
    draw();
  }

  function draw() {
    const el = M.adminContent();
    if (!el || !A.data) return;
    const model = build();
    if (currentPage === 'reports') el.innerHTML = reportsPage(model);
    else if (currentPage === 'participation') el.innerHTML = participationPage();
    else el.innerHTML = overviewPage(model);
  }

  // -------------------------------------------------------
  // 1) Default analysis (overview)
  // -------------------------------------------------------
  function overviewPage(model) {
    const d = A.data;
    const emps = model.employees;
    const reqAll = Object.values(d.totals.required).reduce((a, b) => a + b, 0);
    const doneAll = Object.values(d.totals.submitted).reduce((a, b) => a + b, 0);
    const srcAvg = (s) => mean(emps.map((e) => e.scores[s].avg));
    const kpi = (label, value, sub, color) => `
      <div class="card kpi"><div class="label">${color ? `<span class="swatch" style="background:${color}"></span>` : ''}${esc(label)}</div>
        <div class="value">${value}</div><div class="sub">${sub}</div></div>`;
    const filtAvg = mean(emps.map((e) => e.final));

    const kpis = `
      <div class="kpis">
        ${kpi('نسبة المشاركة', `${M.pct(doneAll, reqAll)}<small>%</small>`, `${doneAll} من ${reqAll} تقييماً مطلوباً`)}
        ${kpi(A.dept ? 'متوسط الإدارة النهائي' : 'المتوسط النهائي للشركة', `${fmt(filtAvg)} <small>/ 5</small>`, esc(Q.scoreBand(filtAvg).label))}
        ${SOURCES.map((s) => kpi(`متوسط ${C.SERIES[s].label}`, `${fmt(srcAvg(s))} <small>/ 5</small>`,
          `${emps.reduce((a, e) => a + e.scores[s].raters, 0)} تقييم مستلم`, C.SERIES[s].color)).join('')}
      </div>`;

    return `
      <div class="page-head"><h2>📊 لوحة التحليل</h2><p class="muted">تحليل افتراضي ذكي لنتائج الدورة. كل قسم يحتوي قائمة لاختيار البيانات التي تريد عرضها.</p></div>
      ${filtersBar(weightsEditor())}
      ${kpis}
      ${insightsPanel(model)}
      ${rankingPanel(model)}
      <div class="two-col">
        ${comparePanel(model)}
        ${criteriaPanel(model)}
      </div>
      ${heatPanel(model)}
      ${distributionPanel(model)}`;
  }

  function insightsPanel(model) {
    const d = A.data;
    const emps = model.employees;
    const items = [];
    const add = (icon, html) => items.push(`<li><span class="i">${icon}</span><span>${html}</span></li>`);

    const part = d.participation.filter((p) => !A.dept || p.department === A.dept);
    const notStarted = part.filter((p) => p.required > 0 && p.done === 0);
    const incomplete = part.filter((p) => p.done < p.required);
    if (part.length) {
      const pct = M.pct(part.reduce((a, p) => a + p.done, 0), part.reduce((a, p) => a + p.required, 0));
      add(pct >= 90 ? '✅' : '⏳', `نسبة المشاركة <b>${pct}%</b> — ${incomplete.length ? `${incomplete.length} موظفاً لم يكملوا تقييماتهم${notStarted.length ? `، منهم ${notStarted.length} لم يرسلوا أي تقييم بعد` : ''}. <a href="#/admin/participation">عرض المتابعة ←</a>` : 'كل الموظفين أكملوا تقييماتهم.'}`);
    }
    const ranked = emps.filter((e) => e.final !== null).sort((a, b) => b.final - a.final);
    if (!ranked.length) {
      add('ℹ️', 'لا توجد تقييمات مرسلة بعد في هذه الدورة. ستظهر التحليلات تلقائياً بمجرد إرسال التقييمات.');
      return panel('insights', '🧠 أهم الملاحظات', 'تُستخرج تلقائياً من البيانات', '', `<ul class="insights">${items.join('')}</ul>`);
    }
    add('🏆', `الأعلى في الدرجة النهائية: <b>${esc(ranked[0].name)}</b> (${fmt(ranked[0].final)})${ranked[1] ? `، ثم <b>${esc(ranked[1].name)}</b> (${fmt(ranked[1].final)})` : ''}.`);
    if (ranked.length > 2) {
      const low = ranked[ranked.length - 1];
      add('🤝', `يحتاج إلى دعم: <b>${esc(low.name)}</b> (${fmt(low.final)}) — راجع <a href="#/admin/reports/details" data-action="an-detail" data-id="${low.id}">تفاصيل تقييمه</a>.`);
    }
    // criteria strengths / weaknesses (peer)
    const crit = d.criteria.peer.map((c) => ({ c, v: mean(emps.map((e) => e.scores.peer.byCriterion[c.id].avg)) })).filter((x) => x.v !== null).sort((a, b) => b.v - a.v);
    if (crit.length > 1) {
      add('💪', `أقوى معيار على مستوى ${A.dept ? 'الإدارة' : 'الشركة'}: <b>${esc(crit[0].c.shortTitle)}</b> (${fmt(crit[0].v)}).`);
      add('🎯', `أضعف معيار: <b>${esc(crit[crit.length - 1].c.shortTitle)}</b> (${fmt(crit[crit.length - 1].v)}) — مرشح لبرنامج تدريبي.`);
    }
    // departments
    if (!A.dept && d.departments.length > 1) {
      const deps = d.departments.map((x) => ({ x, v: mean(model.all.filter((e) => e.department === x.code).map((e) => e.final)) })).filter((x) => x.v !== null).sort((a, b) => b.v - a.v);
      if (deps.length > 1) add('🏢', `أعلى إدارة: <b>${esc(deps[0].x.label)}</b> (${fmt(deps[0].v)})، وأقلها: <b>${esc(deps[deps.length - 1].x.label)}</b> (${fmt(deps[deps.length - 1].v)}).`);
    }
    // self-awareness gaps
    const gaps = emps.filter((e) => e.gap !== null).sort((a, b) => b.gap - a.gap);
    if (gaps.length && gaps[0].gap >= 0.75) add('🪞', `أكبر مبالغة في التقييم الذاتي: <b>${esc(gaps[0].name)}</b> يقيّم نفسه أعلى من تقييم الآخرين بـ <b>${fmt(gaps[0].gap)}</b>.`);
    const under = gaps[gaps.length - 1];
    if (under && under.gap <= -0.75) add('🌱', `تقييم ذاتي متواضع: <b>${esc(under.name)}</b> يقيّم نفسه أقل من الآخرين بـ <b>${fmt(Math.abs(under.gap))}</b> — قد يحتاج تشجيعاً.`);
    // manager vs peers
    const disagree = emps.filter((e) => e.scores.manager.avg !== null && e.scores.peer.avg !== null && Math.abs(e.scores.manager.avg - e.scores.peer.avg) >= 1);
    if (disagree.length) add('⚖️', `اختلاف كبير بين تقييم المدير والزملاء لـ ${disagree.length} موظف: ${disagree.slice(0, 3).map((e) => `<b>${esc(e.name)}</b>`).join('، ')}${disagree.length > 3 ? '…' : ''}.`);
    // reliability
    const fewRaters = emps.filter((e) => e.scores.peer.raters > 0 && e.scores.peer.raters < 3);
    if (fewRaters.length) add('🔎', `${fewRaters.length} موظف لديهم أقل من 3 تقييمات زملاء — نتائجهم أقل موثوقية حتى تكتمل المشاركة.`);
    const missingMgr = emps.filter((e) => e.missing.includes('manager'));
    if (missingMgr.length) add('👔', `${missingMgr.length} موظف لم يصلهم تقييم المدير بعد.`);
    if (d.nextOne.yes + d.nextOne.no > 0) add('✨', `استطلاع نكست ون: <b>${M.pct(d.nextOne.yes, d.nextOne.yes + d.nextOne.no)}%</b> جرّبوه (${d.nextOne.yes} من ${d.nextOne.yes + d.nextOne.no}).`);
    return panel('insights', '🧠 أهم الملاحظات (تحليل تلقائي)', 'تُستخرج تلقائياً من البيانات وتتغير مع الفلاتر', '', `<ul class="insights">${items.join('')}</ul>`);
  }

  function rankingPanel(model) {
    const u = A.ui;
    let list = model.employees.map((e) => ({ e, v: metricValue(e, u.rankMetric) })).filter((x) => x.v !== null);
    list.sort((a, b) => (u.rankOrder === 'desc' ? b.v - a.v : a.v - b.v));
    if (u.rankLimit !== 'all') list = list.slice(0, Number(u.rankLimit));
    const ref = mean(model.all.map((e) => metricValue(e, u.rankMetric)));
    const items = list.map(({ e, v }) => ({
      label: e.name, sub: e.departmentLabel, value: v,
      tipHtml: `<b>${esc(e.name)}</b> · ${esc(e.departmentLabel)}<br>${esc(metricLabel(u.rankMetric))}: ${fmt(v)}<br>الزملاء ${fmt(e.scores.peer.avg)} · المدير ${fmt(e.scores.manager.avg)} · HR ${fmt(e.scores.hr.avg)}`
    }));
    const controls = metricSelect('rankMetric', u.rankMetric, 'المقياس') +
      select('rankOrder', u.rankOrder, [{ key: 'desc', label: 'الأعلى أولاً' }, { key: 'asc', label: 'الأقل أولاً' }], 'الترتيب') +
      select('rankLimit', u.rankLimit, [{ key: 'all', label: 'كل الموظفين' }, { key: '5', label: 'أول 5' }, { key: '10', label: 'أول 10' }], 'العدد');
    const table = C.table(list.map(({ e, v }, i) => ({ i: i + 1, name: e.name, dept: e.departmentLabel, v, n: e.scores.peer.raters })), [
      { key: 'i', label: '#', num: true }, { key: 'name', label: 'الموظف' }, { key: 'dept', label: 'الإدارة' },
      { key: 'v', label: metricLabel(u.rankMetric), num: true, fmt: (x) => fmt(x) }, { key: 'n', label: 'عدد تقييمات الزملاء', num: true }
    ]);
    const csv = [['#', 'الموظف', 'الإدارة', metricLabel(u.rankMetric)], ...list.map(({ e, v }, i) => [i + 1, e.name, e.departmentLabel, fmt(v)])];
    return panel('ranking', '🏅 ترتيب الموظفين', `حسب: ${esc(metricLabel(u.rankMetric))} — الخط الداكن = متوسط الشركة`, controls,
      C.hbars(items, { color: metricColor(u.rankMetric), ref, refLabel: 'متوسط الشركة' }), table, csv);
  }

  function comparePanel(model) {
    const u = A.ui;
    const keys = ['peer', 'manager', 'hr', 'self'];
    let items;
    if (u.compareGroup === 'department') {
      const deps = A.data.departments.filter((x) => !A.dept || x.code === A.dept);
      items = deps.map((x) => {
        const list = model.all.filter((e) => e.department === x.code);
        const values = {};
        keys.forEach((k) => { values[k] = mean(list.map((e) => e.scores[k].avg)); });
        return { label: x.label, sub: `${list.length} موظف`, values };
      });
    } else {
      items = model.employees.map((e) => {
        const values = {};
        keys.forEach((k) => { values[k] = e.scores[k].avg; });
        return { label: e.name, sub: e.departmentLabel, values };
      }).sort((a, b) => (b.values.peer || 0) - (a.values.peer || 0));
    }
    const controls = select('compareGroup', u.compareGroup, [{ key: 'department', label: 'حسب الإدارة' }, { key: 'employee', label: 'حسب الموظف' }], 'التجميع');
    const table = C.table(items.map((it) => ({ label: it.label, ...it.values })), [
      { key: 'label', label: u.compareGroup === 'department' ? 'الإدارة' : 'الموظف' },
      ...keys.map((k) => ({ key: k, label: C.SERIES[k].label, num: true, fmt: (x) => fmt(x) }))
    ]);
    const csv = [[u.compareGroup === 'department' ? 'الإدارة' : 'الموظف', ...keys.map((k) => C.SERIES[k].label)], ...items.map((it) => [it.label, ...keys.map((k) => fmt(it.values[k]))])];
    return panel('compare', '🔀 مقارنة مصادر التقييم', 'الزملاء · المدير · الموارد البشرية · الذاتي', controls, C.groupedHbars(items, keys), table, csv);
  }

  function criteriaPanel(model) {
    const src = A.ui.critSource;
    const rows = A.data.criteria[src].map((c) => {
      const vals = model.employees.map((e) => e.scores[src].byCriterion[c.id]).filter((x) => x && x.avg !== null);
      return { c, v: mean(vals.map((x) => x.avg)), n: vals.reduce((a, x) => a + x.n, 0) };
    });
    const items = rows.map((r) => ({ label: `${r.c.icon} ${r.c.shortTitle}`, value: r.v, tipHtml: `<b>${esc(r.c.title)}</b><br>المتوسط: ${fmt(r.v)} · ${r.n} إجابة` }));
    const ref = mean(rows.map((r) => r.v));
    const table = C.table(rows.map((r) => ({ t: r.c.title, v: r.v, n: r.n })), [
      { key: 't', label: 'المعيار' }, { key: 'v', label: 'المتوسط', num: true, fmt: (x) => fmt(x) }, { key: 'n', label: 'عدد الإجابات', num: true }
    ]);
    const csv = [['المعيار', 'المتوسط', 'عدد الإجابات'], ...rows.map((r) => [r.c.title, fmt(r.v), r.n])];
    return panel('criteria', '📋 متوسط المعايير', `مصدر التقييم: ${esc(C.SERIES[src].label)}`, select('critSource', src, SOURCE_OPTS, 'المصدر'),
      C.hbars(items, { color: C.SERIES[src].color, ref, refLabel: 'متوسط المعايير' }), table, csv);
  }

  function heatPanel(model) {
    const src = A.ui.heatSource;
    const crit = A.data.criteria[src];
    const rows = model.employees.filter((e) => e.scores[src].raters > 0)
      .sort((a, b) => (b.scores[src].avg || 0) - (a.scores[src].avg || 0))
      .map((e) => ({ label: e.name, cells: crit.map((c) => e.scores[src].byCriterion[c.id].avg) }));
    const cols = crit.map((c) => ({ label: `${c.icon} ${c.num}`, title: c.title }));
    const csv = [['الموظف', ...crit.map((c) => c.title)], ...rows.map((r) => [r.label, ...r.cells.map((v) => fmt(v))])];
    return panel('heat', '🌡️ الخريطة الحرارية: الموظفون × المعايير', `مصدر التقييم: ${esc(C.SERIES[src].label)} — مرّر المؤشر على أي خلية لمعرفة المعيار`,
      select('heatSource', src, SOURCE_OPTS, 'المصدر'), C.heatmap(rows, cols), null, csv);
  }

  function distributionPanel(model) {
    const u = A.ui;
    const src = u.distSource;
    const pool = u.distEmp ? model.all.filter((e) => String(e.id) === String(u.distEmp)) : model.employees;
    const counts = [0, 0, 0, 0, 0];
    pool.forEach((e) => e.scores[src].dist.forEach((c, i) => { counts[i] += c; }));
    const empOpts = [{ key: '', label: A.dept ? 'كل موظفي الإدارة' : 'كل الموظفين' }, ...model.employees.map((e) => ({ key: String(e.id), label: e.name }))];
    const controls = select('distSource', src, SOURCE_OPTS, 'المصدر') + select('distEmp', u.distEmp, empOpts, 'الموظف');
    const table = C.table(Q.SCALE.map((s, i) => ({ s: `${s.value} — ${s.label}`, c: counts[i], p: M.pct(counts[i], counts.reduce((a, b) => a + b, 0)) + '%' })), [
      { key: 's', label: 'الدرجة' }, { key: 'c', label: 'عدد الإجابات', num: true }, { key: 'p', label: 'النسبة', num: true }
    ]);
    return panel('dist', '📶 توزيع الدرجات', 'كم مرة اختير كل مستوى من 1 إلى 5 (بدون «لا ينطبق»)', controls, C.distribution(counts), table);
  }

  // -------------------------------------------------------
  // 2) Fixed reports
  // -------------------------------------------------------
  const REPORTS = [
    { key: 'peer', label: '1. تقييم الموظف من زملائه' },
    { key: 'total', label: '2. إجمالي تقييم الموظف' },
    { key: 'details', label: '3. تفاصيل التقييم (موظف واحد)' },
    { key: 'company', label: '4. المتوسط النهائي على مستوى الشركة' },
    { key: 'gap', label: '5. فجوة التقييم الذاتي' },
    { key: 'departments', label: '6. مقارنة الإدارات' },
    { key: 'strengths', label: '7. نقاط القوة وفرص التطوير' },
    { key: 'nextone', label: '8. استطلاع نكست ون' }
  ];

  function reportsPage(model) {
    const rep = REPORTS.find((r) => r.key === A.report) || REPORTS[1];
    const chooser = `<label>📑 التقرير
      <select class="select" data-change="an-report">${REPORTS.map((r) => `<option value="${r.key}" ${r.key === rep.key ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></label>`;
    const body = {
      peer: reportPeer, total: reportTotal, details: reportDetails, company: reportCompany,
      gap: reportGap, departments: reportDepartments, strengths: reportStrengths, nextone: reportNextOne
    }[rep.key](model);
    return `
      <div class="page-head"><h2>📑 التقارير</h2><p class="muted">قوائم تحليل ثابتة جاهزة للطباعة والتصدير. كل الأرقام مجمّعة — لا يظهر من قيّم في تقييم الزملاء.</p></div>
      ${filtersBar(chooser)}
      ${body}`;
  }

  function personCell(e) {
    return `<div class="person-cell">${M.avatar(e)}<div><b>${esc(e.name)}</b><small>${esc(e.departmentLabel)}</small></div></div>`;
  }
  function heatCell(v) {
    if (v === null || v === undefined) return '<span class="muted">—</span>';
    return `<span class="badge" style="background:${C.scoreColor(v)};color:${C.inkOn(v)}">${fmt(v)}</span>`;
  }

  function reportPeer(model) {
    const crit = A.data.criteria.peer;
    const list = model.employees.slice().sort((a, b) => (b.scores.peer.avg || 0) - (a.scores.peer.avg || 0));
    const head = `<tr><th>الموظف</th><th class="num">عدد المقيّمين</th>${crit.map((c) => `<th class="num" title="${esc(c.title)}">${c.icon} ${esc(c.shortTitle)}</th>`).join('')}<th class="num">متوسط الزملاء</th><th>التصنيف</th></tr>`;
    const body = list.map((e) => `<tr><td>${personCell(e)}</td><td class="num">${e.scores.peer.raters} من ${e.expected.peer}</td>
      ${crit.map((c) => `<td class="num">${heatCell(e.scores.peer.byCriterion[c.id].avg)}</td>`).join('')}
      <td class="num"><b>${fmt(e.scores.peer.avg)}</b></td><td>${band(e.scores.peer.avg)}</td></tr>`).join('');
    panelCsv['rep-peer'] = [['الموظف', 'الإدارة', 'عدد المقيّمين', ...crit.map((c) => c.title), 'متوسط الزملاء'],
      ...list.map((e) => [e.name, e.departmentLabel, e.scores.peer.raters, ...crit.map((c) => fmt(e.scores.peer.byCriterion[c.id].avg)), fmt(e.scores.peer.avg)])];
    return reportCard('rep-peer', '👥 تقييم الموظف من زملائه', 'متوسط كل معيار من تقييمات الزملاء (360°) — «عدد المقيّمين» من أصل المطلوب.',
      `<div class="table-wrap"><table class="tbl">${head}${body}</table></div>`);
  }

  function reportTotal(model) {
    const list = model.employees.slice().sort((a, b) => (b.final || 0) - (a.final || 0));
    const head = `<tr><th>الموظف</th>${['peer', 'manager', 'hr'].map((k) => `<th class="num"><span class="legend" style="display:inline-flex;margin:0"><span><i style="background:${C.SERIES[k].color}"></i>${esc(C.SERIES[k].label)}</span></span></th>`).join('')}
      <th class="num">النهائي</th><th class="num"><span class="legend" style="display:inline-flex;margin:0"><span><i style="background:${C.SERIES.self.color}"></i>الذاتي</span></span></th><th class="num">الفجوة</th><th>التصنيف</th></tr>`;
    const body = list.map((e) => `<tr><td>${personCell(e)}</td>
      ${['peer', 'manager', 'hr'].map((k) => `<td class="num">${fmt(e.scores[k].avg)}<div class="muted" style="font-size:.7rem">${e.scores[k].raters ? `n=${e.scores[k].raters}` : ''}</div></td>`).join('')}
      <td class="num"><b>${fmt(e.final)}</b>${e.missing.length ? '<div class="muted" style="font-size:.7rem" title="بعض المصادر لم تكتمل">جزئي</div>' : ''}</td>
      <td class="num">${fmt(e.scores.self.avg)}</td>
      <td class="num">${e.gap === null ? '—' : (e.gap > 0 ? '+' : '') + fmt(e.gap)}</td><td>${band(e.final)}</td></tr>`).join('');
    panelCsv['rep-total'] = [['الموظف', 'الإدارة', 'الزملاء', 'المدير', 'الموارد البشرية', 'النهائي', 'الذاتي', 'الفجوة'],
      ...list.map((e) => [e.name, e.departmentLabel, fmt(e.scores.peer.avg), fmt(e.scores.manager.avg), fmt(e.scores.hr.avg), fmt(e.final), fmt(e.scores.self.avg), fmt(e.gap)])];
    return reportCard('rep-total', '🧮 إجمالي تقييم الموظف', `الدرجة النهائية = متوسط موزون للزملاء ${A.weights.peer}% والمدير ${A.weights.manager}% والموارد البشرية ${A.weights.hr}% (يُعاد توزيع الوزن عند غياب مصدر). التقييم الذاتي لا يدخل في النهائي ويُعرض للمقارنة.`,
      `${weightsEditor()}<div class="table-wrap" style="margin-top:12px"><table class="tbl">${head}${body}</table></div>`);
  }

  function reportCompany(model) {
    const list = model.all.filter((e) => e.final !== null && (!A.dept || e.department === A.dept)).sort((a, b) => a.rank - b.rank);
    const avg = model.companyAvg;
    const items = list.map((e) => ({ label: e.name, sub: e.departmentLabel, value: e.final,
      tipHtml: `<b>${esc(e.name)}</b><br>النهائي ${fmt(e.final)} · الترتيب ${e.rank} من ${model.all.filter((x) => x.final !== null).length}` }));
    const rows = list.map((e) => `<tr><td class="num"><b>${e.rank}</b></td><td>${personCell(e)}</td><td class="num"><b>${fmt(e.final)}</b></td>
      <td class="num" style="color:${e.final - avg >= 0 ? 'var(--good-text)' : 'var(--crit-text)'}">${e.final - avg >= 0 ? '▲ +' : '▼ '}${fmt(e.final - avg)}</td>
      <td class="num">${e.percentile}%</td><td class="num">${e.deptRank} من ${e.deptSize}</td><td>${band(e.final)}</td></tr>`).join('');
    panelCsv['rep-company'] = [['الترتيب', 'الموظف', 'الإدارة', 'النهائي', 'الفرق عن متوسط الشركة', 'المئين', 'الترتيب في الإدارة'],
      ...list.map((e) => [e.rank, e.name, e.departmentLabel, fmt(e.final), fmt(e.final - avg), e.percentile + '%', `${e.deptRank}/${e.deptSize}`])];
    return `
      <div class="kpis">
        <div class="card kpi"><div class="label">متوسط الشركة النهائي</div><div class="value">${fmt(avg)} <small>/ 5</small></div><div class="sub">${esc(Q.scoreBand(avg).label)}</div></div>
        <div class="card kpi"><div class="label">فوق المتوسط</div><div class="value">${list.filter((e) => e.final >= avg).length}</div><div class="sub">موظف</div></div>
        <div class="card kpi"><div class="label">تحت المتوسط</div><div class="value">${list.filter((e) => e.final < avg).length}</div><div class="sub">موظف</div></div>
      </div>
      ${panel('company-chart', '🏢 المتوسط النهائي للموظفين على مستوى الشركة', 'الخط الداكن = متوسط الشركة', '', C.hbars(items, { ref: avg, refLabel: 'متوسط الشركة' }))}
      ${reportCard('rep-company', '📋 جدول الترتيب العام', 'الترتيب والمئين محسوبان على مستوى الشركة كلها حتى عند تصفية إدارة.',
        `<div class="table-wrap"><table class="tbl"><tr><th class="num">#</th><th>الموظف</th><th class="num">النهائي</th><th class="num">الفرق عن المتوسط</th><th class="num">المئين</th><th class="num">في الإدارة</th><th>التصنيف</th></tr>${rows}</table></div>`)}`;
  }

  function reportGap(model) {
    const list = model.employees.filter((e) => e.gap !== null).sort((a, b) => b.gap - a.gap);
    const items = list.map((e) => ({ label: e.name, value: e.gap, tipText: `الذاتي ${fmt(e.scores.self.avg)} · تقييم الآخرين ${fmt(e.final)}` }));
    const table = C.table(list.map((e) => ({ n: e.name, d: e.departmentLabel, s: e.scores.self.avg, f: e.final, g: e.gap })), [
      { key: 'n', label: 'الموظف' }, { key: 'd', label: 'الإدارة' }, { key: 's', label: 'الذاتي', num: true, fmt: (x) => fmt(x) },
      { key: 'f', label: 'تقييم الآخرين (النهائي)', num: true, fmt: (x) => fmt(x) }, { key: 'g', label: 'الفجوة', num: true, fmt: (x) => (x > 0 ? '+' : '') + fmt(x) }
    ]);
    panelCsv.gap = [['الموظف', 'الإدارة', 'الذاتي', 'النهائي', 'الفجوة'], ...list.map((e) => [e.name, e.departmentLabel, fmt(e.scores.self.avg), fmt(e.final), fmt(e.gap)])];
    return panel('gap', '🪞 فجوة الوعي الذاتي', 'الفجوة = التقييم الذاتي − الدرجة النهائية من الآخرين. فجوة كبيرة موجبة = مبالغة في تقدير الذات، وسالبة = تواضع زائد.', '',
      C.gapBars(items), table, panelCsv.gap);
  }

  function reportDepartments(model) {
    const deps = A.data.departments.filter((x) => !A.dept || x.code === A.dept);
    const rows = deps.map((x) => {
      const list = model.all.filter((e) => e.department === x.code);
      const p = A.data.participation.filter((r) => r.department === x.code);
      return {
        x, n: list.length,
        peer: mean(list.map((e) => e.scores.peer.avg)), manager: mean(list.map((e) => e.scores.manager.avg)),
        hr: mean(list.map((e) => e.scores.hr.avg)), self: mean(list.map((e) => e.scores.self.avg)),
        final: mean(list.map((e) => e.final)),
        part: M.pct(p.reduce((a, r) => a + r.done, 0), p.reduce((a, r) => a + r.required, 0))
      };
    });
    const crit = A.data.criteria.peer;
    const heatRows = deps.map((x) => ({ label: x.label, cells: crit.map((c) => mean(model.all.filter((e) => e.department === x.code).map((e) => e.scores.peer.byCriterion[c.id].avg))) }));
    panelCsv['rep-dep'] = [['الإدارة', 'عدد الموظفين', 'الزملاء', 'المدير', 'الموارد البشرية', 'الذاتي', 'النهائي', 'المشاركة'],
      ...rows.map((r) => [r.x.label, r.n, fmt(r.peer), fmt(r.manager), fmt(r.hr), fmt(r.self), fmt(r.final), r.part + '%'])];
    return `
      ${reportCard('rep-dep', '🏢 مقارنة الإدارات', 'متوسط كل مصدر تقييم والدرجة النهائية ونسبة المشاركة لكل إدارة.',
        C.table(rows.map((r) => ({ ...r, label: r.x.label, partTxt: r.part + '%' })), [
          { key: 'label', label: 'الإدارة' }, { key: 'n', label: 'الموظفون', num: true },
          ...['peer', 'manager', 'hr', 'self'].map((k) => ({ key: k, label: C.SERIES[k].label, num: true, fmt: (x) => fmt(x) })),
          { key: 'final', label: 'النهائي', num: true, html: (r) => `<b>${fmt(r.final)}</b>` }, { key: 'partTxt', label: 'المشاركة', num: true }
        ]))}
      ${panel('dep-heat', '🌡️ الإدارات × معايير الزملاء', '', '', C.heatmap(heatRows, crit.map((c) => ({ label: `${c.icon} ${c.num}`, title: c.title }))))}`;
  }

  const TIPS = {
    m1q1: 'متابعة لوحة SLA يومياً وتنبيهات للتذاكر المتأخرة',
    m2q1: 'نموذج توثيق موحد للحلول ومراجعة دورية لقاعدة المعرفة',
    m3q1: 'خطة مناوبات وقت الذروة وتدريب على التعامل مع الضغط',
    m4q1: 'نظام «زميل داعم» وقت الكثافة وتوزيع عادل للتذاكر',
    m5q1: 'ورشة عن قيم الشركة والسلوك المهني',
    m6q1: 'جلسات تحليل جذور المشكلات المتكررة (Root cause)',
    m7q1: 'جلسة شهرية لتحديثات منصة مراسلاتي',
    m8q1: 'تدريب على إدارة التذاكر المتزامنة وأولوياتها'
  };

  function reportStrengths(model) {
    const blocks = ['peer', 'manager', 'hr'].map((src) => {
      const rows = A.data.criteria[src].map((c) => ({ c, v: mean(model.employees.map((e) => e.scores[src].byCriterion[c.id].avg)) })).filter((r) => r.v !== null).sort((a, b) => b.v - a.v);
      if (!rows.length) return `<div class="card panel"><h3>${esc(C.SERIES[src].label)}</h3><div class="empty">لا توجد بيانات بعد</div></div>`;
      const top = rows.slice(0, 3);
      const low = rows.slice(Math.max(top.length, rows.length - 3)).reverse();
      return `
        <div class="card panel">
          <div class="panel-head"><div><h3><span class="legend" style="display:inline-flex;margin:0"><span><i style="background:${C.SERIES[src].color}"></i></span></span>${esc(C.SERIES[src].label)}</h3></div></div>
          <div style="font-weight:800;color:var(--good-text);margin-bottom:6px">💪 نقاط القوة</div>
          <ul class="insights">${top.map((r) => `<li><span class="i">${r.c.icon}</span><span><b>${esc(r.c.shortTitle)}</b> — ${fmt(r.v)}</span></li>`).join('')}</ul>
          ${low.length ? `<div style="font-weight:800;color:var(--crit-text);margin:12px 0 6px">🎯 فرص التطوير</div>
          <ul class="insights">${low.map((r) => `<li><span class="i">${r.c.icon}</span><span><b>${esc(r.c.shortTitle)}</b> — ${fmt(r.v)}${TIPS[r.c.id] ? `<br><span class="muted">مقترح: ${esc(TIPS[r.c.id])}</span>` : ''}</span></li>`).join('')}</ul>` : ''}
        </div>`;
    }).join('');
    return `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">${blocks}</div>`;
  }

  function reportNextOne() {
    const n = A.data.nextOne;
    const total = n.yes + n.no;
    return `
      <div class="kpis">
        <div class="card kpi"><div class="label">أجابوا على الاستطلاع</div><div class="value">${total}</div><div class="sub">سؤال واحد لكل موظف (ضمن «قيّم نفسك»)</div></div>
        <div class="card kpi"><div class="label">جرّبوا نكست ون</div><div class="value">${M.pct(n.yes, total)}<small>%</small></div><div class="sub">${n.yes} موظف</div></div>
        <div class="card kpi"><div class="label">لم يجربوه بعد</div><div class="value">${M.pct(n.no, total)}<small>%</small></div><div class="sub">${n.no} موظف</div></div>
      </div>
      <div class="card panel"><div class="panel-head"><div><h3>💬 انطباعات من جرّبوه (بدون أسماء)</h3></div></div>
        ${n.feedbacks.length ? `<div class="comments">${n.feedbacks.map((f) => `<div class="comment">${esc(f)}</div>`).join('')}</div>` : '<div class="empty">لا توجد تعليقات</div>'}</div>`;
  }

  function reportCard(id, title, desc, html) {
    return `<section class="card panel"><div class="panel-head"><div><h3>${title}</h3>${desc ? `<p>${desc}</p>` : ''}</div>
      <div class="panel-controls">${panelCsv[id] ? `<button class="btn btn-ghost btn-sm" data-action="an-csv" data-id="${id}">⬇ CSV</button>` : ''}</div></div>${html}</section>`;
  }

  // ---- Report 3: one employee in depth
  function reportDetails(model) {
    const list = model.employees;
    if (!list.length) return '<div class="card empty">لا يوجد موظفون</div>';
    if (!A.detailEmp || !list.some((e) => String(e.id) === String(A.detailEmp))) A.detailEmp = String(list[0].id);
    const e = list.find((x) => String(x.id) === String(A.detailEmp));
    const chooser = `<div class="card filters"><label>👤 الموظف
      <select class="select" data-change="an-detail-emp">${list.map((x) => `<option value="${x.id}" ${String(x.id) === A.detailEmp ? 'selected' : ''}>${esc(x.name)} — ${esc(x.departmentLabel)}</option>`).join('')}</select></label></div>`;
    const totalRanked = model.all.filter((x) => x.final !== null).length;

    const hero = `
      <div class="card detail-hero">
        <div class="score-big"><b style="color:${e.final !== null ? '#4338ca' : 'var(--muted)'}">${fmt(e.final)}</b><small>الدرجة النهائية / 5</small><div style="margin-top:6px">${band(e.final)}</div></div>
        <div>
          <div class="person-cell" style="margin-bottom:10px">${M.avatar(e, 'avatar-lg')}<div><b style="font-size:1.15rem">${esc(e.name)}</b><small>${esc(e.departmentLabel)}</small></div></div>
          <div class="row" style="gap:8px">
            ${e.rank ? `<span class="chip">🏅 الترتيب ${e.rank} من ${totalRanked} في الشركة</span><span class="chip">🏢 ${e.deptRank} من ${e.deptSize} في الإدارة</span><span class="chip">📈 المئين ${e.percentile}%</span>` : '<span class="chip">لا توجد درجة نهائية بعد</span>'}
            ${e.missing.length ? `<span class="badge badge-warn">⏳ لم يكتمل: ${e.missing.map((k) => esc(C.SERIES[k].label)).join('، ')}</span>` : ''}
          </div>
        </div>
      </div>`;

    const sources = C.hbars(SOURCES.map((s) => ({ label: C.SERIES[s].label, sub: e.scores[s].raters ? `n=${e.scores[s].raters}` : '', value: e.scores[s].avg, color: C.SERIES[s].color })), { ref: model.companyAvg, refLabel: 'متوسط الشركة النهائي' });

    const critTables = SOURCES.map((s) => {
      const sc = e.scores[s];
      if (!sc.raters) return '';
      const rows = A.data.criteria[s].map((c) => {
        const companyVal = mean(model.all.map((x) => x.scores[s].byCriterion[c.id].avg));
        const v = sc.byCriterion[c.id].avg;
        return `<tr><td>${c.icon} ${esc(c.title)}</td><td class="num">${heatCell(v)}</td><td class="num">${fmt(companyVal)}</td>
          <td class="num" style="color:${v !== null && companyVal !== null && v - companyVal < 0 ? 'var(--crit-text)' : 'var(--good-text)'}">${v !== null && companyVal !== null ? (v - companyVal >= 0 ? '+' : '') + fmt(v - companyVal) : '—'}</td><td class="num">${sc.byCriterion[c.id].n}</td></tr>`;
      }).join('');
      return `<div class="card panel"><div class="panel-head"><div><h3><span class="legend" style="display:inline-flex;margin:0"><span><i style="background:${C.SERIES[s].color}"></i></span></span>${esc(C.SERIES[s].label)} — ${fmt(sc.avg)}</h3><p>${sc.raters} ${s === 'self' ? '' : 'مقيّم'}${sc.na ? ` · ${sc.na} «لا ينطبق»` : ''}</p></div></div>
        <div class="table-wrap"><table class="tbl"><tr><th>المعيار</th><th class="num">الدرجة</th><th class="num">متوسط الشركة</th><th class="num">الفرق</th><th class="num">إجابات</th></tr>${rows}</table></div></div>`;
    }).join('');

    const cm = e.comments;
    const list2 = (arr, empty) => arr && arr.length ? `<div class="comments">${arr.map((t) => `<div class="comment">${esc(t)}</div>`).join('')}</div>` : `<div class="muted">${empty}</div>`;
    const comments = `
      <div class="two-col">
        <div class="card panel"><h3>💪 نقاط القوة (من الزملاء — بدون أسماء)</h3><div style="margin-top:10px">${list2(cm.strengths, 'لا توجد تعليقات')}</div></div>
        <div class="card panel"><h3>🎯 فرص التطوير (من الزملاء — بدون أسماء)</h3><div style="margin-top:10px">${list2(cm.improvements, 'لا توجد تعليقات')}</div></div>
        <div class="card panel"><h3>👔 ملاحظات المدير</h3><div style="margin-top:10px">${list2(cm.managerNotes, 'لا توجد ملاحظات')}</div></div>
        <div class="card panel"><h3>📋 ملاحظات الموارد البشرية</h3><div style="margin-top:10px">${list2(cm.hrNotes, 'لا توجد ملاحظات')}</div></div>
      </div>
      <div class="card panel"><h3>🌟 مبادرة الموظف (من التقييم الذاتي)</h3><div style="margin-top:10px">${cm.selfInitiative ? `<div class="comment">${esc(cm.selfInitiative)}</div>` : '<div class="muted">لم يرسل التقييم الذاتي بعد</div>'}</div></div>`;

    return `${chooser}${hero}
      <div class="two-col">
        ${panel('det-sources', '🔀 الدرجة حسب مصدر التقييم', 'الخط الداكن = متوسط الشركة النهائي', '', sources)}
        ${panel('det-dist', '📶 توزيع درجات الزملاء', '', '', C.distribution(e.scores.peer.dist))}
      </div>
      ${critTables || '<div class="card empty">لا توجد تقييمات مرسلة لهذا الموظف بعد</div>'}
      ${comments}`;
  }

  // -------------------------------------------------------
  // 3) Participation
  // -------------------------------------------------------
  function participationPage() {
    const d = A.data;
    const rows = d.participation.filter((p) => (!A.dept || p.department === A.dept) && (!A.onlyIncomplete || p.done < p.required))
      .sort((a, b) => a.pct - b.pct);
    const cell = (it) => {
      if (!it) return '<span class="muted">—</span>';
      const cls = it.done >= it.required ? 'badge-good' : it.done > 0 ? 'badge-warn' : 'badge-crit';
      const icon = it.done >= it.required ? '✓' : it.done > 0 ? '✎' : '○';
      return `<span class="badge ${cls}">${icon} ${it.done} من ${it.required}</span>`;
    };
    const status = (p) => p.done >= p.required ? '<span class="badge badge-good">✓ مكتمل</span>' : p.done > 0 ? '<span class="badge badge-warn">✎ جارٍ</span>' : '<span class="badge badge-crit">○ لم يبدأ</span>';
    const typeKpi = (t, label) => {
      const req = d.totals.required[t];
      const done = d.totals.submitted[t];
      return `<div class="card kpi"><div class="label">${esc(label)}</div><div class="value">${M.pct(done, req)}<small>%</small></div><div class="sub">${done} من ${req}</div></div>`;
    };
    panelCsv.part = [['الموظف', 'الإدارة', 'الدور', 'الزملاء', 'المدير', 'الموارد البشرية', 'الذاتي', 'الإجمالي %'],
      ...rows.map((p) => [p.name, p.departmentLabel, (window.M360Permissions.ROLES[p.accessRole] || {}).label,
        ...['peer', 'manager', 'hr', 'self'].map((t) => (p.items[t] ? `${p.items[t].done} من ${p.items[t].required}` : '')), p.pct + '%'])];
    return `
      <div class="page-head"><h2>✅ متابعة المشاركة</h2><p class="muted">من أرسل كم تقييماً — بدون أي محتوى من الإجابات.</p></div>
      ${filtersBar(`<label class="check"><input type="checkbox" data-change="an-incomplete" ${A.onlyIncomplete ? 'checked' : ''}> غير المكتملين فقط</label>`)}
      <div class="kpis">${typeKpi('peer', 'تقييم الزملاء')}${typeKpi('manager', 'تقييم المديرين')}${typeKpi('hr', 'التقييم الإداري')}${typeKpi('self', 'التقييم الذاتي')}</div>
      ${reportCard('part', `👥 الموظفون (${rows.length})`, 'مرتّبون من الأقل إنجازاً.',
        `<div class="table-wrap"><table class="tbl"><tr><th>الموظف</th><th>الدور</th><th class="num">الزملاء</th><th class="num">المدير</th><th class="num">الموارد البشرية</th><th class="num">الذاتي</th><th class="num">الإجمالي</th><th>الحالة</th></tr>
        ${rows.map((p) => `<tr><td>${personCell(p)}</td><td>${M.roleBadge(p.accessRole)}</td>
          ${['peer', 'manager', 'hr', 'self'].map((t) => `<td class="num">${cell(p.items[t])}</td>`).join('')}
          <td class="num"><div class="progress ${p.pct === 100 ? 'good' : ''}" style="min-width:80px" title="${p.pct}%"><i style="width:${p.pct}%"></i></div><small class="muted">${p.pct}%</small></td>
          <td>${status(p)}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">لا يوجد</td></tr>'}</table></div>`)}`;
  }

  // -------------------------------------------------------
  // Events
  // -------------------------------------------------------
  M.on('change', 'an-ui', (el) => { A.ui[el.dataset.key] = el.value; draw(); });
  M.on('change', 'an-dept', (el) => { A.dept = el.value; A.ui.distEmp = ''; draw(); });
  M.on('change', 'an-cycle', async (el) => { pinnedCycle = el.value; if (await load(el.value)) draw(); });
  M.on('change', 'an-report', (el) => { A.report = el.value; history.replaceState(null, '', '#/admin/reports/' + el.value); draw(); });
  M.on('change', 'an-detail-emp', (el) => { A.detailEmp = el.value; draw(); });
  M.on('change', 'an-incomplete', (el) => { A.onlyIncomplete = el.checked; draw(); });
  M.on('change', 'an-weight', (el) => {
    const v = Math.max(0, Math.min(100, Number(el.value) || 0));
    A.weights[el.dataset.key] = v;
    localStorage.setItem(WEIGHT_KEY, JSON.stringify(A.weights));
    draw();
  });
  M.on('click', 'an-weights-reset', () => {
    A.weights = Object.assign({}, DEFAULT_WEIGHTS);
    localStorage.removeItem(WEIGHT_KEY);
    draw();
  });
  M.on('click', 'an-view', (el) => { A.ui.views[el.dataset.id] = el.dataset.v; draw(); });
  M.on('click', 'an-csv', (el) => {
    const rows = panelCsv[el.dataset.id];
    if (rows) M.downloadCsv(`m360-${el.dataset.id}-${A.cycleId}.csv`, rows);
  });
  M.on('click', 'an-detail', (el) => {
    A.detailEmp = String(el.dataset.id);
    A.report = 'details';
    M.go('#/admin/reports/details');
  });

  // Called when cycles change so the next visit shows the new active cycle.
  function reset() { A.data = null; pinnedCycle = null; loadedAt = 0; }

  M.Analytics = { render, reset };
})();
