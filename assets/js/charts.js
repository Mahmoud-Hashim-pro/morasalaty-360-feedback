// =========================================================
// Lightweight HTML charts (RTL), following the dataviz rules:
// thin bars (<=24px) with 4px rounded data-end, hairline grid,
// fixed series colors per entity, value labels in ink colors,
// hover tooltips, and every chart has a table view.
// =========================================================
(function () {
  'use strict';
  const M = window.M360;
  const esc = M.esc;

  const SERIES = {
    peer: { label: 'الزملاء', color: '#2a78d6' },
    manager: { label: 'المدير', color: '#eb6834' },
    hr: { label: 'الموارد البشرية', color: '#1baf7a' },
    self: { label: 'التقييم الذاتي', color: '#eda100' },
    final: { label: 'الدرجة النهائية', color: '#4338ca' }
  };

  // Diverging scale around 3 ("meets expectations"): red (low) — gray — blue (high)
  const LOW = [227, 73, 72];   // #e34948
  const MID = [240, 239, 236]; // #f0efec
  const HIGH = [42, 120, 214]; // #2a78d6
  function mix(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
  function scoreColor(score) {
    if (score === null || score === undefined || isNaN(score)) return null;
    const s = Math.max(1, Math.min(5, score));
    const rgb = s < 3 ? mix(MID, LOW, (3 - s) / 2) : mix(MID, HIGH, (s - 3) / 2);
    return `rgb(${rgb.join(',')})`;
  }
  function inkOn(score) {
    // white text on saturated ends, dark text near the gray midpoint
    return Math.abs((score || 3) - 3) > 1.1 ? '#ffffff' : '#0b0b0b';
  }

  const tip = (html) => `data-tip="${esc(html)}"`;

  function ticks(max) {
    let out = '';
    for (let i = 0; i <= max; i++) out += `<span>${i}</span>`;
    return `<div class="axis-row" aria-hidden="true"><span></span><div class="ticks">${out}</div><span></span></div>`;
  }

  /**
   * Horizontal bars. items: [{ label, sub, value, tipHtml }]
   * opts: { max, color, ref, refLabel, empty }
   */
  function hbars(items, opts) {
    const o = Object.assign({ max: 5, color: SERIES.final.color, ref: null, refLabel: '' }, opts);
    if (!items.length) return `<div class="empty">${esc(o.empty || 'لا توجد بيانات بعد')}</div>`;
    const refPos = o.ref !== null && o.ref !== undefined ? (o.ref / o.max) * 100 : null;
    const rows = items.map((it) => {
      const has = it.value !== null && it.value !== undefined && !isNaN(it.value);
      const w = has ? Math.max(0.5, (it.value / o.max) * 100) : 0;
      const t = it.tipHtml || `<b>${esc(it.label)}</b><br>${has ? M.fmt(it.value) : 'لا توجد بيانات'}`;
      return `
        <div class="hbar" ${tip(t)}>
          <div class="lbl" title="${esc(it.label)}">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div>
          <div class="track">
            ${has ? `<span class="fill" style="width:${w}%;background:${it.color || o.color}"></span>` : ''}
            ${refPos !== null ? `<span class="ref" style="right:${refPos}%"></span>` : ''}
          </div>
          <div class="val">${has ? M.fmt(it.value) : '—'}</div>
        </div>`;
    }).join('');
    const ref = refPos !== null ? `<div class="legend"><span><i style="background:#0f172a;width:2px;height:12px;opacity:.55"></i>${esc(o.refLabel)}: ${M.fmt(o.ref)}</span></div>` : '';
    return `${ref}<div class="hbars">${rows}</div>${ticks(o.max)}`;
  }

  /** Grouped horizontal bars: items [{ label, sub, values: { peer: 4.1, ... } }], keys: ['peer','manager',...] */
  function groupedHbars(items, keys, opts) {
    const o = Object.assign({ max: 5 }, opts);
    if (!items.length) return `<div class="empty">${esc(o.empty || 'لا توجد بيانات بعد')}</div>`;
    const legend = `<div class="legend">${keys.map((k) => `<span><i style="background:${SERIES[k].color}"></i>${esc(SERIES[k].label)}</span>`).join('')}</div>`;
    const rows = items.map((it) => {
      const parts = keys.map((k) => {
        const v = it.values[k];
        const has = v !== null && v !== undefined && !isNaN(v);
        return `<i style="width:${has ? Math.max(0.5, (v / o.max) * 100) : 0}%;background:${SERIES[k].color}"></i>`;
      }).join('');
      const t = `<b>${esc(it.label)}</b><br>` + keys.map((k) => `${esc(SERIES[k].label)}: ${M.fmt(it.values[k])}`).join('<br>');
      const main = it.values[keys[0]];
      return `
        <div class="hbar" ${tip(t)}>
          <div class="lbl" title="${esc(it.label)}">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div>
          <div class="track"><span class="group">${parts}</span></div>
          <div class="val">${M.fmt(main)}</div>
        </div>`;
    }).join('');
    return `${legend}<div class="hbars grouped">${rows}</div>${ticks(o.max)}`;
  }

  /** Distribution of ratings 1..5 as columns, colored on the diverging scale. */
  function distribution(counts) {
    const total = counts.reduce((a, b) => a + b, 0);
    if (!total) return '<div class="empty">لا توجد تقييمات بعد</div>';
    const max = Math.max(...counts);
    const labels = window.M360Questions.SCALE;
    const cols = counts.map((c, i) => {
      const h = max ? (c / max) * 100 : 0;
      const pct = M.pct(c, total);
      return `<div class="col" ${tip(`<b>${i + 1} — ${esc(labels[i].label)}</b><br>${c} إجابة (${pct}%)`)}>
          <b>${pct}%</b><i style="height:${h}%;background:${scoreColor(i + 1) || '#ccc'}"></i></div>`;
    }).join('');
    return `<div class="cols">${cols}</div>
      <div class="col-labels">${labels.map((l) => `<span>${l.value}<br>${esc(l.label)}</span>`).join('')}</div>`;
  }

  /** Heatmap table. rows: [{ label, sub, cells: [score|null] }], cols: [{ label, title }] */
  function heatmap(rows, cols) {
    if (!rows.length) return '<div class="empty">لا توجد بيانات بعد</div>';
    const head = `<tr><th></th>${cols.map((c) => `<th title="${esc(c.title || c.label)}">${esc(c.label)}</th>`).join('')}</tr>`;
    const body = rows.map((r) => `<tr><th class="rowh">${esc(r.label)}</th>${r.cells.map((v, i) => {
      if (v === null || v === undefined || isNaN(v)) return `<td class="none" ${tip(`<b>${esc(r.label)}</b><br>${esc(cols[i].title || cols[i].label)}: لا توجد بيانات`)}>—</td>`;
      return `<td style="background:${scoreColor(v)};color:${inkOn(v)}" ${tip(`<b>${esc(r.label)}</b><br>${esc(cols[i].title || cols[i].label)}: ${M.fmt(v)}`)}>${M.fmt(v, 1)}</td>`;
    }).join('')}</tr>`).join('');
    return `<div class="table-wrap"><table class="heat">${head}${body}</table></div>
      <div class="scale-key"><span>1 ضعيف</span><span class="bar"></span><span>5 متميز</span><span>· 3 = يلبي التوقعات</span></div>`;
  }

  /** Diverging bars around zero (e.g. self minus others). items: [{ label, sub, value }] */
  function gapBars(items, opts) {
    const o = Object.assign({ range: 2, pos: 'أعلى من تقييم الآخرين', neg: 'أقل من تقييم الآخرين' }, opts);
    if (!items.length) return `<div class="empty">${esc(o.empty || 'لا توجد بيانات كافية')}</div>`;
    const rows = items.map((it) => {
      const v = Math.max(-o.range, Math.min(o.range, it.value));
      const w = (Math.abs(v) / o.range) * 50;
      // RTL: positive grows to the left of the center line, negative to the right
      const style = v >= 0 ? `left:${50 - w}%;width:${w}%;background:#e34948;border-radius:4px 0 0 4px` : `right:${50 - w}%;width:${w}%;background:#2a78d6;border-radius:0 4px 4px 0`;
      return `<div class="gap-row" ${tip(`<b>${esc(it.label)}</b><br>${esc(it.tipText || '')}`)}>
          <div class="lbl" style="font-size:.84rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.label)}</div>
          <div class="gap-track"><i style="${style}"></i></div>
          <div class="val num" style="font-weight:800;font-size:.84rem;text-align:left">${it.value > 0 ? '+' : ''}${M.fmt(it.value)}</div>
        </div>`;
    }).join('');
    return `<div class="legend"><span><i style="background:#e34948"></i>${esc(o.pos)}</span><span><i style="background:#2a78d6"></i>${esc(o.neg)}</span></div><div class="gaps">${rows}</div>`;
  }

  /** Simple data table. columns: [{ key, label, num, fmt }] */
  function table(rows, columns) {
    if (!rows.length) return '<div class="empty">لا توجد بيانات</div>';
    const head = columns.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('');
    const body = rows.map((r) => `<tr>${columns.map((c) => {
      const v = r[c.key];
      const out = c.html ? c.html(r) : esc(c.fmt ? c.fmt(v, r) : (v === null || v === undefined ? '—' : v));
      return `<td class="${c.num ? 'num' : ''}">${out}</td>`;
    }).join('')}</tr>`).join('');
    return `<div class="table-wrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  window.M360Charts = { SERIES, scoreColor, inkOn, hbars, groupedHbars, distribution, heatmap, gapBars, table, tip };
})();
