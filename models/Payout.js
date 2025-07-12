const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
  // Payout Identification
  payoutId: {
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
  
  // Payout Details
  amount: {
    type: Number,
    required: true,
    min: [1, 'Payout amount must be at least 1']
  },
  
  // Payout Status
  status: {
    type: String,
    required: true,
    enum: ['pending', 'approved', 'rejected', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  
  // Payment Method
  paymentMethod: {
    type: String,
    required: true,
    enum: ['bank', 'crypto', 'upi', 'paypal'],
    default: 'bank'
  },
  
  // Payment Details
  paymentDetails: {
    // Bank Transfer Details
    bankAccount: {
      accountNumber: String,
      accountHolderName: String,
      bankName: String,
      ifscCode: String,
      branch: String
    },
    
    // Crypto Details
    crypto: {
      type: {
        type: String,
        enum: ['bitcoin', 'ethereum', 'usdt']
      },
      address: String,
      network: String
    },
    
    // UPI Details
    upi: {
      upiId: String,
      name: String
    },
    
    // PayPal Details
    paypal: {
      email: String,
      name: String
    }
  },
  
  // Processing Information
  requestedAt: {
    type: Date,
    default: Date.now
  },
  
  processedAt: {
    type: Date,
    default: null
  },
  
  completedAt: {
    type: Date,
    default: null
  },
  
  // Admin Information
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Transaction Reference
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    default: null
  },
  
  // External Payment Reference
  externalReference: {
    type: String,
    default: null
  },
  
  // Notes and Remarks
  userNotes: {
    type: String,
    maxlength: [500, 'User notes cannot exceed 500 characters'],
    default: ''
  },
  
  adminNotes: {
    type: String,
    maxlength: [1000, 'Admin notes cannot exceed 1000 characters'],
    default: ''
  },
  
  rejectionReason: {
    type: String,
    maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
    default: null
  },
  
  // Fees and Charges
  processingFee: {
    type: Number,
    default: 0,
    min: 0
  },
  
  netAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Priority
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  
  // Retry Information
  retryCount: {
    type: Number,
    default: 0
  },
  
  lastRetryAt: {
    type: Date,
    default: null
  },
  
  // Verification
  isVerified: {
    type: Boolean,
    default: false
  },
  
  verifiedAt: {
    type: Date,
    default: null
  },
  
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
payoutSchema.index({ userId: 1, createdAt: -1 });
payoutSchema.index({ payoutId: 1 });
payoutSchema.index({ status: 1, createdAt: -1 });
payoutSchema.index({ processedBy: 1 });
payoutSchema.index({ requestedAt: -1 });

// Virtual for processing time
payoutSchema.virtual('processingTime').get(function() {
  if (this.processedAt && this.requestedAt) {
    return this.processedAt.getTime() - this.requestedAt.getTime();
  }
  return null;
});

// Virtual for age
payoutSchema.virtual('age').get(function() {
  return Date.now() - this.requestedAt.getTime();
});

// Pre-save middleware to generate payout ID and calculate net amount
payoutSchema.pre('save', function(next) {
  if (!this.payoutId) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.payoutId = `PO${timestamp}${random}`;
  }
  
  // Calculate net amount after processing fee
  this.netAmount = this.amount - this.processingFee;
  
  next();
});

// Method to approve payout
payoutSchema.methods.approve = function(adminId, notes = '') {
  this.status = 'approved';
  this.processedAt = new Date();
  this.processedBy = adminId;
  if (notes) {
    this.adminNotes = notes;
  }
  return this.save();
};

// Method to reject payout
payoutSchema.methods.reject = function(adminId, reason, notes = '') {
  this.status = 'rejected';
  this.processedAt = new Date();
  this.processedBy = adminId;
  this.rejectionReason = reason;
  if (notes) {
    this.adminNotes = notes;
  }
  return this.save();
};

// Method to mark as processing
payoutSchema.methods.markProcessing = function(adminId, externalRef = null) {
  this.status = 'processing';
  this.processedBy = adminId;
  if (externalRef) {
    this.externalReference = externalRef;
  }
  return this.save();
};

// Method to mark as completed
payoutSchema.methods.markCompleted = function(externalRef = null) {
  this.status = 'completed';
  this.completedAt = new Date();
  if (externalRef) {
    this.externalReference = externalRef;
  }
  return this.save();
};

// Method to mark as failed
payoutSchema.methods.markFailed = function(reason = '') {
  this.status = 'failed';
  this.retryCount += 1;
  this.lastRetryAt = new Date();
  if (reason) {
    this.adminNotes = reason;
  }
  return this.save();
};

// Static method to get pending payouts
payoutSchema.statics.getPendingPayouts = function(limit = 50, skip = 0) {
  return this.find({ status: 'pending' })
    .sort({ priority: -1, requestedAt: 1 })
    .limit(limit)
    .skip(skip)
    .populate('userId', 'username fullName email phone');
};

// Static method to get user payouts
payoutSchema.statics.getUserPayouts = function(userId, limit = 20, skip = 0) {
  return this.find({ userId })
    .sort({ requestedAt: -1 })
    .limit(limit)
    .skip(skip);
};

// Static method to get payout statistics
payoutSchema.statics.getStats = function(startDate = null, endDate = null) {
  const matchStage = {};
  
  if (startDate || endDate) {
    matchStage.requestedAt = {};
    if (startDate) matchStage.requestedAt.$gte = startDate;
    if (endDate) matchStage.requestedAt.$lte = endDate;
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$status',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount' }
      }
    },
    { $sort: { totalAmount: -1 } }
  ]);
};

// Static method to get daily payout summary
payoutSchema.statics.getDailySummary = function(date = new Date()) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  return this.aggregate([
    {
      $match: {
        requestedAt: { $gte: startOfDay, $lte: endOfDay }
      }
    },
    {
      $group: {
        _id: '$status',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);
};

module.exports = mongoose.model('Payout', payoutSchema);
