const ActivityLog = require('../models/ActivityLog');

/**
 * Best-effort activity logging. Logging must never break the main action,
 * so failures are swallowed (logged to console only).
 */
async function logActivity(groupId, actorId, action, details) {
  if (!groupId || !actorId || !action) return null;
  try {
    return await ActivityLog.create({
      groupId,
      actorId,
      action,
      details: details ? String(details) : '',
    });
  } catch (err) {
    console.error('ActivityLog failed:', err.message);
    return null;
  }
}

module.exports = { logActivity };
