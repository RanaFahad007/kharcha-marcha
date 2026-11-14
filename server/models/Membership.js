const mongoose = require('mongoose');

const membershipSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: { type: String, enum: ['ADMIN', 'MEMBER'], default: 'MEMBER' },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
      default: 'PENDING',
    },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

membershipSchema.index({ groupId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ groupId: 1, status: 1 });
membershipSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('Membership', membershipSchema);
