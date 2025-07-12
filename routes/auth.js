const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { generateToken, verifyToken, sensitiveOperationLimit } = require('../middleware/auth');
const { validateUserRegistration, validateUserLogin, validatePasswordChange } = require('../middleware/validation');
const { asyncHandler, sendSuccessResponse, sendErrorResponse, AppError } = require('../middleware/errorHandler');

const router = express.Router();

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', validateUserRegistration, asyncHandler(async (req, res) => {
  const { username, email, password, fullName, phone, sponsorCode } = req.body;
  
  // Check if user already exists
  const existingUser = await User.findOne({
    $or: [{ email }, { username }]
  });
  
  if (existingUser) {
    return sendErrorResponse(res, 'User with this email or username already exists', 400);
  }
  
  // Find sponsor if sponsor code is provided
  let sponsor = null;
  if (sponsorCode) {
    sponsor = await User.findByReferralCode(sponsorCode);
    if (!sponsor) {
      return sendErrorResponse(res, 'Invalid sponsor code', 400);
    }
  }
  
  // Generate unique referral code
  let referralCode;
  let isUnique = false;
  while (!isUnique) {
    referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    const existingCode = await User.findOne({ referralCode });
    if (!existingCode) {
      isUnique = true;
    }
  }
  
  // Create user
  const user = new User({
    username,
    email,
    password,
    fullName,
    phone,
    referralCode,
    sponsorId: sponsor ? sponsor._id : null,
    level: sponsor ? sponsor.level + 1 : 1
  });
  
  await user.save();
  
  // Create wallet for user
  const wallet = new Wallet({
    userId: user._id
  });
  await wallet.save();
  
  // Update sponsor's direct referrals count
  if (sponsor) {
    sponsor.directReferrals += 1;
    await sponsor.save();
    
    // Update team size for all upline members
    let currentSponsor = sponsor;
    while (currentSponsor) {
      currentSponsor.totalTeamSize += 1;
      await currentSponsor.save();
      
      if (currentSponsor.sponsorId) {
        currentSponsor = await User.findById(currentSponsor.sponsorId);
      } else {
        break;
      }
    }
  }
  
  // Generate JWT token
  const token = generateToken(user._id);
  
  // Remove password from response
  const userResponse = user.toObject();
  delete userResponse.password;
  
  sendSuccessResponse(res, {
    user: userResponse,
    token,
    wallet: wallet.toObject()
  }, 'User registered successfully', 201);
}));

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
router.post('/login', validateUserLogin, sensitiveOperationLimit(5, 15 * 60 * 1000), asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  
  // Find user by email or username
  const user = await User.findOne({
    $or: [
      { email: identifier.toLowerCase() },
      { username: identifier }
    ]
  });
  
  if (!user) {
    return sendErrorResponse(res, 'Invalid credentials', 401);
  }
  
  // Check if account is locked
  if (user.isLocked) {
    return sendErrorResponse(res, 'Account is temporarily locked due to multiple failed login attempts', 423);
  }
  
  // Check if account is active
  if (!user.isActive) {
    return sendErrorResponse(res, 'Account is deactivated. Please contact support', 403);
  }
  
  // Check password
  const isPasswordValid = await user.comparePassword(password);
  
  if (!isPasswordValid) {
    // Increment login attempts
    await user.incLoginAttempts();
    return sendErrorResponse(res, 'Invalid credentials', 401);
  }
  
  // Reset login attempts on successful login
  if (user.loginAttempts > 0) {
    await user.resetLoginAttempts();
  }
  
  // Update last login
  user.lastLogin = new Date();
  await user.save();
  
  // Get user's wallet
  const wallet = await Wallet.findByUserId(user._id);
  
  // Generate JWT token
  const token = generateToken(user._id);
  
  // Remove password from response
  const userResponse = user.toObject();
  delete userResponse.password;
  
  sendSuccessResponse(res, {
    user: userResponse,
    token,
    wallet: wallet ? wallet.toObject() : null
  }, 'Login successful');
}));

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
router.get('/me', verifyToken, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate('sponsorId', 'username fullName referralCode')
    .populate('currentPlan', 'name amount roiPercentage')
    .select('-password');
  
  const wallet = await Wallet.findByUserId(user._id);
  
  sendSuccessResponse(res, {
    user,
    wallet
  }, 'User profile retrieved successfully');
}));

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
router.put('/change-password', verifyToken, validatePasswordChange, sensitiveOperationLimit(3, 60 * 60 * 1000), asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  const user = await User.findById(req.user._id);
  
  // Verify current password
  const isCurrentPasswordValid = await user.comparePassword(currentPassword);
  
  if (!isCurrentPasswordValid) {
    return sendErrorResponse(res, 'Current password is incorrect', 400);
  }
  
  // Update password
  user.password = newPassword;
  await user.save();
  
  sendSuccessResponse(res, null, 'Password changed successfully');
}));

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
router.post('/forgot-password', sensitiveOperationLimit(3, 60 * 60 * 1000), asyncHandler(async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return sendErrorResponse(res, 'Email is required', 400);
  }
  
  const user = await User.findOne({ email: email.toLowerCase() });
  
  if (!user) {
    // Don't reveal if email exists or not
    return sendSuccessResponse(res, null, 'If the email exists, a password reset link has been sent');
  }
  
  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  // Hash token and set expiry
  user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  await user.save();
  
  // TODO: Send email with reset token
  // For now, we'll just return success message
  
  sendSuccessResponse(res, null, 'If the email exists, a password reset link has been sent');
}));

// @desc    Reset password
// @route   POST /api/auth/reset-password/:token
// @access  Public
router.post('/reset-password/:token', sensitiveOperationLimit(5, 60 * 60 * 1000), asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  
  if (!password || password.length < 6) {
    return sendErrorResponse(res, 'Password must be at least 6 characters long', 400);
  }
  
  // Hash the token to compare with stored hash
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() }
  });
  
  if (!user) {
    return sendErrorResponse(res, 'Invalid or expired reset token', 400);
  }
  
  // Update password and clear reset token
  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  
  await user.save();
  
  sendSuccessResponse(res, null, 'Password reset successfully');
}));

// @desc    Refresh token
// @route   POST /api/auth/refresh
// @access  Public
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return sendErrorResponse(res, 'Refresh token is required', 400);
  }
  
  try {
    // For now, we'll just verify the regular token
    // In a full implementation, you'd have separate refresh token logic
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user || !user.isActive) {
      return sendErrorResponse(res, 'Invalid refresh token', 401);
    }
    
    const newToken = generateToken(user._id);
    
    sendSuccessResponse(res, {
      token: newToken,
      user
    }, 'Token refreshed successfully');
    
  } catch (error) {
    return sendErrorResponse(res, 'Invalid refresh token', 401);
  }
}));

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
router.post('/logout', verifyToken, asyncHandler(async (req, res) => {
  // In a stateless JWT implementation, logout is handled client-side
  // Here you could implement token blacklisting if needed
  
  sendSuccessResponse(res, null, 'Logged out successfully');
}));

module.exports = router;
