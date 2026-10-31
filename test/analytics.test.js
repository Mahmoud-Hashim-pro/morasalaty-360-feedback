const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnalytics, toScore } = require('../lib/analytics');
const { ORG } = require('./helpers');

const users = ORG.map((u) => ({ ...u, isActive: u.isActive !== false }));
const peer = (from, to, v, texts) => {
  const ma = {};
  for (let m = 1; m <= 8; m++) ma['m' + m] = { ['m' + m + 'q1']: typeof v === 'function' ? v(m) : v };
  return { evaluator_id: from, evaluatee_id: to, status: 'completed', module_answers: ma, text_answers: texts || {} };
};

test('score parsing accepts 1..5 only', () => {
  assert.equal(toScore(4), 4);
  assert.equal(toScore('5'), 5);
  assert.equal(toScore('N/A'), null);
  assert.equal(toScore(0), null);
  assert.equal(toScore(6), null);
  assert.equal(toScore('na'), null);
});

test('peer average = mean of criterion averages; N/A excluded; drafts ignored', () => {
  const rows = [
    peer(2, 3, 5),
    peer(6, 3, (m) => (m === 1 ? 'N/A' : 3)),
    { ...peer(7, 3, 1), status: 'in_progress' }
  ];
  const r = buildAnalytics({ users, peerRows: rows, reviews: [] });
  const e = r.employees.find((x) => x.id === 3);
  assert.equal(e.scores.peer.raters, 2);
  assert.equal(e.scores.peer.byCriterion.m1q1.avg, 5);
  assert.equal(e.scores.peer.byCriterion.m1q1.n, 1);
  assert.equal(e.scores.peer.byCriterion.m2q1.avg, 4);
  assert.equal(e.scores.peer.avg, 4.13); // (5 + 4*7) / 8 = 4.125
  assert.equal(e.scores.peer.na, 1);
  assert.deepEqual(e.scores.peer.dist, [0, 0, 7, 0, 8]);
});

test('participation counts only, with required numbers from the permission rules', () => {
  const r = buildAnalytics({
    users,
    peerRows: [peer(2, 3, 4)],
    reviews: [{ review_type: 'manager', evaluator_id: 1, evaluatee_id: 2, status: 'submitted', answers: { mgr_sla: 4 }, texts: {}, source: 'app' }]
  });
  const mgr = r.participation.find((p) => p.id === 1);
  assert.deepEqual(mgr.items.manager, { done: 1, required: 2 });
  assert.deepEqual(mgr.items.peer, { done: 0, required: 7 });
  assert.equal(r.totals.participants, 8);
  assert.equal(r.employees.find((e) => e.id === 2).expected.manager, 2, 'two TS managers are expected to evaluate employee 2');
});

test('comments are shuffled deterministically (order does not follow submission order)', () => {
  const rows = [peer(2, 3, 4, { strength: 'ج تعليق' }), peer(6, 3, 4, { strength: 'أ تعليق' }), peer(8, 3, 4, { strength: 'ب تعليق' })];
  const a = buildAnalytics({ users, peerRows: rows, reviews: [] }).employees.find((x) => x.id === 3).comments.strengths;
  const b = buildAnalytics({ users, peerRows: rows.slice().reverse(), reviews: [] }).employees.find((x) => x.id === 3).comments.strengths;
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
});
