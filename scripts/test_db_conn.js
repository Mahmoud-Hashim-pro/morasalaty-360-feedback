const { neon } = require('@neondatabase/serverless');

const connectionString = process.env.DATABASE_URL || 
  'postgresql://neondb_owner:npg_xtSXwcfe25Ji@ep-crimson-grass-b5li0j4g-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function testConnection() {
  try {
    const sql = neon(connectionString);
    const result = await sql`SELECT 1 as connected, NOW() as server_time;`;
    console.log('✅ New Neon DB Connection Successful:', result);
  } catch (err) {
    console.error('❌ New Neon DB Connection Failed:', err);
    process.exit(1);
  }
}

testConnection();
