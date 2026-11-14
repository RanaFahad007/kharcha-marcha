const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    emailOrPhone: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    isSuperAdmin: { type: Boolean, default: false },
    isBlocked: { type: Boolean, default: false },
    avatarColor: { type: String, default: '#6366F1' },
    lastActiveGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      default: null,
    },
  },
  { timestamps: true }
);

userSchema.index({ emailOrPhone: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
