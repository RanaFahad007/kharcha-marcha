const express = require('express');
const router = express.Router();
const {
  authenticateJWT,
  requireGroupMember,
  requireGroupAdmin,
  requireSuperAdmin,
} = require('../middleware/auth');
const authController = require('../controllers/authController');
const groupController = require('../controllers/groupController');
const expenseController = require('../controllers/expenseController');
const adminController = require('../controllers/adminController');
const activityController = require('../controllers/activityController');
const pocketMoneyController = require('../controllers/pocketMoneyController');

// ---- Super admin ----
router.get('/admin/stats', authenticateJWT, requireSuperAdmin, adminController.getStats);
router.get('/admin/groups', authenticateJWT, requireSuperAdmin, adminController.listAllGroups);
router.get('/admin/users', authenticateJWT, requireSuperAdmin, adminController.listUsers);
router.get('/admin/expenses', authenticateJWT, requireSuperAdmin, adminController.listAllExpenses);
router.get('/admin/activity', authenticateJWT, requireSuperAdmin, adminController.listAllActivity);
router.get('/admin/requests', authenticateJWT, requireSuperAdmin, adminController.listAllRequests);
router.delete('/admin/groups/:groupId', authenticateJWT, requireSuperAdmin, adminController.deleteGroup);
router.post('/admin/users/:userId/block', authenticateJWT, requireSuperAdmin, adminController.blockUser);
router.post('/admin/users/:userId/unblock', authenticateJWT, requireSuperAdmin, adminController.unblockUser);
router.delete('/admin/users/:userId', authenticateJWT, requireSuperAdmin, adminController.deleteUser);

// ---- Pocket Money (personal month management — own data only) ----
router.get('/pocket-money/:month', authenticateJWT, pocketMoneyController.getSummary);
router.put('/pocket-money/:month', authenticateJWT, pocketMoneyController.setBudget);
router.get('/pocket-money/:month/expenses', authenticateJWT, pocketMoneyController.listPersonalExpenses);
router.post('/pocket-money/:month/expenses', authenticateJWT, pocketMoneyController.addPersonalExpense);
router.delete('/pocket-money/:month/expenses/:id', authenticateJWT, pocketMoneyController.deletePersonalExpense);
router.get('/pocket-money/:month/breakdown', authenticateJWT, pocketMoneyController.getBreakdown);

// ---- Auth ----
router.post('/auth/signup', authController.signup);
router.post('/auth/login', authController.login);
router.get('/auth/me', authenticateJWT, authController.me);

// ---- Groups: join routes BEFORE :groupId routes so "join" is not
// ---- treated as a groupId.
// Join info / join by invite code
router.get('/groups/join/:inviteCode', authenticateJWT, groupController.getJoinInfo);
router.post('/groups/join/:inviteCode', authenticateJWT, groupController.joinByInvite);

// Groups
router.get('/groups', authenticateJWT, groupController.listGroups);
router.post('/groups', authenticateJWT, groupController.createGroup);
router.get('/groups/:groupId', authenticateJWT, requireGroupMember, groupController.getGroup);
router.put(
  '/groups/:groupId',
  authenticateJWT,
  requireGroupMember,
  requireGroupAdmin,
  groupController.updateGroup
);
router.post(
  '/groups/:groupId/leave',
  authenticateJWT,
  requireGroupMember,
  groupController.leaveGroup
);
router.get(
  '/groups/:groupId/members',
  authenticateJWT,
  requireGroupMember,
  groupController.listMembers
);
router.put(
  '/groups/:groupId/members/:userId/role',
  authenticateJWT,
  requireGroupMember,
  requireGroupAdmin,
  groupController.updateMemberRole
);
router.get(
  '/groups/:groupId/requests',
  authenticateJWT,
  requireGroupMember,
  requireGroupAdmin,
  groupController.listRequests
);
router.post(
  '/groups/:groupId/requests/:membershipId/approve',
  authenticateJWT,
  requireGroupMember,
  requireGroupAdmin,
  groupController.approveRequest
);
router.post(
  '/groups/:groupId/requests/:membershipId/reject',
  authenticateJWT,
  requireGroupMember,
  requireGroupAdmin,
  groupController.rejectRequest
);

// ---- Expenses (auth + requireGroupMember) ----
const member = [authenticateJWT, requireGroupMember];
const admin = [authenticateJWT, requireGroupMember, requireGroupAdmin];

router.get('/groups/:groupId/expenses/export', ...member, expenseController.exportExpenses);
router.get('/groups/:groupId/activity', ...member, activityController.getActivityLog);
router.get('/groups/:groupId/balances', ...member, expenseController.getBalances);
router.get('/groups/:groupId/edit-requests', ...admin, expenseController.listEditRequests);
router.get('/groups/:groupId/expenses', ...member, expenseController.listExpenses);
router.post('/groups/:groupId/expenses', ...member, expenseController.createExpense);
router.post('/groups/:groupId/settlements', ...member, expenseController.createSettlement);
router.get('/groups/:groupId/expenses/:expenseId', ...member, expenseController.getExpense);
router.put('/groups/:groupId/expenses/:expenseId', ...member, expenseController.updateExpense);
router.delete('/groups/:groupId/expenses/:expenseId', ...admin, expenseController.deleteExpense);
router.post(
  '/groups/:groupId/expenses/:expenseId/request-edit',
  ...member,
  expenseController.requestEdit
);
router.post(
  '/groups/:groupId/expenses/:expenseId/edit-request/approve',
  ...admin,
  expenseController.approveEditRequest
);
router.post(
  '/groups/:groupId/expenses/:expenseId/edit-request/reject',
  ...admin,
  expenseController.rejectEditRequest
);

module.exports = router;
