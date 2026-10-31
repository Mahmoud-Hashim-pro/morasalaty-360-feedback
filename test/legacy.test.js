// Data written by the previous version must survive the upgrade.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp, seedOrg, fullAnswers } = require('./helpers');
const { ensureSchema } = require('../lib/schema');

let app;
const J = (o) => JSON.stringify(o);

test.before(async () => {
  app = await startApp();
  await seedOrg(app.sql);
  const sql = app.sql;
  const mgrAnswers = { mgr_sla: 4, mgr_crisis: 5, mgr_documentation: 3, mgr_teamwork: 4 };
  // Real manager evaluation (manager of TS -> TS employee), stored the old way
  await sql`INSERT INTO m360_evaluations (cycle_id, evaluator_id, evaluatee_id, status, module_answers, manager_answers)
    VALUES ('2026-Q1', 1, 2, 'completed', '{}'::jsonb, ${J({ manager: { answers: mgrAnswers, notes: 'ملاحظة قديمة', isFinal: true } })}::jsonb)`;
  // "Manager" evaluation written by a plain employee (the old API allowed it)
  await sql`INSERT INTO m360_evaluations (cycle_id, evaluator_id, evaluatee_id, status, module_answers, manager_answers)
    VALUES ('2026-Q1', 3, 2, 'completed', '{}'::jsonb, ${J({ manager: { answers: { mgr_sla: 1, mgr_crisis: 1, mgr_documentation: 1, mgr_teamwork: 1 }, isFinal: true } })}::jsonb)`;
  // HR draft
  await sql`INSERT INTO m360_evaluations (cycle_id, evaluator_id, evaluatee_id, status, module_answers, manager_answers)
    VALUES ('2026-Q1', 7, 6, 'in_progress', '{}'::jsonb, ${J({ fatima: { answers: { hr_culture: 5 }, isFinal: false } })}::jsonb)`;
  // Self evaluation stored in users.channels
  await sql`UPDATE m360_users SET channels = ${J({ instagram: true, self_eval: { answers: { self_time_pressure: 4, self_continuous_learning: 3, self_proactivity: 5 }, initiativeText: 'مبادرة قديمة', isFinal: true } })}::jsonb WHERE id = 6`;
  // Normal legacy peer evaluation + Next One answer
  const peer = {};
  for (let m = 1; m <= 8; m++) peer['m' + m] = { ['m' + m + 'q1']: 4 };
  await sql`INSERT INTO m360_evaluations (cycle_id, evaluator_id, evaluatee_id, status, module_answers, text_answers, next_one_tried)
    VALUES ('2026-Q1', 6, 2, 'completed', ${J(peer)}::jsonb, ${J({ m10q14: 'قوة قديمة' })}::jsonb, 'yes')`;
  // Peer evaluation written by an admin account through the old "preview" mode
  await sql`INSERT INTO m360_evaluations (cycle_id, evaluator_id, evaluatee_id, status, module_answers)
    VALUES ('2026-Q1', 100, 2, 'completed', ${J(peer)}::jsonb)`;
  await ensureSchema(sql); // what every cold start does
});
test.after(async () => { await app.close(); });

test('legacy manager / HR / self evaluations are copied into m360_reviews', async () => {
  const rows = await app.sql`SELECT review_type, evaluator_id, evaluatee_id, status, source, texts FROM m360_reviews ORDER BY review_type, evaluator_id`;
  const key = (r) => `${r.review_type}:${r.evaluator_id}->${r.evaluatee_id}:${r.status}:${r.source}`;
  assert.deepEqual(rows.map(key), [
    'hr:7->6:in_progress:legacy',
    'manager:1->2:submitted:legacy',
    'manager:3->2:submitted:legacy',
    'self:6->6:submitted:legacy'
  ]);
  assert.equal(rows.find((r) => r.review_type === 'self').texts.initiative, 'مبادرة قديمة');
});

test('analytics keeps legitimate legacy data and drops what the old version wrongly allowed', async () => {
  const admin = await app.login('admin@x.test');
  const r = (await app.api('GET', '/admin/analytics', undefined, admin)).data;
  const e2 = r.employees.find((e) => e.id === 2);
  assert.equal(e2.scores.manager.raters, 1, 'only the real manager counts');
  assert.equal(e2.scores.manager.avg, 4);
  assert.deepEqual(e2.comments.managerNotes, ['ملاحظة قديمة']);
  assert.equal(e2.scores.peer.raters, 1, 'admin-written peer row ignored, empty container rows ignored');
  assert.deepEqual(e2.comments.strengths, ['قوة قديمة']);
  const e6 = r.employees.find((e) => e.id === 6);
  assert.equal(e6.scores.self.avg, 4);
  assert.equal(e6.comments.selfInitiative, 'مبادرة قديمة');
  assert.equal(e6.scores.hr.raters, 0, 'HR draft is not a result');
  assert.equal(r.nextOne.yes, 1);
});

test('an old manager-evaluation row does not block the real peer evaluation', async () => {
  const mgr = await app.login('mgr.ts@x.test');
  const menus = (await app.api('GET', '/my/tasks', undefined, mgr)).data.menus;
  const peer = menus.find((m) => m.type === 'peer');
  const manager = menus.find((m) => m.type === 'manager');
  assert.ok(peer.pending.some((p) => p.id === 2), 'peer evaluation of 2 is still to do');
  assert.ok(!manager.pending.some((p) => p.id === 2), 'manager evaluation of 2 already submitted');
  const sub = await app.api('POST', '/my/review/submit', { type: 'peer', targetId: 2, ...fullAnswers('peer', 5) }, mgr);
  assert.equal(sub.status, 200);
  const row = (await app.sql`SELECT manager_answers, module_answers FROM m360_evaluations WHERE evaluator_id = 1 AND evaluatee_id = 2`)[0];
  assert.ok(row.manager_answers.manager, 'legacy data in the row is preserved');
  assert.equal(row.module_answers.m1.m1q1, 5);
});

test('sync never overwrites a review edited in the new app', async () => {
  const hr = await app.login('hr@x.test');
  assert.equal((await app.api('PUT', '/my/review', { type: 'hr', targetId: 6, answers: { hr_culture: 2 } }, hr)).status, 200);
  await ensureSchema(app.sql);
  const row = (await app.sql`SELECT answers, source FROM m360_reviews WHERE review_type = 'hr' AND evaluator_id = 7`)[0];
  assert.equal(row.source, 'app');
  assert.equal(row.answers.hr_culture, 2);
});

test('the users table keeps legacy columns untouched', async () => {
  const u = (await app.sql`SELECT channels FROM m360_users WHERE id = 6`)[0];
  assert.equal(u.channels.instagram, true);
});
