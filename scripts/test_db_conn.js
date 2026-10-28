const { neon } = require('@neondatabase/serverless');

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_AMyt3kIFUh0O@ep-misty-wave-baad1xpc-pooler.c-8.eu-central-1.aws.neon.tech/neondb?sslmode=require';

async function testConnection() {
  try {
    const sql = neon(connectionString);
    const result = await sql`SELECT 1 as connected, NOW() as server_time;`;
    console.log('Neon DB Connection Successful:', result);
  } catch (err) {
    console.error('Neon DB Connection Failed:', err);
    process.exit(1);
  }
}

testConnection();
