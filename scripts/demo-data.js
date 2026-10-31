// =========================================================
// Generates sample evaluations for LOCAL preview only (npm run dev:demo).
// Refuses to run against a real database.
// =========================================================
const P = require('../lib/permissions');
const Q = require('../lib/questions');

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function score(rand, base) {
  const v = Math.round(base + (rand() - 0.5) * 2.2);
  return Math.max(1, Math.min(5, v));
}

const STRENGTHS = ['سريع جداً في الرد على التذاكر', 'يساعد الزملاء وقت الضغط', 'توثيق ممتاز داخل النظام', 'هادئ ومحترف مع العملاء', 'يتابع تحديثات المنصة باستمرار'];
const IMPROVEMENTS = ['يحتاج مزيداً من التوثيق', 'إدارة التذاكر المتزامنة وقت الذروة', 'سرعة الاستجابة للرسائل الإدارية', 'المبادرة بحلول استباقية', 'الالتزام بأوقات SLA'];

async function generateDemoData(sql) {
  if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
    throw new Error('demo-data refuses to run when DATABASE_URL is set');
  }
  const cycle = (await sql`SELECT id FROM m360_cycles WHERE is_active = TRUE LIMIT 1`)[0].id;
  const rows = await sql`SELECT id, name, team, access_role, is_active FROM m360_users`;
  const users = rows.map((r) => ({ id: Number(r.id), name: r.name, department: r.team, accessRole: r.access_role, isActive: r.is_active }));
  const rand = rng(360);
  const base = {};
  users.forEach((u) => { base[u.id] = 2.6 + rand() * 2.1; });

  for (const ev of users.filter(P.isParticipant)) {
    for (const type of P.menusFor(ev)) {
      const targets = P.targetsFor(ev, users, type);
      for (const t of targets) {
        if (rand() > (type === 'peer' ? 0.72 : 0.85)) continue;
        const set = Q.getSet(type);
        const answers = {};
        set.questions.forEach((q) => {
          answers[q.id] = q.allowNA && rand() < 0.04 ? 'N/A' : score(rand, base[t.id] + (type === 'self' ? 0.4 : 0));
        });
        if (type === 'peer') {
          const moduleAnswers = {};
          set.questions.forEach((q) => { moduleAnswers[q.criterion] = { [q.id]: answers[q.id] }; });
          const texts = {};
          if (rand() < 0.5) texts.strength = STRENGTHS[Math.floor(rand() * STRENGTHS.length)];
          if (rand() < 0.4) texts.improvement = IMPROVEMENTS[Math.floor(rand() * IMPROVEMENTS.length)];
          await sql`INSERT INTO m360_evaluations (cycle_id, evaluator_id, evaluatee_id, status, progress_pct, module_answers, text_answers, completed_at)
            VALUES (${cycle}, ${ev.id}, ${t.id}, 'completed', 100, ${JSON.stringify(moduleAnswers)}::jsonb, ${JSON.stringify(texts)}::jsonb, NOW())
            ON CONFLICT DO NOTHING`;
        } else {
          const texts = {};
          if (type === 'self') texts.initiative = 'إعداد دليل مختصر لأكثر مشاكل العملاء تكراراً وحلولها';
          else if (rand() < 0.5) texts.notes = type === 'manager' ? 'أداء ثابت في أوقات الذروة' : 'ملتزم بمواعيد العمل والتعليمات الإدارية';
          const extra = type === 'self' ? { nextOne: rand() < 0.6 ? 'yes' : 'no', nextOneFeedback: rand() < 0.5 ? 'تجربة جيدة وسهلة' : '' } : {};
          await sql`INSERT INTO m360_reviews (cycle_id, review_type, evaluator_id, evaluatee_id, status, answers, texts, extra, submitted_at)
            VALUES (${cycle}, ${type}, ${ev.id}, ${t.id}, 'submitted', ${JSON.stringify(answers)}::jsonb, ${JSON.stringify(texts)}::jsonb, ${JSON.stringify(extra)}::jsonb, NOW())
            ON CONFLICT DO NOTHING`;
        }
      }
    }
  }
}

module.exports = { generateDemoData };
