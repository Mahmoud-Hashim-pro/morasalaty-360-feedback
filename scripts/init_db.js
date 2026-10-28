const { neon } = require('@neondatabase/serverless');
const { EMPLOYEES, DEMO_PASSWORDS, UNIFORM_PASSWORD, HR_ADMIN, SUPER_ADMIN } = require('../data/employees');
const crypto = require('crypto');

const connectionString = process.env.DATABASE_URL || 
  process.env.POSTGRES_URL || 
  'postgresql://neondb_owner:npg_xtSXwcfe25Ji@ep-crimson-grass-b5li0j4g-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const sql = neon(connectionString);

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd.trim()).digest('hex');
}

async function init() {
  console.log('🔄 Initializing Morasalaty 360-Degree Database Schema...');

  // 1. Create Cycles Table
  await sql`
    CREATE TABLE IF NOT EXISTS m360_cycles (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      starts_at TIMESTAMPTZ DEFAULT NOW(),
      ends_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // 2. Create Users Table
  await sql`
    CREATE TABLE IF NOT EXISTS m360_users (
      id INTEGER PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      role VARCHAR(100) NOT NULL,
      team VARCHAR(50) NOT NULL,
      is_manager BOOLEAN DEFAULT FALSE,
      manager_id INTEGER,
      channels JSONB DEFAULT '{}'::jsonb,
      is_hr_admin BOOLEAN DEFAULT FALSE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // 3. Create Evaluations Table
  await sql`
    CREATE TABLE IF NOT EXISTS m360_evaluations (
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
    );
  `;

  // 4. Create Sessions Table
  await sql`
    CREATE TABLE IF NOT EXISTS m360_sessions (
      id SERIAL PRIMARY KEY,
      token VARCHAR(255) UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES m360_users(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `;

  // 5. Indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_m360_eval_evaluator ON m360_evaluations(evaluator_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_m360_eval_evaluatee ON m360_evaluations(evaluatee_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_m360_eval_status ON m360_evaluations(status);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_m360_sessions_token ON m360_sessions(token);`;

  console.log('✅ Tables and indexes created successfully.');

  // 6. Seed Default Cycle
  await sql`
    INSERT INTO m360_cycles (id, name, is_active)
    VALUES ('2026-Q1', 'دورة التقييم السنوية الشاملة 2026 - شركة مراسلاتي', TRUE)
    ON CONFLICT (id) DO NOTHING;
  `;

  // 7. Seed Employees + HR Admin + Super Admin (mahmoud@tieapps.com)
  console.log('🌱 Seeding 17 employees, HR Admin, and Super Admin...');

  // Platform Owner / Super Admin (mahmoud@tieapps.com)
  const superPassHash = hashPassword(DEMO_PASSWORDS['mahmoud@tieapps.com'] || 'mora123');
  await sql`
    INSERT INTO m360_users (id, name, email, role, team, is_manager, manager_id, channels, is_hr_admin, password_hash)
    VALUES (
      ${SUPER_ADMIN.id}, 
      ${SUPER_ADMIN.name}, 
      ${SUPER_ADMIN.email}, 
      ${SUPER_ADMIN.role}, 
      ${SUPER_ADMIN.team}, 
      TRUE, 
      NULL, 
      ${JSON.stringify(SUPER_ADMIN.channels || {})}::jsonb, 
      TRUE, 
      ${superPassHash}
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      team = EXCLUDED.team,
      is_manager = TRUE,
      is_hr_admin = TRUE,
      password_hash = EXCLUDED.password_hash;
  `;

  // HR Admin
  const hrPassHash = hashPassword(DEMO_PASSWORDS['hr.admin@samaagroup.net'] || 'mora123');
  await sql`
    INSERT INTO m360_users (id, name, email, role, team, is_manager, manager_id, channels, is_hr_admin, password_hash)
    VALUES (
      0, 
      ${HR_ADMIN.name}, 
      ${HR_ADMIN.email}, 
      ${HR_ADMIN.role}, 
      ${HR_ADMIN.team}, 
      TRUE, 
      NULL, 
      '{}'::jsonb, 
      TRUE, 
      ${hrPassHash}
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      password_hash = EXCLUDED.password_hash;
  `;

  // 17 Employees (Uniform password: mora123)
  for (const emp of EMPLOYEES) {
    const rawPwd = DEMO_PASSWORDS[emp.email] || 'mora123';
    const pwdHash = hashPassword(rawPwd);
    await sql`
      INSERT INTO m360_users (id, name, email, role, team, is_manager, manager_id, channels, is_hr_admin, password_hash)
      VALUES (
        ${emp.id},
        ${emp.name},
        ${emp.email},
        ${emp.role},
        ${emp.team},
        ${emp.isManager},
        ${emp.managerId},
        ${JSON.stringify(emp.channels || {})}::jsonb,
        FALSE,
        ${pwdHash}
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        team = EXCLUDED.team,
        is_manager = EXCLUDED.is_manager,
        manager_id = EXCLUDED.manager_id,
        channels = EXCLUDED.channels,
        password_hash = EXCLUDED.password_hash;
    `;
  }
  console.log('✅ All 17 employees, HR Admin, and Super Admin (mahmoud@tieapps.com) successfully seeded/updated.');

  const finalCountRes = await sql`SELECT COUNT(*)::int as count FROM m360_evaluations;`;
  console.log(`🎉 Database ready! Total genuine evaluations in DB: ${finalCountRes[0]?.count}`);
}

init().catch(err => {
  console.error('❌ Database initialization error:', err);
  process.exit(1);
});
