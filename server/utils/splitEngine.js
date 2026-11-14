function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const SPLIT_METHODS = ['EQUAL', 'EXACT', 'PERCENTAGE', 'SHARES'];

/**
 * computeSplits(amount, splitMethod, splitBetween)
 * splitBetween: [{ user, shareAmount?, shareMeta? }]
 * Returns { shares: [{ user, shareAmount, shareMeta }] } or { error }.
 *
 * EQUAL      — divide equally, penny rounding so shares sum exactly to amount
 *              (remainder goes on the last share). shareAmount/shareMeta in
 *              the input are ignored.
 * EXACT      — shareAmount values must sum exactly to amount (within 0.01).
 * PERCENTAGE — shareMeta values must sum to 100; shareAmount = amount*pct/100,
 *              penny-rounded with the remainder on the last share.
 * SHARES     — shareAmount proportional to shareMeta (number of shares);
 *              penny-rounded with the remainder on the last share.
 */
function computeSplits(amount, splitMethod, splitBetween) {
  const method = SPLIT_METHODS.includes(splitMethod) ? splitMethod : 'EQUAL';
  const entries = Array.isArray(splitBetween) ? splitBetween : [];
  if (entries.length === 0) {
    return { error: 'splitBetween must contain at least one member' };
  }
  for (const s of entries) {
    if (!s || !s.user) return { error: 'Each split entry needs a user' };
  }

  if (method === 'EQUAL') {
    const n = entries.length;
    const base = Math.floor((amount / n) * 100) / 100;
    const shares = entries.map((s) => ({
      user: s.user,
      shareAmount: base,
      shareMeta: 0,
    }));
    const remainder = round2(amount - base * n);
    shares[shares.length - 1].shareAmount = round2(
      shares[shares.length - 1].shareAmount + remainder
    );
    return { shares };
  }

  if (method === 'EXACT') {
    const shares = [];
    for (const s of entries) {
      const v = Number(s.shareAmount);
      if (!Number.isFinite(v) || v < 0) {
        return { error: 'Each EXACT split entry needs a non-negative shareAmount' };
      }
      shares.push({ user: s.user, shareAmount: round2(v), shareMeta: 0 });
    }
    const sum = round2(shares.reduce((a, s) => a + s.shareAmount, 0));
    if (Math.abs(sum - amount) > 0.01) {
      return { error: `EXACT split shares (${sum}) must sum to amount (${amount})` };
    }
    return { shares };
  }

  if (method === 'PERCENTAGE') {
    const shares = [];
    let pctSum = 0;
    for (const s of entries) {
      const pct = Number(s.shareMeta);
      if (!Number.isFinite(pct) || pct < 0) {
        return { error: 'Each PERCENTAGE split entry needs a non-negative shareMeta (percent)' };
      }
      pctSum = round2(pctSum + pct);
      shares.push({ user: s.user, shareAmount: 0, shareMeta: pct });
    }
    if (Math.abs(pctSum - 100) > 0.01) {
      return { error: `PERCENTAGE shares (${pctSum}) must sum to 100` };
    }
    let assigned = 0;
    shares.forEach((s, i) => {
      if (i === shares.length - 1) {
        s.shareAmount = round2(amount - assigned);
      } else {
        s.shareAmount = round2((amount * s.shareMeta) / 100);
        assigned = round2(assigned + s.shareAmount);
      }
    });
    return { shares };
  }

  // SHARES
  const shares = [];
  let totalShares = 0;
  for (const s of entries) {
    const n = Number(s.shareMeta);
    if (!Number.isFinite(n) || n <= 0) {
      return { error: 'Each SHARES split entry needs a positive shareMeta (number of shares)' };
    }
    totalShares += n;
    shares.push({ user: s.user, shareAmount: 0, shareMeta: n });
  }
  let assigned = 0;
  shares.forEach((s, i) => {
    if (i === shares.length - 1) {
      s.shareAmount = round2(amount - assigned);
    } else {
      s.shareAmount = round2((amount * s.shareMeta) / totalShares);
      assigned = round2(assigned + s.shareAmount);
    }
  });
  return { shares };
}

module.exports = { computeSplits, SPLIT_METHODS, round2 };
