const crypto = require('crypto');
const Group = require('../models/Group');
const Membership = require('../models/Membership');
const User = require('../models/User');
const { logActivity } = require('../utils/activityLog');

const LAST_ADMIN_MESSAGE =
  'You are the only admin. Please promote another member to Admin before leaving.';

function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'KH-';
  const bytes = crypto.randomBytes(4);
  for (let i = 0; i < 4; i += 1) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

async function generateUniqueInviteCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateInviteCode();
    const existing = await Group.findOne({ inviteCode: code });
    if (!existing) return code;
  }
  // Extremely unlikely fallback: timestamp-derived suffix.
  const fallback = `KH-${Date.now().toString(36).toUpperCase().slice(-4)}`;
  const existing = await Group.findOne({ inviteCode: fallback });
  if (existing) throw new Error('Could not generate a unique invite code');
  return fallback;
}

async function listGroups(req, res, next) {
  try {
    const memberships = await Membership.find({
      userId: req.user._id,
      status: 'ACCEPTED',
    }).populate('groupId');
    const groups = memberships
      .filter((m) => m.groupId)
      .map((m) => {
        const g = m.groupId.toObject();
        g.myRole = m.role;
        g.joinedAt = m.joinedAt;
        return g;
      });
    return res.json({ success: true, data: { groups } });
  } catch (err) {
    return next(err);
  }
}

async function createGroup(req, res, next) {
  try {
    const { name, color, avatar, autoApproveJoin, currency, monthlyBudget } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    const currencies = ['PKR', 'USD', 'EUR', 'AED', 'SAR', 'INR'];
    if (currency && !currencies.includes(currency)) {
      return res.status(400).json({ success: false, error: 'Invalid currency' });
    }
    if (monthlyBudget !== undefined && (Number.isNaN(Number(monthlyBudget)) || Number(monthlyBudget) < 0)) {
      return res.status(400).json({ success: false, error: 'monthlyBudget must be a non-negative number' });
    }
    const inviteCode = await generateUniqueInviteCode();
    const group = await Group.create({
      name: name.trim(),
      color: color || '#4F46E5',
      avatar: avatar || null,
      autoApproveJoin: Boolean(autoApproveJoin),
      currency: currency || 'PKR',
      monthlyBudget: monthlyBudget !== undefined ? Number(monthlyBudget) : 0,
      createdBy: req.user._id,
      inviteCode,
    });
    await Membership.create({
      groupId: group._id,
      userId: req.user._id,
      role: 'ADMIN',
      status: 'ACCEPTED',
      joinedAt: new Date(),
    });
    await User.findByIdAndUpdate(req.user._id, { lastActiveGroupId: group._id });
    await logActivity(
      group._id,
      req.user._id,
      'GROUP_CREATED',
      `${req.user.name || 'A member'} created group "${group.name}"`
    );
    return res.status(201).json({ success: true, message: 'Group created', data: { group } });
  } catch (err) {
    return next(err);
  }
}

async function getGroup(req, res, next) {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });
    const memberCount = await Membership.countDocuments({
      groupId: group._id,
      status: 'ACCEPTED',
    });
    const out = group.toObject();
    out.memberCount = memberCount;
    out.myRole = req.groupRole;
    return res.json({ success: true, data: { group: out } });
  } catch (err) {
    return next(err);
  }
}

async function updateGroup(req, res, next) {
  try {
    const { name, color, avatar, invitesEnabled, autoApproveJoin, currency, monthlyBudget } = req.body || {};
    const updates = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, error: 'name must not be empty' });
      }
      updates.name = name.trim();
    }
    if (color !== undefined) updates.color = color;
    if (avatar !== undefined) updates.avatar = avatar;
    if (invitesEnabled !== undefined) updates.invitesEnabled = Boolean(invitesEnabled);
    if (autoApproveJoin !== undefined) updates.autoApproveJoin = Boolean(autoApproveJoin);
    if (currency !== undefined) {
      const currencies = ['PKR', 'USD', 'EUR', 'AED', 'SAR', 'INR'];
      if (!currencies.includes(currency)) {
        return res.status(400).json({ success: false, error: 'Invalid currency' });
      }
      updates.currency = currency;
    }
    if (monthlyBudget !== undefined) {
      if (Number.isNaN(Number(monthlyBudget)) || Number(monthlyBudget) < 0) {
        return res.status(400).json({ success: false, error: 'monthlyBudget must be a non-negative number' });
      }
      updates.monthlyBudget = Number(monthlyBudget);
    }
    const group = await Group.findByIdAndUpdate(req.params.groupId, updates, {
      new: true,
      runValidators: true,
    });
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });
    return res.json({ success: true, message: 'Group updated', data: { group } });
  } catch (err) {
    return next(err);
  }
}

async function leaveGroup(req, res, next) {
  try {
    const groupId = req.params.groupId;
    if (req.groupRole === 'ADMIN') {
      const adminCount = await Membership.countDocuments({
        groupId,
        role: 'ADMIN',
        status: 'ACCEPTED',
      });
      if (adminCount <= 1) {
        return res.status(403).json({ success: false, error: LAST_ADMIN_MESSAGE });
      }
    }
    await Membership.deleteOne({ _id: req.membership._id });
    return res.json({ success: true, message: 'You have left the group' });
  } catch (err) {
    return next(err);
  }
}

async function listMembers(req, res, next) {
  try {
    const memberships = await Membership.find({
      groupId: req.params.groupId,
      status: 'ACCEPTED',
    })
      .populate('userId', 'name emailOrPhone avatarColor')
      .sort({ joinedAt: 1 });
    const members = memberships.map((m) => ({
      _id: m._id,
      userId: m.userId ? m.userId._id : null,
      user: m.userId
        ? { _id: m.userId._id, name: m.userId.name, emailOrPhone: m.userId.emailOrPhone }
        : null,
      name: m.userId ? m.userId.name : null,
      emailOrPhone: m.userId ? m.userId.emailOrPhone : null,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt,
    }));
    return res.json({ success: true, data: { members } });
  } catch (err) {
    return next(err);
  }
}

async function updateMemberRole(req, res, next) {
  try {
    const { userId } = req.params;
    const { role } = req.body || {};
    if (role !== 'ADMIN' && role !== 'MEMBER') {
      return res.status(400).json({ success: false, error: "role must be 'ADMIN' or 'MEMBER'" });
    }
    const target = await Membership.findOne({
      groupId: req.params.groupId,
      userId,
      status: 'ACCEPTED',
    });
    if (!target) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }
    if (target.role === 'ADMIN' && role === 'MEMBER') {
      const adminCount = await Membership.countDocuments({
        groupId: req.params.groupId,
        role: 'ADMIN',
        status: 'ACCEPTED',
      });
      if (adminCount <= 1) {
        return res.status(403).json({ success: false, error: LAST_ADMIN_MESSAGE });
      }
    }
    target.role = role;
    await target.save();
    return res.json({
      success: true,
      message: 'Member role updated',
      data: { membership: target },
    });
  } catch (err) {
    return next(err);
  }
}

async function listRequests(req, res, next) {
  try {
    const requests = await Membership.find({
      groupId: req.params.groupId,
      status: 'PENDING',
    })
      .populate('userId', 'name emailOrPhone')
      .sort({ createdAt: 1 });
    return res.json({ success: true, data: { requests } });
  } catch (err) {
    return next(err);
  }
}

async function approveRequest(req, res, next) {
  try {
    const membership = await Membership.findOne({
      _id: req.params.membershipId,
      groupId: req.params.groupId,
      status: 'PENDING',
    });
    if (!membership) {
      return res.status(404).json({ success: false, error: 'Pending request not found' });
    }
    membership.status = 'ACCEPTED';
    membership.joinedAt = new Date();
    await membership.save();
    const joinedUser = await User.findById(membership.userId);
    await logActivity(
      req.params.groupId,
      membership.userId,
      'MEMBER_JOINED',
      `${joinedUser ? joinedUser.name : 'A member'} joined the group (approved by ${req.user.name || 'an admin'})`
    );
    return res.json({
      success: true,
      message: 'Join request approved',
      data: { membership },
    });
  } catch (err) {
    return next(err);
  }
}

async function rejectRequest(req, res, next) {
  try {
    const membership = await Membership.findOne({
      _id: req.params.membershipId,
      groupId: req.params.groupId,
      status: 'PENDING',
    });
    if (!membership) {
      return res.status(404).json({ success: false, error: 'Pending request not found' });
    }
    membership.status = 'REJECTED';
    await membership.save();
    return res.json({
      success: true,
      message: 'Join request rejected',
      data: { membership },
    });
  } catch (err) {
    return next(err);
  }
}

async function getJoinInfo(req, res, next) {
  try {
    const code = String(req.params.inviteCode || '').toUpperCase().trim();
    const group = await Group.findOne({ inviteCode: code });
    if (!group) return res.status(404).json({ success: false, error: 'Invite not found' });
    const memberCount = await Membership.countDocuments({
      groupId: group._id,
      status: 'ACCEPTED',
    });
    const existing = await Membership.findOne({
      groupId: group._id,
      userId: req.user._id,
    });
    let myStatus = 'NONE';
    if (existing) myStatus = existing.status;
    return res.json({
      success: true,
      data: {
        group: {
          _id: group._id,
          name: group.name,
          color: group.color,
          avatar: group.avatar,
          memberCount,
        },
        invitesEnabled: group.invitesEnabled,
        autoApproveJoin: group.autoApproveJoin,
        myStatus,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function joinByInvite(req, res, next) {
  try {
    const code = String(req.params.inviteCode || '').toUpperCase().trim();
    const group = await Group.findOne({ inviteCode: code });
    if (!group) return res.status(404).json({ success: false, error: 'Invite not found' });
    if (!group.invitesEnabled) {
      return res.status(403).json({ success: false, error: 'Invites are disabled for this group' });
    }
    const existing = await Membership.findOne({
      groupId: group._id,
      userId: req.user._id,
    });
    if (existing && existing.status === 'ACCEPTED') {
      return res.status(400).json({ success: false, error: 'You are already a member of this group' });
    }
    if (existing && existing.status === 'PENDING') {
      return res.status(400).json({ success: false, error: 'Your join request is already pending' });
    }
    if (existing && existing.status === 'REJECTED') {
      // Allow a fresh request after a rejection.
      existing.status = group.autoApproveJoin ? 'ACCEPTED' : 'PENDING';
      existing.joinedAt = group.autoApproveJoin ? new Date() : existing.joinedAt;
      existing.role = 'MEMBER';
      await existing.save();
      return res.status(201).json({
        success: true,
        message: group.autoApproveJoin ? 'Joined group' : 'Join request sent',
        data: { membership: existing, group },
      });
    }
    const membership = await Membership.create({
      groupId: group._id,
      userId: req.user._id,
      role: 'MEMBER',
      status: group.autoApproveJoin ? 'ACCEPTED' : 'PENDING',
      joinedAt: group.autoApproveJoin ? new Date() : new Date(),
    });
    if (group.autoApproveJoin) {
      await User.findByIdAndUpdate(req.user._id, { lastActiveGroupId: group._id });
      await logActivity(
        group._id,
        req.user._id,
        'MEMBER_JOINED',
        `${req.user.name || 'A member'} joined the group`
      );
    }
    return res.status(201).json({
      success: true,
      message: group.autoApproveJoin ? 'Joined group' : 'Join request sent',
      data: { membership, group },
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(400).json({ success: false, error: 'You already have a membership for this group' });
    }
    return next(err);
  }
}

module.exports = {
  listGroups,
  createGroup,
  getGroup,
  updateGroup,
  leaveGroup,
  listMembers,
  updateMemberRole,
  listRequests,
  approveRequest,
  rejectRequest,
  getJoinInfo,
  joinByInvite,
  generateInviteCode,
};
