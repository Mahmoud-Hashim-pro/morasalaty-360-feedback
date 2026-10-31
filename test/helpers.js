// Test harness: in-memory PostgreSQL (PGlite) + the real API handler over HTTP.
// It is impossible for these tests to reach a real database.
const http = require('http');
const { createLocalSql } = require('../scripts/local-db');
const { setSql } = require('../db/db');
const { ensureSchema } = require('../lib/schema');
const pw = require('../lib/passwords');
const handler = require('../api/index');

const PASSWORD = 'Test-Pass-123';

async function startApp() {
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  const sql = await createLocalSql();
  setSql(sql);
  handler._resetForTests();
  await ensureSchema(sql);
  const server = http.createServer((req, res) => handler(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function api(method, path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) { data = text; }
    return { status: res.status, data };
  }

  async function login(email, password = PASSWORD) {
    const r = await api('POST', '/auth/login', { email, password });
    if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.data)}`);
    return r.data.token;
  }

  async function close() {
    await new Promise((r) => server.close(r));
    await sql.close();
  }

  return { sql, api, login, close };
}

const HASH = pw.hashPassword(PASSWORD);

async function addUser(sql, u) {
  await sql`INSERT INTO m360_users (id, name, email, role, team, password_hash, access_role, is_active)
    VALUES (${u.id}, ${u.name}, ${u.email}, '', ${u.department || ''}, ${u.passwordHash || HASH}, ${u.accessRole}, ${u.isActive !== false})`;
}

// A small organisation covering every rule.
const ORG = [
  { id: 1, name: 'مدير الدعم', email: 'mgr.ts@x.test', department: 'TS', accessRole: 'manager' },
  { id: 2, name: 'موظف دعم 1', email: 'e1@x.test', department: 'TS', accessRole: 'employee' },
  { id: 3, name: 'موظف دعم 2', email: 'e2@x.test', department: 'TS', accessRole: 'employee' },
  { id: 4, name: 'مدير دعم ثاني', email: 'mgr2.ts@x.test', department: 'TS', accessRole: 'manager' },
  { id: 5, name: 'مدير المبيعات', email: 'mgr.sales@x.test', department: 'Sales', accessRole: 'manager' },
  { id: 6, name: 'موظف مبيعات', email: 's1@x.test', department: 'Sales', accessRole: 'employee' },
  { id: 7, name: 'الموارد البشرية', email: 'hr@x.test', department: 'Admin', accessRole: 'hr' },
  { id: 8, name: 'موظف إداري', email: 'a1@x.test', department: 'Admin', accessRole: 'employee' },
  { id: 9, name: 'موظف معطل', email: 'off@x.test', department: 'TS', accessRole: 'employee', isActive: false },
  { id: 100, name: 'مدير النظام', email: 'admin@x.test', department: '', accessRole: 'admin' }
];

async function seedOrg(sql) {
  for (const u of ORG) await addUser(sql, u);
}

function fullAnswers(type, value = 4) {
  const Q = require('../lib/questions');
  const set = Q.getSet(type);
  const answers = {};
  set.questions.forEach((q) => { answers[q.id] = value; });
  const texts = {};
  set.texts.forEach((t) => { if (t.required) texts[t.id] = 'نص تجريبي'; });
  return { answers, texts };
}

module.exports = { startApp, addUser, seedOrg, ORG, PASSWORD, fullAnswers };
