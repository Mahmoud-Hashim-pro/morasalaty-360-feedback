const assert = require('assert');
const http = require('http');
const server = require('../server');

const PORT = 3456;

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  await new Promise(resolve => server.listen(PORT, resolve));
  console.log(`🧪 Running API Integration Tests on port ${PORT}...`);

  try {
    // 1. Health check
    console.log('1️⃣ Testing /api/health...');
    const health = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/health',
      method: 'GET'
    });
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.data.ok, true);
    assert.strictEqual(health.data.dbConnected, true);
    console.log('   ✅ /api/health passed!');

    // 2. Employees listing
    console.log('2️⃣ Testing /api/employees...');
    const emps = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/employees',
      method: 'GET'
    });
    assert.strictEqual(emps.status, 200);
    assert.strictEqual(emps.data.ok, true);
    assert.strictEqual(emps.data.employees.length, 17);
    console.log(`   ✅ /api/employees passed! Total employees: ${emps.data.employees.length}`);

    // 3. Login test - Mahmoud Hashim
    console.log('3️⃣ Testing /api/auth/login with Mahmoud Hashim...');
    const loginRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: 'mahmoud.hashim@samaagroup.net',
      password: 'mahmoud123'
    });
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.data.ok, true);
    assert.ok(loginRes.data.token, 'Token must be present');
    assert.strictEqual(loginRes.data.user.id, 8);
    const token = loginRes.data.token;
    console.log('   ✅ /api/auth/login passed! Token generated successfully.');

    // 4. Auth Me test
    console.log('4️⃣ Testing /api/auth/me...');
    const meRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/auth/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.data.ok, true);
    assert.strictEqual(meRes.data.user.email, 'mahmoud.hashim@samaagroup.net');
    console.log('   ✅ /api/auth/me passed!');

    // 5. Evaluations list test
    console.log('5️⃣ Testing /api/evaluations...');
    const evalsRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/evaluations',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(evalsRes.status, 200);
    assert.strictEqual(evalsRes.data.ok, true);
    assert.strictEqual(evalsRes.data.colleagues.length, 16);
    // Strict self-exclusion check: Mahmoud Hashim (id: 8) must NOT be in the colleagues list
    const foundSelf = evalsRes.data.colleagues.find(c => c.employee.id === 8);
    assert.strictEqual(foundSelf, undefined, 'Self must never be present in evaluation colleagues list');
    console.log(`   ✅ /api/evaluations passed! Self excluded, 16 colleagues returned.`);

    // 6. Save Draft Evaluation
    console.log('6️⃣ Testing /api/evaluations/save draft...');
    const saveRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/evaluations/save',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }, {
      evaluateeId: 1, // Hazem Khaled
      moduleAnswers: { m1: { q1: 5, q2: 5, q3: 4 } },
      textAnswers: { m1: 'تعاون ممتاز وتقييم اختباري للتأكد من الحفظ الفعلي' },
      managerAnswers: {},
      progressPct: 20
    });
    assert.strictEqual(saveRes.status, 200);
    assert.strictEqual(saveRes.data.ok, true);
    console.log('   ✅ /api/evaluations/save draft passed!');

    // 7. Prevent self evaluation
    console.log('7️⃣ Testing prevention of self-evaluation...');
    const selfEvalRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/evaluations/save',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }, {
      evaluateeId: 8, // Mahmoud Hashim himself
      moduleAnswers: { m1: { q1: 5 } }
    });
    assert.strictEqual(selfEvalRes.status, 403, 'Self evaluation must be strictly forbidden (403)');
    console.log('   ✅ Self-evaluation strictly forbidden (403)!');

    // 8. Analytics
    console.log('8️⃣ Testing /api/analytics...');
    const analyticsRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/analytics',
      method: 'GET'
    });
    assert.strictEqual(analyticsRes.status, 200);
    assert.strictEqual(analyticsRes.data.ok, true);
    assert.ok(analyticsRes.data.summary.totalRecordedEvaluations > 0);
    assert.strictEqual(analyticsRes.data.rankings.length, 17);
    console.log(`   ✅ /api/analytics passed! Total evals recorded: ${analyticsRes.data.summary.totalRecordedEvaluations}, Avg Score: ${analyticsRes.data.summary.overallCompanyAvg}`);

    console.log('\n🎉 ALL 8 INTEGRATION TESTS PASSED WITH 100% SUCCESS!');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

runTests();
