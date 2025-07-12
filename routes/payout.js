const express = require('express');
const Payout = require('../models/Payout');
const Wallet = require('../models/Wallet');
const { verifyToken } = require('../middleware/auth');
const { validatePayoutRequest, validatePagination } = require('../middleware/validation');
const { asyncHandler, sendSuccessResponse, sendErrorResponse, sendPaginatedResponse } = require('../middleware/errorHandler');

const router = express.Router();

// Apply authentication middleware
router.use(verifyToken);

// @desc    Get user payout requests
// @route   GET /api/payouts
// @access  Private
router.get('/', validatePagination, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const status = req.query.status;

  const query = { userId: req.user._id };
  if (status) query.status = status;

  const payouts = await Payout.find(query)
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

// @desc    Create payout request
// @route   POST /api/payouts
// @access  Private
router.post('/', validatePayoutRequest, asyncHandler(async (req, res) => {
  const { amount, paymentMethod, paymentDetails, userNotes } = req.body;

  // Check wallet balance
  const wallet = await Wallet.findByUserId(req.user._id);
  if (!wallet) {
    return sendErrorResponse(res, 'Wallet not found', 404);
  }

  const canWithdraw = wallet.canWithdraw(amount);
  if (!canWithdraw.allowed) {
    return sendErrorResponse(res, canWithdraw.reason, 400);
  }

  // Create payout request
  const payout = new Payout({
    userId: req.user._id,
    amount,
    paymentMethod,
    paymentDetails,
    userNotes,
    status: 'pending'
  });

  await payout.save();

  // Update wallet pending withdrawal
  wallet.pendingWithdrawal += amount;
  await wallet.save();

  sendSuccessResponse(res, payout, 'Payout request created successfully', 201);
}));

// @desc    Get payout by ID
// @route   GET /api/payouts/:id
// @access  Private
router.get('/:id', asyncHandler(async (req, res) => {
  const payout = await Payout.findById(req.params.id);

  if (!payout) {
    return sendErrorResponse(res, 'Payout not found', 404);
  }

  // Check ownership or admin access
  if (payout.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return sendErrorResponse(res, 'Access denied', 403);
  }

  sendSuccessResponse(res, payout, 'Payout retrieved successfully');
}));

// @desc    Cancel payout request
// @route   PUT /api/payouts/:id/cancel
// @access  Private
router.put('/:id/cancel', asyncHandler(async (req, res) => {
  const payout = await Payout.findById(req.params.id);

  if (!payout) {
    return sendErrorResponse(res, 'Payout not found', 404);
  }

  // Check ownership
  if (payout.userId.toString() !== req.user._id.toString()) {
    return sendErrorResponse(res, 'Access denied', 403);
  }

  // Can only cancel pending payouts
  if (payout.status !== 'pending') {
    return sendErrorResponse(res, 'Can only cancel pending payout requests', 400);
  }

  // Update payout status
  payout.status = 'cancelled';
  payout.cancelledAt = new Date();
  await payout.save();

  // Update wallet pending withdrawal
  const wallet = await Wallet.findByUserId(req.user._id);
  if (wallet) {
    wallet.pendingWithdrawal -= payout.amount;
    await wallet.save();
  }

  sendSuccessResponse(res, payout, 'Payout request cancelled successfully');
}));

module.exports = router;
