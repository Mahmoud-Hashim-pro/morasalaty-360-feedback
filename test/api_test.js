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

    // 3. Login test - Platform Owner / Super Admin (mahmoud@tieapps.com)
    console.log('3️⃣ Testing /api/auth/login with Platform Owner (mahmoud@tieapps.com)...');
    const ownerRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: 'mahmoud@tieapps.com',
      password: 'mora123'
    });
    assert.strictEqual(ownerRes.status, 200);
    assert.strictEqual(ownerRes.data.ok, true);
    assert.ok(ownerRes.data.token, 'Token must be present');
    assert.strictEqual(ownerRes.data.user.email, 'mahmoud@tieapps.com');
    assert.strictEqual(ownerRes.data.user.isHRAdmin, true);
    assert.strictEqual(ownerRes.data.user.isSuperAdmin, true);
    console.log('   ✅ /api/auth/login passed for Platform Owner (mahmoud@tieapps.com)!');

    // 3b. Login test - Uniform password (mora123) with employee
    console.log('3️⃣b Testing /api/auth/login with uniform password (mora123)...');
    const loginRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: 'hazem.khaled@samaagroup.net',
      password: 'mora123'
    });
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.data.ok, true);
    assert.strictEqual(loginRes.data.user.id, 1);
    const token = loginRes.data.token;
    console.log('   ✅ Uniform password (mora123) verified successfully!');
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
    assert.strictEqual(meRes.data.user.email, 'hazem.khaled@samaagroup.net');
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
    // Strict self-exclusion check: Hazem Khaled (id: 1) must NOT be in the colleagues list
    const foundSelf = evalsRes.data.colleagues.find(c => c.employee.id === 1);
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
      evaluateeId: 2, // Ibrahim Nasser
      moduleAnswers: { m1: { q1: 5, q2: 5, q3: 4 } },
      textAnswers: { m1: 'تعاون ممتاز وتقييم اختباري للتأكد من الحفظ الفعلي' },
      managerAnswers: {},
      nextTicketTried: 'yes',
      nextTicketFeedback: 'تجربة ممتازة في إدارة التذاكر وخدمة العملاء',
      progressPct: 20
    });
    assert.strictEqual(saveRes.status, 200);
    assert.strictEqual(saveRes.data.ok, true);
    console.log('   ✅ /api/evaluations/save draft passed with Next Ticket response!');

    // 6b. Submit Final Evaluation with Next Ticket
    console.log('6️⃣b Testing /api/evaluations/submit final...');
    const submitRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/evaluations/submit',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }, {
      evaluateeId: 2,
      moduleAnswers: { m1: { q1: 5, q2: 5, q3: 5 } },
      textAnswers: { m1: 'تقييم معتمد نهائي' },
      managerAnswers: {},
      nextTicketTried: 'yes',
      nextTicketFeedback: 'ممتازة وسريعة في خدمة العملاء'
    });
    assert.strictEqual(submitRes.status, 200);
    assert.strictEqual(submitRes.data.ok, true);
    console.log('   ✅ /api/evaluations/submit passed with Next Ticket persisted!');

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
      evaluateeId: 1, // Hazem Khaled himself
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
    assert.strictEqual(analyticsRes.data.summary.totalEmployees, 17);
    assert.strictEqual(analyticsRes.data.summary.totalExpectedEvaluations, 272);
    assert.strictEqual(analyticsRes.data.rankings.length, 17);
    assert.strictEqual(analyticsRes.data.nextTicketStats.yesCount, 1);
    assert.strictEqual(analyticsRes.data.nextTicketStats.totalAnswered, 1);
    console.log(`   ✅ /api/analytics passed! Next Ticket stats verified (yesCount: 1).`);

    console.log('\n🎉 ALL 8 INTEGRATION TESTS PASSED WITH 100% SUCCESS!');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exitCode = 1;
  } finally {
    try {
      const { getSql } = require('../db/db');
      await getSql()`TRUNCATE TABLE m360_evaluations RESTART IDENTITY;`;
      await getSql()`TRUNCATE TABLE m360_sessions RESTART IDENTITY;`;
    } catch (e) {}
    server.close();
  }
}

runTests();
