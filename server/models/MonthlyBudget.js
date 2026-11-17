const mongoose = require('mongoose');

// One pocket-money budget per user per month. A student sets how much
// pocket money they have for a month; the app then tracks their spending
// (personal expenses + their own shares of group expenses) against it.
const monthlyBudgetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    month: {
      type: String,
      required: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
    },
    pocketMoney: { type: Number, required: true, min: 0 },
    currency: {
      type: String,
      enum: ['PKR', 'USD', 'EUR', 'AED', 'SAR', 'INR'],
      default: 'PKR',
    },
  },
  { timestamps: true }
);

monthlyBudgetSchema.index({ userId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('MonthlyBudget', monthlyBudgetSchema);
