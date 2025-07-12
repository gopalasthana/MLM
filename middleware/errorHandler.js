const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  console.error('Error:', err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = {
      message,
      statusCode: 404
    };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    let message = 'Duplicate field value entered';
    
    // Extract field name from error
    const field = Object.keys(err.keyValue)[0];
    if (field) {
      message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
    }
    
    error = {
      message,
      statusCode: 400
    };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = {
      message,
      statusCode: 400
    };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = {
      message,
      statusCode: 401
    };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = {
      message,
      statusCode: 401
    };
  }

  // File upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    const message = 'File too large';
    error = {
      message,
      statusCode: 400
    };
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    const message = 'Unexpected file field';
    error = {
      message,
      statusCode: 400
    };
  }

  // Rate limiting errors
  if (err.status === 429) {
    const message = 'Too many requests, please try again later';
    error = {
      message,
      statusCode: 429
    };
  }

  // Database connection errors
  if (err.name === 'MongoNetworkError' || err.name === 'MongoTimeoutError') {
    const message = 'Database connection error';
    error = {
      message,
      statusCode: 503
    };
  }

  // Custom application errors
  if (err.isOperational) {
    error = {
      message: err.message,
      statusCode: err.statusCode || 500
    };
  }

  // Default error response
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Server Error';

  // Prepare error response
  const errorResponse = {
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      error: err
    })
  };

  // Add additional error details for development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.details = {
      name: err.name,
      code: err.code,
      statusCode: statusCode
    };
  }

  res.status(statusCode).json(errorResponse);
};

// 404 handler
const notFound = (req, res, next) => {
  // Don't log common static file requests
  const staticFiles = ['/favicon.ico', '/favicon-16x16.png', '/favicon-32x32.png', '/logo192.png', '/logo512.png', '/manifest.json'];
  const isStaticFile = staticFiles.some(file => req.originalUrl.includes(file));

  if (isStaticFile) {
    return res.status(404).json({
      success: false,
      message: 'File not found'
    });
  }

  const error = new Error(`Not found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// Async error handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Custom error class
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

    Error.captureStackTrace(this, this.constructor);
  }
}

// Validation error handler
const handleValidationError = (errors) => {
  const formattedErrors = {};
  
  if (Array.isArray(errors)) {
    errors.forEach(error => {
      if (error.param) {
        formattedErrors[error.param] = error.msg;
      }
    });
  } else if (typeof errors === 'object') {
    Object.keys(errors).forEach(key => {
      formattedErrors[key] = errors[key].message || errors[key];
    });
  }
  
  return formattedErrors;
};

// Success response helper
const sendSuccessResponse = (res, data = null, message = 'Success', statusCode = 200) => {
  const response = {
    success: true,
    message
  };
  
  if (data !== null) {
    response.data = data;
  }
  
  res.status(statusCode).json(response);
};

// Paginated response helper
const sendPaginatedResponse = (res, data, pagination, message = 'Success') => {
  res.status(200).json({
    success: true,
    message,
    data,
    pagination: {
      currentPage: pagination.page,
      totalPages: pagination.totalPages,
      totalItems: pagination.totalItems,
      itemsPerPage: pagination.limit,
      hasNextPage: pagination.page < pagination.totalPages,
      hasPrevPage: pagination.page > 1
    }
  });
};

// Error response helper
const sendErrorResponse = (res, message = 'Error', statusCode = 500, errors = null) => {
  const response = {
    success: false,
    message
  };
  
  if (errors) {
    response.errors = handleValidationError(errors);
  }
  
  if (process.env.NODE_ENV === 'development') {
    response.timestamp = new Date().toISOString();
  }
  
  res.status(statusCode).json(response);
};

module.exports = {
  errorHandler,
  notFound,
  asyncHandler,
  AppError,
  handleValidationError,
  sendSuccessResponse,
  sendPaginatedResponse,
  sendErrorResponse
};
