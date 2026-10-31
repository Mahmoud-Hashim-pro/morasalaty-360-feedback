// =========================================================
// Schema management — idempotent and ADDITIVE ONLY.
// It never drops or rewrites existing tables, so the previous
// version of the app keeps working against a migrated database.
//
// Data model
//   m360_users        users (+ access_role, is_active)
//   m360_evaluations  peer (360°) evaluations — unchanged legacy table
//   m360_reviews      manager / hr / self evaluations (new)
//   m360_cycles       evaluation cycles (one active)
//   m360_sessions     login sessions (token stored as SHA-256)
//   m360_login_attempts  brute-force protection
//   m360_meta         schema version
// =========================================================
const { EMPLOYEES, DEFAULT_ACCESS_ROLES, ADMIN_ACCOUNTS } = require('../data/employees');
const { hashPassword, generatePassword } = require('./passwords');

const SCHEMA_VERSION = 2;
const LEGACY_CYCLE = '2026-Q1';

async function runDDL(sql) {
  await sql`CREATE TABLE IF NOT EXISTS m360_cycles (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    starts_at TIMESTAMPTZ DEFAULT NOW(),
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS m360_users (
    id INTEGER PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(100) NOT NULL DEFAULT '',
    team VARCHAR(50) NOT NULL DEFAULT '',
    is_manager BOOLEAN DEFAULT FALSE,
    manager_id INTEGER,
    channels JSONB DEFAULT '{}'::jsonb,
    is_hr_admin BOOLEAN DEFAULT FALSE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`ALTER TABLE m360_users ADD COLUMN IF NOT EXISTS access_role VARCHAR(20)`;
  await sql`ALTER TABLE m360_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`;

  await sql`CREATE TABLE IF NOT EXISTS m360_evaluations (
    id SERIAL PRIMARY KEY,
    cycle_id VARCHAR(50) NOT NULL DEFAULT '2026-Q1',
    evaluator_id INTEGER NOT NULL REFERENCES m360_users(id) ON DELETE CASCADE,
    evaluatee_id INTEGER NOT NULL REFERENCES m360_users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    progress_pct INTEGER DEFAULT 0,
    module_answers JSONB DEFAULT '{}'::jsonb,
    text_answers JSONB DEFAULT '{}'::jsonb,
    manager_answers JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT m360_unique_eval_cycle UNIQUE (cycle_id, evaluator_id, evaluatee_id),
    CONSTRAINT m360_no_self_eval CHECK (evaluator_id <> evaluatee_id)
  )`;
  // Columns added by earlier versions (kept for reading legacy "Next One" answers)
  await sql`ALTER TABLE m360_evaluations ADD COLUMN IF NOT EXISTS next_one_tried VARCHAR(10)`;
  await sql`ALTER TABLE m360_evaluations ADD COLUMN IF NOT EXISTS next_one_feedback TEXT`;
  await sql`ALTER TABLE m360_evaluations ADD COLUMN IF NOT EXISTS next_ticket_tried VARCHAR(10)`;
  await sql`ALTER TABLE m360_evaluations ADD COLUMN IF NOT EXISTS next_ticket_feedback TEXT`;

  await sql`CREATE TABLE IF NOT EXISTS m360_reviews (
    id SERIAL PRIMARY KEY,
    cycle_id VARCHAR(50) NOT NULL,
    review_type VARCHAR(20) NOT NULL,
    evaluator_id INTEGER NOT NULL REFERENCES m360_users(id) ON DELETE CASCADE,
    evaluatee_id INTEGER NOT NULL REFERENCES m360_users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    texts JSONB NOT NULL DEFAULT '{}'::jsonb,
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    source VARCHAR(20) NOT NULL DEFAULT 'app',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    CONSTRAINT m360_reviews_unique UNIQUE (cycle_id, review_type, evaluator_id, evaluatee_id),
    CONSTRAINT m360_reviews_type CHECK (review_type IN ('manager', 'hr', 'self')),
    CONSTRAINT m360_reviews_self CHECK ((review_type = 'self') = (evaluator_id = evaluatee_id))
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_m360_reviews_cycle ON m360_reviews(cycle_id, review_type)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_m360_reviews_evaluator ON m360_reviews(evaluator_id)`;

  await sql`CREATE TABLE IF NOT EXISTS m360_sessions (
    id SERIAL PRIMARY KEY,
    token VARCHAR(255) UNIQUE NOT NULL,
    user_id INTEGER NOT NULL REFERENCES m360_users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
  )`;
  await sql`CREATE TABLE IF NOT EXISTS m360_login_attempts (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_m360_login_attempts_email ON m360_login_attempts(email, created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_m360_eval_evaluator ON m360_evaluations(evaluator_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_m360_eval_evaluatee ON m360_evaluations(evaluatee_id)`;

  await sql`CREATE TABLE IF NOT EXISTS m360_meta (
    key VARCHAR(50) PRIMARY KEY,
    value JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`;
}

async function assignDefaultRoles(sql) {
  await sql`UPDATE m360_users SET access_role = 'admin' WHERE access_role IS NULL AND is_hr_admin = TRUE`;
  for (const email of Object.keys(DEFAULT_ACCESS_ROLES)) {
    const role = DEFAULT_ACCESS_ROLES[email];
    await sql`UPDATE m360_users SET access_role = ${role} WHERE access_role IS NULL AND LOWER(email) = ${email.toLowerCase()}`;
  }
  await sql`UPDATE m360_users SET access_role = 'employee' WHERE access_role IS NULL`;
}

async function ensureActiveCycle(sql) {
  await sql`INSERT INTO m360_cycles (id, name, is_active)
    SELECT ${LEGACY_CYCLE}, 'دورة التقييم 2026', TRUE
    WHERE NOT EXISTS (SELECT 1 FROM m360_cycles)`;
  await sql`UPDATE m360_cycles SET is_active = TRUE
    WHERE id = (SELECT id FROM m360_cycles ORDER BY created_at DESC LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM m360_cycles WHERE is_active = TRUE)`;
}

/**
 * Copy manager / HR / self evaluations written by the previous version
 * (stored inside m360_evaluations.manager_answers and m360_users.channels)
 * into m360_reviews. Safe to run repeatedly: rows already edited in the
 * new app (source = 'app') are never overwritten.
 */
async function syncLegacyReviews(sql) {
  for (const [legacyKey, type] of [['manager', 'manager'], ['fatima', 'hr']]) {
    await sql`INSERT INTO m360_reviews
        (cycle_id, review_type, evaluator_id, evaluatee_id, status, answers, texts, source, created_at, updated_at, submitted_at)
      SELECT e.cycle_id, ${type}::varchar, e.evaluator_id, e.evaluatee_id,
        CASE WHEN COALESCE(e.manager_answers->(${legacyKey}::text)->>'isFinal', 'false') = 'true' THEN 'submitted' ELSE 'in_progress' END,
        CASE WHEN jsonb_typeof(e.manager_answers->(${legacyKey}::text)->'answers') = 'object'
             THEN e.manager_answers->(${legacyKey}::text)->'answers' ELSE '{}'::jsonb END,
        CASE WHEN COALESCE(e.manager_answers->(${legacyKey}::text)->>'notes', '') <> ''
             THEN jsonb_build_object('notes', e.manager_answers->(${legacyKey}::text)->>'notes') ELSE '{}'::jsonb END,
        'legacy', e.created_at, e.updated_at,
        CASE WHEN COALESCE(e.manager_answers->(${legacyKey}::text)->>'isFinal', 'false') = 'true' THEN e.updated_at END
      FROM m360_evaluations e
      WHERE e.manager_answers ? (${legacyKey}::text) AND e.evaluator_id <> e.evaluatee_id
      ON CONFLICT (cycle_id, review_type, evaluator_id, evaluatee_id) DO UPDATE SET
        status = EXCLUDED.status, answers = EXCLUDED.answers, texts = EXCLUDED.texts,
        updated_at = EXCLUDED.updated_at, submitted_at = EXCLUDED.submitted_at
      WHERE m360_reviews.source = 'legacy'`;
  }

  await sql`INSERT INTO m360_reviews
      (cycle_id, review_type, evaluator_id, evaluatee_id, status, answers, texts, source, updated_at, submitted_at)
    SELECT ${LEGACY_CYCLE}, 'self', u.id, u.id,
      CASE WHEN COALESCE(u.channels->'self_eval'->>'isFinal', 'false') = 'true' THEN 'submitted' ELSE 'in_progress' END,
      CASE WHEN jsonb_typeof(u.channels->'self_eval'->'answers') = 'object'
           THEN u.channels->'self_eval'->'answers' ELSE '{}'::jsonb END,
      CASE WHEN COALESCE(u.channels->'self_eval'->>'initiativeText', '') <> ''
           THEN jsonb_build_object('initiative', u.channels->'self_eval'->>'initiativeText') ELSE '{}'::jsonb END,
      'legacy', NOW(),
      CASE WHEN COALESCE(u.channels->'self_eval'->>'isFinal', 'false') = 'true' THEN NOW() END
    FROM m360_users u
    WHERE jsonb_typeof(u.channels) = 'object' AND u.channels ? 'self_eval'
    ON CONFLICT (cycle_id, review_type, evaluator_id, evaluatee_id) DO UPDATE SET
      status = EXCLUDED.status, answers = EXCLUDED.answers, texts = EXCLUDED.texts,
      submitted_at = COALESCE(m360_reviews.submitted_at, EXCLUDED.submitted_at)
    WHERE m360_reviews.source = 'legacy'`;
}

async function readVersion(sql) {
  try {
    const rows = await sql`SELECT value FROM m360_meta WHERE key = 'schema_version'`;
    return rows.length ? Number(rows[0].value) : 0;
  } catch (e) {
    return 0;
  }
}

/** Bring the database up to date. Cheap when already current. */
async function ensureSchema(sql) {
  const version = await readVersion(sql);
  if (version < SCHEMA_VERSION) {
    await runDDL(sql);
    await assignDefaultRoles(sql);
    await ensureActiveCycle(sql);
    await sql`INSERT INTO m360_meta (key, value, updated_at) VALUES ('schema_version', ${JSON.stringify(SCHEMA_VERSION)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
  }
  // Keeps legacy data in sync while the previous version may still be live.
  await syncLegacyReviews(sql);
  await ensureActiveCycle(sql);
}

/**
 * Insert the default employees and admin accounts that do not exist yet.
 * Existing users are left untouched. Returns the generated passwords of new users.
 */
async function seedUsers(sql) {
  const created = [];
  const all = [
    ...EMPLOYEES.map((e) => ({ id: e.id, name: e.name, email: e.email, team: e.team, jobTitle: e.role || '', accessRole: DEFAULT_ACCESS_ROLES[e.email.toLowerCase()] || 'employee' })),
    ...ADMIN_ACCOUNTS.map((a) => ({ id: a.id, name: a.name, email: a.email, team: a.team, jobTitle: '', accessRole: 'admin' }))
  ];
  for (const u of all) {
    const exists = await sql`SELECT id FROM m360_users WHERE id = ${u.id} OR LOWER(email) = ${u.email.toLowerCase()} LIMIT 1`;
    if (exists.length) continue;
    const password = generatePassword();
    await sql`INSERT INTO m360_users (id, name, email, role, team, is_manager, is_hr_admin, password_hash, access_role, is_active)
      VALUES (${u.id}, ${u.name}, ${u.email}, ${u.jobTitle}, ${u.team}, ${u.accessRole === 'manager'}, ${u.accessRole === 'admin'},
              ${hashPassword(password)}, ${u.accessRole}, TRUE)`;
    created.push({ id: u.id, name: u.name, email: u.email, accessRole: u.accessRole, password });
  }
  return created;
}

module.exports = {
  SCHEMA_VERSION,
  LEGACY_CYCLE,
  ensureSchema,
  seedUsers,
  syncLegacyReviews
};
