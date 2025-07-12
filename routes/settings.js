const express = require('express');
const Settings = require('../models/Settings');
const { verifyToken, requireAdmin, optionalAuth } = require('../middleware/auth');
const { validateSettings } = require('../middleware/validation');
const { asyncHandler, sendSuccessResponse, sendErrorResponse } = require('../middleware/errorHandler');

const router = express.Router();

// @desc    Get public settings
// @route   GET /api/settings/public
// @access  Public
router.get('/public', asyncHandler(async (req, res) => {
  const publicSettings = await Settings.getPublicSettings();
  sendSuccessResponse(res, publicSettings, 'Public settings retrieved successfully');
}));

// @desc    Get settings by category
// @route   GET /api/settings/:category
// @access  Private/Admin
router.get('/:category', optionalAuth, asyncHandler(async (req, res) => {
  const { category } = req.params;
  
  // Check if category requires authentication
  const protectedCategories = ['payment', 'api', 'security', 'maintenance'];
  
  if (protectedCategories.includes(category)) {
    if (!req.user || req.user.role !== 'admin') {
      return sendErrorResponse(res, 'Admin access required', 403);
    }
  }

  const settings = await Settings.getByCategory(category);
  sendSuccessResponse(res, settings, `${category} settings retrieved successfully`);
}));

// @desc    Update setting (Admin only)
// @route   PUT /api/settings/:id
// @access  Admin
router.put('/:id', verifyToken, requireAdmin, asyncHandler(async (req, res) => {
  const { value } = req.body;
  
  const setting = await Settings.findById(req.params.id);
  if (!setting) {
    return sendErrorResponse(res, 'Setting not found', 404);
  }

  await setting.updateValue(value, req.user._id);
  sendSuccessResponse(res, setting, 'Setting updated successfully');
}));

// @desc    Create new setting (Admin only)
// @route   POST /api/settings
// @access  Admin
router.post('/', verifyToken, requireAdmin, validateSettings, asyncHandler(async (req, res) => {
  const settingData = {
    ...req.body,
    createdBy: req.user._id
  };

  const setting = new Settings(settingData);
  await setting.save();

  sendSuccessResponse(res, setting, 'Setting created successfully', 201);
}));

// @desc    Delete setting (Admin only)
// @route   DELETE /api/settings/:id
// @access  Admin
router.delete('/:id', verifyToken, requireAdmin, asyncHandler(async (req, res) => {
  const setting = await Settings.findById(req.params.id);
  if (!setting) {
    return sendErrorResponse(res, 'Setting not found', 404);
  }

  await setting.deleteOne();
  sendSuccessResponse(res, null, 'Setting deleted successfully');
}));

// @desc    Get all settings (Admin only)
// @route   GET /api/settings
// @access  Admin
router.get('/', verifyToken, requireAdmin, asyncHandler(async (req, res) => {
  const settings = await Settings.find({ isActive: true })
    .sort({ category: 1, group: 1, order: 1 });

  // Group settings by category
  const groupedSettings = settings.reduce((acc, setting) => {
    if (!acc[setting.category]) {
      acc[setting.category] = [];
    }
    acc[setting.category].push(setting);
    return acc;
  }, {});

  sendSuccessResponse(res, groupedSettings, 'All settings retrieved successfully');
}));

module.exports = router;
