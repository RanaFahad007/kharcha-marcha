// Smoke test for the student "Monthly Pocket Money" system (local in-memory Mongo).
// Usage: node scripts/smoke-pocket-money.js  (run from ~/workspace/splittrack/server)
const { MongoMemoryServer } = require('mongodb-memory-server');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

function monthStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  return monthStr(new Date(y, m - 1 + delta, 1));
}
function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
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

  const now = new Date();
  const month = monthStr(now);
  const lastMonth = shiftMonth(month, -1);
  const today = now.toISOString().slice(0, 10);
  const lastMonthDate = `${lastMonth}-15`;
  const daysLeft = daysInMonth(month) - now.getDate() + 1;

  try {
    // 1. Two users.
    const userA = await call('POST', '/auth/signup', null, { name: 'Ali Student', emailOrPhone: 'ali@pm.local', password: 'Pass123!' });
    check('signup user A', userA.status === 201 && !!userA.json?.data?.token, `status=${userA.status}`);
    const tokenA = userA.json?.data?.token;
    const idA = userA.json?.data?.user?._id;
    const userB = await call('POST', '/auth/signup', null, { name: 'Bilal Student', emailOrPhone: 'bilal@pm.local', password: 'Pass123!' });
    check('signup user B', userB.status === 201 && !!userB.json?.data?.token, `status=${userB.status}`);
    const tokenB = userB.json?.data?.token;
    const idB = userB.json?.data?.user?._id;

    // 2. Set pocket money for this month.
    const set = await call('PUT', `/pocket-money/${month}`, tokenA, { pocketMoney: 20000 });
    check('PUT pocket money 20000', set.status === 200 && set.json?.data?.budget?.pocketMoney === 20000, `status=${set.status}`);
    const sum0 = await call('GET', `/pocket-money/${month}`, tokenA);
    check(
      'GET summary: budget set, spent 0, remaining 20000',
      sum0.status === 200 && sum0.json?.data?.pocketMoney === 20000 && sum0.json?.data?.spent === 0 && sum0.json?.data?.remaining === 20000 && sum0.json?.data?.budgetSet === true,
      JSON.stringify(sum0.json?.data || null)
    );

    // 3. Add two personal expenses.
    const e1 = await call('POST', `/pocket-money/${month}/expenses`, tokenA, { title: 'Mess khana', amount: 5000, category: 'food', date: today });
    check('POST personal expense food 5000', e1.status === 201 && !!e1.json?.data?.expense?._id, `status=${e1.status} ${e1.json?.error || ''}`);
    const expId1 = e1.json?.data?.expense?._id;
    const e2 = await call('POST', `/pocket-money/${month}/expenses`, tokenA, { title: 'Bus card', amount: 2000, category: 'transport', date: today, notes: 'monthly pass' });
    check('POST personal expense transport 2000', e2.status === 201, `status=${e2.status} ${e2.json?.error || ''}`);
    const expId2 = e2.json?.data?.expense?._id;

    // 4. Totals math: personal 7000, remaining 13000, safe daily.
    const sum1 = await call('GET', `/pocket-money/${month}`, tokenA);
    const d1 = sum1.json?.data || {};
    const expectedDaily = Math.round((13000 / daysLeft + Number.EPSILON) * 100) / 100;
    check(
      'totals math: personalSpent 7000, spent 7000, remaining 13000, daysLeft + safeDaily',
      d1.personalSpent === 7000 && d1.spent === 7000 && d1.remaining === 13000 && d1.daysLeft === daysLeft && d1.safeDailySpend === expectedDaily && d1.warning === 'ok',
      JSON.stringify(d1)
    );

    // 5. List + breakdown.
    const list = await call('GET', `/pocket-money/${month}/expenses`, tokenA);
    check('GET personal expenses lists 2', list.status === 200 && (list.json?.data?.expenses || []).length === 2, `count=${list.json?.data?.expenses?.length}`);
    const br = await call('GET', `/pocket-money/${month}/breakdown`, tokenA);
    const rows = br.json?.data?.breakdown || [];
    const food = rows.find((r) => r.category === 'food');
    const transport = rows.find((r) => r.category === 'transport');
    check(
      'breakdown: food 5000, transport 2000, total 7000',
      br.status === 200 && br.json?.data?.total === 7000 && food?.total === 5000 && food?.personal === 5000 && transport?.total === 2000,
      JSON.stringify(rows)
    );

    // 6. Group share counts: A creates group, B joins + approved, group
    //    expense 3000 Food split 1500/1500 -> A's groupSpent 1500.
    const grp = await call('POST', '/groups', tokenA, { name: 'PM Group' });
    check('user A creates group', grp.status === 201, `status=${grp.status}`);
    const groupId = grp.json?.data?.group?._id;
    const inviteCode = grp.json?.data?.group?.inviteCode;
    const join = await call('POST', `/groups/join/${inviteCode}`, tokenB);
    check('user B join request', join.status === 201, `status=${join.status} ${join.json?.error || ''}`);
    const reqs = await call('GET', `/groups/${groupId}/requests`, tokenA);
    const memId = (reqs.json?.data?.requests || [])[0]?._id;
    const approve = await call('POST', `/groups/${groupId}/requests/${memId}/approve`, tokenA);
    check('admin approves B join', approve.status === 200, `status=${approve.status} ${approve.json?.error || ''}`);
    const gexp = await call('POST', `/groups/${groupId}/expenses`, tokenA, {
      title: 'Group Dinner', amount: 3000, category: 'Food', date: today,
      paidBy: idA, splitMethod: 'EQUAL',
      splitBetween: [{ user: idA, shareAmount: 1500 }, { user: idB, shareAmount: 1500 }],
      memberIds: [idA, idB],
    });
    check('group expense 3000 split 1500/1500', gexp.status === 201, `status=${gexp.status} ${gexp.json?.error || ''}`);
    const sum2 = await call('GET', `/pocket-money/${month}`, tokenA);
    const d2 = sum2.json?.data || {};
    check(
      'group share: groupSpent 1500, spent 8500, remaining 11500',
      d2.groupSpent === 1500 && d2.spent === 8500 && d2.remaining === 11500,
      JSON.stringify(d2)
    );
    const br2 = await call('GET', `/pocket-money/${month}/breakdown`, tokenA);
    const food2 = (br2.json?.data?.breakdown || []).find((r) => r.category === 'food');
    check(
      'breakdown food merges personal 5000 + group 1500 = 6500',
      food2?.personal === 5000 && food2?.group === 1500 && food2?.total === 6500 && br2.json?.data?.total === 8500,
      JSON.stringify(food2 || null)
    );

    // 7. Warning levels: 8500 spent of 9000 -> warning; of 8000 -> over.
    await call('PUT', `/pocket-money/${month}`, tokenA, { pocketMoney: 9000 });
    const warn = await call('GET', `/pocket-money/${month}`, tokenA);
    check('warning at 94% (8500/9000)', warn.json?.data?.warning === 'warning' && warn.json?.data?.spentPercent > 80, `warning=${warn.json?.data?.warning} pct=${warn.json?.data?.spentPercent}`);
    await call('PUT', `/pocket-money/${month}`, tokenA, { pocketMoney: 8000 });
    const over = await call('GET', `/pocket-money/${month}`, tokenA);
    check('over at 106% (8500/8000)', over.json?.data?.warning === 'over' && over.json?.data?.remaining === -500, `warning=${over.json?.data?.warning} remaining=${over.json?.data?.remaining}`);
    await call('PUT', `/pocket-money/${month}`, tokenA, { pocketMoney: 20000 });

    // 8. Privacy: B sees none of A's personal expenses and cannot delete them.
    const bList = await call('GET', `/pocket-money/${month}/expenses`, tokenB);
    check("B's personal expense list is empty (cannot see A's)", bList.status === 200 && (bList.json?.data?.expenses || []).length === 0, `count=${bList.json?.data?.expenses?.length}`);
    const bDel = await call('DELETE', `/pocket-money/${month}/expenses/${expId1}`, tokenB);
    check("B deleting A's expense gets 404", bDel.status === 404, `status=${bDel.status}`);
    const bSum = await call('GET', `/pocket-money/${month}`, tokenB);
    check(
      "B's own summary: only B's group share 1500, personal 0",
      bSum.json?.data?.personalSpent === 0 && bSum.json?.data?.groupSpent === 1500 && bSum.json?.data?.spent === 1500,
      JSON.stringify(bSum.json?.data || null)
    );
    const bBr = await call('GET', `/pocket-money/${month}/breakdown`, tokenB);
    const bFood = (bBr.json?.data?.breakdown || []).find((r) => r.category === 'food');
    check("B's breakdown food is only the 1500 group share", bFood?.personal === 0 && bFood?.group === 1500 && bBr.json?.data?.total === 1500, JSON.stringify(bFood || null));

    // 9. Month isolation: last month's expense must not count this month.
    const last = await call('POST', `/pocket-money/${lastMonth}/expenses`, tokenA, { title: 'Last month books', amount: 4000, category: 'shopping', date: lastMonthDate });
    check('POST personal expense in last month', last.status === 201, `status=${last.status} ${last.json?.error || ''}`);
    const sum3 = await call('GET', `/pocket-money/${month}`, tokenA);
    check('current month still spent 8500 after last-month expense', sum3.json?.data?.spent === 8500, `spent=${sum3.json?.data?.spent}`);
    const sumLast = await call('GET', `/pocket-money/${lastMonth}`, tokenA);
    check(
      'last month summary: personalSpent 4000, spent 4000, no budget',
      sumLast.json?.data?.personalSpent === 4000 && sumLast.json?.data?.spent === 4000 && sumLast.json?.data?.budgetSet === false,
      JSON.stringify(sumLast.json?.data || null)
    );

    // 10. Delete own expense works; validation + auth guards.
    const del = await call('DELETE', `/pocket-money/${month}/expenses/${expId2}`, tokenA);
    check('owner deletes own expense', del.status === 200, `status=${del.status}`);
    const list2 = await call('GET', `/pocket-money/${month}/expenses`, tokenA);
    check('list now has 1 expense', (list2.json?.data?.expenses || []).length === 1, `count=${list2.json?.data?.expenses?.length}`);
    const badMonth = await call('GET', '/pocket-money/2026-13', tokenA);
    check('invalid month gets 400', badMonth.status === 400, `status=${badMonth.status}`);
    const badAmt = await call('POST', `/pocket-money/${month}/expenses`, tokenA, { title: 'Bad', amount: -5, category: 'food', date: today });
    check('negative amount gets 400', badAmt.status === 400, `status=${badAmt.status}`);
    const wrongMonthDate = await call('POST', `/pocket-money/${month}/expenses`, tokenA, { title: 'Wrong', amount: 100, category: 'food', date: lastMonthDate });
    check('expense dated in another month gets 400', wrongMonthDate.status === 400, `status=${wrongMonthDate.status}`);
    const unauth = await call('GET', `/pocket-money/${month}`, null);
    check('no token gets 401', unauth.status === 401, `status=${unauth.status}`);
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
