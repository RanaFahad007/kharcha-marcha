const ActivityLog = require('../models/ActivityLog');

async function getActivityLog(req, res, next) {
  try {
    const logs = await ActivityLog.find({ groupId: req.params.groupId })
      .populate('actorId', 'name emailOrPhone avatarColor')
      .sort({ createdAt: -1 })
      .limit(100);
    return res.json({ success: true, data: { activity: logs } });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getActivityLog };
