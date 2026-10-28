const { getSql } = require('../db/db');

async function check() {
  const sql = getSql();
  const e = await sql`SELECT count(*)::int as c FROM m360_evaluations;`;
  const u = await sql`SELECT count(*)::int as c FROM m360_users;`;
  console.log(`Evaluations count: ${e[0].c}`);
  console.log(`Users count: ${u[0].c}`);
}

check();
