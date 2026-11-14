const User = require('../models/User');
const Group = require('../models/Group');
const Expense = require('../models/Expense');
const Membership = require('../models/Membership');

async function getStats(req, res, next) {
  try {
    const [totalUsers, totalGroups, totalExpenses, demoUsers, demoGroups, demoExpenses] =
      await Promise.all([
        User.countDocuments({}),
        Group.countDocuments({}),
        Expense.countDocuments({ isDeleted: false }),
        User.countDocuments({ isDemoUser: true }),
        Group.countDocuments({ isDemoGroup: true }),
        Expense.countDocuments({ isDeleted: false }).then(async () => {
          const demoGroupIds = await Group.find({ isDemoGroup: true }).select('_id');
          return Expense.countDocuments({
            groupId: { $in: demoGroupIds.map((g) => g._id) },
            isDeleted: false,
          });
        }),
      ]);
    return res.json({
      success: true,
      data: {
        totalUsers,
        totalGroups,
        totalExpenses,
        demoUsers,
        demoGroups,
        demoExpenses,
      },
    });
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
          isDemoGroup: 1,
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

module.exports = { getStats, listAllGroups, blockUser, unblockUser };
