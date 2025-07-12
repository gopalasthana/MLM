const express = require('express');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const { verifyToken, requireOwnershipOrAdmin } = require('../middleware/auth');
const { validateTransaction, validatePagination } = require('../middleware/validation');
const { asyncHandler, sendSuccessResponse, sendErrorResponse, sendPaginatedResponse } = require('../middleware/errorHandler');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);

// @desc    Get user transactions
// @route   GET /api/transactions
// @access  Private
router.get('/', validatePagination, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const type = req.query.type;
  const status = req.query.status;
  const startDate = req.query.startDate;
  const endDate = req.query.endDate;

  // Build query
  const query = { userId: req.user._id };
  
  if (type) query.type = type;
  if (status) query.status = status;
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const transactions = await Transaction.find(query)
    .populate('relatedUserId', 'username fullName')
    .populate('planId', 'name amount roiPercentage')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);

  const totalTransactions = await Transaction.countDocuments(query);
  const totalPages = Math.ceil(totalTransactions / limit);

  sendPaginatedResponse(res, transactions, {
    page,
    limit,
    totalPages,
    totalItems: totalTransactions
  }, 'Transactions retrieved successfully');
}));

// @desc    Get transaction by ID
// @route   GET /api/transactions/:id
// @access  Private
router.get('/:id', asyncHandler(async (req, res) => {
  const transaction = await Transaction.findById(req.params.id)
    .populate('userId', 'username fullName email')
    .populate('relatedUserId', 'username fullName')
    .populate('planId', 'name amount roiPercentage roiDuration')
    .populate('processedBy', 'username fullName');

  if (!transaction) {
    return sendErrorResponse(res, 'Transaction not found', 404);
  }

  // Check ownership or admin access
  if (transaction.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return sendErrorResponse(res, 'Access denied', 403);
  }

  sendSuccessResponse(res, transaction, 'Transaction retrieved successfully');
}));

// @desc    Get transaction statistics
// @route   GET /api/transactions/stats
// @access  Private
router.get('/stats/summary', asyncHandler(async (req, res) => {
  const { period = 'all' } = req.query;
  const userId = req.user._id;

  let dateFilter = {};
  const now = new Date();

  switch (period) {
    case 'today':
      dateFilter = {
        createdAt: {
          $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        }
      };
      break;
    case 'week':
      const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
      dateFilter = { createdAt: { $gte: weekStart } };
      break;
    case 'month':
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      dateFilter = { createdAt: { $gte: monthStart } };
      break;
    case 'year':
      const yearStart = new Date(now.getFullYear(), 0, 1);
      dateFilter = { createdAt: { $gte: yearStart } };
      break;
  }

  const stats = await Transaction.aggregate([
    {
      $match: {
        userId: userId,
        status: 'completed',
        ...dateFilter
      }
    },
    {
      $group: {
        _id: '$type',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount' }
      }
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]);

  // Get total summary
  const totalSummary = await Transaction.aggregate([
    {
      $match: {
        userId: userId,
        status: 'completed',
        ...dateFilter
      }
    },
    {
      $group: {
        _id: null,
        totalIncome: {
          $sum: {
            $cond: [
              { $in: ['$type', ['direct_income', 'level_income', 'roi_income', 'bonus_income']] },
              '$amount',
              0
            ]
          }
        },
        totalWithdrawals: {
          $sum: {
            $cond: [
              { $eq: ['$type', 'withdrawal'] },
              '$amount',
              0
            ]
          }
        },
        totalInvestments: {
          $sum: {
            $cond: [
              { $in: ['$type', ['investment', 'plan_purchase']] },
              '$amount',
              0
            ]
          }
        },
        totalTransactions: { $sum: 1 }
      }
    }
  ]);

  const summary = {
    byType: stats,
    total: totalSummary.length > 0 ? totalSummary[0] : {
      totalIncome: 0,
      totalWithdrawals: 0,
      totalInvestments: 0,
      totalTransactions: 0
    },
    period
  };

  sendSuccessResponse(res, summary, 'Transaction statistics retrieved successfully');
}));

// @desc    Create manual transaction (Admin only)
// @route   POST /api/transactions
// @access  Admin
router.post('/', validateTransaction, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return sendErrorResponse(res, 'Admin access required', 403);
  }

  const {
    userId,
    type,
    amount,
    description,
    planId,
    relatedUserId
  } = req.body;

  // Get user's wallet
  const wallet = await Wallet.findByUserId(userId);
  if (!wallet) {
    return sendErrorResponse(res, 'User wallet not found', 404);
  }

  const balanceBefore = wallet.totalBalance;

  // Create transaction
  const transaction = new Transaction({
    userId,
    type,
    amount,
    description,
    status: 'completed',
    paymentMethod: 'admin_adjustment',
    balanceBefore,
    balanceAfter: balanceBefore + amount,
    planId,
    relatedUserId,
    processedBy: req.user._id,
    completedAt: new Date()
  });

  await transaction.save();

  // Update wallet balance
  await wallet.addTransaction(transaction);

  const populatedTransaction = await Transaction.findById(transaction._id)
    .populate('userId', 'username fullName email')
    .populate('relatedUserId', 'username fullName')
    .populate('planId', 'name amount')
    .populate('processedBy', 'username fullName');

  sendSuccessResponse(res, populatedTransaction, 'Transaction created successfully', 201);
}));

// @desc    Update transaction status (Admin only)
// @route   PUT /api/transactions/:id/status
// @access  Admin
router.put('/:id/status', asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return sendErrorResponse(res, 'Admin access required', 403);
  }

  const { status, notes } = req.body;
  
  const transaction = await Transaction.findById(req.params.id);
  if (!transaction) {
    return sendErrorResponse(res, 'Transaction not found', 404);
  }

  const oldStatus = transaction.status;

  if (status === 'completed' && oldStatus !== 'completed') {
    await transaction.markCompleted(req.user._id);
  } else if (status === 'failed') {
    await transaction.markFailed(notes || 'Marked as failed by admin', req.user._id);
  } else {
    transaction.status = status;
    if (notes) {
      transaction.notes = notes;
    }
    transaction.processedBy = req.user._id;
    await transaction.save();
  }

  const updatedTransaction = await Transaction.findById(transaction._id)
    .populate('userId', 'username fullName email')
    .populate('relatedUserId', 'username fullName')
    .populate('planId', 'name amount')
    .populate('processedBy', 'username fullName');

  sendSuccessResponse(res, updatedTransaction, 'Transaction status updated successfully');
}));

// @desc    Get transaction types
// @route   GET /api/transactions/types
// @access  Private
router.get('/meta/types', asyncHandler(async (req, res) => {
  const transactionTypes = [
    {
      value: 'direct_income',
      label: 'Direct Income',
      description: 'Income from direct referrals'
    },
    {
      value: 'level_income',
      label: 'Level Income',
      description: 'Income from team levels'
    },
    {
      value: 'roi_income',
      label: 'ROI Income',
      description: 'Return on investment income'
    },
    {
      value: 'bonus_income',
      label: 'Bonus Income',
      description: 'Special bonuses and rewards'
    },
    {
      value: 'withdrawal',
      label: 'Withdrawal',
      description: 'Money withdrawn from account'
    },
    {
      value: 'investment',
      label: 'Investment',
      description: 'Money invested in plans'
    },
    {
      value: 'plan_purchase',
      label: 'Plan Purchase',
      description: 'Purchase of investment plans'
    },
    {
      value: 'referral_bonus',
      label: 'Referral Bonus',
      description: 'Bonus for referring new users'
    },
    {
      value: 'admin_adjustment',
      label: 'Admin Adjustment',
      description: 'Manual adjustment by admin'
    }
  ];

  sendSuccessResponse(res, transactionTypes, 'Transaction types retrieved successfully');
}));

// @desc    Export transactions (CSV)
// @route   GET /api/transactions/export
// @access  Private
router.get('/export/csv', asyncHandler(async (req, res) => {
  const { startDate, endDate, type, status } = req.query;
  
  // Build query
  const query = { userId: req.user._id };
  
  if (type) query.type = type;
  if (status) query.status = status;
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const transactions = await Transaction.find(query)
    .populate('relatedUserId', 'username fullName')
    .populate('planId', 'name amount')
    .sort({ createdAt: -1 });

  // Convert to CSV format
  const csvHeader = 'Date,Type,Amount,Status,Description,Related User,Plan\n';
  const csvData = transactions.map(t => {
    return [
      t.createdAt.toISOString().split('T')[0],
      t.type,
      t.amount,
      t.status,
      `"${t.description}"`,
      t.relatedUserId ? t.relatedUserId.fullName : '',
      t.planId ? t.planId.name : ''
    ].join(',');
  }).join('\n');

  const csv = csvHeader + csvData;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
  res.send(csv);
}));

module.exports = router;
