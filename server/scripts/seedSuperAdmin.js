/**
 * seedSuperAdmin.js — create the Kharcha Marcha super admin (idempotent).
 *
 *   node scripts/seedSuperAdmin.js
 *
 * Creates superadmin@splittrack.app / SuperAdmin123! with isSuperAdmin=true
 * ONLY if no super admin exists yet. Re-running is a no-op. The same seed
 * also runs automatically on server startup (see server.js).
 * Requires MONGO_URI (from .env or environment).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const SUPERADMIN_EMAIL = 'superadmin@splittrack.app';
const SUPERADMIN_PASSWORD = 'SuperAdmin123!';
const SUPERADMIN_NAME = 'Super Admin';

async function seedSuperAdmin() {
  const existing = await User.findOne({ isSuperAdmin: true });
  if (existing) {
    return { created: false, user: existing };
  }
  const byEmail = await User.findOne({ emailOrPhone: SUPERADMIN_EMAIL });
  if (byEmail) {
    byEmail.isSuperAdmin = true;
    await byEmail.save();
    return { created: false, user: byEmail, promoted: true };
  }
  const passwordHash = await bcrypt.hash(SUPERADMIN_PASSWORD, 10);
  const user = await User.create({
    name: SUPERADMIN_NAME,
    emailOrPhone: SUPERADMIN_EMAIL,
    passwordHash,
    isSuperAdmin: true,
    avatarColor: '#6366F1',
  });
  return { created: true, user };
}

async function main() {
  const mongoUri =
    process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/splittrack';
  await mongoose.connect(mongoUri, { dbName: 'splittrack', serverSelectionTimeoutMS: 10000 });
  const result = await seedSuperAdmin();
  if (result.created) {
    console.log(`Super admin created: ${SUPERADMIN_EMAIL}`);
  } else if (result.promoted) {
    console.log(`Existing user ${SUPERADMIN_EMAIL} promoted to super admin.`);
  } else {
    console.log('Super admin already exists — nothing to do.');
  }
  await mongoose.disconnect();
  process.exit(0);
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('Super admin seed failed:', err);
    try {
      await mongoose.disconnect();
    } catch (e) {
      // ignore disconnect errors on failure path
    }
    process.exit(1);
  });
}

module.exports = { seedSuperAdmin, SUPERADMIN_EMAIL, SUPERADMIN_NAME };
