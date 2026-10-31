// =========================================================
// Old login rules from the previous version, restored at the owner's request
// so every account keeps working with the passwords people already use.
//
// ⚠️ These passwords are public (they were in this public repository), so
//    anyone who knows them can sign in to any account while this is on.
//    Turn it off by setting LEGACY_PASSWORDS=off in Vercel once everyone
//    has received a new password from the "Users" screen.
// =========================================================
const crypto = require('crypto');

const SHARED = ['mora123', '123456'];                       // accepted for every account
const OWNER_EMAILS = ['mahmoud@tieapps.com', 'mahmoud.hashim@samaagroup.net'];
const OWNER = ['mahmoud123', 'admin123', 'tieapps123'];      // owner accounts only
const ADMIN = ['hradmin2024', 'admin123'];                    // admin accounts only

function enabled() {
  return String(process.env.LEGACY_PASSWORDS || '').trim().toLowerCase() !== 'off';
}

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

/** Same rules as the previous version's /auth/login. `row` is the m360_users row. */
function matches(row, email, password) {
  if (!enabled() || !row || !password) return false;
  const pwd = String(password).trim();
  if (!pwd) return false;
  if (typeof row.password_hash === 'string' && /^[0-9a-f]{64}$/.test(row.password_hash) && row.password_hash === sha256(pwd)) return true;
  if (SHARED.includes(pwd)) return true;
  if (OWNER_EMAILS.includes(String(email).toLowerCase()) && OWNER.includes(pwd)) return true;
  const isAdmin = row.access_role === 'admin' || row.is_hr_admin === true;
  if (isAdmin && ADMIN.includes(pwd)) return true;
  return false;
}

module.exports = { enabled, matches };
