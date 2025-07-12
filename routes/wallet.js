const express = require('express');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { verifyToken, requireOwnershipOrAdmin } = require('../middleware/auth');
const { validateWalletUpdate } = require('../middleware/validation');
const { asyncHandler, sendSuccessResponse, sendErrorResponse } = require('../middleware/errorHandler');

const router = express.Router();

// @desc    Get user wallet
// @route   GET /api/wallet
// @access  Private
router.get('/', verifyToken, asyncHandler(async (req, res) => {
  const wallet = await Wallet.findByUserId(req.user._id);
  
  if (!wallet) {
    return sendErrorResponse(res, 'Wallet not found', 404);
  }
  
  sendSuccessResponse(res, wallet, 'Wallet retrieved successfully');
}));

// @desc    Update wallet details (bank, crypto addresses, UPI)
// @route   PUT /api/wallet
// @access  Private
router.put('/', verifyToken, validateWalletUpdate, asyncHandler(async (req, res) => {
  const { bankDetails, cryptoAddresses, upiId } = req.body;
  
  const wallet = await Wallet.findByUserId(req.user._id);
  
  if (!wallet) {
    return sendErrorResponse(res, 'Wallet not found', 404);
  }
  
  // Update bank details
  if (bankDetails) {
    wallet.bankDetails = {
      ...wallet.bankDetails,
      ...bankDetails
    };
  }
  
  // Update crypto addresses
  if (cryptoAddresses) {
    wallet.cryptoAddresses = {
      ...wallet.cryptoAddresses,
      ...cryptoAddresses
    };
  }
  
  // Update UPI ID
  if (upiId !== undefined) {
    wallet.upiId = upiId;
  }
  
  await wallet.save();
  
  sendSuccessResponse(res, wallet, 'Wallet updated successfully');
}));

// @desc    Get wallet balance breakdown
// @route   GET /api/wallet/balance
// @access  Private
router.get('/balance', verifyToken, asyncHandler(async (req, res) => {
  const wallet = await Wallet.findByUserId(req.user._id);
  
  if (!wallet) {
    return sendErrorResponse(res, 'Wallet not found', 404);
  }
  
  const balanceBreakdown = {
    directIncome: wallet.directIncome,
    levelIncome: wallet.levelIncome,
    roiIncome: wallet.roiIncome,
    bonusIncome: wallet.bonusIncome,
    totalBalance: wallet.totalBalance,
    availableBalance: wallet.availableBalance,
    pendingWithdrawal: wallet.pendingWithdrawal,
    totalWithdrawn: wallet.totalWithdrawn,
    totalInvested: wallet.totalInvested,
    activeInvestment: wallet.activeInvestment
  };
  
  sendSuccessResponse(res, balanceBreakdown, 'Balance breakdown retrieved successfully');
}));

// @desc    Check withdrawal eligibility
// @route   GET /api/wallet/withdrawal-check/:amount
// @access  Private
router.get('/withdrawal-check/:amount', verifyToken, asyncHandler(async (req, res) => {
  const amount = parseFloat(req.params.amount);
  
  if (isNaN(amount) || amount <= 0) {
    return sendErrorResponse(res, 'Invalid amount', 400);
  }
  
  const wallet = await Wallet.findByUserId(req.user._id);
  
  if (!wallet) {
    return sendErrorResponse(res, 'Wallet not found', 404);
  }
  
  const withdrawalCheck = wallet.canWithdraw(amount);
  
  sendSuccessResponse(res, withdrawalCheck, 'Withdrawal eligibility checked');
}));

// @desc    Get wallet transaction history
// @route   GET /api/wallet/transactions
// @access  Private
router.get('/transactions', verifyToken, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const type = req.query.type;
  
  const transactions = await Transaction.getUserTransactions(
    req.user._id, 
    limit, 
    (page - 1) * limit
  );
  
  // Filter by type if specified
  let filteredTransactions = transactions;
  if (type) {
    filteredTransactions = transactions.filter(t => t.type === type);
  }
  
  sendSuccessResponse(res, {
    transactions: filteredTransactions,
    pagination: {
      currentPage: page,
      totalItems: filteredTransactions.length,
      hasMore: filteredTransactions.length === limit
    }
  }, 'Wallet transactions retrieved successfully');
}));

// @desc    Get income statistics
// @route   GET /api/wallet/income-stats
// @access  Private
router.get('/income-stats', verifyToken, asyncHandler(async (req, res) => {
  const { period = 'all' } = req.query;
  const userId = req.user._id;
  
  let dateFilter = {};
  const now = new Date();
  
  switch (period) {
    case 'today':
      dateFilter = {
        completedAt: {
          $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        }
      };
      break;
    case 'week':
      const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
      dateFilter = { completedAt: { $gte: weekStart } };
      break;
    case 'month':
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      dateFilter = { completedAt: { $gte: monthStart } };
      break;
    case 'year':
      const yearStart = new Date(now.getFullYear(), 0, 1);
      dateFilter = { completedAt: { $gte: yearStart } };
      break;
  }
  
  const incomeStats = await Transaction.aggregate([
    {
      $match: {
        userId: userId,
        status: 'completed',
        type: { $in: ['direct_income', 'level_income', 'roi_income', 'bonus_income'] },
        ...dateFilter
      }
    },
    {
      $group: {
        _id: {
          type: '$type',
          date: {
            $dateToString: {
              format: period === 'today' ? '%H' : period === 'week' ? '%w' : period === 'month' ? '%d' : '%m',
              date: '$completedAt'
            }
          }
        },
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.type',
        data: {
          $push: {
            period: '$_id.date',
            amount: '$totalAmount',
            count: '$count'
          }
        },
        totalAmount: { $sum: '$totalAmount' },
        totalCount: { $sum: '$count' }
      }
    }
  ]);
  
  sendSuccessResponse(res, incomeStats, 'Income statistics retrieved successfully');
}));

// @desc    Get withdrawal history
// @route   GET /api/wallet/withdrawals
// @access  Private
router.get('/withdrawals', verifyToken, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  
  const withdrawals = await Transaction.find({
    userId: req.user._id,
    type: 'withdrawal'
  })
  .sort({ createdAt: -1 })
  .limit(limit)
  .skip(skip);
  
  const totalWithdrawals = await Transaction.countDocuments({
    userId: req.user._id,
    type: 'withdrawal'
  });
  
  sendSuccessResponse(res, {
    withdrawals,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalWithdrawals / limit),
      totalItems: totalWithdrawals,
      hasMore: skip + withdrawals.length < totalWithdrawals
    }
  }, 'Withdrawal history retrieved successfully');
}));

// @desc    Get investment history
// @route   GET /api/wallet/investments
// @access  Private
router.get('/investments', verifyToken, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  
  const investments = await Transaction.find({
    userId: req.user._id,
    type: { $in: ['investment', 'plan_purchase'] }
  })
  .sort({ createdAt: -1 })
  .limit(limit)
  .skip(skip)
  .populate('planId', 'name amount roiPercentage roiDuration');
  
  const totalInvestments = await Transaction.countDocuments({
    userId: req.user._id,
    type: { $in: ['investment', 'plan_purchase'] }
  });
  
  sendSuccessResponse(res, {
    investments,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalInvestments / limit),
      totalItems: totalInvestments,
      hasMore: skip + investments.length < totalInvestments
    }
  }, 'Investment history retrieved successfully');
}));

module.exports = router;
