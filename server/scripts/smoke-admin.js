// Smoke test for SuperAdmin full-visibility endpoints (local in-memory Mongo).
// Usage: node scripts/smoke-admin.js  (run from ~/workspace/splittrack/server)
const { MongoMemoryServer } = require('mongodb-memory-server');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = 'smoke-test-secret';
  process.env.JWT_EXPIRES_IN = '7d';

  const app = require('/home/hatch/workspace/splittrack/server/server.js');
  const server = app.listen(0);
  await new Promise((r) => server.on('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function call(method, path, token, body) {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* ignore */ }
    return { status: res.status, json };
  }

  try {
    // 1. SuperAdmin is auto-seeded on first request; log in.
    const saLogin = await call('POST', '/auth/login', null, {
      emailOrPhone: 'superadmin@splittrack.app',
      password: 'SuperAdmin123!',
    });
    check('superadmin login (seeded on first request)', saLogin.status === 200 && !!saLogin.json?.data?.token, `status=${saLogin.status}`);
    const saToken = saLogin.json?.data?.token;

    // 2. Two normal users.
    const userA = await call('POST', '/auth/signup', null, { name: 'Ali Admin', emailOrPhone: 'ali@smoke.local', password: 'Pass123!' });
    check('signup user A', userA.status === 201 && !!userA.json?.data?.token, `status=${userA.status}`);
    const tokenA = userA.json?.data?.token;
    const idA = userA.json?.data?.user?._id;
    const userB = await call('POST', '/auth/signup', null, { name: 'Bilal Member', emailOrPhone: 'bilal@smoke.local', password: 'Pass123!' });
    check('signup user B', userB.status === 201 && !!userB.json?.data?.token, `status=${userB.status}`);
    const tokenB = userB.json?.data?.token;

    // 3. A creates a group and an expense.
    const grp = await call('POST', '/groups', tokenA, { name: 'Smoke Group' });
    check('user A creates group', grp.status === 201, `status=${grp.status}`);
    const groupId = grp.json?.data?.group?._id;
    const inviteCode = grp.json?.data?.group?.inviteCode;
    const exp = await call('POST', `/groups/${groupId}/expenses`, tokenA, {
      title: 'Smoke Dinner',
      amount: 1000,
      category: 'Food',
      date: new Date().toISOString().slice(0, 10),
      paidBy: idA,
      splitMethod: 'EQUAL',
      splitBetween: [{ user: idA, shareAmount: 1000 }],
      memberIds: [idA],
    });
    check('user A adds expense', exp.status === 201, `status=${exp.status} ${exp.json?.error || ''}`);
    const expenseId = exp.json?.data?.expense?._id;

    // 4. B requests to join (PENDING), and A's expense gets a PENDING edit request.
    const join = await call('POST', `/groups/join/${inviteCode}`, tokenB);
    check('user B join request pending', join.status === 201, `status=${join.status} ${join.json?.error || ''}`);
    const Expense = require('/home/hatch/workspace/splittrack/server/models/Expense');
    await Expense.updateOne(
      { _id: expenseId },
      { $set: { editRequest: { status: 'PENDING', reason: 'Amount galat hai', requestedAt: new Date() } } }
    );

    // 5. SuperAdmin endpoints.
    const exps = await call('GET', '/admin/expenses', saToken);
    const expRow = (exps.json?.data?.expenses || []).find((e) => e._id === expenseId);
    check('GET /admin/expenses 200 + shape', exps.status === 200 && Array.isArray(exps.json?.data?.expenses), `status=${exps.status} count=${exps.json?.data?.expenses?.length}`);
    check('expense row has group/payer/creator names', !!expRow && expRow.group?.name === 'Smoke Group' && expRow.paidBy?.name === 'Ali Admin' && expRow.createdBy?.name === 'Ali Admin' && expRow.title === 'Smoke Dinner' && expRow.amount === 1000, JSON.stringify(expRow || null));

    const act = await call('GET', '/admin/activity', saToken);
    const actRows = act.json?.data?.activity || [];
    check('GET /admin/activity 200 + entries with actor+group', act.status === 200 && actRows.length >= 2 && actRows.every((a) => a.action && a.actor?.name && a.group?.name), `status=${act.status} count=${actRows.length}`);

    const reqs = await call('GET', '/admin/requests', saToken);
    const jr = reqs.json?.data?.joinRequests || [];
    const er = reqs.json?.data?.editRequests || [];
    check('GET /admin/requests 200 + pending join request', reqs.status === 200 && jr.some((r) => r.user?.name === 'Bilal Member' && r.group?.name === 'Smoke Group'), `status=${reqs.status} joins=${jr.length}`);
    check('GET /admin/requests 200 + pending edit request with reason', er.some((r) => r.expenseTitle === 'Smoke Dinner' && r.requester?.name === 'Ali Admin' && r.reason === 'Amount galat hai'), `edits=${er.length}`);

    // 6. Access control: normal user must NOT see admin data; no token must fail.
    const forbidden = await call('GET', '/admin/expenses', tokenA);
    check('normal user gets 403 on /admin/expenses', forbidden.status === 403, `status=${forbidden.status}`);
    const unauth = await call('GET', '/admin/requests', null);
    check('no token gets 401 on /admin/requests', unauth.status === 401, `status=${unauth.status}`);

    // 7. Existing admin endpoints still work.
    const stats = await call('GET', '/admin/stats', saToken);
    check('GET /admin/stats still works', stats.status === 200 && stats.json?.data?.totalUsers === 3, `status=${stats.status} totalUsers=${stats.json?.data?.totalUsers}`);
  } finally {
    server.close();
    const mongoose = require('mongoose');
    await mongoose.disconnect().catch(() => {});
    await mongod.stop();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('SMOKE ERROR', e);
  process.exit(1);
});
