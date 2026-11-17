const MonthlyBudget = require('../models/MonthlyBudget');
const PersonalExpense = require('../models/PersonalExpense');
const Expense = require('../models/Expense');

// Student "Monthly Pocket Money" — personal month management.
// Every handler is scoped to req.user._id, so a user can only ever see
// or touch their own budget and personal expenses. Group shares follow
// the existing privacy rule: only group expenses the user is split on,
// and only their own shareAmount.

const PERSONAL_CATEGORIES = [
  'food',
  'transport',
  'rent',
  'utilities',
  'entertainment',
  'shopping',
  'other',
];

// Group Expense categories (capitalised) -> frontend category keys.
const GROUP_CATEGORY_MAP = {
  Food: 'food',
  Transport: 'transport',
  Groceries: 'shopping',
  Trip: 'other',
  Stationery: 'other',
  Utilities: 'utilities',
  Rent: 'rent',
  Entertainment: 'entertainment',
  Settlement: 'other',
  Other: 'other',
};

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function isValidMonth(m) {
  return typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
}

function monthToDate(m) {
  return new Date(`${m}-01T00:00:00.000Z`);
}

function nextMonth(m) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo, 1)); // mo is 1-based; Date month is 0-based
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(m) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthOfDate(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

// Shared totals for one user + one month.
async function computeMonthTotals(userId, month) {
  const start = monthToDate(month);
  const end = monthToDate(nextMonth(month));

  const [budget, personal] = await Promise.all([
    MonthlyBudget.findOne({ userId, month }).lean(),
    PersonalExpense.find({ userId, month }).lean(),
  ]);

  // Group expenses this month that the user is split on — only their own
  // share counts, and only real spending (type EXPENSE, not settlements).
  const groupExpenses = await Expense.find({
    isDeleted: false,
    type: 'EXPENSE',
    date: { $gte: start, $lt: end },
    'splitBetween.user': userId,
  })
    .select('category splitBetween')
    .lean();

  const personalSpent = round2(personal.reduce((s, e) => s + (e.amount || 0), 0));
  let groupSpent = 0;
  const groupByCategory = {};
  for (const exp of groupExpenses) {
    const share = (exp.splitBetween || []).find(
      (s) => String(s.user) === String(userId)
    );
    const amt = share ? share.shareAmount || 0 : 0;
    groupSpent += amt;
    const key = GROUP_CATEGORY_MAP[exp.category] || 'other';
    groupByCategory[key] = (groupByCategory[key] || 0) + amt;
  }
  groupSpent = round2(groupSpent);

  const pocketMoney = budget ? budget.pocketMoney : 0;
  const spent = round2(personalSpent + groupSpent);
  const remaining = round2(pocketMoney - spent);

  const today = new Date();
  const current = currentMonthStr();
  let daysLeft;
  if (month > current) daysLeft = daysInMonth(month);
  else if (month === current) daysLeft = daysInMonth(month) - today.getDate() + 1;
  else daysLeft = 0;
  const safeDailySpend = daysLeft > 0 && remaining > 0 ? round2(remaining / daysLeft) : 0;

  const pct = pocketMoney > 0 ? round2((spent / pocketMoney) * 100) : 0;
  const warning = pocketMoney <= 0 ? 'none' : pct >= 100 ? 'over' : pct >= 80 ? 'warning' : 'ok';

  return {
    month,
    pocketMoney,
    currency: budget ? budget.currency : 'PKR',
    budgetSet: Boolean(budget),
    personalSpent,
    groupSpent,
    spent,
    remaining,
    daysLeft,
    daysInMonth: daysInMonth(month),
    safeDailySpend,
    spentPercent: pct,
    warning,
  };
}

// GET /pocket-money/:month — budget + totals for the month.
async function getSummary(req, res, next) {
  try {
    const { month } = req.params;
    if (!isValidMonth(month)) {
      return res.status(400).json({ success: false, error: 'Invalid month (expected YYYY-MM)' });
    }
    const totals = await computeMonthTotals(req.user._id, month);
    return res.json({ success: true, data: totals });
  } catch (err) {
    return next(err);
  }
}

// PUT /pocket-money/:month — set / update this month's pocket money.
async function setBudget(req, res, next) {
  try {
    const { month } = req.params;
    if (!isValidMonth(month)) {
      return res.status(400).json({ success: false, error: 'Invalid month (expected YYYY-MM)' });
    }
    const pocketMoney = Number(req.body?.pocketMoney);
    if (!Number.isFinite(pocketMoney) || pocketMoney < 0) {
      return res.status(400).json({ success: false, error: 'Pocket money must be a number of 0 or more' });
    }
    const currency = req.body?.currency;
    const update = { pocketMoney };
    if (typeof currency === 'string' && ['PKR', 'USD', 'EUR', 'AED', 'SAR', 'INR'].includes(currency)) {
      update.currency = currency;
    }
    const budget = await MonthlyBudget.findOneAndUpdate(
      { userId: req.user._id, month },
      { $set: update },
      { new: true, upsert: true }
    );
    return res.json({ success: true, data: { budget } });
  } catch (err) {
    return next(err);
  }
}

// GET /pocket-money/:month/expenses — own personal expenses, newest first.
async function listPersonalExpenses(req, res, next) {
  try {
    const { month } = req.params;
    if (!isValidMonth(month)) {
      return res.status(400).json({ success: false, error: 'Invalid month (expected YYYY-MM)' });
    }
    const expenses = await PersonalExpense.find({ userId: req.user._id, month })
      .sort({ date: -1, createdAt: -1 })
      .lean();
    return res.json({ success: true, data: { expenses } });
  } catch (err) {
    return next(err);
  }
}

// POST /pocket-money/:month/expenses — add a personal expense.
async function addPersonalExpense(req, res, next) {
  try {
    const { month } = req.params;
    if (!isValidMonth(month)) {
      return res.status(400).json({ success: false, error: 'Invalid month (expected YYYY-MM)' });
    }
    const title = String(req.body?.title || '').trim();
    const amount = Number(req.body?.amount);
    if (!title) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be greater than 0' });
    }
    const category = PERSONAL_CATEGORIES.includes(req.body?.category) ? req.body.category : 'other';
    const date = req.body?.date ? new Date(req.body.date) : new Date();
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid date' });
    }
    // The expense's own date must fall inside the month in the URL.
    if (monthOfDate(date) !== month) {
      return res.status(400).json({ success: false, error: 'Expense date must be inside this month' });
    }
    const expense = await PersonalExpense.create({
      userId: req.user._id,
      title,
      amount,
      category,
      date,
      month,
      notes: String(req.body?.notes || '').trim(),
    });
    return res.status(201).json({ success: true, data: { expense } });
  } catch (err) {
    return next(err);
  }
}

// DELETE /pocket-money/:month/expenses/:id — delete ONLY your own expense.
// A different user's id simply looks "not found" (404), never leaking
// whether the record exists.
async function deletePersonalExpense(req, res, next) {
  try {
    const { month, id } = req.params;
    if (!isValidMonth(month)) {
      return res.status(400).json({ success: false, error: 'Invalid month (expected YYYY-MM)' });
    }
    const deleted = await PersonalExpense.findOneAndDelete({
      _id: id,
      userId: req.user._id,
      month,
    });
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Expense not found' });
    }
    return res.json({ success: true, message: 'Expense deleted' });
  } catch (err) {
    return next(err);
  }
}

// GET /pocket-money/:month/breakdown — spend per category (personal + own
// group shares), sorted by total descending.
async function getBreakdown(req, res, next) {
  try {
    const { month } = req.params;
    if (!isValidMonth(month)) {
      return res.status(400).json({ success: false, error: 'Invalid month (expected YYYY-MM)' });
    }
    const start = monthToDate(month);
    const end = monthToDate(nextMonth(month));
    const userId = req.user._id;

    const [personal, groupExpenses] = await Promise.all([
      PersonalExpense.find({ userId, month }).select('category amount').lean(),
      Expense.find({
        isDeleted: false,
        type: 'EXPENSE',
        date: { $gte: start, $lt: end },
        'splitBetween.user': userId,
      })
        .select('category splitBetween')
        .lean(),
    ]);

    const byCategory = {};
    for (const c of PERSONAL_CATEGORIES) byCategory[c] = { category: c, personal: 0, group: 0, total: 0 };
    for (const e of personal) {
      const row = byCategory[e.category] || byCategory.other;
      row.personal = round2(row.personal + (e.amount || 0));
    }
    for (const exp of groupExpenses) {
      const share = (exp.splitBetween || []).find((s) => String(s.user) === String(userId));
      const amt = share ? share.shareAmount || 0 : 0;
      const key = GROUP_CATEGORY_MAP[exp.category] || 'other';
      byCategory[key].group = round2(byCategory[key].group + amt);
    }
    const breakdown = Object.values(byCategory)
      .map((r) => ({ ...r, total: round2(r.personal + r.group) }))
      .sort((a, b) => b.total - a.total);
    const total = round2(breakdown.reduce((s, r) => s + r.total, 0));
    return res.json({ success: true, data: { month, breakdown, total } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getSummary,
  setBudget,
  listPersonalExpenses,
  addPersonalExpense,
  deletePersonalExpense,
  getBreakdown,
};
