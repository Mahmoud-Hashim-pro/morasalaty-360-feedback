// =========================================================
// Morasalaty 360 — Serverless API (Vercel) / local server
// Every permission decision goes through lib/permissions.js.
// =========================================================
const crypto = require('crypto');
const { getSql, DatabaseNotConfiguredError } = require('../db/db');
const P = require('../lib/permissions');
const Q = require('../lib/questions');
const { ensureSchema } = require('../lib/schema');
const { buildAnalytics, flattenPeerAnswers, hasPeerContent, peerTexts } = require('../lib/analytics');
const pw = require('../lib/passwords');
const legacy = require('../lib/legacy-passwords');

const SESSION_HOURS = 72;
const LOGIN_WINDOW_MINUTES = 15;
const LOGIN_MAX_FAILURES = 8;
const MAX_BODY_BYTES = 200 * 1024;

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || {};
  }
}

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------
function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(data));
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); } catch (e) { throw new HttpError(400, 'صيغة الطلب غير صالحة'); }
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(new HttpError(413, 'حجم الطلب كبير جداً')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new HttpError(400, 'صيغة الطلب غير صالحة')); }
    });
    req.on('error', reject);
  });
}

function mapUser(r) {
  return {
    id: Number(r.id),
    name: r.name,
    email: r.email,
    department: r.team || '',
    jobTitle: r.role || '',
    accessRole: P.isValidRole(r.access_role) ? r.access_role : 'employee',
    isActive: r.is_active !== false,
    createdAt: r.created_at || null
  };
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    department: u.department,
    departmentLabel: Q.departmentLabel(u.department),
    accessRole: u.accessRole,
    roleLabel: P.ROLES[u.accessRole].label,
    capabilities: P.ROLES[u.accessRole].capabilities.slice(),
    menus: P.menusFor(u)
  };
}

function personRef(u) {
  return { id: u.id, name: u.name, department: u.department, departmentLabel: Q.departmentLabel(u.department) };
}

function timingSafeEqualStr(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function loadUsers(sql) {
  const rows = await sql`SELECT id, name, email, role, team, access_role, is_active, created_at FROM m360_users ORDER BY id ASC`;
  return rows.map(mapUser);
}

async function loadUser(sql, id) {
  const rows = await sql`SELECT id, name, email, role, team, access_role, is_active, created_at FROM m360_users WHERE id = ${Number(id)} LIMIT 1`;
  return rows.length ? mapUser(rows[0]) : null;
}

async function activeCycle(sql) {
  const rows = await sql`SELECT id, name FROM m360_cycles WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`;
  if (!rows.length) throw new HttpError(503, 'لا توجد دورة تقييم نشطة');
  return { id: rows[0].id, name: rows[0].name };
}

async function authenticate(sql, req) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token || token.length > 200) return null;
  const rows = await sql`
    SELECT u.id, u.name, u.email, u.role, u.team, u.access_role, u.is_active, u.created_at
    FROM m360_sessions s JOIN m360_users u ON u.id = s.user_id
    WHERE s.token = ${pw.hashToken(token)} AND s.expires_at > NOW()
    LIMIT 1`;
  if (!rows.length) return null;
  const user = mapUser(rows[0]);
  if (!user.isActive) return null;
  user.tokenHash = pw.hashToken(token);
  return user;
}

async function createSession(sql, user) {
  const token = pw.newSessionToken();
  const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
  await sql`INSERT INTO m360_sessions (token, user_id, email, expires_at) VALUES (${pw.hashToken(token)}, ${user.id}, ${user.email}, ${expires.toISOString()})`;
  return token;
}

// ---------------------------------------------------------
// Evaluation storage helpers
// ---------------------------------------------------------
function toModuleAnswers(answers) {
  const out = {};
  Q.getSet('peer').questions.forEach((q) => {
    if (answers[q.id] !== undefined) out[q.criterion] = { [q.id]: answers[q.id] };
  });
  return out;
}

async function readMyRow(sql, cycleId, type, evaluatorId, targetId) {
  if (type === 'peer') {
    const rows = await sql`SELECT status, module_answers, text_answers, updated_at FROM m360_evaluations
      WHERE cycle_id = ${cycleId} AND evaluator_id = ${evaluatorId} AND evaluatee_id = ${targetId} LIMIT 1`;
    if (!rows.length) return null;
    const r = rows[0];
    const answers = flattenPeerAnswers(r.module_answers);
    const submitted = r.status === 'completed' && hasPeerContent(r.module_answers);
    const t = peerTexts(r.text_answers);
    const texts = {};
    if (t.strength) texts.strength = t.strength;
    if (t.improvement) texts.improvement = t.improvement;
    return { submitted, answers, texts, extra: {}, updatedAt: r.updated_at };
  }
  const rows = await sql`SELECT status, answers, texts, extra, updated_at FROM m360_reviews
    WHERE cycle_id = ${cycleId} AND review_type = ${type} AND evaluator_id = ${evaluatorId} AND evaluatee_id = ${targetId} LIMIT 1`;
  if (!rows.length) return null;
  const r = rows[0];
  return { submitted: r.status === 'submitted', answers: r.answers || {}, texts: r.texts || {}, extra: r.extra || {}, updatedAt: r.updated_at };
}

async function writeMyRow(sql, cycleId, type, evaluatorId, targetId, clean, submit) {
  const progress = submit ? 100 : Q.progressOf(type, clean.answers);
  if (type === 'peer') {
    const moduleAnswers = JSON.stringify(toModuleAnswers(clean.answers));
    const textAnswers = JSON.stringify(clean.texts);
    const status = submit ? 'completed' : 'in_progress';
    const rows = await sql`
      INSERT INTO m360_evaluations (cycle_id, evaluator_id, evaluatee_id, status, progress_pct, module_answers, text_answers, completed_at, updated_at)
      VALUES (${cycleId}, ${evaluatorId}, ${targetId}, ${status}, ${progress}, ${moduleAnswers}::jsonb, ${textAnswers}::jsonb,
              ${submit ? new Date().toISOString() : null}, NOW())
      ON CONFLICT (cycle_id, evaluator_id, evaluatee_id) DO UPDATE SET
        status = EXCLUDED.status,
        progress_pct = EXCLUDED.progress_pct,
        module_answers = EXCLUDED.module_answers,
        text_answers = EXCLUDED.text_answers,
        completed_at = EXCLUDED.completed_at,
        updated_at = NOW()
      WHERE m360_evaluations.status <> 'completed'
         OR m360_evaluations.module_answers IS NULL
         OR m360_evaluations.module_answers = '{}'::jsonb
      RETURNING id`;
    return rows.length > 0;
  }
  const status = submit ? 'submitted' : 'in_progress';
  const rows = await sql`
    INSERT INTO m360_reviews (cycle_id, review_type, evaluator_id, evaluatee_id, status, answers, texts, extra, source, updated_at, submitted_at)
    VALUES (${cycleId}, ${type}, ${evaluatorId}, ${targetId}, ${status}, ${JSON.stringify(clean.answers)}::jsonb,
            ${JSON.stringify(clean.texts)}::jsonb, ${JSON.stringify(clean.extra)}::jsonb, 'app', NOW(),
            ${submit ? new Date().toISOString() : null})
    ON CONFLICT (cycle_id, review_type, evaluator_id, evaluatee_id) DO UPDATE SET
      status = EXCLUDED.status,
      answers = EXCLUDED.answers,
      texts = EXCLUDED.texts,
      extra = EXCLUDED.extra,
      source = 'app',
      updated_at = NOW(),
      submitted_at = EXCLUDED.submitted_at
    WHERE m360_reviews.status <> 'submitted'
    RETURNING id`;
  return rows.length > 0;
}

async function resolveTarget(sql, me, type, targetId) {
  if (!P.EVAL_TYPES.includes(type)) throw new HttpError(400, 'نوع تقييم غير معروف');
  const id = Number(targetId);
  if (!Number.isInteger(id)) throw new HttpError(400, 'معرّف الموظف غير صالح');
  const target = await loadUser(sql, id);
  if (!target) throw new HttpError(404, 'الموظف غير موجود');
  const decision = P.canEvaluate(me, target, type);
  if (!decision.allowed) throw new HttpError(403, decision.reason);
  return target;
}

// ---------------------------------------------------------
// Route handlers
// ---------------------------------------------------------
async function health(ctx) {
  await ctx.sql`SELECT 1 AS ok`;
  return { ok: true };
}

async function login(ctx) {
  const { sql } = ctx;
  const body = await parseBody(ctx.req);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) throw new HttpError(400, 'البريد الإلكتروني وكلمة المرور مطلوبان');
  if (email.length > 255 || password.length > 200) throw new HttpError(400, 'بيانات غير صالحة');

  const failures = await sql`SELECT COUNT(*)::int AS n FROM m360_login_attempts
    WHERE email = ${email} AND success = FALSE AND created_at > NOW() - (${LOGIN_WINDOW_MINUTES} * INTERVAL '1 minute')`;
  if (failures[0].n >= LOGIN_MAX_FAILURES) {
    throw new HttpError(429, `محاولات دخول كثيرة. حاول مرة أخرى بعد ${LOGIN_WINDOW_MINUTES} دقيقة.`);
  }

  const rows = await sql`SELECT * FROM m360_users WHERE LOWER(email) = ${email} LIMIT 1`;
  let row = rows[0] || null;
  let ok = row ? pw.verifyPassword(password, row.password_hash) : pw.verifyPassword(password, null);
  // Old passwords from the previous version (switch off with LEGACY_PASSWORDS=off)
  if (!ok && row && legacy.matches(row, email, password)) ok = true;

  // One-time bootstrap for the system admin (env ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD),
  // only while that admin has no modern password yet.
  const bEmail = String(process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const bPass = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || '');
  if (!ok && bEmail && bPass.length >= 12 && email === bEmail && timingSafeEqualStr(password, bPass)) {
    if (!row) {
      const next = await sql`SELECT COALESCE(MAX(id), 0) + 1 AS id FROM m360_users`;
      const created = await sql`INSERT INTO m360_users (id, name, email, role, team, is_hr_admin, password_hash, access_role, is_active)
        VALUES (${Number(next[0].id)}, 'مدير النظام', ${email}, '', 'Admin', TRUE, ${pw.hashPassword(password)}, 'admin', TRUE) RETURNING *`;
      row = created[0];
      ok = true;
    } else if (row.access_role === 'admin' && !pw.isModernHash(row.password_hash)) {
      await sql`UPDATE m360_users SET password_hash = ${pw.hashPassword(password)}, is_active = TRUE, updated_at = NOW() WHERE id = ${row.id}`;
      ok = true;
    }
  }

  const user = row ? mapUser(row) : null;
  if (!ok || !user || !user.isActive) {
    await sql`INSERT INTO m360_login_attempts (email, success) VALUES (${email}, FALSE)`;
    throw new HttpError(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
  }

  await sql`INSERT INTO m360_login_attempts (email, success) VALUES (${email}, TRUE)`;
  await sql`DELETE FROM m360_login_attempts WHERE created_at < NOW() - INTERVAL '1 day'`;
  await sql`DELETE FROM m360_sessions WHERE expires_at < NOW()`;
  const token = await createSession(sql, user);
  return { ok: true, token, user: publicUser(user), cycle: await activeCycle(sql) };
}

async function logout(ctx) {
  const header = ctx.req.headers['authorization'] || '';
  if (header.startsWith('Bearer ')) {
    await ctx.sql`DELETE FROM m360_sessions WHERE token = ${pw.hashToken(header.slice(7).trim())}`;
  }
  return { ok: true };
}

async function me(ctx) {
  return { ok: true, user: publicUser(ctx.user), cycle: await activeCycle(ctx.sql) };
}

async function changePassword(ctx) {
  const { sql, user } = ctx;
  const body = await parseBody(ctx.req);
  const rows = await sql`SELECT password_hash FROM m360_users WHERE id = ${user.id}`;
  if (!rows.length || !pw.verifyPassword(String(body.currentPassword || ''), rows[0].password_hash)) {
    throw new HttpError(400, 'كلمة المرور الحالية غير صحيحة');
  }
  const err = pw.validateNewPassword(body.newPassword);
  if (err) throw new HttpError(400, err);
  await sql`UPDATE m360_users SET password_hash = ${pw.hashPassword(body.newPassword)}, updated_at = NOW() WHERE id = ${user.id}`;
  await sql`DELETE FROM m360_sessions WHERE user_id = ${user.id} AND token <> ${user.tokenHash}`;
  return { ok: true };
}

// ---- Participant: my evaluation tasks
async function myTasks(ctx) {
  const { sql, user } = ctx;
  const cycle = await activeCycle(sql);
  const users = await loadUsers(sql);
  const peerRows = await sql`SELECT evaluatee_id, status, module_answers FROM m360_evaluations
    WHERE evaluator_id = ${user.id} AND cycle_id = ${cycle.id}`;
  const reviewRows = await sql`SELECT review_type, evaluatee_id, status, answers FROM m360_reviews
    WHERE evaluator_id = ${user.id} AND cycle_id = ${cycle.id}`;

  const state = {}; // type -> Map(targetId -> { submitted, progress })
  P.EVAL_TYPES.forEach((t) => { state[t] = new Map(); });
  peerRows.forEach((r) => {
    const answers = flattenPeerAnswers(r.module_answers);
    const submitted = r.status === 'completed' && hasPeerContent(r.module_answers);
    state.peer.set(Number(r.evaluatee_id), { submitted, progress: Q.progressOf('peer', answers), started: Object.keys(answers).length > 0 });
  });
  reviewRows.forEach((r) => {
    if (!state[r.review_type]) return;
    const answers = r.answers || {};
    state[r.review_type].set(Number(r.evaluatee_id), {
      submitted: r.status === 'submitted',
      progress: Q.progressOf(r.review_type, answers),
      started: Object.keys(answers).length > 0
    });
  });

  const menus = P.menusFor(user).map((type) => {
    const targets = P.targetsFor(user, users, type);
    const pending = [];
    let submitted = 0;
    targets.forEach((t) => {
      const s = state[type].get(t.id);
      if (s && s.submitted) { submitted++; return; }
      pending.push({ ...personRef(t), status: s && s.started ? 'in_progress' : 'not_started', progress: s ? s.progress : 0 });
    });
    return { type, total: targets.length, submitted, pending };
  });
  return { ok: true, cycle, menus };
}

async function getReview(ctx) {
  const { sql, user, query } = ctx;
  const type = String(query.get('type') || '');
  const target = await resolveTarget(sql, user, type, query.get('target'));
  const cycle = await activeCycle(sql);
  const row = await readMyRow(sql, cycle.id, type, user.id, target.id);
  if (row && row.submitted) {
    throw new HttpError(409, 'تم إرسال هذا التقييم مسبقاً، ولا يمكن فتحه أو تعديله.', { locked: true });
  }
  return {
    ok: true,
    type,
    target: personRef(target),
    draft: row ? { answers: row.answers, texts: row.texts, extra: row.extra } : { answers: {}, texts: {}, extra: {} },
    updatedAt: row ? row.updatedAt : null
  };
}

async function saveReview(ctx, submit) {
  const { sql, user } = ctx;
  const body = await parseBody(ctx.req);
  const type = String(body.type || '');
  const target = await resolveTarget(sql, user, type, body.targetId);
  const cycle = await activeCycle(sql);
  const v = Q.validatePayload(type, body, { forSubmit: submit });
  if (!v.ok) throw new HttpError(400, v.errors[0], { errors: v.errors });
  const written = await writeMyRow(sql, cycle.id, type, user.id, target.id, v.clean, submit);
  if (!written) throw new HttpError(409, 'تم إرسال هذا التقييم مسبقاً، ولا يمكن تعديله.', { locked: true });
  return { ok: true, submitted: submit, savedAt: new Date().toISOString() };
}

// ---- Admin: users & permissions
function cleanUserInput(body, partial) {
  const out = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (name.length < 2 || name.length > 150) throw new HttpError(400, 'الاسم مطلوب (2-150 حرفاً)');
    out.name = name;
  }
  if (!partial || body.email !== undefined) {
    const email = String(body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 255) throw new HttpError(400, 'البريد الإلكتروني غير صالح');
    out.email = email;
  }
  if (!partial || body.accessRole !== undefined) {
    if (!P.isValidRole(body.accessRole)) throw new HttpError(400, 'الدور غير صالح');
    out.accessRole = body.accessRole;
  }
  if (!partial || body.department !== undefined) {
    const d = String(body.department || '').trim();
    if (d.length > 50) throw new HttpError(400, 'اسم الإدارة طويل جداً');
    out.department = d;
  }
  if (body.jobTitle !== undefined) out.jobTitle = String(body.jobTitle || '').trim().slice(0, 100);
  if (body.isActive !== undefined) out.isActive = !!body.isActive;
  return out;
}

async function listUsers(ctx) {
  const users = await loadUsers(ctx.sql);
  return {
    ok: true,
    users,
    departments: Array.from(new Set(users.map((u) => u.department).filter(Boolean))).sort()
      .map((code) => ({ code, label: Q.departmentLabel(code) })),
    issues: P.auditOrganisation(users),
    legacyPasswords: legacy.enabled()
  };
}

async function countActiveAdmins(sql, excludingId) {
  const rows = await sql`SELECT COUNT(*)::int AS n FROM m360_users WHERE access_role = 'admin' AND is_active = TRUE AND id <> ${excludingId}`;
  return rows[0].n;
}

async function createUser(ctx) {
  const { sql } = ctx;
  const data = cleanUserInput(await parseBody(ctx.req), false);
  if (data.accessRole !== 'admin' && !data.department) throw new HttpError(400, 'الإدارة مطلوبة للموظفين');
  const dup = await sql`SELECT id FROM m360_users WHERE LOWER(email) = ${data.email} LIMIT 1`;
  if (dup.length) throw new HttpError(409, 'هذا البريد الإلكتروني مستخدم بالفعل');
  const password = pw.generatePassword();
  const next = await sql`SELECT COALESCE(MAX(id), 0) + 1 AS id FROM m360_users`;
  const id = Number(next[0].id);
  await sql`INSERT INTO m360_users (id, name, email, role, team, is_manager, is_hr_admin, password_hash, access_role, is_active)
    VALUES (${id}, ${data.name}, ${data.email}, ${data.jobTitle || ''}, ${data.department}, ${data.accessRole === 'manager'},
            ${data.accessRole === 'admin'}, ${pw.hashPassword(password)}, ${data.accessRole}, ${data.isActive !== false})`;
  return { ok: true, user: await loadUser(sql, id), password };
}

async function updateUser(ctx, idStr) {
  const { sql, user: actor } = ctx;
  const id = Number(idStr);
  const existing = await loadUser(sql, id);
  if (!existing) throw new HttpError(404, 'المستخدم غير موجود');
  const data = cleanUserInput(await parseBody(ctx.req), true);
  const next = { ...existing, ...data };

  if (next.accessRole !== 'admin' && !next.department) throw new HttpError(400, 'الإدارة مطلوبة للموظفين');
  if (id === actor.id && (next.accessRole !== 'admin' || next.isActive === false)) {
    throw new HttpError(400, 'لا يمكنك إزالة صلاحية مدير النظام أو تعطيل حسابك بنفسك');
  }
  const losesAdmin = existing.accessRole === 'admin' && existing.isActive && (next.accessRole !== 'admin' || !next.isActive);
  if (losesAdmin && (await countActiveAdmins(sql, id)) === 0) {
    throw new HttpError(400, 'يجب أن يبقى مدير نظام نشط واحد على الأقل');
  }
  if (data.email && data.email !== existing.email.toLowerCase()) {
    const dup = await sql`SELECT id FROM m360_users WHERE LOWER(email) = ${data.email} AND id <> ${id} LIMIT 1`;
    if (dup.length) throw new HttpError(409, 'هذا البريد الإلكتروني مستخدم بالفعل');
  }

  await sql`UPDATE m360_users SET
      name = ${next.name}, email = ${next.email}, team = ${next.department}, role = ${next.jobTitle || ''},
      access_role = ${next.accessRole}, is_active = ${next.isActive},
      is_manager = ${next.accessRole === 'manager'}, is_hr_admin = ${next.accessRole === 'admin'},
      updated_at = NOW()
    WHERE id = ${id}`;

  const accessChanged = next.accessRole !== existing.accessRole || next.department !== existing.department ||
    next.isActive !== existing.isActive || next.email.toLowerCase() !== existing.email.toLowerCase();
  if (accessChanged) await sql`DELETE FROM m360_sessions WHERE user_id = ${id}`;
  return { ok: true, user: await loadUser(sql, id) };
}

async function resetPassword(ctx, idStr) {
  const { sql } = ctx;
  const target = await loadUser(sql, Number(idStr));
  if (!target) throw new HttpError(404, 'المستخدم غير موجود');
  const password = pw.generatePassword();
  await sql`UPDATE m360_users SET password_hash = ${pw.hashPassword(password)}, updated_at = NOW() WHERE id = ${target.id}`;
  await sql`DELETE FROM m360_sessions WHERE user_id = ${target.id}`;
  return { ok: true, user: { id: target.id, name: target.name, email: target.email }, password };
}

async function resetAllPasswords(ctx) {
  const { sql, user: actor } = ctx;
  const users = (await loadUsers(sql)).filter((u) => u.isActive && u.id !== actor.id);
  const results = [];
  for (const u of users) {
    const password = pw.generatePassword();
    await sql`UPDATE m360_users SET password_hash = ${pw.hashPassword(password)}, updated_at = NOW() WHERE id = ${u.id}`;
    await sql`DELETE FROM m360_sessions WHERE user_id = ${u.id}`;
    results.push({ id: u.id, name: u.name, email: u.email, department: u.department, accessRole: u.accessRole, password });
  }
  return { ok: true, results };
}

// ---- Admin: cycles
async function listCycles(ctx) {
  const rows = await ctx.sql`SELECT id, name, is_active, created_at FROM m360_cycles ORDER BY created_at DESC`;
  return { ok: true, cycles: rows.map((r) => ({ id: r.id, name: r.name, isActive: !!r.is_active, createdAt: r.created_at })) };
}

async function createCycle(ctx) {
  const { sql } = ctx;
  const body = await parseBody(ctx.req);
  const name = String(body.name || '').trim();
  if (name.length < 3 || name.length > 150) throw new HttpError(400, 'اسم الدورة مطلوب (3-150 حرفاً)');
  const now = new Date();
  const base = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  let id = base;
  for (let i = 2; ; i++) {
    const ex = await sql`SELECT 1 FROM m360_cycles WHERE id = ${id}`;
    if (!ex.length) break;
    id = `${base}-${i}`;
  }
  await sql`INSERT INTO m360_cycles (id, name, is_active) VALUES (${id}, ${name}, FALSE)`;
  if (body.activate !== false) await activateCycleById(sql, id);
  return listCycles(ctx);
}

async function activateCycleById(sql, id) {
  const ex = await sql`SELECT 1 FROM m360_cycles WHERE id = ${id}`;
  if (!ex.length) throw new HttpError(404, 'الدورة غير موجودة');
  await sql`UPDATE m360_cycles SET is_active = (id = ${id})`;
}

async function activateCycle(ctx, id) {
  await activateCycleById(ctx.sql, decodeURIComponent(id));
  return listCycles(ctx);
}

// ---- Admin: results (aggregated, anonymous)
async function analytics(ctx) {
  const { sql, query } = ctx;
  const cycles = (await listCycles(ctx)).cycles;
  const requested = String(query.get('cycle') || '');
  const cycle = cycles.find((c) => c.id === requested) || cycles.find((c) => c.isActive) || cycles[0];
  if (!cycle) throw new HttpError(404, 'لا توجد دورات تقييم');
  const users = await loadUsers(sql);
  const peerRows = await sql`SELECT evaluator_id, evaluatee_id, status, module_answers, text_answers,
      next_one_tried, next_one_feedback, next_ticket_tried, next_ticket_feedback, updated_at
    FROM m360_evaluations WHERE cycle_id = ${cycle.id}`;
  const reviews = await sql`SELECT review_type, evaluator_id, evaluatee_id, status, answers, texts, extra, source
    FROM m360_reviews WHERE cycle_id = ${cycle.id}`;
  const data = buildAnalytics({ users, peerRows, reviews });
  return { ok: true, cycle, cycles, ...data };
}

// ---------------------------------------------------------
// Router
// ---------------------------------------------------------
const AUTH = { none: 0, user: 1, participant: 2 };
const routes = [
  { method: 'GET', path: '/health', handler: health, auth: AUTH.none },
  { method: 'POST', path: '/auth/login', handler: login, auth: AUTH.none },
  { method: 'POST', path: '/auth/logout', handler: logout, auth: AUTH.none },
  { method: 'GET', path: '/auth/me', handler: me, auth: AUTH.user },
  { method: 'POST', path: '/auth/change-password', handler: changePassword, auth: AUTH.user },

  { method: 'GET', path: '/my/tasks', handler: myTasks, auth: AUTH.participant },
  { method: 'GET', path: '/my/review', handler: getReview, auth: AUTH.participant },
  { method: 'PUT', path: '/my/review', handler: (c) => saveReview(c, false), auth: AUTH.participant },
  { method: 'POST', path: '/my/review/submit', handler: (c) => saveReview(c, true), auth: AUTH.participant },

  { method: 'GET', path: '/admin/users', handler: listUsers, cap: 'users.manage' },
  { method: 'POST', path: '/admin/users', handler: createUser, cap: 'users.manage' },
  { method: 'POST', path: '/admin/users/reset-passwords', handler: resetAllPasswords, cap: 'users.manage' },
  { method: 'PUT', path: /^\/admin\/users\/(\d+)$/, handler: updateUser, cap: 'users.manage' },
  { method: 'POST', path: /^\/admin\/users\/(\d+)\/reset-password$/, handler: resetPassword, cap: 'users.manage' },

  { method: 'GET', path: '/admin/cycles', handler: listCycles, cap: 'cycles.manage' },
  { method: 'POST', path: '/admin/cycles', handler: createCycle, cap: 'cycles.manage' },
  { method: 'POST', path: /^\/admin\/cycles\/([\w.%-]+)\/activate$/, handler: activateCycle, cap: 'cycles.manage' },

  { method: 'GET', path: '/admin/analytics', handler: analytics, cap: 'results.view' }
];

function matchRoute(method, pathname) {
  let pathFound = false;
  for (const r of routes) {
    const m = typeof r.path === 'string' ? (r.path === pathname ? [pathname] : null) : pathname.match(r.path);
    if (!m) continue;
    pathFound = true;
    if (r.method === method) return { route: r, params: m.slice(1) };
  }
  return { route: null, pathFound };
}

let readyPromise = null;
function ensureReady(sql) {
  if (!readyPromise) {
    readyPromise = ensureSchema(sql).catch((e) => { readyPromise = null; throw e; });
  }
  return readyPromise;
}

function resolvePath(req) {
  const url = new URL(req.url, 'http://localhost');
  // Vercel rewrite (/api/:path* -> /api/index?__path=:path*) or catch-all function
  const rewritten = url.searchParams.get('__path');
  let pathname = rewritten !== null ? '/' + rewritten : url.pathname.replace(/^\/api/, '');
  pathname = pathname.replace(/\/+$/, '') || '/';
  if (pathname === '/index') pathname = '/';
  url.searchParams.delete('__path');
  return { pathname, query: url.searchParams };
}

async function handler(req, res) {
  const { pathname, query } = resolvePath(req);
  try {
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    const { route, params, pathFound } = matchRoute(req.method, pathname === '/' ? '/health' : pathname);
    if (!route) {
      return sendJson(res, pathFound ? 405 : 404, { ok: false, error: pathFound ? 'الطريقة غير مسموحة' : 'المسار غير موجود' });
    }

    const sql = getSql();
    await ensureReady(sql);
    const ctx = { req, res, sql, query, user: null };

    if (route.auth !== AUTH.none || route.cap) {
      ctx.user = await authenticate(sql, req);
      if (!ctx.user) throw new HttpError(401, 'انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى');
      if (route.auth === AUTH.participant && !P.isParticipant(ctx.user)) {
        throw new HttpError(403, 'هذا الحساب لا يشارك في التقييم');
      }
      if (route.cap && !P.can(ctx.user, route.cap)) throw new HttpError(403, 'غير مصرح لك بالوصول');
    }

    const result = await route.handler(ctx, ...params);
    return sendJson(res, 200, result);
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { ok: false, error: err.message, ...err.extra });
    if (err instanceof DatabaseNotConfiguredError) {
      return sendJson(res, 503, { ok: false, error: 'قاعدة البيانات غير مهيأة على الخادم (DATABASE_URL).' });
    }
    console.error('API error:', err);
    return sendJson(res, 500, { ok: false, error: 'حدث خطأ غير متوقع في الخادم.' });
  }
}

module.exports = handler;
module.exports._resetForTests = () => { readyPromise = null; };
