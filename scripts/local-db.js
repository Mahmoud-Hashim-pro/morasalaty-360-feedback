// =========================================================
// In-memory PostgreSQL (PGlite) for tests and local development.
// Exposes the same tagged-template interface as the Neon driver.
// Never connects to any external database.
// =========================================================
async function createLocalSql() {
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
  await db.waitReady;
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i++) text += '$' + (i + 1) + strings[i + 1];
    const res = await db.query(text, values.map((v) => (v === undefined ? null : v)));
    return res.rows;
  };
  sql.close = () => db.close();
  return sql;
}

module.exports = { createLocalSql };
