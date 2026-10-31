// =========================================================
// Database access. The connection string comes ONLY from the
// environment (DATABASE_URL or POSTGRES_URL) — never from code.
// Tests and local development inject an in-memory database with setSql().
// =========================================================

let sqlClient = null;

class DatabaseNotConfiguredError extends Error {
  constructor() {
    super('DATABASE_URL is not configured');
    this.name = 'DatabaseNotConfiguredError';
  }
}

function getSql() {
  if (sqlClient) return sqlClient;
  const url = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
  if (!url) throw new DatabaseNotConfiguredError();
  const { neon } = require('@neondatabase/serverless');
  sqlClient = neon(url);
  return sqlClient;
}

// Used by tests / local dev to plug in another driver with the same
// tagged-template interface: sql`SELECT ... ${value}` -> Promise<rows[]>
function setSql(fn) {
  sqlClient = fn;
}

module.exports = {
  getSql,
  setSql,
  DatabaseNotConfiguredError
};
