function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * computeBalances(expenses, members)
 * expenses: Expense docs / plain objects with paidBy, splitBetween, type,
 *   amount, isDeleted, isHidden. Only non-deleted, non-hidden expenses count.
 *   SETTLEMENT expenses use the same paid/share math, so they naturally clear.
 * members: array of User docs / plain objects with _id and name (and
 *   optionally emailOrPhone). Every member appears in the result even with 0.
 * Returns [{ user, totalPaid, totalShare, netBalance }] where
 * netBalance = totalPaid - totalShare.
 */
function computeBalances(expenses, members) {
  const map = new Map();
  const memberList = Array.isArray(members) ? members : [];
  for (const m of memberList) {
    const id = String(m._id);
    map.set(id, {
      user: m,
      totalPaid: 0,
      totalShare: 0,
      netBalance: 0,
    });
  }
  const ensure = (id, fallbackUser) => {
    const key = String(id);
    if (!map.has(key)) {
      map.set(key, {
        user: fallbackUser || { _id: id },
        totalPaid: 0,
        totalShare: 0,
        netBalance: 0,
      });
    }
    return map.get(key);
  };

  for (const exp of expenses || []) {
    if (!exp || exp.isDeleted || exp.isHidden) continue;
    const amount = Number(exp.amount) || 0;
    const payerId = exp.paidBy && exp.paidBy._id ? exp.paidBy._id : exp.paidBy;
    if (payerId) {
      const entry = ensure(payerId, exp.paidBy);
      entry.totalPaid = round2(entry.totalPaid + amount);
    }
    const splits = Array.isArray(exp.splitBetween) ? exp.splitBetween : [];
    for (const s of splits) {
      const uid = s.user && s.user._id ? s.user._id : s.user;
      if (!uid) continue;
      const entry = ensure(uid, s.user);
      entry.totalShare = round2(entry.totalShare + (Number(s.shareAmount) || 0));
    }
  }

  const balances = [];
  for (const entry of map.values()) {
    entry.totalPaid = round2(entry.totalPaid);
    entry.totalShare = round2(entry.totalShare);
    entry.netBalance = round2(entry.totalPaid - entry.totalShare);
    balances.push(entry);
  }
  return balances;
}

/**
 * simplifyDebts(balances)
 * Greedy minimum-transaction settlement: largest debtor vs largest creditor.
 * Returns [{ fromUser, toUser, amount }] (amount rounded to 2dp).
 * `fromUser` owes `toUser` `amount`. `from` / `to` aliases are kept for
 * v1 clients that read those keys.
 */
function simplifyDebts(balances) {
  const creditors = [];
  const debtors = [];
  for (const b of balances || []) {
    const net = round2(Number(b.netBalance) || 0);
    if (net > 0.01) creditors.push({ user: b.user, amount: net });
    else if (net < -0.01) debtors.push({ user: b.user, amount: -net });
  }
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const settlements = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = round2(Math.min(debtor.amount, creditor.amount));
    if (amount > 0) {
      settlements.push({
        fromUser: debtor.user,
        toUser: creditor.user,
        from: debtor.user,
        to: creditor.user,
        amount,
      });
    }
    debtor.amount = round2(debtor.amount - amount);
    creditor.amount = round2(creditor.amount - amount);
    if (debtor.amount <= 0.01) i += 1;
    if (creditor.amount <= 0.01) j += 1;
  }
  return settlements;
}

/**
 * computeBalancesAndDebts(expenses, members)
 * Convenience wrapper returning BOTH datasets in one call:
 * { memberBalances: [{ user, totalPaid, totalShare, netBalance }],
 *   simplifiedDebts: [{ fromUser, toUser, amount }] }
 */
function computeBalancesAndDebts(expenses, members) {
  const memberBalances = computeBalances(expenses, members);
  const simplifiedDebts = simplifyDebts(memberBalances);
  return { memberBalances, simplifiedDebts };
}

module.exports = { computeBalances, simplifyDebts, computeBalancesAndDebts };
