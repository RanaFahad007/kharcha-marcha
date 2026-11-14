const bcrypt = require('bcryptjs');
const Group = require('../models/Group');
const Membership = require('../models/Membership');
const Expense = require('../models/Expense');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { generateInviteCode } = require('./groupController');
const { computeSplits } = require('../utils/splitEngine');
const { logActivity } = require('../utils/activityLog');

const DEMO_GROUP_NAME = '🎓 Uni Friends Hostel & Northern Trip (Demo)';
const DEMO_GROUP_NAME_V1 = '🎓 Uni Friends Hostel & Trip (Demo)';
const DEMO_PASSWORD = 'demo1234';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
}

const DEMO_USERS = [
  { key: 'ali', name: 'Ali Khan', email: 'demo-ali@splittrack.demo', avatarColor: '#6366F1' },
  { key: 'sara', name: 'Sara Ahmed', email: 'demo-sara@splittrack.demo', avatarColor: '#EC4899' },
  { key: 'bilal', name: 'Bilal Raza', email: 'demo-bilal@splittrack.demo', avatarColor: '#F59E0B' },
  { key: 'zara', name: 'Zara Tariq', email: 'demo-zara@splittrack.demo', avatarColor: '#10B981' },
];
const PENDING_USER = {
  key: 'hamza',
  name: 'Hamza Malik',
  email: 'demo-hamza@splittrack.demo',
  avatarColor: '#8B5CF6',
};

async function findOrCreateDemoUser({ name, email, avatarColor }) {
  let user = await User.findOne({ emailOrPhone: email });
  if (user) {
    let changed = false;
    if (!user.isDemoUser) {
      user.isDemoUser = true;
      changed = true;
    }
    if (user.name !== name) {
      user.name = name;
      changed = true;
    }
    if (user.avatarColor !== avatarColor) {
      user.avatarColor = avatarColor;
      changed = true;
    }
    if (changed) await user.save();
    return user;
  }
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  user = await User.create({
    name,
    emailOrPhone: email,
    passwordHash,
    isDemoUser: true,
    avatarColor,
  });
  return user;
}

async function loadDemo(req, res, next) {
  try {
    // Idempotent: an existing demo group owned by this user is returned
    // as-is (v1 demo groups are upgraded in place to the v2 name/budget).
    const existing = await Group.findOne({
      createdBy: req.user._id,
      isDemoGroup: true,
    });
    if (existing) {
      let changed = false;
      if (existing.name !== DEMO_GROUP_NAME) {
        existing.name = DEMO_GROUP_NAME;
        changed = true;
      }
      if (existing.currency !== 'PKR') {
        existing.currency = 'PKR';
        changed = true;
      }
      if (existing.monthlyBudget !== 50000) {
        existing.monthlyBudget = 50000;
        changed = true;
      }
      if (changed) await existing.save();
      const memberCount = await Membership.countDocuments({
        groupId: existing._id,
        status: 'ACCEPTED',
      });
      const expenseCount = await Expense.countDocuments({
        groupId: existing._id,
        isDeleted: false,
      });
      return res.json({
        success: true,
        message: 'Demo data already exists',
        data: {
          group: existing,
          memberCount,
          expenseCount,
          alreadyExists: true,
        },
      });
    }

    const demoUsers = {};
    for (const def of DEMO_USERS) {
      demoUsers[def.key] = await findOrCreateDemoUser(def);
    }
    const hamza = await findOrCreateDemoUser(PENDING_USER);

    // Unique invite code (retry on collision).
    let inviteCode = generateInviteCode();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const clash = await Group.findOne({ inviteCode });
      if (!clash) break;
      inviteCode = generateInviteCode();
    }

    const group = await Group.create({
      name: DEMO_GROUP_NAME,
      color: '#4F46E5',
      avatar: null,
      inviteCode,
      invitesEnabled: true,
      autoApproveJoin: false,
      isDemoGroup: true,
      currency: 'PKR',
      monthlyBudget: 50000,
      createdBy: req.user._id,
    });

    const me = req.user;
    const { ali, sara, bilal, zara } = demoUsers;
    const allMembers = [me, ali, sara, bilal, zara];

    await Membership.create({
      groupId: group._id,
      userId: me._id,
      role: 'ADMIN',
      status: 'ACCEPTED',
      joinedAt: new Date(),
    });
    for (const u of [ali, sara, bilal, zara]) {
      await Membership.create({
        groupId: group._id,
        userId: u._id,
        role: 'MEMBER',
        status: 'ACCEPTED',
        joinedAt: new Date(),
      });
    }
    // 5th demo user with a PENDING join request.
    await Membership.create({
      groupId: group._id,
      userId: hamza._id,
      role: 'MEMBER',
      status: 'PENDING',
      joinedAt: new Date(),
    });

    // 15 realistic expenses over the last 25 days, using all four split
    // methods, plus 1 SETTLEMENT. `members` are the split participants;
    // `shares` entries are { user, shareAmount?, shareMeta? } for the engine.
    const seed = [
      { title: 'Pizza Night', amount: 2500, category: 'Food', paidBy: ali, days: 1, method: 'EQUAL', members: allMembers },
      {
        title: 'Chai Dhaba',
        amount: 1200,
        category: 'Food',
        paidBy: bilal,
        days: 2,
        method: 'EQUAL',
        members: [bilal, ali, sara],
        // Pending 2nd-edit request: Bilal already edited once (1000 -> 1200)
        // and now asks to change 1200 -> 1500.
        editCount: 1,
        editHistory: [
          {
            editedBy: bilal._id,
            editedAt: daysAgo(2),
            previousAmount: 1000,
            previousTitle: 'Chai Dhaba',
          },
        ],
        editRequest: {
          status: 'PENDING',
          reason: 'Forgot to add paratha bill',
          requestedAt: new Date(),
        },
      },
      { title: 'Hostel Milk & Eggs', amount: 1200, category: 'Groceries', paidBy: me, days: 3, method: 'EQUAL', members: allMembers },
      {
        title: 'Uber to Campus',
        amount: 800,
        category: 'Transport',
        paidBy: bilal,
        days: 4,
        method: 'EXACT',
        shares: [
          { user: bilal._id, shareAmount: 300 },
          { user: zara._id, shareAmount: 250 },
          { user: ali._id, shareAmount: 250 },
        ],
      },
      { title: 'Rickshaw to Bazaar', amount: 300, category: 'Transport', paidBy: zara, days: 5, method: 'EQUAL', members: [zara, sara] },
      {
        title: 'Murree Trip Van Fuel',
        amount: 6000,
        category: 'Trip',
        paidBy: ali,
        days: 7,
        method: 'PERCENTAGE',
        shares: [
          { user: ali._id, shareMeta: 40 },
          { user: sara._id, shareMeta: 20 },
          { user: bilal._id, shareMeta: 20 },
          { user: zara._id, shareMeta: 10 },
          { user: me._id, shareMeta: 10 },
        ],
      },
      {
        title: 'Hotel Advance Northern Trip',
        amount: 8000,
        category: 'Trip',
        paidBy: me,
        days: 8,
        method: 'SHARES',
        shares: [
          { user: me._id, shareMeta: 2 },
          { user: ali._id, shareMeta: 2 },
          { user: sara._id, shareMeta: 1 },
          { user: bilal._id, shareMeta: 1 },
          { user: zara._id, shareMeta: 1 },
        ],
      },
      { title: 'Photocopies & Lab Manuals', amount: 950, category: 'Stationery', paidBy: sara, days: 10, method: 'EQUAL', members: [sara, bilal, zara, me] },
      { title: 'Hostel Wi-Fi Bill', amount: 2000, category: 'Utilities', paidBy: bilal, days: 12, method: 'EQUAL', members: allMembers },
      {
        title: 'Electricity Bill Share',
        amount: 3500,
        category: 'Utilities',
        paidBy: zara,
        days: 14,
        method: 'PERCENTAGE',
        shares: allMembers.map((u) => ({ user: u._id, shareMeta: 20 })),
      },
      { title: 'Pizza Night Again', amount: 2200, category: 'Food', paidBy: me, days: 16, method: 'EQUAL', members: allMembers },
      {
        title: 'Weekly Groceries',
        amount: 3800,
        category: 'Groceries',
        paidBy: sara,
        days: 19,
        method: 'EXACT',
        shares: [
          { user: sara._id, shareAmount: 1000 },
          { user: ali._id, shareAmount: 800 },
          { user: bilal._id, shareAmount: 800 },
          { user: zara._id, shareAmount: 600 },
          { user: me._id, shareAmount: 600 },
        ],
      },
      {
        title: 'Uber to Campus',
        amount: 750,
        category: 'Transport',
        paidBy: ali,
        days: 21,
        method: 'SHARES',
        shares: [
          { user: ali._id, shareMeta: 2 },
          { user: bilal._id, shareMeta: 1 },
          { user: me._id, shareMeta: 1 },
        ],
      },
      { title: 'Chai Dhaba', amount: 500, category: 'Food', paidBy: zara, days: 23, method: 'EQUAL', members: allMembers },
      { title: 'Movie Night Tickets', amount: 1800, category: 'Entertainment', paidBy: sara, days: 25, method: 'EQUAL', members: [sara, ali, zara, me] },
    ];

    const created = [];
    for (const s of seed) {
      const entries = s.shares || (s.members || []).map((u) => ({ user: u._id }));
      const computed = computeSplits(s.amount, s.method, entries);
      if (computed.error) {
        throw new Error(`Demo seed split failed for "${s.title}": ${computed.error}`);
      }
      const expense = await Expense.create({
        groupId: group._id,
        title: s.title,
        amount: s.amount,
        category: s.category,
        type: 'EXPENSE',
        status: 'PENDING_SETTLEMENT',
        date: daysAgo(s.days),
        paidBy: s.paidBy._id,
        createdBy: s.paidBy._id,
        splitBetween: computed.shares,
        splitMethod: s.method,
        notes: '',
        receiptUrl: '',
        editCount: s.editCount || 0,
        canEditAgain: false,
        editHistory: s.editHistory || [],
        editRequest: s.editRequest || { status: 'NONE', reason: null, requestedAt: null },
      });
      created.push(expense);
    }

    // 1 SETTLEMENT: Bilal Raza paid Ali Khan 1500.
    const settlement = await Expense.create({
      groupId: group._id,
      title: 'Settlement: Bilal Raza paid Ali Khan',
      amount: 1500,
      category: 'Settlement',
      type: 'SETTLEMENT',
      status: 'CLEARED',
      date: daysAgo(6),
      paidBy: bilal._id,
      createdBy: bilal._id,
      splitBetween: [{ user: ali._id, shareAmount: 1500, shareMeta: 0 }],
      splitMethod: 'EXACT',
    });
    created.push(settlement);

    // Exactly 6 ActivityLog entries for the demo group.
    await logActivity(group._id, me._id, 'GROUP_CREATED', `${me.name || 'You'} created group "${DEMO_GROUP_NAME}"`);
    await logActivity(group._id, ali._id, 'MEMBER_JOINED', 'Ali Khan joined the group');
    await logActivity(group._id, sara._id, 'MEMBER_JOINED', 'Sara Ahmed joined the group');
    await logActivity(group._id, ali._id, 'EXPENSE_ADDED', 'Ali Khan added "Pizza Night" (2500)');
    await logActivity(group._id, bilal._id, 'SETTLEMENT_RECORDED', 'Bilal Raza paid Ali Khan 1500');
    await logActivity(group._id, bilal._id, 'EDIT_REQUESTED', 'Bilal Raza requested another edit for "Chai Dhaba": Forgot to add paratha bill');

    return res.status(201).json({
      success: true,
      message: 'Demo data loaded',
      data: {
        group,
        memberCount: 5,
        expenseCount: created.length,
        demoUsers: [ali, sara, bilal, zara].map((u) => ({
          _id: u._id,
          name: u.name,
          emailOrPhone: u.emailOrPhone,
        })),
        pendingRequestUser: { _id: hamza._id, name: hamza.name, emailOrPhone: hamza.emailOrPhone },
        alreadyExists: false,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function clearDemo(req, res, next) {
  try {
    // Only demo data is ever touched: groups flagged isDemoGroup, users
    // flagged isDemoUser, and activity logs of demo groups. Real groups,
    // expenses and users are never matched.
    const demoGroups = await Group.find({ isDemoGroup: true }).select('_id');
    const demoGroupIds = demoGroups.map((g) => g._id);
    const demoUsers = await User.find({ isDemoUser: true }).select('_id');
    const demoUserIds = demoUsers.map((u) => u._id);

    const expensesDeleted = await Expense.deleteMany({
      groupId: { $in: demoGroupIds },
    });
    const logsDeleted = await ActivityLog.deleteMany({
      groupId: { $in: demoGroupIds },
    });
    const membershipsDeleted = await Membership.deleteMany({
      $or: [
        { groupId: { $in: demoGroupIds } },
        { userId: { $in: demoUserIds } },
      ],
    });
    const groupsDeleted = await Group.deleteMany({ isDemoGroup: true });
    const usersDeleted = await User.deleteMany({ isDemoUser: true });

    return res.json({
      success: true,
      message: 'Demo data cleared',
      data: {
        expensesDeleted: expensesDeleted.deletedCount || 0,
        activityLogsDeleted: logsDeleted.deletedCount || 0,
        membershipsDeleted: membershipsDeleted.deletedCount || 0,
        groupsDeleted: groupsDeleted.deletedCount || 0,
        usersDeleted: usersDeleted.deletedCount || 0,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { loadDemo, clearDemo, DEMO_GROUP_NAME, DEMO_GROUP_NAME_V1 };
