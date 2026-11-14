require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const apiRouter = require('./routes/api');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS: allow the configured frontend origin(s) via env, plus local dev.
// VITE_API_URL is the API base the client talks to; the frontend origin is
// FRONTEND_URL (or VITE_FRONTEND_URL / CLIENT_URL). Comma-separated lists
// are supported. Requests without an Origin header (curl, server-to-server)
// are allowed.
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.VITE_FRONTEND_URL,
  process.env.CLIENT_URL,
  process.env.VITE_API_URL,
  'http://localhost:5173',
  'http://localhost:3000',
]
  .flatMap((v) => (v ? String(v).split(',') : []))
  .map((v) => v.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      const clean = origin.replace(/\/$/, '');
      if (allowedOrigins.includes(clean)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ success: true, message: 'SplitTrack API is running', data: { status: 'ok' } });
});
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'OK', data: { status: 'ok' } });
});

app.use('/api', apiRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ success: false, error: err.message });
  }
  if (err && err.name === 'CastError') {
    return res.status(400).json({ success: false, error: 'Invalid ID format' });
  }
  return res
    .status(err && err.status ? err.status : 500)
    .json({ success: false, error: (err && err.message) || 'Internal server error' });
});

const SUPERADMIN_EMAIL = 'superadmin@splittrack.app';
const SUPERADMIN_PASSWORD = 'SuperAdmin123!';

// Startup seed: create the super admin ONLY if no super admin exists yet.
async function seedSuperAdminIfNeeded() {
  try {
    const existing = await User.findOne({ isSuperAdmin: true });
    if (existing) return;
    const byEmail = await User.findOne({ emailOrPhone: SUPERADMIN_EMAIL });
    if (byEmail) {
      byEmail.isSuperAdmin = true;
      await byEmail.save();
      console.log(`Existing user ${SUPERADMIN_EMAIL} promoted to super admin.`);
      return;
    }
    const passwordHash = await bcrypt.hash(SUPERADMIN_PASSWORD, 10);
    await User.create({
      name: 'Super Admin',
      emailOrPhone: SUPERADMIN_EMAIL,
      passwordHash,
      isSuperAdmin: true,
      avatarColor: '#6366F1',
    });
    console.log(`Super admin seeded: ${SUPERADMIN_EMAIL}`);
  } catch (err) {
    console.error('Super admin seed failed:', err.message);
  }
}

async function start() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/splittrack';
  try {
    await mongoose.connect(mongoUri, { dbName: 'splittrack', serverSelectionTimeoutMS: 10000 });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }
  await seedSuperAdminIfNeeded();
  app.listen(PORT, () => {
    console.log(`SplitTrack server listening on port ${PORT}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = app;
