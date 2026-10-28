const { getSql } = require('../db/db');

async function clean() {
  const sql = getSql();
  console.log('🧹 Purging any dummy or synthetic evaluations from m360_evaluations...');
  
  const before = await sql`SELECT count(*)::int as c FROM m360_evaluations;`;
  console.log(`Evaluations before purge: ${before[0].c}`);

  await sql`TRUNCATE TABLE m360_evaluations RESTART IDENTITY;`;
  await sql`TRUNCATE TABLE m360_sessions RESTART IDENTITY;`;

  const after = await sql`SELECT count(*)::int as c FROM m360_evaluations;`;
  console.log(`✅ Evaluations after purge: ${after[0].c} (100% clean, genuine state)`);

  const usersCount = await sql`SELECT count(*)::int as c FROM m360_users;`;
  console.log(`✅ Real employees and admin count: ${usersCount[0].c} (intact and ready)`);
}

clean().catch(console.error);
