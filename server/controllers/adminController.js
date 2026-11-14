const User = require('../models/User');
const Group = require('../models/Group');
const Expense = require('../models/Expense');
const Membership = require('../models/Membership');
const ActivityLog = require('../models/ActivityLog');

async function getStats(req, res, next) {
  try {
    const [totalUsers, totalGroups, totalExpenses] = await Promise.all([
      User.countDocuments({}),
      Group.countDocuments({}),
      Expense.countDocuments({ isDeleted: false }),
    ]);
    return res.json({
      success: true,
      data: {
        totalUsers,
        totalGroups,
        totalExpenses,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function listUsers(req, res, next) {
  try {
    const users = await User.find({})
      .sort({ createdAt: -1 })
      .select('_id name emailOrPhone avatarColor isBlocked isSuperAdmin createdAt');
    return res.json({ success: true, data: { users } });
  } catch (err) {
    return next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    const { userId } = req.params;
    if (String(userId) === String(req.user._id)) {
      return res.status(400).json({ success: false, error: 'You cannot delete yourself' });
    }
    const target = await User.findById(userId);
    if (!target) return res.status(404).json({ success: false, error: 'User not found' });
    if (target.isSuperAdmin) {
      return res
        .status(403)
        .json({ success: false, error: 'Cannot delete another super admin' });
    }
    // Safety: never delete an account that still owns data — the caller
    // must remove the user's groups/expenses first (or block the account).
    const [memberships, createdGroups, expenses] = await Promise.all([
      Membership.countDocuments({ userId }),
      Group.countDocuments({ createdBy: userId }),
      Expense.countDocuments({ createdBy: userId, isDeleted: false }),
    ]);
    if (memberships > 0 || createdGroups > 0 || expenses > 0) {
      return res.status(400).json({
        success: false,
        error:
          'This user still has groups, memberships or expenses. Remove those first, or block the account instead.',
      });
    }
    await User.deleteOne({ _id: userId });
    return res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    return next(err);
  }
}

async function listAllGroups(req, res, next) {
  try {
    const groups = await Group.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'memberships',
          let: { gid: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$groupId', '$$gid'] },
                status: 'ACCEPTED',
              },
            },
          ],
          as: 'members',
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          color: 1,
          avatar: 1,
          inviteCode: 1,
          invitesEnabled: 1,
          autoApproveJoin: 1,
          currency: 1,
          monthlyBudget: 1,
          createdBy: 1,
          createdAt: 1,
          updatedAt: 1,
          memberCount: { $size: '$members' },
        },
      },
    ]);
    return res.json({ success: true, data: { groups } });
  } catch (err) {
    return next(err);
  }
}

async function deleteGroup(req, res, next) {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });
    // SuperAdmin-only cleanup: remove the group and everything under it
    // (memberships, expenses, activity logs). Used to clear test groups
    // before a showcase; there is no user-facing delete-group button.
    const ActivityLog = require('../models/ActivityLog');
    const [expenses, memberships, logs] = await Promise.all([
      Expense.deleteMany({ groupId }),
      Membership.deleteMany({ groupId }),
      ActivityLog.deleteMany({ groupId }),
    ]);
    await Group.deleteOne({ _id: groupId });
    return res.json({
      success: true,
      message: 'Group deleted',
      data: {
        expensesDeleted: expenses.deletedCount || 0,
        membershipsDeleted: memberships.deletedCount || 0,
        activityLogsDeleted: logs.deletedCount || 0,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function setBlocked(req, res, next, blocked) {
  try {
    const { userId } = req.params;
    if (String(userId) === String(req.user._id)) {
      return res.status(400).json({ success: false, error: 'You cannot block or unblock yourself' });
    }
    const target = await User.findById(userId);
    if (!target) return res.status(404).json({ success: false, error: 'User not found' });
    if (target.isSuperAdmin) {
      return res
        .status(403)
        .json({ success: false, error: 'Cannot block or unblock another super admin' });
    }
    target.isBlocked = blocked;
    await target.save();
    return res.json({
      success: true,
      message: blocked ? 'User blocked' : 'User unblocked',
      data: {
        user: {
          _id: target._id,
          name: target.name,
          emailOrPhone: target.emailOrPhone,
          isBlocked: target.isBlocked,
          isSuperAdmin: target.isSuperAdmin,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function blockUser(req, res, next) {
  return setBlocked(req, res, next, true);
}

async function unblockUser(req, res, next) {
  return setBlocked(req, res, next, false);
}

// ---- SuperAdmin full visibility: every expense, activity entry and
// ---- pending request across ALL groups. Access is gated only by
// ---- requireSuperAdmin (one login) — no per-item approval is needed.
// ---- All three return the latest 100 records, newest first.
async function listAllExpenses(req, res, next) {
  try {
    const expenses = await Expense.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('groupId', 'name')
      .populate('paidBy', 'name')
      .populate('createdBy', 'name')
      .lean();
    const mapped = expenses.map((e) => ({
      _id: e._id,
      title: e.title,
      amount: e.amount,
      category: e.category,
      type: e.type,
      date: e.date,
      createdAt: e.createdAt,
      group: e.groupId ? { _id: e.groupId._id, name: e.groupId.name } : null,
      paidBy: e.paidBy ? { _id: e.paidBy._id, name: e.paidBy.name } : null,
      createdBy: e.createdBy ? { _id: e.createdBy._id, name: e.createdBy.name } : null,
    }));
    return res.json({ success: true, data: { expenses: mapped } });
  } catch (err) {
    return next(err);
  }
}

async function listAllActivity(req, res, next) {
  try {
    const logs = await ActivityLog.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('groupId', 'name')
      .populate('actorId', 'name')
      .lean();
    const mapped = logs.map((l) => ({
      _id: l._id,
      action: l.action,
      details: l.details,
      createdAt: l.createdAt,
      group: l.groupId ? { _id: l.groupId._id, name: l.groupId.name } : null,
      actor: l.actorId ? { _id: l.actorId._id, name: l.actorId.name } : null,
    }));
    return res.json({ success: true, data: { activity: mapped } });
  } catch (err) {
    return next(err);
  }
}

async function listAllRequests(req, res, next) {
  try {
    const [joinDocs, editDocs] = await Promise.all([
      Membership.find({ status: 'PENDING' })
        .sort({ createdAt: -1 })
        .populate('userId', 'name emailOrPhone')
        .populate('groupId', 'name')
        .lean(),
      Expense.find({ isDeleted: false, 'editRequest.status': 'PENDING' })
        .sort({ 'editRequest.requestedAt': -1 })
        .populate('groupId', 'name')
        .populate('createdBy', 'name emailOrPhone')
        .lean(),
    ]);
    // Only the expense creator can request an edit, so the requester is
    // always the expense's createdBy.
    const joinRequests = joinDocs.map((m) => ({
      _id: m._id,
      type: 'JOIN',
      user: m.userId
        ? { _id: m.userId._id, name: m.userId.name, emailOrPhone: m.userId.emailOrPhone }
        : null,
      group: m.groupId ? { _id: m.groupId._id, name: m.groupId.name } : null,
      requestedAt: m.createdAt,
    }));
    const editRequests = editDocs.map((e) => ({
      _id: e._id,
      type: 'EDIT',
      expenseId: e._id,
      expenseTitle: e.title,
      expenseAmount: e.amount,
      group: e.groupId ? { _id: e.groupId._id, name: e.groupId.name } : null,
      requester: e.createdBy
        ? { _id: e.createdBy._id, name: e.createdBy.name, emailOrPhone: e.createdBy.emailOrPhone }
        : null,
      reason: e.editRequest?.reason || '',
      requestedAt: e.editRequest?.requestedAt || e.updatedAt,
    }));
    return res.json({ success: true, data: { joinRequests, editRequests } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getStats,
  listAllGroups,
  listUsers,
  deleteUser,
  deleteGroup,
  blockUser,
  unblockUser,
  listAllExpenses,
  listAllActivity,
  listAllRequests,
};
