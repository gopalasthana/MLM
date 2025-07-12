const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  // Plan Basic Information
  name: {
    type: String,
    required: [true, 'Plan name is required'],
    trim: true,
    maxlength: [100, 'Plan name cannot exceed 100 characters']
  },
  
  description: {
    type: String,
    required: [true, 'Plan description is required'],
    maxlength: [500, 'Plan description cannot exceed 500 characters']
  },
  
  // Plan Pricing
  amount: {
    type: Number,
    required: [true, 'Plan amount is required'],
    min: [1, 'Plan amount must be at least 1']
  },
  
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'BTC', 'ETH', 'USDT']
  },
  
  // ROI Configuration
  roiPercentage: {
    type: Number,
    required: [true, 'ROI percentage is required'],
    min: [0, 'ROI percentage cannot be negative'],
    max: [100, 'ROI percentage cannot exceed 100%']
  },
  
  roiDuration: {
    type: Number,
    required: [true, 'ROI duration is required'],
    min: [1, 'ROI duration must be at least 1 day']
  },
  
  roiFrequency: {
    type: String,
    required: true,
    enum: ['daily', 'weekly', 'monthly'],
    default: 'daily'
  },
  
  // Level Commission Structure
  levelCommissions: [{
    level: {
      type: Number,
      required: true,
      min: 1
    },
    percentage: {
      type: Number,
      required: true,
      min: 0,
      max: 50
    }
  }],
  
  // Direct Referral Bonus
  directReferralBonus: {
    type: Number,
    default: 0,
    min: 0,
    max: 50
  },
  
  // Plan Status and Availability
  isActive: {
    type: Boolean,
    default: true
  },
  
  isVisible: {
    type: Boolean,
    default: true
  },
  
  // Plan Limits
  maxPurchases: {
    type: Number,
    default: null // null means unlimited
  },
  
  minReferralsRequired: {
    type: Number,
    default: 0
  },
  
  // Plan Features
  features: [{
    type: String,
    trim: true
  }],
  
  // Plan Category
  category: {
    type: String,
    enum: ['starter', 'basic', 'premium', 'vip', 'elite'],
    default: 'basic'
  },
  
  // Plan Priority (for display order)
  priority: {
    type: Number,
    default: 0
  },
  
  // Plan Statistics
  totalPurchases: {
    type: Number,
    default: 0
  },
  
  totalRevenue: {
    type: Number,
    default: 0
  },
  
  // Plan Validity
  validFrom: {
    type: Date,
    default: Date.now
  },
  
  validUntil: {
    type: Date,
    default: null // null means no expiry
  },
  
  // Auto-renewal settings
  autoRenewal: {
    enabled: {
      type: Boolean,
      default: false
    },
    discountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 50
    }
  },
  
  // Withdrawal settings
  withdrawalSettings: {
    minBalance: {
      type: Number,
      default: 10
    },
    maxDailyWithdrawal: {
      type: Number,
      default: 1000
    },
    withdrawalFee: {
      type: Number,
      default: 0,
      min: 0,
      max: 10
    }
  },
  
  // Plan Image/Icon
  image: {
    type: String,
    default: null
  },
  
  // Plan Color Theme
  colorTheme: {
    type: String,
    default: '#3B82F6'
  },
  
  // Created by admin
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
planSchema.index({ isActive: 1, isVisible: 1, priority: -1 });
planSchema.index({ category: 1, amount: 1 });
planSchema.index({ createdAt: -1 });

// Virtual for total ROI amount
planSchema.virtual('totalRoiAmount').get(function() {
  return (this.amount * this.roiPercentage) / 100;
});

// Virtual for daily ROI amount
planSchema.virtual('dailyRoiAmount').get(function() {
  const totalRoi = this.totalRoiAmount;
  switch (this.roiFrequency) {
    case 'daily':
      return totalRoi / this.roiDuration;
    case 'weekly':
      return totalRoi / (this.roiDuration * 7);
    case 'monthly':
      return totalRoi / (this.roiDuration * 30);
    default:
      return 0;
  }
});

// Virtual for plan status
planSchema.virtual('status').get(function() {
  if (!this.isActive) return 'inactive';
  if (this.validUntil && this.validUntil < new Date()) return 'expired';
  if (this.validFrom > new Date()) return 'upcoming';
  return 'active';
});

// Virtual for total commission percentage
planSchema.virtual('totalCommissionPercentage').get(function() {
  return this.levelCommissions.reduce((total, level) => total + level.percentage, 0);
});

// Pre-save middleware to validate level commissions
planSchema.pre('save', function(next) {
  // Sort level commissions by level
  this.levelCommissions.sort((a, b) => a.level - b.level);
  
  // Validate that levels are sequential starting from 1
  for (let i = 0; i < this.levelCommissions.length; i++) {
    if (this.levelCommissions[i].level !== i + 1) {
      return next(new Error('Level commissions must be sequential starting from level 1'));
    }
  }
  
  next();
});

// Method to check if plan is purchasable
planSchema.methods.isPurchasable = function() {
  if (!this.isActive || !this.isVisible) return false;
  if (this.validFrom > new Date()) return false;
  if (this.validUntil && this.validUntil < new Date()) return false;
  return true;
};

// Method to get commission for a specific level
planSchema.methods.getCommissionForLevel = function(level) {
  const commission = this.levelCommissions.find(c => c.level === level);
  return commission ? commission.percentage : 0;
};

// Method to calculate total investment return
planSchema.methods.calculateTotalReturn = function() {
  return this.amount + this.totalRoiAmount;
};

// Method to increment purchase count
planSchema.methods.incrementPurchase = function(amount = null) {
  this.totalPurchases += 1;
  this.totalRevenue += (amount || this.amount);
  return this.save();
};

// Static method to get active plans
planSchema.statics.getActivePlans = function() {
  return this.find({
    isActive: true,
    isVisible: true,
    validFrom: { $lte: new Date() },
    $or: [
      { validUntil: null },
      { validUntil: { $gte: new Date() } }
    ]
  }).sort({ priority: -1, amount: 1 });
};

// Static method to get plan statistics
planSchema.statics.getStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: '$category',
        totalPlans: { $sum: 1 },
        totalPurchases: { $sum: '$totalPurchases' },
        totalRevenue: { $sum: '$totalRevenue' },
        avgAmount: { $avg: '$amount' },
        avgRoi: { $avg: '$roiPercentage' }
      }
    },
    { $sort: { totalRevenue: -1 } }
  ]);
};

// Static method to get popular plans
planSchema.statics.getPopularPlans = function(limit = 5) {
  return this.find({
    isActive: true,
    isVisible: true
  })
  .sort({ totalPurchases: -1, totalRevenue: -1 })
  .limit(limit);
};

module.exports = mongoose.model('Plan', planSchema);
