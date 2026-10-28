const { neon } = require('@neondatabase/serverless');
const { EMPLOYEES, DEMO_PASSWORDS, HR_ADMIN } = require('../data/employees');
const crypto = require('crypto');

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_AMyt3kIFUh0O@ep-misty-wave-baad1xpc-pooler.c-8.eu-central-1.aws.neon.tech/neondb?sslmode=require';
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

  // 7. Seed Employees + HR Admin
  console.log('🌱 Seeding 17 employees and HR Admin...');

  // HR Admin first
  const hrPassHash = hashPassword(DEMO_PASSWORDS['hr.admin@samaagroup.net'] || 'hradmin2024');
  await sql`
    INSERT INTO m360_users (id, name, email, role, team, is_manager, manager_id, channels, is_hr_admin, password_hash)
    VALUES (
      0, 
      ${HR_ADMIN.name}, 
      ${HR_ADMIN.email}, 
      ${HR_ADMIN.role}, 
      ${HR_ADMIN.team}, 
      FALSE, 
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

  // 17 Employees
  for (const emp of EMPLOYEES) {
    const rawPwd = DEMO_PASSWORDS[emp.email] || `${emp.email.split('@')[0]}123`;
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
  console.log('✅ All 17 employees and HR Admin successfully seeded/updated.');

  // 8. Seed realistic evaluation samples if few evaluations exist
  const existingCountRes = await sql`SELECT COUNT(*)::int as count FROM m360_evaluations;`;
  const existingCount = existingCountRes[0]?.count || 0;
  console.log(`Current evaluations count: ${existingCount}`);

  if (existingCount < 20) {
    console.log('🌱 Generating comprehensive initial evaluations dataset for realistic 360-degree feedback analytics...');
    
    // We create realistic evaluations from peers and managers
    const baseComments = [
      "أداء متميز وتواصل رائع وسرعة استجابة في المهام المشتركة.",
      "ملتزم بمواعيد التسليم ودقيق في التفاصيل التقنية.",
      "تعاون ممتاز مع أعضاء الفريق وروح إيجابية مستمرة.",
      "مستوى عالٍ من الاحترافية والقدرة على حل المشكلات المعقدة.",
      "مبادر ويقدم حلولاً مبتكرة لتطوير بيئة العمل.",
      "قدرة قيادية واضحة وإدارة فعالة للأولويات."
    ];

    let inserted = 0;

    for (const evaluator of EMPLOYEES) {
      for (const evaluatee of EMPLOYEES) {
        if (evaluator.id === evaluatee.id) continue;

        // Determine if we should generate an evaluation for this pair
        // Generate completed evals for direct relationships and selected peers (~40-50% coverage)
        const isDirectColleague = (evaluator.team === evaluatee.team);
        const isManagerRel = (evaluator.managerId === evaluatee.id || evaluatee.managerId === evaluator.id);
        const isMahmoudInvolved = (evaluator.id === 8 || evaluatee.id === 8);

        const shouldCreate = isDirectColleague || isManagerRel || isMahmoudInvolved || ((evaluator.id + evaluatee.id) % 3 === 0);
        if (!shouldCreate) continue;

        const isCompleted = ((evaluator.id * 3 + evaluatee.id * 7) % 5) !== 0; // 80% completed, 20% in progress
        
        // Base rating around 4.0 - 4.9 for top performers, 3.5 - 4.5 for others
        const baseScore = evaluatee.id === 8 ? 4.7 : (3.8 + ((evaluatee.id * 7) % 10) * 0.1);

        const moduleAnswers = {};
        for (let m = 1; m <= 10; m++) {
          const modKey = `m${m}`;
          moduleAnswers[modKey] = {};
          const numQuestions = isCompleted ? 15 : (m <= 3 ? 15 : 0);
          for (let q = 1; q <= numQuestions; q++) {
            const qKey = `q${q}`;
            // slight variance between 3 and 5
            const variation = ((m * 3 + q * 5 + evaluatee.id) % 3) - 1; // -1, 0, or 1
            let rating = Math.round(baseScore + variation * 0.4);
            if (rating > 5) rating = 5;
            if (rating < 3) rating = 3;
            moduleAnswers[modKey][qKey] = rating;
          }
        }

        const textAnswers = {};
        if (isCompleted) {
          textAnswers.m1 = baseComments[(evaluator.id + evaluatee.id) % baseComments.length];
          textAnswers.m5 = "تطوير مهارات التوثيق وإدارة الاجتماعات بشكل أسرع.";
        }

        const managerAnswers = {};
        if (isManagerRel && isCompleted) {
          for (let mq = 1; mq <= 10; mq++) {
            managerAnswers[`mq${mq}`] = Math.min(5, Math.max(3, Math.round(baseScore)));
          }
        }

        const status = isCompleted ? 'completed' : 'in_progress';
        const progressPct = isCompleted ? 100 : 35;
        const completedAt = isCompleted ? new Date().toISOString() : null;

        await sql`
          INSERT INTO m360_evaluations (
            cycle_id, evaluator_id, evaluatee_id, status, progress_pct,
            module_answers, text_answers, manager_answers, completed_at
          ) VALUES (
            '2026-Q1', ${evaluator.id}, ${evaluatee.id}, ${status}, ${progressPct},
            ${JSON.stringify(moduleAnswers)}::jsonb,
            ${JSON.stringify(textAnswers)}::jsonb,
            ${JSON.stringify(managerAnswers)}::jsonb,
            ${completedAt}
          )
          ON CONFLICT (cycle_id, evaluator_id, evaluatee_id) DO NOTHING;
        `;
        inserted++;
      }
    }
    console.log(`✅ Seeded ${inserted} realistic 360-degree evaluations.`);
  }

  const finalCountRes = await sql`SELECT COUNT(*)::int as count FROM m360_evaluations;`;
  console.log(`🎉 Database ready! Total evaluations in DB: ${finalCountRes[0]?.count}`);
}

init().catch(err => {
  console.error('❌ Database initialization error:', err);
  process.exit(1);
});
