// Permission matrix — the rules the whole system relies on.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/permissions');
const { ORG } = require('./helpers');

const u = (id) => ORG.find((x) => x.id === id);
const allowed = (a, b, type) => P.canEvaluate(u(a), u(b), type).allowed;

test('menus per role (self is always last)', () => {
  assert.deepEqual(P.menusFor(u(2)), ['peer', 'self']);
  assert.deepEqual(P.menusFor(u(1)), ['peer', 'manager', 'self']);
  assert.deepEqual(P.menusFor(u(7)), ['peer', 'hr', 'self']);
  assert.deepEqual(P.menusFor(u(100)), []);
  assert.deepEqual(P.menusFor(u(9)), [], 'inactive users have no menus');
});

test('peer: everyone evaluates every other active participant', () => {
  assert.equal(allowed(2, 3, 'peer'), true);
  assert.equal(allowed(2, 6, 'peer'), true, 'across departments');
  assert.equal(allowed(2, 1, 'peer'), true, 'employees evaluate their manager as a colleague');
  assert.equal(allowed(2, 2, 'peer'), false, 'not yourself');
  assert.equal(allowed(2, 100, 'peer'), false, 'admins are not evaluated');
  assert.equal(allowed(2, 9, 'peer'), false, 'inactive users are not evaluated');
  assert.equal(allowed(9, 2, 'peer'), false, 'inactive users cannot evaluate');
  assert.equal(allowed(100, 2, 'peer'), false, 'admins do not evaluate');
  assert.equal(P.targetsFor(u(2), ORG, 'peer').length, 7);
});

test('manager: only non-manager employees of his own department', () => {
  assert.equal(allowed(1, 2, 'manager'), true);
  assert.equal(allowed(1, 3, 'manager'), true);
  assert.equal(allowed(1, 4, 'manager'), false, 'not another manager');
  assert.equal(allowed(1, 6, 'manager'), false, 'not another department');
  assert.equal(allowed(1, 1, 'manager'), false, 'not himself');
  assert.equal(allowed(2, 3, 'manager'), false, 'employees cannot do manager evaluations');
  assert.equal(allowed(7, 8, 'manager'), false, 'HR is not a manager');
  assert.deepEqual(P.targetsFor(u(1), ORG, 'manager').map((x) => x.id), [2, 3]);
  assert.deepEqual(P.targetsFor(u(5), ORG, 'manager').map((x) => x.id), [6]);
});

test('hr: administrative evaluation of everyone except herself', () => {
  assert.equal(allowed(7, 2, 'hr'), true);
  assert.equal(allowed(7, 1, 'hr'), true, 'managers too');
  assert.equal(allowed(7, 7, 'hr'), false);
  assert.equal(allowed(2, 3, 'hr'), false, 'employees cannot do HR evaluations');
  assert.equal(allowed(1, 2, 'hr'), false, 'managers cannot do HR evaluations');
  assert.equal(P.targetsFor(u(7), ORG, 'hr').length, 7);
});

test('self: only yourself, every participant', () => {
  [1, 2, 7].forEach((id) => assert.equal(allowed(id, id, 'self'), true));
  assert.equal(allowed(2, 3, 'self'), false);
  assert.equal(allowed(100, 100, 'self'), false, 'admins do not self-evaluate');
});

test('results and administration are admin-only capabilities', () => {
  ['results.view', 'users.manage', 'cycles.manage'].forEach((cap) => {
    assert.equal(P.can(u(100), cap), true);
    [1, 2, 7].forEach((id) => assert.equal(P.can(u(id), cap), false, `${u(id).accessRole} must not have ${cap}`));
  });
  assert.equal(P.can({ ...u(100), isActive: false }, 'results.view'), false, 'inactive admin');
  assert.equal(P.can({ id: 1, accessRole: 'superuser' }, 'results.view'), false, 'unknown role');
});

test('organisation audit flags missing manager / HR', () => {
  const issues = P.auditOrganisation([
    { id: 1, name: 'a', department: 'X', accessRole: 'employee' },
    { id: 2, name: 'b', department: 'Y', accessRole: 'manager' }
  ]).map((i) => i.message).join('\n');
  assert.match(issues, /«X» ليس لها مدير/);
  assert.match(issues, /الموارد البشرية/);
  assert.match(issues, /مدير نظام/);
});
