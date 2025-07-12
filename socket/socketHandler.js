const jwt = require('jsonwebtoken');
const User = require('../models/User');
const cryptoService = require('../services/cryptoService');

// Store connected users
const connectedUsers = new Map();

// Socket authentication middleware
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      // Allow anonymous connections for public data
      socket.isAuthenticated = false;
      socket.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user || !user.isActive) {
      return next(new Error('Authentication failed'));
    }

    socket.isAuthenticated = true;
    socket.user = user;
    socket.userId = user._id.toString();
    
    next();
  } catch (error) {
    // Allow connection but mark as unauthenticated
    socket.isAuthenticated = false;
    socket.user = null;
    next();
  }
};

// Handle socket connections
const handleConnection = (io) => {
  io.use(authenticateSocket);
  
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}${socket.isAuthenticated ? ` (User: ${socket.user.username})` : ' (Anonymous)'}`);
    
    // Store authenticated user connection
    if (socket.isAuthenticated) {
      connectedUsers.set(socket.userId, {
        socketId: socket.id,
        user: socket.user,
        connectedAt: new Date()
      });
    }

    // Join user to their personal room for private notifications
    if (socket.isAuthenticated) {
      socket.join(`user_${socket.userId}`);
      socket.join('authenticated_users');
    }

    // Join public rooms
    socket.join('crypto_prices');
    socket.join('public_announcements');

    // Handle crypto price subscription
    socket.on('subscribe_crypto_prices', () => {
      socket.join('crypto_prices');
      
      // Send current prices immediately
      const currentPrices = cryptoService.getCachedPrices();
      socket.emit('crypto-prices', currentPrices);
      
      console.log(`Socket ${socket.id} subscribed to crypto prices`);
    });

    // Handle crypto price unsubscription
    socket.on('unsubscribe_crypto_prices', () => {
      socket.leave('crypto_prices');
      console.log(`Socket ${socket.id} unsubscribed from crypto prices`);
    });

    // Handle dashboard data subscription (authenticated users only)
    socket.on('subscribe_dashboard', () => {
      if (!socket.isAuthenticated) {
        socket.emit('error', { message: 'Authentication required for dashboard data' });
        return;
      }
      
      socket.join(`dashboard_${socket.userId}`);
      console.log(`User ${socket.user.username} subscribed to dashboard updates`);
    });

    // Handle real-time notifications subscription
    socket.on('subscribe_notifications', () => {
      if (!socket.isAuthenticated) {
        socket.emit('error', { message: 'Authentication required for notifications' });
        return;
      }
      
      socket.join(`notifications_${socket.userId}`);
      console.log(`User ${socket.user.username} subscribed to notifications`);
    });

    // Handle admin room subscription (admin users only)
    socket.on('subscribe_admin', () => {
      if (!socket.isAuthenticated || socket.user.role !== 'admin') {
        socket.emit('error', { message: 'Admin access required' });
        return;
      }
      
      socket.join('admin_room');
      console.log(`Admin ${socket.user.username} joined admin room`);
    });

    // Handle ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date() });
    });

    // Handle user status updates
    socket.on('update_status', (status) => {
      if (!socket.isAuthenticated) return;
      
      const validStatuses = ['online', 'away', 'busy', 'offline'];
      if (validStatuses.includes(status)) {
        socket.broadcast.to('authenticated_users').emit('user_status_changed', {
          userId: socket.userId,
          username: socket.user.username,
          status: status,
          timestamp: new Date()
        });
      }
    });

    // Handle typing indicators (for chat features)
    socket.on('typing_start', (data) => {
      if (!socket.isAuthenticated) return;
      
      socket.broadcast.to(data.room || 'public_chat').emit('user_typing', {
        userId: socket.userId,
        username: socket.user.username,
        isTyping: true
      });
    });

    socket.on('typing_stop', (data) => {
      if (!socket.isAuthenticated) return;
      
      socket.broadcast.to(data.room || 'public_chat').emit('user_typing', {
        userId: socket.userId,
        username: socket.user.username,
        isTyping: false
      });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id} (Reason: ${reason})`);
      
      if (socket.isAuthenticated) {
        connectedUsers.delete(socket.userId);
        
        // Notify other users about disconnection
        socket.broadcast.to('authenticated_users').emit('user_status_changed', {
          userId: socket.userId,
          username: socket.user.username,
          status: 'offline',
          timestamp: new Date()
        });
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });
  });
};

// Utility functions for sending notifications
const sendToUser = (io, userId, event, data) => {
  io.to(`user_${userId}`).emit(event, {
    ...data,
    timestamp: new Date()
  });
};

const sendToAdmin = (io, event, data) => {
  io.to('admin_room').emit(event, {
    ...data,
    timestamp: new Date()
  });
};

const broadcastToAll = (io, event, data) => {
  io.emit(event, {
    ...data,
    timestamp: new Date()
  });
};

const broadcastToAuthenticated = (io, event, data) => {
  io.to('authenticated_users').emit(event, {
    ...data,
    timestamp: new Date()
  });
};

// Notification types
const sendTransactionNotification = (io, userId, transaction) => {
  sendToUser(io, userId, 'transaction_update', {
    type: 'transaction',
    transaction: transaction,
    message: `New ${transaction.type.replace('_', ' ')} transaction: $${transaction.amount}`
  });
};

const sendPayoutNotification = (io, userId, payout) => {
  sendToUser(io, userId, 'payout_update', {
    type: 'payout',
    payout: payout,
    message: `Payout request ${payout.status}: $${payout.amount}`
  });
};

const sendReferralNotification = (io, userId, referralData) => {
  sendToUser(io, userId, 'referral_update', {
    type: 'referral',
    referral: referralData,
    message: `New referral: ${referralData.username} joined your team`
  });
};

const sendSystemNotification = (io, notification) => {
  broadcastToAll(io, 'system_notification', {
    type: 'system',
    ...notification
  });
};

// Get connected users count
const getConnectedUsersCount = () => {
  return connectedUsers.size;
};

// Get connected users list (admin only)
const getConnectedUsersList = () => {
  return Array.from(connectedUsers.values()).map(user => ({
    userId: user.user._id,
    username: user.user.username,
    connectedAt: user.connectedAt
  }));
};

// Check if user is online
const isUserOnline = (userId) => {
  return connectedUsers.has(userId.toString());
};

module.exports = (io) => {
  return handleConnection(io);
};

module.exports.sendToUser = sendToUser;
module.exports.sendToAdmin = sendToAdmin;
module.exports.broadcastToAll = broadcastToAll;
module.exports.broadcastToAuthenticated = broadcastToAuthenticated;
module.exports.sendTransactionNotification = sendTransactionNotification;
module.exports.sendPayoutNotification = sendPayoutNotification;
module.exports.sendReferralNotification = sendReferralNotification;
module.exports.sendSystemNotification = sendSystemNotification;
module.exports.getConnectedUsersCount = getConnectedUsersCount;
module.exports.getConnectedUsersList = getConnectedUsersList;
module.exports.isUserOnline = isUserOnline;
