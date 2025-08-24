const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { getDashboardData, getDailyChartData, getMonthlyChartData, getUserActivityData } = require('./dashboard-helper');

// Import stock helper functions
const stockHelper = require('./stock-helper');

// Contoh API endpoint untuk dashboard web
// Pastikan install: npm install express cors

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({
  origin: ['http://dash.nicola.id', 'https://dash.nicola.id', 'http://localhost:8080', 'http://localhost:3002'],
  credentials: true
}));
app.use(express.json());

// Function untuk membaca database.json
function loadDatabase() {
  try {
    const dbPath = path.join(__dirname, 'database.json');
    console.log('Loading database from:', dbPath);
    console.log('Current directory:', __dirname);
    console.log('File exists:', fs.existsSync(dbPath));
    
    if (!fs.existsSync(dbPath)) {
      console.error('Database file not found at:', dbPath);
      return null;
    }
    
    const dbContent = fs.readFileSync(dbPath, 'utf8');
    console.log('File size:', dbContent.length, 'characters');
    
    const parsed = JSON.parse(dbContent);
    console.log('Database loaded successfully with keys:', Object.keys(parsed));
    return parsed;
  } catch (error) {
    console.error('Error loading database:', error);
    console.error('Error stack:', error.stack);
    return null;
  }
}

// Function untuk mendapatkan data dengan format yang sesuai
function getFormattedData() {
  const db = loadDatabase();
  if (!db) {
    return null;
  }
  
  // Format data sesuai dengan yang diharapkan dashboard-helper
  return {
    data: {
      transaksi: db.transaksi || [],
      users: db.users || {},
      profit: db.profit || {},
      persentase: db.persentase || {}
    }
  };
}

// Role Management Functions
function saveDatabase(db) {
  try {
    const dbPath = path.join(__dirname, 'database.json');
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving database:', error);
    return false;
  }
}

function validateRole(role) {
  const validRoles = ['user', 'admin', 'moderator', 'superadmin'];
  return validRoles.includes(role);
}

function hasPermission(userRole, requiredRole) {
  const roleHierarchy = {
    'user': 1,
    'moderator': 2,
    'admin': 3,
    'superadmin': 4
  };
  
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

function generateUserId() {
  return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// API Endpoints

// 1. Dashboard Overview
app.get('/api/dashboard/overview', (req, res) => {
  try {
    const db = getFormattedData();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const dashboardData = getDashboardData(db);
    if (dashboardData) {
      res.json({
        success: true,
        data: dashboardData
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to process dashboard data'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 2. Chart Data Harian
app.get('/api/dashboard/chart/daily', (req, res) => {
  try {
    const db = getFormattedData();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const dailyData = getDailyChartData(db);
    res.json({
      success: true,
      data: dailyData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 3. Chart Data Bulanan
app.get('/api/dashboard/chart/monthly', (req, res) => {
  try {
    const db = getFormattedData();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const monthlyData = getMonthlyChartData(db);
    res.json({
      success: true,
      data: monthlyData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 4. User Activity
app.get('/api/dashboard/users/activity', (req, res) => {
  try {
    const db = getFormattedData();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    // Get user activity data
    const users = db.data.users || {};
    const transaksi = db.data.transaksi || [];
    
    // Calculate active users
    const activeUsers = Object.keys(users).filter(userId => {
      const user = users[userId];
      return user && user.isActive !== false;
    }).length;
    
    // Calculate new users this month
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const newUsers = Object.keys(users).filter(userId => {
      const user = users[userId];
      if (!user || !user.createdAt) return false;
      const userMonth = user.createdAt.toString().slice(0, 7);
      return userMonth === currentMonth;
    }).length;
    
    // Get user activity details with saldo, username, and role
    const userActivity = Object.keys(users).map(userId => {
      const user = users[userId];
      if (!user) return null;
      
      // Get user transactions
      const userTransactions = transaksi.filter(t => t.user === userId);
      const totalTransaksi = userTransactions.length;
      const totalSpent = userTransactions.reduce((sum, t) => {
        return sum + (parseInt(t.totalBayar) || (parseInt(t.price) * (t.jumlah || 1)));
      }, 0);
      
      // Calculate payment method breakdown
      const metodeBayar = {
        saldo: 0,
        qris: 0,
        unknown: 0
      };
      
      userTransactions.forEach(t => {
        const paymentMethod = (t.payment_method || t.metodeBayar || '').toLowerCase();
        if (paymentMethod.includes('saldo')) {
          metodeBayar.saldo++;
        } else if (paymentMethod.includes('qris')) {
          metodeBayar.qris++;
        } else {
          metodeBayar.unknown++;
        }
      });
      
      // Auto-generate username if not exists
      const username = user.username || `User ${userId.slice(-4)}`;
      
      // Auto-calculate role based on total spending
      let role = user.role || 'bronze';
      if (totalSpent >= 1000000) {
        role = 'gold';
      } else if (totalSpent >= 500000) {
        role = 'silver';
      } else {
        role = 'bronze';
      }
      
      return {
        user: userId,
        username: username,
        totalTransaksi: totalTransaksi,
        totalSpent: totalSpent,
        saldo: parseInt(user.saldo) || 0,
        lastActivity: user.lastActivity || user.createdAt || new Date().toISOString(),
        role: role,
        metodeBayar: metodeBayar
      };
    }).filter(Boolean).sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
    
    // Calculate activity trends (mock data for now)
    const activityTrends = {
      dailyActive: [120, 135, 142, 128, 156, 149, 138],
      weeklyActive: [890, 920, 945, 912, 978, 934, 956],
      monthlyActive: [2800, 2950, 3100, 3020, 3180, 3050, 3120]
    };
    
    res.json({
      success: true,
      data: {
        activeUsers: activeUsers,
        newUsers: newUsers,
        userActivity: userActivity.slice(0, 20), // Limit to 20 most recent
        activityTrends: activityTrends
      },
      message: "User activity data retrieved successfully"
    });
    
  } catch (error) {
    console.error('Error in user activity endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 5. Get All Users with Pagination
app.get('/api/dashboard/users/all', (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', role = 'all' } = req.query;
    const db = getFormattedData();
    
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const users = db.data.users || {};
    const transaksi = db.data.transaksi || [];
    
    // Parse pagination parameters
    const currentPage = parseInt(page);
    const usersPerPage = Math.min(parseInt(limit), 50); // Max 50 users per page
    const offset = (currentPage - 1) * usersPerPage;
    
    // Filter users based on search and role
    let filteredUsers = Object.keys(users).filter(userId => {
      const user = users[userId];
      if (!user || user.isActive === false) return false;
      
      // Role filter
      if (role !== 'all' && user.role !== role) return false;
      
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const username = (user.username || `User ${userId.slice(-4)}`).toLowerCase();
        const userIdLower = userId.toLowerCase();
        if (!username.includes(searchLower) && !userIdLower.includes(searchLower)) {
          return false;
        }
      }
      
      return true;
    });
    
    // Get total count for pagination
    const totalUsers = filteredUsers.length;
    const totalPages = Math.ceil(totalUsers / usersPerPage);
    
    // Apply pagination
    const paginatedUsers = filteredUsers.slice(offset, offset + usersPerPage);
    
    // Transform user data
    const transformedUsers = paginatedUsers.map(userId => {
      const user = users[userId];
      
      // Get user transactions
      const userTransactions = transaksi.filter(t => t.user === userId);
      const transactionCount = userTransactions.length;
      const totalSpent = userTransactions.reduce((sum, t) => {
        return sum + (parseInt(t.totalBayar) || (parseInt(t.price) * (t.jumlah || 1)));
      }, 0);
      
      // Auto-generate username if not exists
      const username = user.username || `User ${userId.slice(-4)}`;
      
      // Auto-calculate role based on total spending
      let calculatedRole = user.role || 'bronze';
      if (totalSpent >= 1000000) {
        calculatedRole = 'gold';
      } else if (totalSpent >= 500000) {
        calculatedRole = 'silver';
      } else {
        calculatedRole = 'bronze';
      }
      
      return {
        userId: userId,
        username: username,
        phone: userId, // Using userId as phone for now
        email: user.email || `user${userId.slice(-4)}@example.com`,
        saldo: parseInt(user.saldo) || 0,
        role: calculatedRole,
        isActive: user.isActive !== false,
        lastActivity: user.lastActivity || user.createdAt || null,
        createdAt: user.createdAt || new Date().toISOString(),
        transactionCount: transactionCount,
        totalSpent: totalSpent,
        hasTransactions: transactionCount > 0
      };
    });
    
    // Sort by creation date (newest first)
    transformedUsers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Pagination info
    const pagination = {
      currentPage: currentPage,
      totalPages: totalPages,
      totalUsers: totalUsers,
      usersPerPage: usersPerPage,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1
    };
    
    res.json({
      success: true,
      data: {
        users: transformedUsers,
        pagination: pagination
      },
      message: "All users retrieved successfully"
    });
    
  } catch (error) {
    console.error('Error in get all users endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 6. Transaksi by User
app.get('/api/dashboard/users/:userId/transactions', (req, res) => {
  try {
    const { userId } = req.params;
    const db = getFormattedData();
    
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    // Get user info - search with and without @s.whatsapp.net
    const userWithDomain = `${userId}@s.whatsapp.net`;
    const user = db.data.users[userId] || db.data.users[userWithDomain];
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Filter transaksi berdasarkan userId (both formats)
    const userTransactions = db.data.transaksi.filter(t => 
      t.user === userId || t.user === userWithDomain
    );
    
    const totalTransaksi = userTransactions.length;
    const totalSpent = userTransactions.reduce((sum, t) => sum + (parseInt(t.totalBayar) || 0), 0);
    
    // Transform data sesuai dengan kontrak API
    const transformedTransactions = userTransactions.map(t => ({
      id: t.id || `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      referenceId: t.reffId || `REF-${userId}-${Date.now()}`,
      reffId: t.reffId || `REF-${userId}-${Date.now()}`,
      order_id: t.order_id || t.reffId || `ORD-${Date.now()}`,
      name: t.name || 'Unknown Product',
      jumlah: parseInt(t.jumlah) || 1,
      price: parseInt(t.price) || 0,
      totalBayar: parseInt(t.totalBayar) || 0,
      date: t.date ? new Date(t.date).toISOString() : new Date().toISOString(),
      payment_method: t.metodeBayar || 'Not specified',
      metodeBayar: t.metodeBayar || 'Not specified',
      status: t.status || 'completed'
    }));
    
    // Sort transactions by date (newest first)
    transformedTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    res.json({
      success: true,
      data: {
        user: `User ${userId}@s.whatsapp.net`,
        userId: userId,
        totalTransaksi: totalTransaksi,
        totalSpent: totalSpent,
        currentSaldo: parseInt(user.saldo) || 0,
        transaksi: transformedTransactions
      }
    });
    
  } catch (error) {
    console.error('Error in user transactions endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// 6. Search Transaksi by Reff ID
app.get('/api/dashboard/transactions/search/:reffId', (req, res) => {
  try {
    const { reffId } = req.params;
    const db = getFormattedData();
    
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    // Cari transaksi berdasarkan reff ID
    const transaction = db.data.transaksi.find(t => t.reffId === reffId);
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }
    
    // Hitung profit berdasarkan persentase
    const userRole = db.data.users[transaction.user]?.role || "bronze";
    const profitPercentage = db.data.persentase[userRole] || 2;
    const profit = Math.floor((parseInt(transaction.price) * transaction.jumlah) * (profitPercentage / 100));
    
    // Transform data sebelum kirim ke frontend
    const transformedTransaction = {
      reffId: reffId,
      // Map field baru ke field yang diharapkan frontend
      user: transaction.user_name || transaction.user || 'Anonymous User',
      metodeBayar: transaction.payment_method || transaction.metodeBayar || 'Not specified',
      userRole: userRole,
      produk: transaction.name,
      idProduk: transaction.id,
      harga: parseInt(transaction.price),
      jumlah: transaction.jumlah,
      totalBayar: transaction.totalBayar || (parseInt(transaction.price) * transaction.jumlah),
      tanggal: transaction.date,
      profit: profit,
      // Keep original fields for reference
      user_name: transaction.user_name || transaction.user,
      payment_method: transaction.payment_method || transaction.metodeBayar,
      user_id: transaction.user_id || transaction.user,
      order_id: transaction.order_id || transaction.reffId
    };
    
    res.json({
      success: true,
      data: transformedTransaction
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 7. Export Data
app.get('/api/dashboard/export/:format', (req, res) => {
  try {
    const { format } = req.params;
    const db = getFormattedData();
    
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    // Export data berdasarkan format
    const filename = `dashboard_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${format}`;
    
    res.json({
      success: true,
      message: `Data berhasil diexport ke format ${format}`,
      filename: filename
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 8. User Statistics
app.get('/api/dashboard/users/stats', (req, res) => {
  try {
    const db = getFormattedData();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const users = db.data.users || {};
    const transaksi = db.data.transaksi || [];
    
    // Calculate total users
    const totalUsers = Object.keys(users).filter(userId => {
      const user = users[userId];
      return user && user.isActive !== false;
    }).length;
    
    // Calculate total balance
    const totalSaldo = Object.keys(users).reduce((sum, userId) => {
      const user = users[userId];
      if (user && user.isActive !== false) {
        return sum + (parseInt(user.saldo) || 0);
      }
      return sum;
    }, 0);
    
    // Calculate average balance
    const averageSaldo = totalUsers > 0 ? Math.round(totalSaldo / totalUsers) : 0;
    
    // Calculate user growth
    const currentMonth = new Date().toISOString().slice(0, 7);
    const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 7);
    
    const thisMonthUsers = Object.keys(users).filter(userId => {
      const user = users[userId];
      if (!user || !user.createdAt) return false;
      const userMonth = user.createdAt.toString().slice(0, 7);
      return userMonth === currentMonth;
    }).length;
    
    const lastMonthUsers = Object.keys(users).filter(userId => {
      const user = users[userId];
      if (!user || !user.createdAt) return false;
      const userMonth = user.createdAt.toString().slice(0, 7);
      return userMonth === lastMonth;
    }).length;
    
    const growthRate = lastMonthUsers > 0 ? 
      Math.round(((thisMonthUsers - lastMonthUsers) / lastMonthUsers) * 100 * 10) / 10 : 0;
    
    // Calculate role distribution
    const roleDistribution = {};
    Object.keys(users).forEach(userId => {
      const user = users[userId];
      if (user && user.isActive !== false) {
        const role = user.role || 'bronze';
        roleDistribution[role] = (roleDistribution[role] || 0) + 1;
      }
    });
    
    // Ensure all roles are present
    if (!roleDistribution.bronze) roleDistribution.bronze = 0;
    if (!roleDistribution.silver) roleDistribution.silver = 0;
    if (!roleDistribution.gold) roleDistribution.gold = 0;
    
    // Calculate balance distribution
    const balanceDistribution = {
      high: 0,
      medium: 0,
      low: 0
    };
    
    Object.keys(users).forEach(userId => {
      const user = users[userId];
      if (user && user.isActive !== false) {
        const saldo = parseInt(user.saldo) || 0;
        if (saldo >= 100000) {
          balanceDistribution.high++;
        } else if (saldo >= 50000) {
          balanceDistribution.medium++;
        } else {
          balanceDistribution.low++;
        }
      }
    });
    
    res.json({
      success: true,
      data: {
        totalUsers: totalUsers,
        totalSaldo: totalSaldo,
        averageSaldo: averageSaldo,
        userGrowth: {
          thisMonth: thisMonthUsers,
          lastMonth: lastMonthUsers,
          growthRate: growthRate
        },
        roleDistribution: roleDistribution,
        balanceDistribution: balanceDistribution
      },
      message: "User statistics retrieved successfully"
    });
    
  } catch (error) {
    console.error('Error in user stats endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 9. Product Statistics
app.get('/api/dashboard/products/stats', (req, res) => {
  try {
    const db = getFormattedData();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const productStats = {};
    let totalProducts = 0;
    let totalSold = 0;
    
    // Process transaksi data to get product statistics
    db.data.transaksi.forEach(t => {
      const productId = t.id;
      const productName = t.name;
      const price = parseInt(t.price) || 0;
      const jumlah = parseInt(t.jumlah) || 1;
      const totalBayar = parseInt(t.totalBayar) || (price * jumlah);
      
      if (!productStats[productId]) {
        productStats[productId] = {
          id: productId,
          name: productName,
          totalSold: 0,
          totalRevenue: 0,
          averagePrice: price,
          transactionCount: 0
        };
      }
      
      productStats[productId].totalSold += jumlah;
      productStats[productId].totalRevenue += totalBayar;
      productStats[productId].transactionCount += 1;
      productStats[productId].averagePrice = Math.round(productStats[productId].totalRevenue / productStats[productId].totalSold);
      
      totalProducts++;
      totalSold += jumlah;
    });
    
    // Convert to array and sort by revenue
    const productStatsArray = Object.values(productStats).sort((a, b) => b.totalRevenue - a.totalRevenue);
    
    res.json({
      success: true,
      data: {
        totalProducts: totalProducts,
        totalSold: totalSold,
        products: productStatsArray,
        topProducts: productStatsArray.slice(0, 10)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 10. Recent Transactions
app.get('/api/dashboard/transactions/recent', (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const db = getFormattedData();
    
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    // Sort transactions by date (most recent first) and limit results
    const recentTransactions = db.data.transaksi
      .filter(t => t.date) // Only transactions with dates
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, parseInt(limit))
      .map(t => ({
        id: t.id,
        name: t.name,
        price: parseInt(t.price) || 0,
        date: t.date,
        jumlah: t.jumlah || 1,
        // Map field baru ke field yang diharapkan frontend
        user: t.user_name || t.user || 'Anonymous User',
        metodeBayar: t.payment_method || t.metodeBayar || 'Not specified',
        totalBayar: t.totalBayar || (parseInt(t.price) * (t.jumlah || 1)),
        reffId: t.order_id || t.reffId || 'N/A',
        // Keep original fields for reference
        user_name: t.user_name || t.user,
        payment_method: t.payment_method || t.metodeBayar,
        user_id: t.user_id || t.user,
        order_id: t.order_id || t.reffId
      }));
    
    res.json({
      success: true,
      data: {
        transactions: recentTransactions,
        count: recentTransactions.length,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Stock Management API Endpoints

// Helper function to determine stock status
function getStockStatus(stockCount) {
  if (stockCount === 0) return 'out';
  if (stockCount <= 3) return 'low';
  if (stockCount <= 10) return 'medium';
  return 'good';
}

// Helper function to determine product category
function getProductCategory(productId, productName) {
  const name = productName.toLowerCase();
  if (name.includes('netflix') || name.includes('viu') || name.includes('vidio') || name.includes('youtube')) {
    return 'Streaming';
  } else if (name.includes('capcut') || name.includes('canva')) {
    return 'Software';
  } else if (name.includes('game') || name.includes('gaming')) {
    return 'Gaming';
  }
  return 'Uncategorized';
}

// Helper function to parse stock item
function parseStockItem(stockString) {
  const parts = stockString.split('|');
  if (parts.length >= 4) {
    return {
      email: parts[0] || '',
      password: parts[1] || '',
      profile: parts[2] || '',
      pin: parts[3] || '',
      notes: parts[4] || '-'
    };
  }
  return {
    email: stockString,
    password: '',
    profile: '',
    pin: '',
    notes: '-'
  };
}

// 1. Get Product Stock Data
app.get('/api/dashboard/products/stock', async (req, res) => {
  try {
    const db = loadDatabase();
    if (!db || !db.produk) {
      return res.status(404).json({
        success: false,
        message: 'Database or products not found'
      });
    }

    const products = [];
    let totalSold = 0;

    for (const [productId, product] of Object.entries(db.produk)) {
      const stockCount = product.stok ? product.stok.length : 0;
      totalSold += product.terjual || 0;

      const formattedProduct = {
        id: product.id,
        name: product.name,
        desc: product.desc,
        priceB: product.priceB,
        priceS: product.priceS,
        priceG: product.priceG,
        terjual: product.terjual || 0,
        stockCount: stockCount,
        stok: product.stok || [],
        stockStatus: getStockStatus(stockCount),
        category: getProductCategory(productId, product.name),
        lastRestock: product.lastRestock || null
      };

      products.push(formattedProduct);
    }

    // Sort products by stock count (ascending) to show low stock first
    products.sort((a, b) => a.stockCount - b.stockCount);

    // Get top products by sales
    const topProducts = products
      .filter(p => p.terjual > 0)
      .sort((a, b) => b.terjual - a.terjual)
      .slice(0, 5);

    res.json({
      success: true,
      data: {
        totalProducts: products.length,
        totalSold: totalSold,
        products: products,
        topProducts: topProducts
      }
    });
  } catch (error) {
    console.error('Error getting product stock data:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 2. Get Stock Summary
app.get('/api/dashboard/products/stock/summary', async (req, res) => {
  try {
    const db = loadDatabase();
    if (!db || !db.produk) {
      return res.status(404).json({
        success: false,
        message: 'Database or products not found'
      });
    }

    let totalStockItems = 0;
    let lowStockProducts = 0;
    let outOfStockProducts = 0;
    const categories = new Set();
    const stockByCategory = {};

    for (const [productId, product] of Object.entries(db.produk)) {
      const stockCount = product.stok ? product.stok.length : 0;
      const category = getProductCategory(productId, product.name);
      
      totalStockItems += stockCount;
      categories.add(category);
      
      if (stockCount === 0) {
        outOfStockProducts++;
      } else if (stockCount <= 3) {
        lowStockProducts++;
      }

      // Count stock by category
      if (!stockByCategory[category]) {
        stockByCategory[category] = 0;
      }
      stockByCategory[category] += stockCount;
    }

    res.json({
      success: true,
      data: {
        totalProducts: Object.keys(db.produk).length,
        totalStockItems: totalStockItems,
        lowStockProducts: lowStockProducts,
        outOfStockProducts: outOfStockProducts,
        categories: Array.from(categories),
        stockByCategory: stockByCategory
      }
    });
  } catch (error) {
    console.error('Error getting stock summary:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 3. Update Product Stock
app.put('/api/dashboard/products/:productId/stock', async (req, res) => {
  try {
    const { productId } = req.params;
    const { action, stockItems, notes } = req.body;

    if (!action || !stockItems || !Array.isArray(stockItems)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body. Required: action, stockItems array'
      });
    }

    if (!['add', 'remove'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be either "add" or "remove"'
      });
    }

    const db = loadDatabase();
    if (!db || !db.produk) {
      return res.status(404).json({
        success: false,
        message: 'Database or products not found'
      });
    }

    if (!db.produk[productId]) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const product = db.produk[productId];
    const previousStockCount = product.stok ? product.stok.length : 0;
    let newStockCount = previousStockCount;

    if (action === 'add') {
      // Add new stock items
      if (!product.stok) {
        product.stok = [];
      }
      
      // Validate stock items format
      const validStockItems = stockItems.filter(item => {
        if (typeof item === 'string') {
          return item.includes('|') && item.split('|').length >= 4;
        }
        return false;
      });

      if (validStockItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid stock item format. Expected: "email|password|profile|pin|notes"'
        });
      }

      product.stok.push(...validStockItems);
      newStockCount = product.stok.length;
      
      // Update last restock timestamp
      product.lastRestock = new Date().toISOString();

    } else if (action === 'remove') {
      // Remove stock items
      if (!product.stok || product.stok.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No stock available to remove'
        });
      }

      // Remove items from the beginning of the array (FIFO)
      const itemsToRemove = Math.min(stockItems.length, product.stok.length);
      product.stok.splice(0, itemsToRemove);
      newStockCount = product.stok.length;
    }

    // Save updated database
    if (saveDatabase(db)) {
      res.json({
        success: true,
        data: {
          productId: productId,
          previousStockCount: previousStockCount,
          newStockCount: newStockCount,
          addedItems: action === 'add' ? stockItems.length : 0,
          removedItems: action === 'remove' ? Math.min(stockItems.length, previousStockCount) : 0,
          updatedAt: new Date().toISOString(),
          notes: notes || null
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to save database'
      });
    }

  } catch (error) {
    console.error('Error updating product stock:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 4. Get Low Stock Alerts
app.get('/api/dashboard/products/stock/alerts', async (req, res) => {
  try {
    const db = loadDatabase();
    if (!db || !db.produk) {
      return res.status(404).json({
        success: false,
        message: 'Database or products not found'
      });
    }

    const alerts = [];
    const threshold = 5; // Low stock threshold

    for (const [productId, product] of Object.entries(db.produk)) {
      const stockCount = product.stok ? product.stok.length : 0;
      
      if (stockCount <= threshold) {
        alerts.push({
          productId: product.id,
          productName: product.name,
          currentStock: stockCount,
          threshold: threshold,
          status: stockCount === 0 ? 'out' : 'low',
          category: getProductCategory(productId, product.name),
          lastRestock: product.lastRestock || null,
          urgency: stockCount === 0 ? 'critical' : stockCount <= 2 ? 'high' : 'medium'
        });
      }
    }

    // Sort by urgency (critical first, then by stock count)
    alerts.sort((a, b) => {
      if (a.urgency === 'critical' && b.urgency !== 'critical') return -1;
      if (b.urgency === 'critical' && a.urgency !== 'critical') return 1;
      return a.currentStock - b.currentStock;
    });

    res.json({
      success: true,
      data: {
        totalAlerts: alerts.length,
        criticalAlerts: alerts.filter(a => a.urgency === 'critical').length,
        highAlerts: alerts.filter(a => a.urgency === 'high').length,
        mediumAlerts: alerts.filter(a => a.urgency === 'medium').length,
        alerts: alerts
      }
    });

  } catch (error) {
    console.error('Error getting stock alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 5. Get Product Stock History (Basic implementation)
app.get('/api/dashboard/products/:productId/stock/history', async (req, res) => {
  try {
    const { productId } = req.params;
    const db = loadDatabase();
    
    if (!db || !db.produk || !db.produk[productId]) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const product = db.produk[productId];
    
    // Basic history - in a real implementation, you'd want to track this separately
    const history = [];
    
    if (product.lastRestock) {
      history.push({
        type: 'restock',
        timestamp: product.lastRestock,
        description: 'Stock added to product',
        quantity: product.stok ? product.stok.length : 0
      });
    }

    res.json({
      success: true,
      data: {
        productId: productId,
        productName: product.name,
        currentStock: product.stok ? product.stok.length : 0,
        history: history,
        message: 'Note: Detailed history tracking requires additional database fields'
      }
    });

  } catch (error) {
    console.error('Error getting product stock history:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 6. Get Advanced Stock Analytics
app.get('/api/dashboard/products/stock/analytics', async (req, res) => {
  try {
    const analytics = stockHelper.getStockAnalytics();
    
    if (!analytics) {
      return res.status(404).json({
        success: false,
        message: 'Failed to generate stock analytics'
      });
    }

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error getting stock analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 7. Generate Stock Report
app.get('/api/dashboard/products/stock/report', async (req, res) => {
  try {
    const report = stockHelper.generateStockReport();
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Failed to generate stock report'
      });
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Error generating stock report:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 8. Export Stock Data to CSV
app.get('/api/dashboard/products/stock/export', async (req, res) => {
  try {
    const csv = stockHelper.exportStockToCSV();
    
    if (!csv) {
      return res.status(404).json({
        success: false,
        message: 'Failed to export stock data'
      });
    }

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="stock_report_${new Date().toISOString().split('T')[0]}.csv"`);
    
    res.send(csv);
  } catch (error) {
    console.error('Error exporting stock data:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 9. Bulk Stock Update
app.post('/api/dashboard/products/stock/bulk-update', async (req, res) => {
  try {
    const { updates } = req.body;
    
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body. Required: updates array'
      });
    }

    const db = stockHelper.loadDatabase();
    if (!db || !db.produk) {
      return res.status(404).json({
        success: false,
        message: 'Database or products not found'
      });
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const update of updates) {
      const { productId, action, stockItems, notes } = update;
      
      try {
        if (!db.produk[productId]) {
          results.push({
            productId,
            success: false,
            error: 'Product not found'
          });
          errorCount++;
          continue;
        }

        const product = db.produk[productId];
        const previousStockCount = product.stok ? product.stok.length : 0;
        let newStockCount = previousStockCount;

        if (action === 'add') {
          if (!product.stok) product.stok = [];
          
          const validItems = stockItems.filter(item => stockHelper.validateStockItem(item));
          product.stok.push(...validItems);
          newStockCount = product.stok.length;
          product.lastRestock = new Date().toISOString();
          
        } else if (action === 'remove') {
          if (product.stok && product.stok.length > 0) {
            const itemsToRemove = Math.min(stockItems.length, product.stok.length);
            product.stok.splice(0, itemsToRemove);
            newStockCount = product.stok.length;
          }
        }

        results.push({
          productId,
          success: true,
          previousStockCount,
          newStockCount,
          action,
          itemsProcessed: stockItems.length
        });
        successCount++;

      } catch (error) {
        results.push({
          productId,
          success: false,
          error: error.message
        });
        errorCount++;
      }
    }

    // Save database if any updates were successful
    if (successCount > 0) {
      stockHelper.saveDatabase(db);
    }

    res.json({
      success: true,
      data: {
        totalUpdates: updates.length,
        successfulUpdates: successCount,
        failedUpdates: errorCount,
        results: results
      }
    });

  } catch (error) {
    console.error('Error in bulk stock update:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 10. Get Product Stock Details
app.get('/api/dashboard/products/:productId/stock/details', async (req, res) => {
  try {
    const { productId } = req.params;
    const db = stockHelper.loadDatabase();
    
    if (!db || !db.produk || !db.produk[productId]) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const product = db.produk[productId];
    const metrics = stockHelper.calculateStockMetrics(product);
    
    // Parse stock items for detailed view
    const stockItems = (product.stok || []).map(item => {
      const parsed = stockHelper.parseStockItem(item);
      return {
        raw: item,
        parsed: parsed,
        isValid: stockHelper.validateStockItem(item)
      };
    });

    const response = {
      productId: product.id,
      productName: product.name,
      description: product.desc,
      prices: {
        bronze: product.priceB,
        silver: product.priceS,
        gold: product.priceG
      },
      sales: {
        total: product.terjual || 0
      },
      stock: {
        count: metrics.stockCount,
        status: metrics.stockStatus,
        items: stockItems,
        metrics: metrics
      },
      category: metrics.category,
      lastRestock: product.lastRestock || null,
      terms: product.snk || null
    };

    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('Error getting product stock details:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Something went wrong!'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
if (require.main === module) {
  // HTTP Server
  const httpServer = http.createServer(app);
  httpServer.listen(PORT, () => {
    console.log(`🚀 Dashboard API HTTP server running on port ${PORT}`);
    console.log(`📱 Access via: http://localhost:${PORT} or http://dash.nicola.id:${PORT}`);
  });

  // HTTPS Server (if SSL certificates exist)
  try {
    const privateKey = fs.readFileSync('/etc/letsencrypt/live/dash.nicola.id/privkey.pem', 'utf8');
    const certificate = fs.readFileSync('/etc/letsencrypt/live/dash.nicola.id/cert.pem', 'utf8');
    const ca = fs.readFileSync('/etc/letsencrypt/live/dash.nicola.id/chain.pem', 'utf8');

    const credentials = {
      key: privateKey,
      cert: certificate,
      ca: ca
    };

    const httpsServer = https.createServer(credentials, app);
    httpsServer.listen(HTTPS_PORT, () => {
      console.log(`🔒 Dashboard API HTTPS server running on port ${HTTPS_PORT}`);
      console.log(`🌐 Access via: https://dash.nicola.id:${HTTPS_PORT}`);
    });
  } catch (error) {
    console.log(`⚠️  HTTPS server not started: SSL certificates not found`);
    console.log(`💡 To enable HTTPS, ensure SSL certificates are available at /etc/letsencrypt/live/dash.nicola.id/`);
  }

  console.log(`\n📚 API Documentation:`);
  console.log(`- GET /api/dashboard/overview`);
  console.log(`- GET /api/dashboard/chart/daily`);
  console.log(`- GET /api/dashboard/chart/monthly`);
  console.log(`- GET /api/dashboard/users/activity`);
  console.log(`- GET /api/dashboard/users/:userId/transactions`);
  console.log(`- GET /api/dashboard/transactions/search/:reffId`);
  console.log(`- GET /api/dashboard/export/:format`);
  console.log(`- GET /api/dashboard/users/stats`);
  console.log(`- GET /api/dashboard/products/stats`);
  console.log(`- GET /api/dashboard/transactions/recent?limit=20`);
}

module.exports = app; 