const { neon } = require('@neondatabase/serverless');

const connectionString = process.env.DATABASE_URL || 
  process.env.POSTGRES_URL || 
  'postgresql://neondb_owner:npg_xtSXwcfe25Ji@ep-crimson-grass-b5li0j4g-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

let sqlClient = null;

function getSql() {
  if (!sqlClient) {
    const connStr = process.env.DATABASE_URL || process.env.POSTGRES_URL || connectionString;
    sqlClient = neon(connStr);
  }
  return sqlClient;
}

module.exports = {
  getSql,
  connectionString
};
