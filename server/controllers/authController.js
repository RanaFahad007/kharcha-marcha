const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Membership = require('../models/Membership');

function publicUser(user) {
  return {
    _id: user._id,
    name: user.name,
    emailOrPhone: user.emailOrPhone,
    isSuperAdmin: user.isSuperAdmin,
    avatarColor: user.avatarColor || '#6366F1',
    lastActiveGroupId: user.lastActiveGroupId || null,
  };
}

function signToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return jwt.sign(
    { id: user._id },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

async function signup(req, res, next) {
  try {
    const { name, emailOrPhone, password } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    if (!emailOrPhone || typeof emailOrPhone !== 'string' || !emailOrPhone.trim()) {
      return res.status(400).json({ success: false, error: 'emailOrPhone is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res
        .status(400)
        .json({ success: false, error: 'password must be at least 6 characters' });
    }
    const normalized = emailOrPhone.trim().toLowerCase();
    const existing = await User.findOne({ emailOrPhone: normalized });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, error: 'An account with this email or phone already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name.trim(),
      emailOrPhone: normalized,
      passwordHash,
    });
    const token = signToken(user);
    return res.status(201).json({
      success: true,
      message: 'Account created',
      data: { token, user: publicUser(user) },
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res
        .status(400)
        .json({ success: false, error: 'An account with this email or phone already exists' });
    }
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const { emailOrPhone, password } = req.body || {};
    if (!emailOrPhone || !password) {
      return res
        .status(400)
        .json({ success: false, error: 'emailOrPhone and password are required' });
    }
    const normalized = String(emailOrPhone).trim().toLowerCase();
    const user = await User.findOne({ emailOrPhone: normalized });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    if (user.isBlocked) {
      return res.status(403).json({ success: false, error: 'Account is blocked' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    const token = signToken(user);
    return res.json({
      success: true,
      message: 'Logged in',
      data: { token, user: publicUser(user) },
    });
  } catch (err) {
    return next(err);
  }
}

async function me(req, res, next) {
  try {
    const memberships = await Membership.find({
      userId: req.user._id,
      status: 'ACCEPTED',
    }).populate('groupId', 'name color avatar inviteCode');
    const groups = memberships
      .filter((m) => m.groupId)
      .map((m) => ({
        _id: m.groupId._id,
        name: m.groupId.name,
        color: m.groupId.color,
        avatar: m.groupId.avatar,
        inviteCode: m.groupId.inviteCode,
        role: m.role,
        joinedAt: m.joinedAt,
      }));
    return res.json({
      success: true,
      data: { user: publicUser(req.user), groups },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { signup, login, me, publicUser };
