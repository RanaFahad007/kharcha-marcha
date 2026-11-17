const mongoose = require('mongoose');

// A student's own personal expense — NOT part of any group and never
// visible to any other user. Categories reuse the frontend category keys
// (food, transport, rent, utilities, entertainment, shopping, other) so
// the client can translate them with t(category).
const personalExpenseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    category: {
      type: String,
      enum: ['food', 'transport', 'rent', 'utilities', 'entertainment', 'shopping', 'other'],
      default: 'other',
    },
    date: { type: Date, default: Date.now },
    // YYYY-MM derived from `date` — used to scope queries to one month.
    month: {
      type: String,
      required: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
    },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

personalExpenseSchema.index({ userId: 1, month: 1, date: -1 });

module.exports = mongoose.model('PersonalExpense', personalExpenseSchema);
