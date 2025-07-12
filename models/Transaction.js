const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // Transaction Identification
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  
  // User Information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Transaction Details
  type: {
    type: String,
    required: true,
    enum: [
      'direct_income',
      'level_income', 
      'roi_income',
      'bonus_income',
      'withdrawal',
      'investment',
      'plan_purchase',
      'referral_bonus',
      'admin_adjustment'
    ]
  },
  
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Transaction Status
  status: {
    type: String,
    required: true,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  
  // Description and Notes
  description: {
    type: String,
    required: true
  },
  
  notes: {
    type: String,
    default: null
  },
  
  // Related Information
  relatedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // For referral-related transactions
  },
  
  relatedTransactionId: {
    type: String,
    default: null // For linked transactions
  },
  
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan',
    default: null
  },
  
  // Payment Information
  paymentMethod: {
    type: String,
    enum: ['wallet', 'bank', 'crypto', 'upi', 'admin'],
    default: 'wallet'
  },
  
  paymentDetails: {
    // For crypto payments
    cryptoType: {
      type: String,
      enum: ['bitcoin', 'ethereum', 'usdt'],
      default: null
    },
    cryptoAddress: {
      type: String,
      default: null
    },
    txHash: {
      type: String,
      default: null
    },
    
    // For bank transfers
    bankAccount: {
      type: String,
      default: null
    },
    
    // For UPI
    upiId: {
      type: String,
      default: null
    },
    
    // External payment reference
    externalRef: {
      type: String,
      default: null
    }
  },
  
  // Balance Information (snapshot at transaction time)
  balanceBefore: {
    type: Number,
    default: 0
  },
  
  balanceAfter: {
    type: Number,
    default: 0
  },
  
  // Admin Information
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  processedAt: {
    type: Date,
    default: null
  },
  
  // Timestamps
  completedAt: {
    type: Date,
    default: null
  },
  
  failedAt: {
    type: Date,
    default: null
  },
  
  // Level information for level income
  level: {
    type: Number,
    default: null
  },
  
  // ROI information
  roiPercentage: {
    type: Number,
    default: null
  },
  
  roiDays: {
    type: Number,
    default: null
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ transactionId: 1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ relatedUserId: 1 });

// Virtual for transaction age
transactionSchema.virtual('age').get(function() {
  return Date.now() - this.createdAt.getTime();
});

// Pre-save middleware to generate transaction ID
transactionSchema.pre('save', function(next) {
  if (!this.transactionId) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.transactionId = `TXN${timestamp}${random}`;
  }
  next();
});

// Method to mark transaction as completed
transactionSchema.methods.markCompleted = function(processedBy = null) {
  this.status = 'completed';
  this.completedAt = new Date();
  if (processedBy) {
    this.processedBy = processedBy;
    this.processedAt = new Date();
  }
  return this.save();
};

// Method to mark transaction as failed
transactionSchema.methods.markFailed = function(reason = '', processedBy = null) {
  this.status = 'failed';
  this.failedAt = new Date();
  if (reason) {
    this.notes = reason;
  }
  if (processedBy) {
    this.processedBy = processedBy;
    this.processedAt = new Date();
  }
  return this.save();
};

// Static method to get user transactions
transactionSchema.statics.getUserTransactions = function(userId, limit = 50, skip = 0) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate('relatedUserId', 'username fullName')
    .populate('planId', 'name amount');
};

// Static method to get pending transactions
transactionSchema.statics.getPendingTransactions = function(type = null) {
  const query = { status: 'pending' };
  if (type) {
    query.type = type;
  }
  return this.find(query)
    .sort({ createdAt: 1 })
    .populate('userId', 'username fullName email')
    .populate('relatedUserId', 'username fullName');
};

// Static method to get transaction statistics
transactionSchema.statics.getStats = function(startDate = null, endDate = null) {
  const matchStage = { status: 'completed' };
  
  if (startDate || endDate) {
    matchStage.completedAt = {};
    if (startDate) matchStage.completedAt.$gte = startDate;
    if (endDate) matchStage.completedAt.$lte = endDate;
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$type',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount' }
      }
    },
    { $sort: { totalAmount: -1 } }
  ]);
};

module.exports = mongoose.model('Transaction', transactionSchema);
