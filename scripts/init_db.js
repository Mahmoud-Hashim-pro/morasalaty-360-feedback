// =========================================================
// Prepare the database (safe to run many times):
//   DATABASE_URL="postgres://..." npm run db:init
// - creates / upgrades the schema (additive only, never deletes data)
// - adds the default employees & admin accounts that do not exist yet,
//   each with a random password printed ONCE below.
// =========================================================
const { getSql } = require('../db/db');
const { ensureSchema, seedUsers } = require('../lib/schema');

(async () => {
  const sql = getSql();
  await ensureSchema(sql);
  const created = await seedUsers(sql);
  const roles = await sql`SELECT access_role, COUNT(*)::int AS n FROM m360_users GROUP BY access_role ORDER BY access_role`;
  console.log('✅ Schema is up to date. Users per role:');
  console.table(roles);
  if (created.length) {
    console.log('🔑 New accounts (save these passwords now — they are not stored in plain text):');
    console.table(created.map((u) => ({ email: u.email, role: u.accessRole, password: u.password })));
  } else {
    console.log('ℹ️  No new accounts were needed. Use the admin "Users" screen or `npm run set-password -- <email>` to issue passwords.');
  }
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
