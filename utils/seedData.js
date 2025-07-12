const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();

// Import models
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Plan = require('../models/Plan');
const Settings = require('../models/Settings');
const Payout = require('../models/Payout');

// Connect to database
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB Connected for seeding...');
  } catch (error) {
    console.error('Database connection failed:', error.message);
    process.exit(1);
  }
};

// Generate referral code
const generateReferralCode = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

// Seed data
const seedData = async () => {
  try {
    console.log('🌱 Starting database seeding...');

    // Clear existing data and drop collections to remove indexes
    try {
      await User.collection.drop();
    } catch (error) {
      console.log('User collection does not exist, skipping drop');
    }

    try {
      await Wallet.collection.drop();
    } catch (error) {
      console.log('Wallet collection does not exist, skipping drop');
    }

    try {
      await Transaction.collection.drop();
    } catch (error) {
      console.log('Transaction collection does not exist, skipping drop');
    }

    try {
      await Plan.collection.drop();
    } catch (error) {
      console.log('Plan collection does not exist, skipping drop');
    }

    try {
      await Settings.collection.drop();
    } catch (error) {
      console.log('Settings collection does not exist, skipping drop');
    }

    try {
      await Payout.collection.drop();
    } catch (error) {
      console.log('Payout collection does not exist, skipping drop');
    }

    console.log('✅ Cleared existing data');

    // Create admin user
    const adminUser = new User({
      username: 'admin',
      email: 'admin@mlmplatform.com',
      password: 'admin123456',
      fullName: 'System Administrator',
      phone: '+1234567890',
      referralCode: generateReferralCode(),
      role: 'admin',
      isActive: true,
      isEmailVerified: true,
      level: 1
    });

    await adminUser.save();
    console.log('✅ Created admin user');

    // Create admin wallet
    const adminWallet = new Wallet({
      userId: adminUser._id,
      totalBalance: 10000,
      directIncome: 5000,
      levelIncome: 3000,
      roiIncome: 1500,
      bonusIncome: 500
    });

    await adminWallet.save();

    // Create sample plans
    const plans = [
      {
        name: 'Starter Plan',
        description: 'Perfect for beginners looking to start their MLM journey',
        amount: 100,
        roiPercentage: 10,
        roiDuration: 30,
        roiFrequency: 'daily',
        levelCommissions: [
          { level: 1, percentage: 10 },
          { level: 2, percentage: 5 },
          { level: 3, percentage: 3 }
        ],
        directReferralBonus: 15,
        category: 'starter',
        priority: 1,
        createdBy: adminUser._id,
        features: ['Daily ROI', '3 Level Commission', 'Basic Support']
      },
      {
        name: 'Basic Plan',
        description: 'Great for users who want better returns and more features',
        amount: 500,
        roiPercentage: 12,
        roiDuration: 45,
        roiFrequency: 'daily',
        levelCommissions: [
          { level: 1, percentage: 12 },
          { level: 2, percentage: 8 },
          { level: 3, percentage: 5 },
          { level: 4, percentage: 3 },
          { level: 5, percentage: 2 }
        ],
        directReferralBonus: 20,
        category: 'basic',
        priority: 2,
        createdBy: adminUser._id,
        features: ['Daily ROI', '5 Level Commission', 'Priority Support', 'Weekly Bonuses']
      },
      {
        name: 'Premium Plan',
        description: 'For serious investors who want maximum returns',
        amount: 1000,
        roiPercentage: 15,
        roiDuration: 60,
        roiFrequency: 'daily',
        levelCommissions: [
          { level: 1, percentage: 15 },
          { level: 2, percentage: 10 },
          { level: 3, percentage: 8 },
          { level: 4, percentage: 5 },
          { level: 5, percentage: 3 },
          { level: 6, percentage: 2 },
          { level: 7, percentage: 1 }
        ],
        directReferralBonus: 25,
        category: 'premium',
        priority: 3,
        createdBy: adminUser._id,
        features: ['Daily ROI', '7 Level Commission', 'VIP Support', 'Monthly Bonuses', 'Exclusive Events']
      },
      {
        name: 'VIP Plan',
        description: 'Ultimate plan for high-volume investors',
        amount: 5000,
        roiPercentage: 18,
        roiDuration: 90,
        roiFrequency: 'daily',
        levelCommissions: [
          { level: 1, percentage: 18 },
          { level: 2, percentage: 12 },
          { level: 3, percentage: 10 },
          { level: 4, percentage: 8 },
          { level: 5, percentage: 5 },
          { level: 6, percentage: 3 },
          { level: 7, percentage: 2 },
          { level: 8, percentage: 1 },
          { level: 9, percentage: 1 },
          { level: 10, percentage: 1 }
        ],
        directReferralBonus: 30,
        category: 'vip',
        priority: 4,
        createdBy: adminUser._id,
        features: ['Daily ROI', '10 Level Commission', 'Dedicated Support', 'All Bonuses', 'Private Events', 'Personal Manager']
      }
    ];

    const createdPlans = await Plan.insertMany(plans);
    console.log('✅ Created sample plans');

    // Create demo users
    const demoUsers = [];
    const userCount = 20;

    for (let i = 1; i <= userCount; i++) {
      const user = new User({
        username: `user${i}`,
        email: `user${i}@example.com`,
        password: 'password123',
        fullName: `Demo User ${i}`,
        phone: `+123456789${i.toString().padStart(2, '0')}`,
        referralCode: generateReferralCode(),
        role: 'user',
        isActive: true,
        isEmailVerified: true,
        level: Math.floor(Math.random() * 5) + 1,
        directReferrals: Math.floor(Math.random() * 10),
        totalTeamSize: Math.floor(Math.random() * 50),
        totalEarnings: Math.floor(Math.random() * 5000),
        currentPlan: createdPlans[Math.floor(Math.random() * createdPlans.length)]._id,
        planActivatedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) // Random date within last 30 days
      });

      await user.save();
      demoUsers.push(user);

      // Create wallet for each user
      const wallet = new Wallet({
        userId: user._id,
        directIncome: Math.floor(Math.random() * 1000),
        levelIncome: Math.floor(Math.random() * 800),
        roiIncome: Math.floor(Math.random() * 600),
        bonusIncome: Math.floor(Math.random() * 200),
        totalWithdrawn: Math.floor(Math.random() * 500),
        totalInvested: Math.floor(Math.random() * 2000)
      });

      await wallet.save();
    }

    console.log(`✅ Created ${userCount} demo users with wallets`);

    // Create sponsor relationships
    for (let i = 1; i < demoUsers.length; i++) {
      if (Math.random() > 0.3) { // 70% chance of having a sponsor
        const sponsorIndex = Math.floor(Math.random() * i);
        demoUsers[i].sponsorId = demoUsers[sponsorIndex]._id;
        await demoUsers[i].save();
      }
    }

    console.log('✅ Created sponsor relationships');

    // Create sample transactions
    const transactionTypes = ['direct_income', 'level_income', 'roi_income', 'bonus_income', 'withdrawal', 'investment'];
    const transactions = [];

    for (let i = 0; i < 100; i++) {
      const user = demoUsers[Math.floor(Math.random() * demoUsers.length)];
      const type = transactionTypes[Math.floor(Math.random() * transactionTypes.length)];
      
      const transaction = new Transaction({
        userId: user._id,
        type: type,
        amount: Math.floor(Math.random() * 500) + 10,
        status: Math.random() > 0.1 ? 'completed' : 'pending',
        description: `${type.replace('_', ' ').toUpperCase()} transaction`,
        paymentMethod: 'wallet',
        transactionId: `TXN${Date.now()}${Math.random().toString(36).substr(2, 9)}`,
        balanceBefore: Math.floor(Math.random() * 1000),
        balanceAfter: Math.floor(Math.random() * 1000),
        completedAt: Math.random() > 0.1 ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) : null,
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
      });

      transactions.push(transaction);
    }

    await Transaction.insertMany(transactions);
    console.log('✅ Created sample transactions');

    // Create sample payout requests
    const payouts = [];
    for (let i = 0; i < 15; i++) {
      const user = demoUsers[Math.floor(Math.random() * demoUsers.length)];
      const statuses = ['pending', 'approved', 'rejected', 'completed'];
      
      const payout = new Payout({
        userId: user._id,
        amount: Math.floor(Math.random() * 500) + 50,
        status: statuses[Math.floor(Math.random() * statuses.length)],
        paymentMethod: ['bank', 'crypto', 'upi'][Math.floor(Math.random() * 3)],
        paymentDetails: {
          bankAccount: {
            accountNumber: '1234567890',
            accountHolderName: user.fullName,
            bankName: 'Demo Bank',
            ifscCode: 'DEMO0001234'
          }
        },
        userNotes: 'Sample payout request',
        requestedAt: new Date(Date.now() - Math.random() * 15 * 24 * 60 * 60 * 1000)
      });

      payouts.push(payout);
    }

    await Payout.insertMany(payouts);
    console.log('✅ Created sample payout requests');

    // Create default settings
    await Settings.createDefaults();
    console.log('✅ Created default settings');

    // Create a special demo user for testing
    const demoUser = new User({
      username: 'demo',
      email: 'demo@example.com',
      password: 'demo123',
      fullName: 'Demo User',
      phone: '+1234567890',
      referralCode: generateReferralCode(),
      role: 'user',
      isActive: true,
      isEmailVerified: true,
      level: 2,
      directReferrals: 5,
      totalTeamSize: 15,
      totalEarnings: 2500,
      currentPlan: createdPlans[1]._id, // Basic plan
      planActivatedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) // 15 days ago
    });

    await demoUser.save();

    // Create demo user wallet
    const demoWallet = new Wallet({
      userId: demoUser._id,
      directIncome: 800,
      levelIncome: 600,
      roiIncome: 900,
      bonusIncome: 200,
      totalWithdrawn: 300,
      totalInvested: 500
    });

    await demoWallet.save();
    console.log('✅ Created demo user for testing');

    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('👤 Admin: admin@mlmplatform.com / admin123456');
    console.log('👤 Demo User: demo@example.com / demo123');
    console.log('👤 Sample Users: user1@example.com to user20@example.com / password123');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

// Run seeding
const runSeed = async () => {
  await connectDB();
  await seedData();
};

// Check if script is run directly
if (require.main === module) {
  runSeed();
}

module.exports = { seedData, runSeed };
