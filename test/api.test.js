// End-to-end API tests on an in-memory database.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { startApp, seedOrg, addUser, fullAnswers, PASSWORD } = require('./helpers');

let app;
const tokens = {};

test.before(async () => {
  app = await startApp();
  await seedOrg(app.sql);
  for (const [k, email] of Object.entries({ mgr: 'mgr.ts@x.test', e1: 'e1@x.test', e2: 'e2@x.test', mgr2: 'mgr2.ts@x.test', mgrSales: 'mgr.sales@x.test', s1: 's1@x.test', hr: 'hr@x.test', a1: 'a1@x.test', admin: 'admin@x.test' })) {
    tokens[k] = await app.login(email);
  }
});
test.after(async () => { await app.close(); });

const call = (...a) => app.api(...a);

test('health works without login', async () => {
  const r = await call('GET', '/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
});

test('login: wrong password, unknown user and inactive user are rejected with the same message', async () => {
  const a = await call('POST', '/auth/login', { email: 'e1@x.test', password: 'wrong-password' });
  const b = await call('POST', '/auth/login', { email: 'nobody@x.test', password: 'wrong-password' });
  const c = await call('POST', '/auth/login', { email: 'off@x.test', password: PASSWORD });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(c.status, 401);
  assert.equal(a.data.error, b.data.error);
  assert.equal(a.data.token, undefined);
});

test('login: the old shared passwords no longer work (legacy SHA-256 hashes are refused)', async () => {
  const legacy = crypto.createHash('sha256').update('mora123').digest('hex');
  await addUser(app.sql, { id: 50, name: 'قديم', email: 'legacy@x.test', department: 'TS', accessRole: 'employee', passwordHash: legacy });
  for (const p of ['mora123', '123456', 'admin123', 'hradmin2024']) {
    const r = await call('POST', '/auth/login', { email: 'legacy@x.test', password: p });
    assert.equal(r.status, 401, p);
  }
  await app.sql`DELETE FROM m360_users WHERE id = 50`;
});

test('login: brute force is blocked after 8 failures', async () => {
  for (let i = 0; i < 8; i++) await call('POST', '/auth/login', { email: 'a1@x.test', password: 'bad-' + i });
  const r = await call('POST', '/auth/login', { email: 'a1@x.test', password: PASSWORD });
  assert.equal(r.status, 429);
  await app.sql`DELETE FROM m360_login_attempts WHERE email = 'a1@x.test'`;
});

test('login: one-time admin bootstrap from environment', async () => {
  const legacy = crypto.createHash('sha256').update('x').digest('hex');
  await addUser(app.sql, { id: 101, name: 'أدمن قديم', email: 'boot@x.test', accessRole: 'admin', passwordHash: legacy });
  process.env.ADMIN_BOOTSTRAP_EMAIL = 'boot@x.test';
  process.env.ADMIN_BOOTSTRAP_PASSWORD = 'short';
  assert.equal((await call('POST', '/auth/login', { email: 'boot@x.test', password: 'short' })).status, 401, 'too short to be accepted');
  process.env.ADMIN_BOOTSTRAP_PASSWORD = 'a-long-bootstrap-secret';
  const ok = await call('POST', '/auth/login', { email: 'boot@x.test', password: 'a-long-bootstrap-secret' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.accessRole, 'admin');
  // From now on it is a normal password; the bootstrap path is closed.
  process.env.ADMIN_BOOTSTRAP_PASSWORD = 'another-long-secret!!';
  assert.equal((await call('POST', '/auth/login', { email: 'boot@x.test', password: 'another-long-secret!!' })).status, 401);
  assert.equal((await call('POST', '/auth/login', { email: 'boot@x.test', password: 'a-long-bootstrap-secret' })).status, 200);
  delete process.env.ADMIN_BOOTSTRAP_EMAIL;
  delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
  await app.sql`DELETE FROM m360_sessions WHERE user_id = 101`;
  await app.sql`DELETE FROM m360_users WHERE id = 101`;
});

test('me: menus follow the role', async () => {
  const m = async (t) => (await call('GET', '/auth/me', undefined, t)).data.user.menus;
  assert.deepEqual(await m(tokens.e1), ['peer', 'self']);
  assert.deepEqual(await m(tokens.mgr), ['peer', 'manager', 'self']);
  assert.deepEqual(await m(tokens.hr), ['peer', 'hr', 'self']);
  assert.deepEqual(await m(tokens.admin), []);
  assert.equal((await call('GET', '/auth/me')).status, 401);
  assert.equal((await call('GET', '/auth/me', undefined, 'not-a-token')).status, 401);
});

test('tasks: each role gets exactly its people', async () => {
  const menus = async (t) => Object.fromEntries((await call('GET', '/my/tasks', undefined, t)).data.menus.map((x) => [x.type, x]));
  const e1 = await menus(tokens.e1);
  assert.deepEqual(Object.keys(e1), ['peer', 'self']);
  assert.equal(e1.peer.total, 7);
  assert.ok(!e1.peer.pending.some((p) => p.id === 2 || p.id === 9 || p.id === 100));
  assert.deepEqual(e1.self.pending.map((p) => p.id), [2]);

  const mgr = await menus(tokens.mgr);
  assert.deepEqual(mgr.manager.pending.map((p) => p.id).sort(), [2, 3]);
  const sales = await menus(tokens.mgrSales);
  assert.deepEqual(sales.manager.pending.map((p) => p.id), [6]);
  const hr = await menus(tokens.hr);
  assert.equal(hr.hr.total, 7);
  assert.ok(!hr.hr.pending.some((p) => p.id === 7));
  // Pending items expose only id, name and department
  assert.deepEqual(Object.keys(e1.peer.pending[0]).sort(), ['department', 'departmentLabel', 'id', 'name', 'progress', 'status']);
});

test('forbidden evaluations are refused by the API', async () => {
  const get = (t, type, target) => call('GET', `/my/review?type=${type}&target=${target}`, undefined, t);
  assert.equal((await get(tokens.e1, 'peer', 2)).status, 403, 'peer on self');
  assert.equal((await get(tokens.e1, 'manager', 3)).status, 403, 'employee doing manager evaluation');
  assert.equal((await get(tokens.e1, 'hr', 3)).status, 403, 'employee doing HR evaluation');
  assert.equal((await get(tokens.e1, 'self', 3)).status, 403, 'self evaluation of someone else');
  assert.equal((await get(tokens.mgr, 'manager', 6)).status, 403, 'manager of another department');
  assert.equal((await get(tokens.mgr, 'manager', 4)).status, 403, 'manager evaluating a manager');
  assert.equal((await get(tokens.e1, 'peer', 100)).status, 403, 'admin cannot be evaluated');
  assert.equal((await get(tokens.e1, 'peer', 9)).status, 403, 'inactive user cannot be evaluated');
  assert.equal((await get(tokens.admin, 'peer', 2)).status, 403, 'admin cannot evaluate');
  const put = await call('PUT', '/my/review', { type: 'manager', targetId: 3, answers: { mgr_sla: 5 } }, tokens.e2);
  assert.equal(put.status, 403, 'writing is checked too');
});

test('admin-only endpoints refuse everybody else', async () => {
  for (const t of [tokens.e1, tokens.mgr, tokens.hr]) {
    assert.equal((await call('GET', '/admin/analytics', undefined, t)).status, 403);
    assert.equal((await call('GET', '/admin/users', undefined, t)).status, 403);
    assert.equal((await call('POST', '/admin/users/2/reset-password', {}, t)).status, 403);
    assert.equal((await call('POST', '/admin/cycles', { name: 'x cycle' }, t)).status, 403);
  }
  assert.equal((await call('GET', '/admin/analytics')).status, 401);
});

test('peer flow: draft → submit → locked and hidden from the evaluator', async () => {
  const draft = await call('PUT', '/my/review', { type: 'peer', targetId: 3, answers: { m1q1: 4, m2q1: 'N/A', bogus: 5 }, texts: { strength: '<img src=x onerror=alert(1)> سريع' } }, tokens.e1);
  assert.equal(draft.status, 200);
  const read = await call('GET', '/my/review?type=peer&target=3', undefined, tokens.e1);
  assert.deepEqual(read.data.draft.answers, { m1q1: 4, m2q1: 'N/A' }, 'unknown keys dropped');

  const bad = await call('PUT', '/my/review', { type: 'peer', targetId: 3, answers: { m1q1: 9 } }, tokens.e1);
  assert.equal(bad.status, 400, 'out of range');

  const incomplete = await call('POST', '/my/review/submit', { type: 'peer', targetId: 3, answers: { m1q1: 4 } }, tokens.e1);
  assert.equal(incomplete.status, 400);

  const full = fullAnswers('peer', 5);
  const sub = await call('POST', '/my/review/submit', { type: 'peer', targetId: 3, ...full, texts: { strength: 'ممتاز' } }, tokens.e1);
  assert.equal(sub.status, 200);

  assert.equal((await call('GET', '/my/review?type=peer&target=3', undefined, tokens.e1)).status, 409, 'cannot reopen');
  assert.equal((await call('PUT', '/my/review', { type: 'peer', targetId: 3, answers: { m1q1: 1 } }, tokens.e1)).status, 409, 'cannot edit');
  assert.equal((await call('POST', '/my/review/submit', { type: 'peer', targetId: 3, ...fullAnswers('peer', 1) }, tokens.e1)).status, 409, 'cannot resubmit');

  const tasks = (await call('GET', '/my/tasks', undefined, tokens.e1)).data.menus.find((m) => m.type === 'peer');
  assert.equal(tasks.submitted, 1);
  assert.ok(!tasks.pending.some((p) => p.id === 3), 'evaluated colleague disappears');

  const row = (await app.sql`SELECT module_answers FROM m360_evaluations WHERE evaluator_id = 2 AND evaluatee_id = 3`)[0];
  assert.equal(row.module_answers.m1.m1q1, 5, 'stored in the existing format');
});

test('manager, HR and self flows', async () => {
  assert.equal((await call('POST', '/my/review/submit', { type: 'manager', targetId: 2, ...fullAnswers('manager', 3), texts: { notes: 'ملاحظة' } }, tokens.mgr)).status, 200);
  assert.equal((await call('POST', '/my/review/submit', { type: 'hr', targetId: 2, ...fullAnswers('hr', 4) }, tokens.hr)).status, 200);
  const noText = await call('POST', '/my/review/submit', { type: 'self', targetId: 2, answers: fullAnswers('self', 4).answers }, tokens.e1);
  assert.equal(noText.status, 400, 'self initiative text is required');
  const self = await call('POST', '/my/review/submit', { type: 'self', targetId: 2, ...fullAnswers('self', 5), extra: { nextOne: 'yes', nextOneFeedback: 'جيد' } }, tokens.e1);
  assert.equal(self.status, 200);
  const tasks = (await call('GET', '/my/tasks', undefined, tokens.e1)).data.menus.find((m) => m.type === 'self');
  assert.equal(tasks.pending.length, 0);
  assert.equal(tasks.submitted, 1);
});

test('analytics: aggregated for the admin, never reveals who wrote a peer evaluation', async () => {
  await call('POST', '/my/review/submit', { type: 'peer', targetId: 3, ...fullAnswers('peer', 3) }, tokens.s1);
  const r = await call('GET', '/admin/analytics', undefined, tokens.admin);
  assert.equal(r.status, 200);
  const e2 = r.data.employees.find((e) => e.id === 3);
  assert.equal(e2.scores.peer.raters, 2);
  assert.equal(e2.scores.peer.avg, 4);
  assert.deepEqual(e2.comments.strengths, ['ممتاز']);
  const e1 = r.data.employees.find((e) => e.id === 2);
  assert.equal(e1.scores.manager.avg, 3);
  assert.equal(e1.scores.hr.avg, 4);
  assert.equal(e1.scores.self.avg, 5);
  assert.equal(e1.comments.selfInitiative, 'نص تجريبي');
  assert.equal(r.data.nextOne.yes, 1);
  assert.ok(!r.data.employees.some((e) => e.id === 100), 'admins are not in the results');
  const json = JSON.stringify(r.data);
  assert.ok(!/evaluator/i.test(json), 'no evaluator identity anywhere in the payload');
  const part = r.data.participation.find((p) => p.id === 2);
  assert.deepEqual(part.items.peer, { done: 1, required: 7 });
  assert.deepEqual(part.items.self, { done: 1, required: 1 });
});

test('admin users: create, update role (signs the user out), reset password, guards', async () => {
  const created = await call('POST', '/admin/users', { name: 'موظف جديد', email: 'New@X.test', department: 'Sales', accessRole: 'employee' }, tokens.admin);
  assert.equal(created.status, 200);
  assert.ok(created.data.password.length >= 12);
  const newId = created.data.user.id;
  const tok = await app.login('new@x.test', created.data.password);
  assert.equal((await call('POST', '/admin/users', { name: 'مكرر', email: 'new@x.test', department: 'TS', accessRole: 'employee' }, tokens.admin)).status, 409);

  const up = await call('PUT', `/admin/users/${newId}`, { accessRole: 'manager' }, tokens.admin);
  assert.equal(up.status, 200);
  assert.equal(up.data.user.accessRole, 'manager');
  assert.equal((await call('GET', '/auth/me', undefined, tok)).status, 401, 'role change signs the user out');

  const reset = await call('POST', `/admin/users/${newId}/reset-password`, {}, tokens.admin);
  assert.equal((await call('POST', '/auth/login', { email: 'new@x.test', password: created.data.password })).status, 401);
  assert.equal((await call('POST', '/auth/login', { email: 'new@x.test', password: reset.data.password })).status, 200);

  assert.equal((await call('PUT', '/admin/users/100', { accessRole: 'employee', department: 'TS' }, tokens.admin)).status, 400, 'cannot demote yourself');
  assert.equal((await call('PUT', '/admin/users/100', { isActive: false }, tokens.admin)).status, 400, 'cannot deactivate yourself');
  assert.equal((await call('POST', '/admin/users', { name: 'بدون إدارة', email: 'nodept@x.test', accessRole: 'employee' }, tokens.admin)).status, 400);

  await call('PUT', `/admin/users/${newId}`, { isActive: false }, tokens.admin);
  assert.equal((await call('POST', '/auth/login', { email: 'new@x.test', password: reset.data.password })).status, 401, 'deactivated');
});

test('change password', async () => {
  const t = await app.login('a1@x.test');
  assert.equal((await call('POST', '/auth/change-password', { currentPassword: 'nope', newPassword: 'new-pass-123' }, t)).status, 400);
  assert.equal((await call('POST', '/auth/change-password', { currentPassword: PASSWORD, newPassword: 'short' }, t)).status, 400);
  assert.equal((await call('POST', '/auth/change-password', { currentPassword: PASSWORD, newPassword: 'new-pass-123' }, t)).status, 200);
  assert.equal((await call('POST', '/auth/login', { email: 'a1@x.test', password: 'new-pass-123' })).status, 200);
});

test('cycles: a new cycle starts every evaluation from zero', async () => {
  const c = await call('POST', '/admin/cycles', { name: 'دورة نوفمبر' }, tokens.admin);
  assert.equal(c.status, 200);
  const active = c.data.cycles.find((x) => x.isActive);
  assert.equal(active.name, 'دورة نوفمبر');
  const tasks = (await call('GET', '/my/tasks', undefined, tokens.e1)).data;
  assert.equal(tasks.cycle.id, active.id);
  assert.equal(tasks.menus.find((m) => m.type === 'peer').submitted, 0);
  const prev = c.data.cycles.find((x) => !x.isActive);
  const old = await call('GET', `/admin/analytics?cycle=${encodeURIComponent(prev.id)}`, undefined, tokens.admin);
  assert.equal(old.data.employees.find((e) => e.id === 3).scores.peer.raters, 2, 'old cycle results stay available');
  await call('POST', `/admin/cycles/${encodeURIComponent(prev.id)}/activate`, {}, tokens.admin);
});
