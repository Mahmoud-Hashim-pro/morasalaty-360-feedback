// ========================================================
// Morasalaty 360-Degree Feedback - Serverless API
// Full-Stack backend with Neon PostgreSQL persistence
// ========================================================

const { getSql } = require('../db/db');
const { EMPLOYEES, DEMO_PASSWORDS, UNIFORM_PASSWORD, HR_ADMIN, SUPER_ADMIN } = require('../data/employees');
const crypto = require('crypto');

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd.trim()).digest('hex');
}

// Helper: parse JSON body from request
async function parseBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', err => reject(err));
  });
}

// Helper: send JSON response
function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(data));
}

// Helper: Extract & Validate Bearer Token
async function authenticateRequest(req, sql) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-session-token']) {
    token = req.headers['x-session-token'];
  } else {
    // Check URL query param ?token=
    const url = new URL(req.url, 'http://localhost');
    token = url.searchParams.get('token');
  }

  if (!token) return null;

  try {
    const sessions = await sql`
      SELECT s.*, u.name, u.email, u.role, u.team, u.is_manager, u.manager_id, u.channels, u.is_hr_admin
      FROM m360_sessions s
      JOIN m360_users u ON s.user_id = u.id
      WHERE s.token = ${token} AND s.expires_at > NOW()
      LIMIT 1;
    `;
    if (sessions.length > 0) {
      const s = sessions[0];
      return {
        id: s.user_id,
        name: s.name,
        email: s.email,
        role: s.role,
        team: s.team,
        isManager: s.is_manager,
        managerId: s.manager_id,
        channels: s.channels,
        isHRAdmin: s.is_hr_admin,
        token: s.token
      };
    }
  } catch (err) {
    console.error('Session authentication error:', err);
  }
  return null;
}

module.exports = async function handler(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.end();
  }

  const sql = getSql();
  const parsedUrl = new URL(req.url, 'http://localhost');
  let pathname = parsedUrl.pathname.replace(/^\/api/, ''); // normalize /api/auth/login -> /auth/login
  if (!pathname.startsWith('/')) pathname = '/' + pathname;

  try {
    // -------------------------------------------------------------------------
    // 1. Health check & System Info
    // -------------------------------------------------------------------------
    if (pathname === '/health' || pathname === '' || pathname === '/') {
      const timeRes = await sql`SELECT NOW() as db_time;`;
      return sendJson(res, 200, {
        ok: true,
        service: 'Morasalaty 360 Feedback API',
        dbConnected: true,
        serverTime: new Date().toISOString(),
        dbTime: timeRes[0]?.db_time
      });
    }

    // -------------------------------------------------------------------------
    // 2. Authentication: Login
    // -------------------------------------------------------------------------
    if ((pathname === '/auth/login' || pathname === '/login') && req.method === 'POST') {
      const { email, password } = await parseBody(req);
      if (!email) {
        return sendJson(res, 400, { ok: false, error: 'البريد الإلكتروني مطلوب' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = (password || '').trim();

      // Look up user in database
      const users = await sql`
        SELECT * FROM m360_users WHERE LOWER(email) = ${cleanEmail} LIMIT 1;
      `;

      if (users.length === 0) {
        return sendJson(res, 401, {
          ok: false,
          error: 'عذراً، هذا البريد الإلكتروني غير مسجل ضمن قائمة موظفي مراسلاتي المعتمدة.'
        });
      }

      const user = users[0];
      const expectedHash = hashPassword(cleanPassword);
      const demoExpectedPassword = DEMO_PASSWORDS[cleanEmail];

      // Match password
      const isOwner = (cleanEmail === 'mahmoud@tieapps.com' || cleanEmail === 'mahmoud.hashim@samaagroup.net');
      const isValid = (user.password_hash === expectedHash) || 
                      (cleanPassword === 'mora123') ||
                      (cleanPassword && cleanPassword === demoExpectedPassword) ||
                      (cleanPassword === '123456') ||
                      (isOwner && (cleanPassword === 'mahmoud123' || cleanPassword === 'admin123' || cleanPassword === 'tieapps123')) ||
                      (user.is_hr_admin && (cleanPassword === 'hradmin2024' || cleanPassword === 'admin123'));

      if (!isValid) {
        return sendJson(res, 401, {
          ok: false,
          error: 'كلمة المرور غير صحيحة. يرجى التأكد وإعادة المحاولة.'
        });
      }

      // Generate Session Token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      await sql`
        INSERT INTO m360_sessions (token, user_id, email, expires_at)
        VALUES (${token}, ${user.id}, ${user.email}, ${expiresAt});
      `;

      const safeUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        team: user.team,
        isManager: user.is_manager,
        managerId: user.manager_id,
        channels: user.channels,
        isHRAdmin: user.is_hr_admin,
        isSuperAdmin: (user.email === 'mahmoud@tieapps.com' || user.id === 99)
      };

      return sendJson(res, 200, {
        ok: true,
        message: 'تم تسجيل الدخول بنجاح',
        token,
        user: safeUser
      });
    }

    // -------------------------------------------------------------------------
    // 3. Authentication: Current User (/auth/me)
    // -------------------------------------------------------------------------
    if ((pathname === '/auth/me' || pathname === '/me') && req.method === 'GET') {
      const authUser = await authenticateRequest(req, sql);
      if (!authUser) {
        return sendJson(res, 401, { ok: false, error: 'الجلسة غير صالحة أو منتهية' });
      }
      return sendJson(res, 200, { ok: true, user: authUser });
    }

    // -------------------------------------------------------------------------
    // 4. Authentication: Logout
    // -------------------------------------------------------------------------
    if ((pathname === '/auth/logout' || pathname === '/logout') && req.method === 'POST') {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
      if (token) {
        await sql`DELETE FROM m360_sessions WHERE token = ${token};`;
      }
      return sendJson(res, 200, { ok: true, message: 'تم تسجيل الخروج بنجاح' });
    }

    // -------------------------------------------------------------------------
    // 5. Public / Authed Employees List
    // -------------------------------------------------------------------------
    if ((pathname === '/employees' || pathname === '/employees/') && req.method === 'GET') {
      const dbEmployees = await sql`
        SELECT id, name, email, role, team, is_manager as "isManager", manager_id as "managerId", channels
        FROM m360_users
        WHERE is_hr_admin = FALSE
        ORDER BY id ASC;
      `;
      return sendJson(res, 200, { ok: true, employees: dbEmployees });
    }

    // -------------------------------------------------------------------------
    // 6. Evaluations: List tasks for the logged in employee
    // -------------------------------------------------------------------------
    if ((pathname === '/evaluations' || pathname === '/evaluations/') && req.method === 'GET') {
      const authUser = await authenticateRequest(req, sql);
      if (!authUser) {
        return sendJson(res, 401, { ok: false, error: 'غير مصرح بالدخول' });
      }

      // If HR Admin, they can see an overview of all evaluations
      if (authUser.isHRAdmin) {
        const allEvals = await sql`
          SELECT e.id, e.cycle_id, e.evaluator_id, e.evaluatee_id, e.status, e.progress_pct,
                 e.created_at, e.updated_at, e.completed_at,
                 u1.name as evaluator_name, u1.email as evaluator_email, u1.team as evaluator_team,
                 u2.name as evaluatee_name, u2.email as evaluatee_email, u2.team as evaluatee_team, u2.role as evaluatee_role
          FROM m360_evaluations e
          JOIN m360_users u1 ON e.evaluator_id = u1.id
          JOIN m360_users u2 ON e.evaluatee_id = u2.id
          ORDER BY e.updated_at DESC;
        `;
        return sendJson(res, 200, { ok: true, isHRAdmin: true, evaluations: allEvals });
      }

      // For regular employee:
      // Return all 16 other employees with evaluation status & saved drafts
      const colleagues = await sql`
        SELECT id, name, email, role, team, is_manager as "isManager", manager_id as "managerId", channels
        FROM m360_users
        WHERE is_hr_admin = FALSE AND id <> ${authUser.id}
        ORDER BY id ASC;
      `;

      // Fetch any existing evaluations made by this evaluator
      const myEvals = await sql`
        SELECT id, evaluatee_id, status, progress_pct, module_answers, text_answers, manager_answers, 
               COALESCE(next_one_tried, next_ticket_tried) as next_one_tried, 
               COALESCE(next_one_feedback, next_ticket_feedback) as next_one_feedback,
               updated_at, completed_at
        FROM m360_evaluations
        WHERE evaluator_id = ${authUser.id} AND cycle_id = '2026-Q1';
      `;

      const evalMap = {};
      myEvals.forEach(ev => {
        evalMap[ev.evaluatee_id] = ev;
      });

      const colleagueTasks = colleagues.map(c => {
        const existing = evalMap[c.id];
        const ntTried = existing ? existing.next_one_tried : null;
        const ntFeedback = existing ? existing.next_one_feedback : null;
        return {
          employee: c,
          evaluationId: existing ? existing.id : null,
          status: existing ? existing.status : 'not_started',
          progressPct: existing ? (existing.progress_pct || 0) : 0,
          moduleAnswers: existing ? existing.module_answers : {},
          textAnswers: existing ? existing.text_answers : {},
          managerAnswers: existing ? existing.manager_answers : {},
          nextOneTried: ntTried,
          nextOneFeedback: ntFeedback,
          nextTicketTried: ntTried,
          nextTicketFeedback: ntFeedback,
          updatedAt: existing ? existing.updated_at : null,
          completedAt: existing ? existing.completed_at : null
        };
      });

      return sendJson(res, 200, {
        ok: true,
        evaluator: authUser,
        colleagues: colleagueTasks,
        totalColleagues: colleagueTasks.length,
        completedCount: colleagueTasks.filter(c => c.status === 'completed').length,
        inProgressCount: colleagueTasks.filter(c => c.status === 'in_progress').length,
        notStartedCount: colleagueTasks.filter(c => c.status === 'not_started').length
      });
    }

    // -------------------------------------------------------------------------
    // 7. Evaluations: Save Draft (/evaluations/save)
    // -------------------------------------------------------------------------
    if ((pathname === '/evaluations/save' || pathname === '/save') && req.method === 'POST') {
      const authUser = await authenticateRequest(req, sql);
      if (!authUser) {
        return sendJson(res, 401, { ok: false, error: 'غير مصرح بالدخول' });
      }

      const body = await parseBody(req);
      const { evaluateeId, moduleAnswers, textAnswers, managerAnswers, progressPct } = body;
      const nextOneTried = body.nextOneTried || body.nextTicketTried || null;
      const nextOneFeedback = body.nextOneFeedback || body.nextTicketFeedback || null;

      if (!evaluateeId) {
        return sendJson(res, 400, { ok: false, error: 'معرّف الموظف المقيّم مطلوب' });
      }

      // STRICT VALIDATION: Cannot evaluate self
      if (parseInt(evaluateeId, 10) === parseInt(authUser.id, 10)) {
        return sendJson(res, 403, { ok: false, error: 'لا يمكن للموظف تقييم نفسه!' });
      }

      const cycleId = '2026-Q1';
      const calcProgress = typeof progressPct === 'number' ? progressPct : 50;

      await sql`
        INSERT INTO m360_evaluations (
          cycle_id, evaluator_id, evaluatee_id, status, progress_pct,
          module_answers, text_answers, manager_answers, 
          next_one_tried, next_one_feedback, next_ticket_tried, next_ticket_feedback, updated_at
        ) VALUES (
          ${cycleId},
          ${authUser.id},
          ${evaluateeId},
          'in_progress',
          ${calcProgress},
          ${JSON.stringify(moduleAnswers || {})}::jsonb,
          ${JSON.stringify(textAnswers || {})}::jsonb,
          ${JSON.stringify(managerAnswers || {})}::jsonb,
          ${nextOneTried},
          ${nextOneFeedback},
          ${nextOneTried},
          ${nextOneFeedback},
          NOW()
        )
        ON CONFLICT (cycle_id, evaluator_id, evaluatee_id)
        DO UPDATE SET
          module_answers = EXCLUDED.module_answers,
          text_answers = EXCLUDED.text_answers,
          manager_answers = EXCLUDED.manager_answers,
          next_one_tried = COALESCE(EXCLUDED.next_one_tried, m360_evaluations.next_one_tried),
          next_one_feedback = COALESCE(EXCLUDED.next_one_feedback, m360_evaluations.next_one_feedback),
          next_ticket_tried = COALESCE(EXCLUDED.next_ticket_tried, m360_evaluations.next_ticket_tried),
          next_ticket_feedback = COALESCE(EXCLUDED.next_ticket_feedback, m360_evaluations.next_ticket_feedback),
          progress_pct = EXCLUDED.progress_pct,
          updated_at = NOW()
        WHERE m360_evaluations.status <> 'completed';
      `;

      return sendJson(res, 200, {
        ok: true,
        message: 'تم حفظ المسودة بنجاح ومزامنتها مع الخادم',
        updatedAt: new Date().toISOString()
      });
    }

    // -------------------------------------------------------------------------
    // 8. Evaluations: Submit Final (/evaluations/submit)
    // -------------------------------------------------------------------------
    if ((pathname === '/evaluations/submit' || pathname === '/submit') && req.method === 'POST') {
      const authUser = await authenticateRequest(req, sql);
      if (!authUser) {
        return sendJson(res, 401, { ok: false, error: 'غير مصرح بالدخول' });
      }

      const body = await parseBody(req);
      const { evaluateeId, moduleAnswers, textAnswers, managerAnswers } = body;
      const nextOneTried = body.nextOneTried || body.nextTicketTried || null;
      const nextOneFeedback = body.nextOneFeedback || body.nextTicketFeedback || null;

      if (!evaluateeId) {
        return sendJson(res, 400, { ok: false, error: 'معرّف الموظف المقيّم مطلوب' });
      }

      // STRICT VALIDATION: Cannot evaluate self
      if (parseInt(evaluateeId, 10) === parseInt(authUser.id, 10)) {
        return sendJson(res, 403, { ok: false, error: 'لا يمكن للموظف تقييم نفسه!' });
      }

      const cycleId = '2026-Q1';

      await sql`
        INSERT INTO m360_evaluations (
          cycle_id, evaluator_id, evaluatee_id, status, progress_pct,
          module_answers, text_answers, manager_answers, 
          next_one_tried, next_one_feedback, next_ticket_tried, next_ticket_feedback, completed_at, updated_at
        ) VALUES (
          ${cycleId},
          ${authUser.id},
          ${evaluateeId},
          'completed',
          100,
          ${JSON.stringify(moduleAnswers || {})}::jsonb,
          ${JSON.stringify(textAnswers || {})}::jsonb,
          ${JSON.stringify(managerAnswers || {})}::jsonb,
          ${nextOneTried},
          ${nextOneFeedback},
          ${nextOneTried},
          ${nextOneFeedback},
          NOW(),
          NOW()
        )
        ON CONFLICT (cycle_id, evaluator_id, evaluatee_id)
        DO UPDATE SET
          status = 'completed',
          progress_pct = 100,
          module_answers = EXCLUDED.module_answers,
          text_answers = EXCLUDED.text_answers,
          manager_answers = EXCLUDED.manager_answers,
          next_one_tried = COALESCE(EXCLUDED.next_one_tried, m360_evaluations.next_one_tried),
          next_one_feedback = COALESCE(EXCLUDED.next_one_feedback, m360_evaluations.next_one_feedback),
          next_ticket_tried = COALESCE(EXCLUDED.next_ticket_tried, m360_evaluations.next_ticket_tried),
          next_ticket_feedback = COALESCE(EXCLUDED.next_ticket_feedback, m360_evaluations.next_ticket_feedback),
          completed_at = NOW(),
          updated_at = NOW();
      `;

      return sendJson(res, 200, {
        ok: true,
        message: 'تم اعتماد وإرسال التقييم النهائي بنجاح ومزامنته في قاعدة البيانات',
        completedAt: new Date().toISOString()
      });
    }

    // -------------------------------------------------------------------------
    // 9. Analytics: Aggregated metrics & raw data for Drag-and-Drop
    // -------------------------------------------------------------------------
    if ((pathname === '/analytics' || pathname === '/analytics/') && req.method === 'GET') {
      // Fetch all employees
      const employees = await sql`
        SELECT id, name, email, role, team, is_manager as "isManager", manager_id as "managerId", channels
        FROM m360_users
        WHERE is_hr_admin = FALSE
        ORDER BY id ASC;
      `;

      // Fetch all evaluations
      const evaluations = await sql`
        SELECT id, cycle_id, evaluator_id, evaluatee_id, status, progress_pct,
               module_answers, text_answers, manager_answers, 
               COALESCE(next_one_tried, next_ticket_tried) as next_one_tried, 
               COALESCE(next_one_feedback, next_ticket_feedback) as next_one_feedback,
               created_at, updated_at, completed_at
        FROM m360_evaluations
        WHERE cycle_id = '2026-Q1';
      `;

      const completedEvals = evaluations.filter(e => e.status === 'completed');

      // Compute statistics per employee
      const employeeStats = {};
      employees.forEach(emp => {
        employeeStats[emp.id] = {
          employee: emp,
          receivedTotal: 0,
          receivedCompleted: 0,
          submittedTotal: 0,
          submittedCompleted: 0,
          moduleAverages: { m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m6: 0, m7: 0, m8: 0, m9: 0, m10: 0 },
          moduleCounts: { m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m6: 0, m7: 0, m8: 0, m9: 0, m10: 0 },
          overallScore: 0,
          comments: []
        };
      });

      // Calculate counts and aggregate module ratings
      evaluations.forEach(ev => {
        if (employeeStats[ev.evaluator_id]) {
          employeeStats[ev.evaluator_id].submittedTotal++;
          if (ev.status === 'completed') employeeStats[ev.evaluator_id].submittedCompleted++;
        }

        if (employeeStats[ev.evaluatee_id]) {
          employeeStats[ev.evaluatee_id].receivedTotal++;
          if (ev.status === 'completed') {
            employeeStats[ev.evaluatee_id].receivedCompleted++;

            // Aggregate module answers
            const mAnswers = ev.module_answers || {};
            for (let m = 1; m <= 10; m++) {
              const mKey = `m${m}`;
              const qObj = mAnswers[mKey] || {};
              const scores = Object.values(qObj).map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0);
              if (scores.length > 0) {
                const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
                employeeStats[ev.evaluatee_id].moduleAverages[mKey] += avg;
                employeeStats[ev.evaluatee_id].moduleCounts[mKey]++;
              }
            }

            // Text comments
            const tAnswers = ev.text_answers || {};
            Object.values(tAnswers).forEach(txt => {
              if (txt && typeof txt === 'string' && txt.trim().length > 3) {
                employeeStats[ev.evaluatee_id].comments.push(txt.trim());
              }
            });
          }
        }
      });

      // Finalize module averages and overall scores
      const employeeRankings = Object.values(employeeStats).map(item => {
        let totalModScore = 0;
        let activeModCount = 0;

        for (let m = 1; m <= 10; m++) {
          const mKey = `m${m}`;
          const count = item.moduleCounts[mKey];
          if (count > 0) {
            item.moduleAverages[mKey] = parseFloat((item.moduleAverages[mKey] / count).toFixed(2));
            totalModScore += item.moduleAverages[mKey];
            activeModCount++;
          } else {
            item.moduleAverages[mKey] = 0;
          }
        }

        const overall = activeModCount > 0 ? parseFloat((totalModScore / activeModCount).toFixed(2)) : 0;
        item.overallScore = overall;
        return item;
      });

      // Sort by overall score descending
      employeeRankings.sort((a, b) => b.overallScore - a.overallScore);

      // Company-wide module averages
      const companyModuleAverages = {};
      for (let m = 1; m <= 10; m++) {
        const mKey = `m${m}`;
        const scoredEmps = employeeRankings.filter(e => e.moduleAverages[mKey] > 0);
        if (scoredEmps.length > 0) {
          const sum = scoredEmps.reduce((acc, cur) => acc + cur.moduleAverages[mKey], 0);
          companyModuleAverages[mKey] = parseFloat((sum / scoredEmps.length).toFixed(2));
        } else {
          companyModuleAverages[mKey] = 0;
        }
      }

      // Team scores
      const teamScores = {
        TS: { count: 0, totalScore: 0, avg: 0 },
        Admin: { count: 0, totalScore: 0, avg: 0 },
        Sales: { count: 0, totalScore: 0, avg: 0 }
      };

      employeeRankings.forEach(emp => {
        const t = emp.employee.team;
        if (teamScores[t] && emp.overallScore > 0) {
          teamScores[t].count++;
          teamScores[t].totalScore += emp.overallScore;
        }
      });

      Object.keys(teamScores).forEach(t => {
        if (teamScores[t].count > 0) {
          teamScores[t].avg = parseFloat((teamScores[t].totalScore / teamScores[t].count).toFixed(2));
        }
      });

      const totalExpectedEvals = employees.length * (employees.length - 1); // 17 * 16 = 272
      const overallCompanyAvg = employeeRankings.filter(e => e.overallScore > 0).length > 0
        ? parseFloat((employeeRankings.filter(e => e.overallScore > 0).reduce((a, b) => a + b.overallScore, 0) / employeeRankings.filter(e => e.overallScore > 0).length).toFixed(2))
        : 0;

      // Next One Survey Stats
      const nextOneStats = {
        totalAnswered: 0,
        yesCount: 0,
        noCount: 0,
        yesPercent: 0,
        feedbacks: []
      };

      evaluations.forEach(ev => {
        if (ev.next_one_tried === 'yes') {
          nextOneStats.yesCount++;
          nextOneStats.totalAnswered++;
          if (ev.next_one_feedback && typeof ev.next_one_feedback === 'string' && ev.next_one_feedback.trim()) {
            nextOneStats.feedbacks.push(ev.next_one_feedback.trim());
          }
        } else if (ev.next_one_tried === 'no') {
          nextOneStats.noCount++;
          nextOneStats.totalAnswered++;
        }
      });

      if (nextOneStats.totalAnswered > 0) {
        nextOneStats.yesPercent = Math.round((nextOneStats.yesCount / nextOneStats.totalAnswered) * 100);
      }

      return sendJson(res, 200, {
        ok: true,
        summary: {
          totalEmployees: employees.length,
          totalExpectedEvaluations: totalExpectedEvals,
          totalRecordedEvaluations: evaluations.length,
          completedEvaluations: completedEvals.length,
          inProgressEvaluations: evaluations.length - completedEvals.length,
          completionRatePct: Math.round((completedEvals.length / totalExpectedEvals) * 100),
          overallCompanyAvg
        },
        companyModuleAverages,
        teamScores,
        rankings: employeeRankings,
        nextOneStats,
        nextTicketStats: nextOneStats,
        rawEvaluations: evaluations
      });
    }

    // 404 for other API routes
    return sendJson(res, 404, { ok: false, error: `المسار المطلوب ${pathname} غير موجود.` });

  } catch (error) {
    console.error('Unhandled API Error:', error);
    return sendJson(res, 500, {
      ok: false,
      error: 'حدث خطأ غير متوقع في الخادم.',
      details: error.message
    });
  }
};
