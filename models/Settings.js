const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  // Settings Category
  category: {
    type: String,
    required: true,
    enum: [
      'general',
      'payment',
      'commission',
      'withdrawal',
      'notification',
      'security',
      'api',
      'maintenance'
    ]
  },
  
  // Settings Key (unique within category)
  key: {
    type: String,
    required: true,
    trim: true
  },
  
  // Settings Value
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Settings Metadata
  label: {
    type: String,
    required: true,
    trim: true
  },
  
  description: {
    type: String,
    default: ''
  },
  
  // Value Type for validation
  valueType: {
    type: String,
    required: true,
    enum: ['string', 'number', 'boolean', 'array', 'object', 'json']
  },
  
  // Validation Rules
  validation: {
    required: {
      type: Boolean,
      default: false
    },
    min: {
      type: Number,
      default: null
    },
    max: {
      type: Number,
      default: null
    },
    minLength: {
      type: Number,
      default: null
    },
    maxLength: {
      type: Number,
      default: null
    },
    pattern: {
      type: String,
      default: null
    },
    options: [{
      type: String
    }]
  },
  
  // Settings Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  isPublic: {
    type: Boolean,
    default: false // Whether this setting can be viewed by non-admin users
  },
  
  // Settings Group (for UI organization)
  group: {
    type: String,
    default: 'default'
  },
  
  // Display Order
  order: {
    type: Number,
    default: 0
  },
  
  // Last Modified Information
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  lastModifiedAt: {
    type: Date,
    default: Date.now
  },
  
  // Default Value (for reset functionality)
  defaultValue: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  
  // Whether this setting requires app restart
  requiresRestart: {
    type: Boolean,
    default: false
  },
  
  // Environment specific (dev, staging, production)
  environment: {
    type: String,
    enum: ['all', 'development', 'staging', 'production'],
    default: 'all'
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index for category and key (unique combination)
settingsSchema.index({ category: 1, key: 1 }, { unique: true });
settingsSchema.index({ category: 1, group: 1, order: 1 });
settingsSchema.index({ isActive: 1, isPublic: 1 });

// Pre-save middleware to update lastModifiedAt
settingsSchema.pre('save', function(next) {
  if (this.isModified('value')) {
    this.lastModifiedAt = new Date();
  }
  next();
});

// Method to validate value based on valueType and validation rules
settingsSchema.methods.validateValue = function(newValue) {
  const { valueType, validation } = this;
  
  // Required check
  if (validation.required && (newValue === null || newValue === undefined || newValue === '')) {
    throw new Error(`${this.label} is required`);
  }
  
  // Type-specific validation
  switch (valueType) {
    case 'string':
      if (typeof newValue !== 'string') {
        throw new Error(`${this.label} must be a string`);
      }
      if (validation.minLength && newValue.length < validation.minLength) {
        throw new Error(`${this.label} must be at least ${validation.minLength} characters`);
      }
      if (validation.maxLength && newValue.length > validation.maxLength) {
        throw new Error(`${this.label} cannot exceed ${validation.maxLength} characters`);
      }
      if (validation.pattern && !new RegExp(validation.pattern).test(newValue)) {
        throw new Error(`${this.label} format is invalid`);
      }
      if (validation.options && validation.options.length > 0 && !validation.options.includes(newValue)) {
        throw new Error(`${this.label} must be one of: ${validation.options.join(', ')}`);
      }
      break;
      
    case 'number':
      if (typeof newValue !== 'number' || isNaN(newValue)) {
        throw new Error(`${this.label} must be a valid number`);
      }
      if (validation.min !== null && newValue < validation.min) {
        throw new Error(`${this.label} must be at least ${validation.min}`);
      }
      if (validation.max !== null && newValue > validation.max) {
        throw new Error(`${this.label} cannot exceed ${validation.max}`);
      }
      break;
      
    case 'boolean':
      if (typeof newValue !== 'boolean') {
        throw new Error(`${this.label} must be true or false`);
      }
      break;
      
    case 'array':
      if (!Array.isArray(newValue)) {
        throw new Error(`${this.label} must be an array`);
      }
      break;
      
    case 'object':
    case 'json':
      if (typeof newValue !== 'object' || newValue === null) {
        throw new Error(`${this.label} must be a valid object`);
      }
      break;
  }
  
  return true;
};

// Method to update value with validation
settingsSchema.methods.updateValue = function(newValue, modifiedBy = null) {
  this.validateValue(newValue);
  this.value = newValue;
  if (modifiedBy) {
    this.lastModifiedBy = modifiedBy;
  }
  return this.save();
};

// Method to reset to default value
settingsSchema.methods.resetToDefault = function(modifiedBy = null) {
  if (this.defaultValue !== null) {
    this.value = this.defaultValue;
    if (modifiedBy) {
      this.lastModifiedBy = modifiedBy;
    }
    return this.save();
  }
  throw new Error('No default value set for this setting');
};

// Static method to get settings by category
settingsSchema.statics.getByCategory = function(category, includeInactive = false) {
  const query = { category };
  if (!includeInactive) {
    query.isActive = true;
  }
  return this.find(query).sort({ group: 1, order: 1 });
};

// Static method to get public settings
settingsSchema.statics.getPublicSettings = function() {
  return this.find({ isActive: true, isPublic: true })
    .select('category key value label')
    .sort({ category: 1, order: 1 });
};

// Static method to get setting value by category and key
settingsSchema.statics.getValue = function(category, key, defaultValue = null) {
  return this.findOne({ category, key, isActive: true })
    .then(setting => setting ? setting.value : defaultValue);
};

// Static method to set setting value
settingsSchema.statics.setValue = function(category, key, value, modifiedBy = null) {
  return this.findOne({ category, key })
    .then(setting => {
      if (!setting) {
        throw new Error(`Setting ${category}.${key} not found`);
      }
      return setting.updateValue(value, modifiedBy);
    });
};

// Static method to bulk update settings
settingsSchema.statics.bulkUpdate = function(updates, modifiedBy = null) {
  const promises = updates.map(update => {
    return this.setValue(update.category, update.key, update.value, modifiedBy);
  });
  return Promise.all(promises);
};

// Static method to create default settings
settingsSchema.statics.createDefaults = function() {
  const defaultSettings = [
    // General Settings
    {
      category: 'general',
      key: 'site_name',
      value: 'MLM Platform',
      label: 'Site Name',
      description: 'The name of your MLM platform',
      valueType: 'string',
      validation: { required: true, maxLength: 100 },
      defaultValue: 'MLM Platform',
      isPublic: true,
      group: 'basic',
      order: 1
    },
    {
      category: 'general',
      key: 'site_description',
      value: 'Complete MLM Platform Solution',
      label: 'Site Description',
      description: 'Brief description of your platform',
      valueType: 'string',
      validation: { maxLength: 500 },
      defaultValue: 'Complete MLM Platform Solution',
      isPublic: true,
      group: 'basic',
      order: 2
    },
    {
      category: 'general',
      key: 'maintenance_mode',
      value: false,
      label: 'Maintenance Mode',
      description: 'Enable maintenance mode to restrict access',
      valueType: 'boolean',
      defaultValue: false,
      group: 'system',
      order: 1
    },
    
    // Commission Settings
    {
      category: 'commission',
      key: 'max_levels',
      value: 10,
      label: 'Maximum Levels',
      description: 'Maximum number of levels for commission calculation',
      valueType: 'number',
      validation: { required: true, min: 1, max: 20 },
      defaultValue: 10,
      group: 'structure',
      order: 1
    },
    {
      category: 'commission',
      key: 'direct_referral_bonus',
      value: 10,
      label: 'Direct Referral Bonus (%)',
      description: 'Percentage bonus for direct referrals',
      valueType: 'number',
      validation: { required: true, min: 0, max: 50 },
      defaultValue: 10,
      group: 'bonuses',
      order: 1
    },
    
    // Withdrawal Settings
    {
      category: 'withdrawal',
      key: 'min_withdrawal',
      value: 10,
      label: 'Minimum Withdrawal Amount',
      description: 'Minimum amount required for withdrawal',
      valueType: 'number',
      validation: { required: true, min: 1 },
      defaultValue: 10,
      group: 'limits',
      order: 1
    },
    {
      category: 'withdrawal',
      key: 'max_daily_withdrawal',
      value: 1000,
      label: 'Maximum Daily Withdrawal',
      description: 'Maximum amount that can be withdrawn per day',
      valueType: 'number',
      validation: { required: true, min: 1 },
      defaultValue: 1000,
      group: 'limits',
      order: 2
    },
    {
      category: 'withdrawal',
      key: 'withdrawal_fee',
      value: 2,
      label: 'Withdrawal Fee (%)',
      description: 'Percentage fee charged on withdrawals',
      valueType: 'number',
      validation: { required: true, min: 0, max: 10 },
      defaultValue: 2,
      group: 'fees',
      order: 1
    },
    
    // API Settings
    {
      category: 'api',
      key: 'binance_api_url',
      value: 'https://api.binance.com/api/v3',
      label: 'Binance API URL',
      description: 'Binance API endpoint for crypto prices',
      valueType: 'string',
      validation: { required: true },
      defaultValue: 'https://api.binance.com/api/v3',
      group: 'external',
      order: 1
    }
  ];
  
  return this.insertMany(defaultSettings, { ordered: false })
    .catch(err => {
      // Ignore duplicate key errors (settings already exist)
      if (err.code !== 11000) {
        throw err;
      }
    });
};

module.exports = mongoose.model('Settings', settingsSchema);
