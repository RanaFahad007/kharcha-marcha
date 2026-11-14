const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
    },
    title: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    category: {
      type: String,
      enum: [
        'Food',
        'Transport',
        'Groceries',
        'Trip',
        'Stationery',
        'Utilities',
        'Rent',
        'Entertainment',
        'Settlement',
        'Other',
      ],
      default: 'Other',
    },
    type: {
      type: String,
      enum: ['EXPENSE', 'SETTLEMENT'],
      default: 'EXPENSE',
    },
    status: {
      type: String,
      enum: ['PENDING_SETTLEMENT', 'CLEARED'],
      default: 'PENDING_SETTLEMENT',
    },
    date: { type: Date, default: Date.now },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    splitBetween: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        shareAmount: { type: Number, required: true, min: 0 },
        shareMeta: { type: Number, default: 0 },
        _id: false,
      },
    ],
    splitMethod: {
      type: String,
      enum: ['EQUAL', 'EXACT', 'PERCENTAGE', 'SHARES'],
      default: 'EQUAL',
    },
    notes: { type: String, default: '' },
    receiptUrl: { type: String, default: '' },
    editHistory: [
      {
        editedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        editedAt: { type: Date, default: Date.now },
        previousAmount: { type: Number, required: true },
        previousTitle: { type: String, required: true },
        _id: false,
      },
    ],
    editCount: { type: Number, default: 0 },
    canEditAgain: { type: Boolean, default: false },
    editRequest: {
      status: {
        type: String,
        enum: ['NONE', 'PENDING', 'APPROVED', 'REJECTED'],
        default: 'NONE',
      },
      reason: { type: String, default: null },
      requestedAt: { type: Date, default: null },
    },
    isDeleted: { type: Boolean, default: false },
    isHidden: { type: Boolean, default: false },
  },
  { timestamps: true }
);

expenseSchema.index({ groupId: 1, date: -1 });
expenseSchema.index({ groupId: 1, category: 1 });
expenseSchema.index({ groupId: 1, paidBy: 1 });
expenseSchema.index({ groupId: 1, 'splitBetween.user': 1 });

module.exports = mongoose.model('Expense', expenseSchema);
