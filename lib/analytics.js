// =========================================================
// Results aggregation (admin only). Pure functions — no database.
// Output never contains who wrote a peer evaluation: only counts,
// averages, distributions and shuffled anonymous comments.
// =========================================================
const crypto = require('crypto');
const P = require('./permissions');
const Q = require('./questions');

const SOURCES = ['peer', 'manager', 'hr', 'self'];

function toScore(v) {
  if (typeof v === 'number') return v >= 1 && v <= 5 ? v : null;
  if (typeof v === 'string' && /^\s*[1-5](\.0+)?\s*$/.test(v)) return Number(v);
  return null;
}

function round2(n) {
  return n === null || n === undefined || isNaN(n) ? null : Math.round(n * 100) / 100;
}

function newAgg() {
  return { raters: 0, sums: {}, counts: {}, dist: [0, 0, 0, 0, 0], na: 0 };
}

function addAnswers(agg, set, answers) {
  let any = false;
  set.questions.forEach((q) => {
    const raw = answers[q.id];
    if (raw === undefined || raw === null || raw === '') return;
    const s = toScore(raw);
    if (s === null) { agg.na++; return; }
    agg.sums[q.id] = (agg.sums[q.id] || 0) + s;
    agg.counts[q.id] = (agg.counts[q.id] || 0) + 1;
    agg.dist[Math.min(5, Math.max(1, Math.round(s))) - 1]++;
    any = true;
  });
  if (any) agg.raters++;
  return any;
}

function finalizeAgg(agg, set) {
  const byCriterion = {};
  const avgs = [];
  set.questions.forEach((q) => {
    const n = agg.counts[q.id] || 0;
    const avg = n ? agg.sums[q.id] / n : null;
    byCriterion[q.id] = { avg: round2(avg), n };
    if (avg !== null) avgs.push(avg);
  });
  return {
    raters: agg.raters,
    avg: avgs.length ? round2(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null,
    byCriterion,
    dist: agg.dist,
    na: agg.na
  };
}

// Peer answers are stored as { m1: { m1q1: 4 }, ... } — flatten to { m1q1: 4 }.
function flattenPeerAnswers(moduleAnswers) {
  const out = {};
  const ma = moduleAnswers && typeof moduleAnswers === 'object' ? moduleAnswers : {};
  Q.getSet('peer').questions.forEach((q) => {
    const mod = ma[q.criterion];
    if (!mod || typeof mod !== 'object') return;
    if (mod[q.id] !== undefined) out[q.id] = mod[q.id];
    else if (mod.q1 !== undefined) out[q.id] = mod.q1;
  });
  return out;
}

function hasPeerContent(moduleAnswers) {
  return Object.keys(flattenPeerAnswers(moduleAnswers)).length > 0;
}

function peerTexts(textAnswers) {
  const t = textAnswers && typeof textAnswers === 'object' ? textAnswers : {};
  return {
    strength: String(t.strength || t.m10q14 || '').trim(),
    improvement: String(t.improvement || t.m10q15 || '').trim()
  };
}

// Deterministic shuffle so comment order reveals nothing about who wrote them.
function anonymize(list) {
  return list
    .filter((s) => s && s.length > 2)
    .map((s) => ({ s, k: crypto.createHash('sha256').update(s).digest('hex') }))
    .sort((a, b) => (a.k < b.k ? -1 : 1))
    .map((x) => x.s);
}

/**
 * @param {object} input
 *   users:     [{ id, name, department, accessRole, isActive }]
 *   peerRows:  rows of m360_evaluations for the cycle
 *   reviews:   rows of m360_reviews for the cycle
 */
function buildAnalytics({ users, peerRows, reviews }) {
  const participants = users.filter(P.isParticipant);
  const byId = new Map(users.map((u) => [Number(u.id), u]));
  const sets = { peer: Q.getSet('peer'), manager: Q.getSet('manager'), hr: Q.getSet('hr'), self: Q.getSet('self') };

  const state = new Map();
  participants.forEach((u) => {
    state.set(Number(u.id), {
      agg: { peer: newAgg(), manager: newAgg(), hr: newAgg(), self: newAgg() },
      strengths: [], improvements: [], managerNotes: [], hrNotes: [], selfInitiative: null
    });
  });

  const submittedBy = new Map(); // evaluatorId -> { type: count }
  const countSubmitted = (evaluatorId, type) => {
    const m = submittedBy.get(evaluatorId) || {};
    m[type] = (m[type] || 0) + 1;
    submittedBy.set(evaluatorId, m);
  };

  // ---- Peer (360°)
  const nextOneByUser = new Map();
  (peerRows || []).forEach((row) => {
    const evaluator = byId.get(Number(row.evaluator_id));
    const target = byId.get(Number(row.evaluatee_id));
    const legacyNt = row.next_one_tried || row.next_ticket_tried;
    if (evaluator && (legacyNt === 'yes' || legacyNt === 'no')) {
      const prev = nextOneByUser.get(evaluator.id);
      const ts = new Date(row.updated_at || 0).getTime();
      if (!prev || prev.ts < ts) {
        nextOneByUser.set(evaluator.id, { value: legacyNt, feedback: row.next_one_feedback || row.next_ticket_feedback || '', ts });
      }
    }
    if (row.status !== 'completed' || !hasPeerContent(row.module_answers)) return;
    // Count evaluations of people who left later, but never ones written by admin accounts
    // (the previous version allowed that) or about someone who is no longer a participant.
    if (!evaluator || !target || evaluator.accessRole === 'admin' || Number(evaluator.id) === Number(target.id) || !P.isParticipant(target)) return;
    const st = state.get(Number(target.id));
    if (!st) return;
    if (addAnswers(st.agg.peer, sets.peer, flattenPeerAnswers(row.module_answers))) {
      countSubmitted(Number(evaluator.id), 'peer');
      const t = peerTexts(row.text_answers);
      if (t.strength) st.strengths.push(t.strength);
      if (t.improvement) st.improvements.push(t.improvement);
    }
  });

  // ---- Manager / HR / Self
  (reviews || []).forEach((r) => {
    if (r.status !== 'submitted') return;
    const type = r.review_type;
    if (!sets[type]) return;
    const evaluator = byId.get(Number(r.evaluator_id));
    const target = byId.get(Number(r.evaluatee_id));
    if (!evaluator || !target) return;
    // Rows imported from the previous version were not permission-checked when written.
    if (r.source === 'legacy' && !P.canEvaluate(evaluator, target, type).allowed) return;
    const st = state.get(Number(target.id));
    if (!st) return;
    const answers = r.answers && typeof r.answers === 'object' ? r.answers : {};
    const texts = r.texts && typeof r.texts === 'object' ? r.texts : {};
    addAnswers(st.agg[type], sets[type], answers);
    countSubmitted(Number(evaluator.id), type);
    if (type === 'manager' && texts.notes) st.managerNotes.push(String(texts.notes));
    if (type === 'hr' && texts.notes) st.hrNotes.push(String(texts.notes));
    if (type === 'self') {
      if (texts.initiative) st.selfInitiative = String(texts.initiative);
      const extra = r.extra && typeof r.extra === 'object' ? r.extra : {};
      if (extra.nextOne === 'yes' || extra.nextOne === 'no') {
        nextOneByUser.set(evaluator.id, { value: extra.nextOne, feedback: extra.nextOneFeedback || '', ts: Infinity });
      }
    }
  });

  // ---- Per employee
  const employees = participants.map((u) => {
    const st = state.get(Number(u.id));
    const out = {
      id: u.id,
      name: u.name,
      department: u.department || '',
      departmentLabel: Q.departmentLabel(u.department),
      accessRole: u.accessRole,
      scores: {},
      comments: {
        strengths: anonymize(st.strengths),
        improvements: anonymize(st.improvements),
        managerNotes: st.managerNotes,
        hrNotes: st.hrNotes,
        selfInitiative: st.selfInitiative
      },
      expected: {
        peer: P.evaluatorsOf(u, participants, 'peer').length,
        manager: P.evaluatorsOf(u, participants, 'manager').length,
        hr: P.evaluatorsOf(u, participants, 'hr').length
      }
    };
    SOURCES.forEach((s) => { out.scores[s] = finalizeAgg(st.agg[s], sets[s]); });
    return out;
  });

  // ---- Participation (counts only — never the content)
  const participation = participants.map((u) => {
    const done = submittedBy.get(Number(u.id)) || {};
    const row = { id: u.id, name: u.name, department: u.department || '', departmentLabel: Q.departmentLabel(u.department), accessRole: u.accessRole, items: {} };
    P.menusFor(u).forEach((type) => {
      const required = P.targetsFor(u, participants, type).length;
      row.items[type] = { done: Math.min(done[type] || 0, required), required };
    });
    const totals = Object.values(row.items).reduce((acc, it) => ({ done: acc.done + it.done, required: acc.required + it.required }), { done: 0, required: 0 });
    row.done = totals.done;
    row.required = totals.required;
    row.pct = totals.required ? Math.round((totals.done / totals.required) * 100) : 0;
    return row;
  });

  // ---- Next One survey (one answer per person)
  const nextOne = { yes: 0, no: 0, feedbacks: [] };
  nextOneByUser.forEach((v) => {
    if (v.value === 'yes') { nextOne.yes++; if (v.feedback && String(v.feedback).trim()) nextOne.feedbacks.push(String(v.feedback).trim()); }
    if (v.value === 'no') nextOne.no++;
  });
  nextOne.feedbacks = anonymize(nextOne.feedbacks);

  const criteria = {};
  SOURCES.forEach((s) => {
    criteria[s] = sets[s].questions.map((q) => ({ id: q.id, num: q.num, title: q.title, shortTitle: q.shortTitle, icon: q.icon }));
  });

  const departments = Array.from(new Set(participants.map((u) => u.department || '').filter(Boolean)))
    .sort()
    .map((code) => ({ code, label: Q.departmentLabel(code) }));

  const totals = { participants: participants.length, submitted: {}, required: {} };
  ['peer', 'manager', 'hr', 'self'].forEach((t) => {
    totals.submitted[t] = participation.reduce((a, p) => a + (p.items[t] ? p.items[t].done : 0), 0);
    totals.required[t] = participation.reduce((a, p) => a + (p.items[t] ? p.items[t].required : 0), 0);
  });

  return { employees, participation, nextOne, criteria, departments, totals };
}

module.exports = {
  buildAnalytics,
  flattenPeerAnswers,
  hasPeerContent,
  peerTexts,
  toScore
};
