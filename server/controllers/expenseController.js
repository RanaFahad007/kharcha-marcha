const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const Group = require('../models/Group');
const Membership = require('../models/Membership');
const User = require('../models/User');
const {
  computeBalances,
  simplifyDebts,
  computeBalancesAndDebts,
} = require('../utils/debtSimplifier');
const { computeSplits } = require('../utils/splitEngine');
const { logActivity } = require('../utils/activityLog');

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const CATEGORIES = [
  'Food',
  'Transport',
  'Groceries',
  'Trip',
  'Stationery',
  'Utilities',
  'Rent',
  'Entertainment',
  'Settlement',
  'Other',
];
const SPLIT_METHODS = ['EQUAL', 'EXACT', 'PERCENTAGE', 'SHARES'];

// v1 clients send splitType: 'equal' | 'custom'. Map to v2 splitMethod.
function normalizeSplitMethod(body) {
  if (body.splitMethod && SPLIT_METHODS.includes(body.splitMethod)) {
    return body.splitMethod;
  }
  if (body.splitType === 'equal') return 'EQUAL';
  if (body.splitType === 'custom') return 'EXACT';
  return 'EQUAL';
}

function populateExpense(query) {
  return query
    .populate('paidBy', 'name emailOrPhone avatarColor')
    .populate('createdBy', 'name emailOrPhone avatarColor')
    .populate('splitBetween.user', 'name emailOrPhone avatarColor')
    .populate('editHistory.editedBy', 'name emailOrPhone');
}

async function acceptedMemberIds(groupId) {
  const ms = await Membership.find({ groupId, status: 'ACCEPTED' }).select('userId');
  return ms.map((m) => m.userId);
}

async function isAcceptedMember(groupId, userId) {
  const m = await Membership.findOne({ groupId, userId, status: 'ACCEPTED' });
  return Boolean(m);
}

async function assertSplitMembers(groupId, splits) {
  for (const s of splits) {
    if (!s.user || !(await isAcceptedMember(groupId, String(s.user)))) {
      return false;
    }
  }
  return true;
}

// Visibility: ADMIN sees all; MEMBER only expenses they paid or are split on.
function visibilityFilter(req) {
  const base = { groupId: req.params.groupId, isDeleted: false, isHidden: false };
  if (req.groupRole === 'ADMIN') return base;
  return {
    ...base,
    $or: [{ paidBy: req.user._id }, { 'splitBetween.user': req.user._id }],
  };
}

function fmtUser(u) {
  if (!u) return null;
  if (u._id) {
    return {
      _id: u._id,
      name: u.name,
      emailOrPhone: u.emailOrPhone,
      avatarColor: u.avatarColor,
    };
  }
  return { _id: u };
}

function fmtDebt(s) {
  const fromUser = fmtUser(s.fromUser || s.from);
  const toUser = fmtUser(s.toUser || s.to);
  return { fromUser, toUser, from: fromUser, to: toUser, amount: s.amount };
}

async function listExpenses(req, res, next) {
  try {
    const { category, from, to, status, type, user, search } = req.query;
    const filter = visibilityFilter(req);
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and = [...(filter.$and || []), { $or: [{ title: rx }, { notes: rx }] }];
    }
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }
    if (user) {
      const userFilter = {
        $or: [
          { paidBy: new mongoose.Types.ObjectId(user) },
          { 'splitBetween.user': new mongoose.Types.ObjectId(user) },
        ],
      };
      if (filter.$or) {
        filter.$and = [...(filter.$and || []), { $or: filter.$or }, userFilter];
        delete filter.$or;
      } else {
        filter.$or = userFilter.$or;
      }
    }
    const expenses = await populateExpense(Expense.find(filter).sort({ date: -1 }));
    return res.json({ success: true, data: { expenses } });
  } catch (err) {
    return next(err);
  }
}

async function createExpense(req, res, next) {
  try {
    const {
      title,
      amount,
      category,
      type,
      date,
      paidBy,
      splitBetween,
      memberIds,
      notes,
      receiptUrl,
    } = req.body || {};
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount < 0.01) {
      return res.status(400).json({ success: false, error: 'amount must be at least 0.01' });
    }
    if (category && !CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: 'Invalid category' });
    }
    if (type && type !== 'EXPENSE' && type !== 'SETTLEMENT') {
      return res.status(400).json({ success: false, error: 'Invalid type' });
    }
    const splitMethod = normalizeSplitMethod(req.body || {});
    const payerId = paidBy ? String(paidBy) : String(req.user._id);
    if (!(await isAcceptedMember(req.params.groupId, payerId))) {
      return res
        .status(400)
        .json({ success: false, error: 'paidBy must be an accepted member of the group' });
    }

    // Build the raw split entries, then validate + compute via the split engine.
    let entries;
    if (Array.isArray(splitBetween) && splitBetween.length > 0) {
      entries = splitBetween.map((s) => ({
        user: s.user,
        shareAmount: s.shareAmount !== undefined ? Number(s.shareAmount) : undefined,
        shareMeta: s.shareMeta !== undefined ? Number(s.shareMeta) : 0,
      }));
    } else {
      // No split given: equal split across the given memberIds, else all members.
      const ids =
        Array.isArray(memberIds) && memberIds.length > 0
          ? memberIds.map(String)
          : (await acceptedMemberIds(req.params.groupId)).map(String);
      entries = ids.map((user) => ({ user }));
    }
    if (!(await assertSplitMembers(req.params.groupId, entries))) {
      return res
        .status(400)
        .json({ success: false, error: 'All split members must be accepted members of the group' });
    }
    const computed = computeSplits(numAmount, splitMethod, entries);
    if (computed.error) {
      return res.status(400).json({ success: false, error: computed.error });
    }

    const expense = await Expense.create({
      groupId: req.params.groupId,
      title: title.trim(),
      amount: numAmount,
      category: category || 'Other',
      type: type || 'EXPENSE',
      date: date ? new Date(date) : new Date(),
      paidBy: payerId,
      createdBy: req.user._id,
      splitBetween: computed.shares,
      splitMethod,
      notes: typeof notes === 'string' ? notes : '',
      receiptUrl: typeof receiptUrl === 'string' ? receiptUrl : '',
    });
    await logActivity(
      req.params.groupId,
      req.user._id,
      'EXPENSE_ADDED',
      `${req.user.name || 'A member'} added "${expense.title}" (${numAmount})`
    );
    const populated = await populateExpense(Expense.findById(expense._id));
    return res
      .status(201)
      .json({ success: true, message: 'Expense created', data: { expense: populated } });
  } catch (err) {
    return next(err);
  }
}

async function getExpense(req, res, next) {
  try {
    const filter = visibilityFilter(req);
    filter._id = req.params.expenseId;
    const expense = await populateExpense(Expense.findOne(filter));
    if (!expense) return res.status(404).json({ success: false, error: 'Expense not found' });
    return res.json({ success: true, data: { expense } });
  } catch (err) {
    return next(err);
  }
}

async function updateExpense(req, res, next) {
  try {
    const expense = await Expense.findOne({
      _id: req.params.expenseId,
      groupId: req.params.groupId,
      isDeleted: false,
    });
    if (!expense) return res.status(404).json({ success: false, error: 'Expense not found' });

    const isAdmin = req.groupRole === 'ADMIN';
    const isCreator = String(expense.createdBy) === String(req.user._id);
    if (!isAdmin && !isCreator) {
      return res
        .status(403)
        .json({ success: false, error: 'Only the creator or an admin can edit this expense' });
    }
    // Edit-once rule for members: after one edit, an approved edit request
    // (canEditAgain) is required for the next edit.
    if (!isAdmin && expense.editCount >= 1 && !expense.canEditAgain) {
      return res.status(403).json({
        success: false,
        code: 'EDIT_REQUEST_REQUIRED',
        error: 'You have already edited this expense once. Please request another edit.',
      });
    }

    const {
      title,
      amount,
      category,
      date,
      paidBy,
      splitBetween,
      memberIds,
      status,
      notes,
      receiptUrl,
    } = req.body || {};

    const previousAmount = expense.amount;
    const previousTitle = expense.title;
    let newAmount = expense.amount;

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ success: false, error: 'title must not be empty' });
      }
      expense.title = title.trim();
    }
    if (amount !== undefined) {
      const n = Number(amount);
      if (!Number.isFinite(n) || n < 0.01) {
        return res.status(400).json({ success: false, error: 'amount must be at least 0.01' });
      }
      expense.amount = n;
      newAmount = n;
    }
    if (category !== undefined) {
      if (!CATEGORIES.includes(category)) {
        return res.status(400).json({ success: false, error: 'Invalid category' });
      }
      expense.category = category;
    }
    if (date !== undefined) expense.date = new Date(date);
    if (notes !== undefined) expense.notes = typeof notes === 'string' ? notes : '';
    if (receiptUrl !== undefined) {
      expense.receiptUrl = typeof receiptUrl === 'string' ? receiptUrl : '';
    }
    if (status !== undefined) {
      if (!['PENDING_SETTLEMENT', 'CLEARED'].includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status' });
      }
      expense.status = status;
    }
    if (paidBy !== undefined) {
      if (!(await isAcceptedMember(req.params.groupId, String(paidBy)))) {
        return res
          .status(400)
          .json({ success: false, error: 'paidBy must be an accepted member of the group' });
      }
      expense.paidBy = paidBy;
    }

    // Splits: explicit splitBetween / splitMethod / memberIds, else re-derive
    // on an amount change (EQUAL re-splits over the existing members).
    const splitSupplied =
      splitBetween !== undefined ||
      (req.body || {}).splitMethod !== undefined ||
      (req.body || {}).splitType !== undefined ||
      memberIds !== undefined;
    if (splitSupplied) {
      const splitMethod = normalizeSplitMethod(req.body || {});
      let entries;
      if (Array.isArray(splitBetween) && splitBetween.length > 0) {
        entries = splitBetween.map((s) => ({
          user: s.user,
          shareAmount: s.shareAmount !== undefined ? Number(s.shareAmount) : undefined,
          shareMeta: s.shareMeta !== undefined ? Number(s.shareMeta) : 0,
        }));
      } else {
        const ids =
          Array.isArray(memberIds) && memberIds.length > 0
            ? memberIds.map(String)
            : expense.splitBetween.map((s) => String(s.user));
        entries = ids.map((user) => ({ user }));
      }
      if (!(await assertSplitMembers(req.params.groupId, entries))) {
        return res
          .status(400)
          .json({ success: false, error: 'All split members must be accepted members of the group' });
      }
      const computed = computeSplits(newAmount, splitMethod, entries);
      if (computed.error) {
        return res.status(400).json({ success: false, error: computed.error });
      }
      expense.splitBetween = computed.shares;
      expense.splitMethod = splitMethod;
    } else if (amount !== undefined) {
      if (expense.splitMethod === 'EQUAL') {
        const computed = computeSplits(
          newAmount,
          'EQUAL',
          expense.splitBetween.map((s) => ({ user: s.user }))
        );
        if (!computed.error) expense.splitBetween = computed.shares;
      } else {
        const sum = round2(
          expense.splitBetween.reduce((a, s) => a + (Number(s.shareAmount) || 0), 0)
        );
        if (Math.abs(sum - newAmount) > 0.01) {
          return res.status(400).json({
            success: false,
            error: `Existing split shares (${sum}) do not sum to new amount (${newAmount}); supply splitBetween or splitMethod:'EQUAL'`,
          });
        }
      }
    }

    // Audit: every edit records what it replaced. Members consume their
    // one (or approved) edit; admins edit freely without touching the
    // member edit counters.
    expense.editHistory.push({
      editedBy: req.user._id,
      editedAt: new Date(),
      previousAmount,
      previousTitle,
    });
    if (!isAdmin) {
      expense.editCount = (expense.editCount || 0) + 1;
      expense.canEditAgain = false;
      expense.editRequest = { status: 'NONE', reason: null, requestedAt: null };
    }
    await expense.save();
    await logActivity(
      req.params.groupId,
      req.user._id,
      'EXPENSE_EDITED',
      `${req.user.name || 'A member'} edited "${expense.title}" (${previousAmount} -> ${expense.amount})`
    );
    const populated = await populateExpense(Expense.findById(expense._id));
    return res.json({ success: true, message: 'Expense updated', data: { expense: populated } });
  } catch (err) {
    return next(err);
  }
}

async function deleteExpense(req, res, next) {
  try {
    const expense = await Expense.findOne({
      _id: req.params.expenseId,
      groupId: req.params.groupId,
      isDeleted: false,
    });
    if (!expense) return res.status(404).json({ success: false, error: 'Expense not found' });
    expense.isDeleted = true;
    await expense.save();
    await logActivity(
      req.params.groupId,
      req.user._id,
      'EXPENSE_DELETED',
      `${req.user.name || 'A member'} deleted "${expense.title}" (${expense.amount})`
    );
    return res.json({ success: true, message: 'Expense deleted' });
  } catch (err) {
    return next(err);
  }
}

async function requestEdit(req, res, next) {
  try {
    const { reason } = req.body || {};
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'reason is required' });
    }
    const expense = await Expense.findOne({
      _id: req.params.expenseId,
      groupId: req.params.groupId,
      isDeleted: false,
    });
    if (!expense) return res.status(404).json({ success: false, error: 'Expense not found' });
    if (String(expense.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ success: false, error: 'Only the creator can request an edit' });
    }
    expense.editRequest = {
      status: 'PENDING',
      reason: reason.trim(),
      requestedAt: new Date(),
    };
    await expense.save();
    await logActivity(
      req.params.groupId,
      req.user._id,
      'EDIT_REQUESTED',
      `${req.user.name || 'A member'} requested another edit for "${expense.title}": ${reason.trim()}`
    );
    const populated = await populateExpense(Expense.findById(expense._id));
    return res.json({ success: true, message: 'Edit request submitted', data: { expense: populated } });
  } catch (err) {
    return next(err);
  }
}

async function approveEditRequest(req, res, next) {
  try {
    const expense = await Expense.findOne({
      _id: req.params.expenseId,
      groupId: req.params.groupId,
      isDeleted: false,
    });
    if (!expense) return res.status(404).json({ success: false, error: 'Expense not found' });
    expense.editRequest.status = 'APPROVED';
    expense.canEditAgain = true;
    await expense.save();
    await logActivity(
      req.params.groupId,
      req.user._id,
      'EDIT_REQUEST_APPROVED',
      `${req.user.name || 'An admin'} approved another edit for "${expense.title}"`
    );
    const populated = await populateExpense(Expense.findById(expense._id));
    return res.json({ success: true, message: 'Edit request approved', data: { expense: populated } });
  } catch (err) {
    return next(err);
  }
}

async function rejectEditRequest(req, res, next) {
  try {
    const expense = await Expense.findOne({
      _id: req.params.expenseId,
      groupId: req.params.groupId,
      isDeleted: false,
    });
    if (!expense) return res.status(404).json({ success: false, error: 'Expense not found' });
    expense.editRequest.status = 'REJECTED';
    await expense.save();
    await logActivity(
      req.params.groupId,
      req.user._id,
      'EDIT_REQUEST_REJECTED',
      `${req.user.name || 'An admin'} rejected another edit for "${expense.title}"`
    );
    const populated = await populateExpense(Expense.findById(expense._id));
    return res.json({ success: true, message: 'Edit request rejected', data: { expense: populated } });
  } catch (err) {
    return next(err);
  }
}

async function listEditRequests(req, res, next) {
  try {
    const expenses = await populateExpense(
      Expense.find({
        groupId: req.params.groupId,
        isDeleted: false,
        'editRequest.status': 'PENDING',
      }).sort({ 'editRequest.requestedAt': -1 })
    );
    return res.json({ success: true, data: { expenses } });
  } catch (err) {
    return next(err);
  }
}

async function createSettlement(req, res, next) {
  try {
    const { from, to, amount } = req.body || {};
    const numAmount = Number(amount);
    if (!from || !to) {
      return res.status(400).json({ success: false, error: 'from and to are required' });
    }
    if (!Number.isFinite(numAmount) || numAmount < 0.01) {
      return res.status(400).json({ success: false, error: 'amount must be at least 0.01' });
    }
    if (String(from) === String(to)) {
      return res.status(400).json({ success: false, error: 'from and to must be different members' });
    }
    if (!(await isAcceptedMember(req.params.groupId, String(from)))) {
      return res.status(400).json({ success: false, error: 'from must be an accepted member of the group' });
    }
    if (!(await isAcceptedMember(req.params.groupId, String(to)))) {
      return res.status(400).json({ success: false, error: 'to must be an accepted member of the group' });
    }
    const fromUser = await User.findById(from);
    const toUser = await User.findById(to);
    const expense = await Expense.create({
      groupId: req.params.groupId,
      title: `Settlement: ${fromUser.name} paid ${toUser.name}`,
      amount: numAmount,
      category: 'Settlement',
      type: 'SETTLEMENT',
      status: 'CLEARED',
      date: new Date(),
      paidBy: from,
      createdBy: req.user._id,
      splitBetween: [{ user: to, shareAmount: numAmount, shareMeta: 0 }],
      splitMethod: 'EXACT',
    });
    await logActivity(
      req.params.groupId,
      req.user._id,
      'SETTLEMENT_RECORDED',
      `${fromUser.name} paid ${toUser.name} ${numAmount}`
    );
    const populated = await populateExpense(Expense.findById(expense._id));
    return res
      .status(201)
      .json({ success: true, message: 'Settlement recorded', data: { expense: populated } });
  } catch (err) {
    return next(err);
  }
}

async function getBalances(req, res, next) {
  try {
    const groupId = req.params.groupId;
    const memberships = await Membership.find({ groupId, status: 'ACCEPTED' }).populate(
      'userId',
      'name emailOrPhone avatarColor'
    );
    const members = memberships.map((m) => m.userId).filter(Boolean);
    const expenses = await Expense.find({ groupId, isDeleted: false, isHidden: false })
      .populate('paidBy', 'name emailOrPhone avatarColor')
      .populate('splitBetween.user', 'name emailOrPhone avatarColor');
    const { memberBalances, simplifiedDebts } = computeBalancesAndDebts(expenses, members);
    return res.json({
      success: true,
      data: {
        memberBalances: memberBalances.map((b) => ({
          user: fmtUser(b.user),
          totalPaid: b.totalPaid,
          totalShare: b.totalShare,
          netBalance: b.netBalance,
        })),
        simplifiedDebts: simplifiedDebts.map(fmtDebt),
        // v1 aliases
        balances: memberBalances.map((b) => ({
          user: fmtUser(b.user),
          totalPaid: b.totalPaid,
          totalShare: b.totalShare,
          netBalance: b.netBalance,
        })),
        settlements: simplifiedDebts.map(fmtDebt),
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function exportExpenses(req, res, next) {
  try {
    const groupId = req.params.groupId;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });
    const { category, from, to, status, type, user, search } = req.query;
    const gid = new mongoose.Types.ObjectId(groupId);
    const match = { groupId: gid, isDeleted: false, isHidden: false };
    if (category) match.category = category;
    if (status) match.status = status;
    if (type) match.type = type;
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      match.$or = [{ title: rx }, { notes: rx }];
    }
    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to) match.date.$lte = new Date(to);
    }
    const isAdmin = req.groupRole === 'ADMIN';
    if (!isAdmin) {
      const uid = new mongoose.Types.ObjectId(req.user._id);
      const visOr = { $or: [{ paidBy: uid }, { 'splitBetween.user': uid }] };
      if (match.$or) {
        match.$and = [{ $or: match.$or }, visOr];
        delete match.$or;
      } else {
        match.$or = visOr.$or;
      }
    }
    if (user) {
      const uid = new mongoose.Types.ObjectId(user);
      const userOr = { $or: [{ paidBy: uid }, { 'splitBetween.user': uid }] };
      if (match.$or) {
        match.$and = [...(match.$and || []), { $or: match.$or }, userOr];
        delete match.$or;
      } else if (match.$and) {
        match.$and.push(userOr);
      } else {
        match.$or = userOr.$or;
      }
    }

    const [result] = await Expense.aggregate([
      { $match: match },
      { $sort: { date: -1 } },
      { $limit: 5000 },
      {
        $facet: {
          rows: [
            {
              $lookup: {
                from: 'users',
                localField: 'paidBy',
                foreignField: '_id',
                as: 'paidByUser',
              },
            },
            { $unwind: { path: '$paidByUser', preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: 'users',
                localField: 'createdBy',
                foreignField: '_id',
                as: 'createdByUser',
              },
            },
            { $unwind: { path: '$createdByUser', preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 1,
                groupId: 1,
                title: 1,
                amount: 1,
                category: 1,
                type: 1,
                status: 1,
                date: 1,
                splitBetween: 1,
                splitMethod: 1,
                notes: 1,
                receiptUrl: 1,
                editCount: 1,
                createdAt: 1,
                updatedAt: 1,
                paidBy: {
                  _id: '$paidByUser._id',
                  name: '$paidByUser.name',
                  emailOrPhone: '$paidByUser.emailOrPhone',
                  avatarColor: '$paidByUser.avatarColor',
                },
                createdBy: {
                  _id: '$createdByUser._id',
                  name: '$createdByUser.name',
                  emailOrPhone: '$createdByUser.emailOrPhone',
                  avatarColor: '$createdByUser.avatarColor',
                },
              },
            },
          ],
          categoryTotals: [
            { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
            { $sort: { total: -1 } },
          ],
          statusTotals: [
            { $group: { _id: '$status', total: { $sum: '$amount' }, count: { $sum: 1 } } },
            { $sort: { total: -1 } },
          ],
        },
      },
    ]);
    const rows = (result && result.rows) || [];
    const totalsByCategory = {};
    for (const r of result?.categoryTotals || []) totalsByCategory[r._id] = round2(r.total);
    const statusTotals = {};
    for (const r of result?.statusTotals || []) statusTotals[r._id] = round2(r.total);
    const totalAmount = round2(rows.reduce((a, e) => a + (Number(e.amount) || 0), 0));

    // Balances / simplified debts from ALL visible (non-deleted, non-hidden)
    // group expenses; members only see their own debt rows.
    const memberships = await Membership.find({ groupId, status: 'ACCEPTED' }).populate(
      'userId',
      'name emailOrPhone avatarColor'
    );
    const members = memberships.map((m) => m.userId).filter(Boolean);
    const allExpenses = await Expense.find({ groupId, isDeleted: false, isHidden: false })
      .populate('paidBy', 'name emailOrPhone avatarColor')
      .populate('splitBetween.user', 'name emailOrPhone avatarColor');
    const { memberBalances, simplifiedDebts } = computeBalancesAndDebts(allExpenses, members);
    let debts = simplifiedDebts.map(fmtDebt);
    if (!isAdmin) {
      const me = String(req.user._id);
      debts = debts.filter((s) => String(s.fromUser._id) === me || String(s.toUser._id) === me);
    }

    return res.json({
      success: true,
      data: {
        groupName: group.name,
        currency: group.currency || 'PKR',
        exportedAt: new Date().toISOString(),
        role: req.groupRole,
        totalsByCategory,
        expenses: rows,
        simplifiedDebts: debts,
        memberBalances: memberBalances.map((b) => ({
          user: fmtUser(b.user),
          totalPaid: b.totalPaid,
          totalShare: b.totalShare,
          netBalance: b.netBalance,
        })),
        // v1 aliases kept for existing clients
        summary: {
          count: rows.length,
          totalAmount,
          categoryTotals: totalsByCategory,
          statusTotals,
        },
        settlements: debts,
        count: rows.length,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listExpenses,
  createExpense,
  getExpense,
  updateExpense,
  deleteExpense,
  requestEdit,
  approveEditRequest,
  rejectEditRequest,
  listEditRequests,
  createSettlement,
  getBalances,
  exportExpenses,
};
