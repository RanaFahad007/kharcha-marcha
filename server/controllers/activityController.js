const ActivityLog = require('../models/ActivityLog');

async function getActivityLog(req, res, next) {
  try {
    // Privacy: ADMIN sees the full audit log; a MEMBER sees only entries
    // about their own actions (actorId === their id).
    const filter = { groupId: req.params.groupId };
    if (req.groupRole !== 'ADMIN') {
      filter.actorId = req.user._id;
    }
    const logs = await ActivityLog.find(filter)
      .populate('actorId', 'name emailOrPhone avatarColor')
      .sort({ createdAt: -1 })
      .limit(100);
    return res.json({ success: true, data: { activity: logs } });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getActivityLog };
