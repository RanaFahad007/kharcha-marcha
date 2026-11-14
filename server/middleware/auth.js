const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Membership = require('../models/Membership');

async function authenticateJWT(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const parts = header.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      return res
        .status(401)
        .json({ success: false, error: 'Missing or invalid Authorization header' });
    }
    const token = parts[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
    const userId = decoded.id || decoded.userId || decoded._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Invalid token payload' });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }
    if (user.isBlocked) {
      return res.status(403).json({ success: false, error: 'Account is blocked' });
    }
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

async function requireGroupMember(req, res, next) {
  try {
    const groupId = req.params.groupId;
    if (!groupId) {
      return res.status(400).json({ success: false, error: 'groupId is required' });
    }
    const membership = await Membership.findOne({
      groupId,
      userId: req.user._id,
      status: 'ACCEPTED',
    });
    if (!membership) {
      return res
        .status(403)
        .json({ success: false, error: 'You are not a member of this group' });
    }
    req.membership = membership;
    req.groupRole = membership.role;
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireGroupAdmin(req, res, next) {
  if (req.groupRole !== 'ADMIN') {
    return res
      .status(403)
      .json({ success: false, error: 'Admin access required' });
  }
  return next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.user || !req.user.isSuperAdmin) {
    return res
      .status(403)
      .json({ success: false, error: 'Super admin access required' });
  }
  return next();
}

module.exports = {
  authenticateJWT,
  requireGroupMember,
  requireGroupAdmin,
  requireSuperAdmin,
};
