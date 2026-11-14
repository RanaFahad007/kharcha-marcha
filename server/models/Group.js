const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    color: { type: String, default: '#4F46E5' },
    avatar: { type: String, default: null },
    inviteCode: {
      type: String,
      uppercase: true,
      trim: true,
    },
    invitesEnabled: { type: Boolean, default: true },
    autoApproveJoin: { type: Boolean, default: false },
    currency: {
      type: String,
      enum: ['PKR', 'USD', 'EUR', 'AED', 'SAR', 'INR'],
      default: 'PKR',
    },
    monthlyBudget: { type: Number, default: 0, min: 0 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

groupSchema.index({ inviteCode: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Group', groupSchema);
