const { body, param, query, validationResult } = require('express-validator');
const { sendErrorResponse } = require('./errorHandler');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return sendErrorResponse(res, 'Validation failed', 400, errors.array());
  }
  
  next();
};

// User registration validation
const validateUserRegistration = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be between 3 and 20 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
    
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
    
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Full name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Full name can only contain letters and spaces'),
    
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
    
  body('sponsorCode')
    .optional()
    .trim()
    .isLength({ min: 6, max: 20 })
    .withMessage('Sponsor code must be between 6 and 20 characters'),
    
  handleValidationErrors
];

// User login validation
const validateUserLogin = [
  body('identifier')
    .trim()
    .notEmpty()
    .withMessage('Username or email is required'),
    
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
    
  handleValidationErrors
];

// Password change validation
const validatePasswordChange = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
    
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number'),
    
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match new password');
      }
      return true;
    }),
    
  handleValidationErrors
];

// Profile update validation
const validateProfileUpdate = [
  body('fullName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Full name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Full name can only contain letters and spaces'),
    
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
    
  body('country')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Country must be between 2 and 50 characters'),
    
  handleValidationErrors
];

// Wallet update validation
const validateWalletUpdate = [
  body('bankDetails.accountNumber')
    .optional()
    .trim()
    .isLength({ min: 8, max: 20 })
    .withMessage('Account number must be between 8 and 20 characters')
    .isNumeric()
    .withMessage('Account number must contain only numbers'),
    
  body('bankDetails.accountHolderName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Account holder name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Account holder name can only contain letters and spaces'),
    
  body('bankDetails.bankName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Bank name must be between 2 and 50 characters'),
    
  body('bankDetails.ifscCode')
    .optional()
    .trim()
    .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
    .withMessage('Please provide a valid IFSC code'),
    
  body('upiId')
    .optional()
    .trim()
    .matches(/^[\w.-]+@[\w.-]+$/)
    .withMessage('Please provide a valid UPI ID'),
    
  body('cryptoAddresses.bitcoin')
    .optional()
    .trim()
    .matches(/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/)
    .withMessage('Please provide a valid Bitcoin address'),
    
  body('cryptoAddresses.ethereum')
    .optional()
    .trim()
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Please provide a valid Ethereum address'),
    
  handleValidationErrors
];

// Payout request validation
const validatePayoutRequest = [
  body('amount')
    .isFloat({ min: 1 })
    .withMessage('Amount must be a positive number'),
    
  body('paymentMethod')
    .isIn(['bank', 'crypto', 'upi', 'paypal'])
    .withMessage('Invalid payment method'),
    
  body('paymentDetails')
    .notEmpty()
    .withMessage('Payment details are required'),
    
  body('userNotes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters'),
    
  handleValidationErrors
];

// Plan creation validation
const validatePlanCreation = [
  body('name')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Plan name must be between 3 and 100 characters'),
    
  body('description')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Plan description must be between 10 and 500 characters'),
    
  body('amount')
    .isFloat({ min: 1 })
    .withMessage('Plan amount must be a positive number'),
    
  body('roiPercentage')
    .isFloat({ min: 0, max: 100 })
    .withMessage('ROI percentage must be between 0 and 100'),
    
  body('roiDuration')
    .isInt({ min: 1 })
    .withMessage('ROI duration must be at least 1 day'),
    
  body('roiFrequency')
    .isIn(['daily', 'weekly', 'monthly'])
    .withMessage('ROI frequency must be daily, weekly, or monthly'),
    
  body('levelCommissions')
    .isArray({ min: 1 })
    .withMessage('At least one level commission is required'),
    
  body('levelCommissions.*.level')
    .isInt({ min: 1 })
    .withMessage('Level must be a positive integer'),
    
  body('levelCommissions.*.percentage')
    .isFloat({ min: 0, max: 50 })
    .withMessage('Commission percentage must be between 0 and 50'),
    
  handleValidationErrors
];

// Transaction validation
const validateTransaction = [
  body('type')
    .isIn([
      'direct_income',
      'level_income',
      'roi_income',
      'bonus_income',
      'withdrawal',
      'investment',
      'plan_purchase',
      'referral_bonus',
      'admin_adjustment'
    ])
    .withMessage('Invalid transaction type'),
    
  body('amount')
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),
    
  body('description')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Description must be between 5 and 200 characters'),
    
  handleValidationErrors
];

// Settings validation
const validateSettings = [
  body('category')
    .isIn(['general', 'payment', 'commission', 'withdrawal', 'notification', 'security', 'api', 'maintenance'])
    .withMessage('Invalid settings category'),
    
  body('key')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Settings key must be between 2 and 50 characters'),
    
  body('value')
    .notEmpty()
    .withMessage('Settings value is required'),
    
  body('label')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Settings label must be between 2 and 100 characters'),
    
  body('valueType')
    .isIn(['string', 'number', 'boolean', 'array', 'object', 'json'])
    .withMessage('Invalid value type'),
    
  handleValidationErrors
];

// Pagination validation
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
    
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
    
  handleValidationErrors
];

// MongoDB ObjectId validation
const validateObjectId = (field = 'id') => [
  param(field)
    .isMongoId()
    .withMessage(`Invalid ${field} format`),
    
  handleValidationErrors
];

// Date range validation
const validateDateRange = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
    
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
    .custom((value, { req }) => {
      if (req.query.startDate && new Date(value) < new Date(req.query.startDate)) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
    
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateUserRegistration,
  validateUserLogin,
  validatePasswordChange,
  validateProfileUpdate,
  validateWalletUpdate,
  validatePayoutRequest,
  validatePlanCreation,
  validateTransaction,
  validateSettings,
  validatePagination,
  validateObjectId,
  validateDateRange
};
