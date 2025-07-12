const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // Main Balance Categories
  directIncome: {
    type: Number,
    default: 0,
    min: 0
  },
  levelIncome: {
    type: Number,
    default: 0,
    min: 0
  },
  roiIncome: {
    type: Number,
    default: 0,
    min: 0
  },
  bonusIncome: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Total Available Balance
  totalBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Withdrawal Information
  totalWithdrawn: {
    type: Number,
    default: 0,
    min: 0
  },
  pendingWithdrawal: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Investment Information
  totalInvested: {
    type: Number,
    default: 0,
    min: 0
  },
  activeInvestment: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Wallet Status
  isActive: {
    type: Boolean,
    default: true
  },
  isFrozen: {
    type: Boolean,
    default: false
  },
  
  // Last Transaction Reference
  lastTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    default: null
  },
  
  // Crypto Wallet Addresses (Optional)
  cryptoAddresses: {
    bitcoin: {
      type: String,
      default: null
    },
    ethereum: {
      type: String,
      default: null
    },
    usdt: {
      type: String,
      default: null
    }
  },
  
  // Bank Details (Optional)
  bankDetails: {
    accountNumber: {
      type: String,
      default: null
    },
    accountHolderName: {
      type: String,
      default: null
    },
    bankName: {
      type: String,
      default: null
    },
    ifscCode: {
      type: String,
      default: null
    },
    branch: {
      type: String,
      default: null
    }
  },
  
  // UPI Details (Optional)
  upiId: {
    type: String,
    default: null
  },
  
  // Minimum withdrawal limit
  minWithdrawal: {
    type: Number,
    default: 10
  },
  
  // Maximum withdrawal limit per day
  maxWithdrawalPerDay: {
    type: Number,
    default: 1000
  },
  
  // Today's withdrawal amount
  todayWithdrawal: {
    type: Number,
    default: 0
  },
  
  // Last withdrawal date
  lastWithdrawalDate: {
    type: Date,
    default: null
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for available balance (total - pending withdrawal)
walletSchema.virtual('availableBalance').get(function() {
  return this.totalBalance - this.pendingWithdrawal;
});

// Virtual for total income
walletSchema.virtual('totalIncome').get(function() {
  return this.directIncome + this.levelIncome + this.roiIncome + this.bonusIncome;
});

// Indexes
walletSchema.index({ userId: 1 });
walletSchema.index({ totalBalance: -1 });
walletSchema.index({ createdAt: -1 });

// Pre-save middleware to calculate total balance
walletSchema.pre('save', function(next) {
  this.totalBalance = this.directIncome + this.levelIncome + this.roiIncome + this.bonusIncome;
  next();
});

// Method to add income
walletSchema.methods.addIncome = function(type, amount, description = '') {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }
  
  switch (type) {
    case 'direct':
      this.directIncome += amount;
      break;
    case 'level':
      this.levelIncome += amount;
      break;
    case 'roi':
      this.roiIncome += amount;
      break;
    case 'bonus':
      this.bonusIncome += amount;
      break;
    default:
      throw new Error('Invalid income type');
  }
  
  return this.save();
};

// Method to deduct balance
walletSchema.methods.deductBalance = function(amount, reason = '') {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }
  
  if (this.availableBalance < amount) {
    throw new Error('Insufficient balance');
  }
  
  // Deduct from different income sources proportionally
  const totalIncome = this.totalIncome;
  if (totalIncome > 0) {
    const directRatio = this.directIncome / totalIncome;
    const levelRatio = this.levelIncome / totalIncome;
    const roiRatio = this.roiIncome / totalIncome;
    const bonusRatio = this.bonusIncome / totalIncome;
    
    this.directIncome = Math.max(0, this.directIncome - (amount * directRatio));
    this.levelIncome = Math.max(0, this.levelIncome - (amount * levelRatio));
    this.roiIncome = Math.max(0, this.roiIncome - (amount * roiRatio));
    this.bonusIncome = Math.max(0, this.bonusIncome - (amount * bonusRatio));
  }
  
  return this.save();
};

// Method to check if withdrawal is allowed
walletSchema.methods.canWithdraw = function(amount) {
  const today = new Date().toDateString();
  const lastWithdrawalDate = this.lastWithdrawalDate ? this.lastWithdrawalDate.toDateString() : null;
  
  // Reset today's withdrawal if it's a new day
  if (lastWithdrawalDate !== today) {
    this.todayWithdrawal = 0;
  }
  
  return {
    canWithdraw: amount >= this.minWithdrawal && 
                 amount <= this.availableBalance && 
                 (this.todayWithdrawal + amount) <= this.maxWithdrawalPerDay,
    availableBalance: this.availableBalance,
    minWithdrawal: this.minWithdrawal,
    maxWithdrawalPerDay: this.maxWithdrawalPerDay,
    todayWithdrawal: this.todayWithdrawal,
    remainingDailyLimit: this.maxWithdrawalPerDay - this.todayWithdrawal
  };
};

// Static method to get wallet by user ID
walletSchema.statics.findByUserId = function(userId) {
  return this.findOne({ userId });
};

module.exports = mongoose.model('Wallet', walletSchema);
