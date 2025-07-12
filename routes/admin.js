const express = require('express');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Plan = require('../models/Plan');
const Payout = require('../models/Payout');
const Settings = require('../models/Settings');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { validatePlanCreation, validateSettings, validatePagination } = require('../middleware/validation');
const { asyncHandler, sendSuccessResponse, sendErrorResponse, sendPaginatedResponse } = require('../middleware/errorHandler');

const router = express.Router();

// Apply admin middleware to all routes
router.use(verifyToken);
router.use(requireAdmin);

// @desc    Get admin dashboard data
// @route   GET /api/admin/dashboard
// @access  Admin
router.get('/dashboard', asyncHandler(async (req, res) => {
  // Get user statistics
  const totalUsers = await User.countDocuments();
  const activeUsers = await User.countDocuments({ isActive: true });
  const newUsersToday = await User.countDocuments({
    createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
  });

  // Get transaction statistics
  const totalTransactions = await Transaction.countDocuments();
  const completedTransactions = await Transaction.countDocuments({ status: 'completed' });
  const pendingTransactions = await Transaction.countDocuments({ status: 'pending' });

  // Get payout statistics
  const totalPayouts = await Payout.countDocuments();
  const pendingPayouts = await Payout.countDocuments({ status: 'pending' });
  const completedPayouts = await Payout.countDocuments({ status: 'completed' });

  // Get financial statistics
  const totalEarnings = await Transaction.aggregate([
    { $match: { status: 'completed', type: { $in: ['direct_income', 'level_income', 'roi_income', 'bonus_income'] } } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  const totalWithdrawals = await Transaction.aggregate([
    { $match: { status: 'completed', type: 'withdrawal' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  // Get recent activities
  const recentUsers = await User.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .select('username fullName email createdAt');

  const recentTransactions = await Transaction.find()
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('userId', 'username fullName');

  const dashboardData = {
    statistics: {
      users: {
        total: totalUsers,
        active: activeUsers,
        newToday: newUsersToday
      },
      transactions: {
        total: totalTransactions,
        completed: completedTransactions,
        pending: pendingTransactions
      },
      payouts: {
        total: totalPayouts,
        pending: pendingPayouts,
        completed: completedPayouts
      },
      financial: {
        totalEarnings: totalEarnings.length > 0 ? totalEarnings[0].total : 0,
        totalWithdrawals: totalWithdrawals.length > 0 ? totalWithdrawals[0].total : 0
      }
    },
    recentActivities: {
      users: recentUsers,
      transactions: recentTransactions
    }
  };

  sendSuccessResponse(res, dashboardData, 'Admin dashboard data retrieved successfully');
}));

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Admin
router.get('/users', validatePagination, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const search = req.query.search;
  const status = req.query.status;

  // Build query
  let query = {};
  if (search) {
    query.$or = [
      { username: { $regex: search, $options: 'i' } },
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }
  if (status) {
    query.isActive = status === 'active';
  }

  const users = await User.find(query)
    .select('-password')
    .populate('sponsorId', 'username fullName')
    .populate('currentPlan', 'name amount')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);

  const totalUsers = await User.countDocuments(query);
  const totalPages = Math.ceil(totalUsers / limit);

  sendPaginatedResponse(res, users, {
    page,
    limit,
    totalPages,
    totalItems: totalUsers
  }, 'Users retrieved successfully');
}));

// @desc    Update user status
// @route   PUT /api/admin/users/:id/status
// @access  Admin
router.put('/users/:id/status', asyncHandler(async (req, res) => {
  const { isActive } = req.body;
  
  const user = await User.findById(req.params.id);
  if (!user) {
    return sendErrorResponse(res, 'User not found', 404);
  }

  user.isActive = isActive;
  await user.save();

  sendSuccessResponse(res, user, 'User status updated successfully');
}));

// @desc    Get all transactions
// @route   GET /api/admin/transactions
// @access  Admin
router.get('/transactions', validatePagination, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const type = req.query.type;
  const status = req.query.status;

  // Build query
  let query = {};
  if (type) query.type = type;
  if (status) query.status = status;

  const transactions = await Transaction.find(query)
    .populate('userId', 'username fullName email')
    .populate('relatedUserId', 'username fullName')
    .populate('planId', 'name amount')
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

// @desc    Update transaction status
// @route   PUT /api/admin/transactions/:id/status
// @access  Admin
router.put('/transactions/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body;
  
  const transaction = await Transaction.findById(req.params.id);
  if (!transaction) {
    return sendErrorResponse(res, 'Transaction not found', 404);
  }

  if (status === 'completed') {
    await transaction.markCompleted(req.user._id);
  } else if (status === 'failed') {
    await transaction.markFailed('Marked as failed by admin', req.user._id);
  } else {
    transaction.status = status;
    await transaction.save();
  }

  sendSuccessResponse(res, transaction, 'Transaction status updated successfully');
}));

// @desc    Get all payouts
// @route   GET /api/admin/payouts
// @access  Admin
router.get('/payouts', validatePagination, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const status = req.query.status;

  // Build query
  let query = {};
  if (status) query.status = status;

  const payouts = await Payout.find(query)
    .populate('userId', 'username fullName email phone')
    .sort({ requestedAt: -1 })
    .limit(limit)
    .skip(skip);

  const totalPayouts = await Payout.countDocuments(query);
  const totalPages = Math.ceil(totalPayouts / limit);

  sendPaginatedResponse(res, payouts, {
    page,
    limit,
    totalPages,
    totalItems: totalPayouts
  }, 'Payouts retrieved successfully');
}));

// @desc    Update payout status
// @route   PUT /api/admin/payouts/:id/status
// @access  Admin
router.put('/payouts/:id/status', asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  
  const payout = await Payout.findById(req.params.id);
  if (!payout) {
    return sendErrorResponse(res, 'Payout not found', 404);
  }

  if (status === 'approved') {
    await payout.approve(req.user._id, notes);
  } else if (status === 'rejected') {
    await payout.reject(req.user._id, 'Rejected by admin', notes);
  } else if (status === 'completed') {
    await payout.markCompleted();
  } else {
    payout.status = status;
    if (notes) payout.adminNotes = notes;
    await payout.save();
  }

  sendSuccessResponse(res, payout, 'Payout status updated successfully');
}));

// @desc    Get all plans
// @route   GET /api/admin/plans
// @access  Admin
router.get('/plans', asyncHandler(async (req, res) => {
  const plans = await Plan.find()
    .populate('createdBy', 'username fullName')
    .sort({ priority: -1, createdAt: -1 });

  sendSuccessResponse(res, plans, 'Plans retrieved successfully');
}));

// @desc    Create new plan
// @route   POST /api/admin/plans
// @access  Admin
router.post('/plans', validatePlanCreation, asyncHandler(async (req, res) => {
  const planData = {
    ...req.body,
    createdBy: req.user._id
  };

  const plan = new Plan(planData);
  await plan.save();

  const populatedPlan = await Plan.findById(plan._id)
    .populate('createdBy', 'username fullName');

  sendSuccessResponse(res, populatedPlan, 'Plan created successfully', 201);
}));

// @desc    Update plan
// @route   PUT /api/admin/plans/:id
// @access  Admin
router.put('/plans/:id', asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.params.id);
  if (!plan) {
    return sendErrorResponse(res, 'Plan not found', 404);
  }

  Object.assign(plan, req.body);
  await plan.save();

  const updatedPlan = await Plan.findById(plan._id)
    .populate('createdBy', 'username fullName');

  sendSuccessResponse(res, updatedPlan, 'Plan updated successfully');
}));

// @desc    Delete plan
// @route   DELETE /api/admin/plans/:id
// @access  Admin
router.delete('/plans/:id', asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.params.id);
  if (!plan) {
    return sendErrorResponse(res, 'Plan not found', 404);
  }

  await plan.deleteOne();
  sendSuccessResponse(res, null, 'Plan deleted successfully');
}));

// @desc    Get system settings
// @route   GET /api/admin/settings
// @access  Admin
router.get('/settings', asyncHandler(async (req, res) => {
  const { category } = req.query;
  
  let settings;
  if (category) {
    settings = await Settings.getByCategory(category);
  } else {
    settings = await Settings.find({ isActive: true })
      .sort({ category: 1, group: 1, order: 1 });
  }

  // Group settings by category
  const groupedSettings = settings.reduce((acc, setting) => {
    if (!acc[setting.category]) {
      acc[setting.category] = [];
    }
    acc[setting.category].push(setting);
    return acc;
  }, {});

  sendSuccessResponse(res, groupedSettings, 'Settings retrieved successfully');
}));

// @desc    Update setting
// @route   PUT /api/admin/settings/:id
// @access  Admin
router.put('/settings/:id', asyncHandler(async (req, res) => {
  const { value } = req.body;
  
  const setting = await Settings.findById(req.params.id);
  if (!setting) {
    return sendErrorResponse(res, 'Setting not found', 404);
  }

  await setting.updateValue(value, req.user._id);
  sendSuccessResponse(res, setting, 'Setting updated successfully');
}));

// @desc    Get system statistics
// @route   GET /api/admin/statistics
// @access  Admin
router.get('/statistics', asyncHandler(async (req, res) => {
  const { period = 'month' } = req.query;
  
  let dateFilter = {};
  const now = new Date();
  
  switch (period) {
    case 'today':
      dateFilter = {
        $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      };
      break;
    case 'week':
      const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
      dateFilter = { $gte: weekStart };
      break;
    case 'month':
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      dateFilter = { $gte: monthStart };
      break;
    case 'year':
      const yearStart = new Date(now.getFullYear(), 0, 1);
      dateFilter = { $gte: yearStart };
      break;
  }

  // Get transaction statistics
  const transactionStats = await Transaction.aggregate([
    { $match: { createdAt: dateFilter } },
    {
      $group: {
        _id: '$type',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  // Get user registration statistics
  const userStats = await User.aggregate([
    { $match: { createdAt: dateFilter } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Get plan statistics
  const planStats = await Plan.getStats();

  const statistics = {
    transactions: transactionStats,
    users: userStats,
    plans: planStats,
    period
  };

  sendSuccessResponse(res, statistics, 'Statistics retrieved successfully');
}));

module.exports = router;
