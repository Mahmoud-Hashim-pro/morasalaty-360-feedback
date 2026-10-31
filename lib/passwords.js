// =========================================================
// Password hashing (scrypt + random salt) and session tokens.
// Legacy unsalted SHA-256 hashes are recognised but never accepted:
// every legacy password was published in the repository, so those
// accounts must receive a new password from the system admin.
// =========================================================
const crypto = require('crypto');

const SCRYPT_PREFIX = 'scrypt';
const KEY_LEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const MIN_PASSWORD_LENGTH = 8;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, KEY_LEN, SCRYPT_OPTS);
  return `${SCRYPT_PREFIX}$${salt.toString('base64')}$${key.toString('base64')}`;
}

function isModernHash(stored) {
  return typeof stored === 'string' && stored.startsWith(SCRYPT_PREFIX + '$');
}

// Burn the same CPU for unknown users so response time does not reveal which emails exist.
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'));

function verifyPassword(password, stored) {
  const target = isModernHash(stored) ? stored : DUMMY_HASH;
  const [, saltB64, keyB64] = target.split('$');
  const expected = Buffer.from(keyB64, 'base64');
  const actual = crypto.scryptSync(String(password || ''), Buffer.from(saltB64, 'base64'), expected.length, SCRYPT_OPTS);
  const match = crypto.timingSafeEqual(expected, actual);
  return match && isModernHash(stored);
}

// Readable random password, e.g. "Kp7m-Rt4x-9Qwz" (no ambiguous characters).
function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i === 3 || i === 7) out += '-';
  }
  return out;
}

function newSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function validateNewPassword(pwd) {
  if (typeof pwd !== 'string' || pwd.length < MIN_PASSWORD_LENGTH) {
    return `كلمة المرور يجب ألا تقل عن ${MIN_PASSWORD_LENGTH} أحرف`;
  }
  if (pwd.length > 200) return 'كلمة المرور طويلة جداً';
  return null;
}

module.exports = {
  hashPassword,
  verifyPassword,
  isModernHash,
  generatePassword,
  newSessionToken,
  hashToken,
  validateNewPassword,
  MIN_PASSWORD_LENGTH
};
