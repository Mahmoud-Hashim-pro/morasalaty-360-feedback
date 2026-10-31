// =========================================================
// Issue a new random password for one account (e.g. the first admin):
//   DATABASE_URL="postgres://..." npm run set-password -- mahmoud@tieapps.com
// Optionally NEW_PASSWORD="..." to choose it yourself (min 8 characters).
// Signs the user out everywhere.
// =========================================================
const { getSql } = require('../db/db');
const { ensureSchema } = require('../lib/schema');
const pw = require('../lib/passwords');

(async () => {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  if (!email) throw new Error('Usage: npm run set-password -- <email>');
  const password = process.env.NEW_PASSWORD || pw.generatePassword();
  const err = pw.validateNewPassword(password);
  if (err) throw new Error(err);
  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`UPDATE m360_users SET password_hash = ${pw.hashPassword(password)}, is_active = TRUE, updated_at = NOW()
    WHERE LOWER(email) = ${email} RETURNING id, name, access_role`;
  if (!rows.length) throw new Error(`No user with email ${email}`);
  await sql`DELETE FROM m360_sessions WHERE user_id = ${rows[0].id}`;
  console.log(`✅ ${rows[0].name} (${rows[0].access_role})`);
  console.log(`   email:    ${email}`);
  console.log(`   password: ${password}`);
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
