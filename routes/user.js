const express = require('express');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Plan = require('../models/Plan');
const { verifyToken, requireOwnershipOrAdmin } = require('../middleware/auth');
const { validateProfileUpdate, validatePagination } = require('../middleware/validation');
const { asyncHandler, sendSuccessResponse, sendErrorResponse, sendPaginatedResponse } = require('../middleware/errorHandler');

const router = express.Router();

// @desc    Get user dashboard data
// @route   GET /api/user/dashboard
// @access  Private
router.get('/dashboard', verifyToken, asyncHandler(async (req, res) => {
  const userId = req.user._id;
  
  // Get user with sponsor info
  const user = await User.findById(userId)
    .populate('sponsorId', 'username fullName')
    .populate('currentPlan', 'name amount roiPercentage roiDuration')
    .select('-password');
  
  // Get wallet information
  const wallet = await Wallet.findByUserId(userId);
  
  // Get recent transactions
  const recentTransactions = await Transaction.getUserTransactions(userId, 10);
  
  // Get team statistics
  const directTeam = await User.find({ sponsorId: userId, isActive: true }).countDocuments();
  const totalTeam = user.totalTeamSize;
  
  // Get today's earnings
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEarnings = await Transaction.aggregate([
    {
      $match: {
        userId: userId,
        status: 'completed',
        type: { $in: ['direct_income', 'level_income', 'roi_income', 'bonus_income'] },
        completedAt: { $gte: today }
      }
    },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: '$amount' }
      }
    }
  ]);
  
  const dashboardData = {
    user: {
      id: user._id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      referralCode: user.referralCode,
      level: user.level,
      joinedAt: user.createdAt,
      sponsor: user.sponsorId,
      currentPlan: user.currentPlan,
      planActivatedAt: user.planActivatedAt
    },
    wallet: {
      totalBalance: wallet?.totalBalance || 0,
      directIncome: wallet?.directIncome || 0,
      levelIncome: wallet?.levelIncome || 0,
      roiIncome: wallet?.roiIncome || 0,
      bonusIncome: wallet?.bonusIncome || 0,
      totalWithdrawn: wallet?.totalWithdrawn || 0,
      pendingWithdrawal: wallet?.pendingWithdrawal || 0,
      availableBalance: wallet?.availableBalance || 0
    },
    team: {
      directReferrals: directTeam,
      totalTeamSize: totalTeam,
      directReferralsCount: user.directReferrals
    },
    earnings: {
      totalEarnings: user.totalEarnings,
      todayEarnings: todayEarnings.length > 0 ? todayEarnings[0].totalEarnings : 0
    },
    recentTransactions: recentTransactions.slice(0, 5)
  };
  
  sendSuccessResponse(res, dashboardData, 'Dashboard data retrieved successfully');
}));

// @desc    Get user profile
// @route   GET /api/user/profile
// @access  Private
router.get('/profile', verifyToken, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate('sponsorId', 'username fullName referralCode')
    .populate('currentPlan', 'name amount roiPercentage roiDuration')
    .select('-password');
  
  sendSuccessResponse(res, user, 'Profile retrieved successfully');
}));

// @desc    Update user profile
// @route   PUT /api/user/profile
// @access  Private
router.put('/profile', verifyToken, validateProfileUpdate, asyncHandler(async (req, res) => {
  const { fullName, phone, address, city, state, country, pincode, dateOfBirth } = req.body;

  const user = await User.findById(req.user._id);

  if (!user) {
    return sendErrorResponse(res, 'User not found', 404);
  }

  // Update user fields
  if (fullName) user.fullName = fullName;
  if (phone) user.phone = phone;
  if (address) user.address = address;
  if (city) user.city = city;
  if (state) user.state = state;
  if (country) user.country = country;
  if (pincode) user.pincode = pincode;
  if (dateOfBirth) user.dateOfBirth = dateOfBirth;

  await user.save();

  const updatedUser = await User.findById(user._id).select('-password');

  sendSuccessResponse(res, updatedUser, 'Profile updated successfully');
}));

// @desc    Change user password
// @route   PUT /api/user/change-password
// @access  Private
router.put('/change-password', verifyToken, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return sendErrorResponse(res, 'Current password and new password are required', 400);
  }

  if (newPassword.length < 6) {
    return sendErrorResponse(res, 'New password must be at least 6 characters long', 400);
  }

  const user = await User.findById(req.user._id).select('+password');

  if (!user) {
    return sendErrorResponse(res, 'User not found', 404);
  }

  // Check current password
  const isCurrentPasswordValid = await user.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    return sendErrorResponse(res, 'Current password is incorrect', 400);
  }

  // Update password
  user.password = newPassword;
  await user.save();

  sendSuccessResponse(res, null, 'Password changed successfully');
}));

// @desc    Get user transactions with filters
// @route   GET /api/user/transactions
// @access  Private
router.get('/transactions', verifyToken, validatePagination, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const type = req.query.type;
  const status = req.query.status;
  const search = req.query.search;
  const sortBy = req.query.sortBy || 'createdAt';
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

  let query = { userId: req.user._id };

  // Apply filters
  if (type && type !== 'all') {
    query.type = type;
  }

  if (status && status !== 'all') {
    query.status = status;
  }

  if (search) {
    query.$or = [
      { description: { $regex: search, $options: 'i' } },
      { transactionId: { $regex: search, $options: 'i' } }
    ];
  }

  const transactions = await Transaction.find(query)
    .sort({ [sortBy]: sortOrder })
    .limit(limit)
    .skip(skip);

  const totalTransactions = await Transaction.countDocuments(query);
  const totalPages = Math.ceil(totalTransactions / limit);

  sendPaginatedResponse(res, { transactions }, {
    page,
    limit,
    totalPages,
    totalItems: totalTransactions
  }, 'Transactions retrieved successfully');
}));

// @desc    Get transaction statistics
// @route   GET /api/user/transaction-stats
// @access  Private
router.get('/transaction-stats', verifyToken, asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // Get income transactions
  const incomeStats = await Transaction.aggregate([
    {
      $match: {
        userId: userId,
        type: { $in: ['direct_income', 'level_income', 'roi_income', 'bonus_income'] },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: null,
        totalIncome: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  // Get expense transactions
  const expenseStats = await Transaction.aggregate([
    {
      $match: {
        userId: userId,
        type: { $in: ['withdrawal', 'investment', 'plan_purchase'] },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: null,
        totalSpent: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  // Get this month's transactions
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const thisMonthStats = await Transaction.aggregate([
    {
      $match: {
        userId: userId,
        status: 'completed',
        createdAt: { $gte: monthStart }
      }
    },
    {
      $group: {
        _id: null,
        thisMonth: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  // Get total transaction count
  const totalCount = await Transaction.countDocuments({ userId: userId });

  const stats = {
    totalIncome: incomeStats[0]?.totalIncome || 0,
    totalSpent: expenseStats[0]?.totalSpent || 0,
    thisMonth: thisMonthStats[0]?.thisMonth || 0,
    totalCount: totalCount
  };

  sendSuccessResponse(res, stats, 'Transaction statistics retrieved successfully');
}));

// @desc    Get user's referral tree
// @route   GET /api/user/referral-tree
// @access  Private
router.get('/referral-tree', verifyToken, asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { level = 1, limit = 50 } = req.query;
  
  // Get direct referrals
  const directReferrals = await User.find({ 
    sponsorId: userId, 
    isActive: true 
  })
  .select('username fullName email createdAt currentPlan directReferrals totalTeamSize')
  .populate('currentPlan', 'name amount')
  .limit(parseInt(limit))
  .sort({ createdAt: -1 });
  
  // If level > 1, get indirect referrals
  let indirectReferrals = [];
  if (parseInt(level) > 1 && directReferrals.length > 0) {
    const directIds = directReferrals.map(ref => ref._id);
    indirectReferrals = await User.find({
      sponsorId: { $in: directIds },
      isActive: true
    })
    .select('username fullName email createdAt sponsorId currentPlan')
    .populate('currentPlan', 'name amount')
    .populate('sponsorId', 'username fullName')
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });
  }
  
  const referralTree = {
    direct: directReferrals,
    indirect: indirectReferrals,
    summary: {
      directCount: directReferrals.length,
      indirectCount: indirectReferrals.length,
      totalTeamSize: req.user.totalTeamSize
    }
  };
  
  sendSuccessResponse(res, referralTree, 'Referral tree retrieved successfully');
}));

// @desc    Get user's transactions
// @route   GET /api/user/transactions
// @access  Private
router.get('/transactions', verifyToken, validatePagination, asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const type = req.query.type;
  const status = req.query.status;
  
  // Build query
  const query = { userId };
  if (type) query.type = type;
  if (status) query.status = status;
  
  // Get transactions
  const transactions = await Transaction.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate('relatedUserId', 'username fullName')
    .populate('planId', 'name amount');
  
  // Get total count
  const totalTransactions = await Transaction.countDocuments(query);
  const totalPages = Math.ceil(totalTransactions / limit);
  
  sendPaginatedResponse(res, transactions, {
    page,
    limit,
    totalPages,
    totalItems: totalTransactions
  }, 'Transactions retrieved successfully');
}));

// @desc    Get user's earnings summary
// @route   GET /api/user/earnings
// @access  Private
router.get('/earnings', verifyToken, asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { period = 'all' } = req.query;
  
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
  
  const earningsData = await Transaction.aggregate([
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
        _id: '$type',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);
  
  // Format earnings data
  const earnings = {
    directIncome: 0,
    levelIncome: 0,
    roiIncome: 0,
    bonusIncome: 0,
    totalEarnings: 0
  };
  
  earningsData.forEach(item => {
    switch (item._id) {
      case 'direct_income':
        earnings.directIncome = item.totalAmount;
        break;
      case 'level_income':
        earnings.levelIncome = item.totalAmount;
        break;
      case 'roi_income':
        earnings.roiIncome = item.totalAmount;
        break;
      case 'bonus_income':
        earnings.bonusIncome = item.totalAmount;
        break;
    }
    earnings.totalEarnings += item.totalAmount;
  });
  
  sendSuccessResponse(res, earnings, 'Earnings summary retrieved successfully');
}));

// @desc    Get referral link
// @route   GET /api/user/referral-link
// @access  Private
router.get('/referral-link', verifyToken, asyncHandler(async (req, res) => {
  const user = req.user;
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  
  const referralData = {
    referralCode: user.referralCode,
    referralLink: `${baseUrl}/register?ref=${user.referralCode}`,
    totalReferrals: user.directReferrals,
    totalTeamSize: user.totalTeamSize
  };
  
  sendSuccessResponse(res, referralData, 'Referral link retrieved successfully');
}));

// @desc    Get available plans
// @route   GET /api/user/plans
// @access  Private
router.get('/plans', verifyToken, asyncHandler(async (req, res) => {
  const plans = await Plan.getActivePlans();
  
  sendSuccessResponse(res, plans, 'Available plans retrieved successfully');
}));

// @desc    Get referral tree
// @route   GET /api/user/referral-tree
// @access  Private
router.get('/referral-tree', asyncHandler(async (req, res) => {
  const level = parseInt(req.query.level) || 1;
  const limit = parseInt(req.query.limit) || 50;

  const referralTree = await User.aggregate([
    { $match: { sponsor: req.user._id } },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: 'sponsor',
        as: 'children'
      }
    },
    {
      $addFields: {
        directReferrals: { $size: '$children' },
        totalTeamSize: { $size: '$children' }, // Simplified for now
        totalEarnings: 0 // Would need to calculate from transactions
      }
    },
    { $limit: limit }
  ]);

  const stats = {
    directReferrals: referralTree.length,
    totalTeamSize: referralTree.reduce((sum, user) => sum + user.totalTeamSize, 0),
    activeMembers: referralTree.filter(user => user.isActive).length,
    totalEarnings: 0 // Would calculate from transactions
  };

  sendSuccessResponse(res, { referralTree, stats }, 'Referral tree retrieved successfully');
}));

// @desc    Get team members
// @route   GET /api/user/team-members
// @access  Private
router.get('/team-members', asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const level = req.query.level;
  const status = req.query.status;
  const search = req.query.search;
  const sortBy = req.query.sortBy || 'createdAt';
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

  let query = {};

  // Build query based on filters
  if (level && level !== 'all') {
    query.level = parseInt(level);
  }

  if (status && status !== 'all') {
    query.isActive = status === 'active';
  }

  if (search) {
    query.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { username: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  // Get team members (simplified - would need proper tree traversal)
  const members = await User.find(query)
    .select('fullName username email phone isActive createdAt level')
    .sort({ [sortBy]: sortOrder })
    .limit(limit)
    .skip(skip);

  const totalMembers = await User.countDocuments(query);
  const totalPages = Math.ceil(totalMembers / limit);

  sendPaginatedResponse(res, { members }, {
    page,
    limit,
    totalPages,
    totalItems: totalMembers
  }, 'Team members retrieved successfully');
}));

// @desc    Get team statistics
// @route   GET /api/user/team-stats
// @access  Private
router.get('/team-stats', asyncHandler(async (req, res) => {
  // Simplified stats - would need proper calculation
  const stats = {
    totalMembers: await User.countDocuments({ sponsor: req.user._id }),
    activeMembers: await User.countDocuments({ sponsor: req.user._id, isActive: true }),
    teamVolume: 0, // Would calculate from transactions
    monthlyGrowth: 0 // Would calculate based on recent joins
  };

  sendSuccessResponse(res, stats, 'Team statistics retrieved successfully');
}));

// @desc    Get earnings summary
// @route   GET /api/user/earnings
// @access  Private
router.get('/earnings', asyncHandler(async (req, res) => {
  const period = req.query.period || 'all';

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

  const earnings = await Transaction.aggregate([
    {
      $match: {
        userId: req.user._id,
        type: { $in: ['direct_income', 'level_income', 'roi_income', 'bonus_income'] },
        status: 'completed',
        ...dateFilter
      }
    },
    {
      $group: {
        _id: '$type',
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  const earningsData = {
    directEarnings: 0,
    levelEarnings: 0,
    roiEarnings: 0,
    bonusEarnings: 0,
    totalEarnings: 0
  };

  earnings.forEach(earning => {
    switch (earning._id) {
      case 'direct_income':
        earningsData.directEarnings = earning.total;
        break;
      case 'level_income':
        earningsData.levelEarnings = earning.total;
        break;
      case 'roi_income':
        earningsData.roiEarnings = earning.total;
        break;
      case 'bonus_income':
        earningsData.bonusEarnings = earning.total;
        break;
    }
    earningsData.totalEarnings += earning.total;
  });

  sendSuccessResponse(res, earningsData, 'Earnings retrieved successfully');
}));

module.exports = router;
