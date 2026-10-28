const { getSql } = require('../db/db');

async function migrate() {
  const sql = getSql();
  console.log('Migrating Neon DB: Adding next_ticket fields to m360_evaluations...');
  await sql`
    ALTER TABLE m360_evaluations 
    ADD COLUMN IF NOT EXISTS next_ticket_tried VARCHAR(20) DEFAULT NULL;
  `;
  await sql`
    ALTER TABLE m360_evaluations 
    ADD COLUMN IF NOT EXISTS next_ticket_feedback TEXT DEFAULT NULL;
  `;
  console.log('✅ Migration complete: next_ticket_tried and next_ticket_feedback columns added.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
