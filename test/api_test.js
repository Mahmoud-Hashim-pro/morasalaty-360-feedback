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

  // Ensure clean starting state
  try {
    const { getSql } = require('../db/db');
    await getSql()`TRUNCATE TABLE m360_evaluations RESTART IDENTITY;`;
    await getSql()`TRUNCATE TABLE m360_sessions RESTART IDENTITY;`;
  } catch (e) {}

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
    const adminToken = ownerRes.data.token;
    console.log('   ✅ /api/auth/login passed for Platform Owner (mahmoud@tieapps.com)!');

    // 3b. Login test - Uniform password (mora123) with employee
    console.log('3️⃣b Testing /api/auth/login with employee (hazem.khaled@samaagroup.net)...');
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
    const employeeToken = loginRes.data.token;
    console.log('   ✅ /api/auth/login passed! Employee token generated.');

    // 4. Auth Me test
    console.log('4️⃣ Testing /api/auth/me...');
    const meRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/auth/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${employeeToken}` }
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
      headers: { 'Authorization': `Bearer ${employeeToken}` }
    });
    assert.strictEqual(evalsRes.status, 200);
    assert.strictEqual(evalsRes.data.ok, true);
    assert.strictEqual(evalsRes.data.colleagues.length, 16);
    // Strict self-exclusion check: Hazem Khaled (id: 1) must NOT be in the colleagues list
    const foundSelf = evalsRes.data.colleagues.find(c => c.employee.id === 1);
    assert.strictEqual(foundSelf, undefined, 'Self must never be present in evaluation colleagues list');
    console.log(`   ✅ /api/evaluations passed! Self excluded, 16 colleagues returned.`);

    // 6. Save Draft Evaluation (8 merged questions)
    console.log('6️⃣ Testing /api/evaluations/save draft for 8 merged questions...');
    const saveRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/evaluations/save',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${employeeToken}`
      }
    }, {
      evaluateeId: 2, // Ibrahim Nasser
      moduleAnswers: {
        m1: { m1q1: 5 },
        m2: { m2q1: 4 },
        m3: { m3q1: 5 }
      },
      textAnswers: { strength: 'التزام متميز بـ SLA وسرعة الاستجابة' },
      managerAnswers: {},
      nextOneTried: 'yes',
      nextOneFeedback: 'تجربة ممتازة في نكست ون',
      progressPct: 37
    });
    assert.strictEqual(saveRes.status, 200);
    assert.strictEqual(saveRes.data.ok, true);
    console.log('   ✅ /api/evaluations/save draft passed with 8 composite questions format!');

    // 6b. Submit Final Evaluation across all 8 composite questions
    console.log('6️⃣b Testing /api/evaluations/submit final across all 8 questions...');
    const submitRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/evaluations/submit',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${employeeToken}`
      }
    }, {
      evaluateeId: 2,
      moduleAnswers: {
        m1: { m1q1: 5 },
        m2: { m2q1: 5 },
        m3: { m3q1: 4 },
        m4: { m4q1: 5 },
        m5: { m5q1: 5 },
        m6: { m6q1: 4 },
        m7: { m7q1: 5 },
        m8: { m8q1: 5 }
      },
      textAnswers: {
        strength: 'سرعة استجابة ممتازة ودعم متواصل للزملاء وقت الذروة',
        improvement: 'تعزيز توثيق حلول المشاكل المعقدة في النظام'
      },
      managerAnswers: {},
      nextOneTried: 'yes',
      nextOneFeedback: 'أداة ممتازة وسريعة'
    });
    assert.strictEqual(submitRes.status, 200);
    assert.strictEqual(submitRes.data.ok, true);
    console.log('   ✅ /api/evaluations/submit passed with all 8 questions and Next One response!');

    // 7. Prevent self evaluation
    console.log('7️⃣ Testing prevention of self-evaluation...');
    const selfEvalRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/evaluations/save',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${employeeToken}`
      }
    }, {
      evaluateeId: 1, // Hazem Khaled himself
      moduleAnswers: { m1: { m1q1: 5 } }
    });
    assert.strictEqual(selfEvalRes.status, 403, 'Self evaluation must be strictly forbidden (403)');
    console.log('   ✅ Self-evaluation strictly forbidden (403)!');

    // 8. Strict Confidentiality Verification for Regular Employees
    console.log('8️⃣ Testing strict confidentiality for completed evaluation...');
    const evalsCheckRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/evaluations',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${employeeToken}` }
    });
    assert.strictEqual(evalsCheckRes.status, 200);
    const col2 = evalsCheckRes.data.colleagues.find(c => c.employee.id === 2);
    assert.strictEqual(col2.status, 'completed');
    // Ensure answers are strictly wiped from API payload
    assert.deepStrictEqual(col2.moduleAnswers, {}, 'moduleAnswers must be wiped for completed evaluations');
    assert.deepStrictEqual(col2.textAnswers, {}, 'textAnswers must be wiped for completed evaluations');
    assert.strictEqual(col2.nextOneTried, null, 'nextOneTried must be wiped for completed evaluations');
    console.log('   ✅ Answers strictly hidden from employee after completion (100% confidential)!');

    // 8b. Re-edit prevention
    console.log('8️⃣b Testing prevention of modifying completed evaluation...');
    const reSaveRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/evaluations/save',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${employeeToken}`
      }
    }, {
      evaluateeId: 2,
      moduleAnswers: { m1: { m1q1: 1 } }
    });
    assert.strictEqual(reSaveRes.status, 403, 'Modifying completed evaluation must be forbidden (403)');
    console.log('   ✅ Completed evaluation modification strictly forbidden (403)!');

    // 9. Analytics Authorization & Confidentiality Protection
    console.log('9️⃣ Testing /api/analytics authorization & confidentiality...');
    // Anonymous call -> 401
    const anonAnalytics = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/analytics',
      method: 'GET'
    });
    assert.strictEqual(anonAnalytics.status, 401, 'Anonymous analytics must return 401');
    console.log('   ✅ Anonymous access to /api/analytics rejected with 401!');

    // Regular employee call -> 403 Forbidden
    const empAnalytics = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/analytics',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${employeeToken}` }
    });
    assert.strictEqual(empAnalytics.status, 403, 'Regular employee access to /api/analytics must return 403');
    console.log('   ✅ Regular employee access to /api/analytics forbidden with 403!');

    // Admin / Platform Owner call -> 200 OK
    const adminAnalytics = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/analytics',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(adminAnalytics.status, 200);
    assert.strictEqual(adminAnalytics.data.ok, true);
    assert.strictEqual(adminAnalytics.data.summary.totalEmployees, 17);
    assert.strictEqual(adminAnalytics.data.summary.totalExpectedEvaluations, 272);
    assert.strictEqual(adminAnalytics.data.rankings.length, 17);
    assert.strictEqual(Object.keys(adminAnalytics.data.companyModuleAverages).length, 8, 'Must have exactly 8 modules in analytics');
    assert.strictEqual(adminAnalytics.data.nextOneStats.yesCount, 1);
    assert.strictEqual(adminAnalytics.data.nextOneStats.totalAnswered, 1);
    console.log('   ✅ Admin / Platform Owner access to /api/analytics authorized (8 modules verified)!');

    console.log('\n🎉 ALL 9 COMPREHENSIVE INTEGRATION & CONFIDENTIALITY TESTS PASSED WITH 100% SUCCESS!');
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
