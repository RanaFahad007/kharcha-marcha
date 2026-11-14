const User = require('../models/User');
const Group = require('../models/Group');
const Expense = require('../models/Expense');
const Membership = require('../models/Membership');

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

module.exports = { getStats, listAllGroups, listUsers, deleteUser, deleteGroup, blockUser, unblockUser };
