const { neon } = require('@neondatabase/serverless');

const connectionString = process.env.DATABASE_URL || 
  process.env.POSTGRES_URL || 
  'postgresql://neondb_owner:npg_AMyt3kIFUh0O@ep-misty-wave-baad1xpc-pooler.c-8.eu-central-1.aws.neon.tech/neondb?sslmode=require';

let sqlClient = null;

function getSql() {
  if (!sqlClient) {
    sqlClient = neon(connectionString);
  }
  return sqlClient;
}

module.exports = {
  getSql,
  connectionString
};
