const { getSql } = require('../db/db');

async function migrate() {
  const sql = getSql();
  console.log('Migrating Neon DB: Adding next_one fields to m360_evaluations...');
  await sql`
    ALTER TABLE m360_evaluations 
    ADD COLUMN IF NOT EXISTS next_one_tried VARCHAR(20) DEFAULT NULL;
  `;
  await sql`
    ALTER TABLE m360_evaluations 
    ADD COLUMN IF NOT EXISTS next_one_feedback TEXT DEFAULT NULL;
  `;
  // Synchronize existing next_ticket columns if any
  await sql`
    UPDATE m360_evaluations 
    SET next_one_tried = COALESCE(next_one_tried, next_ticket_tried),
        next_one_feedback = COALESCE(next_one_feedback, next_ticket_feedback);
  `;
  console.log('✅ Migration complete: next_one_tried and next_one_feedback columns added and synced.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
