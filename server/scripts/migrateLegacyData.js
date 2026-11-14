/**
 * migrateLegacyData.js — safe, idempotent migration for legacy Kharcha Marcha data.
 *
 *   node scripts/migrateLegacyData.js            -> dry run: prints what it
 *                                                   WOULD do, writes nothing.
 *   node scripts/migrateLegacyData.js --confirm  -> performs the migration.
 *
 * Confirm mode runs inside a MongoDB transaction when the deployment
 * supports it (replica set / Atlas). If transactions are unsupported
 * (standalone mongod), it falls back to the same writes without a
 * transaction and prints a warning. Dry runs never write.
 *
 * Migrates, only when present:
 *  - legacy expenses with `paid_by` (string id) -> `paidBy` (ObjectId)
 *  - legacy expenses with `paid_by` as a plain string name -> skipped + counted
 *  - legacy Group docs with a `members` array -> Membership docs
 *    (role ADMIN for the group creator, MEMBER otherwise; status ACCEPTED)
 *  - duplicate Memberships for the same (groupId, userId) -> keep earliest, delete rest
 *  - Groups missing inviteCode -> backfill a unique KH-XXXX code
 *  - missing defaults: Group.invitesEnabled / autoApproveJoin /
 *    currency / monthlyBudget, User.isSuperAdmin / isBlocked /
 *    avatarColor, Expense.status / type / editCount / canEditAgain /
 *    isDeleted / isHidden / splitMethod / notes / receiptUrl / editHistory,
 *    splitBetween entries missing shareMeta -> 0, Membership.role / status
 *
 * Idempotent: re-running after a successful migration reports 0 changes.
 * Requires MONGO_URI (from .env or environment). Never deletes real data
 * except duplicate Membership rows, which are reported.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const crypto = require('crypto');

const confirm = process.argv.includes('--confirm');

function inviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'KH-';
  const bytes = crypto.randomBytes(4);
  for (let i = 0; i < 4; i += 1) code += chars[bytes[i] % chars.length];
  return code;
}

async function uniqueInviteCode(db, session) {
  for (let i = 0; i < 10; i += 1) {
    const code = inviteCode();
    const clash = await db
      .collection('groups')
      .findOne({ inviteCode: code }, session ? { session } : undefined);
    if (!clash) return code;
  }
  return `KH-${Date.now().toString(36).toUpperCase().slice(-4)}`;
}

function isTxUnsupportedError(err) {
  const msg = String((err && err.message) || '');
  return (
    /transaction numbers are only allowed/i.test(msg) ||
    /replica set/i.test(msg) ||
    /transactions are not supported/i.test(msg)
  );
}

// All migration steps. `session` is null in dry-run and in the
// non-transactional fallback; every write is gated on `confirm`.
async function runMigration(db, session) {
  const opts = session ? { session } : undefined;
  const counts = {
    expensesPaidByMigrated: 0,
    expensesPaidByUnresolvable: 0,
    membershipsCreatedFromGroupMembers: 0,
    membershipsDeduped: 0,
    groupsInviteCodeBackfilled: 0,
    groupsDefaultsSet: 0,
    usersDefaultsSet: 0,
    expensesDefaultsSet: 0,
    membershipsDefaultsSet: 0,
    expensesShareMetaBackfilled: 0,
  };

  // 1. Legacy expenses: paid_by -> paidBy
  const legacyExpenses = await db
    .collection('expenses')
    .find({ paid_by: { $exists: true }, paidBy: { $exists: false } }, opts)
    .toArray();
  let migrated = 0;
  let unresolvable = 0;
  for (const exp of legacyExpenses) {
    const raw = exp.paid_by;
    const isObjectIdLike = typeof raw === 'string' && /^[0-9a-fA-F]{24}$/.test(raw);
    const isObjectId = raw && typeof raw === 'object' && raw._bsontype === 'ObjectId';
    if (isObjectIdLike || isObjectId) {
      const oid = isObjectId ? raw : new mongoose.Types.ObjectId(raw);
      const user = await db.collection('users').findOne({ _id: oid }, opts);
      if (user) {
        if (confirm) {
          await db.collection('expenses').updateOne(
            { _id: exp._id },
            { $set: { paidBy: oid }, $unset: { paid_by: '' } },
            opts
          );
        }
        migrated += 1;
      } else {
        unresolvable += 1;
      }
    } else {
      unresolvable += 1;
    }
  }
  counts.expensesPaidByMigrated = migrated;
  counts.expensesPaidByUnresolvable = unresolvable;

  // 2. Legacy Group.members array -> Membership docs
  const groupsWithMembers = await db
    .collection('groups')
    .find({ members: { $exists: true, $ne: [] } }, opts)
    .toArray();
  let createdMemberships = 0;
  for (const group of groupsWithMembers) {
    const members = Array.isArray(group.members) ? group.members : [];
    for (const m of members) {
      const userId = m && m.userId ? m.userId : m;
      const userOid =
        typeof userId === 'string' && /^[0-9a-fA-F]{24}$/.test(userId)
          ? new mongoose.Types.ObjectId(userId)
          : userId;
      if (!userOid || typeof userOid !== 'object') continue;
      const existing = await db.collection('memberships').findOne(
        { groupId: group._id, userId: userOid },
        opts
      );
      if (existing) continue;
      const role =
        (m && m.role) ||
        (group.createdBy && String(group.createdBy) === String(userOid) ? 'ADMIN' : 'MEMBER');
      if (confirm) {
        await db.collection('memberships').insertOne(
          {
            groupId: group._id,
            userId: userOid,
            role: role === 'ADMIN' ? 'ADMIN' : 'MEMBER',
            status: 'ACCEPTED',
            joinedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          opts
        );
      }
      createdMemberships += 1;
    }
    if (confirm) {
      await db.collection('groups').updateOne({ _id: group._id }, { $unset: { members: '' } }, opts);
    }
  }
  counts.membershipsCreatedFromGroupMembers = createdMemberships;

  // 3. Dedupe Memberships on (groupId, userId): keep earliest, delete rest.
  const dupGroups = await db
    .collection('memberships')
    .aggregate(
      [
        { $group: { _id: { groupId: '$groupId', userId: '$userId' }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
      ],
      opts
    )
    .toArray();
  let deduped = 0;
  for (const dup of dupGroups) {
    const docs = await db
      .collection('memberships')
      .find({ _id: { $in: dup.ids } }, opts)
      .sort({ createdAt: 1, _id: 1 })
      .toArray();
    const extras = docs.slice(1).map((d) => d._id);
    if (extras.length > 0) {
      if (confirm) {
        await db.collection('memberships').deleteMany({ _id: { $in: extras } }, opts);
      }
      deduped += extras.length;
    }
  }
  counts.membershipsDeduped = deduped;

  // 4. Backfill inviteCode KH-XXXX for groups missing one.
  const groupsNoCode = await db
    .collection('groups')
    .find(
      { $or: [{ inviteCode: { $exists: false } }, { inviteCode: null }, { inviteCode: '' }] },
      opts
    )
    .toArray();
  let backfilled = 0;
  for (const group of groupsNoCode) {
    const code = await uniqueInviteCode(db, session);
    if (confirm) {
      await db.collection('groups').updateOne(
        { _id: group._id },
        { $set: { inviteCode: code } },
        opts
      );
    }
    backfilled += 1;
  }
  counts.groupsInviteCodeBackfilled = backfilled;

  // 5. Backfill defaults, per field, only where that field is missing.
  //    Includes the v2 fields (avatarColor, currency, monthlyBudget,
  //    splitMethod, notes, receiptUrl, editHistory).
  const defaultSets = [
    ['groups', { invitesEnabled: { $exists: false } }, { invitesEnabled: true }],
    ['groups', { autoApproveJoin: { $exists: false } }, { autoApproveJoin: false }],
    ['groups', { color: { $exists: false } }, { color: '#4F46E5' }],
    ['groups', { currency: { $exists: false } }, { currency: 'PKR' }],
    ['groups', { monthlyBudget: { $exists: false } }, { monthlyBudget: 0 }],
    ['users', { isSuperAdmin: { $exists: false } }, { isSuperAdmin: false }],
    ['users', { isBlocked: { $exists: false } }, { isBlocked: false }],
    ['users', { avatarColor: { $exists: false } }, { avatarColor: '#6366F1' }],
    ['expenses', { type: { $exists: false } }, { type: 'EXPENSE' }],
    ['expenses', { status: { $exists: false } }, { status: 'PENDING_SETTLEMENT' }],
    ['expenses', { editCount: { $exists: false } }, { editCount: 0 }],
    ['expenses', { canEditAgain: { $exists: false } }, { canEditAgain: false }],
    ['expenses', { isDeleted: { $exists: false } }, { isDeleted: false }],
    ['expenses', { isHidden: { $exists: false } }, { isHidden: false }],
    ['expenses', { splitMethod: { $exists: false } }, { splitMethod: 'EQUAL' }],
    ['expenses', { notes: { $exists: false } }, { notes: '' }],
    ['expenses', { receiptUrl: { $exists: false } }, { receiptUrl: '' }],
    ['expenses', { editHistory: { $exists: false } }, { editHistory: [] }],
    ['memberships', { role: { $exists: false } }, { role: 'MEMBER' }],
    ['memberships', { status: { $exists: false } }, { status: 'PENDING' }],
  ];
  let usersDefaults = 0;
  let expensesDefaults = 0;
  let membershipsDefaults = 0;
  let groupsDefaults = 0;
  for (const [coll, filter, set] of defaultSets) {
    let n;
    if (confirm) {
      const r = await db.collection(coll).updateMany(filter, { $set: set }, opts);
      n = r.modifiedCount || 0;
    } else {
      n = await db.collection(coll).countDocuments(filter, opts);
    }
    if (coll === 'users') usersDefaults += n;
    else if (coll === 'expenses') expensesDefaults += n;
    else if (coll === 'memberships') membershipsDefaults += n;
    else groupsDefaults += n;
  }
  counts.groupsDefaultsSet = groupsDefaults;
  counts.usersDefaultsSet = usersDefaults;
  counts.expensesDefaultsSet = expensesDefaults;
  counts.membershipsDefaultsSet = membershipsDefaults;

  // 6. splitBetween entries missing shareMeta -> 0 (preserves existing values).
  const shareMetaFilter = {
    splitBetween: { $elemMatch: { shareMeta: { $exists: false } } },
  };
  if (confirm) {
    const r = await db.collection('expenses').updateMany(
      shareMetaFilter,
      [
        {
          $set: {
            splitBetween: {
              $map: {
                input: '$splitBetween',
                as: 's',
                in: {
                  $mergeObjects: ['$$s', { shareMeta: { $ifNull: ['$$s.shareMeta', 0] } }],
                },
              },
            },
          },
        },
      ],
      opts
    );
    counts.expensesShareMetaBackfilled = r.modifiedCount || 0;
  } else {
    counts.expensesShareMetaBackfilled = await db
      .collection('expenses')
      .countDocuments(shareMetaFilter, opts);
  }

  return counts;
}

async function main() {
  console.log(
    `Kharcha Marcha legacy migration — mode: ${confirm ? 'CONFIRM (will write)' : 'DRY RUN (no writes)'}`
  );

  const mongoUri =
    process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/splittrack';
  await mongoose.connect(mongoUri, { dbName: 'splittrack', serverSelectionTimeoutMS: 10000 });
  console.log('Connected to MongoDB');
  const db = mongoose.connection.db;

  let counts;
  if (!confirm) {
    counts = await runMigration(db, null);
  } else {
    // Transactional when supported; fall back to non-transactional writes
    // on a standalone mongod (which cannot run transactions).
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        counts = await runMigration(db, session);
      });
      console.log('Migration ran inside a transaction.');
    } catch (err) {
      if (isTxUnsupportedError(err)) {
        console.warn(
          'WARNING: transactions unsupported on this deployment — re-running without a transaction.'
        );
        counts = await runMigration(db, null);
      } else {
        throw err;
      }
    } finally {
      await session.endSession();
    }
  }

  console.log('Migration summary:');
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  if (!confirm) {
    console.log('Dry run complete — no data was written. Re-run with --confirm to apply.');
  } else {
    console.log('Migration complete.');
  }
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  try {
    await mongoose.disconnect();
  } catch (e) {
    // ignore disconnect errors on failure path
  }
  process.exit(1);
});
