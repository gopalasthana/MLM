const express = require('express');
const Plan = require('../models/Plan');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { asyncHandler, sendSuccessResponse, sendErrorResponse } = require('../middleware/errorHandler');

const router = express.Router();

// @desc    Get all active plans
// @route   GET /api/plans
// @access  Public
router.get('/', asyncHandler(async (req, res) => {
  const plans = await Plan.getActivePlans();
  sendSuccessResponse(res, plans, 'Plans retrieved successfully');
}));

// @desc    Get plan by ID
// @route   GET /api/plans/:id
// @access  Public
router.get('/:id', asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.params.id);
  
  if (!plan) {
    return sendErrorResponse(res, 'Plan not found', 404);
  }

  if (!plan.isActive) {
    return sendErrorResponse(res, 'Plan is not available', 400);
  }

  sendSuccessResponse(res, plan, 'Plan retrieved successfully');
}));

// @desc    Purchase a plan
// @route   POST /api/plans/:id/purchase
// @access  Private
router.post('/:id/purchase', verifyToken, asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.params.id);
  
  if (!plan) {
    return sendErrorResponse(res, 'Plan not found', 404);
  }

  if (!plan.isActive) {
    return sendErrorResponse(res, 'Plan is not available', 400);
  }

  const user = await User.findById(req.user._id);
  
  // Check if user already has an active plan
  if (user.currentPlan) {
    return sendErrorResponse(res, 'You already have an active plan', 400);
  }

  // For demo purposes, we'll assume the purchase is successful
  // In a real application, you would integrate with payment gateways here

  // Update user's current plan
  user.currentPlan = plan._id;
  user.planActivatedAt = new Date();
  await user.save();

  // Create transaction record
  const transaction = new Transaction({
    userId: user._id,
    type: 'plan_purchase',
    amount: plan.amount,
    status: 'completed',
    description: `Purchased ${plan.name}`,
    planId: plan._id,
    paymentMethod: 'wallet',
    completedAt: new Date()
  });

  await transaction.save();

  sendSuccessResponse(res, {
    plan,
    transaction,
    message: 'Plan purchased successfully'
  }, 'Plan purchased successfully');
}));

// @desc    Get plan statistics (Admin only)
// @route   GET /api/plans/stats
// @access  Admin
router.get('/admin/stats', verifyToken, requireAdmin, asyncHandler(async (req, res) => {
  const stats = await Plan.getStats();
  sendSuccessResponse(res, stats, 'Plan statistics retrieved successfully');
}));

module.exports = router;
